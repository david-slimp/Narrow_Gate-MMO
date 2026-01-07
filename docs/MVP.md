# MVP - Narrow Gate MMO

This document captures the Minimum Viable Product for Narrow Gate MMO and confirms that the current codebase meets MVP requirements.

## MVP Goals
- Provide a playable, real-time multiplayer experience in a browser.
- Support player persistence and basic progression mechanics.
- Deliver a minimal but complete game loop with exploration, interaction, and survival.

## MVP Features (Implemented)
- **Multiplayer Core**: Real-time movement and state updates via WebSocket.
- **World Model**: Grid-based world (60x60 per area) with an 11x11 viewport.
- **Areas and Doors**: Multiple areas with transitions via doors (D and d).
- **Persistence**: Player saves to disk, restores name, stats, position, area, and sprite.
- **Items and Hazards**: Powerups (faith, health, buster, wall, filler) and lava damage.
- **Basic Progression**: Faith and health track player status; items modify stats.
- **Monsters**: Two monster types with configurable movement and blocking rules.
- **Chat**: Chat system with history, rate limiting, and name changes.
- **UI**: In-browser map, stats, controls, and help overlay.
- **Audio**: Sound effects and area-based background music.
- **Theming**: Christian verses broadcast periodically.

## MVP Constraints
- File-based persistence in repo root (maps and saves).
- Single server process handles game and WebSocket.
- No formal user accounts or authentication yet.

## MVP Acceptance Criteria
- Players can connect, move, and see updates from other players.
- Players can pick up items, take damage, and drop walls.
- Players can transition between areas and return to saved areas.
- Player state is saved and restored on reconnect.
- Chat works and is visible to all players.
- Monsters move and interact with players.
- The game runs reliably in a modern browser on the live demo URL.

## Out of Scope (Not Required for MVP)
- Account system, login UI, or authentication.
- Extensive quest or narrative systems.
- Large-scale performance optimization.
- Advanced graphics or 3D rendering.
- Automated testing and release pipelines.
