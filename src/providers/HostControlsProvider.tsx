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
   handlePrizeAudioComplete: (prizeId: string) => void;
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
  const lastCallTimeRef = useRef<number>(0); 

  // ================== SIMPLE TIMER LOGIC ==================
const scheduleNextCall = useCallback(() => {
  if (!isTimerActiveRef.current || !gameData) {
    console.log('🛑 Not scheduling - timer inactive or no game data');
    return;
  }
  
  // Clear any existing timer
  if (gameTimerRef.current) {
    clearTimeout(gameTimerRef.current);
    gameTimerRef.current = null;
  }
  
  // ✅ FIX: Better timing calculation
  const now = Date.now();
  const timeSinceLastCall = lastCallTimeRef.current ? (now - lastCallTimeRef.current) : 0;
  const delay = Math.max(1000, callInterval * 1000 - timeSinceLastCall); // Minimum 1 second
  
  console.log(`⏰ Scheduling next call in ${delay / 1000}s`);
  
  gameTimerRef.current = setTimeout(async () => {
    if (!isTimerActiveRef.current || !gameData) {
      console.log('⏰ Timer fired but game inactive');
      return;
    }
    
    console.log('📞 Timer fired - calling next number...');
    lastCallTimeRef.current = Date.now();
    
    try {
      const shouldContinue = await firebaseService.callNextNumberAndContinue(gameData.gameId);
      
      if (shouldContinue && isTimerActiveRef.current) {
        console.log('✅ Number called successfully, waiting for audio...');
        // Audio completion will trigger next call
      } else {
        console.log('🏁 Game should end or timer inactive');
        setPendingGameEnd(true);
        isTimerActiveRef.current = false;
      }
    } catch (error) {
      console.error('❌ Error calling number:', error);
      // ✅ FIX: Retry on error if game still active
      if (isTimerActiveRef.current) {
        setTimeout(() => scheduleNextCall(), 2000);
      }
    }
  }, delay);
}, [gameData, callInterval]);

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
  if (!gameData) return;
  console.log('▶️ Starting timer');
  stopTimer(); // Ensure no existing timer is running
  isTimerActiveRef.current = true;
  lastCallTimeRef.current = Date.now(); // ✅ FIX: Initialize timing reference
  scheduleNextCall();
}, [gameData, scheduleNextCall, stopTimer]);
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
  console.log(`🔊 Audio completed - Timer active: ${isTimerActiveRef.current}, Has game: ${!!gameData}`);
  
  // Check if game should end after audio completes
  if (pendingGameEnd) {
    console.log(`🏁 Audio complete, ending game now`);
    setPendingGameEnd(false);
    
    // Immediately end the game - don't wait for prize audio since it may have already played
    firebaseService.endGame(gameData!.gameId)
      .then(() => console.log('✅ Game ended after audio completion'))
      .catch(err => console.error('❌ Failed to end game:', err));
    
    stopTimer();
    return;
  }
  
  // ✅ FIX: Always schedule next call if game is active (check game state, not just timer)
  if (gameData?.gameState?.isActive && !gameData?.gameState?.gameOver) {
    console.log(`🔊 Audio completed - scheduling next call`);
    
    // Ensure timer is active
    if (!isTimerActiveRef.current) {
      console.log(`⚠️ Timer was inactive, reactivating`);
      isTimerActiveRef.current = true;
    }
    
    lastCallTimeRef.current = Date.now(); // Update timing after audio
    scheduleNextCall();
  } else {
    console.log(`🔊 Audio completed but game inactive or ended`);
    isTimerActiveRef.current = false;
  }
}, [pendingGameEnd, stopTimer, scheduleNextCall, gameData]);
  
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
    
    countdownTimerRef.current = setInterval(async () => {  // ✅ USE REF HERE
      timeLeft--;
      setCountdownTime(timeLeft);
      
      try {
        await firebaseService.updateCountdownTime(gameData.gameId, timeLeft);
      } catch (error) {
        console.error('Failed to update countdown in Firebase:', error);
      }
      
      if (timeLeft <= 0) {
        clearInterval(countdownTimerRef.current!);  // ✅ USE REF HERE
        countdownTimerRef.current = null;           // ✅ CLEAR REF
        await firebaseService.activateGameAfterCountdown(gameData.gameId);
        startTimer();
      }
    }, 1000);
    
    console.log(`✅ Game start initiated: ${gameData.gameId}`);
    
  } catch (error: any) {
    console.error('❌ Start game error:', error);
    clearAllTimers();
    setCountdownTime(0);
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
    stopTimer();
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
    
    // ✅ FIX: Ensure timer state is set BEFORE Firebase update
    isTimerActiveRef.current = true;
    
    await firebaseService.resumeGame(gameData.gameId);
    
    // ✅ FIX: Reset timing reference and start fresh
    lastCallTimeRef.current = Date.now();
    startTimer();
    
    console.log(`✅ Game resumed: ${gameData.gameId}`);
 } catch (error: any) {
    console.error('❌ Resume game error:', error);
    // Don't reset timer state on error - let it retry naturally
    console.log('🔄 Resume failed, but timer will continue trying...');
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
  
  // Don't restart timer here - it will restart naturally after current audio completes
  // This prevents race conditions
}, []);
  // ================== CLEANUP ==================

 // ================== CLEANUP ==================

  useEffect(() => {
    return () => {
      console.log(`🧹 Cleaning up HostControlsProvider`);
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Handle screen lock/unlock and browser tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && 
          gameData?.gameState?.isActive && 
          !gameData?.gameState?.gameOver &&
          !gameData?.gameState?.isCountdown) {
        
        console.log('🔄 Screen became visible - checking timer state');
        
        // If timer should be running but isn't, restart it
        if (!isTimerActiveRef.current) {
          console.log('🔄 Restarting timer after screen unlock');
          lastCallTimeRef.current = Date.now();
          startTimer();
        }
      }
    };

    const handleOnlineStatus = () => {
      if (navigator.onLine && 
          gameData?.gameState?.isActive && 
          !gameData?.gameState?.gameOver &&
          !isTimerActiveRef.current) {
        
        console.log('🔄 Network reconnected - checking timer state');
        lastCallTimeRef.current = Date.now();
        startTimer();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnlineStatus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnlineStatus);
    };
  }, [gameData?.gameState?.isActive, gameData?.gameState?.gameOver, gameData?.gameState?.isCountdown, startTimer]);

  // Auto-stop timer when game ends (from real-time updates)
  useEffect(() => {
    if (gameData?.gameState.gameOver && isTimerActiveRef.current) {
      console.log(`🏁 Game ended via real-time update - stopping timer`);
      stopTimer();
    }
  }, [gameData?.gameState.gameOver, stopTimer]);

  // Auto-resume when host returns to active game
  useEffect(() => {
    if (gameData?.gameState?.isActive && 
        !gameData?.gameState?.gameOver && 
        !gameData?.gameState?.isCountdown &&
        !isTimerActiveRef.current && 
        !isProcessing) {
      
      console.log(`🔄 Host returned to active game - auto-resuming timer`);
      lastCallTimeRef.current = Date.now();
      startTimer();
    }
  }, [gameData?.gameState?.isActive, gameData?.gameState?.gameOver, gameData?.gameState?.isCountdown, isProcessing, startTimer]);

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
/**
 * Handle prize audio completion
 */
const handlePrizeAudioComplete = useCallback((prizeId: string) => {
  console.log(`🏆 Prize audio completed: ${prizeId}`);
  
  if (pendingGameEnd && gameData) {
    // Mark this prize as audio completed
    const updatedPrizes = { ...gameData.prizes };
    if (updatedPrizes[prizeId]) {
      updatedPrizes[prizeId].audioCompleted = true;
    }
    
    // Check if all prize audio is complete
    const hasPendingPrizes = Object.values(updatedPrizes).some((prize: any) => 
      prize.won && !prize.audioCompleted
    );
    
    if (!hasPendingPrizes) {
      console.log(`🏁 All prize announcements complete, ending game now`);
      setPendingGameEnd(false);
      
      // Actually end the game
      firebaseService.endGame(gameData.gameId)
        .then(() => console.log('✅ Game ended after all audio completion'))
        .catch(err => console.error('❌ Failed to end game:', err));
      
      stopTimer();
    }
  }
}, [pendingGameEnd, gameData, stopTimer]);
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
  handleAudioComplete,
  handlePrizeAudioComplete
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
