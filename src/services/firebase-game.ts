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
import { database, removeUndefinedValues } from './firebase-core'; 
import { 
  validateTicketsForPrizes, 
  createPrizeConfiguration,
  computeTicketMetadata,
  getTicketCorners,
  getStarCorners
} from './prize-engine';
import type { 
  GameData, 
  TambolaTicket, 
  Prize, 
  GameState, 
  HostSettings,
  CreateGameConfig,
  TicketMetadata
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

  // ================== TRANSACTION UTILITIES ==================

  async safeTransactionUpdate(path: string, updates: any, retries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Transaction attempt ${attempt}/${retries} for path: ${path}`);
        
        await runTransaction(ref(database, path), (currentData) => {
          if (currentData === null) {
            return updates;
          }
          return { ...currentData, ...updates };
        });
        
        console.log(`✅ Transaction successful for path: ${path}`);
        return;
        
      } catch (error: any) {
        console.error(`❌ Transaction attempt ${attempt} failed for ${path}:`, error);
        
        if (attempt === retries) {
          throw new Error(`Transaction failed after ${retries} attempts: ${error.message}`);
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // ================== GAME OPERATIONS ==================

 async createGame(config: CreateGameConfig, hostId: string, ticketSetId: string, selectedPrizes: string[]): Promise<GameData> {
  try {
    console.log(`🎮 Creating game for host: ${hostId} with database protection`);
    
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
      
      console.log('✅ Creation lock acquired, proceeding with game creation');
      
      try {
        // STEP 3: Double-check no active game exists (inside lock)
        const doubleCheckGame = await this.getHostCurrentGame(hostId);
        if (doubleCheckGame && !doubleCheckGame.gameState.gameOver) {
          throw new Error('Host created a game while we were acquiring lock');
        }
        
        // STEP 4: Proceed with actual game creation
        const gameData = await this.createGameInternal(config, hostId, ticketSetId, selectedPrizes);
        
        console.log(`✅ Game created successfully: ${gameData.gameId}`);
        return gameData;
        
      } finally {
        // STEP 5: Always clear the lock (success or failure)
        try {
          await remove(lockRef);
          console.log('✅ Creation lock released');
        } catch (lockError) {
          console.error('⚠️ Failed to release creation lock:', lockError);
        }
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error creating game with protection:', error);
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
  const prizes = createPrizeConfiguration(selectedPrizes)

  const gameData: GameData = {
    gameId,
    name: config.name,
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
      currentNumber: null
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
      console.log(`✅ Game ${gameId} deleted successfully`);
    } catch (error: any) {
      console.error('❌ Error deleting game:', error);
      throw new Error(error.message || 'Failed to delete game');
    }
  }

  async getGameData(gameId: string): Promise<GameData | null> {
    try {
      const gameSnapshot = await get(ref(database, `games/${gameId}`));
      return gameSnapshot.exists() ? gameSnapshot.val() as GameData : null;
    } catch (error) {
      console.error('Error fetching game data:', error);
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
      console.error('Error fetching host current game:', error);
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
      console.error('Error fetching active games:', error);
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
          console.log(`🏆 Processing prize changes for game: ${gameId}`);
          
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
              console.log(`✅ Preserved winner data for prize: ${prizeId}`);
            }
          });
          
          finalUpdates.prizes = newPrizes;
          delete finalUpdates.selectedPrizes;
        }
        
        finalUpdates.updatedAt = new Date().toISOString();
        
        return { ...currentGame, ...finalUpdates };
        
      } catch (error: any) {
        console.error(`❌ Error updating live game settings for ${gameId}:`, error);
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
      console.log(`💾 Updating host template for: ${hostId}`, templateSettings);
      
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
      
      console.log(`✅ Host template updated successfully for: ${hostId}`);
      
    } catch (error: any) {
      console.error(`❌ Error updating host template for ${hostId}:`, error);
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
      console.log(`🔄 Updating game and template for game: ${gameId}, host: ${hostId}`);
      
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
      
      console.log(`✅ Game and template updated successfully`);
      
    } catch (error: any) {
      console.error(`❌ Error updating game and template:`, error);
      throw error;
    }
  }

  // ================== TICKET OPERATIONS ==================

  async loadTicketsFromSet(ticketSetId: string, maxTickets: number): Promise<{ [ticketId: string]: TambolaTicket }> {
    try {
      console.log(`📁 Loading tickets from set ${ticketSetId}, maxTickets: ${maxTickets}`);
      
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

      console.log(`📊 Loaded ${rawData.length} ticket rows from set ${ticketSetId}`);

      const filteredData = rawData.filter(row => row.ticketId >= 1 && row.ticketId <= maxTickets);
      
      if (filteredData.length === 0) {
        throw new Error(`No valid tickets found in range 1-${maxTickets} for set ${ticketSetId}`);
      }

      const uniqueTicketIds = new Set(filteredData.map(row => row.ticketId));
      const availableTickets = uniqueTicketIds.size;
      
      if (availableTickets < maxTickets) {
        throw new Error(`Insufficient tickets in set ${ticketSetId}: Found ${availableTickets}, requested ${maxTickets}`);
      }

      console.log(`🎯 Filtered to ${filteredData.length} rows covering ${availableTickets} tickets`);

      const ticketGroups = new Map<number, TicketRowData[]>();
      
      for (const row of filteredData) {
        if (!row.ticketId || !row.rowId || !Array.isArray(row.numbers)) {
          console.warn(`⚠️ Invalid row structure:`, row);
          continue;
        }
        
        if (row.numbers.length !== 9) {
          console.warn(`⚠️ Invalid row length for ticket ${row.ticketId} row ${row.rowId}: expected 9, got ${row.numbers.length}`);
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
          console.warn(`⚠️ Ticket ${ticketId} has ${rows.length} rows, expected 3. Skipping.`);
          continue;
        }

        rows.sort((a, b) => a.rowId - b.rowId);
        
        const expectedRowIds = [1, 2, 3];
        const actualRowIds = rows.map(r => r.rowId);
        
        if (!expectedRowIds.every((id, index) => actualRowIds[index] === id)) {
          console.warn(`⚠️ Ticket ${ticketId} has invalid row IDs: expected [1,2,3], got [${actualRowIds.join(',')}]. Skipping.`);
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

      console.log(`✅ Successfully created ${createdTicketCount} tickets from set ${ticketSetId}`);
      console.log(`🎫 Ticket IDs: ${Object.keys(tickets).slice(0, 5).join(', ')}${createdTicketCount > 5 ? '...' : ''}`);
      
      return tickets;
      
    } catch (error: any) {
      console.error('❌ Error loading tickets from set:', error);
      throw new Error(error.message || 'Failed to load tickets from set');
    }
  }

  async expandGameTickets(gameId: string, newMaxTickets: number, ticketSetId: string): Promise<void> {
    try {
      console.log(`📈 Expanding game ${gameId} tickets to ${newMaxTickets} from set ${ticketSetId}`);
      
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

      console.log(`📊 Current game state: ${currentMaxTickets} tickets, ${Object.keys(currentTickets).length} loaded`);

      const bookedTickets = Object.values(currentTickets).filter(ticket => ticket.isBooked);
      console.log(`🎫 Preserving ${bookedTickets.length} existing bookings`);

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
      
      console.log(`✅ Successfully expanded game ${gameId} from ${currentMaxTickets} to ${newMaxTickets} tickets`);
      console.log(`📋 Total tickets now: ${newMaxTickets}`);
      console.log(`👥 Existing bookings preserved: ${bookedTickets.length}`);
      
    } catch (error: any) {
      console.error('❌ Error expanding game tickets:', error);
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
      console.log(`✅ Ticket ${ticketId} booked for ${playerName}`);
    } catch (error: any) {
      console.error('❌ Error booking ticket:', error);
      throw new Error(error.message || 'Failed to book ticket');
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
      console.log(`✅ Ticket ${ticketId} unbooked`);
    } catch (error: any) {
      console.error('❌ Error unbooking ticket:', error);
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
      console.log(`✅ Game ${gameId} started`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to start game');
    }
  }

  async pauseGame(gameId: string): Promise<void> {
    try {
      await update(ref(database, `games/${gameId}/gameState`), { isActive: false });
      console.log(`⏸️ Game ${gameId} paused`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to pause game');
    }
  }

  async resumeGame(gameId: string): Promise<void> {
    try {
      await update(ref(database, `games/${gameId}/gameState`), { isActive: true });
      console.log(`▶️ Game ${gameId} resumed`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to resume game');
    }
  }

  async endGame(gameId: string): Promise<void> {
    try {
      const updates = {
        isActive: false,
        gameOver: true
      };
      await update(ref(database, `games/${gameId}/gameState`), updates);
      console.log(`🏁 Game ${gameId} ended`);
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

    // ✅ NEW: Check for predetermined sequence first
    if (gameData.sessionCache && gameData.sessionCache.length > calledNumbers.length) {
      newNumber = gameData.sessionCache[calledNumbers.length];
      console.log(`🎯 Using predetermined number ${newNumber} (position ${calledNumbers.length + 1})`);
    } else {
      // EXISTING: Random selection fallback
      const availableNumbers = Array.from({length: 90}, (_, i) => i + 1)
        .filter(num => !calledNumbers.includes(num));

      if (availableNumbers.length === 0) {
        await this.endGame(gameId);
        return null;
      }

      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      newNumber = availableNumbers[randomIndex];
      console.log(`🎲 Using random number ${newNumber}`);
    }
      const updates = {
        calledNumbers: [...calledNumbers, newNumber],
        currentNumber: newNumber
      };

      await update(ref(database, `games/${gameId}/gameState`), updates);
      console.log(`📢 Called number ${newNumber} for game ${gameId}`);
      
      return newNumber;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to call next number');
    }
  }

  async processNumberCall(gameId: string, number: number): Promise<void> {
    try {
      await this.callNextNumber(gameId);
      // Additional processing logic can be added here
    } catch (error: any) {
      throw new Error(error.message || 'Failed to process number call');
    }
  }

  async announceWinners(gameId: string, winners: any): Promise<void> {
    try {
      const updates = {
        lastWinnerAnnouncement: JSON.stringify(winners),
        lastWinnerAt: new Date().toISOString()
      };
      await update(ref(database, `games/${gameId}`), updates);
      console.log(`🏆 Winners announced for game ${gameId}`);
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
    
    // PAUSE the timer but don't end the game
    console.log('⏸️ Firebase error - PAUSING timer, will keep retrying in background');
    
    // Start background retry mechanism
    this.startFirebaseRetry(gameId);
    
    return false;  // PAUSE the timer (but game is not ended)
  }
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
        console.log('⚠️ Game data not found - treating as temporary issue');
        return { isValid: true };
      }
      
      // Only stop for definitive end conditions
      if (gameData.gameState.gameOver) {
        return { isValid: false, reason: 'Game has ended' };
      }
      
      const calledNumbers = gameData.gameState.calledNumbers || [];
      if (calledNumbers.length >= 90) {
        return { isValid: false, reason: 'All numbers have been called' };
      }
      
      // Allow calling even if game appears inactive or in countdown
      // These might be temporary states due to network issues
      if (!gameData.gameState.isActive) {
        console.log('⚠️ Game appears inactive - but continuing anyway');
      }
      
      if (gameData.gameState.isCountdown) {
        console.log('⚠️ Game appears in countdown - but continuing anyway');
      }
      
      return { isValid: true };
      
    } catch (error: any) {
      // Don't stop for validation errors - treat as temporary
      console.log(`⚠️ Validation error - treating as temporary: ${error.message}`);
      return { isValid: true };
    }
  }

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
    
    // Use Firebase transaction for atomic operation
    const gameRef = ref(database, `games/${gameId}`);
    
    const transactionResult = await runTransaction(gameRef, (currentGame) => {
      if (!currentGame) {
        throw new Error('Game not found');
      }
      
      const calledNumbers = currentGame.gameState.calledNumbers || [];
      console.log(`🔄 Transaction: Current called numbers length: ${calledNumbers.length}`);
      
      // Select next number
      let selectedNumber: number;
      
      if (currentGame.sessionCache && currentGame.sessionCache.length > calledNumbers.length) {
        selectedNumber = currentGame.sessionCache[calledNumbers.length];
        console.log(`🎯 Transaction: Using predetermined number ${selectedNumber} (position ${calledNumbers.length + 1})`);
      } else {
        const availableNumbers = Array.from({ length: 90 }, (_, i) => i + 1)
          .filter(num => !calledNumbers.includes(num));
        
        if (availableNumbers.length === 0) {
          console.log(`🏁 Transaction: No more numbers available - setting pending end`);
          // Set pending end instead of immediate end - but we need a number first
          // Return without calling a number since there are none left
          return {
            ...currentGame,
            gameState: {
              ...currentGame.gameState,
              pendingGameEnd: true,
              updatedAt: new Date().toISOString()
            }
          };
        }
        
        const randomIndex = Math.floor(Math.random() * availableNumbers.length);
        selectedNumber = availableNumbers[randomIndex];
        console.log(`🎲 Transaction: Using random number ${selectedNumber}`);
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
      console.log(`❌ Firebase transaction failed - connection issue`);
      throw new Error('Firebase transaction failed - connection lost');
    }
    
    const updatedGame = transactionResult.snapshot.val();
    
    // Handle case where no numbers were available
    if (updatedGame.gameState.pendingGameEnd && !updatedGame._transactionMeta) {
      console.log(`🏁 No more numbers available - game should end after current state`);
      return {
        success: true,
        gameEnded: true,
        hasMoreNumbers: false
      };
    }
    
    const selectedNumber = updatedGame._transactionMeta.selectedNumber;
    const updatedCalledNumbers = updatedGame._transactionMeta.updatedCalledNumbers;
    
    console.log(`✅ Transaction committed: Number ${selectedNumber} called successfully`);
    
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
      console.log(`🏆 Prize updates applied for number ${selectedNumber}`);
    }
    
    // Check if game should end
    const allPrizesWon = this.checkAllPrizesWon(updatedGame.prizes, prizeResult.prizeUpdates);
    const isLastNumber = updatedCalledNumbers.length >= 90;
    const shouldEndGame = allPrizesWon || isLastNumber || updatedGame.gameState.gameOver;
    
   if (shouldEndGame && !updatedGame.gameState.gameOver && !updatedGame.gameState.pendingGameEnd) {
      console.log(`🏁 Game should end after audio: allPrizesWon=${allPrizesWon}, isLastNumber=${isLastNumber}`);
      
      // Set pending end in Firebase for all clients to see
      await update(gameRef, {
        'gameState/pendingGameEnd': true,
        'updatedAt': new Date().toISOString()
      });
      
      console.log(`✅ Pending game end set in Firebase`);
    }
    
    return {
      success: true,
      gameEnded: shouldEndGame,
      hasMoreNumbers: updatedCalledNumbers.length < 90 && !updatedGame.gameState.pendingGameEnd,
      number: selectedNumber,
      winners: prizeResult.hasWinners ? prizeResult.winners : undefined
    };
        
      } catch (error: any) {
        console.error('❌ Error in processCompleteNumberCall transaction:', error);
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
    console.log(`🔧 Second Full House prize update:`, {
      prizeId,
      won: prizeUpdate.won,
      winnersCount: prizeData.winners?.length || 0,
      hasName: !!prizeUpdate.name,
      hasOrder: !!prizeUpdate.order,
      prizeUpdate
    });
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
      
      console.log(`✅ Game countdown started: ${gameId}`);
      
      // ✅ FIX: Server-side safety timeout
      setTimeout(async () => {
        try {
          const gameData = await this.getGameData(gameId);
          if (gameData?.gameState.isCountdown) {
            console.warn(`🚨 Countdown timeout detected for game ${gameId} - force activating`);
            await this.activateGameAfterCountdown(gameId);
          }
        } catch (error) {
          console.error('❌ Countdown timeout safety check failed:', error);
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
    
    console.log(`✅ Countdown updated: ${timeLeft}s remaining for game ${gameId}`);
  } catch (error: any) {
    console.error('❌ Failed to update countdown time:', error);
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
      
      console.log(`✅ Game activated after countdown: ${gameId}`);
    } catch (error: any) {
      throw new Error(`Failed to activate game: ${error.message}`);
    }
  }
  /**
   * Actually end the game after audio completion
   */
  async finalizeGameEnd(gameId: string): Promise<void> {
    try {
      console.log(`🏁 Finalizing game end for ${gameId}`);
      
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
      
      console.log(`✅ Game ${gameId} ended successfully after audio completion`);
      
    } catch (error: any) {
      console.error('❌ Failed to finalize game end:', error);
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
      
      console.log(`🚨 Game ended due to error: ${gameId}`);
    } catch (endError) {
      console.error('❌ Failed to end game after error:', endError);
    }
  }
// ================== FIREBASE RETRY MECHANISM ==================
  
  /**
   * Start retrying Firebase connection in background
   */
  private async startFirebaseRetry(gameId: string): Promise<void> {
    // Don't start multiple retry loops for same game
    if (this.firebaseRetryActive.get(gameId)) {
      console.log('🔄 Firebase retry already active for game:', gameId);
      return;
    }
    
    this.firebaseRetryActive.set(gameId, true);
    console.log('🔄 Starting Firebase retry mechanism for game:', gameId);
    
    // Clear any existing interval
    const existingInterval = this.firebaseRetryIntervals.get(gameId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }
    
    // Retry every 3 seconds
    const retryInterval = setInterval(async () => {
      try {
        console.log('🔄 Attempting Firebase connection test...');
        
        // Test Firebase with a simple read
        const testRef = ref(database, `games/${gameId}/gameState/isActive`);
        await get(testRef);
        
        console.log('✅ Firebase connection restored!');
        
        // Update game state to signal recovery
        await update(ref(database, `games/${gameId}`), {
          firebaseRecovered: true,
          firebaseRecoveredAt: new Date().toISOString()
        });
        
        // Stop retry mechanism
        this.stopFirebaseRetry(gameId);
        
      } catch (error) {
        console.log('❌ Firebase still unavailable, will retry in 3 seconds...');
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
    console.log('🛑 Stopped Firebase retry mechanism for game:', gameId);
  }
}

  // ================== SINGLETON EXPORT ==================

export const firebaseGame = new FirebaseGameService();


