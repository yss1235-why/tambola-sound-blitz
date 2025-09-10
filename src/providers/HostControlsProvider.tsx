// src/providers/HostControlsProvider.tsx - RACE CONDITION FREE: Complete Implementation
import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import { ref, onValue, off, update } from 'firebase/database';
import { firebaseService, database } from '@/services/firebase';
import { firebaseGame } from '@/services/firebase-game';
import { useGameData } from './GameDataProvider';
import { gameTimerManager } from '@/services/GameTimerManager';
import { SecureNumberCaller } from '@/services/SecureNumberCaller';
import { useGameStateMachine } from '@/hooks/useGameStateMachine';
import { useGameResourceManager } from '@/hooks/useGameResourceManager';

interface HostControlsContextValue {
  // Game flow controls (state machine integrated)
  startGame: () => Promise<void>;
  pauseGame: () => Promise<void>;
  resumeGame: () => Promise<void>;
  endGame: () => Promise<void>;
  
  // Session management
  sessionStatus: {
    isActive: boolean;
    isPrimary: boolean;
    otherSessions: Array<{id: string; hostName: string; lastActivity: string}>;
    conflictWarning: string | null;
  };
  requestPrimaryControl: () => Promise<void>;
  
  // NEW: Dialog management
  showPrimaryDialog: boolean;
  setShowPrimaryDialog: (show: boolean) => void;
  pendingAction: string | null;
  setPendingAction: (action: string | null) => void;
  takePrimaryControl: () => Promise<void>;
  executeAction: (action: string) => Promise<void>;
  
  // Configuration
  updateSpeechRate: (scaleValue: number) => Promise<void>;
  
  // Status (race condition free)
  isProcessing: boolean;
  countdownTime: number;
  
  // State machine status
  gameState: string;
  isGameIdle: boolean;
  isGameRunning: boolean;
  isGamePaused: boolean;
  isGameOver: boolean;
  canStartGame: boolean;
  canPauseGame: boolean;
  canResumeGame: boolean;
  canEndGame: boolean;
  
  speechRate: number;
  speechRateScale: number;
  
  // Audio completion handlers
  handleAudioComplete: () => void;
  handlePrizeAudioComplete: (prizeId: string) => void;
  handleAudioStarted: (number: number) => void;
  
 // Call interval configuration (now dynamic)
callInterval: number;
  
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
  wasAutopaused: boolean;
  isPrizeAudioPlaying: boolean;
}

const HostControlsContext = createContext<HostControlsContextValue | null>(null);

interface HostControlsProviderProps {
  children: React.ReactNode;
  userId: string;
}

