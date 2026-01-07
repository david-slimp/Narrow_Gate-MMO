const ws = new WebSocket('ws://' + window.location.host);
ws.onopen = () => console.log('WebSocket connection established');
ws.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.type === 'assign') {
    console.log('Assigned player:', data.player);
    currentPlayer = data.player;
    currentPlayerId = data.player.id;
  } else if (data.type === 'players' || data.type === 'update') {
    currentGrid = data.grid;
    currentPlayers = data.players;
    currentMonsters = data.monsters || [];
    if (currentPlayerId && currentPlayers[currentPlayerId]) {
      currentPlayer = currentPlayers[currentPlayerId];
    }
    renderGrid(data.grid);
    renderPlayers(data.players);
    renderMonsters(currentMonsters);
  } else if (data.type === 'statsUpdate') {
    // detect faith gain
    const newFaith = data.players[currentPlayerId]?.faith ?? 0;
    if (currentPlayer && newFaith > currentPlayer.faith) showFaithBubble();
    currentPlayers = data.players;
    currentPlayer = data.players[currentPlayerId] || currentPlayer;
    renderStats(data.players);
  } else if (data.type === 'chatHistory') {
    chatMessages = data.history;
    renderChat();
  } else if (data.type === 'chat') {
    chatMessages.push(data.message);
    renderChat();
  } else if (data.type === 'error' && data.error === 'rate_limit') {
    flashRateLimit();
  } else if (data.type === 'quitAck') {
    console.log('Server:', data.message);
    alert(data.message);
  } else if (data.type === 'emptyCount') {
    const statsEl = document.getElementById('stats');
    let ecEl = document.getElementById('empty-count');
    if (!ecEl) {
      ecEl = document.createElement('div');
      ecEl.id = 'empty-count';
      statsEl.appendChild(ecEl);
    }
    ecEl.innerText = `Total empty tiles: ${data.count}`;
  } else if (data.type === 'verse') {
    showVerseMessage(data.text);
  }
};

// Unified key handler for movement, chat, and UI
document.addEventListener('keydown', event => {
  const chatInput = document.getElementById('chat-input');
  console.log(`Keydown: ${event.key}`);
  // Chat mode
  if (!chatInput.hidden) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const txt = chatInput.value.trim();
      if (txt) {
        ws.send(JSON.stringify({ type: 'chat', text: txt }));
        console.log('Sent chat:', txt);
      }
      chatInput.value = '';
      chatInput.hidden = true;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      chatInput.value = '';
      chatInput.hidden = true;
    }
    return;
  }
  // Normal mode
  switch (event.key) {
    case 'h': case 'H':
      event.preventDefault();
      document.getElementById('help-overlay').hidden = !document.getElementById('help-overlay').hidden;
      break;
    case 'Tab':
      event.preventDefault();
      chatInput.hidden = false;
      chatInput.focus();
      break;
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
      event.preventDefault();
      const dir = event.key.slice(5).toLowerCase();
      move(dir);
      console.log('Sent move:', dir);
      break;
    }
    case ' ': case 'Spacebar':
      event.preventDefault();
      drop();
      console.log('Sent drop');
      break;
    case 'q': case 'Q':
      event.preventDefault();
      console.log('Sent quit');
      ws.send(JSON.stringify({ type: 'quit' }));
      break;
  }
});

// Chat input handler
const chatInput = document.getElementById('chat-input');
chatInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    ws.send(JSON.stringify({ type: 'chat', text: chatInput.value }));
    chatInput.value = '';
    chatInput.hidden = true;
  } else if (event.key === 'Escape') {
    chatInput.value = '';
    chatInput.hidden = true;
  }
});

function move(direction) {
  ws.send(JSON.stringify({ type: 'move', direction }));
}

function drop() {
  ws.send(JSON.stringify({ type: 'drop' }));
}

// World and viewport settings
const gridSize = 60;            // total world dimension
const displaySize = 11;         // viewport dimension
const viewRadius = Math.floor(displaySize/2);
let currentGrid = [];
let currentPlayers = {};
let currentMonsters = [];
let currentPlayerId = null;
let currentPlayer = null;
let chatMessages = [];

