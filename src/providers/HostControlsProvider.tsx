// src/providers/HostControlsProvider.tsx - SIMPLIFIED: Pure Timer Implementation (Option A)
import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';
import { ref, onValue, off, update } from 'firebase/database';
import { firebaseService, database } from '@/services/firebase';
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
  
  // Audio completion handlers
  handleAudioComplete: () => void;
  handlePrizeAudioComplete: (prizeId: string) => void;
  
  // Firebase status
  firebasePaused: boolean;
  
  // ✅ ADD these new properties:
  isPreparingGame: boolean;
  preparationStatus: string;
  preparationProgress: number;
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
const [firebasePaused, setFirebasePaused] = React.useState(false);

// ✅ ADD these new state variables:
const [isPreparingGame, setIsPreparingGame] = React.useState(false);
const [preparationStatus, setPreparationStatus] = React.useState<string>('');
const [preparationProgress, setPreparationProgress] = React.useState(0);
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
  
  // ✅ FIX: Always use full interval - no complex calculations
  const delay = callInterval * 1000;
  
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
        setFirebasePaused(false);
        // Audio completion will trigger next call
      } else {
        console.log('⏸️ Game should stop');
        isTimerActiveRef.current = false;
      }
    } catch (error) {
      console.error('❌ Error in timer scheduling:', error);
      isTimerActiveRef.current = false;
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
  console.log('▶️ Starting timer with initial delay');
  
  stopTimer(); // Ensure no existing timer is running
  isTimerActiveRef.current = true;
  lastCallTimeRef.current = Date.now();
  
  // ✅ FIX: Add initial delay before first call
  const initialDelay = callInterval * 1000;
  
  console.log(`⏰ Initial call scheduled in ${initialDelay / 1000}s`);
  
  gameTimerRef.current = setTimeout(async () => {
    if (!isTimerActiveRef.current || !gameData) {
      console.log('⏰ Initial timer fired but game inactive');
      return;
    }
    
    console.log('📞 Initial timer fired - calling first number...');
    lastCallTimeRef.current = Date.now();
    
    try {
      const shouldContinue = await firebaseService.callNextNumberAndContinue(gameData.gameId);
      
      if (shouldContinue && isTimerActiveRef.current) {
        console.log('✅ First number called successfully, waiting for audio...');
        // Audio completion will schedule the next call
      } else {
        console.log('⏸️ Game should stop after first call');
        isTimerActiveRef.current = false;
      }
    } catch (error) {
      console.error('❌ Error in initial call:', error);
      isTimerActiveRef.current = false;
    }
  }, initialDelay);
  
}, [gameData, callInterval, stopTimer]);
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
  console.log(`🔊 Audio completed - Timer active: ${isTimerActiveRef.current}`);
  console.log(`🔊 IMPORTANT: This is the ONLY system that should call numbers`);
  
  // Check if game should end after audio completes
  if (pendingGameEnd) {
    console.log(`🏁 Audio complete, ending game now`);
    setPendingGameEnd(false);
    
    firebaseService.endGame(gameData!.gameId)
      .then(() => console.log('✅ Game ended after audio completion'))
      .catch(err => console.error('❌ Failed to end game:', err));
    
    stopTimer();
    return;
  }
  
  // ✅ FIX: Only schedule next call if game is active AND timer is active
  if (gameData?.gameState?.isActive && !gameData?.gameState?.gameOver && isTimerActiveRef.current) {
    console.log(`🔊 Audio completed - scheduling next call with HOST'S configured interval: ${callInterval}s`);
    
    // ✅ FIX: Always use HOST'S configured delay (not hardcoded)
    const delay = callInterval * 1000; // Host's configured timing
    
    console.log(`⏰ Next call scheduled in ${delay / 1000}s (HOST'S SETTING) after audio completion`);
    
    gameTimerRef.current = setTimeout(async () => {
      if (!isTimerActiveRef.current || !gameData) {
        console.log('⏰ Post-audio timer fired but game inactive');
        return;
      }
      
      console.log('📞 Post-audio timer fired - calling next number...');
      lastCallTimeRef.current = Date.now();
      
      try {
        const shouldContinue = await firebaseService.callNextNumberAndContinue(gameData.gameId);
        
        if (shouldContinue && isTimerActiveRef.current) {
          console.log('✅ Number called successfully, waiting for audio...');
          // Audio completion will schedule the next call
        } else {
          console.log('⏸️ Game should stop');
          isTimerActiveRef.current = false;
        }
      } catch (error) {
        console.error('❌ Error in post-audio call:', error);
        isTimerActiveRef.current = false;
      }
    }, delay);
    
  } else {
    console.log(`🔊 Audio completed but game inactive or ended`);
    isTimerActiveRef.current = false;
  }
}, [pendingGameEnd, stopTimer, gameData, callInterval]);
  
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
          // ✅ FIXED: Add delay to ensure activation completes
          setTimeout(() => {
            console.log('🎮 Starting timer after countdown completion');
            startTimer();
          }, 500);
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
   // ✅ ADD new preparation method:
