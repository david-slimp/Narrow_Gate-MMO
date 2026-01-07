const ws = new WebSocket('ws://' + window.location.host);
ws.onopen = () => console.log('WebSocket connection established');
ws.onmessage = event => {
  const data = JSON.parse(event.data);
  // server-sent sound effect
  if (data.type === 'sound') {
    playSound(data.sound);
    return;
  }
  if (data.type === 'assign') {
    console.log('Assigned player:', data.player);
    currentPlayer = data.player;
    currentPlayerId = data.player.id;
    startBackground(currentPlayer.area);
  } else if (data.type === 'players' || data.type === 'update') {
    const newArea = data.players[currentPlayerId]?.area;
    if (newArea && newArea !== currentPlayer.area) {
      currentPlayer.area = newArea;
      startBackground(newArea);
    }
    // detect power-up pickup at player center
    const oldCenter = currentGrid.length ? currentGrid[viewRadius][viewRadius] : null;
    currentGrid = data.grid;
    // console.log("Received grid data:", JSON.stringify(data.grid)); // Log the raw grid
    if (['H','W','B','F'].includes(oldCenter) && currentGrid[viewRadius][viewRadius] === '.') {
      playSound('powerup');
    }
    currentPlayers = data.players;
    currentMonsters = data.monsters || [];
    if (currentPlayerId && currentPlayers[currentPlayerId]) {
      currentPlayer = currentPlayers[currentPlayerId];
    }
    // Defer rendering until checkAndPerformInitialRender or subsequent updates
    if (isInitialLoadComplete) {
      renderGrid(data.grid);
      renderPlayers(data.players);
      renderMonsters(currentMonsters);
      renderStats(data.players); // Update stats on regular updates too
    }
    checkAndPerformInitialRender(); // Check if initial render can happen now
  } else if (data.type === 'statsUpdate') {
    // detect stat changes
    const newStats = data.players[currentPlayerId] || {};
    const oldStats = currentPlayer || {};
    if (soundEnabled) {
      if (newStats.health > oldStats.health) playSound('powerup');
      if (newStats.buster > oldStats.buster) playSound('powerup');
      if (newStats.wall > oldStats.wall) playSound('powerup');
      if (newStats.filler > oldStats.filler) playSound('powerup');
      // detect filler use (filler decreases without health/faith loss)
      if (newStats.filler < oldStats.filler && newStats.health === oldStats.health && newStats.faith === oldStats.faith) {
        playSound('filler');
      }
      // detect lava damage (health/faith loss)
      else if (newStats.health < oldStats.health || newStats.faith < oldStats.faith) {
        playSound('lava');
      }
    }
    // detect faith gain (bubble only)
    if (newStats.faith > oldStats.faith) showFaithBubble();
    currentPlayers = data.players;
    currentPlayer = newStats;
    // Render stats only if initial load is done
    if (isInitialLoadComplete) {
       renderStats(data.players);
    }
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
    currentEmptyCount = data.count;
    renderStats(currentPlayers);
  } else if (data.type === 'verse') {
    showVerseMessage(data.text);
  } else if (data.type === 'spriteMappingUpdate') {
    // Receive and store the sprite mapping from the server
    console.log('Received sprite mapping from server:', data.mapping);
    spriteMapping = data.mapping;
    // Check if initial render can happen now
    checkAndPerformInitialRender();
  }
};

// Helper function to perform the first render when all data is ready
function checkAndPerformInitialRender() {
  if (!isInitialLoadComplete && currentGrid.length > 0 && Object.keys(spriteMapping).length > 0) {
    console.log("Initial data ready. Performing first render...");
    renderGrid(currentGrid);
    renderPlayers(currentPlayers);
    renderMonsters(currentMonsters);
    renderStats(currentPlayers); // Render stats initially too
    isInitialLoadComplete = true;
  }
}

// Handle page unload to notify the server
window.addEventListener('beforeunload', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('Sending quit message before unload...');
    ws.send(JSON.stringify({ type: 'quit' }));
    // Note: Closing the ws here might prevent the message from sending reliably.
    // The browser typically handles socket closure on unload.
    // ws.close(); 
  }
});