// Sound toggle setup
let soundEnabled = true;
const soundToggleBtn = document.getElementById('sound-toggle');
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggleBtn.innerText = soundEnabled ? '🔊' : '🔇';
});

// single shared AudioContext for all bleeps
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioCtx();

// Spritesheet customization
const tileSize = 20;
const sheetTiles = 8;
const sheetDisplaySize = tileSize * sheetTiles;
const spriteMapping = {
  '#': { col: 1, row: 1 },
  '*': { col: 6, row: 1 },
  '~': { col: 7, row: 2 },
  '.': { col: 2, row: 1 },
  '$': { col: 1, row: 3 },
  'H': { col: 4, row: 2 },
  'W': { col: 4, row: 3 },
  'B': { col: 2, row: 6 },
  'F': { col: 3, row: 7 },
  '@': { col: 4, row: 5 },
  't': { col: 1, row: 4 },
  'D': { col: 1, row: 2 },
  'd': { col: 2, row: 2 }
};
let spriteSheet = new Image();
let spriteSheetLoaded = false;
spriteSheet.src = 'NGspritesProd.png';
spriteSheet.onload = () => { 
  spriteSheetLoaded = true; 
  if (currentGrid.length) {
    renderGrid(currentGrid);
    renderPlayers(currentPlayers);
    renderMonsters(currentMonsters);
  }
};
document.getElementById('sprite-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) { spriteSheetLoaded = false; spriteSheet.src = URL.createObjectURL(file); }
});

function renderGrid(grid) {
  const container = document.getElementById('grid');
  container.innerHTML = '';
  // grid is the 11×11 viewport from server
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const val = grid[y][x];
      const cell = document.createElement('div');
      cell.classList.add('cell');
      const map = spriteMapping[val];
      if (spriteSheetLoaded && map) {
        cell.style.backgroundImage = `url(${spriteSheet.src})`;
        cell.style.backgroundSize = `${sheetTiles * 100}% ${sheetTiles * 100}%`;
        cell.style.backgroundPosition = `${-(map.col - 1) * 100}% ${-(map.row - 1) * 100}%`;
        cell.innerText = '';
      } else if (val === '#') { cell.classList.add('blocked-cell'); cell.innerText = '#'; }
      else if (val === '*') { cell.classList.add('blocked-cell'); cell.innerText = '*'; }
      else if (val === '.') { cell.classList.add('unblocked-cell'); cell.innerText = '.'; }
      else if (val === '$') { cell.classList.add('gold-cell'); cell.innerText = '$'; }
      else if (['H','B','W','F'].includes(val)) { cell.classList.add('powerup-cell'); cell.innerText = val; }
      else if (val === '~') { cell.classList.add('lava-cell'); cell.innerText = '~'; }
      container.appendChild(cell);
    }
  }
}

function renderPlayers(players) {
  const cells = document.getElementById('grid').children;
  const cx = currentPlayer.x, cy = currentPlayer.y;
  const centerIdx = viewRadius * displaySize + viewRadius;
  for (const id in players) {
    const p = players[id];
    let idx;
    if (id == currentPlayerId) {
      idx = centerIdx;
    } else {
      const dx = p.x - cx + viewRadius;
      const dy = p.y - cy + viewRadius;
      if (dx < 0 || dx > viewRadius*2 || dy < 0 || dy > viewRadius*2) continue;
      idx = dy * displaySize + dx;
    }
    const cell = cells[idx];
    const map = spriteMapping['@'];
    if (spriteSheetLoaded && map) {
      cell.style.backgroundImage = `url(${spriteSheet.src})`;
      cell.style.backgroundSize = `${sheetTiles * 100}% ${sheetTiles * 100}%`;
      cell.style.backgroundPosition = `${-(map.col - 1) * 100}% ${-(map.row - 1) * 100}%`;
      cell.innerText = '';
    } else {
      cell.style.backgroundImage = '';
      cell.innerText = '@';
      cell.style.backgroundColor = p.color;
      cell.style.color = 'black';
    }
  }
}

