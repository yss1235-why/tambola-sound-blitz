// src/components/UserLandingPage.tsx - REFACTORED: Uses extracted sub-components
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
import { Activity, RefreshCw } from 'lucide-react';

// Import extracted sub-components
import {
  GameSummary,
  GameList,
  EmptyGameState,
  LoadingState,
  ErrorState
} from './player';

interface UserLandingPageProps {
  onGameSelection?: (gameId: string) => void;
  selectedGameId?: string | null;
  preloadedGames?: GameData[];
  gamesLoading?: boolean;
  gamesError?: string | null;
  businessName?: string;
}

export const UserLandingPage: React.FC<UserLandingPageProps> = ({
  onGameSelection,
  selectedGameId,
  preloadedGames = [],
  gamesLoading = false,
  gamesError = null,
  businessName
}) => {
  const [currentView, setCurrentView] = useState<'list' | 'booking' | 'game' | 'winners'>('list');
  const [selectedGameData, setSelectedGameData] = useState<GameData | null>(null);
  const { settings: themeSettings } = useTheme();
  const isPremiumLightTheme = themeSettings.preset === 'premiumLight';

  // Use pre-loaded games with fallback subscription
  const fallbackSubscription = useActiveGamesSubscription();
  const shouldUseFallback = preloadedGames.length === 0 && !gamesLoading && !gamesError;

  // Choose data source (preloaded vs subscription)
  const gameDataSource = useMemo(() => {
    if (preloadedGames.length > 0 || gamesLoading || gamesError) {
      return {
        games: preloadedGames,
        loading: gamesLoading,
        error: gamesError,
        source: 'preloaded' as const
      };
    } else {
      return {
        games: fallbackSubscription.data || [],
        loading: fallbackSubscription.loading,
        error: fallbackSubscription.error,
        source: 'subscription' as const
      };
    }
  }, [preloadedGames, gamesLoading, gamesError, fallbackSubscription]);

  // Transform games to summaries
  const gameSummaries: GameSummary[] = useMemo(() => {
    if (!gameDataSource.games) return [];

    return gameDataSource.games.map(game => {
      const bookedTickets = game.tickets ?
        Object.values(game.tickets).filter(t => t.isBooked).length : 0;

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
        gameOver: game.gameState.gameOver,
        bookedTickets,
        createdAt: game.createdAt,
        winnerCount,
        prizesWon,
        totalPrizes
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [gameDataSource.games]);

  const selectGame = useCallback((gameId: string) => {
    if (onGameSelection) {
      onGameSelection(gameId);
    }

    const selectedGame = gameDataSource.games?.find(g => g.gameId === gameId);
    if (selectedGame) {
      setSelectedGameData(selectedGame);

      if (selectedGame.gameState.gameOver) {
        setCurrentView('winners');
        return;
      }

      const hasStarted = (selectedGame.gameState.calledNumbers?.length || 0) > 0 ||
        selectedGame.gameState.isActive ||
        selectedGame.gameState.isCountdown;

      setCurrentView(hasStarted ? 'game' : 'booking');
    }
  }, [onGameSelection, gameDataSource.games]);

  // Premium Light theme: auto-select game
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
  }, [isPremiumLightTheme, currentView, gameDataSource.loading, selectedGameId, gameSummaries, selectGame]);

  // Auto-navigation when game state changes
  useEffect(() => {
    if (!selectedGameId || currentView === 'list') {
      return;
    }

    const selectedGame = gameDataSource.games?.find(g => g.gameId === selectedGameId);

    if (!selectedGame) {
      setCurrentView('list');
      if (onGameSelection) {
        onGameSelection('');
      }
      return;
    }

    let shouldShowView: 'booking' | 'game' | 'winners';

    if (selectedGame.gameState.gameOver) {
      shouldShowView = 'winners';
    } else if (
      selectedGame.gameState.isActive ||
      selectedGame.gameState.isCountdown ||
      (selectedGame.gameState.calledNumbers?.length || 0) > 0
    ) {
      shouldShowView = 'game';
    } else {
      shouldShowView = 'booking';
    }

    if (currentView !== shouldShowView) {
      setCurrentView(shouldShowView);
    }
  }, [selectedGameId, currentView, gameDataSource.games, onGameSelection]);

  // Listen for game end events
  useEffect(() => {
    const handleGameEnd = (event: CustomEvent) => {
      const { gameId: endedGameId } = event.detail;

      if (endedGameId === selectedGameId && currentView !== 'winners') {
        setTimeout(() => {
          setCurrentView('winners');
        }, 500);
      }
    };

    window.addEventListener('tambola-game-ended', handleGameEnd as EventListener);

    return () => {
      window.removeEventListener('tambola-game-ended', handleGameEnd as EventListener);
    };
  }, [selectedGameId, currentView]);

  const handleBookTicket = async (ticketId: string, playerName: string, playerPhone: string) => {
    const selectedGame = gameDataSource.games?.find(g => g.gameId === selectedGameId);
    if (!selectedGame) return;

    try {
      await firebaseService.bookTicket(ticketId, playerName, playerPhone, selectedGame.gameId);
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

  // Helper to get current game's AudioManager props
  const getAudioProps = () => {
    const game = gameDataSource.games?.find(g => g.gameId === selectedGameId);
    return {
      gameId: selectedGameId!,
      gameState: game?.gameState,
      currentNumber: game?.gameState?.currentNumber,
      lastWinnerAnnouncement: game?.lastWinnerAnnouncement,
      isGameOver: game?.gameState?.gameOver,
      speechRate: game?.gameState?.speechRate || 1.0
    };
  };

  // Winners view
  if (currentView === 'winners' && selectedGameId) {
    return (
      <GameDataProvider gameId={selectedGameId}>
        <div className="space-y-4">
          {!isPremiumLightTheme && (
            <div className="p-4 text-foreground">
              <Button onClick={handleBackToList} className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border">
                Back to Games
              </Button>
            </div>
          )}
          <RecentWinnersDisplay />
          <AudioManager {...getAudioProps()} forceEnable={true} onAudioComplete={() => { }} onAudioError={() => { }} />
        </div>
      </GameDataProvider>
    );
  }

  // Game view
  if (currentView === 'game' && selectedGameId) {
    return (
      <GameDataProvider gameId={selectedGameId}>
        <div className="space-y-4">
          {!isPremiumLightTheme && (
            <div className="p-4 text-foreground">
              <Button onClick={handleBackToList} className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border">
                Back to Games
              </Button>
            </div>
          )}
          <UserDisplay />
          <AudioManager {...getAudioProps()} forceEnable={true} onAudioComplete={() => { }} onAudioError={() => { }} />
        </div>
      </GameDataProvider>
    );
  }

  // Booking view
  if (currentView === 'booking' && selectedGameId) {
    const selectedGame = gameDataSource.games?.find(g => g.gameId === selectedGameId);

    if (!selectedGame) {
      return (
        <div className="min-h-screen bg-background p-4 flex items-center justify-center">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Game not found</p>
              {isPremiumLightTheme ? (
                <Button onClick={() => window.location.reload()} className="mt-4">Refresh</Button>
              ) : (
                <Button onClick={handleBackToList} className="mt-4">Back to Games</Button>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className={`flex items-center ${isPremiumLightTheme ? 'justify-end' : 'justify-between'}`}>
            {!isPremiumLightTheme && (
              <Button onClick={handleBackToList} className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border">
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

  // Loading state
  if (gameDataSource.loading && gameSummaries.length === 0) {
    return <LoadingState source={gameDataSource.source} />;
  }

  // Error state
  if (gameDataSource.error && gameSummaries.length === 0) {
    return <ErrorState error={gameDataSource.error} />;
  }

  // Premium Light theme loading
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
              <Button onClick={() => window.location.reload()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
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

  // Main games list view (uses extracted components)
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card className="bg-card/90 backdrop-blur-sm rounded-2xl shadow-xl border border-border">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Welcome to {businessName || 'Tambola'}!
            </CardTitle>
            <p className="text-muted-foreground text-lg mt-2">
              Join the excitement! Book your tickets and play live Tambola games.
            </p>
          </CardHeader>
        </Card>

        {/* Games List - Uses extracted components */}
        {gameSummaries.length === 0 ? (
          <EmptyGameState />
        ) : (
          <GameList games={gameSummaries} onSelectGame={selectGame} />
        )}

        {/* Footer */}
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
