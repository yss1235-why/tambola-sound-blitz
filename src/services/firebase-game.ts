// src/services/firebase-game.ts - Game Engine: games, tickets, prizes, game business logic

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
    ticket.rows[0][0],
    ticket.rows[0][8],
    ticket.rows[2][0],
    ticket.rows[2][8]
  ];

  const center = ticket.rows[1][4];
  const validCorners = corners.filter(n => n > 0);
  const hasValidCorners = validCorners.length === 4;
  const hasValidCenter = center > 0;
  const allNumbers = ticket.rows.flat().filter(n => n > 0);

  return {
    corners: validCorners,
    center,
    hasValidCorners,
    hasValidCenter,
    allNumbers
  };
};

// ✅ NEW: Dynamic corner detection functions for the fix
const getTicketCorners = (ticket: TambolaTicket): number[] => {
  const topRow = ticket.rows[0].filter(n => n > 0);
  const bottomRow = ticket.rows[2].filter(n => n > 0);
  
  return [
    topRow[0],     // First top
    topRow[4],     // Last top (guaranteed 5 numbers)
    bottomRow[0],  // First bottom  
    bottomRow[4]   // Last bottom
  ];
};

const getStarCorners = (ticket: TambolaTicket): number[] => {
  const corners = getTicketCorners(ticket);
  const middleRow = ticket.rows[1].filter(n => n > 0);
  const center = middleRow[2]; // Center number (guaranteed 5 numbers)
  
  return [...corners, center];
};

// ================== FIREBASE GAME SERVICE CLASS ==================

export class FirebaseGame {
  private cleanupInProgress = new Set<string>();
  
  // ================== RACE CONDITION PREVENTION ==================

  private activeLocks = new Map<string, Promise<any>>();

  /**
   * ✅ RACE CONDITION PREVENTION: Ensure only one update per game at a time
   */
  private async withGameLock<T>(gameId: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = `game_${gameId}`;
    
    if (this.activeLocks.has(lockKey)) {
      console.log(`⏳ Waiting for existing operation on game: ${gameId}`);
      await this.activeLocks.get(lockKey);
    }
    
    const operationPromise = (async () => {
      try {
        console.log(`🔒 Acquired lock for game: ${gameId}`);
        return await operation();
      } finally {
        console.log(`🔓 Released lock for game: ${gameId}`);
        this.activeLocks.delete(lockKey);
      }
    })();
    
    this.activeLocks.set(lockKey, operationPromise);
    return operationPromise;
  }

  // ================== ENHANCED SINGLE SOURCE UPDATES ==================

  /**
   * ✅ SINGLE SOURCE OF TRUTH: Update live game settings with atomic transactions
   * CRITICAL: This is the ONLY function that should update live game settings
   */
  async updateLiveGameSettings(gameId: string, updates: {
    maxTickets?: number;
    hostPhone?: string;
    ticketPrice?: number;
  }): Promise<void> {
    return this.withGameLock(gameId, async () => {
      try {
        console.log(`🔧 Updating live game settings for ${gameId}:`, updates);
        
        const gameRef = ref(database, `games/${gameId}`);
        const snapshot = await get(gameRef);
        
        if (!snapshot.exists()) {
          throw new Error('Game not found');
        }

        const gameData = snapshot.val() as GameData;
        
        if (gameData.gameState.isActive) {
          throw new Error('Cannot update settings while game is active');
        }

        const gameUpdates = removeUndefinedValues({
          ...updates,
          updatedAt: new Date().toISOString()
        });

        await update(gameRef, gameUpdates);
        console.log(`✅ Live game settings updated successfully for ${gameId}`);
        
      } catch (error: any) {
        console.error(`❌ Error updating live game settings for ${gameId}:`, error);
        throw new Error(error.message || 'Failed to update live game settings');
      }
    });
  }

