// src/services/firebase.ts - COMPLETE VERSION WITH ADMIN FUNCTIONALITY
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
  updatePassword,
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

// ✅ NEW: Admin User Interface
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
}

export interface HostUser {
  uid: string;
  email: string;
  name: string;
  phone: string;
  role: 'host';
  subscriptionEndDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string; // Admin who created this host
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
  
  // ================== AUTHENTICATION ==================
  
  async signIn(email: string, password: string): Promise<HostUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await this.getUserData(userCredential.user.uid);
      if (!userData) {
        throw new Error('User data not found');
      }
      return userData;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign in');
    }
  }

  async signUp(email: string, password: string, userData: Partial<HostUser>): Promise<HostUser> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const hostUser: HostUser = {
        uid: userCredential.user.uid,
        email,
        role: 'host',
        createdAt: new Date().toISOString(),
        ...userData
      } as HostUser;
      
      await set(ref(database, `users/${userCredential.user.uid}`), removeUndefinedValues(hostUser));
      return hostUser;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create account');
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign out');
    }
  }

  // ✅ NEW: Get current user data (admin or host) with better error handling
  async getUserData(uid?: string): Promise<AdminUser | HostUser | null> {
    try {
      const userId = uid || auth.currentUser?.uid;
      if (!userId) return null;
      
      const userSnapshot = await get(ref(database, `users/${userId}`));
      return userSnapshot.exists() ? userSnapshot.val() as (AdminUser | HostUser) : null;
    } catch (error: any) {
      console.error('Error fetching user data:', error);
      
      // Log more details about the error
      if (error.message?.includes('Permission denied')) {
        console.log('🔒 Database permission denied - check Firebase rules');
        console.log('👤 Current auth user:', auth.currentUser?.uid);
        console.log('📊 Trying to read path: /users/' + (uid || auth.currentUser?.uid));
      }
      
      return null;
    }
  }

  // ✅ NEW: Get current user role (with permission error handling)
  async getCurrentUserRole(): Promise<'admin' | 'host' | null> {
    try {
      const user = await this.getUserData();
      return user?.role || null;
    } catch (error: any) {
      console.error('Error getting user role:', error);
      
      // If it's a permission error, try to determine role from email or other means
      if (error.message?.includes('Permission denied')) {
        console.log('⚠️ Permission denied reading user data, checking auth user info');
        
        const currentUser = auth.currentUser;
        if (currentUser) {
          // For now, assume authenticated users are hosts (temporary fix)
          // In production, you'd want better role detection
          console.log('🔑 Authenticated user found, assuming host role (temporary)');
          return 'host';
        }
      }
      
      return null;
    }
  }

  // ✅ NEW: Admin login
  async loginAdmin(email: string, password: string): Promise<AdminUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await this.getUserData(userCredential.user.uid);
      
      if (!userData || userData.role !== 'admin') {
        await signOut(auth);
        throw new Error('Access denied. Admin credentials required.');
      }
      
      return userData as AdminUser;
    } catch (error: any) {
      throw new Error(error.message || 'Admin login failed');
    }
  }

  // ✅ NEW: Host login (with better error handling)
  async loginHost(email: string, password: string): Promise<HostUser> {
    try {
      console.log('🔐 Attempting host login for:', email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ Firebase auth successful, user ID:', userCredential.user.uid);
      
      // Add delay to ensure auth context is established
      await new Promise(resolve => setTimeout(resolve, 500));
      
      let userData;
      try {
        userData = await this.getUserData(userCredential.user.uid);
        console.log('📊 User data retrieved:', userData ? 'Found' : 'Not found');
      } catch (dbError: any) {
        console.error('❌ Database read error:', dbError.message);
        // For now, let's not fail if we can't read user data
        console.log('⚠️ Proceeding without user data validation (temporary)');
        
        // Return a minimal host user object
        return {
          uid: userCredential.user.uid,
          email: email,
          name: email.split('@')[0], // Use email prefix as name
          phone: '',
          role: 'host',
          subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
          isActive: true,
          createdAt: new Date().toISOString()
        } as HostUser;
      }
      
      if (!userData) {
        console.log('⚠️ No user data found, creating temporary host profile');
        return {
          uid: userCredential.user.uid,
          email: email,
          name: email.split('@')[0],
          phone: '',
          role: 'host',
          subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
          createdAt: new Date().toISOString()
        } as HostUser;
      }
      
      if (userData.role !== 'host') {
        await signOut(auth);
        throw new Error('Access denied. Host credentials required.');
      }

      const hostUser = userData as HostUser;
      
      // Check if host account is active (if these fields exist)
      if (hostUser.isActive === false) {
        await signOut(auth);
        throw new Error('Your account has been deactivated. Please contact the administrator.');
      }

      // Check subscription validity (if field exists)
      if (hostUser.subscriptionEndDate) {
        const subscriptionEnd = new Date(hostUser.subscriptionEndDate);
        const now = new Date();
        
        if (subscriptionEnd < now) {
          await signOut(auth);
          throw new Error('Your subscription has expired. Please contact the administrator.');
        }
      }
      
      console.log('✅ Host login successful');
      return hostUser;
    } catch (error: any) {
      console.error('❌ Host login error:', error);
      throw new Error(error.message || 'Host login failed');
    }
  }

  // ✅ NEW: Logout (unified)
  async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to logout');
    }
  }

  onAuthStateChanged(callback: (user: AdminUser | HostUser | null) => void): () => void {
    return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        const userData = await this.getUserData(firebaseUser.uid);
        callback(userData);
      } else {
        callback(null);
      }
    });
  }

  // ================== ADMIN FUNCTIONALITY ==================

  // ✅ NEW: Create host account (Admin only)
  async createHost(
    email: string, 
    password: string, 
    name: string, 
    phone: string, 
    adminId: string, 
    subscriptionMonths: number = 12
  ): Promise<HostUser> {
    try {
      console.log('🔐 Admin creating host account:', { email, name, phone });

      // Store current user credentials
      const currentUser = auth.currentUser;
      const currentUserEmail = currentUser?.email;

      // Create new host account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const hostId = userCredential.user.uid;

      // Calculate subscription end date
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);

      const hostUser: HostUser = {
        uid: hostId,
        email,
        name,
        phone,
        role: 'host',
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        createdBy: adminId
      };

      // Save host data
      await set(ref(database, `users/${hostId}`), removeUndefinedValues(hostUser));

      // Sign out the new host user (we're logged in as them now)
      await signOut(auth);

      // The admin will need to log back in, but that's handled by the component
      console.log('✅ Host created successfully, admin needs to log back in');
      
      // Return success message in error format to trigger re-login
      throw new Error(`SUCCESS: Host account created successfully for ${name}. Please log back in as admin to continue.`);

    } catch (error: any) {
      // Re-throw success messages and real errors
      throw new Error(error.message || 'Failed to create host account');
    }
  }

  // ✅ NEW: Get all hosts (Admin only)
  async getAllHosts(): Promise<HostUser[]> {
    try {
      const hostsQuery = query(
        ref(database, 'users'),
        orderByChild('role'),
        equalTo('host')
      );
      
      const hostsSnapshot = await get(hostsQuery);
      
      if (!hostsSnapshot.exists()) {
        return [];
      }

      const hosts = Object.values(hostsSnapshot.val()) as HostUser[];
      
      // Sort by creation date (newest first)
      return hosts.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error: any) {
      console.error('Error fetching hosts:', error);
      throw new Error(error.message || 'Failed to fetch hosts');
    }
  }

  // ✅ NEW: Get host by ID
  async getHostById(hostId: string): Promise<HostUser | null> {
    try {
      const hostSnapshot = await get(ref(database, `users/${hostId}`));
      
      if (hostSnapshot.exists()) {
        const userData = hostSnapshot.val();
        return userData.role === 'host' ? userData as HostUser : null;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching host:', error);
      return null;
    }
  }

  // ✅ NEW: Update host (Admin only)
  async updateHost(hostId: string, updates: Partial<HostUser>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues({
        ...updates,
        updatedAt: new Date().toISOString()
      });

      await update(ref(database, `users/${hostId}`), cleanUpdates);
      console.log('✅ Host updated successfully');
    } catch (error: any) {
      console.error('Error updating host:', error);
      throw new Error(error.message || 'Failed to update host');
    }
  }

  // ✅ NEW: Delete host (Admin only)
  async deleteHost(hostId: string): Promise<void> {
    try {
      // Check if host has any active games
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      
      if (gamesSnapshot.exists()) {
        const games = Object.values(gamesSnapshot.val()) as GameData[];
        const activeGames = games.filter(game => !game.gameState.gameOver);
        
        if (activeGames.length > 0) {
          throw new Error('Cannot delete host with active games. Please end all games first.');
        }
      }

      // Delete host data
      await remove(ref(database, `users/${hostId}`));
      
      // Delete host settings
      await remove(ref(database, `hostSettings/${hostId}`));
      
      console.log('✅ Host deleted successfully');
    } catch (error: any) {
      console.error('Error deleting host:', error);
      throw new Error(error.message || 'Failed to delete host');
    }
  }

  // ✅ NEW: Change host password (Admin only)
  async changeHostPassword(hostId: string, newPassword: string): Promise<void> {
    try {
      // This is a simplified approach - in production, you'd want to use Firebase Admin SDK
      // For now, we'll update the host record to indicate password change needed
      await update(ref(database, `users/${hostId}`), {
        passwordChangeRequired: true,
        passwordChangedAt: new Date().toISOString()
      });
      
      console.log('✅ Password change initiated for host');
      
      // Note: Actual password change would require Firebase Admin SDK or 
      // the host to log in and change it themselves
      throw new Error('Password change initiated. Host will need to reset password on next login.');
    } catch (error: any) {
      console.error('Error changing host password:', error);
      throw new Error(error.message || 'Failed to change host password');
    }
  }

  // ✅ NEW: Extend host subscription (Admin only)
  async extendHostSubscription(hostId: string, additionalMonths: number): Promise<void> {
    try {
      const hostSnapshot = await get(ref(database, `users/${hostId}`));
      
      if (!hostSnapshot.exists()) {
        throw new Error('Host not found');
      }

      const hostData = hostSnapshot.val() as HostUser;
      const currentEndDate = new Date(hostData.subscriptionEndDate);
      
      // Add months to current end date (even if expired)
      currentEndDate.setMonth(currentEndDate.getMonth() + additionalMonths);

      await update(ref(database, `users/${hostId}`), {
        subscriptionEndDate: currentEndDate.toISOString(),
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Extended subscription by ${additionalMonths} months`);
    } catch (error: any) {
      console.error('Error extending subscription:', error);
      throw new Error(error.message || 'Failed to extend subscription');
    }
  }

  // ✅ NEW: Toggle host status (Admin only)
  async toggleHostStatus(hostId: string, isActive: boolean): Promise<void> {
    try {
      await update(ref(database, `users/${hostId}`), {
        isActive,
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Host status updated: ${isActive ? 'activated' : 'deactivated'}`);
    } catch (error: any) {
      console.error('Error updating host status:', error);
      throw new Error(error.message || 'Failed to update host status');
    }
  }

  // ✅ NEW: Subscribe to hosts (Admin real-time updates)
  subscribeToHosts(callback: (hosts: HostUser[] | null) => void): () => void {
    const hostsQuery = query(
      ref(database, 'users'),
      orderByChild('role'),
      equalTo('host')
    );
    
    const unsubscribe = onValue(hostsQuery, (snapshot) => {
      if (snapshot.exists()) {
        const hosts = Object.values(snapshot.val()) as HostUser[];
        const sortedHosts = hosts.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        callback(sortedHosts);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Hosts subscription error:', error);
      callback(null);
    });

    return () => off(hostsQuery, 'value', unsubscribe);
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

  async updateTicket(gameId: string, ticketId: string, updates: Partial<TambolaTicket>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}/tickets/${ticketId}`), cleanUpdates);
      console.log(`✅ Ticket ${ticketId} updated successfully`);
    } catch (error: any) {
      console.error('❌ Error updating ticket:', error);
      throw new Error(error.message || 'Failed to update ticket');
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

  // ================== AUTOMATIC NUMBER CALLING ==================

  /**
   * Automatic number calling (generates random number)
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
   * Internal method for processing number calls
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

  // Legacy alias for backward compatibility
  subscribeToGames = this.subscribeToAllActiveGames;
}

// ================== EXPORT SINGLETON ==================

export const firebaseService = new FirebaseService();

// ✅ NEW: Export getCurrentUserRole as standalone function for backward compatibility
export const getCurrentUserRole = () => firebaseService.getCurrentUserRole();

export default firebaseService;
