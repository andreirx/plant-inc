# Core Module Map

The simulation engine. Pure TypeScript with zero DOM or rendering dependencies.

## Files
- **constants.ts**: Simulation constants (tick rate, grid size, physics values).
- **loop.ts**: Fixed timestep game loop with accumulator pattern.
- **state.ts**: Global simulation state container.
- **systems/**: Individual simulation systems (climate, growth, grid).

## Rules
- NO imports from `render/` or `ui/`.
- All functions must be pure or operate on the state container.
- Deterministic: same input state + same tick = same output state.
