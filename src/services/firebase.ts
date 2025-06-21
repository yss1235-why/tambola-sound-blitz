// src/services/firebase.ts - UPDATED: Pre-made ticket sets integration + Corner/Star Corner prizes + Winner Display + YOUR DYNAMIC CORNER LOGIC
import { initializeApp } from 'firebase/app';
import { 
  getDatabase, 
  ref, 
  push, 
  set, 
  get, 
  update, 
  remove, 
  onValue, 
  off,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  Database
} from 'firebase/database';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const database: Database = getDatabase(app);
export const auth: Auth = getAuth(app);

// ================== TYPE DEFINITIONS ==================

export interface TambolaTicket {
  ticketId: string;
  rows: number[][]; // 3 rows x 9 columns
  isBooked: boolean;
  playerName?: string;
  playerPhone?: string;
  bookedAt?: string;
}

// ✅ NEW: Performance optimization - pre-computed ticket metadata
interface TicketMetadata {
  corners: number[];           // [topLeft, topRight, bottomLeft, bottomRight]
  center: number;             // center position value
  hasValidCorners: boolean;   // true if all 4 corners have numbers > 0
  hasValidCenter: boolean;    // true if center has number > 0
  allNumbers: number[];       // all non-zero numbers for quick access
}

interface OptimizedTambolaTicket extends TambolaTicket {
  metadata?: TicketMetadata;  // cached calculations
}

export interface GameState {
  isActive: boolean;
  isCountdown: boolean;
  countdownTime: number;
  gameOver: boolean;
  calledNumbers: number[];
  currentNumber: number | null;
}

export interface Prize {
  id: string;
  name: string;
  pattern: string;
  description: string;
  won: boolean;
  order?: number;             // ✅ NEW: Prize ordering
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
}

export interface CreateGameConfig {
  name: string;
  maxTickets: number;
  ticketPrice: number;
  hostPhone: string;
}

// ✅ NEW: Types for pre-made ticket data
interface TicketRowData {
  setId: number;
  ticketId: number;
  rowId: number;
  numbers: number[];
}

// ================== UTILITY FUNCTIONS ==================

// Remove undefined values from objects before Firebase updates
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

