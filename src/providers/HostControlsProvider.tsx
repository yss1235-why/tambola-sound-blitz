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
  updateSpeechRate: (scaleValue: number) => void;
  
  // Status
  isProcessing: boolean;
  countdownTime: number;
  
  speechRate: number;
  speechRateScale: number;
  
  // Audio completion handlers
  handleAudioComplete: () => void;
  handlePrizeAudioComplete: (prizeId: string) => void;
  handleGameOverAudioComplete: () => void;
  
  // Firebase status
  firebasePaused: boolean;
  
  // Preparation status
  isPreparingGame: boolean;
  preparationStatus: string;
  preparationProgress: number;
  
  // Visual state management
  visualCalledNumbers: number[];
  setVisualCalledNumbers: React.Dispatch<React.SetStateAction<number[]>>;
  
  // Audio system status
  isAudioReady: boolean;
  wasAutopaused: boolean; // ✅ NEW: Track auto-pause state
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
const [speechRate, setSpeechRate] = React.useState(1.0); // NEW: Speech rate control (1.0 = normal)
const [speechRateScale, setSpeechRateScale] = React.useState(0); // NEW: Scale value for UI (-3 to +6)
const [pendingGameEnd, setPendingGameEnd] = React.useState(false);
const [firebasePaused, setFirebasePaused] = React.useState(false);
const [visualCalledNumbers, setVisualCalledNumbers] = React.useState<number[]>([]);

// ✅ ADD these new state variables BEFORE they're used:
const [isPreparingGame, setIsPreparingGame] = React.useState(false);
const [preparationStatus, setPreparationStatus] = React.useState<string>('');
const [preparationProgress, setPreparationProgress] = React.useState(0);
const [isAudioReady, setIsAudioReady] = React.useState(false);
const [wasAutopaused, setWasAutopaused] = React.useState(false); 
const hasInitializedRef = React.useRef(false); // Use ref instead of state

  // ✅ ADD: Reset pause state when game changes
React.useEffect(() => {
  if (gameData?.gameId) {
    setFirebasePaused(false); // Reset pause state for new/different games
  }
}, [gameData?.gameId]);

// ✅ FIXED: Handle both active AND paused games during refresh (only on true component mount)
React.useEffect(() => {
  if (gameData?.gameId && !hasInitializedRef.current) {
    hasInitializedRef.current = true; // Mark as initialized (persists across renders)
    // Check if this is a game that should show refresh warning (active OR paused with called numbers)
    const isActiveGame = gameData.gameState.isActive && !gameData.gameState.gameOver;
    const isPausedGame = !gameData.gameState.isActive && !gameData.gameState.gameOver && 
                        gameData.gameState.calledNumbers && gameData.gameState.calledNumbers.length > 0;
    
    if (isActiveGame || isPausedGame) {
      console.log(`🔄 Page refreshed during ${isActiveGame ? 'active' : 'paused'} game - implementing safety measures`);
      
      // Auto-pause on refresh to prevent chaos (or maintain pause state)
      setFirebasePaused(true);
      setWasAutopaused(true); // ✅ Track that this was an auto-pause/refresh
      
      // Show all numbers that were actually called (safe when paused)
      setVisualCalledNumbers(gameData?.gameState?.calledNumbers || []);
      
      // Mark that we need manual resume
      setIsAudioReady(false);
      
      // Auto-pause in Firebase to sync state (only if was active)
      if (isActiveGame) {
        firebaseService.pauseGame(gameData.gameId)
          .then(() => console.log('✅ Game auto-paused on refresh for safety'))
          .catch(err => console.error('❌ Failed to auto-pause on refresh:', err));
      } else {
        console.log('✅ Game was already paused - maintaining pause state after refresh');
      }
      
    } else {
      // For non-active games, normal initialization is safe
      setVisualCalledNumbers(gameData?.gameState?.calledNumbers || []);
      setIsAudioReady(false);
      setFirebasePaused(false);
      setWasAutopaused(false);
    }
  }
}, [gameData?.gameId]);

  // Simple refs - only for timer management
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTimerActiveRef = useRef(false);
  const lastCallTimeRef = useRef<number>(0);
  const isCallInProgressRef = useRef(false); // ✅ NEW: Prevent double-calls

  // ================== SIMPLE TIMER LOGIC ==================
