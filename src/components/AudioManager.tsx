// src/components/AudioManager.tsx - Enhanced with reliable audio and user interaction handling
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Prize } from '@/services/firebase';

interface AudioManagerProps {
  currentNumber: number | null;
  prizes: Prize[];
  onAudioComplete?: () => void; // Callback when audio finishes
}

// Audio item types
interface AudioItem {
  id: string;
  text: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  type: 'number' | 'prize' | 'general';
  retryCount: number;
  onComplete?: () => void;
}

// Audio state
enum AudioState {
  IDLE = 'IDLE',
  SPEAKING = 'SPEAKING',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR'
}

// Traditional Tambola number calls - kept exactly the same
const numberCalls: { [key: number]: string } = {
  1: "Kelly's Eyes, number one",
  2: "One little duck, number two",
  3: "Cup of tea, number three",
  4: "Knock at the door, number four",
  5: "Man alive, number five",
  6: "Half a dozen, number six",
  7: "Lucky seven",
  8: "One fat lady, number eight",
  9: "Doctor's orders, number nine",
  10: "Uncle Ben, number ten",
  11: "Legs eleven",
  12: "One dozen, number twelve",
  13: "Unlucky for some, thirteen",
  14: "Valentine's day, fourteen",
  15: "Young and keen, fifteen",
  16: "Sweet sixteen",
  17: "Dancing queen, seventeen",
  18: "Now you can vote, eighteen",
  19: "Goodbye teens, nineteen",
  20: "One score, twenty",
  21: "Key of the door, twenty-one",
  22: "Two little ducks, twenty-two",
  23: "Thee and me, twenty-three",
  24: "Two dozen, twenty-four",
  25: "Quarter century, twenty-five",
  26: "Pick and mix, twenty-six",
  27: "Duck and a crutch, twenty-seven",
  28: "Overweight, twenty-eight",
  29: "Rise and shine, twenty-nine",
  30: "Dirty thirty",
  31: "Get up and run, thirty-one",
  32: "Buckle my shoe, thirty-two",
  33: "All the threes, thirty-three",
  34: "Ask for more, thirty-four",
  35: "Jump and jive, thirty-five",
  36: "Three dozen, thirty-six",
  37: "A flea in heaven, thirty-seven",
  38: "Christmas cake, thirty-eight",
  39: "Steps and climb, thirty-nine",
  40: "Life begins at forty",
  41: "Time for fun, forty-one",
  42: "Winnie the Pooh, forty-two",
  43: "Down on your knees, forty-three",
  44: "Droopy drawers, forty-four",
  45: "Halfway there, forty-five",
  46: "Up to tricks, forty-six",
  47: "Four and seven, forty-seven",
  48: "Four dozen, forty-eight",
  49: "Rise and shine, forty-nine",
  50: "Half a century, fifty",
  51: "Tweak of the thumb, fifty-one",
  52: "Weeks in a year, fifty-two",
  53: "Here comes Herbie, fifty-three",
  54: "Clean the floor, fifty-four",
  55: "Snakes alive, fifty-five",
  56: "Was she worth it? Fifty-six",
  57: "Heinz varieties, fifty-seven",
  58: "Make them wait, fifty-eight",
  59: "Brighton line, fifty-nine",
  60: "Five dozen, sixty",
  61: "Baker's bun, sixty-one",
  62: "Turn on the screw, sixty-two",
  63: "Tickle me, sixty-three",
  64: "Red raw, sixty-four",
  65: "Old age pension, sixty-five",
  66: "Clickety click, sixty-six",
  67: "Stairway to heaven, sixty-seven",
  68: "Saving grace, sixty-eight",
  69: "Either way up, sixty-nine",
  70: "Three score and ten, seventy",
  71: "Bang on the drum, seventy-one",
  72: "Six dozen, seventy-two",
  73: "Queen bee, seventy-three",
  74: "Candy store, seventy-four",
  75: "Strive and strive, seventy-five",
  76: "Trombones, seventy-six",
  77: "Sunset strip, seventy-seven",
  78: "Heaven's gate, seventy-eight",
  79: "One more time, seventy-nine",
  80: "Gandhi's breakfast, eighty",
  81: "Stop and run, eighty-one",
  82: "Fat lady sings, eighty-two",
  83: "Time for tea, eighty-three",
  84: "Seven dozen, eighty-four",
  85: "Staying alive, eighty-five",
  86: "Between the sticks, eighty-six",
  87: "Torquay in Devon, eighty-seven",
  88: "Two fat ladies, eighty-eight",
  89: "Nearly there, eighty-nine",
  90: "Top of the shop, ninety"
};

