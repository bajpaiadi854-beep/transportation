const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { stops, routes, vehicles } = require('./data');
const path = require('path');

const PORT = Number(process.env.PORT) || 4000;
const TRANSFER_MINUTES = 4;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, methods: ['GET', 'POST', 'PUT'] } });
const tickets = new Map();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '..dist')));
app.get('/', (req,res) => { res.sendFile(path.join(__dirname,'../dist/index.html'));
});

const getStop = (id) => stops.find((item) => item.id === id);
const getRoute = (id) => routes.find((item) => item.id === id);
const idFrom = (prefix) => `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
const copyStop = (stop) => stop && ({ id: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng, zone: stop.zone });

function routePath(route) {
  const routeStops = route.stops.map(getStop).filter(Boolean);
  const path = [];
  routeStops.forEach((stop, index) => {
    if (index === 0) path.push({ lat: stop.lat, lng: stop.lng });
    if (index < routeStops.length - 1) {
      const next = routeStops[index + 1];
      for (let step = 1; step <= 3; step += 1) {
        const ratio = step / 3;
        path.push({ lat: stop.lat + (next.lat - stop.lat) * ratio, lng: stop.lng + (next.lng - stop.lng) * ratio });
      }
    }
  });
  return { path, stopIndexes: routeStops.map((_stop, index) => index * 3) };
}

function copyRoute(route) {
  const { path, stopIndexes } = routePath(route);
  return {
    id: route.id,
    name: route.name,
    mode: route.mode,
    color: route.color,
    fare: route.fare,
    minutes: route.minutes,
    stops: route.stops,
    stopIds: route.stops.map((id) => ({ stop: id, minutesToNext: route.minutes })),
    path,
    stopIndexes
  };
}

function createNetwork() {
  const network = Object.fromEntries(stops.map((item) => [item.id, []]));
  routes.forEach((route) => {
    route.stops.forEach((stopId, index) => {
      const add = (to) => network[stopId]?.push({ to, route, minutes: route.minutes });
      if (index > 0) add(route.stops[index - 1]);
      if (index < route.stops.length - 1) add(route.stops[index + 1]);
    });
  });
  return network;
}

function makePlan(from, to) {
  if (!getStop(from) || !getStop(to) || from === to) return null;
  const network = createNetwork();
  const states = new Map();
  const queue = [];
  const stateKey = (stop, routeId) => `${stop}|${routeId || 'start'}`;
  const start = { key: stateKey(from, null), stop: from, routeId: null, distance: 0, previous: null, edge: null, transfer: 0 };
  states.set(start.key, start);
  queue.push(start);
  let target = null;

  while (queue.length) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift();
    if (states.get(current.key) !== current) continue;
    if (current.stop === to) { target = current; break; }
    (network[current.stop] || []).forEach((edge) => {
      const transfer = current.routeId && current.routeId !== edge.route.id ? TRANSFER_MINUTES : 0;
      const distance = current.distance + edge.minutes + transfer;
      const key = stateKey(edge.to, edge.route.id);
      if (!states.has(key) || distance < states.get(key).distance) {
        const next = { key, stop: edge.to, routeId: edge.route.id, distance, previous: current.key, edge, transfer };
        states.set(key, next);
        queue.push(next);
      }
    });
  }
  if (!target) return null;

  const segments = [];
  for (let current = target; current.previous; current = states.get(current.previous)) {
    const before = states.get(current.previous);
    segments.unshift({ from: before.stop, to: current.stop, route: current.edge.route, minutes: current.edge.minutes, transfer: current.transfer });
  }
  const legs = [];
  segments.forEach((segment) => {
    const last = legs[legs.length - 1];
    if (last && last.route.id === segment.route.id) {
      last.to = segment.to;
      last.stopIds.push(segment.to);
      last.minutes += segment.minutes;
    } else {
      legs.push({ route: segment.route, from: segment.from, to: segment.to, minutes: segment.minutes, stopIds: [segment.from, segment.to] });
    }
  });
  const transfers = Math.max(0, legs.length - 1);
  return {
    from: copyStop(getStop(from)),
    to: copyStop(getStop(to)),
    duration: target.distance,
    travelMinutes: segments.reduce((total, segment) => total + segment.minutes, 0),
    transferMinutes: transfers * TRANSFER_MINUTES,
    transfers,
    fare: legs.reduce((total, leg) => total + leg.route.fare, 0),
    legs: legs.map((leg) => ({
      routeId: leg.route.id,
      route: leg.route.name,
      mode: leg.route.mode,
      color: leg.route.color,
      from: copyStop(getStop(leg.from)),
      to: copyStop(getStop(leg.to)),
      minutes: leg.minutes,
      stops: leg.stopIds.map((id) => copyStop(getStop(id)))
    }))
  };
}

function currentVehicles() {
  return vehicles.map((vehicle) => {
    const route = getRoute(vehicle.routeId);
    if (!route || route.stops.length < 2) return null;
    const index = Math.floor(vehicle.progress) % route.stops.length;
    const from = getStop(route.stops[index]);
    const to = getStop(route.stops[(index + 1) % route.stops.length]);
    const ratio = vehicle.progress % 1;
    return {
      id: vehicle.id,
      routeId: route.id,
      route: route.name,
      mode: route.mode,
      color: route.color,
      lat: from.lat + (to.lat - from.lat) * ratio,
      lng: from.lng + (to.lng - from.lng) * ratio,
      updatedAt: new Date().toISOString()
    };
  }).filter(Boolean);
}

function validStop(input) {
  const name = String(input.name || '').trim();
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const zone = String(input.zone || 'Unassigned').trim();
  if (name.length < 2 || name.length > 80 || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { name, lat, lng, zone: zone.slice(0, 60) || 'Unassigned' };
}

function validRoute(input) {
  const name = String(input.name || '').trim();
  const mode = String(input.mode || '').toLowerCase() === 'auto' ? 'Auto' : String(input.mode || '').toLowerCase() === 'bus' ? 'Bus' : null;
  const fare = Number(input.fare);
  const minutes = Number(input.minutes);
  const color = /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? input.color : '#2563eb';
  const stopIds = Array.isArray(input.stops) ? input.stops : [];
  if (!name || !mode || !Number.isFinite(fare) || fare < 0 || !Number.isFinite(minutes) || minutes < 1 || stopIds.length < 2 || stopIds.some((id) => !getStop(id))) return null;
  return { name: name.slice(0, 80), mode, fare: Math.round(fare), minutes: Math.round(minutes), color, stops: stopIds };
}

function createTicket({ from, to, passengers }) {
  const plan = makePlan(from, to);
  if (!plan) return null;
  const ticket = {
    code: `RPR-${crypto.randomUUID().replaceAll('-', '').slice(0, 9).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    status: 'paid',
    paid: true,
    passengers,
    total: plan.fare * passengers,
    plan
  };
  tickets.set(ticket.code, ticket);
  return ticket;
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok', storage: 'demo-memory', vehicles: currentVehicles().length }));
app.get('/api/stops', (_request, response) => response.json(stops.map(copyStop)));
app.post('/api/stops', (request, response) => {
  const data = validStop(request.body || {});
  if (!data) return response.status(400).json({ message: 'A stop needs a name, valid latitude, and valid longitude.' });
  const stop = { id: idFrom('stop'), ...data };
  stops.push(stop);
  return response.status(201).json(copyStop(stop));
});
app.put('/api/stops/:id', (request, response) => {
  const stop = getStop(request.params.id);
  const data = validStop(request.body || {});
  if (!stop) return response.status(404).json({ message: 'Stop not found.' });
  if (!data) return response.status(400).json({ message: 'A stop needs a name, valid latitude, and valid longitude.' });
  Object.assign(stop, data);
  return response.json(copyStop(stop));
});

