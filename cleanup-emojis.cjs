// cleanup-emojis.cjs - Script to remove corrupted emoji characters from source files
const fs = require('fs');
const path = require('path');

// Files to clean
const files = [
    'src/components/GameHost.tsx',
    'src/components/HostDisplay.tsx',
    'src/components/UserLandingPage.tsx',
    'src/components/UserDisplay.tsx',
    'src/components/SimplifiedWinnerDisplay.tsx',
    'src/components/RecentWinnersDisplay.tsx',
    'src/components/PrizeTracker.tsx',
    'src/components/PrizeManagementPanel.tsx',
    'src/components/AudioStatusComponent.tsx',
    'src/pages/Index.tsx',
    'src/providers/GameDataProvider.tsx',
    'src/providers/HostControlsProvider.tsx',
    'src/services/firebase-game.ts',
    'src/services/TambolaGameMachine.ts',
    'src/components/AudioManager.tsx'
];

// ALL corrupted emoji patterns to remove
const corruptedPatterns = [
    // Common corrupted emojis - remove or simplify
    /ðŸ"§\s*/g,  // wrench
    /âœ…\s*/g,  // check mark
    /ðŸ"¡\s*/g,  // signal
    /ðŸ'¾\s*/g,  // save
    /ðŸŽ‰\s*/g,  // celebration
    /âŒ\s*/g,   // X mark
    /ðŸ"ˆ\s*/g,  // chart
    /ðŸ"\s*/g,  // flag
    /ðŸŽ®\s*/g,  // game controller
    /ðŸ—'ï¸\s*/g, // trash
    /âš ï¸\s*/g, // warning
    /ðŸ†\s*/g,  // trophy
    /ðŸš«\s*/g,  // prohibited
    /ðŸŽ¯\s*/g,  // bullseye
    /ðŸŽ«\s*/g,  // ticket
    /ðŸ"´\s*/g,  // red circle
    /ðŸ§¹\s*/g,  // broom
    /ðŸ±\s*/g,  // cat
    /ðŸ"\s*/g,  // magnifying glass
    /ðŸ\s*/g,  // incomplete pattern
    /ðŸ›'\s*/g,  // stop sign
    /ðŸ""\s*/g,  // bell
    /ðŸ"\s*/g,  // another magnifier
    /ðŸš¨\s*/g,  // siren
    /ðŸ"\s*/g,  // lock
    /ðŸ"\s*/g,  // file
    /ðŸ"\s*/g,  // another search
    /âº\s*/g,   // incomplete marker
    /ðŸ›\s*/g,  // bug
    /ðŸ\s*/g,  // misc incomplete
    /â € /g,    // weird space
    /â€¢/g,     // bullet
    /â—\s*/g,   // diamond
    /â—\s*/g,   // misc
    /â„¹ï¸\s*/g, // info
    /â„\s*/g,   // misc
    /â™»ï¸\s*/g, // recycle
    /â™\s*/g,   // misc
    /âœ"\s*/g,  // check
    /â•\s*/g,   // misc
    /â—†\s*/g,  // diamond filled
    /â—‡\s*/g   // diamond empty
];

// Arrow replacement
const arrowPattern = /â†'/g;
const arrowReplacement = '->';

// Bullet replacement
const bulletPattern = /â€¢/g;
const bulletReplacement = '*';

let totalReplacements = 0;

files.forEach(filePath => {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
        console.log(`File not found (skipping): ${filePath}`);
        return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let fileReplacements = 0;

    // Replace arrow with proper arrow
    const arrowMatches = content.match(arrowPattern);
    if (arrowMatches) {
        content = content.replace(arrowPattern, arrowReplacement);
        fileReplacements += arrowMatches.length;
    }

    // Replace bullet
    const bulletMatches = content.match(bulletPattern);
    if (bulletMatches) {
        content = content.replace(bulletPattern, bulletReplacement);
        fileReplacements += bulletMatches.length;
    }

    // Remove corrupted emoji patterns
    corruptedPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
            content = content.replace(pattern, '');
            fileReplacements += matches.length;
        }
    });

    if (fileReplacements > 0) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`${filePath}: ${fileReplacements} replacements`);
        totalReplacements += fileReplacements;
    } else {
        console.log(`${filePath}: no changes needed`);
    }
});

console.log(`\nTotal: ${totalReplacements} replacements across all files`);
