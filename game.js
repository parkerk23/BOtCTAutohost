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
        this.executeAbility();
    }

    executeAbility() {
        // Get all roles and sort by night order
        const allRoles = [
            ...Object.values(Roles.TOWNSFOLK.roles),
            ...Object.values(Roles.OUTSIDER.roles),
            ...Object.values(Roles.MINION.roles),
            ...Object.values(Roles.DEMON.roles)
        ];
        
        const sortedRoles = allRoles.sort((a, b) => a.nightOrder - b.nightOrder);

        for (const role of sortedRoles) {
            this.handleAbility(role);
        }
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
                    let randomRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];
                    let getRandomRole = () => {
                        if (randomRole === 'Imp' || randomRole === 'Poisoner' || randomRole === 'Spy' || randomRole === 'Baron' || randomRole === 'Scarlet Woman' ){
                            return getRandomRole(); 
                        }
                        return randomRole;
                    }
                    let getRandomPlayers = () => {
                        let player1 = this.players[Math.floor(Math.random() * this.players.length)].playerName;
                        let player2 = this.players[Math.floor(Math.random() * this.players.length)].playerName;
                        if (player1 === player2) {
                            return getRandomPlayers();
                        }
                        if (player1.role.name !== randomRole.name && player2.role.name !== randomRole.name) {
                            return getRandomPlayers();
                        }
                        return [player1, player2];
                    }
                
                    console.log("Washerwoman learns that one of these two players is the, ", getRandomRole(), " ", getRandomPlayers());
                }
                break;
            case 'Monk':
                console.log("It's the Monk's turn.");
                if (this.gamePhase === 'Night') {
                    let protectedPlayer = getElementbyId('monkProtectSelect').value;
                    protectedPlayer.isProtected = true;
                    console.log(`Monk protects ${protectedPlayer.playerName} for the night.`);
                }
                break;
            case 'Librarian':
                console.log("It's the Librarian's turn.");
                if (this.dayCount === 1) {
                    if (availableRoles.includes('Saint') || availableRoles.includes('Butler') || availableRoles.includes('Recluse')){
                        let getRandomRole = () => {
                            let randomRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];
                                if (randomRole === 'Saint' || randomRole === 'Butler' || randomRole === 'Recluse' ){
                                    return getRandomRole;
                                }
                            return randomRole();
                        }
                        console.log("Librarian learns that one of these two roles is the, ", getRandomRole());
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
                    let randomRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];
                    if (availableRoles.includes('Baron') || availableRoles.includes('Poisoner') || availableRoles.includes('Spy') || availableRoles.includes('Scarlet Woman')){
                        let getRandomRole = () => {
                                if (randomRole === 'Poisoner' || randomRole === 'Spy' || randomRole === 'Baron' || randomRole === 'Scarlet Woman'  ){
                                    return randomRole;
                                }
                            return randomRole();
                        }
                    }
                    let getRandomPlayers = () => {
                        let player1 = this.players[Math.floor(Math.random() * this.players.length)].playerName;
                        let player2 = this.players[Math.floor(Math.random() * this.players.length)].playerName;
                        if (player1 === player2) {
                            return getRandomPlayers();
                        }
                        if (player1.role.name !== randomRole.name && player2.role.name !== randomRole.name) {
                            return getRandomPlayers();
                        }
                        return [player1, player2];
                    }
                    console.log("Investigator learns that one of these two players is the, ", getRandomRole(), " ", getRandomPlayers());
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
                for (let i = this.players.length - 1; i >= 0; i--) {
                    if (players[i].role.teamRoles === 'Minion' || players[i].role.teamRoles === 'Demon' && players[i + 1].role.teamRoles === 'Minion' || players[i + 1].role.teamRoles === 'Demon') {
                        pairCount++;
                    }
                }
                if (players[0].role.teamRoles === 'Minion' || players[0].role.teamRoles === 'Demon' && players[this.players.length].role.teamRoles === 'Minion' || player[this.players.length].role.teamRoles === 'Demon') {
                    pairCount++;
                }
                break;
            case 'Slayer':
                console.log("It's the Slayer's turn.");
                break;
            case 'Soldier':
                console.log("It's the Soldier's turn.");
                break;
            case 'Mayor':
                console.log("It's the Mayor's turn.");
                break;
            case 'Empath':
                console.log("It's the Empath's turn.");
                break;
            case 'Fortune Teller':
                console.log("It's the Fortune Teller's turn.");
                break;
            case 'Undertaker':
                console.log("It's the Undertaker's turn.");
                break;
            case 'Saint':
                console.log("It's the Saint's turn.");
                break;
            case 'Imp':
                console.log("It's the Imp's turn.");
                break;
            case 'Poisoner':
                console.log("It's the Poisoner's turn.");
                break;
            case 'Spy':
                console.log("It's the Spy's turn.");
                break;
            case 'Baron':
                console.log("It's the Baron's turn.");
                break;
            case 'Scarlet Woman':
                console.log("It's the Scarlet Woman's turn.");
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