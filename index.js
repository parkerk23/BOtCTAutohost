// index.js
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
    
    // Night action handlers
    socket.on('monk-protected-player', (protectedPlayerSocketId) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game) {
            game.handleMonkProtection(socket.id, protectedPlayerSocketId);
        }
    });

    socket.on('imp-kill-player', (targetSocketId) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game) {
            game.handleImpKill(socket.id, targetSocketId);
        }
    });

    socket.on('poisoner-poisoned-player', (targetSocketId) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game) {
            game.handlePoisonerPoison(socket.id, targetSocketId);
        }
    });

    socket.on('slayer-kill-player', (targetSocketId) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game) {
            game.handleSlayerKill(socket.id, targetSocketId);
        }
    });

    socket.on('fortune-teller-investigate-players', ({ target1SocketId, target2SocketId }) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game) {
            game.handleFortuneTellerInvestigation(socket.id, target1SocketId, target2SocketId);
        }
    });

    socket.on('butler-watch-player', (masterSocketId) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game) {
            game.handleButlerChoice(socket.id, masterSocketId);
        }
    });

    socket.on('ravenkeeper-choose-target', (targetSocketId) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game && targetSocketId) {
            const target = game.players.find(p => p.socketId === targetSocketId);
            if (target) {
                // Store the choice for when the Ravenkeeper dies
                const ravenkeeper = game.players.find(p => p.socketId === socket.id);
                ravenkeeper.ravenkeeperTarget = target;
                console.log(`Ravenkeeper chose ${target.playerName}. If they die, Ravenkeeper learns their role.`);
                io.to(socket.id).emit('actionConfirmed', `You will learn ${target.playerName}'s role if they die.`);
            }
        }
    });

    // Vote handling
    socket.on('vote', ({ targetSocketId }) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game && game.gamePhase === 'Day') {
            const success = game.handleVote(socket.id, targetSocketId);
            if (success) {
                const voter = game.players.find(p => p.socketId === socket.id);
                const target = game.players.find(p => p.socketId === targetSocketId);
                io.to(game.gameCode).emit('voteUpdate', {
                    voter: voter.playerName,
                    target: target.playerName,
                    voteTally: game.voteTally
                });
            }
        }
    });

    // Nomination handling
    socket.on('nominate', ({ targetSocketId }) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game && game.gamePhase === 'Day') {
            const nominator = game.players.find(p => p.socketId === socket.id);
            const nominee = game.players.find(p => p.socketId === targetSocketId);
            
            if (nominator && nominee && nominator.isAlive && nominee.isAlive) {
                nominee.isNominated = true;
                
                // Handle Virgin ability
                if (nominee.role.name === 'Virgin' && !nominee.virginTriggered) {
                    nominee.virginTriggered = true;
                    if (nominator.role.name === 'Townsfolk' || 
                        Object.values(require('./roles').Roles.TOWNSFOLK.roles).some(r => r.name === nominator.role.name)) {
                        nominator.playerDies();
                        io.to(game.gameCode).emit('virginTriggered', {
                            nominator: nominator.playerName,
                            virgin: nominee.playerName
                        });
                        io.to(game.gameCode).emit('playerDied', { 
                            player: nominator, 
                            cause: 'virgin' 
                        });
                    }
                }
                
                io.to(game.gameCode).emit('playerNominated', {
                    nominator: nominator.playerName,
                    nominee: nominee.playerName
                });
            }
        }
    });

    // Execution handling
    socket.on('execute', ({ targetSocketId }) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game && game.hostSocketId === socket.id && game.gamePhase === 'Day') {
            const target = game.players.find(p => p.socketId === targetSocketId);
            if (target && target.isAlive) {
                target.playerDies();
                game.executionOccurred = true;
                game.pastExecutions.push(target);
                
                // Handle death triggers
                game.handlePlayerDeath(target, 'execution');
                
                io.to(game.gameCode).emit('playerExecuted', { player: target });
                io.to(game.gameCode).emit('playerDied', { player: target, cause: 'execution' });
                
                const winCondition = game.checkWinCondition();
                if (winCondition) {
                    game.endGame(winCondition);
                }
            }
        }
    });

    // Phase transition handlers
    socket.on('nextPhase', () => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game && game.hostSocketId === socket.id) {
            if (game.gamePhase === 'Night') {
                game.dayPhase();
                io.to(game.gameCode).emit('phaseChanged', { 
                    phase: 'Day', 
                    dayCount: game.dayCount 
                });
                io.to(game.hostSocketId).emit('phaseChanged', { 
                    phase: 'Day', 
                    dayCount: game.dayCount 
                });
            } else if (game.gamePhase === 'Day') {
                game.NightPhase();
                io.to(game.gameCode).emit('phaseChanged', { 
                    phase: 'Night', 
                    dayCount: game.dayCount 
                });
                io.to(game.hostSocketId).emit('phaseChanged', { 
                    phase: 'Night', 
                    dayCount: game.dayCount 
                });
            }
        }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        Object.values(games).forEach(game => {
            const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                const removedPlayer = game.players[playerIndex];
                game.players.splice(playerIndex, 1);
                console.log(`Player ${removedPlayer.playerName} disconnected from game ${game.gameCode}`);
                io.to(game.gameCode).emit('playerListUpdate', game.players);
                if (game.hostSocketId) {
                    io.to(game.hostSocketId).emit('playerListUpdate', game.players);
                }
            }
        });
    });

    // Game creation handler
    socket.on('createGame', (data) => {
        const { gameCode } = data;
        
        if (!games[gameCode]) {
            games[gameCode] = new Game(gameCode, io);
            games[gameCode].hostSocketId = socket.id;
            console.log("New game created by host:", gameCode);
            socket.join(gameCode);
            socket.emit('gameCreated', { success: true, gameCode: gameCode });
            socket.emit('playerListUpdate', games[gameCode].players);
            console.log(`Host ${socket.id} joined room ${gameCode}`);
        } else {
            socket.emit('gameCreated', { success: false, message: 'Game code already exists' });
        }
    });

    // Game joining handler
    socket.on('joinGame', (data) => {
        const { gameCode, playerName } = data;

        if (!games[gameCode]) {
            socket.emit('joinedGame', { success: false, message: 'Game not found' });
            return;
        }

        const currentGame = games[gameCode];
        if (currentGame.gamePhase !== 'Lobby') {
            socket.emit('joinedGame', { success: false, message: 'Game already in progress' });
            return;
        }

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
        console.log(`Broadcasting player list update to room ${gameCode}`);
        console.log(`Players in game: ${currentGame.players.map(p => p.playerName).join(', ')}`);
        
        io.to(gameCode).emit('playerListUpdate', currentGame.players);
        if (currentGame.hostSocketId) {
            io.to(currentGame.hostSocketId).emit('playerListUpdate', currentGame.players);
            console.log(`Explicitly sent player list to host ${currentGame.hostSocketId}`);
        }
    });

    // Game start handler
    socket.on('startGame', (data) => {
        const { gameCode } = data;
        const currentGame = games[gameCode];

        if (!currentGame) {
            socket.emit('startGameError', { message: 'Game not found' });
            return;
        }

        if (currentGame.hostSocketId !== socket.id) {
            socket.emit('startGameError', { message: 'Only the host can start the game' });
            return;
        }

        if (currentGame.players.length >= 5) {
            currentGame.assignRoles();
            currentGame.gamePhase = 'Night';
            
            io.to(gameCode).emit('gameStarted', { players: currentGame.players });
            
            currentGame.players.forEach(player => {
                io.to(player.socketId).emit('roleAssigned', player.role);
            });
            
            console.log(`Game ${gameCode} started with ${currentGame.players.length} players`);
            currentGame.NightPhase();
        } else {
            socket.emit('startGameError', { message: 'Not enough players (minimum 5 required)' });
        }
    });

    // Role assignment handler (for testing)
    socket.on('assignRoles', (data) => {
        const { gameCode } = data;
        const currentGame = games[gameCode];

        if (currentGame) {
            currentGame.assignRoles();
            
            currentGame.players.forEach(player => {
                io.to(player.socketId).emit('roleAssigned', player.role);
            });
        }
    });
});

function findGameByPlayerSocketId(socketId) {
    for (const gameCode in games) {
        const game = games[gameCode];
        if (game.players.some(p => p.socketId === socketId) || game.hostSocketId === socketId) {
            return game;
        }
    }
    return null;
}

server.listen(3000, () => {
    console.log('Server listening on http://localhost:3000');
});