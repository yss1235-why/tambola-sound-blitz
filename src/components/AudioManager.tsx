// src/components/AudioManager.tsx - Fixed Speech Synthesis
import React, { useEffect, useRef, useState } from 'react';
import { Prize } from '@/services/firebase';

interface AudioManagerProps {
  currentNumber: number | null;
  prizes: Prize[];
}

// Traditional Tambola number calls
const numberCalls: { [key: number]: string } = {
  1: "Kelly's Eyes, number one!",
  2: "One little duck, number two!",
  3: "Cup of tea, number three!",
  4: "Knock at the door, number four!",
  5: "Man alive, number five!",
  6: "Half a dozen, number six!",
  7: "Lucky seven!",
  8: "One fat lady, number eight!",
  9: "Doctor's orders, number nine!",
  10: "Uncle Ben, number ten!",
  11: "Legs eleven!",
  12: "One dozen, number twelve!",
  13: "Unlucky for some, thirteen!",
  14: "Valentine's day, fourteen!",
  15: "Young and keen, fifteen!",
  16: "Sweet sixteen!",
  17: "Dancing queen, seventeen!",
  18: "Now you can vote, eighteen!",
  19: "Goodbye teens, nineteen!",
  20: "One score, twenty!",
  21: "Key of the door, twenty-one!",
  22: "Two little ducks, twenty-two!",
  23: "Thee and me, twenty-three!",
  24: "Two dozen, twenty-four!",
  25: "Quarter century, twenty-five!",
  26: "Pick and mix, twenty-six!",
  27: "Duck and a crutch, twenty-seven!",
  28: "Overweight, twenty-eight!",
  29: "Rise and shine, twenty-nine!",
  30: "Dirty thirty!",
  31: "Get up and run, thirty-one!",
  32: "Buckle my shoe, thirty-two!",
  33: "All the threes, thirty-three!",
  34: "Ask for more, thirty-four!",
  35: "Jump and jive, thirty-five!",
  36: "Three dozen, thirty-six!",
  37: "A flea in heaven, thirty-seven!",
  38: "Christmas cake, thirty-eight!",
  39: "Steps and climb, thirty-nine!",
  40: "Life begins at forty!",
  41: "Time for fun, forty-one!",
  42: "Winnie the Pooh, forty-two!",
  43: "Down on your knees, forty-three!",
  44: "Droopy drawers, forty-four!",
  45: "Halfway there, forty-five!",
  46: "Up to tricks, forty-six!",
  47: "Four and seven, forty-seven!",
  48: "Four dozen, forty-eight!",
  49: "Rise and shine, forty-nine!",
  50: "Half a century, fifty!",
  51: "Tweak of the thumb, fifty-one!",
  52: "Weeks in a year, fifty-two!",
  53: "Here comes Herbie, fifty-three!",
  54: "Clean the floor, fifty-four!",
  55: "Snakes alive, fifty-five!",
  56: "Was she worth it? Fifty-six!",
  57: "Heinz varieties, fifty-seven!",
  58: "Make them wait, fifty-eight!",
  59: "Brighton line, fifty-nine!",
  60: "Five dozen, sixty!",
  61: "Baker's bun, sixty-one!",
  62: "Turn on the screw, sixty-two!",
  63: "Tickle me, sixty-three!",
  64: "Red raw, sixty-four!",
  65: "Old age pension, sixty-five!",
  66: "Clickety click, sixty-six!",
  67: "Stairway to heaven, sixty-seven!",
  68: "Saving grace, sixty-eight!",
  69: "Either way up, sixty-nine!",
  70: "Three score and ten, seventy!",
  71: "Bang on the drum, seventy-one!",
  72: "Six dozen, seventy-two!",
  73: "Queen bee, seventy-three!",
  74: "Candy store, seventy-four!",
  75: "Strive and strive, seventy-five!",
  76: "Trombones, seventy-six!",
  77: "Sunset strip, seventy-seven!",
  78: "Heaven's gate, seventy-eight!",
  79: "One more time, seventy-nine!",
  80: "Gandhi's breakfast, eighty!",
  81: "Stop and run, eighty-one!",
  82: "Fat lady sings, eighty-two!",
  83: "Time for tea, eighty-three!",
  84: "Seven dozen, eighty-four!",
  85: "Staying alive, eighty-five!",
  86: "Between the sticks, eighty-six!",
  87: "Torquay in Devon, eighty-seven!",
  88: "Two fat ladies, eighty-eight!",
  89: "Nearly there, eighty-nine!",
  90: "Top of the shop, ninety!"
};

