# UI Module Map

The controller layer. DOM-based overlays for user interaction.

## Files
- **layout.ts**: 4-Quadrant CSS Grid manager with responsive breakpoints.
- **components/**: DOM components (evolution tree, stats panel, controls).

## Rules
- Dispatches actions/events to `core/`.
- NO direct state mutation.
- NO rendering logic (that belongs in `render/`).