const scheduleNextCall = useCallback(() => {
  if (!isTimerActiveRef.current || !gameData) {
    console.log('🛑 Not scheduling - timer inactive or no game data');
    return;
  }
  
  // ✅ NEW: Check if call already in progress
  if (isCallInProgressRef.current) {
    console.log('⚠️ Call already in progress, skipping schedule');
    return;
  }
  
  // Clear any existing timer
  if (gameTimerRef.current) {
    clearTimeout(gameTimerRef.current);
    gameTimerRef.current = null;
  }
  
  // ✅ IMMEDIATE: No delay - call next number right away
console.log(`📞 Calling next number immediately after audio completion`);

// No setTimeout needed - call immediately
(async () => {
    if (!isTimerActiveRef.current || !gameData) {
      console.log('⏰ Timer fired but game inactive');
      return;
    }
    
    // ✅ NEW: Block if game is ending (same as startTimer)
    if (gameData.gameState?.pendingGameEnd || pendingGameEnd) {
      console.log('🚫 Schedule blocked - game is ending');
      isTimerActiveRef.current = false;
      isCallInProgressRef.current = false;
      return;
    }
    
    // ✅ NEW: Safety check to prevent double-calls
    if (isCallInProgressRef.current) {
      console.log('⚠️ Call already in progress, skipping');
      return;
    }
    console.log('📞 Timer fired - calling next number...');
    lastCallTimeRef.current = Date.now();
    isCallInProgressRef.current = true; // ✅ Mark call in progress
    
    try {
      const shouldContinue = await firebaseService.callNextNumberAndContinue(gameData.gameId);
      
      if (shouldContinue && isTimerActiveRef.current) {
        console.log('✅ Number called successfully, waiting for audio...');
        setFirebasePaused(false);
        // Audio completion will trigger next call
      } else {
        console.log('⏸️ Game should stop');
        isTimerActiveRef.current = false;
        isCallInProgressRef.current = false; // ✅ Reset flag
      }
    } catch (error) {
      console.error('❌ Error in timer scheduling:', error);
      isTimerActiveRef.current = false;
      isCallInProgressRef.current = false; // ✅ Reset flag
    }
 })();
}, [gameData]);
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
  
  // ✅ NEW: Block timer if game is ending
  if (gameData.gameState?.pendingGameEnd || pendingGameEnd) {
    console.log('🚫 Timer blocked - game is ending');
    return;
  }
  
  console.log('▶️ Starting timer with initial delay');
  
  stopTimer(); // Ensure no existing timer is running
  isTimerActiveRef.current = true;
  lastCallTimeRef.current = Date.now();
  
// ✅ FIX: Start immediately (no delay)
console.log(`📞 Starting first number call immediately`);

// Call immediately without setTimeout
(async () => {
    if (!isTimerActiveRef.current || !gameData) {
      console.log('⏰ Initial call but game inactive');
      return;
    }
    
    // ✅ NEW: Block if game is ending
    if (gameData.gameState?.pendingGameEnd || pendingGameEnd) {
      console.log('🚫 Number calling blocked - game is ending');
      isTimerActiveRef.current = false;
      isCallInProgressRef.current = false;
      return;
    }
    
    // ✅ NEW: Safety check for initial call too
    if (isCallInProgressRef.current) {
      console.log('⚠️ Initial call blocked - already in progress');
      return;
    }
    
    console.log('📞 Initial call - calling first number...');
    lastCallTimeRef.current = Date.now();
    isCallInProgressRef.current = true; // ✅ Mark call in progress
    
    try {
      const shouldContinue = await firebaseService.callNextNumberAndContinue(gameData.gameId);
      
      if (shouldContinue && isTimerActiveRef.current) {
        console.log('✅ First number called successfully, waiting for audio...');
        // Audio completion will schedule the next call
      } else {
        console.log('⏸️ Game should stop after first call');
        isTimerActiveRef.current = false;
        isCallInProgressRef.current = false; // ✅ Reset flag
      }
    } catch (error) {
      console.error('❌ Error in initial call:', error);
      isTimerActiveRef.current = false;
      isCallInProgressRef.current = false; // ✅ Reset flag
    }
})();
  
}, [gameData, stopTimer]);
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
 * ✅ SOLUTION 1: Handle audio completion and update visual state
 */
