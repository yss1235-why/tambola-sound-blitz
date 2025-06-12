// src/services/firebase.ts - Complete file with corrected ticket loading
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
  equalTo
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

// Type for your JSON format
interface RawTicketRow {
  setId: number;
  ticketId: number;
  rowId: number;
  numbers: number[];
}

// Get current user role
export const getCurrentUserRole = async (): Promise<'admin' | 'host' | null> => {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
    if (adminSnapshot.exists()) {
      const adminData = adminSnapshot.val();
      if (adminData.permissions && adminData.permissions.createHosts) {
        return 'admin';
      }
    }

    const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
    if (hostSnapshot.exists()) {
      const hostData = hostSnapshot.val();
      if (hostData.isActive) {
        return 'host';
      }
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
      console.log('🔐 Attempting admin login...');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log('✅ Firebase auth successful for:', user.email, 'UID:', user.uid);

      const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
      if (!adminSnapshot.exists()) {
        throw new Error(`Admin record not found for ${user.email}. Please contact system administrator.`);
      }

      const adminData = adminSnapshot.val() as AdminUser;
      
      if (!adminData.permissions || !adminData.permissions.createHosts) {
        throw new Error('Admin account does not have sufficient permissions.');
      }

      console.log('✅ Admin login successful');
      return adminData;
    } catch (error: any) {
      console.error('❌ Admin login failed:', error);
      throw new Error(error.message || 'Admin login failed');
    }
  }

  // Host operations
  async loginHost(email: string, password: string): Promise<HostUser | null> {
    try {
      console.log('🔐 Attempting host login...');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log('✅ Firebase auth successful for:', user.email);

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

      console.log('✅ Host login successful');
      return hostData;
    } catch (error: any) {
      console.error('❌ Host login failed:', error);
      throw new Error(error.message || 'Host login failed');
    }
  }

  // OPTION 1 IMPLEMENTATION: Create host with credential switch
  async createHost(
    email: string, 
    password: string, 
    name: string, 
    phone: string,
    adminUid: string, 
    subscriptionMonths: number = 12
  ): Promise<HostUser> {
    try {
      // Verify admin permissions first
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== adminUid) {
        throw new Error('Admin authorization failed. Please log in again.');
      }

      const adminSnapshot = await get(ref(database, `admins/${adminUid}`));
      if (!adminSnapshot.exists() || !adminSnapshot.val().permissions?.createHosts) {
        throw new Error('Admin does not have permission to create hosts.');
      }

      console.log('✅ Admin permissions verified');

      // Create Firebase auth account (auto signs in new user)
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      console.log('✅ Firebase auth account created');

      // Prepare host data
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

      // New user writes their own profile (allowed by rules)
      await set(ref(database, `hosts/${newUser.uid}`), removeUndefinedValues(hostData));
      console.log('✅ Host profile created');

      // Sign out new user immediately
      await signOut(auth);
      console.log('✅ Signed out new user');

      // Success - admin needs to log back in
      throw new Error(`SUCCESS: Host account created for ${email}! Please log in again as admin to continue.`);

    } catch (error: any) {
      // Always sign out to clean state
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

  async getAllActiveGames(): Promise<GameData[]> {
    try {
      const gamesSnapshot = await get(ref(database, 'games'));
      if (!gamesSnapshot.exists()) return [];
      
      const gamesData = gamesSnapshot.val();
      const allGames = Object.values(gamesData) as GameData[];
      
      return allGames.filter(game => 
        !game.gameState.gameOver && 
        game.tickets && 
        Object.keys(game.tickets).length > 0
      );
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

  // CORRECTED: Load predefined ticket sets from local JSON files
  async loadTicketSet(setId: string): Promise<TicketSetData> {
    try {
      console.log(`📁 Loading ticket set ${setId} from local JSON...`);
      
      // Fetch from public/data/ directory
      const response = await fetch(`/data/${setId}.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ticket set ${setId}: ${response.status} ${response.statusText}`);
      }
      
      // Parse the flat array format
      const rawData = await response.json() as RawTicketRow[];
      
      console.log(`📊 Raw data loaded: ${rawData.length} rows for set ${setId}`);
      
      // Transform flat array to nested ticket structure
      const tickets: { [key: string]: TambolaTicket } = {};
      const targetSetId = parseInt(setId);
      
      // Filter rows for this specific set
      const setRows = rawData.filter(row => row.setId === targetSetId);
      
      console.log(`📋 Filtered ${setRows.length} rows for setId ${targetSetId}`);
      
      if (setRows.length === 0) {
        console.warn(`⚠️ No rows found for setId ${targetSetId}`);
        const availableSets = [...new Set(rawData.map(row => row.setId))];
        console.log(`Available setIds in JSON:`, availableSets);
        return { ticketCount: 0, tickets: {} };
      }
      
      // Group rows by ticketId
      const ticketGroups: { [ticketId: string]: RawTicketRow[] } = {};
      setRows.forEach(row => {
        const ticketKey = row.ticketId.toString();
        if (!ticketGroups[ticketKey]) {
          ticketGroups[ticketKey] = [];
        }
        ticketGroups[ticketKey].push(row);
      });
      
      // Get all unique ticket IDs and sort them numerically
      const ticketIds = Object.keys(ticketGroups).sort((a, b) => parseInt(a) - parseInt(b));
      
      console.log(`🎫 Processing tickets for setId ${targetSetId}:`, {
        totalTicketGroups: ticketIds.length,
        ticketIdRange: ticketIds.length > 0 ? `${ticketIds[0]} to ${ticketIds[ticketIds.length - 1]}` : 'none',
        expectedTickets: 600
      });
      
      // Convert each ticket group to proper format
      let processedCount = 0;
      let skippedCount = 0;
      const skippedTickets: string[] = [];
      
      ticketIds.forEach(ticketId => {
        const rows = ticketGroups[ticketId];
        
        // Sort by rowId to ensure correct order (1, 2, 3)
        rows.sort((a, b) => a.rowId - b.rowId);
        
        // Validate we have exactly 3 rows with correct rowIds
        const expectedRowIds = [1, 2, 3];
        const actualRowIds = rows.map(r => r.rowId);
        
        if (rows.length === 3 && expectedRowIds.every(id => actualRowIds.includes(id))) {
          // Create ticket with original ticket ID from JSON
          tickets[ticketId] = {
            ticketId: ticketId,
            rows: [
              rows.find(r => r.rowId === 1)!.numbers, // Row 1
              rows.find(r => r.rowId === 2)!.numbers, // Row 2
              rows.find(r => r.rowId === 3)!.numbers  // Row 3
            ],
            isBooked: false
          };
          processedCount++;
        } else {
          console.warn(`⚠️ Skipping ticket ${ticketId} - expected rows [1,2,3], got [${actualRowIds.join(',')}]`);
          skippedTickets.push(ticketId);
          skippedCount++;
        }
      });
      
      const finalTicketCount = Object.keys(tickets).length;
      
      console.log(`✅ Ticket set ${setId} processing complete:`, {
        rawDataRows: rawData.length,
        filteredRowsForThisSet: setRows.length,
        uniqueTicketGroups: ticketIds.length,
        successfullyProcessed: processedCount,
        skippedDueToErrors: skippedCount,
        finalAvailableTickets: finalTicketCount,
        firstFewTicketIds: Object.keys(tickets).slice(0, 10),
        lastFewTicketIds: Object.keys(tickets).slice(-10)
      });
      
      if (skippedCount > 0) {
        console.warn(`⚠️ Skipped ${skippedCount} tickets due to row structure issues:`, skippedTickets.slice(0, 10));
      }
      
      // Verify we got a reasonable number of tickets
      if (finalTicketCount < 500) {
        console.warn(`⚠️ Warning: Only ${finalTicketCount} tickets loaded for set ${setId}. Expected around 600.`);
      }
      
      return {
        ticketCount: finalTicketCount,
        tickets
      };
      
    } catch (error: any) {
      console.error(`❌ Error loading ticket set ${setId}:`, error);
      
      return {
        ticketCount: 0,
        tickets: {}
      };
    }
  }

  // Game operations
  async createGame(
    gameConfig: { name: string; maxTickets: number; ticketPrice: number; hostPhone?: string },
    hostId: string,
    ticketSetId: string,
    selectedPrizes: string[]
  ): Promise<GameData> {
    try {
      console.log('🎮 Creating game...');
      
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No authenticated user. Please log in again.');
      }

      if (currentUser.uid !== hostId) {
        throw new Error('User ID mismatch. Please log in again.');
      }

      const userRole = await getCurrentUserRole();
      if (!userRole || (userRole !== 'host' && userRole !== 'admin')) {
        throw new Error('Insufficient permissions. Please contact administrator.');
      }

      console.log('✅ User permissions verified:', userRole);

      const gameRef = push(ref(database, 'games'));
      const gameId = gameRef.key!;

      const ticketSetData = await this.loadTicketSet(ticketSetId);

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
      
      console.log('✅ Game created successfully:', gameId);
      return gameData;
    } catch (error: any) {
      console.error('❌ Game creation failed:', error);
      throw new Error(error.message || 'Failed to create game');
    }
  }

  async getHostGames(hostId: string): Promise<GameData[]> {
    try {
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      if (!gamesSnapshot.exists()) return [];
      
      const gamesData = gamesSnapshot.val();
      return Object.values(gamesData) as GameData[];
    } catch (error: any) {
      throw new Error(error.message || 'Failed to fetch host games');
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
      const cleanedGameData = removeUndefinedValues(gameData);
      await update(ref(database, `games/${gameId}`), cleanedGameData);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update game data');
    }
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

      if (allPrizesWon) {
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

  async addCalledNumber(gameId: string, number: number): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const currentCalledNumbers = gameData.gameState.calledNumbers || [];
      
      if (!currentCalledNumbers.includes(number)) {
        const updatedGameState: GameState = {
          ...gameData.gameState,
          calledNumbers: [...currentCalledNumbers, number],
          currentNumber: number
        };

        const cleanedGameState = removeUndefinedValues({ gameState: updatedGameState });
        await update(gameRef, cleanedGameState);
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to add called number');
    }
  }

  async clearCurrentNumber(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const updatedGameState: GameState = {
        ...gameData.gameState,
        currentNumber: null
      };

      const cleanedGameState = removeUndefinedValues({ gameState: updatedGameState });
      await update(gameRef, cleanedGameState);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to clear current number');
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

  // Ticket operations
  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      const ticketSnapshot = await get(ticketRef);
      
      if (!ticketSnapshot.exists()) {
        throw new Error('Ticket not found');
      }

      const ticketData = ticketSnapshot.val() as TambolaTicket;
      if (ticketData.isBooked) {
        throw new Error('Ticket is already booked');
      }

      const updatedTicket = removeUndefinedValues({
        ...ticketData,
        isBooked: true,
        playerName,
        playerPhone,
        bookedAt: new Date().toISOString()
      });

      await set(ticketRef, updatedTicket);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  async updateTicket(gameId: string, ticketId: string, ticketData: Partial<TambolaTicket>): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      const ticketSnapshot = await get(ticketRef);
      
      if (!ticketSnapshot.exists()) {
        throw new Error('Ticket not found');
      }

      const currentTicket = ticketSnapshot.val() as TambolaTicket;
      const updatedTicket = removeUndefinedValues({
        ...currentTicket,
        ...ticketData,
        updatedAt: new Date().toISOString()
      });

      await set(ticketRef, updatedTicket);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update ticket');
    }
  }

  async unbookTicket(gameId: string, ticketId: string): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      const ticketSnapshot = await get(ticketRef);
      
      if (!ticketSnapshot.exists()) {
        throw new Error('Ticket not found');
      }

      const currentTicket = ticketSnapshot.val() as TambolaTicket;
      const unBookedTicket = removeUndefinedValues({
        ...currentTicket,
        isBooked: false,
        playerName: undefined,
        playerPhone: undefined,
        bookedAt: undefined,
        updatedAt: new Date().toISOString()
      });

      await set(ticketRef, unBookedTicket);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to unbook ticket');
    }
  }

  // Real-time subscriptions
  subscribeToGame(gameId: string, callback: (game: GameData | null) => void): () => void {
    const gameRef = ref(database, `games/${gameId}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as GameData);
      } else {
        callback(null);
      }
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

  subscribeToHostGames(hostId: string, callback: (games: GameData[]) => void): () => void {
    const gamesQuery = query(
      ref(database, 'games'),
      orderByChild('hostId'),
      equalTo(hostId)
    );
    
    const unsubscribe = onValue(gamesQuery, (snapshot) => {
      if (snapshot.exists()) {
        const gamesData = snapshot.val();
        const games = Object.values(gamesData) as GameData[];
        callback(games);
      } else {
        callback([]);
      }
    });

    return () => off(gamesQuery, 'value', unsubscribe);
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

  // Debug method for ticket transformation (temporary)
  async debugTicketTransformation(setId: string): Promise<void> {
    console.log(`\n🔍 Debug: Testing ticket transformation for set ${setId}`);
    
    try {
      // Load raw data
      const response = await fetch(`/data/${setId}.json`);
      const rawData = await response.json();
      
      console.log(`📊 Raw data sample:`, rawData.slice(0, 3));
      console.log(`📊 Total rows in file: ${rawData.length}`);
      
      // Test transformation
      const ticketSet = await this.loadTicketSet(setId);
      
      console.log(`📋 Transformation result:`, {
        ticketCount: ticketSet.ticketCount,
        firstTicketId: Object.keys(ticketSet.tickets)[0],
        sampleTicket: Object.values(ticketSet.tickets)[0]
      });
      
      // Validate first ticket structure
      const firstTicket = Object.values(ticketSet.tickets)[0];
      if (firstTicket) {
        console.log(`✅ First ticket structure:`, {
          ticketId: firstTicket.ticketId,
          rowCount: firstTicket.rows.length,
          row1Numbers: firstTicket.rows[0],
          row2Numbers: firstTicket.rows[1], 
          row3Numbers: firstTicket.rows[2],
          isBooked: firstTicket.isBooked
        });
        
        // Count non-zero numbers in each row
        firstTicket.rows.forEach((row, index) => {
          const nonZeroCount = row.filter(n => n !== 0).length;
          console.log(`Row ${index + 1}: ${nonZeroCount} numbers, ${9 - nonZeroCount} empty cells`);
        });
      }
      
    } catch (error) {
      console.error(`❌ Debug error for set ${setId}:`, error);
    }
  }
}

export const firebaseService = new FirebaseService();
