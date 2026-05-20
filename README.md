# 🏴‍☠️ BlackBeard

A mobile-first web app to command your home media server from your phone. BlackBeard
is a single dark-themed interface that aggregates the features scattered across the
servarr stack (Sonarr, Radarr, Prowlarr, Bazarr, qBittorrent) running in Docker.

Three areas:

1. **Add** — search and add movies (Radarr) and series (Sonarr) with full quality /
   monitor options.
2. **Downloads** — live state of qBittorrent torrents, Sonarr/Radarr import queues and
   Bazarr wanted-subtitle counts, auto-refreshing every 5s.
3. **Settings & Diagnostics** — configure each service, test connections, and inspect
   health, versions, disk space, indexer status, providers, health warnings, container
   logs and restart controls.

---

## Architecture

```
                 ┌─────────────────┐
   phone ──────► │  blackbeard-web  │  (React + Vite, served by nginx)
                 └────────┬─────────┘
                          │  /api/*  (reverse-proxied)
                 ┌────────▼─────────┐
                 │  blackbeard-api  │  (Node + Express)
                 └────────┬─────────┘
        ┌──────────┬──────┴───┬──────────┬─────────────┐
     Sonarr     Radarr     Prowlarr    Bazarr      qBittorrent
```

The **backend is the only thing that holds API keys** — the frontend never sees them.
The browser calls `/api/...`, and the backend makes the authenticated call to each
service. No database: everything is read live from the service APIs. The only persisted
state is `config.json` (URLs + keys), editable entirely from the Settings tab.

### Tech stack

- **Backend:** Node.js + Express (ESM), native `fetch`, `dockerode` for container control.
- **Frontend:** React + Vite + Tailwind CSS, `lucide-react` icons.
- **Config:** a single `config.json` file (seeded from env vars, then UI-authoritative).
- **Deploy:** two Docker containers joined to the existing `servarr_default` network.

---

## Local development

Two terminals.

**Backend** (defaults to port 3000):

```bash
cd backend
npm install
npm run dev          # node --watch src/index.js
```

On first run it creates `backend/config.json`. You can leave it empty and fill keys via
the UI, or pre-seed via env vars (see below).

**Frontend** (Vite dev server on port 5173, proxies `/api` to the backend):

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. To point the dev proxy at a non-default backend:

```bash
BACKEND_URL=http://localhost:3000 npm run dev
```

---

## Docker deployment

The `docker-compose.yml` is meant to be brought up alongside the existing servarr stack.
It joins the **external** `servarr_default` network so it can reach the other containers
by name.

```bash
cd blackbeard
docker compose up -d --build
```

Then open `http://192.168.1.134:8085` (the web container publishes port `8085`).

What the compose file does:

- **blackbeard-api** — the backend. Mounts `./config` for the persisted `config.json`,
  and mounts the Docker socket so the "Restart container" / "Logs" diagnostics work.
- **blackbeard-web** — nginx serving the built frontend, reverse-proxying `/api` to
  `blackbeard-api:3000`.

> **Network name.** This assumes your stack's network is `servarr_default`. Confirm with
> `docker network ls`. If it differs, change the `networks` block at the bottom of
> `docker-compose.yml`.

> **Docker socket.** Mounting `/var/run/docker.sock` grants the backend container control
> over Docker. That's required for restart/logs and is acceptable on a trusted LAN. Remove
> that volume line if you don't want it — the rest of the app still works, and the buttons
> simply disable themselves.

---

## First-time configuration

Open the app → **Settings** tab. For each service set the URL and key, hit **Test
connection**, then **Save settings**. Inside Docker the default URLs use container names
(`http://sonarr:8989`, etc.); from a dev machine on the LAN use `http://192.168.1.134:<port>`.

Where to find each API key:

