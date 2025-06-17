// src/components/UserLandingPage.tsx - FIXED: Auto-redirect to booking when new games created
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
  Activity,
  Clock
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
  createdAt: string; // ✅ FIXED: Added to track new games
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
  const [autoRedirectShown, setAutoRedirectShown] = useState(false); // ✅ FIXED: Prevent multiple redirects

  // ✅ FIXED: Track previous games to detect new ones
  const previousGameIds = useRef<Set<string>>(new Set());
  const lastGameCount = useRef<number>(0);
  const hasInitialLoad = useRef<boolean>(false);

  // Real-time subscription refs
  const gameSubscriptionRef = useRef<(() => void) | null>(null);
  const gameListSubscriptionRef = useRef<(() => void) | null>(null);

  // ✅ FIXED: Real-time game list subscription with new game detection
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
          bookedTickets,
          createdAt: game.createdAt // ✅ FIXED: Track creation time
        };
      });
      
      // Sort by creation time (newest first)
      summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // ✅ FIXED: Detect new games and auto-redirect
      if (hasInitialLoad.current && currentView === 'list' && !autoRedirectShown) {
        const currentGameIds = new Set(summaries.map(g => g.gameId));
        const newGames = summaries.filter(game => !previousGameIds.current.has(game.gameId));
        
        // ✅ FIXED: Auto-redirect to newest game if:
        // 1. There are new games
        // 2. User is on list view  
        // 3. No game currently selected
        // 4. Auto-redirect not already shown
        if (newGames.length > 0 && !selectedGameId) {
          const newestGame = newGames[0]; // Already sorted by creation time
          console.log(`🆕 New game detected: ${newestGame.name}, auto-redirecting to booking`);
          
          setAutoRedirectShown(true);
          selectGame(newestGame.gameId);
          
          // Reset auto-redirect flag after 5 seconds to allow future redirects
          setTimeout(() => setAutoRedirectShown(false), 5000);
        }
        
        // Update previous games set
        previousGameIds.current = currentGameIds;
      }
      
      setGameSummaries(summaries);
      setLastUpdate(new Date());
      setIsLoading(false);

      // ✅ FIXED: Only auto-select on initial load if no games and one becomes available
      if (!hasInitialLoad.current) {
        hasInitialLoad.current = true;
        previousGameIds.current = new Set(summaries.map(g => g.gameId));
        
        // Auto-select first game only on initial load if none selected
        if (summaries.length > 0 && !selectedGameId && currentView === 'list') {
          selectGame(summaries[0].gameId);
        }
      }
    });

    gameListSubscriptionRef.current = unsubscribe;
  }, [selectedGameId, currentView, autoRedirectShown]);

  // Real-time game subscription for auto-view switching
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

        // Auto-switch views based on game state changes
        const hasGameStarted = (updatedGame.gameState.calledNumbers?.length || 0) > 0 || 
                              updatedGame.gameState.isActive || 
                              updatedGame.gameState.isCountdown ||
                              updatedGame.gameState.gameOver;

        if (hasGameStarted && currentView === 'booking') {
          console.log('🎮 Auto-switching to game view - game has started!');
          setCurrentView('game');
        } else if (!hasGameStarted && currentView === 'game' && !updatedGame.gameState.gameOver) {
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

        // Setup real-time subscription for this game
        setupGameSubscription(gameId);
      }
    } catch (error) {
      console.error('Failed to select game:', error);
    }
  }, [onGameSelection, setupGameSubscription]);

  // Setup real-time subscriptions on mount
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
    setAutoRedirectShown(false); // Reset auto-redirect flag
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
              <Badge variant="outline" className="text-green-600 border-green-400">
                <Activity className="w-3 h-3 mr-1" />
                Auto-Switch Enabled
              </Badge>
            </div>
          </div>

          {/* ✅ FIXED: Show auto-redirect notification for new games */}
          {autoRedirectShown && (
            <Card className="border-blue-400 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-800">🆕 New Game Available!</p>
                    <p className="text-sm text-blue-600">
                      You've been automatically taken to this new game's booking page
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
              {/* Real-time indicators */}
              <Badge variant="default" className="flex items-center bg-green-600">
                <Activity className="w-3 h-3 mr-1" />
                Real-time Updates
              </Badge>
              <Badge variant="outline" className="flex items-center border-blue-400 text-blue-600">
                <Clock className="w-3 h-3 mr-1" />
                Auto-Redirect
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
                There are currently no active Tambola games. New games will appear automatically and you'll be redirected to them!
              </p>
              <div className="flex justify-center items-center space-x-2 mb-4">
                <Activity className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 font-medium">Auto-redirect enabled for new games</span>
              </div>
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
              <div className="text-center space-y-2">
                <p className="text-gray-600">
                  🔴 Games update automatically • New games auto-redirect to booking
                </p>
                <div className="flex justify-center items-center space-x-2">
                  <Badge variant="outline" className="text-xs border-green-400 text-green-600">
                    <Activity className="w-2 h-2 mr-1" />
                    Auto-redirect enabled
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {gameSummaries.map((game, index) => (
                  <Card 
                    key={game.gameId}
                    className={`cursor-pointer transition-all duration-200 border-gray-200 hover:border-orange-300 hover:shadow-lg ${
                      index === 0 ? 'ring-2 ring-blue-200' : ''
                    }`}
                    onClick={() => selectGame(game.gameId)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-800 text-lg">{game.name}</h3>
                          {index === 0 && (
                            <p className="text-xs text-blue-600 font-medium">← Newest Game</p>
                          )}
                        </div>
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
