// Client-side JavaScript
document.addEventListener('DOMContentLoaded', () => {
    const gameDiv = document.getElementById('game');
    gameDiv.innerHTML = '<p>The DDC will start here...</p>';

    // WebSocket connection
    const ws = new WebSocket('ws://' + window.location.host);
    
    ws.onopen = () => {
        console.log('WebSocket connection established');
    };
    
    ws.onmessage = (event) => {
        console.log('Message from server: ', event.data);
        let data = JSON.parse(event.data);
        if (data.type === 'assign') {
            player = data.player;
            document.getElementById('stats').innerHTML = `
                Player: ${player.character} (${player.id})<br>
                Health: ${player.health}<br>
                Gold: ${player.gold}<br>
                Food: ${player.food}
            `;
        }
        if (data.type === 'map') {
            map = data.map;
            renderMap();
        }
        if (data.type === 'players') {
            players = data.players;
            renderMap();
        }
        if (data.type === 'characterConfirmed') {
            // Step 4: Update Client-side Game Initialization
            // Initialize the game for the player
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket connection closed');
    };
    
    
    let player = null;
    let map = [];
    let players = {};
    
    function renderMap() {
        let mapDiv = document.getElementById('map');
        mapDiv.innerHTML = '';
        for (let y = 0; y < map.length; y++) {
            for (let x = 0; x < map[y].length; x++) {
                let char = map[y][x];
                for (let id in players) {
                    if (players[id].x === x && players[id].y === y) {
                        char = players[id].character[0];
                    }
                }
                mapDiv.innerHTML += char;
            }
            mapDiv.innerHTML += '<br>';
        }
    }
    
    document.addEventListener('keydown', (event) => {
        if (player) {
            let direction = null;
            if (event.key === 'ArrowUp') direction = 'up';
            if (event.key === 'ArrowDown') direction = 'down';
            if (event.key === 'ArrowLeft') direction = 'left';
            if (event.key === 'ArrowRight') direction = 'right';
            if (direction) {
                ws.send(JSON.stringify({ type: 'move', playerId: player.id, direction: direction }));
            }
        }
    });
    
    // Step 1: Add Character Selection UI
    function createCharacterSelection() {
        const selectionDiv = document.createElement('div');
        selectionDiv.id = 'characterSelection';
        const characters = ['A', 'B', 'C', 'D']; // Example characters
        characters.forEach((character) => {
            const button = document.createElement('button');
            button.innerText = `Character ${character}`;
            button.addEventListener('click', () => selectCharacter(character));
            selectionDiv.appendChild(button);
        });
        document.body.appendChild(selectionDiv);
    }
    
    // Function to handle character selection
    function selectCharacter(character) {
        // Assuming ws is the WebSocket connection
        ws.send(JSON.stringify({ type: 'selectCharacter', character: character }));
        document.getElementById('characterSelection').style.display = 'none';
        // Optionally, initialize or show the game map here if it's dependent on character selection
    }
    
    // WebSocket message handler to process server responses
    ws.onmessage = function(event) {
        const message = JSON.parse(event.data);
        if (message.type === 'characterConfirmed') {
            // Character selection confirmed by the server
            // Proceed with game initialization or show the game map
        }
    };
    
    // Call createCharacterSelection when the page loads
    document.addEventListener('DOMContentLoaded', createCharacterSelection);
    
    // Existing game logic...
    // Make sure to modify the game initialization process to wait for character selection
});

