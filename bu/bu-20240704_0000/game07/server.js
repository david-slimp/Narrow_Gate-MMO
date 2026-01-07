const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = process.env.PORT || 26472;

let players = {};
const gridSize = 12;
const playerColors = ['Red', 'Green', 'Blue', 'Yellow', 'Purple'];

function generateGrid() {
    let grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill('.'));

    // Block the edges
    for (let i = 0; i < gridSize; i++) {
        grid[i][0] = grid[i][gridSize - 1] = '#';
        grid[0][i] = grid[gridSize - 1][i] = '#';
    }

    // Randomly place additional blocked cells
    for (let i = 0; i < 25; i++) {
        let x, y;
        do {
            x = Math.floor(Math.random() * gridSize);
            y = Math.floor(Math.random() * gridSize);
        } while (grid[y][x] !== '.'); // only allow open cells
        grid[y][x] = '*';
    }

    // Randomly place treasure cells
    for (let i = 0; i < 5; i++) {
        let x, y;
        do {
            x = Math.floor(Math.random() * gridSize);
            y = Math.floor(Math.random() * gridSize);
        } while (grid[y][x] !== '.'); // Avoid already filled cells
        grid[y][x] = '$';
    }

        // Randomly place lava cells
        for (let i = 0; i < 9; i++) {
            let x, y;
            do {
                x = Math.floor(Math.random() * gridSize);
                y = Math.floor(Math.random() * gridSize);
            } while (grid[y][x] !== '.'); // Avoid already filled cells
            grid[y][x] = '~';
        }
    
    return grid;
}

let grid = generateGrid();

wss.on('connection', (ws, req) => {
    console.log("New connection established.");
    let playerId = Date.now();
    let startX, startY;
    let playerColor
    
    // Extract the IP address from the request object
    const ip = req.socket.remoteAddress;

    // Get available colors
    let takenColors = Object.values(players).map(player => player.color);
    let availableColors = playerColors.filter(color => !takenColors.includes(color));

    // Assign a random available color
    if (ip === '::ffff:166.196.24.129') {
        playerColor = 'Purple';
    } else if (ip === '::ffff:70.115.140.92') {
        playerColor = 'Blue';
    } else {
        playerColor = availableColors[Math.floor(Math.random() * availableColors.length)];
    }

    // Ensure the player starts at an unblocked cell
    do {
        startX = Math.floor(Math.random() * gridSize);
        startY = Math.floor(Math.random() * gridSize);
    } while (grid[startY][startX] !== '.'); // only select open cells

    console.log(`Assigning player ${playerId} to (${startX}, ${startY}) as ${playerColor} from IP ${ip}`);
    players[playerId] = { id: playerId, x: startX, y: startY, oldX: startX, oldY: startY, gold: 0, health: 0, buster: 0, wall: 0, filler: 0, color: playerColor };
    ws.send(JSON.stringify({ type: 'assign', player: players[playerId] }));
    ws.send(JSON.stringify({ type: 'update', players: players, grid: grid }));

    ws.on('message', (message) => {
        let data = JSON.parse(message);
        // console.log(`Received message: ${message} // ${data.type}`);
        if (data.type === 'move') {
            handleMove(playerId, data.direction);
            broadcast({ type: 'players', players: players, grid: grid });
        } else if (data.type === 'drop') {
            handleDrop(playerId);
            broadcast({ type: 'players', players: players, grid: grid });
        }

    });

    ws.on('close', () => {
        console.log(`Player ${playerId} has been deleted.`);
        delete players[playerId];
        broadcast({ type: 'players', players: players, grid: grid });
    });
});

