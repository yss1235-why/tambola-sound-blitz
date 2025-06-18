// src/providers/HostControlsProvider.tsx - Actions-only provider for host game controls
import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';
import { firebaseService } from '@/services/firebase';
import { useGameData } from './GameDataProvider';

interface HostControlsContextValue {
  // Game flow controls
  startGame: () => Promise<void>;
  pauseGame: () => Promise<void>;
  resumeGame: () => Promise<void>;
  endGame: () => Promise<void>;
  
  // Configuration
  updateCallInterval: (seconds: number) => void;
  
  // Status
  isProcessing: boolean;
}

const HostControlsContext = createContext<HostControlsContextValue | null>(null);

interface HostControlsProviderProps {
  children: React.ReactNode;
  userId: string;
}

/**
 * HostControlsProvider - Handles all host actions and automatic game management
 * Separated from data concerns for cleaner architecture
 */
export const HostControlsProvider: React.FC<HostControlsProviderProps> = ({
  children,
  userId
}) => {
  const { gameData } = useGameData();
  
  // Internal state for processing and timers
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [callInterval, setCallInterval] = React.useState(5);
  
  // Refs for stable timer management
  const gameActiveRef = useRef(false);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update game active ref when game state changes
  useEffect(() => {
    if (gameData) {
      gameActiveRef.current = gameData.gameState.isActive && !gameData.gameState.gameOver;
    }
  }, [gameData?.gameState.isActive, gameData?.gameState.gameOver]);

  // Clear all timers on unmount or game end
  const clearAllTimers = useCallback(() => {
    if (gameTimerRef.current) {
      clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    gameActiveRef.current = false;
  }, []);

  // Automatic number calling loop
  const startNumberCallingLoop = useCallback(() => {
    if (!gameData) return;
    
    const scheduleNextCall = () => {
      if (!gameActiveRef.current) return;
      
      gameTimerRef.current = setTimeout(async () => {
        if (!gameActiveRef.current || !gameData) return;
        
        try {
          console.log(`🎯 Auto-calling next number for game ${gameData.gameId}`);
          const result = await firebaseService.callNextNumber(gameData.gameId);
          
          if (result.success && !result.gameEnded && gameActiveRef.current) {
            scheduleNextCall(); // Continue the loop
          } else {
            clearAllTimers(); // Game ended or error
          }
        } catch (error) {
          console.error('❌ Auto-call error:', error);
          // Continue trying after error
          if (gameActiveRef.current) {
            scheduleNextCall();
          }
        }
      }, callInterval * 1000);
    };

    scheduleNextCall();
  }, [gameData, callInterval, clearAllTimers]);

  // Start game with countdown
  const startGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`🎮 Starting game with countdown: ${gameData.gameId}`);
      
      // Clear any existing timers
      clearAllTimers();
      
      // Start 10-second countdown
      await firebaseService.updateGameState(gameData.gameId, {
        isCountdown: true,
        countdownTime: 10,
        isActive: false
      });

      let timeLeft = 10;
      countdownTimerRef.current = setInterval(async () => {
        timeLeft--;
        
        if (timeLeft > 0) {
          await firebaseService.updateGameState(gameData.gameId, {
            countdownTime: timeLeft
          });
        } else {
          // Countdown finished - activate game
          clearInterval(countdownTimerRef.current!);
          countdownTimerRef.current = null;
          
          await firebaseService.updateGameState(gameData.gameId, {
            isActive: true,
            isCountdown: false,
            countdownTime: 0
          });
          
          gameActiveRef.current = true;
          startNumberCallingLoop();
        }
      }, 1000);
      
    } catch (error: any) {
      console.error('❌ Start game error:', error);
      throw new Error(error.message || 'Failed to start game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers, startNumberCallingLoop]);

  // Pause game
  const pauseGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`⏸️ Pausing game: ${gameData.gameId}`);
      
      clearAllTimers();
      
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: false,
        isCountdown: false
      });
      
    } catch (error: any) {
      console.error('❌ Pause game error:', error);
      throw new Error(error.message || 'Failed to pause game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers]);

  // Resume game
  const resumeGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`▶️ Resuming game: ${gameData.gameId}`);
      
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: true,
        isCountdown: false
      });
      
      gameActiveRef.current = true;
      startNumberCallingLoop();
      
    } catch (error: any) {
      console.error('❌ Resume game error:', error);
      throw new Error(error.message || 'Failed to resume game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, startNumberCallingLoop]);

  // End game
  const endGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`🏁 Ending game: ${gameData.gameId}`);
      
      clearAllTimers();
      
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: false,
        isCountdown: false,
        gameOver: true
      });
      
    } catch (error: any) {
      console.error('❌ End game error:', error);
      throw new Error(error.message || 'Failed to end game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers]);

  // Update call interval
  const updateCallInterval = useCallback((seconds: number) => {
    setCallInterval(Math.max(3, Math.min(15, seconds))); // Clamp between 3-15 seconds
  }, []);

  // Authorization check
  const isAuthorized = gameData?.hostId === userId;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Create stable context value
  const contextValue = React.useMemo((): HostControlsContextValue => ({
    startGame: isAuthorized ? startGame : async () => { throw new Error('Not authorized'); },
    pauseGame: isAuthorized ? pauseGame : async () => { throw new Error('Not authorized'); },
    resumeGame: isAuthorized ? resumeGame : async () => { throw new Error('Not authorized'); },
    endGame: isAuthorized ? endGame : async () => { throw new Error('Not authorized'); },
    updateCallInterval,
    isProcessing
  }), [isAuthorized, startGame, pauseGame, resumeGame, endGame, updateCallInterval, isProcessing]);

  return (
    <HostControlsContext.Provider value={contextValue}>
      {children}
    </HostControlsContext.Provider>
  );
};

/**
 * Hook to access host controls from any child component
 */
export const useHostControls = (): HostControlsContextValue => {
  const context = useContext(HostControlsContext);
  if (!context) {
    throw new Error('useHostControls must be used within a HostControlsProvider');
  }
  return context;
};

/**
 * Hook that returns null if not in host context (for optional host features)
 */
export const useOptionalHostControls = (): HostControlsContextValue | null => {
  return useContext(HostControlsContext);
};
