# Architecture Specification

## The Loop
The game runs two independent loops:
1. **Simulation Loop (20Hz):** Deterministic. Updates climate, soil diffusion, and plant growth.
2. **Render Loop (RequestAnimationFrame):** As fast as possible. Interpolates state for smooth visuals.

## The Quadrants
1. **Top-Left (Air View):** PixiJS. Shows shoot system, weather, insects.
2. **Bottom-Left (Soil View):** PixiJS. Shows root system, water table, nutrients.
3. **Top-Right (Map View):** PixiJS. Tilemap of the world, biome distribution.
4. **Bottom-Right (Evolution UI):** DOM/HTML. Tech tree and mutations.

## Data Flow
[Input/UI] -> [Action Dispatch] -> [Core Simulation] -> [State Update] -> [Renderer Reads State]