// Unified key handler for movement, chat, and UI
document.addEventListener('keydown', event => {
  const chatInput = document.getElementById('chat-input');
  console.log(`Keydown: ${event.key}`);

  // Ensure chatInput exists before trying to access it
  if (chatInput && !chatInput.hidden) {
    // Chat mode
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
    return; // Don't process game keys if in chat mode
  }

  // Normal mode (game controls)
  switch (event.key) {
    case 'h': case 'H':
      event.preventDefault();
      const helpOverlay = document.getElementById('help-overlay');
      if (helpOverlay) {
        helpOverlay.hidden = !helpOverlay.hidden;
      }
      break;
    case 'm': case 'M':
      event.preventDefault();
      toggleSound();
      break;
    case 'c': case 'C': // Cycle sprite
      event.preventDefault();
      ws.send(JSON.stringify({ type: 'changeSprite' }));
      console.log('Sent changeSprite request');
      break;
    case 'Tab':
      event.preventDefault();
      // Ensure chatInput exists before trying to focus it
      if (chatInput) {
        chatInput.hidden = false;
        chatInput.focus();
      } else {
        console.error('Chat input not found for Tab key');
      }
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
    default:
      // Optional: handle other keys or do nothing
      break;
  }
});
function move(direction) {
  startAudioIfNeeded();
  ws.send(JSON.stringify({ type: 'move', direction }));
}

function drop() {
  startAudioIfNeeded();
  ws.send(JSON.stringify({ type: 'drop' }));
}