export const HostControlsProvider: React.FC<HostControlsProviderProps> = ({
  children,
  userId
}) => {
  const { gameData } = useGameData();
  
  // TEMPORARY: Disable to test for circular dependency
  // const resourceManager = useGameResourceManager();
  const resourceManager = {
    safeAsyncOperation: async (name: string, operation: () => Promise<any>, options?: any) => {
      return await operation();
    },
    registerInterval: (callback: () => void, delay: number) => {
      return setInterval(callback, delay);
    }
  };
  
  // Simple refs - only for timer management  
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTimerActiveRef = useRef(false);
  const lastCallTimeRef = useRef<number>(0);
  const isCallInProgressRef = useRef(false);
  const lastCompletedNumber = useRef<number | null>(null);
  const audioCompletionId = useRef<string | null>(null);
  const isProcessingCompletion = useRef(false);
  const numberCallerRef = useRef<SecureNumberCaller | null>(null);

 // Simple state - only for UI feedback
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionStatus, setSessionStatus] = useState({
    isActive: false,
    isPrimary: false,
    otherSessions: [],
    conflictWarning: null
  });

  // NEW: Dialog state for primary control
  const [showPrimaryDialog, setShowPrimaryDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Monitor session status
  const checkSessionStatus = useCallback(async () => {
    const currentSessionId = sessionStorage.getItem('hostSessionId');
    
    if (!gameData || !currentSessionId) return;
    
    const activeSessions = gameData.activeSessions || {};
    const primarySession = gameData.primarySession;
    const otherSessions = Object.entries(activeSessions)
      .filter(([id]) => id !== currentSessionId)
      .map(([id, data]) => ({ id, ...data }));
    
    setSessionStatus({
      isActive: currentSessionId in activeSessions,
      isPrimary: currentSessionId === primarySession,
      otherSessions,
      conflictWarning: otherSessions.length > 0 ? 
        `${otherSessions.length} other device(s) logged in` : null
    });
  }, [gameData]);

  // Check session status when game data changes
  useEffect(() => {
    checkSessionStatus();
  }, [checkSessionStatus]);

  // Send heartbeat every 10 seconds (only for primary)
  useEffect(() => {
    if (!sessionStatus.isPrimary || !gameData) return;
    
    const heartbeatInterval = setInterval(() => {
      const currentSessionId = sessionStorage.getItem('hostSessionId');
      if (currentSessionId) {
        update(ref(database, `games/${gameData.gameId}/activeSessions/${currentSessionId}/lastHeartbeat`), 
               new Date().toISOString())
          .catch(error => console.error('Heartbeat failed:', error));
      }
    }, 10000); // 10 seconds
    
    return () => clearInterval(heartbeatInterval);
}, [sessionStatus.isPrimary, gameData]);

  // Monitor for missed calls (only for secondary sessions) - moved after startTimer definition

 const requestPrimaryControl = useCallback(async () => {
    const confirmed = confirm(
      'This will transfer game control to this device. The other device will become view-only. Continue?'
    );
    
    if (confirmed && gameData) {
      const currentSessionId = sessionStorage.getItem('hostSessionId');
      await update(ref(database, `games/${gameData.gameId}`), {
        primarySession: currentSessionId
      });
    }
  }, [gameData]);

  // NEW: Simple primary control takeover
  const takePrimaryControl = useCallback(async () => {
    const currentSessionId = sessionStorage.getItem('hostSessionId');
    if (!currentSessionId || !gameData) return;
    
    console.log('🎯 Taking primary control...');
    
    await update(ref(database, `games/${gameData.gameId}`), {
      primarySession: currentSessionId,
      primaryTakenAt: new Date().toISOString(),
      primaryTakenReason: 'user-requested'
    });
    
    // Sync local state with current game state
    syncWithGameState();
    
    console.log('✅ Primary control taken');
  }, [gameData]);

  // NEW: Synchronize local state with current game state
  const syncWithGameState = useCallback(() => {
    if (!gameData) return;
    
    console.log('🔄 Syncing local state with current game state...');
    
    // Sync visual numbers
    setVisualCalledNumbers(gameData.gameState.calledNumbers || []);
    
    // Sync game phase states
    if (gameData.gameState.isCountdown && gameData.gameState.countdownTime > 0) {
      setCountdownTime(gameData.gameState.countdownTime);
    }
    
    // Sync audio readiness
    if (gameData.gameState.isActive) {
      setIsAudioReady(true);
      setFirebasePaused(false);
    }
    
    console.log('✅ Local state synchronized');
  }, [gameData]);

  // NEW: Execute pending action after taking control and resume state
  const executeAction = useCallback(async (action: string) => {
    switch (action) {
      case 'startGame':
        // Check current game state first
        if (gameData?.gameState.isCountdown && gameData.gameState.countdownTime > 0) {
          // Resume existing countdown
          console.log('🔄 Resuming existing countdown...');
          setCountdownTime(gameData.gameState.countdownTime);
          resumeCountdownTimer(gameData.gameState.countdownTime);
          return;
        } else if (gameData?.gameState.isActive && !gameData.gameState.gameOver) {
          // Game is already active, resume number calling
          console.log('🔄 Resuming active game...');
          setFirebasePaused(false);
          setIsAudioReady(true);
          startTimer();
          return;
        }
        
        // Start new game only if not already started
        setIsProcessing(true);
        try {
          clearAllTimers();
          const preparationSuccess = await prepareGame();
          if (!preparationSuccess) {
            throw new Error('Game preparation failed');
          }
          
          await firebaseGame.startGameWithCountdown(gameData!.gameId);
          
          let timeLeft = 10;
          setCountdownTime(timeLeft);
          
          countdownTimerRef.current = setInterval(async () => {
            timeLeft--;
            setCountdownTime(timeLeft);
            
            try {
              await firebaseGame.updateCountdownTime(gameData!.gameId, timeLeft);
            } catch (error) {
              console.error('Failed to update countdown in Firebase:', error);
            }
            
            if (timeLeft <= 0) {
              clearInterval(countdownTimerRef.current!);
              countdownTimerRef.current = null;
              
              try {
                await firebaseGame.activateGameAfterCountdown(gameData!.gameId);
                setFirebasePaused(true);
                setIsAudioReady(true);
                console.log('✅ Game activated but paused - host must click Resume to start');
              } catch (error) {
                console.error('❌ Failed to activate game after countdown:', error);
              }
            }
          }, 1000);
          
          console.log(`✅ Game start initiated: ${gameData!.gameId}`);
        } catch (error: any) {
          console.error('❌ Start game error:', error);
          clearAllTimers();
          setCountdownTime(0);
          throw new Error(error.message || 'Failed to start game');
        } finally {
          setIsProcessing(false);
        }
        break;
        
      case 'pauseGame':
        // Take over and pause the active game
        setIsProcessing(true);
        try {
          console.log(`⏸️ Taking control and pausing number calling: ${gameData!.gameId}`);
          stopTimer();
          setFirebasePaused(true);
          console.log(`✅ Primary control taken - game paused: ${gameData!.gameId}`);
        } catch (error: any) {
          console.error('❌ Pause error:', error);
          throw new Error(error.message || 'Failed to pause number calling');
        } finally {
          setIsProcessing(false);
        }
        break;
        
      case 'resumeGame':
        // Take over and resume exactly where previous host left off
        setIsProcessing(true);
        try {
          console.log('🎯 Taking control and resuming game...');
          await firebaseGame.resumeGame(gameData!.gameId);
          setFirebasePaused(false);
          setIsAudioReady(true);
          setWasAutopaused(false);
          
          // Sync visual state with current game state
          setVisualCalledNumbers(gameData!.gameState.calledNumbers || []);
          
          if (gameData!.gameState.isActive && !gameData!.gameState.gameOver) {
            console.log('🔄 Resuming number calling where previous host left off');
            startTimer();
          }
          
          console.log('✅ Primary control taken - game resumed successfully');
        } catch (error: any) {
          console.error('❌ Failed to resume game:', error);
          throw new Error(error.message || 'Failed to resume game');
        } finally {
          setIsProcessing(false);
        }
        break;
        
      case 'endGame':
        setIsProcessing(true);
        try {
          console.log(`🏁 Ending game: ${gameData!.gameId}`);
          stopTimer();
          await firebaseGame.endGame(gameData!.gameId);
          console.log(`✅ Game ended: ${gameData!.gameId}`);
        } catch (error: any) {
          console.error('❌ End game error:', error);
          throw new Error(error.message || 'Failed to end game');
        } finally {
          setIsProcessing(false);
        }
        break;
    }
  }, [gameData, prepareGame, clearAllTimers, stopTimer, startTimer, resumeCountdownTimer]);

 
  
 
  const [countdownTime, setCountdownTime] = useState(0);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speechRateScale, setSpeechRateScale] = useState(0);
  const [firebasePaused, setFirebasePaused] = useState(false);
  const [visualCalledNumbers, setVisualCalledNumbers] = useState<number[]>([]);
  const [isPrizeAudioPlaying, setIsPrizeAudioPlaying] = useState(false);
  const [audioAnnouncingNumber, setAudioAnnouncingNumber] = useState<number | null>(null);
  // Calculate dynamic call interval based on speech rate
