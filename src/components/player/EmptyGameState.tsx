// src/components/player/EmptyGameState.tsx - Extracted from UserLandingPage
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export const EmptyGameState: React.FC = () => {
    return (
        <Card className="bg-card/90 backdrop-blur-sm rounded-2xl shadow-xl border border-border">
            <CardContent className="p-8 text-center">
                <div className="text-2xl mb-4 text-muted-foreground">No Games</div>
                <h2 className="text-2xl font-bold text-foreground mb-2">No Games Available</h2>
                <p className="text-muted-foreground mb-4">
                    There are currently no active or recent Tambola games. Check back soon!
                </p>
                <Button
                    onClick={() => window.location.reload()}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </CardContent>
        </Card>
    );
};