function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function handleMove(playerId, direction) {
    let player = players[playerId];
    player.oldX = player.x;
    player.oldY = player.y;

    if (direction === 'up' && player.y > 0) player.y -= 1;
    if (direction === 'down' && player.y < gridSize - 1) player.y += 1;
    if (direction === 'left' && player.x > 0) player.x -= 1;
    if (direction === 'right' && player.x < gridSize - 1) player.x += 1;

    // Check if the new position is unblocked
    if (grid[player.y][player.x] === '.') {
        // Update position
        player.x = player.x;
        player.y = player.y;
    } else if (grid[player.y][player.x] === '*' && player.buster > 0) {
        // Update position and remove wall and reduce buster
        player.x = player.x;
        player.y = player.y;
        grid[player.y][player.x] = '.';
        player.buster -= 1;
        broadcast({ type: 'statsUpdate', players: players });
    } else if (grid[player.y][player.x] === '~' && player.filler > 0) {
        // Update position and remove lava and reduce filler
        player.x = player.x;
        player.y = player.y;
        grid[player.y][player.x] = '.';
        player.filler -= 1;
        broadcast({ type: 'statsUpdate', players: players });
    } else if (grid[player.y][player.x] === '$') {
        // Update position and remove treasure
        player.x = player.x;
        player.y = player.y;
        grid[player.y][player.x] = '.';
        player.gold += 1;
        broadcast({ type: 'statsUpdate', players: players });
    } else if (grid[player.y][player.x] === 'H') {
        // Update position and remove Health powerup
        player.x = player.x;
        player.y = player.y;
        grid[player.y][player.x] = '.';
        player.health += 1;
        broadcast({ type: 'statsUpdate', players: players });
    } else if (grid[player.y][player.x] === 'B') {
        // Update position and remove Buster powerup
        player.x = player.x;
        player.y = player.y;
        grid[player.y][player.x] = '.';
        player.buster += 1;
        broadcast({ type: 'statsUpdate', players: players });
    } else if (grid[player.y][player.x] === 'W') {
        // Update position and remove Wall powerup
        player.x = player.x;
        player.y = player.y;
        grid[player.y][player.x] = '.';
        player.wall += 1;
        broadcast({ type: 'statsUpdate', players: players });
    } else if (grid[player.y][player.x] === 'F') {
        // Update position and remove Filler powerup
        player.x = player.x;
        player.y = player.y;
        grid[player.y][player.x] = '.';
        player.filler += 1;
        broadcast({ type: 'statsUpdate', players: players });
    } else if (grid[player.y][player.x] === '~') {
        // Update position and reduce health
        player.x = player.x;
        player.y = player.y;
        grid[player.y][player.x] = '~';
        player.health -= 1;
        if (player.health < 0) {
            player.gold = 0;
            player.health = 0;
        }
        broadcast({ type: 'statsUpdate', players: players });
    } else {
        // Revert to old position if new position is blocked
        player.x = player.oldX;
        player.y = player.oldY;
    }
}

function handleDrop(playerId) {
    let player = players[playerId];
    player.oldX = player.x;
    player.oldY = player.y;
    grid[player.y][player.x] = '*';
    player.wall -= 1;
    broadcast({ type: 'update', players: players, grid: grid });
}

setInterval(placeRandomSomething, 3000); // Place something every 5 seconds

function weightedRandom(items, weights) {
    let totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
        if (random < weights[i]) {
            return items[i];
        }
        random -= weights[i];
    }
}

function placeRandomSomething() {
    if (Object.keys(players).length > 0) { // Check if there is at least one player connected

    let x, y;
    const items =   ['*', '~', '$', 'H', 'F', 'W',  'B'];
    const weights = [0.1, 0.1, 0.6, 0.15, 0.1, 0.05, 0.08]; // Weights for $, H, F, W, B

    let item = weightedRandom(items, weights);

    x = Math.floor(Math.random() * gridSize);
    y = Math.floor(Math.random() * gridSize);
    if (grid[y][x] === '.') { // Only place on open cells
        grid[y][x] = item;
        broadcast({ type: 'update', players: players, grid: grid });
        console.log(`Placed ${item} at (${x}, ${y})`);
    }
}
}

server.listen(port, () => {
        console.log(`Server is running on port ${port}`);
});

// Serve HTML content for the game
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>DDC</title>
    <style>
        body {
            background-color: black;
            color: white;
        }
        .blocked-cell {
            background-color: black;
            color: white;
        }
        .unblocked-cell {
            background-color: black;
            color: white;
        }
        .gold-cell {
            background-color: black;
            color: #ffcc00; /* Gold color */
        }
        .powerup-cell {
            background-color: black;
            color: #00cc00; /* Green color */
        }
        .lava-cell {
            background-color: #660000; /* Dark red color */
            color: #ff0000; /* Red color */
        }

        #game-container {
            display: flex;
        }
        #grid {
            display: grid;
            grid-template-columns: repeat(12, 20px);
            grid-gap: 0px;
        }
        .cell {
            border: 0px solid #fcc;
            width: 20px;
            height: 20px;
            text-align: center;
            line-height: 20px;
        }
        #stats {
            margin-left: 20px;
        }
        #controls {
            margin-top: 20px;
        }
        button {
            margin: 5px;
            padding: 10px;
        }
    </style>
