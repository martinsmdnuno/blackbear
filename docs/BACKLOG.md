# 🐻‍⬛ Blackbear — Ideas & opportunities

A backlog of features and improvements worth investigating later. Nothing here is
committed work — just a menu. Rough effort tags: **(S)** small, **(M)** medium, **(L)** large.

---

## ⭐ Top picks (high impact, sensible effort)

- **Push notifications when a download finishes / import completes** — it's already a PWA; wire
  web push or a bridge (ntfy / Telegram / Pushover). The "is it ready?" answer without opening
  the app. **(M)**
- **Jellyfin integration** — you run Jellyfin natively. Pull "Continue watching" / "Recently
  added", and use watch state to power *"watched → safe to delete"* in Library and auto-hide in
  Trending. Closes the loop between *get it* and *watched it*. **(M)**
- **"Already in library" badge everywhere** — Trending/Search/Person already-owned titles get a
  check instead of an add button (Recommended already excludes owned — generalise it). **(S)**
- **Library: sort & filter** — by size, date added, missing, unmonitored; plus a "Missing /
  cutoff-unmet" view that can trigger a search. Most-asked next step for managing 250+ movies. **(S–M)**
- **Harden the Docker socket** — swap the raw `/var/run/docker.sock` mount for a read/restricted
  socket proxy (e.g. `tecnativa/docker-socket-proxy`) limited to container restart/logs. Big
  security win for an internet-exposed app. **(S)**

---

## Discovery & Add

- **Bulk add** — add a whole person's filmography, a TMDb collection (franchise), or a curated
  list in one go. **(M)**
- **Watchlist import** — Trakt / IMDb / Letterboxd watchlist → Radarr/Sonarr. **(M)**
- **"Where to watch"** — TMDb/JustWatch watch-providers, so you know if it's already on a service
  you pay for before downloading. **(M)**
- **Filters on Trending/Search** — by genre, decade, min rating. **(S)**
- **Title detail view** — cast, trailer, full ratings (Rotten Tomatoes / Metacritic are already
  in the Radarr lookup payload), overview, before adding. **(M)**

## Downloads & automation

- **Notifications** (see Top picks).
- **Queue actions** — retry / remove / change of stuck Sonarr/Radarr queue items from the app. **(S)**
- **Low-disk alerts** — you already show disk space; alert (push) when a drive crosses a threshold. **(S)**
- **qBittorrent speed toggle** — flip alternative speed limits / schedule from the app. **(S)**
- **Manual search / interactive grab** — pick a specific release for a wanted item. **(M)**

## Library

- **Sort/filter + Missing view** (see Top picks).
- **Bulk operations** — multi-select delete, change quality profile, monitor/unmonitor. **(M)**
- **Storage breakdown** — biggest titles / by folder, to reclaim space fast. **(S)**
- **Soft-delete / "trash"** — move to a holding state for N days before real disk deletion (a
  safety net beyond the confirm dialog). **(M)**

## Jellyfin

- **Continue watching / recently added** surfaced in Blackbear. **(M)**
- **Watched-aware cleanup** — only auto-delete (or suggest deleting) titles already watched in
  Jellyfin. **(M)**
- **Auto-hide watched** — mark Trending "seen" automatically from Jellyfin play state. **(M)**

## Subtitles (Bazarr)

- **Wanted list, not just a count** — per-item, with one-tap search and provider used. **(S–M)**
- **Per-item subtitle status** in Library/Downloads. **(S)**

## Access, security & multi-user

- **App-level auth** — optional PIN/login so it's safe even without Cloudflare Access. **(M)**
- **Family / multi-user** — map Cloudflare Access identities; per-user watchlists/seen lists. **(L)**
- **Audit log** — record adds/deletes (who/when) for accountability. **(S)**

## Ops & repo

- **CI → GHCR images** — GitHub Action builds & pushes both images on `main`; the server runs
  `docker compose pull && up -d` (no local build). Faster deploys, server needs no source. **(M)**
- **Compose healthchecks** + auto-restart on unhealthy. **(S)**
- **Releases & changelog** — tag versions, generate notes. **(S)**
- **Config backup** — periodic snapshot of `config.json` / `seen.json`. **(S)**
- **Dependabot/Renovate** — automated dependency updates. **(S)**

## Code quality / tech debt

- **Shared UI components** — the poster "Card" + "Section" patterns repeat across Search /
  Trending / Upcoming / Library; extract them. A shared `usePoll`/`useFetch` hook too. **(S–M)**
- **Input validation** — validate request bodies (e.g. zod) in the backend routes. **(S)**
- **Tests** — unit tests for the parsers/helpers (error formatter, rating picker, cleanup logic);
  a smoke test that boots the server and hits `/api/health`. **(M)**
- **i18n (pt-PT)** — the UI is in English; a Portuguese locale would fit the user. **(M)**
- **TypeScript** — optional migration for safer refactors. **(L)**

---

*Captured as a parking lot — revisit and reprioritise anytime. Yo ho ho.* 🏴‍☠️
