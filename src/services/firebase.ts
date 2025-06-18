// src/services/firebase.ts - FIXED: Proper role-based authentication
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
  Auth,
  updatePassword
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

// ✅ FIXED: Separate types for hosts and admins
export interface HostUser {
  uid: string;
  email: string;
  name: string;
  phone: string;
  role: 'host';
  subscriptionEndDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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

// Generate traditional Tambola ticket (3 rows x 9 columns)
const generateTambolaTicket = (ticketId: string): TambolaTicket => {
  const ticket: number[][] = [[], [], []];
  
  // Column ranges for Tambola: 1-9, 10-19, 20-29, ..., 80-90
  const columnRanges = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 90]
  ];
  
  // Generate numbers for each row
  for (let row = 0; row < 3; row++) {
    const rowNumbers: number[] = [];
    const usedColumns = new Set<number>();
    
    // Each row needs 5 numbers and 4 empty spaces
    while (rowNumbers.length < 5) {
      const col = Math.floor(Math.random() * 9);
      if (usedColumns.has(col)) continue;
      
      const [min, max] = columnRanges[col];
      const number = Math.floor(Math.random() * (max - min + 1)) + min;
      
      if (!rowNumbers.includes(number)) {
        rowNumbers.push(number);
        usedColumns.add(col);
      }
    }
    
    // Sort numbers for this row
    rowNumbers.sort((a, b) => a - b);
    
    // Create row with numbers and empty spaces
    const fullRow: number[] = new Array(9).fill(0);
    const positions = Array.from(usedColumns).sort((a, b) => a - b);
    
    for (let i = 0; i < positions.length; i++) {
      fullRow[positions[i]] = rowNumbers[i];
    }
    
    ticket[row] = fullRow;
  }
  
  return {
    ticketId,
    rows: ticket,
    isBooked: false
  };
};

// ================== FIREBASE SERVICE CLASS ==================

class FirebaseService {
  
  // ================== ROLE DETECTION ==================
  
  /**
   * ✅ NEW: Get current user role by checking both collections
   */
  async getCurrentUserRole(): Promise<'admin' | 'host' | null> {
    try {
      const user = auth.currentUser;
      if (!user) return null;
      
      console.log('🔍 Checking user role for:', user.uid);
      
      // Check if user is admin
      const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
      if (adminSnapshot.exists()) {
        console.log('👑 User is admin');
        return 'admin';
      }
      
      // Check if user is host
      const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
      if (hostSnapshot.exists()) {
        console.log('🏠 User is host');
        return 'host';
      }
      
      console.log('❓ User role not found');
      return null;
    } catch (error) {
      console.error('Error determining user role:', error);
      return null;
    }
  }

  /**
   * ✅ FIXED: Get user data from appropriate collection
   */
  async getUserData(uid?: string): Promise<AdminUser | HostUser | null> {
    try {
      const userId = uid || auth.currentUser?.uid;
      if (!userId) return null;
      
      console.log('📊 Attempting to read user data for:', userId);
      
      // Try admin collection first
      try {
        const adminSnapshot = await get(ref(database, `admins/${userId}`));
        if (adminSnapshot.exists()) {
          console.log('✅ Found admin data');
          return adminSnapshot.val() as AdminUser;
        }
      } catch (error) {
        console.log('📊 Admin collection check failed, trying hosts...');
      }
      
      // Try host collection
      try {
        const hostSnapshot = await get(ref(database, `hosts/${userId}`));
        if (hostSnapshot.exists()) {
          console.log('✅ Found host data');
          return hostSnapshot.val() as HostUser;
        }
      } catch (error) {
        console.log('📊 Host collection check failed');
      }
      
      console.log('❌ No user data found in either collection');
      return null;
    } catch (error: any) {
      console.error('❌ Error fetching user data:', error.message);
      
      // Enhanced error logging for debugging
      if (error.message.includes('Permission denied')) {
        console.log('🔒 Database permission denied - this is a Firebase rules issue');
        console.log('👤 Current auth user:', auth.currentUser?.uid);
        console.log('📊 Trying to read path: /admins/ or /hosts/');
        console.log('💡 User is authenticated but cannot read database - rules need updating');
      }
      
      return null;
    }
  }

