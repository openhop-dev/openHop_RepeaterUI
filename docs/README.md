# pyMC Repeater UI — Developer Docs

Technical reference for contributors working on the frontend.

## Contents

| Document | What it covers |
|---|---|
| [Development Guide](development-guide.md) | **Start here.** Project overview, DataService rules, design system summary, common patterns, change checklist |
| [Architecture Decisions](architecture-decisions.md) | ADRs: Pinia store pattern, bootstrap modal sequencing, mobile WebGL constraints, spinner unification, modal button classes, OTA update exit lock |
| [Data Service](data-service.md) | Centralised HTTP layer: bootstrap phases, TTL-aware caching, polling schedule, WebSocket-first delivery, `/stats` idle timeout |
| [Design Tokens](design-tokens.md) | Full CSS variable system (light/dark), Tailwind aliases, semantic groupings for surface, text, border, and accent colours |
| [Style Guide](style-guide.md) | Global utility class catalogue, inline styles audit table, decision guide for Tailwind vs global class vs inline |
| [UI Components](ui-components.md) | Shared UI primitives: Spinner, NeighborMenu, modal utilities, glass cards, configuration card utilities |
| [Configuration Workflow](configuration-workflow.md) | Unsaved-changes guard, `useUnsavedChanges` composable, save/restart flow, and per-tab behaviour differences |
| [z-index Layering](z-index-layering.md) | Standardised z-index scale for all fixed/modal/overlay elements |
