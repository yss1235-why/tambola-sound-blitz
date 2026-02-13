// src/components/host/GameCreationForm.tsx - Extracted from GameHost
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Trophy, Ticket, CheckCircle, Clock, Crown } from 'lucide-react';

interface GamePrize {
    id: string;
    name: string;
    pattern: string;
    description: string;
    order: number;
    difficulty: string;
}

interface TicketSet {
    id: string;
    name: string;
    available: boolean;
    ticketCount: number;
    description: string;
}

interface GameCreationFormProps {
    hostPhone: string;
    ticketSets: TicketSet[];
    availablePrizes: GamePrize[];
    onSubmit: (form: {
        hostPhone: string;
        maxTickets: number;
        selectedTicketSet: string;
        selectedPrizes: string[];
    }) => Promise<void>;
    isCreating: boolean;
}

export const GameCreationForm: React.FC<GameCreationFormProps> = ({
    hostPhone: initialPhone,
    ticketSets,
    availablePrizes,
    onSubmit,
    isCreating
}) => {
    const [hostPhone, setHostPhone] = useState(initialPhone);
    const [maxTickets, setMaxTickets] = useState('50');
    const [selectedTicketSet, setSelectedTicketSet] = useState('1');
    const [selectedPrizes, setSelectedPrizes] = useState<string[]>(['fullHouse']);

    const togglePrize = (prizeId: string) => {
        setSelectedPrizes(prev =>
            prev.includes(prizeId)
                ? prev.filter(id => id !== prizeId)
                : [...prev, prizeId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({
            hostPhone,
            maxTickets: parseInt(maxTickets) || 50,
            selectedTicketSet,
            selectedPrizes
        });
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty) {
            case 'Easy': return 'bg-green-500/20 text-green-400 border-green-500/40';
            case 'Medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
            case 'Hard': return 'bg-red-500/20 text-red-400 border-red-500/40';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
        }
    };

    return (
        <Card className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/50 backdrop-blur-sm shadow-xl">
            <CardHeader>
                <CardTitle className="text-2xl text-white flex items-center gap-2">
                    <Crown className="w-6 h-6 text-amber-400" />
                    Create New Game
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Phone Number */}
                    <div className="space-y-2">
                        <Label htmlFor="hostPhone" className="text-gray-200">Host Phone (shown to players)</Label>
                        <Input
                            id="hostPhone"
                            value={hostPhone}
                            onChange={(e) => setHostPhone(e.target.value)}
                            placeholder="Enter your phone number"
                            className="bg-gray-800/50 border-gray-600 text-white"
                        />
                    </div>

                    {/* Max Tickets */}
                    <div className="space-y-2">
                        <Label htmlFor="maxTickets" className="text-gray-200">
                            Initial Tickets (can expand later)
                        </Label>
                        <Input
                            id="maxTickets"
                            type="number"
                            min="10"
                            max="600"
                            value={maxTickets}
                            onChange={(e) => setMaxTickets(e.target.value)}
                            className="bg-gray-800/50 border-gray-600 text-white"
                        />
                        <p className="text-xs text-gray-400">
                            Start with fewer tickets for better control. You can expand up to 600 later.
                        </p>
                    </div>

                    {/* Ticket Set Selection */}
                    <div className="space-y-3">
                        <Label className="text-gray-200 flex items-center gap-2">
                            <Ticket className="w-4 h-4 text-purple-400" />
                            Select Ticket Set
                        </Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {ticketSets.map((set) => (
                                <Card
                                    key={set.id}
                                    className={`cursor-pointer transition-all duration-200 ${selectedTicketSet === set.id
                                            ? 'bg-purple-900/40 border-purple-500/50 ring-2 ring-purple-500/30'
                                            : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600'
                                        } ${!set.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={() => set.available && setSelectedTicketSet(set.id)}
                                >
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Ticket className="w-5 h-5 text-purple-400" />
                                                <span className="font-medium text-white">{set.name}</span>
                                            </div>
                                            {selectedTicketSet === set.id && (
                                                <CheckCircle className="w-5 h-5 text-purple-400" />
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2">{set.description}</p>
                                        <Badge variant="outline" className="mt-2 text-purple-300 border-purple-500/40">
                                            {set.ticketCount} tickets
                                        </Badge>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>

                    {/* Prize Selection */}
                    <div className="space-y-3">
                        <Label className="text-gray-200 flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-amber-400" />
                            Select Prizes ({selectedPrizes.length} selected)
                        </Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2">
                            {availablePrizes.map((prize) => (
                                <div
                                    key={prize.id}
                                    className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-all ${selectedPrizes.includes(prize.id)
                                            ? 'bg-amber-900/30 border border-amber-500/40'
                                            : 'bg-gray-800/30 border border-gray-700/50 hover:border-gray-600'
                                        }`}
                                    onClick={() => togglePrize(prize.id)}
                                >
                                    <Checkbox
                                        checked={selectedPrizes.includes(prize.id)}
                                        onCheckedChange={() => togglePrize(prize.id)}
                                        className="mt-0.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm text-white">{prize.name}</span>
                                            {prize.difficulty && (
                                                <Badge variant="outline" className={`text-xs ${getDifficultyColor(prize.difficulty)}`}>
                                                    {prize.difficulty}
                                                </Badge>
                                            )}
                                        </div>
                                        {prize.description && (
                                            <p className="text-xs text-gray-400 mt-1">{prize.description}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Submit Button */}
                    <Button
                        type="submit"
                        disabled={isCreating || selectedPrizes.length === 0}
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating Game...
                            </>
                        ) : (
                            <>
                                <Crown className="w-4 h-4 mr-2" />
                                Create Game
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};

// Export types and constants for reuse
export type { GamePrize, TicketSet };
