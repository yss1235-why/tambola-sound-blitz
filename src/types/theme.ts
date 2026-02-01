// src/types/theme.ts - Theme type definitions

export type PresetTheme = 'default' | 'neon' | 'festive' | 'ocean' | 'sunset' | 'custom';

export interface ThemeColors {
    primary: string;      // HSL value (e.g., "346.8 77.2% 49.8%")
    secondary: string;
    background: string;
    accent: string;
    foreground: string;
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

// Preset theme definitions
export const THEME_PRESETS: Record<PresetTheme, ThemePreset> = {
    default: {
        id: 'default',
        name: 'Default',
        description: 'Classic rose and slate theme',
        colors: {
            primary: '346.8 77.2% 49.8%',      // Rose
            secondary: '240 3.7% 15.9%',        // Slate
            background: '240 10% 3.9%',         // Dark
            accent: '346.8 77.2% 49.8%',        // Rose
            foreground: '0 0% 98%',             // White
        },
        preview: {
            gradient: 'linear-gradient(135deg, #e11d48 0%, #1e293b 100%)',
        },
    },
    neon: {
        id: 'neon',
        name: 'Neon',
        description: 'Vibrant cyan and magenta',
        colors: {
            primary: '174 100% 50%',            // Cyan
            secondary: '300 100% 50%',          // Magenta
            background: '0 0% 5%',              // Near black
            accent: '217 100% 60%',             // Electric blue
            foreground: '0 0% 100%',            // White
        },
        preview: {
            gradient: 'linear-gradient(135deg, #00FFD1 0%, #FF00FF 100%)',
        },
    },
    festive: {
        id: 'festive',
        name: 'Festive',
        description: 'Golden and red celebration',
        colors: {
            primary: '45 100% 50%',             // Gold
            secondary: '0 84% 50%',             // Red
            background: '0 50% 15%',            // Maroon
            accent: '0 0% 100%',                // White
            foreground: '0 0% 100%',            // White
        },
        preview: {
            gradient: 'linear-gradient(135deg, #FFD700 0%, #DC2626 100%)',
        },
    },
    ocean: {
        id: 'ocean',
        name: 'Ocean',
        description: 'Calm teal and blue',
        colors: {
            primary: '199 89% 48%',             // Teal
            secondary: '217 91% 60%',           // Blue
            background: '222 47% 11%',          // Navy
            accent: '166 76% 67%',              // Seafoam
            foreground: '0 0% 98%',             // White
        },
        preview: {
            gradient: 'linear-gradient(135deg, #0EA5E9 0%, #1E3A5F 100%)',
        },
    },
    sunset: {
        id: 'sunset',
        name: 'Sunset',
        description: 'Warm orange and pink',
        colors: {
            primary: '24 95% 53%',              // Orange
            secondary: '330 81% 60%',           // Pink
            background: '270 50% 20%',          // Purple
            accent: '45 93% 58%',               // Yellow
            foreground: '0 0% 100%',            // White
        },
        preview: {
            gradient: 'linear-gradient(135deg, #F97316 0%, #EC4899 100%)',
        },
    },
    custom: {
        id: 'custom',
        name: 'Custom',
        description: 'Your own color scheme',
        colors: {
            primary: '346.8 77.2% 49.8%',
            secondary: '240 3.7% 15.9%',
            background: '240 10% 3.9%',
            accent: '346.8 77.2% 49.8%',
            foreground: '0 0% 98%',
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