// startAudio on first user gesture
function startAudioIfNeeded() {
  if (!audioCtx) return; // Add null check
  if (!soundEnabled || !currentPlayer) return;
  startBackground(currentPlayer.area);
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
let currentEmptyCount = null;
let isInitialLoadComplete = false; // Flag for initial data load

// Sound toggle setup
let soundEnabled = true;
const soundToggleBtn = document.getElementById('sound-toggle');
if (soundToggleBtn) {
  // Use mousedown to prevent multiple event triggers
  soundToggleBtn.addEventListener('mousedown', (event) => {
    // Prevent default and stop propagation
    event.preventDefault();
    event.stopImmediatePropagation();
    
    console.log('Sound toggle mousedown event');
    toggleSound(event);
  }, { capture: true });

  // Prevent any additional click events
  soundToggleBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
} else {
  console.error('Sound toggle button not found! Check index.html');
}
const audioFiles = {
  bgMusic: null,
  powerup: new Audio('/sounds/powerup.mp3'),
  lava: new Audio('/sounds/lava.mp3'),
  filler: new Audio('/sounds/filler.mp3'),
  wall: new Audio('/sounds/wall.mp3'),
  buster: new Audio('/sounds/buster.mp3'),
};
const bgVolume = 0.2;
// Volume for sound effects
const fxVolume = 0.7;

// compute background track index (1-3) from areaId
function getBgIndex(areaId) {
  const n = parseInt(areaId, 10) || 0;
  return (n % 3) + 1;
}

// Tracks the last area for background music to prevent unnecessary restarts
let lastBackgroundArea = null;

// Tracks the paused state of background music
let pausedBgMusicTime = 0;

// start appropriate background music for area
function startBackground(areaId) {
  // Prevent restarting music for the same area
  if (lastBackgroundArea === areaId) {
    console.log(`Skipping music restart for same area: ${areaId}`);
    return;
  }

  // Immediately exit if sound is disabled or no current player
  if (!soundEnabled || !currentPlayer) {
    console.log('startBackground: Sound is disabled or no current player, skipping');
    if (audioFiles.bgMusic) {
      audioFiles.bgMusic.pause();
      audioFiles.bgMusic.volume = 0;
    }
    return;
  }

  const idx = getBgIndex(areaId);
  const src = `/sounds/backgroundMusic${idx}.mp3`;
  
  console.log(`Preparing background music: areaId=${areaId}, soundEnabled=${soundEnabled}`);
  
  // If music was paused, try to resume from last position
  if (audioFiles.bgMusic && pausedBgMusicTime > 0) {
    try {
      audioCtx.resume();
      audioFiles.bgMusic.currentTime = pausedBgMusicTime;
      audioFiles.bgMusic.volume = bgVolume;
      audioFiles.bgMusic.play().then(() => {
        console.log('Resumed background music successfully');
        lastBackgroundArea = areaId;
        pausedBgMusicTime = 0;
      }).catch(e => {
        console.error('Background music resume failed:', e);
        audioFiles.bgMusic.volume = 0;
      });
      return;
    } catch (error) {
      console.error('Error resuming background music:', error);
    }
  }
  
  // Stop any existing music
  if (audioFiles.bgMusic) {
    audioFiles.bgMusic.pause();
    audioFiles.bgMusic.currentTime = 0;
  }
  
  // Create new audio file
  audioFiles.bgMusic = new Audio(src);
  audioFiles.bgMusic.loop = true;
  
  // Only play and set volume if sound is enabled
  if (soundEnabled) {
    audioFiles.bgMusic.volume = bgVolume;
    try {
      audioCtx.resume();
      audioFiles.bgMusic.currentTime = 0;
      audioFiles.bgMusic.play().then(() => {
        console.log('Background music started successfully');
        lastBackgroundArea = areaId;
      }).catch(e => {
        console.error('Background music play failed:', e);
        audioFiles.bgMusic.volume = 0;
      });
    } catch (error) {
      console.error('Error in startBackground:', error);
      audioFiles.bgMusic.volume = 0;
    }
  } else {
    // If sound is disabled, immediately set volume to 0
    audioFiles.bgMusic.volume = 0;
    audioFiles.bgMusic.pause();
  }
}

// Toggle sound on/off with comprehensive audio management
function toggleSound(event) {
  try {
    // Prevent any default button or key behavior
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
      event.stopPropagation();
    }

    // Log detailed toggle information
    console.log(`Toggling sound. Current state before toggle: ${soundEnabled}`);

    // Toggle sound state
    const previousSoundState = soundEnabled;
    soundEnabled = !soundEnabled;
    
    // Update button text
    //if (soundToggleBtn) {
    //  soundToggleBtn.innerText = soundEnabled ? '🔊' : '🔇';
    //}

  // Update button icon
  const soundToggleBtn = document.getElementById('sound-toggle');
  const soundIcon = soundToggleBtn.querySelector('.sound-icon');
  if (soundIcon) {
    soundIcon.src = soundEnabled ? 'gfx/speaker_on.svg' : 'gfx/speaker_off.svg';
    soundIcon.alt = soundEnabled ? 'Sound on' : 'Sound off';
  }
    
    console.log(`Sound toggle: ${soundEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Comprehensively stop all sounds
    Object.keys(audioFiles).forEach(key => {
      const audio = audioFiles[key];
      if (audio && typeof audio.pause === 'function') {
        console.log(`Stopping audio: ${key}`);
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0;
      }
    });
    
    // Pause or stop background music
    if (audioFiles.bgMusic) {
      // Store current time if music is playing
      if (!audioFiles.bgMusic.paused) {
        pausedBgMusicTime = audioFiles.bgMusic.currentTime;
        console.log(`Pausing background music at ${pausedBgMusicTime} seconds`);
      }
      
      // Pause the music
      audioFiles.bgMusic.pause();
      audioFiles.bgMusic.volume = 0;
    }

    // If sound is being enabled, resume background music immediately
    if (soundEnabled && currentPlayer) {
      const currentArea = currentPlayer.area;
      console.log(`Resuming background music for area: ${currentArea}`);
      // Clear last area so startBackground handles resume
      lastBackgroundArea = null;
      startBackground(currentArea);
    }

    // Additional logging to verify toggle behavior
    console.log(`Sound state changed from ${previousSoundState} to ${soundEnabled}`);
  } catch (error) {
    console.error('Sound toggle error:', error);
    // Restore previous sound state in case of error
    soundEnabled = !soundEnabled;
  }
}

// single shared AudioContext for all bleeps
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioCtx();

// Spritesheet customization
const tileSize = 20;
const sheetTiles = 8;
const sheetDisplaySize = tileSize * sheetTiles;

let spriteMapping = {}; // Will be populated by server

// Load custom sprite sheet if saved in local storage
let customSpriteUrl = localStorage.getItem('customSpriteUrl');

// Load custom background image if saved in local storage
let customBackgroundUrl = localStorage.getItem('customBackgroundUrl');

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
// Ensure sprite mapping is loaded before rendering
if (Object.keys(spriteMapping).length === 0) {
console.warn('Sprite mapping not yet received from server. Skipping grid render.');
return;
}

const container = document.getElementById('grid');
container.innerHTML = '';
// grid is the 11×11 viewport from server
for (let y = 0; y < grid.length; y++) {
for (let x = 0; x < grid[y].length; x++) {
const val = grid[y][x];
const cell = document.createElement('div');
cell.classList.add('cell');
const map = spriteMapping[val];

// --- DETAILED LOG --- 
// console.log(`Cell (${x},${y}), Char: '${val}', Map: ${JSON.stringify(map)}`);
// ---------

if (spriteSheetLoaded && map) {
cell.style.backgroundImage = `url(${spriteSheet.src})`;
cell.style.backgroundSize = `${sheetTiles * 100}% ${sheetTiles * 100}%`;
// Use map.x and map.y for terrain/items!
const bgX = -(map.x - 1) * 100;
const bgY = -(map.y - 1) * 100;
cell.style.backgroundPosition = `${bgX}% ${bgY}%`;
cell.innerText = ''; // Clear any fallback text

// --- DETAILED LOG ---
// console.log(`  -> Applied BG Position: ${bgX}% ${bgY}%`);
// ---------

} else {
// Fallback rendering if sprite sheet not loaded or char not in mapping
cell.style.backgroundImage = ''; // Ensure no previous BG
if (val === '.') {
    cell.style.backgroundColor = '#333'; // Simple floor
} else if (val === '#') {
    cell.style.backgroundColor = '#777'; // Simple wall
} else {
    cell.innerText = val; // Show character for unknown/unmapped tiles
    cell.style.color = 'white'; // Make text visible
}
// --- DETAILED LOG ---
// console.log(`  -> Fallback rendering applied.`);
// ---------
}
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
    if (!cell) continue; // Skip if cell index is invalid

    // --- Draw player sprite using server coords ---
    // Use player's specific spriteCoords if available, otherwise default
    const spriteCoords = p.spriteCoords || spriteMapping['@'];
    if (spriteSheetLoaded && spriteCoords) {
      cell.style.backgroundImage = `url(${spriteSheet.src})`;
      cell.style.backgroundSize = `${sheetTiles * 100}% ${sheetTiles * 100}%`;
      cell.style.backgroundPosition = `${-(spriteCoords.col - 1) * 100}% ${-(spriteCoords.row - 1) * 100}%`;
      cell.innerText = '';
    } else {
      // Fallback if spritesheet not loaded or no coords
      cell.style.backgroundImage = '';
      cell.innerText = '@';
      cell.style.backgroundColor = p.color;
      cell.style.color = 'black';
    }
    // --- End Draw player sprite ---

    // --- Add Name Label ---
    // Remove existing label first (safer in case renderMap didn't catch it)
    const oldLabel = cell.querySelector('.player-name-label');
    if (oldLabel) {
      cell.removeChild(oldLabel);
    }

    const nameLabel = document.createElement('div');
    nameLabel.classList.add('player-name-label');
    // Use player's name (if set and not empty), truncate to 9 chars, otherwise use color
    const displayName = (p.name && p.name.trim()) ? p.name.substring(0, 9) : p.color;
    nameLabel.innerText = displayName;
    cell.appendChild(nameLabel);
    // --- End Name Label ---
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
    const char = m.ascii || m.type.charAt(0).toLowerCase();
    // prefer server spriteCoords, fallback to static mapping
    const map = m.spriteCoords || spriteMapping[char];
    if (spriteSheetLoaded && map) {
      cell.style.backgroundImage = `url(${spriteSheet.src})`;
      cell.style.backgroundSize = `${sheetTiles * 100}% ${sheetTiles * 100}%`;
      cell.style.backgroundPosition = `${-(map.col - 1) * 100}% ${-(map.row - 1) * 100}%`;
      cell.innerText = '';
    } else {
      cell.style.backgroundImage = '';
      cell.innerText = char;
      cell.style.color = 'black';
    }
  }
}

function renderStats(players) {
  const stats = document.getElementById('stats');
  stats.innerHTML = ''; // Clear previous stats

  if (currentPlayer) {
    // Combine Area/Position and Empty Tiles into one line
    let combinedInfoText = `Area ${currentPlayer.area} Position: (${currentPlayer.x}, ${currentPlayer.y})`;
    if (currentEmptyCount !== null) {
      combinedInfoText += ` | Total empty tiles: ${currentEmptyCount}`;
    }

    // Create and append the combined info element
    const infoEl = document.createElement('div');
    infoEl.id = 'player-location-info'; // Give it an ID if needed for styling
    infoEl.innerText = combinedInfoText;
    stats.appendChild(infoEl);
  }

  // Render stats for each player
  for (const id in players) {
    const p = players[id];
    const el = document.createElement('div');
    el.innerText = `${p.name}: ${p.faith}f ${p.health}h ${p.buster}b ${p.wall}w ${p.filler}f`;
    stats.appendChild(el);
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

// Faith collect sound
function playBleep() {
  if (!audioCtx) return; // Add null check
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

// Faith collect animation
function showFaithBubble() {
  playBleep();
  const cells = document.getElementById('grid').children;
  const idx = viewRadius * displaySize + viewRadius; // Center cell index
  const cell = cells[idx];
  if (!cell) {
    console.error('showFaithBubble: Target cell not found!');
    return;
  }

  // Get the cell's screen position
  const rect = cell.getBoundingClientRect();
  // Create the bubble
  const bubble = document.createElement('div');
  bubble.className = 'faith-bubble';
  bubble.innerText = '+1 Faith';
  // Position the bubble above the cell
  const left = rect.left + rect.width / 2;
  const top = rect.top - 10; // 10px above the cell
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
  bubble.style.transform = 'translate(-50%, 0)';

  document.body.appendChild(bubble);
  // Remove bubble after animation ends
  bubble.addEventListener('animationend', () => bubble.remove());
}

function playSound(type) {
  if (!soundEnabled || !audioFiles[type]) return;
  try {
    const audio = audioFiles[type];
    audio.currentTime = 0;
    audio.volume = fxVolume;
    audio.play().catch(e => {
      if (e.name !== 'AbortError') {
        console.error(`Sound play error for ${type}:`, e);
      }
    });
  } catch (e) {
    console.error(`Sound setup error for ${type}:`, e);
  }
}