const handleAudioComplete = useCallback(async () => {
  console.log(`🔊 Audio completed - Timer active: ${isTimerActiveRef.current}`);
  
  // Mark audio system as ready on first callback
  if (!isAudioReady) {
    setIsAudioReady(true);
    console.log('✅ Audio system now ready after page refresh');
  }
  
  // ✅ NEW: Update visual called numbers ONLY after audio completes
  if (gameData?.gameState?.currentNumber) {
    setVisualCalledNumbers(prev => {
      const newNumbers = [...prev];
      if (!newNumbers.includes(gameData.gameState.currentNumber)) {
        newNumbers.push(gameData.gameState.currentNumber);
      }
      return newNumbers;
    });
  }
  
  // ✅ PRIORITY 1: Check for game ending conditions FIRST (before calling next number)
  if (pendingGameEnd || gameData?.gameState?.pendingGameEnd) {
    console.log(`🏁 PRIORITY: Game ending detected - blocking new numbers`);
    
    // Stop all number calling immediately
    isTimerActiveRef.current = false;
    isCallInProgressRef.current = false;
    stopTimer();
    
    setPendingGameEnd(false);
    
    firebaseService.endGame(gameData!.gameId)
      .then(() => console.log('✅ Game ended after audio completion'))
      .catch(err => console.error('❌ Failed to end game:', err));
    
    return; // STOP HERE - no more numbers
  }
  
  // ✅ PRIORITY 2: Check if game should end based on current state
  const currentGameData = await firebaseService.getGameData(gameData!.gameId);
  if (currentGameData?.gameState?.pendingGameEnd) {
    console.log(`🏁 PRIORITY: Firebase shows game ending - blocking new numbers`);
    
    // Stop all number calling immediately
    isTimerActiveRef.current = false;
    isCallInProgressRef.current = false;
    stopTimer();
    
    // Let game end naturally through Firebase state
    return; // STOP HERE - no more numbers
  }
  
// ✅ PRIORITY 3: Only call next number if game is NOT ending
if (gameData?.gameState?.isActive && 
    !gameData?.gameState?.gameOver && 
    !gameData?.gameState?.pendingGameEnd &&
    isTimerActiveRef.current) {
  
  console.log(`🔊 Audio completed - safe to call next number`);
  
  // ✅ NEW: Reset the flag to allow next call
  isCallInProgressRef.current = false;
  
  // ✅ NEW: Add small delay to ensure clean state
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // ✅ NEW: Double-check game is not ending after delay
  const recheckGameData = await firebaseService.getGameData(gameData.gameId);
  if (recheckGameData?.gameState?.pendingGameEnd) {
    console.log('⚠️ Game ending detected during delay - aborting number call');
    isTimerActiveRef.current = false;
    isCallInProgressRef.current = false;
    return;
  }
  
  // ✅ NEW: Check again before calling
  if (isCallInProgressRef.current) {
    console.log('⚠️ Another call started during delay, skipping');
    return;
  }
  
  lastCallTimeRef.current = Date.now();
  isCallInProgressRef.current = true; // ✅ Mark new call in progress
  
  try {
    const shouldContinue = await firebaseService.callNextNumberAndContinue(gameData.gameId);
    
    if (shouldContinue && isTimerActiveRef.current) {
      console.log('✅ Number called successfully, waiting for audio...');
    } else {
      console.log('⏸️ Game should stop');
      isTimerActiveRef.current = false;
      isCallInProgressRef.current = false; // ✅ Reset flag
    }
  } catch (error) {
    console.error('❌ Error in number call:', error);
    isTimerActiveRef.current = false;
    isCallInProgressRef.current = false; // ✅ Reset flag
  }
} else {
  console.log(`🔊 Audio completed but game inactive, ended, or ending`);
  isTimerActiveRef.current = false;
  isCallInProgressRef.current = false; // ✅ Reset flag when game stops
}
}, [pendingGameEnd, stopTimer, gameData]);
  
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
        
        try {
          await firebaseService.activateGameAfterCountdown(gameData!.gameId);
          
          // ✅ NEW: Automatically set to paused state after countdown
          setFirebasePaused(true); 
          setIsAudioReady(true);
          console.log('✅ Game activated but paused - host must click Resume to start');
          
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
        
        try {
          await firebaseService.activateGameAfterCountdown(gameData.gameId);
          
          // ✅ NEW: Automatically set to paused state after countdown
          setFirebasePaused(true); 
          setIsAudioReady(true);
          console.log('✅ Game activated but paused - host must click Resume to start');
          
        } catch (error) {
          console.error('❌ Failed to activate game after countdown:', error);
        }
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
}, [gameData, isProcessing, clearAllTimers, startTimer, prepareGame]);
  /**
   * Pause game - simple timer stop + database update
   */
 const pauseGame = useCallback(async () => {
  if (!gameData || isProcessing) return;
  setIsProcessing(true);
  try {
    console.log(`⏸️ Pausing number calling: ${gameData.gameId}`);
    stopTimer();
    setFirebasePaused(true);
    // ✅ DON'T call firebaseService.pauseGame() - just stop timer locally
    console.log(`✅ Number calling paused: ${gameData.gameId}`);
  } catch (error: any) {
    console.error('❌ Pause error:', error);
    throw new Error(error.message || 'Failed to pause number calling');
  } finally {
    setIsProcessing(false);
  }
}, [gameData, isProcessing, stopTimer]);
  /**
   * Resume game - simple timer start + database update
   */
