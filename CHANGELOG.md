# Changelog

## [1.0.4] - In progress
### Added
- Display server version under the title overlay.
### Changed
- Server reads version from `package.json` at startup and sends it on connect.
- Deploy now runs `npm ci --omit=dev` on the production server after rsync.
- CHANGELOG.md should always use YYYY-MM-DD date format
- Switched `public/index.html` script tag to `type="module"` to silence Vite warnings.
### Fixed
- Deploy now preserves the `public/` directory so the server can serve `index.html`.

## [1.0.3] - 2025-05-03
- Added 'doors' to get to different maps (forwards and backwards - maybe like UP and DOWN?) - Persistent "Area" maps once players enter them, and saved as "Area00001.map", etc -- Players need to have their own areas loaded as they could be in different areas at the same time. -- After an area is exited by all players, it should be unloaded from memory/cache.  Sprite at 2x,2y is the "advancing"/"upward" door, and the sprite at 1x,2y is the "backward"/"downward" door.
- Fixed bug where monsters were not moving
- Fixed bug where speaker/mute button was not working
- Added sound for when a player picks up a powerup and when player drops a wall
- Added the Sorrow monster type to the monsters.conf file and updated the server code to handle it as it targets only powerups and can move diagonally through walls and lava
- Added the 'c' key to change the player's sprite (rotate through available sprites)
- Updated the SAVE/LOAD for players to include their Area, need to fix a new bug that didn't restore player inventory items
- Added feature to display 'name' at bottom of player icon on map

## [1.0.2] - 2025-04-30
- Set up external config file for dynamic server variables. (DEBUG, port, gridSize, VIEW_RADIUS, dropInterval, etc)
- setInterval for placeRandomSomething now dynamically set by dropInterval and restart on config changes
- Added SIGHUP (signal 1) handler to reload configuration at runtime.
- Moved monster settings to external monsters config file; reloadable via SIGHUP.
- Set the 'weight' of '*' (blocking tiles) from random item placement to 0.0 (We don't want to drop them)
- Create audioCtx only ONCE (not every time playBleep is called), which FIXED the "Bleep" sound hanging up the browser after a while

## [1.0.1] - 2025-04-25
- Introduced `VERSION` constant set to '1.0.1'.
- Added chat rename command: messages starting with `name: ` update player name and broadcast a stats update.
- Implemented quit command (`quit`): pressing 'q' saves player data to `player-<ip>.save`, sends `quitAck`, and closes connection.
- Server broadcasts total empty-tile count every 10s (`emptyCount`), logged at DEBUG≥2; clients update stats panel accordingly.
- Enhanced client to handle `quitAck` alert and `emptyCount` updates, and send 'quit' on pressing 'q'.

PROMPT: 
Let's make a few updates:
1) Set the VERSION to '1.0.1'
2) Allow player to send a chat message that starts with "name: " then followed by a username, and then we can set the player's name to the name they specified. Their name will be shown in their chat messages after the date and before the message itself. and also used on the player's info/stat line.
3) Allow the player to press 'q' keystroke to Quit.  And this will direct the server to save the player's name, and stat info / inventory, map position, and tile icon position from the sprite PNG for the player's visual representation. The filename for the player save will be "player-" followed by the players IP address followed by ".save"
4) We need the server (not client) to calculate the total number of empty tiles on the entire map (once every 10 seconds) and this value can be broadcast to the clients so they can show the current number of empty tiles.  This value should also be shown to the server log output if DEBUG >= 2

## [1.0.0] - 2025-04-24
- Added `DEBUG` flag (0–9) with conditional logging: active logs at DEBUG≥2, verbose logs at DEBUG≥7.
- Added `PLAYER_SPRITE_POS` constant for uniform sprite positioning.
- Refactored movement: logged start/end positions in `handleMove`, removed duplicate broadcasts, and centralized viewport updates.
- Centralized broadcasting logic via `broadcast`, `broadcastView`, and `sendView` functions.
- Enhanced chat handling: rate limiting, sanitization, history storage, and broadcast in `handleChat`.
- Map persistence: load latest save on startup and auto-save map every 3 minutes.
- Monster logic: initial spawn and periodic movement loop.
- Initial client-side rendering: viewport grid, player and monster sprites, chat UI, and stats panel with sprite customization.

PROMPT: In the server, let's set a new variable called 'DEBUG' that can range from 0 (no debugging messages) up to 9 (the most debugging messages - verbose).  Then, for all the currently  uncommented console.log messages, let's set a conditional statement to only display those messages if the value of DEBUG is equal or greater than 2, and we will set the value of DEBUG to be 2. 
Any console.log code that is currently commented out, we can uncomment those lines and only display them if the DEBUG variable is equal or greater than 7.