export const AudioManager: React.FC<AudioManagerProps> = ({ 
  currentNumber, 
  prizes, 
  onAudioComplete 
}) => {
  // State management
  const audioState = useRef<AudioState>(AudioState.IDLE);
  const audioQueue = useRef<AudioItem[]>([]);
  const currentAudio = useRef<AudioItem | null>(null);
  const lastCalledNumber = useRef<number | null>(null);
  const announcedPrizes = useRef<Set<string>>(new Set());
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  
  // Completion detection
  const completionCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const completionTimeout = useRef<NodeJS.Timeout | null>(null);
  const isCheckingCompletion = useRef<boolean>(false);

  // Speech synthesis setup
  const selectedVoice = useRef<SpeechSynthesisVoice | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const [userInteracted, setUserInteracted] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (completionCheckInterval.current) {
      clearInterval(completionCheckInterval.current);
      completionCheckInterval.current = null;
    }
    if (completionTimeout.current) {
      clearTimeout(completionTimeout.current);
      completionTimeout.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    audioState.current = AudioState.IDLE;
    currentAudio.current = null;
    currentUtterance.current = null;
    isCheckingCompletion.current = false;
  }, []);

  // Initialize speech synthesis
  useEffect(() => {
    const initSpeech = () => {
      if (!('speechSynthesis' in window)) {
        console.warn('Speech synthesis not supported');
        setAudioError('Speech synthesis not supported in this browser');
        return;
      }

      // Load voices
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        
        // Find best voice
        const voicePreferences = [
          'Google UK English Female',
          'Google UK English Male', 
          'Microsoft Zira',
          'Microsoft David',
          'Samantha',
          'Alex',
          'Victoria'
        ];

        for (const prefName of voicePreferences) {
          const voice = voices.find(v => v.name.includes(prefName));
          if (voice) {
            selectedVoice.current = voice;
            break;
          }
        }

        // Fallback to any English voice
        if (!selectedVoice.current) {
          selectedVoice.current = voices.find(v => v.lang.startsWith('en')) || null;
        }

        console.log('Selected voice:', selectedVoice.current?.name || 'Default');
      };

      // Handle voice loading
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
      loadVoices();
    };

    initSpeech();

    // Add user interaction detection
    const handleUserInteraction = () => {
      if (!userInteracted) {
        setUserInteracted(true);
        console.log('✅ User interaction detected - audio can now be enabled');
      }
    };

    // Listen for any user interaction
    const events = ['click', 'touch', 'keydown', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, passive: true });
    });

    return () => {
      cleanup();
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, [userInteracted, cleanup]);

  // Manual audio enable function
  const enableAudio = useCallback(async () => {
    if (!('speechSynthesis' in window)) {
      setAudioError('Speech synthesis not supported in this browser');
      return false;
    }

    if (!userInteracted) {
      setAudioError('Please interact with the page first (click anywhere)');
      return false;
    }

    try {
      // Test speech synthesis with a short, silent utterance
      const testUtterance = new SpeechSynthesisUtterance(' ');
      testUtterance.volume = 0.01; // Very quiet
      testUtterance.rate = 10; // Very fast
      
      return new Promise<boolean>((resolve) => {
        testUtterance.onend = () => {
          setIsAudioEnabled(true);
          setAudioError(null);
          console.log('✅ Audio enabled successfully');
          resolve(true);
        };
        
        testUtterance.onerror = (event) => {
          console.error('Audio test failed:', event.error);
          if (event.error === 'not-allowed') {
            setAudioError('Audio blocked by browser. Please check browser settings and allow audio.');
          } else {
            setAudioError(`Audio error: ${event.error}`);
          }
          resolve(false);
        };

        window.speechSynthesis.speak(testUtterance);
        
        // Fallback timeout
        setTimeout(() => resolve(false), 2000);
      });
    } catch (error) {
      console.error('Enable audio error:', error);
      setAudioError('Failed to enable audio');
      return false;
    }
  }, [userInteracted]);

  // Add item to queue with priority management
  const queueAudio = useCallback((item: AudioItem) => {
    // Remove duplicates of same type
    audioQueue.current = audioQueue.current.filter(existing => 
      !(existing.type === item.type && existing.text === item.text)
    );

    // Insert based on priority
    if (item.priority === 'HIGH') {
      // High priority goes to front, but after current HIGH priority items
      const highPriorityCount = audioQueue.current.findIndex(i => i.priority !== 'HIGH');
      const insertIndex = highPriorityCount === -1 ? audioQueue.current.length : highPriorityCount;
      audioQueue.current.splice(insertIndex, 0, item);
    } else if (item.priority === 'MEDIUM') {
      // Medium priority goes after HIGH but before LOW
      const mediumInsertIndex = audioQueue.current.findIndex(i => i.priority === 'LOW');
      const insertIndex = mediumInsertIndex === -1 ? audioQueue.current.length : mediumInsertIndex;
      audioQueue.current.splice(insertIndex, 0, item);
    } else {
      // Low priority goes to end
      audioQueue.current.push(item);
    }

    // Start processing if idle
    if (audioState.current === AudioState.IDLE) {
      processQueue();
    }
  }, []);

  // Process audio queue
  const processQueue = useCallback(() => {
    if (audioState.current !== AudioState.IDLE || audioQueue.current.length === 0) {
      return;
    }

    const nextItem = audioQueue.current.shift()!;
    currentAudio.current = nextItem;
    audioState.current = AudioState.SPEAKING;

    speakItem(nextItem);
  }, []);

  // Speak individual item with reliable completion detection
  const speakItem = useCallback((item: AudioItem) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      handleAudioComplete(false);
      return;
    }

    if (!isAudioEnabled) {
      console.warn('Audio not enabled, skipping speech');
      handleAudioComplete(true); // Don't fail the game, just skip
      return;
    }

    try {
      // Only cancel if we're interrupting lower priority speech
      if (currentUtterance.current) {
        const currentPriority = currentAudio.current?.priority || 'LOW';
        if (item.priority === 'HIGH' && currentPriority !== 'HIGH') {
          window.speechSynthesis.cancel();
        }
      }

      const utterance = new SpeechSynthesisUtterance(item.text);
      
      // Configure utterance
      if (selectedVoice.current) {
        utterance.voice = selectedVoice.current;
      }
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      currentUtterance.current = utterance;

      // Setup completion detection with multiple methods
      let completed = false;
      
      const markComplete = (success: boolean) => {
        if (completed) return;
        completed = true;
        
        // Clear detection mechanisms
        if (completionCheckInterval.current) {
          clearInterval(completionCheckInterval.current);
          completionCheckInterval.current = null;
        }
        if (completionTimeout.current) {
          clearTimeout(completionTimeout.current);
          completionTimeout.current = null;
        }
        
        isCheckingCompletion.current = false;
        currentUtterance.current = null;
        
        handleAudioComplete(success);
      };

      // Method 1: onend event
      utterance.onend = () => markComplete(true);
      
      // Method 2: onerror event with better error handling
      utterance.onerror = (event) => {
        console.warn('Speech synthesis error:', event.error);
        
        if (event.error === 'not-allowed') {
          setIsAudioEnabled(false);
          setAudioError('Audio was blocked. Click "Enable Audio" to restore.');
        }
        
        markComplete(false);
      };

      // Method 3: Polling method (more reliable)
      isCheckingCompletion.current = true;
      completionCheckInterval.current = setInterval(() => {
        if (!isCheckingCompletion.current) return;
        
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          markComplete(true);
        }
      }, 100);

      // Method 4: Fallback timeout
      const estimatedDuration = (item.text.length * 80) + 2000; // ~80ms per character + 2s buffer
      completionTimeout.current = setTimeout(() => {
        if (isCheckingCompletion.current) {
          console.warn('Speech timeout for:', item.text.substring(0, 50));
          markComplete(false);
        }
      }, Math.min(estimatedDuration, 15000)); // Max 15 seconds

      // Start speaking
      window.speechSynthesis.speak(utterance);
      
    } catch (error) {
      console.error('Speech synthesis error:', error);
      handleAudioComplete(false);
    }
  }, [isAudioEnabled]);

  // Handle audio completion
  const handleAudioComplete = useCallback((success: boolean) => {
    const completedItem = currentAudio.current;
    
    // Reset state
    audioState.current = AudioState.IDLE;
    currentAudio.current = null;

    // Call completion callback if provided
    if (completedItem?.onComplete) {
      completedItem.onComplete();
    }

    // Retry on failure (up to 2 times)
    if (!success && completedItem && completedItem.retryCount < 2) {
      const retryItem: AudioItem = {
        ...completedItem,
        retryCount: completedItem.retryCount + 1
      };
      
      setTimeout(() => {
        queueAudio(retryItem);
      }, 500);
      return;
    }

    // Notify parent component
    if (onAudioComplete) {
      onAudioComplete();
    }

    // Process next item in queue after short delay
    setTimeout(() => {
      processQueue();
    }, 200);
  }, [onAudioComplete, queueAudio, processQueue]);

  // Handle number calls
  useEffect(() => {
    if (currentNumber && currentNumber !== lastCalledNumber.current) {
      const callText = numberCalls[currentNumber] || `Number ${currentNumber}`;
      
      const audioItem: AudioItem = {
        id: `number-${currentNumber}-${Date.now()}`,
        text: callText,
        priority: 'MEDIUM',
        type: 'number',
        retryCount: 0
      };

      queueAudio(audioItem);
      lastCalledNumber.current = currentNumber;
    }
  }, [currentNumber, queueAudio]);

  // Handle prize announcements
  useEffect(() => {
    prizes.forEach(prize => {
      if (prize.won && !announcedPrizes.current.has(prize.id)) {
        let announcement = `Congratulations! ${prize.name} has been won`;
        
        if (prize.winners && prize.winners.length > 0) {
          if (prize.winners.length === 1) {
            announcement += ` by ${prize.winners[0].name}`;
          } else {
            announcement += ` by ${prize.winners.length} players`;
          }
        }
        
        announcement += '. Well done!';
        
        const audioItem: AudioItem = {
          id: `prize-${prize.id}-${Date.now()}`,
          text: announcement,
          priority: 'HIGH', // Prizes have high priority
          type: 'prize',
          retryCount: 0
        };

        // Delay prize announcements slightly to let number announcement finish
        setTimeout(() => {
          queueAudio(audioItem);
        }, 800);
        
        announcedPrizes.current.add(prize.id);
      }
    });
  }, [prizes, queueAudio]);

  // Reset announced prizes when game resets
  useEffect(() => {
    const wonPrizes = prizes.filter(p => p.won);
    
    if (wonPrizes.length === 0 && announcedPrizes.current.size > 0) {
      announcedPrizes.current.clear();
      lastCalledNumber.current = null;
    }
  }, [prizes]);

  // Auto-enable audio when user first interacts
  useEffect(() => {
    if (userInteracted && !isAudioEnabled && !audioError) {
      // Automatically try to enable audio after first interaction
      setTimeout(() => {
        enableAudio();
      }, 1000); // Small delay to ensure interaction is registered
    }
  }, [userInteracted, isAudioEnabled, audioError, enableAudio]);

  // Public method to get current audio state (for debugging)
  const getAudioStatus = useCallback(() => {
    return {
      state: audioState.current,
      queueLength: audioQueue.current.length,
      currentItem: currentAudio.current?.text?.substring(0, 50),
      isCheckingCompletion: isCheckingCompletion.current,
      isEnabled: isAudioEnabled,
      userInteracted: userInteracted,
      error: audioError
    };
  }, [isAudioEnabled, userInteracted, audioError]);

  // Expose status for debugging (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      (window as any).audioManagerStatus = getAudioStatus;
      (window as any).enableAudio = enableAudio;
    }
  }, [getAudioStatus, enableAudio]);

  // Show audio status overlay only if there are critical issues
  if (!userInteracted && currentNumber) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <div className="bg-blue-100 border border-blue-400 text-blue-800 px-4 py-3 rounded shadow-lg">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium">🎵 Game Audio Available</p>
              <p className="text-xs">Click anywhere to enable audio announcements</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
