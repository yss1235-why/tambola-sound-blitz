
import React, { useEffect, useRef } from 'react';
import { Prize } from './TambolaGame';

interface AudioManagerProps {
  currentNumber: number | null;
  prizes: Prize[];
}

// Traditional Tambola number calls
const numberCalls: { [key: number]: string } = {
  1: "Kelly's Eyes! Number 1",
  2: "One Little Duck! Number 2",
  3: "Cup of Tea! Number 3",
  4: "Knock at the Door! Number 4",
  5: "Man Alive! Number 5",
  6: "Half a Dozen! Number 6",
  7: "Lucky Seven! Number 7",
  8: "One Fat Lady! Number 8",
  9: "Doctor's Orders! Number 9",
  10: "Uncle Ben! Number 10",
  11: "Legs Eleven! Number 11",
  12: "One Dozen! Number 12",
  13: "Unlucky for Some! Number 13",
  14: "Valentine's Day! Number 14",
  15: "Young and Keen! Number 15",
  16: "Sweet Sixteen! Number 16",
  17: "Dancing Queen! Number 17",
  18: "Now You Can Vote! Number 18",
  19: "Goodbye Teens! Number 19",
  20: "One Score! Number 20",
  21: "Key of the Door! Number 21",
  22: "Two Little Ducks! Number 22",
  23: "Thee and Me! Number 23",
  24: "Two Dozen! Number 24",
  25: "Quarter Century! Number 25",
  26: "Pick and Mix! Number 26",
  27: "Duck and a Crutch! Number 27",
  28: "Overweight! Number 28",
  29: "Rise and Shine! Number 29",
  30: "Dirty Thirty! Number 30",
  31: "Get Up and Run! Number 31",
  32: "Buckle My Shoe! Number 32",
  33: "All the Threes! Number 33",
  34: "Ask for More! Number 34",
  35: "Jump and Jive! Number 35",
  36: "Three Dozen! Number 36",
  37: "A Flea in Heaven! Number 37",
  38: "Christmas Cake! Number 38",
  39: "Steps and Climb! Number 39",
  40: "Life Begins! Number 40",
  41: "Time for Fun! Number 41",
  42: "Winnie the Pooh! Number 42",
  43: "Down on Your Knees! Number 43",
  44: "Droopy Drawers! Number 44",
  45: "Halfway There! Number 45",
  46: "Up to Tricks! Number 46",
  47: "Four and Seven! Number 47",
  48: "Four Dozen! Number 48",
  49: "Rise and Shine! Number 49",
  50: "Half a Century! Number 50",
  51: "Tweak of the Thumb! Number 51",
  52: "Weeks in a Year! Number 52",
  53: "Here Comes Herbie! Number 53",
  54: "Clean the Floor! Number 54",
  55: "Snakes Alive! Number 55",
  56: "Was She Worth It? Number 56",
  57: "Heinz Varieties! Number 57",
  58: "Make Them Wait! Number 58",
  59: "Brighton Line! Number 59",
  60: "Five Dozen! Number 60",
  61: "Baker's Bun! Number 61",
  62: "Turn on the Screw! Number 62",
  63: "Tickle Me! Number 63",
  64: "Red Raw! Number 64",
  65: "Old Age Pension! Number 65",
  66: "Clickety Click! Number 66",
  67: "Stairway to Heaven! Number 67",
  68: "Saving Grace! Number 68",
  69: "Either Way Up! Number 69",
  70: "Three Score and Ten! Number 70",
  71: "Bang on the Drum! Number 71",
  72: "Six Dozen! Number 72",
  73: "Queen Bee! Number 73",
  74: "Candy Store! Number 74",
  75: "Strive and Strive! Number 75",
  76: "Trombones! Number 76",
  77: "Sunset Strip! Number 77",
  78: "Heaven's Gate! Number 78",
  79: "One More Time! Number 79",
  80: "Gandhi's Breakfast! Number 80",
  81: "Stop and Run! Number 81",
  82: "Fat Lady Sings! Number 82",
  83: "Time for Tea! Number 83",
  84: "Seven Dozen! Number 84",
  85: "Staying Alive! Number 85",
  86: "Between the Sticks! Number 86",
  87: "Torquay in Devon! Number 87",
  88: "Two Fat Ladies! Number 88",
  89: "Nearly There! Number 89",
  90: "Top of the Shop! Number 90"
};

export const AudioManager: React.FC<AudioManagerProps> = ({ currentNumber, prizes }) => {
  const lastCalledNumber = useRef<number | null>(null);
  const lastPrizeCount = useRef<number>(0);

  // Text-to-speech functionality
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.8;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;
      speechSynthesis.speak(utterance);
    }
  };

  // Handle number calling
  useEffect(() => {
    if (currentNumber && currentNumber !== lastCalledNumber.current) {
      const callText = numberCalls[currentNumber] || `Number ${currentNumber}`;
      speak(callText);
      lastCalledNumber.current = currentNumber;
      console.log(`🔊 Called: ${callText}`);
    }
  }, [currentNumber]);

  // Handle prize announcements
  useEffect(() => {
    const currentPrizeCount = prizes.filter(p => p.won).length;
    if (currentPrizeCount > lastPrizeCount.current) {
      const newlyWonPrizes = prizes.filter(p => p.won).slice(-1);
      newlyWonPrizes.forEach(prize => {
        const announcement = `${prize.name} correct and gone!`;
        setTimeout(() => speak(announcement), 1000);
        console.log(`🏆 Prize Won: ${announcement}`);
      });
      lastPrizeCount.current = currentPrizeCount;
    }
  }, [prizes]);

  return null; // This component doesn't render anything
};
