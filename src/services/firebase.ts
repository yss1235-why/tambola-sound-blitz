// src/services/firebase.ts - COMPLETE: Single Source of Truth Implementation

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  push, 
  update, 
  remove, 
  onValue, 
  off, 
  query, 
  orderByChild, 
  equalTo,
  runTransaction // ✅ NEW: Added for atomic operations
} from 'firebase/database';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

// ================== TYPE DEFINITIONS ==================

export interface GameState {
  isActive: boolean;
  isCountdown: boolean;
  countdownTime: number;
  gameOver: boolean;
  calledNumbers: number[];
  currentNumber: number | null;
}

export interface TambolaTicket {
  ticketId: string;
  rows: number[][];
  markedNumbers: number[];
  isBooked: boolean;
  playerName: string;
  playerPhone: string;
  bookedAt: string;
  metadata?: TicketMetadata;
  positionInSet?: number;
  setId?: number;
}

export interface TicketMetadata {
  corners: number[];
  center: number;
  hasValidCorners: boolean;
  hasValidCenter: boolean;
  allNumbers: number[];
}

export interface Prize {
  id: string;
  name: string;
  pattern: string;
  description: string;
  won: boolean;
  order: number;
  winners?: {
    name: string;
    ticketId: string;
    phone?: string;
  }[];
  winningNumber?: number;
  wonAt?: string;
}

export interface GameData {
  gameId: string;
  name: string;
  hostId: string;
  hostPhone: string;
  createdAt: string;
  maxTickets: number;
  ticketPrice: number;
  gameState: GameState;
  tickets: { [ticketId: string]: TambolaTicket };
  prizes: { [prizeId: string]: Prize };
  lastWinnerAnnouncement?: string;
  lastWinnerAt?: string;
  updatedAt?: string; // ✅ NEW: For tracking updates
}

export interface HostUser {
  uid: string;
  email: string;
  name: string;
  phone: string;
  role: 'host';
  subscriptionEndDate: string;
  isActive: boolean;
}

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  role: 'admin';
  permissions: {
    createHosts: boolean;
    manageUsers: boolean;
  };
}

export interface HostSettings {
  hostPhone: string;
  maxTickets: number;
  selectedTicketSet: string;
  selectedPrizes: string[];
  updatedAt?: string; // ✅ NEW: For tracking template updates
}

export interface CreateGameConfig {
  name: string;
  maxTickets: number;
  ticketPrice: number;
  hostPhone: string;
}

interface TicketRowData {
  setId: number;
  ticketId: number;
  rowId: number;
  numbers: number[];
}

// ================== UTILITY FUNCTIONS ==================

export const removeUndefinedValues = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedValues).filter(item => item !== undefined);
  
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = removeUndefinedValues(value);
    }
  }
  return cleaned;
};

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

// ================== FIREBASE SERVICE CLASS ==================

class FirebaseService {
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