  /**
   * ✅ ATOMIC UPDATE: Update both game and host settings in a single transaction
   */
  async updateGameAndHostSettings(gameId: string, gameUpdates: any, hostId: string, hostUpdates: any): Promise<void> {
    return this.withGameLock(gameId, async () => {
      try {
        console.log(`🔧 Atomic update for game ${gameId} and host ${hostId}`);
        
        const updates: { [path: string]: any } = {};
        
        if (gameUpdates && Object.keys(gameUpdates).length > 0) {
          for (const [key, value] of Object.entries(gameUpdates)) {
            updates[`games/${gameId}/${key}`] = value;
          }
          updates[`games/${gameId}/updatedAt`] = new Date().toISOString();
        }
        
        if (hostUpdates && Object.keys(hostUpdates).length > 0) {
          for (const [key, value] of Object.entries(hostUpdates)) {
            updates[`hostSettings/${hostId}/${key}`] = value;
          }
          updates[`hostSettings/${hostId}/updatedAt`] = new Date().toISOString();
        }
        
        if (Object.keys(updates).length === 0) {
          console.log('⚠️ No updates to apply');
          return;
        }

        await update(ref(database), removeUndefinedValues(updates));
        console.log(`✅ Atomic update completed successfully`);
        
      } catch (error: any) {
        console.error(`❌ Error in atomic update:`, error);
        throw new Error(error.message || 'Failed to update game and host settings');
      }
    });
  }

  // ================== GAME MANAGEMENT ==================

  async createGame(config: CreateGameConfig, hostId: string, selectedPrizes: string[]): Promise<string> {
    try {
      console.log('🎮 Creating game with config:', config);
      console.log('🏆 Selected prizes:', selectedPrizes);

      if (!config.name || !config.maxTickets || !config.ticketPrice || !config.hostPhone) {
        throw new Error('Missing required game configuration');
      }

      if (config.maxTickets < 1 || config.maxTickets > 600) {
        throw new Error('Max tickets must be between 1 and 600');
      }

      if (config.ticketPrice < 0) {
        throw new Error('Ticket price cannot be negative');
      }

      if (selectedPrizes.length === 0) {
        throw new Error('At least one prize must be selected');
      }

      // Check if host already has an active game
      const existingGame = await this.getHostCurrentGame(hostId);
      if (existingGame && existingGame.gameState.isActive && !existingGame.gameState.gameOver) {
        throw new Error('Host already has an active game. Please end the current game first.');
      }

      const gameRef = push(ref(database, 'games'));
      const gameId = gameRef.key!;

      const gameState: GameState = {
        isActive: false,
        isCountdown: false,
        countdownTime: 0,
        gameOver: false,
        calledNumbers: [],
        currentNumber: null
      };

      const prizes = this.generatePrizes(selectedPrizes);

      const gameData: GameData = {
        gameId,
        name: config.name,
        hostId,
        hostPhone: config.hostPhone,
        createdAt: new Date().toISOString(),
        maxTickets: config.maxTickets,
        ticketPrice: config.ticketPrice,
        gameState,
        tickets: {},
        prizes,
        updatedAt: new Date().toISOString()
      };

      await set(gameRef, removeUndefinedValues(gameData));
      console.log(`✅ Game created successfully with ID: ${gameId}`);
      
      return gameId;
      
    } catch (error: any) {
      console.error('❌ Error creating game:', error);
      throw new Error(error.message || 'Failed to create game');
    }
  }

