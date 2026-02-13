// src/components/RecentWinnersDisplay.tsx - COMPLETELY REWRITTEN: Mobile-optimized with shared utility
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  ChevronDown,
  ChevronUp,
  Ticket,
  User,
  Phone,
  CheckCircle,
  AlertCircle,
  Play
} from 'lucide-react';
import { useGameData } from '@/providers/GameDataProvider';
import { useTheme } from '@/providers/ThemeProvider';
// NEW: Import shared ticket renderer utility
import { renderTicket, resolveWinnerTickets } from '@/utils/ticketRenderer';

interface RecentWinnersDisplayProps {
  hostMode?: boolean;
  onCreateNewGame?: () => void;
}

export const RecentWinnersDisplay: React.FC<RecentWinnersDisplayProps> = ({
  hostMode = false,
  onCreateNewGame
}) => {
  const { gameData, isLoading, error } = useGameData();
  const { settings: themeSettings } = useTheme();
  const isPremiumLightTheme = themeSettings.preset === 'premiumLight';
  const premiumSurfaceClass = isPremiumLightTheme ? 'premium-light-surface premium-light-elevated' : '';
  const premiumHighlightClass = isPremiumLightTheme
    ? 'premium-light-highlight-card border border-border text-foreground'
    : '';
  const [expandedWinners, setExpandedWinners] = useState<Set<string>>(new Set());

  // START WITH ALL TICKETS COLLAPSED for mobile-friendly one-screen view
  React.useEffect(() => {
    if (gameData && gameData.gameState.gameOver) {
      setExpandedWinners(new Set()); // Start collapsed
    }
  }, [gameData?.gameState.gameOver]);

  // Toggle winner ticket display
  const toggleWinnerTicket = (winnerId: string) => {
    setExpandedWinners(prev => {
      const newSet = new Set(prev);
      if (newSet.has(winnerId)) {
        newSet.delete(winnerId);
      } else {
        newSet.add(winnerId);
      }
      return newSet;
    });
  };

  // Calculate game statistics
  const gameStats = useMemo(() => {
    if (!gameData) return null;

    const endTime = new Date(gameData.lastWinnerAt || gameData.createdAt);
    const totalPlayers = Object.values(gameData.tickets || {}).filter(t => t.isBooked).length;

    return { endTime, totalPlayers };
  }, [gameData]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="ml-3 text-muted-foreground">Loading game results...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={`border-destructive/40 ${premiumSurfaceClass}`}>
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Results</h3>
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!gameData || !gameData.gameState.gameOver) {
    return (
      <Card className={premiumSurfaceClass}>
        <CardContent className="p-6 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Game Not Completed</h3>
          <p className="text-muted-foreground">Results will appear when the game ends.</p>
        </CardContent>
      </Card>
    );
  }

  const wonPrizes = Object.values(gameData.prizes).filter(p => p.won);
  const totalWinners = wonPrizes.reduce((total, prize) => total + (prize.winners?.length || 0), 0);

  // HOST MODE: Clean celebration view
  if (hostMode) {
    return (
      <div className={`space-y-4 ${isPremiumLightTheme ? 'premium-light-winners' : ''}`}>
        {/* Celebration Header */}
        <Card className={isPremiumLightTheme ? `premium-light-winner-hero ${premiumHighlightClass}` : 'bg-gradient-to-r from-primary to-accent text-primary-foreground border-0'}>
          <CardContent className="text-center py-6">
            <Trophy className="w-12 h-12 mx-auto mb-3 animate-bounce" />
            <h1 className="text-2xl md:text-4xl font-bold mb-2 premium-light-winners-title">Game Completed!</h1>
            <p className="text-lg md:text-xl opacity-90">
              Congratulations to all {totalWinners} winner{totalWinners !== 1 ? 's' : ''}!
            </p>
            {gameStats && (
              <p className="text-sm opacity-75 mt-2">
                {gameStats.endTime.toLocaleDateString()} at {gameStats.endTime.toLocaleTimeString()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Prize Winners - Compact for Host */}
        <Card className={premiumSurfaceClass}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center">
              <Trophy className="w-5 h-5 mr-2 text-primary" />
              Prize Winners
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wonPrizes.length === 0 ? (
              <div className="text-center py-6">
                <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No prizes were won in this game.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {wonPrizes
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((prize) => (
                    <Card key={prize.id} className="bg-accent/10 border-accent/30 premium-light-winner-prize-card">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-foreground flex items-center">
                              {prize.name}
                              {prize.id === 'fullHouse' && ' FINAL WINNER!'}
                            </h3>
                            <p className="text-sm text-accent">{prize.pattern}</p>
                          </div>
                          <Badge className="bg-accent text-accent-foreground">
                            {prize.winners?.length || 0} winner{(prize.winners?.length || 0) !== 1 ? 's' : ''}
                          </Badge>
                        </div>

                        {/* Winners List - Compact for Host */}
                        {prize.winners && prize.winners.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {prize.winners.map((winner, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-card rounded border premium-light-winner-row">
                                <div className="flex items-center">
                                  <User className="w-4 h-4 text-muted-foreground mr-2" />
                                  <span className="font-medium text-foreground">{winner.name}</span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {winner.ticketId?.includes(',') ? `Tickets ${winner.ticketId}` : `Ticket ${winner.ticketId}`}
                                  {winner.phone && (
                                    <span className="ml-2 text-xs text-muted-foreground/70">
                                      Phone: {winner.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create New Game Button */}
        {onCreateNewGame && (
          <Card className={premiumSurfaceClass}>
            <CardContent className="p-4 text-center">
              <Button
                onClick={onCreateNewGame}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3"
                size="lg"
              >
                <Play className="w-5 h-5 mr-2" />
                Create New Game
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ”„ PUBLIC MODE: Detailed view with expandable tickets
  return (
    <div className={`min-h-screen bg-background p-2 sm:p-4 ${isPremiumLightTheme ? 'premium-light-winners' : ''}`}>
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Mobile-Optimized Game Completion Header */}
        <Card className={isPremiumLightTheme ? `premium-light-winner-hero ${premiumHighlightClass}` : 'bg-gradient-to-r from-primary to-accent text-primary-foreground border-0'}>
          <CardHeader className="text-center py-4 sm:py-6">
            <CardTitle className="text-xl sm:text-2xl md:text-4xl font-bold premium-light-winners-title">
              Game Completed!
            </CardTitle>
            <div className="text-sm sm:text-base md:text-lg opacity-90 mt-2">
              <p className="font-medium">Congratulations to all {totalWinners} winners!</p>
              {gameStats && (
                <p className="text-xs sm:text-sm opacity-75 mt-1">
                  {gameStats.endTime.toLocaleDateString()} at {gameStats.endTime.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Mobile-Optimized Prize Winners Display */}
        <Card className={premiumSurfaceClass}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Trophy className="w-5 h-5 mr-2" />
                Prize Winners
              </div>
              <Badge className="bg-accent text-accent-foreground text-xs sm:text-sm">
                {wonPrizes.length} prize{wonPrizes.length !== 1 ? 's' : ''} won
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {wonPrizes
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((prize) => (
                  <Card key={prize.id} className="bg-accent/10 border-accent/30 overflow-hidden premium-light-winner-prize-card">
                    <CardContent className="p-0">
                      <div className="p-2 sm:p-3">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-foreground text-sm sm:text-base truncate flex items-center">
                              {prize.name}
                              {prize.winningNumber && (
                                <Badge variant="outline" className="ml-2 text-xs border-accent/40 text-accent hidden sm:inline-flex">
                                  Won on #{prize.winningNumber}
                                </Badge>
                              )}
                            </h3>
                          </div>
                          <Badge className="bg-accent text-accent-foreground text-xs">
                            {prize.winners?.length || 0}
                          </Badge>
                        </div>

                        {/* Winners List - Mobile Optimized with Multiple Winner Support */}
                        {prize.winners && prize.winners.length > 0 && (
                          <div className="space-y-1">
                            {/* Multiple Winners Header */}
                            {prize.winners.length > 1 && (
                              <div className="text-xs bg-accent/15 border border-accent/30 rounded p-1.5 mb-1.5">
                                <p className="text-accent font-medium">
                                  Multiple Winners ({prize.winners.length} players!)
                                </p>
                              </div>
                            )}

                            {prize.winners.map((winner, idx) => {
                              const winnerId = `${prize.id}-${idx}`;
                              const isExpanded = expandedWinners.has(winnerId);

                              // Handle multi-ticket prizes (halfSheet/fullSheet store "1,2,3")
                              const { isMultiTicket, ticketIds, tickets: winnerTickets } = resolveWinnerTickets(winner.ticketId, gameData.tickets);

                              return (
                                <div key={winnerId} className="bg-card rounded-md border border-accent/30 premium-light-winner-row">
                                  {/* Winner Header - Clickable */}
                                  <Button
                                    variant="ghost"
                                    onClick={() => toggleWinnerTicket(winnerId)}
                                    className="w-full justify-between p-1.5 sm:p-2 h-auto hover:bg-accent/10 rounded-md"
                                  >
                                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                                      <div className="bg-accent/20 p-1.5 rounded-full flex-shrink-0">
                                        <Ticket className="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
                                      </div>
                                      <div className="text-left flex-1 min-w-0">
                                        <p className="font-medium text-foreground text-xs sm:text-sm truncate flex items-center">
                                          <User className="w-3 h-3 mr-1 flex-shrink-0" />
                                          {winner.name}
                                          {/* Winner number indicator for multiple winners */}
                                          {prize.winners.length > 1 && (
                                            <Badge variant="outline" className="ml-2 text-xs border-accent/40 text-accent">
                                              Winner #{idx + 1}
                                            </Badge>
                                          )}
                                        </p>
                                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                          <span>{isMultiTicket ? `Tickets ${winner.ticketId}` : `Ticket ${winner.ticketId}`}</span>
                                          {winner.phone && (
                                            <span className="hidden sm:inline flex items-center">
                                              <Phone className="w-3 h-3 mr-1" />
                                              {winner.phone}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center flex-shrink-0 ml-2">
                                      <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">
                                        {isExpanded ? 'Hide' : 'Show'} {isMultiTicket ? 'Tickets' : 'Ticket'}
                                      </span>
                                      {isExpanded ?
                                        <ChevronUp className="w-4 h-4 text-accent" /> :
                                        <ChevronDown className="w-4 h-4 text-accent" />
                                      }
                                    </div>
                                  </Button>

                                  {/* Expandable Winning Ticket(s) */}
                                  {isExpanded && (
                                    <div className="px-1.5 sm:px-2 pb-1.5 sm:pb-2 bg-muted border-t border-accent/30 premium-light-winner-ticket-expand">
                                      <div className="flex items-center justify-between mb-1.5 pt-1.5">
                                        <h5 className="font-medium text-foreground flex items-center text-xs sm:text-sm">
                                          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 text-accent" />
                                          {winner.name}'s Winning {isMultiTicket ? 'Tickets' : 'Ticket'} {winner.ticketId}
                                          {prize.winners.length > 1 && (
                                            <span className="ml-2 text-accent">(#{idx + 1})</span>
                                          )}
                                        </h5>
                                        <Badge variant="outline" className="text-xs border-accent/40 text-accent">
                                          {prize.name} Winner
                                        </Badge>
                                      </div>
                                      {winnerTickets.length > 0 ? (
                                        <div className={`${isMultiTicket ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2' : ''} p-2`}>
                                          {winnerTickets.map((ticket: any, tIdx: number) => (
                                            <div key={tIdx}>
                                              {isMultiTicket && (
                                                <p className="text-xs text-accent font-medium mb-1 text-center">
                                                  Ticket {ticketIds[tIdx]} ({tIdx + 1} of {ticketIds.length})
                                                </p>
                                              )}
                                              {renderTicket({
                                                ticket,
                                                calledNumbers: gameData.gameState.calledNumbers || [],
                                                showPlayerInfo: false,
                                                patternHighlight: prize.id
                                              })}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-center py-4 text-muted-foreground">
                                          <Ticket className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                                          <p className="text-sm">Ticket data not available</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>

            {/* No Winners Message - Mobile Optimized */}
            {wonPrizes.length === 0 && (
              <div className="text-center py-6 sm:py-8">
                <Trophy className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">No Prizes Won</h3>
                <p className="text-sm sm:text-base text-muted-foreground">No prizes were won in this game.</p>
                <p className="text-xs sm:text-sm text-muted-foreground/70 mt-1">
                  Game ended with {gameData.gameState.calledNumbers?.length || 0} numbers called.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

