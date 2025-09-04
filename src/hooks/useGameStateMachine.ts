// src/hooks/useGameStateMachine.ts
import { useMachine } from '@xstate/react';
import { useCallback, useEffect } from 'react';
import { tambolaGameMachine, TambolaGameContext, TambolaGameEvent } from '@/services/TambolaGameMachine';
import { gameTimerManager } from '@/services/GameTimerManager';

interface UseGameStateMachineProps {
  onStateChange?: (state: any, context: TambolaGameContext) => void;
  onNumberCall?: (number: number) => Promise<void>;
  onGameEnd?: () => Promise<void>;
  onError?: (error: string) => void;
}

export const useGameStateMachine = ({
  onStateChange,
  onNumberCall,
  onGameEnd,
  onError
}: UseGameStateMachineProps = {}) => {
  const [state, send, service] = useMachine(tambolaGameMachine, {
    devTools: process.env.NODE_ENV === 'development'
  });

  // Set up game state reference for timer manager
  useEffect(() => {
    const gameStateRef = {
      current: {
        isActive: state.matches('running'),
        gameOver: state.matches('gameOver'),
        isCountdown: state.matches('initializing')
      }
    };
    
    gameTimerManager.setGameStateRef(gameStateRef);
  }, [state]);

  // Handle state changes
  useEffect(() => {
    onStateChange?.(state.value, state.context);
  }, [state, onStateChange]);

  // Handle service events and invoke callbacks
  useEffect(() => {
    const subscription = service.subscribe((currentState) => {
      if (currentState.matches('error') && currentState.context.error) {
        onError?.(currentState.context.error);
      }
    });

    return () => subscription.unsubscribe();
  }, [service, onError]);

  // Game control actions
  const startGame = useCallback((gameId: string) => {
    console.log(`🎮 State machine: Starting game ${gameId}`);
    send({ type: 'START_GAME', gameId });
  }, [send]);

  const pauseGame = useCallback(() => {
    console.log('⏸️ State machine: Pausing game');
    gameTimerManager.pauseAll();
    send({ type: 'PAUSE_GAME' });
  }, [send]);

  const resumeGame = useCallback(() => {
    console.log('▶️ State machine: Resuming game');
    gameTimerManager.resumeAll();
    send({ type: 'RESUME_GAME' });
  }, [send]);

  const endGame = useCallback(async () => {
    console.log('🏁 State machine: Ending game');
    gameTimerManager.pauseAll();
    send({ type: 'END_GAME' });
    await onGameEnd?.();
  }, [send, onGameEnd]);

  const callNumber = useCallback(async (number: number) => {
    if (!state.can({ type: 'CALL_NUMBER', number })) {
      console.warn(`⚠️ Cannot call number ${number} in current state:`, state.value);
      return false;
    }

    try {
      console.log(`📞 State machine: Calling number ${number}`);
      send({ type: 'CALL_NUMBER', number });
      
      // Execute the actual number call
      await onNumberCall?.(number);
      
      return true;
    } catch (error) {
      console.error('❌ Error calling number:', error);
      send({ type: 'ERROR', error: (error as Error).message });
      return false;
    }
  }, [state, send, onNumberCall]);

  const notifyAudioReady = useCallback(() => {
    console.log('🔊 State machine: Audio ready');
    send({ type: 'AUDIO_READY' });
  }, [send]);

  const notifyAudioComplete = useCallback(() => {
    console.log('🔊 State machine: Audio complete');
    send({ type: 'AUDIO_COMPLETE' });
  }, [send]);

  const notifyPrizeWon = useCallback((prizeId: string) => {
    console.log(`🏆 State machine: Prize won - ${prizeId}`);
    send({ type: 'PRIZE_WON', prizeId });
  }, [send]);

  const notifyTimeUp = useCallback(() => {
    console.log('⏰ State machine: Time up');
    send({ type: 'TIME_UP' });
  }, [send]);

  const notifyAllNumbersCalled = useCallback(() => {
    console.log('📞 State machine: All numbers called');
    send({ type: 'ALL_NUMBERS_CALLED' });
  }, [send]);

  const handleError = useCallback((error: string) => {
    console.error('❌ State machine error:', error);
    send({ type: 'ERROR', error });
  }, [send]);

  const retry = useCallback(() => {
    console.log('🔄 State machine: Retrying');
    send({ type: 'RETRY' });
  }, [send]);

  const reset = useCallback(() => {
    console.log('🔄 State machine: Resetting');
    gameTimerManager.cleanup();
    send({ type: 'RESET' });
  }, [send]);

  // State queries
  const isIdle = state.matches('idle');
  const isInitializing = state.matches('initializing');
  const isRunning = state.matches('running');
  const isPaused = state.matches('paused');
  const isGameOver = state.matches('gameOver');
  const isError = state.matches('error');
  const isCallingNumber = state.matches('running.callingNumber');

  // Context accessors
  const gameId = state.context.gameId;
  const calledNumbers = state.context.calledNumbers;
  const currentNumber = state.context.currentNumber;
  const prizesWon = state.context.prizesWon;
  const error = state.context.error;

  return {
    // State
    state: state.value,
    context: state.context,
    
    // State queries
    isIdle,
    isInitializing,
    isRunning,
    isPaused,
    isGameOver,
    isError,
    isCallingNumber,
    
    // Context data
    gameId,
    calledNumbers,
    currentNumber,
    prizesWon,
    error,
    
    // Actions
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    callNumber,
    notifyAudioReady,
    notifyAudioComplete,
    notifyPrizeWon,
    notifyTimeUp,
    notifyAllNumbersCalled,
    handleError,
    retry,
    reset,
    
    // Utilities
    canCallNumber: (number: number) => state.can({ type: 'CALL_NUMBER', number }),
    canPause: () => state.can({ type: 'PAUSE_GAME' }),
    canResume: () => state.can({ type: 'RESUME_GAME' }),
    canEnd: () => state.can({ type: 'END_GAME' })
  };
};
