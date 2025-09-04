// src/services/GameTimerManager.ts
interface TimerCallback {
  callback: () => void;
  interval: number;
  lastRun: number;
  enabled: boolean;
}

interface GameStateRef {
  current?: {
    isActive: boolean;
    gameOver: boolean;
    isCountdown: boolean;
  } | null;
}

export class GameTimerManager {
  private timers = new Map<string, TimerCallback>();
  private masterInterval: NodeJS.Timeout | null = null;
  private gameStateRef: GameStateRef | null = null;
  private isDestroyed = false;

  constructor() {
    console.log('🎮 GameTimerManager initialized');
  }

  register(timerId: string, callback: () => void, interval: number = 1000): () => void {
    if (this.isDestroyed) {
      console.warn('⚠️ Cannot register timer on destroyed manager');
      return () => {};
    }

    console.log(`📝 Registering timer: ${timerId} with interval ${interval}ms`);
    
    this.timers.set(timerId, {
      callback,
      interval,
      lastRun: Date.now(),
      enabled: true
    });

    if (!this.masterInterval) {
      this.startMasterLoop();
    }

    // Return unregister function
    return () => {
      this.unregister(timerId);
    };
  }

  unregister(timerId: string): void {
    console.log(`🗑️ Unregistering timer: ${timerId}`);
    this.timers.delete(timerId);

    if (this.timers.size === 0 && this.masterInterval) {
      this.stopMasterLoop();
    }
  }

  enableTimer(timerId: string): void {
    const timer = this.timers.get(timerId);
    if (timer) {
      timer.enabled = true;
      timer.lastRun = Date.now(); // Reset timing
      console.log(`✅ Timer enabled: ${timerId}`);
    }
  }

  disableTimer(timerId: string): void {
    const timer = this.timers.get(timerId);
    if (timer) {
      timer.enabled = false;
      console.log(`⏸️ Timer disabled: ${timerId}`);
    }
  }

  private startMasterLoop(): void {
    if (this.masterInterval || this.isDestroyed) return;

    console.log('🔄 Starting master timer loop');
    this.masterInterval = setInterval(() => {
      if (this.isDestroyed) return;

      const now = Date.now();
      for (const [timerId, timer] of this.timers) {
        if (!timer.enabled) continue;

        // Check if enough time has passed
        if (now - timer.lastRun >= timer.interval) {
          // Validate game state before executing
          if (this.isGameStateValid()) {
            try {
              timer.callback();
              timer.lastRun = now;
            } catch (error) {
              console.error(`❌ Timer callback error (${timerId}):`, error);
            }
          } else {
            // Game state invalid, disable timer
            timer.enabled = false;
            console.log(`⏹️ Timer disabled due to invalid game state: ${timerId}`);
          }
        }
      }
    }, 100); // 100ms precision for coordination
  }

  private stopMasterLoop(): void {
    if (this.masterInterval) {
      clearInterval(this.masterInterval);
      this.masterInterval = null;
      console.log('🛑 Master timer loop stopped');
    }
  }

  private isGameStateValid(): boolean {
    if (!this.gameStateRef?.current) return false;

    const state = this.gameStateRef.current;
    return state.isActive && !state.gameOver && !state.isCountdown;
  }

  setGameStateRef(ref: GameStateRef): void {
    this.gameStateRef = ref;
  }

  pauseAll(): void {
    console.log('⏸️ Pausing all timers');
    for (const timer of this.timers.values()) {
      timer.enabled = false;
    }
  }

  resumeAll(): void {
    console.log('▶️ Resuming all timers');
    const now = Date.now();
    for (const timer of this.timers.values()) {
      timer.enabled = true;
      timer.lastRun = now; // Reset timing to prevent immediate execution
    }
  }

  cleanup(): void {
    console.log('🧹 Cleaning up GameTimerManager');
    this.isDestroyed = true;
    this.stopMasterLoop();
    this.timers.clear();
    this.gameStateRef = null;
  }

  // Debug methods
  getActiveTimers(): string[] {
    return Array.from(this.timers.entries())
      .filter(([, timer]) => timer.enabled)
      .map(([timerId]) => timerId);
  }

  getTimerStatus(): Record<string, { enabled: boolean; lastRun: number; interval: number }> {
    const status: Record<string, any> = {};
    for (const [timerId, timer] of this.timers) {
      status[timerId] = {
        enabled: timer.enabled,
        lastRun: timer.lastRun,
        interval: timer.interval
      };
    }
    return status;
  }
}

// Singleton instance
export const gameTimerManager = new GameTimerManager();
