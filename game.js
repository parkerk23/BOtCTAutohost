const { Player } = require('./player.js');
const { Roles } = require('./roles');

class Game {
    constructor(gameCode, io) {
        this.gameCode = gameCode;
        this.io = io; 
        this.players = [];
        this.gamePhase = 'Lobby';
        this.townsfolkCount = 0;
        this.demonCount = 0;
        this.voteTally = {};
        this.dayCount = 0;
        this.hostSocketId = null;
        this.executionOccurred = false;
        this.pastExecutions = [];
        this.nightActions = {}; // Store pending night actions
        this.protectedPlayers = []; // Players protected this night
        this.redHerring = null; // For Fortune Teller's false positive
    }

    addPlayer(socketId, playerName) {
        const newPlayer = new Player(socketId, playerName);
        this.players.push(newPlayer);
        return newPlayer;
    }

    getRandomRoleFromTeam(teamRoles) {
        const roleKeys = Object.keys(teamRoles);
        const randomKey = roleKeys[Math.floor(Math.random() * roleKeys.length)];
        return teamRoles[randomKey];
    }

    assignRoles() {
        const playerCount = this.players.length; 
        const availableRoles = [];
        let townsfolkCount = 0;
        let outsiderCount = 0;
        let minionCount = 0;
        let demonCount = 1;

        if (playerCount < 5) {
            console.log("Not enough players to start the game.");
            return;
        } else if (playerCount === 5) {
            townsfolkCount = 3;
            minionCount = 1;
        } else if (playerCount === 6) {
            townsfolkCount = 3;
            outsiderCount = 1;
            minionCount = 1;
        } else if (playerCount === 7) {
            townsfolkCount = 5;
            minionCount = 1;
        } else if (playerCount === 8) {
            townsfolkCount = 5;
            outsiderCount = 1;
            minionCount = 1;
        } else if (playerCount === 9) {
            townsfolkCount = 5;
            outsiderCount = 2;
            minionCount = 1;
        } else if (playerCount === 10) {
            townsfolkCount = 7;
            outsiderCount = 0;
            minionCount = 2;
        } else {
            console.log("Player count not supported by the current role assignment logic.");
            return;
        }

        // Get available roles arrays
        const townsfolkRoles = Object.values(Roles.TOWNSFOLK.roles);
        const minionRoles = Object.values(Roles.MINION.roles);
        const outsiderRoles = Object.values(Roles.OUTSIDER.roles);

        // Add random townsfolk roles (ensuring no duplicates)
        const selectedTownsfolk = this.getRandomUniqueRoles(townsfolkRoles, townsfolkCount);
        availableRoles.push(...selectedTownsfolk);

        // Add random minion roles (ensuring no duplicates)
        const selectedMinions = this.getRandomUniqueRoles(minionRoles, minionCount);
        availableRoles.push(...selectedMinions);

        // Check if Baron is in play and adjust outsider count
        const hasBaron = selectedMinions.some(role => role.name === 'Baron');
        if (hasBaron) {
            console.log("Baron is in play, adding 2 more outsiders.");
            outsiderCount += 2;
        }

        // Add outsider roles if needed
        if (outsiderCount > 0) {
            const selectedOutsiders = this.getRandomUniqueRoles(outsiderRoles, outsiderCount);
            availableRoles.push(...selectedOutsiders);
        }

        // Always add the Imp as the demon
        availableRoles.push(Roles.DEMON.roles.IMP);

        // Shuffle the roles
        for (let i = availableRoles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableRoles[i], availableRoles[j]] = [availableRoles[j], availableRoles[i]];
        }

        // Assign roles to players
        this.players.forEach((player, index) => {
            player.role = availableRoles[index];
        });

        // Set up Fortune Teller's red herring (good player who registers as evil)
        const goodPlayers = this.players.filter(p => 
            Object.values(Roles.TOWNSFOLK.roles).some(r => r.name === p.role.name) ||
            Object.values(Roles.OUTSIDER.roles).some(r => r.name === p.role.name)
        );
        if (goodPlayers.length > 0) {
            this.redHerring = goodPlayers[Math.floor(Math.random() * goodPlayers.length)];
        }

