const { Game } = require('./game.js');
const { Player } = require('./player.js');
const { Teams } = require('./roles');

// A simple mock object for the Socket.IO instance
// This prevents errors since the Game class expects 'io' in its constructor
const mockIo = {
    to: () => ({
        emit: () => {}
    })
};

// Function to run a single test case for a given number of players
function runTest(playerCount) {
    console.log(`\n--- Testing with ${playerCount} players ---`);
    const game = new Game('TEST', mockIo);

    // Add players to the game instance
    for (let i = 1; i <= playerCount; i++) {
        game.addPlayer(`socket_id_${i}`, `Player ${i}`);
    }

    // Assign roles and log the results
    game.assignRoles();

    const roleCounts = {};
    game.players.forEach(player => {
        const teamName = player.role.name;
        if (roleCounts[teamName]) {
            roleCounts[teamName]++;
        } else {
            roleCounts[teamName] = 1;
        }
        console.log(`${player.playerName} -> ${player.role.name}`);
    });

    console.log("\nRole Summary:");
    console.log(roleCounts);
    console.log("-----------------------------------------");
}

// Run tests for different player counts to verify each case
runTest(5);
runTest(6);
runTest(7);
runTest(8);
runTest(9);
runTest(10);