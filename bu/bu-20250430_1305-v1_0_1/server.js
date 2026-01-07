const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');

const DEBUG = 6;
const VERSION = '1.0.1';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 1024 }); // maxPayload: 1024 bytes (only accept this much input from player)

const port = process.env.PORT || 26472;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

let players = {};
const gridSize = 60;
// Viewport radius for partial updates (11x11 view)
const VIEW_RADIUS = 5;

// Chat system
let chatHistory = [];
const maxChatHistory = 20;
const rateLimits = {};
const RATE_LIMIT_COUNT = 20;
const RATE_LIMIT_WINDOW = 10000; // ms
// Auto-save interval for game map (ms)
const AUTO_SAVE_INTERVAL = 3 * 60 * 1000; // 3 minutes

const playerColors = ['Red', 'Green', 'Blue', 'Yellow', 'Purple'];

// Monster definitions
const monsterTypes = {
  Temptation: {
    ascii: 't', spriteCoords: { col: 1, row: 4 },
    health: 10, attack: 2, defense: 1,
    moveInterval: 20,
    blockedTiles: ['#', '*', '~']
  }
};
let monsters = [];

const PLAYER_SPRITE_POS = { col: 4, row: 5 };

const VERSE_INTERVAL_MIN = 1 * 60 * 1000; // 1 minute
const VERSE_INTERVAL_MAX = 2 * 60 * 1000; // 2 minutes

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

// Initialize grid: load latest save if present, else generate new
let grid;
const saveFiles = fs.readdirSync(__dirname).filter(f => /^save-.*\.map$/.test(f));
if (saveFiles.length > 0) {
  saveFiles.sort();
  const latest = saveFiles[saveFiles.length - 1];
  const data = fs.readFileSync(path.join(__dirname, latest), 'utf8');
  grid = data.split('\n').map(line => line.split(''));
  if (DEBUG >= 2) console.log('Loaded map from', latest);
} else {
  grid = generateGrid();
}

// Compute the 11x11 grid around a player (with padding '#')
function getViewportGrid(player) {
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
function getPlayersInView(player) {
  const visible = {};
  for (const id in players) {
    const p = players[id];
    if (Math.abs(p.x - player.x) <= VIEW_RADIUS && Math.abs(p.y - player.y) <= VIEW_RADIUS) {
      visible[id] = p;
    }
  }
  return visible;
}

// Filter monsters within the viewport
function getMonstersInView(player) {
  return monsters.filter(m =>
    Math.abs(m.x - player.x) <= VIEW_RADIUS && Math.abs(m.y - player.y) <= VIEW_RADIUS
  );
}

// spawn initial monsters
function spawnMonsters() {
  const empties = [];
  for (let yy = 0; yy < gridSize; yy++) {
    for (let xx = 0; xx < gridSize; xx++) {
      if (grid[yy][xx] === '.') {
        const occupied = Object.values(players).some(p => p.x === xx && p.y === yy);
        if (!occupied) empties.push({ x: xx, y: yy });
      }
    }
  }
  for (let i = 0; i < 2 && empties.length > 0; i++) {
    const idx = Math.floor(Math.random() * empties.length);
    const { x, y } = empties.splice(idx, 1)[0];
    const id = `T${i}_${Date.now()}`;
    monsters.push({ id, type: 'Temptation', x, y, health: monsterTypes.Temptation.health, moveCounter: 0 });
  }
}
spawnMonsters();

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
    while (grid[startY][startX] !== '.');
    // override spawn position if saved and valid
    if (playerData?.position) {
      const {x, y} = playerData.position;
      if (x >= 0 && x < gridSize && y >= 0 && y < gridSize && grid[y][x] === '.') {
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
      color: playerColor
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
          //console.log(`[Server] Received move command for player ${playerId}: ${data.direction}`);
          if (!players[playerId] || !['up','down','left','right'].includes(data.direction)) return;
          handleMove(playerId, data.direction);
          break;
        case 'drop':
          //console.log(`[Server] Processing drop for player ${playerId}`);
          if (!players[playerId]) return;
          handleDrop(playerId);
          broadcast({ type: 'statsUpdate', players });
          broadcast({ type: 'players', players, grid, monsters });
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
        delete players[playerId];
        broadcast({ type: 'players', players, grid, monsters });
    });
});

