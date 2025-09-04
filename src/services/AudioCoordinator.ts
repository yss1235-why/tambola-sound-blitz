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
      // Check if game is still active
      if (!this.isGameStateValid()) {
        console.log('🛑 Game state invalid, clearing audio queue');
        this.clearQueue();
        break;
      }

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
        1: "Kelly's Eyes, number one",
        2: "One little duck, number two",
        11: "Legs eleven",
        22: "Two little ducks, twenty-two",
        88: "Two fat ladies, eighty-eight",
        90: "Top of the shop, ninety"
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
        'corner': 'Four Corners'
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
    return this.gameStateRef?.current?.isActive && !this.gameStateRef?.current?.gameOver;
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
