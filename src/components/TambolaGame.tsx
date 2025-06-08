// src/components/TambolaGame.tsx - Updated to show max tickets and game info
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberGrid } from './NumberGrid';
import { TicketDisplay } from './TicketDisplay';
import { PrizeTracker } from './PrizeTracker';
import { AudioManager } from './AudioManager';
import { WinnerDisplay } from './WinnerDisplay';
import { firebaseService, GameData, TambolaTicket } from '@/services/firebase';
import { ArrowLeft, Clock, Users, Trophy, Ticket } from 'lucide-react';

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

  // Subscribe to real-time game updates
  useEffect(() => {
    const unsubscribeGame = firebaseService.subscribeToGame(gameData.gameId, (updatedGame) => {
      if (updatedGame) {
        setGameData(updatedGame);
        setCalledNumbers(updatedGame.gameState.calledNumbers);
        setCurrentNumber(updatedGame.gameState.currentNumber);
      }
    });

    const unsubscribeTickets = firebaseService.subscribeToTickets(gameData.gameId, (updatedTickets) => {
      if (updatedTickets) {
        setTickets(updatedTickets);
      }
    });

    return () => {
      unsubscribeGame();
      unsubscribeTickets();
    };
  }, [gameData.gameId]);

  const prizes: Prize[] = Object.values(gameData.prizes).map(prize => ({
    id: prize.id,
    name: prize.name,
    pattern: prize.pattern,
    won: prize.won,
    amount: prize.amount,
    winner: prize.winner
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
        {/* Header */}
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
                </div>
              </div>
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
          </CardHeader>
        </Card>

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

        {/* Game Status Indicators */}
        {gameData.gameState.isCountdown && (
          <Card className="bg-gradient-to-r from-yellow-400 to-red-500 text-white border-0">
            <CardContent className="text-center py-8">
              <Clock className="w-12 h-12 mx-auto mb-4 animate-pulse" />
              <div className="text-6xl font-bold animate-bounce">
                {gameData.gameState.countdownTime}
              </div>
              <p className="text-xl mt-2">Game starting soon...</p>
            </CardContent>
          </Card>
        )}

        {/* Current Number Display */}
        {currentNumber && (
          <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
            <CardContent className="text-center py-8">
              <p className="text-2xl mb-4">Current Number</p>
              <div className="text-8xl font-bold animate-pulse">{currentNumber}</div>
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
            
            {/* Game Statistics */}
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
                  <span className={`font-medium ${
                    gameData.gameState.isActive ? 'text-green-600' : 
                    gameData.gameState.isCountdown ? 'text-yellow-600' : 'text-blue-600'
                  }`}>
                    {gameData.gameState.isActive ? 'Live' : 
                     gameData.gameState.isCountdown ? 'Starting' : 'Waiting'}
                  </span>
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
                              ? 'bg-gradient-to-br from-red-400 to-red-600 ring-4 ring-red-200' 
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

        {/* Player Tickets */}
        {Object.keys(tickets).length > 0 && (
          <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
            <CardHeader>
              <CardTitle className="text-gray-800 flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Player Tickets ({getBookedTicketsCount()} booked of {gameData.maxTickets} max)
              </CardTitle>
              <p className="text-gray-600">Numbers are automatically marked as they are called</p>
            </CardHeader>
            <CardContent>
              <TicketDisplay 
                calledNumbers={calledNumbers} 
                tickets={Object.values(tickets).filter(ticket => ticket.isBooked)} 
              />
            </CardContent>
          </Card>
        )}

        {/* Game Over Display */}
        {gameData.gameState.gameOver && (
          <WinnerDisplay prizes={prizes.filter(p => p.won)} />
        )}

        {/* Audio Manager */}
        <AudioManager
          currentNumber={currentNumber}
          prizes={prizes}
        />
      </div>
    </div>
  );
};
