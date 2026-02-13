// src/services/AudioCoordinator.ts
// Simplified audio coordinator using pre-recorded Opus files
import { preRecordedAudioService } from './PreRecordedAudioService';

interface AudioTask {
  id: string;
  type: 'number' | 'prize' | 'gameOver' | 'congratulations' | 'gameWillBegin';
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
  private processingMutex = false;

  constructor() {
    // Preload audio files for faster playback
    preRecordedAudioService.preload();
  }

  setGameStateRef(ref: GameStateRef): void {
    this.gameStateRef = ref;
  }

  queueAudio(task: Omit<AudioTask, 'id'>): string {
    const taskId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const fullTask: AudioTask = {
      ...task,
      id: taskId,
      timeout: task.timeout ?? 10000
    };

    // Insert based on priority (higher number = higher priority)
    const insertIndex = this.audioQueue.findIndex(t => t.priority < fullTask.priority);
    if (insertIndex === -1) {
      this.audioQueue.push(fullTask);
    } else {
      this.audioQueue.splice(insertIndex, 0, fullTask);
    }

    this.processQueue();
    return taskId;
  }

  private async processQueue(): Promise<void> {
    if (this.processingMutex || this.isProcessing || this.audioQueue.length === 0) {
      return;
    }

    this.processingMutex = true;
    this.isProcessing = true;

    try {
      while (this.audioQueue.length > 0) {
        const task = this.audioQueue.shift()!;
        this.currentTask = task;

        try {

          let timeoutId: NodeJS.Timeout;
          const timeoutPromise = new Promise<void>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Audio timeout')), task.timeout);
          });

          try {
            await Promise.race([
              task.execute(),
              timeoutPromise
            ]);
          } finally {
            clearTimeout(timeoutId!);
          }
          task.onComplete?.();

        } catch (error) {
          task.onError?.(error as Error);
        } finally {
          this.currentTask = null;
        }

        // Wait between tasks to prevent conflicts
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      this.isProcessing = false;
      this.processingMutex = false;
    }
  }

  /**
   * Set the speech rate for audio playback
   */
  setSpeechRate(rate: number): void {
    preRecordedAudioService.setPlaybackRate(rate);
  }

  playNumberAudio(number: number, onComplete?: () => void, speechRate: number = 0.9): Promise<string> {
    // Set the playback rate before queueing
    this.setSpeechRate(speechRate);
    return new Promise((resolve, reject) => {
      const taskId = this.queueAudio({
        type: 'number',
        data: { number },
        priority: 100,
        execute: () => preRecordedAudioService.playNumber(number),
        onComplete: () => {
          onComplete?.();
          resolve(taskId);
        },
        onError: (error) => {
          reject(error);
        },
        timeout: 8000
      });
    });
  }

  playPrizeAudio(prizeId: string, ticketNumber: number, onComplete?: () => void, speechRate: number = 0.8): Promise<string> {
    this.setSpeechRate(speechRate);
    return new Promise((resolve, reject) => {
      const taskId = this.queueAudio({
        type: 'prize',
        data: { prizeId, ticketNumber },
        priority: 150,
        execute: () => preRecordedAudioService.playWinnerAnnouncement(prizeId, ticketNumber),
        onComplete: () => {
          onComplete?.();
          resolve(taskId);
        },
        onError: (error) => {
          reject(error);
        },
        timeout: 15000  // Increased timeout for 3-part announcement
      });
    });
  }

  playGameOverAudio(onComplete?: () => void, speechRate: number = 0.8): Promise<string> {
    this.setSpeechRate(speechRate);
    return new Promise((resolve, reject) => {
      const taskId = this.queueAudio({
        type: 'gameOver',
        data: {},
        priority: 200,
        execute: () => preRecordedAudioService.playGameOver(),
        onComplete: () => {
          onComplete?.();
          resolve(taskId);
        },
        onError: (error) => {
          reject(error);
        },
        timeout: 5000
      });
    });
  }

  playCongratulationsAudio(onComplete?: () => void, speechRate: number = 0.8): Promise<string> {
    this.setSpeechRate(speechRate);
    return new Promise((resolve, reject) => {
      const taskId = this.queueAudio({
        type: 'congratulations',
        data: {},
        priority: 190,
        execute: () => preRecordedAudioService.playCongratulations(),
        onComplete: () => {
          onComplete?.();
          resolve(taskId);
        },
        onError: (error) => {
          reject(error);
        },
        timeout: 10000
      });
    });
  }

  playGameWillBeginAudio(onComplete?: () => void, speechRate: number = 0.8): Promise<string> {
    this.setSpeechRate(speechRate);
    return new Promise((resolve, reject) => {
      const taskId = this.queueAudio({
        type: 'gameWillBegin',
        data: {},
        priority: 50,
        execute: () => preRecordedAudioService.playGameWillBegin(),
        onComplete: () => {
          onComplete?.();
          resolve(taskId);
        },
        onError: (error) => {
          reject(error);
        },
        timeout: 10000
      });
    });
  }

  clearQueue(): void {
    this.audioQueue = [];

    if (this.currentTask) {
      preRecordedAudioService.stop();
      this.currentTask = null;
    }

    this.activeAudio.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    this.activeAudio.clear();
  }

  stopAllAudio(): void {
    this.clearQueue();
    preRecordedAudioService.stop();
    this.isProcessing = false;
  }

  getCurrentTask(): AudioTask | null {
    return this.currentTask;
  }

  getQueueLength(): number {
    return this.audioQueue.length;
  }

  isPlaying(): boolean {
    return this.isProcessing || preRecordedAudioService.isPlaying();
  }

  cleanup(): void {
    this.stopAllAudio();
    this.completionCallbacks.clear();
    this.gameStateRef = null;
    preRecordedAudioService.clearCache();
  }
}

// Singleton instance
export const audioCoordinator = new AudioCoordinator();
