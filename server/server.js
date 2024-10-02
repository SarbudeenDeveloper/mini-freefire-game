// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Game state
const players = {};
const mapWidth = 1600;
const mapHeight = 1200;
const obstacles = [
    { x: 400, y: 150, width: 715, height: 338, type: 'bigHome' },
    { x: 100, y: 1000, width: 360, height: 259, type: 'home' },
    { x: 1050, y: 750, width: 409, height: 406, type: 'pond' },
];
const bullets = [];

// Define respawn time in milliseconds
const RESPAWN_TIME = 5000; // 5 seconds

// Helper function to generate random positions
function randomPosition() {
    let position;
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite loops

    do {
        position = {
            x: Math.floor(Math.random() * mapWidth),
            y: Math.floor(Math.random() * mapHeight)
        };
        attempts++;
        if (attempts > maxAttempts) {
            // Fallback to a default position if a valid one isn't found
            return { x: mapWidth / 2, y: mapHeight / 2 };
        }
    } while (isPositionInObstacle(position.x, position.y));

    return position;
}

function isPositionInObstacle(x, y) {
    for (let obstacle of obstacles) {
        if (
            x + 20 > obstacle.x &&          // Player's right edge > obstacle's left edge
            x - 20 < obstacle.x + obstacle.width && // Player's left edge < obstacle's right edge
            y + 20 > obstacle.y &&          // Player's bottom edge > obstacle's top edge
            y - 20 < obstacle.y + obstacle.height   // Player's top edge < obstacle's bottom edge
        ) {
            return true; // Collision detected
        }
    }
    return false; // No collision
}

// Handle new connections
io.on('connection', (socket) => {
    console.log(`New player connected: ${socket.id}`);

    // Assign a random position and initial kill count
    players[socket.id] = {
        id: socket.id,
        x: randomPosition().x,
        y: randomPosition().y,
        letter: socket.id.substring(0, 1).toUpperCase(), // Use first letter of socket ID
        kills: 0
    };

    // Send current players to the new player
    socket.emit('currentPlayers', players);

    // Notify other players about the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Serve obstacles to clients
    socket.emit('mapData', { obstacles });

    // Handle player movement with collision detection
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            const newX = movementData.x;
            const newY = movementData.y;

            // Check collision with map boundaries
            if (newX < 20 || newX > mapWidth - 20 || newY < 20 || newY > mapHeight - 20) {
                return; // Reject movement if out of bounds
            }

            // Check collision with obstacles
            let collision = false;
            for (let obstacle of obstacles) {
                if (
                    newX + 20 > obstacle.x &&
                    newX - 20 < obstacle.x + obstacle.width &&
                    newY + 20 > obstacle.y &&
                    newY - 20 < obstacle.y + obstacle.height
                ) {
                    collision = true;
                    break;
                }
            }

            if (!collision) {
                // Update player position
                players[socket.id].x = newX;
                players[socket.id].y = newY;

                // Broadcast movement to other players
                socket.broadcast.emit('playerMoved', players[socket.id]);
            }
        }
    });

    // Handle shooting
    socket.on('shoot', (bulletData) => {
        const bullet = {
            id: socket.id + '_' + Date.now(),
            x: bulletData.x,
            y: bulletData.y,
            direction: bulletData.direction,
            owner: socket.id
        };
        bullets.push(bullet);
        io.emit('bulletFired', bullet);
    });

    // Handle bullet collisions (simplified for demonstration)
    // Handle bulletHit event with respawn logic
    socket.on('bulletHit', (hitData) => {
        const { bulletId, targetId } = hitData;
        // Increment kill count
        if (players[targetId]) {
            players[socket.id].kills += 1;
            // Notify all players about the kill
            io.emit('playerKilled', {
                killer: socket.id,
                victim: targetId,
                kills: players[socket.id].kills
            });
            // Remove the target player
            io.to(targetId).emit('killed');
            delete players[targetId];
            io.emit('removePlayer', targetId);

            // Respawn the player after a delay
            setTimeout(() => {
                players[targetId] = {
                    id: targetId,
                    x: Math.floor(Math.random() * mapWidth),
                    y: Math.floor(Math.random() * mapHeight),
                    letter: targetId.substring(0, 1).toUpperCase(),
                    kills: players[targetId]?.kills || 0
                };
                // Notify all players about the new player
                io.emit('newPlayer', players[targetId]);
                // Send current players to the respawned player
                io.to(targetId).emit('currentPlayers', players);
            }, RESPAWN_TIME);
        }
        // Remove the bullet
        const index = bullets.findIndex(b => b.id === bulletId);
        if (index !== -1) bullets.splice(index, 1);
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        // Notify all players to remove this player
        io.emit('removePlayer', socket.id);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
