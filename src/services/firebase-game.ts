// src/services/firebase-game.ts - COMPLETE: Original Methods + Option A Enhancements

import { 
  ref, 
  set, 
  get, 
  push, 
  update, 
  remove, 
  runTransaction,
  query,
  orderByChild,
  equalTo
} from 'firebase/database';
import { database, removeUndefinedValues } from './firebase-core';
import { prizeEngine } from './prize-engine';
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

// ================== UTILITY FUNCTIONS ==================

const computeTicketMetadata = (ticket: TambolaTicket): TicketMetadata => {
  if (!ticket.rows || !Array.isArray(ticket.rows) || ticket.rows.length !== 3) {
    console.warn(`Invalid ticket structure for ${ticket.ticketId}`);
    return {
      corners: [],
      center: 0,
      hasValidCorners: false,
      hasValidCenter: false,
      allNumbers: []
    };
  }

  for (let i = 0; i < 3; i++) {
    if (!Array.isArray(ticket.rows[i]) || ticket.rows[i].length !== 9) {
      console.warn(`Invalid row ${i} for ticket ${ticket.ticketId}`);
      return {
        corners: [],
        center: 0,
        hasValidCorners: false,
        hasValidCenter: false,
        allNumbers: []
      };
    }
  }

  const corners = [
    ticket.rows[0][0], // Top-left
    ticket.rows[0][8], // Top-right
    ticket.rows[2][0], // Bottom-left
    ticket.rows[2][8]  // Bottom-right
  ].filter(num => num > 0);

  const center = ticket.rows[1][4] || 0;
  const allNumbers = ticket.rows.flat().filter(num => num > 0);

  return {
    corners,
    center,
    hasValidCorners: corners.length === 4,
    hasValidCenter: center > 0,
    allNumbers
  };
};

// ================== FIREBASE GAME SERVICE ==================

class FirebaseGameService {
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
      console.log(`🎮 Creating game for host: ${hostId}`);
      
      const gameId = push(ref(database, 'games')).key;
      if (!gameId) throw new Error('Failed to generate game ID');

      const tickets = await this.loadTicketsFromSet(ticketSetId, config.maxTickets);
      const prizes = this.createPrizeConfiguration(selectedPrizes);

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
      
      console.log(`✅ Game created successfully: ${gameId}`);
      return gameData;
      
    } catch (error: any) {
      console.error('❌ Error creating game:', error);
      throw new Error(error.message || 'Failed to create game');
    }
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
          
          const newPrizes = this.createPrizeConfiguration(updates.selectedPrizes);
          
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
      const availableNumbers = Array.from({length: 90}, (_, i) => i + 1)
        .filter(num => !calledNumbers.includes(num));

      if (availableNumbers.length === 0) {
        await this.endGame(gameId);
        return null;
      }

      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const newNumber = availableNumbers[randomIndex];

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
      
      // Try to end the game gracefully on critical errors
      try {
        await this.endGameDueToError(gameId, error.message);
      } catch (endError) {
        console.error('❌ Failed to end game after error:', endError);
      }
      
      return false; // Stop the timer
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

  // ================== PRIZE CONFIGURATION ==================

  createPrizeConfiguration(selectedPrizes: string[]): { [prizeId: string]: Prize } {
    const prizes: { [prizeId: string]: Prize } = {};
    
    selectedPrizes.forEach((prizeId, index) => {
      const prizeConfigs: { [key: string]: Omit<Prize, 'id' | 'won' | 'order'> } = {
        earlyFive: {
          name: 'Early Five', 
          pattern: 'Any 5 numbers',
          description: 'Mark any 5 numbers on your ticket'
        },
        topLine: {
          name: 'Top Line',
          pattern: 'Complete top row',
          description: 'Complete the top row of any ticket'
        },
        middleLine: {
          name: 'Middle Line',
          pattern: 'Complete middle row', 
          description: 'Complete the middle row of any ticket'
        },
        bottomLine: {
          name: 'Bottom Line',
          pattern: 'Complete bottom row',
          description: 'Complete the bottom row of any ticket'
        },
        corners: {
          name: 'Four Corners',
          pattern: '4 corner numbers', 
          description: 'Mark all 4 corner positions'
        },
        starCorner: {
          name: 'Star Corner',
          pattern: '4 corners + center',
          description: 'Mark all 4 corner positions plus center position'
        },
        halfSheet: {
          name: 'Half Sheet',
          pattern: '3 consecutive tickets from same set',
          description: 'Complete half of a traditional 6-ticket sheet (positions 1,2,3 or 4,5,6)'
        },
        fullSheet: {
          name: 'Full Sheet', 
          pattern: 'Complete 6-ticket set',
          description: 'Complete entire traditional 6-ticket sheet (positions 1,2,3,4,5,6)'
        },
        fullHouse: {
          name: 'Full House',
          pattern: 'All numbers', 
          description: 'Mark all numbers on the ticket'
        }
      };

      const config = prizeConfigs[prizeId];
      if (config) {
        prizes[prizeId] = {
          id: prizeId,
          ...config,
          won: false,
          order: index + 1
        };
      } else {
        console.warn(`❌ Unrecognized prize ID during game creation: ${prizeId}`);
        console.warn(`Available prize IDs:`, Object.keys(prizeConfigs));
      }
    });

    console.log(`🎯 Prize Creation Summary:`);
    console.log(`   Selected: [${selectedPrizes.join(', ')}]`);
    console.log(`   Created: [${Object.keys(prizes).join(', ')}]`); 
    console.log(`   Count: ${Object.keys(prizes).length}/${selectedPrizes.length}`);
    
    return prizes;
  }

  generatePrizes(selectedPrizes: string[]): { [prizeId: string]: Prize } {
    return this.createPrizeConfiguration(selectedPrizes);
  }

  // ================== VALIDATION ==================

  async validateTicketsForPrizes(tickets: { [ticketId: string]: TambolaTicket }, calledNumbers: number[], prizes: { [prizeId: string]: Prize }): Promise<{ winners: { [prizeId: string]: any } }> {
    // Use the actual prize-engine validation logic
    return await prizeEngine.validateTicketsForPrizes(tickets, calledNumbers, prizes);
  }
}

// ================== SINGLETON EXPORT ==================

export const firebaseGame = new FirebaseGameService();
