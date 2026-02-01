# Render Module Map

The visual layer. PixiJS-based rendering that reads from core state.

## Files
- **app.ts**: PixiJS Application instance and initialization.
- **layers/**: Render layers for each quadrant (atmosphere, soil, map).
- **assets/**: Sprite sheets, textures, and asset loading.

## Rules
- Read-only access to `core/state`.
- NO simulation logic here.
- Interpolate between ticks for smooth visuals.
