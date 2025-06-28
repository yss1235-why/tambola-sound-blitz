// src/providers/HostControlsProvider.tsx - SIMPLIFIED: Pure Timer Implementation (Option A)
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
  countdownTime: number;
  callInterval: number;
  
  // ✅ SOLUTION 1: Audio completion handler
  handleAudioComplete: () => void;
}

const HostControlsContext = createContext<HostControlsContextValue | null>(null);

interface HostControlsProviderProps {
  children: React.ReactNode;
  userId: string;
}

/**
 * HostControlsProvider - SIMPLIFIED: Pure Timer Implementation
 * 
 * RESPONSIBILITIES:
 * ✅ Timer scheduling and management
 * ✅ Game flow controls (start/pause/resume/end)
 * ✅ React state management
 * 
 * DELEGATES TO FIREBASE-GAME:
 * ✅ All number calling logic
 * ✅ All game state validation
 * ✅ All game ending decisions
 * ✅ All prize detection
 */
export const HostControlsProvider: React.FC<HostControlsProviderProps> = ({
  children,
  userId
}) => {
  const { gameData } = useGameData();
  
  // Simple state - only for UI feedback
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [countdownTime, setCountdownTime] = React.useState(0);
 const [callInterval, setCallInterval] = React.useState(5);
const [pendingGameEnd, setPendingGameEnd] = React.useState(false);
  
  // Simple refs - only for timer management
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTimerActiveRef = useRef(false);

  // ================== SIMPLE TIMER LOGIC ==================

  /**
   * Pure timer function - delegates everything to firebase-game
   */
  const scheduleNextCall = useCallback(() => {
  if (!isTimerActiveRef.current || !gameData) return;
  
  gameTimerRef.current = setTimeout(async () => {
    if (!isTimerActiveRef.current || !gameData) return;
    
    try {
      console.log(`⏰ Timer: Calling next number for ${gameData.gameId}`);
      
      // 🎯 DELEGATE: All logic handled by firebase-game
      const shouldContinue = await firebaseService.callNextNumberAndContinue(gameData.gameId);
      
      if (!shouldContinue) {
        // ✅ SOLUTION 1: Don't end immediately, wait for audio
        console.log(`🏁 Timer: Game should end, waiting for audio completion`);
        setPendingGameEnd(true);
        return;
      }
      
      if (shouldContinue && isTimerActiveRef.current && !pendingGameEnd) {
         scheduleNextCall();
      } else {
        console.log(`🏁 Timer: Game complete for ${gameData.gameId}`);
        stopTimer();
      }
      
    } catch (error: any) {
      console.error('❌ Timer: Number calling error:', error);
      stopTimer();
    }
  }, callInterval * 1000);
}, [gameData, callInterval, pendingGameEnd]);

  /**
   * Simple timer control
   */
  const stopTimer = useCallback(() => {
    console.log(`🛑 Stopping number calling timer`);
    isTimerActiveRef.current = false;
    
    if (gameTimerRef.current) {
      clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    console.log(`▶️ Starting number calling timer`);
    stopTimer(); // Clear any existing timer
    isTimerActiveRef.current = true;
    scheduleNextCall();
  }, [scheduleNextCall]);

  /**
   * Clear all timers - for cleanup
   */
 const clearAllTimers = useCallback(() => {
    if (gameTimerRef.current) {
      clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownTime(0);
    isTimerActiveRef.current = false;
  }, []);

/**
 * ✅ SOLUTION 1: Handle audio completion and check for pending game end
 */
const handleAudioComplete = useCallback(() => {
  console.log(`🔊 Audio completed`);
  
  // Check if game should end after audio completes
  if (pendingGameEnd) {
    console.log(`🏁 Audio complete, ending game now`);
    setPendingGameEnd(false);
    stopTimer();
    return;
  }
  
  // Continue with normal scheduling if game is active
  if (isTimerActiveRef.current && gameData && !pendingGameEnd) {
    scheduleNextCall();
  }
}, [pendingGameEnd, gameData, scheduleNextCall, stopTimer]);
  
  // ================== COUNTDOWN RECOVERY LOGIC ==================

  /**
   * Resume countdown timer from current Firebase value
   * Handles page refresh and network recovery scenarios
   */
  const resumeCountdownTimer = useCallback((currentTimeLeft: number) => {
    if (countdownTimerRef.current || currentTimeLeft <= 0) return;
    
    console.log(`🔄 Resuming countdown from ${currentTimeLeft}s`);
    
    let timeLeft = currentTimeLeft;
    setCountdownTime(timeLeft);
    
    countdownTimerRef.current = setInterval(async () => {
      timeLeft--;
      setCountdownTime(timeLeft);
      
      // Update Firebase with retry logic
      try {
        firebaseService.updateCountdownTime(gameData!.gameId, timeLeft);
      } catch (error) {
        console.warn('⚠️ Countdown update failed:', error);
      }
      
      if (timeLeft <= 0) {
        setCountdownTime(0);
        clearInterval(countdownTimerRef.current!);
        countdownTimerRef.current = null;
        
        // Activate game after countdown
        try {
          await firebaseService.activateGameAfterCountdown(gameData!.gameId);
          startTimer();
        } catch (error) {
          console.error('❌ Failed to activate game after countdown:', error);
        }
      }
    }, 1000);
  }, [gameData, startTimer]);


  // ================== GAME CONTROL METHODS ==================

  /**
   * Start game with countdown - delegates game logic to firebase-game
   */
  const startGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`🎮 Starting game: ${gameData.gameId}`);
      
      // Clear any existing timers
      clearAllTimers();
      
      // 🎯 DELEGATE: Let firebase-game handle game start logic
      await firebaseService.startGameWithCountdown(gameData.gameId);
      
    // Start countdown timer (UI + Firebase sync)
      let timeLeft = 10;
      setCountdownTime(timeLeft);
      countdownTimerRef.current = setInterval(async () => {
        timeLeft--;
        setCountdownTime(timeLeft);
        
        // ✅ FIX: Update Firebase so all users see countdown
        try {
          firebaseService.updateCountdownTime(gameData.gameId, timeLeft);
        } catch (error) {
          console.error('Failed to update countdown in Firebase:', error);
        }
        
        if (timeLeft <= 0) {
          setCountdownTime(0);
          clearInterval(countdownTimerRef.current!);
          
          // 🎯 DELEGATE: Let firebase-game activate the game
          await firebaseService.activateGameAfterCountdown(gameData.gameId);
          
          // Start our simple timer
          startTimer();
        }
      }, 1000);
      
      console.log(`✅ Game start initiated: ${gameData.gameId}`);
      
          } catch (error: any) {
          console.error('❌ Start game error:', error);
          clearAllTimers();
          setCountdownTime(0);  // ✅ Move this line BEFORE throw
          throw new Error(error.message || 'Failed to start game');
        } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers, startTimer]);

  /**
   * Pause game - simple timer stop + database update
   */
  const pauseGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`⏸️ Pausing game: ${gameData.gameId}`);
      
      // Stop timer immediately
      stopTimer();
      
      // 🎯 DELEGATE: Let firebase-game handle pause logic
      await firebaseService.pauseGame(gameData.gameId);
      
      console.log(`✅ Game paused: ${gameData.gameId}`);
      
    } catch (error: any) {
      console.error('❌ Pause game error:', error);
      throw new Error(error.message || 'Failed to pause game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, stopTimer]);

  /**
   * Resume game - simple timer start + database update
   */
  const resumeGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`▶️ Resuming game: ${gameData.gameId}`);
      
      // 🎯 DELEGATE: Let firebase-game handle resume logic
      await firebaseService.resumeGame(gameData.gameId);
      
      // Start our simple timer
      startTimer();
      
      console.log(`✅ Game resumed: ${gameData.gameId}`);
      
    } catch (error: any) {
      console.error('❌ Resume game error:', error);
      throw new Error(error.message || 'Failed to resume game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, startTimer]);

  /**
   * End game - simple timer stop + database update
   */
  const endGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`🏁 Ending game: ${gameData.gameId}`);
      
      // Stop timer immediately
      stopTimer();
      
      // 🎯 DELEGATE: Let firebase-game handle end logic
      await firebaseService.endGame(gameData.gameId);
      
      console.log(`✅ Game ended: ${gameData.gameId}`);
      
    } catch (error: any) {
      console.error('❌ End game error:', error);
      throw new Error(error.message || 'Failed to end game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, stopTimer]);

  /**
   * Update call interval - simple state update
   */
 const updateCallInterval = useCallback((seconds: number) => {
  setCallInterval(seconds);
  console.log(`⏰ Call interval updated to ${seconds} seconds`);
  
  // If timer is running, restart it with new interval immediately
  if (isTimerActiveRef.current && gameTimerRef.current) {
    clearTimeout(gameTimerRef.current);
    gameTimerRef.current = null;
    
    // Create new timer with the new interval directly
    gameTimerRef.current = setTimeout(async () => {
      if (!isTimerActiveRef.current || !gameData) return;
      
      try {
        console.log(`⏰ Timer: Calling next number (${seconds}s interval)`);
        
        const shouldContinue = await firebaseService.callNextNumberAndContinue(gameData.gameId);
        
        if (!shouldContinue) {
          console.log(`🏁 Timer: Game should end, waiting for audio completion`);
          setPendingGameEnd(true);
          return;
        }
        
        if (shouldContinue && isTimerActiveRef.current && !pendingGameEnd) {
          scheduleNextCall(); // This will use the updated callInterval from state
        } else {
          stopTimer();
        }
        
      } catch (error: any) {
        console.error('❌ Timer: Number calling error:', error);
        stopTimer();
      }
    }, seconds * 1000); // Use new interval directly
  }
}, [gameData, pendingGameEnd, scheduleNextCall, stopTimer]);
  // ================== CLEANUP ==================

  useEffect(() => {
    return () => {
      console.log(`🧹 Cleaning up HostControlsProvider`);
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Auto-stop timer when game ends (from real-time updates)
  useEffect(() => {
    if (gameData?.gameState.gameOver && isTimerActiveRef.current) {
      console.log(`🏁 Game ended via real-time update - stopping timer`);
      stopTimer();
    }
  }, [gameData?.gameState.gameOver, stopTimer]);


  // Auto-resume countdown on page refresh/reconnect
  useEffect(() => {
    if (gameData?.gameState.isCountdown && !countdownTimerRef.current && !isProcessing) {
      const currentCountdown = gameData.gameState.countdownTime || 0;
      
      if (currentCountdown > 0) {
        console.log(`🚨 Detected lost countdown timer - auto-resuming from ${currentCountdown}s`);
        resumeCountdownTimer(currentCountdown);
      } else if (currentCountdown === 0) {
        console.log(`🚨 Countdown expired during disconnect - activating game`);
        firebaseService.activateGameAfterCountdown(gameData.gameId)
          .then(() => startTimer())
          .catch(error => console.error('❌ Failed to activate game:', error));
      }
    }
  }, [gameData?.gameState.isCountdown, gameData?.gameState.countdownTime, isProcessing, resumeCountdownTimer, startTimer]);

  // ================== CONTEXT VALUE ==================

  const value: HostControlsContextValue = {
  startGame,
  pauseGame,
  resumeGame,
  endGame,
  updateCallInterval,
  isProcessing,
  countdownTime,
  callInterval,
  handleAudioComplete // ✅ SOLUTION 1: Add audio completion handler
};

  return (
    <HostControlsContext.Provider value={value}>
      {children}
    </HostControlsContext.Provider>
  );
};

export const useHostControls = () => {
  const context = useContext(HostControlsContext);
  if (!context) {
    throw new Error('useHostControls must be used within a HostControlsProvider');
  }
  return context;
};
