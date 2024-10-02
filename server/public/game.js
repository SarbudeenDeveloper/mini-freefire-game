// public/game.js
const socket = io();

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mapWidth = 1600;  // Increased map size for free movement
const mapHeight = 1200;

// Define shooting cooldown (in milliseconds)
const SHOOT_COOLDOWN = 300;
let lastShootTime = 0;

// Scale for minimap (optional)
const minimapScale = 0.1;

// Player state
let players = {};
let bullets = [];
let myPlayer = null;

// Movement controls
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// Define obstacles array
let obstacles = [];
// Define textures with specified image sizes
const textures = {
    bigHome: new Image(),  // 715px x 338px 
    home: new Image(),     // 360px x 259px 
    pond: new Image(),     // 409px x 406px 
};

// Set source images for textures
textures.bigHome.src = 'bigHome.png';
textures.home.src = 'home.png';
textures.pond.src = 'pond.png';

// Load player avatar image (optional)
const playerImage = new Image();
playerImage.src = 'player.png'; // Create or use a simple circle image

// Load background image (optional)
const backgroundImage = new Image();
backgroundImage.src = 'bg.jpg';

// Receive map data from server
socket.on('mapData', (data) => {
    obstacles = data.obstacles;
});

// Handle incoming data
socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
    myPlayer = players[socket.id];
});

socket.on('newPlayer', (player) => {
    players[player.id] = player;
});

socket.on('playerMoved', (player) => {
    if (players[player.id]) {
        players[player.id].x = player.x;
        players[player.id].y = player.y;
    }
});

socket.on('bulletFired', (bullet) => {
    bullets.push(bullet);
});

socket.on('playerKilled', (data) => {
    const { killer, victim, kills } = data;
    if (players[killer]) {
        players[killer].kills = kills;
    }
});

socket.on('removePlayer', (playerId) => {
    delete players[playerId];
});

socket.on('killed', () => {
    alert('You were killed!');
    // Optionally reset player position or implement respawn
});

// Handle keyboard input
document.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
    }
});

// Handle mouse clicks for shooting
canvas.addEventListener('mousedown', (e) => {
    if (!myPlayer) return;
    const currentTime = Date.now();
    if (currentTime - lastShootTime < SHOOT_COOLDOWN) {
        return; // Still in cooldown
    }
    lastShootTime = currentTime;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left + camera.x;
    const mouseY = e.clientY - rect.top + camera.y;

    // Calculate direction vector
    const dx = mouseX - myPlayer.x;
    const dy = mouseY - myPlayer.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const direction = { x: dx / length, y: dy / length };

    // Send shoot event to server
    socket.emit('shoot', {
        x: myPlayer.x,
        y: myPlayer.y,
        direction: direction
    });
});

// Camera setup
const camera = {
    x: 0,
    y: 0
};

function canMove(newX, newY) {
    // Check map boundaries
    if (newX < 20 || newX > mapWidth - 20 || newY < 20 || newY > mapHeight - 20) {
        return false;
    }

    // Check collision with obstacles
    for (let obstacle of obstacles) {
        if (
            newX + 20 > obstacle.x &&
            newX - 20 < obstacle.x + obstacle.width &&
            newY + 20 > obstacle.y &&
            newY - 20 < obstacle.y + obstacle.height
        ) {
            return false; // Collision detected
        }
    }

    return true; // No collision
}

function isBulletColliding(bullet, obstacle) {
    // Simple circle-rectangle collision detection
    const distX = Math.abs(bullet.x - (obstacle.x + obstacle.width / 2));
    const distY = Math.abs(bullet.y - (obstacle.y + obstacle.height / 2));

    if (distX > (obstacle.width / 2 + 5)) return false;
    if (distY > (obstacle.height / 2 + 5)) return false;

    if (distX <= (obstacle.width / 2)) return true;
    if (distY <= (obstacle.height / 2)) return true;

    const dx = distX - obstacle.width / 2;
    const dy = distY - obstacle.height / 2;
    return (dx * dx + dy * dy <= (5 * 5)); // 5 is the bullet radius
}

