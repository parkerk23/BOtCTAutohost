const Roles = Object.freeze({
    TOWNSFOLK: {
        name: 'Townsfolk',
        description: 'You win if the Demon is executed.',
        roles: {
            WASHERWOMAN: {
                name: 'Washerwoman',
                ability: 'You start knowing that 1 of 2 players is a particular Townsfolk.',
                nightOrder: 1,
            },
            MONK: {
                name: 'Monk',
                ability: 'Each night*, choose a player (not yourself) they are safe from the demon',
                nightOrder: 2,
            },
            LIBRARIAN: { 
                name: 'Librarian',
                ability: 'You start knowing that 1 of 2 players is a particular Outsider (or that zero are in play)',
                nightOrder: 1,
            },
            RAVENKEEPER: {
                name: 'Ravenkeeper',
                ability: 'If you die at night you are woken to choose a player you learn their ability',
                nightOrder: 3
            },
            INVESTIGATOR: {
                name: 'Investigator',
                ability: 'You start knowing that 1 of 2 players is a particular minion',
                nightOrder: 1 
            },
            VIRGIN: {
                name: 'Virgin',
                ability: 'The 1st time you are nominated if the nominator is a Townsfolk they are executed immediatley',
                nightOrder: 3 
            },
            CHEF: {
                name: 'Chef',
                ability: 'You start knowing how many pairs of evil players there are',
                nightOrder: 1
            },            
            SLAYER: {
                name: 'Slayer',
                ability: 'Once per game, during the day, publicly choose a player, if they are the demon, they die',
                nightOrder: 3 
            },
            SOLDIER: {
                name: 'Soldier',
                ability: 'You are safe from the demon',
                nightOrder: 3
            },
            MAYOR: {
                name: 'Mayor',
                ability: 'If only 3 players lives & no execution occurs, you team wins. If you die at night, another player might die instead',
                nightOrder: 2 
            },
            EMPATH: {
                name: 'Empath',
                ability: 'Each night, you learn how many of your 2 alive neighbors are evil',
                nightOrder: 2 
            },
            FORTUNETELLER: {
                name: 'Fortune Teller',
                ability: 'Each night, choose 2 players you learn if either is a Demon. There is a good player that registers as a Demon to you',
                nightOrder: 2 
            },
            UNDERTAKER: {
                name: 'Undertaker',
                ability: 'Each night* you learn which character died by execution today',
                nightOrder: 2 
            },
        },
    },
    OUTSIDER: {
        name: 'Outsider',
        description: 'You win if the townsfolk win',
        roles: {
            SAINT: { 
                name: 'Saint',
                ability: 'If you die by execution your team loses',
                nightOrder: 3
            },
            RECLUSE: { 
                name: 'Recluse',
                ability: 'You might register as evil & as a minion or demon even if dead',
                nightOrder: 3
            },
            BUTLER: { 
                name: 'Butler',
                ability: 'Each night, choose a player (not yourself) you may only vote if they are voting too',
                nightOrder: 3
            }
        },
    },
    DEMON: {
        name: 'Demon',
        description: 'You win if you are the last player alive.',
        roles: {
            IMP: {
                name: 'Imp',
                ability: 'Choose a player to kill at night. They die, if you kill yourself a minion becomes the imp',
                nightOrder: 2,
            },
        },
    },
    MINION: {
        name: 'Minion',
        description: 'You win if the Demon wins.',
        roles: {
            POISONER: {
                name: 'Poisoner',
                ability: 'Each night* choose a player they are poisoned tonight and tomorrow day',
                nightOrder: 1,
            },
            SPY: {
                name: 'Spy',
                ability: 'Each night, you see the grimoire You might register as good & a townsfolk or outsider even if dead.',
                nightOrder: 1,
            },
            BARON: {
                name: 'Baron',
                ability: 'There are extra Outsiders in play (+2 Outsiders)',
                nightOrder: 3,
            },
            SCARLETWOMAN: {
                name: 'Scarlet Woman',
                ability: 'If there are 5 or more players alive & the demon dies, you become the demon',
                nightOrder: 3,
            },
        },
    },
});

module.exports = { Roles };