</head>
<body>
    <h1>DDC</h1>
    <div id="game-container">
        <div>
            <div id="grid"></div>
            <div id="controls">
                <button onclick="move('up')">Up</button><br>
                <button onclick="move('left')">Left</button>
                <button onclick="move('right')">Right</button><br>
                <button onclick="move('down')">Down</button>
                <button onclick="drop('wall')">Wall</button>
                
            </div>
        </div>
        <div id="stats"></div>
    </div>
    
    <script>
        const ws = new WebSocket('ws://' + window.location.host);
        ws.onopen = () => {
            console.log('WebSocket connection established');
        };

        ws.onmessage = (event) => {
            console.log('Message from server:', event.data);
            let data = JSON.parse(event.data);
            if (data.type === 'assign') {
                console.log('Assigned player:', data.player);
            } else if (data.type === 'players') {
                console.log('Players:', data.players);
                renderPlayers(data.players);
            } else if (data.type === 'update') {
                console.log('Grid:', data.grid);
                renderGrid(data.grid);
                renderPlayers(data.players);
            } else if (data.type === 'statsUpdate') {
                renderStats(data.players);
            }
        };

        document.addEventListener('keydown', (event) => {
            const keyName = event.key;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(keyName)) {
                ws.send(JSON.stringify({ type: 'move', direction: keyName.slice(5).toLowerCase() }));
            } else if (keyName === ' ' || keyName === 'Spacebar') {
                ws.send(JSON.stringify({ type: 'drop' }));
            }
        });

        function move(direction) {
            ws.send(JSON.stringify({ type: 'move', direction: direction }));
        }

        function renderGrid(grid) {
            const gridContainer = document.getElementById('grid');
            gridContainer.innerHTML = ''; // Clear the grid first
            
            for (let y = 0; y < 12; y++) {
                for (let x = 0; x < 12; x++) {
                    let cell = document.createElement('div');
                    cell.classList.add('cell');
                    if (grid[y][x] === '#') {
                        cell.classList.add('blocked-cell');
                        cell.innerText = '#';
                    } else if (grid[y][x] === '*') {
                        cell.classList.add('blocked-cell');
                        cell.innerText = '*';
                    } else if (grid[y][x] === '.') {
                        cell.classList.add('unblocked-cell');
                        cell.innerText = '.';
                    } else if (grid[y][x] === '$') {
                        cell.classList.add('gold-cell');
                        cell.innerText = '$';
                    } else if (grid[y][x] === 'H') {
                        cell.classList.add('powerup-cell');
                        cell.innerText = 'H';
                    } else if (grid[y][x] === 'B') {
                        cell.classList.add('powerup-cell');
                        cell.innerText = 'B';
                    } else if (grid[y][x] === 'W') {
                        cell.classList.add('powerup-cell');
                        cell.innerText = 'W';
                    } else if (grid[y][x] === 'F') {
                        cell.classList.add('powerup-cell');
                        cell.innerText = 'F';
                    } else if (grid[y][x] === '~') {
                        cell.classList.add('lava-cell');
                        cell.innerText = '~';
                    }
                    gridContainer.appendChild(cell);
                }
            }
        }

        function renderPlayers(players) {
            const grid = document.getElementById('grid');
            
            // Clear all player markers
            for (let i = 0; i < grid.children.length; i++) {
                let cell = grid.children[i];
                if (cell.innerText === '@') {
                    cell.innerText = '.';
                    cell.style.backgroundColor = 'black'; // Reset to default or specific grid background color
                    cell.style.color = 'white'; // Reset to default text color if needed
                }
            }
            
            // Position players on the grid
            for (let id in players) {
                let player = players[id];
                let cellIndex = player.y * 12 + player.x; // Calculate the cell index based on x/y coordinates
                let playerCell = grid.children[cellIndex];
                playerCell.innerText = '@'; // Represent the player with an '@'
                
                // Directly use player.color for background color
                playerCell.style.backgroundColor = player.color;
                playerCell.style.color = 'black'; // Ensure player '@' is visible
            }
        }

        function renderStats(players) {
            const statsContainer = document.getElementById('stats');
            statsContainer.innerHTML = 'Stats:';
            
            for (let id in players) {
                let player = players[id];
                let playerStatsElement = document.createElement('div');
                playerStatsElement.innerText = \`\${player.color}: \${player.gold}g  \${player.health}h  \${player.buster}b  \${player.wall}w  \${player.filler}f \`;
                statsContainer.appendChild(playerStatsElement);
            }
        }
    </script>
</body>
</html>`;

app.get('/', (req, res) => {
    res.send(htmlContent);
});
