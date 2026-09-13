# Raipur Ride — Unified Transit App

A hackathon-ready public transport demo for Raipur. It combines live simulated vehicles, transfer-aware Dijkstra routing, unified QR ticketing, and a simple transport-authority admin console.

## Run locally

Install Node.js 20+ (which includes npm), then run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`. The Express + Socket.io API starts on port 4000 and Vite starts the UI on port 5173. The UI proxies `/api` and Socket.io traffic to the API automatically.

Use `npm.cmd` in PowerShell if its execution policy blocks the `npm` PowerShell shim. The app uses in-memory data intentionally, so it needs no database setup and works as a self-contained demo. Vehicle positions update every four seconds. Active tickets remain visible after a browser refresh until their 90-minute expiry.

## Included screens

- **Rider:** live map, route search, transfer-aware route detail, mock payment, and QR travel pass.
- **Admin:** create/edit stops, create/edit routes using an ordered stop list, live vehicle monitor, and tickets log.

## Included endpoints

- `GET /api/stops`
- `POST /api/stops`
- `PUT /api/stops/:id`
- `GET /api/routes`
- `POST /api/routes`
- `PUT /api/routes/:id`
- `GET /api/vehicles`
- `GET /api/health`
- `GET /api/route-plan?from=railway&to=naya`
- `POST /api/tickets`
- `GET /api/tickets`
- `GET /api/tickets/:code`

`POST /api/tickets` accepts `{ "from": "railway", "to": "naya", "passengers": 1 }`. Socket.io emits `vehicle:snapshot` on connect and one `vehicle:update` for each moving vehicle every four seconds. Ticket records reset when the API server restarts; browser-side passes still show for the duration of the demo.

## Production handoff

Replace the in-memory source in `server/data.js` and ticket `Map` in `server/index.js` with MongoDB repositories. The frontend and API responses are already separated from the storage implementation, so no UI rewrite is needed.