const resumeGame = useCallback(async () => {
  if (!gameData) return;
  
  setIsProcessing(true);
  
  try {
    await firebaseService.resumeGame(gameData.gameId);
    setFirebasePaused(false);
    setIsAudioReady(true); // ✅ NEW: Mark audio ready for fresh start
    setWasAutopaused(false); // ✅ NEW: Clear auto-pause flag
    
    // ✅ NEW: Restart timer for resumed games
    if (gameData.gameState.isActive && !gameData.gameState.gameOver) {
      console.log('🔄 Restarting timer after manual resume');
      startTimer();
    }
    
    console.log('✅ Game resumed successfully - audio system ready');
  } catch (error) {
    console.error('❌ Failed to resume game:', error);
  } finally {
    setIsProcessing(false);
  }
}, [gameData, startTimer]);

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
 * Update speech rate - convert scale to actual rate
 */
const updateSpeechRate = useCallback((scaleValue: number) => {
  // Convert scale (-3 to +6) to actual speech rate
  const actualRate = scaleValue <= 0 
    ? 1.0 + (scaleValue * 0.1)  // -3 = 0.7, -1 = 0.9, 0 = 1.0
    : 1.0 + (scaleValue * 0.1); // +1 = 1.1, +6 = 1.6
  
  setSpeechRateScale(scaleValue); // Store scale for UI
  setSpeechRate(actualRate);     // Store actual rate for audio
  console.log(`🎤 Speech rate updated to ${actualRate} (scale: ${scaleValue})`);
}, []);

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
      !gameData?.gameState?.isCountdown &&
      !firebasePaused &&
      isAudioReady) { // ✅ ADD: Audio ready check
    
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
      !isTimerActiveRef.current &&
      !firebasePaused &&
      isAudioReady) { // ✅ ADD: Audio ready check
    
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
}, [gameData?.gameState?.isActive, gameData?.gameState?.gameOver, gameData?.gameState?.isCountdown, startTimer, firebasePaused, isAudioReady]);

  // Auto-stop timer when game ends (from real-time updates)
  useEffect(() => {
    if (gameData?.gameState.gameOver && isTimerActiveRef.current) {
      console.log(`🏁 Game ended via real-time update - stopping timer`);
      stopTimer();
    }
  }, [gameData?.gameState.gameOver, stopTimer]);

