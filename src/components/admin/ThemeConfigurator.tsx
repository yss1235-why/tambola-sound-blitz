// src/components/admin/ThemeConfigurator.tsx - Admin UI for theme configuration

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Palette, Check, Loader2, Save } from 'lucide-react';
import { themeService } from '@/services/theme-service';
import {
    ThemeSettings,
    PresetTheme,
    THEME_PRESETS,
    DEFAULT_THEME_SETTINGS,
    ThemeColors
} from '@/types/theme';
import { useToast } from '@/hooks/use-toast';

interface ThemeConfiguratorProps {
    adminUid: string;
}

export const ThemeConfigurator: React.FC<ThemeConfiguratorProps> = ({ adminUid }) => {
    const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_THEME_SETTINGS);
    const [customColors, setCustomColors] = useState<ThemeColors>(THEME_PRESETS.default.colors);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    // Load current theme settings
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const currentSettings = await themeService.getTheme();
                setSettings(currentSettings);
                if (currentSettings.custom) {
                    setCustomColors(currentSettings.custom);
                }
            } catch (error) {
                console.error('Error loading theme:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadTheme();
    }, []);

    const handlePresetSelect = (preset: PresetTheme) => {
        setSettings(prev => ({
            ...prev,
            preset,
            custom: preset === 'custom' ? customColors : undefined,
        }));
    };

    const handleCustomColorChange = (key: keyof ThemeColors, value: string) => {
        setCustomColors(prev => ({
            ...prev,
            [key]: value,
        }));

        if (settings.preset === 'custom') {
            setSettings(prev => ({
                ...prev,
                custom: {
                    ...customColors,
                    [key]: value,
                },
            }));
        }
    };

    const handleToggleEnabled = (enabled: boolean) => {
        setSettings(prev => ({
            ...prev,
            enabledForAll: enabled,
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const settingsToSave: ThemeSettings = {
                ...settings,
                custom: settings.preset === 'custom' ? customColors : undefined,
                updatedBy: adminUid,
                updatedAt: Date.now(),
            };

            const success = await themeService.saveTheme(settingsToSave);

            if (success) {
                toast({
                    title: '✅ Theme Saved',
                    description: `${THEME_PRESETS[settings.preset].name} theme applied to all players.`,
                });
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            toast({
                title: '❌ Error',
                description: 'Failed to save theme. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <Card className="bg-slate-800 border-slate-700">
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Palette className="h-6 w-6 text-purple-400" />
                        <div>
                            <CardTitle className="text-white">Theme Settings</CardTitle>
                            <CardDescription className="text-slate-400">
                                Customize the look for Player and Host views
                            </CardDescription>
                        </div>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        {isSaving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                    <div>
                        <Label className="text-white font-medium">Enable Theme for All Players</Label>
                        <p className="text-sm text-slate-400">
                            When enabled, all players and hosts will see the selected theme
                        </p>
                    </div>
                    <Switch
                        checked={settings.enabledForAll}
                        onCheckedChange={handleToggleEnabled}
                    />
                </div>

                {/* Preset Themes Grid */}
                <div>
                    <Label className="text-white font-medium mb-3 block">Preset Themes</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {(Object.keys(THEME_PRESETS) as PresetTheme[])
                            .filter(id => id !== 'custom')
                            .map((presetId) => {
                                const preset = THEME_PRESETS[presetId];
                                const isSelected = settings.preset === presetId;

                                return (
                                    <button
                                        key={presetId}
                                        onClick={() => handlePresetSelect(presetId)}
                                        className={`relative p-4 rounded-xl border-2 transition-all ${isSelected
                                                ? 'border-purple-500 ring-2 ring-purple-500/50'
                                                : 'border-slate-600 hover:border-slate-500'
                                            }`}
                                    >
                                        {/* Color Preview */}
                                        <div
                                            className="h-16 rounded-lg mb-3"
                                            style={{ background: preset.preview.gradient }}
                                        />

                                        {/* Theme Name */}
                                        <p className="text-white font-medium text-sm">{preset.name}</p>
                                        <p className="text-slate-400 text-xs">{preset.description}</p>

                                        {/* Selected Indicator */}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 bg-purple-500 rounded-full p-1">
                                                <Check className="h-3 w-3 text-white" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                    </div>
                </div>

                {/* Custom Colors Section */}
                <div className="border-t border-slate-700 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <Label className="text-white font-medium">Custom Colors</Label>
                            <p className="text-sm text-slate-400">Create your own color scheme</p>
                        </div>
                        <Button
                            variant={settings.preset === 'custom' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePresetSelect('custom')}
                            className={settings.preset === 'custom' ? 'bg-purple-600' : ''}
                        >
                            {settings.preset === 'custom' && <Check className="h-3 w-3 mr-1" />}
                            Use Custom
                        </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { key: 'primary' as const, label: 'Primary', desc: 'Main accent color' },
                            { key: 'secondary' as const, label: 'Secondary', desc: 'Supporting color' },
                            { key: 'background' as const, label: 'Background', desc: 'Page background' },
                            { key: 'accent' as const, label: 'Accent', desc: 'Highlights' },
                        ].map(({ key, label, desc }) => (
                            <div key={key} className="space-y-2">
                                <Label className="text-slate-300 text-sm">{label}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="text"
                                        value={customColors[key]}
                                        onChange={(e) => handleCustomColorChange(key, e.target.value)}
                                        placeholder="HSL value"
                                        className="bg-slate-700 border-slate-600 text-white text-xs"
                                        disabled={settings.preset !== 'custom'}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Current Status */}
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Badge variant="outline" className="border-slate-600">
                        Current: {THEME_PRESETS[settings.preset].name}
                    </Badge>
                    {settings.enabledForAll ? (
                        <Badge className="bg-green-600">Active</Badge>
                    ) : (
                        <Badge variant="outline" className="border-orange-500 text-orange-400">Disabled</Badge>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
