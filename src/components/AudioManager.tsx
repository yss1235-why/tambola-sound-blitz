// src/components/AudioManager.tsx - Enhanced with reliable audio and force enable
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Prize } from '@/services/firebase';

interface AudioManagerProps {
  currentNumber: number | null;
  prizes: Prize[];
  onAudioComplete?: () => void;
  forceEnable?: boolean; // New prop to force enable audio
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

// Traditional Tambola number calls
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
  onAudioComplete,
  forceEnable = false 
}) => {
  // State management
  const audioState = useRef<AudioState>(AudioState.IDLE);
  const audioQueue = useRef<AudioItem[]>([]);
  const currentAudio = useRef<AudioItem | null>(null);
  const lastCalledNumber = useRef<number | null>(null);
  const announcedPrizes = useRef<Set<string>>(new Set());
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  
  // Completion detection
  const completionTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Speech synthesis setup
  const selectedVoice = useRef<SpeechSynthesisVoice | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(forceEnable);
  const [audioError, setAudioError] = useState<string | null>(null);
  const initAttempted = useRef<boolean>(false);

  // Cleanup function
  const cleanup = useCallback(() => {
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

      // If force enable, try to enable immediately
      if (forceEnable && !initAttempted.current) {
        initAttempted.current = true;
        setTimeout(() => {
          enableAudioSilently();
        }, 500);
      }
    };

    initSpeech();

    return () => {
      cleanup();
    };
  }, [forceEnable, cleanup]);

  // Silent audio enable for force enable mode
  const enableAudioSilently = async () => {
    if (!('speechSynthesis' in window)) {
      return;
    }

    try {
      // Test with empty speech
      const testUtterance = new SpeechSynthesisUtterance('');
      testUtterance.volume = 0;
      
      window.speechSynthesis.speak(testUtterance);
      setIsAudioEnabled(true);
      setAudioError(null);
      console.log('✅ Audio force enabled');
    } catch (error) {
      console.warn('Audio force enable failed, will work on first interaction');
    }
  };

  // Add item to queue with priority management
  const queueAudio = useCallback((item: AudioItem) => {
    console.log(`Queueing audio: ${item.type} - ${item.text.substring(0, 30)}...`);
    
    // Remove duplicates of same type
    audioQueue.current = audioQueue.current.filter(existing => 
      !(existing.type === item.type && existing.text === item.text)
    );

    // Insert based on priority
    if (item.priority === 'HIGH') {
      const highPriorityCount = audioQueue.current.findIndex(i => i.priority !== 'HIGH');
      const insertIndex = highPriorityCount === -1 ? audioQueue.current.length : highPriorityCount;
      audioQueue.current.splice(insertIndex, 0, item);
    } else if (item.priority === 'MEDIUM') {
      const mediumInsertIndex = audioQueue.current.findIndex(i => i.priority === 'LOW');
      const insertIndex = mediumInsertIndex === -1 ? audioQueue.current.length : mediumInsertIndex;
      audioQueue.current.splice(insertIndex, 0, item);
    } else {
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

    console.log(`Processing audio: ${nextItem.type}`);
    speakItem(nextItem);
  }, []);

  // Speak individual item
  const speakItem = useCallback((item: AudioItem) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      handleAudioComplete(true);
      return;
    }

    // If audio not enabled and not force enabled, skip but don't fail
    if (!isAudioEnabled && !forceEnable) {
      console.log('Audio not enabled, skipping speech');
      handleAudioComplete(true);
      return;
    }

    try {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(item.text);
      
      // Configure utterance
      if (selectedVoice.current) {
        utterance.voice = selectedVoice.current;
      }
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      currentUtterance.current = utterance;

      let completed = false;
      
      const markComplete = (success: boolean) => {
        if (completed) return;
        completed = true;
        
        if (completionTimeout.current) {
          clearTimeout(completionTimeout.current);
          completionTimeout.current = null;
        }
        
        currentUtterance.current = null;
        handleAudioComplete(success);
      };

      // Set event handlers
      utterance.onend = () => {
        console.log('Speech ended');
        markComplete(true);
      };
      
      utterance.onerror = (event) => {
        console.warn('Speech error:', event.error);
        
        if (event.error === 'not-allowed' && forceEnable) {
          // For force enable mode, just continue without audio
          console.log('Audio blocked but force enabled, continuing...');
        }
        
        markComplete(true); // Don't fail the game due to audio errors
      };

      // Fallback timeout
      const estimatedDuration = Math.min((item.text.length * 80) + 2000, 10000);
      completionTimeout.current = setTimeout(() => {
        console.log('Speech timeout, continuing...');
        markComplete(true);
      }, estimatedDuration);

      // Start speaking
      window.speechSynthesis.speak(utterance);
      console.log(`Speaking: ${item.text.substring(0, 50)}...`);
      
    } catch (error) {
      console.error('Speech synthesis error:', error);
      handleAudioComplete(true);
    }
  }, [isAudioEnabled, forceEnable]);

  // Handle audio completion
  const handleAudioComplete = useCallback((success: boolean) => {
    const completedItem = currentAudio.current;
    
    console.log(`Audio completed: ${completedItem?.type} (success: ${success})`);
    
    // Reset state
    audioState.current = AudioState.IDLE;
    currentAudio.current = null;

    // Call completion callback if provided
    if (completedItem?.onComplete) {
      completedItem.onComplete();
    }

    // Process next item in queue after short delay
    setTimeout(() => {
      processQueue();
    }, 200);

    // If this was the last item in queue, notify parent
    if (audioQueue.current.length === 0 && onAudioComplete) {
      console.log('All audio completed, notifying parent');
      onAudioComplete();
    }
  }, [onAudioComplete, processQueue]);

  // Handle number calls
  useEffect(() => {
    if (currentNumber && currentNumber !== lastCalledNumber.current) {
      console.log(`New number to announce: ${currentNumber}`);
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
        console.log(`New prize to announce: ${prize.name}`);
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
          priority: 'HIGH',
          type: 'prize',
          retryCount: 0
        };

        // Delay prize announcements slightly
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

  // Enable audio on first user interaction if force enabled
  useEffect(() => {
    if (!forceEnable || isAudioEnabled) return;

    const handleUserInteraction = () => {
      if (!isAudioEnabled) {
        enableAudioSilently();
      }
    };

    const events = ['click', 'touch', 'keydown', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, [forceEnable, isAudioEnabled]);

  return null;
};
