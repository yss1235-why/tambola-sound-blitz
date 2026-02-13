// src/components/player/GameCard.tsx - Extracted from UserLandingPage
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Trophy,
    Gamepad2,
    Phone,
    Ticket,
    CheckCircle
} from 'lucide-react';

export interface GameSummary {
    gameId: string;
    name: string;
    hostPhone?: string;
    maxTickets: number;
    isActive: boolean;
    isCountdown: boolean;
    hasStarted: boolean;
    gameOver: boolean;
    bookedTickets: number;
    createdAt: string;
    winnerCount?: number;
    prizesWon?: number;
    totalPrizes?: number;
}

interface GameCardProps {
    game: GameSummary;
    isFirst: boolean;
    onSelect: (gameId: string) => void;
}

export const GameCard: React.FC<GameCardProps> = ({ game, isFirst, onSelect }) => {
    const getStatusBadge = () => {
        if (game.isActive) return { variant: 'default' as const, text: 'Live', className: '' };
        if (game.isCountdown) return { variant: 'secondary' as const, text: 'Starting', className: '' };
        if (game.hasStarted && !game.gameOver) return { variant: 'destructive' as const, text: 'Playing', className: '' };
        if (game.gameOver) return { variant: 'outline' as const, text: 'Completed', className: 'border-accent/40 text-accent bg-accent/10' };
        return { variant: 'outline' as const, text: 'Booking', className: '' };
    };

    const status = getStatusBadge();

    return (
        <Card
            className={`cursor-pointer transition-all duration-200 border-border hover:border-primary/40 hover:shadow-lg ${isFirst ? 'ring-2 ring-primary/30' : ''
                } ${game.gameOver ? 'bg-accent/10' : ''}`}
            onClick={() => onSelect(game.gameId)}
        >
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex-1">
                        <h3 className="font-bold text-foreground text-lg">{game.name}</h3>
                        {isFirst && <p className="text-xs text-primary font-medium">Most Recent</p>}
                    </div>
                    <Badge variant={status.variant} className={status.className}>
                        {status.text}
                    </Badge>
                </div>

                <div className="space-y-3">
                    {!game.gameOver ? (
                        <>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <Ticket className="w-4 h-4 mr-2 text-primary" />
                                    <span className="text-sm text-muted-foreground">Tickets</span>
                                </div>
                                <span className="font-semibold text-primary">
                                    {game.bookedTickets}/{game.maxTickets}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <Trophy className="w-4 h-4 mr-2 text-accent" />
                                    <span className="text-sm text-muted-foreground">Available</span>
                                </div>
                                <span className="font-semibold text-accent">
                                    {game.maxTickets - game.bookedTickets} tickets
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <Trophy className="w-4 h-4 mr-2 text-primary" />
                                    <span className="text-sm text-muted-foreground">Winners</span>
                                </div>
                                <span className="font-semibold text-primary">
                                    {game.winnerCount || 0} players
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <CheckCircle className="w-4 h-4 mr-2 text-accent" />
                                    <span className="text-sm text-muted-foreground">Prizes Won</span>
                                </div>
                                <span className="font-semibold text-accent">
                                    {game.prizesWon || 0}/{game.totalPrizes || 0}
                                </span>
                            </div>
                        </>
                    )}

                    {game.hostPhone && (
                        <div className="flex items-center">
                            <Phone className="w-4 h-4 mr-2 text-accent" />
                            <span className="text-sm text-muted-foreground">{game.hostPhone}</span>
                        </div>
                    )}
                </div>

                <div className="mt-4 pt-3 border-t">
                    <Button
                        className={`w-full ${game.gameOver
                                ? 'bg-accent hover:bg-accent/90 text-accent-foreground'
                                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                            }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(game.gameId);
                        }}
                    >
                        {game.gameOver ? (
                            <>
                                <Trophy className="w-4 h-4 mr-2" />
                                View Winners
                            </>
                        ) : game.hasStarted ? (
                            <>
                                <Gamepad2 className="w-4 h-4 mr-2" />
                                Watch Game
                            </>
                        ) : (
                            <>
                                <Ticket className="w-4 h-4 mr-2" />
                                Join Game
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
