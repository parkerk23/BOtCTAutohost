const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');
const games = {};
const { Game } = require('./game.js');

// Serve static files from a 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Simple route for the host's page
app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

// Simple route for the player's page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    socket.on('monk-protected-player', (protectedPlayerSocketId) => {
        // Find the game and handle the ability
        const game = findGameByPlayerSocketId(socket.id); // You would need a function to find the game
        if (game) {
            game.monkProtects(socket.id, protectedPlayerSocketId);
        }
    });
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove player from games when they disconnect
        Object.values(games).forEach(game => {
            const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                const removedPlayer = game.players[playerIndex];
                game.players.splice(playerIndex, 1);
                console.log(`Player ${removedPlayer.playerName} disconnected from game ${game.gameCode}`);
                
                // Update remaining players and host
                io.to(game.gameCode).emit('playerListUpdate', game.players);
                if (game.hostSocketId) {
                    io.to(game.hostSocketId).emit('playerListUpdate', game.players);
                }
            }
        });
    });

    // Host creates a game
    socket.on('createGame', (data) => {
        const { gameCode } = data;
        
        if (!games[gameCode]) {
            games[gameCode] = new Game(gameCode);
            games[gameCode].hostSocketId = socket.id; // Track the host
            console.log("New game created by host:", gameCode);
            socket.join(gameCode);
            socket.emit('gameCreated', { success: true, gameCode: gameCode });
            
            // Send initial empty player list to host
            socket.emit('playerListUpdate', games[gameCode].players);
            console.log(`Host ${socket.id} joined room ${gameCode}`);
        } else {
            socket.emit('gameCreated', { success: false, message: 'Game code already exists' });
        }
    });

    // When a player joins the game 
    socket.on('joinGame', (data) => {
        const { gameCode, playerName } = data;

        if (!games[gameCode]) {
            socket.emit('joinedGame', { success: false, message: 'Game not found' });
            return;
        }

        const currentGame = games[gameCode];
        
        // Check if game has already started
        if (currentGame.gamePhase !== 'Lobby') {
            socket.emit('joinedGame', { success: false, message: 'Game already in progress' });
            return;
        }

        // Check if name is already taken
        const nameExists = currentGame.players.some(p => p.playerName === playerName);
        if (nameExists) {
            socket.emit('joinedGame', { success: false, message: 'Name already taken' });
            return;
        }

        socket.join(gameCode);
        const socketId = socket.id;
        const newPlayer = currentGame.addPlayer(socketId, playerName);

        console.log(`Player ${playerName} joined game ${gameCode}. Players in room:`, currentGame.players.map(p => p.playerName));

        socket.emit('joinedGame', { success: true, gameCode: gameCode });

        // Update ALL players in the game about the new player list (including host)
        console.log(`Broadcasting player list update to room ${gameCode}`);
        console.log(`Players in game: ${currentGame.players.map(p => p.playerName).join(', ')}`);
        
        // Make sure to update both the room AND specifically the host
        io.to(gameCode).emit('playerListUpdate', currentGame.players);
        
        // Additionally, explicitly send to host to ensure they get it
        if (currentGame.hostSocketId) {
            io.to(currentGame.hostSocketId).emit('playerListUpdate', currentGame.players);
            console.log(`Explicitly sent player list to host ${currentGame.hostSocketId}`);
        }
    });

    // Host starts the game
    socket.on('startGame', (data) => {
        const { gameCode } = data;
        const currentGame = games[gameCode];

        if (!currentGame) {
            socket.emit('startGameError', { message: 'Game not found' });
            return;
        }

        // Verify that the person starting the game is the host
        if (currentGame.hostSocketId !== socket.id) {
            socket.emit('startGameError', { message: 'Only the host can start the game' });
            return;
        }

        if (currentGame.players.length >= 5) {
            currentGame.assignRoles();
            currentGame.gamePhase = 'Night';
            
            // Notify all players that game has started, include player data for host
            io.to(gameCode).emit('gameStarted', { players: currentGame.players });
            
            // Send role assignments to each player
            currentGame.players.forEach(player => {
                io.to(player.socketId).emit('roleAssigned', player.role);
            });
            
            console.log(`Game ${gameCode} started with ${currentGame.players.length} players`);
        } else {
            socket.emit('startGameError', { message: 'Not enough players (minimum 5 required)' });
        }
    });

    // Handle role assignment request (keeping original functionality)
    socket.on('assignRoles', (data) => {
        const { gameCode } = data;
        const currentGame = games[gameCode];

        if (currentGame) {
            currentGame.assignRoles();
            
            // Send role assignments to each player
            currentGame.players.forEach(player => {
                io.to(player.socketId).emit('roleAssigned', player.role);
            });
        }
    });
});

server.listen(3000, () => {
    console.log('Server listening on http://localhost:3000');
});