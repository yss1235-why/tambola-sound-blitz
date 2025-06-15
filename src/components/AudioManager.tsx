// src/components/AudioManager.tsx - Fixed with reliable completion callback
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Prize } from '@/services/firebase';

interface AudioManagerProps {
  currentNumber: number | null;
  prizes: Prize[];
  onAudioComplete?: () => void;
  forceEnable?: boolean;
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
  
  // Refs
  const lastCalledNumber = useRef<number | null>(null);
  const announcedPrizes = useRef<Set<string>>(new Set());
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const completionTimer = useRef<NodeJS.Timeout | null>(null);
  const selectedVoice = useRef<SpeechSynthesisVoice | null>(null);
  const isSpeaking = useRef<boolean>(false);

  // Initialize speech synthesis
  useEffect(() => {
    const initSpeech = () => {
      if (!('speechSynthesis' in window)) {
        setIsAudioSupported(false);
        return;
      }

      setIsAudioSupported(true);

      // Load voices
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        
        // Find best voice
        const voicePreferences = [
          'Google UK English Female',
          'Google UK English Male', 
          'Microsoft Zira',
          'Microsoft David'
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
      };

      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
      loadVoices();

      // Enable audio if forced
      if (forceEnable) {
        setIsAudioEnabled(true);
      }
    };

    initSpeech();

    // Cleanup
    return () => {
      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [forceEnable]);

  // Enable audio on first interaction
  useEffect(() => {
    if (!isAudioSupported || isAudioEnabled) return;

    const enableAudio = () => {
      setIsAudioEnabled(true);
      document.removeEventListener('click', enableAudio);
    };

    document.addEventListener('click', enableAudio);

    return () => {
      document.removeEventListener('click', enableAudio);
    };
  }, [isAudioSupported, isAudioEnabled]);

  // Speak text with completion callback
  const speak = useCallback((text: string, callback?: () => void) => {
    if (!isAudioSupported || !isAudioEnabled) {
      callback?.();
      return;
    }

    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    // Clear any existing timer
    if (completionTimer.current) {
      clearTimeout(completionTimer.current);
      completionTimer.current = null;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      
      if (selectedVoice.current) {
        utterance.voice = selectedVoice.current;
      }
      
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      currentUtterance.current = utterance;
      isSpeaking.current = true;

      // Handle completion
      const handleComplete = () => {
        isSpeaking.current = false;
        currentUtterance.current = null;
        
        if (completionTimer.current) {
          clearTimeout(completionTimer.current);
          completionTimer.current = null;
        }
        
        callback?.();
      };

      utterance.onend = handleComplete;
      
      utterance.onerror = (event) => {
        console.warn('Speech error:', event.error);
        handleComplete();
      };

      // Fallback timer (estimate based on text length)
      const estimatedDuration = Math.min(text.length * 60 + 1000, 5000);
      completionTimer.current = setTimeout(() => {
        if (isSpeaking.current) {
          handleComplete();
        }
      }, estimatedDuration);

      window.speechSynthesis.speak(utterance);
      
    } catch (error) {
      console.error('Speech synthesis error:', error);
      isSpeaking.current = false;
      callback?.();
    }
  }, [isAudioSupported, isAudioEnabled]);

  // Handle number announcements
  useEffect(() => {
    if (currentNumber && currentNumber !== lastCalledNumber.current) {
      lastCalledNumber.current = currentNumber;
      
      const callText = numberCalls[currentNumber] || `Number ${currentNumber}`;
      
      // Announce number and call completion callback
      speak(callText, () => {
        // Only call onAudioComplete for number announcements
        // Don't call it for prize announcements
        if (onAudioComplete && !isSpeaking.current) {
          onAudioComplete();
        }
      });
    }
  }, [currentNumber, speak, onAudioComplete]);

  // Handle prize announcements
  useEffect(() => {
    prizes.forEach(prize => {
      if (prize.won && !announcedPrizes.current.has(prize.id)) {
        announcedPrizes.current.add(prize.id);
        
        let announcement = `Congratulations! ${prize.name} has been won`;
        
        if (prize.winners && prize.winners.length > 0) {
          if (prize.winners.length === 1) {
            announcement += ` by ${prize.winners[0].name}`;
          } else {
            announcement += ` by ${prize.winners.length} players`;
          }
        }
        
        announcement += '. Well done!';
        
        // Delay prize announcement slightly to not interrupt number call
        setTimeout(() => {
          speak(announcement);
        }, 500);
      }
    });
  }, [prizes, speak]);

  // Reset announced prizes when game resets
  useEffect(() => {
    const wonPrizes = prizes.filter(p => p.won);
    
    if (wonPrizes.length === 0 && announcedPrizes.current.size > 0) {
      announcedPrizes.current.clear();
      lastCalledNumber.current = null;
    }
  }, [prizes]);

  return null;
};