app.get('/api/routes', (_request, response) => response.json(routes.map(copyRoute)));
app.post('/api/routes', (request, response) => {
  const data = validRoute(request.body || {});
  if (!data) return response.status(400).json({ message: 'A route needs a name, type, fare, minutes, and at least two valid stops.' });
  const route = { id: idFrom('route'), ...data };
  routes.push(route);
  return response.status(201).json(copyRoute(route));
});
app.put('/api/routes/:id', (request, response) => {
  const route = getRoute(request.params.id);
  const data = validRoute(request.body || {});
  if (!route) return response.status(404).json({ message: 'Route not found.' });
  if (!data) return response.status(400).json({ message: 'A route needs a name, type, fare, minutes, and at least two valid stops.' });
  Object.assign(route, data);
  return response.json(copyRoute(route));
});

app.get('/api/vehicles', (_request, response) => response.json(currentVehicles()));
app.get('/api/route-plan', (request, response) => {
  const plan = makePlan(request.query.from, request.query.to);
  if (!plan) return response.status(400).json({ message: 'Select two different stops connected by the transit network.' });
  return response.json(plan);
});
app.get('/api/tickets', (_request, response) => response.json([...tickets.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
app.post('/api/tickets', (request, response) => {
  const passengers = Number(request.body?.passengers ?? 1);
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 6) return response.status(400).json({ message: 'Passengers must be a whole number from 1 to 6.' });
  const ticket = createTicket({ from: request.body?.from, to: request.body?.to, passengers });
  if (!ticket) return response.status(400).json({ message: 'Choose a valid origin and destination before paying.' });
  return response.status(201).json(ticket);
});
app.get('/api/tickets/:code', (request, response) => {
  const ticket = tickets.get(String(request.params.code).toUpperCase());
  if (!ticket) return response.status(404).json({ message: 'Ticket not found. Ticket data resets if the demo server restarts.' });
  return response.json(ticket);
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError) return response.status(400).json({ message: 'The request body must be valid JSON.' });
  console.error(error);
  return response.status(500).json({ message: 'The transit service could not complete that request.' });
});

io.on('connection', (socket) => {
  const snapshot = currentVehicles();
  socket.emit('vehicle:snapshot', snapshot);
  socket.emit('vehicles', snapshot);
});
setInterval(() => {
  vehicles.forEach((vehicle) => {
    const route = getRoute(vehicle.routeId);
    if (route?.stops.length > 1) vehicle.progress = (vehicle.progress + 0.075) % route.stops.length;
  });
  const snapshot = currentVehicles();
  snapshot.forEach((vehicle) => io.emit('vehicle:update', vehicle));
  io.emit('vehicles', snapshot);
}, 4000);

httpServer.listen(PORT, () => console.log(`Raipur Ride API running at http://localhost:${PORT}`));