## [0.0.14] - 2025-04-25
PROMPT: If there are any "save*.map" files in the dir with server.js then let's find the most recent (newest) save file, and load it for the starting map, rather than create a brand new map from scratch.  All we want to do is to skip the generation of outter "#" and initial "*" (wall) tiles, but then we do want to add the random drop powerups that we normally start with, and then, of course spawn the monsters, etc...

## [0.0.13] - 2025-04-25
PROMPT: we want the server to only send visible tiles to the player client. Right now that is the 11x11 tiles around the player location (some time later we might have walls block player view also, but let's not worry about that for now). We need to make changes to the server and client codes so that the server only sends the proper tiles / map contents, and then the client needs to render the tiles that the server sends.

## [0.0.12] - 2025-04-25
PROMPT: 1) Let's set a WebSocket size limit to only 1k. I can't see any current scenerio where the player will need to send more than 1024 bytes in a single message. We could always change this later if needed.  Let's also be sure to sanitize any and all input coming to the server from the players first (and once).. that way we won't need to have sanitation code in more than 1 place.
2) Keep save failes as they are for now.
3) Let's go ahead and add code to validation player in a stronger way (as you suggested).
4) Yes, let's also add some rate limits on input from any player, so that we drop any messages above 10 messages per second.  If the server detects this, the server should send back a message to the player indicating rate limit exceeded, and then the player client should flash a red message in the middle of their screen for 1 second saying "Slow down".

## [0.0.11] - 2025-04-25
PROMPT: 
Let's add a couple new features:
1)  Let's add a "Game Info:" line below the player info / inventory lines. The first value this Game Info line will show is the current number of "empty" tiles.
2) Let's add an auto-save feature on the server side that writes the current game map to a save file called "save-YYYYmmdd_HHMMSS.map". We only need to save an ascii 2D file for the "#", "*", and "." map types.  This auto save function should be executed every 3 minutes based on a variable initialized at the beginning of the code.

## [0.0.10] - 2025-04-25
PROMPT: Let's add a new command keystroke "h" (for Help)... which will overlay small help popup window in the upper left of the screen. The "h" key will toggle the Help overlay on and off.  The popup window should have white letters on a black background. It should show all they keystrokes players can use, and what they do.

When the chat input bar is active (after the TAB is pressed), then no keystrokes should take any other game actions. All keystrokes only go in to the chat bar until the ENTER key is pressed, and then keystrokes will take normal game actions again.

When a player press SPACEBAR to drop a wall object, we should only allow that if the player has atleast 1 "wall" object in their inventory.  Then, of course, we should reduce their wall inventory by 1.

## [0.0.9] - 2025-04-25
PROMPT: Great! let's put this new chat system in to place.
1) We can override the browser window's default TAB behavior.
2) Yes, we do want to sanitize all user input so that only ascii characters in the range of 32-126. Anything else is just dropped out by the server when initially parsed (not stored / remembered in any way).
3) Yes, let's have a chat history for 20 lines.  We also want to include the date and time in a very compact format at the front of each line.
4 Let's do very forgiving rate limiting of 20 messages within 10 seconds.

At some time later we will have a login system so players will have "names" so everyone can tell who said what, but for now, let's just set a players "name" to be the last segment of their IP address

## [0.0.8] - 2025-04-25
PROMPT: We should add a chat / message system where 20% of the right side of the display window should be used for a chat / messaging window.. Pressing the TAB key should allow next characters typed to go in to the chat message window, and then pressing ENTER key will send message broadcast to all players and will show in their chat window. Messages should appear at the bottom and then scroll up as new messages are added.  Is this something we can easily do?  Are there any other aspects we should consider first?

## [0.0.7] - 2025-04-24
PROMPT: Let's expand the full size of the entire map to an area of 60x60, however, we will only display a smaller area of the map at a time... only display a grid of 11x11 tiles with the player always seeing themself in the middle (very center) tile of the display... this means 5 columns of tiles to both the player's right and left... and 5 rows of tiles both above and below the player will be displayed on their screen, and the player icon itself will seem to always remain in the center of the displayed area, with the map items seeming to scroll around them as they move around the game map area. If this makes sense, then let's make the changes. if this is not clear, then ask the needed questions. 

