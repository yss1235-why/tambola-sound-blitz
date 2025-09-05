// src/services/firebase-core.ts - FIXED: Consistent hostSettings path usage
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
  runTransaction
} from 'firebase/database';
import { 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';

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

// Add these new interfaces BEFORE the GameData interface
export interface SessionMetadata {
  created: string;                      // When sequence was created
  source: 'admin' | 'host';            // Who generated the sequence
  validated: boolean;                   // Whether sequence is validated
  totalNumbers: number;                 // Should always be 90
}

export interface NumberGenerationResult {
  success: boolean;
  numbers: number[];
  source: 'admin' | 'host';
  error?: string;
}

// MODIFY the existing GameData interface - replace sessionMeta?: any; with:
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
  updatedAt?: string;
  sessionCache?: number[];              // ✅ Already exists
  sessionMeta?: SessionMetadata;        // ✅ CHANGE: Replace 'any' with 'SessionMetadata'
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
  updatedAt?: string;
}

export interface CreateGameConfig {
  name: string;
  maxTickets: number;
  ticketPrice: number;
  hostPhone: string;
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

// ================== FIREBASE CORE SERVICE ==================

class FirebaseCoreService {
  // ================== TRANSACTION UTILITIES ==================
  private cleanupInProgress = new Set<string>();
  private operationMutex = new Map<string, Promise<any>>();

// Add this method inside the FirebaseCoreService class
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

    // ✅ FIXED: Consistent validation logic
    const completedGames = allHostGames
      .filter(game => {
        if (!game.gameState) return false;
        if (!game.gameState.gameOver) return false;
        if (game.gameId === currentGameId) return false;
        if (!game.createdAt) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // ✅ FIXED: Keep most recent completed game
    if (completedGames.length <= 1) {
      console.log(`ℹ️ Host ${hostId} has ${completedGames.length} completed games - keeping recent one`);
      return;
    }

    const gamesToDelete = completedGames.slice(1);
    const gameToKeep = completedGames[0];
    
    console.log(`🗑️ Deleting ${gamesToDelete.length} old games, keeping: ${gameToKeep.gameId}`);

    for (const game of gamesToDelete) {
      try {
        await this.deleteGame(game.gameId);
        console.log(`✅ Cleaned up old game: ${game.gameId}`);
      } catch (error: any) {
        console.error(`⚠️ Failed to cleanup game ${game.gameId}:`, error.message);
      }
    }

    console.log(`✅ Cleanup completed for host: ${hostId}`);

  } catch (error: any) {
    console.error(`❌ Error during cleanup for host ${hostId}:`, error);
  } finally {
    this.cleanupInProgress.delete(hostId);
  }
}
 /**
   * Enhanced safe transaction with mutex protection
   */
  async safeTransactionUpdate(path: string, updates: any, retries: number = 3): Promise<void> {
    const mutexKey = `transaction-${path}`;
    
    // Prevent concurrent transactions on same path
    if (this.operationMutex.has(mutexKey)) {
      console.log(`⏳ Waiting for existing transaction: ${path}`);
      await this.operationMutex.get(mutexKey);
    }
    
    const transactionPromise = this.executeTransaction(path, updates, retries);
    this.operationMutex.set(mutexKey, transactionPromise);
    
    try {
      await transactionPromise;
    } finally {
      this.operationMutex.delete(mutexKey);
    }
  }
  
  private async executeTransaction(path: string, updates: any, retries: number): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Transaction attempt ${attempt}/${retries} for path: ${path}`);
        
        await runTransaction(ref(database, path), (currentData) => {
          if (currentData === null) {
            return updates;
          }
          
          // Deep merge to prevent overwriting
          return this.deepMerge(currentData, updates);
        });
        
        console.log(`✅ Transaction successful for path: ${path}`);
        return;
        
      } catch (error: any) {
        console.error(`❌ Transaction attempt ${attempt} failed for ${path}:`, error);
        
        if (attempt === retries) {
          throw new Error(`Transaction failed after ${retries} attempts: ${error.message}`);
        }
        
        // Wait before retry with exponential backoff + jitter
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
      }
    }
  }
  
  /**
   * Deep merge objects for transaction updates
   */
  private deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) return target;
    if (target === null || target === undefined) return source;
    
    if (typeof source !== 'object' || typeof target !== 'object') {
      return source;
    }
    
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
    
  // ================== GAME DATA OPERATIONS ==================

async getGameData(gameId: string): Promise<GameData | null> {
  try {
    const gameSnapshot = await get(ref(database, `games/${gameId}`));
    return gameSnapshot.exists() ? gameSnapshot.val() as GameData : null;
  } catch (error) {
    console.error('Error fetching game data:', error);
    return null;
  }
}

async updateGameState(gameId: string, updates: Partial<GameState>): Promise<void> {
  try {
    const cleanUpdates = removeUndefinedValues(updates);
    await update(ref(database, `games/${gameId}/gameState`), cleanUpdates);

   console.log(`✅ Game state updated: ${gameId} - no automatic cleanup (handled during creation)`);
  } catch (error: any) {
    console.error('❌ Error updating game state:', error);
    throw new Error(error.message || 'Failed to update game state');
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
  private async deleteGame(gameId: string): Promise<void> {
  try {
    // Check if game exists before attempting delete
    const gameSnapshot = await get(ref(database, `games/${gameId}`));
    if (!gameSnapshot.exists()) {
      console.log(`ℹ️ Game ${gameId} already deleted or doesn't exist`);
      return;
    }

