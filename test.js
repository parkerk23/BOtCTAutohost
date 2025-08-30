const { Game } = require('./game.js');
const { Player } = require('./player.js');
const { Roles } = require('./roles'); // Fixed: import Roles instead of Teams

// Function to run a single test case for a given number of players
function runTest(playerCount) {
    console.log(`\n--- Testing with ${playerCount} players ---`);
    const game = new Game('TEST');

    // Add players to the game instance
    for (let i = 1; i <= playerCount; i++) {
        game.addPlayer(`socket_id_${i}`, `Player ${i}`);
    }

    // Assign roles and log the results
    game.assignRoles();

    // Count roles by team
    const teamCounts = {
        'Townsfolk': 0,
        'Outsider': 0,
        'Minion': 0,
        'Demon': 0
    };

    const roleCounts = {};
    
    game.players.forEach(player => {
        const roleName = player.role.name;
        
        // Count individual roles
        if (roleCounts[roleName]) {
            roleCounts[roleName]++;
        } else {
            roleCounts[roleName] = 1;
        }

        // Count by team
        if (Object.values(Roles.TOWNSFOLK.roles).some(r => r.name === roleName)) {
            teamCounts['Townsfolk']++;
        } else if (Object.values(Roles.OUTSIDER.roles).some(r => r.name === roleName)) {
            teamCounts['Outsider']++;
        } else if (Object.values(Roles.MINION.roles).some(r => r.name === roleName)) {
            teamCounts['Minion']++;
        } else if (Object.values(Roles.DEMON.roles).some(r => r.name === roleName)) {
            teamCounts['Demon']++;
        }

        console.log(`${player.playerName} -> ${player.role.name}`);
    });

    console.log("\nTeam Summary:");
    console.log(teamCounts);
    console.log("\nRole Summary:");
    console.log(roleCounts);
    
    // Validate role distribution
    const expectedCounts = getExpectedCounts(playerCount);
    console.log("\nExpected vs Actual:");
    console.log(`Townsfolk: ${teamCounts['Townsfolk']} (expected: ${expectedCounts.townsfolk})`);
    console.log(`Outsiders: ${teamCounts['Outsider']} (expected: ${expectedCounts.outsiders})`);
    console.log(`Minions: ${teamCounts['Minion']} (expected: ${expectedCounts.minions})`);
    console.log(`Demons: ${teamCounts['Demon']} (expected: ${expectedCounts.demons})`);
    
    // Check for Baron effect
    const hasBaron = Object.keys(roleCounts).includes('Baron');
    if (hasBaron) {
        console.log("✓ Baron detected - should have +2 outsiders");
    }
    
    console.log("-----------------------------------------");
}

function getExpectedCounts(playerCount) {
    let townsfolk = 0, outsiders = 0, minions = 0, demons = 1;
    
    if (playerCount === 5) {
        townsfolk = 3; minions = 1;
    } else if (playerCount === 6) {
        townsfolk = 3; outsiders = 1; minions = 1;
    } else if (playerCount === 7) {
        townsfolk = 5; minions = 1;
    } else if (playerCount === 8) {
        townsfolk = 5; outsiders = 1; minions = 1;
    } else if (playerCount === 9) {
        townsfolk = 5; outsiders = 2; minions = 1;
    } else if (playerCount === 10) {
        townsfolk = 7; outsiders = 0; minions = 2;
    }
    
    return { townsfolk, outsiders, minions, demons };
}

// Test role uniqueness
function testRoleUniqueness() {
    console.log("\n=== Testing Role Uniqueness ===");
    
    for (let testRun = 0; testRun < 5; testRun++) {
        console.log(`\nTest run ${testRun + 1}:`);
        const game = new Game('UNIQUENESS_TEST');
        
        // Add 10 players for maximum role variety
        for (let i = 1; i <= 10; i++) {
            game.addPlayer(`socket_id_${i}`, `Player ${i}`);
        }
        
        game.assignRoles();
        
        const assignedRoles = game.players.map(p => p.role.name);
        const uniqueRoles = [...new Set(assignedRoles)];
        
        console.log(`Assigned roles: ${assignedRoles.join(', ')}`);
        console.log(`Unique roles: ${uniqueRoles.length}/${assignedRoles.length}`);
        
        if (uniqueRoles.length !== assignedRoles.length) {
            console.log("❌ DUPLICATE ROLES DETECTED!");
            const duplicates = assignedRoles.filter((role, index) => assignedRoles.indexOf(role) !== index);
            console.log(`Duplicates: ${duplicates.join(', ')}`);
        } else {
            console.log("✓ All roles unique");
        }
    }
}

// Run tests for different player counts
console.log("=== Blood on the Clocktower Role Assignment Tests ===");
runTest(5);
runTest(6);
runTest(7);
runTest(8);
runTest(9);
runTest(10);

// Test role uniqueness
testRoleUniqueness();