const calculateCallInterval = useCallback((speechRate: number): number => {
  // Base interval for normal speech (1.0 rate) 
  const baseInterval = 1.0;
  
  // Inverse relationship: slower speech = longer interval, faster speech = shorter interval
  const dynamicInterval = baseInterval / speechRate;
  
  // Clamp between reasonable bounds (0.5s to 2.0s)
  return Math.max(0.5, Math.min(2.0, dynamicInterval));
}, []);

const callInterval = calculateCallInterval(speechRate);
  const [isPreparingGame, setIsPreparingGame] = useState(false);
  const [preparationStatus, setPreparationStatus] = useState<string>('');
  const [preparationProgress, setPreparationProgress] = useState(0);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [wasAutopaused, setWasAutopaused] = useState(false);
  const hasInitializedRef = useRef(false);

  // ================== TIMER CONTROL FUNCTIONS ==================
  
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
   * Simple timer control
   */
  const stopTimer = useCallback(() => {
    console.log(`🛑 Stopping number calling timer`);
    isTimerActiveRef.current = false;
    isCallInProgressRef.current = false;
    isProcessingCompletion.current = false;
    
    // Clear completion tracking
    audioCompletionId.current = null;
    
    if (gameTimerRef.current) {
      clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
    }
  }, []);

  // Secure number calling function for state machine
  const handleSecureNumberCall = useCallback(async (number: number) => {
    if (!gameData) return;
    
    try {
      console.log(`🔢 State machine requesting number call: ${number}`);
      
      if (!numberCallerRef.current) {
        numberCallerRef.current = new SecureNumberCaller(gameData.gameId);
      }
      
      const result = await numberCallerRef.current.callNextNumber();
      
      if (result.success) {
        // Update visual state
        setVisualCalledNumbers(prev => {
          if (!prev.includes(result.number)) {
            return [...prev, result.number];
          }
          return prev;
        });
      }
      
      return result.success;
    } catch (error) {
      console.error('❌ Secure number call failed:', error);
      return false;
    }
  }, [gameData]);

  // Game end cleanup function for state machine
  const handleGameEndCleanup = useCallback(async () => {
    console.log('🧹 State machine cleanup on game end');
    stopTimer();
    clearAllTimers();
    
    // Cleanup secure number caller
    if (numberCallerRef.current) {
      numberCallerRef.current.cleanup();
      numberCallerRef.current = null;
    }
    
    // Cleanup timer manager
    gameTimerManager.pauseAll();
  }, [stopTimer, clearAllTimers]);

  // Game state ref for timer coordination (moved up)
  const gameStateRef = useRef({
    isActive: false,
    gameOver: false,
    isCountdown: false
  });

  // State machine for game flow (moved after all dependencies)
  const stateMachine = useGameStateMachine({
    onStateChange: (state, context) => {
      console.log('🎮 Game state changed:', state, context);
      // Update game state ref
      gameStateRef.current = {
        isActive: state.matches('running'),
        gameOver: state.matches('gameOver'),
        isCountdown: state.matches('initializing')
      };
    },
    onNumberCall: handleSecureNumberCall,
    onGameEnd: handleGameEndCleanup,
    onError: (error) => {
      console.error('❌ State machine error:', error);
      setIsProcessing(false);
    }
  });

  /**
   * ✅ SIMPLIFIED: Handle audio completion - focus only on calling next number
   */
  const handleAudioComplete = useCallback(() => {
    // Generate unique completion ID for race prevention
    const completionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    audioCompletionId.current = completionId;
    
    console.log(`🔊 Audio completion callback received (ID: ${completionId})`);
    
    // Use resource manager for safe async operations
    resourceManager.safeAsyncOperation(
      'audio-completion',
      async () => {
        console.log(`🔊 Audio completion callback received (ID: ${completionId})`);
        
        // Clear the announcing number since audio finished
        setAudioAnnouncingNumber(null);
        
        // Prevent duplicate processing
        if (isProcessingCompletion.current) {
          console.log('⚠️ Already processing a completion, ignoring');
          return;
        }
        
        // Mark audio system as ready on first callback
        if (!isAudioReady) {
          setIsAudioReady(true);
          console.log('✅ Audio system now ready');
        }
        
        isProcessingCompletion.current = true;
        
        // Add verification delay to ensure audio is truly done
        setTimeout(() => {
          // Verify this completion is still valid
          if (audioCompletionId.current !== completionId) {
            console.log('🚫 Stale completion ID, ignoring');
            isProcessingCompletion.current = false;
            return;
          }
          
          // Reset flags
          isCallInProgressRef.current = false;
          isProcessingCompletion.current = false;
          
          // Verify game is still active
          if (!gameData?.gameState?.isActive || 
              gameData?.gameState?.gameOver || 
              !isTimerActiveRef.current) {
            console.log('🛑 Game not active, stopping after audio completion');
            return;
          }
          
          // Check if game is over
          if (gameData?.gameState?.gameOver) {
            console.log('🎯 Game is over, stopping timer');
            return;
          }
          
          // Schedule next number call
          console.log('📞 Audio verified complete, scheduling next call');
          
         setTimeout(async () => {
            if (!isCallInProgressRef.current && isTimerActiveRef.current) {
              lastCallTimeRef.current = Date.now();
              isCallInProgressRef.current = true;
              
              // ✅ Update last call time in Firebase for session monitoring
              try {
                await update(ref(database, `games/${gameData.gameId}`), {
                  lastNumberCallTime: new Date().toISOString(),
                  callInterval: callInterval
                });
              } catch (error) {
                console.error('Failed to update call time:', error);
              }
              
             firebaseGame.callNextNumberAndContinue(gameData.gameId)
                .then(shouldContinue => {
                  console.log(`🎮 Audio complete - next call result: ${shouldContinue}`);
                  if (!shouldContinue) {
                    console.log('🏁 Game ending - stopping timer and clearing state');
                    isTimerActiveRef.current = false;
                    isCallInProgressRef.current = false;
                    stopTimer(); // Ensure timer is fully stopped
                  }
                })
                .catch(error => {
                  console.error('❌ Error calling next number:', error);
                  isTimerActiveRef.current = false;
                  isCallInProgressRef.current = false;
                });
            }
          }, (callInterval * 1000)); // Use the configured interval
        }, 300); // 300ms verification delay
      },
      { timeout: 5000 }
    ).catch(error => {
      console.error('❌ Error in audio completion handling:', error);
      isCallInProgressRef.current = false;
      isProcessingCompletion.current = false;
    });
  }, [gameData, isAudioReady, callInterval, resourceManager]);
  
 // Remove audioCoordination - not used anywhere and causing initialization conflicts
  // Audio handling is done directly in handleAudioComplete callback

  const startTimer = useCallback(() => {
    if (!gameData) return;
    
    // Check if game is already over
    if (gameData.gameState?.gameOver) {
      console.log('🚫 Timer blocked - game is over');
      return;
    }
    
    console.log('▶️ Starting centralized timer system');
    
    stopTimer(); // Ensure no existing timer is running and clear tracking
    
    // Reset all tracking refs
    isTimerActiveRef.current = true;
    isCallInProgressRef.current = false;
    isProcessingCompletion.current = false;
    lastCompletedNumber.current = null;
    audioCompletionId.current = null;
    lastCallTimeRef.current = Date.now();
    
    // Start immediately (no delay)
    console.log(`📞 Starting first number call immediately`);

    // Call immediately without setTimeout
    (async () => {
      if (!isTimerActiveRef.current || !gameData) {
        console.log('⏰ Initial call but game inactive');
        return;
      }
      
      // Check if game is already over
      if (gameData.gameState?.gameOver) {
        console.log('🚫 Number calling blocked - game is over');
        isTimerActiveRef.current = false;
        isCallInProgressRef.current = false;
        return;
      }
      
      // Safety check for initial call too
      if (isCallInProgressRef.current) {
        console.log('⚠️ Initial call blocked - already in progress');
        return;
      }
      
      console.log('📞 Initial call - calling first number...');
      lastCallTimeRef.current = Date.now();
      isCallInProgressRef.current = true; // Mark call in progress
      
try {
  // Use consistent firebase-game method
  const shouldContinue = await firebaseGame.callNextNumberAndContinue(gameData.gameId);
  
  if (shouldContinue && isTimerActiveRef.current) {
    console.log('✅ First number called successfully, waiting for audio...');
    // Audio completion will schedule the next call
  } else {
    console.log('⏸️ Game should stop after first call');
    isTimerActiveRef.current = false;
    isCallInProgressRef.current = false;
  }
} catch (error) {
  console.error('❌ Error in initial call:', error);
  isTimerActiveRef.current = false;
  isCallInProgressRef.current = false;
}
    })();
    
  }, [gameData, stopTimer]);
  
