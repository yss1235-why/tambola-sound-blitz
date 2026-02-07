// src/components/UserLandingPage.tsx - UPDATED: Enhanced with winner display support
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketBookingGrid } from './TicketBookingGrid';
import { UserDisplay } from './UserDisplay';
import { RecentWinnersDisplay } from './RecentWinnersDisplay';
import { AudioManager } from '@/components/AudioManager';
import { GameDataProvider } from '@/providers/GameDataProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useActiveGamesSubscription } from '@/hooks/useFirebaseSubscription';
import { firebaseService, GameData } from '@/services/firebase';
import {
  Trophy,
  Gamepad2,
  Phone,
  Ticket,
  RefreshCw,
  Activity,
  Clock,
  CheckCircle
} from 'lucide-react';

interface UserLandingPageProps {
  onGameSelection?: (gameId: string) => void;
  selectedGameId?: string | null;
  // âœ… UNCHANGED: Accept pre-loaded games for instant display
  preloadedGames?: GameData[];
  gamesLoading?: boolean;
  gamesError?: string | null;
}

// ðŸ”§ MODIFIED: Enhanced game summary interface with winner information
interface GameSummary {
  gameId: string;
  name: string;
  hostPhone?: string;
  maxTickets: number;
  isActive: boolean;
  isCountdown: boolean;
  hasStarted: boolean;
  gameOver: boolean; // ðŸ†• NEW: Track if game is completed
  bookedTickets: number;
  createdAt: string;
  // ðŸ†• NEW: Winner information for completed games
  winnerCount?: number;
  prizesWon?: number;
  totalPrizes?: number;
}