| Service     | Where to get the key                                                            |
|-------------|---------------------------------------------------------------------------------|
| Sonarr      | Settings → General → **API Key**                                                |
| Radarr      | Settings → General → **API Key**                                                |
| Prowlarr    | Settings → General → **API Key**                                                |
| Bazarr      | Settings → General → **API Key** (header is `X-API-KEY`)                        |
| qBittorrent | No API key — uses the Web UI **username + password** (default user `admin`)     |

Secrets are write-only from the UI: the backend returns whether a key is set, never the
value. Leaving a key field blank on save keeps the existing one.

### Env var seeds (optional)

If you'd rather pre-fill the first `config.json`, set any of these on the backend before
its first start (also listed, commented, in `docker-compose.yml`):

```
PORT, CONFIG_PATH, DOCKER_SOCKET
SONARR_URL, SONARR_API_KEY, SONARR_CONTAINER
RADARR_URL, RADARR_API_KEY, RADARR_CONTAINER
PROWLARR_URL, PROWLARR_API_KEY, PROWLARR_CONTAINER
BAZARR_URL, BAZARR_API_KEY, BAZARR_CONTAINER
QBITTORRENT_URL, QBITTORRENT_USERNAME, QBITTORRENT_PASSWORD, QBITTORRENT_CONTAINER
```

Once you save in the UI, `config.json` wins and the env seeds are ignored.

---

## REST API (backend)

All endpoints are under `/api`. The frontend uses these; you can also call them directly.

### Search & Add

| Method | Path                                          | Purpose                                  |
|--------|-----------------------------------------------|------------------------------------------|
| GET    | `/api/search?type=movie\|series&term=...`     | Lookup via Radarr/Sonarr                 |
| GET    | `/api/add/quality-profiles?type=movie\|series`| List quality profiles                    |
| GET    | `/api/add/root-folders?type=movie\|series`    | List root folders                        |
| POST   | `/api/add`                                    | Add `{ type, item, options }`            |

`options` (movie): `qualityProfileId`, `rootFolderPath?`, `monitored`, `minimumAvailability`, `searchOnAdd`.
`options` (series): `qualityProfileId`, `rootFolderPath?`, `monitor`, `seasonFolder`, `seriesType`, `searchOnAdd`.

### Downloads

| Method | Path                                            | Purpose                              |
|--------|-------------------------------------------------|--------------------------------------|
| GET    | `/api/downloads`                                | Torrents + Sonarr/Radarr queues + Bazarr wanted |
| POST   | `/api/downloads/torrents/:hash/pause`           | Pause a torrent                      |
| POST   | `/api/downloads/torrents/:hash/resume`          | Resume a torrent                     |
| DELETE | `/api/downloads/torrents/:hash?deleteFiles=...` | Remove a torrent (optionally files)  |

### Settings

| Method | Path                  | Purpose                                        |
|--------|-----------------------|------------------------------------------------|
| GET    | `/api/settings`       | Current config (secrets masked)                |
| POST   | `/api/settings`       | Save `{ services: {...} }` (blank secrets kept)|
| POST   | `/api/settings/test`  | Test a service `{ service }`                   |

### Diagnostics

| Method | Path                                  | Purpose                                          |
|--------|---------------------------------------|--------------------------------------------------|
| GET    | `/api/diagnostics`                    | Health, versions, disk, indexers, providers, warnings |
| GET    | `/api/diagnostics/logs/:service?tail=`| Docker logs (needs socket)                       |
| POST   | `/api/diagnostics/restart/:service`   | Restart container (needs socket)                 |

`:service` is one of `sonarr`, `radarr`, `prowlarr`, `bazarr`, `qbittorrent`.

---

## Notes

- **No auth.** Intended for the LAN, to live behind Tailscale later. Auth is a v2 item.
- **Resilient by design.** If a service is offline or misconfigured, its panel shows an
  error but the rest of the app keeps working — one dead Prowlarr won't sink the ship.
- **qBittorrent 5.0** renamed `pause`/`resume` to `stop`/`start`; BlackBeard tries the new
  endpoints and falls back to the old ones automatically.

*Yo ho ho and a bottle of rum.* 🏴‍☠️
