# Architecture Decision Records

## ADR-001: Modular Monolith Structure
**Date:** 2026-02-01
**Status:** Accepted
**Decision:** Use a modular monolith with strict dependency rules (core -> render/ui, never reverse).
**Rationale:** Keeps simulation logic pure and testable, while allowing render and UI layers to read state directly without serialization overhead.

## ADR-002: Dual Loop Architecture
**Date:** 2026-02-01
**Status:** Accepted
**Decision:** Simulation runs at fixed 20Hz; rendering runs at requestAnimationFrame rate.
**Rationale:** Fixed timestep ensures determinism for the simulation. Decoupled render loop allows smooth visuals regardless of simulation tick rate.

## ADR-003: Vite + PixiJS + TypeScript
**Date:** 2026-02-01
**Status:** Accepted
**Decision:** Use Vite as bundler, PixiJS for 2D rendering, TypeScript in strict mode.
**Rationale:** Vite provides fast HMR for development. PixiJS is the most performant 2D WebGL renderer. Strict TypeScript catches bugs early.
