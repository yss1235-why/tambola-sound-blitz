// src/providers/GameDataProvider.tsx - FIXED: Works with new authentication system
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { firebaseService, GameData } from '@/services/firebase';

// ================== TYPES ==================

type GamePhase = 'creation' | 'booking' | 'countdown' | 'playing' | 'finished';

interface HostControls {
  startGame: () => Promise<void>;
  pauseGame: () => Promise<void>;
  resumeGame: () => Promise<void>;
  endGame: () => Promise<void>;
  updateCallInterval: (interval: number) => void;
}

interface GameDataContextType {
  gameData: GameData | null;
  currentPhase: GamePhase;
  timeUntilAction: number;
  isLoading: boolean;
  error: string | null;
  refreshGame: () => Promise<void>;
}

interface HostControlsContextType extends HostControls {}

// ================== CONTEXTS ==================

const GameDataContext = createContext<GameDataContextType | null>(null);
const HostControlsContext = createContext<HostControlsContextType | null>(null);

// ================== PROVIDER ==================

interface GameDataProviderProps {
  children: React.ReactNode;
  gameId: string | null;
  userId: string | null; // null for public users, uid for hosts
}

export const GameDataProvider: React.FC<GameDataProviderProps> = ({
  children,
  gameId,
  userId
}) => {
  // State
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeUntilAction, setTimeUntilAction] = useState(0);
  const [callInterval, setCallInterval] = useState(5); // seconds

  // Refs for managing timers and subscriptions
  const subscriptionRef = useRef<(() => void) | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameActiveRef = useRef(false);
  const isCallingNumberRef = useRef(false);

  // ================== GAME PHASE LOGIC ==================

  const getCurrentPhase = useCallback((data: GameData | null): GamePhase => {
    if (!data) return 'creation';
    
    if (data.gameState.gameOver) return 'finished';
    if (data.gameState.isCountdown) return 'countdown';
    if (data.gameState.isActive || (data.gameState.calledNumbers?.length || 0) > 0) return 'playing';
    
    return 'booking';
  }, []);

  const currentPhase = getCurrentPhase(gameData);

  // ================== TIMER MANAGEMENT ==================

  const clearAllTimers = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (gameTimerRef.current) {
      clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    gameActiveRef.current = false;
    isCallingNumberRef.current = false;
  }, []);

  // ================== GAME CONTROLS (HOST ONLY) ==================

  const startGame = useCallback(async () => {
    if (!gameData || !userId) {
      throw new Error('Unauthorized: Host access required');
    }

    if (gameData.hostId !== userId) {
      throw new Error('Unauthorized: Only game host can start the game');
    }

    try {
      console.log('🎮 Starting countdown...');
      clearAllTimers();

      // Start countdown
      const countdownDuration = 10;
      setTimeUntilAction(countdownDuration);

      await firebaseService.updateGameState(gameData.gameId, {
        isCountdown: true,
        countdownTime: countdownDuration,
        isActive: false
      });

      // Countdown timer
      let remainingTime = countdownDuration;
      countdownTimerRef.current = setInterval(async () => {
        remainingTime--;
        setTimeUntilAction(remainingTime);

        if (remainingTime <= 0) {
          clearInterval(countdownTimerRef.current!);
          countdownTimerRef.current = null;

          // Start actual game
          await firebaseService.updateGameState(gameData.gameId, {
            isActive: true,
            isCountdown: false,
            countdownTime: 0
          });

          // Start automatic number calling
          gameActiveRef.current = true;
          scheduleNextNumberCall();
        }
      }, 1000);

    } catch (error: any) {
      console.error('❌ Error starting game:', error);
      throw new Error(error.message || 'Failed to start game');
    }
  }, [gameData, userId]);

  const pauseGame = useCallback(async () => {
    if (!gameData || !userId || gameData.hostId !== userId) {
      throw new Error('Unauthorized');
    }

    try {
      clearAllTimers();
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: false,
        isCountdown: false
      });
    } catch (error: any) {
      throw new Error(error.message || 'Failed to pause game');
    }
  }, [gameData, userId]);

  const resumeGame = useCallback(async () => {
    if (!gameData || !userId || gameData.hostId !== userId) {
      throw new Error('Unauthorized');
    }

    try {
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: true,
        isCountdown: false
      });

      gameActiveRef.current = true;
      scheduleNextNumberCall();
    } catch (error: any) {
      throw new Error(error.message || 'Failed to resume game');
    }
  }, [gameData, userId]);

  const endGame = useCallback(async () => {
    if (!gameData || !userId || gameData.hostId !== userId) {
      throw new Error('Unauthorized');
    }

    try {
      clearAllTimers();
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: false,
        isCountdown: false,
        gameOver: true
      });
    } catch (error: any) {
      throw new Error(error.message || 'Failed to end game');
    }
  }, [gameData, userId]);

  // ================== AUTOMATIC NUMBER CALLING ==================

  const scheduleNextNumberCall = useCallback(() => {
    if (!gameActiveRef.current || isCallingNumberRef.current) return;

    gameTimerRef.current = setTimeout(async () => {
      if (!gameActiveRef.current || !gameData) return;

      try {
        isCallingNumberRef.current = true;
        console.log('🎯 Calling next number automatically...');

        const result = await firebaseService.callNextNumber(gameData.gameId);

        if (result.success) {
          if (result.gameEnded) {
            console.log('🏁 Game ended automatically');
            gameActiveRef.current = false;
          } else {
            // Schedule next call
            scheduleNextNumberCall();
          }
        } else {
          console.warn('⚠️ Number call failed, retrying...');
          scheduleNextNumberCall();
        }
      } catch (error) {
        console.error('❌ Error in automatic number calling:', error);
        scheduleNextNumberCall(); // Continue even on error
      } finally {
        isCallingNumberRef.current = false;
      }
    }, callInterval * 1000);
  }, [gameData, callInterval]);

  const updateCallInterval = useCallback((interval: number) => {
    setCallInterval(interval);
  }, []);

  // ================== GAME DATA LOADING ==================

  const refreshGame = useCallback(async () => {
    if (!gameId) return;

    try {
      setIsLoading(true);
      setError(null);

      const data = await firebaseService.getGameData(gameId);
      if (data) {
        setGameData(data);
      } else {
        setError('Game not found');
      }
    } catch (error: any) {
      console.error('❌ Error refreshing game:', error);
      setError(error.message || 'Failed to load game');
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  const loadHostCurrentGame = useCallback(async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      setError(null);

      const hostGame = await firebaseService.getHostCurrentGame(userId);
      if (hostGame) {
        setGameData(hostGame);
      } else {
        setGameData(null); // No active game
      }
    } catch (error: any) {
      console.error('❌ Error loading host game:', error);
      setError(error.message || 'Failed to load host game');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // ================== REAL-TIME SUBSCRIPTION ==================

  const setupGameSubscription = useCallback((targetGameId: string) => {
    console.log('🔔 Setting up game subscription for:', targetGameId);

    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current();
    }

    const unsubscribe = firebaseService.subscribeToGame(targetGameId, (updatedGame) => {
      if (updatedGame) {
        console.log('📡 Game updated via subscription');
        setGameData(updatedGame);
        setError(null);

        // Update game active state for hosts
        if (userId && updatedGame.hostId === userId) {
          gameActiveRef.current = updatedGame.gameState.isActive && !updatedGame.gameState.gameOver;

          // Handle countdown timer sync
          if (updatedGame.gameState.isCountdown && updatedGame.gameState.countdownTime > 0) {
            setTimeUntilAction(updatedGame.gameState.countdownTime);
          }

          // Start/stop automatic calling based on game state
          if (updatedGame.gameState.isActive && !gameActiveRef.current && !isCallingNumberRef.current) {
            gameActiveRef.current = true;
            scheduleNextNumberCall();
          }
        }
      } else {
        console.log('📡 Game deleted or not found');
        setGameData(null);
        setError('Game not found');
        clearAllTimers();
      }
    });

    subscriptionRef.current = unsubscribe;
  }, [userId, scheduleNextNumberCall]);

  // ================== EFFECTS ==================

  // Initial load effect
  useEffect(() => {
    const initializeData = async () => {
      if (!gameId) {
        // For hosts with no specific game ID, load their current game
        if (userId) {
          await loadHostCurrentGame();
        } else {
          setIsLoading(false);
        }
        return;
      }

      // Load specific game
      await refreshGame();
    };

    initializeData();
  }, [gameId, userId, refreshGame, loadHostCurrentGame]);

  // Subscription effect
  useEffect(() => {
    if (gameData?.gameId) {
      setupGameSubscription(gameData.gameId);
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current();
      }
    };
  }, [gameData?.gameId, setupGameSubscription]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      clearAllTimers();
      if (subscriptionRef.current) {
        subscriptionRef.current();
      }
    };
  }, [clearAllTimers]);

  // ================== CONTEXT VALUES ==================

  const gameDataValue: GameDataContextType = {
    gameData,
    currentPhase,
    timeUntilAction,
    isLoading,
    error,
    refreshGame
  };

  const hostControlsValue: HostControlsContextType | null = userId && gameData?.hostId === userId ? {
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    updateCallInterval
  } : null;

  return (
    <GameDataContext.Provider value={gameDataValue}>
      <HostControlsContext.Provider value={hostControlsValue}>
        {children}
      </HostControlsContext.Provider>
    </GameDataContext.Provider>
  );
};

// ================== HOOKS ==================

export const useGameData = (): GameDataContextType => {
  const context = useContext(GameDataContext);
  if (!context) {
    throw new Error('useGameData must be used within a GameDataProvider');
  }
  return context;
};

export const useHostControls = (): HostControlsContextType | null => {
  return useContext(HostControlsContext);
};

export default GameDataProvider;
