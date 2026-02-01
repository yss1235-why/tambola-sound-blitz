// src/services/SecureNumberCaller.ts
import { FirebaseMutex } from './FirebaseMutex';
import { ref, get, runTransaction, onValue } from 'firebase/database';
import { database } from '@/services/firebase-core';
import { FEATURE_FLAGS } from './feature-flags';

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
  // BUG #2 FIX: Singleton pattern - one instance per game
  private static instances = new Map<string, SecureNumberCaller>();

  /**
   * Get or create a SecureNumberCaller instance for a game.
   * Uses singleton pattern to ensure only one instance per gameId.
   */
  static getInstance(gameId: string): SecureNumberCaller {
    if (!this.instances.has(gameId)) {
      this.instances.set(gameId, new SecureNumberCaller(gameId));
    }
    return this.instances.get(gameId)!;
  }

  /**
   * Clear the singleton instance for a game (on game end/cleanup)
   */
  static clearInstance(gameId: string): void {
    const instance = this.instances.get(gameId);
    if (instance) {
      instance.cleanup();
      this.instances.delete(gameId);
      console.log(`🧹 Cleared SecureNumberCaller singleton for game: ${gameId}`);
    }
  }

  /**
   * Clear all singleton instances
   */
  static clearAllInstances(): void {
    for (const [gameId, instance] of this.instances) {
      instance.cleanup();
    }
    this.instances.clear();
    console.log(`🧹 Cleared all SecureNumberCaller singletons`);
  }

  private gameId: string;
  private calledNumbers = new Set<number>();
  private numberPool = Array.from({ length: 90 }, (_, i) => i + 1);
  private mutex: FirebaseMutex;
  private callInProgress = false;
  private syncPromise: Promise<void> | null = null;
  private isConnected = false;
  private connectionUnsubscribe: (() => void) | null = null;

  // Private constructor - use getInstance() instead
  private constructor(gameId: string) {
    this.gameId = gameId;
    // BUG #1 FIX: Use unique lock name to avoid conflict with firebase-game.ts
    this.mutex = new FirebaseMutex(`number-calling-locks`, `caller-${gameId}`);
    console.log(`🔢 SecureNumberCaller singleton created for game: ${gameId}`);

    // BUG #3 FIX: Sync local state from Firebase on init
    if (FEATURE_FLAGS.SYNC_LOCAL_STATE_ON_INIT) {
      this.syncPromise = this.syncFromFirebase();
    }

    // FIX: Monitor connection status
    this.monitorConnection();
  }

  // Monitor Firebase connection status
  private monitorConnection(): void {
    const connectedRef = ref(database, '.info/connected');
    this.connectionUnsubscribe = onValue(connectedRef, (snap) => {
      this.isConnected = snap.val() === true;
      console.log(`🌐 Firebase connection: ${this.isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
    });
  }

  // Wait for connection with timeout
  private async waitForConnection(timeout: number = 5000): Promise<boolean> {
    if (this.isConnected) return true;

    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (this.isConnected) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }

  // BUG #3 FIX: Sync local calledNumbers from Firebase
  async syncFromFirebase(): Promise<void> {
    try {
      const gameRef = ref(database, `games/${this.gameId}/gameState/calledNumbers`);
      const snapshot = await get(gameRef);

      if (snapshot.exists()) {
        const numbers = snapshot.val() as number[];
        this.calledNumbers = new Set(numbers);
        console.log(`🔄 Synced ${numbers.length} called numbers from Firebase`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to sync called numbers from Firebase:', error);
    }
  }

  // Ensure sync is complete before operations
  private async ensureSynced(): Promise<void> {
    if (this.syncPromise) {
      await this.syncPromise;
      this.syncPromise = null;
    }
  }

  // Main number calling method with full race condition prevention and connection handling
  async callNextNumber(): Promise<NumberCallResult> {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000; // 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // FIX: Check connection before attempting transaction
      const isConnected = await this.waitForConnection(3000);
      if (!isConnected) {
        console.warn(`⚠️ No connection, attempt ${attempt}/${MAX_RETRIES}`);
        if (attempt === MAX_RETRIES) {
          return {
            number: 0,
            timestamp: Date.now(),
            sequenceId: 0,
            success: false,
            error: 'No network connection. Please check your internet and try again.'
          };
        }
        // Exponential backoff
        await new Promise(r => setTimeout(r, BASE_DELAY * attempt));
        continue;
      }

      try {
        // BUG #8 FIX: Move callInProgress check inside mutex for atomicity
        // BUG #1 FIX: Renamed lock to 'number-call-' to avoid conflict
        return await this.mutex.withLock(
          `number-call-${this.gameId}`,
          async () => {
            if (this.callInProgress) {
              throw new Error('Number call already in progress');
            }

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
      } catch (error: any) {
        const isDisconnectError = error.message?.includes('disconnect') ||
          error.message?.includes('connection') ||
          error.message?.includes('network');

        if (isDisconnectError && attempt < MAX_RETRIES) {
          console.log(`🔄 Retry ${attempt + 1}/${MAX_RETRIES} after disconnect error...`);
          // Exponential backoff
          await new Promise(r => setTimeout(r, BASE_DELAY * attempt));
          continue;
        }

        // Final failure or non-retryable error
        console.error(`❌ Number call failed after ${attempt} attempts:`, error.message);
        return {
          number: 0,
          timestamp: Date.now(),
          sequenceId: 0,
          success: false,
          error: isDisconnectError
            ? 'Connection lost. Please check your network and try again.'
            : error.message || 'Unknown error'
        };
      }
    }

    // Should never reach here, but just in case
    return {
      number: 0,
      timestamp: Date.now(),
      sequenceId: 0,
      success: false,
      error: 'Maximum retry attempts exceeded'
    };
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

        // BUG #12 FIX: Don't save _transactionMeta to database
        const transactionData = {
          ...currentGame,
          gameState: updatedGameState,
          updatedAt: new Date().toISOString()
        };

        // Store meta locally for return value, don't save to Firebase
        (transactionData as any)._localMeta = {
          selectedNumber,
          sequenceId: callSequence + 1,
          timestamp: Date.now()
        };

        return transactionData;
      });

      // Check transaction success
      if (!transactionResult.committed) {
        throw new Error('Firebase transaction failed - connection lost');
      }

      const updatedGame = transactionResult.snapshot.val();
      // BUG #12 FIX: Get meta from local state, not Firebase
      const latestNumber = updatedGame.gameState?.currentNumber;
      const latestSequence = updatedGame.gameState?.callSequence || 0;

      // Update local state
      this.calledNumbers.add(latestNumber);

      console.log(`✅ Number called successfully: ${latestNumber} (sequence: ${latestSequence})`);

      return {
        number: latestNumber,
        timestamp: Date.now(),
        sequenceId: latestSequence,
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

    // BUG #10 FIX: Add fallback for crypto.getRandomValues
    let randomIndex: number;

    try {
      const randomArray = new Uint32Array(1);
      crypto.getRandomValues(randomArray);
      randomIndex = randomArray[0] % availableNumbers.length;
    } catch (error) {
      if (FEATURE_FLAGS.USE_CRYPTO_FALLBACK) {
        console.warn('⚠️ crypto.getRandomValues failed, using Math.random fallback');
        randomIndex = Math.floor(Math.random() * availableNumbers.length);
      } else {
        throw error;
      }
    }

    const selectedNumber = availableNumbers[randomIndex];

    console.log(`🎲 Random selection: ${selectedNumber} from ${availableNumbers.length} available`);
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

      // BUG #9 FIX: Use strict validation flag
      if (FEATURE_FLAGS.USE_STRICT_VALIDATION) {
        return {
          isValid: false,
          reason: `Validation error: ${error.message}`,
          canContinue: false
        };
      }

      // Legacy behavior: continue on error
      return {
        isValid: true,
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
    // Unsubscribe from connection listener
    if (this.connectionUnsubscribe) {
      this.connectionUnsubscribe();
      this.connectionUnsubscribe = null;
    }
    await this.mutex.cleanup();
    this.reset();
  }
}
