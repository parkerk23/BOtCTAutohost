class Player{
    constructor(socketId, playerName){ 
        this.socketId = socketId;
        this.playerName = playerName;
        this.role = "";
        this.isDrunk = false;
        this.isPoisoned = false;
        this.isAlive = true;
        this.canVote = true;
        this.isProtected = false; 
        this.isNominated = false;
        this.slayerUsed = false;
        this.hasVoted = false;
        this.virginTriggered = false;
        this.masterSocketId = null; // For Butler
        this.ravenkeeperTarget = null; // For Ravenkeeper
    }

    playerDies() {
        this.isAlive = false;
        console.log(this.playerName, ' has died');
    }

    playerVotes() { 
        if (this.isAlive && this.canVote) { 
            this.canVote = false;
            this.hasVoted = true;
        }
    }

    resetVoting() {
        this.canVote = true;
        this.hasVoted = false;
    }
}

module.exports = { Player };