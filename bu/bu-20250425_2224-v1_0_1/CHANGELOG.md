# Changelog

## [1.0.1] - 2025-04-25
- Introduced `VERSION` constant set to '1.0.1'.
- Added chat rename command: messages starting with `name: ` update player name and broadcast a stats update.
- Implemented quit command (`quit`): pressing 'q' saves player data to `player-<ip>.save`, sends `quitAck`, and closes connection.
- Server broadcasts total empty-tile count every 10s (`emptyCount`), logged at DEBUG≥2; clients update stats panel accordingly.
- Enhanced client to handle `quitAck` alert and `emptyCount` updates, and send 'quit' on pressing 'q'.

## [1.0.0] - 2025-04-24
- Added `DEBUG` flag (0–9) with conditional logging: active logs at DEBUG≥2, verbose logs at DEBUG≥7.
- Added `PLAYER_SPRITE_POS` constant for uniform sprite positioning.
- Refactored movement: logged start/end positions in `handleMove`, removed duplicate broadcasts, and centralized viewport updates.
- Centralized broadcasting logic via `broadcast`, `broadcastView`, and `sendView` functions.
- Enhanced chat handling: rate limiting, sanitization, history storage, and broadcast in `handleChat`.
- Map persistence: load latest save on startup and auto-save map every 3 minutes.
- Monster logic: initial spawn and periodic movement loop.
- Initial client-side rendering: viewport grid, player and monster sprites, chat UI, and stats panel with sprite customization.
