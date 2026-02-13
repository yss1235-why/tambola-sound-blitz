// src/components/host/GameStats.tsx - Extracted from GameHost
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Ticket, Trophy, Clock } from 'lucide-react';

interface GameStatsProps {
    bookedCount: number;
    availableCount: number;
    totalCount: number;
    prizesWon: number;
    totalPrizes: number;
    calledNumbers: number;
    isActive: boolean;
    isCountdown: boolean;
    gameOver: boolean;
}

export const GameStats: React.FC<GameStatsProps> = ({
    bookedCount,
    availableCount,
    totalCount,
    prizesWon,
    totalPrizes,
    calledNumbers,
    isActive,
    isCountdown,
    gameOver
}) => {
    const getStatusBadge = () => {
        if (gameOver) return { variant: 'outline' as const, text: 'Completed', className: 'border-green-500/40 text-green-400' };
        if (isActive) return { variant: 'default' as const, text: 'Live', className: 'bg-green-500 animate-pulse' };
        if (isCountdown) return { variant: 'secondary' as const, text: 'Starting', className: 'bg-yellow-500/20 text-yellow-400' };
        return { variant: 'outline' as const, text: 'Booking', className: 'border-blue-500/40 text-blue-400' };
    };

    const status = getStatusBadge();

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Status */}
            <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="p-4 text-center">
                    <Clock className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                    <Badge variant={status.variant} className={status.className}>
                        {status.text}
                    </Badge>
                </CardContent>
            </Card>

            {/* Tickets */}
            <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="p-4 text-center">
                    <Ticket className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                    <p className="text-2xl font-bold text-white">{bookedCount}/{totalCount}</p>
                    <p className="text-xs text-gray-400">Tickets Booked</p>
                </CardContent>
            </Card>

            {/* Numbers Called */}
            <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="p-4 text-center">
                    <Users className="w-6 h-6 mx-auto mb-2 text-cyan-400" />
                    <p className="text-2xl font-bold text-white">{calledNumbers}/90</p>
                    <p className="text-xs text-gray-400">Numbers Called</p>
                </CardContent>
            </Card>

            {/* Prizes */}
            <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="p-4 text-center">
                    <Trophy className="w-6 h-6 mx-auto mb-2 text-amber-400" />
                    <p className="text-2xl font-bold text-white">{prizesWon}/{totalPrizes}</p>
                    <p className="text-xs text-gray-400">Prizes Won</p>
                </CardContent>
            </Card>
        </div>
    );
};
