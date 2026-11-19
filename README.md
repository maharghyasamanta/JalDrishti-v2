# JalDrishti — India Water Disaster Intelligence

A Vite + React 18 + TypeScript + D3 disaster intelligence platform: an interactive historical map of water-related disasters, a live map of weather and hazard alerts relayed from NDMA's SACHET system, and real-time seismic activity tracking from the National Center for Seismology (NCS).

```bash
npm install
npm run dev      # backend + Vite dev middleware on http://127.0.0.1:3000
npm run dev:vite # optional standalone Vite on http://localhost:5173 (proxies /api -> :3000)
npm run build    # type-check + production build into dist/
npm start        # production server serving dist/ + /api on http://127.0.0.1:3000
```

## Application Route Structure

JalDrishti uses `HashRouter` (`/#/...`) for static hosting compatibility without server rewrite requirements:

- **`/#/` (Landing Page)**
  - Hero with national statistics and direct exploration CTA buttons
  - **Explore Modules** section with 3 interactive feature cards:
    - *Historical Data Map* (`/#/historical`)
    - *Live Weather & Hazard Alerts* (`/#/live-alerts`)
    - *Seismic Activity* (`/#/earthquakes`)
  - **Transparency section** (Data Sources & Methodology) positioned directly under the feature cards
- **`/#/historical` (Historical Data Map)**
  - Breadcrumb navigation back to Home
  - Interactive India boundary map with historical water disaster events (floods, cloudbursts, cyclones, GLOFs)
  - Period, category, and severity filter toolbars with active filter chips
  - State details side panel with event timeline
  - National disaster analytics charts (anchor: `/#/historical#analytics`)
- **`/#/live-alerts` (Live Weather & Hazard Alerts)**
  - Breadcrumb navigation back to Home
  - Real-time weather warnings from NDMA SACHET
  - Active hazard breakdown by state with severe alert glow styling
- **`/#/earthquakes` (Seismic Activity)**
  - Breadcrumb navigation back to Home
  - Real-time 30-day earthquake epicenter map from NCS with BIS seismic hazard zones (II–V)
- **`*` (Fallback)**
  - Any unknown route automatically redirects to `/#/`

---

## Live alerts & earthquake server

Browsers cannot call NDMA's SACHET feed or NCS directly due to CORS restrictions. A zero-dependency Node 18+ service in `server/` caches and serves both:

- **`/api/alerts`**: Fetches SACHET RSS & CAP feeds, resolves state attributions, caches alerts.
- **`/api/earthquakes`**: Scrapes National Center for Seismology (NCS) live data with USGS FDSN fallback.

No external databases needed: vanilla Node.js. On startup (`start()`), `.env` at the project root is automatically loaded without overriding existing environment variables.

### Run it locally

```bash
npm run dev            # http://127.0.0.1:3000 (serves frontend + /api/alerts + /api/earthquakes)
npm run dev:vite       # optional standalone Vite on :5173 proxying /api to :3000
npm start              # production mode (--production) serving dist/ + /api
npm run test:server    # unit tests (Node's built-in test runner)
```

Server environment variables (see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Listening port |
| `HOST` | `127.0.0.1` | Bind address (use `0.0.0.0` in a container) |
| `ADMIN_TOKEN` | _(unset)_ | Admin Bearer token (>= 24 chars; admin routes return 503 when unset/short) |
| `CORS_ORIGIN` | _(unset)_ | Comma-separated origins for non-public routes; public GET uses `*` when unset |
| `TRUST_PROXY` | `false` | Set to `true` to read client IP from `X-Forwarded-For` |
| `SMS_PROVIDER` | `mock` | SMS provider (`mock` default) |
| `AUTO_DISPATCH_MODE` | `off` | Auto dispatch mode (`off` default) |
| `SMS_DATA_DIR` | `server/data` | Override JSON store directory |
| `SACHET_USER_AGENT` | built-in | Override the `User-Agent` sent to NDMA |
| `ALERT_SCOPE` | `all` | Set to `water` to keep only water hazards |
| `DISTRICT_INDEX_PATH` | `public/data/india-districts-index.json` | District → states index |

### Production: `VITE_ALERTS_URL`

The frontend reads alerts from `import.meta.env.VITE_ALERTS_URL`, default `/api/alerts`.

```bash
VITE_ALERTS_URL=https://alerts.example.org/api/alerts npm run build
```

## Data and limits

The historical dataset is a prototype. Live alerts and earthquake feeds are convenience copies of public data: not an official alerting channel. For official warnings see SACHET (sachet.ndma.gov.in), IMD (mausam.imd.gov.in), and NCS (riseq.seismo.gov.in).

## Deployment

- **Backend (Render)**: Deploy the Node service in `server/` using `render.yaml` (service `jaldrishti-api`). In the Render dashboard, set `ADMIN_TOKEN` to a secret string of 24+ characters.
- **Verify backend**: Once live, confirm `GET /healthz` and `GET /api/earthquakes` on your Render backend URL both return HTTP 200 JSON responses.
- **Frontend (Netlify)**: Deploy the static site using `netlify.toml` (`npm run build` publishing `dist`). Once the Render backend is live, replace `REPLACE-WITH-RENDER-URL` in `netlify.toml` with your Render service URL and redeploy.
