// src/services/firebase.ts - Complete Updated Firebase Service
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updatePassword
} from 'firebase/auth';
import { 
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  off,
  query,
  orderByChild,
  equalTo,
  limitToFirst,
  child
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const database = getDatabase(app);

// Type definitions
export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  role: 'admin';
  createdAt: string;
  permissions: {
    createHosts: boolean;
    manageUsers: boolean;
  };
}

export interface HostUser {
  uid: string;
  email: string;
  name: string;
  phone: string;
  role: 'host';
  createdBy: string;
  createdAt: string;
  subscriptionEndDate: string;
  isActive: boolean;
  updatedAt?: string;
}

export interface GameState {
  isActive: boolean;
  isCountdown: boolean;
  countdownTime: number;
  gameOver: boolean;
  calledNumbers: number[];
  currentNumber: number | null;
  callInterval: number;
}

export interface Prize {
  id: string;
  name: string;
  pattern: string;
  won: boolean;
  winners?: Array<{
    ticketId: string;
    name: string;
    phone?: string;
  }>;
  winningNumber?: number;
  wonAt?: string;
}

export interface TambolaTicket {
  ticketId: string;
  rows: number[][];
  isBooked: boolean;
  playerName?: string;
  playerPhone?: string;
  bookedAt?: string;
  updatedAt?: string;
}

export interface GameData {
  gameId: string;
  name: string;
  hostId: string;
  hostPhone?: string;
  maxTickets: number;
  ticketPrice: number;
  gameState: GameState;
  prizes: { [key: string]: Prize };
  tickets?: { [key: string]: TambolaTicket };
  createdAt: string;
  ticketSetId?: string;
  lastWinnerAnnouncement?: string;
  lastWinnerAt?: string;
}

export interface TicketSetData {
  ticketCount: number;
  tickets: { [key: string]: TambolaTicket };
}

export interface HostSettings {
  hostPhone: string;
  maxTickets: number;
  selectedTicketSet: string;
  selectedPrizes: string[];
}

interface RawTicketRow {
  setId: number;
  ticketId: number;
  rowId: number;
  numbers: number[];
}

// Cache for ticket sets to avoid reloading
const ticketSetCache = new Map<string, TicketSetData>();

// Get current user role
export const getCurrentUserRole = async (): Promise<'admin' | 'host' | null> => {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
    if (adminSnapshot.exists() && adminSnapshot.val().permissions?.createHosts) {
      return 'admin';
    }

    const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
    if (hostSnapshot.exists() && hostSnapshot.val().isActive) {
      return 'host';
    }

    return null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
};

// Utility function to remove undefined values
const removeUndefinedValues = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedValues);
  }
  
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = removeUndefinedValues(value);
    }
  }
  return cleaned;
};

// Firebase service class
class FirebaseService {

  // Admin operations
  async loginAdmin(email: string, password: string): Promise<AdminUser | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
      if (!adminSnapshot.exists()) {
        throw new Error(`Admin record not found for ${user.email}. Please contact system administrator.`);
      }

      const adminData = adminSnapshot.val() as AdminUser;
      
      if (!adminData.permissions?.createHosts) {
        throw new Error('Admin account does not have sufficient permissions.');
      }

