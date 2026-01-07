const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');

const VERSION = '1.0.3';

// initial debug level; may be overridden by config
let DEBUG = 7;

// Config file name and defaults
const CONFIG_FILE = 'narrow_gate.conf';
let dropInterval = 2000;
// scheduler handle for dynamic drop rate
let dropIntervalId;

const app = express();
let port = process.env.PORT || 26472;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 1024 }); // maxPayload: 1024 bytes (only accept this much input from player)

let gridSize = 60;
// Viewport radius for partial updates (11x11 view)
let VIEW_RADIUS = 5;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

let players = {};

// Chat system
let chatHistory = [];
const maxChatHistory = 20;
const rateLimits = {};
const RATE_LIMIT_COUNT = 20;
const RATE_LIMIT_WINDOW = 10000; // ms
// Auto-save interval for game map (ms)
const AUTO_SAVE_INTERVAL = 3 * 60 * 1000; // 3 minutes
const playerColors = ['Red', 'Green', 'Blue', 'Yellow', 'Purple'];

// Monsters config file and dynamic loader
const MONSTERS_FILE = 'monsters.conf';
let monsterTypes = {};
let monsters = [];

const PLAYER_SPRITE_POS = { col: 4, row: 5 };

const VERSE_INTERVAL_MIN = 1 * 60 * 1000; // 1 minute
const VERSE_INTERVAL_MAX = 2 * 60 * 1000; // 2 minutes

