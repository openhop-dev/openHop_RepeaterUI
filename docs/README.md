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
