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
            console.error('❌ Error fetching theme:', error);
            return DEFAULT_THEME_SETTINGS;
        }
    }

    /**
     * Save theme settings to Firebase
     */
    async saveTheme(settings: ThemeSettings): Promise<boolean> {
        try {
            await set(ref(database, THEME_PATH), {
                ...settings,
                updatedAt: Date.now(),
            });
            console.log('✅ Theme saved successfully');
            return true;
        } catch (error) {
            console.error('❌ Error saving theme:', error);
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
                console.log('ℹ️ Theme: Using defaults (not authenticated)');
            } else {
                console.error('❌ Theme subscription error:', error);
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
     * Apply theme colors to CSS variables
     */
    applyThemeToDocument(colors: ThemeColors): void {
        const root = document.documentElement;

        root.style.setProperty('--primary', colors.primary);
        root.style.setProperty('--secondary', colors.secondary);
        root.style.setProperty('--background', colors.background);
        root.style.setProperty('--accent', colors.accent);
        root.style.setProperty('--foreground', colors.foreground);

        // Also update derived colors for consistency
        root.style.setProperty('--ring', colors.primary);
        root.style.setProperty('--card', colors.background);
        root.style.setProperty('--popover', colors.background);

        console.log('🎨 Theme applied:', colors);
    }

    /**
     * Reset theme to defaults
     */
    resetToDefaults(): void {
        this.applyThemeToDocument(THEME_PRESETS.default.colors);
    }
}

export const themeService = new ThemeService();