    await remove(ref(database, `games/${gameId}`));
    console.log(`✅ Game ${gameId} deleted successfully`);
  } catch (error: any) {
    console.error(`❌ Error deleting game ${gameId}:`, error);    throw new Error(`Failed to delete game ${gameId}: ${error.message}`);
  }
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

  async getCurrentUserRole(): Promise<string | null> {
    const userData = await this.getUserData();
    return userData?.role || null;
  }

  // ================== HOST MANAGEMENT ==================

  async createHost(email: string, password: string, name: string, phone: string, adminId: string, subscriptionMonths: number): Promise<void> {
  try {
    // STEP 1: Create Firebase Authentication user first
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const hostId = userCredential.user.uid;
    
    // STEP 2: Calculate subscription end date
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);

    // STEP 3: Create database record with Auth UID
    const hostData: HostUser = {
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

    const hostRef = ref(database, `hosts/${hostId}`);
    await set(hostRef, removeUndefinedValues(hostData));
    
    console.log(`✅ Host ${name} created successfully with Auth UID: ${hostId}`);
    throw new Error(`SUCCESS: Host ${name} created successfully. You will be logged out automatically.`);
    
  } catch (error: any) {
    if (error.message.startsWith('SUCCESS:')) {
      throw error;
    }
    console.error('❌ Error creating host:', error);
    
    // Enhanced error handling for Auth errors
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('Email address is already registered');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address format');
    }
    
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
      // Simulate password change - in real implementation this would update Firebase Auth
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`✅ Password changed for host: ${hostId}`);
    } catch (error: any) {
      console.error('❌ Error changing host password:', error);
      throw new Error(error.message || 'Failed to change password');
    }
  }

  // ================== HOST SETTINGS - FIXED: All use hostSettings path ==================

  async saveHostSettings(hostId: string, settings: HostSettings): Promise<void> {
    try {
      console.log(`💾 Saving host settings for: ${hostId}`, settings);
      const settingsWithTimestamp = {
        ...settings,
        updatedAt: new Date().toISOString()
      };
      // ✅ FIXED: Consistent hostSettings path
      await set(ref(database, `hostSettings/${hostId}`), removeUndefinedValues(settingsWithTimestamp));
      console.log(`✅ Host settings saved successfully for: ${hostId}`);
    } catch (error: any) {
      console.error('❌ Error saving host settings:', error);
      throw new Error(error.message || 'Failed to save host settings');
    }
  }

  async getHostSettings(hostId: string): Promise<HostSettings | null> {
    try {
      // ✅ FIXED: Consistent hostSettings path
      const settingsSnapshot = await get(ref(database, `hostSettings/${hostId}`));
      return settingsSnapshot.exists() ? settingsSnapshot.val() as HostSettings : null;
    } catch (error) {
      console.error('Error fetching host settings:', error);
      return null;
    }
  }

  async updateHostTemplate(hostId: string, template: Partial<HostSettings>): Promise<void> {
    try {
      console.log(`🔄 Updating host template for: ${hostId}`, template);
      // ✅ FIXED: Consistent hostSettings path
      const settingsRef = ref(database, `hostSettings/${hostId}`);
      const templateWithTimestamp = {
        ...template,
        updatedAt: new Date().toISOString()
      };
      await update(settingsRef, removeUndefinedValues(templateWithTimestamp));
      console.log(`✅ Host template updated successfully for: ${hostId}`);
    } catch (error: any) {
      console.error('❌ Error updating host template:', error);
      throw new Error(error.message || 'Failed to update host template');
    }
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
      console.log('🔄 Firebase will auto-reconnect, maintaining current state...');
      // DON'T call callback(null) - let Firebase handle reconnection
      // The UI will keep the last known good state
    });

    return () => off(gameRef, 'value', unsubscribe);
  }
  subscribeToHosts(callback: (hosts: HostUser[] | null) => void): () => void {
  const hostsRef = ref(database, 'hosts');
  
  console.log('🔄 Setting up hosts subscription');
  
  const unsubscribe = onValue(hostsRef, (snapshot) => {
    try {
      if (snapshot.exists()) {
        const hostsData = snapshot.val();
        const hostsList = Object.values(hostsData) as HostUser[];
        console.log(`📊 Hosts updated: ${hostsList.length} hosts`);
        callback(hostsList);
      } else {
        console.log('📊 No hosts found');
        callback([]);
      }
    } catch (error) {
      console.error('❌ Error in hosts subscription:', error);
      callback(null);
    }
  }, (error) => {
    console.error('❌ Firebase hosts subscription error:', error);
    callback(null);
  });

  return () => off(hostsRef, 'value', unsubscribe);
}

  subscribeToHostGames(hostId: string, callback: (games: GameData[]) => void): () => void {
    const gamesRef = query(ref(database, 'games'), orderByChild('hostId'), equalTo(hostId));
    
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      if (snapshot.exists()) {
        const games = Object.values(snapshot.val()) as GameData[];
        callback(games);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Host games subscription error:', error);
      callback([]);
    });

    return () => off(gamesRef, 'value', unsubscribe);
  }
