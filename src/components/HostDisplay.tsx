// ================================================================================
// FILE 1: src/components/HostDisplay.tsx - SIMPLIFIED WINNER DISPLAY
// ================================================================================

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Play,
  Pause,
  Square,
  Users,
  Clock,
  Trophy,
  Ticket,
  Phone,
  Gamepad2,
  Timer,
  Hash,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  User
} from 'lucide-react';
import { useGameData, useBookingStats } from '@/providers/GameDataProvider';
import { useHostControls } from '@/providers/HostControlsProvider';
// Import simplified winner component
import { SimplifiedWinnerDisplay } from './SimplifiedWinnerDisplay';

interface HostDisplayProps {
  onCreateNewGame?: () => void;
}

export const HostDisplay: React.FC<HostDisplayProps> = ({ onCreateNewGame }) => {
  const { gameData, currentPhase, timeUntilAction, isLoading, error } = useGameData();
  const { bookedCount } = useBookingStats();
  const hostControls = useHostControls();
  // Extract new properties
  const {
    isPreparingGame,
    preparationStatus,
    preparationProgress
  } = hostControls || {};
  const [expandedPrizes, setExpandedPrizes] = useState<Set<string>>(new Set());
  const [showWinnerDisplay, setShowWinnerDisplay] = useState(false);
  // Add delay before showing winner display
  useEffect(() => {
    if (gameData?.gameState?.gameOver) {
      // Wait 2.5 seconds for prize audio to finish
      const timer = setTimeout(() => {
        setShowWinnerDisplay(true);
      }, 2500);

      return () => {
        clearTimeout(timer);
      };
    } else {
      setShowWinnerDisplay(false);
    }
  }, [gameData?.gameState?.gameOver]);

  // Toggle prize expansion
  const togglePrize = (prizeId: string) => {
    setExpandedPrizes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(prizeId)) {
        newSet.delete(prizeId);
      } else {
        newSet.add(prizeId);
      }
      return newSet;
    });
  };

  // Handle speech rate change
  const handleSpeechRateChange = (newScale: number) => {
    if (hostControls) {
      hostControls.updateSpeechRate(newScale);
    }
  };


  // SIMPLIFIED: Only automatic game control handlers
  const handleStartGame = React.useCallback(async () => {
    if (!hostControls) return;
    try {
      await hostControls.startGame();
    } catch (error: any) {
      alert(error.message || 'Failed to start game');
    }
  }, [hostControls]);

  const handlePauseGame = React.useCallback(async () => {
    if (!hostControls) return;
    try {
      await hostControls.pauseGame();
    } catch (error: any) {
      alert(error.message || 'Failed to pause game');
    }
  }, [hostControls]);

  const handleResumeGame = React.useCallback(async () => {
    if (!hostControls) return;
    try {
      await hostControls.resumeGame();
    } catch (error: any) {
      alert(error.message || 'Failed to resume game');
    }
  }, [hostControls]);

  const handleEndGame = React.useCallback(async () => {
    const confirmed = window.confirm('Are you sure you want to end the game?');
    if (!confirmed || !hostControls) return;

    try {
      await hostControls.endGame();
    } catch (error: any) {
      alert(error.message || 'Failed to end game');
    }
  }, [hostControls]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Loading Game...</h2>
          <p className="text-muted-foreground">Setting up your game dashboard</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Game</h2>
          <p className="text-destructive mb-4">{error}</p>
          {onCreateNewGame && (
            <Button onClick={onCreateNewGame} className="bg-primary hover:bg-primary/90">
              Create New Game
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // No game state
  if (!gameData) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-6xl mb-4"></div>
          <h2 className="text-2xl font-bold text-foreground mb-2">No Active Game</h2>
          <p className="text-muted-foreground mb-4">Create a new game to start hosting</p>
          {onCreateNewGame && (
            <Button onClick={onCreateNewGame} className="bg-primary hover:bg-primary/90">
              Create New Game
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // NEW: SIMPLIFIED WINNER DISPLAY after delay
  if (showWinnerDisplay && gameData?.gameState?.gameOver) {
    return (
      <SimplifiedWinnerDisplay
        gameData={gameData}
        onCreateNewGame={() => {
          // Add confirmation before creating new game from winner display
          const confirmed = window.confirm(
            'Create New Game\n\n' +
            'You are about to create a new game. The current winner information will be cleared from your dashboard.\n\n' +
            'Make sure you have noted down any winner contact details or taken screenshots if needed.\n\n' +
            'Continue to create a new game?'
          );

          if (confirmed && onCreateNewGame) {
            onCreateNewGame();
          } else {
          }
        }}
      />
    );
  }

  // EXISTING: Full interface for active games (booking, countdown, playing phases)
  return (
    <div className="space-y-6">


      {/* Game Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Timer className="w-5 h-5 mr-2" />
            Automatic Game Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Control Buttons */}
          <div className="flex flex-wrap gap-2">
            {currentPhase === 'booking' && (
              <>
                {/* NEW: Preparation Status Display */}


                <Button
                  onClick={handleStartGame}
                  disabled={bookedCount === 0 || hostControls?.isProcessing}
                  className="flex-1 bg-primary hover:bg-primary/90"
                  size="sm"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {hostControls?.isProcessing
                    ? 'Starting...'
                    : `Start Automatic Game (${bookedCount > 0 ? 'Ready' : 'Need players'})`
                  }
                </Button>
                {/* REMOVED: Preparation instructions hidden */}
              </>
            )}
            {currentPhase === 'countdown' && (
              <Button disabled className="flex-1" size="lg">
                <Clock className="w-4 h-4 mr-2 animate-pulse" />
                Starting in {timeUntilAction}s...
              </Button>
            )}

            {currentPhase === 'playing' && (
              <>
                {!hostControls?.firebasePaused ? (
                  <Button
                    onClick={handlePauseGame}
                    variant="secondary"
                    className="flex-1"
                    size="lg"
                    disabled={hostControls?.isProcessing}
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    {hostControls?.isProcessing ? 'Pausing...' : 'Pause Automatic Game'}
                  </Button>
                ) : (
                  <div className="space-y-2 flex-1">
                    <Button
                      onClick={handleResumeGame}
                      className="w-full bg-primary hover:bg-primary/90"
                      size="lg"
                      disabled={hostControls?.isProcessing}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {hostControls?.isProcessing ? 'Starting...' :
                        hostControls?.countdownTime === 0 && hostControls?.firebasePaused ? 'Click to Start Number Calling' : 'Resume Automatic Game'}
                    </Button>

                    {/* NEW: Show auto-pause warning */}
                    {hostControls?.wasAutopaused && (
                      <div className="text-xs text-primary bg-primary/10 border border-primary/30 rounded px-2 py-1 text-center">
                        ⚠️ Game was auto-paused due to page refresh. Click Resume to continue safely.
                      </div>
                    )}
                  </div>
                )}
                <Button
                  onClick={handleEndGame}
                  variant="destructive"
                  size="lg"
                  disabled={hostControls?.isProcessing}
                >
                  <Square className="w-4 h-4 mr-2" />
                  {hostControls?.isProcessing ? 'Ending...' : 'End Game'}
                </Button>
              </>
            )}
          </div>

          {/* Speech Rate Control */}
          {(currentPhase === 'booking' || (currentPhase === 'playing' && !gameData.gameState.gameOver)) && (
            <div className="space-y-2">
              <Label htmlFor="speech-rate">
                Speech Speed: {hostControls?.speechRateScale || 0}
                {hostControls?.speechRateScale === 0 ? ' (Normal)' :
                  hostControls?.speechRateScale < 0 ? ' (Slower)' : ' (Faster)'}
              </Label>
              <div className="flex items-center space-x-4">
                <span className="text-xs text-muted-foreground w-12">Slow</span>
                <Input
                  id="speech-rate"
                  type="range"
                  min="-3"
                  max="6"
                  value={hostControls?.speechRateScale || 0}
                  onChange={(e) => handleSpeechRateChange(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-12">Fast</span>
                <span className="text-sm text-muted-foreground w-8 text-center">
                  {hostControls?.speechRateScale > 0 ? '+' : ''}{hostControls?.speechRateScale || 0}
                </span>
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Recent Numbers Called */}
      {gameData.gameState.calledNumbers && gameData.gameState.calledNumbers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Hash className="w-5 h-5 mr-2" />
              Recent Numbers Called (Automatically)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {gameData.gameState.calledNumbers
                .slice(-20)
                .reverse()
                .map((num, index) => (
                  <div
                    key={`${num}-${index}`}
                    className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold
                      ${index === 0
                        ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground ring-2 ring-primary/40 text-lg scale-110'
                        : 'bg-gradient-to-br from-accent to-accent/80 text-accent-foreground text-sm'
                      }`}
                  >
                    {num}
                  </div>
                ))}
            </div>
            {gameData.gameState.calledNumbers.length > 20 && (
              <p className="text-sm text-muted-foreground mt-3 text-center">
                Showing last 20 numbers  Total called: {gameData.gameState.calledNumbers.length}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prize Status - Collapsible Format */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="w-5 h-5 mr-2" />
            Prize Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.values(gameData.prizes)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((prize) => {
              const isExpanded = expandedPrizes.has(prize.id);

              return (
                <div key={prize.id} className="space-y-2">
                  {/* Clickable Prize Header */}
                  <Button
                    variant="ghost"
                    onClick={() => togglePrize(prize.id)}
                    className={`w-full justify-between p-3 h-auto rounded-lg border-2 hover:bg-opacity-80 ${prize.won
                      ? 'bg-accent/10 border-accent/30 hover:bg-accent/20'
                      : 'bg-muted border-border hover:bg-muted/80'
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-full ${prize.won ? 'bg-accent/20' : 'bg-muted/80'
                        }`}>
                        <Trophy className={`w-4 h-4 ${prize.won ? 'text-accent' : 'text-muted-foreground'
                          }`} />
                      </div>
                      <div className="text-left">
                        <h3 className="font-medium text-foreground">
                          {prize.name}
                        </h3>
                        {prize.won && prize.winners && (
                          <p className="text-sm text-accent">
                            {prize.winners.length} winner{prize.winners.length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Quick Ticket Preview */}
                      <div className="text-right">
                        {prize.won && prize.winners ? (
                          <div className="text-sm font-mono text-accent">
                            {prize.winners.slice(0, 2).map(w => w.ticketId).join(', ')}
                            {prize.winners.length > 2 && '...'}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            Not Won
                          </div>
                        )}
                      </div>

                      {/* Chevron */}
                      {prize.won ? (
                        isExpanded ?
                          <ChevronUp className="w-4 h-4 text-accent" /> :
                          <ChevronDown className="w-4 h-4 text-accent" />
                      ) : (
                        <div className="w-4 h-4" /> // Empty space for alignment
                      )}
                    </div>
                  </Button>

                  {/* Expandable Winner Details */}
                  {isExpanded && prize.won && prize.winners && (
                    <div className="px-3 pb-3 bg-accent/10 rounded-lg border border-accent/30">
                      <div className="space-y-2">
                        {prize.winners.map((winner, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-card rounded border border-accent/30">
                            <div className="flex items-center space-x-3">
                              <div className="bg-accent/20 p-1.5 rounded-full">
                                <User className="w-3 h-3 text-accent" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground text-sm">
                                  {winner.name}
                                  {prize.winners.length > 1 && (
                                    <Badge variant="outline" className="ml-2 text-xs border-accent/40 text-accent">
                                      Winner {idx + 1}
                                    </Badge>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {winner.ticketId?.includes(',') ? `Tickets ${winner.ticketId}` : `Ticket ${winner.ticketId}`}
                                </p>
                              </div>
                            </div>

                            {/* Winner Badge */}
                            <Badge variant="outline" className="text-xs border-accent/40 text-accent">
                              {prize.name}
                            </Badge>
                          </div>
                        ))}

                        {/* Prize Details */}
                        {prize.winningNumber && (
                          <div className="text-xs text-accent text-center pt-2 border-t border-accent/30">
                            Won on number {prize.winningNumber}
                            {prize.wonAt && (
                              <span className="ml-2">
                                at {new Date(prize.wonAt).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </CardContent>
      </Card>

    </div>
  );
};

