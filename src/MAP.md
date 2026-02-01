# Source Map

This is the root of the source code.

## Modules
- **core/**: The "Backend" of the game. Runs the math.
- **render/**: The "Frontend" graphics engine (PixiJS).
- **ui/**: The "Frontend" interface (HTML overlays).
- **utils/**: Shared math and event bus.

## Dependency Rules
`render` and `ui` depend on `core`.
`core` depends on NOTHING.
