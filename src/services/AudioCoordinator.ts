// src/services/AudioCoordinator.ts
interface AudioTask {
  id: string;
  type: 'number' | 'prize' | 'gameOver';
  data: any;
  priority: number;
  execute: () => Promise<void>;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
}

interface GameStateRef {
  current?: {
    isActive: boolean;
    gameOver: boolean;
  } | null;
}

export class AudioCoordinator {
  private audioQueue: AudioTask[] = [];
  private isProcessing = false;
  private currentTask: AudioTask | null = null;
  private gameStateRef: GameStateRef | null = null;
  private activeAudio = new Map<string, HTMLAudioElement>();
  private completionCallbacks = new Map<string, () => void>();

  constructor() {
    console.log('🔊 AudioCoordinator initialized');
  }

  setGameStateRef(ref: GameStateRef): void {
    this.gameStateRef = ref;
  }

  queueAudio(task: Omit<AudioTask, 'id'>): string {
    const taskId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const fullTask: AudioTask = {
      ...task,
      id: taskId,
      timeout: task.timeout ?? 10000 // 10 second default timeout
    };

    // Insert based on priority (higher number = higher priority)
    const insertIndex = this.audioQueue.findIndex(t => t.priority < fullTask.priority);
    if (insertIndex === -1) {
      this.audioQueue.push(fullTask);
    } else {
      this.audioQueue.splice(insertIndex, 0, fullTask);
    }

    console.log(`🎵 Queued audio task: ${taskId} (type: ${task.type}, priority: ${task.priority})`);
    
    this.processQueue();
    return taskId;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.audioQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.audioQueue.length > 0) {
      // Skip game state validation temporarily
console.log('🔊 Continuing audio processing without state validation');

      const task = this.audioQueue.shift()!;
      this.currentTask = task;

      try {
        console.log(`🔊 Processing audio task: ${task.id} (${task.type})`);
        
        // Set up timeout
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Audio timeout')), task.timeout);
        });

        // Execute task with timeout
        await Promise.race([
          task.execute(),
          timeoutPromise
        ]);

