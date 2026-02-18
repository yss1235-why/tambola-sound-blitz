// src/components/player/ErrorState.tsx - Enhanced with timeout-specific messaging
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, WifiOff } from 'lucide-react';

interface ErrorStateProps {
    error: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ error }) => {
    const isTimeout = error.toLowerCase().includes('timed out');

    return (
        <div className="min-h-screen bg-background p-4 flex items-center justify-center">
            <Card className="max-w-md w-full">
                <CardContent className="p-8 text-center">
                    {isTimeout ? (
                        <>
                            <WifiOff className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <h2 className="text-2xl font-bold text-foreground mb-2">Slow Connection</h2>
                            <p className="text-muted-foreground mb-4">
                                We couldn't reach the game server. Please check your internet connection and try again.
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="text-2xl mb-4 text-destructive">Warning</div>
                            <h2 className="text-2xl font-bold text-foreground mb-2">Connection Error</h2>
                            <p className="text-muted-foreground mb-4">{error}</p>
                        </>
                    )}
                    <Button onClick={() => window.location.reload()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
