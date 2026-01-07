Let's update our docs with this vital info:

FIRST: Ask me about this new project to collect all needed data, paths, URLs, etc.
    - DONE: Ask what the purpose of this project is.
    - DONE: Ask if there is anything specific we need to keep in mind, or ways we want to implement things (Is it going to be the normal HTML5/TS/CSS or something else).
    - DONE: Look over all the files we already have in this project, especially the docs/ dir and drafts/ dir.
    - DONE: Start processing the/this TODO.md file, PRD.md, MVP.md.
    - DONE: Use Code_Steps.md only as a general guide (do not follow it explicitly).
    - Now, let's get this old project ramped up for a new sprint to next version and upgrades.

CURRENT PROJECT SNAPSHOT (confirmed by owner):
    - Purpose: Web-based client/server rogue-like MMO with Christian theme.
    - Version reality: likely around 1.0.3 (verify later).
    - Live demo URL: http://ministriesforchrist.net:26472/
    - Production install path (remote): domains/ministriesforchrist.net/public_html/games/Narrow_Gate-MMO/
    - GitHub URL: TBD (not yet set up).
    - Stack: server.js via Node on Linux host; simple web client for players; allow third-party clients.
    - IMPORTANT: Do not touch game code during the dev-tools upgrade pass.
    - IMPORTANT: Do not touch CHANGELOG.md until dev-tools work is confirmed complete.

*) Update all docs and code and helper files with this info where appropriate:
GitHub URL: TBD (not yet set up)
Relative path to where game will be installed on remote prod server: domains/ministriesforchrist.net/public_html/games/Narrow_Gate-MMO/
    Verify and report back where our GitHub url for this project is documented
    Verify and report back what we have set for our final production URL for live gameplay

*) We need to remember to update CHANGELOG.md after every single change!  DO NOT FORGET THIS!
    - HOLD: Do not change CHANGELOG.md during the dev-tools upgrade pass.
    - After dev-tools are complete, add this note in 2 important places and report where.

*) DONE: Install Vite (port 26472), Prettier, and ESLint.
    - HOLD: Do not install Husky unless the project already uses it (currently not present).

*) Locate the .env file at the root level of this/the project and report back what variables are being set
    Most likely the PATH will need to be changed for every project
    DONE: .env and src/scripts/deploy.sh use npm and "deploy:prod" to rsync files to proper place

*) DONE: public/meta.txt ends up in the game's top level dir (along side the index.html)
    DONE: "npm run build" copies the file to the proper place in the dist/ dir

*) DONE: Running the npm deploy command runs "npm run build" first so any new code gets built properly

*) DONE: Prettier configured to ignore CHANGELOG.md

*) DONE: All paths in our docs and helper files use relative paths (not absolute paths).

*) For large or complex sets of commands or tasks that take multiple steps, use this TODO.md file to keep track of progress, and help you remember what to to, create step-by-step action plans, etc...   Once tasks are done, mark them as "DONE:" in the TODO.md as well as updating the CHANGELOG.md

*) DONE: License set to AGPL3 and renamed to LICENSE.txt (remove other sample license files if any).

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

*) DO NOT under any circumstance modify, update or change the CHANGELOG.md file without asking directly and getting additional confirmation.  -- we will wait until the very last step to examine how to handle the CHANGELOG.md file.

*) The index.html or web-user front-end should have the app title ((Narrow Gate MMO") and verion number (like "v1.0.3") displayed somewhere on the main/front page... preferably in the upper left of any menu/tool bar (where version number being displayed is dynamic and taken from package.json)



FINALLY: After all the above is done, and after you have gotten specific confirmation everything is done, then you can ask if we should commit the r release as exactly "v1.0.3" (but we need to verify the actual real number first)  with an appropriate git tag that does not repeat the version number in the tag message.  If we need to "git init" first, then do it, but ask and confirm before doing it.
    - Always be sure the version number in CHANGELOG.md is in sync with package.json and public/meta.txt  (SKIP THIS STEP FOR NOW... WE WILL VERIFY LATER)

OPEN QUESTIONS TO RESOLVE (before touching code):
    - Define "scope" for the next sprint (examples: features to add, content volume, multiplayer scale, server hardening).
    - HOLD: Vitest and semantic-release (waiting for owner confirmation).
