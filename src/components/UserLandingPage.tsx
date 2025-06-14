// src/components/UserLandingPage.tsx - Using centralized GameDataManager
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketBookingGrid } from './TicketBookingGrid';
import { TambolaGame } from './TambolaGame';
import gameDataManager from '@/services/GameDataManager';
import { firebaseService, GameData, TambolaTicket } from '@/services/firebase';
import { 
  Loader2, 
  Trophy, 
  Gamepad2, 
  Phone,
  Ticket,
  RefreshCw,
  Activity,
  WifiOff
} from 'lucide-react';

export const UserLandingPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'tickets' | 'game'>('tickets');
  const [selectedGame, setSelectedGame] = useState<GameData | null>(null);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  const [activeGames, setActiveGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Subscription management
  const gamesListUnsubscribe = useRef<(() => void) | null>(null);
  const selectedGameUnsubscribe = useRef<(() => void) | null>(null);
  const ticketsUnsubscribe = useRef<(() => void) | null>(null);

  // Helper functions
  const getEffectiveMaxTickets = useCallback((game: GameData): number => {
    return game.maxTickets;
  }, []);

  const getAvailableTicketsForDisplay = useCallback((game: GameData): number => {
    if (!game.tickets) return game.maxTickets;
    
    const totalTicketsInSet = Object.keys(game.tickets).length;
    const hostMaxLimit = game.maxTickets;
    const effectiveLimit = Math.min(hostMaxLimit, totalTicketsInSet);
    const bookedCount = Object.values(game.tickets).filter(t => t.isBooked).length;
    
    return effectiveLimit - bookedCount;
  }, []);

  const getBookedCount = useCallback((game: GameData): number => {
    if (!game.tickets) return 0;
    return Object.values(game.tickets).filter(t => t.isBooked).length;
  }, []);

  // Initialize games list subscription
  useEffect(() => {
    console.log('🎮 Setting up games list subscription...');
    
    const unsubscribe = gameDataManager.subscribeToGamesList((games) => {
      console.log(`📡 Received ${games.length} active games`);
      setActiveGames(games);
      setLastUpdate(new Date());
      setError(null);
      
      // If this is the first load
      if (isLoading) {
        setIsLoading(false);
        
        // Auto-select first game if available
        if (games.length > 0 && !selectedGame) {
          const firstGame = games[0];
          setSelectedGame(firstGame);
          setupSelectedGameSubscriptions(firstGame);
        }
      }
      
      // Check if selected game is still active
      if (selectedGame) {
        const gameStillActive = games.find(g => g.gameId === selectedGame.gameId);
        if (!gameStillActive) {
          // Selected game is no longer active, select first available or clear
          if (games.length > 0) {
            const newGame = games[0];
            setSelectedGame(newGame);
            setupSelectedGameSubscriptions(newGame);
          } else {
            setSelectedGame(null);
            setTickets({});
            cleanupSelectedGameSubscriptions();
          }
        }
      }
    });

    gamesListUnsubscribe.current = unsubscribe;

    return () => {
      if (gamesListUnsubscribe.current) {
        gamesListUnsubscribe.current();
      }
    };
  }, [isLoading, selectedGame]);

  // Setup subscriptions for selected game
  const setupSelectedGameSubscriptions = useCallback((game: GameData) => {
    console.log(`🎮 Setting up subscriptions for game: ${game.gameId}`);
    
    // Clean up previous subscriptions
    cleanupSelectedGameSubscriptions();

    // Subscribe to game updates
    const gameUnsubscribe = gameDataManager.subscribeToGame(game.gameId, (updatedGame) => {
      if (updatedGame) {
        setSelectedGame(updatedGame);
        
        // Auto-switch to game view if game becomes active
        if (updatedGame.gameState.isActive && currentView === 'tickets') {
          setCurrentView('game');
        }
      } else {
        // Game was deleted
        setSelectedGame(null);
        setTickets({});
        setCurrentView('tickets');
      }
    });

    // Subscribe to tickets updates
    const ticketsUnsubscribe = gameDataManager.subscribeToTickets(game.gameId, (updatedTickets) => {
      if (updatedTickets) {
        setTickets(updatedTickets);
      } else {
        setTickets({});
      }
    });

    selectedGameUnsubscribe.current = gameUnsubscribe;
    ticketsUnsubscribe.current = ticketsUnsubscribe;
  }, [currentView]);

  // Cleanup selected game subscriptions
  const cleanupSelectedGameSubscriptions = useCallback(() => {
    if (selectedGameUnsubscribe.current) {
      selectedGameUnsubscribe.current();
      selectedGameUnsubscribe.current = null;
    }
    if (ticketsUnsubscribe.current) {
      ticketsUnsubscribe.current();
      ticketsUnsubscribe.current = null;
    }
  }, []);

  // Cleanup all subscriptions on unmount
  useEffect(() => {
    return () => {
      if (gamesListUnsubscribe.current) {
        gamesListUnsubscribe.current();
      }
      cleanupSelectedGameSubscriptions();
    };
  }, [cleanupSelectedGameSubscriptions]);

  // Manual refresh function
  const handleRefresh = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    
    try {
      // Force refresh by re-subscribing
      if (gamesListUnsubscribe.current) {
        gamesListUnsubscribe.current();
      }
      
      const unsubscribe = gameDataManager.subscribeToGamesList((games) => {
        setActiveGames(games);
        setLastUpdate(new Date());
        setIsLoading(false);
        setError(null);
      });
      
      gamesListUnsubscribe.current = unsubscribe;
      
    } catch (err: any) {
      console.error('Manual refresh error:', err);
      setError(err.message || 'Failed to refresh games');
      setIsLoading(false);
    }
  }, []);

  const handleBookTicket = async (ticketId: string, playerName: string, playerPhone: string) => {
    if (!selectedGame) return;

    try {
      await firebaseService.bookTicket(ticketId, playerName, playerPhone, selectedGame.gameId);
    } catch (error: any) {
      console.error('Booking failed:', error.message);
      alert(error.message || 'Failed to book ticket');
    }
  };

  const getBookedTicketsCount = () => {
    return Object.values(tickets).filter(ticket => ticket.isBooked).length;
  };

  const getAvailableTicketsCount = () => {
    if (!selectedGame) return 0;
    const effectiveMax = getEffectiveMaxTickets(selectedGame);
    return effectiveMax - getBookedTicketsCount();
  };

  const handleGameSelect = (game: GameData) => {
    setSelectedGame(game);
    setupSelectedGameSubscriptions(game);
  };

  // Switch to game view
  const handleGameStart = () => {
    setCurrentView('game');
  };

  const handleBackToTickets = () => {
    setCurrentView('tickets');
  };

  // Show game view with full real-time
  if (currentView === 'game' && selectedGame) {
    return <TambolaGame gameData={selectedGame} onBackToTickets={handleBackToTickets} />;
  }

  // Loading state
  if (isLoading && activeGames.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 flex items-center justify-center">
        <Card className="p-8">
          <CardContent className="flex items-center space-x-4">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            <div>
              <p className="text-lg text-gray-700">Loading active games...</p>
              <p className="text-sm text-gray-500">Please wait...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Section with Status */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              🎲 Welcome to Tambola! 🎲
            </CardTitle>
            <p className="text-gray-600 text-lg mt-2">
              Join the excitement! Book your tickets and play live Tambola games.
            </p>
            {/* Connection Status */}
            <div className="flex justify-center items-center space-x-4 mt-4 text-sm">
              <Badge variant="default" className="flex items-center">
                <Activity className="w-3 h-3 mr-1" />
                Live Updates Active
              </Badge>
              {lastUpdate && (
                <Badge variant="outline" className="text-xs">
                  Updated: {lastUpdate.toLocaleTimeString()}
                </Badge>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-red-500 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <WifiOff className="w-5 h-5 text-red-600" />
                  <span className="text-red-700">{error}</span>
                </div>
                <Button onClick={handleRefresh} size="sm" variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Games List */}
        {activeGames.length > 1 && (
          <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
            <CardHeader>
              <CardTitle className="text-2xl text-gray-800 text-center flex items-center justify-between">
                <span>Available Games</span>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{activeGames.length} Available</Badge>
                  <Button onClick={handleRefresh} size="sm" variant="outline">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGames.map((game) => (
                  <Card 
                    key={game.gameId}
                    className={`cursor-pointer transition-all duration-200 ${
                      selectedGame?.gameId === game.gameId
                        ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                        : 'border-gray-200 hover:border-orange-300 hover:bg-orange-25'
                    }`}
                    onClick={() => handleGameSelect(game)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-800 truncate">{game.name}</h3>
                        <Badge 
                          variant={
                            game.gameState.isActive ? "default" :
                            game.gameState.isCountdown ? "secondary" :
                            "outline"
                          }
                        >
                          {game.gameState.isActive ? '🟢 Live' : 
                           game.gameState.isCountdown ? '🟡 Starting' : '⚪ Waiting'}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>Tickets Available:</span>
                          <span className="font-medium text-blue-600">
                            {getAvailableTicketsForDisplay(game)} / {getEffectiveMaxTickets(game)}
                          </span>
                        </div>
                        {game.hostPhone && (
                          <div className="flex justify-between">
                            <span>WhatsApp:</span>
                            <span className="font-medium text-orange-600 flex items-center">
                              <Phone className="w-3 h-3 mr-1" />
                              +{game.hostPhone}
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selected Game Display */}
        {selectedGame ? (
          <>
            {/* Game Info */}
            <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
              <CardContent className="p-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">{selectedGame.name}</h2>
                  <div className="flex justify-center items-center space-x-6">
                    <div className="text-center">
                      <Ticket className="w-8 h-8 mx-auto mb-1 text-blue-600" />
                      <p className="text-lg font-bold">{getBookedTicketsCount()}</p>
                      <p className="text-sm text-gray-600">Booked</p>
                    </div>
                    <div className="text-center">
                      <Trophy className="w-8 h-8 mx-auto mb-1 text-purple-600" />
                      <p className="text-lg font-bold">{getAvailableTicketsCount()}</p>
                      <p className="text-sm text-gray-600">Available</p>
                    </div>
                    <div className="text-center">
                      <Gamepad2 className="w-8 h-8 mx-auto mb-1 text-green-600" />
                      <Badge variant={selectedGame.gameState.isActive ? "default" : "secondary"}>
                        {selectedGame.gameState.isActive ? 'Live' : 
                         selectedGame.gameState.isCountdown ? 'Starting' : 'Waiting'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ticket Booking Grid */}
            {Object.keys(tickets).length > 0 && (
              <TicketBookingGrid 
                tickets={tickets}
                gameData={selectedGame}
                onBookTicket={handleBookTicket}
                onGameStart={handleGameStart}
              />
            )}
          </>
        ) : (
          /* No Games Available */
          <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
            <CardContent className="p-8 text-center">
              <div className="text-6xl mb-4">🎯</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">No Active Games</h2>
              <p className="text-gray-600 mb-4">
                There are currently no active Tambola games. New games will appear automatically when hosts create them.
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Live updates are active - new games will appear instantly.
              </p>
              <Button 
                onClick={handleRefresh}
                className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Check Now
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
