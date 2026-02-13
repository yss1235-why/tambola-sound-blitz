// src/components/player/LoadingState.tsx - Extracted from UserLandingPage
import React from 'react';

interface LoadingStateProps {
    source: 'preloaded' | 'subscription';
}

export const LoadingState: React.FC<LoadingStateProps> = ({ source }) => {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-lg text-foreground">
                    {source === 'preloaded' ? 'Loading games...' : 'Connecting to game server...'}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                    {source === 'preloaded' ? 'Fast loading enabled' : 'Enhanced view with winners'}
                </p>
            </div>
        </div>
    );
};
