// safe-cleanup.cjs - Remove emoji characters without touching quotes
const fs = require('fs');
const path = require('path');

// All project source files
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
    'src/pages/Index.tsx'
];

// Only remove specific corrupted emoji patterns - NO quotes
const corruptedPatterns = [
    /ðŸ"§\s*/g,
    /âœ…\s*/g,
    /ðŸ"¡\s*/g,
    /ðŸ'¾\s*/g,
    /ðŸŽ‰\s*/g,
    /âŒ\s*/g,
    /ðŸ"ˆ\s*/g,
    /ðŸ"\s*/g,
    /ðŸŽ®\s*/g,
    /ðŸ—'ï¸\s*/g,
    /âš ï¸\s*/g,
    /ðŸ†\s*/g,
    /ðŸš«\s*/g,
    /ðŸŽ¯\s*/g,
    /ðŸŽ«\s*/g,
    /ðŸ"´\s*/g,
    /ðŸ§¹\s*/g,
    /ðŸ±\s*/g,
    /ðŸ"\s*/g,
    /ðŸ\s*/g,
    /ðŸ›'\s*/g,
    /ðŸ""\s*/g,
    /ðŸ"\s*/g,
    /ðŸš¨\s*/g,
    /ðŸ"\s*/g,
    /ðŸ"\s*/g,
    /ðŸ"\s*/g,
    /âº\s*/g,
    /ðŸ›\s*/g,
    /â—\s*/g,
    /â„¹ï¸\s*/g,
    /â„\s*/g,
    /â™»ï¸\s*/g,
    /â™\s*/g,
    /âœ"\s*/g,
    /â•\s*/g,
    /â—†\s*/g,
    /â—‡\s*/g,
    /Ž¨\s*/g,  // corrupted paint palette
    /â€¢/g,    // corrupted bullet
];

// Arrow replacement
const arrowPattern = /â†'/g;
const arrowReplacement = '->';

let totalReplacements = 0;

files.forEach(filePath => {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
        return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let fileReplacements = 0;

    // Replace arrow
    const arrowMatches = content.match(arrowPattern);
    if (arrowMatches) {
        content = content.replace(arrowPattern, arrowReplacement);
        fileReplacements += arrowMatches.length;
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

console.log(`\nTotal: ${totalReplacements} replacements`);