const prepareGame = useCallback(async (): Promise<boolean> => {
  if (!gameData) return false;
  
  setIsPreparingGame(true);
  setPreparationStatus('Checking existing numbers...');
  setPreparationProgress(20);
  
  try {
    // Generate/validate numbers
    const result = await firebaseService.generateGameNumbers(gameData.gameId);
    
    if (!result.success) {
      setPreparationStatus(`Failed: ${result.error}`);
      setPreparationProgress(0);
      return false;
    }
    
    if (result.source === 'admin') {
      setPreparationStatus('Using admin-generated numbers');
    } else {
      setPreparationStatus('Host numbers generated successfully');
    }
    setPreparationProgress(80);
    
    // Small delay for user feedback
    await new Promise(resolve => setTimeout(resolve, 800));
    
    setPreparationStatus('Game ready to start');
    setPreparationProgress(100);
    
    // Small delay before finishing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return true;
    
  } catch (error: any) {
    console.error('❌ Game preparation failed:', error);
    setPreparationStatus(`Preparation failed: ${error.message}`);
    setPreparationProgress(0);
    return false;
  } finally {
    setIsPreparingGame(false);
  }
}, [gameData]);
 const startGame = useCallback(async () => {
  if (!gameData || isProcessing) return;
  
  setIsProcessing(true);
  try {
    console.log(`🎮 Starting game preparation: ${gameData.gameId}`);
    
    // Clear any existing timers
    clearAllTimers();
    
    // ✅ NEW: Prepare game first (generate/validate numbers)
    const preparationSuccess = await prepareGame();
    if (!preparationSuccess) {
      throw new Error('Game preparation failed');
    }
    
    console.log(`🎮 Starting countdown for: ${gameData.gameId}`);
    
    // 🎯 DELEGATE: Let firebase-game handle game start logic
    await firebaseService.startGameWithCountdown(gameData.gameId);
    
    // Start countdown timer (UI + Firebase sync)
    let timeLeft = 10;
    setCountdownTime(timeLeft);
    
    countdownTimerRef.current = setInterval(async () => {
      timeLeft--;
      setCountdownTime(timeLeft);
      
      try {
        await firebaseService.updateCountdownTime(gameData.gameId, timeLeft);
      } catch (error) {
        console.error('Failed to update countdown in Firebase:', error);
      }
      
      if (timeLeft <= 0) {
        clearInterval(countdownTimerRef.current!);
        countdownTimerRef.current = null;
       await firebaseService.activateGameAfterCountdown(gameData.gameId);
        // ✅ FIXED: Add delay to ensure proper initialization
        setTimeout(() => {
          console.log('🎮 Starting timer after game activation');
          startTimer();
        }, 1000);
        } // ✅ ADD this missing closing brace
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
}, [gameData, isProcessing, clearAllTimers, startTimer, prepareGame]);
  /**
   * Pause game - simple timer stop + database update
   */
  const pauseGame = useCallback(async () => {
  if (!gameData || isProcessing) return;
  setIsProcessing(true);
  try {
    console.log(`⏸️ Pausing game: ${gameData.gameId}`);
    stopTimer();
    setFirebasePaused(true);
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
    setFirebasePaused(false);
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

  // Auto-resume when host returns to active game - FIXED: Only resume if manually paused
  useEffect(() => {
    if (gameData?.gameState?.isActive && 
        !gameData?.gameState?.gameOver && 
        !gameData?.gameState?.isCountdown &&
        !isTimerActiveRef.current && 
        !isProcessing &&
        firebasePaused) { // ✅ ADDED: Only resume if explicitly paused
      
      console.log(`🔄 Host returned to active game - auto-resuming timer (was paused)`);
      lastCallTimeRef.current = Date.now();
      startTimer();
    }
  }, [gameData?.gameState?.isActive, gameData?.gameState?.gameOver, gameData?.gameState?.isCountdown, isProcessing, startTimer, firebasePaused]);
// Monitor Firebase recovery - FIXED: Manual recovery only
  useEffect(() => {
    if (!gameData?.gameId) return;
    
    const recoveryRef = ref(database, `games/${gameData.gameId}/firebaseRecovered`);
    const unsubscribe = onValue(recoveryRef, async (snapshot) => {
      if (snapshot.val() === true) {
        console.log('🎉 Firebase recovery detected - marking for manual resume');
        
        // Clear the recovery flag
        await update(ref(database, `games/${gameData.gameId}`), {
          firebaseRecovered: null,
          firebaseRecoveredAt: null
        });
        
        // ✅ FIXED: Don't auto-start timer, just update state
        if (gameData.gameState.isActive && !gameData.gameState.gameOver) {
          console.log('✅ Firebase recovered - timer can be manually resumed');
          setFirebasePaused(false);
          // Host must manually resume game via UI controls
        }
      }
    });
    
    return () => off(recoveryRef, 'value', unsubscribe);
  }, [gameData?.gameId, gameData?.gameState?.isActive, gameData?.gameState?.gameOver]);

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
  handlePrizeAudioComplete,
  firebasePaused,
  // ✅ ADD new properties:
  isPreparingGame,
  preparationStatus,
  preparationProgress
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