// Update loop
function update() {
    if (myPlayer) {
        let moved = false;
        let dx = 0;
        let dy = 0;
        const speed = 5;
        if (keys.ArrowUp) {
            dy -= 1;
        }
        if (keys.ArrowDown) {
            dy += 1;
        }
        if (keys.ArrowLeft) {
            dx -= 1;
        }
        if (keys.ArrowRight) {
            dx += 1;
        }

        // Normalize diagonal movement
        if (dx !== 0 || dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx = (dx / length) * speed;
            dy = (dy / length) * speed;

            const newX = myPlayer.x + dx;
            const newY = myPlayer.y + dy;

            if (canMove(newX, newY)) {
                myPlayer.x = newX;
                myPlayer.y = newY;
                moved = true;
            }
        }

        if (moved) {
            socket.emit('playerMovement', {
                x: myPlayer.x,
                y: myPlayer.y
            });
        }

        // Update camera to follow the player
        camera.x = myPlayer.x - canvas.width / 2;
        camera.y = myPlayer.y - canvas.height / 2;

        // Clamp camera within map bounds
        camera.x = Math.max(0, Math.min(mapWidth - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(mapHeight - canvas.height, camera.y));
    }

    // Update bullets
    bullets.forEach((bullet, index) => {
        const speed = 10;
        bullet.x += bullet.direction.x * speed;
        bullet.y += bullet.direction.y * speed;

        // Remove bullets that are out of bounds
        if (bullet.x < 0 || bullet.x > mapWidth || bullet.y < 0 || bullet.y > mapHeight) {
            bullets.splice(index, 1);
            return;
        }

        // Check for collision with obstacles
        for (let obstacle of obstacles) {
            if (isBulletColliding(bullet, obstacle)) {
                bullets.splice(index, 1); // Remove bullet upon collision
                return;
            }
        }

        // Check for collision with players
        for (let id in players) {
            if (id !== bullet.owner) {
                const player = players[id];
                const dist = Math.hypot(bullet.x - player.x, bullet.y - player.y);
                if (dist < 20) { // Assuming player radius is 20
                    // Notify server about the hit
                    socket.emit('bulletHit', {
                        bulletId: bullet.id,
                        targetId: id
                    });
                    bullets.splice(index, 1);
                    break;
                }
            }
        }
    });

    render();
    requestAnimationFrame(update);
}

// Render function
// In the render function, draw obstacles
function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw tiled background
    if (backgroundImage.complete) {
        const tileWidth = backgroundImage.width;
        const tileHeight = backgroundImage.height;

        // Calculate the starting tile indices based on camera position
        const startX = Math.floor(camera.x / tileWidth);
        const startY = Math.floor(camera.y / tileHeight);

        // Calculate offset for partial tiles
        const offsetX = -(camera.x % tileWidth);
        const offsetY = -(camera.y % tileHeight);

        // Number of tiles needed to cover the canvas
        const tilesX = Math.ceil(canvas.width / tileWidth) + 1;
        const tilesY = Math.ceil(canvas.height / tileHeight) + 1;

        for (let i = 0; i < tilesX; i++) {
            for (let j = 0; j < tilesY; j++) {
                ctx.drawImage(
                    backgroundImage,
                    startX * tileWidth + i * tileWidth + offsetX,
                    startY * tileHeight + j * tileHeight + offsetY,
                    tileWidth,
                    tileHeight
                );
            }
        }
    } else {
        // Fallback background color
        ctx.fillStyle = '#34495e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw obstacles
    ctx.fillStyle = '#7f8c8d'; // Gray color for obstacles
    obstacles.forEach((obstacle) => {
        const screenX = obstacle.x - camera.x;
        const screenY = obstacle.y - camera.y;

        // Ensure the obstacle is within the visible canvas
        if (
            screenX + obstacle.width < 0 ||
            screenX - obstacle.width > canvas.width ||
            screenY + obstacle.height < 0 ||
            screenY - obstacle.height > canvas.height
        ) {
            return; // Skip drawing if not visible
        }

        // Select texture based on obstacle type
        const texture = textures[obstacle.type];

        if (texture && texture.complete) {
            ctx.drawImage(texture, screenX, screenY, obstacle.width, obstacle.height);
        } else {
            // Fallback color if texture not loaded
            switch (obstacle.type) {
                case 'bigHome':
                    ctx.fillStyle = '#d35400'; // Dark orange for big homes
                    break;
                case 'home':
                    ctx.fillStyle = '#f39c12'; // Orange for homes
                    break;
                case 'pond':
                    ctx.fillStyle = '#2980b9'; // Blue for ponds
                    break;
                default:
                    ctx.fillStyle = '#7f8c8d'; // Default gray
            }
            ctx.fillRect(screenX, screenY, obstacle.width, obstacle.height);
        }
    });

    // Draw players
    for (let id in players) {
        const player = players[id];
        const screenX = player.x - camera.x;
        const screenY = player.y - camera.y;

        // Only draw if within the current view
        if (
            screenX + 20 < 0 || screenX - 20 > canvas.width ||
            screenY + 20 < 0 || screenY - 20 > canvas.height
        ) {
            continue;
        }

        // Draw player circle
        ctx.beginPath();
        ctx.arc(screenX, screenY, 20, 0, 2 * Math.PI);
        ctx.fillStyle = (id === socket.id) ? '#3498db' : '#e74c3c'; // Blue for self, red for others
        ctx.fill();
        ctx.strokeStyle = '#ecf0f1';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw player letter
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.letter, screenX, screenY);
    }

    // Draw bullets
    bullets.forEach((bullet) => {
        const screenX = bullet.x - camera.x;
        const screenY = bullet.y - camera.y;

        // Only draw if within the current view
        if (
            screenX + 5 < 0 || screenX - 5 > canvas.width ||
            screenY + 5 < 0 || screenY - 5 > canvas.height
        ) {
            return;
        }

        ctx.beginPath();
        ctx.arc(screenX, screenY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#2ecc71'; // Green bullets
        ctx.fill();
    });

    // Update scoreboard
    const scoresElement = document.getElementById('scores');
    scoresElement.innerHTML = '';
    // Sort players by kill count descending
    const sortedPlayers = Object.values(players).sort((a, b) => b.kills - a.kills);
    sortedPlayers.forEach((player) => {
        const li = document.createElement('li');
        li.textContent = `${player.letter}: ${player.kills}`;
        scoresElement.appendChild(li);
    });

    // Optional: Draw Minimap

    const minimapCanvas = document.getElementById('minimap');
    const minimapCtx = minimapCanvas.getContext('2d');
    // Clear minimap
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    // Draw minimap background
    minimapCtx.fillStyle = '#34495e';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    // Draw obstacles on minimap
    minimapCtx.fillStyle = '#7f8c8d';
    obstacles.forEach((obstacle) => {
        minimapCtx.fillRect(
            obstacle.x * minimapScale,
            obstacle.y * minimapScale,
            obstacle.width * minimapScale,
            obstacle.height * minimapScale
        );
    });
    // Draw players on minimap
    for (let id in players) {
        const player = players[id];
        const miniX = player.x * minimapScale;
        const miniY = player.y * minimapScale;
        minimapCtx.beginPath();
        minimapCtx.arc(miniX, miniY, 3, 0, 2 * Math.PI);
        minimapCtx.fillStyle = (id === socket.id) ? '#3498db' : '#e74c3c';
        minimapCtx.fill();
    }

}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial call

// Start the game loop once images are loaded
window.onload = function () {
    if (backgroundImage.complete) {
        update();
    } else {
        backgroundImage.onload = update;
    }
};