  // ================== AUTHENTICATION ==================
  
  /**
   * ✅ NEW: Host login method
   */
  async loginHost(email: string, password: string): Promise<HostUser> {
    try {
      console.log('🔐 Attempting host login for:', email);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ Firebase auth successful, user ID:', userCredential.user.uid);
      
      // Get host data from hosts collection
      const hostData = await this.getUserData(userCredential.user.uid);
      
      if (!hostData || hostData.role !== 'host') {
        // Sign out if not a valid host
        await signOut(auth);
        throw new Error('Access denied. Host credentials required.');
      }
      
      console.log('✅ Host login successful');
      return hostData as HostUser;
    } catch (error: any) {
      console.error('❌ Host login error:', error);
      throw new Error(error.message || 'Failed to login as host');
    }
  }

  /**
   * ✅ NEW: Admin login method
   */
  async loginAdmin(email: string, password: string): Promise<AdminUser> {
    try {
      console.log('🔐 Attempting admin login for:', email);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ Firebase auth successful, user ID:', userCredential.user.uid);
      
      // Get admin data from admins collection
      const adminData = await this.getUserData(userCredential.user.uid);
      
      if (!adminData || adminData.role !== 'admin') {
        // Sign out if not a valid admin
        await signOut(auth);
        throw new Error('Access denied. Admin credentials required.');
      }
      
      console.log('✅ Admin login successful');
      return adminData as AdminUser;
    } catch (error: any) {
      console.error('❌ Admin login error:', error);
      throw new Error(error.message || 'Failed to login as admin');
    }
  }

  /**
   * ✅ NEW: Generic logout method
   */
  async logout(): Promise<void> {
    try {
      await signOut(auth);
      console.log('✅ User logged out successfully');
    } catch (error: any) {
      console.error('❌ Logout error:', error);
      throw new Error(error.message || 'Failed to logout');
    }
  }

  // ================== ADMIN FUNCTIONALITY ==================

  /**
   * ✅ NEW: Create host account (admin only)
   */
  async createHost(
    email: string, 
    password: string, 
    name: string, 
    phone: string, 
    adminUid: string,
    subscriptionMonths: number = 12
  ): Promise<void> {
    try {
      console.log('👨‍💼 Admin creating host account:', email);
      
      // Store current admin credentials
      const currentUser = auth.currentUser;
      const currentAdminData = await this.getUserData(adminUid);
      
      if (!currentAdminData || currentAdminData.role !== 'admin') {
        throw new Error('Unauthorized: Only admins can create hosts');
      }
      
      // Create new user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUserId = userCredential.user.uid;
      
      // Calculate subscription end date
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
      
      // Create host data
      const hostData: HostUser = {
        uid: newUserId,
        email,
        name,
        phone,
        role: 'host',
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Save to hosts collection
      await set(ref(database, `hosts/${newUserId}`), removeUndefinedValues(hostData));
      
      // Sign out the newly created user and restore admin session
      await signOut(auth);
      
      console.log('✅ Host account created successfully');
      
      // Return success message that triggers credential switch warning
      throw new Error('SUCCESS: Host account created. You will be logged out for security. Please log back in as admin.');
      
    } catch (error: any) {
      console.error('❌ Error creating host:', error);
      
      // Re-throw success messages
      if (error.message.startsWith('SUCCESS:')) {
        throw error;
      }
      
      throw new Error(error.message || 'Failed to create host account');
    }
  }

  /**
   * ✅ NEW: Get all hosts (admin only)
   */
  async getAllHosts(): Promise<HostUser[]> {
    try {
      const hostsSnapshot = await get(ref(database, 'hosts'));
      
      if (!hostsSnapshot.exists()) {
        return [];
      }
      
      const hosts = Object.values(hostsSnapshot.val()) as HostUser[];
      return hosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error: any) {
      console.error('Error fetching hosts:', error);
      throw new Error(error.message || 'Failed to fetch hosts');
    }
  }

  /**
   * ✅ NEW: Update host (admin only)
   */
  async updateHost(hostUid: string, updates: Partial<HostUser>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues({
        ...updates,
        updatedAt: new Date().toISOString()
      });
      
      await update(ref(database, `hosts/${hostUid}`), cleanUpdates);
      console.log('✅ Host updated successfully');
    } catch (error: any) {
      console.error('❌ Error updating host:', error);
      throw new Error(error.message || 'Failed to update host');
    }
  }

