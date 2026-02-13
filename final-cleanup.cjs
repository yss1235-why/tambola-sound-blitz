// final-cleanup.cjs - Final pass to remove any remaining stray characters
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

// Additional stray patterns - these are remaining fragments
const strayPatterns = [
    /[""]§\s*/g,  // quotation + section symbol
    /'§\s*/g,     // apostrophe + section symbol
    /§\s*/g,      // just section symbol
    /[""]/g       // curly quotes to straight quotes
];

let totalReplacements = 0;

files.forEach(filePath => {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
        return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let fileReplacements = 0;

    // Remove stray patterns
    strayPatterns.forEach(pattern => {
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
    }
});

console.log(`\nTotal: ${totalReplacements} final replacements`);
