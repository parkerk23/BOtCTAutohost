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
    }

    playerDies() {
        this.isAlive = false;
        console.log(this.playerName, ' has died');
    }

    playerVotes() { 
        if (this.isAlive && this.canVote) { 
            this.canVote = false
        }
    }
}

module.exports = { Player };
