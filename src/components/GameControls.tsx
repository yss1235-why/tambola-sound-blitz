
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { GameState } from './TambolaGame';

interface GameControlsProps {
  gameState: GameState;
  onStartGame: () => void;
  onStopGame: () => void;
  onIntervalChange: (interval: number) => void;
}

export const GameControls: React.FC<GameControlsProps> = ({
  gameState,
  onStartGame,
  onStopGame,
  onIntervalChange
}) => {
  const handleIntervalChange = (values: number[]) => {
    onIntervalChange(values[0] * 1000);
  };

  return (
    <Card className="tambola-card">
      <CardHeader>
        <CardTitle className="text-gray-800">🎮 Game Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          {!gameState.isActive && !gameState.isCountdown && !gameState.gameOver && (
            <Button
              onClick={onStartGame}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold px-8 py-3 rounded-lg shadow-lg transform transition-transform hover:scale-105"
            >
              🚀 Start Game
            </Button>
          )}
          
          {(gameState.isActive || gameState.isCountdown) && (
            <Button
              onClick={onStopGame}
              variant="destructive"
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 font-bold px-8 py-3 rounded-lg shadow-lg transform transition-transform hover:scale-105"
            >
              ⏹️ Stop Game
            </Button>
          )}

          {gameState.gameOver && (
            <Button
              onClick={onStartGame}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold px-8 py-3 rounded-lg shadow-lg transform transition-transform hover:scale-105"
            >
              🔄 New Game
            </Button>
          )}
        </div>

        {!gameState.isActive && !gameState.isCountdown && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Number Calling Interval: {gameState.callInterval / 1000} seconds
            </label>
            <Slider
              value={[gameState.callInterval / 1000]}
              onValueChange={handleIntervalChange}
              max={15}
              min={3}
              step={1}
              className="w-full"
            />
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-600">
              {gameState.calledNumbers.length}
            </div>
            <div className="text-sm text-blue-700">Numbers Called</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-600">
              {90 - gameState.calledNumbers.length}
            </div>
            <div className="text-sm text-green-700">Remaining</div>
          </div>
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-600">
              {gameState.prizes.filter(p => p.won).length}
            </div>
            <div className="text-sm text-yellow-700">Prizes Won</div>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
            <div className="text-2xl font-bold text-purple-600">
              {gameState.isActive ? '🟢' : gameState.isCountdown ? '🟡' : '🔴'}
            </div>
            <div className="text-sm text-purple-700">Status</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
