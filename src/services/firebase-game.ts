// src/services/firebase-game.ts - Game Engine: games, tickets, game business logic (Prize logic moved to prize-engine.ts)

import { 
  database, 
  firebaseCore,
  removeUndefinedValues,
  type GameData,
  type TambolaTicket,
  type Prize,
  type GameState,
  type HostSettings,
  type CreateGameConfig,
  type TicketMetadata
} from './firebase-core';

// ✅ NEW: Import prize engine for all prize-related operations
import { prizeEngine, computeTicketMetadata } from './prize-engine';

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

// ================== UTILITY FUNCTIONS ==================

interface TicketRowData {
  setId: number;
  ticketId: number;
  rowId: number;
  numbers: number[];
}

// ================== FIREBASE GAME SERVICE CLASS ==================

export class FirebaseGame {
  constructor() {
    // Initialize service
  }

  // ================== GAME CREATION ==================

  async createGame(config: CreateGameConfig): Promise<string> {
    try {
      const { hostId, hostPhone, maxTickets, selectedTicketSet, selectedPrizes } = config;
      
      console.log(`🎮 Creating game for host: ${hostId}`);
      console.log(`📞 Host phone: ${hostPhone}`);
      console.log(`🎫 Max tickets: ${maxTickets}`);
      console.log(`🎯 Selected prizes:`, selectedPrizes);

      if (!hostId) {
        throw new Error('Host ID is required');
      }

      // ✅ UPDATED: Use prize engine for prize configuration
      const prizes = prizeEngine.createPrizeConfiguration(selectedPrizes);
      
      const gameData: GameData = {
        gameId: '', // Will be set after push
        hostId,
        name: `Tambola Game - ${new Date().toLocaleDateString()}`,
        maxTickets,
        hostPhone,
        selectedTicketSet: parseInt(selectedTicketSet),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gameState: {
          isActive: false,
          isCountdown: false,
          gameOver: false,
          calledNumbers: [],
          currentNumber: null
        },
        tickets: {},
        prizes,
        hostSettings: {
          callInterval: 5,
          autoAdvance: true,
          soundEnabled: true
        }
      };

      // Generate tickets
      const generatedTickets = await this.generateTicketsForSet(parseInt(selectedTicketSet), maxTickets);
      gameData.tickets = generatedTickets;

      const gamesRef = ref(database, 'games');
      const newGameRef = push(gamesRef);
      const gameId = newGameRef.key!;
      
      gameData.gameId = gameId;
      
      await set(newGameRef, removeUndefinedValues(gameData));
      
      console.log(`✅ Game created successfully: ${gameId}`);
      return gameId;
      
    } catch (error: any) {
      console.error('❌ Error creating game:', error);
      throw new Error(error.message || 'Failed to create game');
    }
  }

  // ================== TICKET GENERATION ==================

  async generateTicketsForSet(setNumber: number, maxTickets: number): Promise<{ [ticketId: string]: TambolaTicket }> {
    try {
      console.log(`🎫 Generating ${maxTickets} tickets for set ${setNumber}`);
      
      const tickets: { [ticketId: string]: TambolaTicket } = {};
      const ticketsPerSet = 6;
      const totalSets = Math.ceil(maxTickets / ticketsPerSet);

      for (let setId = 1; setId <= totalSets; setId++) {
        const setTickets = this.generateTicketSet();
        
        for (let positionInSet = 0; positionInSet < ticketsPerSet; positionInSet++) {
          const overallTicketId = ((setId - 1) * ticketsPerSet) + positionInSet + 1;
          
          if (overallTicketId > maxTickets) break;

          const ticket = setTickets[positionInSet];
          // ✅ UPDATED: Use prize engine for metadata computation
          const metadata = prizeEngine.computeTicketMetadata(ticket);

          tickets[overallTicketId.toString()] = {
            ...ticket,
            ticketId: overallTicketId.toString(),
            setId,
            positionInSet: positionInSet + 1,
            metadata,
            isBooked: false,
            bookedAt: null,
            playerName: '',
            playerPhone: ''
          };
        }
      }

      console.log(`✅ Generated ${Object.keys(tickets).length} tickets`);
      return tickets;
      
    } catch (error: any) {
      console.error('❌ Error generating tickets:', error);
      throw new Error('Failed to generate tickets');
    }
  }

