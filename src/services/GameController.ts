// src/services/GameController.ts - CLEANED: Only automatic calling, no manual calling
// ✅ Fixed (use absolute path like other files)
import { firebaseService, GameData, GameState } from '@/services/firebase';

export interface GameControllerConfig {
  callInterval: number; // seconds between calls
  countdownDuration: number; // seconds for countdown
}

// ✅ CLEANED: Simplified controller - only automatic game management
class GameController {
  private config: GameControllerConfig = {
    callInterval: 5,
    countdownDuration: 10
  };

  // Track active timers to prevent conflicts
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private activeCountdowns = new Map<string, NodeJS.Timeout>();

  /**
   * Start game countdown
   */
  async startGameCountdown(gameId: string): Promise<void> {
    try {
      console.log(`🎮 Starting countdown for game ${gameId}`);

      // Clear any existing timers
      this.clearGameTimers(gameId);

      // Set countdown state
      await firebaseService.updateGameState(gameId, {
        isCountdown: true,
        countdownTime: this.config.countdownDuration,
        isActive: false
      });

      // Start countdown timer
      let remainingTime = this.config.countdownDuration;
      const countdownTimer = setInterval(async () => {
        remainingTime--;
        
        if (remainingTime > 0) {
          // Update countdown time
          await firebaseService.updateGameState(gameId, {
            countdownTime: remainingTime
          });
        } else {
          // Countdown finished - start game
          clearInterval(countdownTimer);
          this.activeCountdowns.delete(gameId);
          await this.startGame(gameId);
        }
      }, 1000);

      this.activeCountdowns.set(gameId, countdownTimer);
      
      console.log(`⏰ Countdown started for ${this.config.countdownDuration} seconds`);
    } catch (error: any) {
      throw new Error(`Failed to start countdown: ${error.message}`);
    }
  }

  /**
   * Start the game and begin automatic number calling
   */
  async startGame(gameId: string): Promise<void> {
    try {
      console.log(`🚀 Starting game ${gameId}`);

      // Clear any existing timers
      this.clearGameTimers(gameId);

      // Set active state
      await firebaseService.updateGameState(gameId, {
        isActive: true,
        isCountdown: false,
        countdownTime: 0
      });

      // Start automatic number calling loop
      this.startNumberCallingLoop(gameId);
      
      console.log(`✅ Game started successfully`);
    } catch (error: any) {
      throw new Error(`Failed to start game: ${error.message}`);
    }
  }

  /**
   * ✅ FIXED: Automatic number calling loop using callNextNumber
   */
  private startNumberCallingLoop(gameId: string): void {
    // Clear any existing timer
    if (this.activeTimers.has(gameId)) {
      clearTimeout(this.activeTimers.get(gameId)!);
    }

    const scheduleNextCall = () => {
      const timer = setTimeout(async () => {
        try {
          // Check if game is still active
          const gameData = await firebaseService.getGameData(gameId);
          if (!gameData || !gameData.gameState.isActive || gameData.gameState.gameOver) {
            console.log(`🛑 Game ${gameId} no longer active, stopping timer`);
            this.activeTimers.delete(gameId);
            return;
          }

          // ✅ FIXED: Use automatic number calling method
          const result = await firebaseService.callNextNumber(gameId);
          
          if (result.success && result.number) {
            console.log(`🎯 Number ${result.number} called successfully`);
            
            // Check if game ended
            if (result.gameEnded) {
              console.log(`🏁 Game ${gameId} ended`);
              this.activeTimers.delete(gameId);
              return;
            }

            // Schedule next call
            scheduleNextCall();
          } else {
            console.log(`⚠️ Number call failed, retrying in ${this.config.callInterval} seconds`);
            scheduleNextCall();
          }
        } catch (error) {
          console.error('❌ Error in number calling loop:', error);
          // Continue the loop even on error
          scheduleNextCall();
        }
      }, this.config.callInterval * 1000);

      this.activeTimers.set(gameId, timer);
    };

    scheduleNextCall();
  }