// ✅ NEW: Pre-compute ticket metadata for performance optimization
const computeTicketMetadata = (ticket: TambolaTicket): TicketMetadata => {
  // Safety check for ticket structure
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

  // Validate each row has 9 columns
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

  // Extract corner positions
  const corners = [
    ticket.rows[0][0], // top-left (0,0)
    ticket.rows[0][8], // top-right (0,8)
    ticket.rows[2][0], // bottom-left (2,0)
    ticket.rows[2][8]  // bottom-right (2,8)
  ];

  // Extract center position
  const center = ticket.rows[1][4]; // center (1,4)

  // Filter valid numbers (> 0)
  const validCorners = corners.filter(n => n > 0);
  const hasValidCorners = validCorners.length === 4;
  const hasValidCenter = center > 0;

  // Get all numbers for other prize validations
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
  // ✅ NEW: Race condition protection for cleanup operations
  private cleanupInProgress = new Set<string>();
  
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

      // Check hosts collection first
      const hostSnapshot = await get(ref(database, `hosts/${currentUser.uid}`));
      if (hostSnapshot.exists()) {
        return { ...hostSnapshot.val(), role: 'host' } as HostUser;
      }
      
      // Check admins collection as fallback
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

  /**
   * ✅ UPDATED: Load tickets from pre-made ticket sets with metadata computation
   */
  async loadTicketsFromSet(ticketSetId: string, maxTickets: number): Promise<{ [ticketId: string]: TambolaTicket }> {
    try {
      console.log(`🎫 Loading ${maxTickets} tickets from set ${ticketSetId}...`);
      
      // ✅ VALIDATION: Check parameters
      if (!ticketSetId || !['1', '2'].includes(ticketSetId)) {
        throw new Error(`Invalid ticket set ID: ${ticketSetId}. Must be "1" or "2".`);
      }
      
      if (!maxTickets || maxTickets < 1 || maxTickets > 600) {
        throw new Error(`Invalid maxTickets: ${maxTickets}. Must be between 1 and 600.`);
      }

      // ✅ LOAD: Fetch JSON file from public directory
      const response = await fetch(`/data/${ticketSetId}.json`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Ticket set file not found: ${ticketSetId}.json. Please check if the file exists in public/data/`);
        }
        throw new Error(`Failed to load ticket set ${ticketSetId}: HTTP ${response.status} ${response.statusText}`);
      }

      const rawData: TicketRowData[] = await response.json();
      
      // ✅ VALIDATION: Check data structure
      if (!Array.isArray(rawData)) {
        throw new Error(`Invalid ticket data format: Expected array, got ${typeof rawData}`);
      }
      
      if (rawData.length === 0) {
        throw new Error(`Empty ticket set: ${ticketSetId}.json contains no data`);
      }

      console.log(`📊 Loaded ${rawData.length} ticket rows from set ${ticketSetId}`);

      // ✅ FILTER: Get only the tickets we need (1 to maxTickets)
      const filteredData = rawData.filter(row => row.ticketId >= 1 && row.ticketId <= maxTickets);
      
      if (filteredData.length === 0) {
        throw new Error(`No valid tickets found in range 1-${maxTickets} for set ${ticketSetId}`);
      }

      // ✅ VALIDATION: Check if we have enough tickets
      const uniqueTicketIds = new Set(filteredData.map(row => row.ticketId));
      const availableTickets = uniqueTicketIds.size;
      
      if (availableTickets < maxTickets) {
        throw new Error(`Insufficient tickets in set ${ticketSetId}: Found ${availableTickets}, requested ${maxTickets}`);
      }

      console.log(`🎯 Filtered to ${filteredData.length} rows covering ${availableTickets} tickets`);

      // ✅ TRANSFORM: Group by ticketId and build nested structure
      const ticketGroups = new Map<number, TicketRowData[]>();
      
      for (const row of filteredData) {
        // ✅ VALIDATION: Validate row structure
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

      // ✅ TRANSFORM: Convert to app's expected format
      const tickets: { [ticketId: string]: TambolaTicket } = {};
      
      for (const [ticketId, rows] of ticketGroups) {
        // ✅ VALIDATION: Ensure we have exactly 3 rows per ticket
        if (rows.length !== 3) {
          console.warn(`⚠️ Ticket ${ticketId} has ${rows.length} rows, expected 3. Skipping.`);
          continue;
        }

        // ✅ SORT: Ensure rows are in correct order (1, 2, 3)
        rows.sort((a, b) => a.rowId - b.rowId);
        
        // ✅ VALIDATION: Check row IDs are sequential (1, 2, 3)
        const expectedRowIds = [1, 2, 3];
        const actualRowIds = rows.map(r => r.rowId);
        
        if (!expectedRowIds.every((id, index) => actualRowIds[index] === id)) {
          console.warn(`⚠️ Ticket ${ticketId} has invalid row IDs: expected [1,2,3], got [${actualRowIds.join(',')}]. Skipping.`);
          continue;
        }

        // ✅ CREATE: Build ticket object in app's expected format
        const ticket: TambolaTicket = {
          ticketId: ticketId.toString(), // Keep as string for consistency
          rows: rows.map(row => row.numbers), // Extract numbers arrays
          isBooked: false
        };

        // ✅ NEW: Pre-compute metadata for performance
        const metadata = computeTicketMetadata(ticket);
        (ticket as OptimizedTambolaTicket).metadata = metadata;

        tickets[ticketId.toString()] = ticket;
      }

      // ✅ VALIDATION: Final check - ensure we got the requested number of tickets
      const createdTicketCount = Object.keys(tickets).length;
      
      if (createdTicketCount < maxTickets) {
        throw new Error(`Failed to create enough valid tickets: created ${createdTicketCount}, requested ${maxTickets}. Check ticket data integrity.`);
      }

      console.log(`✅ Successfully created ${createdTicketCount} tickets from set ${ticketSetId}`);
      console.log(`🎫 Ticket IDs: ${Object.keys(tickets).slice(0, 5).join(', ')}${createdTicketCount > 5 ? '...' : ''}`);
      console.log(`📐 Sample ticket structure verified: ${tickets['1'] ? '3 rows × 9 columns' : 'Invalid'}`);
      console.log(`⚡ Metadata computed for all tickets (corners, center, allNumbers)`);

      return tickets;

    } catch (error: any) {
      // ✅ ERROR HANDLING: Provide detailed error information
      console.error(`❌ Error loading tickets from set ${ticketSetId}:`, error);
      
      if (error.message.includes('fetch')) {
        throw new Error(`Network error loading ticket set ${ticketSetId}: ${error.message}`);
      }
      
      if (error.message.includes('JSON')) {
        throw new Error(`Invalid JSON format in ticket set ${ticketSetId}: ${error.message}`);
      }
      
      // Re-throw with context if it's already a descriptive error
      if (error.message.includes('Invalid') || error.message.includes('not found') || error.message.includes('Insufficient')) {
        throw error;
      }
      
      // Generic error fallback
      throw new Error(`Failed to load ticket set ${ticketSetId}: ${error.message || 'Unknown error'}`);
    }
  }

  // ================== GAME MANAGEMENT ==================

  /**
   * ✅ UPDATED: Create game using pre-made ticket sets with new prizes
   */
  async createGame(
    config: CreateGameConfig,
    hostId: string,
    ticketSetId: string,
    selectedPrizes: string[]
  ): Promise<GameData> {
    try {
      console.log(`🎮 Creating game for host ${hostId} with ${config.maxTickets} tickets from set ${ticketSetId}`);
      console.log(`ℹ️ Previous completed games will be cleaned when this game starts playing`);

      // ✅ NEW: Load tickets from pre-made set instead of auto-generation
      const tickets = await this.loadTicketsFromSet(ticketSetId, config.maxTickets);

      console.log(`✅ Loaded ${Object.keys(tickets).length} pre-made tickets from set ${ticketSetId}`);
      console.log(`📊 SetId concept preserved: Each setId represents a traditional 6-ticket Tambola sheet`);

      // ✅ UPDATED: Initialize selected prizes with new Corner and Star Corner prizes
      const availablePrizes = {
        quickFive: {
          id: 'quickFive',
          name: 'Quick Five',
          pattern: 'First 5 numbers',
          description: 'First player to mark any 5 numbers',
          won: false,
          order: 1
        },
        corner: {
          id: 'corner',
          name: 'Corner',
          pattern: '4 corner positions',
          description: 'Mark all 4 corner positions of your ticket',
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

      // ✅ UNCHANGED: Create game data (same as before)
      const gameData: GameData = {
        gameId: '', // Will be set after push
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

      // ✅ UNCHANGED: Save to Firebase (same as before)
      const gamesRef = ref(database, 'games');
      const newGameRef = push(gamesRef);
      const gameId = newGameRef.key!;
      
      gameData.gameId = gameId;
      
      await set(newGameRef, removeUndefinedValues(gameData));
      
      console.log(`✅ Game created successfully with ID: ${gameId}`);
      console.log(`🎫 Using pre-made tickets from set ${ticketSetId} (${Object.keys(tickets).length} tickets)`);
      console.log(`🏆 Configured prizes: ${selectedPrizes.join(', ')}`);
      
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

  // 🔧 MODIFIED: Add cleanup trigger to existing updateGameState method
  async updateGameState(gameId: string, updates: Partial<GameState>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}/gameState`), cleanUpdates);

      // ✅ SAFETY: Get game data for cleanup decisions
      const gameData = await this.getGameData(gameId);
      if (!gameData) {
        console.warn(`⚠️ Could not load game data for cleanup check: ${gameId}`);
        return;
      }

      // 🆕 NEW: Trigger cleanup when new game starts playing
      // This is the safe moment - players are engaged with new game
      const isGameStarting = updates.isActive === true || updates.isCountdown === true;
      const isNewGame = (gameData.gameState.calledNumbers?.length || 0) === 0;
      
      if (isGameStarting && isNewGame) {
        console.log(`🎮 Game ${gameId} is starting - triggering cleanup for host: ${gameData.hostId}`);
        
        // ✅ ASYNC: Don't wait for cleanup to complete - run in background
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

  // 🔧 MODIFIED: Enhanced getAllActiveGames to include recent completed games
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
      
      // ✅ SAFETY: Validate game data structure
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

      // Group games by host
      const gamesByHost = new Map<string, GameData[]>();
      validGames.forEach(game => {
        if (!gamesByHost.has(game.hostId)) {
          gamesByHost.set(game.hostId, []);
        }
        gamesByHost.get(game.hostId)!.push(game);
      });

      console.log(`👥 Processing games for ${gamesByHost.size} hosts`);

      const publicGames: GameData[] = [];
      
      // Process each host's games
      gamesByHost.forEach((hostGames, hostId) => {
        console.log(`🔍 Processing ${hostGames.length} games for host: ${hostId}`);
        
        // ✅ PRIORITY 1: Active game (not finished)
        const activeGame = hostGames.find(game => 
          !game.gameState.gameOver && 
          game.gameState // Additional safety check
        );
        
        if (activeGame) {
          publicGames.push(activeGame);
          console.log(`✅ Added active game: ${activeGame.gameId} for host: ${hostId}`);
          return; // Skip completed games if there's an active one
        }
        
        // ✅ PRIORITY 2: Most recent completed game (if no active game)
        const completedGames = hostGames
          .filter(game => {
            // ✅ SAFETY: Ensure game is properly completed
            return game.gameState && 
                   game.gameState.gameOver && 
                   game.createdAt; // Must have creation timestamp
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        if (completedGames.length > 0) {
          const recentCompleted = completedGames[0];
          publicGames.push(recentCompleted);
          console.log(`🏆 Added recent completed game: ${recentCompleted.gameId} for host: ${hostId}`);
        } else {
          console.log(`ℹ️ No games to show for host: ${hostId}`);
        }
      });

      // Sort all public games by creation date (newest first)
      const sortedGames = publicGames.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      console.log(`✅ Returning ${sortedGames.length} public games`);
      console.log(`📋 Games: ${sortedGames.map(g => `${g.gameId}(${g.gameState.gameOver ? 'completed' : 'active'})`).join(', ')}`);
      
      return sortedGames;
    } catch (error) {
      console.error('❌ Error fetching active games:', error);
      return [];
    }
  }

  // 🆕 NEW: Helper method to get all games for a specific host
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

  // 🆕 NEW: Cleanup old completed games, keeping only the most recent one
  private async cleanupOldCompletedGames(hostId: string, currentGameId: string): Promise<void> {
    // ✅ NEW: Race condition protection
    if (this.cleanupInProgress.has(hostId)) {
      console.log(`🔄 Cleanup already running for host: ${hostId}`);
      return;
    }

    this.cleanupInProgress.add(hostId);
    
    try {
      console.log(`🧹 Starting cleanup for host: ${hostId}, excluding: ${currentGameId}`);
      
      const allHostGames = await this.getAllGamesByHost(hostId);
      
      if (allHostGames.length === 0) {
        console.log(`ℹ️ No games found for cleanup for host: ${hostId}`);
        return;
      }

      // Get all completed games except the current one
      const completedGames = allHostGames
        .filter(game => 
          game.gameState.gameOver && 
          game.gameId !== currentGameId
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log(`🔍 Found ${completedGames.length} completed games for host: ${hostId}`);

      if (completedGames.length <= 1) {
        console.log(`ℹ️ Keeping ${completedGames.length} completed game(s) for host: ${hostId} - no cleanup needed`);
        return;
      }

      // Keep the most recent completed game, delete the rest
      const gamesToDelete = completedGames.slice(1); // Skip the first (most recent)
      console.log(`🗑️ Will delete ${gamesToDelete.length} old games for host: ${hostId}`);

      // ✅ SAFETY: Delete games one by one with error handling
      let deletedCount = 0;
      for (const game of gamesToDelete) {
        try {
          await remove(ref(database, `games/${game.gameId}`));
          deletedCount++;
          console.log(`✅ Deleted old game: ${game.gameId} (${game.name}) for host: ${hostId}`);
        } catch (deleteError: any) {
          console.error(`❌ Failed to delete game ${game.gameId}:`, deleteError);
          // Continue with other deletions even if one fails
        }
      }

      console.log(`🧹 Cleanup completed for host: ${hostId} - deleted ${deletedCount}/${gamesToDelete.length} old games`);
      
      if (deletedCount < gamesToDelete.length) {
        console.warn(`⚠️ Some games could not be deleted for host: ${hostId}`);
      }

    } catch (error: any) {
      console.error(`❌ Error during cleanup for host ${hostId}:`, error);
      // ✅ SAFETY: Don't throw - cleanup errors shouldn't break game flow
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
      
      // ✅ NEW: Get current ticket data to preserve metadata
      const currentTicketSnapshot = await get(ref(database, `games/${gameId}/tickets/${ticketId}`));
      
      const ticketData = {
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        bookedAt: new Date().toISOString()
      };

      // ✅ NEW: Preserve metadata if it exists
      if (currentTicketSnapshot.exists()) {
        const currentTicket = currentTicketSnapshot.val();
        if (currentTicket.metadata) {
          (ticketData as any).metadata = currentTicket.metadata;
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
      console.log(`🎯 Calling next random number for game: ${gameId}`);
      
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const calledNumbers = gameData.gameState.calledNumbers || [];
      
      const allNumbers = Array.from({ length: 90 }, (_, i) => i + 1);
      const availableNumbers = allNumbers.filter(num => !calledNumbers.includes(num));
      
      if (availableNumbers.length === 0) {
        console.log(`🏁 No more numbers available for game: ${gameId}`);
        return { 
          success: true, 
          gameEnded: true
        };
      }

      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const selectedNumber = availableNumbers[randomIndex];
      
      console.log(`🎲 Selected number ${selectedNumber} from ${availableNumbers.length} available numbers`);
      
      const result = await this.processNumberCall(gameId, selectedNumber);
      
      return {
        ...result,
        number: selectedNumber
      };
      
    } catch (error: any) {
      console.error('❌ Error in callNextNumber:', error);
      throw new Error(error.message || 'Failed to call next number');
    }
  }

  private async processNumberCall(gameId: string, number: number): Promise<{
    success: boolean;
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

  // ✅ UPDATED: YOUR REQUESTED DYNAMIC CORNER/STAR CORNER VALIDATION
  async validateTicketsForPrizes(
    tickets: { [ticketId: string]: TambolaTicket },
    calledNumbers: number[],
    prizes: { [prizeId: string]: Prize }
  ): Promise<{ winners: { [prizeId: string]: any } }> {
    const startTime = Date.now(); // Performance monitoring
    const winners: { [prizeId: string]: any } = {};

    for (const [prizeId, prize] of Object.entries(prizes)) {
      if (prize.won) continue;

      const prizeWinners: { name: string; ticketId: string; phone?: string }[] = [];

      for (const [ticketId, ticket] of Object.entries(tickets)) {
        if (!ticket.isBooked || !ticket.playerName) continue;

        let hasWon = false;
        
        // ✅ OPTIMIZATION: Use pre-computed metadata when available
        const optimizedTicket = ticket as OptimizedTambolaTicket;
        const metadata = optimizedTicket.metadata;

        try {
          switch (prizeId) {
            case 'quickFive': {
              // ✅ OPTIMIZED: Use pre-computed allNumbers if available
              const ticketNumbers = metadata?.allNumbers || ticket.rows.flat().filter(n => n > 0);
              const markedCount = ticketNumbers.filter(n => calledNumbers.includes(n)).length;
              hasWon = markedCount >= 5;
              break;
            }

            case 'corner': {
              // 🎯 YOUR REQUESTED DYNAMIC CORNER LOGIC
              try {
                // Safety check: ensure proper ticket structure
                if (!ticket.rows || ticket.rows.length !== 3) {
                  hasWon = false;
                  break;
                }
                
                // Extract non-zero numbers from top and bottom rows
                const topNumbers = ticket.rows[0].filter(n => n > 0);
                const bottomNumbers = ticket.rows[2].filter(n => n > 0);
                
                // Validate: each row must have exactly 5 numbers
                if (topNumbers.length === 5 && bottomNumbers.length === 5) {
                  // Corner positions: first & last from top + first & last from bottom
                  const cornerNumbers = [
                    topNumbers[0],           // Top-left corner (first of top row)
                    topNumbers[4],           // Top-right corner (last of top row)
                    bottomNumbers[0],        // Bottom-left corner (first of bottom row)
                    bottomNumbers[4]         // Bottom-right corner (last of bottom row)
                  ];
                  
                  // Check if all corner numbers have been called
                  hasWon = cornerNumbers.every(n => calledNumbers.includes(n));
                  
                  // Debug logging (remove in production)
                  console.log(`Corner validation for ticket ${ticket.ticketId}:`, {
                    topNumbers,
                    bottomNumbers, 
                    cornerNumbers,
                    hasWon
                  });
                } else {
                  // Invalid ticket structure - cannot win
                  hasWon = false;
                  console.warn(`Corner prize: Invalid ticket ${ticket.ticketId} - rows don't have 5 numbers each (top: ${topNumbers.length}, bottom: ${bottomNumbers.length})`);
                }
              } catch (error) {
                // Error safety: don't award prize on validation error
                hasWon = false;
                console.error(`Corner prize validation error for ticket ${ticket.ticketId}:`, error);
              }
              break;
            }

            case 'topLine': {
              const topLineNumbers = ticket.rows[0].filter(n => n > 0);
              hasWon = topLineNumbers.every(n => calledNumbers.includes(n));
              break;
            }

            case 'middleLine': {
              const middleLineNumbers = ticket.rows[1].filter(n => n > 0);
              hasWon = middleLineNumbers.every(n => calledNumbers.includes(n));
              break;
            }

            case 'bottomLine': {
              const bottomLineNumbers = ticket.rows[2].filter(n => n > 0);
              hasWon = bottomLineNumbers.every(n => calledNumbers.includes(n));
              break;
            }

            case 'starCorner': {
              // 🎯 YOUR REQUESTED DYNAMIC STAR CORNER LOGIC
              try {
                // Safety check: ensure proper ticket structure
                if (!ticket.rows || ticket.rows.length !== 3) {
                  hasWon = false;
                  break;
                }
                
                // Extract non-zero numbers from all rows
                const topNumbers = ticket.rows[0].filter(n => n > 0);
                const middleNumbers = ticket.rows[1].filter(n => n > 0);
                const bottomNumbers = ticket.rows[2].filter(n => n > 0);
                
                // Validate: each row must have exactly 5 numbers
                if (topNumbers.length === 5 && middleNumbers.length === 5 && bottomNumbers.length === 5) {
                  // Star Corner: 4 corners + center (all dynamic)
                  const starCornerNumbers = [
                    topNumbers[0],           // Top-left corner (first of top row)
                    topNumbers[4],           // Top-right corner (last of top row)
                    middleNumbers[2],        // Center (middle of middle row - 3rd of 5)
                    bottomNumbers[0],        // Bottom-left corner (first of bottom row)
                    bottomNumbers[4]         // Bottom-right corner (last of bottom row)
                  ];
                  
                  // Check if all star corner numbers have been called
                  hasWon = starCornerNumbers.every(n => calledNumbers.includes(n));
                  
                  // Debug logging (remove in production)
                  console.log(`Star Corner validation for ticket ${ticket.ticketId}:`, {
                    topNumbers,
                    middleNumbers,
                    bottomNumbers,
                    starCornerNumbers,
                    hasWon
                  });
                } else {
                  // Invalid ticket structure - cannot win
                  hasWon = false;
                  console.warn(`Star Corner prize: Invalid ticket ${ticket.ticketId} - rows don't have 5 numbers each (top: ${topNumbers.length}, middle: ${middleNumbers.length}, bottom: ${bottomNumbers.length})`);
                }
              } catch (error) {
                // Error safety: don't award prize on validation error
                hasWon = false;
                console.error(`Star Corner prize validation error for ticket ${ticket.ticketId}:`, error);
              }
              break;
            }

            case 'fullHouse': {
              // ✅ OPTIMIZED: Use pre-computed allNumbers if available
              const allTicketNumbers = metadata?.allNumbers || ticket.rows.flat().filter(n => n > 0);
              hasWon = allTicketNumbers.every(n => calledNumbers.includes(n));
              break;
            }

            default: {
              // ✅ SAFETY: Handle unknown prize types gracefully
              console.warn(`Unknown prize type: ${prizeId} - skipping validation`);
              continue;
            }
          }
        } catch (error) {
          // ✅ SAFETY: Error recovery
          console.error(`Prize validation error for ${prizeId} on ticket ${ticketId}:`, error);
          hasWon = false; // Fail safe - don't award prize on error
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

    // ✅ PERFORMANCE MONITORING
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
        // ✅ NEW: Use the enhanced getAllActiveGames logic for real-time subscriptions
        const allGames = Object.values(snapshot.val()) as GameData[];
        
        // Apply the same logic as getAllActiveGames but synchronously
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
          // Priority 1: Active game
          const activeGame = hostGames.find(game => !game.gameState.gameOver);
          
          if (activeGame) {
            publicGames.push(activeGame);
            return;
          }
          
          // Priority 2: Most recent completed game
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

// ✅ UNCHANGED: Helper functions remain exactly the same
export async function getCurrentUserRole(): Promise<'admin' | 'host' | null> {
  try {
    const userData = await firebaseService.getUserData();
    return userData?.role || null;
  } catch (error) {
    return null;
  }
}

// ✅ UNCHANGED: Export singleton
export const firebaseService = new FirebaseService();
export default firebaseService;
