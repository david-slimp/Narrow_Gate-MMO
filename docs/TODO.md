OFFICIAL TODO

CURRENT PROJECT SNAPSHOT (confirmed by owner):
    - Purpose: Web-based client/server rogue-like MMO with Christian theme.
    - Live demo URL: http://MinistriesForChrist.net:26472/
    - Production install path (remote): domains/ministriesforchrist.net/public_html/games/Narrow_Gate-MMO/
    - GitHub URL: https://github.com/david-slimp/Narrow_Gate-MMO.git
    - Stack: server.js via Node on Linux host; simple web client for players; allow third-party clients.
    - IMPORTANT: Use Code_Steps.md only as a general guide (do not follow it explicitly).
    - IMPORTANT: Always update `CHANGELOG.md` after every change; do not remove or alter lines from prior version headings.
    - When working toward the next release, the top section should read like `## [x.y.z] - In progress` (do not use a date until the release is finalized).
    - Follow `drafts/Code_Steps.md` and include the issue number in new branch names.

TODO:

*) For large or complex sets of commands or tasks that take multiple steps, use this TODO.md file to keep track of progress, and help you remember what to to, create step-by-step action plans, etc...   Once tasks are done, mark them as "DONE:" in the TODO.md as well as updating the CHANGELOG.md

*) Never remove or reduce our initial .gitignore file, only add to it.

*) TODO (later when code changes are allowed): Move runtime-generated files out of repo root.
    - Target files: Area*.map, 00*.map, player*.save, player*.save.bu
    - Decide on a dedicated runtime data directory (e.g., data/ or runtime/).
    - Update server load/save paths to use the new directory.
    - Update .gitignore to exclude the runtime data directory.
    - Ensure deploy/build scripts do not overwrite or delete runtime data.

*) TODO (when we start server refactors): Decide the best location for server files before modularizing.
    - Evaluate placing server code/config under src/server/ vs server/ vs keeping at repo root.
    - Consider impact on paths (public assets, configs, runtime data) and deployment.
    - Align with upcoming plan to split server.js into modules.

*) DONE: The index.html or web-user front-end should have the app title ((Narrow Gate MMO") and verion number (like "v1.0.3") displayed somewhere on the main/front page... preferably in the upper left of any menu/tool bar (where version number being displayed is dynamic and taken from package.json)

*)  stuff for UPCOMING version 1.1.0:
-- Break in to modules
Example Structure (Server-side):
- server.js (Main entry point: Sets up WS server, basic connections)
- config.js (Constants, monster types, etc.)
- utils.js (Generic helper functions)
- area_manager.js (loadArea, saveArea, generateGrid, etc.)
- player_manager.js (Handle connection, quit, player data)
- monster_manager.js (moveMonsters, doMonsterMove)
- websocket_handlers.js (Handles specific message types like 'move', 'place')




FINALLY: 
    - Always be sure the version number in CHANGELOG.md is in sync with package.json and public/meta.txt  

OPEN QUESTIONS TO RESOLVE (before touching code):
    
    - HOLD: Vitest and semantic-release (waiting for owner confirmation).
