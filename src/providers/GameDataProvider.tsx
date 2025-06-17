// src/providers/GameDataProvider.tsx - Single Subscription Manager
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

  // Refs for cleanup and scheduled action execution
  const subscriptionRef = useRef<(() => void) | null>(null);
  const actionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Execute scheduled actions
  const executeScheduledAction = useCallback(async (action: ScheduledAction) => {
    if (!gameId) return;

    try {
      console.log(`🎬 Executing scheduled action: ${action.type} at ${new Date().toLocaleTimeString()}`);

      switch (action.type) {
        case 'START_COUNTDOWN':
          // Update game state to show countdown
          await firebaseService.updateGameState(gameId, {
            isCountdown: true,
            countdownTime: action.data.countdownDuration,
            isActive: false
          } as any);

          // Schedule actual game start
          const gameStartTime = Date.now() + (action.data.countdownDuration * 1000);
          await gameController.executeGameStart(gameId);
          break;

        case 'START_GAME':
          // Start the actual game
          await firebaseService.updateGameState(gameId, {
            isActive: true,
            isCountdown: false,
            countdownTime: 0
          } as any);
          break;

        case 'CALL_NUMBER':
          // Only execute if game is still active
          if (gameData?.gameState.isActive && !gameData?.gameState.gameOver) {
            await gameController.executeNumberCall(gameId);
          }
          break;

        case 'END_GAME':
          await gameController.executeGameEnd(gameId);
          break;
      }
    } catch (error: any) {
      console.error(`❌ Failed to execute scheduled action:`, error);
      setError(`Action failed: ${error.message}`);
    }
  }, [gameId, gameData]);

  // Process scheduled actions from Firebase
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

      // Schedule execution
      actionTimerRef.current = setTimeout(() => {
        executeScheduledAction(nextAction);
      }, delay);

      console.log(`⏰ Next action ${nextAction.type} scheduled in ${Math.ceil(delay / 1000)} seconds`);
    } else {
      setTimeUntilAction(0);
    }
  }, [executeScheduledAction]);

  // Handle countdown updates
  useEffect(() => {
    if (gameData?.gameState.isCountdown) {
      // Clear existing countdown timer
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }

      let remainingTime = gameData.gameState.countdownTime || 0;

      countdownTimerRef.current = setInterval(() => {
        remainingTime--;
        
        if (remainingTime <= 0) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
        } else {
          // Update countdown display (this will trigger re-render)
          setTimeUntilAction(remainingTime);
        }
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [gameData?.gameState.isCountdown, gameData?.gameState.countdownTime]);

  // Main subscription effect
  useEffect(() => {
    if (!gameId) {
      setGameData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }

    console.log(`🔔 Setting up subscription for game: ${gameId}`);

    // Handle special case for host's current game
    if (gameId === 'HOST_CURRENT' && userId) {
      // For hosts, load their current game first
      const loadHostGame = async () => {
        try {
          const hostGame = await firebaseService.getHostCurrentGame(userId);
          if (hostGame) {
            // Subscribe to the actual game
            const unsubscribe = firebaseService.subscribeToGame(hostGame.gameId, (updatedGameData) => {
              if (updatedGameData) {
                console.log(`📡 Host game data updated:`, {
                  currentNumber: updatedGameData.gameState.currentNumber,
                  isActive: updatedGameData.gameState.isActive,
                  isCountdown: updatedGameData.gameState.isCountdown,
                  gameOver: updatedGameData.gameState.gameOver
                });

                setGameData(updatedGameData);
                setIsLoading(false);
                setError(null);

                // Process any scheduled actions
                processScheduledActions(updatedGameData);
              } else {
                // Game was deleted
                setGameData(null);
                setIsLoading(false);
                setError('Game was deleted');
              }
            });

            subscriptionRef.current = unsubscribe;
          } else {
            // Host has no active game
            setGameData(null);
            setIsLoading(false);
            setError(null);
          }
        } catch (error: any) {
          console.error('Failed to load host current game:', error);
          setGameData(null);
          setIsLoading(false);
          setError(error.message || 'Failed to load host game');
        }
      };

      loadHostGame();
    } else {
      // SINGLE subscription for regular games
      const unsubscribe = firebaseService.subscribeToGame(gameId, (updatedGameData) => {
        if (updatedGameData) {
          console.log(`📡 Game data updated:`, {
            currentNumber: updatedGameData.gameState.currentNumber,
            isActive: updatedGameData.gameState.isActive,
            isCountdown: updatedGameData.gameState.isCountdown,
            gameOver: updatedGameData.gameState.gameOver
          });

          setGameData(updatedGameData);
          setIsLoading(false);
          setError(null);

          // Process any scheduled actions
          processScheduledActions(updatedGameData);
        } else {
          // Game was deleted
          setGameData(null);
          setIsLoading(false);
          setError('Game was deleted');
        }
      });

      subscriptionRef.current = unsubscribe;
    }

    // Cleanup function
    return () => {
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
    };
  }, [gameId, userId, processScheduledActions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (actionTimerRef.current) {
        clearTimeout(actionTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      if (subscriptionRef.current) {
        subscriptionRef.current();
      }
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

  const controls = {
    async startGame() {
      if (!isHost || !gameId) throw new Error('Not authorized');
      await gameController.scheduleGameStart(gameId);
    },

    async pauseGame() {
      if (!isHost || !gameId) throw new Error('Not authorized');
      await gameController.pauseGame(gameId);
    },

    async resumeGame() {
      if (!isHost || !gameId) throw new Error('Not authorized');
      await gameController.resumeGame(gameId);
    },

    async endGame() {
      if (!isHost || !gameId) throw new Error('Not authorized');
      await gameController.executeGameEnd(gameId);
    },

    updateCallInterval(seconds: number) {
      if (!isHost) throw new Error('Not authorized');
      gameController.updateConfig({ callInterval: seconds });
    }
  };

  return isHost ? controls : null;
};