export const UserLandingPage: React.FC<UserLandingPageProps> = ({
  onGameSelection,
  selectedGameId,
  preloadedGames = [],
  gamesLoading = false,
  gamesError = null
}) => {
  const [currentView, setCurrentView] = useState<'list' | 'booking' | 'game' | 'winners'>('list'); // ðŸ†• NEW: Add winners view
  const [selectedGameData, setSelectedGameData] = useState<GameData | null>(null);
  const { settings: themeSettings } = useTheme();
  const isPremiumLightTheme = themeSettings.preset === 'premiumLight';

  // âœ… UNCHANGED: Use pre-loaded games with fallback subscription (now includes completed games)
  const fallbackSubscription = useActiveGamesSubscription();
  const shouldUseFallback = preloadedGames.length === 0 && !gamesLoading && !gamesError;

  // âœ… UNCHANGED: Choose data source (preloaded vs subscription)
  const gameDataSource = useMemo(() => {
    if (preloadedGames.length > 0 || gamesLoading || gamesError) {
      // Use pre-loaded data (faster path)
      return {
        games: preloadedGames,
        loading: gamesLoading,
        error: gamesError,
        source: 'preloaded'
      };
    } else {
      // Fallback to subscription (slower path)
      return {
        games: fallbackSubscription.data || [],
        loading: fallbackSubscription.loading,
        error: fallbackSubscription.error,
        source: 'subscription'
      };
    }
  }, [preloadedGames, gamesLoading, gamesError, fallbackSubscription]);

  // ðŸ”§ MODIFIED: Enhanced game summaries with winner information
  const gameSummaries: GameSummary[] = useMemo(() => {
    if (!gameDataSource.games) return [];

    return gameDataSource.games.map(game => {
      const bookedTickets = game.tickets ?
        Object.values(game.tickets).filter(t => t.isBooked).length : 0;

      // ðŸ†• NEW: Calculate winner statistics for completed games
      let winnerCount = 0;
      let prizesWon = 0;
      const totalPrizes = Object.keys(game.prizes).length;

      if (game.gameState.gameOver) {
        const wonPrizes = Object.values(game.prizes).filter(p => p.won);
        prizesWon = wonPrizes.length;
        winnerCount = wonPrizes.reduce((total, prize) =>
          total + (prize.winners?.length || 0), 0
        );
      }

      return {
        gameId: game.gameId,
        name: game.name,
        hostPhone: game.hostPhone,
        maxTickets: game.maxTickets,
        isActive: game.gameState.isActive,
        isCountdown: game.gameState.isCountdown,
        hasStarted: (game.gameState.calledNumbers?.length || 0) > 0,
        gameOver: game.gameState.gameOver, // ðŸ†• NEW
        bookedTickets,
        createdAt: game.createdAt,
        // ðŸ†• NEW: Winner statistics
        winnerCount,
        prizesWon,
        totalPrizes
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [gameDataSource.games]);

  const selectGame = useCallback((gameId: string) => {
    console.log('ðŸŽ¯ Selecting game:', gameId);

    if (onGameSelection) {
      onGameSelection(gameId);
    }

    const selectedGame = gameDataSource.games?.find(g => g.gameId === gameId);
    if (selectedGame) {
      console.log('ðŸ” Selected game state:', selectedGame.gameState);
      setSelectedGameData(selectedGame); // Store the selected game

      // ðŸ†• NEW: Handle completed games
      if (selectedGame.gameState.gameOver) {
        console.log('ðŸ† Selected completed game - showing winners');
        setCurrentView('winners');
        return;
      }

      // âœ… UNCHANGED: Existing active game logic
      const hasStarted = (selectedGame.gameState.calledNumbers?.length || 0) > 0 ||
        selectedGame.gameState.isActive ||
        selectedGame.gameState.isCountdown;

      setCurrentView(hasStarted ? 'game' : 'booking');
    }
  }, [onGameSelection, gameDataSource.games]);

  // Premium Light theme: remove index game chooser and route straight into the game flow
  useEffect(() => {
    if (!isPremiumLightTheme || currentView !== 'list' || gameDataSource.loading) {
      return;
    }

    const targetGameId =
      selectedGameId ||
      gameSummaries.find((game) => !game.gameOver)?.gameId ||
      gameSummaries[0]?.gameId;

    if (targetGameId) {
      selectGame(targetGameId);
    }
  }, [
    isPremiumLightTheme,
    currentView,
    gameDataSource.loading,
    selectedGameId,
    gameSummaries,
    selectGame
  ]);
  // ðŸ”¥ AUTO-NAVIGATION: Automatically switch views when game state changes in real-time
  useEffect(() => {
    // STEP 1: Only run when a specific game is selected (not on the games list page)
    if (!selectedGameId || currentView === 'list') {
      // If no game selected or we're on the games list, don't do anything
      return;
    }

    // STEP 2: Find the currently selected game from the real-time Firebase data
    const selectedGame = gameDataSource.games?.find(g => g.gameId === selectedGameId);

    // STEP 3: If the game doesn't exist anymore, go back to the games list
    if (!selectedGame) {
      console.log('ðŸ” Game not found, returning to list');
      setCurrentView('list');
      if (onGameSelection) {
        onGameSelection('');
      }
      return;
    }

    // STEP 4: Determine what view should be shown based on current game state
    let shouldShowView: 'booking' | 'game' | 'winners';

    if (selectedGame.gameState.gameOver) {
      // Case 1: Game is finished â†’ show winners page
      shouldShowView = 'winners';
      console.log('ðŸ† Game finished, should show winners');

    } else if (
      selectedGame.gameState.isActive ||
      selectedGame.gameState.isCountdown ||
      (selectedGame.gameState.calledNumbers?.length || 0) > 0
    ) {
      // Case 2: Game has started (active, countdown, or numbers called) â†’ show live game
      shouldShowView = 'game';
      console.log('ðŸŽ® Game started, should show live game');

    } else {
      // Case 3: Game not started yet â†’ show booking page
      shouldShowView = 'booking';
      console.log('ðŸŽ« Game not started, should show booking');
    }

    // STEP 5: Only switch views if the target view is different from current view
    if (currentView !== shouldShowView) {
      console.log(`ðŸ”„ AUTO-SWITCHING VIEW: ${currentView} â†’ ${shouldShowView}`, {
        gameId: selectedGameId,
        gameOver: selectedGame.gameState.gameOver,
        isActive: selectedGame.gameState.isActive,
        isCountdown: selectedGame.gameState.isCountdown,
        calledNumbers: selectedGame.gameState.calledNumbers?.length || 0
      });

      // Make the switch!
      setCurrentView(shouldShowView);
    }

  }, [selectedGameId, currentView, gameDataSource.games, onGameSelection]);

  // âœ… NEW: Listen for explicit game end events for players
  useEffect(() => {
    const handleGameEnd = (event: CustomEvent) => {
      const { gameId: endedGameId } = event.detail;
      console.log(`ðŸŽ‰ Player received game end event for game ${endedGameId} - current game: ${selectedGameId}`);

      if (endedGameId === selectedGameId && currentView !== 'winners') {
        console.log('âœ… Game end event matches current game - redirecting to winners');
        setTimeout(() => {
          setCurrentView('winners');
          console.log('ðŸ† Player force-redirected to winners via custom event');
        }, 500);
      }
    };

    window.addEventListener('tambola-game-ended', handleGameEnd as EventListener);

    return () => {
      window.removeEventListener('tambola-game-ended', handleGameEnd as EventListener);
    };
  }, [selectedGameId, currentView]);

  // âœ… UNCHANGED: All existing handler functions
  const handleBookTicket = async (ticketId: string, playerName: string, playerPhone: string) => {
    const selectedGame = gameDataSource.games?.find(g => g.gameId === selectedGameId);
    if (!selectedGame) return;

    try {
      await firebaseService.bookTicket(ticketId, playerName, playerPhone, selectedGame.gameId);
      console.log('âœ… Ticket booked successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to book ticket');
    }
  };

  const handleBackToList = useCallback(() => {
    setCurrentView('list');
    if (onGameSelection) {
      onGameSelection('');
    }
  }, [onGameSelection]);

  // ðŸ†• NEW: Winners view rendering
  if (currentView === 'winners' && selectedGameId) {
    return (
      <GameDataProvider gameId={selectedGameId}>
        <div className="space-y-4">
          {!isPremiumLightTheme && (
            <div className="p-4 text-foreground">
              <Button
                onClick={handleBackToList}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border"
              >
                Back to Games
              </Button>
            </div>
          )}
          <RecentWinnersDisplay />

          <AudioManager
            gameId={selectedGameId}
            gameState={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.gameState}
            currentNumber={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.gameState?.currentNumber}
            lastWinnerAnnouncement={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.lastWinnerAnnouncement}
            isGameOver={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.gameState?.gameOver}
            speechRate={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.gameState?.speechRate || 1.0} forceEnable={true}
            onAudioComplete={(type, data) => {
              console.log('Player audio completed:', type, data);
            }}
            onAudioError={(error, type) => {
              console.error('Player audio error:', error, type);
            }}
          />
        </div>
      </GameDataProvider>
    );
  }

  // âœ… UNCHANGED: All existing view rendering logic (game, booking, loading, error)
  if (currentView === 'game' && selectedGameId) {
    return (
      <GameDataProvider gameId={selectedGameId}>
        <div className="space-y-4">
          {!isPremiumLightTheme && (
            <div className="p-4 text-foreground">
              <Button
                onClick={handleBackToList}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border"
              >
                Back to Games
              </Button>
            </div>
          )}
          <UserDisplay />

          <AudioManager
            gameId={selectedGameId}
            gameState={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.gameState}
            currentNumber={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.gameState?.currentNumber}
            lastWinnerAnnouncement={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.lastWinnerAnnouncement}
            isGameOver={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.gameState?.gameOver}
            speechRate={gameDataSource.games?.find(g => g.gameId === selectedGameId)?.gameState?.speechRate || 1.0}
            forceEnable={true}
            onAudioComplete={(type, data) => {
              console.log('Player audio completed:', type, data);
            }}
            onAudioError={(error, type) => {
              console.error('Player audio error:', error, type);
            }}
          />
        </div>
      </GameDataProvider>
    );
  }
  if (currentView === 'booking' && selectedGameId) {
    const selectedGame = gameDataSource.games?.find(g => g.gameId === selectedGameId);

    if (!selectedGame) {
      return (
        <div className="min-h-screen bg-background p-4 flex items-center justify-center">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Game not found</p>
              {isPremiumLightTheme ? (
                <Button onClick={() => window.location.reload()} className="mt-4">
                  Refresh
                </Button>
              ) : (
                <Button onClick={handleBackToList} className="mt-4">
                  Back to Games
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // âœ… NOTE: We removed the conflicting auto-switch logic here
    // Our new useEffect handles all transitions automatically

    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className={`flex items-center ${isPremiumLightTheme ? 'justify-end' : 'justify-between'}`}>
            {!isPremiumLightTheme && (
              <Button
                onClick={handleBackToList}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border"
              >
                Back to Games
              </Button>
            )}
            <div className="flex items-center space-x-2">
              <Badge variant="default">Booking Phase</Badge>
              <Badge variant="outline" className="text-accent border-accent/40">
                <Activity className="w-3 h-3 mr-1" />
                Live Updates
              </Badge>
            </div>
          </div>

          <TicketBookingGrid
            tickets={selectedGame.tickets || {}}
            gameData={selectedGame}
            onBookTicket={handleBookTicket}
            onGameStart={() => setCurrentView('game')}
          />
        </div>
      </div>
    );
  }

  // âœ… UNCHANGED: Loading and error states
  if (gameDataSource.loading && gameSummaries.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-foreground">
            {gameDataSource.source === 'preloaded' ? 'Loading games...' : 'Connecting to game server...'}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {gameDataSource.source === 'preloaded' ? 'Fast loading enabled' : 'Enhanced view with winners'}
          </p>
        </div>
      </div>
    );
  }

  if (gameDataSource.error && gameSummaries.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="text-2xl mb-4 text-destructive">Warning</div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Connection Error</h2>
            <p className="text-muted-foreground mb-4">{gameDataSource.error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  if (isPremiumLightTheme) {
    if (gameSummaries.length === 0) {
      return (
        <div className="min-h-screen bg-background p-4 flex items-center justify-center">
          <Card className="max-w-md w-full">
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
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-foreground">Opening current game...</p>
          <p className="text-sm text-muted-foreground mt-2">
            Redirecting you directly to booking, live game, or winners.
          </p>
        </div>
      </div>
    );
  }

  // ðŸ”§ MODIFIED: Enhanced games list with completed game indicators
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* âœ… Header with theme colors */}
        <Card className="bg-card/90 backdrop-blur-sm rounded-2xl shadow-xl border border-border">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Welcome to Friend's Tambola!
            </CardTitle>
            <p className="text-muted-foreground text-lg mt-2">
              Join the excitement! Book your tickets and play live Tambola games.
            </p>

          </CardHeader>
        </Card>

        {/* ðŸ”§ MODIFIED: Enhanced Games List */}
        {gameSummaries.length === 0 ? (
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
        ) : (
          <Card className="bg-card/90 backdrop-blur-sm rounded-2xl shadow-xl border border-border">
            <CardHeader>
              <CardTitle className="text-2xl text-foreground text-center">
                Available Games ({gameSummaries.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {gameSummaries.map((game, index) => (
                  <Card
                    key={game.gameId}
                    className={`cursor-pointer transition-all duration-200 border-border hover:border-primary/40 hover:shadow-lg ${index === 0 ? 'ring-2 ring-primary/30' : ''
                      } ${game.gameOver ? 'bg-accent/10' : ''}`}
                    onClick={() => selectGame(game.gameId)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-foreground text-lg">{game.name}</h3>
                          {index === 0 && (
                            <p className="text-xs text-primary font-medium">Most Recent</p>
                          )}
                        </div>
                        <Badge
                          variant={
                            game.isActive ? "default" :
                              game.isCountdown ? "secondary" :
                                game.hasStarted && !game.gameOver ? "destructive" :
                                  game.gameOver ? "outline" : // ðŸ†• NEW: Completed games
                                    "outline"
                          }
                          className={game.gameOver ? "border-accent/40 text-accent bg-accent/10" : ""}
                        >
                          {game.isActive ? 'Live' :
                            game.isCountdown ? 'Starting' :
                              game.hasStarted && !game.gameOver ? 'Playing' :
                                game.gameOver ? 'Completed' :
                                  'Booking'}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {!game.gameOver ? (
                          // âœ… UNCHANGED: Active game display
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
                          // ðŸ†• NEW: Completed game display
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
                            selectGame(game.gameId);
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
                ))}
              </div>

            </CardContent>
          </Card>
        )}

        {/* Footer - Copyright */}
        <Card className="bg-card/90 backdrop-blur-sm rounded-2xl shadow-xl border border-border">
          <CardContent className="p-4">
            <div className="text-center text-sm text-muted-foreground">
              <p>
                Developed and designed by{' '}
                <a
                  href="https://innovarc.uk/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  Innovative Archive
                </a>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                © 2025 All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

