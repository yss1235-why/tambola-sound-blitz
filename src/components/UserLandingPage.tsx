// src/components/UserLandingPage.tsx - FIXED: Real-time subscription for auto-view switching
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketBookingGrid } from './TicketBookingGrid';
import { UserDisplay } from './UserDisplay';
import { GameDataProvider } from '@/providers/GameDataProvider';
import { firebaseService, GameData } from '@/services/firebase';
import { 
  Loader2, 
  Trophy, 
  Gamepad2, 
  Phone,
  Ticket,
  RefreshCw,
  Activity
} from 'lucide-react';

interface UserLandingPageProps {
  onGameSelection?: (gameId: string) => void;
  selectedGameId?: string | null;
}

// Simplified data structures for initial load
interface GameSummary {
  gameId: string;
  name: string;
  hostPhone?: string;
  maxTickets: number;
  isActive: boolean;
  isCountdown: boolean;
  hasStarted: boolean;
  bookedTickets: number;
}

export const UserLandingPage: React.FC<UserLandingPageProps> = ({ 
  onGameSelection, 
  selectedGameId 
}) => {
  const [currentView, setCurrentView] = useState<'list' | 'booking' | 'game'>('list');
  const [gameSummaries, setGameSummaries] = useState<GameSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedGameData, setSelectedGameData] = useState<GameData | null>(null);

  // ✅ FIXED: Add real-time subscription refs
  const gameSubscriptionRef = useRef<(() => void) | null>(null);
  const gameListSubscriptionRef = useRef<(() => void) | null>(null);

  // ✅ FIXED: Real-time game list subscription
  const setupGameListSubscription = useCallback(() => {
    console.log('🔔 Setting up real-time game list subscription');
    
    if (gameListSubscriptionRef.current) {
      gameListSubscriptionRef.current();
    }

    const unsubscribe = firebaseService.subscribeToAllActiveGames((games) => {
      console.log('📡 Game list updated in real-time:', games.length);
      
      const summaries: GameSummary[] = games.map(game => {
        const bookedTickets = game.tickets ? 
          Object.values(game.tickets).filter(t => t.isBooked).length : 0;
        
        return {
          gameId: game.gameId,
          name: game.name,
          hostPhone: game.hostPhone,
          maxTickets: game.maxTickets,
          isActive: game.gameState.isActive,
          isCountdown: game.gameState.isCountdown,
          hasStarted: (game.gameState.calledNumbers?.length || 0) > 0,
          bookedTickets
        };
      });
      
      setGameSummaries(summaries);
      setLastUpdate(new Date());
      setIsLoading(false);

      // Auto-select first game if none selected and games available
      if (summaries.length > 0 && !selectedGameId && currentView === 'list') {
        selectGame(summaries[0].gameId);
      }
    });

    gameListSubscriptionRef.current = unsubscribe;
  }, [selectedGameId, currentView]);

  // ✅ FIXED: Real-time game subscription for auto-view switching
  const setupGameSubscription = useCallback((gameId: string) => {
    console.log('🔔 Setting up real-time game subscription for:', gameId);
    
    if (gameSubscriptionRef.current) {
      gameSubscriptionRef.current();
    }

    const unsubscribe = firebaseService.subscribeToGame(gameId, (updatedGame) => {
      if (updatedGame) {
        console.log('📡 Selected game updated in real-time:', {
          gameId: updatedGame.gameId,
          isActive: updatedGame.gameState.isActive,
          isCountdown: updatedGame.gameState.isCountdown,
          calledNumbers: updatedGame.gameState.calledNumbers?.length || 0,
          gameOver: updatedGame.gameState.gameOver
        });

        setSelectedGameData(updatedGame);

        // ✅ FIXED: Auto-switch views based on game state changes
        const hasGameStarted = (updatedGame.gameState.calledNumbers?.length || 0) > 0 || 
                              updatedGame.gameState.isActive || 
                              updatedGame.gameState.isCountdown ||
                              updatedGame.gameState.gameOver;

        if (hasGameStarted && currentView === 'booking') {
          console.log('🎮 Auto-switching to game view - game has started!');
          setCurrentView('game');
        } else if (!hasGameStarted && currentView === 'game') {
          console.log('🎫 Auto-switching to booking view - game reset to booking');
          setCurrentView('booking');
        }
      } else {
        // Game was deleted
        console.log('🗑️ Selected game was deleted');
        setSelectedGameData(null);
        setCurrentView('list');
        if (onGameSelection) {
          onGameSelection('');
        }
      }
    });

    gameSubscriptionRef.current = unsubscribe;
  }, [currentView, onGameSelection]);

  // Select and load game for viewing
  const selectGame = useCallback(async (gameId: string) => {
    try {
      console.log('🎯 Selecting game:', gameId);
      
      if (onGameSelection) {
        onGameSelection(gameId);
      }
      
      // Load full game data for selected game
      const gameData = await firebaseService.getGameData(gameId);
      if (gameData) {
        setSelectedGameData(gameData);
        
        // Determine initial view based on game state
        const hasGameStarted = (gameData.gameState.calledNumbers?.length || 0) > 0 || 
                              gameData.gameState.isActive || 
                              gameData.gameState.isCountdown ||
                              gameData.gameState.gameOver;
        
        if (hasGameStarted) {
          setCurrentView('game');
        } else {
          setCurrentView('booking');
        }

        // ✅ FIXED: Setup real-time subscription for this game
        setupGameSubscription(gameId);
      }
    } catch (error) {
      console.error('Failed to select game:', error);
    }
  }, [onGameSelection, setupGameSubscription]);

  // ✅ FIXED: Setup real-time subscriptions on mount
  useEffect(() => {
    setupGameListSubscription();
    
    return () => {
      // Cleanup all subscriptions
      if (gameListSubscriptionRef.current) {
        gameListSubscriptionRef.current();
      }
      if (gameSubscriptionRef.current) {
        gameSubscriptionRef.current();
      }
    };
  }, [setupGameListSubscription]);

  // Handle booking
  const handleBookTicket = async (ticketId: string, playerName: string, playerPhone: string) => {
    if (!selectedGameData) return;

    try {
      await firebaseService.bookTicket(ticketId, playerName, playerPhone, selectedGameData.gameId);
      
      // No need to manually refresh - real-time subscription will update automatically
      console.log('✅ Ticket booked, waiting for real-time update...');
    } catch (error: any) {
      alert(error.message || 'Failed to book ticket');
    }
  };

  const handleRefresh = () => {
    // Force refresh game list
    setupGameListSubscription();
  };

  const handleBackToList = () => {
    // Clean up game subscription
    if (gameSubscriptionRef.current) {
      gameSubscriptionRef.current();
      gameSubscriptionRef.current = null;
    }
    
    setCurrentView('list');
    setSelectedGameData(null);
    if (onGameSelection) {
      onGameSelection('');
    }
  };

  // Show game view with provider
  if (currentView === 'game' && selectedGameId) {
    return (
      <GameDataProvider gameId={selectedGameId} userId={null}>
        <div className="space-y-4">
          <div className="p-4 bg-white">
            <Button onClick={handleBackToList} variant="outline">
              ← Back to Games
            </Button>
          </div>
          <UserDisplay />
        </div>
      </GameDataProvider>
    );
  }

  // Show booking view
  if (currentView === 'booking' && selectedGameData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header with back button */}
          <div className="flex items-center justify-between">
            <Button onClick={handleBackToList} variant="outline">
              ← Back to Games
            </Button>
            <div className="flex items-center space-x-2">
              <Badge variant="default">Booking Phase</Badge>
              {/* ✅ FIXED: Real-time indicator */}
              <Badge variant="outline" className="text-green-600 border-green-400">
                <Activity className="w-3 h-3 mr-1" />
                Live Updates
              </Badge>
            </div>
          </div>

          <TicketBookingGrid 
            tickets={selectedGameData.tickets || {}}
            gameData={selectedGameData}
            onBookTicket={handleBookTicket}
            onGameStart={() => setCurrentView('game')}
          />
        </div>
      </div>
    );
  }

  // Minimal loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">Loading games...</p>
        </div>
      </div>
    );
  }

  // Show games list
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Header */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              🎲 Welcome to Tambola! 🎲
            </CardTitle>
            <p className="text-gray-600 text-lg mt-2">
              Join the excitement! Book your tickets and play live Tambola games.
            </p>
            <div className="flex justify-center items-center space-x-4 mt-4 text-sm">
              {/* ✅ FIXED: Real-time indicators */}
              <Badge variant="default" className="flex items-center bg-green-600">
                <Activity className="w-3 h-3 mr-1" />
                Real-time Updates
              </Badge>
              {lastUpdate && (
                <Badge variant="outline" className="text-xs">
                  Updated: {lastUpdate.toLocaleTimeString()}
                </Badge>
              )}
              <Button onClick={handleRefresh} size="sm" variant="outline">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Games List or No Games */}
        {gameSummaries.length === 0 ? (
          <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
            <CardContent className="p-8 text-center">
              <div className="text-6xl mb-4">🎯</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">No Active Games</h2>
              <p className="text-gray-600 mb-4">
                There are currently no active Tambola games. New games will appear automatically.
              </p>
              <Button 
                onClick={handleRefresh}
                className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Check Again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
            <CardHeader>
              <CardTitle className="text-2xl text-gray-800 text-center">
                Available Games ({gameSummaries.length})
              </CardTitle>
              <p className="text-center text-gray-600">
                🔴 Games update automatically when hosts make changes
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {gameSummaries.map((game) => (
                  <Card 
                    key={game.gameId}
                    className="cursor-pointer transition-all duration-200 border-gray-200 hover:border-orange-300 hover:shadow-lg"
                    onClick={() => selectGame(game.gameId)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-800 text-lg">{game.name}</h3>
                        <div className="flex flex-col space-y-1">
                          <Badge 
                            variant={
                              game.isActive ? "default" :
                              game.isCountdown ? "secondary" :
                              game.hasStarted ? "destructive" :
                              "outline"
                            }
                          >
                            {game.isActive ? '🔴 Live' : 
                             game.isCountdown ? '🟡 Starting' : 
                             game.hasStarted ? '🏁 Finished' :
                             '⚪ Booking'}
                          </Badge>
                          {/* ✅ FIXED: Real-time update indicator */}
                          <Badge variant="outline" className="text-xs text-green-600 border-green-400">
                            <Activity className="w-2 h-2 mr-1" />
                            Live
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <Ticket className="w-4 h-4 mr-2 text-blue-600" />
                            <span className="text-sm text-gray-600">Tickets</span>
                          </div>
                          <span className="font-semibold text-blue-600">
                            {game.bookedTickets}/{game.maxTickets}
                          </span>
                        </div>
                        
                        {game.hostPhone && (
                          <div className="flex items-center">
                            <Phone className="w-4 h-4 mr-2 text-green-600" />
                            <span className="text-sm text-gray-600">+{game.hostPhone}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center">
                            <Trophy className="w-4 h-4 mr-2 text-purple-600" />
                            <span className="text-sm text-gray-600">Available</span>
                          </div>
                          <span className="font-semibold text-purple-600">
                            {game.maxTickets - game.bookedTickets} tickets
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-3 border-t">
                        <Button 
                          className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectGame(game.gameId);
                          }}
                        >
                          {game.hasStarted ? (
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
      </div>
    </div>
  );
};
