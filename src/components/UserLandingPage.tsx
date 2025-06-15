// src/components/UserLandingPage.tsx - Optimized for fast initial load
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketBookingGrid } from './TicketBookingGrid';
import { TambolaGame } from './TambolaGame';
import { firebaseService, GameData, TambolaTicket } from '@/services/firebase';
import { 
  Loader2, 
  Trophy, 
  Gamepad2, 
  Phone,
  Ticket,
  RefreshCw,
  Activity
} from 'lucide-react';

// Simplified data structures for initial load
interface GameSummary {
  gameId: string;
  name: string;
  hostPhone?: string;
  maxTickets: number;
  isActive: boolean;
  isCountdown: boolean;
  hasStarted: boolean;
}

export const UserLandingPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'tickets' | 'game'>('tickets');
  const [selectedGame, setSelectedGame] = useState<GameData | null>(null);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  const [gameSummaries, setGameSummaries] = useState<GameSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Single subscription reference
  const subscriptionRef = useRef<(() => void) | null>(null);
  const selectedGameSubscriptionRef = useRef<(() => void) | null>(null);

  // Fast initial load - get only game summaries
  const loadGames = useCallback(async () => {
    try {
      const games = await firebaseService.getAllActiveGames();
      
      // Convert to summaries for faster rendering
      const summaries: GameSummary[] = games.map(game => ({
        gameId: game.gameId,
        name: game.name,
        hostPhone: game.hostPhone,
        maxTickets: game.maxTickets,
        isActive: game.gameState.isActive,
        isCountdown: game.gameState.isCountdown,
        hasStarted: (game.gameState.calledNumbers?.length || 0) > 0
      }));
      
      setGameSummaries(summaries);
      setLastUpdate(new Date());
      
      // Auto-select first game if none selected
      if (summaries.length > 0 && !selectedGame) {
        selectGame(summaries[0].gameId);
      }
    } catch (error) {
      console.error('Failed to load games:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedGame]);

  // Select and load full game data
  const selectGame = useCallback(async (gameId: string) => {
    try {
      // Clean up previous subscription
      if (selectedGameSubscriptionRef.current) {
        selectedGameSubscriptionRef.current();
        selectedGameSubscriptionRef.current = null;
      }

      // Subscribe to selected game
      const unsubscribe = firebaseService.subscribeToGame(gameId, (updatedGame) => {
        if (updatedGame) {
          setSelectedGame(updatedGame);
          
          // Load tickets only when needed
          if (updatedGame.tickets) {
            setTickets(updatedGame.tickets);
          }
          
          // Auto-switch to game view when game starts
          const hasGameStarted = (updatedGame.gameState.calledNumbers && updatedGame.gameState.calledNumbers.length > 0) || 
                                updatedGame.gameState.isActive || 
                                updatedGame.gameState.isCountdown;
          
          if (hasGameStarted && currentView === 'tickets') {
            setCurrentView('game');
          }
        } else {
          // Game was deleted
          setSelectedGame(null);
          setTickets({});
          setCurrentView('tickets');
          loadGames(); // Reload games list
        }
      });

      selectedGameSubscriptionRef.current = unsubscribe;
    } catch (error) {
      console.error('Failed to select game:', error);
    }
  }, [currentView, loadGames]);

  // Initial load
  useEffect(() => {
    loadGames();

    // Setup subscription for game list updates
    const unsubscribe = firebaseService.subscribeToAllActiveGames((games) => {
      const summaries: GameSummary[] = games.map(game => ({
        gameId: game.gameId,
        name: game.name,
        hostPhone: game.hostPhone,
        maxTickets: game.maxTickets,
        isActive: game.gameState.isActive,
        isCountdown: game.gameState.isCountdown,
        hasStarted: (game.gameState.calledNumbers?.length || 0) > 0
      }));
      
      setGameSummaries(summaries);
      setLastUpdate(new Date());
    });

    subscriptionRef.current = unsubscribe;

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current();
      }
      if (selectedGameSubscriptionRef.current) {
        selectedGameSubscriptionRef.current();
      }
    };
  }, [loadGames]);

  const handleBookTicket = async (ticketId: string, playerName: string, playerPhone: string) => {
    if (!selectedGame) return;

    try {
      await firebaseService.bookTicket(ticketId, playerName, playerPhone, selectedGame.gameId);
    } catch (error: any) {
      alert(error.message || 'Failed to book ticket');
    }
  };

  const handleGameStart = () => {
    setCurrentView('game');
  };

  const handleRefresh = () => {
    loadGames();
  };

  // Show game view
  if (currentView === 'game' && selectedGame) {
    return <TambolaGame gameData={selectedGame} onBackToTickets={() => setCurrentView('tickets')} />;
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
              <Badge variant="default" className="flex items-center">
                <Activity className="w-3 h-3 mr-1" />
                Live Updates
              </Badge>
              {lastUpdate && (
                <Badge variant="outline" className="text-xs">
                  {lastUpdate.toLocaleTimeString()}
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
          <>
            {/* Games Selection - Simple Cards */}
            {gameSummaries.length > 1 && (
              <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
                <CardHeader>
                  <CardTitle className="text-2xl text-gray-800 text-center">
                    Available Games ({gameSummaries.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {gameSummaries.map((game) => (
                      <Card 
                        key={game.gameId}
                        className={`cursor-pointer transition-all duration-200 ${
                          selectedGame?.gameId === game.gameId
                            ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                            : 'border-gray-200 hover:border-orange-300'
                        }`}
                        onClick={() => selectGame(game.gameId)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-gray-800">{game.name}</h3>
                            <Badge 
                              variant={
                                game.isActive ? "default" :
                                game.isCountdown ? "secondary" :
                                "outline"
                              }
                            >
                              {game.isActive ? '🟢 Live' : 
                               game.isCountdown ? '🟡 Starting' : '⚪ Waiting'}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            <div className="flex items-center">
                              <Ticket className="w-4 h-4 mr-1" />
                              Max Tickets: {game.maxTickets}
                            </div>
                            {game.hostPhone && (
                              <div className="flex items-center mt-1">
                                <Phone className="w-3 h-3 mr-1" />
                                +{game.hostPhone}
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
            {selectedGame && (
              <>
                <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
                  <CardContent className="p-6">
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-gray-800 mb-4">{selectedGame.name}</h2>
                      <div className="flex justify-center items-center space-x-8">
                        <div className="text-center">
                          <Ticket className="w-8 h-8 mx-auto mb-1 text-blue-600" />
                          <p className="text-lg font-bold">
                            {Object.values(tickets).filter(t => t.isBooked).length}
                          </p>
                          <p className="text-sm text-gray-600">Booked</p>
                        </div>
                        <div className="text-center">
                          <Trophy className="w-8 h-8 mx-auto mb-1 text-purple-600" />
                          <p className="text-lg font-bold">
                            {selectedGame.maxTickets - Object.values(tickets).filter(t => t.isBooked).length}
                          </p>
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
            )}
          </>
        )}
      </div>
    </div>
  );
};