[first attempt wasn't quite right]

This is close, but it seems the display area is only showing a static part of the world map, and the player is being displayed moving off to the left and right sides of the display area.  In our new move / view arrangement... the player needs to always be displayed at the center of the viewport area (6th column and 6th row) on the screen at all times... with the map area moving around them as the player uses the directional movement keys.
Let's also show the player's X/Y world coords down in their info/stats section.

## [0.0.6] - 2025-04-24
PROMPT: How could we implement an AI/computer controlled monster called "Temptation", that would use tile 1x,4y from the sprite sheet.  This monster would try to move toward any active player (prefering the closest player). They will first try to move horizontally, if that is blocked they will try to move vertically, and if that is blocked also, they will move randomly if possible, and no move is possible it will skip it's turn. Let's start with 2 of these monsters, but eventually we will have several different types of monsters with different movement strategies, different attack power, different defense power, and different health levels.

For the monster movements... we want to set a Interval timer to allow monster movement every 10th of a second... and the Temptation monster will move once every 10 move cycles.. that will be equal to once every 1 second, since there will be 10 move cycles every 1 second. Different monsters might be able to move slightly slower or faster, so we need this level of precission.  Also, the "Temptation" monster should use the lowercase letter "t" for the ascii representation, since it's once of the weakest monsters, and so lowercase for weaker monsters and uppercase for stronger monsters makes sense for later.

And also update client to render monsters.

Walls, Lava, Players, and other monsters should also block the movement of "temptation" monsters. Different monsters might follow different rules for this, so we need to keep that in mind, and set the list of blocking tiles as a part of each monster type info.

## [0.0.5] - 2025-04-24
PROMPT: We should change our display width/height to just be 90% rather than 100%. I have made a couple changes here and there, but perhaps I changed some parts I should not have, and perhaps I did not change some things I should have.  Can you run through all the file / code and fix everything required so that the game map display only takes up 90% width and 90% height?

Keep track of empty spaces and only put item drops on empty spaces. We should not be placing any drops on tiles where any player is currently standing.

## [0.0.4] - 2025-04-24
PROMPT: I think we have a new problem with the game display.  The display of game sprites / tiles seems to be very small (probably with no scaling on the display of the tiles). The sprite PNG file only has 8 rows and 8 columns of sprite tiles. The file itself is 1024x1024 pixels, which means each tile / sprite is 128x128 pixels only.  These sprites will then be displayed on the gameboard area at whatever size / scaling they need to be so that the entire game area (map, controls, stats, info, game title div, etc) all fill up the players display area (entire width and height of their window).

## [0.0.3] - 2025-04-24
PROMPT: I have added a sprite file in to the public/ dir called "NGspritesProd.png". It is a 1024x1024 PNG file divided in to an 8x8 grid of sprites (128x128 pixels for each sprite game object). The game should default to this file for graphic sprites if a player connects via graphic web browser.  If a player connects via text-based client, we want to use the ascii characters/colors we are using now.  And if a player has their own NGspritesProd.png file on their own computer, their game should use and display graphics from their own sprite file instead.
If we consider the 1024x1024 PNG file is divided in to 8x8 tiles (128x128 pixels each) ... then here are the grid coords for the objects we currently need. with rows and columns HERE in this list numbered for 1-8 (X x Y):
1x1 = Wall for outer edge that cannot be interacted with and always block
1x6 = Wall that can be busted down and placed by players. (same as "*")
1x5 = Lava tile (same as "~")
1x2 = empty floor tile (same as (".")
1x7 = gold / coin object (same as "$")
4x2 = Health powerup object (same as "H")
4x3 = Wall powerup object (same as "W")
6x2 = Buster powerup object (same as "B")
3x6 = Filler powerup object (same as "F")
4x5 = Player character (same as "@")

I think most systems allow Chrome browser to have some directory / folder on the client side to save / keep end-user config files for Chrome. Either some place in this folder structure could be the place we ask users to place their own sprite file... or if there is some more appropriate directory on the end-user system, we can use that instead, and I will let you, the AI, decide what is best.

Let's also set the graphical display game area to be 640x640 in size, and the player info/stats data line should be displayed under the map area.

Yes, let's use all your tools, reanalyze what I am asking here, and what new information I am providing here, and let's update any code files necessary to make these updates functional.

## [0.0.2] - 2025-04-24
PROMPT: Looking over all the code in different files we have now.... is there a way we can set this up so that the player can download a separate PNG file to reskin how the game looks like to them, where other players might see the objects using their graphics?

## [0.0.1] - 2025-04-24
- Initial release
PROMPT: I am creating a multiplayer MMO style game, a rogue-like Christian-based game I am calling "Narrow Gate" (an MMO).  We will use server.js for our main server code, and use HTML, CSS, Javascript in general. 
Let's use the following code as a general baseline... use what we can and adjust what we need to fit our needs. We do (must) also be sure to use port 26472.
----- sample CODE BELOW -----
[copy/paste of Darlantus Dungeon Crawler (DDC)]
----- sample CODE ABOVE -----
