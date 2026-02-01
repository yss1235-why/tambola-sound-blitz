// src/components/PrizeTracker.tsx - Updated for compatibility
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Prize } from '@/services/firebase';

interface PrizeTrackerProps {
  prizes: Prize[];
}

export const PrizeTracker: React.FC<PrizeTrackerProps> = ({ prizes }) => {
  return (
    <Card className="tambola-card">
      <CardHeader>
        <CardTitle className="text-foreground">🏆 Prizes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prizes.map((prize) => (
          <div
            key={prize.id}
            className={`p-3 rounded-lg border-2 transition-all duration-300 ${prize.won
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 shadow-lg'
              : 'bg-gradient-to-r from-muted to-muted/80 border-border'
              }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`font-bold ${prize.won ? 'text-green-900' : 'text-foreground'}`}>
                  {prize.name}
                </h3>
                <p className={`text-sm ${prize.won ? 'text-green-700' : 'text-muted-foreground'}`}>
                  {prize.pattern}
                </p>
                {prize.won && prize.winners && prize.winners.length > 0 && (
                  <p className="text-xs text-green-800 font-medium mt-1">
                    Won by: {prize.winners.map(w => `${w.name} (Ticket #${w.ticketId})`).join(', ')}
                  </p>
                )}
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${prize.won
                ? 'bg-green-500 text-white animate-bounce-in'
                : 'bg-muted text-muted-foreground'
                }`}>
                {prize.won ? '✓' : '?'}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
