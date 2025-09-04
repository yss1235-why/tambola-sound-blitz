// src/hooks/useAudioGameCoordination.ts
import { useCallback, useRef, useEffect } from 'react';
import { audioCoordinator } from '@/services/AudioCoordinator';

interface UseAudioGameCoordinationProps {
  gameStateRef?: React.MutableRefObject<any>;
  onAudioComplete?: (type: string, data?: any) => void;
  onAudioError?: (error: Error, type: string) => void;
}

export const useAudioGameCoordination = ({
  gameStateRef,
  onAudioComplete,
  onAudioError
}: UseAudioGameCoordinationProps = {}) => {
  const isInitializedRef = useRef(false);
  const currentAudioId = useRef<string | null>(null);

  // Initialize audio coordinator
  useEffect(() => {
    if (!isInitializedRef.current) {
      console.log('🔊 Initializing audio game coordination');
      
      if (gameStateRef) {
        audioCoordinator.setGameStateRef(gameStateRef);
      }
      
      isInitializedRef.current = true;
    }

    return () => {
      if (isInitializedRef.current) {
        audioCoordinator.cleanup();
        isInitializedRef.current = false;
      }
    };
  }, [gameStateRef]);

  const playNumberAudio = useCallback(async (number: number): Promise<void> => {
    try {
      console.log(`🔊 Playing number audio: ${number}`);
      
      const audioId = await audioCoordinator.playNumberAudio(
        number,
        () => {
          console.log(`✅ Number audio completed: ${number}`);
          onAudioComplete?.('number', { number });
        }
      );
      
      currentAudioId.current = audioId;
      
    } catch (error) {
      console.error(`❌ Number audio failed: ${number}`, error);
      onAudioError?.(error as Error, 'number');
    }
  }, [onAudioComplete, onAudioError]);

  const playPrizeAudio = useCallback(async (prizeId: string, playerName: string): Promise<void> => {
    try {
      console.log(`🏆 Playing prize audio: ${prizeId} for ${playerName}`);
      
      const audioId = await audioCoordinator.playPrizeAudio(
        prizeId,
        playerName,
        () => {
          console.log(`✅ Prize audio completed: ${prizeId}`);
          onAudioComplete?.('prize', { prizeId, playerName });
        }
      );
      
      currentAudioId.current = audioId;
      
    } catch (error) {
      console.error(`❌ Prize audio failed: ${prizeId}`, error);
      onAudioError?.(error as Error, 'prize');
    }
  }, [onAudioComplete, onAudioError]);

  const playGameOverAudio = useCallback(async (): Promise<void> => {
    try {
      console.log('🏁 Playing game over audio');
      
      const audioId = await audioCoordinator.playGameOverAudio(() => {
        console.log('✅ Game over audio completed');
        onAudioComplete?.('gameOver');
      });
      
      currentAudioId.current = audioId;
      
    } catch (error) {
      console.error('❌ Game over audio failed', error);
      onAudioError?.(error as Error, 'gameOver');
    }
  }, [onAudioComplete, onAudioError]);

  const stopAllAudio = useCallback(() => {
    console.log('🛑 Stopping all coordinated audio');
    audioCoordinator.stopAllAudio();
    currentAudioId.current = null;
  }, []);

  const clearAudioQueue = useCallback(() => {
    console.log('🧹 Clearing audio queue');
    audioCoordinator.clearQueue();
    currentAudioId.current = null;
  }, []);

  // Audio state queries
  const isAudioPlaying = useCallback((): boolean => {
    return audioCoordinator.isPlaying();
  }, []);

  const getQueueLength = useCallback((): number => {
    return audioCoordinator.getQueueLength();
  }, []);

  const getCurrentAudioTask = useCallback(() => {
    return audioCoordinator.getCurrentTask();
  }, []);

  return {
    // Audio playback methods
    playNumberAudio,
    playPrizeAudio,
    playGameOverAudio,
    
    // Audio control methods
    stopAllAudio,
    clearAudioQueue,
    
    // Audio state queries
    isAudioPlaying,
    getQueueLength,
    getCurrentAudioTask,
    
    // Current audio tracking
    currentAudioId: currentAudioId.current
  };
};