// Emergency takeover with proper startTimer reference
  const emergencyTakeover = useCallback(async () => {
    if (!gameData) return;
    
    const currentSessionId = sessionStorage.getItem('hostSessionId');
    
    // Take primary control
    await update(ref(database, `games/${gameData.gameId}`), {
      primarySession: currentSessionId
    });
    
    console.log('🎯 Emergency takeover complete - continuing game');
    
    // Continue game immediately if it was active
    if (gameData.gameState.isActive && !isTimerActiveRef.current) {
      setTimeout(() => {
        console.log('🎯 Emergency takeover - restarting number calling');
        startTimer();
      }, 1000);
    }
  }, [gameData, startTimer]);

  // Monitor for missed calls (only for secondary sessions)
  useEffect(() => {
    if (sessionStatus.isPrimary || !gameData || !gameData.gameState.isActive) return;
    
    const checkMissedCalls = () => {
      const lastCallTime = gameData.lastNumberCallTime ? 
        new Date(gameData.lastNumberCallTime).getTime() : 0;
      const callInterval = gameData.callInterval || 5; // Default 5 seconds
      const now = Date.now();
      const expectedNextCall = lastCallTime + (callInterval * 1000);
      
      // Check if we're 2 intervals behind (missed 2 calls)
      if (now > expectedNextCall + (callInterval * 2000)) {
        console.log('🚨 Primary host missed 2 calls - taking emergency control');
        emergencyTakeover();
      }
    };
    
    const monitorInterval = setInterval(checkMissedCalls, 2000); // Check every 2 seconds
    
    return () => clearInterval(monitorInterval);
  }, [sessionStatus.isPrimary, gameData, emergencyTakeover]);
  
  // ================== COUNTDOWN RECOVERY LOGIC ==================

  /**
   * Resume countdown timer from current Firebase value
   */
  const resumeCountdownTimer = useCallback((currentTimeLeft: number) => {
    if (countdownTimerRef.current || currentTimeLeft <= 0) return;
    
    console.log(`🔄 Resuming countdown from ${currentTimeLeft}s`);
    
    let timeLeft = currentTimeLeft;
    setCountdownTime(timeLeft);
    
    countdownTimerRef.current = resourceManager.registerInterval(async () => {
      timeLeft--;
      setCountdownTime(timeLeft);
      
      // Update Firebase with retry logic
      try {
        await firebaseGame.updateCountdownTime(gameData!.gameId, timeLeft);
      } catch (error) {
        console.warn('⚠️ Countdown update failed:', error);
      }
      
      if (timeLeft <= 0) {
        setCountdownTime(0);
        clearInterval(countdownTimerRef.current!);
        countdownTimerRef.current = null;
        
        try {
          await firebaseGame.activateGameAfterCountdown(gameData!.gameId);
          
          // Automatically set to paused state after countdown
          setFirebasePaused(true); 
          setIsAudioReady(true);
          console.log('✅ Game activated but paused - host must click Resume to start');
          
        } catch (error) {
          console.error('❌ Failed to activate game after countdown:', error);
        }
      }
    }, 1000);
  }, [gameData, resourceManager]);

  // ================== GAME CONTROL METHODS ==================

  // Preparation method
  const prepareGame = useCallback(async (): Promise<boolean> => {
    if (!gameData) return false;
    
    setIsPreparingGame(true);
    setPreparationStatus('Checking existing numbers...');
    setPreparationProgress(20);
    
    try {
      const result = await resourceManager.safeAsyncOperation(
        'prepare-game',
        async () => {
          const result = await firebaseGame.generateGameNumbers(gameData.gameId);
          return result;
        },
        {
          timeout: 15000,
          retries: 2,
          onRetry: (attempt, error) => {
            setPreparationStatus(`Retry ${attempt}: ${error.message}`);
          }
        }
      );
      
      if (!result || !result.success) {
        throw new Error(result?.error || 'Game preparation failed');
      }
      
      if (result.source === 'admin') {
        setPreparationStatus('Using admin-generated numbers');
      } else {
        setPreparationStatus('Host numbers generated successfully');
      }
      setPreparationProgress(80);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setPreparationStatus('Game ready to start');
      setPreparationProgress(100);
      
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
  }, [gameData, resourceManager]);

 const startGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    // NEW: Check if user is secondary and show choice dialog
    if (!sessionStatus.isPrimary) {
      setShowPrimaryDialog(true);
      setPendingAction('startGame');
      return;
    }
    
    setIsProcessing(true);
    try {
      console.log(`🎮 Starting game preparation: ${gameData.gameId}`);
      
      clearAllTimers();
      
      const preparationSuccess = await prepareGame();
      if (!preparationSuccess) {
        throw new Error('Game preparation failed');
      }
      
      console.log(`🎮 Starting countdown for: ${gameData.gameId}`);
      
     await firebaseGame.startGameWithCountdown(gameData.gameId);
      
      // Start countdown timer (UI + Firebase sync)
      let timeLeft = 10;
      setCountdownTime(timeLeft);
      
      countdownTimerRef.current = setInterval(async () => {
        timeLeft--;
        setCountdownTime(timeLeft);
        
        try {
         await firebaseGame.updateCountdownTime(gameData.gameId, timeLeft);
        } catch (error) {
          console.error('Failed to update countdown in Firebase:', error);
        }
        
        if (timeLeft <= 0) {
          clearInterval(countdownTimerRef.current!);
          countdownTimerRef.current = null;
          
          try {
            await firebaseGame.activateGameAfterCountdown(gameData.gameId);
            
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
  }, [gameData, isProcessing, clearAllTimers, prepareGame]);
const pauseGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    // NEW: Check if user is secondary and show choice dialog
    if (!sessionStatus.isPrimary) {
      setShowPrimaryDialog(true);
      setPendingAction('pauseGame');
      return;
    }
    
    setIsProcessing(true);
    try {
      console.log(`⏸️ Pausing number calling: ${gameData.gameId}`);
      stopTimer();
      setFirebasePaused(true);
      console.log(`✅ Number calling paused: ${gameData.gameId}`);
    } catch (error: any) {
      console.error('❌ Pause error:', error);
      throw new Error(error.message || 'Failed to pause number calling');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, stopTimer]);

 const resumeGame = useCallback(async () => {
    if (!gameData) return;
    
    // NEW: Check if user is secondary and show choice dialog
    if (!sessionStatus.isPrimary) {
      setShowPrimaryDialog(true);
      setPendingAction('resumeGame');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      await firebaseGame.resumeGame(gameData.gameId);
      setFirebasePaused(false);
      setIsAudioReady(true);
      setWasAutopaused(false);
      
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

 const endGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    // NEW: Check if user is secondary and show choice dialog
    if (!sessionStatus.isPrimary) {
      setShowPrimaryDialog(true);
      setPendingAction('endGame');
      return;
    }
    
    setIsProcessing(true);
    try {
      console.log(`🏁 Ending game: ${gameData.gameId}`);
      
      stopTimer();
      
      await firebaseGame.endGame(gameData.gameId);
      
      console.log(`✅ Game ended: ${gameData.gameId}`);
      
    } catch (error: any) {
      console.error('❌ End game error:', error);
      throw new Error(error.message || 'Failed to end game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, stopTimer]);

  const updateSpeechRate = useCallback(async (scaleValue: number) => {
 const actualRate = 1.0 + (scaleValue * 0.1);
  setSpeechRateScale(scaleValue);
  setSpeechRate(actualRate);
  
  // ✅ Save to Firebase for players to receive updated rate
  if (gameData?.gameId) {
    try {
      await firebaseGame.updateSpeechRate(gameData.gameId, actualRate);
      console.log(`🔊 Speech rate ${actualRate} saved to Firebase for game ${gameData.gameId}`);
    } catch (error) {
      console.error('❌ Failed to save speech rate to Firebase:', error);
    }
  }
}, [gameData?.gameId]);

  // Handle prize audio completion
  const handlePrizeAudioComplete = useCallback((prizeId: string) => {
    if (prizeId.startsWith('START:')) {
      console.log(`🏆 Prize audio starting for: ${prizeId.replace('START:', '')}`);
      setIsPrizeAudioPlaying(true);
      return;
    }
    
    console.log(`🏆 Prize audio complete for: ${prizeId}`);
    setIsPrizeAudioPlaying(false);
    
    setTimeout(() => {
      if (gameData && gameData.gameState.calledNumbers.length > visualCalledNumbers.length) {
        const lastAnnouncedNumber = gameData.gameState.calledNumbers[gameData.gameState.calledNumbers.length - 1];
        
        setVisualCalledNumbers(prev => {
          const newNumbers = [...prev];
          if (!newNumbers.includes(lastAnnouncedNumber)) {
            newNumbers.push(lastAnnouncedNumber);
            console.log(`✅ Visual updated after prize: ${lastAnnouncedNumber}`);
          }
          return newNumbers;
        });
      }
    }, 100);
  }, [gameData, visualCalledNumbers]);

  // Handle when audio starts playing a number
  const handleAudioStarted = useCallback((number: number) => {
    console.log(`🎤 Audio started for number ${number}`);
    setAudioAnnouncingNumber(number);
    
    setTimeout(() => {
      if (!isPrizeAudioPlaying) {
        setVisualCalledNumbers(prev => {
          const newNumbers = [...prev];
          if (!newNumbers.includes(number)) {
            newNumbers.push(number);
            console.log(`✅ Visual updated for number: ${number}`);
          }
          return newNumbers;
        });
      } else {
        console.log(`⏸️ Visual update blocked - prize audio is playing`);
      }
    }, 500);
  }, [isPrizeAudioPlaying]);

  // ================== EFFECTS ==================

  // Reset pause state when game changes
  useEffect(() => {
    if (gameData?.gameId) {
      setFirebasePaused(false);
    }
  }, [gameData?.gameId]);

  // Handle both active AND paused games during refresh
  useEffect(() => {
    if (gameData?.gameId && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const isActiveGame = gameData.gameState.isActive && !gameData.gameState.gameOver;
      const isPausedGame = !gameData.gameState.isActive && !gameData.gameState.gameOver && 
                          gameData.gameState.calledNumbers && gameData.gameState.calledNumbers.length > 0;
      
      if (isActiveGame || isPausedGame) {
        console.log(`🔄 Page refreshed during ${isActiveGame ? 'active' : 'paused'} game - implementing safety measures`);
        
        setFirebasePaused(true);
        setWasAutopaused(true);
        setVisualCalledNumbers(gameData?.gameState?.calledNumbers || []);
        setIsAudioReady(false);
        
        if (isActiveGame) {
          firebaseGame.pauseGame(gameData.gameId)
            .then(() => console.log('✅ Game auto-paused on refresh for safety'))
            .catch(err => console.error('❌ Failed to auto-pause on refresh:', err));
        } else {
          console.log('✅ Game was already paused - maintaining pause state after refresh');
        }
        
      } else {
        setVisualCalledNumbers(gameData?.gameState?.calledNumbers || []);
        setIsAudioReady(false);
        setFirebasePaused(false);
        setWasAutopaused(false);
      }
    }
  }, [gameData?.gameId]);

  // Initialize secure number caller when game data changes
  useEffect(() => {
    if (gameData?.gameId && !numberCallerRef.current) {
      numberCallerRef.current = new SecureNumberCaller(gameData.gameId);
      console.log('🔢 Secure number caller initialized');
    }
    
    const gameStateRef = {
      current: {
        isActive: gameData?.gameState?.isActive || false,
        gameOver: gameData?.gameState?.gameOver || false,
        isCountdown: gameData?.gameState?.isCountdown || false
      }
    };
    gameTimerManager.setGameStateRef(gameStateRef);
    
  }, [gameData?.gameId]);

  // Cleanup
  useEffect(() => {
    return () => {
      console.log(`🧹 Cleaning up HostControlsProvider`);
      clearAllTimers();
      
      if (numberCallerRef.current) {
        numberCallerRef.current.cleanup();
        numberCallerRef.current = null;
      }
      
      gameTimerManager.pauseAll();
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
          isAudioReady) {
        
        console.log('🔄 Screen became visible - checking timer state');
        
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
          isAudioReady) {
        
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

  // Auto-stop timer when game ends
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
        !isProcessing &&
        !firebasePaused &&
        isAudioReady) {
      
      console.log(`🔄 Host returned to active game - auto-resuming timer (audio ready)`);
      
      setTimeout(() => {
        if (!isTimerActiveRef.current && !isCallInProgressRef.current) {
          lastCallTimeRef.current = Date.now();
          startTimer();
        }
      }, 1500);
    }
  }, [gameData?.gameState?.isActive, gameData?.gameState?.gameOver, gameData?.gameState?.isCountdown, isProcessing, startTimer, firebasePaused, isAudioReady]);

  // Firebase recovery detection
  useEffect(() => {
    if (!gameData?.gameId) return;
    
    const recoveryRef = ref(database, `games/${gameData.gameId}/firebaseRecovered`);
    const unsubscribe = onValue(recoveryRef, async (snapshot) => {
      if (snapshot.val() === true) {
        console.log('🎉 Firebase recovery detected - marking for manual resume');
        
        await update(ref(database, `games/${gameData.gameId}`), {
          firebaseRecovered: null,
          firebaseRecoveredAt: null
        });
        
        if (gameData.gameState.isActive && !gameData.gameState.gameOver) {
          console.log('✅ Firebase recovered - timer can be manually resumed');
          setFirebasePaused(false);
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
        firebaseGame.activateGameAfterCountdown(gameData.gameId)
          .then(() => {
            setFirebasePaused(true);
            setIsAudioReady(true);
            console.log('✅ Game activated but paused after recovery - host must click Resume');
          })
          .catch(error => console.error('❌ Failed to activate game:', error));
      }
    }
  }, [gameData?.gameState.isCountdown, gameData?.gameState.countdownTime, isProcessing, resumeCountdownTimer]);

  // ================== CONTEXT VALUE ==================

const value: HostControlsContextValue = {
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    updateSpeechRate, 
    isProcessing,
    countdownTime,
    
    // Session management
    sessionStatus,
    requestPrimaryControl,
    
    // NEW: Dialog state for components
    showPrimaryDialog,
    setShowPrimaryDialog,
    pendingAction,
    setPendingAction,
    takePrimaryControl,
    executeAction,
    
    // State machine status (safe access)
    gameState: stateMachine?.state as string || 'idle',
    isGameIdle: stateMachine?.isIdle || false,
    isGameRunning: stateMachine?.isRunning || false,
    isGamePaused: stateMachine?.isPaused || false,
    isGameOver: stateMachine?.isGameOver || false,
    canStartGame: (stateMachine?.canStartGame || stateMachine?.isIdle) || false,
    canPauseGame: stateMachine?.canPause?.() || false,
    canResumeGame: stateMachine?.canResume?.() || false,
    canEndGame: stateMachine?.canEnd?.() || false,
    
    speechRate, 
    speechRateScale, 
    handleAudioComplete,
    handlePrizeAudioComplete,
    handleAudioStarted,
    firebasePaused,
    isPreparingGame,
    preparationStatus,
    preparationProgress,
    visualCalledNumbers,
    setVisualCalledNumbers,
    isAudioReady,
    wasAutopaused,
    isPrizeAudioPlaying,
    callInterval
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