// Auto-resume when host returns to active game - FIXED: Only if NOT manually paused AND audio ready
  useEffect(() => {
    if (gameData?.gameState?.isActive && 
        !gameData?.gameState?.gameOver && 
        !gameData?.gameState?.isCountdown &&
        !isTimerActiveRef.current && 
        !isProcessing &&
        !firebasePaused &&
        isAudioReady) { // ✅ NEW: Wait for audio system to be ready
      
      console.log(`🔄 Host returned to active game - auto-resuming timer (audio ready)`);
      
      // ✅ NEW: Add delay to prevent race condition with countdown completion
      setTimeout(() => {
        if (!isTimerActiveRef.current && !isCallInProgressRef.current) {
          lastCallTimeRef.current = Date.now();
          startTimer();
        }
      }, 1500); // Give enough time for any pending operations
    }
  }, [gameData?.gameState?.isActive, gameData?.gameState?.gameOver, gameData?.gameState?.isCountdown, isProcessing, startTimer, firebasePaused, isAudioReady]);
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
        console.log(`🚨 Countdown expired during disconnect - activating game but paused`);
        firebaseService.activateGameAfterCountdown(gameData.gameId)
          .then(() => {
            setFirebasePaused(true);
            setIsAudioReady(true);
            console.log('✅ Game activated but paused after recovery - host must click Resume');
          })
          .catch(error => console.error('❌ Failed to activate game:', error));
      }
    }
  }, [gameData?.gameState.isCountdown, gameData?.gameState.countdownTime, isProcessing, resumeCountdownTimer, startTimer]);
/**
 * Handle prize audio completion
 */
const handlePrizeAudioComplete = useCallback(async (prizeId: string) => {
  console.log(`🏆 Prize audio completed: ${prizeId}`);
  
  // Small delay to ensure state is settled
  setTimeout(async () => {
    // Re-fetch current game state to ensure we have latest data
    const currentGameData = await firebaseService.getGameData(gameData!.gameId);
    
    if (currentGameData?.gameState?.pendingGameEnd && !currentGameData?.gameState?.triggerGameOverAudio) {
      console.log(`🏁 Last prize announced, now triggering Game Over audio`);
      
      // Update Firebase to trigger game over audio
      try {
        await firebaseService.updateGameState(gameData!.gameId, {
          ...currentGameData.gameState,
          triggerGameOverAudio: true
        });
        console.log(`✅ Game Over audio trigger set in Firebase`);
      } catch (error) {
        console.error('❌ Failed to trigger game over audio:', error);
      }
    }
  }, 500); // 500ms delay to ensure prize state is fully updated
}, [gameData]);
// ✅ NEW: Handle Game Over audio completion with explicit redirect
const handleGameOverAudioComplete = useCallback(() => {
  console.log(`🏁 Game Over audio completed - starting 2-second redirect timer`);
  
  if (gameData?.gameState?.pendingGameEnd) {
    stopTimer();
    
    // ✅ NEW: 2-second delay before redirect
    setTimeout(async () => {
      try {
        console.log(`🏁 2-second delay complete - finalizing game and triggering redirect`);
        
      // Step 1: End the game in Firebase using existing method
        await firebaseService.endGame(gameData.gameId);
        console.log('✅ Game ended successfully in Firebase');
        
        // Step 2: Small delay to ensure Firebase update propagates
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Step 3: Force UI refresh by triggering a state change that components watch
        // This will make useGameData detect the game is over and trigger winner display
        const updatedGameData = await firebaseService.getGameData(gameData.gameId);
        console.log('✅ Game data refreshed - UI should now show winners');
        // Step 4: Dispatch a custom event for any components that need explicit notification
        const gameEndEvent = new CustomEvent('tambola-game-ended', {
          detail: { 
            gameId: gameData.gameId,
            showWinners: true,
            gameData: updatedGameData
          }
        });
        window.dispatchEvent(gameEndEvent);
        console.log('✅ Game end event dispatched - components should redirect to winners');
        
      } catch (error) {
        console.error('❌ Failed to finalize game and redirect:', error);
      }
    }, 2000); // 2-second delay
  }
}, [gameData, stopTimer]);
  // ================== CONTEXT VALUE ==================

const value: HostControlsContextValue = {
  startGame,
  pauseGame,
  resumeGame,
  endGame,
  updateSpeechRate, 
  isProcessing,
  countdownTime,
  speechRate, 
  speechRateScale, 
  handleAudioComplete,
  handlePrizeAudioComplete,
  handleGameOverAudioComplete,
  firebasePaused,
  isPreparingGame,
  preparationStatus,
  preparationProgress,
  visualCalledNumbers,
  setVisualCalledNumbers,
  isAudioReady,
  wasAutopaused
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
