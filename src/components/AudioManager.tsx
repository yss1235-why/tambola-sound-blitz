// src/components/AudioManager.tsx - FIXED: Better user audio experience
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Prize } from '@/services/firebase';

interface AudioManagerProps {
  currentNumber: number | null;
  prizes: Prize[];
   gameState?: any;
  onAudioComplete?: () => void;
  forceEnable?: boolean;
  onPrizeAudioComplete?: (prizeId: string) => void;
  onGameOverAudioComplete?: () => void;
}
interface AudioQueueItem {
  id: string;
  text: string;
  priority: 'high' | 'normal';
  callback?: () => void;
}


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
  gameState, 
  onAudioComplete,
  forceEnable = false,
  onPrizeAudioComplete,
  onGameOverAudioComplete 
}) => {
  
const [isAudioSupported, setIsAudioSupported] = useState(false);
const [isAudioEnabled, setIsAudioEnabled] = useState(false);
const [isPlaying, setIsPlaying] = useState(false);
const [isBlockedForAnnouncement, setIsBlockedForAnnouncement] = useState(false); // ✅ SOLUTION 3
  

// Refs for voice management - FIXED: Proper scope
  const femaleVoice = useRef<SpeechSynthesisVoice | null>(null);
  const maleVoice = useRef<SpeechSynthesisVoice | null>(null);
  const fallbackVoice = useRef<SpeechSynthesisVoice | null>(null);
  
  // Other refs
  const lastCalledNumber = useRef<number | null>(null);
  const announcedPrizes = useRef<Set<string>>(new Set());
  const audioQueue = useRef<AudioQueueItem[]>([]);
  const isProcessingQueue = useRef<boolean>(false);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const fallbackTimer = useRef<NodeJS.Timeout | null>(null);

 

  // Initialize speech synthesis
  // Initialize speech synthesis
useEffect(() => {
  const initSpeech = () => {
    if (!('speechSynthesis' in window)) {
      setIsAudioSupported(false);
      console.warn('🔇 Speech synthesis not supported');
      return;
    }

    setIsAudioSupported(true);

    // Set up voice loading
    const loadVoicesInternal = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('🎤 Available voices:', voices.map(v => v.name));
      
      // Find female US voice (for numbers, prizes)
      const femalePreferences = [
        'Google US English Female',
        'Google US English Female (en-US)',
        'Google US English'
      ];
      
      for (const prefName of femalePreferences) {
        const voice = voices.find(v => v.name.includes(prefName) || v.name === prefName);
        if (voice) {
          femaleVoice.current = voice;
          console.log('👩 Selected female voice:', voice.name);
          break;
        }
      }
      
      // Find male US voice (for game over)
      const malePreferences = [
        'Google US English Male',
        'Google US English Male (en-US)',
        'Google US English (Male)'
      ];
      
      for (const prefName of malePreferences) {
        const voice = voices.find(v => v.name.includes(prefName) || v.name === prefName);
        if (voice) {
          maleVoice.current = voice;
          console.log('👨 Selected male voice:', voice.name);
          break;
        }
      }
      
      // Fallback to any English voice
      fallbackVoice.current = voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
      if (fallbackVoice.current) {
        console.log('📱 Fallback voice:', fallbackVoice.current.name);
      }
    };

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoicesInternal;
    }
    loadVoicesInternal();

    // ✅ FIXED: Enable audio if forced (for hosts) or try auto-enable for users
    if (forceEnable) {
      setIsAudioEnabled(true);
      console.log('🔊 Audio force-enabled (host mode)');
    }
  };

  initSpeech();

  return () => {
    // ✅ Inline cleanup to avoid dependency
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
  };
}, [forceEnable]); // ✅ Remove stopAllAudio dependency
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

  // Process audio queue - MUST BE DEFINED BEFORE addToQueue
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

        // Choose voice based on content type
        let chosenVoice = null;

        if (item.id === 'game-over') {
          chosenVoice = maleVoice.current || fallbackVoice.current;
          console.log('👨 Using male voice for Game Over');
        } else {
          chosenVoice = femaleVoice.current || fallbackVoice.current;
          console.log('👩 Using female voice for:', item.id);
        }

        if (chosenVoice) {
          utterance.voice = chosenVoice;
        }
        
        utterance.rate = forceEnable ? 0.9 : 0.85;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        currentUtterance.current = utterance;

        const handleComplete = () => {
          console.log(`✅ Completed: ${item.text}`);
          
          if (fallbackTimer.current) {
            clearTimeout(fallbackTimer.current);
            fallbackTimer.current = null;
          }
          
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
          }
          
          currentUtterance.current = null;
          
          if (item.callback) {
            try {
              console.log(`🔊 Audio completed for: ${item.text} - notifying completion only`);
              item.callback();
            } catch (error) {
              console.error('Audio callback error:', error);
            }
          }
          
          setTimeout(processNext, 500);
        };

        utterance.onend = () => {
          console.log(`🔊 Browser reported audio end (ignored)`);
        };
        
        utterance.onerror = (event) => {
          console.warn('Speech error (ignored):', event.error);
        };

        // Dynamic timer based on content type
        let audioPlayTime;
        if (item.id === 'game-over') {
          audioPlayTime = 4000;
        } else if (item.id.startsWith('prize-')) {
          audioPlayTime = 4000
        } else {
          audioPlayTime = 2500;
        }

        console.log(`⏰ Setting ${audioPlayTime/1000}s timer for: ${item.text}`);

        fallbackTimer.current = setTimeout(() => {
          console.log(`⏰ Timer completed after ${audioPlayTime/1000}s: ${item.text}`);
          handleComplete();
        }, audioPlayTime);
        
        window.speechSynthesis.speak(utterance);
        
      } catch (error) {
        console.error('Speech synthesis error:', error);
        
        if (item.callback) {
          try {
            item.callback();
          } catch (callbackError) {
            console.error('Audio callback error:', callbackError);
          }
        }
        
        setTimeout(processNext, 100);
      }
    };

    processNext();
  }, [forceEnable]);
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
      if (item.callback) {
        setTimeout(item.callback, 100);
      }
      return;
    }

    // Handle blocking for prize announcements
    if (item.id.startsWith('prize-')) {
      setIsBlockedForAnnouncement(true);
      
      const originalCallback = item.callback;
      item.callback = () => {
        setIsBlockedForAnnouncement(false);
        if (originalCallback) originalCallback();
      };
    }

    if (item.priority === 'high') {
      audioQueue.current.unshift(item);
    } else {
      audioQueue.current.push(item);
    }

    console.log(`🔊 Queued: ${item.text} (Priority: ${item.priority})`);
    
    if (!isProcessingQueue.current) {
      processQueue();
    }
  }, [isAudioSupported, isAudioEnabled, processQueue]);