export const AudioManager: React.FC<AudioManagerProps> = ({ currentNumber, prizes }) => {
  const lastCalledNumber = useRef<number | null>(null);
  const announcedPrizes = useRef<Set<string>>(new Set());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceQueue = useRef<string[]>([]);
  const isProcessingQueue = useRef(false);

  // Initialize speech synthesis and ensure voices are loaded
  useEffect(() => {
    const initSpeech = () => {
      if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        // Force voice list to load
        const loadVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          console.log(`Loaded ${voices.length} voices`);
        };

        // Some browsers need this event to populate voices
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
        }
        
        // Initial load attempt
        loadVoices();
      }
    };

    initSpeech();
    
    // Cleanup on unmount
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Process speech queue
  const processQueue = useCallback(() => {
    if (isProcessingQueue.current || utteranceQueue.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;
    const text = utteranceQueue.current.shift()!;

    speak(text).finally(() => {
      isProcessingQueue.current = false;
      // Process next item in queue
      if (utteranceQueue.current.length > 0) {
        setTimeout(() => processQueue(), 500); // Small delay between announcements
      }
    });
  }, []);

  // Add text to speech queue
  const queueSpeech = useCallback((text: string) => {
    utteranceQueue.current.push(text);
    processQueue();
  }, [processQueue]);

  // Enhanced text-to-speech functionality
  const speak = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        console.warn('Speech synthesis not supported');
        resolve();
        return;
      }

      try {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        setIsSpeaking(true);
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Get available voices
        const voices = window.speechSynthesis.getVoices();
        
        // Try to find the best voice
        let selectedVoice = null;
        
        // First priority: Google UK English Female
        selectedVoice = voices.find(voice => 
          voice.name.includes('Google UK English Female') ||
          (voice.lang === 'en-GB' && voice.name.includes('Female'))
        );
        
        // Second priority: Any UK English voice
        if (!selectedVoice) {
          selectedVoice = voices.find(voice => voice.lang === 'en-GB');
        }
        
        // Third priority: Google US English
        if (!selectedVoice) {
          selectedVoice = voices.find(voice => 
            voice.name.includes('Google') && voice.lang.startsWith('en')
          );
        }
        
        // Fourth priority: Any English voice
        if (!selectedVoice && voices.length > 0) {
          selectedVoice = voices.find(voice => voice.lang.startsWith('en'));
        }
        
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          console.log('Using voice:', selectedVoice.name);
        }
        
        // Optimize speech settings
        utterance.rate = 0.85; // Slightly slower for clarity
        utterance.pitch = 1.1; // Slightly higher pitch
        utterance.volume = 1.0; // Full volume
        
        // Event handlers
        utterance.onend = () => {
          setIsSpeaking(false);
          resolve();
        };
        
        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event);
          setIsSpeaking(false);
          resolve();
        };
        
        // Speak
        window.speechSynthesis.speak(utterance);
        
        // Fallback timeout
        setTimeout(() => {
          if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            resolve();
          }
        }, 10000); // 10 second timeout
        
      } catch (error) {
        console.error('Speech synthesis error:', error);
        setIsSpeaking(false);
        resolve();
      }
    });
  };

  // Handle number calling
  useEffect(() => {
    if (currentNumber && currentNumber !== lastCalledNumber.current) {
      const callText = numberCalls[currentNumber] || `Number ${currentNumber}!`;
      
      // Queue the number call
      queueSpeech(callText);
      
      lastCalledNumber.current = currentNumber;
    }
  }, [currentNumber, queueSpeech]);

  // Handle prize announcements
  useEffect(() => {
    prizes.forEach(prize => {
      // Only announce if prize is won AND hasn't been announced before
      if (prize.won && !announcedPrizes.current.has(prize.id)) {
        let announcement = `Congratulations! ${prize.name} has been won`;
        
        if (prize.winners && prize.winners.length > 0) {
          if (prize.winners.length === 1) {
            announcement += ` by ${prize.winners[0].name}`;
          } else {
            announcement += ` by ${prize.winners.length} players`;
          }
        }
        
        announcement += '!';
        
        // Queue the prize announcement
        setTimeout(() => {
          queueSpeech(announcement);
        }, 2000); // Delay to not overlap with number call
        
        // Mark this prize as announced
        announcedPrizes.current.add(prize.id);
      }
    });
  }, [prizes, queueSpeech]);

  // Clear announced prizes when game resets
  useEffect(() => {
    const wonPrizes = prizes.filter(p => p.won);
    
    // If no prizes are won, reset the announced prizes
    if (wonPrizes.length === 0 && announcedPrizes.current.size > 0) {
      announcedPrizes.current.clear();
      lastCalledNumber.current = null;
    }
  }, [prizes]);

  // Visual indicator for speaking (optional - can be removed if not needed)
  if (isSpeaking) {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 z-50">
        <div className="animate-pulse">🔊</div>
        <span className="text-sm">Speaking...</span>
      </div>
    );
  }

  return null;
};
