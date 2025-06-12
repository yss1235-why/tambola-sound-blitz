// src/components/UserLandingPage.tsx - Updated with Smart Polling
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketBookingGrid } from './TicketBookingGrid';
import { TambolaGame } from './TambolaGame';
import { useSmartPolling } from '@/hooks/useSmartPolling';
import { firebaseService, GameData, TambolaTicket } from '@/services/firebase';
import { 
  Loader2, 
  Users, 
  Trophy, 
  Gamepad2, 
  Phone,
  Ticket,
  RefreshCw,
  Clock,
  Activity,
  Eye,
  EyeOff
} from 'lucide-react';

export const UserLandingPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'tickets' | 'game'>('tickets');
  const [selectedGame, setSelectedGame] = useState<GameData | null>(null);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  const [showPollingDetails, setShowPollingDetails] = useState(false);
  
  // Subscription management for selected game (real-time)
  const selectedGameUnsubscribeRef = useRef<(() => void) | null>(null);
  const ticketsUnsubscribeRef = useRef<(() => void) | null>(null);

  // ✅ Smart polling for game list (replaces real-time subscription)
  const {
    games: activeGames,
    isLoading,
    lastUpdate,
    isActive,
    isVisible,
    pollCount,
    error,
    refresh,
    currentInterval,
    getStatusText,
    getNextUpdateIn
  } = useSmartPolling({
    activeInterval: 10000,   // 10 seconds when active
    idleInterval: 30000,     // 30 seconds when idle
    activityTimeout: 30000,  // 30 seconds to consider idle
    enabled: currentView === 'tickets' // Only poll on landing page, not during gameplay
  });

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

  // ✅ Real-time subscription for selected game (kept for immediate updates)
  const setupSelectedGameSubscription = useCallback((game: GameData) => {
    // Clean up previous subscription
    if (selectedGameUnsubscribeRef.current) {
      selectedGameUnsubscribeRef.current();
      selectedGameUnsubscribeRef.current = null;
    }

    console.log('🎮 Setting up real-time subscription for selected game:', game.name);

    const unsubscribe = firebaseService.subscribeToGame(game.gameId, (updatedGame) => {
      if (updatedGame) {
        console.log('📡 Real-time update for selected game:', updatedGame.name);
        setSelectedGame(updatedGame);
      }
    });

    selectedGameUnsubscribeRef.current = unsubscribe;
  }, []);

  // ✅ Real-time subscription for tickets (kept for booking updates)
  const setupTicketsSubscription = useCallback((gameId: string) => {
    // Clean up previous subscription
    if (ticketsUnsubscribeRef.current) {
      ticketsUnsubscribeRef.current();
      ticketsUnsubscribeRef.current = null;
    }

    console.log('🎫 Setting up real-time subscription for tickets:', gameId);

    const unsubscribe = firebaseService.subscribeToTickets(gameId, (updatedTickets) => {
      if (updatedTickets) {
        console.log('📡 Real-time update for tickets:', Object.keys(updatedTickets).length);
        setTickets(updatedTickets);
      }
    });

    ticketsUnsubscribeRef.current = unsubscribe;
  }, []);

  // Auto-select first game when games list updates
  useEffect(() => {
    if (activeGames.length > 0 && !selectedGame) {
      const firstGame = activeGames[0];
      console.log('🎯 Auto-selecting first available game:', firstGame.name);
      setSelectedGame(firstGame);
      setupSelectedGameSubscription(firstGame);
      
      if (firstGame.tickets) {
        setTickets(firstGame.tickets);
        setupTicketsSubscription(firstGame.gameId);
      }
    } else if (activeGames.length === 0 && selectedGame) {
      // No games available, clean up
      setSelectedGame(null);
      setTickets({});
    }
  }, [activeGames, selectedGame, setupSelectedGameSubscription, setupTicketsSubscription]);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      if (selectedGameUnsubscribeRef.current) {
        selectedGameUnsubscribeRef.current();
      }
      if (ticketsUnsubscribeRef.current) {
        ticketsUnsubscribeRef.current();
      }
    };
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
    console.log('🎯 User selected game:', game.name);
    setSelectedGame(game);
    
    // Setup real-time subscriptions for the selected game
    setupSelectedGameSubscription(game);
    
    if (game.tickets) {
      setTickets(game.tickets);
      setupTicketsSubscription(game.gameId);
    }
  };

  // Switch to game view (this will disable polling and enable full real-time)
  const handleGameStart = () => {
    console.log('🎮 Switching to game view - enabling full real-time mode');
    setCurrentView('game');
  };

  const handleBackToTickets = () => {
    console.log('🔙 Returning to ticket view - resuming smart polling');
    setCurrentView('tickets');
  };

  // Format time for display
  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const formatInterval = (ms: number) => {
    return `${ms / 1000}s`;
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
              <p className="text-sm text-gray-500">Setting up smart polling...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Section with Smart Polling Status */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              🎲 Welcome to Tambola! 🎲
            </CardTitle>
            <p className="text-gray-600 text-lg mt-2">
              Join the excitement! Book your tickets and play live Tambola games.
            </p>
            
            {/* Smart Polling Status */}
            <div className="flex items-center justify-center space-x-4 mt-4">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                <span className="text-sm font-medium">
                  {isActive ? 'Fast Updates' : 'Standard Updates'} ({formatInterval(currentInterval)})
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                {isVisible ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                <span className="text-sm text-gray-600">{getStatusText()}</span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPollingDetails(!showPollingDetails)}
                className="text-xs"
              >
                <Activity className="w-3 h-3 mr-1" />
                Details
              </Button>
            </div>

            {/* Detailed Polling Info (Collapsible) */}
            {showPollingDetails && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="font-medium">Last Update:</span>
                    <div>{formatTime(lastUpdate)}</div>
                  </div>
                  <div>
                    <span className="font-medium">Poll Count:</span>
                    <div>{pollCount}</div>
                  </div>
                  <div>
                    <span className="font-medium">Mode:</span>
                    <div>{isActive ? '🏃 Active (10s)' : '😴 Idle (30s)'}</div>
                  </div>
                  <div>
                    <span className="font-medium">Tab Status:</span>
                    <div>{isVisible ? '👁️ Visible' : '🙈 Hidden'}</div>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-red-500 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-red-700">{error}</span>
                </div>
                <Button onClick={refresh} size="sm" variant="outline">
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
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={refresh}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </div>
              </CardTitle>
              <p className="text-gray-600 text-center">
                Choose a game to join • Updates every {formatInterval(currentInterval)} 
                {lastUpdate && (
                  <span className="text-gray-500"> • Last updated {formatTime(lastUpdate)}</span>
                )}
              </p>
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
                        <div className="flex items-center space-x-1">
                          {selectedGame?.gameId === game.gameId && (
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Real-time updates active"></div>
                          )}
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
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>Max Tickets:</span>
                          <span className="font-medium">{getEffectiveMaxTickets(game)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Booked:</span>
                          <span className="font-medium text-green-600">
                            {getBookedCount(game)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Available:</span>
                          <span className="font-medium text-blue-600">
                            {getAvailableTicketsForDisplay(game)}
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

        {/* Game Status Cards */}
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
                  <Gamepad2 className="w-8 h-8 text-purple-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-yellow-100">Max Tickets</p>
                    <p className="text-2xl font-bold">{getEffectiveMaxTickets(selectedGame)}</p>
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
                There are currently no active Tambola games. New games will appear automatically when hosts create them.
              </p>
              <div className="flex items-center justify-center space-x-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                <span className="text-gray-600">
                  Checking for new games every {formatInterval(currentInterval)}
                </span>
              </div>
              <Button 
                onClick={refresh}
                className="mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
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

        {/* Ticket Booking Grid */}
        {selectedGame && Object.keys(tickets).length > 0 && (
          <TicketBookingGrid 
            tickets={tickets}
            gameData={selectedGame}
            onBookTicket={handleBookTicket}
            onGameStart={handleGameStart}
          />
        )}
      </div>
    </div>
  );
};
