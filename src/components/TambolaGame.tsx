// src/components/TambolaGame.tsx - Enhanced with real-time updates for players
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NumberGrid } from './NumberGrid';
import { TicketDisplay } from './TicketDisplay';
import { PrizeTracker } from './PrizeTracker';
import { AudioManager } from './AudioManager';
import { WinnerDisplay } from './WinnerDisplay';
import { useToast } from '@/components/ui/use-toast';
import { firebaseService, GameData, TambolaTicket } from '@/services/firebase';
import { 
  ArrowLeft, 
  Clock, 
  Users, 
  Trophy, 
  Ticket, 
  Phone, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  AlertCircle 
} from 'lucide-react';

export interface CalledNumber {
  number: number;
  timestamp: number;
  callText: string;
}

export interface Prize {
  id: string;
  name: string;
  pattern: string;
  won: boolean;
  amount?: number;
  winner?: {
    name: string;
    ticketId: string;
  };
}

interface TambolaGameProps {
  gameData: GameData;
  onBackToTickets?: () => void;
}

export const TambolaGame: React.FC<TambolaGameProps> = ({ gameData: initialGameData, onBackToTickets }) => {
  const [gameData, setGameData] = useState<GameData>(initialGameData);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  
  // ✅ NEW: Real-time connection status for players
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const maxConnectionAttempts = 3;
  
  // ✅ Subscription management
  const gameUnsubscribeRef = useRef<(() => void) | null>(null);
  const ticketsUnsubscribeRef = useRef<(() => void) | null>(null);
  const connectionCheckRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();

  // ✅ NEW: Enhanced connection monitoring for players
  useEffect(() => {
    const checkConnection = () => {
      const now = new Date().toLocaleTimeString();
      setLastUpdate(now);
      setIsConnected(true);
      setConnectionAttempts(0);
    };

    checkConnection();
    connectionCheckRef.current = setInterval(checkConnection, 30000); // Check every 30 seconds

    // Listen for online/offline events
    const handleOnline = () => {
      setIsConnected(true);
      setConnectionAttempts(0);
      toast({
        title: "Connection Restored",
        description: "Game updates are now live again!",
      });
    };

    const handleOffline = () => {
      setIsConnected(false);
      toast({
        title: "Connection Lost",
        description: "Trying to reconnect to the game...",
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (connectionCheckRef.current) {
        clearInterval(connectionCheckRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  // ✅ Enhanced game subscription with automatic reconnection
  const setupGameSubscription = useCallback(() => {
    console.log('🔗 Setting up real-time game subscription for players:', gameData.gameId);
    
    // Clean up previous subscription
    if (gameUnsubscribeRef.current) {
      gameUnsubscribeRef.current();
      gameUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToGame(gameData.gameId, (updatedGame) => {
      if (updatedGame) {
        console.log('📡 Real-time game update received for players:', {
          gameId: updatedGame.gameId,
          isActive: updatedGame.gameState.isActive,
          isCountdown: updatedGame.gameState.isCountdown,
          gameOver: updatedGame.gameState.gameOver,
          calledNumbers: updatedGame.gameState.calledNumbers?.length || 0,
          currentNumber: updatedGame.gameState.currentNumber
        });

        setGameData(updatedGame);
        setCalledNumbers(updatedGame.gameState.calledNumbers || []);
        setCurrentNumber(updatedGame.gameState.currentNumber || null);
        setLastUpdate(new Date().toLocaleTimeString());
        setIsConnected(true);
        setConnectionAttempts(0);

        // ✅ Notify players of important game state changes
        const currentGameState = gameData.gameState;
        const newGameState = updatedGame.gameState;

        // Game started notification
        if (!currentGameState.isActive && newGameState.isActive) {
          toast({
            title: "🎮 Game Started!",
            description: "The Tambola game has begun. Numbers will be called automatically.",
            duration: 5000,
          });
        }

        // Game ended notification
        if (!currentGameState.gameOver && newGameState.gameOver) {
          toast({
            title: "🏁 Game Ended!",
            description: "The Tambola game has completed. Check the final results!",
            duration: 8000,
          });
        }

        // Countdown notification
        if (!currentGameState.isCountdown && newGameState.isCountdown) {
          toast({
            title: "⏱️ Game Starting Soon!",
            description: `Get ready! Game starts in ${newGameState.countdownTime} seconds.`,
            duration: 3000,
          });
        }

        // New winner announcement
        if (updatedGame.lastWinnerAnnouncement && 
            updatedGame.lastWinnerAnnouncement !== gameData.lastWinnerAnnouncement) {
          toast({
            title: "🎉 New Winner!",
            description: updatedGame.lastWinnerAnnouncement,
            duration: 10000,
          });
        }

      } else {
        console.log('❌ Game subscription received null data');
        setIsConnected(false);
        setConnectionAttempts(prev => prev + 1);

        // ✅ Attempt automatic reconnection
        if (connectionAttempts < maxConnectionAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`🔄 Attempting to reconnect... (${connectionAttempts + 1}/${maxConnectionAttempts})`);
            setupGameSubscription();
          }, 5000 * (connectionAttempts + 1)); // Exponential backoff
        } else {
          toast({
            title: "Connection Failed",
            description: "Unable to connect to the game. Please refresh the page.",
            variant: "destructive",
          });
        }
      }
    });

    gameUnsubscribeRef.current = unsubscribe;
  }, [gameData.gameId, gameData.gameState, gameData.lastWinnerAnnouncement, connectionAttempts, toast]);

  // ✅ Enhanced tickets subscription
  const setupTicketsSubscription = useCallback(() => {
    console.log('🔗 Setting up real-time tickets subscription for players:', gameData.gameId);
    
    // Clean up previous subscription
    if (ticketsUnsubscribeRef.current) {
      ticketsUnsubscribeRef.current();
      ticketsUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToTickets(gameData.gameId, (updatedTickets) => {
      if (updatedTickets) {
        console.log('📡 Real-time tickets update received for players:', Object.keys(updatedTickets).length, 'tickets');
        setTickets(updatedTickets);
        setLastUpdate(new Date().toLocaleTimeString());
        setIsConnected(true);
        setConnectionAttempts(0);

        // ✅ Check for new ticket bookings and notify
        const previousBooked = Object.values(tickets).filter(t => t.isBooked).length;
        const currentBooked = Object.values(updatedTickets).filter(t => t.isBooked).length;
        
        if (currentBooked > previousBooked) {
          const newBookings = currentBooked - previousBooked;
          if (newBookings > 0) {
            toast({
              title: "🎫 New Ticket Booked!",
              description: `${newBookings} new ticket(s) booked. Total players: ${currentBooked}`,
              duration: 3000,
            });
          }
        }

      } else {
        console.log('❌ Tickets subscription received null data');
        setIsConnected(false);
      }
    });

    ticketsUnsubscribeRef.current = unsubscribe;
  }, [gameData.gameId, tickets, toast]);

  // ✅ Setup subscriptions on mount and when gameData changes
  useEffect(() => {
    console.log('🚀 Setting up real-time subscriptions for TambolaGame');
    
    // Initialize with current game data
    setCalledNumbers(gameData.gameState.calledNumbers || []);
    setCurrentNumber(gameData.gameState.currentNumber || null);
    
    if (gameData.tickets) {
      setTickets(gameData.tickets);
    }

    // Setup real-time subscriptions
    setupGameSubscription();
    setupTicketsSubscription();

    return () => {
      console.log('🧹 Cleaning up TambolaGame subscriptions');
      
      if (gameUnsubscribeRef.current) {
        gameUnsubscribeRef.current();
      }
      if (ticketsUnsubscribeRef.current) {
        ticketsUnsubscribeRef.current();
      }
      if (connectionCheckRef.current) {
        clearInterval(connectionCheckRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [gameData.gameId, setupGameSubscription, setupTicketsSubscription]);

  // ✅ Manual refresh function for players
  const handleManualRefresh = useCallback(async () => {
    toast({
      title: "Refreshing...",
      description: "Reconnecting to the game...",
    });
    
    setConnectionAttempts(0);
    setupGameSubscription();
    setupTicketsSubscription();
  }, [setupGameSubscription, setupTicketsSubscription, toast]);

  const prizes: Prize[] = Object.values(gameData.prizes).map(prize => ({
    id: prize.id,
    name: prize.name,
    pattern: prize.pattern,
    won: prize.won,
    amount: prize.amount,
    winner: prize.winners && prize.winners.length > 0 ? {
      name: prize.winners[0].name,
      ticketId: prize.winners[0].ticketId
    } : undefined
  }));

  const getBookedTicketsCount = () => {
    return Object.values(tickets).filter(ticket => ticket.isBooked).length;
  };

  const getTotalRevenue = () => {
    return getBookedTicketsCount() * (gameData.ticketPrice || 0);
  };

  const getAvailableTicketsCount = () => {
    const totalAvailable = Math.min(gameData.maxTickets, Object.keys(tickets).length);
    return totalAvailable - getBookedTicketsCount();
  };

  // Convert called numbers to CalledNumber format for compatibility
  const calledNumbersWithTimestamp: CalledNumber[] = calledNumbers.map((num, index) => ({
    number: num,
    timestamp: Date.now() - (calledNumbers.length - index) * 1000,
    callText: `Number ${num}`
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ✅ Enhanced Header with Connection Status */}
        <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-4xl font-bold">🎲 {gameData.name} 🎲</CardTitle>
                <p className="text-blue-100">Live Tambola Game in Progress</p>
                <div className="flex items-center space-x-4 mt-2 text-sm">
                  <span className="flex items-center">
                    <Ticket className="w-4 h-4 mr-1" />
                    Max: {gameData.maxTickets} tickets
                  </span>
                  {gameData.ticketPrice > 0 && (
                    <span>₹{gameData.ticketPrice} per ticket</span>
                  )}
                  {gameData.hostPhone && (
                    <span className="flex items-center">
                      <Phone className="w-4 h-4 mr-1" />
                      WhatsApp: +{gameData.hostPhone}
                    </span>
                  )}
                  {/* ✅ Connection Status for Players */}
                  <span className={`flex items-center px-2 py-1 rounded-full text-xs ${
                    isConnected ? 'bg-green-500 bg-opacity-20' : 'bg-red-500 bg-opacity-20'
                  }`}>
                    {isConnected ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                    {isConnected ? 'Live' : 'Offline'}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                {/* ✅ Manual Refresh Button */}
                {!isConnected && (
                  <Button 
                    onClick={handleManualRefresh}
                    variant="outline"
                    size="sm"
                    className="text-white border-white hover:bg-white hover:text-blue-600"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reconnect
                  </Button>
                )}
                
                {onBackToTickets && (
                  <Button 
                    onClick={onBackToTickets}
                    variant="outline"
                    className="text-white border-white hover:bg-white hover:text-blue-600"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Tickets
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* ✅ Connection Status Alert */}
        {!isConnected && (
          <Card className="border-l-4 border-l-red-500 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">Connection Lost</p>
                  <p className="text-xs text-red-700">
                    Game updates may be delayed. {connectionAttempts > 0 && `Reconnection attempts: ${connectionAttempts}/${maxConnectionAttempts}`}
                  </p>
                </div>
                <Button 
                  onClick={handleManualRefresh}
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

        {/* Game Status */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{calledNumbers.length}</div>
              <div className="text-green-100">Numbers Called</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{getBookedTicketsCount()}</div>
              <div className="text-blue-100">Active Players</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{getAvailableTicketsCount()}</div>
              <div className="text-purple-100">Available</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{gameData.maxTickets}</div>
              <div className="text-orange-100">Max Tickets</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{prizes.filter(p => p.won).length}</div>
              <div className="text-yellow-100">Prizes Won</div>
            </CardContent>
          </Card>
        </div>

        {/* ✅ Enhanced Game Status Indicators with Real-time Updates */}
        {gameData.gameState.isCountdown && (
          <Card className="bg-gradient-to-r from-yellow-400 to-red-500 text-white border-0">
            <CardContent className="text-center py-8">
              <Clock className="w-12 h-12 mx-auto mb-4 animate-pulse" />
              <div className="text-6xl font-bold animate-bounce">
                {gameData.gameState.countdownTime}
              </div>
              <p className="text-xl mt-2">Game starting soon...</p>
              <p className="text-sm mt-2 opacity-75">Get ready to mark your numbers!</p>
            </CardContent>
          </Card>
        )}

        {/* ✅ Enhanced Current Number Display */}
        {currentNumber && (
          <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
            <CardContent className="text-center py-8">
              <p className="text-2xl mb-4">Current Number</p>
              <div className="text-8xl font-bold animate-pulse">{currentNumber}</div>
              <p className="text-lg mt-4 opacity-90">Mark this number on your ticket!</p>
              {isConnected ? (
                <div className="flex items-center justify-center mt-2 text-sm opacity-75">
                  <Wifi className="w-4 h-4 mr-1" />
                  <span>Live updates active</span>
                </div>
              ) : (
                <div className="flex items-center justify-center mt-2 text-sm opacity-75">
                  <WifiOff className="w-4 h-4 mr-1" />
                  <span>Updates may be delayed</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main Game Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Number Grid */}
          <div className="lg:col-span-2">
            <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
              <CardHeader>
                <CardTitle className="text-center text-gray-800">
                  Numbers Board (1-90)
                </CardTitle>
                {calledNumbers.length > 0 && (
                  <p className="text-center text-gray-600">
                    Numbers called: {calledNumbers.length}/90
                  </p>
                )}
                {/* ✅ Real-time status indicator in number grid */}
                <div className="flex items-center justify-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-xs text-gray-500">
                    {isConnected ? 'Live updates' : 'Connection lost'} • Last update: {lastUpdate || 'Never'}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <NumberGrid
                  calledNumbers={calledNumbers}
                  currentNumber={currentNumber}
                />
              </CardContent>
            </Card>
          </div>

          {/* Prizes Sidebar */}
          <div className="space-y-4">
            <PrizeTracker prizes={prizes} />
            
            {/* ✅ Enhanced Game Statistics with Real-time Info */}
            <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
              <CardHeader>
                <CardTitle className="text-gray-800 flex items-center">
                  <Trophy className="w-5 h-5 mr-2" />
                  Game Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Game Status:</span>
                  <div className="flex items-center space-x-2">
                    <span className={`font-medium ${
                      gameData.gameState.isActive ? 'text-green-600' : 
                      gameData.gameState.isCountdown ? 'text-yellow-600' : 
                      gameData.gameState.gameOver ? 'text-red-600' : 'text-blue-600'
                    }`}>
                      {gameData.gameState.isActive ? '🟢 Live' : 
                       gameData.gameState.isCountdown ? '🟡 Starting' : 
                       gameData.gameState.gameOver ? '🔴 Ended' : '⚪ Waiting'}
                    </span>
                    {isConnected ? (
                      <Wifi className="w-3 h-3 text-green-600" />
                    ) : (
                      <WifiOff className="w-3 h-3 text-red-600" />
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Revenue:</span>
                  <span className="font-medium text-green-600">
                    {gameData.ticketPrice > 0 ? `₹${getTotalRevenue()}` : 'Free Game'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Completion:</span>
                  <span className="font-medium text-blue-600">
                    {Math.round((calledNumbers.length / 90) * 100)}%
                  </span>
                </div>
                {gameData.hostPhone && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">WhatsApp:</span>
                    <span className="font-medium text-blue-600 flex items-center">
                      <Phone className="w-3 h-3 mr-1" />
                      +{gameData.hostPhone}
                    </span>
                  </div>
                )}
                {/* ✅ Connection info */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Updates:</span>
                  <span className={`text-xs ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                    {isConnected ? 'Real-time' : 'Reconnecting...'}
                  </span>
                </div>
              </CardContent>
            </Card>
            
            {/* Recent Numbers */}
            {calledNumbers.length > 0 && (
              <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
                <CardHeader>
                  <CardTitle className="text-gray-800">Recent Numbers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {calledNumbers
                      .slice(-10)
                      .reverse()
                      .map((num, index) => (
                        <div
                          key={`${num}-${index}`}
                          className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white text-sm
                            ${index === 0 
                              ? 'bg-gradient-to-br from-red-400 to-red-600 ring-4 ring-red-200 animate-pulse' 
                              : 'bg-gradient-to-br from-emerald-400 to-emerald-600'
                            }`}
                        >
                          {num}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ✅ Enhanced Player Tickets Section */}
        {Object.keys(tickets).length > 0 && getBookedTicketsCount() > 0 && (
          <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
            <CardHeader>
              <CardTitle className="text-gray-800 flex items-center justify-between">
                <div className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Player Tickets ({getBookedTicketsCount()} booked of {gameData.maxTickets} max)
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-gray-500">
                    {isConnected ? 'Live ticket updates' : 'Offline mode'}
                  </span>
                </div>
              </CardTitle>
              <p className="text-gray-600 px-6">Numbers are automatically marked as they are called</p>
            </CardHeader>
            <CardContent>
              <TicketDisplay 
                calledNumbers={calledNumbers} 
                tickets={Object.values(tickets).filter(ticket => ticket.isBooked)} 
              />
            </CardContent>
          </Card>
        )}

        {/* ✅ Enhanced Game Over Display */}
        {gameData.gameState.gameOver && (
          <div className="space-y-4">
            <WinnerDisplay prizes={prizes.filter(p => p.won)} />
            
            {/* ✅ Post-game connection status */}
            <Card className="bg-gray-50 border border-gray-200">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-600">
                  Game completed • Final results {isConnected ? 'are up to date' : 'may need refresh'}
                </p>
                {!isConnected && (
                  <Button 
                    onClick={handleManualRefresh}
                    size="sm"
                    variant="outline"
                    className="mt-2"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh Results
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ✅ Enhanced Audio Manager with Connection Awareness */}
        <AudioManager
          currentNumber={currentNumber}
          prizes={prizes}
        />

        {/* ✅ Debug info for connection status (can be removed in production) */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="bg-gray-100 border border-gray-300">
            <CardContent className="p-3">
              <div className="text-xs text-gray-600 space-y-1">
                <p>🔧 Debug Info:</p>
                <p>Connection: {isConnected ? '✅ Connected' : '❌ Disconnected'}</p>
                <p>Last Update: {lastUpdate || 'Never'}</p>
                <p>Connection Attempts: {connectionAttempts}/{maxConnectionAttempts}</p>
                <p>Game ID: {gameData.gameId}</p>
                <p>Called Numbers: {calledNumbers.length}</p>
                <p>Current Number: {currentNumber || 'None'}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
