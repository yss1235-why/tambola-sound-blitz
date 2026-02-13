// src/services/theme-service.ts - Firebase theme storage and sync

import { ref, get, set, onValue, off } from 'firebase/database';
import { database } from '@/services/firebase-core';
import { ThemeSettings, DEFAULT_THEME_SETTINGS, THEME_PRESETS, ThemeColors } from '@/types/theme';

const THEME_PATH = 'systemSettings/theme';

class ThemeService {
    private unsubscribe: (() => void) | null = null;

    /**
     * Get current theme settings from Firebase
     */
    async getTheme(): Promise<ThemeSettings> {
        try {
            const snapshot = await get(ref(database, THEME_PATH));
            if (snapshot.exists()) {
                return snapshot.val() as ThemeSettings;
            }
            return DEFAULT_THEME_SETTINGS;
        } catch (error) {
            return DEFAULT_THEME_SETTINGS;
        }
    }

    /**
     * Save theme settings to Firebase
     */
    async saveTheme(settings: ThemeSettings): Promise<boolean> {
        try {
            // Firebase doesn't accept undefined values - filter them out
            const cleanSettings: Record<string, unknown> = {
                preset: settings.preset,
                enabledForAll: settings.enabledForAll,
                updatedAt: Date.now(),
            };

            // Only include custom if it exists
            if (settings.custom) {
                cleanSettings.custom = settings.custom;
            }

            // Include updatedBy if provided
            if (settings.updatedBy) {
                cleanSettings.updatedBy = settings.updatedBy;
            }

            await set(ref(database, THEME_PATH), cleanSettings);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Subscribe to theme changes in real-time
     */
    subscribeToTheme(callback: (settings: ThemeSettings) => void): () => void {
        const themeRef = ref(database, THEME_PATH);

        const handleValue = (snapshot: ReturnType<typeof onValue extends (ref: any, callback: (snapshot: infer S) => void) => any ? S : never>) => {
            if (snapshot.exists()) {
                callback(snapshot.val() as ThemeSettings);
            } else {
                callback(DEFAULT_THEME_SETTINGS);
            }
        };

        // Use Firebase onValue for real-time updates
        const unsubscribe = onValue(themeRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val() as ThemeSettings);
            } else {
                callback(DEFAULT_THEME_SETTINGS);
            }
        }, (error) => {
            // Permission denied is expected for unauthenticated users - use defaults silently
            const isPermissionError = error?.message?.includes('permission_denied');
            if (isPermissionError) {
            } else {
            }
            callback(DEFAULT_THEME_SETTINGS);
        });

        this.unsubscribe = unsubscribe;
        return unsubscribe;
    }

    /**
     * Unsubscribe from theme updates
     */
    cleanup(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    /**
     * Get the active theme colors (resolves preset or custom)
     */
    getActiveColors(settings: ThemeSettings): ThemeColors {
        if (settings.preset === 'custom' && settings.custom) {
            return settings.custom;
        }
        return THEME_PRESETS[settings.preset].colors;
    }

    /**
     * Apply ALL theme colors to CSS variables for complete transformation
     */
    applyThemeToDocument(colors: ThemeColors): void {
        const root = document.documentElement;

        // Core colors
        root.style.setProperty('--primary', colors.primary);
        root.style.setProperty('--primary-foreground', colors.primaryForeground);
        root.style.setProperty('--secondary', colors.secondary);
        root.style.setProperty('--secondary-foreground', colors.secondaryForeground);
        root.style.setProperty('--background', colors.background);
        root.style.setProperty('--foreground', colors.foreground);

        // Accent and muted
        root.style.setProperty('--accent', colors.accent);
        root.style.setProperty('--accent-foreground', colors.accentForeground);
        root.style.setProperty('--muted', colors.muted);
        root.style.setProperty('--muted-foreground', colors.mutedForeground);

        // Cards and containers
        root.style.setProperty('--card', colors.card);
        root.style.setProperty('--card-foreground', colors.cardForeground);
        root.style.setProperty('--popover', colors.card);
        root.style.setProperty('--popover-foreground', colors.cardForeground);

        // Borders and inputs
        root.style.setProperty('--border', colors.border);
        root.style.setProperty('--input', colors.input);
        root.style.setProperty('--ring', colors.ring);

        // Game-specific colors (custom properties)
        root.style.setProperty('--game-called', colors.gameCalled);
        root.style.setProperty('--game-called-foreground', colors.gameCalledForeground);
        root.style.setProperty('--game-current', colors.gameCurrent);
        root.style.setProperty('--game-current-foreground', colors.gameCurrentForeground);
        root.style.setProperty('--game-cell', colors.gameCell);
        root.style.setProperty('--game-cell-foreground', colors.gameCellForeground);

        // Body gradient
        root.style.setProperty('--body-gradient-from', colors.bodyGradientFrom);
        root.style.setProperty('--body-gradient-via', colors.bodyGradientVia);
        root.style.setProperty('--body-gradient-to', colors.bodyGradientTo);

        // Theme application log removed for performance
    }

    /**
     * Reset theme to defaults
     */
    resetToDefaults(): void {
        this.applyThemeToDocument(THEME_PRESETS.default.colors);
    }
}

export const themeService = new ThemeService();
