# CLAUDE.md - Plant Simulator Engineering Guidelines

## Commands
- **Run Dev Server:** `npm run dev`
- **Build:** `npm run build`
- **Type Check:** `npm run type-check`
- **Lint:** `npm run lint`
- **Test:** `npm run test`

## Code Style & Standards
- **Language:** TypeScript (Strict Mode). No `any`. Explicit return types required.
- **Architecture:** Clean Architecture / ECS Hybrid.
    - `src/core`: Pure logic only. NO imports from `src/render` or `src/ui`.
    - `src/render`: Visuals only. Reads `src/core` state. NO game logic.
    - `src/ui`: DOM inputs only. Dispatches actions to `src/core`.
- **Formatting:** Prettier default.
- **Naming:** PascalCase for Classes/Components, camelCase for functions/vars.
- **Comments:** Explain *why*, not *what*. Complex logic requires block comments.

## Architecture Violations
- DO NOT put drawing logic in the simulation loop.
- DO NOT put simulation logic in the UI event handlers.
- DO NOT mutate state directly from the View; dispatch an Action/Event.

## Documentation
- If you add a major module, update the `MAP.md` in that directory.
- If you make an architectural decision (e.g., changing the grid data structure), append to `docs/DECISIONS.md`.
