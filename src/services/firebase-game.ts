// src/services/firebase-game.ts - COMPLETE: Original Methods + Option A Enhancements

import {
  ref,
  set,
  get,
  push,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
  onValue,
  off,
  runTransaction
} from 'firebase/database';
import { FirebaseMutex, numberCallingMutex } from '@/services/FirebaseMutex';
import { SecureNumberCaller } from '@/services/SecureNumberCaller';
import { database, removeUndefinedValues } from './firebase-core';
import {
  validateTicketsForPrizes,
  createPrizeConfiguration,
  computeTicketMetadata,
  getTicketCorners,
  getStarCorners
} from './prize-engine';
import { FEATURE_FLAGS } from './feature-flags';
import type {
  GameData,
  TambolaTicket,
  Prize,
  GameState,
  HostSettings,
  CreateGameConfig,
  TicketMetadata,
  SessionMetadata,
  NumberGenerationResult
} from './firebase-core';

interface TicketRowData {
  setId: number;
  ticketId: number;
  rowId: number;
  numbers: number[];
}


// ================== FIREBASE GAME SERVICE ==================

class FirebaseGameService {
  private firebaseRetryIntervals: Map<string, NodeJS.Timeout> = new Map();
  private firebaseRetryActive: Map<string, boolean> = new Map();
  private numberCallers: Map<string, SecureNumberCaller> = new Map();
  private gameMutex = new FirebaseMutex('game-operations');

