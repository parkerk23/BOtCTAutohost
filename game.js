const { Player } = require('./player.js');
const { Roles } = require('./roles'); // Corrected import from Teams to Roles

class Game {
    constructor(gameCode) {
        this.gameCode = gameCode;
        this.players = [];
        this.gamePhase = 'Lobby';
        this.townsfolkCount = 0;
        this.demonCount = 0;
        this.voteTally = {};
        this.dayCount = 0;
        this.hostSocketId = null; // Track the host
        this.executionOccurred = false;
        this.pastExecutions = [];
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
        console.log(`Night ${this.dayCount} begins`);
        this.executeNightActions();
    }

    executeNightActions() {
        const allRoles = [...Object.values(Roles.TOWNSFOLK.roles), ...Object.values(Roles.OUTSIDER.roles), ...Object.values(Roles.MINION.roles), ...Object.values(Roles.DEMON.roles)];
        const sortedRoles = allRoles.sort((a, b) => a.nightOrder - b.nightOrder);

        for (const role of sortedRoles) {
            this.handleAbility(role);
        }
    }
    
    monkProtects(monkSocketId, protectedPlayerSocketId) {
        const protectedPlayer = this.players.find(p => p.socketId === protectedPlayerSocketId);
        if (protectedPlayer) {
            protectedPlayer.isProtected = true;
            console.log(`Monk (${monkSocketId}) protected ${protectedPlayer.playerName}.`);
            // You might need a way to track this protection for the rest of the night.
            // For example, an array of protected players or a 'protected' property on the player object.
        }
    }

    findPlayersByRoleName(roleName) {
        return this.players.filter(p => p.role.name === roleName);
    }

    handleAbility(role) {
        console.log(`Executing ability for role: ${role.name}`);
        const actingPlayer = this.players.find(p => p.role.name === role.name && p.isAlive);

        if (!actingPlayer) {
            console.log(`No active player found for role: ${role.name}`);
            return;
        }

        switch (role.name) {
            case 'Washerwoman':
                console.log("It's the Washerwoman's turn.");
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
                    }
                    
                    // Get all players that are not the Washerwoman or player1
                    const otherPlayers = this.players.filter(p => p.role.name !== 'Washerwoman' && p.playerName !== player1.playerName);
                    player2 = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                    
                    // Shuffle the two players for the reveal
                    const revealedPlayers = [player1, player2].sort(() => 0.5 - Math.random());
                    
                    // The Washerwoman learns one of the two revealed players is the hinted role
                    console.log(`Washerwoman learns one of these two players is the ${hintedRole.name}: ${revealedPlayers[0].playerName}, ${revealedPlayers[1].playerName}`);
                }
                break;

