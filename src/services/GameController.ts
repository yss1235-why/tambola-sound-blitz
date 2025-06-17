// src/services/GameController.ts - FIXED: Proper Scheduled Actions Management
import { firebaseService, GameData, GameState } from './firebase';

export interface GameControllerConfig {
  callInterval: number; // seconds between calls
  countdownDuration: number; // seconds for countdown
  syncDelay: number; // seconds delay for synchronization
}

export interface ScheduledAction {
  type: 'START_COUNTDOWN' | 'START_GAME' | 'CALL_NUMBER' | 'END_GAME';
  executeAt: number; // timestamp
  data?: any;
}

class GameController {
  private config: GameControllerConfig = {
    callInterval: 5,
    countdownDuration: 10,
    syncDelay: 3
  };

  /**
   * Pure control function - Schedule game countdown to start
   * Everyone will see countdown at the same time
   */
  async scheduleGameStart(gameId: string): Promise<void> {
    try {
      const executeAt = Date.now() + (this.config.syncDelay * 1000);
      
      await firebaseService.scheduleAction(gameId, {
        type: 'START_COUNTDOWN',
        executeAt,
        data: { countdownDuration: this.config.countdownDuration }
      });

      console.log(`🎮 Game countdown scheduled for ${new Date(executeAt).toLocaleTimeString()}`);
    } catch (error: any) {
      throw new Error(`Failed to schedule game start: ${error.message}`);
    }
  }

  /**
   * Pure control function - Start actual game (after countdown)
   */
  async executeGameStart(gameId: string): Promise<void> {
    try {
      const executeAt = Date.now() + (this.config.syncDelay * 1000);
      
      await firebaseService.scheduleAction(gameId, {
        type: 'START_GAME',
        executeAt,
        data: {}
      });

      // Schedule first number call
      const firstNumberAt = executeAt + (this.config.callInterval * 1000);
      await firebaseService.scheduleAction(gameId, {
        type: 'CALL_NUMBER',
        executeAt: firstNumberAt,
        data: {}
      });

      console.log(`🚀 Game start scheduled for ${new Date(executeAt).toLocaleTimeString()}`);
    } catch (error: any) {
      throw new Error(`Failed to execute game start: ${error.message}`);
    }
  }

  /**
   * Pure control function - Call next number
   */
  async executeNumberCall(gameId: string): Promise<void> {
    try {
      const gameData = await firebaseService.getGameData(gameId);
      if (!gameData) throw new Error('Game not found');

      const calledNumbers = gameData.gameState.calledNumbers || [];
      const availableNumbers = Array.from({ length: 90 }, (_, i) => i + 1)
        .filter(num => !calledNumbers.includes(num));

      if (availableNumbers.length === 0) {
        await this.executeGameEnd(gameId);
        return;
      }

      // Generate random number
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const number = availableNumbers[randomIndex];

      // Call number with prize validation
      const result = await firebaseService.callNumberWithPrizeValidation(gameId, number);

      if (result.gameEnded || availableNumbers.length === 1) {
        await this.executeGameEnd(gameId);
        return;
      }

      // Schedule next number call
      const nextCallAt = Date.now() + (this.config.callInterval * 1000);
      await firebaseService.scheduleAction(gameId, {
        type: 'CALL_NUMBER',
        executeAt: nextCallAt,
        data: {}
      });

      console.log(`🎯 Number ${number} called, next call at ${new Date(nextCallAt).toLocaleTimeString()}`);
    } catch (error: any) {
      throw new Error(`Failed to call number: ${error.message}`);
    }
  }

  /**
   * FIXED: Pure control function - Pause game
   */
  async pauseGame(gameId: string): Promise<void> {
    try {
      // First clear all scheduled actions
      await firebaseService.clearScheduledActions(gameId);
      
      // Then update game state
      await firebaseService.updateGameState(gameId, {
        isActive: false,
        isCountdown: false
      } as any);

      console.log(`⏸️ Game paused and scheduled actions cleared`);
    } catch (error: any) {
      throw new Error(`Failed to pause game: ${error.message}`);
    }
  }

  /**
   * Pure control function - Resume game
   */
  async resumeGame(gameId: string): Promise<void> {
    try {
      const gameData = await firebaseService.getGameData(gameId);
      if (!gameData) throw new Error('Game not found');

      await firebaseService.updateGameState(gameId, {
        isActive: true,
        isCountdown: false
      } as any);

      // Schedule next number call
      const nextCallAt = Date.now() + (this.config.callInterval * 1000);
      await firebaseService.scheduleAction(gameId, {
        type: 'CALL_NUMBER',
        executeAt: nextCallAt,
        data: {}
      });

      console.log(`▶️ Game resumed, next call at ${new Date(nextCallAt).toLocaleTimeString()}`);
    } catch (error: any) {
      throw new Error(`Failed to resume game: ${error.message}`);
    }
  }

  /**
   * FIXED: Pure control function - End game
   */
  async executeGameEnd(gameId: string): Promise<void> {
    try {
      // Clear all scheduled actions first
      await firebaseService.clearScheduledActions(gameId);
      
      // Then end the game
      await firebaseService.updateGameState(gameId, {
        isActive: false,
        isCountdown: false,
        gameOver: true
      } as any);

      console.log(`🏁 Game ended and scheduled actions cleared`);
    } catch (error: any) {
      throw new Error(`Failed to end game: ${error.message}`);
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
}

// Export singleton instance
export const gameController = new GameController();
export default gameController;
