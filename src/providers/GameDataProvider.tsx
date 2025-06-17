// src/providers/GameDataProvider.tsx - FIXED: Stable Subscription System
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { firebaseService, GameData } from '@/services/firebase';
import { gameController, ScheduledAction } from '@/services/GameController';

interface GameDataContextType {
  gameData: GameData | null;
  isLoading: boolean;
  error: string | null;
  // Computed states for convenience
  currentPhase: 'creation' | 'booking' | 'countdown' | 'playing' | 'finished';
  timeUntilAction: number; // seconds until next scheduled action
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
  const actionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentGameIdRef = useRef<string | null>(null); // Track current gameId

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

  // FIXED: Execute scheduled actions with stable function (no dependencies on gameData)
  const executeScheduledAction = useCallback(async (action: ScheduledAction, targetGameId: string) => {
    try {
      console.log(`🎬 Executing scheduled action: ${action.type} at ${new Date().toLocaleTimeString()}`);

      switch (action.type) {
        case 'START_COUNTDOWN':
          await firebaseService.updateGameState(targetGameId, {
            isCountdown: true,
            countdownTime: action.data.countdownDuration,
            isActive: false
          } as any);

          // Schedule actual game start
          const gameStartTime = Date.now() + (action.data.countdownDuration * 1000);
          await gameController.executeGameStart(targetGameId);
          break;

        case 'START_GAME':
          await firebaseService.updateGameState(targetGameId, {
            isActive: true,
            isCountdown: false,
            countdownTime: 0
          } as any);
          break;

        case 'CALL_NUMBER':
          // Get fresh game data to check if still active
          const freshGameData = await firebaseService.getGameData(targetGameId);
          if (freshGameData?.gameState.isActive && !freshGameData?.gameState.gameOver) {
            await gameController.executeNumberCall(targetGameId);
          }
          break;

        case 'END_GAME':
          await gameController.executeGameEnd(targetGameId);
          break;
      }
    } catch (error: any) {
      console.error(`❌ Failed to execute scheduled action:`, error);
      setError(`Action failed: ${error.message}`);
    }
  }, []); // FIXED: No dependencies to prevent recreation

  // FIXED: Process scheduled actions with stable dependencies
  const processScheduledActions = useCallback((updatedGameData: GameData) => {
    const scheduledActions = (updatedGameData as any).scheduledActions || [];
    const now = Date.now();

    // Clear existing timer
    if (actionTimerRef.current) {
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    }

    // Find next action to execute
    const nextAction = scheduledActions
      .filter((action: ScheduledAction) => action.executeAt > now)
      .sort((a: ScheduledAction, b: ScheduledAction) => a.executeAt - b.executeAt)[0];

    if (nextAction) {
      const delay = nextAction.executeAt - now;
      setTimeUntilAction(Math.ceil(delay / 1000));

      // Schedule execution with game ID passed directly
      actionTimerRef.current = setTimeout(() => {
        executeScheduledAction(nextAction, updatedGameData.gameId);
      }, delay);

      console.log(`⏰ Next action ${nextAction.type} scheduled in ${Math.ceil(delay / 1000)} seconds`);
    } else {
      setTimeUntilAction(0);
    }
  }, [executeScheduledAction]); // FIXED: Only depends on stable executeScheduledAction

  // FIXED: Handle countdown updates without affecting main subscription
  useEffect(() => {
    if (gameData?.gameState.isCountdown) {
      // Clear existing countdown timer
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }

      let remainingTime = gameData.gameState.countdownTime || 0;
      setTimeUntilAction(remainingTime);

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
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [gameData?.gameState.isCountdown, gameData?.gameState.countdownTime]); // Stable dependencies

  // FIXED: Simplified subscription setup
  const setupSubscription = useCallback(async (targetGameId: string) => {
    console.log(`🔔 Setting up subscription for game: ${targetGameId}`);
    
    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }

    // Clear all timers
    if (actionTimerRef.current) {
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
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

      // Create subscription
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

          // Process scheduled actions
          processScheduledActions(updatedGameData);
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
  }, [userId, processScheduledActions]); // Stable dependencies

  // FIXED: Main subscription effect with stable dependencies
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

  }, [gameId, setupSubscription]); // FIXED: Only gameId and stable setupSubscription

  // FIXED: Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log(`🧹 Cleaning up GameDataProvider`);
      
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
      if (actionTimerRef.current) {
        clearTimeout(actionTimerRef.current);
        actionTimerRef.current = null;
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

// Custom hook for host controls (only works if user is host)
export const useHostControls = () => {
  const { gameData, isHost } = useGameData();
  const gameId = gameData?.gameId;

  // FIXED: Stable controls object
  const controls = React.useMemo(() => {
    if (!isHost || !gameId) return null;

    return {
      async startGame() {
        await gameController.scheduleGameStart(gameId);
      },

      async pauseGame() {
        await gameController.pauseGame(gameId);
      },

      async resumeGame() {
        await gameController.resumeGame(gameId);
      },

      async endGame() {
        await gameController.executeGameEnd(gameId);
      },

      updateCallInterval(seconds: number) {
        gameController.updateConfig({ callInterval: seconds });
      }
    };
  }, [isHost, gameId]);

  return controls;
};
