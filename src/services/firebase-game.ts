// src/services/firebase-game.ts - ENHANCED: Complete Business Logic Handler (Option A)

import { database } from './firebase';
import { ref, get, update } from 'firebase/database';

/**
 * Firebase-Game Service - ENHANCED for Option A Architecture
 * 
 * RESPONSIBILITIES:
 * ✅ All number calling logic and validation
 * ✅ All game state management and decisions
 * ✅ All prize detection and winner announcements
 * ✅ All game ending logic
 * ✅ Clear, simple responses to HostControlsProvider
 * 
 * PROVIDES TO HOSTCONTROLS:
 * ✅ Simple boolean responses (continue/stop)
 * ✅ Consistent error handling
 * ✅ Complete game flow management
 */
export class FirebaseGameService {

  // ================== MAIN CALLING METHOD FOR HOSTCONTROLS ==================

  /**
   * 🎯 KEY METHOD: Complete number calling with simple boolean response
   * This is the ONLY method HostControlsProvider needs to call
   * 
   * @param gameId - Game to call number for
   * @returns boolean - true if game should continue, false if game should stop
   */
  async callNextNumberAndContinue(gameId: string): Promise<boolean> {
    try {
      console.log(`🎯 Firebase-game: Handling complete number calling for ${gameId}`);
      
      // Step 1: Validate game can accept calls
      const canCall = await this.validateGameForCalling(gameId);
      if (!canCall.isValid) {
        console.log(`🚫 Cannot call number: ${canCall.reason}`);
        return false; // Stop the timer
      }
      
      // Step 2: Call the number with full processing
      const result = await this.processCompleteNumberCall(gameId);
      
      if (!result.success) {
        console.log(`❌ Number calling failed - stopping game`);
        return false; // Stop the timer
      }
      
      // Step 3: Check if game should continue
      const shouldContinue = !result.gameEnded && result.hasMoreNumbers;
      
      console.log(`✅ Number called successfully. Continue: ${shouldContinue}`);
      return shouldContinue;
      
    } catch (error: any) {
      console.error('❌ Firebase-game: Number calling error:', error);
      
      // Try to end the game gracefully on critical errors
      try {
        await this.endGameDueToError(gameId, error.message);
      } catch (endError) {
        console.error('❌ Failed to end game after error:', endError);
      }
      
      return false; // Stop the timer
    }
  }

  // ================== GAME VALIDATION ==================

  /**
   * Validate if game can accept number calls
   */
  private async validateGameForCalling(gameId: string): Promise<{
    isValid: boolean;
    reason?: string;
  }> {
    try {
      const gameData = await this.getGameData(gameId);
      
      if (!gameData) {
        return { isValid: false, reason: 'Game not found' };
      }
      
      if (!gameData.gameState.isActive) {
        return { isValid: false, reason: 'Game is not active' };
      }
      
      if (gameData.gameState.gameOver) {
        return { isValid: false, reason: 'Game has ended' };
      }
      
      if (gameData.gameState.isCountdown) {
        return { isValid: false, reason: 'Game is in countdown' };
      }
      
      const calledNumbers = gameData.gameState.calledNumbers || [];
      if (calledNumbers.length >= 90) {
        return { isValid: false, reason: 'All numbers have been called' };
      }
      
      return { isValid: true };
      
    } catch (error: any) {
      return { isValid: false, reason: `Validation error: ${error.message}` };
    }
  }

  // ================== COMPLETE NUMBER CALLING PROCESS ==================