  async deleteGame(gameId: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting game: ${gameId}`);
      
      const gameRef = ref(database, `games/${gameId}`);
      await remove(gameRef);
      
      console.log(`✅ Game ${gameId} deleted successfully`);
    } catch (error: any) {
      console.error('❌ Error deleting game:', error);
      throw new Error(error.message || 'Failed to delete game');
    }
  }

  async getHostCurrentGame(hostId: string): Promise<GameData | null> {
    try {
      const gamesRef = ref(database, 'games');
      const hostGamesQuery = query(gamesRef, orderByChild('hostId'), equalTo(hostId));
      const snapshot = await get(hostGamesQuery);
      
      if (!snapshot.exists()) {
        return null;
      }

      const hostGames = Object.values(snapshot.val()) as GameData[];
      
      if (hostGames.length === 0) {
        return null;
      }

      // Return the most recent game
      const latestGame = hostGames.reduce((latest, current) => 
        new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
      );

      return latestGame;
    } catch (error: any) {
      console.error('Error getting host current game:', error);
      return null;
    }
  }

  // ================== TICKET OPERATIONS ==================

  async loadTicketsFromSet(ticketSetId: string, maxTickets: number): Promise<{ [ticketId: string]: TambolaTicket }> {
    try {
      console.log(`🎫 Loading ${maxTickets} tickets from set ${ticketSetId}`);
      
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

  async expandTickets(gameId: string, newMaxTickets: number, ticketSetId: string): Promise<void> {
    return this.withGameLock(gameId, async () => {
      try {
        console.log(`🎫 Expanding tickets for game ${gameId} from set ${ticketSetId} to ${newMaxTickets}`);
        
        const gameData = await firebaseCore.getGameData(gameId);
        
        if (!gameData) {
          throw new Error('Game not found');
        }

        if (gameData.gameState.isActive) {
          throw new Error('Cannot expand tickets while game is active');
        }

        const currentMaxTickets = gameData.maxTickets;
        
        if (newMaxTickets <= currentMaxTickets) {
          throw new Error(`New max tickets (${newMaxTickets}) must be greater than current (${currentMaxTickets})`);
        }

        if (newMaxTickets > 600) {
          throw new Error('Maximum allowed tickets is 600');
        }

        // Load all tickets up to new max
        const allTickets = await this.loadTicketsFromSet(ticketSetId, newMaxTickets);
        
        // Preserve existing bookings
        const currentTickets = gameData.tickets || {};
        for (const [ticketId, currentTicket] of Object.entries(currentTickets)) {
          if (allTickets[ticketId] && currentTicket.isBooked) {
            allTickets[ticketId] = {
              ...allTickets[ticketId],
              isBooked: currentTicket.isBooked,
              playerName: currentTicket.playerName,
              playerPhone: currentTicket.playerPhone,
              bookedAt: currentTicket.bookedAt,
              markedNumbers: currentTicket.markedNumbers || []
            };
          }
        }

        const gameRef = ref(database, `games/${gameId}`);
        await update(gameRef, {
          maxTickets: newMaxTickets,
          tickets: allTickets,
          updatedAt: new Date().toISOString()
        });

        console.log(`✅ Successfully expanded game ${gameId} to ${newMaxTickets} tickets`);
        
      } catch (error: any) {
        console.error('❌ Error expanding tickets:', error);
        throw new Error(error.message || 'Failed to expand tickets');
      }
    });
  }

  async expandGameTickets(gameId: string, newMaxTickets: number, ticketSetId: string): Promise<void> {
    // Alias for expandTickets to maintain compatibility
    return this.expandTickets(gameId, newMaxTickets, ticketSetId);
  }

  async bookTicket(gameId: string, ticketId: string, playerName: string, playerPhone: string): Promise<void> {
    try {
      console.log(`🎫 Booking ticket ${ticketId} for ${playerName} in game ${gameId}`);
      
      if (!playerName.trim()) {
        throw new Error('Player name is required');
      }

      if (!playerPhone.trim()) {
        throw new Error('Player phone is required');
      }

      const gameData = await firebaseCore.getGameData(gameId);
      
      if (!gameData) {
        throw new Error('Game not found');
      }

      if (gameData.gameState.isActive) {
        throw new Error('Cannot book tickets while game is active');
      }

      const ticket = gameData.tickets[ticketId];
      
      if (!ticket) {
        throw new Error('Ticket not found');
      }

      if (ticket.isBooked) {
        throw new Error('Ticket is already booked');
      }

      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      await update(ticketRef, {
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        bookedAt: new Date().toISOString()
      });

      console.log(`✅ Ticket ${ticketId} booked successfully for ${playerName}`);
      
    } catch (error: any) {
      console.error('❌ Error booking ticket:', error);
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  // ================== PRIZE LOGIC ==================

  generatePrizes(selectedPrizes: string[]): { [prizeId: string]: Prize } {
    const availablePrizes = {
      firstHouse: {
        id: 'firstHouse',
        name: 'First House',
        pattern: 'All numbers',
        description: 'First to mark all numbers on the ticket',
        won: false,
        order: 1
      },
      corners: {
        id: 'corners',
        name: 'Corners',
        pattern: '4 corners',
        description: 'Mark all 4 corner positions of any ticket',
        won: false,
        order: 2
      },
      topLine: {
        id: 'topLine',
        name: 'Top Line',
        pattern: 'Complete top row',
        description: 'Complete the top row of any ticket',
        won: false,
        order: 3
      },
      middleLine: {
        id: 'middleLine',
        name: 'Middle Line',
        pattern: 'Complete middle row',
        description: 'Complete the middle row of any ticket',
        won: false,
        order: 4
      },
      bottomLine: {
        id: 'bottomLine',
        name: 'Bottom Line',
        pattern: 'Complete bottom row',
        description: 'Complete the bottom row of any ticket',
        won: false,
        order: 5
      },
      starCorner: {
        id: 'starCorner',
        name: 'Star Corner',
        pattern: '4 corners + center',
        description: 'Mark all 4 corner positions plus center position',
        won: false,
        order: 6
      },
      fullHouse: {
        id: 'fullHouse',
        name: 'Full House',
        pattern: 'All numbers',
        description: 'Mark all numbers on the ticket',
        won: false,
        order: 7
      }
    };

    const prizes: { [prizeId: string]: Prize } = {};
    for (const prizeId of selectedPrizes) {
      if (availablePrizes[prizeId as keyof typeof availablePrizes]) {
        prizes[prizeId] = availablePrizes[prizeId as keyof typeof availablePrizes];
      }
    }

    return prizes;
  }

  async validateTicketsForPrizes(
    tickets: { [ticketId: string]: TambolaTicket },
    calledNumbers: number[],
    prizes: { [prizeId: string]: Prize }
  ): Promise<{ winners: { [prizeId: string]: any } }> {
    const startTime = Date.now();
    const winners: { [prizeId: string]: any } = {};

    for (const [prizeId, prize] of Object.entries(prizes)) {
      if (prize.won) continue;

      const prizeWinners: { name: string; ticketId: string; phone?: string }[] = [];

      for (const [ticketId, ticket] of Object.entries(tickets)) {
        if (!ticket.isBooked) continue;

        let hasWon = false;

        try {
          switch (prizeId) {
            case 'firstHouse':
            case 'fullHouse':
              hasWon = ticket.metadata?.allNumbers.every(num => calledNumbers.includes(num));
              break;

            case 'earlyFive':
              hasWon = ticket.metadata?.allNumbers.filter(num => calledNumbers.includes(num)).length >= 5;
              break;

            case 'anyLine':
              hasWon = ticket.rows.some(row => 
                row.filter(num => num > 0).every(num => calledNumbers.includes(num))
              );
              break;

            case 'twoLines':
              const completedLines = ticket.rows.filter(row => 
                row.filter(num => num > 0).every(num => calledNumbers.includes(num))
              );
              hasWon = completedLines.length >= 2;
              break;

            case 'breakfast':
              if (ticket.setId && ticket.positionInSet) {
                const setId = ticket.setId;
                const position = ticket.positionInSet;
                
                if ([1, 2].includes(setId) && [1, 2, 3, 4, 5, 6].includes(position)) {
                  const targetPositions = position <= 3 ? [1, 2, 3] : [4, 5, 6];
                  
                  const sameSetTickets = Object.values(tickets).filter(t => 
                    t.isBooked && t.setId === setId && 
                    targetPositions.includes(t.positionInSet || 0)
                  );
                  
                  if (sameSetTickets.length === 3) {
                    hasWon = sameSetTickets.every(t => {
                      const markedCount = t.metadata?.allNumbers.filter(num => 
                        calledNumbers.includes(num)
                      ).length || 0;
                      return markedCount >= 2;
                    });
                  }
                }
              }
              break;

            case 'topLine':
              hasWon = ticket.rows[0].filter(num => num > 0).every(num => calledNumbers.includes(num));
              break;

            case 'middleLine':
              hasWon = ticket.rows[1].filter(num => num > 0).every(num => calledNumbers.includes(num));
              break;

            case 'bottomLine':
              hasWon = ticket.rows[2].filter(num => num > 0).every(num => calledNumbers.includes(num));
              break;

            // ✅ FIXED: Dynamic corner detection instead of metadata
            case 'corners':
              const corners = getTicketCorners(ticket);
              hasWon = corners.every(corner => calledNumbers.includes(corner));
              console.log(`🎯 Corners check:`, { ticketId, corners, hasWon });
              break;

            // ✅ FIXED: Dynamic star corner detection instead of metadata
            case 'starCorner':
              const starCorners = getStarCorners(ticket);
              hasWon = starCorners.every(corner => calledNumbers.includes(corner));
              console.log(`⭐ Star corners check:`, { ticketId, starCorners, hasWon });
              break;

            default:
              console.warn(`Unknown prize type: ${prizeId} - skipping validation`);
              continue;
          }
        } catch (error) {
          console.error(`Prize validation error for ${prizeId} on ticket ${ticketId}:`, error);
          hasWon = false;
        }

        if (hasWon) {
          prizeWinners.push({
            name: ticket.playerName,
            ticketId: ticket.ticketId,
            phone: ticket.playerPhone
          });
        }
      }

      if (prizeWinners.length > 0) {
        winners[prizeId] = {
          prizeName: prize.name,
          winners: prizeWinners
        };
      }
    }

    const endTime = Date.now();
    if (process.env.NODE_ENV === 'development' && endTime - startTime > 50) {
      console.warn(`Slow prize validation: ${endTime - startTime}ms for ${Object.keys(tickets).length} tickets`);
    }

    return { winners };
  }

  // ================== NUMBER CALLING LOGIC ==================

  async processNumberCall(gameId: string, number: number): Promise<any> {
    return this.withGameLock(gameId, async () => {
      try {
        console.log(`📞 Processing number call: ${number} for game ${gameId}`);
        
        if (number < 1 || number > 90) {
          throw new Error('Number must be between 1 and 90');
        }

        const gameData = await firebaseCore.getGameData(gameId);
        
        if (!gameData) {
          throw new Error('Game not found');
        }

        if (!gameData.gameState.isActive || gameData.gameState.gameOver) {
          throw new Error('Game is not active');
        }

        const currentCalledNumbers = gameData.gameState.calledNumbers || [];
        
        if (currentCalledNumbers.includes(number)) {
          throw new Error(`Number ${number} has already been called`);
        }

        const updatedCalledNumbers = [...currentCalledNumbers, number];
        
        // Validate prizes
        const validationResult = await this.validateTicketsForPrizes(
          gameData.tickets,
          updatedCalledNumbers,
          gameData.prizes
        );

        const gameRef = ref(database, `games/${gameId}`);
        const gameUpdates: any = {
          gameState: removeUndefinedValues({
            ...gameData.gameState,
            calledNumbers: updatedCalledNumbers,
            currentNumber: number
          }),
          updatedAt: new Date().toISOString()
        };

        const announcements: string[] = [];

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
            calledNumbers: updatedCalledNumbers,
            currentNumber: number,
            isActive: false,
            isCountdown: false,
            gameOver: true
          });
          gameEnded = true;
        }
          
        await update(gameRef, gameUpdates);
        
        return {
          success: true,
          number,
          winners: validationResult.winners,
          announcements,
          gameEnded
        };
        
      } catch (error: any) {
        console.error('❌ Error in processNumberCall:', error);
        throw new Error(error.message || 'Failed to process number call');
      }
    });
  }

  async callNumberWithPrizeValidation(gameId: string, number: number): Promise<any> {
    // Alias for processNumberCall to maintain compatibility
    return this.processNumberCall(gameId, number);
  }
}

// ================== SINGLETON EXPORT ==================

export const firebaseGame = new FirebaseGame();