  /**
   * Pause the game
   */
  async pauseGame(gameId: string): Promise<void> {
    try {
      console.log(`⏸️ Pausing game ${gameId}`);
      
      // Clear timers
      this.clearGameTimers(gameId);
      
      // Only update isActive, preserve all other state
      await firebaseService.updateGameState(gameId, {
        isActive: false,
        isCountdown: false
      });

      console.log(`✅ Game paused successfully`);
    } catch (error: any) {
      throw new Error(`Failed to pause game: ${error.message}`);
    }
  }

  /**
   * Resume the game
   */
  async resumeGame(gameId: string): Promise<void> {
    try {
      console.log(`▶️ Resuming game ${gameId}`);

      // Set active state
      await firebaseService.updateGameState(gameId, {
        isActive: true,
        isCountdown: false
      });

      // Restart number calling loop
      this.startNumberCallingLoop(gameId);

      console.log(`✅ Game resumed successfully`);
    } catch (error: any) {
      throw new Error(`Failed to resume game: ${error.message}`);
    }
  }

  /**
   * End the game
   */
  async endGame(gameId: string): Promise<void> {
    try {
      console.log(`🏁 Ending game ${gameId}`);
      
      // Clear all timers
      this.clearGameTimers(gameId);
      
      // Set game over state
      await firebaseService.updateGameState(gameId, {
        isActive: false,
        isCountdown: false,
        gameOver: true
      });

      console.log(`✅ Game ended successfully`);
    } catch (error: any) {
      throw new Error(`Failed to end game: ${error.message}`);
    }
  }

  /**
   * Clear all timers for a game
   */
  private clearGameTimers(gameId: string): void {
    // Clear number calling timer
    if (this.activeTimers.has(gameId)) {
      clearTimeout(this.activeTimers.get(gameId)!);
      this.activeTimers.delete(gameId);
      console.log(`🧹 Cleared calling timer for game ${gameId}`);
    }

    // Clear countdown timer
    if (this.activeCountdowns.has(gameId)) {
      clearInterval(this.activeCountdowns.get(gameId)!);
      this.activeCountdowns.delete(gameId);
      console.log(`🧹 Cleared countdown timer for game ${gameId}`);
    }
  }

  /**
   * Update controller configuration
   */
  updateConfig(newConfig: Partial<GameControllerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`⚙️ Controller config updated:`, this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): GameControllerConfig {
    return { ...this.config };
  }

  /**
   * Check if user can perform action (authorization)
   */
  async canPerformAction(gameId: string, userId: string, action: string): Promise<boolean> {
    try {
      const gameData = await firebaseService.getGameData(gameId);
      if (!gameData) return false;

      // Only game host can control the game
      return gameData.hostId === userId;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get game status
   */
  async getGameStatus(gameId: string): Promise<{
    isActive: boolean;
    isCountdown: boolean;
    gameOver: boolean;
    currentNumber: number | null;
    calledNumbers: number[];
    hasActiveTimer: boolean;
  } | null> {
    try {
      const gameData = await firebaseService.getGameData(gameId);
      if (!gameData) return null;

      return {
        isActive: gameData.gameState.isActive,
        isCountdown: gameData.gameState.isCountdown,
        gameOver: gameData.gameState.gameOver,
        currentNumber: gameData.gameState.currentNumber,
        calledNumbers: gameData.gameState.calledNumbers || [],
        hasActiveTimer: this.activeTimers.has(gameId) || this.activeCountdowns.has(gameId)
      };
    } catch (error) {
      console.error('Failed to get game status:', error);
      return null;
    }
  }

  /**
   * Clean up all timers on shutdown
   */
  cleanup(): void {
    console.log('🧹 Cleaning up GameController timers');
    
    // Clear all calling timers
    for (const [gameId, timer] of this.activeTimers) {
      clearTimeout(timer);
      console.log(`🧹 Cleared calling timer for game ${gameId}`);
    }
    this.activeTimers.clear();

    // Clear all countdown timers
    for (const [gameId, timer] of this.activeCountdowns) {
      clearInterval(timer);
      console.log(`🧹 Cleared countdown timer for game ${gameId}`);
    }
    this.activeCountdowns.clear();
  }

  // ❌ REMOVED: callSpecificNumber method (manual calling)
  // ❌ REMOVED: All manual calling related methods
}

// Export singleton instance
export const gameController = new GameController();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    gameController.cleanup();
  });
}

export default gameController;