        console.log("Roles assigned successfully!");
        this.players.forEach(player => {
            console.log(`${player.playerName} -> ${player.role.name}`);
        });
    }

    // Helper method to get unique random roles from a role array
    getRandomUniqueRoles(roleArray, count) {
        if (count > roleArray.length) {
            console.warn(`Not enough unique roles available. Requested: ${count}, Available: ${roleArray.length}`);
            return [...roleArray]; // Return all available roles
        }

        const shuffled = [...roleArray].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    NightPhase() {
        this.gamePhase = 'Night';
        this.dayCount++;
        this.nightActions = {};
        this.protectedPlayers = [];
        
        // Clear previous night's effects and reset voting
        this.players.forEach(player => {
            player.isProtected = false;
            player.resetVoting(); // Reset voting for the new day
            // Keep poison for one more phase (poison lasts through the night and next day)
        });

        console.log(`Night ${this.dayCount} begins`);
        
        // First execute night actions, then notify clients
        setTimeout(() => {
            this.executeNightActions();
        }, 1000); // Small delay to let clients update their UI
        
        this.io.to(this.gameCode).emit('nightPhaseStarted');
    }

    executeNightActions() {
        const allRoles = [...Object.values(Roles.TOWNSFOLK.roles), ...Object.values(Roles.OUTSIDER.roles), ...Object.values(Roles.MINION.roles), ...Object.values(Roles.DEMON.roles)];
        const sortedRoles = allRoles.sort((a, b) => a.nightOrder - b.nightOrder);

        for (const role of sortedRoles) {
            const playersWithRole = this.players.filter(p => p.role.name === role.name && p.isAlive);
            playersWithRole.forEach(player => {
                this.handleAbility(role, player);
            });
        }
    }

    // Socket event handlers for player choices
    handleMonkProtection(monkSocketId, protectedPlayerSocketId) {
        const protectedPlayer = this.players.find(p => p.socketId === protectedPlayerSocketId);
        if (protectedPlayer && protectedPlayer.isAlive) {
            protectedPlayer.isProtected = true;
            this.protectedPlayers.push(protectedPlayer);
            console.log(`Monk protected ${protectedPlayer.playerName}.`);
            this.io.to(monkSocketId).emit('actionConfirmed', `You protected ${protectedPlayer.playerName}.`);
        }
    }

    handleImpKill(impSocketId, targetSocketId) {
        const imp = this.players.find(p => p.socketId === impSocketId);
        const target = this.players.find(p => p.socketId === targetSocketId);
        
        if (!target || !target.isAlive) return;

        // Check if Imp is killing themselves
        if (targetSocketId === impSocketId) {
            // Find a random alive minion to become the new Imp
            const aliveMinions = this.players.filter(p => 
                p.isAlive && 
                Object.values(Roles.MINION.roles).some(r => r.name === p.role.name)
            );
            
            if (aliveMinions.length > 0) {
                const newImp = aliveMinions[Math.floor(Math.random() * aliveMinions.length)];
                newImp.role = Roles.DEMON.roles.IMP;
                this.io.to(newImp.socketId).emit('roleChanged', newImp.role);
                console.log(`${newImp.playerName} becomes the new Imp!`);
            }
            
            imp.playerDies();
            this.io.to(this.gameCode).emit('playerDied', { player: imp, cause: 'suicide' });
        } else {
            // Normal kill attempt
            if (target.isProtected || target.role.name === 'Soldier') {
                console.log(`${target.playerName} was protected and survives the night.`);
                this.io.to(impSocketId).emit('actionConfirmed', `Your attack was blocked!`);
            } else {
                target.playerDies();
                console.log(`Imp killed ${target.playerName}`);
                this.io.to(this.gameCode).emit('playerDied', { player: target, cause: 'demon' });
            }
        }
    }

    handlePoisonerPoison(poisonerSocketId, targetSocketId) {
        const target = this.players.find(p => p.socketId === targetSocketId);
        if (target && target.isAlive) {
            target.isPoisoned = true;
            console.log(`Poisoner poisoned ${target.playerName}.`);
            this.io.to(poisonerSocketId).emit('actionConfirmed', `You poisoned ${target.playerName}.`);
        }
    }

    handleSlayerKill(slayerSocketId, targetSocketId) {
        const slayer = this.players.find(p => p.socketId === slayerSocketId);
        const target = this.players.find(p => p.socketId === targetSocketId);
        
        if (!slayer || !target || slayer.slayerUsed || this.gamePhase !== 'Day') return;

        slayer.slayerUsed = true;
        
        if (target.role.name === 'Imp') {
            target.playerDies();
            console.log(`Slayer executed the Imp: ${target.playerName}`);
            this.io.to(this.gameCode).emit('playerDied', { player: target, cause: 'slayer' });
            this.io.to(slayerSocketId).emit('actionConfirmed', `You successfully slayed the demon!`);
        } else {
            console.log(`Slayer failed to kill ${target.playerName} (not the demon)`);
            this.io.to(slayerSocketId).emit('actionConfirmed', `Your target was not the demon.`);
        }
    }

    handleFortuneTellerInvestigation(fortuneTellerSocketId, target1SocketId, target2SocketId) {
        const target1 = this.players.find(p => p.socketId === target1SocketId);
        const target2 = this.players.find(p => p.socketId === target2SocketId);
        
        if (!target1 || !target2) return;

        const isTarget1Evil = this.isPlayerEvil(target1) || target1.socketId === this.redHerring?.socketId;
        const isTarget2Evil = this.isPlayerEvil(target2) || target2.socketId === this.redHerring?.socketId;
        
        const result = isTarget1Evil || isTarget2Evil ? "YES" : "NO";
        
        this.io.to(fortuneTellerSocketId).emit('fortuneTellerResult', {
            target1: target1.playerName,
            target2: target2.playerName,
            result: result
        });
        
        console.log(`Fortune Teller learned: ${target1.playerName} and ${target2.playerName} - ${result}`);
    }

    handleButlerChoice(butlerSocketId, masterSocketId) {
        const butler = this.players.find(p => p.socketId === butlerSocketId);
        const master = this.players.find(p => p.socketId === masterSocketId);
        
        if (butler && master) {
            butler.masterSocketId = masterSocketId;
            console.log(`Butler aligned with ${master.playerName}`);
            this.io.to(butlerSocketId).emit('actionConfirmed', `You aligned with ${master.playerName}.`);
        }
    }

    isPlayerEvil(player) {
        return player.role.name === 'Imp' || 
               Object.values(Roles.MINION.roles).some(r => r.name === player.role.name);
    }

    findPlayersByRoleName(roleName) {
        return this.players.filter(p => p.role.name === roleName);
    }

    handleAbility(role, actingPlayer) {
        console.log(`Executing ability for role: ${role.name} (Player: ${actingPlayer.playerName})`);

        switch (role.name) {
            case 'Washerwoman':
                if (this.dayCount === 1) {
                    const allTownsfolkRoles = Object.values(Roles.TOWNSFOLK.roles);
                    const nonWasherwomanTownsfolk = allTownsfolkRoles.filter(role => role.name !== 'Washerwoman');
                    
                    // Randomly select one townsfolk role to hint at
                    const hintedRole = nonWasherwomanTownsfolk[Math.floor(Math.random() * nonWasherwomanTownsfolk.length)];
                    
                    // Find all players with the hinted role
                    const playersWithHintedRole = this.findPlayersByRoleName(hintedRole.name);
                    
                    let player1, player2;
                    if (playersWithHintedRole.length > 0) {
                        player1 = playersWithHintedRole[Math.floor(Math.random() * playersWithHintedRole.length)];
                        // Get a random other player
                        const otherPlayers = this.players.filter(p => 
                            p.role.name !== 'Washerwoman' && 
                            p.socketId !== player1.socketId
                        );
                        player2 = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                    } else {
                        // No players with the hinted role, show two random players
                        const otherPlayers = this.players.filter(p => p.role.name !== 'Washerwoman');
                        const shuffled = otherPlayers.sort(() => 0.5 - Math.random());
                        player1 = shuffled[0];
                        player2 = shuffled[1];
                    }
                    
                    // Shuffle the two players for the reveal
                    const revealedPlayers = [player1, player2].sort(() => 0.5 - Math.random());
                    
                    this.io.to(actingPlayer.socketId).emit('washerwomanInfo', {
                        role: hintedRole.name,
                        players: [revealedPlayers[0].playerName, revealedPlayers[1].playerName]
                    });
                    
                    console.log(`Washerwoman learns one of these players is the ${hintedRole.name}: ${revealedPlayers[0].playerName}, ${revealedPlayers[1].playerName}`);
                }
                break;

            case 'Monk':
                if (this.gamePhase === 'Night' && this.dayCount > 1) {
                    const otherAlivePlayers = this.players
                        .filter(p => p.isAlive && p.socketId !== actingPlayer.socketId)
                        .map(p => ({ socketId: p.socketId, playerName: p.playerName }));

                    this.io.to(actingPlayer.socketId).emit('monkChoosePlayer', { players: otherAlivePlayers });
                }
                break;

            case 'Librarian':
                if (this.dayCount === 1) {
                    const outsidersInGame = this.players.filter(p => 
                        Object.values(Roles.OUTSIDER.roles).some(r => r.name === p.role.name)
                    );

                    if (outsidersInGame.length === 0) {
                        this.io.to(actingPlayer.socketId).emit('librarianInfo', {
                            message: "There are no Outsiders in play."
                        });
                    } else {
                        const outsiderPlayer = outsidersInGame[Math.floor(Math.random() * outsidersInGame.length)];
                        const otherPlayers = this.players.filter(p => 
                            p.socketId !== outsiderPlayer.socketId && 
                            p.socketId !== actingPlayer.socketId
                        );
                        const otherPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];

                        const revealedPlayers = [outsiderPlayer, otherPlayer].sort(() => 0.5 - Math.random());

                        this.io.to(actingPlayer.socketId).emit('librarianInfo', {
                            players: [revealedPlayers[0].playerName, revealedPlayers[1].playerName],
                            message: "One of these players is an Outsider."
                        });
                    }
                }
                break;

            case 'Ravenkeeper':
                // This is handled when the player dies, not during normal night phase
                break;

            case 'Investigator':
                if (this.dayCount === 1) {
                    const minionsInGame = this.players.filter(p => 
                        Object.values(Roles.MINION.roles).some(r => r.name === p.role.name)
                    );

                    if (minionsInGame.length > 0) {
                        const minionPlayer = minionsInGame[Math.floor(Math.random() * minionsInGame.length)];
                        const nonMinionPlayers = this.players.filter(p => 
                            !minionsInGame.some(m => m.socketId === p.socketId) && 
                            p.socketId !== actingPlayer.socketId
                        );
                        const otherPlayer = nonMinionPlayers[Math.floor(Math.random() * nonMinionPlayers.length)];

                        const revealedPlayers = [minionPlayer, otherPlayer].sort(() => 0.5 - Math.random());
                        
                        this.io.to(actingPlayer.socketId).emit('investigatorInfo', {
                            players: [revealedPlayers[0].playerName, revealedPlayers[1].playerName],
                            message: "One of these players is a Minion."
                        });
                    } else {
                        this.io.to(actingPlayer.socketId).emit('investigatorInfo', {
                            message: "There are no Minions in play."
                        });
                    }
                }
                break;

            case 'Chef':
                if (this.dayCount === 1) {
                    let pairCount = 0;
                    const evilRoles = ['Imp', 'Poisoner', 'Spy', 'Baron', 'Scarlet Woman'];
                    
                    for (let i = 0; i < this.players.length; i++) {
                        const currentPlayerRole = this.players[i].role.name;
                        const nextPlayerIndex = (i + 1) % this.players.length;
                        const nextPlayerRole = this.players[nextPlayerIndex].role.name;
                        
                        if (evilRoles.includes(currentPlayerRole) && evilRoles.includes(nextPlayerRole)) {
                            pairCount++;
                        }
                    }
                    
                    this.io.to(actingPlayer.socketId).emit('chefInfo', {
                        pairCount: pairCount,
                        message: `There are ${pairCount} pairs of adjacent evil players.`
                    });
                    
                    console.log(`Chef learns there are ${pairCount} pairs of evil players.`);
                }
                break;

            case 'Empath':
                if (this.gamePhase === 'Night') {
                    const playerIndex = this.players.indexOf(actingPlayer);
                    let leftNeighbor, rightNeighbor;
                    
                    // Find alive neighbors
                    for (let i = 1; i < this.players.length; i++) {
                        const leftIndex = (playerIndex - i + this.players.length) % this.players.length;
                        const rightIndex = (playerIndex + i) % this.players.length;
                        
                        if (!leftNeighbor && this.players[leftIndex].isAlive) {
                            leftNeighbor = this.players[leftIndex];
                        }
                        if (!rightNeighbor && this.players[rightIndex].isAlive) {
                            rightNeighbor = this.players[rightIndex];
                        }
                        
                        if (leftNeighbor && rightNeighbor) break;
                    }
                    
                    let evilCount = 0;
                    if (leftNeighbor && this.isPlayerEvil(leftNeighbor)) evilCount++;
                    if (rightNeighbor && this.isPlayerEvil(rightNeighbor)) evilCount++;
                    
                    this.io.to(actingPlayer.socketId).emit('empathInfo', {
                        evilCount: evilCount,
                        leftNeighbor: leftNeighbor?.playerName || 'None',
                        rightNeighbor: rightNeighbor?.playerName || 'None'
                    });
                    
                    console.log(`Empath learns that ${evilCount} of their neighbors are evil.`);
                }
                break;

            case 'Fortune Teller':
                if (this.gamePhase === 'Night') {
                    const otherAlivePlayers = this.players
                        .filter(p => p.isAlive && p.socketId !== actingPlayer.socketId)
                        .map(p => ({ socketId: p.socketId, playerName: p.playerName }));

                    this.io.to(actingPlayer.socketId).emit('fortuneTellerChoosePlayers', { 
                        players: otherAlivePlayers 
                    });
                }
                break;

            case 'Undertaker':
                if (this.gamePhase === 'Night' && this.dayCount > 1) {
                    const executedToday = this.pastExecutions[this.pastExecutions.length - 1];
                    if (executedToday) {
                        this.io.to(actingPlayer.socketId).emit('undertakerInfo', {
                            executedPlayer: executedToday.playerName,
                            role: executedToday.role.name
                        });
                    } else {
                        this.io.to(actingPlayer.socketId).emit('undertakerInfo', {
                            message: "No execution occurred today."
                        });
                    }
                }
                break;

            case 'Butler':
                if (this.gamePhase === 'Night') {
                    const otherAlivePlayers = this.players
                        .filter(p => p.isAlive && p.socketId !== actingPlayer.socketId)
                        .map(p => ({ socketId: p.socketId, playerName: p.playerName }));

                    this.io.to(actingPlayer.socketId).emit('butlerChoosePlayer', { 
                        players: otherAlivePlayers 
                    });
                }
                break;

            case 'Imp':
                if (this.gamePhase === 'Night') {
                    const allAlivePlayers = this.players
                        .filter(p => p.isAlive)
                        .map(p => ({ socketId: p.socketId, playerName: p.playerName }));

                    this.io.to(actingPlayer.socketId).emit('impChooseTarget', { 
                        players: allAlivePlayers 
                    });
                }
                break;

            case 'Poisoner':
                if (this.gamePhase === 'Night') {
                    const otherAlivePlayers = this.players
                        .filter(p => p.isAlive && p.socketId !== actingPlayer.socketId)
                        .map(p => ({ socketId: p.socketId, playerName: p.playerName }));

                    this.io.to(actingPlayer.socketId).emit('poisonerChooseTarget', { 
                        players: otherAlivePlayers 
                    });
                }
                break;

            case 'Spy':
                if (this.gamePhase === 'Night') {
                    const grimoire = this.players.map(p => ({
                        playerName: p.playerName,
                        role: p.role.name,
                        isAlive: p.isAlive,
                        isPoisoned: p.isPoisoned
                    }));
                    
                    this.io.to(actingPlayer.socketId).emit('spyGrimoire', { grimoire });
                    console.log("Spy views the grimoire and learns all roles in play.");
                }
                break;

            case 'Scarlet Woman':
                if (this.gamePhase === 'Night' && this.players.filter(p => p.isAlive).length >= 5) {
                    const impPlayer = this.players.find(p => p.role.name === 'Imp');
                    if (impPlayer && !impPlayer.isAlive) {
                        actingPlayer.role = Roles.DEMON.roles.IMP;
                        this.io.to(actingPlayer.socketId).emit('roleChanged', actingPlayer.role);
                        console.log(`${actingPlayer.playerName} becomes the new Imp!`);
                    }
                }
                break;

            // Passive abilities that don't need night actions
            case 'Virgin':
            case 'Soldier':
            case 'Mayor':
            case 'Saint':
            case 'Recluse':
            case 'Baron':
                // These are handled elsewhere or are passive
                break;

            default:
                console.log(`No ability logic found for role: ${role.name}`);
                break;
        }
    }

    // Handle special death triggers
    handlePlayerDeath(player, cause) {
        // Ravenkeeper ability
        if (player.role.name === 'Ravenkeeper' && cause === 'night') {
            const otherAlivePlayers = this.players
                .filter(p => p.isAlive && p.socketId !== player.socketId)
                .map(p => ({ socketId: p.socketId, playerName: p.playerName }));

            this.io.to(player.socketId).emit('ravenkeeperChooseTarget', { 
                players: otherAlivePlayers 
            });
        }

        // Mayor ability
        if (player.role.name === 'Mayor' && cause === 'night') {
            const aliveTownsfolk = this.players.filter(p => 
                p.isAlive && 
                Object.values(Roles.TOWNSFOLK.roles).some(r => r.name === p.role.name) &&
                p.socketId !== player.socketId
            );
            
            if (aliveTownsfolk.length > 0) {
                const replacement = aliveTownsfolk[Math.floor(Math.random() * aliveTownsfolk.length)];
                replacement.playerDies();
                console.log(`Mayor died, ${replacement.playerName} dies instead.`);
                this.io.to(this.gameCode).emit('playerDied', { 
                    player: replacement, 
                    cause: 'mayor_replacement' 
                });
            }
        }

        // Saint ability
        if (player.role.name === 'Saint' && cause === 'execution') {
            this.endGame('Evil wins - Saint executed');
        }

        // Virgin ability (handled during nomination phase)
        // Check win conditions after death
        const winCondition = this.checkWinCondition();
        if (winCondition) {
            this.endGame(winCondition);
        }
    }

    dayPhase() {
        this.gamePhase = 'Day';
        this.executionOccurred = false;
        
        // Clear poison from previous day (poison lasts through night and day)
        this.players.forEach(player => {
            if (player.isPoisoned && this.dayCount > 1) {
                player.isPoisoned = false;
            }
        });
        
        // Check Mayor win condition
        const mayorPlayer = this.players.find(p => p.role.name === 'Mayor' && p.isAlive);
        if (mayorPlayer && this.players.filter(p => p.isAlive).length === 3 && !this.executionOccurred) {
            this.endGame('Good wins - Mayor condition met');
            return;
        }
        
        console.log(`Day ${this.dayCount} begins`);
        this.io.to(this.gameCode).emit('dayPhaseStarted');
    }

    handleVote(voterSocketId, targetSocketId) {
        const voter = this.players.find(p => p.socketId === voterSocketId);
        const target = this.players.find(p => p.socketId === targetSocketId);
        
        if (!voter || !target || !voter.isAlive || !voter.canVote) {
            return false;
        }
        
        // Butler restriction
        if (voter.role.name === 'Butler' && voter.masterSocketId) {
            const master = this.players.find(p => p.socketId === voter.masterSocketId);
            if (master && !master.hasVoted) {
                return false; // Butler can't vote unless master has voted
            }
        }
        
        if (!this.voteTally[targetSocketId]) {
            this.voteTally[targetSocketId] = 0;
        }
        
        this.voteTally[targetSocketId]++;
        voter.playerVotes();
        voter.hasVoted = true;
        return true;
    }

    checkWinCondition() {
        const aliveEvil = this.players.filter(p => p.isAlive && this.isPlayerEvil(p)).length;
        const aliveGood = this.players.filter(p => p.isAlive && !this.isPlayerEvil(p)).length;

        if (aliveEvil === 0) {
            return 'Good wins - Demon eliminated';
        }
        if (aliveEvil >= aliveGood) {
            return 'Evil wins - Equal or more evil than good';
        }
        return null; // Game continues
    }

    endGame(winCondition) {
        this.gamePhase = 'Ended';
        console.log(`Game ended: ${winCondition}`);
        this.io.to(this.gameCode).emit('gameEnded', { winCondition });
        this.io.to(this.hostSocketId).emit('gameEnded', { winCondition });
    }

    handleFortuneTellerInvestigation(fortuneTellerSocketId, target1SocketId, target2SocketId) {
    const target1 = this.players.find(p => p.socketId === target1SocketId);
    const target2 = this.players.find(p => p.socketId === target2SocketId);
    
    if (!target1 || !target2 || target1.socketId === target2.socketId) return;

    // Check if either target is evil or the red herring
    const isTarget1Evil = this.isPlayerEvil(target1) || target1.socketId === this.redHerring?.socketId;
    const isTarget2Evil = this.isPlayerEvil(target2) || target2.socketId === this.redHerring?.socketId;
    
    const result = isTarget1Evil || isTarget2Evil ? "YES" : "NO";
    
    this.io.to(fortuneTellerSocketId).emit('fortuneTellerResult', {
        target1: target1.playerName,
        target2: target2.playerName,
        result: result
    });
    
    console.log(`Fortune Teller learned: ${target1.playerName} and ${target2.playerName} - ${result}`);
}

