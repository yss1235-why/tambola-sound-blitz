// src/components/AudioManager.tsx - Cleaned up version
import React, { useEffect, useRef } from 'react';
import { Prize } from './TambolaGame';

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

  // Enhanced text-to-speech functionality
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Try to get a more natural voice
      const voices = speechSynthesis.getVoices();
      const preferredVoices = voices.filter(voice => 
        voice.lang.startsWith('en') && 
        (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('Natural'))
      );
      
      if (preferredVoices.length > 0) {
        utterance.voice = preferredVoices[0];
      } else if (voices.length > 0) {
        // Fallback to first English voice
        const englishVoices = voices.filter(voice => voice.lang.startsWith('en'));
        if (englishVoices.length > 0) {
          utterance.voice = englishVoices[0];
        }
      }
      
      // Optimize speech settings for more natural sound
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      
      speechSynthesis.speak(utterance);
    }
  };

  // Handle number calling
  useEffect(() => {
    if (currentNumber && currentNumber !== lastCalledNumber.current) {
      const callText = numberCalls[currentNumber] || `Number ${currentNumber}!`;
      
      // Add a slight delay to make it feel more natural
      setTimeout(() => {
        speak(callText);
      }, 300);
      
      lastCalledNumber.current = currentNumber;
    }
  }, [currentNumber]);

  // Handle prize announcements - only announce each prize once
  useEffect(() => {
    prizes.forEach(prize => {
      // Only announce if prize is won AND hasn't been announced before
      if (prize.won && !announcedPrizes.current.has(prize.id)) {
        const announcement = `Congratulations! ${prize.name} has been won!`;
        
        setTimeout(() => {
          speak(announcement);
        }, 1500);
        
        // Mark this prize as announced
        announcedPrizes.current.add(prize.id);
      }
    });
  }, [prizes]);

  // Clear announced prizes when game resets (all prizes become unwon)
  useEffect(() => {
    const wonPrizes = prizes.filter(p => p.won);
    
    // If no prizes are won, reset the announced prizes (game was reset)
    if (wonPrizes.length === 0 && announcedPrizes.current.size > 0) {
      announcedPrizes.current.clear();
    }
  }, [prizes]);

  // Load voices when component mounts
  useEffect(() => {
    const loadVoices = () => {
      speechSynthesis.getVoices();
    };
    
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    loadVoices();
  }, []);

  return null; // This component doesn't render anything
};
