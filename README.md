# pyMC Repeater UI

Web dashboard for [pyMC_Repeater](https://github.com/pymc-dev/pyMC_Repeater) — monitor and manage your pyMc repeater entirely from the browser.

Built with **Vue 3**, **TypeScript**, and **TailwindCSS**. This repository holds the standalone UI source; it builds directly into the repeater project and is served by its embedded web server. Keeping the frontend separate keeps the repeater codebase lean and makes UI contributions easier.

## Documentation

Developer reference for the frontend is in [`docs/`](docs/README.md). It covers the data service architecture, design token system, shared UI components, z-index layering scale, and architecture decision records for significant design choices.

## Contributing

Pull requests are welcome — please target the **dev** branch.

## Features

- **Dashboard** — real-time stats, packet charts, and airtime utilisation at a glance
- **Neighbors** — interactive network map (Leaflet) with signal-quality indicators and a sortable neighbor table
- **Terminal** — full xterm.js console backed by a command registry (status, identities, keys, neighbors, ACL, rooms, and more)
- **Configuration** — radio settings, duty cycle, transport keys, web settings, LetsMesh, backup/restore, API tokens, and advert management
- **Sessions & Companions** — view and manage active sessions and companion devices
- **Statistics & Logs** — historical packet data, system metrics, and a searchable log viewer
- **Room Servers** — overview of connected room servers
- **CAD Calibration** — channel-activity-detection tuning tools
- **Real-time updates** — WebSocket packet feed with automatic reconnection
- **Authentication** — JWT-based login with token refresh and a guided first-boot setup wizard

## Prerequisites

- **Node.js** 20 or later
- A running [pyMC_Repeater](https://github.com/pymc-dev/pyMC_Repeater) backend

## Quick Start

```sh
npm install
cp .env.example .env.local   # point VITE_DEV_API_URL at your backend
npm run dev
```

The Vite dev server proxies `/api` and `/auth` requests to the URL set in `VITE_DEV_API_URL`.

## Production Build

```sh
npm run build
```

The compiled output is written to `../pyMC_Repeater/repeater/web/html` and served directly by the repeater.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run test:unit` | Run unit tests (Vitest) |
| `npm run lint` | Lint and auto-fix with ESLint |
| `npm run format` | Format source with Prettier |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_DEV_API_URL` | `http://localhost:8000` | Backend URL used by the Vite dev proxy and WebSocket connections |

## License

[MIT](LICENSE)

---

## A note on AI-assisted development

AI-assisted development and vibe coding are not the same thing, and the
distinction matters for a project with real standards.

**Vibe coding** is the common pattern of giving an AI model a rough instruction
and seeing what comes out. It is fast and sometimes useful, but the output is
inconsistent: models will hallucinate APIs, invent abstractions, ignore dark
mode, and write code that looks plausible but violates the conventions of the
codebase — often silently.

**AI-assisted development** is different. It is a development-aware engineer
using AI to make targeted, standards-aware edits — with enough context and
constraint that the model operates within the rules of the project rather than
around them. Used this way, AI can produce genuinely high-quality contributions
at pace.

`CLAUDE.md` in the project root is what makes the latter possible here. Claude
Code reads it automatically at the start of every session. It encodes the rules
that matter most to this codebase — never use raw colour literals, never bypass
DataService, never write `bg-primary text-white`, always teleport modals, use
the correct button classes in the correct contexts — so that if an engineer or
the model itself requests an edit that would violate those standards, it is
flagged immediately rather than silently applied.

The file is not Claude-specific in spirit. It captures exactly the same things
a senior contributor would push back on in a code review. It just moves that
review to before the code is written, not after.