// Handle number announcements
useEffect(() => {
  // ✅ SOLUTION 3: Don't announce numbers if blocked by prize announcement
  if (currentNumber && currentNumber !== lastCalledNumber.current && !isBlockedForAnnouncement) {
    lastCalledNumber.current = currentNumber;
    
    const callText = numberCalls[currentNumber] || `Number ${currentNumber}`;
    
    console.log(`📢 Announcing number: ${currentNumber} - will trigger timer continuation`);
    
    addToQueue({
      id: `number-${currentNumber}`,
      text: callText,
      priority: 'high',
      callback: () => {
        console.log(`🔊 Number ${currentNumber} audio completed - triggering next timer`);
        if (onAudioComplete) {
          onAudioComplete();
        }
      }
    });
  }
}, [currentNumber, addToQueue, onAudioComplete, isBlockedForAnnouncement]);

// Handle prize announcements
useEffect(() => {
  prizes.forEach(prize => {
    if (prize.won && !announcedPrizes.current.has(prize.id)) {
      announcedPrizes.current.add(prize.id);
      
      let announcement = `Congratulations! ${prize.name} has been won`;
      
      if (prize.winners && prize.winners.length > 0) {
        if (prize.winners.length === 1) {
          const winner = prize.winners[0];
          announcement += ` by ${winner.name} with ticket ${winner.ticketId}`;
        } else if (prize.winners.length === 2) {
          // For 2 winners, mention both
          const winner1 = prize.winners[0];
          const winner2 = prize.winners[1];
          announcement += ` by ${winner1.name} with ticket ${winner1.ticketId} and ${winner2.name} with ticket ${winner2.ticketId}`;
        } else {
          // For 3+ winners, mention count and first winner as example
          const firstWinner = prize.winners[0];
          announcement += ` by ${prize.winners.length} players including ${firstWinner.name} with ticket ${firstWinner.ticketId}`;
        }
      }
      
      announcement += '! Well done!';
      
      console.log(`🏆 Announcing prize: ${prize.name}`);
      
      addToQueue({
        id: `prize-${prize.id}`,
        text: announcement,
        priority: 'normal',
        // ✅ SOLUTION 2: Add callback to signal completion
        callback: () => {
          if (onPrizeAudioComplete) {
            onPrizeAudioComplete(prize.id);
          }
        }
      });
    }
  });
}, [prizes, addToQueue, onPrizeAudioComplete]);
// Reset announced prizes when game resets
  useEffect(() => {
    const wonPrizes = prizes.filter(p => p.won);
    
    if (wonPrizes.length === 0 && announcedPrizes.current.size > 0) {
      console.log('🔄 Resetting audio state for new game');
      announcedPrizes.current.clear();
      lastCalledNumber.current = null;
      audioQueue.current = [];
      
      // ✅ Inline cleanup to avoid dependency
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
    }
  }, [prizes]); // ✅ Remove stopAllAudio dependency
  // Cleanup on unmount
// Cleanup on unmount
  useEffect(() => {
    return () => {
      // ✅ Inline cleanup to avoid dependency
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
    };
  }, []); // ✅ Remove stopAllAudio dependency

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
