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
  onPrizeAudioComplete?: (prizeId: string) => void;
  onAudioStarted?: (number: number) => void;
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
  onAudioError,
  onPrizeAudioComplete,
  onAudioStarted
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
  // Prevent double countdown audio
  const countdownAudioPlayedRef = useRef(false);
  // AUDIO-006 FIX: Track if component is mounted for async cleanup
  const isMountedRef = useRef(true);

  // Initialize audio system
  useEffect(() => {
    if (!audioInitialized.current) {

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
        audioInitialized.current = true;
      } else {
        setIsAudioSupported(false);
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
          return true;
        }
        return false;

      } catch (error) {
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

          // Remove all listeners
          ['click', 'touchstart', 'keydown', 'mousedown', 'touchend', 'scroll'].forEach(eventType => {
            document.removeEventListener(eventType, enableAudioOnInteraction);
          });
        }

      } catch (error) {
      }
    };

    // First try immediate enablement
    tryEnableAudio().then(success => {
      if (!success) {
        // If immediate enablement fails, wait for ANY user interaction
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

  // Handle "Game Will Begin" audio during countdown
  useEffect(() => {
    if (!isAudioEnabled || !gameState?.isCountdown) return;
    if (countdownAudioPlayedRef.current) return;

    countdownAudioPlayedRef.current = true;

    const playCountdownAudio = async () => {
      try {
        if (isMountedRef.current) setIsPlaying(true);
        await audioCoordinator.playGameWillBeginAudio(() => {
          if (isMountedRef.current) setIsPlaying(false);
        }, speechRate);
      } catch (error) {
        if (isMountedRef.current) setIsPlaying(false);
      }
    };

    playCountdownAudio();
  }, [gameState?.isCountdown, isAudioEnabled, speechRate]);

  // Handle number calling audio
  useEffect(() => {
    // Allow last number audio even when game is pending end
    const isPendingEnd = gameState?.pendingGameEnd && gameState?.lastNumberCalled;
    const shouldPlayAudio = (gameState?.isActive && !gameState?.gameOver) || isPendingEnd;

    if (!isAudioEnabled || !shouldPlayAudio) return;
    if (!currentNumber || currentNumber === lastProcessedNumber.current) return;

    const playNumberAudio = async () => {
      try {
        setIsPlaying(true);
        lastProcessedNumber.current = currentNumber;

        await audioCoordinator.playNumberAudio(
          currentNumber,
          async () => {
            setIsPlaying(false);
            onAudioComplete?.('number', { number: currentNumber });

            // Don't end game here - let the pending game end effect handle coordination
            if (isPendingEnd && gameId) {
            }
          },
          speechRate
        );

      } catch (error) {
        setIsPlaying(false);
        onAudioError?.(error as Error, 'number');
      }
    };

    playNumberAudio();
    // FIX: Use specific gameState primitives to avoid re-running on unrelated Firebase updates
  }, [currentNumber, isAudioEnabled, gameState?.isActive, gameState?.gameOver, gameState?.pendingGameEnd, gameState?.lastNumberCalled, onAudioComplete, onAudioError, speechRate]);

  /// Handle prize announcement audio — FIXED: Announces ALL winners per prize
  useEffect(() => {
    if (!isAudioEnabled || !lastWinnerAnnouncement) return;
    if (lastWinnerAnnouncement === lastProcessedAnnouncement.current) return;

    // Parse all prize-winner pairs from announcement (split on '!' to handle multiple prizes)
    const prizeEntries = lastWinnerAnnouncement
      .split('!')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Extract and validate each prize entry
    const validEntries: { prizeId: string; ticketNumbers: number[] }[] = [];
    for (const entry of prizeEntries) {
      const match = entry.match(/(.*?)\s+won\s+by\s+(.*)/i);
      if (!match || !match[1] || !match[2] || match[1].includes('unknown') || match[2].includes('unknown')) continue;

      const prizeId = match[1].toLowerCase().replace(/\s+/g, '');
      const winnerInfo = match[2];

      // Extract ALL ticket numbers using matchAll (fixes single-ticket bug)
      const allTicketMatches = [...winnerInfo.matchAll(/T(\d+)/gi)];
      const ticketNumbers = allTicketMatches
        .map(m => parseInt(m[1], 10))
        .filter(n => n > 0);

      if (ticketNumbers.length > 0) {
        validEntries.push({ prizeId, ticketNumbers });
      }
    }

    if (validEntries.length === 0) {
      console.warn(`📢 [AudioManager] ❌ No valid prize entries found — skipping`);
      lastProcessedAnnouncement.current = lastWinnerAnnouncement;
      return;
    }

    // Play all announcements sequentially (Option A: full sequence per winner)
    // Each winner hears: [Prize Name] → [Won By] → [Ticket Number]
    const playAllPrizeAudio = async () => {
      try {
        setIsPlaying(true);
        lastProcessedAnnouncement.current = lastWinnerAnnouncement;

        for (const entry of validEntries) {
          for (const ticketNumber of entry.ticketNumbers) {
            await audioCoordinator.playPrizeAudio(
              entry.prizeId,
              ticketNumber,
              undefined,
              speechRate
            );
          }
        }

        setIsPlaying(false);
        onAudioComplete?.('prize', { entries: validEntries });

      } catch (error) {
        console.error(`📢 [AudioManager] ❌ playPrizeAudio error:`, error);
        setIsPlaying(false);
        onAudioError?.(error as Error, 'prize');
      }
    };

    playAllPrizeAudio();
  }, [lastWinnerAnnouncement, isAudioEnabled, onAudioComplete, onAudioError, speechRate]);

  // Handle pending game end coordination
  useEffect(() => {
    const isPendingEnd = gameState?.pendingGameEnd;
    if (!isAudioEnabled || !isPendingEnd || !gameId) return;

    const coordinateFinalAudio = async () => {
      try {
        // Small delay to ensure all audio effects have processed
        await new Promise(resolve => setTimeout(resolve, 500));

        // AUDIO-004 FIX: Check audioCoordinator.isPlaying() not stale React state
        let waitCount = 0;
        while (audioCoordinator.isPlaying() && waitCount < 50) { // Max 5 seconds wait
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }

        if (waitCount >= 50) {
        }

        // AUDIO-002 FIX: Check if already played
        if (gameOverAudioPlayedRef.current) {
          return;
        }
        gameOverAudioPlayedRef.current = true;

        // Play game over celebration audio
        if (isMountedRef.current) setIsPlaying(true);

        await audioCoordinator.playGameOverAudio(() => {
          if (isMountedRef.current) setIsPlaying(false);

          // AUDIO-007 FIX: Check if mounted before dynamic import
          if (!isMountedRef.current) {
            return;
          }

          // Now complete the pending game end
          setTimeout(async () => {
            try {
              // AUDIO-007 FIX: Check again before import
              if (!isMountedRef.current) return;
              const { firebaseGame } = await import('@/services/firebase');
              await firebaseGame.completePendingGameEnd(gameId);
            } catch (error) {
            }
          }, 100);
        }, speechRate);

      } catch (error) {
        // Fallback: still try to end the game (only if mounted)
        if (!isMountedRef.current) return;
        try {
          const { firebaseGame } = await import('@/services/firebase');
          await firebaseGame.completePendingGameEnd(gameId);
        } catch (fallbackError) {
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
        return;
      }
      gameOverAudioPlayedRef.current = true;

      try {
        setIsPlaying(true);

        await audioCoordinator.playGameOverAudio(() => {
          setIsPlaying(false);
          onAudioComplete?.('gameOver');
        }, speechRate);

      } catch (error) {
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
