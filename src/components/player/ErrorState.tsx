// src/components/player/ErrorState.tsx - Extracted from UserLandingPage
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
    error: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ error }) => {
    return (
        <div className="min-h-screen bg-background p-4 flex items-center justify-center">
            <Card className="max-w-md w-full">
                <CardContent className="p-8 text-center">
                    <div className="text-2xl mb-4 text-destructive">Warning</div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Connection Error</h2>
                    <p className="text-muted-foreground mb-4">{error}</p>
                    <Button onClick={() => window.location.reload()}>
                        Try Again
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
