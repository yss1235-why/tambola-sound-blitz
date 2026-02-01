// src/types/theme.ts - Complete theme type definitions with full color coverage

export type PresetTheme = 'default' | 'neon' | 'festive' | 'ocean' | 'sunset' | 'midnight' | 'custom';

// Extended color interface for complete UI transformation
export interface ThemeColors {
    // Core colors
    primary: string;           // Main brand color (buttons, links)
    primaryForeground: string; // Text on primary backgrounds
    secondary: string;         // Secondary elements
    secondaryForeground: string;
    background: string;        // Page background
    foreground: string;        // Main text color

    // UI elements
    accent: string;            // Highlights, badges
    accentForeground: string;
    muted: string;             // Subtle backgrounds
    mutedForeground: string;   // Muted text

    // Cards and containers
    card: string;
    cardForeground: string;

    // Borders and inputs
    border: string;
    input: string;
    ring: string;              // Focus ring

    // Game-specific colors
    gameCalled: string;        // Called number background
    gameCalledForeground: string;
    gameCurrent: string;       // Currently called number
    gameCurrentForeground: string;
    gameCell: string;          // Default number cell
    gameCellForeground: string;

    // Body gradient
    bodyGradientFrom: string;
    bodyGradientVia: string;
    bodyGradientTo: string;
}

export interface ThemePreset {
    id: PresetTheme;
    name: string;
    description: string;
    colors: ThemeColors;
    preview: {
        gradient: string;  // CSS gradient for preview card
    };
}

export interface ThemeSettings {
    preset: PresetTheme;
    custom?: ThemeColors;
    enabledForAll: boolean;
    updatedAt: number;
    updatedBy: string;  // admin uid
}

