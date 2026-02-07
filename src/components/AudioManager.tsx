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
  // AUDIO-002 FIX: Prevent double game-over audio
  const gameOverAudioPlayedRef = useRef(false);
  // AUDIO-006 FIX: Track if component is mounted for async cleanup
  const isMountedRef = useRef(true);

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
      // AUDIO-006 FIX: Mark as unmounted first
      isMountedRef.current = false;
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
    // Allow last number audio even when game is pending end
    const isPendingEnd = gameState?.pendingGameEnd && gameState?.lastNumberCalled;
    const shouldPlayAudio = (gameState?.isActive && !gameState?.gameOver) || isPendingEnd;

    if (!isAudioEnabled || !shouldPlayAudio) return;
    if (!currentNumber || currentNumber === lastProcessedNumber.current) return;

    const playNumberAudio = async () => {
      try {
        console.log(`🔊 Playing audio for number: ${currentNumber} ${isPendingEnd ? '(LAST NUMBER)' : ''}`);
        setIsPlaying(true);
        lastProcessedNumber.current = currentNumber;

        await audioCoordinator.playNumberAudio(
          currentNumber,
          async () => {
            setIsPlaying(false);
            onAudioComplete?.('number', { number: currentNumber });

            // Don't end game here - let the pending game end effect handle coordination
            if (isPendingEnd && gameId) {
              console.log(`🏁 Last number audio completed - pending game end will coordinate final sequence`);
            }
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

  /// Handle prize announcement audio
  useEffect(() => {
    if (!isAudioEnabled || !lastWinnerAnnouncement) return;
    if (lastWinnerAnnouncement === lastProcessedAnnouncement.current) return;

    // Check if announcement actually contains valid winner info
    const prizeMatch = lastWinnerAnnouncement.match(/(.*?)\s+won\s+by\s+(.*?)!/);
    if (!prizeMatch || !prizeMatch[1] || !prizeMatch[2] || prizeMatch[1].includes('unknown') || prizeMatch[2].includes('unknown')) {
      console.log('🔇 Skipping audio - no valid winner info found in:', lastWinnerAnnouncement);
      lastProcessedAnnouncement.current = lastWinnerAnnouncement; // Mark as processed to avoid loops
      return;
    }

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

  // Handle pending game end coordination
  useEffect(() => {
    const isPendingEnd = gameState?.pendingGameEnd;
    if (!isAudioEnabled || !isPendingEnd || !gameId) return;

    console.log('🏁 Pending game end detected - coordinating final audio sequence');

    const coordinateFinalAudio = async () => {
      try {
        // Small delay to ensure all audio effects have processed
        await new Promise(resolve => setTimeout(resolve, 500));

        // AUDIO-004 FIX: Check audioCoordinator.isPlaying() not stale React state
        let waitCount = 0;
        while (audioCoordinator.isPlaying() && waitCount < 50) { // Max 5 seconds wait
          console.log('⏳ Waiting for current audio to finish before game end sequence');
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }

        if (waitCount >= 50) {
          console.warn('⚠️ Timeout waiting for audio to finish, proceeding anyway');
        }

        // AUDIO-002 FIX: Check if already played
        if (gameOverAudioPlayedRef.current) {
          console.log('⏭️ Game over audio already played, skipping');
          return;
        }
        gameOverAudioPlayedRef.current = true;

        // Play game over celebration audio
        console.log('🎉 Playing final game over celebration');
        if (isMountedRef.current) setIsPlaying(true);

        await audioCoordinator.playGameOverAudio(() => {
          if (isMountedRef.current) setIsPlaying(false);
          console.log('✅ Game over audio completed - finalizing game end');

          // AUDIO-007 FIX: Check if mounted before dynamic import
          if (!isMountedRef.current) {
            console.log('⚠️ Component unmounted, skipping game end completion');
            return;
          }

          // Now complete the pending game end
          setTimeout(async () => {
            try {
              // AUDIO-007 FIX: Check again before import
              if (!isMountedRef.current) return;
              const { firebaseGame } = await import('@/services/firebase');
              await firebaseGame.completePendingGameEnd(gameId);
              console.log('🏁 Game end completed successfully');
            } catch (error) {
              console.error('❌ Failed to complete pending game end:', error);
            }
          }, 100);
        }, speechRate);

      } catch (error) {
        console.error('❌ Final audio coordination failed:', error);
        // Fallback: still try to end the game (only if mounted)
        if (!isMountedRef.current) return;
        try {
          const { firebaseGame } = await import('@/services/firebase');
          await firebaseGame.completePendingGameEnd(gameId);
        } catch (fallbackError) {
          console.error('❌ Fallback game end also failed:', fallbackError);
        }
      }
    };

    coordinateFinalAudio();
  }, [gameState?.pendingGameEnd, isAudioEnabled, gameId, speechRate]);

  // Handle regular game over audio (when game ends immediately without pending)
  useEffect(() => {
    // Only play if game is over but was NOT pending (immediate game end)
    const isImmediateGameOver = isGameOver && !gameState?.pendingGameEnd;
    if (!isAudioEnabled || !isImmediateGameOver) return;

    const playGameOverAudio = async () => {
      // AUDIO-002 FIX: Check if already played
      if (gameOverAudioPlayedRef.current) {
        console.log('⏭️ Immediate game over audio already played, skipping');
        return;
      }
      gameOverAudioPlayedRef.current = true;

      try {
        console.log('🏁 Playing immediate game over audio');
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
  }, [isGameOver, gameState?.pendingGameEnd, isAudioEnabled, onAudioComplete, onAudioError, speechRate]);
  // Stop all audio when component unmounts or game ends
  useEffect(() => {
    return () => {
      if (audioInitialized.current) {
        audioCoordinator.stopAllAudio();
        setIsPlaying(false);
      }
    };
  }, []);

  return null;
};

export default AudioManager;
