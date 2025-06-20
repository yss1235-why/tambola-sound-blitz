// src/components/AudioManager.tsx - FIXED: Better user audio experience
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Prize } from '@/services/firebase';

interface AudioManagerProps {
  currentNumber: number | null;
  prizes: Prize[];
  onAudioComplete?: () => void;
  forceEnable?: boolean;
}

interface AudioQueueItem {
  id: string;
  text: string;
  priority: 'high' | 'normal';
  callback?: () => void;
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
  8: "Garden gate, number eight",
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
  23: "Three and me, twenty-three",
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
  // State
  const [isAudioSupported, setIsAudioSupported] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Refs
  const lastCalledNumber = useRef<number | null>(null);
  const announcedPrizes = useRef<Set<string>>(new Set());
  const selectedVoice = useRef<SpeechSynthesisVoice | null>(null);
  
  // Audio Queue System
  const audioQueue = useRef<AudioQueueItem[]>([]);
  const isProcessingQueue = useRef<boolean>(false);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const fallbackTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize speech synthesis
  useEffect(() => {
    const initSpeech = () => {
      if (!('speechSynthesis' in window)) {
        setIsAudioSupported(false);
        console.warn('🔇 Speech synthesis not supported');
        return;
      }

      setIsAudioSupported(true);

      // Load voices
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        
        // Find best voice for users (more natural sounding)
        const voicePreferences = [
          'Google UK English Female',
          'Google UK English Male', 
          'Microsoft Zira',
          'Microsoft David',
          'Google US English',
          'Microsoft Mark'
        ];

        for (const prefName of voicePreferences) {
          const voice = voices.find(v => v.name.includes(prefName));
          if (voice) {
            selectedVoice.current = voice;
            console.log('🎤 Selected voice:', voice.name);
            break;
          }
        }

        // Fallback to any English voice
        if (!selectedVoice.current) {
          selectedVoice.current = voices.find(v => v.lang.startsWith('en')) || null;
          if (selectedVoice.current) {
            console.log('🎤 Fallback voice:', selectedVoice.current.name);
          }
        }
      };

      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
      loadVoices();

      // ✅ FIXED: Enable audio if forced (for hosts) or try auto-enable for users
      if (forceEnable) {
        setIsAudioEnabled(true);
        console.log('🔊 Audio force-enabled (host mode)');
      }
    };

    initSpeech();

    return () => {
      stopAllAudio();
    };
  }, [forceEnable]);

  // ✅ FIXED: Better user interaction detection for audio
  useEffect(() => {
    if (!isAudioSupported || isAudioEnabled || forceEnable) return;

    const enableAudioOnInteraction = async () => {
      try {
        console.log('👆 User interaction detected, testing audio...');
        
        // Test if audio actually works
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
          document.body.setAttribute('data-user-interacted', 'true');
          console.log('✅ Audio enabled for user');
        } else {
          console.warn('⚠️ Audio test failed');
        }
      } catch (error) {
        console.warn('⚠️ Audio enablement failed:', error);
      }
      
      // Remove listener after first attempt
      document.removeEventListener('click', enableAudioOnInteraction);
      document.removeEventListener('keydown', enableAudioOnInteraction);
    };

    document.addEventListener('click', enableAudioOnInteraction, { once: true });
    document.addEventListener('keydown', enableAudioOnInteraction, { once: true });

    return () => {
      document.removeEventListener('click', enableAudioOnInteraction);
      document.removeEventListener('keydown', enableAudioOnInteraction);
    };
  }, [isAudioSupported, isAudioEnabled, forceEnable]);

  // Stop all audio
  const stopAllAudio = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
    
    currentUtterance.current = null;
    isProcessingQueue.current = false;
    setIsPlaying(false);
  }, []);

  // Add to queue
  const addToQueue = useCallback((item: AudioQueueItem) => {
    if (!isAudioSupported || !isAudioEnabled) {
      console.log('🔇 Audio not available, skipping:', item.text);
      // Call callback immediately if audio not available
      if (item.callback) {
        setTimeout(item.callback, 100);
      }
      return;
    }

    // If high priority, add to front of queue
    if (item.priority === 'high') {
      audioQueue.current.unshift(item);
    } else {
      audioQueue.current.push(item);
    }

    console.log(`🔊 Queued: ${item.text} (Priority: ${item.priority})`);
    
    // Start processing if not already processing
    if (!isProcessingQueue.current) {
      processQueue();
    }
  }, [isAudioSupported, isAudioEnabled]);

  // Process audio queue
  const processQueue = useCallback(() => {
    if (isProcessingQueue.current || audioQueue.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;
    setIsPlaying(true);

    const processNext = () => {
      if (audioQueue.current.length === 0) {
        isProcessingQueue.current = false;
        setIsPlaying(false);
        console.log('🔇 Audio queue completed');
        return;
      }

      const item = audioQueue.current.shift()!;
      console.log(`🎤 Speaking: ${item.text}`);

      try {
        // Cancel any existing speech
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(item.text);
        
        if (selectedVoice.current) {
          utterance.voice = selectedVoice.current;
        }
        
        // ✅ FIXED: Better audio settings for users
        utterance.rate = forceEnable ? 0.9 : 0.85; // Slightly slower for users
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        currentUtterance.current = utterance;

        // Handle completion
        const handleComplete = () => {
          console.log(`✅ Completed: ${item.text}`);
          
          // Clear fallback timer
          if (fallbackTimer.current) {
            clearTimeout(fallbackTimer.current);
            fallbackTimer.current = null;
          }
          
          currentUtterance.current = null;
          
          // Call item callback
          if (item.callback) {
            try {
              item.callback();
            } catch (error) {
              console.error('Audio callback error:', error);
            }
          }
          
          // Process next item after short delay
          setTimeout(processNext, 500);
        };

        utterance.onend = handleComplete;
        
        utterance.onerror = (event) => {
          console.warn('Speech error:', event.error);
          handleComplete();
        };

        // Fallback timer - estimate based on text length
        const estimatedDuration = Math.max(item.text.length * 80, 2000);
        fallbackTimer.current = setTimeout(() => {
          console.warn(`⏰ Audio timeout for: ${item.text}`);
          handleComplete();
        }, estimatedDuration);

        window.speechSynthesis.speak(utterance);
        
      } catch (error) {
        console.error('Speech synthesis error:', error);
        
        // Call callback on error
        if (item.callback) {
          try {
            item.callback();
          } catch (callbackError) {
            console.error('Audio callback error:', callbackError);
          }
        }
        
        // Continue with next item
        setTimeout(processNext, 100);
      }
    };

    processNext();
  }, [forceEnable]);

  // Handle number announcements
  useEffect(() => {
    if (currentNumber && currentNumber !== lastCalledNumber.current) {
      lastCalledNumber.current = currentNumber;
      
      const callText = numberCalls[currentNumber] || `Number ${currentNumber}`;
      
      console.log(`📢 Announcing number: ${currentNumber}`);
      
      addToQueue({
        id: `number-${currentNumber}`,
        text: callText,
        priority: 'high',
        callback: onAudioComplete // Only call completion for number announcements
      });
    }
  }, [currentNumber, addToQueue, onAudioComplete]);

  // Handle prize announcements
  useEffect(() => {
    prizes.forEach(prize => {
      if (prize.won && !announcedPrizes.current.has(prize.id)) {
        announcedPrizes.current.add(prize.id);
        
        let announcement = ` Congratulations! ${prize.name} has been won`;
        
        if (prize.winners && prize.winners.length > 0) {
          if (prize.winners.length === 1) {
            announcement += ` by ${prize.winners[0].name}`;
          } else {
            announcement += ` by ${prize.winners.length} players`;
          }
        }
        
        announcement += '! Well done!';
        
        console.log(`🏆 Announcing prize: ${prize.name}`);
        
        addToQueue({
          id: `prize-${prize.id}`,
          text: announcement,
          priority: 'normal'
          // No callback for prize announcements
        });
      }
    });
  }, [prizes, addToQueue]);

  // Reset announced prizes when game resets
  useEffect(() => {
    const wonPrizes = prizes.filter(p => p.won);
    
    if (wonPrizes.length === 0 && announcedPrizes.current.size > 0) {
      console.log('🔄 Resetting audio state for new game');
      announcedPrizes.current.clear();
      lastCalledNumber.current = null;
      audioQueue.current = [];
      stopAllAudio();
    }
  }, [prizes, stopAllAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

  // ✅ FIXED: Show audio status for users (only in development or when there are issues)
  if (process.env.NODE_ENV === 'development' && !forceEnable) {
    return (
      <div className="fixed bottom-4 left-4 bg-black/80 text-white p-2 rounded text-xs z-50">
        <div>🔊 Audio: {isAudioSupported ? (isAudioEnabled ? '✅ Ready' : '⚠️ Click to enable') : '❌ Unsupported'}</div>
        <div>📊 Queue: {audioQueue.current.length}</div>
        <div>🎤 Playing: {isPlaying ? 'Yes' : 'No'}</div>
      </div>
    );
  }

  return null;
};