// Complete preset theme definitions
export const THEME_PRESETS: Record<PresetTheme, ThemePreset> = {
    default: {
        id: 'default',
        name: 'Default',
        description: 'Classic rose and slate theme',
        colors: {
            primary: '346.8 77.2% 49.8%',
            primaryForeground: '355.7 100% 97.3%',
            secondary: '240 3.7% 15.9%',
            secondaryForeground: '0 0% 98%',
            background: '240 10% 3.9%',
            foreground: '0 0% 98%',
            accent: '240 3.7% 15.9%',
            accentForeground: '0 0% 98%',
            muted: '240 3.7% 15.9%',
            mutedForeground: '240 5% 64.9%',
            card: '240 10% 3.9%',
            cardForeground: '0 0% 98%',
            border: '240 3.7% 15.9%',
            input: '240 3.7% 15.9%',
            ring: '346.8 77.2% 49.8%',
            gameCalled: '142 76% 36%',
            gameCalledForeground: '0 0% 100%',
            gameCurrent: '346.8 77.2% 49.8%',
            gameCurrentForeground: '0 0% 100%',
            gameCell: '240 4.8% 95.9%',
            gameCellForeground: '240 10% 3.9%',
            bodyGradientFrom: '210 40% 96%',
            bodyGradientVia: '210 20% 94%',
            bodyGradientTo: '215 28% 90%',
        },
        preview: {
            gradient: 'linear-gradient(135deg, #e11d48 0%, #1e293b 100%)',
        },
    },
    neon: {
        id: 'neon',
        name: 'Neon Night',
        description: 'Vibrant cyan and magenta on black',
        colors: {
            primary: '174 100% 50%',
            primaryForeground: '0 0% 0%',
            secondary: '300 100% 50%',
            secondaryForeground: '0 0% 100%',
            background: '0 0% 5%',
            foreground: '0 0% 100%',
            accent: '217 100% 60%',
            accentForeground: '0 0% 100%',
            muted: '0 0% 15%',
            mutedForeground: '0 0% 70%',
            card: '0 0% 8%',
            cardForeground: '0 0% 100%',
            border: '0 0% 20%',
            input: '0 0% 12%',
            ring: '174 100% 50%',
            gameCalled: '174 100% 50%',
            gameCalledForeground: '0 0% 0%',
            gameCurrent: '300 100% 50%',
            gameCurrentForeground: '0 0% 100%',
            gameCell: '0 0% 15%',
            gameCellForeground: '0 0% 100%',
            bodyGradientFrom: '260 100% 5%',
            bodyGradientVia: '280 100% 5%',
            bodyGradientTo: '0 0% 3%',
        },
        preview: {
            gradient: 'linear-gradient(135deg, #00FFD1 0%, #FF00FF 100%)',
        },
    },
    festive: {
        id: 'festive',
        name: 'Festive Gold',
        description: 'Golden and red celebration',
        colors: {
            primary: '45 100% 50%',
            primaryForeground: '0 0% 10%',
            secondary: '0 84% 50%',
            secondaryForeground: '0 0% 100%',
            background: '30 50% 8%',
            foreground: '45 100% 95%',
            accent: '45 100% 60%',
            accentForeground: '0 0% 10%',
            muted: '30 30% 15%',
            mutedForeground: '45 30% 70%',
            card: '30 40% 12%',
            cardForeground: '45 100% 95%',
            border: '30 40% 25%',
            input: '30 30% 18%',
            ring: '45 100% 50%',
            gameCalled: '45 100% 50%',
            gameCalledForeground: '0 0% 10%',
            gameCurrent: '0 84% 50%',
            gameCurrentForeground: '0 0% 100%',
            gameCell: '30 30% 20%',
            gameCellForeground: '45 100% 95%',
            bodyGradientFrom: '0 60% 12%',
            bodyGradientVia: '15 50% 10%',
            bodyGradientTo: '30 40% 8%',
        },
        preview: {
            gradient: 'linear-gradient(135deg, #FFD700 0%, #DC2626 100%)',
        },
    },
    ocean: {
        id: 'ocean',
        name: 'Ocean Deep',
        description: 'Calm teal and blue depths',
        colors: {
            primary: '199 89% 48%',
            primaryForeground: '0 0% 100%',
            secondary: '217 91% 60%',
            secondaryForeground: '0 0% 100%',
            background: '222 47% 11%',
            foreground: '180 100% 95%',
            accent: '166 76% 67%',
            accentForeground: '222 47% 11%',
            muted: '220 40% 18%',
            mutedForeground: '199 50% 70%',
            card: '220 45% 14%',
            cardForeground: '180 100% 95%',
            border: '220 40% 25%',
            input: '220 40% 18%',
            ring: '199 89% 48%',
            gameCalled: '166 76% 50%',
            gameCalledForeground: '222 47% 11%',
            gameCurrent: '199 89% 48%',
            gameCurrentForeground: '0 0% 100%',
            gameCell: '220 40% 22%',
            gameCellForeground: '180 100% 95%',
            bodyGradientFrom: '220 60% 15%',
            bodyGradientVia: '210 50% 12%',
            bodyGradientTo: '200 45% 10%',
        },
        preview: {
            gradient: 'linear-gradient(135deg, #0EA5E9 0%, #1E3A5F 100%)',
        },
    },
    sunset: {
        id: 'sunset',
        name: 'Sunset Blaze',
        description: 'Warm orange and pink glow',
        colors: {
            primary: '24 95% 53%',
            primaryForeground: '0 0% 100%',
            secondary: '330 81% 60%',
            secondaryForeground: '0 0% 100%',
            background: '270 50% 12%',
            foreground: '0 0% 100%',
            accent: '45 93% 58%',
            accentForeground: '270 50% 12%',
            muted: '280 40% 18%',
            mutedForeground: '330 40% 75%',
            card: '275 45% 15%',
            cardForeground: '0 0% 100%',
            border: '280 40% 25%',
            input: '280 40% 18%',
            ring: '24 95% 53%',
            gameCalled: '45 93% 58%',
            gameCalledForeground: '270 50% 12%',
            gameCurrent: '24 95% 53%',
            gameCurrentForeground: '0 0% 100%',
            gameCell: '280 35% 22%',
            gameCellForeground: '0 0% 100%',
            bodyGradientFrom: '280 60% 15%',
            bodyGradientVia: '300 50% 12%',
            bodyGradientTo: '320 45% 10%',
        },
        preview: {
            gradient: 'linear-gradient(135deg, #F97316 0%, #EC4899 100%)',
        },
    },
    midnight: {
        id: 'midnight',
        name: 'Midnight',
        description: 'Pure dark mode with blue accents',
        colors: {
            primary: '217 91% 60%',
            primaryForeground: '0 0% 100%',
            secondary: '215 20.2% 65.1%',
            secondaryForeground: '0 0% 100%',
            background: '222.2 84% 4.9%',
            foreground: '210 40% 98%',
            accent: '217.2 32.6% 17.5%',
            accentForeground: '210 40% 98%',
            muted: '217.2 32.6% 17.5%',
            mutedForeground: '215 20.2% 65.1%',
            card: '222.2 84% 6%',
            cardForeground: '210 40% 98%',
            border: '217.2 32.6% 17.5%',
            input: '217.2 32.6% 17.5%',
            ring: '224.3 76.3% 48%',
            gameCalled: '217 91% 60%',
            gameCalledForeground: '0 0% 100%',
            gameCurrent: '224.3 76.3% 48%',
            gameCurrentForeground: '0 0% 100%',
            gameCell: '217.2 32.6% 15%',
            gameCellForeground: '210 40% 98%',
            bodyGradientFrom: '222 84% 6%',
            bodyGradientVia: '220 70% 5%',
            bodyGradientTo: '215 60% 4%',
        },
        preview: {
            gradient: 'linear-gradient(135deg, #3B82F6 0%, #0F172A 100%)',
        },
    },
    custom: {
        id: 'custom',
        name: 'Custom',
        description: 'Your own color scheme',
        colors: {
            primary: '346.8 77.2% 49.8%',
            primaryForeground: '355.7 100% 97.3%',
            secondary: '240 3.7% 15.9%',
            secondaryForeground: '0 0% 98%',
            background: '240 10% 3.9%',
            foreground: '0 0% 98%',
            accent: '240 3.7% 15.9%',
            accentForeground: '0 0% 98%',
            muted: '240 3.7% 15.9%',
            mutedForeground: '240 5% 64.9%',
            card: '240 10% 3.9%',
            cardForeground: '0 0% 98%',
            border: '240 3.7% 15.9%',
            input: '240 3.7% 15.9%',
            ring: '346.8 77.2% 49.8%',
            gameCalled: '142 76% 36%',
            gameCalledForeground: '0 0% 100%',
            gameCurrent: '346.8 77.2% 49.8%',
            gameCurrentForeground: '0 0% 100%',
            gameCell: '240 4.8% 95.9%',
            gameCellForeground: '240 10% 3.9%',
            bodyGradientFrom: '210 40% 96%',
            bodyGradientVia: '210 20% 94%',
            bodyGradientTo: '215 28% 90%',
        },
        preview: {
            gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
        },
    },
};

// Default theme settings
export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
    preset: 'default',
    enabledForAll: true,
    updatedAt: Date.now(),
    updatedBy: '',
};
