# PRD / GDD - Narrow Gate MMO

## 1. Overview
Narrow Gate MMO is a web-based, Christian-themed, rogue-like MMO dungeon crawler. The project provides a lightweight browser client and a Node.js server. The game is designed for real-time multiplayer play via WebSocket and includes a simple but effective gameplay loop, persistent player saves, and an expandable world composed of multiple areas.

## 2. Vision
Create a small, approachable MMO experience that blends roguelike exploration with Christian-themed content, allowing casual players to jump in quickly and advanced players or external developers to build richer clients against the same server.

## 3. Goals
- Deliver a stable, playable multiplayer experience with persistence and basic progression.
- Support low-friction browser play at the live demo URL.
- Provide a clean, extensible server architecture that can be modularized.
- Encourage community and third-party client development.
- Keep infrastructure simple enough for low-cost hosting.

## 4. Non-Goals (for current phase)
- Complex account systems, OAuth, or full auth flows.
- 3D graphics or heavy rendering pipelines.
- Heavy AI or machine-learning-driven features.
- Large-scale content pipelines (quests, items, crafting) beyond the baseline system.

## 5. Target Audience
- Players who enjoy simple roguelike dungeon exploration.
- Christian audiences seeking a themed MMO experience.
- Hobby developers looking to build alternate clients.

## 6. Game Pillars
- **Exploration:** Navigate a grid-based world, uncover doors between areas.
- **Persistence:** Player stats and areas are saved.
- **Community:** Chat and shared world states encourage social play.
- **Faith Theme:** Verses and Christian framing reinforce the theme.

## 7. Current Gameplay Summary (v1.0.3)
- Multiplayer grid-based world with real-time updates via WebSocket.
- 11x11 viewport around the player, full world map is 60x60 per area.
- Basic movement, pickup items, drop walls, and hazards (lava).
- Area transitions via doors (D and d) creating multi-area navigation.
- Two monster types with different movement and blocking behavior.
- Persistent player saves, player names, and sprite selection.
- In-game chat with rate limiting and sanitization.
- Audio and music with area-based background tracks.
- Periodic verse broadcast to players.

## 8. Core Systems
### 8.1 Player System
- Player movement on a grid with collision rules.
- Inventory-like stats: faith, health, buster, wall, filler.
- Name assignment and change through chat command.
- Quit and reconnect preserve position, area, and stats.

### 8.2 World / Areas
- Each area is a 60x60 grid with walls, powerups, lava, and doors.
- Default area is 00001; doors enable area traversal.
- Areas are saved to disk and evicted from memory if idle.
- Area 00001 has special boundaries for spawning and movement.

### 8.3 Monsters
- Defined in `monsters.conf` with JSON-per-line config.
- Movement intervals and blocked tiles defined per monster.
- Monsters interact with players and powerups.

### 8.4 Chat
- WebSocket chat with history and rate limiting.
- `name:` command changes player name.

### 8.5 Audio / UI
- Sound effects for pickups, lava, and actions.
- Background music changes by area.
- Sprite sheet support plus user-custom sprites.

## 9. Content and Theming
- Christian verses displayed periodically from `public/verses.txt`.
- Faith as a core stat tied to progression and survival.

## 10. Tech Stack
- **Server:** Node.js + Express + WebSocket (`ws`).
- **Client:** HTML/CSS/JS served from `public/`.
- **Build Tools:** Vite for dev/build, ESLint, Prettier.
- **Config:** `narrow_gate.conf`, `monsters.conf`.
- **Persistence:** JSON save files and area maps in filesystem.

## 11. Deployment
This project is intended to be self-hosted. Anyone can download the source and run the server locally or deploy it to their own Linux host.
General deployment notes:
- GitHub repository: https://github.com/david-slimp/Narrow_Gate-MMO.git
- The server is started with `npm start` and serves both the web client and WebSocket endpoint.
- The default port is `26472`, configurable via `narrow_gate.conf` or environment.
- Static client assets are served from `public/`.
- Build tooling (Vite) can produce a `dist/` bundle if you want a static build.
- File-based persistence (area maps and player saves) is stored alongside the server unless refactored.

## 12. Roadmap (Planned)
### Near-Term (post-dev-tools)
- Modularize server code into multiple files.
- Decide canonical server directory layout.
- Move runtime-generated files (maps/saves) out of repo root.

### Mid-Term
- Add formal testing (Vitest) and release automation (semantic-release).
- Explore TypeScript for stricter enforcement.
- Improve client layout and UX while keeping simplicity.

### Long-Term
- Account system and stronger player identity.
- More monster types, items, and areas.
- Expanded Christian narrative content.

## 13. Risks and Constraints
- File-based persistence can get messy at scale without a data directory.
- Single-port dev server conflicts with Vite dev port unless refactored.
- Dependency security updates should be monitored regularly.
- Always update `CHANGELOG.md` after every change; do not remove lines from prior version headings.

## 14. Success Metrics
- Stable multiplayer sessions without crashes.
- Consistent player save/load behavior.
- Reasonable latency and responsiveness for movement.
- Ability to extend monsters, areas, and content with minimal friction.

## 15. Open Questions
- Confirm if/when to add authentication and accounts.
- Decide contribution workflow.
- Confirm hosting environment details and monitoring strategy (crash recovery).
- Decide whether to adopt TypeScript and how far to apply it.