  // BUG #6 FIX: Recover games stuck in finalizing/limbo state
  async recoverLimboGame(gameId: string): Promise<boolean> {
    if (!FEATURE_FLAGS.USE_LIMBO_RECOVERY) {
      return false;
    }

    try {
      const gameData = await this.getGameData(gameId);
      if (!gameData) return false;

      const gameState = gameData.gameState;

      // Check if game is in limbo (finalizing but not ended, and past scheduled time)
      if (gameState.finalizing && !gameState.gameOver && gameState.scheduledEndAt) {
        const scheduledEnd = new Date(gameState.scheduledEndAt);
        const now = new Date();

        // If scheduled end time has passed (with 10 second buffer), recover
        if (now.getTime() > scheduledEnd.getTime() + 10000) {

          await this.endGame(gameId);
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  // ================== TRANSACTION UTILITIES ==================

  async safeTransactionUpdate(path: string, updates: any, retries: number = 3): Promise<void> {
    const mutexKey = `transaction-${path}`;

    // Prevent concurrent transactions on same path
    return await this.gameMutex.withLock(
      mutexKey,
      async () => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {

            await runTransaction(ref(database, path), (currentData) => {
              if (currentData === null) {
                return updates;
              }

              // Deep merge to prevent overwriting
              return this.deepMerge(currentData, updates);
            });
            return;

          } catch (error: any) {

            if (attempt === retries) {
              throw new Error(`Transaction failed after ${retries} attempts: ${error.message}`);
            }

            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }
    );
  }

  // ================== GAME OPERATIONS ==================

  async createGame(config: CreateGameConfig, hostId: string, ticketSetId: string, selectedPrizes: string[]): Promise<GameData> {
    try {

      // STEP 1: Check for existing active games (non-atomic check first)
      const existingActiveGame = await this.getHostCurrentGame(hostId);
      if (existingActiveGame && !existingActiveGame.gameState.gameOver) {
        throw new Error(`Host already has an active game: ${existingActiveGame.gameId}. Please complete or delete it first.`);
      }

      // STEP 2: Atomic lock to prevent concurrent creation
      const lockRef = ref(database, `hostLocks/${hostId}`);

      return await runTransaction(lockRef, (currentLock) => {
        // If lock exists and is recent (within 30 seconds), reject
        if (currentLock !== null) {
          const lockAge = Date.now() - currentLock;
          if (lockAge < 30000) { // 30 seconds
            throw new Error('Host is already creating a game. Please wait.');
          }
          // If lock is old, we can override it (maybe previous creation failed)
        }

        // Set new lock with current timestamp
        return Date.now();

      }).then(async (transactionResult) => {
        if (!transactionResult.committed) {
          throw new Error('Failed to acquire creation lock');
        }

        try {
          // STEP 3: Double-check no active game exists (inside lock)
          const doubleCheckGame = await this.getHostCurrentGame(hostId);
          if (doubleCheckGame && !doubleCheckGame.gameState.gameOver) {
            throw new Error('Host created a game while we were acquiring lock');
          }

          // STEP 4: Proceed with actual game creation
          const gameData = await this.createGameInternal(config, hostId, ticketSetId, selectedPrizes);
          return gameData;

        } finally {
          // STEP 5: Always clear the lock (success or failure)
          try {
            await remove(lockRef);
          } catch (lockError) {
          }
        }
      });

    } catch (error: any) {
      throw new Error(error.message || 'Failed to create game');
    }
  }
  // HELPER: The actual game creation logic (separated for clarity)
  private async createGameInternal(config: CreateGameConfig, hostId: string, ticketSetId: string, selectedPrizes: string[]): Promise<GameData> {
    const gameId = push(ref(database, 'games')).key;
    if (!gameId) {
      throw new Error('Failed to generate game ID');
    }

    const tickets = await this.loadTicketsFromSet(ticketSetId, config.maxTickets);
    const prizes = createPrizeConfiguration(selectedPrizes);

    // Fetch host data to get businessName
    let businessName = '';
    try {
      const hostSnapshot = await get(ref(database, `hosts/${hostId}`));
      if (hostSnapshot.exists()) {
        const hostData = hostSnapshot.val();
        businessName = hostData.businessName || '';
      }
    } catch (error) {
    }

    const gameData: GameData = {
      gameId,
      name: config.name,
      businessName, // NEW: Include host's business name
      hostId,
      hostPhone: config.hostPhone,
      createdAt: new Date().toISOString(),
      maxTickets: config.maxTickets,
      ticketPrice: config.ticketPrice,
      gameState: {
        isActive: false,
        isCountdown: false,
        countdownTime: 0,
        gameOver: false,
        calledNumbers: [],
        currentNumber: null,
        speechRate: 1.0
      },
      tickets,
      prizes,
      updatedAt: new Date().toISOString()
    };

    const newGameRef = ref(database, `games/${gameId}`);
    await set(newGameRef, removeUndefinedValues(gameData));

    return gameData;
  }
  async deleteGame(gameId: string): Promise<void> {
    try {
      await remove(ref(database, `games/${gameId}`));
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete game');
    }
  }

  async getGameData(gameId: string): Promise<GameData | null> {
    try {
      const gameSnapshot = await get(ref(database, `games/${gameId}`));
      return gameSnapshot.exists() ? gameSnapshot.val() as GameData : null;
    } catch (error) {
      return null;
    }
  }

  async getHostCurrentGame(hostId: string): Promise<GameData | null> {
    try {
      const gamesRef = query(ref(database, 'games'), orderByChild('hostId'), equalTo(hostId));
      const gamesSnapshot = await get(gamesRef);

      if (!gamesSnapshot.exists()) {
        return null;
      }

      const games = Object.values(gamesSnapshot.val()) as GameData[];
      const activeGame = games.find(game =>
        game.gameState && !game.gameState.gameOver
      );

      return activeGame || null;
    } catch (error) {
      return null;
    }
  }

  async getAllActiveGames(): Promise<GameData[]> {
    try {
      const gamesSnapshot = await get(ref(database, 'games'));
      if (!gamesSnapshot.exists()) {
        return [];
      }

      const allGames = Object.values(gamesSnapshot.val()) as GameData[];
      return allGames.filter(game =>
        game.gameState && !game.gameState.gameOver
      );
    } catch (error) {
      return [];
    }
  }

  // ================== SETTINGS UPDATE OPERATIONS ==================

  async updateLiveGameSettings(gameId: string, updates: {
    maxTickets?: number;
    hostPhone?: string;
    selectedPrizes?: string[];
  }): Promise<void> {
    await runTransaction(ref(database, `games/${gameId}`), (currentGame) => {
      if (!currentGame) {
        throw new Error(`Game ${gameId} not found`);
      }

      try {
        if (updates.maxTickets !== undefined) {
          const bookedCount = Object.values(currentGame.tickets || {})
            .filter((ticket: any) => ticket.isBooked).length;

          if (updates.maxTickets < bookedCount) {
            throw new Error(
              `Cannot set max tickets (${updates.maxTickets}) below current bookings (${bookedCount}). ` +
              `Please increase the number or cancel some bookings.`
            );
          }

          if (updates.maxTickets < 1 || updates.maxTickets > 600) {
            throw new Error('Max tickets must be between 1 and 600');
          }
        }

        if (updates.hostPhone !== undefined) {
          if (!updates.hostPhone.trim()) {
            throw new Error('Host phone number cannot be empty');
          }
        }

        let finalUpdates: any = { ...updates };

        if (updates.selectedPrizes) {

          const newPrizes = createPrizeConfiguration(updates.selectedPrizes);

          Object.keys(currentGame.prizes || {}).forEach(prizeId => {
            const currentPrize = currentGame.prizes[prizeId];

            if (currentPrize.won && newPrizes[prizeId]) {
              newPrizes[prizeId] = {
                ...newPrizes[prizeId],
                won: currentPrize.won,
                winners: currentPrize.winners,
                winningNumber: currentPrize.winningNumber,
                wonAt: currentPrize.wonAt
              };
            }
          });

          finalUpdates.prizes = newPrizes;
          delete finalUpdates.selectedPrizes;
        }

        finalUpdates.updatedAt = new Date().toISOString();

        return { ...currentGame, ...finalUpdates };

      } catch (error: any) {
        throw error;
      }
    });
  }

  async updateHostTemplate(hostId: string, templateSettings: {
    hostPhone?: string;
    maxTickets?: number;
    selectedTicketSet?: string;
    selectedPrizes?: string[];
  }): Promise<void> {
    try {

      if (templateSettings.maxTickets !== undefined) {
        if (templateSettings.maxTickets < 1 || templateSettings.maxTickets > 600) {
          throw new Error('Template max tickets must be between 1 and 600');
        }
      }

      if (templateSettings.hostPhone !== undefined) {
        if (!templateSettings.hostPhone.trim()) {
          throw new Error('Template phone number cannot be empty');
        }
      }

      const updates = {
        ...removeUndefinedValues(templateSettings),
        updatedAt: new Date().toISOString()
      };

      await this.safeTransactionUpdate(`hostSettings/${hostId}`, updates);

    } catch (error: any) {
      throw new Error(error.message || 'Failed to update host template');
    }
  }

  async updateGameAndTemplate(gameId: string, hostId: string, settings: {
    maxTickets?: number;
    hostPhone?: string;
    selectedPrizes?: string[];
    selectedTicketSet?: string;
  }): Promise<void> {
    try {

      // Update live game settings
      await this.updateLiveGameSettings(gameId, {
        maxTickets: settings.maxTickets,
        hostPhone: settings.hostPhone,
        selectedPrizes: settings.selectedPrizes
      });

      // Update host template
      await this.updateHostTemplate(hostId, {
        hostPhone: settings.hostPhone,
        maxTickets: settings.maxTickets,
        selectedTicketSet: settings.selectedTicketSet,
        selectedPrizes: settings.selectedPrizes
      });

    } catch (error: any) {
      throw error;
    }
  }

  // ================== TICKET OPERATIONS ==================

  async loadTicketsFromSet(ticketSetId: string, maxTickets: number): Promise<{ [ticketId: string]: TambolaTicket }> {
    try {

      if (!['1', '2'].includes(ticketSetId)) {
        throw new Error(`Invalid ticket set ID: ${ticketSetId}. Must be "1" or "2".`);
      }

      if (!maxTickets || maxTickets < 1 || maxTickets > 600) {
        throw new Error(`Invalid maxTickets: ${maxTickets}. Must be between 1 and 600.`);
      }

      const response = await fetch(`/data/${ticketSetId}.json`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Ticket set file not found: ${ticketSetId}.json`);
        }
        throw new Error(`Failed to load ticket set ${ticketSetId}: HTTP ${response.status}`);
      }

      const rawData: TicketRowData[] = await response.json();

      if (!Array.isArray(rawData)) {
        throw new Error(`Invalid ticket data format: Expected array, got ${typeof rawData}`);
      }

      if (rawData.length === 0) {
        throw new Error(`Empty ticket set: ${ticketSetId}.json contains no data`);
      }

      const filteredData = rawData.filter(row => row.ticketId >= 1 && row.ticketId <= maxTickets);

      if (filteredData.length === 0) {
        throw new Error(`No valid tickets found in range 1-${maxTickets} for set ${ticketSetId}`);
      }

      const uniqueTicketIds = new Set(filteredData.map(row => row.ticketId));
      const availableTickets = uniqueTicketIds.size;

      if (availableTickets < maxTickets) {
        throw new Error(`Insufficient tickets in set ${ticketSetId}: Found ${availableTickets}, requested ${maxTickets}`);
      }

      const ticketGroups = new Map<number, TicketRowData[]>();

      for (const row of filteredData) {
        if (!row.ticketId || !row.rowId || !Array.isArray(row.numbers)) {
          continue;
        }

        if (row.numbers.length !== 9) {
          continue;
        }

        if (!ticketGroups.has(row.ticketId)) {
          ticketGroups.set(row.ticketId, []);
        }
        ticketGroups.get(row.ticketId)!.push(row);
      }

      const tickets: { [ticketId: string]: TambolaTicket } = {};

      for (const [ticketId, rows] of ticketGroups) {
        if (rows.length !== 3) {
          continue;
        }

        rows.sort((a, b) => a.rowId - b.rowId);

        const expectedRowIds = [1, 2, 3];
        const actualRowIds = rows.map(r => r.rowId);

        if (!expectedRowIds.every((id, index) => actualRowIds[index] === id)) {
          continue;
        }

        const ticket: TambolaTicket = {
          ticketId: ticketId.toString(),
          setId: rows[0].setId,
          positionInSet: ((ticketId - 1) % 6) + 1,
          rows: rows.map(row => row.numbers),
          markedNumbers: [],
          isBooked: false,
          playerName: '',
          playerPhone: '',
          bookedAt: ''
        };

        ticket.metadata = computeTicketMetadata(ticket);
        tickets[ticketId.toString()] = ticket;
      }

      const createdTicketCount = Object.keys(tickets).length;

      if (createdTicketCount < maxTickets) {
        throw new Error(`Failed to create enough valid tickets: created ${createdTicketCount}, requested ${maxTickets}. Check ticket data integrity.`);
      }

      return tickets;

    } catch (error: any) {
      throw new Error(error.message || 'Failed to load tickets from set');
    }
  }

  async expandGameTickets(gameId: string, newMaxTickets: number, ticketSetId: string): Promise<void> {
    try {

      const currentGameData = await this.getGameData(gameId);
      if (!currentGameData) {
        throw new Error(`Game ${gameId} not found for ticket expansion`);
      }

      const currentMaxTickets = currentGameData.maxTickets;
      const currentTickets = currentGameData.tickets || {};

      if (newMaxTickets <= currentMaxTickets) {
        throw new Error(`Can only expand tickets. Current: ${currentMaxTickets}, Requested: ${newMaxTickets}. To reduce tickets, create a new game.`);
      }

      if (newMaxTickets > 600) {
        throw new Error(`Maximum ticket limit is 600. Requested: ${newMaxTickets}`);
      }

      const bookedTickets = Object.values(currentTickets).filter(ticket => ticket.isBooked);

      const allTicketsForSet = await this.loadTicketsFromSet(ticketSetId, newMaxTickets);

      for (const [ticketId, existingTicket] of Object.entries(currentTickets)) {
        if (existingTicket.isBooked && allTicketsForSet[ticketId]) {
          allTicketsForSet[ticketId] = {
            ...allTicketsForSet[ticketId],
            isBooked: existingTicket.isBooked,
            playerName: existingTicket.playerName,
            playerPhone: existingTicket.playerPhone,
            bookedAt: existingTicket.bookedAt,
            markedNumbers: existingTicket.markedNumbers || []
          };
        }
      }

      const updates = {
        maxTickets: newMaxTickets,
        tickets: allTicketsForSet,
        updatedAt: new Date().toISOString()
      };

      await this.safeTransactionUpdate(`games/${gameId}`, updates);

    } catch (error: any) {
      throw new Error(error.message || 'Failed to expand game tickets');
    }
  }

  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string): Promise<void> {
    try {
      const updates = {
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        bookedAt: new Date().toISOString()
      };

      await update(ref(database, `games/${gameId}/tickets/${ticketId}`), updates);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  /**
   * Batch book multiple tickets in a single atomic Firebase write.
   * Uses multi-path update — 1 network call regardless of ticket count.
   * ~6x faster than sequential booking for a full sheet (6 tickets).
   */
  async bookTicketsBatch(ticketIds: string[], playerName: string, playerPhone: string, gameId: string): Promise<void> {
    if (ticketIds.length === 0) return;

    // Single ticket: use regular method
    if (ticketIds.length === 1) {
      return this.bookTicket(ticketIds[0], playerName, playerPhone, gameId);
    }

    try {
      const now = new Date().toISOString();
      const trimmedName = playerName.trim();
      const trimmedPhone = playerPhone.trim();

      // Build multi-path update object for all tickets at once
      const batchUpdates: Record<string, any> = {};
      for (const ticketId of ticketIds) {
        const basePath = `games/${gameId}/tickets/${ticketId}`;
        batchUpdates[`${basePath}/isBooked`] = true;
        batchUpdates[`${basePath}/playerName`] = trimmedName;
        batchUpdates[`${basePath}/playerPhone`] = trimmedPhone;
        batchUpdates[`${basePath}/bookedAt`] = now;
      }

      // Single atomic write — all tickets updated in one network call
      await update(ref(database), batchUpdates);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to batch book tickets');
    }
  }

  async unbookTicket(gameId: string, ticketId: string): Promise<void> {
    try {
      const updates = {
        isBooked: false,
        playerName: '',
        playerPhone: '',
        bookedAt: ''
      };

      await update(ref(database, `games/${gameId}/tickets/${ticketId}`), updates);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to unbook ticket');
    }
  }

  // ================== GAME STATE OPERATIONS ==================

  async startGame(gameId: string): Promise<void> {
    try {
      const updates = {
        isActive: true,
        isCountdown: false,
        gameOver: false
      };
      await update(ref(database, `games/${gameId}/gameState`), updates);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to start game');
    }
  }

  async pauseGame(gameId: string): Promise<void> {
    try {
      await update(ref(database, `games/${gameId}/gameState`), { isActive: false });
    } catch (error: any) {
      throw new Error(error.message || 'Failed to pause game');
    }
  }

  async resumeGame(gameId: string): Promise<void> {
    try {
      await update(ref(database, `games/${gameId}/gameState`), { isActive: true });
    } catch (error: any) {
      throw new Error(error.message || 'Failed to resume game');
    }
  }

  async updateSpeechRate(gameId: string, speechRate: number): Promise<void> {
    try {
      await update(ref(database, `games/${gameId}/gameState`), { speechRate });
    } catch (error: any) {
      throw new Error(`Failed to update speech rate: ${error.message}`);
    }
  }

  async endGame(gameId: string): Promise<void> {
    try {

      return await this.gameMutex.withLock(
        `end-${gameId}`,
        async () => {
          const gameRef = ref(database, `games/${gameId}`);

          await runTransaction(gameRef, (currentGame) => {
            if (!currentGame) {
              throw new Error('Game not found');
            }

            return {
              ...currentGame,
              gameState: {
                ...currentGame.gameState,
                isActive: false,
                gameOver: true,
                gameEndedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            };
          });

          // Clean up number caller
          const numberCaller = this.numberCallers.get(gameId);
          if (numberCaller) {
            await numberCaller.cleanup();
            this.numberCallers.delete(gameId);
          }
        },
        { timeout: 15000, lockTTL: 20000 }
      );

    } catch (error: any) {
      throw new Error(error.message || 'Failed to end game');
    }
  }

  async callNextNumber(gameId: string): Promise<number | null> {
    try {
      const gameData = await this.getGameData(gameId);
      if (!gameData) throw new Error('Game not found');

      const calledNumbers = gameData.gameState.calledNumbers || [];
      let newNumber: number;

      // Use only pre-generated sequence
      if (gameData.sessionCache && gameData.sessionCache.length > calledNumbers.length) {
        newNumber = gameData.sessionCache[calledNumbers.length];
      } else {
        await this.endGame(gameId);
        return null;
      }

      const updates = {
        calledNumbers: [...calledNumbers, newNumber],
        currentNumber: newNumber
      };

      await update(ref(database, `games/${gameId}/gameState`), updates);

      return newNumber;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to call next number');
    }
  }

  async processNumberCall(gameId: string, number: number): Promise<void> {
    throw new Error('Legacy method disabled. Use HostControlsProvider for number calling.');
  }

  async announceWinners(gameId: string, winners: any): Promise<void> {
    try {
      const updates = {
        lastWinnerAnnouncement: typeof winners === 'string'
          ? winners
          : (winners?.announcements ? winners.announcements.join(' ') : 'Prize won!'),
        lastWinnerAt: new Date().toISOString()
      };
      await update(ref(database, `games/${gameId}`), updates);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to announce winners');
    }
  }

  // ================== OPTION A: NEW METHODS FOR SIMPLIFIED HOSTCONTROLSPROVIDER ==================

  /**
   * 🎯 KEY METHOD: Complete number calling with simple boolean response
   * This is the ONLY method HostControlsProvider needs to call
   * 
   * @param gameId - Game to call number for
   * @returns boolean - true if game should continue, false if game should stop
   */
  async callNextNumberAndContinue(gameId: string): Promise<boolean> {
    try {

      // Use mutex to prevent concurrent calls
      return await this.gameMutex.withLock(
        `call-${gameId}`,
        async () => {
          // Step 1: Validate game can accept calls
          const canCall = await this.validateGameForCalling(gameId);
          if (!canCall.isValid) {
            return false;
          }

          // Step 2: Get or create secure number caller (BUG #2 FIX: use singleton)
          let numberCaller = this.numberCallers.get(gameId);
          if (!numberCaller) {
            numberCaller = SecureNumberCaller.getInstance(gameId);
            this.numberCallers.set(gameId, numberCaller);
          }

          // Step 3: Use secure number calling
          const result = await numberCaller.callNextNumber();

          if (!result.success) {
            return false;
          }

          // Step 4: Process prizes after successful call
          const prizeResult = await this.processPrizesAfterNumberCall(gameId, result.number);

          // Step 5: Check if game should continue (check both numbers AND prizes)
          const gameData = await this.getGameData(gameId);
          if (!gameData) return false;

          const stats = await numberCaller.getGameStatistics();
          const numbersRemaining = stats.remainingNumbers > 0;

          // BUG #7 FIX: Merge pending prize updates before checking
          let allPrizesWon: boolean;
          if (FEATURE_FLAGS.USE_MERGED_PRIZE_CHECK && prizeResult?.prizeUpdates) {
            // Create merged prizes object
            const mergedPrizes = { ...gameData.prizes };
            for (const [prizeId, updates] of Object.entries(prizeResult.prizeUpdates)) {
              if (updates && typeof updates === 'object') {
                mergedPrizes[prizeId] = { ...mergedPrizes[prizeId], ...updates };
              }
            }
            allPrizesWon = this.checkAllPrizesWon(mergedPrizes, {});
          } else {
            // Legacy behavior
            allPrizesWon = this.checkAllPrizesWon(gameData.prizes, prizeResult?.prizeUpdates || {});
          }

          const shouldContinue = numbersRemaining && !allPrizesWon;

          // Game continuation check log removed for performance

          // Check if game should end
          const isLastNumber = stats.totalCalled >= 90;
          const shouldEndGame = allPrizesWon || isLastNumber;

          if (shouldEndGame && !gameData.gameState.gameOver) {

            const gameRef = ref(database, `games/${gameId}`);
            const now = new Date();
            const endTime = new Date(now.getTime() + 6000); // 6 seconds from now

            // BUG #6 FIX: Record scheduled end time for limbo recovery
            await update(gameRef, {
              'gameState/isActive': false,
              'gameState/finalizing': true,
              'gameState/scheduledEndAt': endTime.toISOString(), // For recovery
              'lastWinnerAnnouncement': allPrizesWon ? 'All prizes won! Game ending...' : 'All numbers called! Game ending...',
              'lastWinnerAt': now.toISOString(),
              'updatedAt': now.toISOString()
            });

            // BUG #5: setTimeout is unreliable if browser closes
            // With scheduledEndAt, other clients can recover games stuck in limbo
            setTimeout(async () => {
              try {
                await this.endGame(gameId);
              } catch (error) {
              }
            }, 5500);

            return false; // Stop calling more numbers
          }
          return shouldContinue;
        },
        {
          timeout: 15000,
          lockTTL: 20000
        }
      );

    } catch (error: any) {
      return false;
    }
  }

  /**
   * Process prizes after a number is called
   */
  private async processPrizesAfterNumberCall(gameId: string, calledNumber: number): Promise<any> {
    try {
      const gameData = await this.getGameData(gameId);
      if (!gameData) return;

      // FIX: Ensure calledNumbers includes the just-called number
      // Firebase eventual consistency may cause the read to return stale data
      const existingNumbers = gameData.gameState.calledNumbers || [];
      const calledNumbers = existingNumbers.includes(calledNumber)
        ? existingNumbers
        : [...existingNumbers, calledNumber];

      // Use existing prize validation logic
      const prizeResult = await this.processNumberForPrizes(
        gameData,
        calledNumber,
        calledNumbers
      );


      if (prizeResult.hasWinners) {
        const prizeUpdates = {
          ...prizeResult.prizeUpdates,
          lastWinnerAnnouncement: prizeResult.announcements.join(' '),
          lastWinnerAt: new Date().toISOString()
        };

        const gameRef = ref(database, `games/${gameId}`);
        await update(gameRef, prizeUpdates);
        return prizeResult; // Return the prize result for game ending logic
      }

      return null; // No winners
    } catch (error: any) {
      return null;
    }
  }

  /**
   * Generate and validate pre-game number sequence
   */
  async generateGameNumbers(gameId: string): Promise<NumberGenerationResult> {
    try {

      const gameData = await this.getGameData(gameId);
      if (!gameData) {
        throw new Error('Game not found');
      }

      // Step 1: Check if admin has already generated numbers
      if (gameData.sessionCache && gameData.sessionMeta?.source === 'admin') {

        const validation = await this.validateExistingSequence(gameData);
        if (validation.isValid) {
          return {
            success: true,
            numbers: gameData.sessionCache,
            source: 'admin'
          };
        } else {
          const repaired = await this.repairSequence(gameData);
          return repaired;
        }
      }

      // Step 2: Check if host has already generated numbers
      if (gameData.sessionCache && gameData.sessionMeta?.source === 'host') {

        const validation = await this.validateExistingSequence(gameData);
        if (validation.isValid) {
          return {
            success: true,
            numbers: gameData.sessionCache,
            source: 'host'
          };
        } else {
          const repaired = await this.repairSequence(gameData);
          return repaired;
        }
      }

      // Step 3: Generate new host sequence
      const generated = await this.generateHostSequence(gameId);
      return generated;

    } catch (error: any) {
      return {
        success: false,
        numbers: [],
        source: 'host',
        error: error.message
      };
    }
  }

  /**
   * Validate existing sequence for completeness and correctness
   */
  private async validateExistingSequence(gameData: GameData): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check if sessionCache exists and has correct length
      if (!gameData.sessionCache || gameData.sessionCache.length !== 90) {
        issues.push(`Sequence length is ${gameData.sessionCache?.length || 0}, expected 90`);
      }

      // Check for duplicates
      if (gameData.sessionCache) {
        const uniqueNumbers = new Set(gameData.sessionCache);
        if (uniqueNumbers.size !== gameData.sessionCache.length) {
          issues.push('Duplicate numbers found in sequence');
        }

        // Check if all numbers 1-90 are present
        for (let i = 1; i <= 90; i++) {
          if (!gameData.sessionCache.includes(i)) {
            issues.push(`Missing number: ${i}`);
          }
        }

        // Check for invalid numbers (outside 1-90 range)
        const invalidNumbers = gameData.sessionCache.filter(num => num < 1 || num > 90);
        if (invalidNumbers.length > 0) {
          issues.push(`Invalid numbers found: ${invalidNumbers.join(', ')}`);
        }
      }
      return {
        isValid: issues.length === 0,
        issues
      };

    } catch (error: any) {
      return {
        isValid: false,
        issues: [`Validation failed: ${error.message}`]
      };
    }
  }

  /**
   * Repair existing sequence by fixing issues
   */
  private async repairSequence(gameData: GameData): Promise<NumberGenerationResult> {
    try {

      let numbers = [...(gameData.sessionCache || [])];

      // Fix number sequence
      if (numbers.length !== 90) {

        // Get all numbers that should be present
        const allNumbers = Array.from({ length: 90 }, (_, i) => i + 1);
        const existingNumbers = new Set(numbers.filter(num => num >= 1 && num <= 90));
        const missingNumbers = allNumbers.filter(num => !existingNumbers.has(num));

        // Remove duplicates and invalid numbers
        numbers = Array.from(existingNumbers);

        // Add missing numbers in random positions
        missingNumbers.forEach(num => {
          const randomIndex = Math.floor(Math.random() * (numbers.length + 1));
          numbers.splice(randomIndex, 0, num);
        });

        // Ensure exactly 90 numbers
        numbers = numbers.slice(0, 90);
      }

      // Create repaired metadata
      const sessionMeta: SessionMetadata = {
        created: new Date().toISOString(),
        source: gameData.sessionMeta?.source || 'host',
        validated: true,
        totalNumbers: 90
      };

      await this.saveGameNumbers(gameData.gameId, numbers, sessionMeta);
      return {
        success: true,
        numbers,
        source: sessionMeta.source
      };

    } catch (error: any) {
      return {
        success: false,
        numbers: [],
        source: 'host',
        error: error.message
      };
    }
  }

  /**
    * Generate new host sequence (only during game creation)
    */
  private async generateHostSequence(gameId: string): Promise<NumberGenerationResult> {
    try {

      // Generate shuffled sequence of numbers 1-90 (only during initial setup)
      const numbers = this.shuffleArray(Array.from({ length: 90 }, (_, i) => i + 1));

      // Create simple metadata
      const sessionMeta: SessionMetadata = {
        created: new Date().toISOString(),
        source: 'host',
        validated: true,
        totalNumbers: 90
      };

      // Save to Firebase
      await this.saveGameNumbers(gameId, numbers, sessionMeta);
      return {
        success: true,
        numbers,
        source: 'host'
      };

    } catch (error: any) {
      return {
        success: false,
        numbers: [],
        source: 'host',
        error: error.message
      };
    }
  }

  /**
   * Save generated numbers to Firebase
   */
  private async saveGameNumbers(
    gameId: string,
    numbers: number[],
    sessionMeta: SessionMetadata
  ): Promise<void> {
    try {
      const updates = {
        sessionCache: numbers,
        sessionMeta: sessionMeta
      };

      await update(ref(database, `games/${gameId}`), updates);

    } catch (error: any) {
      throw new Error(`Failed to save game numbers: ${error.message}`);
    }
  }

  /**
   * Utility function to shuffle array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
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
        // Don't stop for missing game data - might be network issue
        return { isValid: true };
      }

      // STRICT: Always stop for gameOver (no forgiveness)
      // STRICT: Always stop for gameOver or finalizing (no forgiveness)
      if (gameData.gameState.gameOver) {
        return { isValid: false, reason: 'Game has ended' };
      }

      if (gameData.gameState.finalizing) {
        return { isValid: false, reason: 'Game is finalizing' };
      }

      // STRICT: Always stop if all numbers called
      const calledNumbers = gameData.gameState.calledNumbers || [];
      if (calledNumbers.length >= 90) {
        return { isValid: false, reason: 'All numbers have been called' };
      }

      // FORGIVING: Allow calling even if game appears inactive or in countdown
      // These might be temporary states due to network issues
      if (!gameData.gameState.isActive) {
      }

      if (gameData.gameState.isCountdown) {
      }

      return { isValid: true };

    } catch (error: any) {
      // Don't stop for validation errors - treat as temporary
      return { isValid: true };
    }
  }

  /**
     * DEPRECATED: Old number calling method - use callNextNumberAndContinue instead
     */
  private async processCompleteNumberCall(gameId: string): Promise<{
    success: boolean;
    gameEnded: boolean;
    hasMoreNumbers: boolean;
    number?: number;
    winners?: any;
  }> {
    return {
      success: false,
      gameEnded: true,
      hasMoreNumbers: false
    };
  }

  /**
   * LEGACY: Old complete number calling method - replaced by secure caller
   */
  private async processCompleteNumberCallLegacy(gameId: string): Promise<{
    success: boolean;
    gameEnded: boolean;
    hasMoreNumbers: boolean;
    number?: number;
    winners?: any;
  }> {
    try {

      // Use Firebase transaction for atomic operation
      const gameRef = ref(database, `games/${gameId}`);

      const transactionResult = await runTransaction(gameRef, (currentGame) => {
        if (!currentGame) {
          throw new Error('Game not found');
        }

        const calledNumbers = currentGame.gameState.calledNumbers || [];

        // Select next number
        let selectedNumber: number;

        // Check for pre-generated sequence (REQUIRED)
        // Use only pre-generated sequence
        if (currentGame.sessionCache && currentGame.sessionCache.length > calledNumbers.length) {
          selectedNumber = currentGame.sessionCache[calledNumbers.length];
        } else {
          throw new Error('Game requires pre-generated sequence but none available');
        }
        // Update game state atomically
        const updatedCalledNumbers = [...calledNumbers, selectedNumber];

        return {
          ...currentGame,
          gameState: {
            ...currentGame.gameState,
            calledNumbers: updatedCalledNumbers,
            currentNumber: selectedNumber,
            updatedAt: new Date().toISOString()
          },
          _transactionMeta: {
            selectedNumber,
            updatedCalledNumbers
          }
        };
      });

      // Check if transaction was aborted or failed
      // Check if transaction was aborted or failed
      // Check if transaction was aborted or failed
      if (!transactionResult.committed) {
        throw new Error('Firebase transaction failed - connection lost');
      }

      const updatedGame = transactionResult.snapshot.val();

      // Handle case where no numbers were available
      if (updatedGame.gameState.pendingGameEnd && !updatedGame._transactionMeta) {
        return {
          success: true,
          gameEnded: true,
          hasMoreNumbers: false
        };
      }

      const selectedNumber = updatedGame._transactionMeta.selectedNumber;
      const updatedCalledNumbers = updatedGame._transactionMeta.updatedCalledNumbers;

      // Process prizes (outside transaction for performance)
      const prizeResult = await this.processNumberForPrizes(
        updatedGame,
        selectedNumber,
        updatedCalledNumbers
      );

      // Update prizes if any winners (separate update to avoid conflicts)
      if (prizeResult.hasWinners) {
        const prizeUpdates: any = {
          ...prizeResult.prizeUpdates,
          lastWinnerAnnouncement: prizeResult.announcements.join(' '),
          lastWinnerAt: new Date().toISOString()
        };

        await update(gameRef, prizeUpdates);
      }

      // Check if game should end
      const allPrizesWon = this.checkAllPrizesWon(updatedGame.prizes, prizeResult.prizeUpdates);
      const isLastNumber = updatedCalledNumbers.length >= 90;
      const shouldEndGame = allPrizesWon || isLastNumber || updatedGame.gameState.gameOver;

      // Game end check log removed for performance

      if (shouldEndGame && !updatedGame.gameState.gameOver) {

        // Set pending game end - let AudioCoordinator handle the rest
        await update(gameRef, {
          'gameState/pendingGameEnd': true,
          'gameState/isActive': false,
          'lastWinnerAnnouncement': allPrizesWon ? 'All prizes won! Game will end after audio!' : 'All numbers called! Game will end after audio!',
          'lastWinnerAt': new Date().toISOString(),
          'updatedAt': new Date().toISOString()
        });
      }



      return {
        success: true,
        gameEnded: shouldEndGame,
        hasMoreNumbers: updatedCalledNumbers.length < 90 && !shouldEndGame,
        number: selectedNumber,
        winners: prizeResult.hasWinners ? prizeResult.winners : undefined
      };

    } catch (error: any) {
      throw error;
    }
  }
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

    // Get unwon prizes (special handling for secondFullHouse)
    const unwonPrizes = Object.fromEntries(
      Object.entries(gameData.prizes).filter(([prizeId, prize]: [string, any]) => {
        // 🔧 ALWAYS include Full House (needed for Second Full House validation)
        if (prizeId === 'fullHouse') {
          return true;
        }
        // Normal prizes: only check if not won
        if (prizeId !== 'secondFullHouse') {
          return !prize.won;
        }
        // secondFullHouse: check if it's not won AND fullHouse is won
        return !prize.won && gameData.prizes.fullHouse?.won;
      })
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
    const validationResult = await validateTicketsForPrizes(
      gameData.tickets || {},
      calledNumbers,
      unwonPrizes
    );

    // Process each prize that has winners
    for (const [prizeId, prizeWinners] of Object.entries(validationResult.winners)) {
      const prizeData = prizeWinners as any;

      // ✅ FIX: Ensure all required prize properties are properly set
      const prizeUpdate = {
        ...gameData.prizes[prizeId],
        won: true,
        winners: prizeData.winners || [],
        winningNumber: number,
        wonAt: new Date().toISOString()
      };

      // ✅ FIX: Ensure critical properties exist for display components
      if (!prizeUpdate.id) {
        prizeUpdate.id = prizeId;
      }
      if (!prizeUpdate.name) {
        prizeUpdate.name = prizeData.prizeName || gameData.prizes[prizeId]?.name || prizeId;
      }
      if (!prizeUpdate.order) {
        prizeUpdate.order = gameData.prizes[prizeId]?.order || 999;
      }
      if (!prizeUpdate.pattern) {
        prizeUpdate.pattern = gameData.prizes[prizeId]?.pattern || 'Winning pattern';
      }

      prizeUpdates[`prizes/${prizeId}`] = prizeUpdate;
      allWinners[prizeId] = prizeData;

      const winnersText = prizeData.winners
        .map((w: any) => `${w.name} (T${w.ticketId})`)
        .join(', ');
      announcements.push(`${prizeData.prizeName} won by ${winnersText}!`);

      // ✅ FIX: Add debug logging for Second Full House
      if (prizeId === 'secondFullHouse') {
        // Log removed for performance
      }
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
  /**
 * Check if all ACTIVE/CONFIGURED prizes are won
 */
  private checkAllPrizesWon(currentPrizes: any, prizeUpdates: any): boolean {

    const allPrizes = { ...currentPrizes };

    // Apply updates more robustly
    if (prizeUpdates && typeof prizeUpdates === 'object') {
      for (const [updatePath, updateData] of Object.entries(prizeUpdates)) {
        if (updatePath.startsWith('prizes/')) {
          const prizeId = updatePath.replace('prizes/', '');
          allPrizes[prizeId] = { ...allPrizes[prizeId], ...updateData };
        }
      }
    }

    // Get all configured prizes (regardless of won status for filtering)
    const allConfiguredPrizes = Object.entries(allPrizes).filter(([prizeId, prize]: [string, any]) => {
      const isValid = prize &&
        prize.name &&
        typeof prize.won === 'boolean' &&
        prize.name !== '';
      return isValid;
    });

    // If no prizes configured, don't end based on prize logic
    if (allConfiguredPrizes.length === 0) {
      return false;
    }

    // Check if ALL configured prizes are won
    const wonPrizes = allConfiguredPrizes.filter(([prizeId, prize]) => prize.won === true);
    const allPrizesWon = wonPrizes.length === allConfiguredPrizes.length;

    // List each prize status for debugging
    allConfiguredPrizes.forEach(([prizeId, prize]) => {
    });

    return allPrizesWon;
  }
  /**
    * Start game with countdown setup
    */
  async startGameWithCountdown(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isCountdown': true,
        'gameState/countdownTime': 10,
        'gameState/countdownStartTime': Date.now(), // ✅ ADD: Timestamp for validation
        'gameState/isActive': false,
        'gameState/gameOver': false,
        'updatedAt': new Date().toISOString()
      });

      // ✅ FIX: Server-side safety timeout
      setTimeout(async () => {
        try {
          const gameData = await this.getGameData(gameId);
          if (gameData?.gameState.isCountdown) {
            await this.activateGameAfterCountdown(gameId);
          }
        } catch (error) {
        }
      }, 15000); // 15 second safety timeout

    } catch (error: any) {
      throw new Error(`Failed to start countdown: ${error.message}`);
    }
  }
  /**
   * Update countdown time in real-time for all users
   */
  async updateCountdownTime(gameId: string, timeLeft: number): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/countdownTime': timeLeft,
        'updatedAt': new Date().toISOString()
      });
    } catch (error: any) {
      throw new Error(`Failed to update countdown: ${error.message}`);
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
    } catch (error: any) {
      throw new Error(`Failed to activate game: ${error.message}`);
    }
  }
  /**
   * Complete pending game end (called by AudioCoordinator after all audio finishes)
   */
  async completePendingGameEnd(gameId: string): Promise<void> {
    try {

      const gameRef = ref(database, `games/${gameId}`);

      await runTransaction(gameRef, (currentGame) => {
        if (!currentGame) {
          throw new Error('Game not found');
        }

        // Only end if there's a pending game end
        if (!currentGame.gameState?.pendingGameEnd) {
          return currentGame;
        }

        return {
          ...currentGame,
          gameState: {
            ...currentGame.gameState,
            isActive: false,
            gameOver: true,
            pendingGameEnd: false,
            gameEndedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          lastWinnerAnnouncement: 'Game Over! All audio completed! 🎉'
        };
      });

      // Clean up number caller
      const numberCaller = this.numberCallers.get(gameId);
      if (numberCaller) {
        await numberCaller.cleanup();
        this.numberCallers.delete(gameId);
      }

    } catch (error: any) {
      throw new Error(error.message || 'Failed to complete pending game end');
    }
  }

  /**
   * Actually end the game after audio completion
   */
  async finalizeGameEnd(gameId: string): Promise<void> {
    try {

      const gameRef = ref(database, `games/${gameId}`);

      await runTransaction(gameRef, (currentGame) => {
        if (!currentGame) {
          throw new Error('Game not found');
        }

        return {
          ...currentGame,
          gameState: {
            ...currentGame.gameState,
            isActive: false,
            gameOver: true,
            pendingGameEnd: false,
            gameEndedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        };
      });

    } catch (error: any) {
      throw new Error(error.message || 'Failed to finalize game end');
    }
  }

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
    } catch (endError) {
    }
  }
  // ================== FIREBASE RETRY MECHANISM ==================

  /**
   * Start retrying Firebase connection in background
   */
  private async startFirebaseRetry(gameId: string): Promise<void> {
    // Don't start multiple retry loops for same game
    if (this.firebaseRetryActive.get(gameId)) {
      return;
    }

    this.firebaseRetryActive.set(gameId, true);

    // Clear any existing interval
    const existingInterval = this.firebaseRetryIntervals.get(gameId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Retry every 3 seconds
    const retryInterval = setInterval(async () => {
      try {

        // Test Firebase with a simple read
        const testRef = ref(database, `games/ ${gameId} /gameState/isActive`);
        await get(testRef);

        // Update game state to signal recovery
        await update(ref(database, `games / ${gameId} `), {
          firebaseRecovered: true,
          firebaseRecoveredAt: new Date().toISOString()
        });

        // Stop retry mechanism
        this.stopFirebaseRetry(gameId);

      } catch (error) {
      }
    }, 3000);

    this.firebaseRetryIntervals.set(gameId, retryInterval);
  }

  /**
   * Stop Firebase retry mechanism
   */
  private stopFirebaseRetry(gameId: string): void {
    const interval = this.firebaseRetryIntervals.get(gameId);
    if (interval) {
      clearInterval(interval);
      this.firebaseRetryIntervals.delete(gameId);
    }
    this.firebaseRetryActive.set(gameId, false);
  }

  /**
   * Deep merge objects for transaction updates
   */
  private deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) return target;
    if (target === null || target === undefined) return source;

    if (typeof source !== 'object' || typeof target !== 'object') {
      return source;
    }

    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  // ================== GAME OPERATIONS ==================
  // ================== SINGLETON EXPORT ==================
  /**
     * Cleanup all resources
     */
  async cleanup(): Promise<void> {

    // Cleanup all number callers
    for (const [gameId, caller] of this.numberCallers) {
      try {
        await caller.cleanup();
      } catch (error) {
      }
    }
    this.numberCallers.clear();

    // Clear retry intervals
    for (const [gameId, interval] of this.firebaseRetryIntervals) {
      clearInterval(interval);
    }
    this.firebaseRetryIntervals.clear();
    this.firebaseRetryActive.clear();

    // Cleanup mutex
    await this.gameMutex.cleanup();
  }

}
export const firebaseGame = new FirebaseGameService();

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => {
    firebaseGame.cleanup();
  });
}