function renderMonsters(monsters) {
  const cells = document.getElementById('grid').children;
  const cx = currentPlayer.x, cy = currentPlayer.y;
  for (const m of monsters) {
    const dx = m.x - cx + viewRadius;
    const dy = m.y - cy + viewRadius;
    if (dx < 0 || dx > viewRadius*2 || dy < 0 || dy > viewRadius*2) continue;
    const idx = dy * displaySize + dx;
    const cell = cells[idx];
    const map = spriteMapping['t'];
    if (spriteSheetLoaded && map) {
      cell.style.backgroundImage = `url(${spriteSheet.src})`;
      cell.style.backgroundSize = `${sheetTiles * 100}% ${sheetTiles * 100}%`;
      cell.style.backgroundPosition = `${-(map.col - 1) * 100}% ${-(map.row - 1) * 100}%`;
      cell.innerText = '';
    } else {
      cell.style.backgroundImage = '';
      cell.innerText = 't';
      cell.style.color = 'black';
    }
  }
}

function renderStats(players) {
  const stats = document.getElementById('stats');
  stats.innerHTML = 'Stats:';
  if (currentPlayer) {
    const coordEl = document.createElement('div');
    coordEl.innerText = `Position: (${currentPlayer.x}, ${currentPlayer.y})`;
    stats.appendChild(coordEl);
  }
  for (const id in players) {
    const p = players[id];
    const el = document.createElement('div');
    el.innerText = `${p.color}: ${p.faith}f ${p.health}h ${p.buster}b ${p.wall}w ${p.filler}f`;
    stats.appendChild(el);
  }
  // Game Info: count of empty tiles
  if (currentGrid && currentGrid.length) {
    const emptyCount = currentGrid.reduce((sum, row) => sum + row.filter(c => c === '.').length, 0);
    const infoEl = document.createElement('div');
    infoEl.innerText = `Game Info: ${emptyCount} empty tiles`;
    stats.appendChild(infoEl);
  }
}

// Chat renderer
function renderChat() {
  const chatWindow = document.getElementById('chat-window');
  chatWindow.innerHTML = '';
  // only show last 6 messages
  const recent = chatMessages.slice(-6);
  recent.forEach(entry => {
    const date = new Date(entry.timestamp);
    const hh = date.getHours().toString().padStart(2,'0');
    const mm = date.getMinutes().toString().padStart(2,'0');
    const ss = date.getSeconds().toString().padStart(2,'0');
    const line = document.createElement('div');
    line.innerText = `[${hh}:${mm}:${ss}] ${entry.name}: ${entry.text}`;
    chatWindow.appendChild(line);
  });
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Show rate limit flash message
function flashRateLimit() {
  const el = document.getElementById('rate-limit-flash');
  if (!el) return;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 1000);
}

function showVerseMessage(text) {
  const verseEl = document.createElement('div');
  verseEl.id = 'verse-message';
  verseEl.innerText = text;
  document.body.appendChild(verseEl);
  verseEl.addEventListener('animationend', () => verseEl.remove());
}

// Rising faith bubble
function playBleep() {
  if (!soundEnabled) return;
  // resume context if suspended by browser
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  // rising tone from 200Hz to 400Hz over 0.3s
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.linearRampToValueAtTime(400, now + 0.3);
  gain.gain.setValueAtTime(0.2, now);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  osc.stop(now + 0.3);
}

function showFaithBubble() {
  playBleep();
  const cells = document.getElementById('grid').children;
  const idx = viewRadius * displaySize + viewRadius;
  const cell = cells[idx];
  const rect = cell.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.className = 'faith-bubble';
  bubble.innerText = '+1 Faith';
  bubble.style.position = 'absolute';
  bubble.style.left = `${rect.left + rect.width/2}px`;
  bubble.style.transform = 'translate(-50%, 0)';
  document.body.appendChild(bubble);
  const bh = bubble.offsetHeight;
  bubble.style.top = `${rect.top - bh - 5}px`;
  bubble.addEventListener('animationend', () => bubble.remove());
}