// Enhanced Ravenkeeper handling
handleRavenkeeperChoice(ravenkeeperSocketId, targetSocketId) {
    const ravenkeeper = this.players.find(p => p.socketId === ravenkeeperSocketId);
    const target = this.players.find(p => p.socketId === targetSocketId);
    
    if (ravenkeeper && target && ravenkeeper.role.name === 'Ravenkeeper') {
        ravenkeeper.ravenkeeperTarget = target;
        console.log(`Ravenkeeper chose ${target.playerName}. Will learn their role if Ravenkeeper dies.`);
        this.io.to(ravenkeeperSocketId).emit('actionConfirmed', `You will learn ${target.playerName}'s role if you die.`);
    }
}

// Enhanced death handling with proper triggers
handlePlayerDeath(player, cause) {
    console.log(`${player.playerName} died from: ${cause}`);
    
    // Ravenkeeper ability - only triggers on night death
    if (player.role.name === 'Ravenkeeper' && cause === 'demon' && player.ravenkeeperTarget) {
        const target = player.ravenkeeperTarget;
        this.io.to(player.socketId).emit('ravenkeeperInfo', {
            targetPlayer: target.playerName,
            role: target.role.name
        });
        console.log(`Ravenkeeper learns ${target.playerName} is the ${target.role.name}`);
    }

    // Mayor ability - if Mayor dies at night, another townsfolk dies instead
    if (player.role.name === 'Mayor' && cause === 'demon') {
        const aliveTownsfolk = this.players.filter(p => 
            p.isAlive && 
            Object.values(Roles.TOWNSFOLK.roles).some(r => r.name === p.role.name) &&
            p.socketId !== player.socketId
        );
        
        if (aliveTownsfolk.length > 0) {
            const replacement = aliveTownsfolk[Math.floor(Math.random() * aliveTownsfolk.length)];
            replacement.playerDies();
            console.log(`Mayor died, ${replacement.playerName} dies instead.`);
            this.io.to(this.gameCode).emit('playerDied', { 
                player: replacement, 
                cause: 'mayor_replacement' 
            });
        }
    }

    // Saint ability - if executed, evil team wins
    if (player.role.name === 'Saint' && cause === 'execution') {
        this.endGame('Evil wins - Saint executed');
        return;
    }

    // Check win conditions after death
    const winCondition = this.checkWinCondition();
    if (winCondition) {
        this.endGame(winCondition);
    }
}

    // Enhanced voting system with vote counting
    handleVote(voterSocketId, targetSocketId) {
        const voter = this.players.find(p => p.socketId === voterSocketId);
        const target = this.players.find(p => p.socketId === targetSocketId);
        
        if (!voter || !target || !voter.isAlive || !voter.canVote || voter.hasVoted) {
            return false;
        }
        
        // Butler restriction - can only vote if master has voted or master is dead
        if (voter.role.name === 'Butler' && voter.masterSocketId) {
            const master = this.players.find(p => p.socketId === voter.masterSocketId);
            if (master && master.isAlive && !master.hasVoted) {
                return false; // Butler can't vote unless master has voted
            }
        }
        
        if (!this.voteTally[targetSocketId]) {
            this.voteTally[targetSocketId] = [];
        }
        
        this.voteTally[targetSocketId].push(voterSocketId);
        voter.hasVoted = true;
        
        return true;
    }

    // Vote result calculation
    calculateVoteResults() {
        const results = {};
        Object.keys(this.voteTally).forEach(targetSocketId => {
            const target = this.players.find(p => p.socketId === targetSocketId);
            if (target) {
                results[target.playerName] = this.voteTally[targetSocketId].length;
            }
        });
        
        // Find player(s) with most votes
        const maxVotes = Math.max(...Object.values(results));
        const playersWithMaxVotes = Object.keys(results).filter(name => results[name] === maxVotes);
        
        return {
            results,
            maxVotes,
            playersWithMaxVotes
        };
    }

    // Enhanced day phase with voting mechanics
    dayPhase() {
        this.gamePhase = 'Day';
        this.executionOccurred = false;
        this.voteTally = {};
        
        // Clear poison (lasts one day/night cycle)
        this.players.forEach(player => {
            if (player.isPoisoned && this.dayCount > 1) {
                player.isPoisoned = false;
            }
            player.resetVoting();
            player.isNominated = false;
        });
        
        // Check Mayor win condition (3 players alive, no execution)
        const mayorPlayer = this.players.find(p => p.role.name === 'Mayor' && p.isAlive);
        const alivePlayers = this.players.filter(p => p.isAlive);
        
        if (mayorPlayer && alivePlayers.length === 3 && this.dayCount > 1 && !this.executionOccurred) {
            this.endGame('Good wins - Mayor condition met (3 players alive, no execution)');
            return;
        }
        
        console.log(`Day ${this.dayCount} begins`);
        this.io.to(this.gameCode).emit('dayPhaseStarted', {
            dayCount: this.dayCount,
            alivePlayers: alivePlayers.length
        });
    }

    // Enhanced nomination handling with Virgin ability
    handleNomination(nominatorSocketId, nomineeSocketId) {
        const nominator = this.players.find(p => p.socketId === nominatorSocketId);
        const nominee = this.players.find(p => p.socketId === nomineeSocketId);
        
        if (!nominator || !nominee || !nominator.isAlive || !nominee.isAlive) {
            return false;
        }
        
        nominee.isNominated = true;
        
        // Virgin ability - first nomination triggers
        if (nominee.role.name === 'Virgin' && !nominee.virginTriggered) {
            nominee.virginTriggered = true;
            
            // Check if nominator is a Townsfolk
            const isTownsfolk = Object.values(Roles.TOWNSFOLK.roles).some(r => r.name === nominator.role.name);
            
            if (isTownsfolk) {
                nominator.playerDies();
                this.io.to(this.gameCode).emit('virginTriggered', {
                    nominator: nominator.playerName,
                    virgin: nominee.playerName
                });
                this.io.to(this.gameCode).emit('playerDied', { 
                    player: nominator, 
                    cause: 'virgin' 
                });
                console.log(`Virgin ability triggered: ${nominator.playerName} (Townsfolk) died for nominating the Virgin`);
                
                // Check win conditions
                const winCondition = this.checkWinCondition();
                if (winCondition) {
                    this.endGame(winCondition);
                    return true;
                }
            }
        }
        
        this.io.to(this.gameCode).emit('playerNominated', {
            nominator: nominator.playerName,
            nominee: nominee.playerName
        });
        
        return true;
    }

    // Enhanced win condition checking
    checkWinCondition() {
        const aliveEvil = this.players.filter(p => p.isAlive && this.isPlayerEvil(p));
        const aliveGood = this.players.filter(p => p.isAlive && !this.isPlayerEvil(p));

        console.log(`Win check - Evil: ${aliveEvil.length}, Good: ${aliveGood.length}`);

        // Evil wins if no demon alive (shouldn't happen normally)
        if (aliveEvil.length === 0 || !aliveEvil.some(p => p.role.name === 'Imp')) {
            return 'Good wins - Demon eliminated';
        }
        
        // Evil wins if evil players >= good players
        if (aliveEvil.length >= aliveGood.length) {
            return 'Evil wins - Equal or more evil than good players';
        }
        
        // Special Mayor win condition is checked in dayPhase()
        
        return null; // Game continues
    }

    // End game with proper cleanup
    endGame(winCondition) {
        this.gamePhase = 'Ended';
        console.log(`Game ended: ${winCondition}`);
        
        // Reveal all roles to all players
        const finalGameState = {
            winCondition,
            players: this.players.map(p => ({
                playerName: p.playerName,
                role: p.role.name,
                isAlive: p.isAlive,
                team: this.getPlayerTeam(p)
            }))
        };
        
        this.io.to(this.gameCode).emit('gameEnded', finalGameState);
        this.io.to(this.hostSocketId).emit('gameEnded', finalGameState);
    }

    // Helper to determine player team
    getPlayerTeam(player) {
        const roleName = player.role.name;
        
        if (Object.values(Roles.TOWNSFOLK.roles).some(r => r.name === roleName)) {
            return 'Townsfolk';
        } else if (Object.values(Roles.OUTSIDER.roles).some(r => r.name === roleName)) {
            return 'Outsider';
        } else if (Object.values(Roles.MINION.roles).some(r => r.name === roleName)) {
            return 'Minion';
        } else if (Object.values(Roles.DEMON.roles).some(r => r.name === roleName)) {
            return 'Demon';
        }
        
        return 'Unknown';
    }

}

module.exports = { Game };