import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const DEFAULT_FROM = 'railway';
const DEFAULT_TO = 'naya';

function stopIcon(selected) {
  return L.divIcon({ className: 'custom-marker-wrapper', html: `<span class="stop-marker${selected ? ' selected' : ''}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
}
function vehicleIcon(vehicle) {
  return L.divIcon({ className: 'custom-marker-wrapper', html: `<span class="vehicle-marker" style="--vehicle-color:${vehicle.color}">${vehicle.mode === 'Bus' ? 'B' : 'A'}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}
function MapFocus({ points }) {
  const map = useMap();
  useEffect(() => { if (points.length > 1) map.fitBounds(points, { padding: [55, 55], maxZoom: 13 }); }, [map, points]);
  return null;
}
function savedTicket() {
  try {
    const ticket = JSON.parse(localStorage.getItem('raipur-ride-ticket'));
    if (ticket && new Date(ticket.validUntil) > new Date()) return ticket;
  } catch { /* An expired or malformed demo ticket can be discarded. */ }
  localStorage.removeItem('raipur-ride-ticket');
  return null;
}
async function api(path, options) {
  const response = await fetch(`/api${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'The transit service could not complete that request.');
  return data;
}

function RiderPanel({ stops, plan, setPlan, ticket, setTicket, onSelectPlan }) {
  const [tab, setTab] = useState('plan');
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [passengers, setPassengers] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const findRoute = async () => {
    if (from === to) return setNotice('Choose two different stops to plan a trip.');
    setBusy(true); setNotice(''); setTicket(null); localStorage.removeItem('raipur-ride-ticket');
    try {
      const result = await api(`/route-plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setPlan(result); onSelectPlan();
    } catch (error) { setPlan(null); setNotice(error.message); }
    finally { setBusy(false); }
  };
  const book = async () => {
    if (!plan) return;
    setBusy(true); setNotice('');
    try {
      const result = await api('/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, passengers }) });
      setTicket(result); localStorage.setItem('raipur-ride-ticket', JSON.stringify(result)); setTab('ticket');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  const endTicket = () => { localStorage.removeItem('raipur-ride-ticket'); setTicket(null); setTab('plan'); };

  return <>
    <nav aria-label="Rider sections"><button type="button" className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>Plan a journey</button><button type="button" className={tab === 'ticket' ? 'active' : ''} onClick={() => setTab('ticket')}>My ticket {ticket && <b aria-label="Active ticket" />}</button></nav>
    {tab === 'plan' ? <section className="planner" aria-live="polite">
      <p className="eyebrow">RIDER APP</p><h1>Where are you going?</h1>
      <div className="journey-fields">
        <label>From<select value={from} onChange={(event) => { setFrom(event.target.value); setPlan(null); }} disabled={!stops.length}>{stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select></label>
        <button type="button" className="swap" onClick={() => { setFrom(to); setTo(from); setPlan(null); setNotice(''); }} aria-label="Swap origin and destination">Swap</button>
        <label>To<select value={to} onChange={(event) => { setTo(event.target.value); setPlan(null); }} disabled={!stops.length}>{stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select></label>
      </div>
      <button type="button" className="primary" disabled={busy || !stops.length} onClick={findRoute}>{busy ? 'Finding your route...' : 'Find fastest route'}</button>
      {notice && <p className="notice" role="alert">{notice}</p>}
      {plan && <div className="result">
        <div className="summary"><div><strong>{plan.duration} min</strong><span>{plan.travelMinutes} min riding</span></div><div><strong>Rs. {plan.fare}</strong><span>{plan.transfers ? `${plan.transfers} transfer${plan.transfers > 1 ? 's' : ''}` : 'direct route'}</span></div></div>
        <div className="legs">{plan.legs.map((leg, index) => <div className="leg" key={`${leg.routeId}-${index}`}><span className="mode-chip" style={{ backgroundColor: leg.color }}>{leg.mode === 'Bus' ? 'BUS' : 'AUTO'}</span><div><strong>{leg.route}</strong><small>{leg.from.name} to {leg.to.name}</small></div><time>{leg.minutes}m</time>{index < plan.legs.length - 1 && <p>Transfer at {leg.to.name} / allow {plan.transferMinutes / plan.transfers} min</p>}</div>)}</div>
        <div className="passenger-row"><label htmlFor="passengers">Passengers</label><select id="passengers" value={passengers} onChange={(event) => setPassengers(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}</select><span>Rs. {plan.fare * passengers}</span></div>
        <button type="button" className="book" disabled={busy} onClick={book}>{busy ? 'Processing mock payment...' : 'Pay now (mock) and get ticket'}</button>
      </div>}
    </section> : <section className="ticket-panel" aria-live="polite">
      {ticket ? <><p className="eyebrow">PAID / READY TO BOARD</p><h1>Your travel pass</h1><div className="ticket-card"><QRCodeSVG value={ticket.code} size={154} level="M" includeMargin /><strong>{ticket.code}</strong><span>{ticket.plan.from.name} to {ticket.plan.to.name}</span><small>{ticket.passengers} passenger{ticket.passengers > 1 ? 's' : ''} / Rs. {ticket.total} / paid</small></div><p className="ticket-valid">Valid until {new Date(ticket.validUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Show the QR code when boarding.</p><button type="button" className="secondary" onClick={endTicket}>End this ticket</button></> : <><p className="eyebrow">TRAVEL PASS</p><h1>No active ticket</h1><p className="empty-copy">Plan a journey, then book one QR ticket for the entire trip.</p><button type="button" className="primary" onClick={() => setTab('plan')}>Plan a journey</button></>}
    </section>}
  </>;
}

const blankStop = { name: '', lat: '', lng: '', zone: '' };
const blankRoute = { name: '', mode: 'Bus', fare: '15', minutes: '7', color: '#2563eb', stops: [] };
function AdminPanel({ stops, routes, vehicles, tickets, onRefresh }) {
  const [tab, setTab] = useState('stops');
  const [stopForm, setStopForm] = useState(blankStop);
  const [routeForm, setRouteForm] = useState(blankRoute);
  const [editingStop, setEditingStop] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const changeStop = (event) => setStopForm({ ...stopForm, [event.target.name]: event.target.value });
  const changeRoute = (event) => setRouteForm({ ...routeForm, [event.target.name]: event.target.value });
  const saveStop = async (event) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      await api(editingStop ? `/stops/${editingStop}` : '/stops', { method: editingStop ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stopForm) });
      setStopForm(blankStop); setEditingStop(null); await onRefresh(); setNotice('Stop saved.');
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };
  const saveRoute = async (event) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      await api(editingRoute ? `/routes/${editingRoute}` : '/routes', { method: editingRoute ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(routeForm) });
      setRouteForm(blankRoute); setEditingRoute(null); await onRefresh(); setNotice('Route saved.');
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };
  const editStop = (stop) => { setTab('stops'); setEditingStop(stop.id); setStopForm({ name: stop.name, lat: stop.lat, lng: stop.lng, zone: stop.zone }); setNotice(''); };
  const editRoute = (route) => { setTab('routes'); setEditingRoute(route.id); setRouteForm({ name: route.name, mode: route.mode, fare: route.fare, minutes: route.minutes, color: route.color, stops: route.stops }); setNotice(''); };
  const addRouteStop = (id) => setRouteForm((form) => form.stops.includes(id) ? form : { ...form, stops: [...form.stops, id] });

  return <><nav className="admin-tabs" aria-label="Admin sections">{['stops', 'routes', 'vehicles', 'tickets'].map((item) => <button type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
    <section className="admin-panel" aria-live="polite"><div className="admin-heading"><p className="eyebrow">TRANSPORT AUTHORITY</p><h1>{tab === 'stops' ? 'Manage stops' : tab === 'routes' ? 'Manage routes' : tab === 'vehicles' ? 'Live vehicles' : 'Ticket log'}</h1></div>{notice && <p className="notice" role="status">{notice}</p>}
      {tab === 'stops' && <><form className="admin-form" onSubmit={saveStop}><div className="form-heading">{editingStop ? 'Edit stop' : 'Add a stop'}<button type="button" onClick={() => { setEditingStop(null); setStopForm(blankStop); }}>New</button></div><input name="name" value={stopForm.name} onChange={changeStop} placeholder="Stop name" required /><div className="double-input"><input name="lat" type="number" step="any" value={stopForm.lat} onChange={changeStop} placeholder="Latitude" required /><input name="lng" type="number" step="any" value={stopForm.lng} onChange={changeStop} placeholder="Longitude" required /></div><input name="zone" value={stopForm.zone} onChange={changeStop} placeholder="Area / zone" /><button className="primary compact" disabled={busy}>{busy ? 'Saving...' : editingStop ? 'Update stop' : 'Add stop'}</button></form><div className="admin-list">{stops.map((stop) => <div className="admin-row" key={stop.id}><div><strong>{stop.name}</strong><span>{stop.zone} / {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</span></div><button type="button" onClick={() => editStop(stop)}>Edit</button></div>)}</div></>}
      {tab === 'routes' && <><form className="admin-form" onSubmit={saveRoute}><div className="form-heading">{editingRoute ? 'Edit route' : 'Add a route'}<button type="button" onClick={() => { setEditingRoute(null); setRouteForm(blankRoute); }}>New</button></div><input name="name" value={routeForm.name} onChange={changeRoute} placeholder="Route name" required /><div className="double-input"><select name="mode" value={routeForm.mode} onChange={changeRoute}><option>Bus</option><option>Auto</option></select><input name="color" value={routeForm.color} onChange={changeRoute} placeholder="#2563eb" required /></div><div className="double-input"><input name="fare" type="number" min="0" value={routeForm.fare} onChange={changeRoute} placeholder="Fare" required /><input name="minutes" type="number" min="1" value={routeForm.minutes} onChange={changeRoute} placeholder="Minutes per leg" required /></div><p className="form-help">Add stops in their travel order:</p><div className="stop-picker">{stops.map((stop) => <button type="button" key={stop.id} onClick={() => addRouteStop(stop.id)}>{stop.name}</button>)}</div><div className="route-sequence">{routeForm.stops.length ? routeForm.stops.map((id, index) => <span key={`${id}-${index}`}>{index + 1}. {stops.find((stop) => stop.id === id)?.name || id}<button type="button" aria-label="Remove stop" onClick={() => setRouteForm({ ...routeForm, stops: routeForm.stops.filter((_id, position) => position !== index) })}>x</button></span>) : <small>No stops selected.</small>}</div><button className="primary compact" disabled={busy || routeForm.stops.length < 2}>{busy ? 'Saving...' : editingRoute ? 'Update route' : 'Add route'}</button></form><div className="admin-list">{routes.map((route) => <div className="admin-row" key={route.id}><i style={{ background: route.color }} /><div><strong>{route.name}</strong><span>{route.mode} / {route.stops.length} stops / Rs. {route.fare}</span></div><button type="button" onClick={() => editRoute(route)}>Edit</button></div>)}</div></>}
      {tab === 'vehicles' && <div className="data-table">{vehicles.map((vehicle) => <div className="table-row" key={vehicle.id}><span className="live-dot" /><div><strong>{vehicle.id}</strong><small>{vehicle.route} / {vehicle.mode}</small></div><time>{vehicle.lat.toFixed(4)}, {vehicle.lng.toFixed(4)}</time></div>)}{!vehicles.length && <p className="empty-copy">Waiting for vehicle positions...</p>}</div>}
      {tab === 'tickets' && <div className="data-table">{tickets.map((ticket) => <div className="table-row ticket-log" key={ticket.code}><div><strong>{ticket.code}</strong><small>{ticket.plan.from.name} to {ticket.plan.to.name}</small></div><time>Rs. {ticket.total}<small>{new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></time></div>)}{!tickets.length && <p className="empty-copy">No tickets have been booked in this server session.</p>}</div>}
    </section>
  </>;
}

function TransitMap({ stops, vehicles, plan, selectedStop, setSelectedStop }) {
  const points = useMemo(() => plan?.legs?.flatMap((leg, index) => leg.stops.slice(index ? 1 : 0).map((stop) => [stop.lat, stop.lng])) || [], [plan]);
  const detail = stops.find((stop) => stop.id === selectedStop);
  return <section className="map-panel" aria-label="Live transit map"><MapContainer center={[21.235, 81.67]} zoom={12} scrollWheelZoom className="transit-map"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapFocus points={points} />{points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#172554', weight: 5, opacity: .85 }} />}{stops.map((stop) => <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={stopIcon(stop.id === selectedStop)} eventHandlers={{ click: () => setSelectedStop(stop.id) }}><Popup><strong>{stop.name}</strong><br />{stop.zone} stop</Popup></Marker>)}{vehicles.map((vehicle) => <Marker key={vehicle.id} position={[vehicle.lat, vehicle.lng]} icon={vehicleIcon(vehicle)}><Popup><strong>{vehicle.route}</strong><br />{vehicle.id} / live {vehicle.mode.toLowerCase()}</Popup></Marker>)}</MapContainer><div className="map-header"><div><strong>Live transit map</strong><span>{vehicles.length} vehicles moving now</span></div><div className="legend"><i className="bus-dot" /> Bus <i className="auto-dot" /> Auto</div></div>{detail && <div className="stop-detail"><button type="button" onClick={() => setSelectedStop(null)} aria-label="Close stop details">x</button><strong>{detail.name}</strong><span>{detail.zone} / tap other stops to explore</span></div>}<div className="map-note">Select a stop or vehicle for details</div></section>;
}

function App() {
  const [view, setView] = useState('rider');
  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [plan, setPlan] = useState(null);
  const [ticket, setTicket] = useState(savedTicket);
  const [selectedStop, setSelectedStop] = useState(null);
  const [networkOnline, setNetworkOnline] = useState(false);
  const [loadNotice, setLoadNotice] = useState('');
  const refresh = async () => {
    const [stopData, routeData, vehicleData, ticketData] = await Promise.all([api('/stops'), api('/routes'), api('/vehicles'), api('/tickets')]);
    setStops(stopData); setRoutes(routeData); setVehicles(vehicleData); setTickets(ticketData);
  };
  useEffect(() => {
    let active = true;
    refresh().then(() => active && setNetworkOnline(true)).catch((error) => active && setLoadNotice(error.message));
    const socket = io({ reconnectionAttempts: 3 });
    socket.on('connect', () => active && setNetworkOnline(true));
    socket.on('disconnect', () => active && setNetworkOnline(false));
    socket.on('vehicle:snapshot', (data) => active && setVehicles(data));
    socket.on('vehicle:update', (item) => active && setVehicles((current) => current.some((vehicle) => vehicle.id === item.id) ? current.map((vehicle) => vehicle.id === item.id ? item : vehicle) : [...current, item]));
    socket.on('connect_error', () => active && setNetworkOnline(false));
    return () => { active = false; socket.close(); };
  }, []);
  return <main className="app-shell"><aside className="sidebar"><header className="brand"><span className="brand-mark">R</span><div>Raipur Ride<small>ONE CITY / ONE JOURNEY</small></div></header><div className={`network-status ${networkOnline ? 'is-online' : ''}`}><i aria-hidden="true" /> {networkOnline ? 'Live network online' : 'Connecting to live network'}</div><div className="role-switch"><button type="button" className={view === 'rider' ? 'active' : ''} onClick={() => setView('rider')}>Rider</button><button type="button" className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>Admin</button></div>{loadNotice && <p className="notice" role="alert">{loadNotice}</p>}{view === 'rider' ? <RiderPanel stops={stops} plan={plan} setPlan={setPlan} ticket={ticket} setTicket={setTicket} onSelectPlan={() => setSelectedStop(null)} /> : <AdminPanel stops={stops} routes={routes} vehicles={vehicles} tickets={tickets} onRefresh={refresh} />}<footer>Traffic Hackathon 2026<span>Built for a more connected Raipur</span></footer></aside><TransitMap stops={stops} vehicles={vehicles} plan={plan} selectedStop={selectedStop} setSelectedStop={setSelectedStop} /></main>;
}
createRoot(document.getElementById('root')).render(<App />);