      return adminData;
    } catch (error: any) {
      console.error('Admin login failed:', error);
      throw new Error(error.message || 'Admin login failed');
    }
  }

  // Host operations
  async loginHost(email: string, password: string): Promise<HostUser | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
      if (!hostSnapshot.exists()) {
        throw new Error('Host account not found. Please contact administrator.');
      }

      const hostData = hostSnapshot.val() as HostUser;
      if (!hostData.isActive) {
        throw new Error('Host account is deactivated');
      }

      const subscriptionEnd = new Date(hostData.subscriptionEndDate);
      if (subscriptionEnd < new Date()) {
        throw new Error('Host subscription has expired');
      }

      return hostData;
    } catch (error: any) {
      console.error('Host login failed:', error);
      throw new Error(error.message || 'Host login failed');
    }
  }

  // Create host with credential switch
  async createHost(
    email: string, 
    password: string, 
    name: string, 
    phone: string,
    adminUid: string, 
    subscriptionMonths: number = 12
  ): Promise<HostUser> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== adminUid) {
        throw new Error('Admin authorization failed. Please log in again.');
      }

      const adminSnapshot = await get(ref(database, `admins/${adminUid}`));
      if (!adminSnapshot.exists() || !adminSnapshot.val().permissions?.createHosts) {
        throw new Error('Admin does not have permission to create hosts.');
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);

      const hostData: HostUser = {
        uid: newUser.uid,
        email,
        name,
        phone,
        role: 'host',
        createdBy: adminUid,
        createdAt: new Date().toISOString(),
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true
      };

      await set(ref(database, `hosts/${newUser.uid}`), removeUndefinedValues(hostData));

      await signOut(auth);

      throw new Error(`SUCCESS: Host account created for ${email}! Please log in again as admin to continue.`);

    } catch (error: any) {
      try { await signOut(auth); } catch {}
      throw new Error(error.message || 'Failed to create host');
    }
  }

  async getHostById(hostId: string): Promise<HostUser | null> {
    try {
      const hostSnapshot = await get(ref(database, `hosts/${hostId}`));
      if (!hostSnapshot.exists()) return null;
      return hostSnapshot.val() as HostUser;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to fetch host');
    }
  }

  // OPTIMIZED: Only get essential data for active games list
  async getAllActiveGames(): Promise<GameData[]> {
    try {
      const gamesSnapshot = await get(ref(database, 'games'));
      if (!gamesSnapshot.exists()) return [];
      
      const gamesData = gamesSnapshot.val();
      const activeGames: GameData[] = [];
      
      // Process each game without loading all ticket data
      for (const [gameId, gameData] of Object.entries(gamesData)) {
        const game = gameData as GameData;
        
        // Skip finished games
        if (game.gameState.gameOver) continue;
        
        // For active games, only include essential data
        activeGames.push({
          ...game,
          tickets: {} // Don't load tickets for list view
        });
      }
      
      return activeGames;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to fetch active games');
    }
  }

  async getAllHosts(): Promise<HostUser[]> {
    try {
      const hostsSnapshot = await get(ref(database, 'hosts'));
      if (!hostsSnapshot.exists()) return [];
      
      const hostsData = hostsSnapshot.val();
      return Object.values(hostsData) as HostUser[];
    } catch (error: any) {
      throw new Error(error.message || 'Failed to fetch hosts');
    }
  }

  async updateHost(hostId: string, updates: Partial<HostUser>): Promise<void> {
    try {
      const cleanedUpdates = removeUndefinedValues(updates);
      await update(ref(database, `hosts/${hostId}`), cleanedUpdates);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update host');
    }
  }

  async deleteHost(hostId: string): Promise<void> {
    try {
      await remove(ref(database, `hosts/${hostId}`));
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete host');
    }
  }

  async changeHostPassword(hostId: string, newPassword: string): Promise<void> {
    try {
      const user = auth.currentUser;
      if (user && user.uid === hostId) {
        await updatePassword(user, newPassword);
      } else {
        throw new Error('Cannot change password for different user');
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to change password');
    }
  }

  async extendHostSubscription(hostId: string, additionalMonths: number): Promise<void> {
    try {
      const hostSnapshot = await get(ref(database, `hosts/${hostId}`));
      if (!hostSnapshot.exists()) {
        throw new Error('Host not found');
      }

      const hostData = hostSnapshot.val() as HostUser;
      const currentEnd = new Date(hostData.subscriptionEndDate);
      const newEnd = new Date(currentEnd);
      newEnd.setMonth(newEnd.getMonth() + additionalMonths);

      const updateData = removeUndefinedValues({
        subscriptionEndDate: newEnd.toISOString(),
        updatedAt: new Date().toISOString()
      });

      await update(ref(database, `hosts/${hostId}`), updateData);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to extend subscription');
    }
  }

  async toggleHostStatus(hostId: string, isActive: boolean): Promise<void> {
    try {
      const updateData = removeUndefinedValues({
        isActive,
        updatedAt: new Date().toISOString()
      });
      
      await update(ref(database, `hosts/${hostId}`), updateData);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update host status');
    }
  }

  // Get host's current active game
  async getHostCurrentGame(hostId: string): Promise<GameData | null> {
    try {
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      if (!gamesSnapshot.exists()) return null;
      
      const gamesData = gamesSnapshot.val();
      const games = Object.values(gamesData) as GameData[];
      
      const activeGame = games
        .filter(game => !game.gameState.gameOver)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      return activeGame || null;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to fetch current game');
    }
  }

  // Check if host can create a new game
  async canHostCreateNewGame(hostId: string): Promise<{
    canCreate: boolean;
    reason?: string;
    existingGameId?: string;
  }> {
    try {
      const existingGame = await this.getHostCurrentGame(hostId);
      
      if (existingGame) {
        const bookedTickets = existingGame.tickets ? 
          Object.values(existingGame.tickets).filter(t => t.isBooked).length : 0;
        
        return {
          canCreate: false,
          reason: `You have an active game "${existingGame.name}" with ${bookedTickets} booked tickets. Please finish or delete it first.`,
          existingGameId: existingGame.gameId
        };
      }

      return { canCreate: true };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to check game creation eligibility');
    }
  }

  // Delete a game
  async deleteGame(gameId: string): Promise<void> {
    try {
      const gameSnapshot = await get(ref(database, `games/${gameId}`));
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== gameData.hostId) {
        throw new Error('You can only delete your own games');
      }

      if (gameData.gameState.isActive || gameData.gameState.isCountdown) {
        throw new Error('Cannot delete a game that is currently running. Please end the game first.');
      }

      const bookedTickets = gameData.tickets ? 
        Object.values(gameData.tickets).filter(ticket => ticket.isBooked).length : 0;
      
      if (bookedTickets > 0) {
        throw new Error(`Cannot delete game with ${bookedTickets} booked tickets. Please contact players first.`);
      }

      await remove(ref(database, `games/${gameId}`));
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete game');
    }
  }

  // Host settings operations
  async saveHostSettings(hostId: string, settings: HostSettings): Promise<void> {
    try {
      const settingsData = removeUndefinedValues({
        ...settings,
        updatedAt: new Date().toISOString()
      });
      
      await set(ref(database, `hostSettings/${hostId}`), settingsData);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save host settings');
    }
  }

  async getHostSettings(hostId: string): Promise<HostSettings | null> {
    try {
      const settingsSnapshot = await get(ref(database, `hostSettings/${hostId}`));
      if (!settingsSnapshot.exists()) return null;
      return settingsSnapshot.val() as HostSettings;
    } catch (error: any) {
      return null;
    }
  }

  // OPTIMIZED: Load only required tickets from set
  async loadTicketSet(setId: string, maxTickets: number): Promise<TicketSetData> {
    try {
      // Check cache first
      const cacheKey = `${setId}-${maxTickets}`;
      if (ticketSetCache.has(cacheKey)) {
        return ticketSetCache.get(cacheKey)!;
      }

      const response = await fetch(`/data/${setId}.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ticket set ${setId}`);
      }
      
      const rawData = await response.json() as RawTicketRow[];
      
      const tickets: { [key: string]: TambolaTicket } = {};
      
      // Group by ticket ID
      const ticketGroups: { [ticketId: string]: RawTicketRow[] } = {};
      rawData.forEach(row => {
        const ticketKey = row.ticketId.toString();
        if (!ticketGroups[ticketKey]) {
          ticketGroups[ticketKey] = [];
        }
        ticketGroups[ticketKey].push(row);
      });
      
      // Process only the tickets we need
      const allTicketIds = Object.keys(ticketGroups).sort((a, b) => parseInt(a) - parseInt(b));
      const ticketsToProcess = Math.min(maxTickets, allTicketIds.length);
      
      for (let i = 0; i < ticketsToProcess; i++) {
        const originalTicketId = allTicketIds[i];
        const rows = ticketGroups[originalTicketId];
        
        if (rows.length === 3) {
          rows.sort((a, b) => a.rowId - b.rowId);
          
          const newTicketId = (i + 1).toString();
          
          tickets[newTicketId] = {
            ticketId: newTicketId,
            rows: [
              rows[0].numbers,
              rows[1].numbers,
              rows[2].numbers
            ],
            isBooked: false
          };
        }
      }
      
      const result = {
        ticketCount: Object.keys(tickets).length,
        tickets
      };
      
      // Cache the result
      ticketSetCache.set(cacheKey, result);
      
      return result;
      
    } catch (error: any) {
      console.error(`Error loading ticket set ${setId}:`, error);
      return { ticketCount: 0, tickets: {} };
    }
  }

  // OPTIMIZED: Create game with only required tickets
  async createGame(
    gameConfig: { name: string; maxTickets: number; ticketPrice: number; hostPhone?: string },
    hostId: string,
    ticketSetId: string,
    selectedPrizes: string[]
  ): Promise<GameData> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== hostId) {
        throw new Error('Authentication error. Please log in again.');
      }

      const existingGame = await this.getHostCurrentGame(hostId);
      if (existingGame) {
        throw new Error('You already have an active game. Please finish or delete it before creating a new one.');
      }

      const gameRef = push(ref(database, 'games'));
      const gameId = gameRef.key!;

      // OPTIMIZED: Only load required tickets
      const ticketSetData = await this.loadTicketSet(ticketSetId, gameConfig.maxTickets);

      const prizes: { [key: string]: Prize } = {};
      const prizeDefinitions = {
        quickFive: { name: 'Quick Five', pattern: 'First 5 numbers' },
        topLine: { name: 'Top Line', pattern: 'Complete top row' },
        middleLine: { name: 'Middle Line', pattern: 'Complete middle row' },
        bottomLine: { name: 'Bottom Line', pattern: 'Complete bottom row' },
        fourCorners: { name: 'Four Corners', pattern: 'All four corner numbers' },
        fullHouse: { name: 'Full House', pattern: 'Complete ticket' }
      };

      selectedPrizes.forEach(prizeId => {
        if (prizeDefinitions[prizeId as keyof typeof prizeDefinitions]) {
          const prizeDef = prizeDefinitions[prizeId as keyof typeof prizeDefinitions];
          prizes[prizeId] = {
            id: prizeId,
            name: prizeDef.name,
            pattern: prizeDef.pattern,
            won: false
          };
        }
      });

      const gameData: GameData = {
        gameId,
        name: gameConfig.name,
        hostId,
        hostPhone: gameConfig.hostPhone,
        maxTickets: gameConfig.maxTickets,
        ticketPrice: gameConfig.ticketPrice,
        gameState: {
          isActive: false,
          isCountdown: false,
          countdownTime: 0,
          gameOver: false,
          calledNumbers: [],
          currentNumber: null,
          callInterval: 5000
        },
        prizes,
        tickets: ticketSetData.tickets,
        createdAt: new Date().toISOString(),
        ticketSetId
      };

      const cleanedGameData = removeUndefinedValues(gameData);
      await set(gameRef, cleanedGameData);
      
      return gameData;
    } catch (error: any) {
      console.error('Game creation failed:', error);
      throw new Error(error.message || 'Failed to create game');
    }
  }

  async updateGameState(gameId: string, gameState: GameState): Promise<void> {
    try {
      const cleanedGameState = removeUndefinedValues({ gameState });
      await update(ref(database, `games/${gameId}`), cleanedGameState);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  async updateGameData(gameId: string, gameData: Partial<GameData>): Promise<void> {
    try {
      const gameSnapshot = await get(ref(database, `games/${gameId}`));
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const currentGameData = gameSnapshot.val() as GameData;
      
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== currentGameData.hostId) {
        throw new Error('You can only modify your own games');
      }

      if (currentGameData.gameState.isActive || currentGameData.gameState.isCountdown) {
        throw new Error('Cannot modify game settings while game is running');
      }

      if (gameData.maxTickets !== undefined) {
        const bookedCount = currentGameData.tickets ? 
          Object.values(currentGameData.tickets).filter(ticket => ticket.isBooked).length : 0;
        
        if (gameData.maxTickets < bookedCount) {
          throw new Error(`Cannot reduce max tickets below ${bookedCount} (current bookings)`);
        }
      }

      const cleanedGameData = removeUndefinedValues(gameData);
      await update(ref(database, `games/${gameId}`), cleanedGameData);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update game data');
    }
  }

  async callNumber(gameId: string, number: number) {
    return this.callNumberWithPrizeValidation(gameId, number);
  }

  async callNumberWithPrizeValidation(gameId: string, number: number): Promise<{
    success: boolean;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
    gameEnded?: boolean;
  }> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const currentCalledNumbers = gameData.gameState.calledNumbers || [];
      
      if (currentCalledNumbers.includes(number)) {
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
      throw new Error(error.message || 'Failed to call number with prize validation');
    }
  }

  // OPTIMIZED: Batch book multiple tickets at once
  async bookTicketsBatch(
    ticketIds: string[], 
    playerName: string, 
    playerPhone: string, 
    gameId: string
  ): Promise<void> {
    try {
      const bookingData = removeUndefinedValues({
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim() || null,
        bookedAt: new Date().toISOString()
      });

      // Create batch update object
      const updates: { [key: string]: any } = {};
      
      // Prepare all updates
      ticketIds.forEach(ticketId => {
        updates[`games/${gameId}/tickets/${ticketId}`] = {
          ...bookingData,
          ticketId // Ensure ticketId is preserved
        };
      });

      // Execute all updates in a single operation
      await update(ref(database), updates);
      
    } catch (error: any) {
      console.error('Batch book tickets error:', error);
      throw new Error(error.message || 'Failed to book tickets');
    }
  }

  // OPTIMIZED: Book ticket without loading entire ticket set
  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      
      // First check if ticket exists and is available
      const ticketSnapshot = await get(ticketRef);
      if (!ticketSnapshot.exists()) {
        throw new Error(`Ticket ${ticketId} does not exist`);
      }
      
      const ticketData = ticketSnapshot.val();
      if (ticketData.isBooked) {
        throw new Error(`Ticket ${ticketId} is already booked`);
      }
      
      // Update only the booking fields
      const bookingData = removeUndefinedValues({
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim() || null,
        bookedAt: new Date().toISOString()
      });

      // Use update instead of set to avoid overwriting ticket data
      await update(ticketRef, bookingData);
    } catch (error: any) {
      console.error('Book ticket error:', error);
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  async updateTicket(gameId: string, ticketId: string, ticketData: Partial<TambolaTicket>): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      
      const updatedData = removeUndefinedValues({
        ...ticketData,
        updatedAt: new Date().toISOString()
      });

      await update(ticketRef, updatedData);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update ticket');
    }
  }

  async unbookTicket(gameId: string, ticketId: string): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      
      const unbookingData = removeUndefinedValues({
        isBooked: false,
        playerName: null,
        playerPhone: null,
        bookedAt: null,
        updatedAt: new Date().toISOString()
      });

      await update(ticketRef, unbookingData);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to cancel booking');
    }
  }

  // OPTIMIZED: Subscription with minimal data transfer
  subscribeToGame(gameId: string, callback: (game: GameData | null) => void): () => void {
    const gameRef = ref(database, `games/${gameId}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as GameData);
      } else {
        callback(null);
      }
    }, {
      // Only sync once initially, then listen for changes
      onlyOnce: false
    });

    return () => off(gameRef, 'value', unsubscribe);
  }

  subscribeToTickets(gameId: string, callback: (tickets: { [key: string]: TambolaTicket } | null) => void): () => void {
    const ticketsRef = ref(database, `games/${gameId}/tickets`);
    
    const unsubscribe = onValue(ticketsRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val());
      } else {
        callback(null);
      }
    }, {
      onlyOnce: false
    });

    return () => off(ticketsRef, 'value', unsubscribe);
  }

  subscribeToHosts(callback: (hosts: HostUser[]) => void): () => void {
    const hostsRef = ref(database, 'hosts');
    
    const unsubscribe = onValue(hostsRef, (snapshot) => {
      if (snapshot.exists()) {
        const hostsData = snapshot.val();
        const hosts = Object.values(hostsData) as HostUser[];
        callback(hosts);
      } else {
        callback([]);
      }
    });

    return () => off(hostsRef, 'value', unsubscribe);
  }

  subscribeToAllActiveGames(callback: (games: GameData[]) => void): () => void {
    const gamesRef = ref(database, 'games');
    
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      if (snapshot.exists()) {
        const gamesData = snapshot.val();
        const activeGames: GameData[] = [];
        
        // Process games without loading all ticket data
        for (const [gameId, gameData] of Object.entries(gamesData)) {
          const game = gameData as GameData;
          
          if (!game.gameState.gameOver) {
            activeGames.push({
              ...game,
              tickets: {} // Don't load tickets for list view
            });
          }
        }
        
        callback(activeGames);
      } else {
        callback([]);
      }
    });

    return () => off(gamesRef, 'value', unsubscribe);
  }

  // Authentication
  async getUserData(): Promise<AdminUser | HostUser | null> {
    const user = auth.currentUser;
    if (!user) return null;

    try {
      const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
      if (adminSnapshot.exists()) {
        return adminSnapshot.val() as AdminUser;
      }

      const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
      if (hostSnapshot.exists()) {
        return hostSnapshot.val() as HostUser;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to logout');
    }
  }

  private async validateTicketsForPrizes(
    tickets: { [key: string]: TambolaTicket },
    calledNumbers: number[],
    prizes: { [key: string]: Prize }
  ): Promise<{
    winners: { [prizeId: string]: any };
    statistics: any;
  }> {
    const bookedTickets = Object.values(tickets).filter(ticket => ticket.isBooked);
    const calledSet = new Set(calledNumbers);
    const winners: { [prizeId: string]: any } = {};
    
    for (const [prizeId, prize] of Object.entries(prizes)) {
      if (prize.won) continue;

      const prizeWinners: any[] = [];

      for (const ticket of bookedTickets) {
        const isWinner = this.checkTicketForPrize(ticket, calledSet, prize);
        if (isWinner) {
          prizeWinners.push({
            ticketId: ticket.ticketId,
            name: ticket.playerName || 'Unknown Player',
            phone: ticket.playerPhone
          });
        }
      }

      if (prizeWinners.length > 0) {
        winners[prizeId] = {
          prizeName: prize.name,
          prizePattern: prize.pattern,
          winners: prizeWinners,
          winningNumber: calledNumbers[calledNumbers.length - 1]
        };
      }
    }

    return {
      winners,
      statistics: {
        totalTickets: Object.keys(tickets).length,
        bookedTickets: bookedTickets.length,
        calledNumbers: calledNumbers.length,
        newWinners: Object.keys(winners).length
      }
    };
  }

  private checkTicketForPrize(
    ticket: TambolaTicket,
    calledNumbers: Set<number>,
    prize: Prize
  ): boolean {
    switch (prize.id) {
      case 'quickFive':
        return this.checkQuickFive(ticket, calledNumbers);
      case 'topLine':
        return this.checkTopLine(ticket, calledNumbers);
      case 'middleLine':
        return this.checkMiddleLine(ticket, calledNumbers);
      case 'bottomLine':
        return this.checkBottomLine(ticket, calledNumbers);
      case 'fourCorners':
        return this.checkFourCorners(ticket, calledNumbers);
      case 'fullHouse':
        return this.checkFullHouse(ticket, calledNumbers);
      default:
        return false;
    }
  }

  private checkQuickFive(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    let markedCount = 0;
    for (const row of ticket.rows) {
      for (const number of row) {
        if (number !== 0 && calledNumbers.has(number)) {
          markedCount++;
          if (markedCount >= 5) return true;
        }
      }
    }
    return false;
  }

  private checkTopLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    if (ticket.rows.length === 0) return false;
    const topRow = ticket.rows[0];
    
    for (const number of topRow) {
      if (number !== 0 && !calledNumbers.has(number)) {
        return false;
      }
    }
    return true;
  }

  private checkMiddleLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    if (ticket.rows.length < 2) return false;
    const middleRow = ticket.rows[1];
    
    for (const number of middleRow) {
      if (number !== 0 && !calledNumbers.has(number)) {
        return false;
      }
    }
    return true;
  }

  private checkBottomLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    if (ticket.rows.length < 3) return false;
    const bottomRow = ticket.rows[2];
    
    for (const number of bottomRow) {
      if (number !== 0 && !calledNumbers.has(number)) {
        return false;
      }
    }
    return true;
  }

  private checkFourCorners(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    if (ticket.rows.length < 3) return false;

    const topRow = ticket.rows[0];
    const bottomRow = ticket.rows[2];
    
    const topLeft = topRow.find(num => num !== 0);
    const topRight = topRow.slice().reverse().find(num => num !== 0);
    const bottomLeft = bottomRow.find(num => num !== 0);
    const bottomRight = bottomRow.slice().reverse().find(num => num !== 0);

    const corners = [topLeft, topRight, bottomLeft, bottomRight].filter(num => num !== undefined);
    
    return corners.length === 4 && corners.every(corner => calledNumbers.has(corner!));
  }

  private checkFullHouse(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    for (const row of ticket.rows) {
      for (const number of row) {
        if (number !== 0 && !calledNumbers.has(number)) {
          return false;
        }
      }
    }
    return true;
  }
}

export const firebaseService = new FirebaseService();
