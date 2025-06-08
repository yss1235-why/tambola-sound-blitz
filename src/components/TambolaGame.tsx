
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberGrid } from './NumberGrid';
import { TicketDisplay } from './TicketDisplay';
import { PrizeTracker } from './PrizeTracker';
import { AudioManager } from './AudioManager';
import { GameControls } from './GameControls';
import { WinnerDisplay } from './WinnerDisplay';

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
  winner?: {
    name: string;
    ticketId: number;
  };
}

export interface GameState {
  isActive: boolean;
  isCountdown: boolean;
  countdownTime: number;
  calledNumbers: CalledNumber[];
  currentNumber: number | null;
  prizes: Prize[];
  gameOver: boolean;
  callInterval: number;
}

const TambolaGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    isActive: false,
    isCountdown: false,
    countdownTime: 0,
    calledNumbers: [],
    currentNumber: null,
    prizes: [
      { id: 'quickFive', name: 'Quick Five', pattern: 'First 5 numbers', won: false },
      { id: 'topLine', name: 'Top Line', pattern: 'Top row complete', won: false },
      { id: 'middleLine', name: 'Middle Line', pattern: 'Middle row complete', won: false },
      { id: 'bottomLine', name: 'Bottom Line', pattern: 'Bottom row complete', won: false },
      { id: 'corners', name: 'Four Corners', pattern: 'All four corners', won: false },
      { id: 'starCorners', name: 'Star Pattern', pattern: 'Corners + center', won: false },
      { id: 'fullHouse', name: 'Full House', pattern: 'Complete ticket', won: false },
      { id: 'secondFullHouse', name: 'Second Full House', pattern: 'Second complete ticket', won: false },
    ],
    gameOver: false,
    callInterval: 6000,
  });

  const [availableNumbers, setAvailableNumbers] = useState<number[]>(
    Array.from({ length: 90 }, (_, i) => i + 1)
  );

  const startGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      isCountdown: true,
      countdownTime: 10, // Reduced for demo
      calledNumbers: [],
      currentNumber: null,
      gameOver: false,
      prizes: prev.prizes.map(p => ({ ...p, won: false, winner: undefined }))
    }));
    setAvailableNumbers(Array.from({ length: 90 }, (_, i) => i + 1));
  }, []);

  const stopGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      isActive: false,
      isCountdown: false,
      gameOver: true
    }));
  }, []);

  const callNextNumber = useCallback(() => {
    if (availableNumbers.length === 0) {
      stopGame();
      return;
    }

    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const numberToBeCalled = availableNumbers[randomIndex];
    
    setAvailableNumbers(prev => prev.filter(n => n !== numberToBeCalled));
    
    setGameState(prev => ({
      ...prev,
      currentNumber: numberToBeCalled,
      calledNumbers: [
        ...prev.calledNumbers,
        {
          number: numberToBeCalled,
          timestamp: Date.now(),
          callText: `Number ${numberToBeCalled}`
        }
      ]
    }));

    // Reset current number after animation
    setTimeout(() => {
      setGameState(prev => ({ ...prev, currentNumber: null }));
    }, 2000);
  }, [availableNumbers, stopGame]);

  // Countdown effect
  useEffect(() => {
    if (gameState.isCountdown && gameState.countdownTime > 0) {
      const timer = setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          countdownTime: prev.countdownTime - 1
        }));
      }, 1000);
      return () => clearTimeout(timer);
    } else if (gameState.isCountdown && gameState.countdownTime === 0) {
      setGameState(prev => ({
        ...prev,
        isCountdown: false,
        isActive: true
      }));
    }
  }, [gameState.isCountdown, gameState.countdownTime]);

  // Auto number calling
  useEffect(() => {
    if (gameState.isActive && !gameState.gameOver) {
      const interval = setInterval(callNextNumber, gameState.callInterval);
      return () => clearInterval(interval);
    }
  }, [gameState.isActive, gameState.gameOver, gameState.callInterval, callNextNumber]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold">🎲 Tambola Game 🎲</CardTitle>
            <p className="text-blue-100">Experience the thrill of traditional Tambola with a modern twist!</p>
          </CardHeader>
        </Card>

        {/* Game Controls */}
        <GameControls
          gameState={gameState}
          onStartGame={startGame}
          onStopGame={stopGame}
          onIntervalChange={(interval) => 
            setGameState(prev => ({ ...prev, callInterval: interval }))
          }
        />

        {/* Countdown Display */}
        {gameState.isCountdown && (
          <Card className="bg-gradient-to-r from-yellow-400 to-red-500 text-white border-0">
            <CardContent className="text-center py-8">
              <div className="text-6xl font-bold animate-bounce">
                {gameState.countdownTime}
              </div>
              <p className="text-xl mt-2">Game starting soon...</p>
            </CardContent>
          </Card>
        )}

        {/* Main Game Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Number Grid */}
          <div className="lg:col-span-2">
            <Card className="tambola-card">
              <CardHeader>
                <CardTitle className="text-center text-gray-800">
                  Numbers Board (1-90)
                </CardTitle>
                {gameState.calledNumbers.length > 0 && (
                  <p className="text-center text-gray-600">
                    Numbers called: {gameState.calledNumbers.length}/90
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <NumberGrid
                  calledNumbers={gameState.calledNumbers.map(cn => cn.number)}
                  currentNumber={gameState.currentNumber}
                />
              </CardContent>
            </Card>
          </div>

          {/* Prizes Sidebar */}
          <div className="space-y-4">
            <PrizeTracker prizes={gameState.prizes} />
            
            {/* Recent Numbers */}
            {gameState.calledNumbers.length > 0 && (
              <Card className="tambola-card">
                <CardHeader>
                  <CardTitle className="text-gray-800">Recent Numbers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {gameState.calledNumbers
                      .slice(-10)
                      .reverse()
                      .map((calledNum, index) => (
                        <div
                          key={calledNum.timestamp}
                          className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white text-sm
                            ${index === 0 
                              ? 'bg-gradient-to-br from-red-400 to-red-600 ring-4 ring-red-200' 
                              : 'bg-gradient-to-br from-emerald-400 to-emerald-600'
                            }`}
                        >
                          {calledNum.number}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Sample Tickets */}
        <Card className="tambola-card">
          <CardHeader>
            <CardTitle className="text-gray-800">Sample Tambola Tickets</CardTitle>
            <p className="text-gray-600">Numbers are automatically marked as they are called</p>
          </CardHeader>
          <CardContent>
            <TicketDisplay calledNumbers={gameState.calledNumbers.map(cn => cn.number)} />
          </CardContent>
        </Card>

        {/* Game Over Display */}
        {gameState.gameOver && (
          <WinnerDisplay prizes={gameState.prizes.filter(p => p.won)} />
        )}

        {/* Audio Manager */}
        <AudioManager
          currentNumber={gameState.currentNumber}
          prizes={gameState.prizes}
        />
      </div>
    </div>
  );
};

export default TambolaGame;