  /**
   * ✅ NEW: Delete host (admin only)
   */
  async deleteHost(hostUid: string): Promise<void> {
    try {
      await remove(ref(database, `hosts/${hostUid}`));
      console.log('✅ Host deleted successfully');
    } catch (error: any) {
      console.error('❌ Error deleting host:', error);
      throw new Error(error.message || 'Failed to delete host');
    }
  }

  /**
   * ✅ NEW: Change host password (admin only)
   */
  async changeHostPassword(hostUid: string, newPassword: string): Promise<void> {
    try {
      // This would typically require admin privileges in a real implementation
      // For now, we'll just throw an informative error
      throw new Error('Password change requires Firebase Admin SDK on server side');
    } catch (error: any) {
      console.error('❌ Error changing host password:', error);
      throw new Error(error.message || 'Failed to change password');
    }
  }

  /**
   * ✅ NEW: Extend host subscription (admin only)
   */
  async extendHostSubscription(hostUid: string, additionalMonths: number): Promise<void> {
    try {
      const hostData = await this.getUserData(hostUid) as HostUser;
      if (!hostData) {
        throw new Error('Host not found');
      }
      
      const currentEndDate = new Date(hostData.subscriptionEndDate);
      const newEndDate = new Date(currentEndDate);
      newEndDate.setMonth(newEndDate.getMonth() + additionalMonths);
      
      await this.updateHost(hostUid, {
        subscriptionEndDate: newEndDate.toISOString()
      });
      
      console.log('✅ Host subscription extended successfully');
    } catch (error: any) {
      console.error('❌ Error extending subscription:', error);
      throw new Error(error.message || 'Failed to extend subscription');
    }
  }

  /**
   * ✅ NEW: Toggle host status (admin only)
   */
  async toggleHostStatus(hostUid: string, isActive: boolean): Promise<void> {
    try {
      await this.updateHost(hostUid, { isActive });
      console.log('✅ Host status updated successfully');
    } catch (error: any) {
      console.error('❌ Error updating host status:', error);
      throw new Error(error.message || 'Failed to update host status');
    }
  }