// Send viewport update to one client
function sendView(ws, type) {
  const player = players[ws.playerId];
  if (!player) return;
  //console.log(`[Server] sendView: player=${ws.playerId}, type=${type}, pos=(${player.x},${player.y})`);
  if (DEBUG >= 7) console.log(`[Server] sendView: player=${ws.playerId}, type=${type}, pos=(${player.x},${player.y})`);
  ws.send(JSON.stringify({
    type,
    grid: getViewportGrid(player),
    players: getPlayersInView(player),
    monsters: getMonstersInView(player)
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
  const p = players[playerId];
  if (DEBUG >= 2) console.log(`[Server] handleMove start for player ${playerId}: oldPos=(${p.x},${p.y}), direction=${direction}`);
  p.oldX = p.x; p.oldY = p.y;
  if (direction === 'up' && p.y > 0) p.y--;
  if (direction === 'down' && p.y < gridSize - 1) p.y++;
  if (direction === 'left' && p.x > 0) p.x--;
  if (direction === 'right' && p.x < gridSize - 1) p.x++;
  const cell = grid[p.y][p.x];
  if (cell === '.') {} 
  else if (cell === '*' && p.buster > 0) { grid[p.y][p.x] = '.'; p.buster--; broadcast({ type: 'statsUpdate', players }); }
  else if (cell === '~' && p.filler > 0) { grid[p.y][p.x] = '.'; p.filler--; broadcast({ type: 'statsUpdate', players }); }
  else if (cell === '$') { grid[p.y][p.x] = '.'; p.faith++; broadcast({ type: 'statsUpdate', players }); }
  else if (cell === 'H') { grid[p.y][p.x] = '.'; p.health++; broadcast({ type: 'statsUpdate', players }); }
  else if (cell === 'B') { grid[p.y][p.x] = '.'; p.buster++; broadcast({ type: 'statsUpdate', players }); }
  else if (cell === 'W') { grid[p.y][p.x] = '.'; p.wall++; broadcast({ type: 'statsUpdate', players }); }
  else if (cell === 'F') { grid[p.y][p.x] = '.'; p.filler++; broadcast({ type: 'statsUpdate', players }); }
  else if (cell === '~') { p.health--; if (p.health < 0) { p.faith = 0; p.health = 0; } broadcast({ type: 'statsUpdate', players }); }
  else { p.x = p.oldX; p.y = p.oldY; }
  //console.log(`[Server] handleMove end for player ${playerId}: newPos=(${p.x},${p.y})`);
  // broadcast updated viewport
  broadcast({ type: 'update', players, grid, monsters });
}

function handleDrop(playerId) {
  if (DEBUG >= 2) console.log(`[Server] Executing handleDrop for player ${playerId}`);
    const p = players[playerId];
    if (p.wall > 0) {
        grid[p.y][p.x] = '*';
        p.wall--;
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
    if (Object.keys(players).length === 0) return;
    // collect all empty, unoccupied cells
    const empties = [];
    for (let yy = 0; yy < gridSize; yy++) {
        for (let xx = 0; xx < gridSize; xx++) {
            if (grid[yy][xx] === '.') {
                const occupied = Object.values(players).some(p => p.x === xx && p.y === yy);
                if (!occupied) empties.push({ x: xx, y: yy });
            }
        }
    }
    if (empties.length < 2) {
      if (DEBUG >= 2) console.log('not enough spots for item drops');
      return;
    }
    const items = ['*', '~', '$', 'H', 'F', 'W', 'B'];
    const weights = [0.1, 0.1, 0.6, 0.15, 0.15, 0.05, 0.15];
    const item = weightedRandom(items, weights);
    const { x, y } = empties[Math.floor(Math.random() * empties.length)];
    grid[y][x] = item;
    broadcast({ type: 'update', players, grid, monsters });
    if (DEBUG >= 2) console.log(`Placed ${item} at (${x}, ${y})`);
}

// Monster AI movement loop (100ms cycles)
function doMonsterMove(m) {
  if (Object.keys(players).length === 0) return;
  const typeInfo = monsterTypes[m.type];
  const blockedTiles = typeInfo.blockedTiles || [];
  let target = null, minDist = Infinity;
  for (const pid in players) {
    const p = players[pid];
    const dist = Math.abs(p.x - m.x) + Math.abs(p.y - m.y);
    if (dist < minDist) { minDist = dist; target = p; }
  }
  if (!target) return;
  const dx = target.x - m.x, dy = target.y - m.y;
  const moves = [];
  if (dx !== 0) moves.push({ x: m.x + Math.sign(dx), y: m.y });
  if (dy !== 0) moves.push({ x: m.x, y: m.y + Math.sign(dy) });
  // random fallback directions
  const dirs = [{ x: m.x+1, y: m.y },{ x: m.x-1, y: m.y },{ x: m.x, y: m.y+1 },{ x: m.x, y: m.y-1 }]
    .sort(() => Math.random() - 0.5);
  dirs.forEach(d => moves.push(d));
  for (const pos of moves) {
    if (pos.x < 0 || pos.x >= gridSize || pos.y < 0 || pos.y >= gridSize) continue;
    if (blockedTiles.includes(grid[pos.y][pos.x])) continue;
    if (Object.values(players).some(p => p.x === pos.x && p.y === pos.y)) continue;
    if (monsters.some(mon => mon.id !== m.id && mon.x === pos.x && mon.y === pos.y)) continue;
    m.x = pos.x; m.y = pos.y;
    break;
  }
}

function moveMonsters() {
  monsters.forEach(m => {
    m.moveCounter++;
    if (m.moveCounter >= monsterTypes[m.type].moveInterval) {
      m.moveCounter = 0;
      doMonsterMove(m);
    }
  });
  broadcast({ type: 'update', players, grid, monsters });
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

// Auto-save function: write grid to ascii file (#,*,.)
function saveMap() {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
  const fileName = `save-${ts}.map`;
  const data = grid.map(row => row.map(c => ['#','*','.'].includes(c) ? c : '.').join('')).join('\n');
  fs.writeFile(fileName, data, err => {
    if (err) console.error('Error auto-saving map:', err);
    else if (DEBUG >= 2) console.log('Map auto-saved:', fileName);
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

setInterval(placeRandomSomething, 2000);  // place something every 2 seconds
setInterval(moveMonsters, 100);
// Auto-save map every AUTO_SAVE_INTERVAL
setInterval(saveMap, AUTO_SAVE_INTERVAL);
// Broadcast empty-tile count every 10s
setInterval(() => {
  const emptyCount = grid.reduce((sum, row) => sum + row.filter(c => c === '.').length, 0);
  if (DEBUG >= 2) console.log(`[Server] Empty tiles: ${emptyCount}`);
  broadcast({ type: 'emptyCount', count: emptyCount });
}, 10000);

setTimeout(broadcastVerse, VERSE_INTERVAL_MIN);

server.listen(port, () => {
  if (DEBUG >= 2) console.log(`Server is running on port ${port}`);
});