            case 'Monk':
                console.log("It's the Monk's turn.");
                if (this.gamePhase === 'Night' && this.dayCount > 1) {
                    let protectedPlayer = getElementbyId('monkProtectSelect').value;
                    protectedPlayer.isProtected = true;
                    console.log(`Monk protects ${protectedPlayer.playerName} for the night.`);
                }
                break;
            case 'Librarian':
                console.log("It's the Librarian's turn.");
                if (this.dayCount === 1) {
                    // Get all outsider roles
                    const allOutsiderRoles = Object.values(Roles.OUTSIDER.roles);
                    const allOutsidersInGame = this.players.filter(p => p.role.name in allOutsiderRoles);

                    if (allOutsidersInGame.length === 0) {
                        console.log("Librarian learns there are no outsiders in play.");
                    } else {
                        // Find players with outsider roles
                        const outsiderPlayer = allOutsidersInGame[Math.floor(Math.random() * allOutsidersInGame.length)];

                        // Choose another player to pair them with
                        const otherPlayers = this.players.filter(p => p.playerName !== outsiderPlayer.playerName && p.role.name !== 'Librarian');
                        const otherPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];

                        const revealedPlayers = [outsiderPlayer, otherPlayer].sort(() => 0.5 - Math.random());

                        console.log(`Librarian learns that one of these two players is an Outsider: ${revealedPlayers[0].playerName}, ${revealedPlayers[1].playerName}`);
                    }
                }
                break;
            case 'Ravenkeeper':
                console.log("It's the Ravenkeeper's turn.");
                if (this.playerDies() && this.gamePhase === 'Night') {
                    let chosenPlayer = getElementbyId('ravenkeeperSelect').value;
                    console.log(`Ravenkeeper chooses ${chosenPlayer.playerName}. If they die, Ravenkeeper learns their role.`);
                }
                break;
            case 'Investigator':
                console.log("It's the Investigator's turn.");
                if (this.dayCount === 1) {
                    // Get all minion roles
                    const allMinionRoles = Object.values(Roles.MINION.roles);
                    const minionsInGame = this.players.filter(p => p.role.name in allMinionRoles);
                    
                    // You would then implement a similar logic to the Washerwoman to reveal one minion.
                    // It should pick one minion and one other player, and reveal them.
                    let player1, player2;
                    if (minionsInGame.length > 0) {
                        player1 = minionsInGame[Math.floor(Math.random() * minionsInGame.length)];
                    }
                    
                    // Get all players that are not the Washerwoman or player1
                    const otherPlayers = this.players.filter(p => p.playerName !== player1.playerName);
                    player2 = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                    
                    // Shuffle the two players for the reveal
                    const revealedPlayers = [player1, player2].sort(() => 0.5 - Math.random());
                    
                    // The Washerwoman learns one of the two revealed players is the hinted role
                    console.log(`Washerwoman learns one of these two players is the ${hintedRole.name}: ${revealedPlayers[0].playerName}, ${revealedPlayers[1].playerName}`);
                }
                break;
            case 'Virgin':
                console.log("It's the Virgin's turn.");
                if (this.playerNominated) { 
                    this.playerDies();
                }
                break;
                case 'Chef':
                    console.log("It's the Chef's turn.");
                    let pairCount = 0;
                    const evilRoles = ['Imp', 'Poisoner', 'Spy', 'Baron', 'Scarlet Woman'];
                    
                    // Iterate through all players to check for adjacent evil pairs
                    for (let i = 0; i < this.players.length; i++) {
                        const currentPlayerRole = this.players[i].role.name;
                        const nextPlayerIndex = (i + 1) % this.players.length; // Use the modulo operator for a circular list
                        const nextPlayerRole = this.players[nextPlayerIndex].role.name;
                        
                        if (evilRoles.includes(currentPlayerRole) && evilRoles.includes(nextPlayerRole)) {
                            pairCount++;
                        }
                    }
                    
                    // Now you would send the count to the Chef via a socket.
                    console.log(`Chef learns there are ${pairCount} pairs of evil players.`);
                    break;
            case 'Slayer':
                console.log("It's the Slayer's turn.");
                if (this.gamePhase === 'Day' && this.slayerUsed === false) {
                    let chosenPlayer = getElementbyId('slayerSelect').value;
                    if (chosenPlayer.role.name === 'Imp') {
                        chosenPlayer.playerDies();
                        console.log(`Slayer has executed the Imp: ${chosenPlayer.playerName}`);
                    }
                }
                break;
            case 'Soldier':
                console.log("It's the Soldier's turn.");
                this.isProtected = true;
                break;
            case 'Mayor':
                console.log("It's the Mayor's turn.");
                if (this.playerDies() && this.gamePhase === 'Night') {
                    let replacementPlayer = this.findPlayersByRoleName(TOWNSFOLK).find(p => p.isAlive && p.playerName !== actingPlayer.playerName);
                    replacementPlayer.playerDies();
                    console.log(`Mayor has died, ${replacementPlayer.playerName} dies instead.`);
                }
                if (this.players.filter(p => p.isAlive).length === 3 && !this.executionOccurred) {
                    this.endGame('Good wins - Mayor condition met');
                }
                break;
            case 'Empath':
                console.log("It's the Empath's turn.");
                if (this.gamePhase === 'Night') {
                    const playerIndex = this.players.indexOf(actingPlayer);
                    const i = 1;
                    if(this.players[(playerIndex - i + this.players.length) % this.players.length].isAlive || this.players[(playerIndex + 1) % this.players.length].isAlive){
                        i += 1;
                        const leftNeighbor = this.players[(playerIndex - i + this.players.length) % this.players.length];
                        const rightNeighbor = this.players[(playerIndex + 1) % this.players.length];
                    }
                    const evilNeighbors = [leftNeighbor, rightNeighbor].filter(p => p.isAlive && 
                        (p.role.name === 'Imp' || Object.values(Roles.MINION.roles).some(r => r.name === p.role.name)));
                    console.log(`Empath learns that ${evilNeighbors.length} of their neighbors are evil.`);
                }
                break;
            case 'Fortune Teller':
                //ADD FUNCTIONALITY FOR ONE GOOD PLAYER THAT REGISTERS AS EVIL
                console.log("It's the Fortune Teller's turn.");
                if (this.gamePhase === 'Night') {
                    let chosenPlayer1 = getElementbyId('fortuneTellerSelect').value;
                    let chosenPlayer2 = getElementbyId('fortuneTellerSelect2').value;
                    const evilRoles = ['Imp', 'Poisoner', 'Spy', 'Baron', 'Scarlet Woman'];
                    const isEvil1 = evilRoles.includes(chosenPlayer1.role.name);
                    const isEvil2 = evilRoles.includes(chosenPlayer2.role.name);
                    console.log(`Fortune Teller learns: ${chosenPlayer1.playerName} is ${isEvil1 ? 'Evil' : 'Not Evil'}, ${chosenPlayer2.playerName} is ${isEvil2 ? 'Evil' : 'Not Evil'}`);
                }
                break;
            case 'Undertaker':
                console.log("It's the Undertaker's turn.");
                if (this.gamePhase === 'Night' && this.dayCount > 1) {
                    const executedToday = this.pastExecutions[this.pastExecutions.length - 1];
                    if (executedToday) {
                        console.log(`Undertaker learns that ${executedToday.playerName} was executed today and their role was ${executedToday.role.name}.`);
                    } else {
                        console.log("No execution occurred today, Undertaker learns nothing.");
                    }
                }
                break;
            case 'Saint':
                console.log("It's the Saint's turn.");
                if (this.playerDies() && this.gamePhase === 'Day') {
                    this.endGame('Evil wins - Saint executed');
                }
                break;
            case 'Recluse':
                //ADD CALLED ON FUNCTIONALITY
                console.log("It's the Recluse's turn.");
                let randomTeam = Math.random() < 0.5 ? 'Minion' : 'Demon';
                console.log(`Recluse registers as ${randomTeam} to any investigative roles.`);
                break;
            case 'Butler':
                console.log("It's the Butler's turn.");
                if (this.gamePhase === 'Night') {
                    let chosenPlayer = getElementbyId('butlerSelect').value;
                    console.log(`Butler chooses to align with ${chosenPlayer.playerName}. They can only vote if that player votes.`);
                }
                break;
            case 'Imp':
                console.log("It's the Imp's turn.");
                if (this.gamePhase === 'Night') {
                    let chosenPlayer = getElementbyId('impSelect').value;
                    if (chosenPlayer.socketId === actingPlayer.socketId) {
                        this.getRandomRoleFromTeam(Roles.MINION.roles);
                        console.log(`Imp has killed themselves. A minion becomes the new Imp.`);
                    }
                    if (!chosenPlayer.isProtected) {
                        chosenPlayer.playerDies();
                        console.log(`Imp has killed ${chosenPlayer.playerName}`);
                    } else {
                        console.log(`${chosenPlayer.playerName} was protected and survives the night.`);
                    }
                }
                break;
            case 'Poisoner':
                console.log("It's the Poisoner's turn.");
                if (this.gamePhase === 'Night') {
                    let chosenPlayer = getElementbyId('poisonerSelect').value;
                    chosenPlayer.isPoisoned = true;
                    console.log(`Poisoner has poisoned ${chosenPlayer.playerName}. They will be poisoned tonight and tomorrow.`);
                }
                break;
            case 'Spy':
                // ADD ROLES UNDER NAMES IN PLAYER HTML AS GRIMOIRE
                console.log("It's the Spy's turn.");
                if (this.gamePhase === 'Night') {
                    console.log("Spy views the grimoire and learns all roles in play.");
                }
                break;
            case 'Baron':
                console.log("It's the Baron's turn.");
                break;
            case 'Scarlet Woman':
                console.log("It's the Scarlet Woman's turn.");
                if (this.gamePhase === 'Night' && this.players.filter(p => p.isAlive).length >= 5) {
                    if (this.players.find(p => p.role.name === 'Imp' && p.isAlive === false) === undefined) {
                        this.player.role = Roles.DEMON.roles.IMP;
                        console.log(`Scarlet Woman becomes the new Imp!`);
                    }
                }
                break;
            default:
                console.log(`No ability logic found for role: ${role.name}`);
                break;
        }
    }

    dayPhase() {
        this.gamePhase = 'Day';
        console.log(`Day ${this.dayCount} begins`);
        // Logic for the day phase (discussion, voting)
    }

    handleVote(voterSocketId, targetSocketId) {
        const voter = this.players.find(p => p.socketId === voterSocketId);
        const target = this.players.find(p => p.socketId === targetSocketId);
        
        if (!voter || !target || !voter.isAlive || !voter.canVote) {
            return false;
        }
        
        if (!this.voteTally[targetSocketId]) {
            this.voteTally[targetSocketId] = 0;
        }
        
        this.voteTally[targetSocketId]++;
        voter.playerVotes();
        return true;
    }

    checkWinCondition() {
        const aliveEvil = this.players.filter(p => p.isAlive && (p.role.name === 'Imp' || 
            Object.values(Roles.MINION.roles).some(r => r.name === p.role.name))).length;
        const aliveGood = this.players.filter(p => p.isAlive && 
            (Object.values(Roles.TOWNSFOLK.roles).some(r => r.name === p.role.name) ||
             Object.values(Roles.OUTSIDER.roles).some(r => r.name === p.role.name))).length;

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
        // Logic for checking win conditions and ending the game
    }
}

module.exports = { Game };