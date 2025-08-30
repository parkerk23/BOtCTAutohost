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
        let currentRole = Roles.TOWNSFOLK.roles.WASHERWOMAN; 

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
            townsfolkCount = 5;
            outsiderCount = 2;
            minionCount = 2;
        } else {
            console.log("Player count not supported by the current role assignment logic.");
            return;
        }

        for (let i = 0; i < townsfolkCount; i++) {
            do{
                currentRole = this.getRandomRoleFromTeam(Roles.TOWNSFOLK.roles);
            }while (availableRoles.includes(currentRole));
            availableRoles.push(currentRole);
        }
        for (let i = 0; i < minionCount; i++) {
            do {
                currentRole = this.getRandomRoleFromTeam(Roles.MINION.roles);
            }while (availableRoles.includes(currentRole));
            availableRoles.push(currentRole);
        }
        const hasBaron = availableRoles.some(role => role.name === Roles.MINION.roles.BARON.name);
        if (hasBaron) {
            console.log("Baron is in play, adding 2 more outsiders.");
            outsiderCount +=2;
        }
        for (let i = 0; i < outsiderCount; i++) {
            availableRoles.push(this.getRandomRoleFromTeam(Roles.OUTSIDER.roles));
        }
        availableRoles.push(Roles.DEMON.roles.IMP);



        for (let i = availableRoles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableRoles[i], availableRoles[j]] = [availableRoles[j], availableRoles[i]];
        }

        this.players.forEach((player, index) => {
            player.role = availableRoles[index];
            // this.io.to(player.socketId).emit('roleAssigned', player.role);
        });
    }

    NightPhase() {
        this.gamePhase = 'Night';
        this.executeAbility();
    }

    executeAbility() {
        const sortedRoles = Object.values(Roles).flatMap(team => Object.values(team.roles)).sort((a, b) => a.nightOrder - b.nightOrder);

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
                break;
            case 'Monk':
                console.log("It's the Monk's turn.");
                break;
            case 'Librarian':
                console.log("It's the Librarian's turn.");
                break;
            case 'Ravenkeeper':
                console.log("It's the Ravenkeeper's turn.");
                break;
            case 'Investigator':
                console.log("It's the Investigator's turn.");
                break;
            case 'Virgin':
                console.log("It's the Virgin's turn.");
                break;
            case 'Chef':
                console.log("It's the Chef's turn.");
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
        // Logic for the day phase (discussion, voting)
    }

    handleVote() {
        // Logic for handling votes
    }

    endGame() {
        // Logic for checking win conditions and ending the game
    }
}

module.exports = { Game };
