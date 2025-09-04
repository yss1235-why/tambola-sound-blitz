// src/components/AudioManager.tsx - RACE CONDITION FREE: Audio Coordination System
import { useEffect, useRef, useCallback, useState } from 'react';
import { audioCoordinator } from '@/services/AudioCoordinator';

interface AudioManagerProps {
  gameId?: string;
  gameState?: any;
  calledNumbers?: number[];
  currentNumber?: number | null;
  lastWinnerAnnouncement?: string;
  isGameOver?: boolean;
  forceEnable?: boolean;
  onAudioComplete?: (type: string, data?: any) => void;
  onAudioError?: (error: Error, type: string) => void;
}

export const AudioManager: React.FC<AudioManagerProps> = ({
  gameId,
  gameState,
  calledNumbers = [],
  currentNumber,
  lastWinnerAnnouncement,
  isGameOver,
  forceEnable = false,
  onAudioComplete,
  onAudioError
}) => {
  const [isAudioEnabled, setIsAudioEnabled] = useState(forceEnable);
  const [isAudioSupported, setIsAudioSupported] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Refs for tracking audio state
  const lastProcessedNumber = useRef<number | null>(null);
  const lastProcessedAnnouncement = useRef<string>('');
  const audioInitialized = useRef(false);
  const gameStateRef = useRef<any>(null);

  // Initialize audio system
  useEffect(() => {
    if (!audioInitialized.current) {
      console.log('🔊 Initializing AudioManager with coordination');
      
      // Check if audio is supported
      if ('speechSynthesis' in window) {
        setIsAudioSupported(true);
        
        // Set up game state ref for audio coordinator
        gameStateRef.current = {
          isActive: gameState?.isActive || false,
          gameOver: gameState?.gameOver || false
        };
        
        audioCoordinator.setGameStateRef(gameStateRef);
        
        // Force enable for hosts
        if (forceEnable) {
          setIsAudioEnabled(true);
          console.log('🔊 Audio force-enabled (host mode)');
        }
        
        audioInitialized.current = true;
      } else {
        setIsAudioSupported(false);
        console.warn('🔇 Speech synthesis not supported');
      }
    }

    return () => {
      if (audioInitialized.current) {
        audioCoordinator.cleanup();
        audioInitialized.current = false;
      }
    };
  }, [forceEnable]);

  // Update game state ref when props change
  useEffect(() => {
    if (gameStateRef.current) {
      gameStateRef.current = {
        isActive: gameState?.isActive || false,
        gameOver: gameState?.gameOver || false
      };
    }
  }, [gameState]);

  // Enable audio on user interaction (for players)
  useEffect(() => {
    if (!isAudioSupported || isAudioEnabled || forceEnable) return;

    const enableAudioOnInteraction = async (event: Event) => {
      try {
        console.log('👆 User interaction detected, enabling audio...');
        
        // Test audio capability
        const testUtterance = new SpeechSynthesisUtterance(' ');
        testUtterance.volume = 0.01;
        testUtterance.rate = 10;
        
        const audioWorks = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 1000);
          
          testUtterance.onend = () => {
            clearTimeout(timeout);
            resolve(true);
          };
          testUtterance.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
          
          window.speechSynthesis.speak(testUtterance);
        });
        
        if (audioWorks) {
          setIsAudioEnabled(true);
          console.log('✅ Audio enabled successfully');
          
          // Remove listeners after successful enablement
          ['click', 'touchstart', 'keydown'].forEach(eventType => {
            document.removeEventListener(eventType, enableAudioOnInteraction);
          });
        }
        
      } catch (error) {
        console.error('❌ Audio enablement failed:', error);
      }
    };

    ['click', 'touchstart', 'keydown'].forEach(eventType => {
      document.addEventListener(eventType, enableAudioOnInteraction, { once: true });
    });

    return () => {
      ['click', 'touchstart', 'keydown'].forEach(eventType => {
        document.removeEventListener(eventType, enableAudioOnInteraction);
      });
    };
  }, [isAudioSupported, isAudioEnabled, forceEnable]);

  // Handle number calling audio
  useEffect(() => {
    if (!isAudioEnabled || !gameState?.isActive || gameState?.gameOver) return;
    if (!currentNumber || currentNumber === lastProcessedNumber.current) return;

    const playNumberAudio = async () => {
      try {
        console.log(`🔊 Playing audio for number: ${currentNumber}`);
        setIsPlaying(true);
        lastProcessedNumber.current = currentNumber;
        
        await audioCoordinator.playNumberAudio(
          currentNumber,
          () => {
            setIsPlaying(false);
            onAudioComplete?.('number', { number: currentNumber });
          }
        );
        
      } catch (error) {
        console.error(`❌ Number audio failed: ${currentNumber}`, error);
        setIsPlaying(false);
        onAudioError?.(error as Error, 'number');
      }
    };

    playNumberAudio();
  }, [currentNumber, isAudioEnabled, gameState, onAudioComplete, onAudioError]);

  // Handle prize announcement audio
  useEffect(() => {
    if (!isAudioEnabled || !lastWinnerAnnouncement) return;
    if (lastWinnerAnnouncement === lastProcessedAnnouncement.current) return;

    const playPrizeAudio = async () => {
      try {
        console.log(`🏆 Playing prize audio: ${lastWinnerAnnouncement}`);
        setIsPlaying(true);
        lastProcessedAnnouncement.current = lastWinnerAnnouncement;
        
        // Extract prize type and player name from announcement
        const prizeMatch = lastWinnerAnnouncement.match(/(.*?)\s+won\s+by\s+(.*?)!/);
        const prizeId = prizeMatch?.[1]?.toLowerCase().replace(/\s+/g, '') || 'unknown';
        const playerName = prizeMatch?.[2] || 'Unknown Player';
        
        await audioCoordinator.playPrizeAudio(
          prizeId,
          playerName,
          () => {
            setIsPlaying(false);
            onAudioComplete?.('prize', { prizeId, playerName });
          }
        );
        
      } catch (error) {
        console.error('❌ Prize audio failed:', error);
        setIsPlaying(false);
        onAudioError?.(error as Error, 'prize');
      }
    };

    playPrizeAudio();
  }, [lastWinnerAnnouncement, isAudioEnabled, onAudioComplete, onAudioError]);

  // Handle game over audio
  useEffect(() => {
    if (!isAudioEnabled || !isGameOver) return;

    const playGameOverAudio = async () => {
      try {
        console.log('🏁 Playing game over audio');
        setIsPlaying(true);
        
        await audioCoordinator.playGameOverAudio(() => {
          setIsPlaying(false);
          onAudioComplete?.('gameOver');
        });
        
      } catch (error) {
        console.error('❌ Game over audio failed:', error);
        setIsPlaying(false);
        onAudioError?.(error as Error, 'gameOver');
      }
    };

    playGameOverAudio();
  }, [isGameOver, isAudioEnabled, onAudioComplete, onAudioError]);

  // Stop all audio when component unmounts or game ends
  useEffect(() => {
    return () => {
      if (audioInitialized.current) {
        audioCoordinator.stopAllAudio();
        setIsPlaying(false);
      }
    };
  }, []);

  // Provide audio status for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    return (
      <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
        <div>Audio: {isAudioSupported ? (isAudioEnabled ? 'ON' : 'OFF') : 'UNSUPPORTED'}</div>
        <div>Playing: {isPlaying ? 'YES' : 'NO'}</div>
        <div>Queue: {audioCoordinator.getQueueLength()}</div>
        <div>Last #: {lastProcessedNumber.current}</div>
      </div>
    );
  }

  return null; // No visual component in production
};

export default AudioManager;
