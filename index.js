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

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });

    //When a player joins the game 
    socket.on('joinGame', (data) => {
        const { gameCode, playerName } = data;

        if(!games[gameCode]){
            games[gameCode] = new Game(gameCode);
            console.log("New game created", gameCode);
        }
        const currentGame = games[gameCode];

        socket.join(gameCode);
        const socketId = socket.id;
        const newPlayer = currentGame.addPlayer(socketId, playerName);

        socket.emit('joinedGame', {success: true, gameCode: gameCode});

        io.to(gameCode).emit('playerListUpdate', currentGame.players);
    });

    socket.on('assignRoles', (data) => {
        const { gameCode } = data;
        const currentGame = games[gameCode];

        if (currentGame) {
            currentGame.assignRoles();

        }
    });

});

server.listen(3000, () => {
    console.log('Server listening on http://localhost:3000');
});

