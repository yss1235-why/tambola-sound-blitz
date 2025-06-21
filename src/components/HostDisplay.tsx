// src/components/HostDisplay.tsx - COMPLETE: With minimal celebration integration
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Play, 
  Pause, 
  Square, 
  Users, 
  Clock,
  Trophy,
  Ticket,
  Phone,
  Gamepad2,
  Timer,
  Hash,
  CheckCircle
} from 'lucide-react';
import { useGameData, useBookingStats } from '@/providers/GameDataProvider';
import { useHostControls } from '@/providers/HostControlsProvider';
// ✅ NEW: Import enhanced component for host celebration
import { RecentWinnersDisplay } from './RecentWinnersDisplay';

interface HostDisplayProps {
  onCreateNewGame?: () => void;
}

export const HostDisplay: React.FC<HostDisplayProps> = ({ onCreateNewGame }) => {
  const { gameData, currentPhase, timeUntilAction, isLoading, error } = useGameData();
  const { bookedCount } = useBookingStats();
  const hostControls = useHostControls();
  const [callInterval, setCallInterval] = React.useState(5);

  // Handle interval change
  const handleIntervalChange = (newInterval: number) => {
    setCallInterval(newInterval);
    if (hostControls) {
      hostControls.updateCallInterval(newInterval);
    }
  };

  // ✅ SIMPLIFIED: Only automatic game control handlers
  const handleStartGame = React.useCallback(async () => {
    if (!hostControls) return;
    try {
      await hostControls.startGame();
    } catch (error: any) {
      alert(error.message || 'Failed to start game');
    }
  }, [hostControls]);

  const handlePauseGame = React.useCallback(async () => {
    if (!hostControls) return;
    try {
      await hostControls.pauseGame();
    } catch (error: any) {
      alert(error.message || 'Failed to pause game');
    }
  }, [hostControls]);

  const handleResumeGame = React.useCallback(async () => {
    if (!hostControls) return;
    try {
      await hostControls.resumeGame();
    } catch (error: any) {
      alert(error.message || 'Failed to resume game');
    }
  }, [hostControls]);

  const handleEndGame = React.useCallback(async () => {
    const confirmed = window.confirm('Are you sure you want to end the game?');
    if (!confirmed || !hostControls) return;

    try {
      await hostControls.endGame();
    } catch (error: any) {
      alert(error.message || 'Failed to end game');
    }
  }, [hostControls]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading Game...</h2>
          <p className="text-gray-600">Setting up your game dashboard</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-300">
        <CardContent className="p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Game</h2>
          <p className="text-red-600 mb-4">{error}</p>
          {onCreateNewGame && (
            <Button onClick={onCreateNewGame} className="bg-blue-600 hover:bg-blue-700">
              Create New Game
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // No game state
  if (!gameData) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-6xl mb-4">🎮</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Active Game</h2>
          <p className="text-gray-600 mb-4">Create a new game to start hosting</p>
          {onCreateNewGame && (
            <Button onClick={onCreateNewGame} className="bg-blue-600 hover:bg-blue-700">
              Create New Game
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Game Status Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Gamepad2 className="w-6 h-6 mr-2" />
              Host Control Panel - {gameData.name}
            </span>
            <div className="flex items-center space-x-2">
              <Badge variant={
                currentPhase === 'playing' && gameData.gameState.isActive ? 'default' :
                currentPhase === 'countdown' ? 'secondary' :
                currentPhase === 'finished' ? 'destructive' : 'outline'
              } className="text-lg px-4">
                {currentPhase === 'booking' && '🎫 Booking Open'}
                {currentPhase === 'countdown' && `⏰ Starting in ${timeUntilAction}s`}
                {currentPhase === 'playing' && gameData.gameState.isActive && '🔴 Live Game'}
                {currentPhase === 'playing' && !gameData.gameState.isActive && '⏸️ Game Paused'}
                {currentPhase === 'finished' && '🏆 Game Complete'}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Game Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">
                {gameData.gameState.currentNumber || '-'}
              </div>
              <div className="text-sm text-blue-700">Current Number</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="text-2xl font-bold text-green-600">
                {gameData.gameState.calledNumbers?.length || 0}
              </div>
              <div className="text-sm text-green-700">Called</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-purple-600">
                {90 - (gameData.gameState.calledNumbers?.length || 0)}
              </div>
              <div className="text-sm text-purple-700">Remaining</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
              <div className="text-2xl font-bold text-orange-600">
                {bookedCount}
              </div>
              <div className="text-sm text-orange-700">Players</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="text-2xl font-bold text-yellow-600">
                {Object.values(gameData.prizes).filter(p => p.won).length}
              </div>
              <div className="text-sm text-yellow-700">Prizes Won</div>
            </div>
          </div>

          {/* Host Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 p-3 rounded-lg border">
              <div className="flex items-center">
                <Phone className="w-4 h-4 mr-2 text-gray-600" />
                <span className="text-sm text-gray-700">Contact: {gameData.hostPhone || 'Not set'}</span>
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg border">
              <div className="flex items-center">
                <Ticket className="w-4 h-4 mr-2 text-gray-600" />
                <span className="text-sm text-gray-700">Max Tickets: {gameData.maxTickets}</span>
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg border">
              <div className="flex items-center">
                <Trophy className="w-4 h-4 mr-2 text-gray-600" />
                <span className="text-sm text-gray-700">Prizes: {Object.keys(gameData.prizes).length}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Game Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Timer className="w-5 h-5 mr-2" />
            Automatic Game Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Control Buttons */}
          <div className="flex flex-wrap gap-4">
            {currentPhase === 'booking' && (
              <Button 
                onClick={handleStartGame}
                disabled={bookedCount === 0 || hostControls?.isProcessing}
                className="flex-1 bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <Play className="w-4 h-4 mr-2" />
                {hostControls?.isProcessing ? 'Starting...' : `Start Automatic Game (${bookedCount > 0 ? 'Ready' : 'Need players'})`}
              </Button>
            )}

            {currentPhase === 'countdown' && (
              <Button disabled className="flex-1" size="lg">
                <Clock className="w-4 h-4 mr-2 animate-pulse" />
                Starting in {timeUntilAction}s...
              </Button>
            )}

            {currentPhase === 'playing' && (
              <>
                {gameData.gameState.isActive ? (
                  <Button 
                    onClick={handlePauseGame} 
                    variant="secondary" 
                    className="flex-1" 
                    size="lg"
                    disabled={hostControls?.isProcessing}
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    {hostControls?.isProcessing ? 'Pausing...' : 'Pause Automatic Game'}
                  </Button>
                ) : (
                  <Button 
                    onClick={handleResumeGame} 
                    className="flex-1 bg-green-600 hover:bg-green-700" 
                    size="lg"
                    disabled={hostControls?.isProcessing}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {hostControls?.isProcessing ? 'Resuming...' : 'Resume Automatic Game'}
                  </Button>
                )}

                <Button 
                  onClick={handleEndGame} 
                  variant="destructive" 
                  size="lg"
                  disabled={hostControls?.isProcessing}
                >
                  <Square className="w-4 h-4 mr-2" />
                  {hostControls?.isProcessing ? 'Ending...' : 'End Game'}
                </Button>
              </>
            )}

            {/* ✅ CHANGED: Replace simple button with celebration component */}
            {currentPhase === 'finished' && (
              <div className="w-full">
                <RecentWinnersDisplay 
                  hostMode={true} 
                  onCreateNewGame={onCreateNewGame} 
                />
              </div>
            )}
          </div>

          {/* Call Interval Control */}
          {(currentPhase === 'booking' || (currentPhase === 'playing' && !gameData.gameState.gameOver)) && (
            <div className="space-y-2">
              <Label htmlFor="call-interval">Automatic Call Interval: {callInterval} seconds</Label>
              <div className="flex items-center space-x-4">
                <Input
                  id="call-interval"
                  type="range"
                  min="3"
                  max="15"
                  value={callInterval}
                  onChange={(e) => handleIntervalChange(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm text-gray-600 w-16 text-center">
                  {callInterval}s
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Time between automatic number calls (system controlled)
              </p>
            </div>
          )}

          {/* Status Messages */}
          {currentPhase === 'booking' && bookedCount === 0 && (
            <Alert>
              <Users className="h-4 w-4" />
              <AlertDescription>
                Waiting for players to book tickets. Share your contact number: {gameData.hostPhone}
              </AlertDescription>
            </Alert>
          )}

          {currentPhase === 'playing' && gameData.gameState.isActive && (
            <Alert>
              <Timer className="h-4 w-4" />
              <AlertDescription>
                Game is running automatically. Numbers are called every {callInterval} seconds.
              </AlertDescription>
            </Alert>
          )}

          {currentPhase === 'finished' && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Game completed successfully! {gameData.gameState.calledNumbers?.length || 0} numbers were called automatically.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Recent Numbers Called */}
      {gameData.gameState.calledNumbers && gameData.gameState.calledNumbers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Hash className="w-5 h-5 mr-2" />
              Recent Numbers Called (Automatically)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {gameData.gameState.calledNumbers
                .slice(-20)
                .reverse()
                .map((num, index) => (
                  <div
                    key={`${num}-${index}`}
                    className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white
                      ${index === 0 
                        ? 'bg-gradient-to-br from-red-500 to-red-600 ring-2 ring-red-300 text-lg scale-110' 
                        : 'bg-gradient-to-br from-blue-500 to-blue-600 text-sm'
                      }`}
                  >
                    {num}
                  </div>
                ))}
            </div>
            {gameData.gameState.calledNumbers.length > 20 && (
              <p className="text-sm text-gray-500 mt-3 text-center">
                Showing last 20 numbers • Total called: {gameData.gameState.calledNumbers.length}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prize Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="w-5 h-5 mr-2" />
            Prize Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(gameData.prizes).map((prize) => (
              <div
                key={prize.id}
                className={`p-3 rounded-lg border-2 transition-all duration-300 ${
                  prize.won
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 shadow-lg'
                    : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-bold ${prize.won ? 'text-green-800' : 'text-gray-800'}`}>
                      {prize.name}
                    </h3>
                    <p className={`text-sm ${prize.won ? 'text-green-600' : 'text-gray-600'}`}>
                      {prize.pattern}
                    </p>
                    {prize.won && prize.winners && prize.winners.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-green-700">
                          Won by: {prize.winners.map(w => w.name).join(', ')}
                        </p>
                        {prize.winningNumber && (
                          <p className="text-xs text-green-600">
                            Winning number: {prize.winningNumber}
                          </p>
                        )}
                        {prize.wonAt && (
                          <p className="text-xs text-green-600">
                            Won at: {new Date(prize.wonAt).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    prize.won 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {prize.won ? '✓' : '?'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Number Display for Live Games */}
      {currentPhase === 'playing' && gameData.gameState.currentNumber && (
        <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
          <CardContent className="text-center py-8">
            <h3 className="text-2xl font-bold mb-4">🔴 LIVE: Current Number</h3>
            <div className="text-8xl font-bold animate-pulse mb-4">
              {gameData.gameState.currentNumber}
            </div>
            <p className="text-lg opacity-90">
              Players should mark this number on their tickets
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