  private generateTicketSet(): TambolaTicket[] {
    const tickets: TambolaTicket[] = [];
    
    for (let i = 0; i < 6; i++) {
      tickets.push(this.generateSingleTicket());
    }
    
    return tickets;
  }

  private generateSingleTicket(): TambolaTicket {
    const ticket: number[][] = [
      Array(9).fill(0),
      Array(9).fill(0), 
      Array(9).fill(0)
    ];

    // Generate numbers for each column (1-9, 10-19, ..., 80-90)
    for (let col = 0; col < 9; col++) {
      const min = col === 0 ? 1 : col * 10;
      const max = col === 8 ? 90 : (col + 1) * 10 - 1;
      
      const columnNumbers: number[] = [];
      while (columnNumbers.length < 3) {
        const num = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!columnNumbers.includes(num)) {
          columnNumbers.push(num);
        }
      }
      
      columnNumbers.sort((a, b) => a - b);
      
      // Place numbers in random rows
      const rows = [0, 1, 2];
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      
      for (let i = 0; i < 3; i++) {
        ticket[rows[i]][col] = columnNumbers[i];
      }
    }

    // Ensure each row has exactly 5 numbers
    for (let row = 0; row < 3; row++) {
      const nonZeroIndices = ticket[row]
        .map((val, idx) => val > 0 ? idx : -1)
        .filter(idx => idx !== -1);
      
      while (nonZeroIndices.length > 5) {
        const randomIndex = Math.floor(Math.random() * nonZeroIndices.length);
        const colToRemove = nonZeroIndices[randomIndex];
        ticket[row][colToRemove] = 0;
        nonZeroIndices.splice(randomIndex, 1);
      }
    }

