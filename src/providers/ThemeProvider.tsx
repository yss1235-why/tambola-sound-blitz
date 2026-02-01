// src/providers/ThemeProvider.tsx - Theme context for Player/Host views

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { themeService } from '@/services/theme-service';
import { ThemeSettings, ThemeColors, DEFAULT_THEME_SETTINGS, THEME_PRESETS } from '@/types/theme';

interface ThemeContextValue {
    settings: ThemeSettings;
    colors: ThemeColors;
    isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
    children: React.ReactNode;
}

/**
 * ThemeProvider - Subscribes to theme settings and applies CSS variables
 * Only wraps Player/Host views (not Admin dashboard)
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_THEME_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    // Calculate active colors based on settings
    const colors = themeService.getActiveColors(settings);

    useEffect(() => {
        // Subscribe to theme changes from Firebase
        const unsubscribe = themeService.subscribeToTheme((newSettings) => {
            setSettings(newSettings);
            setIsLoading(false);

            // Only apply if enabled for all players
            if (newSettings.enabledForAll) {
                themeService.applyThemeToDocument(themeService.getActiveColors(newSettings));
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    // Apply theme colors to document when settings change
    useEffect(() => {
        if (!isLoading && settings.enabledForAll) {
            themeService.applyThemeToDocument(colors);
        }
    }, [settings, colors, isLoading]);

    const contextValue: ThemeContextValue = {
        settings,
        colors,
        isLoading,
    };

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    );
};

/**
 * Hook to access theme context
 */
export const useTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        // Return default values if used outside provider (e.g., in Admin dashboard)
        return {
            settings: DEFAULT_THEME_SETTINGS,
            colors: THEME_PRESETS.default.colors,
            isLoading: false,
        };
    }
    return context;
};

/**
 * Hook to get just the theme colors
 */
export const useThemeColors = (): ThemeColors => {
    const { colors } = useTheme();
    return colors;
};
