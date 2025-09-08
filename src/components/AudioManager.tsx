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
  speechRate?: number;
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
  speechRate,
  onAudioComplete,
  onAudioError
}) => {
 const [isAudioEnabled, setIsAudioEnabled] = useState(false); // Always start disabled
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
          gameOver: gameState?.gameOver || false,
          gameId: gameId || null
        };

        audioCoordinator.setGameStateRef(gameStateRef);
     // Set up audio coordinator but don't enable yet - wait for user interaction
        console.log('🔊 Audio coordinator set up, waiting for user interaction');
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
      gameOver: gameState?.gameOver || false,
      gameId: gameId || null
    };
  }
}, [gameState, gameId]);

 // Auto-enable audio for both hosts and players
  useEffect(() => {
    if (!isAudioSupported || isAudioEnabled) return;

    const tryEnableAudio = async () => {
      try {
        console.log('🔊 Attempting to auto-enable audio...');
        
        // Try immediate enablement (works if user already interacted)
        const testUtterance = new SpeechSynthesisUtterance(' ');
        testUtterance.volume = 0.01;
        testUtterance.rate = 10;
        
        const audioWorks = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 500);
          
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
          console.log('✅ Audio auto-enabled successfully');
          return true;
        }
        
        console.log('⏳ Audio blocked by browser, waiting for user interaction...');
        return false;
        
      } catch (error) {
        console.error('❌ Auto audio enablement failed:', error);
        return false;
      }
    };

    const enableAudioOnInteraction = async () => {
      try {
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
          console.log('✅ Audio enabled after user interaction');
          
          // Remove all listeners
          ['click', 'touchstart', 'keydown', 'mousedown', 'touchend', 'scroll'].forEach(eventType => {
            document.removeEventListener(eventType, enableAudioOnInteraction);
          });
        }
        
      } catch (error) {
        console.error('❌ Audio enablement failed:', error);
      }
    };

    // First try immediate enablement
    tryEnableAudio().then(success => {
      if (!success) {
        // If immediate enablement fails, wait for ANY user interaction
        console.log('📢 Setting up listeners for user interaction...');
        ['click', 'touchstart', 'keydown', 'mousedown', 'touchend', 'scroll'].forEach(eventType => {
          document.addEventListener(eventType, enableAudioOnInteraction, { passive: true });
        });
      }
    });

    return () => {
      // Cleanup listeners
      ['click', 'touchstart', 'keydown', 'mousedown', 'touchend', 'scroll'].forEach(eventType => {
        document.removeEventListener(eventType, enableAudioOnInteraction);
      });
    };
  }, [isAudioSupported, isAudioEnabled]);

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
          },
          speechRate
        );
        
      } catch (error) {
        console.error(`❌ Number audio failed: ${currentNumber}`, error);
        setIsPlaying(false);
        onAudioError?.(error as Error, 'number');
      }
    };

    playNumberAudio();
 }, [currentNumber, isAudioEnabled, gameState, onAudioComplete, onAudioError, speechRate]);

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
        let playerName = prizeMatch?.[2] || 'Unknown Player';
        
        // Fix: Replace "T" with "Ticket" for better speech pronunciation
        playerName = playerName.replace(/\bT(\d+)\b/g, 'Ticket $1');
        
       await audioCoordinator.playPrizeAudio(
          prizeId,
          playerName,
          () => {
            setIsPlaying(false);
            onAudioComplete?.('prize', { prizeId, playerName });
          },
          speechRate
        );
        
      } catch (error) {
        console.error('❌ Prize audio failed:', error);
        setIsPlaying(false);
        onAudioError?.(error as Error, 'prize');
      }
    };

    playPrizeAudio();
 }, [lastWinnerAnnouncement, isAudioEnabled, onAudioComplete, onAudioError, speechRate]);

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
        }, speechRate);
        
      } catch (error) {
        console.error('❌ Game over audio failed:', error);
        setIsPlaying(false);
        onAudioError?.(error as Error, 'gameOver');
      }
    };

    playGameOverAudio();
}, [isGameOver, isAudioEnabled, onAudioComplete, onAudioError, speechRate]);

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