        console.log(`✅ Audio task completed: ${task.id}`);
        task.onComplete?.();
        
      } catch (error) {
        console.error(`❌ Audio task failed: ${task.id}`, error);
        task.onError?.(error as Error);
      } finally {
        this.currentTask = null;
      }

      // Wait between tasks to prevent conflicts
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  playNumberAudio(number: number, onComplete?: () => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const taskId = this.queueAudio({
        type: 'number',
        data: { number },
        priority: 100, // High priority for numbers
        execute: () => this.executeNumberAudio(number),
        onComplete: () => {
          onComplete?.();
          resolve(taskId);
        },
        onError: (error) => {
          reject(error);
        },
        timeout: 8000 // 8 seconds for number audio
      });
    });
  }

  playPrizeAudio(prizeId: string, playerName: string, onComplete?: () => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const taskId = this.queueAudio({
        type: 'prize',
        data: { prizeId, playerName },
        priority: 150, // Higher priority than numbers
        execute: () => this.executePrizeAudio(prizeId, playerName),
        onComplete: () => {
          onComplete?.();
          resolve(taskId);
        },
        onError: (error) => {
          reject(error);
        },
        timeout: 10000 // 10 seconds for prize announcements
      });
    });
  }

  playGameOverAudio(onComplete?: () => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const taskId = this.queueAudio({
        type: 'gameOver',
        data: {},
        priority: 200, // Highest priority
        execute: () => this.executeGameOverAudio(),
        onComplete: () => {
          onComplete?.();
          resolve(taskId);
        },
        onError: (error) => {
          reject(error);
        },
        timeout: 5000 // 5 seconds for game over
      });
    });
  }

  private async executeNumberAudio(number: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      const traditionalCalls: { [key: number]: string } = {
        1: "Kelly's Eye, number one",
  2: "One little duck, number two",
  3: "Cup of tea, number three",
  4: "Knock at the door, number four",
  5: "Man alive, number five",
  6: "Tom Mix, number six",
  7: "Lucky seven, number seven",
  8: "Garden gate, number eight",
  9: "Doctor's orders, number nine",
  10: "Cock and hen, number ten",
  11: "Legs eleven, number eleven",
  12: "One dozen, number twelve",
  13: "Unlucky for some, number thirteen",
  14: "Valentine's Day, number fourteen",
  15: "Young and keen, number fifteen",
  16: "Sweet sixteen, number sixteen",
  17: "Dancing queen, number seventeen",
  18: "Coming of age, number eighteen",
  19: "Goodbye teens, number nineteen",
  20: "One score, number twenty",
  21: "Royal salute, number twenty-one",
  22: "Two little ducks, number twenty-two",
  23: "Thee and me, number twenty-three",
  24: "Two dozen, number twenty-four",
  25: "Duck and dive, number twenty-five",
  26: "Pick and mix, number twenty-six",
  27: "Duck and a crutch, number twenty-seven",
  28: "In a state, number twenty-eight",
  29: "Rise and shine, number twenty-nine",
  30: "Dirty Gertie, number thirty",
  31: "Get up and run, number thirty-one",
  32: "Buckle my shoe, number thirty-two",
  33: "Dirty knee, number thirty-three",
  34: "Ask for more, number thirty-four",
  35: "Jump and jive, number thirty-five",
  36: "Three dozen, number thirty-six",
  37: "More than eleven, number thirty-seven",
  38: "Christmas cake, number thirty-eight",
  39: "Steps to heaven, number thirty-nine",
  40: "Life begins, number forty",
  41: "Time for fun, number forty-one",
  42: "Winnie the Pooh, number forty-two",
  43: "Down on your knee, number forty-three",
  44: "Droopy drawers, number forty-four",
  45: "Halfway there, number forty-five",
  46: "Up to tricks, number forty-six",
  47: "Four and seven, number forty-seven",
  48: "Four dozen, number forty-eight",
  49: "PC Forty-nine, number forty-nine",
  50: "Half a century, number fifty",
  51: "Tweak of the thumb, number fifty-one",
  52: "Danny La Rue, number fifty-two",
  53: "Stuck in the tree, number fifty-three",
  54: "Clean the floor, number fifty-four",
  55: "Snakes alive, number fifty-five",
  56: "Was she worth it, number fifty-six",
  57: "Heinz varieties, number fifty-seven",
  58: "Make them wait, number fifty-eight",
  59: "Brighton line, number fifty-nine",
  60: "Five dozen, number sixty",
  61: "Baker's bun, number sixty-one",
  62: "Tickety-boo, number sixty-two",
  63: "Tickle me, number sixty-three",
  64: "Red raw, number sixty-four",
  65: "Old age pension, number sixty-five",
  66: "Clickety click, number sixty-six",
  67: "Made in heaven, number sixty-seven",
  68: "Saving grace, number sixty-eight",
  69: "Either way up, number sixty-nine",
  70: "Three score and ten, number seventy",
  71: "Bang on the drum, number seventy-one",
  72: "Six dozen, number seventy-two",
  73: "Queen bee, number seventy-three",
  74: "Candy store, number seventy-four",
  75: "Strive and strive, number seventy-five",
  76: "Trombones, number seventy-six",
  77: "Sunset strip, number seventy-seven",
  78: "Heaven's gate, number seventy-eight",
  79: "One more time, number seventy-nine",
  80: "Eight and blank, number eighty",
  81: "Stop and run, number eighty-one",
  82: "Straight on through, number eighty-two",
  83: "Time for tea, number eighty-three",
  84: "Seven dozen, number eighty-four",
  85: "Staying alive, number eighty-five",
  86: "Between the sticks, number eighty-six",
  87: "Torquay in Devon, number eighty-seven",
  88: "Two fat ladies, number eighty-eight",
  89: "Nearly there, number eighty-nine",
  90: "Top of the shop, number ninety"
      };

      const text = traditionalCalls[number] || `Number ${number}`;
      const utterance = new SpeechSynthesisUtterance(text);
      
      utterance.rate = 0.9;
      utterance.volume = 1.0;
      
      let completed = false;
      const cleanup = () => {
        if (!completed) {
          completed = true;
          window.speechSynthesis.cancel();
        }
      };

      utterance.onend = () => {
        if (!completed) {
          completed = true;
          resolve();
        }
      };

      utterance.onerror = (error) => {
        cleanup();
        reject(new Error(`Speech error: ${error.error}`));
      };

      // Fallback timeout
      setTimeout(() => {
        if (!completed) {
          cleanup();
          resolve(); // Don't reject on timeout, just continue
        }
      }, 7000);

      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  private async executePrizeAudio(prizeId: string, playerName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

     const prizeNames: { [key: string]: string } = {
  'earlyFive': 'Early Five',
  'topLine': 'Top Line',
  'middleLine': 'Middle Line',
  'bottomLine': 'Bottom Line',
  'fullHouse': 'Full House',
  'secondFullHouse': 'Second Full House',
  'corners': 'Four Corners',
  'starCorner': 'Star Corner',
  'halfSheet': 'Half Sheet',
  'fullSheet': 'Full Sheet',
};

      const prizeName = prizeNames[prizeId] || prizeId;
      const text = `Congratulations! ${prizeName} won by ${playerName}!`;
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.8;
      utterance.volume = 1.0;

      let completed = false;
      const cleanup = () => {
        if (!completed) {
          completed = true;
          window.speechSynthesis.cancel();
        }
      };

      utterance.onend = () => {
        if (!completed) {
          completed = true;
          resolve();
        }
      };

      utterance.onerror = (error) => {
        cleanup();
        reject(new Error(`Prize audio error: ${error.error}`));
      };

      // Fallback timeout
      setTimeout(() => {
        if (!completed) {
          cleanup();
          resolve();
        }
      }, 9000);

      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  private async executeGameOverAudio(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance('Game Over! Thank you for playing!');
      utterance.rate = 0.8;
      utterance.volume = 1.0;

      let completed = false;
      utterance.onend = () => {
        if (!completed) {
          completed = true;
          resolve();
        }
      };

      utterance.onerror = (error) => {
        if (!completed) {
          completed = true;
          reject(new Error(`Game over audio error: ${error.error}`));
        }
      };

      setTimeout(() => {
        if (!completed) {
          completed = true;
          resolve();
        }
      }, 4000);

      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        if (!completed) {
          completed = true;
          reject(error);
        }
      }
    });
  }

private isGameStateValid(): boolean {
  // Temporarily disable strict validation to allow continuous number calling
  console.log('🔍 AudioCoordinator: Bypassing strict game state validation');
  return true;
}

  clearQueue(): void {
    console.log('🧹 Clearing audio queue');
    this.audioQueue = [];
    
    if (this.currentTask) {
      window.speechSynthesis.cancel();
      this.currentTask = null;
    }
    
    this.activeAudio.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    this.activeAudio.clear();
  }

  stopAllAudio(): void {
    console.log('🛑 Stopping all audio');
    this.clearQueue();
    window.speechSynthesis.cancel();
    this.isProcessing = false;
  }

  getCurrentTask(): AudioTask | null {
    return this.currentTask;
  }

  getQueueLength(): number {
    return this.audioQueue.length;
  }

  isPlaying(): boolean {
    return this.isProcessing;
  }

  cleanup(): void {
    console.log('🧹 Cleaning up AudioCoordinator');
    this.stopAllAudio();
    this.completionCallbacks.clear();
    this.gameStateRef = null;
  }
}

// Singleton instance
export const audioCoordinator = new AudioCoordinator();