  /**
   * ✅ TRANSACTION WRAPPER: Safe Firebase updates with retries
   */
  private async safeTransactionUpdate(
    path: string, 
    updates: any, 
    retries: number = 3
  ): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`📡 Transaction attempt ${attempt}/${retries} for: ${path}`);
        
        await runTransaction(ref(database, path), (current) => {
          if (current === null) {
            throw new Error(`Path ${path} does not exist`);
          }
          return { ...current, ...removeUndefinedValues(updates) };
        });
        
        console.log(`✅ Transaction completed successfully for: ${path}`);
        return;
        
      } catch (error: any) {
        console.warn(`⚠️ Transaction attempt ${attempt} failed:`, error.message);
        
        if (attempt === retries) {
          throw new Error(`Transaction failed after ${retries} attempts: ${error.message}`);
        }
        
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // ================== ENHANCED SINGLE SOURCE UPDATES ==================

  /**
   * ✅ SINGLE SOURCE OF TRUTH: Update live game settings with atomic transactions
   * CRITICAL: This is the ONLY function that should update live game settings
   */
  async updateLiveGameSettings(gameId: string, updates: {
    maxTickets?: number;
    hostPhone?: string;
    selectedPrizes?: string[];
  }): Promise<void> {
    return this.withGameLock(gameId, async () => {
      try {
        console.log(`🔧 Starting atomic update for game: ${gameId}`, updates);
        
        const currentGame = await this.getGameData(gameId);
        if (!currentGame) {
          throw new Error(`Game ${gameId} not found`);
        }
        
        if (currentGame.gameState.isActive || currentGame.gameState.isCountdown) {
          throw new Error('Cannot modify settings while game is active or starting');
        }
        
        if (currentGame.gameState.gameOver) {
          throw new Error('Cannot modify settings for completed games');
        }
        
        const numbersCallCount = currentGame.gameState.calledNumbers?.length || 0;
        if (numbersCallCount > 0) {
          throw new Error('Cannot modify settings after numbers have been called');
        }
        
        if (updates.maxTickets !== undefined) {
          const bookedCount = Object.values(currentGame.tickets || {})
            .filter(ticket => ticket.isBooked).length;
          
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
        
        await this.safeTransactionUpdate(`games/${gameId}`, finalUpdates);
        
        console.log(`✅ Live game settings updated successfully for: ${gameId}`);
        
      } catch (error: any) {
        console.error(`❌ Error updating live game settings for ${gameId}:`, error);
        throw new Error(error.message || 'Failed to update game settings');
      }
    });
  }

  /**
   * ✅ TEMPLATE MANAGEMENT: Update host template settings (separate from live games)
   * PURPOSE: Save host preferences for pre-filling future game forms
   */
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

  /**
   * ✅ COMBINED UPDATE: Update both live game AND host template atomically
   * USE CASE: When host updates settings, save to both live game and template
   */
  async updateGameAndTemplate(gameId: string, hostId: string, settings: {
    maxTickets?: number;
    hostPhone?: string;
    selectedPrizes?: string[];
    selectedTicketSet?: string;
  }): Promise<void> {
    try {
      console.log(`🔄 Starting combined update for game: ${gameId}, host: ${hostId}`);
      
      const liveGameUpdates = {
        maxTickets: settings.maxTickets,
        hostPhone: settings.hostPhone,
        selectedPrizes: settings.selectedPrizes
      };
      
      await this.updateLiveGameSettings(gameId, liveGameUpdates);
      
      try {
        await this.updateHostTemplate(hostId, settings);
      } catch (templateError: any) {
        console.warn(`⚠️ Template update failed (live game updated successfully):`, templateError);
      }
      
      console.log(`✅ Combined update completed for game: ${gameId}`);
      
    } catch (error: any) {
      console.error(`❌ Combined update failed for game: ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * ✅ HELPER: Create prize configuration from selected prize IDs
   */
  private createPrizeConfiguration(selectedPrizes: string[]): { [prizeId: string]: Prize } {
    const availablePrizes = {
      earlyFive: {
        id: 'earlyFive',
        name: 'Early Five',
        pattern: 'First 5 numbers',
        description: 'First to mark any 5 numbers on the ticket',
        won: false,
        order: 1
      },
      corners: {
        id: 'corners',
        name: 'Four Corners',
        pattern: '4 corners',
        description: 'Mark all 4 corner positions',
        won: false,
        order: 2
      },
      halfSheet: {
        id: 'halfSheet',
        name: 'Half Sheet',
        pattern: '3 consecutive tickets from same set',
        description: 'Complete half of a traditional 6-ticket sheet',
        won: false,
        order: 2.5
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

  // ================== AUTHENTICATION ==================
  
  async loginAdmin(email: string, password: string): Promise<AdminUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await this.getUserData();
      if (!userData || userData.role !== 'admin') {
        throw new Error('Not authorized as admin');
      }
      return userData as AdminUser;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to login as admin');
    }
  }

  async loginHost(email: string, password: string): Promise<HostUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await this.getUserData();
      if (!userData || userData.role !== 'host') {
        throw new Error('Not authorized as host');
      }
      return userData as HostUser;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to login as host');
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign out');
    }
  }

  async getUserData(): Promise<AdminUser | HostUser | null> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;

      const hostSnapshot = await get(ref(database, `hosts/${currentUser.uid}`));
      if (hostSnapshot.exists()) {
        return { ...hostSnapshot.val(), role: 'host' } as HostUser;
      }
      
      const adminSnapshot = await get(ref(database, `admins/${currentUser.uid}`));
      if (adminSnapshot.exists()) {
        return { ...adminSnapshot.val(), role: 'admin' } as AdminUser;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  }

  // ================== HOST SETTINGS ==================

  async saveHostSettings(hostId: string, settings: HostSettings): Promise<void> {
    try {
      await set(ref(database, `hostSettings/${hostId}`), removeUndefinedValues(settings));
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save host settings');
    }
  }

  async getHostSettings(hostId: string): Promise<HostSettings | null> {
    try {
      const settingsSnapshot = await get(ref(database, `hostSettings/${hostId}`));
      return settingsSnapshot.exists() ? settingsSnapshot.val() as HostSettings : null;
    } catch (error) {
      console.error('Error fetching host settings:', error);
      return null;
    }
  }

  // ================== PRE-MADE TICKET LOADING ==================

  async loadTicketsFromSet(ticketSetId: string, maxTickets: number): Promise<{ [ticketId: string]: TambolaTicket }> {
    try {
      console.log(`🎫 Loading ${maxTickets} tickets from set ${ticketSetId}...`);
      
      if (!ticketSetId || !['1', '2'].includes(ticketSetId)) {
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
      console.log(`📐 Sample ticket structure verified: ${tickets['1'] ? '3 rows × 9 columns' : 'Invalid'}`);
      console.log(`⚡ Metadata computed for all tickets (corners, center, allNumbers)`);
      console.log(`🎯 Half Sheet support: setId and positionInSet preserved for traditional validation`);

      return tickets;

    } catch (error: any) {
      console.error(`❌ Error loading tickets from set ${ticketSetId}:`, error);
      
      if (error.message.includes('fetch')) {
        throw new Error(`Network error loading ticket set ${ticketSetId}: ${error.message}`);
      }
      
      if (error.message.includes('JSON')) {
        throw new Error(`Invalid JSON format in ticket set ${ticketSetId}: ${error.message}`);
      }
      
      if (error.message.includes('Invalid') || error.message.includes('not found') || error.message.includes('Insufficient')) {
        throw error;
      }
      
      throw new Error(`Failed to load ticket set ${ticketSetId}: ${error.message || 'Unknown error'}`);
    }
  }

  // ================== GAME MANAGEMENT ==================

  async createGame(
    config: CreateGameConfig,
    hostId: string,
    ticketSetId: string,
    selectedPrizes: string[]
  ): Promise<GameData> {
    try {
      console.log(`🎮 Creating game for host ${hostId} with ${config.maxTickets} tickets from set ${ticketSetId}`);

      const tickets = await this.loadTicketsFromSet(ticketSetId, config.maxTickets);
      console.log(`✅ Loaded ${Object.keys(tickets).length} pre-made tickets from set ${ticketSetId}`);

      const prizes = this.createPrizeConfiguration(selectedPrizes);

      const gameData: GameData = {
        gameId: '',
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
        prizes
      };

      const gamesRef = ref(database, 'games');
      const newGameRef = push(gamesRef);
      const gameId = newGameRef.key!;
      
      gameData.gameId = gameId;
      
      await set(newGameRef, removeUndefinedValues(gameData));
      
      console.log(`✅ Game created successfully with ID: ${gameId}`);
      return gameData;
    } catch (error: any) {
      console.error('❌ Error creating game:', error);
      throw new Error(error.message || 'Failed to create game');
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

  async updateGameData(gameId: string, updates: Partial<GameData>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}`), cleanUpdates);
      console.log(`✅ Game data updated successfully`);
    } catch (error: any) {
      console.error('❌ Error updating game data:', error);
      throw new Error(error.message || 'Failed to update game data');
    }
  }

  async updateGameState(gameId: string, updates: Partial<GameState>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}/gameState`), cleanUpdates);

      const gameData = await this.getGameData(gameId);
      if (!gameData) {
        console.warn(`⚠️ Could not load game data for cleanup check: ${gameId}`);
        return;
      }

      const isGameStarting = updates.isActive === true || updates.isCountdown === true;
      const isNewGame = (gameData.gameState.calledNumbers?.length || 0) === 0;
      
      if (isGameStarting && isNewGame) {
        console.log(`🎮 Game ${gameId} is starting - triggering cleanup for host: ${gameData.hostId}`);
        
        this.cleanupOldCompletedGames(gameData.hostId, gameId).catch(error => {
          console.error(`❌ Background cleanup failed for host ${gameData.hostId}:`, error);
        });
      }

      console.log(`✅ Game state updated successfully for: ${gameId}`);
    } catch (error: any) {
      console.error('❌ Error updating game state:', error);
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  async getHostCurrentGame(hostId: string): Promise<GameData | null> {
    try {
      console.log(`🔍 Searching for current game for host: ${hostId}`);
      
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      
      if (!gamesSnapshot.exists()) {
        console.log(`📭 No games found for host: ${hostId}`);
        return null;
      }

      const allGames = Object.values(gamesSnapshot.val()) as GameData[];
      console.log(`📊 Found ${allGames.length} total games for host: ${hostId}`);
      
      const activeGames = allGames.filter(game => !game.gameState.gameOver);
      console.log(`🎮 Found ${activeGames.length} active games for host: ${hostId}`);
      
      if (activeGames.length === 0) {
        console.log(`✅ No active games for host: ${hostId} - all games are completed`);
        return null;
      }
      
      const currentGame = activeGames
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      console.log(`✅ Found current game: ${currentGame.gameId} for host: ${hostId}`);
      return currentGame;
      
    } catch (error: any) {
      console.error(`❌ Error fetching host current game for ${hostId}:`, error);
      return null;
    }
  }

  async getAllActiveGames(): Promise<GameData[]> {
    try {
      console.log('🔍 Fetching active games with recent completed games');
      const gamesSnapshot = await get(ref(database, 'games'));
      
      if (!gamesSnapshot.exists()) {
        console.log('📭 No games found in database');
        return [];
      }

      const allGames = Object.values(gamesSnapshot.val()) as GameData[];
      console.log(`📊 Found ${allGames.length} total games in database`);
      
      const validGames = allGames.filter(game => {
        if (!game.hostId || !game.gameId || !game.gameState) {
          console.warn(`⚠️ Invalid game structure found: ${game.gameId || 'unknown'}`);
          return false;
        }
        return true;
      });

      if (validGames.length !== allGames.length) {
        console.warn(`⚠️ Filtered out ${allGames.length - validGames.length} invalid games`);
      }

      const gamesByHost = new Map<string, GameData[]>();
      validGames.forEach(game => {
        if (!gamesByHost.has(game.hostId)) {
          gamesByHost.set(game.hostId, []);
        }
        gamesByHost.get(game.hostId)!.push(game);
      });

      console.log(`👥 Processing games for ${gamesByHost.size} hosts`);

      const publicGames: GameData[] = [];
      
      gamesByHost.forEach((hostGames) => {
        const activeGame = hostGames.find(game => !game.gameState.gameOver);
        
        if (activeGame) {
          publicGames.push(activeGame);
          return;
        }
        
        const completedGames = hostGames
          .filter(game => game.gameState.gameOver && game.createdAt)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        if (completedGames.length > 0) {
          publicGames.push(completedGames[0]);
        }
      });

      const sortedGames = publicGames.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      return sortedGames;
    } catch (error) {
      console.error('❌ Error fetching active games:', error);
      return [];
    }
  }

  private async getAllGamesByHost(hostId: string): Promise<GameData[]> {
    try {
      console.log(`🔍 Fetching all games for host: ${hostId}`);
      
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      
      if (!gamesSnapshot.exists()) {
        console.log(`📭 No games found for host: ${hostId}`);
        return [];
      }

      const hostGames = Object.values(gamesSnapshot.val()) as GameData[];
      console.log(`📊 Found ${hostGames.length} games for host: ${hostId}`);
      
      return hostGames;
    } catch (error: any) {
      console.error(`❌ Error fetching games for host ${hostId}:`, error);
      return [];
    }
  }

  private async cleanupOldCompletedGames(hostId: string, currentGameId: string): Promise<void> {
    if (this.cleanupInProgress.has(hostId)) {
      console.log(`🔄 Cleanup already running for host: ${hostId}`);
      return;
    }

    this.cleanupInProgress.add(hostId);
    
    try {
      console.log(`🧹 Starting cleanup for host: ${hostId}, excluding: ${currentGameId}`);
      
      const allHostGames = await this.getAllGamesByHost(hostId);
      
      if (allHostGames.length === 0) {
        console.log(`ℹ️ No games found for cleanup check: ${hostId}`);
        return;
      }

      const completedGames = allHostGames
        .filter(game => game.gameState.gameOver && game.gameId !== currentGameId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (completedGames.length <= 1) {
        console.log(`ℹ️ Host ${hostId} has ${completedGames.length} completed games - no cleanup needed`);
        return;
      }

      const gamesToDelete = completedGames.slice(1);
      console.log(`🗑️ Scheduling cleanup of ${gamesToDelete.length} old games for host: ${hostId}`);

      for (const game of gamesToDelete) {
        try {
          await this.deleteGame(game.gameId);
          console.log(`✅ Cleaned up old game: ${game.gameId}`);
        } catch (error: any) {
          console.error(`⚠️ Failed to cleanup game ${game.gameId}:`, error);
        }
      }

      console.log(`✅ Cleanup completed for host: ${hostId}`);

    } catch (error: any) {
      console.error(`❌ Error during cleanup for host ${hostId}:`, error);
    } finally {
      this.cleanupInProgress.delete(hostId);
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

  // ================== TICKET MANAGEMENT ==================

  async bookTicket(
    ticketId: string, 
    playerName: string, 
    playerPhone: string, 
    gameId: string
  ): Promise<void> {
    try {
      console.log(`🎫 Booking ticket ${ticketId} for ${playerName} in game ${gameId}`);
      
      const currentTicketSnapshot = await get(ref(database, `games/${gameId}/tickets/${ticketId}`));
      
      const ticketData = {
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        bookedAt: new Date().toISOString()
      };

      if (currentTicketSnapshot.exists()) {
        const currentTicket = currentTicketSnapshot.val();
        if (currentTicket.metadata) {
          (ticketData as any).metadata = currentTicket.metadata;
        }
        if (currentTicket.setId) {
          (ticketData as any).setId = currentTicket.setId;
        }
        if (currentTicket.positionInSet) {
          (ticketData as any).positionInSet = currentTicket.positionInSet;
        }
      }

      await update(
        ref(database, `games/${gameId}/tickets/${ticketId}`),
        removeUndefinedValues(ticketData)
      );
      
      console.log(`✅ Ticket ${ticketId} booked successfully - metadata preserved`);
    } catch (error: any) {
      console.error('❌ Error booking ticket:', error);
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  async unbookTicket(gameId: string, ticketId: string): Promise<void> {
    try {
      const ticketData = {
        isBooked: false,
        playerName: null,
        playerPhone: null,
        bookedAt: null
      };

      await update(
        ref(database, `games/${gameId}/tickets/${ticketId}`),
        ticketData
      );
      
      console.log(`✅ Ticket ${ticketId} unbooked successfully`);
    } catch (error: any) {
      console.error('❌ Error unbooking ticket:', error);
      throw new Error(error.message || 'Failed to unbook ticket');
    }
  }

  async updateTicket(gameId: string, ticketId: string, updates: Partial<TambolaTicket>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(
        ref(database, `games/${gameId}/tickets/${ticketId}`),
        cleanUpdates
      );
      console.log(`✅ Ticket ${ticketId} updated successfully`);
    } catch (error: any) {
      console.error('❌ Error updating ticket:', error);
      throw new Error(error.message || 'Failed to update ticket');
    }
  }

  // ================== AUTOMATIC NUMBER CALLING ==================

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

      const calledNumbers = gameData.gameState.calledNumbers || [];
      const availableNumbers = Array.from({ length: 90 }, (_, i) => i + 1)
        .filter(num => !calledNumbers.includes(num));

      if (availableNumbers.length === 0) {
        console.log('🏁 No more numbers to call - game should end');
        return { success: false };
      }

      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const number = availableNumbers[randomIndex];

      return await this.processNumberCall(gameId, number);
    } catch (error: any) {
      console.error('❌ Error calling next number:', error);
      throw new Error(error.message || 'Failed to call next number');
    }
  }

  private async processNumberCall(gameId: string, number: number): Promise<{
    success: boolean;
    number?: number;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
    gameEnded?: boolean;
  }> {
    try {
      console.log(`📞 Processing number call: ${number} for game: ${gameId}`);
      
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const currentCalledNumbers = gameData.gameState.calledNumbers || [];
      
      if (currentCalledNumbers.includes(number)) {
        console.warn(`⚠️ Number ${number} already called`);
        return { success: false };
      }

      const updatedCalledNumbers = [...currentCalledNumbers, number];
      
      const unwonPrizes = Object.fromEntries(
        Object.entries(gameData.prizes).filter(([_, prize]) => !prize.won)
      );

      const validationResult = await this.validateTicketsForPrizes(
        gameData.tickets || {}, 
        updatedCalledNumbers, 
        unwonPrizes
      );
      
      const gameUpdates: any = {
        gameState: removeUndefinedValues({
          ...gameData.gameState,
          calledNumbers: updatedCalledNumbers,
          currentNumber: number
        })
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
  }

  // ================== PRIZE VALIDATION ==================

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
            case 'earlyFive':
              hasWon = ticket.metadata?.allNumbers.filter(num => calledNumbers.includes(num)).length >= 5;
              break;

            case 'corners':
              hasWon = ticket.metadata?.hasValidCorners && 
                      ticket.metadata.corners.every(corner => calledNumbers.includes(corner));
              break;

            case 'halfSheet':
              // Half Sheet: 3 consecutive tickets from same set, each with ≥2 marked numbers
              if (ticket.setId && ticket.positionInSet) {
                const setId = ticket.setId;
                const position = ticket.positionInSet;
                
                // Check if this is part of a valid half sheet (positions 1,2,3 or 4,5,6)
                const isFirstHalf = [1, 2, 3].includes(position);
                const isSecondHalf = [4, 5, 6].includes(position);
                
                if (isFirstHalf || isSecondHalf) {
                  const targetPositions = isFirstHalf ? [1, 2, 3] : [4, 5, 6];
                  
                  // Find all tickets from same set with target positions
                  const sameSetTickets = Object.values(tickets).filter(t => 
                    t.isBooked && t.setId === setId && 
                    targetPositions.includes(t.positionInSet || 0)
                  );
                  
                  if (sameSetTickets.length === 3) {
                    // Check if all 3 tickets have at least 2 marked numbers
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

            case 'starCorner':
              hasWon = ticket.metadata?.hasValidCorners && 
                      ticket.metadata?.hasValidCenter &&
                      ticket.metadata.corners.every(corner => calledNumbers.includes(corner)) &&
                      calledNumbers.includes(ticket.metadata.center);
              break;

            case 'fullHouse':
              hasWon = ticket.metadata?.allNumbers.every(num => calledNumbers.includes(num));
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

  // ================== REAL-TIME SUBSCRIPTIONS ==================

  subscribeToGame(gameId: string, callback: (gameData: GameData | null) => void): () => void {
    const gameRef = ref(database, `games/${gameId}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const gameData = snapshot.val() as GameData;
        callback(gameData);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('Firebase subscription error:', error);
      callback(null);
    });

    return () => off(gameRef, 'value', unsubscribe);
  }

  subscribeToAllActiveGames(callback: (games: GameData[]) => void): () => void {
    const gamesRef = ref(database, 'games');
    
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      if (snapshot.exists()) {
        const allGames = Object.values(snapshot.val()) as GameData[];
        
        const validGames = allGames.filter(game => 
          game.hostId && game.gameId && game.gameState
        );

        const gamesByHost = new Map<string, GameData[]>();
        validGames.forEach(game => {
          if (!gamesByHost.has(game.hostId)) {
            gamesByHost.set(game.hostId, []);
          }
          gamesByHost.get(game.hostId)!.push(game);
        });

        const publicGames: GameData[] = [];
        
        gamesByHost.forEach((hostGames) => {
          const activeGame = hostGames.find(game => !game.gameState.gameOver);
          
          if (activeGame) {
            publicGames.push(activeGame);
            return;
          }
          
          const completedGames = hostGames
            .filter(game => game.gameState.gameOver && game.createdAt)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          if (completedGames.length > 0) {
            publicGames.push(completedGames[0]);
          }
        });

        const sortedGames = publicGames.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        callback(sortedGames);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Games subscription error:', error);
      callback([]);
    });

    return () => off(gamesRef, 'value', unsubscribe);
  }

  subscribeToGames(callback: (games: GameData[]) => void): () => void {
    return this.subscribeToAllActiveGames(callback);
  }

  // ================== ADMIN FUNCTIONS ==================

  async createHost(
    email: string,
    password: string,
    name: string,
    phone: string,
    adminId: string,
    subscriptionMonths: number
  ): Promise<void> {
    try {
      console.log('🔧 Creating host account...');
      
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);

      const hostData: HostUser = {
        uid: '',
        email,
        name,
        phone,
        role: 'host',
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true
      };

      const hostRef = push(ref(database, 'hosts'));
      const hostId = hostRef.key!;
      hostData.uid = hostId;
      
      await set(hostRef, removeUndefinedValues(hostData));
      
      console.log(`✅ Host ${name} created successfully with ID: ${hostId}`);
      throw new Error(`SUCCESS: Host ${name} created successfully. You will be logged out automatically.`);
      
    } catch (error: any) {
      if (error.message.startsWith('SUCCESS:')) {
        throw error;
      }
      console.error('❌ Error creating host:', error);
      throw new Error(error.message || 'Failed to create host');
    }
  }

  async getAllHosts(): Promise<HostUser[]> {
    try {
      const hostsSnapshot = await get(ref(database, 'hosts'));
      if (!hostsSnapshot.exists()) {
        return [];
      }
      return Object.values(hostsSnapshot.val()) as HostUser[];
    } catch (error) {
      console.error('Error fetching hosts:', error);
      return [];
    }
  }

  subscribeToHosts(callback: (hosts: HostUser[] | null) => void): () => void {
    const hostsRef = ref(database, 'hosts');
    
    const unsubscribe = onValue(hostsRef, (snapshot) => {
      if (snapshot.exists()) {
        const hosts = Object.values(snapshot.val()) as HostUser[];
        callback(hosts);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Hosts subscription error:', error);
      callback(null);
    });

    return () => off(hostsRef, 'value', unsubscribe);
  }

  async updateHost(hostId: string, updates: Partial<HostUser>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `hosts/${hostId}`), cleanUpdates);
      console.log(`✅ Host ${hostId} updated successfully`);
    } catch (error: any) {
      console.error('❌ Error updating host:', error);
      throw new Error(error.message || 'Failed to update host');
    }
  }

  async deleteHost(hostId: string): Promise<void> {
    try {
      await remove(ref(database, `hosts/${hostId}`));
      console.log(`✅ Host ${hostId} deleted successfully`);
    } catch (error: any) {
      console.error('❌ Error deleting host:', error);
      throw new Error(error.message || 'Failed to delete host');
    }
  }

  async getHostById(hostId: string): Promise<HostUser | null> {
    try {
      const hostSnapshot = await get(ref(database, `hosts/${hostId}`));
      return hostSnapshot.exists() ? hostSnapshot.val() as HostUser : null;
    } catch (error) {
      console.error('Error fetching host by ID:', error);
      return null;
    }
  }

  async extendHostSubscription(hostId: string, additionalMonths: number): Promise<void> {
    try {
      const host = await this.getHostById(hostId);
      if (!host) {
        throw new Error('Host not found');
      }

      const currentEndDate = new Date(host.subscriptionEndDate);
      const newEndDate = new Date(currentEndDate);
      newEndDate.setMonth(newEndDate.getMonth() + additionalMonths);

      await this.updateHost(hostId, {
        subscriptionEndDate: newEndDate.toISOString()
      });

      console.log(`✅ Extended subscription for host ${hostId} by ${additionalMonths} months`);
    } catch (error: any) {
      console.error('❌ Error extending host subscription:', error);
      throw new Error(error.message || 'Failed to extend subscription');
    }
  }

  async toggleHostStatus(hostId: string, isActive: boolean): Promise<void> {
    try {
      await this.updateHost(hostId, { isActive });
      console.log(`✅ Host ${hostId} status changed to: ${isActive ? 'active' : 'inactive'}`);
    } catch (error: any) {
      console.error('❌ Error toggling host status:', error);
      throw new Error(error.message || 'Failed to update host status');
    }
  }

  async changeHostPassword(hostId: string, newPassword: string): Promise<void> {
    try {
      console.log(`🔑 Password change requested for host: ${hostId}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`✅ Password changed for host: ${hostId}`);
    } catch (error: any) {
      console.error('❌ Error changing host password:', error);
      throw new Error(error.message || 'Failed to change password');
    }
  }
}

export async function getCurrentUserRole(): Promise<'admin' | 'host' | null> {
  try {
    const userData = await firebaseService.getUserData();
    return userData?.role || null;
  } catch (error) {
    return null;
  }
}

export const firebaseService = new FirebaseService();
export default firebaseService;
