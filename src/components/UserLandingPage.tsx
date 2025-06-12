// src/components/UserLandingPage.tsx - Updated version (removed pricing, dates, how to play)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketBookingGrid } from './TicketBookingGrid';
import { TambolaGame } from './TambolaGame';
import { firebaseService, GameData, TambolaTicket } from '@/services/firebase';
import { 
  Loader2, 
  Users, 
  Trophy, 
  Gamepad2, 
  Phone,
  Ticket
} from 'lucide-react';

export const UserLandingPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'tickets' | 'game'>('tickets');
  const [activeGames, setActiveGames] = useState<GameData[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameData | null>(null);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  const [isLoading, setIsLoading] = useState(true);
  
  // Subscription management
  const selectedGameUnsubscribeRef = useRef<(() => void) | null>(null);
  const ticketsUnsubscribeRef = useRef<(() => void) | null>(null);

  // Enhanced real-time subscription for selected game
  const setupSelectedGameSubscription = useCallback((game: GameData) => {
    // Clean up previous subscription
    if (selectedGameUnsubscribeRef.current) {
      selectedGameUnsubscribeRef.current();
      selectedGameUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToGame(game.gameId, (updatedGame) => {
      if (updatedGame) {
        setSelectedGame(updatedGame);
        
        // Update game in active games list
        setActiveGames(prev => prev.map(g => 
          g.gameId === updatedGame.gameId ? updatedGame : g
        ));
      }
    });

    selectedGameUnsubscribeRef.current = unsubscribe;
  }, []);

  // Real-time subscription for tickets
  const setupTicketsSubscription = useCallback((gameId: string) => {
    // Clean up previous subscription
    if (ticketsUnsubscribeRef.current) {
      ticketsUnsubscribeRef.current();
      ticketsUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToTickets(gameId, (updatedTickets) => {
      if (updatedTickets) {
        setTickets(updatedTickets);
      }
    });

    ticketsUnsubscribeRef.current = unsubscribe;
  }, []);

  const loadActiveGames = useCallback(async () => {
    setIsLoading(true);
    try {
      const games = await firebaseService.getAllActiveGames();
      
      // Filter for games that are not over and have available tickets
      const availableGames = games.filter(game => 
        !game.gameState.gameOver && 
        game.tickets && 
        Object.keys(game.tickets).length > 0
      );
      
      setActiveGames(availableGames);
      
      // Auto-select first game and setup subscriptions
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
      console.error('Error loading games:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedGame, setupSelectedGameSubscription, setupTicketsSubscription]);

  // Initial load and cleanup
  useEffect(() => {
    loadActiveGames();

    return () => {
      if (selectedGameUnsubscribeRef.current) {
        selectedGameUnsubscribeRef.current();
      }
      if (ticketsUnsubscribeRef.current) {
        ticketsUnsubscribeRef.current();
      }
    };
  }, [loadActiveGames]);

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
    const totalTickets = Math.min(selectedGame.maxTickets, Object.keys(tickets).length);
    return totalTickets - getBookedTicketsCount();
  };

  const handleGameSelect = (game: GameData) => {
    setSelectedGame(game);
    
    // Setup real-time subscriptions for the selected game
    setupSelectedGameSubscription(game);
    
    if (game.tickets) {
      setTickets(game.tickets);
      setupTicketsSubscription(game.gameId);
    }
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
        {/* Welcome Section */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              🎲 Welcome to Tambola! 🎲
            </CardTitle>
            <p className="text-gray-600 text-lg mt-2">
              Join the excitement! Book your tickets and play live Tambola games.
            </p>
          </CardHeader>
        </Card>

        {/* Active Games List */}
        {activeGames.length > 1 && (
          <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
            <CardHeader>
              <CardTitle className="text-2xl text-gray-800 text-center flex items-center justify-between">
                <span>Available Games</span>
                <Badge variant="outline">{activeGames.length} Available</Badge>
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

        {/* Game Status */}
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
              <Button 
                onClick={loadActiveGames}
                className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
                disabled={isLoading}
              >
                Refresh Games
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
            onGameStart={() => setCurrentView('game')}
          />
        )}
      </div>
    </div>
  );
};