  /**
   * Complete number calling with all business logic
   */
  private async processCompleteNumberCall(gameId: string): Promise<{
    success: boolean;
    gameEnded: boolean;
    hasMoreNumbers: boolean;
    number?: number;
    winners?: any;
  }> {
    try {
      console.log(`📞 Processing complete number call for game: ${gameId}`);
      
      // Get fresh game data
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }
      
      const gameData = gameSnapshot.val();
      const calledNumbers = gameData.gameState.calledNumbers || [];
      
      // Select next number
      const availableNumbers = Array.from({ length: 90 }, (_, i) => i + 1)
        .filter(num => !calledNumbers.includes(num));
      
      if (availableNumbers.length === 0) {
        console.log(`🏁 No more numbers available - ending game`);
        await this.endGameNoMoreNumbers(gameId);
        return {
          success: true,
          gameEnded: true,
          hasMoreNumbers: false
        };
      }
      
      // Call the number
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const selectedNumber = availableNumbers[randomIndex];
      const updatedCalledNumbers = [...calledNumbers, selectedNumber];
      
      console.log(`🎲 Selected number: ${selectedNumber}`);
      
      // Process prizes and winners
      const prizeResult = await this.processNumberForPrizes(
        gameData,
        selectedNumber,
        updatedCalledNumbers
      );
      
      // Build complete update
      const gameUpdates: any = {
        gameState: {
          ...gameData.gameState,
          calledNumbers: updatedCalledNumbers,
          currentNumber: selectedNumber,
          updatedAt: new Date().toISOString()
        }
      };
      
      // Add prize updates if any
      if (prizeResult.hasWinners) {
        Object.assign(gameUpdates, prizeResult.prizeUpdates);
        gameUpdates.lastWinnerAnnouncement = prizeResult.announcements.join(' ');
        gameUpdates.lastWinnerAt = new Date().toISOString();
      }
      
      // Check if game should end
      const allPrizesWon = this.checkAllPrizesWon(gameData.prizes, prizeResult.prizeUpdates);
      const isLastNumber = updatedCalledNumbers.length >= 90;
      const shouldEndGame = allPrizesWon || isLastNumber;
      
      if (shouldEndGame) {
        console.log(`🏁 Game ending: allPrizesWon=${allPrizesWon}, isLastNumber=${isLastNumber}`);
        gameUpdates.gameState.isActive = false;
        gameUpdates.gameState.gameOver = true;
      }
      
      // Apply all updates atomically
      await update(gameRef, gameUpdates);
      
      console.log(`✅ Number ${selectedNumber} called successfully`);
      
      return {
        success: true,
        gameEnded: shouldEndGame,
        hasMoreNumbers: availableNumbers.length > 1,
        number: selectedNumber,
        winners: prizeResult.hasWinners ? prizeResult.winners : undefined
      };
      
    } catch (error: any) {
      console.error('❌ Error in processCompleteNumberCall:', error);
      throw error;
    }
  }

  // ================== PRIZE PROCESSING ==================

  /**
   * Process number for all prize detection
   */
  private async processNumberForPrizes(gameData: any, number: number, calledNumbers: number[]): Promise<{
    hasWinners: boolean;
    winners: any;
    prizeUpdates: any;
    announcements: string[];
  }> {
    const announcements: string[] = [];
    const prizeUpdates: any = {};
    let allWinners: any = {};
    
    // Get unwon prizes
    const unwonPrizes = Object.fromEntries(
      Object.entries(gameData.prizes).filter(([_, prize]: [string, any]) => !prize.won)
    );
    
    if (Object.keys(unwonPrizes).length === 0) {
      return {
        hasWinners: false,
        winners: {},
        prizeUpdates: {},
        announcements: []
      };
    }
    
    // Validate tickets for prizes
    const validationResult = await this.validateTicketsForPrizes(
      gameData.tickets || {},
      calledNumbers,
      unwonPrizes
    );
    
    // Process each prize that has winners
    for (const [prizeId, prizeWinners] of Object.entries(validationResult.winners)) {
      const prizeData = prizeWinners as any;
      
      prizeUpdates[`prizes/${prizeId}`] = {
        ...gameData.prizes[prizeId],
        won: true,
        winners: prizeData.winners,
        winningNumber: number,
        wonAt: new Date().toISOString()
      };
      
      allWinners[prizeId] = prizeData;
      
      const winnersText = prizeData.winners
        .map((w: any) => `${w.name} (T${w.ticketId})`)
        .join(', ');
      announcements.push(`${prizeData.prizeName} won by ${winnersText}!`);
    }
    
    return {
      hasWinners: Object.keys(allWinners).length > 0,
      winners: allWinners,
      prizeUpdates,
      announcements
    };
  }

  /**
   * Check if all prizes are won
   */
  private checkAllPrizesWon(currentPrizes: any, prizeUpdates: any): boolean {
    const allPrizes = { ...currentPrizes };
    
    // Apply updates
    for (const [updatePath, updateData] of Object.entries(prizeUpdates)) {
      if (updatePath.startsWith('prizes/')) {
        const prizeId = updatePath.replace('prizes/', '');
        allPrizes[prizeId] = updateData;
      }
    }
    
    return Object.values(allPrizes).every((prize: any) => prize.won);
  }

  // ================== GAME FLOW METHODS FOR HOSTCONTROLS ==================

  /**
   * Start game with countdown setup
   */
  async startGameWithCountdown(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isCountdown': true,
        'gameState/countdownTime': 10,
        'gameState/isActive': false,
        'gameState/gameOver': false,
        'updatedAt': new Date().toISOString()
      });
      
      console.log(`✅ Game countdown started: ${gameId}`);
    } catch (error: any) {
      throw new Error(`Failed to start countdown: ${error.message}`);
    }
  }

  /**
   * Activate game after countdown
   */
  async activateGameAfterCountdown(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': true,
        'gameState/isCountdown': false,
        'gameState/countdownTime': 0,
        'updatedAt': new Date().toISOString()
      });
      
      console.log(`✅ Game activated after countdown: ${gameId}`);
    } catch (error: any) {
      throw new Error(`Failed to activate game: ${error.message}`);
    }
  }

  /**
   * Pause game
   */
  async pauseGame(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': false,
        'gameState/isCountdown': false,
        'updatedAt': new Date().toISOString()
      });
      
      console.log(`✅ Game paused: ${gameId}`);
    } catch (error: any) {
      throw new Error(`Failed to pause game: ${error.message}`);
    }
  }

  /**
   * Resume game
   */
  async resumeGame(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': true,
        'gameState/isCountdown': false,
        'updatedAt': new Date().toISOString()
      });
      
      console.log(`✅ Game resumed: ${gameId}`);
    } catch (error: any) {
      throw new Error(`Failed to resume game: ${error.message}`);
    }
  }

  /**
   * End game manually
   */
  async endGame(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': false,
        'gameState/isCountdown': false,
        'gameState/gameOver': true,
        'updatedAt': new Date().toISOString()
      });
      
      console.log(`✅ Game ended manually: ${gameId}`);
    } catch (error: any) {
      throw new Error(`Failed to end game: ${error.message}`);
    }
  }

  // ================== ERROR HANDLING ==================

  /**
   * End game when no more numbers available
   */
  private async endGameNoMoreNumbers(gameId: string): Promise<void> {
    const gameRef = ref(database, `games/${gameId}`);
    await update(gameRef, {
      'gameState/isActive': false,
      'gameState/gameOver': true,
      'lastWinnerAnnouncement': 'Game completed - all numbers called!',
      'lastWinnerAt': new Date().toISOString(),
      'updatedAt': new Date().toISOString()
    });
  }

  /**
   * End game due to error
   */
  private async endGameDueToError(gameId: string, errorMessage: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': false,
        'gameState/gameOver': true,
        'lastWinnerAnnouncement': `Game ended due to error: ${errorMessage}`,
        'lastWinnerAt': new Date().toISOString(),
        'updatedAt': new Date().toISOString()
      });
      
      console.log(`🚨 Game ended due to error: ${gameId}`);
    } catch (endError) {
      console.error('❌ Failed to end game after error:', endError);
    }
  }

  // ================== UTILITY METHODS ==================

  /**
   * Get game data
   */
  private async getGameData(gameId: string): Promise<any | null> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const snapshot = await get(gameRef);
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      console.error('Error getting game data:', error);
      return null;
    }
  }

  /**
   * Validate tickets for prizes (existing implementation)
   */
  async validateTicketsForPrizes(tickets: any, calledNumbers: number[], prizes: any): Promise<{ winners: any }> {
    // Your existing prize validation logic here
    // This should return { winners: { [prizeId]: { prizeName, winners: [...] } } }
    
    // Placeholder implementation - replace with your actual logic
    return { winners: {} };
  }
}

// Export singleton instance
export const firebaseGameService = new FirebaseGameService();
export const firebaseGame = new FirebaseGameService();
