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


    socket.on('butler-watch-player', (masterSocketId) => {
        const game = findGameByPlayerSocketId(socket.id);
        if (game) {
            game.handleButlerChoice(socket.id, masterSocketId);
        }
    });
        // Enhanced index.js - Additional socket event handlers

        // Add these event handlers to your index.js socket.on('connection') block:

        // Enhanced Fortune Teller with 2-player selection
        socket.on('fortune-teller-investigate-players', ({ target1SocketId, target2SocketId }) => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && target1SocketId && target2SocketId && target1SocketId !== target2SocketId) {
                game.handleFortuneTellerInvestigation(socket.id, target1SocketId, target2SocketId);
            }
        });

        // Enhanced Ravenkeeper target selection
        socket.on('ravenkeeper-choose-target', (targetSocketId) => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && targetSocketId) {
                game.handleRavenkeeperChoice(socket.id, targetSocketId);
            }
        });

        // Nomination handling
        socket.on('nominate', ({ targetSocketId }) => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && game.gamePhase === 'Day') {
                const success = game.handleNomination(socket.id, targetSocketId);
                if (success) {
                    console.log('Nomination successful');
                }
            }
        });

        // Enhanced voting with vote tallying
        socket.on('vote', ({ targetSocketId }) => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && game.gamePhase === 'Day') {
                const success = game.handleVote(socket.id, targetSocketId);
                if (success) {
                    const voter = game.players.find(p => p.socketId === socket.id);
                    const target = game.players.find(p => p.socketId === targetSocketId);
                    
                    // Calculate current vote totals
                    const voteResults = game.calculateVoteResults();
                    
                    io.to(game.gameCode).emit('voteUpdate', {
                        voter: voter.playerName,
                        target: target.playerName,
                        voteTally: voteResults.results,
                        totalVotes: Object.values(voteResults.results).reduce((sum, count) => sum + count, 0),
                        alivePlayers: game.players.filter(p => p.isAlive).length
                    });
                    
                    console.log(`${voter.playerName} voted for ${target.playerName}`);
                }
            }
        });

        // Get current vote status
        socket.on('getVoteStatus', () => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && game.gamePhase === 'Day') {
                const voteResults = game.calculateVoteResults();
                const alivePlayers = game.players.filter(p => p.isAlive);
                const playersWhoVoted = game.players.filter(p => p.hasVoted);
                
                socket.emit('voteStatus', {
                    results: voteResults.results,
                    maxVotes: voteResults.maxVotes,
                    playersWithMaxVotes: voteResults.playersWithMaxVotes,
                    totalVoters: playersWhoVoted.length,
                    totalAlivePlayers: alivePlayers.length,
                    canExecute: voteResults.maxVotes > 0
                });
            }
        });

        // End voting phase and determine execution
        socket.on('endVoting', () => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && game.hostSocketId === socket.id && game.gamePhase === 'Day') {
                const voteResults = game.calculateVoteResults();
                
                if (voteResults.maxVotes > 0 && voteResults.playersWithMaxVotes.length === 1) {
                    const playerToExecute = voteResults.playersWithMaxVotes[0];
                    const targetPlayer = game.players.find(p => p.playerName === playerToExecute);
                    
                    if (targetPlayer) {
                        io.to(game.gameCode).emit('executionDecided', {
                            playerName: playerToExecute,
                            votes: voteResults.maxVotes
                        });
                        
                        // Host can confirm execution
                        io.to(game.hostSocketId).emit('confirmExecution', {
                            playerName: playerToExecute,
                            votes: voteResults.maxVotes,
                            socketId: targetPlayer.socketId
                        });
                    }
                } else if (voteResults.playersWithMaxVotes.length > 1) {
                    // Tie vote - no execution
                    io.to(game.gameCode).emit('tieVote', {
                        tiedPlayers: voteResults.playersWithMaxVotes,
                        votes: voteResults.maxVotes
                    });
                } else {
                    // No votes - no execution
                    io.to(game.gameCode).emit('noExecution', {
                        message: 'No votes were cast - no execution today.'
                    });
                }
            }
        });

        // Confirm execution (host only)
        socket.on('confirmExecution', ({ targetSocketId }) => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && game.hostSocketId === socket.id && game.gamePhase === 'Day') {
                const target = game.players.find(p => p.socketId === targetSocketId);
                if (target && target.isAlive) {
                    target.playerDies();
                    game.executionOccurred = true;
                    game.pastExecutions.push(target);
                    
                    // Handle death triggers
                    game.handlePlayerDeath(target, 'execution');
                    
                    io.to(game.gameCode).emit('playerExecuted', { 
                        player: target,
                        cause: 'execution',
                        votes: game.calculateVoteResults().results[target.playerName] || 0
                    });
                    
                    console.log(`${target.playerName} was executed by vote`);
                }
            }
        });

        // Reset votes (host only)
        socket.on('resetVotes', () => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && game.hostSocketId === socket.id && game.gamePhase === 'Day') {
                game.voteTally = {};
                game.players.forEach(player => {
                    player.resetVoting();
                    player.isNominated = false;
                });
                
                io.to(game.gameCode).emit('votesReset');
                console.log('Host reset all votes');
            }
        });

        // Skip day phase (host only)
        socket.on('skipDay', () => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && game.hostSocketId === socket.id && game.gamePhase === 'Day') {
                // Check Mayor win condition if no execution occurred
                const mayorPlayer = game.players.find(p => p.role.name === 'Mayor' && p.isAlive);
                const alivePlayers = game.players.filter(p => p.isAlive);
                
                if (mayorPlayer && alivePlayers.length === 3 && !game.executionOccurred) {
                    game.endGame('Good wins - Mayor condition met (3 players alive, no execution)');
                    return;
                }
                
                // Proceed to night
                game.NightPhase();
                io.to(game.gameCode).emit('phaseChanged', { 
                    phase: 'Night', 
                    dayCount: game.dayCount 
                });
                io.to(game.hostSocketId).emit('phaseChanged', { 
                    phase: 'Night', 
                    dayCount: game.dayCount 
                });
                
                console.log('Host skipped day phase');
            }
        });

        // Get game state (for reconnecting players)
        socket.on('getGameState', () => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game) {
                const player = game.players.find(p => p.socketId === socket.id);
                const alivePlayers = game.players.filter(p => p.isAlive);
                
                socket.emit('gameState', {
                    gamePhase: game.gamePhase,
                    dayCount: game.dayCount,
                    players: game.players.map(p => ({
                        socketId: p.socketId,
                        playerName: p.playerName,
                        isAlive: p.isAlive,
                        hasVoted: p.hasVoted,
                        isNominated: p.isNominated
                    })),
                    myRole: player ? player.role : null,
                    voteTally: game.voteTally,
                    alivePlayers: alivePlayers.length
                });
            }
        });

        // Handle player reconnection
        socket.on('reconnect', ({ playerName, gameCode }) => {
            const game = games[gameCode];
            if (game) {
                const existingPlayer = game.players.find(p => p.playerName === playerName);
                if (existingPlayer) {
                    // Update socket ID for reconnected player
                    const oldSocketId = existingPlayer.socketId;
                    existingPlayer.socketId = socket.id;
                    
                    socket.join(gameCode);
                    
                    // Send current game state
                    socket.emit('reconnected', {
                        success: true,
                        role: existingPlayer.role,
                        gamePhase: game.gamePhase,
                        dayCount: game.dayCount
                    });
                    
                    // Update other players about the reconnection
                    io.to(gameCode).emit('playerReconnected', {
                        playerName: existingPlayer.playerName
                    });
                    
                    console.log(`${playerName} reconnected to game ${gameCode}`);
                }
            }
        });

        // Admin commands (host only)
        socket.on('adminCommand', ({ command, data }) => {
            const game = findGameByPlayerSocketId(socket.id);
            if (game && game.hostSocketId === socket.id) {
                switch (command) {
                    case 'killPlayer':
                        const targetPlayer = game.players.find(p => p.socketId === data.targetSocketId);
                        if (targetPlayer && targetPlayer.isAlive) {
                            targetPlayer.playerDies();
                            game.handlePlayerDeath(targetPlayer, 'admin');
                            io.to(game.gameCode).emit('playerDied', { 
                                player: targetPlayer, 
                                cause: 'admin' 
                            });
                        }
                        break;
                        
                    case 'revivePlayer':
                        const playerToRevive = game.players.find(p => p.socketId === data.targetSocketId);
                        if (playerToRevive && !playerToRevive.isAlive) {
                            playerToRevive.isAlive = true;
                            io.to(game.gameCode).emit('playerRevived', { 
                                player: playerToRevive 
                            });
                        }
                        break;
                        
                    case 'changePhase':
                        if (data.phase === 'Night') {
                            game.NightPhase();
                        } else if (data.phase === 'Day') {
                            game.dayPhase();
                        }
                        io.to(game.gameCode).emit('phaseChanged', { 
                            phase: data.phase, 
                            dayCount: game.dayCount 
                        });
                        break;
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