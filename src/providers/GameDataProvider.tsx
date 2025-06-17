// src/providers/GameDataProvider.tsx - FIXED: Simplified subscription system without scheduled actions
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { firebaseService, GameData } from '@/services/firebase';
import { gameController } from '@/services/GameController';

interface GameDataContextType {
  gameData: GameData | null;
  isLoading: boolean;
  error: string | null;
  // Computed states for convenience
  currentPhase: 'creation' | 'booking' | 'countdown' | 'playing' | 'finished';
  timeUntilAction: number; // seconds until next action (countdown only)
  isHost: boolean;
}

const GameDataContext = createContext<GameDataContextType>({
  gameData: null,
  isLoading: true,
  error: null,
  currentPhase: 'creation',
  timeUntilAction: 0,
  isHost: false
});

interface GameDataProviderProps {
  gameId: string | null;
  userId: string | null;
  children: React.ReactNode;
}

export const GameDataProvider: React.FC<GameDataProviderProps> = ({ 
  gameId, 
  userId, 
  children 
}) => {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeUntilAction, setTimeUntilAction] = useState(0);

  // Refs for cleanup and state management
  const subscriptionRef = useRef<(() => void) | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentGameIdRef = useRef<string | null>(null);

  // Determine current game phase
  const currentPhase = (): 'creation' | 'booking' | 'countdown' | 'playing' | 'finished' => {
    if (!gameData) return 'creation';
    if (gameData.gameState.gameOver) return 'finished';
    if (gameData.gameState.isCountdown) return 'countdown';
    if (gameData.gameState.isActive || (gameData.gameState.calledNumbers?.length || 0) > 0) return 'playing';
    return 'booking';
  };

  // Check if current user is host
  const isHost = gameData?.hostId === userId;

  // ✅ FIXED: Simple countdown handling without conflicts
  useEffect(() => {
    if (gameData?.gameState.isCountdown) {
      // Clear existing countdown timer
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }

      let remainingTime = gameData.gameState.countdownTime || 0;
      setTimeUntilAction(remainingTime);

      // Simple countdown display timer (doesn't affect game logic)
      countdownTimerRef.current = setInterval(() => {
        remainingTime--;
        setTimeUntilAction(Math.max(0, remainingTime));
        
        if (remainingTime <= 0) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
        }
      }, 1000);
    } else {
      // Clear countdown timer if not in countdown
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setTimeUntilAction(0);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [gameData?.gameState.isCountdown, gameData?.gameState.countdownTime]);

  // ✅ FIXED: Simplified subscription setup
  const setupSubscription = useCallback(async (targetGameId: string) => {
    console.log(`🔔 Setting up subscription for game: ${targetGameId}`);
    
    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }

    // Clear countdown timer
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    try {
      let actualGameId = targetGameId;

      // Handle HOST_CURRENT case
      if (targetGameId === 'HOST_CURRENT' && userId) {
        const hostGame = await firebaseService.getHostCurrentGame(userId);
        if (!hostGame) {
          // Host has no active game
          setGameData(null);
          setIsLoading(false);
          setError(null);
          return;
        }
        actualGameId = hostGame.gameId;
      }

      // Store the current game ID
      currentGameIdRef.current = actualGameId;

      // ✅ FIXED: Simple subscription - no scheduled actions processing
      const unsubscribe = firebaseService.subscribeToGame(actualGameId, (updatedGameData) => {
        // Check if this is still the current subscription
        if (currentGameIdRef.current !== actualGameId) {
          console.log(`🚫 Ignoring update for old game: ${actualGameId}`);
          return;
        }

        if (updatedGameData) {
          console.log(`📡 Game data updated:`, {
            gameId: updatedGameData.gameId,
            currentNumber: updatedGameData.gameState.currentNumber,
            isActive: updatedGameData.gameState.isActive,
            isCountdown: updatedGameData.gameState.isCountdown,
            gameOver: updatedGameData.gameState.gameOver,
            calledNumbersCount: updatedGameData.gameState.calledNumbers?.length || 0
          });

          setGameData(updatedGameData);
          setIsLoading(false);
          setError(null);

          // ✅ REMOVED: No scheduled actions processing - controller handles everything
        } else {
          // Game was deleted
          setGameData(null);
          setIsLoading(false);
          setError('Game was deleted');
        }
      });

      subscriptionRef.current = unsubscribe;

    } catch (error: any) {
      console.error('Failed to setup subscription:', error);
      setGameData(null);
      setIsLoading(false);
      setError(error.message || 'Failed to load game');
    }
  }, [userId]);

  // ✅ FIXED: Main subscription effect with stable dependencies
  useEffect(() => {
    if (!gameId) {
      // Clean up everything
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
      currentGameIdRef.current = null;
      setGameData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Only setup new subscription if gameId actually changed
    if (currentGameIdRef.current !== gameId) {
      setIsLoading(true);
      setError(null);
      setupSubscription(gameId);
    }

  }, [gameId, setupSubscription]);

  // ✅ FIXED: Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log(`🧹 Cleaning up GameDataProvider`);
      
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      
      currentGameIdRef.current = null;
    };
  }, []);

  const contextValue: GameDataContextType = {
    gameData,
    isLoading,
    error,
    currentPhase: currentPhase(),
    timeUntilAction,
    isHost
  };

  return (
    <GameDataContext.Provider value={contextValue}>
      {children}
    </GameDataContext.Provider>
  );
};

// Custom hook to use game data
export const useGameData = (): GameDataContextType => {
  const context = useContext(GameDataContext);
  if (!context) {
    throw new Error('useGameData must be used within a GameDataProvider');
  }
  return context;
};

// ✅ FIXED: Simplified host controls using new controller
export const useHostControls = () => {
  const { gameData, isHost } = useGameData();
  const gameId = gameData?.gameId;

  // ✅ FIXED: Stable controls object with new controller methods
  const controls = React.useMemo(() => {
    if (!isHost || !gameId) return null;

    return {
      async startGame() {
        console.log('🎮 Host starting game countdown');
        await gameController.startGameCountdown(gameId);
      },

      async pauseGame() {
        console.log('⏸️ Host pausing game');
        await gameController.pauseGame(gameId);
      },

      async resumeGame() {
        console.log('▶️ Host resuming game');
        await gameController.resumeGame(gameId);
      },

      async endGame() {
        console.log('🏁 Host ending game');
        await gameController.endGame(gameId);
      },

      async callSpecificNumber(number: number) {
        console.log(`🎯 Host calling specific number: ${number}`);
        await gameController.callSpecificNumber(gameId, number);
      },

      updateCallInterval(seconds: number) {
        console.log(`⚙️ Host updating call interval: ${seconds}s`);
        gameController.updateConfig({ callInterval: seconds });
      },

      async getGameStatus() {
        return await gameController.getGameStatus(gameId);
      }
    };
  }, [isHost, gameId]);

  return controls;
};
