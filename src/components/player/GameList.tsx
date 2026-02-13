// src/components/player/GameList.tsx - Extracted from UserLandingPage
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard, GameSummary } from './GameCard';

interface GameListProps {
    games: GameSummary[];
    onSelectGame: (gameId: string) => void;
}

export const GameList: React.FC<GameListProps> = ({ games, onSelectGame }) => {
    return (
        <Card className="bg-card/90 backdrop-blur-sm rounded-2xl shadow-xl border border-border">
            <CardHeader>
                <CardTitle className="text-2xl text-foreground text-center">
                    Available Games ({games.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {games.map((game, index) => (
                        <GameCard
                            key={game.gameId}
                            game={game}
                            isFirst={index === 0}
                            onSelect={onSelectGame}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};
