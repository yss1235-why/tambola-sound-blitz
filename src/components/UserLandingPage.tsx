// src/components/UserLandingPage.tsx - Enhanced with real-time updates for public users
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { TicketBookingGrid } from './TicketBookingGrid';
import { TambolaGame } from './TambolaGame';
import { firebaseService, GameData, TambolaTicket } from '@/services/firebase';
import { 
  Loader2, 
  Users, 
  Trophy, 
  DollarSign, 
  Gamepad2, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  AlertCircle,
  Clock,
  Phone,
  Ticket
} from 'lucide-react';

export const UserLandingPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'tickets' | 'game'>('tickets');
  const [activeGames, setActiveGames] = useState<GameData[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameData | null>(null);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  const [isLoading, setIsLoading] = useState(true);
  
  // ✅ NEW: Real-time connection status
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  
  // ✅ Subscription management
  const gamesUnsubscribeRef = useRef<(() => void) | null>(null);
  const selectedGameUnsubscribeRef = useRef<(() => void) | null>(null);
  const ticketsUnsubscribeRef = useRef<(() => void) | null>(null);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();

  // ✅ NEW: Enhanced connection monitoring
  useEffect(() => {
    const checkConnection = () => {
      const now = new Date().toLocaleTimeString();
      setLastUpdate(now);
      setIsConnected(navigator.onLine);
    };

    checkConnection();
    
    // Check connection every 30 seconds
    const connectionInterval = setInterval(checkConnection, 30000);

    // Listen for online/offline events
    const handleOnline = () => {
      setIsConnected(true);
      toast({
        title: "Connection Restored",
        description: "Game updates are now live!",
      });
      
      // Reload games when coming back online
      if (autoRefreshEnabled) {
        loadActiveGames();
      }
    };

    const handleOffline = () => {
      setIsConnected(false);
      toast({
        title: "Connection Lost",
        description: "You're offline. Game updates will resume when reconnected.",
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(connectionInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [autoRefreshEnabled, toast]);

  // ✅ Enhanced auto-refresh for public games list
  useEffect(() => {
    if (autoRefreshEnabled && isConnected) {
      autoRefreshIntervalRef.current = setInterval(() => {
        console.log('🔄 Auto-refreshing games list for public users');
        loadActiveGames();
      }, 60000); // Refresh every minute for public users
    }

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [autoRefreshEnabled, isConnected]);

  // ✅ Enhanced real-time subscription for selected game
  const setupSelectedGameSubscription = useCallback((game: GameData) => {
    console.log('🔗 Setting up real-time subscription for selected game:', game.gameId);
    
    // Clean up previous subscription
    if (selectedGameUnsubscribeRef.current) {
      selectedGameUnsubscribeRef.current();
      selectedGameUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToGame(game.gameId, (updatedGame) => {
      if (updatedGame) {
        console.log('📡 Real-time game update received for selected game:', updatedGame.gameId);
        
        setSelectedGame(updatedGame);
        setLastUpdate(new Date().toLocaleTimeString());
        setIsConnected(true);

        // ✅ Update game in active games list
        setActiveGames(prev => prev.map(g => 
          g.gameId === updatedGame.gameId ? updatedGame : g
        ));

        // ✅ Notify about important game state changes
        const prevGame = activeGames.find(g => g.gameId === updatedGame.gameId);
        if (prevGame) {
          // Game started
          if (!prevGame.gameState.isActive && updatedGame.gameState.isActive) {
            toast({
              title: "🎮 Game Started!",
              description: `${updatedGame.name} has begun!`,
              duration: 5000,
            });
          }

          // Game countdown
          if (!prevGame.gameState.isCountdown && updatedGame.gameState.isCountdown) {
            toast({
              title: "⏱️ Game Starting Soon!",
              description: `${updatedGame.name} starts in ${updatedGame.gameState.countdownTime} seconds!`,
              duration: 3000,
            });
          }

          // Game ended
          if (!prevGame.gameState.gameOver && updatedGame.gameState.gameOver) {
            toast({
              title: "🏁 Game Ended!",
              description: `${updatedGame.name} has completed!`,
              duration: 8000,
            });
          }
        }

      } else {
        setIsConnected(false);
      }
    });

    selectedGameUnsubscribeRef.current = unsubscribe;
  }, [activeGames, toast]);

  // ✅ Enhanced real-time subscription for tickets
  const setupTicketsSubscription = useCallback((gameId: string) => {
    console.log('🔗 Setting up real-time subscription for tickets:', gameId);
    
    // Clean up previous subscription
    if (ticketsUnsubscribeRef.current) {
      ticketsUnsubscribeRef.current();
      ticketsUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToTickets(gameId, (updatedTickets) => {
      if (updatedTickets) {
        console.log('📡 Real-time tickets update received:', Object.keys(updatedTickets).length, 'tickets');
        
        const previousBookedCount = Object.values(tickets).filter(t => t.isBooked).length;
        const newBookedCount = Object.values(updatedTickets).filter(t => t.isBooked).length;
        
        setTickets(updatedTickets);
        setLastUpdate(new Date().toLocaleTimeString());
        setIsConnected(true);

        // ✅ Notify about new bookings
        if (newBookedCount > previousBookedCount) {
          const newBookings = newBookedCount - previousBookedCount;
          toast({
            title: "🎫 New Bookings!",
            description: `${newBookings} ticket(s) just booked! Total players: ${newBookedCount}`,
            duration: 4000,
          });
        }

      } else {
        setIsConnected(false);
      }
    });

    ticketsUnsubscribeRef.current = unsubscribe;
  }, [tickets, toast]);

  const loadActiveGames = useCallback(async () => {
    if (!isConnected && !isLoading) {
      console.log('⚠️ Skipping games load - offline');
      return;
    }

    setIsLoading(true);
    try {
      const games = await firebaseService.getAllActiveGames();
      console.log('🔍 Loaded games for public users:', games.length);
      
      // Filter for games that are not over and have available tickets
      const availableGames = games.filter(game => 
        !game.gameState.gameOver && 
        game.tickets && 
        Object.keys(game.tickets).length > 0
      );
      
      console.log('🔍 Available games for public:', availableGames.length);
      setActiveGames(availableGames);
      setLastUpdate(new Date().toLocaleTimeString());
      setIsConnected(true);
      
      // ✅ Auto-select first game and setup subscriptions
      if (availableGames.length > 0) {
        const firstGame = availableGames[0];
        
        // Only change selected game if we don't have one or current one is not in the list
        if (!selectedGame || !availableGames.find(g => g.gameId === selectedGame.gameId)) {
          setSelectedGame(firstGame);
          setupSelectedGameSubscription(firstGame);
          
          // Load tickets for the selected game
          if (firstGame.tickets) {
            setTickets(firstGame.tickets);
            setupTicketsSubscription(firstGame.gameId);
          }
        }
      } else {
        // No games available, clean up subscriptions
        setSelectedGame(null);
        setTickets({});
        
        if (selectedGameUnsubscribeRef.current) {
          selectedGameUnsubscribeRef.current();
          selectedGameUnsubscribeRef.current = null;
        }
        if (ticketsUnsubscribeRef.current) {
          ticketsUnsubscribeRef.current();
          ticketsUnsubscribeRef.current = null;
        }
      }
      
    } catch (error: any) {
      console.error('Error loading games for public users:', error);
      setIsConnected(false);
      toast({
        title: "Connection Error",
        description: "Failed to load games. Check your internet connection.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, isLoading, selectedGame, setupSelectedGameSubscription, setupTicketsSubscription, toast]);

  // ✅ Initial load and cleanup
  useEffect(() => {
    console.log('🚀 UserLandingPage: Initial load');
    loadActiveGames();

    return () => {
      console.log('🧹 UserLandingPage: Cleaning up subscriptions');
      
      if (gamesUnsubscribeRef.current) {
        gamesUnsubscribeRef.current();
      }
      if (selectedGameUnsubscribeRef.current) {
        selectedGameUnsubscribeRef.current();
      }
      if (ticketsUnsubscribeRef.current) {
        ticketsUnsubscribeRef.current();
      }
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [loadActiveGames]);

  const handleBookTicket = async (ticketId: string, playerName: string, playerPhone: string) => {
    if (!selectedGame) return;

    try {
      await firebaseService.bookTicket(ticketId, playerName, playerPhone, selectedGame.gameId);
      
      toast({
        title: "Ticket Booked!",
        description: `Ticket ${ticketId} has been booked successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to book ticket",
        variant: "destructive",
      });
    }
  };

  const getBookedTicketsCount = () => {
    return Object.values(tickets).filter(ticket => ticket.isBooked).length;
  };

  const getTotalRevenue = () => {
    if (!selectedGame) return 0;
    return getBookedTicketsCount() * (selectedGame.ticketPrice || 0);
  };

  const getAvailableTicketsCount = () => {
    if (!selectedGame) return 0;
    const totalTickets = Math.min(selectedGame.maxTickets, Object.keys(tickets).length);
    return totalTickets - getBookedTicketsCount();
  };

  const handleGameSelect = (game: GameData) => {
    console.log('🎮 User selected game:', game.gameId);
    setSelectedGame(game);
    
    // Setup real-time subscriptions for the selected game
    setupSelectedGameSubscription(game);
    
    if (game.tickets) {
      setTickets(game.tickets);
      setupTicketsSubscription(game.gameId);
    }
  };

  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled(prev => !prev);
    toast({
      title: autoRefreshEnabled ? "Auto-refresh Disabled" : "Auto-refresh Enabled",
      description: autoRefreshEnabled 
        ? "Games list will no longer update automatically" 
        : "Games list will refresh every minute",
    });
  };

  if (isLoading && activeGames.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 flex items-center justify-center">
        <Card className="p-8">
          <CardContent className="flex items-center space-x-4">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            <div>
              <p className="text-lg text-gray-700">Loading active games...</p>
              <p className="text-sm text-gray-500">Connecting to live games...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentView === 'game' && selectedGame) {
    return <TambolaGame gameData={selectedGame} onBackToTickets={() => setCurrentView('tickets')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ✅ Enhanced Welcome Section with Connection Status */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
          <CardHeader className="text-center">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <CardTitle className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  🎲 Welcome to Tambola! 🎲
                </CardTitle>
                <p className="text-gray-600 text-lg mt-2">
                  Join the excitement! Book your tickets and play live Tambola games.
                </p>
              </div>
              
              {/* ✅ Connection Status and Controls */}
              <div className="flex flex-col items-end space-y-2">
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                  isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                  <span>{isConnected ? 'Live Updates' : 'Offline'}</span>
                </div>
                
                <div className="flex space-x-2">
                  <Button
                    onClick={loadActiveGames}
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  
                  <Button
                    onClick={toggleAutoRefresh}
                    variant={autoRefreshEnabled ? "default" : "outline"}
                    size="sm"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Auto
                  </Button>
                </div>
              </div>
            </div>
            
            {/* ✅ Status info */}
            {lastUpdate && (
              <p className="text-xs text-gray-500 mt-2">
                Last updated: {lastUpdate} • 
                Auto-refresh: {autoRefreshEnabled ? 'On' : 'Off'} • 
                {activeGames.length} game(s) available
              </p>
            )}
          </CardHeader>
        </Card>

        {/* ✅ Connection Status Alert */}
        {!isConnected && (
          <Card className="border-l-4 border-l-red-500 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">You're offline</p>
                  <p className="text-xs text-red-700">
                    Game updates and ticket bookings will resume when your connection is restored.
                  </p>
                </div>
                <Button 
                  onClick={loadActiveGames}
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-100"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ✅ Enhanced Active Games List */}
        {activeGames.length > 1 && (
          <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
            <CardHeader>
              <CardTitle className="text-2xl text-gray-800 text-center flex items-center justify-between">
                <span>Available Games</span>
                <div className="flex items-center space-x-2">
                  {isConnected && autoRefreshEnabled && (
                    <Badge variant="default" className="bg-green-500">
                      <Wifi className="w-3 h-3 mr-1" />
                      Live
                    </Badge>
                  )}
                  <Badge variant="outline">{activeGames.length} Available</Badge>
                </div>
              </CardTitle>
              <p className="text-gray-600 text-center">Choose a game to join</p>
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
                        <div className="flex flex-col items-end space-y-1">
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
                          {isConnected && (
                            <Badge variant="outline" className="text-xs bg-green-50">
                              <Wifi className="w-2 h-2 mr-1" />
                              Live
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>Max Tickets:</span>
                          <span className="font-medium">{game.maxTickets}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Booked:</span>
                          <span className="font-medium text-green-600">
                            {game.tickets ? Object.values(game.tickets).filter(t => t.isBooked).length : 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Available:</span>
                          <span className="font-medium text-blue-600">
                            {game.tickets ? Math.min(game.maxTickets, Object.keys(game.tickets).length) - Object.values(game.tickets).filter(t => t.isBooked).length : 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Progress:</span>
                          <span className="font-medium text-purple-600">
                            {(game.gameState.calledNumbers || []).length}/90
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

        {/* ✅ Enhanced Game Status */}
        {selectedGame ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100">Active Players</p>
                    <p className="text-2xl font-bold">{getBookedTicketsCount()}</p>
                  </div>
                  <Users className="w-8 h-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100">Available Tickets</p>
                    <p className="text-2xl font-bold">{getAvailableTicketsCount()}</p>
                  </div>
                  <Ticket className="w-8 h-8 text-green-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100">Game Status</p>
                    <p className="text-lg font-bold">
                      {selectedGame.gameState.isActive ? 'Live' : 
                       selectedGame.gameState.isCountdown ? 'Starting' : 
                       selectedGame.gameState.gameOver ? 'Ended' : 'Waiting'}
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <Gamepad2 className="w-6 h-6 text-purple-200" />
                    {isConnected && (
                      <Wifi className="w-3 h-3 text-purple-200 mt-1" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-yellow-100">Max Tickets</p>
                    <p className="text-2xl font-bold">{selectedGame.maxTickets}</p>
                  </div>
                  <Trophy className="w-8 h-8 text-yellow-200" />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
            <CardContent className="p-8 text-center">
              <div className="text-6xl mb-4">🎯</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">No Active Games</h2>
              <p className="text-gray-600 mb-4">
                There are currently no active Tambola games. Please check back later or contact the host to start a new game.
              </p>
              <div className="flex justify-center space-x-3">
                <Button 
                  onClick={loadActiveGames}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh Games
                </Button>
                <Button
                  onClick={toggleAutoRefresh}
                  variant="outline"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  {autoRefreshEnabled ? 'Disable Auto-refresh' : 'Enable Auto-refresh'}
                </Button>
              </div>
              
              {!isConnected && (
                <p className="text-sm text-red-600 mt-4 flex items-center justify-center">
                  <WifiOff className="w-4 h-4 mr-2" />
                  Check your internet connection
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ✅ Enhanced Ticket Booking Grid with Real-time Updates */}
        {selectedGame && Object.keys(tickets).length > 0 && (
          <TicketBookingGrid 
            tickets={tickets}
            gameData={selectedGame}
            onBookTicket={handleBookTicket}
            onGameStart={() => setCurrentView('game')}
            isConnected={isConnected}
            lastUpdate={lastUpdate}
          />
        )}

        {/* How to Play Section */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-800 text-center">How to Play</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4">
              <div className="text-4xl mb-3">📱</div>
              <h3 className="font-bold text-lg text-gray-800 mb-2">Book via WhatsApp</h3>
              <p className="text-gray-600">Click on any available ticket to book it through WhatsApp messaging with the host.</p>
            </div>
            <div className="text-center p-4">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="font-bold text-lg text-gray-800 mb-2">Mark Numbers</h3>
              <p className="text-gray-600">Mark the called numbers on your ticket during the live game.</p>
            </div>
            <div className="text-center p-4">
              <div className="text-4xl mb-3">🏆</div>
              <h3 className="font-bold text-lg text-gray-800 mb-2">Win Prizes</h3>
              <p className="text-gray-600">Complete patterns like lines, corners, or full house to win exciting prizes!</p>
            </div>
          </CardContent>
        </Card>

        {/* ✅ Enhanced Debug info for connection status (development only) */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="bg-gray-100 border border-gray-300">
            <CardContent className="p-3">
              <div className="text-xs text-gray-600 space-y-1">
                <p>🔧 Debug Info (UserLandingPage):</p>
                <p>Connection: {isConnected ? '✅ Connected' : '❌ Disconnected'}</p>
                <p>Auto-refresh: {autoRefreshEnabled ? '✅ Enabled' : '❌ Disabled'}</p>
                <p>Last Update: {lastUpdate || 'Never'}</p>
                <p>Active Games: {activeGames.length}</p>
                <p>Selected Game: {selectedGame?.gameId || 'None'}</p>
                <p>Tickets Loaded: {Object.keys(tickets).length}</p>
                <p>Booked Tickets: {getBookedTicketsCount()}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