    return {
      ticketId: '',
      rows: ticket,
      setId: 0,
      positionInSet: 0,
      isBooked: false,
      bookedAt: null,
      playerName: '',
      playerPhone: ''
    };
  }

  // ================== TICKET LOADING FROM JSON FILES ==================

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
          throw new Error(`Ticket set file not found: ${ticketSetId}.json. Please check if the file exists in public/data/`);
        }
        throw new Error(`Failed to load ticket set ${ticketSetId}: HTTP ${response.status} ${response.statusText}`);
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

        // ✅ UPDATED: Use computeTicketMetadata for ticket loading
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

      const newTickets = await this.loadTicketsFromSet(ticketSetId, newMaxTickets);
      
      const updatedTickets: { [ticketId: string]: TambolaTicket } = {};
      
      // Preserve existing tickets
      for (const [ticketId, ticket] of Object.entries(currentTickets)) {
        if (parseInt(ticketId) <= newMaxTickets) {
          updatedTickets[ticketId] = ticket;
        }
      }
      
      // Add new tickets
      for (const [ticketId, ticket] of Object.entries(newTickets)) {
        if (!updatedTickets[ticketId]) {
          updatedTickets[ticketId] = ticket;
        }
      }

      const updates = removeUndefinedValues({
        maxTickets: newMaxTickets,
        tickets: updatedTickets,
        updatedAt: new Date().toISOString()
      });

      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, updates);
      
      console.log(`✅ Successfully expanded game ${gameId} from ${currentMaxTickets} to ${newMaxTickets} tickets`);
      console.log(`📋 Total tickets now: ${Object.keys(updatedTickets).length}`);
      console.log(`👥 Existing bookings preserved: ${Object.values(updatedTickets).filter(t => t.isBooked).length}`);
      
    } catch (error: any) {
      console.error(`❌ Error expanding game tickets for ${gameId}:`, error);
      throw new Error(error.message || 'Failed to expand tickets');
    }
  }

  async expandTickets(gameId: string, newMaxTickets: number, ticketSetId: string): Promise<void> {
    // Alias for expandGameTickets to maintain compatibility
    return this.expandGameTickets(gameId, newMaxTickets, ticketSetId);
  }

  // ================== GAME DATA RETRIEVAL ==================

  async getGameData(gameId: string): Promise<GameData | null> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const snapshot = await get(gameRef);
      
      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.val() as GameData;
      return {
        ...data,
        gameId
      };
      
    } catch (error) {
      console.error('❌ Error fetching game data:', error);
      throw new Error('Failed to fetch game data');
    }
  }

  // ================== PRIZE CONFIGURATION (DELEGATED TO PRIZE ENGINE) ==================

  /**
   * ✅ UPDATED: Delegate to prize engine
   */
  createPrizeConfiguration(selectedPrizes: string[]): { [prizeId: string]: Prize } {
    return prizeEngine.createPrizeConfiguration(selectedPrizes);
  }

  /**
   * ✅ UPDATED: Delegate to prize engine (alias for compatibility)
   */
  generatePrizes(selectedPrizes: string[]): { [prizeId: string]: Prize } {
    return prizeEngine.generatePrizes(selectedPrizes);
  }

  /**
   * ✅ UPDATED: Delegate to prize engine
   */
  async validateTicketsForPrizes(
    tickets: { [ticketId: string]: TambolaTicket },
    calledNumbers: number[],
    prizes: { [prizeId: string]: Prize }
  ): Promise<{ winners: { [prizeId: string]: any } }> {
    return prizeEngine.validateTicketsForPrizes(tickets, calledNumbers, prizes);
  }

  // ================== NUMBER CALLING LOGIC ==================

  async callNextNumber(gameId: string): Promise<{
    success: boolean;
    number?: number;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
    gameEnded?: boolean;
  }> {
    try {
      const gameData = await this.getGameData(gameId);
      if (!gameData) {
        throw new Error('Game not found');
      }

      const currentCalledNumbers = gameData.gameState.calledNumbers || [];
      const availableNumbers = Array.from({length: 90}, (_, i) => i + 1)
        .filter(num => !currentCalledNumbers.includes(num));

      if (availableNumbers.length === 0) {
        throw new Error('All numbers have been called');
      }

      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const number = availableNumbers[randomIndex];

      return this.processNumberCall(gameId, number);
      
    } catch (error: any) {
      console.error('❌ Error calling next number:', error);
      throw new Error(error.message || 'Failed to call next number');
    }
  }

  async processNumberCall(gameId: string, number: number): Promise<{
    success: boolean;
    number?: number;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
    gameEnded?: boolean;
  }> {
    return runTransaction(ref(database, `games/${gameId}`), (currentData) => {
      if (!currentData) {
        throw new Error('Game not found');
      }

      const gameData = currentData as GameData;
      
      if (!gameData.gameState.isActive) {
        throw new Error('Game is not active');
      }

      if (gameData.gameState.gameOver) {
        throw new Error('Game is already over');
      }

      const currentCalledNumbers = gameData.gameState.calledNumbers || [];
      
      if (currentCalledNumbers.includes(number)) {
        throw new Error(`Number ${number} has already been called`);
      }

      const updatedCalledNumbers = [...currentCalledNumbers, number];
      
      // Return the updated data for the transaction
      return {
        ...gameData,
        gameState: {
          ...gameData.gameState,
          calledNumbers: updatedCalledNumbers,
          currentNumber: number
        },
        updatedAt: new Date().toISOString()
      };
      
    }).then(async (result) => {
      if (!result.committed) {
        throw new Error('Transaction failed');
      }

      const gameData = result.snapshot.val() as GameData;
      const updatedCalledNumbers = gameData.gameState.calledNumbers;
      
      // ✅ UPDATED: Use prize engine for validation
      const validationResult = await this.validateTicketsForPrizes(
        gameData.tickets,
        updatedCalledNumbers,
        gameData.prizes
      );

      const announcements: string[] = [];
      const gameUpdates: any = {};

      if (Object.keys(validationResult.winners).length > 0) {
        for (const [prizeId, prizeWinners] of Object.entries(validationResult.winners)) {
          const prizeData = prizeWinners as any;
          
          gameUpdates[`prizes/${prizeId}`] = removeUndefinedValues({
            ...gameData.prizes[prizeId],
            won: true,
            winners: prizeData.winners,
            winningNumber: number,
            wonAt: new Date().toISOString()
          });

          const winnersText = prizeData.winners.map((w: any) => `${w.name} (T${w.ticketId})`).join(', ');
          announcements.push(`${prizeData.prizeName} won by ${winnersText}!`);
        }

        gameUpdates.lastWinnerAnnouncement = announcements.join(' ');
        gameUpdates.lastWinnerAt = new Date().toISOString();
      }

      const allPrizesAfterUpdate = { ...gameData.prizes };
      if (Object.keys(validationResult.winners).length > 0) {
        for (const prizeId of Object.keys(validationResult.winners)) {
          allPrizesAfterUpdate[prizeId] = { ...allPrizesAfterUpdate[prizeId], won: true };
        }
      }

      const allPrizesWon = Object.values(allPrizesAfterUpdate).every(prize => prize.won);
      let gameEnded = false;

      if (allPrizesWon || updatedCalledNumbers.length >= 90) {
        console.log(`🏁 Game ${gameId} ending - All prizes won: ${allPrizesWon}, Numbers called: ${updatedCalledNumbers.length}/90`);
        
        gameUpdates.gameState = removeUndefinedValues({
          ...gameData.gameState,
          isActive: false,
          isCountdown: false,
          gameOver: true
        });
        gameEnded = true;
      }
        
      if (Object.keys(gameUpdates).length > 0) {
        const gameRef = ref(database, `games/${gameId}`);
        await update(gameRef, gameUpdates);
      }
      
      return {
        success: true,
        number,
        winners: validationResult.winners,
        announcements,
        gameEnded
      };
      
    }).catch((error: any) => {
      console.error('❌ Error in processNumberCall:', error);
      throw new Error(error.message || 'Failed to process number call');
    });
  }

  async callNumberWithPrizeValidation(gameId: string, number: number): Promise<any> {
    // Alias for processNumberCall to maintain compatibility
    return this.processNumberCall(gameId, number);
  }

  // ================== GAME STATE MANAGEMENT ==================

  async startGame(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': true,
        'gameState/isCountdown': false,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`✅ Game ${gameId} started`);
    } catch (error) {
      console.error('❌ Error starting game:', error);
      throw new Error('Failed to start game');
    }
  }

  async pauseGame(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': false,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`⏸️ Game ${gameId} paused`);
    } catch (error) {
      console.error('❌ Error pausing game:', error);
      throw new Error('Failed to pause game');
    }
  }

  async resumeGame(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': true,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`▶️ Game ${gameId} resumed`);
    } catch (error) {
      console.error('❌ Error resuming game:', error);
      throw new Error('Failed to resume game');
    }
  }

  async endGame(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await update(gameRef, {
        'gameState/isActive': false,
        'gameState/gameOver': true,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`🏁 Game ${gameId} ended`);
    } catch (error) {
      console.error('❌ Error ending game:', error);
      throw new Error('Failed to end game');
    }
  }

  // ================== TICKET BOOKING ==================

  async bookTicket(gameId: string, ticketId: string, playerName: string, playerPhone: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const ticketPath = `tickets/${ticketId}`;
      
      await update(gameRef, {
        [`${ticketPath}/isBooked`]: true,
        [`${ticketPath}/playerName`]: playerName,
        [`${ticketPath}/playerPhone`]: playerPhone,
        [`${ticketPath}/bookedAt`]: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      console.log(`✅ Ticket ${ticketId} booked for ${playerName}`);
    } catch (error) {
      console.error('❌ Error booking ticket:', error);
      throw new Error('Failed to book ticket');
    }
  }

  // ================== UTILITY METHODS ==================

  async deleteGame(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      await remove(gameRef);
      console.log(`✅ Game ${gameId} deleted`);
    } catch (error) {
      console.error('❌ Error deleting game:', error);
      throw new Error('Failed to delete game');
    }
  }

  async updateHostSettings(gameId: string, settings: Partial<HostSettings>): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const updates: any = {};
      
      Object.entries(settings).forEach(([key, value]) => {
        updates[`hostSettings/${key}`] = value;
      });
      
      updates.updatedAt = new Date().toISOString();
      
      await update(gameRef, updates);
      console.log(`✅ Host settings updated for game ${gameId}`);
    } catch (error) {
      console.error('❌ Error updating host settings:', error);
      throw new Error('Failed to update host settings');
    }
  }

  // ================== SUBSCRIPTION METHODS ==================

  subscribeToGame(gameId: string, callback: (gameData: GameData | null) => void): () => void {
    return firebaseCore.subscribeToGame(gameId, callback);
  }

  subscribeToHostGames(hostId: string, callback: (games: GameData[]) => void): () => void {
    return firebaseCore.subscribeToHostGames(hostId, callback);
  }
}

// ================== SINGLETON EXPORT ==================

export const firebaseGame = new FirebaseGame();