  /**
   * ✅ NEW: Subscribe to hosts updates (admin only)
   */
  subscribeToHosts(callback: (hosts: HostUser[] | null) => void): () => void {
    const hostsRef = ref(database, 'hosts');
    
    const unsubscribe = onValue(hostsRef, (snapshot) => {
      if (snapshot.exists()) {
        const hosts = Object.values(snapshot.val()) as HostUser[];
        const sortedHosts = hosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(sortedHosts);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Hosts subscription error:', error);
      callback(null);
    });

    return () => off(hostsRef, 'value', unsubscribe);
  }

  /**
   * ✅ NEW: Get host by ID
   */
  async getHostById(hostId: string): Promise<HostUser | null> {
    try {
      const hostSnapshot = await get(ref(database, `hosts/${hostId}`));
      return hostSnapshot.exists() ? hostSnapshot.val() as HostUser : null;
    } catch (error) {
      console.error('Error fetching host by ID:', error);
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

  // ================== GAME MANAGEMENT ==================

  async createGame(
    config: CreateGameConfig,
    hostId: string,
    ticketSetId: string,
    selectedPrizes: string[]
  ): Promise<GameData> {
    try {
      console.log(`🎮 Creating game for host ${hostId} with ${config.maxTickets} tickets`);

      // Generate tickets based on selected set
      const tickets: { [ticketId: string]: TambolaTicket } = {};
      for (let i = 1; i <= config.maxTickets; i++) {
        const ticketId = i.toString().padStart(3, '0');
        tickets[ticketId] = generateTambolaTicket(ticketId);
      }

      // Initialize selected prizes
      const availablePrizes = {
        quickFive: {
          id: 'quickFive',
          name: 'Quick Five',
          pattern: 'First 5 numbers',
          description: 'First player to mark any 5 numbers',
          won: false
        },
        topLine: {
          id: 'topLine',
          name: 'Top Line',
          pattern: 'Complete top row',
          description: 'Complete the top row of any ticket',
          won: false
        },
        middleLine: {
          id: 'middleLine',
          name: 'Middle Line',
          pattern: 'Complete middle row',
          description: 'Complete the middle row of any ticket',
          won: false
        },
        bottomLine: {
          id: 'bottomLine',
          name: 'Bottom Line',
          pattern: 'Complete bottom row',
          description: 'Complete the bottom row of any ticket',
          won: false
        },
        fullHouse: {
          id: 'fullHouse',
          name: 'Full House',
          pattern: 'All numbers',
          description: 'Mark all numbers on the ticket',
          won: false
        }
      };

      const prizes: { [prizeId: string]: Prize } = {};
      for (const prizeId of selectedPrizes) {
        if (availablePrizes[prizeId as keyof typeof availablePrizes]) {
          prizes[prizeId] = availablePrizes[prizeId as keyof typeof availablePrizes];
        }
      }

      // Create game data
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

      // Save to Firebase
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
      console.log('✅ Game data updated successfully');
    } catch (error: any) {
      console.error('❌ Error updating game data:', error);
      throw new Error(error.message || 'Failed to update game data');
    }
  }

  async updateGameState(gameId: string, updates: Partial<GameState>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}/gameState`), cleanUpdates);
      console.log(`✅ Game state updated successfully`);
    } catch (error: any) {
      console.error('❌ Error updating game state:', error);
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  async getHostCurrentGame(hostId: string): Promise<GameData | null> {
    try {
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      
      if (!gamesSnapshot.exists()) {
        return null;
      }

      // Find the most recent non-finished game
      const games = Object.values(gamesSnapshot.val()) as GameData[];
      const activeGame = games
        .filter(game => !game.gameState.gameOver)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

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
      
      // Return games that are not finished, sorted by creation date
      return allGames
        .filter(game => !game.gameState.gameOver)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('Error fetching active games:', error);
      return [];
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
      const ticketData = {
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        bookedAt: new Date().toISOString()
      };

      await update(
        ref(database, `games/${gameId}/tickets/${ticketId}`),
        removeUndefinedValues(ticketData)
      );
      
      console.log(`✅ Ticket ${ticketId} booked for ${playerName}`);
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

  async updateTicket(
    gameId: string, 
    ticketId: string, 
    updates: Partial<TambolaTicket>
  ): Promise<void> {
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

  /**
   * ✅ NEW: Automatic number calling (generates random number)
   */
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
      
      // Generate available numbers (1-90)
      const allNumbers = Array.from({ length: 90 }, (_, i) => i + 1);
      const availableNumbers = allNumbers.filter(num => !calledNumbers.includes(num));
      
      if (availableNumbers.length === 0) {
        console.log(`🏁 No more numbers available for game: ${gameId}`);
        return { 
          success: true, 
          gameEnded: true
        };
      }

      // Select random number
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const selectedNumber = availableNumbers[randomIndex];
      
      // Validate the selected number
      if (typeof selectedNumber !== 'number' || selectedNumber < 1 || selectedNumber > 90) {
        console.error('❌ Invalid number generated:', selectedNumber);
        throw new Error(`Invalid number generated: ${selectedNumber}`);
      }

      console.log(`🎲 Selected number ${selectedNumber} from ${availableNumbers.length} available numbers`);
      
      // Call the internal validation method
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

  /**
   * ✅ RENAMED: Internal method for processing number calls
   */
  private async processNumberCall(gameId: string, number: number): Promise<{
    success: boolean;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
    gameEnded?: boolean;
  }> {
    try {
      // Input validation
      if (typeof number !== 'number' || number < 1 || number > 90 || !Number.isInteger(number)) {
        console.error('❌ Invalid number provided:', number);
        throw new Error(`Invalid number: ${number}. Must be integer between 1-90.`);
      }

      console.log(`📞 Processing number call: ${number} for game: ${gameId}`);
      
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const currentCalledNumbers = gameData.gameState.calledNumbers || [];
      
      // Check if number already called
      if (currentCalledNumbers.includes(number)) {
        console.warn(`⚠️ Number ${number} already called`);
        return { success: false };
      }

      const updatedCalledNumbers = [...currentCalledNumbers, number];
      
      // Validate the array before updating
      if (updatedCalledNumbers.some(n => typeof n !== 'number' || n < 1 || n > 90)) {
        console.error('❌ Invalid numbers in calledNumbers array:', updatedCalledNumbers);
        throw new Error('Invalid numbers detected in calledNumbers array');
      }
      
      const unwonPrizes = Object.fromEntries(
        Object.entries(gameData.prizes).filter(([_, prize]) => !prize.won)
      );

      const validationResult = await this.validateTicketsForPrizes(
        gameData.tickets || {}, 
        updatedCalledNumbers, 
        unwonPrizes
      );
      
      // Clean game state updates
      const gameUpdates: any = {
        gameState: removeUndefinedValues({
          ...gameData.gameState,
          calledNumbers: updatedCalledNumbers,
          currentNumber: number
        })
      };

      const announcements: string[] = [];

      // Handle prize wins
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

      // Check if game should end
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

  async validateTicketsForPrizes(
    tickets: { [ticketId: string]: TambolaTicket },
    calledNumbers: number[],
    prizes: { [prizeId: string]: Prize }
  ): Promise<{ winners: { [prizeId: string]: any } }> {
    const winners: { [prizeId: string]: any } = {};

    for (const [prizeId, prize] of Object.entries(prizes)) {
      if (prize.won) continue;

      const prizeWinners: { name: string; ticketId: string; phone?: string }[] = [];

      for (const [ticketId, ticket] of Object.entries(tickets)) {
        if (!ticket.isBooked || !ticket.playerName) continue;

        let hasWon = false;

        switch (prizeId) {
          case 'quickFive': {
            const ticketNumbers = ticket.rows.flat().filter(n => n > 0);
            const markedCount = ticketNumbers.filter(n => calledNumbers.includes(n)).length;
            hasWon = markedCount >= 5;
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

          case 'fullHouse': {
            const allTicketNumbers = ticket.rows.flat().filter(n => n > 0);
            hasWon = allTicketNumbers.every(n => calledNumbers.includes(n));
            break;
          }
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
        const activeGames = allGames
          .filter(game => !game.gameState.gameOver)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(activeGames);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Games subscription error:', error);
      callback([]);
    });

    return () => off(gamesRef, 'value', unsubscribe);
  }
}

// ================== EXPORT SINGLETON ==================

export const firebaseService = new FirebaseService();

/**
 * ✅ NEW: Get current user role (exported function)
 */
export const getCurrentUserRole = async (): Promise<'admin' | 'host' | null> => {
  return await firebaseService.getCurrentUserRole();
};

export default firebaseService;