subscribeToAllActiveGames(callback: (games: GameData[]) => void): () => void {
  console.log('🔄 Setting up enhanced active games subscription (includes winner display)');
  const gamesRef = ref(database, 'games');
  
  const unsubscribe = onValue(gamesRef, (snapshot) => {
    try {
      if (snapshot.exists()) {
        const allGames = Object.values(snapshot.val()) as GameData[];
        console.log(`📊 Found ${allGames.length} total games in database`);
        
        // ✅ STEP 1: Filter valid games first
        const validGames = allGames.filter(game => {
          const isValid = game.hostId && game.gameId && game.gameState;
          if (!isValid) {
            console.warn(`⚠️ Invalid game structure: ${game.gameId || 'unknown'}`);
          }
          return isValid;
        });

        console.log(`✅ ${validGames.length} valid games after filtering`);

        // ✅ STEP 2: Group games by host ID
        const gamesByHost = new Map<string, GameData[]>();
        validGames.forEach(game => {
          if (!gamesByHost.has(game.hostId)) {
            gamesByHost.set(game.hostId, []);
          }
          gamesByHost.get(game.hostId)!.push(game);
        });

        console.log(`👥 Processing games for ${gamesByHost.size} different hosts`);

        const publicGames: GameData[] = [];
        
        // ✅ STEP 3: Smart game selection per host (THE KEY LOGIC!)
        gamesByHost.forEach((hostGames, hostId) => {
          console.log(`🎮 Processing ${hostGames.length} games for host: ${hostId}`);
          
          // Priority 1: Find active game (not finished)
          const activeGame = hostGames.find(game => !game.gameState.gameOver);
          
          if (activeGame) {
            console.log(`✅ Active game found: ${activeGame.gameId} for host: ${hostId}`);
            publicGames.push(activeGame);
            return; // Skip to next host
          }
          
          // Priority 2: Find most recent completed game (FOR WINNER DISPLAY!)
          const completedGames = hostGames
            .filter(game => game.gameState.gameOver && game.createdAt)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          if (completedGames.length > 0) {
            const recentCompleted = completedGames[0];
            console.log(`🏆 Recent completed game found: ${recentCompleted.gameId} for host: ${hostId} (for winner display)`);
            publicGames.push(recentCompleted);
          } else {
            console.log(`ℹ️ No games (active or completed) for host: ${hostId}`);
          }
        });

        // ✅ STEP 4: Sort final games list
        const sortedGames = publicGames.sort((a, b) => {
          // Active games always come first
          if (!a.gameState.gameOver && b.gameState.gameOver) return -1;
          if (a.gameState.gameOver && !b.gameState.gameOver) return 1;
          
          // Within same category, sort by creation date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        
        const activeCount = sortedGames.filter(g => !g.gameState.gameOver).length;
        const completedCount = sortedGames.filter(g => g.gameState.gameOver).length;
        
        console.log(`📡 Final subscription result: ${sortedGames.length} games (${activeCount} active, ${completedCount} completed)`);
        console.log(`🎯 Games available for users:`, sortedGames.map(g => ({
          gameId: g.gameId,
          hostId: g.hostId,
          gameOver: g.gameState.gameOver,
          isActive: g.gameState.isActive
        })));
        
        callback(sortedGames);
      } else {
        console.log('📭 No games found in database');
        callback([]);
      }
    } catch (error) {
      console.error('❌ Error in enhanced games subscription:', error);
      callback([]);
    }
  }, (error) => {
    console.error('❌ Firebase subscription error:', error);
    callback([]);
  });

  return () => {
    console.log('🧹 Cleaning up enhanced games subscription');
    off(gamesRef, 'value', unsubscribe);
  };
}
  
}

// ================== SINGLETON EXPORT ==================

export const firebaseCore = new FirebaseCoreService();
