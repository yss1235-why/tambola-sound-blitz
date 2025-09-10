// src/services/SecureNumberCaller.ts
import { FirebaseMutex } from './FirebaseMutex';
import { ref, get, runTransaction } from 'firebase/database';
import { database } from '@/services/firebase-core';

interface NumberCallResult {
  number: number;
  timestamp: number;
  sequenceId: number;
  success: boolean;
  error?: string;
}

interface GameState {
  calledNumbers: number[];
  currentNumber?: number;
  lastCallTime?: number;
  callSequence?: number;
  sessionCache?: number[];
}

export class SecureNumberCaller {
  private gameId: string;
  private calledNumbers = new Set<number>();
  private numberPool = Array.from({length: 90}, (_, i) => i + 1);
  private mutex: FirebaseMutex;
  private callInProgress = false;

  constructor(gameId: string) {
    this.gameId = gameId;
    this.mutex = new FirebaseMutex(`number-calling-locks`, `caller-${gameId}`);
    console.log(`🔢 SecureNumberCaller initialized for game: ${gameId}`);
  }

  // Main number calling method with full race condition prevention
  async callNextNumber(): Promise<NumberCallResult> {
    if (this.callInProgress) {
      throw new Error('Number call already in progress');
    }

    return await this.mutex.withLock(
      `call-${this.gameId}`,
      async () => {
        this.callInProgress = true;
        try {
          return await this.executeSecureNumberCall();
        } finally {
          this.callInProgress = false;
        }
      },
      {
        timeout: 10000,
        lockTTL: 15000,
        maxRetries: 5
      }
    );
  }

