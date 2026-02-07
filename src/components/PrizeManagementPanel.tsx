// src/components/PrizeManagementPanel.tsx - Fixed without refresh dependency
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  Phone,
  Clock,
  CheckCircle,
  Target
} from 'lucide-react';
import { GameData, Prize } from '@/services/firebase';

interface PrizeManagementPanelProps {
  gameData: GameData;
  onRefreshGame: () => void; // Keep for compatibility but don't use
}

export const PrizeManagementPanel: React.FC<PrizeManagementPanelProps> = ({
  gameData
}) => {
  // Get booked tickets for validation
  const bookedTickets = gameData.tickets ?
    Object.values(gameData.tickets).filter(ticket => ticket.isBooked) : [];

  // Get prize display info
  const getPrizeDisplayInfo = (prize: Prize) => {
    if (!prize.won) {
      return {
        status: 'pending',
        icon: 'â³',
        className: 'bg-muted border-border',
        badgeVariant: 'secondary' as const,
        statusText: 'Not Won'
      };
    }

    const winnerCount = prize.winners?.length || 0;
    return {
      status: 'won',
      icon: 'ðŸ†',
      className: 'bg-accent/10 border-accent/30',
      badgeVariant: 'default' as const,
      statusText: `Won by ${winnerCount} player${winnerCount !== 1 ? 's' : ''}`
    };
  };

  return (
    <div className="space-y-6">
      {/* Prize Management Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="w-6 h-6 mr-2" />
            Prize Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Prize Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/30">
              <div className="text-2xl font-bold text-primary">
                {Object.keys(gameData.prizes).length}
              </div>
              <div className="text-sm text-primary">Total Prizes</div>
            </div>
            <div className="text-center p-3 bg-accent/10 rounded-lg border border-accent/30">
              <div className="text-2xl font-bold text-accent">
                {Object.values(gameData.prizes).filter(p => p.won).length}
              </div>
              <div className="text-sm text-accent">Prizes Won</div>
            </div>
            <div className="text-center p-3 bg-secondary/15 rounded-lg border border-secondary/30">
              <div className="text-2xl font-bold text-secondary-foreground">
                {Object.values(gameData.prizes).reduce((total, prize) =>
                  total + (prize.winners?.length || 0), 0
                )}
              </div>
              <div className="text-sm text-secondary-foreground">Total Winners</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg border border-border">
              <div className="text-2xl font-bold text-foreground">
                {bookedTickets.length}
              </div>
              <div className="text-sm text-muted-foreground">Active Players</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prize List */}
      <Card>
        <CardHeader>
          <CardTitle>Prizes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.values(gameData.prizes)
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((prize) => {
                const displayInfo = getPrizeDisplayInfo(prize);

                return (
                  <Card key={prize.id} className={`${displayInfo.className} transition-all duration-200`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-2">
                            <span className="text-2xl mr-3">{displayInfo.icon}</span>
                            <div>
                              <h3 className="font-bold text-lg text-foreground">{prize.name}</h3>
                              <p className="text-sm text-muted-foreground">{prize.pattern}</p>
                            </div>
                          </div>

                          {/* Prize Status */}
                          <div className="flex items-center space-x-4 mb-3">
                            <Badge variant={displayInfo.badgeVariant}>
                              {displayInfo.statusText}
                            </Badge>
                            {prize.won && prize.winningNumber && (
                              <Badge variant="outline">
                                <Target className="w-3 h-3 mr-1" />
                                Won on number {prize.winningNumber}
                              </Badge>
                            )}
                            {prize.won && prize.wonAt && (
                              <Badge variant="outline">
                                <Clock className="w-3 h-3 mr-1" />
                                {new Date(prize.wonAt).toLocaleTimeString()}
                              </Badge>
                            )}
                          </div>

                          {/* Winners Display */}
                          {prize.won && prize.winners && prize.winners.length > 0 && (
                            <div className="bg-card p-3 rounded border border-accent/30">
                              <div className="flex items-center mb-2">
                                <CheckCircle className="w-4 h-4 text-accent mr-2" />
                                <p className="text-sm font-medium text-accent">Winners:</p>
                              </div>
                              <div className="space-y-1">
                                {prize.winners.map((winner, index) => (
                                  <div key={index} className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-foreground">
                                      ðŸŽ‰ {winner.name} - Ticket {winner.ticketId}
                                    </span>
                                    {winner.phone && (
                                      <span className="text-muted-foreground flex items-center">
                                        <Phone className="w-3 h-3 mr-1" />
                                        {winner.phone}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          {/* No Prizes Message */}
          {Object.keys(gameData.prizes).length === 0 && (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No prizes configured for this game.</p>
              <p className="text-muted-foreground text-sm mt-2">
                Prizes are configured when creating a new game.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

