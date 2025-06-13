// src/components/AudioManager.tsx - Enhanced with human-like speech
import React, { useEffect, useRef, useState, useCallback } from 'react';
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
      // Process next item in queue with a natural pause
      if (utteranceQueue.current.length > 0) {
        setTimeout(() => processQueue(), 800); // Natural pause between announcements
      }
    });
  }, []);

  // Add text to speech queue
  const queueSpeech = useCallback((text: string) => {
    utteranceQueue.current.push(text);
    processQueue();
  }, [processQueue]);

  // Enhanced text-to-speech functionality for more human-like speech
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
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Get available voices
        const voices = window.speechSynthesis.getVoices();
        
        // Try to find the best voice for human-like speech
        let selectedVoice = null;
        
        // Priority order for natural sounding voices
        const voicePreferences = [
          // Premium voices (often sound more natural)
          { name: 'Google UK English Female', lang: 'en-GB' },
          { name: 'Google UK English Male', lang: 'en-GB' },
          { name: 'Microsoft Zira - English (United States)', lang: 'en-US' },
          { name: 'Microsoft David - English (United States)', lang: 'en-US' },
          { name: 'Samantha', lang: 'en-US' }, // macOS
          { name: 'Alex', lang: 'en-US' }, // macOS
          { name: 'Victoria', lang: 'en-US' }, // macOS
          { name: 'Karen', lang: 'en-AU' }, // macOS Australian
        ];

        // Try to find preferred voice
        for (const pref of voicePreferences) {
          selectedVoice = voices.find(voice => 
            voice.name.includes(pref.name) || 
            (voice.name.toLowerCase().includes(pref.name.toLowerCase()) && voice.lang === pref.lang)
          );
          if (selectedVoice) break;
        }

        // Fallback to any natural-sounding English voice
        if (!selectedVoice) {
          selectedVoice = voices.find(voice => 
            voice.lang.startsWith('en') && 
            !voice.name.toLowerCase().includes('compact') && // Avoid compact voices
            !voice.name.toLowerCase().includes('siri') // Avoid Siri voices
          );
        }

        // Final fallback to any English voice
        if (!selectedVoice && voices.length > 0) {
          selectedVoice = voices.find(voice => voice.lang.startsWith('en'));
        }
        
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          console.log('Using voice:', selectedVoice.name);
        }
        
        // Optimize speech settings for more natural sound
        utterance.rate = 0.9; // Slightly slower for clarity and naturalness
        utterance.pitch = 1.0; // Natural pitch
        utterance.volume = 1.0; // Full volume
        
        // Add emphasis and pauses for more natural speech
        // Replace exclamation marks with periods for less robotic emphasis
        const naturalText = text
          .replace(/!+/g, '.') // Soften exclamations
          .replace(/,/g, ', ') // Add slight pauses after commas
          .replace(/\. /g, '.. '); // Add longer pauses after periods
        
        utterance.text = naturalText;
        
        // Event handlers
        utterance.onend = () => {
          resolve();
        };
        
        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event);
          resolve();
        };
        
        // Speak
        window.speechSynthesis.speak(utterance);
        
        // Fallback timeout
        setTimeout(() => {
          window.speechSynthesis.cancel();
          resolve();
        }, 15000); // 15 second timeout
        
      } catch (error) {
        console.error('Speech synthesis error:', error);
        resolve();
      }
    });
  };

  // Handle number calling with natural variations
  useEffect(() => {
    if (currentNumber && currentNumber !== lastCalledNumber.current) {
      // Add slight variations to make it sound more natural
      const variations = [
        numberCalls[currentNumber] || `Number ${currentNumber}`,
        numberCalls[currentNumber] || `And the number is... ${currentNumber}`,
        numberCalls[currentNumber] || `Next up, number ${currentNumber}`,
      ];
      
      // Pick a random variation occasionally for variety
      const useVariation = Math.random() > 0.7; // 30% chance of variation
      const callText = useVariation && !numberCalls[currentNumber] 
        ? variations[Math.floor(Math.random() * variations.length)]
        : (numberCalls[currentNumber] || `Number ${currentNumber}`);
      
      // Queue the number call
      queueSpeech(callText);
      
      lastCalledNumber.current = currentNumber;
    }
  }, [currentNumber, queueSpeech]);

  // Handle prize announcements with more natural language
  useEffect(() => {
    prizes.forEach(prize => {
      // Only announce if prize is won AND hasn't been announced before
      if (prize.won && !announcedPrizes.current.has(prize.id)) {
        let announcement = '';
        
        // Create more natural, varied announcements
        const excitementLevel = Math.random();
        
        if (excitementLevel < 0.33) {
          announcement = `Great news everyone. ${prize.name} has been won`;
        } else if (excitementLevel < 0.66) {
          announcement = `We have a winner. ${prize.name} is complete`;
        } else {
          announcement = `Congratulations. ${prize.name} has been claimed`;
        }
        
        if (prize.winners && prize.winners.length > 0) {
          if (prize.winners.length === 1) {
            announcement += ` by ${prize.winners[0].name}`;
          } else {
            announcement += ` by ${prize.winners.length} lucky players`;
          }
        }
        
        announcement += '. Well done.';
        
        // Queue the prize announcement with a delay
        setTimeout(() => {
          queueSpeech(announcement);
        }, 2500); // Slightly longer delay for natural flow
        
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

  // No visual indicator - removed the speaking toast
  return null;
};
