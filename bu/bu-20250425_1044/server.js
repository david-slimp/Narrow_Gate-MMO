const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = process.env.PORT || 26472;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

let players = {};
const gridSize = 60;
// Chat system
let chatHistory = [];
const maxChatHistory = 20;
const rateLimits = {};
const RATE_LIMIT_COUNT = 20;
const RATE_LIMIT_WINDOW = 10000; // ms
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

function generateGrid() {
    let grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill('.'));
    for (let i = 0; i < gridSize; i++) {
        grid[i][0] = grid[i][gridSize - 1] = '#';
        grid[0][i] = grid[gridSize - 1][i] = '#';
    }
    for (let i = 0; i < 25; i++) {
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

let grid = generateGrid();

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
    console.log('New connection established.');
    const playerId = Date.now();
    const rawIp = req.socket.remoteAddress;
    const ip = rawIp.includes(':') ? rawIp.split(':').pop() : rawIp;
    const name = ip.split('.').pop();
    let startX, startY, playerColor;

    const taken = Object.values(players).map(p => p.color);
    const available = playerColors.filter(c => !taken.includes(c));
    if (ip === '::ffff:166.196.24.129') playerColor = 'Blue';
    else if (ip === '::ffff:70.115.140.92') playerColor = 'Purple';
    else playerColor = available[Math.floor(Math.random() * available.length)] || playerColors[0];

    do { startX = Math.floor(Math.random() * gridSize); startY = Math.floor(Math.random() * gridSize); }
    while (grid[startY][startX] !== '.');

    console.log(`Assigning player ${playerId} to (${startX}, ${startY}) as ${playerColor} from IP ${ip}`);
    players[playerId] = { id: playerId, name, ip, x: startX, y: startY, oldX: startX, oldY: startY, gold: 0, health: 0, buster: 0, wall: 0, filler: 0, color: playerColor };

    ws.send(JSON.stringify({ type: 'assign', player: players[playerId] }));
    ws.send(JSON.stringify({ type: 'update', players, grid, monsters }));
    ws.send(JSON.stringify({ type: 'chatHistory', history: chatHistory }));

    ws.on('message', msg => {
        const data = JSON.parse(msg);
        if (data.type === 'move') {
            handleMove(playerId, data.direction);
            broadcast({ type: 'players', players, grid, monsters });
        } else if (data.type === 'drop') {
            handleDrop(playerId);
            broadcast({ type: 'players', players, grid, monsters });
        } else if (data.type === 'chat') {
            handleChat(playerId, data.text);
        }
    });

    ws.on('close', () => {
        console.log(`Player ${playerId} has disconnected.`);
        delete players[playerId];
        broadcast({ type: 'players', players, grid, monsters });
    });
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
    });
}

function handleMove(playerId, direction) {
    const p = players[playerId]; p.oldX = p.x; p.oldY = p.y;
    if (direction === 'up' && p.y > 0) p.y--;
    if (direction === 'down' && p.y < gridSize - 1) p.y++;
    if (direction === 'left' && p.x > 0) p.x--;
    if (direction === 'right' && p.x < gridSize - 1) p.x++;
    const cell = grid[p.y][p.x];
    if (cell === '.') {} 
    else if (cell === '*' && p.buster > 0) { grid[p.y][p.x] = '.'; p.buster--; broadcast({ type: 'statsUpdate', players }); }
    else if (cell === '~' && p.filler > 0) { grid[p.y][p.x] = '.'; p.filler--; broadcast({ type: 'statsUpdate', players }); }
    else if (cell === '$') { grid[p.y][p.x] = '.'; p.gold++; broadcast({ type: 'statsUpdate', players }); }
    else if (cell === 'H') { grid[p.y][p.x] = '.'; p.health++; broadcast({ type: 'statsUpdate', players }); }
    else if (cell === 'B') { grid[p.y][p.x] = '.'; p.buster++; broadcast({ type: 'statsUpdate', players }); }
    else if (cell === 'W') { grid[p.y][p.x] = '.'; p.wall++; broadcast({ type: 'statsUpdate', players }); }
    else if (cell === 'F') { grid[p.y][p.x] = '.'; p.filler++; broadcast({ type: 'statsUpdate', players }); }
    else if (cell === '~') { p.health--; if (p.health < 0) { p.gold = 0; p.health = 0; } broadcast({ type: 'statsUpdate', players }); }
    else { p.x = p.oldX; p.y = p.oldY; }
}

function handleDrop(playerId) {
    const p = players[playerId]; grid[p.y][p.x] = '*'; if (p.wall > 0) p.wall--;
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
    if (empties.length === 0) return;
    const items = ['*', '~', '$', 'H', 'F', 'W', 'B'];
    const weights = [0.1, 0.1, 0.6, 0.15, 0.15, 0.05, 0.15];
    const item = weightedRandom(items, weights);
    const { x, y } = empties[Math.floor(Math.random() * empties.length)];
    grid[y][x] = item;
    broadcast({ type: 'update', players, grid, monsters });
    console.log(`Placed ${item} at (${x}, ${y})`);
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
function handleChat(playerId, rawText) {
    const now = Date.now();
    const times = rateLimits[playerId] || [];
    rateLimits[playerId] = times.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (rateLimits[playerId].length >= RATE_LIMIT_COUNT) return;
    rateLimits[playerId].push(now);
    const text = rawText.replace(/[^\x20-\x7E]/g, '').trim();
    if (!text) return;
    const entry = { timestamp: now, name: players[playerId].name, text };
    chatHistory.push(entry);
    if (chatHistory.length > maxChatHistory) chatHistory.shift();
    broadcast({ type: 'chat', message: entry });
}

setInterval(placeRandomSomething, 1000);  // place something every 1 second
setInterval(moveMonsters, 100);

server.listen(port, () => console.log(`Server is running on port ${port}`));