// Per-area maps and state
const areas = {}; // areaId -> { grid, monsters }
const DEFAULT_AREA = '00001';
// Helpers for area file paths
function areaFilePath(areaId) {
  return path.join(__dirname, `Area${areaId}.map`);
}
// Load or create an area
function loadArea(areaId) {
  if (areas[areaId]) { resetAreaEviction(areaId); return; }
  let grid;
  const file = areaFilePath(areaId);
  if (fs.existsSync(file)) {
    const data = fs.readFileSync(file, 'utf8');
    grid = data.split('\n').map(line => line.split(''));
    if (DEBUG >= 2) console.log(`Loaded area map ${areaId}`);
  } else {
    grid = generateGrid();
    placeDoors(grid);
    fs.writeFileSync(file, grid.map(r=>r.join('')).join('\n'));
    if (DEBUG >= 2) console.log(`Created new area map ${areaId}`);
  }
  areas[areaId] = { grid, monsters: [] };
  spawnMonstersInArea(areaId);
  // reset eviction timer on load
  resetAreaEviction(areaId);
}
// Save area back to its file
function saveArea(areaId) {
  const area = areas[areaId]; if (!area) return;
  fs.writeFileSync(areaFilePath(areaId), area.grid.map(r=>r.join('')).join('\n'));
  if (DEBUG >= 2) console.log(`Saved area map ${areaId}`);
}
// Spawn monsters according to config counts
function spawnMonstersInArea(areaId) {
  const area = areas[areaId]; if (!area) return;
  const empties = [];
  area.grid.forEach((row,y)=> row.forEach((c,x)=>{
    if (c==='.' && !playersInArea(areaId).some(p=>p.x===x&&p.y===y) && !area.monsters.some(m=>m.x===x&&m.y===y)) empties.push({x,y});
  }));
  Object.values(monsterTypes).forEach(cfg=>{
    const desired = cfg.count||0;
    const existing = area.monsters.filter(m=>m.type===cfg.type).length;
    let toSpawn = desired - existing;
    while(toSpawn>0 && empties.length) {
      const idx = Math.floor(Math.random()*empties.length);
      const {x,y} = empties.splice(idx,1)[0];
      const id = `${cfg.type}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      area.monsters.push({
        id,
        type: cfg.type,
        x,
        y,
        health: cfg.health,
        moveCounter: 0,
        ascii: cfg.ascii,
        spriteCoords: cfg.spriteCoords
      });
      if (DEBUG>=1) console.log(`Spawned ${cfg.type} in area ${areaId} at (${x},${y})`);
      toSpawn--;
    }
  });
}
// Get players in an area
function playersInArea(areaId) { return Object.values(players).filter(p=>p.area===areaId); }

// Time-based area cache eviction
const evictionTimers = {};
// areaCacheTimeout (ms) is loaded from narrow_gate.conf via loadConfig
let areaCacheTimeout;

function scheduleAreaEviction(areaId) {
  // never evict the default area
  if (areaId === DEFAULT_AREA) return;
  if (evictionTimers[areaId]) clearTimeout(evictionTimers[areaId]);
  if (playersInArea(areaId).length === 0) {
    evictionTimers[areaId] = setTimeout(() => {
      saveArea(areaId);
      delete areas[areaId];
      delete evictionTimers[areaId];
      if (DEBUG >= 1) console.log(`[Cache] Evicted area ${areaId}`);
    }, areaCacheTimeout);
    if (DEBUG >= 1) console.log(`[Cache] Scheduled eviction for area ${areaId} in ${areaCacheTimeout} ms`);
  }
}

function resetAreaEviction(areaId) {
  scheduleAreaEviction(areaId);
}

// external config loader
const configPath = path.join(__dirname, CONFIG_FILE);
function loadConfig() {
  try {
    // read raw config text (may include comments)
    let cfgText = fs.readFileSync(configPath, 'utf8');
    // remove block comments /* ... */
    cfgText = cfgText.replace(/\/\*[\s\S]*?\*\//g, '');
    // remove line comments // ... (not within strings)
    cfgText = cfgText.split('\n').map(line => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.slice(0, idx) : line;
    }).join('\n');
    // strip trailing commas before } or ]
    cfgText = cfgText.replace(/,(\s*[}\]])/g, '$1');
    const cfg = JSON.parse(cfgText);
    if (typeof cfg.DEBUG === 'number') {
      DEBUG = cfg.DEBUG;
      if (DEBUG >= 1) console.log(`[Config] DEBUG set to ${DEBUG}`);
    }
    if (typeof cfg.port === 'number') {
      port = cfg.port;
      if (DEBUG >= 1) console.log(`[Config] port set to ${port}`);
    }
    if (typeof cfg.gridSize === 'number') {
      gridSize = cfg.gridSize;
      if (DEBUG >= 1) console.log(`[Config] gridSize set to ${gridSize}`);
    }
    if (typeof cfg.VIEW_RADIUS === 'number') {
      VIEW_RADIUS = cfg.VIEW_RADIUS;
      if (DEBUG >= 1) console.log(`[Config] VIEW_RADIUS set to ${VIEW_RADIUS}`);
    }
    if (typeof cfg.dropInterval === 'number') {
      dropInterval = cfg.dropInterval;
      if (DEBUG >= 1) console.log(`[Config] dropInterval set to ${dropInterval}`);
    }
    if (typeof cfg.areaCacheTimeout === 'number') {
      areaCacheTimeout = cfg.areaCacheTimeout;
      if (DEBUG >= 1) console.log(`[Config] areaCacheTimeout set to ${areaCacheTimeout}`);
    }
  } catch (err) {
    console.warn(`[Config] Failed to load config: ${err.message}`);
  }
}
// Load initial config and then default area
loadConfig();
// Load monster types before initial area spawn
loadMonsters();
// Initial load of default area after config read
loadArea(DEFAULT_AREA);
process.on('SIGHUP', () => {
  if (DEBUG >= 1) console.log('Received SIGHUP, reloading config...');
  loadConfig();
  scheduleDrop();
  loadMonsters();
  // respawn monsters then reset eviction for each loaded area
  Object.keys(areas).forEach(areaId => {
    spawnMonstersInArea(areaId);
    resetAreaEviction(areaId);
  });
});

// Function to (re)start the drop timer after config changes
function scheduleDrop() {
  if (dropIntervalId) clearInterval(dropIntervalId);
  dropIntervalId = setInterval(placeRandomSomething, dropInterval);
  if (DEBUG >= 1) console.log(`[Config] placeRandomSomething scheduled every ${dropInterval} ms`);
}
// initial scheduling of drops
scheduleDrop();

// Function to load monsters from config file (one JSON per line)
function loadMonsters() {
  const mPath = path.join(__dirname, MONSTERS_FILE);
  try {
    const lines = fs.readFileSync(mPath, 'utf8').split('\n').filter(Boolean);
    const types = {};
    for (const line of lines) {
      const mcfg = JSON.parse(line);
      types[mcfg.type] = mcfg;
      if (DEBUG >= 1) console.log(`[Monsters] Loaded ${mcfg.type}`);
    }
    monsterTypes = types;
  } catch (err) {
    console.warn(`[Monsters] Failed to load monsters config: ${err.message}`);
  }
}
// initial monster load

// Assign initial area to new players
app.use((req,res,next)=>{ if (req.ws){}; next(); });

// Place UP (D) and DOWN (d) doors at fixed corners on new map creation
function placeDoors(grid) {
  if (grid[1][1] === '.') grid[1][1] = 'D';
  if (grid[gridSize - 2][gridSize - 2] === '.') grid[gridSize - 2][gridSize - 2] = 'd';
}

function generateGrid() {
    let grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill('.'));
    for (let i = 0; i < gridSize; i++) {
        grid[i][0] = grid[i][gridSize - 1] = '#';
        grid[0][i] = grid[gridSize - 1][i] = '#';
    }
    for (let i = 0; i < 600; i++) {
        let x, y;
        do { x = Math.floor(Math.random() * gridSize); y = Math.floor(Math.random() * gridSize); }
        while (grid[y][x] !== '.');
        grid[y][x] = '*';
    }
    for (let i = 0; i < 5; i++) {
        let x, y;
        do { x = Math.floor(Math.random() * gridSize); y = Math.floor(Math.random() * gridSize); }
        while (grid[y][x] !== '.');
        grid[y][x] = '$';
    }
    for (let i = 0; i < 9; i++) {
        let x, y;
        do { x = Math.floor(Math.random() * gridSize); y = Math.floor(Math.random() * gridSize); }
        while (grid[y][x] !== '.');
        grid[y][x] = '~';
    }
    return grid;
}

// Compute the 11x11 grid around a player (with padding '#')
function getViewportGrid(player, grid) {
  const view = [];
  for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
    const row = [];
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const y = player.y + dy;
      const x = player.x + dx;
      if (y < 0 || y >= gridSize || x < 0 || x >= gridSize) {
        row.push('#');
      } else {
        row.push(grid[y][x]);
      }
    }
    view.push(row);
  }
  return view;
}

// Filter players within the viewport
function getPlayersInView(player, areaId) {
  const visible = {};
  for (const id in players) {
    const p = players[id];
    if (p.area === areaId && Math.abs(p.x - player.x) <= VIEW_RADIUS && Math.abs(p.y - player.y) <= VIEW_RADIUS) {
      visible[id] = p;
    }
  }
  return visible;
}

// Filter monsters within the viewport
function getMonstersInView(player, monsters) {
  return monsters.filter(m =>
    Math.abs(m.x - player.x) <= VIEW_RADIUS && Math.abs(m.y - player.y) <= VIEW_RADIUS
  );
}

wss.on('connection', (ws, req) => {
    if (DEBUG >= 2) console.log('New connection established.');
    const playerId = Date.now();
    ws.playerId = playerId;
    const rawIp = req.socket.remoteAddress;
    const ip = rawIp.includes(':') ? rawIp.split(':').pop() : rawIp;
    // load saved player data if exists
    const safeIp = ip.replace(/[^a-zA-Z0-9]/g, '_');
    const saveFile = path.join(__dirname, `player-${safeIp}.save`);
    let playerData = null;
    if (fs.existsSync(saveFile)) {
      try {
        playerData = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
        if (DEBUG >= 2) console.log(`Loaded player data from ${saveFile}`);
      } catch (e) {
        console.error('Failed to load player save:', e);
      }
    }
    const name = playerData?.name || ip.split('.').pop();
    let startX, startY, playerColor;

    const taken = Object.values(players).map(p => p.color);
    const available = playerColors.filter(c => !taken.includes(c));
    if (ip === '::ffff:166.196.24.129') playerColor = 'Blue';
    else if (ip === '::ffff:70.115.140.92') playerColor = 'Purple';
    else playerColor = available[Math.floor(Math.random() * available.length)] || playerColors[0];

    do { startX = Math.floor(Math.random() * gridSize); startY = Math.floor(Math.random() * gridSize); }
    while (areas[DEFAULT_AREA].grid[startY][startX] !== '.');
    // override spawn position if saved and valid
    if (playerData?.position) {
      const {x, y} = playerData.position;
      if (x >= 0 && x < gridSize && y >= 0 && y < gridSize && areas[DEFAULT_AREA].grid[y][x] === '.') {
        startX = x;
        startY = y;
      }
    }
    if (DEBUG >= 2) console.log(`Assigning player ${playerId} to (${startX}, ${startY}) as ${playerColor} from IP ${ip}`);
    players[playerId] = {
      id: playerId,
      name,
      ip,
      x: playerData?.position?.x ?? startX,
      y: playerData?.position?.y ?? startY,
      oldX: playerData?.position?.x ?? startX,
      oldY: playerData?.position?.y ?? startY,
      faith: playerData?.stats?.faith ?? 0,
      health: playerData?.stats?.health ?? 0,
      buster: playerData?.stats?.buster ?? 0,
      wall: playerData?.stats?.wall ?? 0,
      filler: playerData?.stats?.filler ?? 0,
      color: playerColor,
      area: DEFAULT_AREA
    };

    ws.send(JSON.stringify({ type: 'assign', player: players[playerId] }));
    // send viewport-only update
    sendView(ws, 'update');
    ws.send(JSON.stringify({ type: 'chatHistory', history: chatHistory }));

    ws.messageTimes = [];

    // Handle incoming text messages only
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      const rawMsg = raw.toString();
      if (DEBUG >= 2) console.log(`[Server] Received message from player ${playerId}: ${rawMsg}`);
      // general rate limit: max 10 messages/sec
      const now = Date.now();
      ws.messageTimes = ws.messageTimes.filter(t => now - t < 1000);
      if (ws.messageTimes.length >= 10) {
        ws.send(JSON.stringify({ type: 'error', error: 'rate_limit' }));
        return;
      }
      ws.messageTimes.push(now);
      // enforce payload size
      if (rawMsg.length > 1024) return;
      let data;
      try { data = JSON.parse(rawMsg); } catch { return; }
      const type = data.type;
      if (typeof type !== 'string') return;
      switch (type) {
        case 'move':
          if (DEBUG >= 2) console.log(`[Server] Received move command for player ${playerId}: ${data.direction}`);
          // Move and then send this client an immediate viewport update  
          if (!players[playerId] || !['up','down','left','right'].includes(data.direction)) return;
          handleMove(playerId, data.direction);
          sendView(ws, 'update');
          break;
        case 'drop':
          //console.log(`[Server] Processing drop for player ${playerId}`);
          if (!players[playerId]) return;
          handleDrop(playerId);
          broadcast({ type: 'statsUpdate', players });
          broadcast({ type: 'players', players, grid: areas[players[playerId].area].grid, monsters: areas[players[playerId].area].monsters });
          break;
        case 'chat':
          if (DEBUG >= 2) console.log(`[Server] Processing chat for player ${playerId}: ${data.text}`);
          if (!players[playerId]) return;
          let text = String(data.text || '').replace(/[^\x20-\x7E]/g, '').trim();
          if (text.length > 256) text = text.slice(0,256);
          // rename command
          if (text.toLowerCase().startsWith('name: ')) {
            const newName = text.slice(6).trim();
            players[playerId].name = newName;
            if (DEBUG >= 2) console.log(`[Server] Player ${playerId} renamed to ${newName}`);
            broadcast({ type: 'statsUpdate', players });
          } else {
            handleChat(playerId, text);
          }
          break;
        case 'quit':
          if (DEBUG >= 2) console.log(`[Server] Player ${playerId} quitting, saving...`);
          handleQuit(ws);
          break;
        default:
          return;
      }
    });

    ws.on('close', () => {
        if (DEBUG >= 2) console.log(`Player ${playerId} has disconnected.`);
        cleanupPlayer(playerId);
        broadcast({ type: 'players', players, grid: areas[DEFAULT_AREA].grid, monsters: areas[DEFAULT_AREA].monsters });
    });
});

// Send viewport update to one client
function sendView(ws, type) {
  const player = players[ws.playerId];
  if (!player) return;
  //console.log(`[Server] sendView: player=${ws.playerId}, type=${type}, pos=(${player.x},${player.y})`);
  if (DEBUG >= 7) console.log(`[Server] sendView: player=${ws.playerId}, type=${type}, pos=(${player.x},${player.y})`);
  const area = player.area;
  ws.send(JSON.stringify({
    type,
    grid: getViewportGrid(player, areas[area].grid),
    players: getPlayersInView(player, area),
    monsters: getMonstersInView(player, areas[area].monsters)
  }));
}

// Broadcast viewport updates for 'players' or 'update'
function broadcastView(type) {
  //console.log(`[Server] broadcastView: type=${type}, clients=${wss.clients.size}`);
  if (DEBUG >= 7) console.log(`[Server] broadcastView: type=${type}, clients=${wss.clients.size}`);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) sendView(client, type);
  });
}

// Override broadcast: use viewport for players/update, else full
function broadcast(data) {
  //console.log(`[Server] broadcast: type=${data.type}`);
  if (DEBUG >= 7) console.log(`[Server] broadcast: type=${data.type}`);
  if (data.type === 'players' || data.type === 'update') {
    return broadcastView(data.type);
  }
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
  });
}

function handleMove(playerId, direction) {
  const p = players[playerId]; if(!p) return;
  const area = p.area;
  const grid = areas[area].grid;
  // compute new coords
  let nx=p.x, ny=p.y;
  // movement logic
  switch(direction) { case 'up': ny--; break; case 'down': ny++; break; case 'left': nx--; break; case 'right': nx++; break; default: return; }
  // bounds check
  if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) return;
  const cell = grid[ny][nx];
  // impassable rock
  if (cell === '#') return;
  // breakable wall (*)
  if (cell === '*') {
    if (p.buster > 0) {
      grid[ny][nx] = '.';
      p.buster--;
      // play buster sound
      broadcast({ type: 'sound', sound: 'buster' });
      broadcast({ type: 'statsUpdate', players });
    } else {
      return;
    }
  }
  // pickups (faith, health, gear)
  if (["$","H","B","W","F"].includes(cell)) {
    switch (cell) {
      case '$': p.faith++; break;
      case 'H': p.health++; break;
      case 'B': p.buster++; break;
      case 'W': p.wall++; break;
      case 'F': p.filler++; break;
    }
    grid[ny][nx] = '.';
    broadcast({ type: 'statsUpdate', players });
  }
  // lava hazard
  if (cell === '~') {
    grid[ny][nx] = '.';
    if (p.filler > 0) {
      p.filler--;
    } else {
      p.health -= 5;
      p.faith -= 10;
    }
    broadcast({ type: 'statsUpdate', players });
    // if dead or out of faith, reset inventory and teleport to start
    if (p.health <= 0 || p.faith <= 0) {
      p.buster = 0; p.wall = 0; p.filler = 0;
      p.area = DEFAULT_AREA; loadArea(DEFAULT_AREA);
      p.x = gridSize - 5; p.y = gridSize - 5;
      return; // skip normal move and door logic
    }
  }
  // move into the tile
  p.x = nx;
  p.y = ny;
  // door transitions
  if (cell === 'D' || cell === 'd') {
    // save current area and switch
    const oldArea = p.area;
    saveArea(oldArea);
    const offset = cell === 'D' ? 1 : -1;
    const newAreaId = String(parseInt(oldArea,10) + offset).padStart(5,'0');
    p.area = newAreaId;
    loadArea(newAreaId);
    // schedule eviction for the old area if empty
    scheduleAreaEviction(oldArea);
    // place at the opposite door in new area
    if (cell === 'D') {
      // came up: land at new area's down door
      p.x = gridSize - 2;
      p.y = gridSize - 2;
    } else {
      // came down: land at new area's up door
      p.x = 1;
      p.y = 1;
    }
  }
  if (DEBUG>=2) console.log(`Player ${playerId} moved to (${p.x},${p.y}) in area ${p.area}`);
  broadcast({ type:'players',players,grid:areas[p.area].grid,monsters:areas[p.area].monsters });
  broadcast({ type:'update',players,grid:areas[p.area].grid,monsters:areas[p.area].monsters });
}

function handleDrop(playerId) {
  if (DEBUG >= 2) console.log(`[Server] Executing handleDrop for player ${playerId}`);
  const p = players[playerId];
  if (p.wall > 0) {
    areas[p.area].grid[p.y][p.x] = '*';
    p.wall--;
    // play wall sound
    broadcast({ type: 'sound', sound: 'wall' });
  }
}

function weightedRandom(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let rnd = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        if (rnd < weights[i]) return items[i];
        rnd -= weights[i];
    }
    return items[0];
}

function placeRandomSomething() {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;
    // pick random active player and target their area
    const randId = playerIds[Math.floor(Math.random() * playerIds.length)];
    const p = players[randId];
    const areaId = p.area;
    const grid = areas[areaId].grid;
    // collect empty, unoccupied cells in that area
    const empties = [];
    for (let yy = 0; yy < gridSize; yy++) {
        for (let xx = 0; xx < gridSize; xx++) {
            if (grid[yy][xx] === '.') {
                const occupied = Object.values(players).some(pl => pl.area === areaId && pl.x === xx && pl.y === yy);
                if (!occupied) empties.push({ x: xx, y: yy });
            }
        }
    }
    if (empties.length < 2) {
      if (DEBUG >= 2) console.log('not enough spots for item drops in area', areaId);
      return;
    }
    const items = ['*', '~', '$', 'H', 'F', 'W', 'B'];
    const weights = [0.0, 0.1, 0.6, 0.15, 0.15, 0.05, 0.15];
    const item = weightedRandom(items, weights);
    const { x, y } = empties[Math.floor(Math.random() * empties.length)];
    grid[y][x] = item;
    // broadcast update for that area
    broadcast({ type: 'update', players, grid, monsters: areas[areaId].monsters });
    if (DEBUG >= 2) console.log(`Placed ${item} at (${x}, ${y}) in area ${areaId}`);
}

// Move a monster within its area and damage players on contact
function doMonsterMove(areaId, m) {
  if (Object.keys(players).length === 0) return;
  const typeInfo = monsterTypes[m.type];
  const blockedTiles = typeInfo.blockedTiles || [];

  // Sorrow: target powerups with diagonal moves
  if (m.type === 'Sorrow') {
    const powerUps = ['H','F','W','B','$'];
    const targets = [];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (powerUps.includes(areas[areaId].grid[y][x])) targets.push({ x, y });
      }
    }
    if (targets.length === 0) return;
    // choose or refresh target
    if (!m.target || (m.x === m.target.x && m.y === m.target.y) || m.targetAge >= 60 || !powerUps.includes(areas[areaId].grid[m.target.y]?.[m.target.x])) {
      m.target = targets[Math.floor(Math.random() * targets.length)];
      m.targetAge = 0;
    } else {
      m.targetAge++;
    }
    const dx = m.target.x - m.x, dy = m.target.y - m.y;
    const moves = [];
    if (dx !== 0 && dy !== 0) moves.push({ x: m.x + Math.sign(dx), y: m.y + Math.sign(dy) });
    if (dx !== 0) moves.push({ x: m.x + Math.sign(dx), y: m.y });
    if (dy !== 0) moves.push({ x: m.x, y: m.y + Math.sign(dy) });
    const dirs = [
      { x: m.x+1, y: m.y }, { x: m.x-1, y: m.y },
      { x: m.x, y: m.y+1 }, { x: m.x, y: m.y-1 }
    ].sort(() => Math.random() - 0.5);
    dirs.forEach(d => moves.push(d));
    for (const pos of moves) {
      if (pos.x < 0 || pos.x >= gridSize || pos.y < 0 || pos.y >= gridSize) continue;
      if (blockedTiles.includes(areas[areaId].grid[pos.y][pos.x])) continue;
      if (areas[areaId].monsters.some(mon => mon.id !== m.id && mon.x === pos.x && mon.y === pos.y)) continue;
      m.x = pos.x; m.y = pos.y;
      if (powerUps.includes(areas[areaId].grid[pos.y][pos.x])) {
        areas[areaId].grid[pos.y][pos.x] = '.';
        if (DEBUG >= 4) console.log(`[Monster] ${m.type} collected powerup at (${pos.x},${pos.y})`);
        m.target = null;
        m.targetAge = 0;
      }
      playersInArea(areaId)
        .filter(p => p.x === m.x && p.y === m.y)
        .forEach(p => {
          p.health -= typeInfo.attack;
          p.faith -= typeInfo.attack;
          p.health = Math.max(p.health, 0);
          p.faith = Math.max(p.faith, 0);
          broadcast({ type: 'statsUpdate', players });
        });
      return;
    }
    return;
  }

  const grid = areas[areaId].grid;
  // find nearest player in this area
  const playersHere = playersInArea(areaId);
  let target = null, minDist = Infinity;
  for (const p of playersHere) {
    const dist = Math.abs(p.x - m.x) + Math.abs(p.y - m.y);
    if (dist < minDist) { minDist = dist; target = p; }
  }
  if (!target) return;
  const dx = target.x - m.x, dy = target.y - m.y;
  const moves = [];
  if (dx !== 0) moves.push({ x: m.x + Math.sign(dx), y: m.y });
  if (dy !== 0) moves.push({ x: m.x, y: m.y + Math.sign(dy) });
  const dirs = [{ x: m.x+1, y: m.y },{ x: m.x-1, y: m.y },{ x: m.x, y: m.y+1 },{ x: m.x, y: m.y-1 }]
    .sort(() => Math.random() - 0.5);
  dirs.forEach(d => moves.push(d));
  for (const pos of moves) {
    if (pos.x < 0 || pos.x >= gridSize || pos.y < 0 || pos.y >= gridSize) continue;
    if (blockedTiles.includes(grid[pos.y][pos.x])) continue;
    if (areas[areaId].monsters.some(mon => mon.id !== m.id && mon.x === pos.x && mon.y === pos.y)) continue;
    m.x = pos.x; m.y = pos.y;
    // destroy any power-up items at this position
    const powerUps = ['H','F','W','B','$'];
    if (powerUps.includes(grid[pos.y][pos.x])) {
      grid[pos.y][pos.x] = '.';
      if (DEBUG >= 4) console.log(`[Monster] ${m.type} destroyed ${grid[pos.y][pos.x]} at (${pos.x},${pos.y})`);
    }
    // apply damage on any player at this position
    playersHere.filter(p => p.x === m.x && p.y === m.y).forEach(p => {
      p.health -= typeInfo.attack;
      p.faith -= typeInfo.attack;
      p.health = Math.max(p.health, 0);
      p.faith = Math.max(p.faith, 0);
      broadcast({ type: 'statsUpdate', players });
    });
    break;
  }
}

// Move monsters in all loaded areas
function moveMonsters() {
  for (const areaId in areas) {
    const area = areas[areaId];
    for (const m of area.monsters) {
      m.moveCounter++;
      const interval = monsterTypes[m.type]?.moveInterval || 0;
      if (m.moveCounter >= interval) {
        m.moveCounter = 0;
        doMonsterMove(areaId, m);
      }
    }
  }
  // send viewport update to all clients
  broadcast({ type: 'update' });
}

// Chat handler with rate limiting and sanitization
function handleChat(playerId, text) {
  // ensure valid player
  if (!players[playerId]) return;
  const now = Date.now();
  const times = rateLimits[playerId] || [];
  rateLimits[playerId] = times.filter(t => now - t < RATE_LIMIT_WINDOW);
  if (rateLimits[playerId].length >= RATE_LIMIT_COUNT) return;
  rateLimits[playerId].push(now);
  if (!text) return;
  const entry = { timestamp: now, name: players[playerId].name, text };
  chatHistory.push(entry);
  if (chatHistory.length > maxChatHistory) chatHistory.shift();
  broadcast({ type: 'chat', message: entry });
  if (DEBUG >= 2) console.log(`[Server] Executing handleChat for player ${playerId} with text: ${text}`);
}

// Handle save & quit
function handleQuit(ws) {
  const pid = ws.playerId;
  const p = players[pid]; if (!p) return;
  const quitData = {
    name: p.name,
    stats: { faith: p.faith, health: p.health, buster: p.buster, wall: p.wall, filler: p.filler },
    position: { x: p.x, y: p.y },
    sprite: PLAYER_SPRITE_POS
  };
  const safeIp = p.ip.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `player-${safeIp}.save`;
  fs.writeFile(path.join(__dirname, fileName), JSON.stringify(quitData, null, 2), err => {
    if (err) console.error('Error saving player data:', err);
    else if (DEBUG >= 2) console.log(`Player data saved to ${fileName}`);
  });
  ws.send(JSON.stringify({ type: 'quitAck', message: 'Player data saved.' }));
  ws.close();
}

// On quit or disconnect, save their area
function cleanupPlayer(pid) { const p=players[pid]; if(p){ saveArea(p.area); delete players[pid]; }}

// Auto-save function: backup level map as Area00001-HHMM.map
function saveMap() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const backupName = `${DEFAULT_AREA}-${hh}${mm}.map`;
  const data = areas[DEFAULT_AREA].grid.map(row => row.join('')).join('\n');
  fs.writeFile(backupName, data, err => {
    if (err) console.error('Error auto-saving map:', err);
    else if (DEBUG >= 2) console.log('Map backup saved:', backupName);
  });
}

function getRandomVerse() {
  try {
    const verses = fs.readFileSync(path.join(__dirname, 'public/verses.txt'), 'utf8').split('\n').filter(v => v.trim());
    return verses[Math.floor(Math.random() * verses.length)] || '';
  } catch {
    return '';
  }
}

function broadcastVerse() {
  const verse = getRandomVerse();
  if (verse) {
    broadcast({ type: 'verse', text: verse });
  }
  // Schedule next broadcast
  const delay = VERSE_INTERVAL_MIN + Math.random() * (VERSE_INTERVAL_MAX - VERSE_INTERVAL_MIN);
  setTimeout(broadcastVerse, delay);
}

setInterval(moveMonsters, 100);
// Auto-save map every AUTO_SAVE_INTERVAL
setInterval(saveMap, AUTO_SAVE_INTERVAL);
// Broadcast empty-tile count every 10s for areas with active players
setInterval(() => {
  // determine which areas have players
  const activeAreas = [...new Set(Object.values(players).map(p => p.area))];
  activeAreas.forEach(areaId => {
    const grid = areas[areaId].grid;
    const emptyCount = grid.reduce((sum, row) => sum + row.filter(c => c === '.').length, 0);
    if (DEBUG >= 2) console.log(`[Server] Empty tiles in area ${areaId}: ${emptyCount}`);
    broadcast({ type: 'emptyCount', area: areaId, count: emptyCount });
  });
}, 10000);

setTimeout(broadcastVerse, VERSE_INTERVAL_MIN);

server.listen(port, () => {
  if (DEBUG >= 2) console.log(`Server is running on port ${port}`);
});
