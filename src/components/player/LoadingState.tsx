// src/components/player/LoadingState.tsx - Enhanced with slow-connection messaging
import React, { useState, useEffect } from 'react';

interface LoadingStateProps {
    source: 'preloaded' | 'subscription';
}

export const LoadingState: React.FC<LoadingStateProps> = ({ source }) => {
    const [showSlowMessage, setShowSlowMessage] = useState(false);

    // ✅ FIX: After 8 seconds, show "connection seems slow" to reassure user
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowSlowMessage(true);
        }, 8_000); // 8 seconds

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-lg text-foreground">
                    {showSlowMessage
                        ? 'Connection seems slow...'
                        : source === 'preloaded' ? 'Loading games...' : 'Connecting to game server...'}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                    {showSlowMessage
                        ? 'Still trying to connect. Please check your internet connection.'
                        : source === 'preloaded' ? 'Fast loading enabled' : 'Enhanced view with winners'}
                </p>
            </div>
        </div>
    );
};