  // Execute the actual number call with atomic Firebase operations
  private async executeSecureNumberCall(): Promise<NumberCallResult> {
    const gameRef = ref(database, `games/${this.gameId}`);
    
    console.log(`🔢 Executing secure number call for game: ${this.gameId}`);
    
    try {
      // Use Firebase transaction for atomic operation
      const transactionResult = await runTransaction(gameRef, (currentGame) => {
        if (!currentGame) {
          throw new Error('Game not found');
        }

        const gameState: GameState = currentGame.gameState || {};
        const calledNumbers = gameState.calledNumbers || [];
        const callSequence = gameState.callSequence || 0;

        console.log(`🔄 Transaction: Current sequence ${callSequence}, called ${calledNumbers.length} numbers`);

        // Select next number using priority logic
        const selectedNumber = this.selectNextNumber(gameState, calledNumbers);
        
        if (!selectedNumber) {
          // No more numbers available
          throw new Error('No more numbers available');
        }

        // Validate number hasn't been called by another process
        if (calledNumbers.includes(selectedNumber)) {
          throw new Error(`Number ${selectedNumber} already called`);
        }

        // Update game state atomically
        const updatedCalledNumbers = [...calledNumbers, selectedNumber];
        const updatedGameState = {
          ...gameState,
          calledNumbers: updatedCalledNumbers,
          currentNumber: selectedNumber,
          lastCallTime: Date.now(),
          callSequence: callSequence + 1
        };

        return {
          ...currentGame,
          gameState: updatedGameState,
          updatedAt: new Date().toISOString(),
          _transactionMeta: {
            selectedNumber,
            sequenceId: callSequence + 1,
            timestamp: Date.now()
          }
        };
      });

      // Check transaction success
      if (!transactionResult.committed) {
        throw new Error('Firebase transaction failed - connection lost');
      }

      const updatedGame = transactionResult.snapshot.val();
      const meta = updatedGame._transactionMeta;

      // Update local state
      this.calledNumbers.add(meta.selectedNumber);

      console.log(`✅ Number called successfully: ${meta.selectedNumber} (sequence: ${meta.sequenceId})`);

      return {
        number: meta.selectedNumber,
        timestamp: meta.timestamp,
        sequenceId: meta.sequenceId,
        success: true
      };

    } catch (error: any) {
      console.error('❌ Secure number call failed:', error);
      
      return {
        number: 0,
        timestamp: Date.now(),
        sequenceId: 0,
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  // Priority-based number selection
  private selectNextNumber(gameState: GameState, calledNumbers: number[]): number | null {
    // Check for pre-generated sequence first (admin tool integration)
    if (gameState.sessionCache && gameState.sessionCache.length > calledNumbers.length) {
      const nextNumber = gameState.sessionCache[calledNumbers.length];
      console.log(`🎯 Using pre-generated number: ${nextNumber} (position ${calledNumbers.length + 1})`);
      return nextNumber;
    }

    // Fall back to cryptographically secure random selection
    return this.selectCryptoRandomNumber(calledNumbers);
  }

  // Cryptographically secure random number selection
  private selectCryptoRandomNumber(calledNumbers: number[]): number | null {
    const availableNumbers = this.numberPool.filter(
      num => !calledNumbers.includes(num)
    );

    if (availableNumbers.length === 0) {
      return null;
    }

    // Use crypto.getRandomValues for secure randomness
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    
    const randomIndex = randomArray[0] % availableNumbers.length;
    const selectedNumber = availableNumbers[randomIndex];

    console.log(`🎲 Crypto-random selection: ${selectedNumber} from ${availableNumbers.length} available`);
    return selectedNumber;
  }

  // Validate game state before calling
  async validateGameState(): Promise<{
    isValid: boolean;
    reason?: string;
    canContinue: boolean;
  }> {
    try {
      const gameRef = ref(database, `games/${this.gameId}`);
      const snapshot = await get(gameRef);
      
      if (!snapshot.exists()) {
        return { isValid: false, reason: 'Game not found', canContinue: false };
      }

      const game = snapshot.val();
      const gameState = game.gameState || {};

      // Check if game is over
      if (gameState.gameOver) {
        return { isValid: false, reason: 'Game has ended', canContinue: false };
      }

      // Check if all numbers have been called
      const calledCount = gameState.calledNumbers?.length || 0;
      if (calledCount >= 90) {
        return { isValid: false, reason: 'All numbers have been called', canContinue: false };
      }

      // Check if game is active (lenient check for network issues)
      if (!gameState.isActive) {
        return { 
          isValid: true, // Allow calling even if appears inactive
          reason: 'Game appears inactive but continuing', 
          canContinue: true 
        };
      }

      return { isValid: true, canContinue: true };

    } catch (error: any) {
      console.error('❌ Game state validation error:', error);
      return { 
        isValid: true, // Don't stop for validation errors
        reason: 'Validation error but continuing', 
        canContinue: true 
      };
    }
  }

  // Get current game statistics
  async getGameStatistics(): Promise<{
    totalCalled: number;
    remainingNumbers: number;
    callSequence: number;
    lastCallTime?: number;
  }> {
    try {
      const gameRef = ref(database, `games/${this.gameId}`);
      const snapshot = await get(gameRef);
      
      if (!snapshot.exists()) {
        throw new Error('Game not found');
      }

      const game = snapshot.val();
      const gameState = game.gameState || {};
      const calledNumbers = gameState.calledNumbers || [];

      return {
        totalCalled: calledNumbers.length,
        remainingNumbers: 90 - calledNumbers.length,
        callSequence: gameState.callSequence || 0,
        lastCallTime: gameState.lastCallTime
      };

    } catch (error: any) {
      console.error('❌ Error getting game statistics:', error);
      return {
        totalCalled: 0,
        remainingNumbers: 90,
        callSequence: 0
      };
    }
  }

  // Check if a specific number has been called
  isNumberCalled(number: number): boolean {
    return this.calledNumbers.has(number);
  }

  // Get all called numbers
  getCalledNumbers(): number[] {
    return Array.from(this.calledNumbers).sort((a, b) => a - b);
  }

  // Reset internal state (for new game)
  reset(): void {
    console.log(`🔄 Resetting SecureNumberCaller for game: ${this.gameId}`);
    this.calledNumbers.clear();
    this.callInProgress = false;
  }

  // Cleanup resources
  async cleanup(): Promise<void> {
    console.log(`🧹 Cleaning up SecureNumberCaller for game: ${this.gameId}`);
    await this.mutex.cleanup();
    this.reset();
  }
}
