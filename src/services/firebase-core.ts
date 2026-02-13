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
import { getAnalytics, type Analytics } from 'firebase/analytics';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export const analytics: Analytics | null =
  typeof window !== 'undefined'
    ? (() => {
      try {
        return getAnalytics(app);
      } catch (error) {
        return null;
      }
    })()
    : null;

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
  hostId: string;
  name: string;
  businessName?: string; // NEW: Display name from host (e.g., "Friend's Tambola")
  maxTickets: number;
  tickets: { [ticketId: string]: TambolaTicket };
  prizes: { [prizeId: string]: Prize };
  gameState: GameState;
  createdAt: string;
  updatedAt?: string;
  sessionCache?: number[];
  sessionMeta?: SessionMetadata;
  activeSessions?: {
    [sessionId: string]: {
      hostId: string;
      lastActivity: string;
      hostName: string;
      deviceInfo: string;
      lastHeartbeat: string;
    }
  };
  primarySession?: string;
  lastNumberCallTime?: string;
  callInterval?: number;
}

export interface HostUser {
  uid: string;
  email: string;
  name: string;
  businessName: string; // Display name for the app (e.g., "Friend's Tambola")
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
      return;
    }

    this.cleanupInProgress.add(hostId);

    try {

      const allHostGames = await this.getAllGamesByHost(hostId);

      if (allHostGames.length === 0) {
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
        return;
      }

      const gamesToDelete = completedGames.slice(1);
      const gameToKeep = completedGames[0];

      for (const game of gamesToDelete) {
        try {
          await this.deleteGame(game.gameId);
        } catch (error: any) {
        }
      }

    } catch (error: any) {
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

        await runTransaction(ref(database, path), (currentData) => {
          if (currentData === null) {
            return updates;
          }

          // Deep merge to prevent overwriting
          return this.deepMerge(currentData, updates);
        });
        return;

      } catch (error: any) {

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
      return null;
    }
  }

  async updateGameState(gameId: string, updates: Partial<GameState>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}/gameState`), cleanUpdates);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update game state');
    }
  }
  private async getAllGamesByHost(hostId: string): Promise<GameData[]> {
    try {

      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );


      const gamesSnapshot = await get(gamesQuery);

      if (!gamesSnapshot.exists()) {
        return [];
      }

      const hostGames = Object.values(gamesSnapshot.val()) as GameData[];

      return hostGames;
    } catch (error: any) {
      return [];
    }
  }
  private async deleteGame(gameId: string): Promise<void> {
    try {
      // Check if game exists before attempting delete
      const gameSnapshot = await get(ref(database, `games/${gameId}`));
      if (!gameSnapshot.exists()) {
        return;
      }

      await remove(ref(database, `games/${gameId}`));
    } catch (error: any) {
      throw new Error(`Failed to delete game ${gameId}: ${error.message}`);
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

  // Unified login: auto-detects role from DB after sign-in
  async loginUnified(email: string, password: string): Promise<{ user: AdminUser | HostUser; role: 'admin' | 'host' }> {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const userData = await this.getUserData();
      if (!userData || !userData.role) {
        throw new Error('Account not found or not authorized');
      }
      if (userData.role !== 'admin' && userData.role !== 'host') {
        throw new Error('Invalid account role');
      }
      return { user: userData as AdminUser | HostUser, role: userData.role as 'admin' | 'host' };
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
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
      return null;
    }
  }

  async getCurrentUserRole(): Promise<string | null> {
    const userData = await this.getUserData();
    return userData?.role || null;
  }

  // ================== HOST MANAGEMENT ==================

  async createHost(email: string, password: string, name: string, phone: string, adminId: string, subscriptionMonths: number, businessName: string = 'Tambola'): Promise<void> {
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
        businessName: businessName || 'Tambola', // Display name for users
        phone,
        role: 'host',
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        createdBy: adminId
      };

      const hostRef = ref(database, `hosts/${hostId}`);
      await set(hostRef, removeUndefinedValues(hostData));
      throw new Error(`SUCCESS: Host ${name} created successfully. You will be logged out automatically.`);

    } catch (error: any) {
      if (error.message.startsWith('SUCCESS:')) {
        throw error;
      }

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
      return [];
    }
  }

  async updateHost(hostId: string, updates: Partial<HostUser>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `hosts/${hostId}`), cleanUpdates);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update host');
    }
  }

  /**
   * Sync the host's current businessName to all their game records.
   * This ensures public (unauthenticated) users can read the name from game data.
   */
  async syncBusinessNameToGames(hostId: string): Promise<void> {
    try {
      // 1. Get the host's current businessName
      const hostSnap = await get(ref(database, `hosts/${hostId}`));
      if (!hostSnap.exists()) return;
      const hostData = hostSnap.val();
      const businessName = hostData.businessName;
      if (!businessName) return;

      // 2. Find all games by this host
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      const gamesSnap = await get(gamesQuery);
      if (!gamesSnap.exists()) return;

      // 3. Update businessName in each game that has a stale/missing value
      const updates: { [path: string]: string } = {};
      const games = gamesSnap.val();
      for (const gameId of Object.keys(games)) {
        if (games[gameId].businessName !== businessName) {
          updates[`games/${gameId}/businessName`] = businessName;
        }
      }

      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
      }
    } catch (error) {
      // Silently fail - non-critical operation
    }
  }

  async deleteHost(hostId: string): Promise<void> {
    try {
      await remove(ref(database, `hosts/${hostId}`));
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete host');
    }
  }

  async getHostById(hostId: string): Promise<HostUser | null> {
    try {
      const hostSnapshot = await get(ref(database, `hosts/${hostId}`));
      return hostSnapshot.exists() ? hostSnapshot.val() as HostUser : null;
    } catch (error) {
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
    } catch (error: any) {
      throw new Error(error.message || 'Failed to extend subscription');
    }
  }

  async toggleHostStatus(hostId: string, isActive: boolean): Promise<void> {
    try {
      await this.updateHost(hostId, { isActive });
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update host status');
    }
  }

  async changeHostPassword(hostId: string, newPassword: string): Promise<void> {
    try {
      // Simulate password change - in real implementation this would update Firebase Auth
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      throw new Error(error.message || 'Failed to change password');
    }
  }

  // ================== HOST SETTINGS - FIXED: All use hostSettings path ==================

  async saveHostSettings(hostId: string, settings: HostSettings): Promise<void> {
    try {
      const settingsWithTimestamp = {
        ...settings,
        updatedAt: new Date().toISOString()
      };
      // ✅ FIXED: Consistent hostSettings path
      await set(ref(database, `hostSettings/${hostId}`), removeUndefinedValues(settingsWithTimestamp));
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save host settings');
    }
  }

  async getHostSettings(hostId: string): Promise<HostSettings | null> {
    try {
      // ✅ FIXED: Consistent hostSettings path
      const settingsSnapshot = await get(ref(database, `hostSettings/${hostId}`));
      return settingsSnapshot.exists() ? settingsSnapshot.val() as HostSettings : null;
    } catch (error) {
      return null;
    }
  }

  async updateHostTemplate(hostId: string, template: Partial<HostSettings>): Promise<void> {
    try {
      // ✅ FIXED: Consistent hostSettings path
      const settingsRef = ref(database, `hostSettings/${hostId}`);
      const templateWithTimestamp = {
        ...template,
        updatedAt: new Date().toISOString()
      };
      await update(settingsRef, removeUndefinedValues(templateWithTimestamp));
    } catch (error: any) {
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
      // DON'T call callback(null) - let Firebase handle reconnection
      // The UI will keep the last known good state
    });

    return () => off(gameRef, 'value', unsubscribe);
  }
  subscribeToHosts(callback: (hosts: HostUser[] | null) => void): () => void {
    const hostsRef = ref(database, 'hosts');

    const unsubscribe = onValue(hostsRef, (snapshot) => {
      try {
        if (snapshot.exists()) {
          const hostsData = snapshot.val();
          const hostsList = Object.values(hostsData) as HostUser[];
          callback(hostsList);
        } else {
          callback([]);
        }
      } catch (error) {
        callback(null);
      }
    }, (error) => {
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
      callback([]);
    });

    return () => off(gamesRef, 'value', unsubscribe);
  }
  subscribeToAllActiveGames(callback: (games: GameData[]) => void): () => void {
    const gamesRef = ref(database, 'games');

    const unsubscribe = onValue(gamesRef, (snapshot) => {
      try {
        if (snapshot.exists()) {
          const allGames = Object.values(snapshot.val()) as GameData[];

          // ✅ STEP 1: Filter valid games first
          const validGames = allGames.filter(game => {
            const isValid = game.hostId && game.gameId && game.gameState;
            if (!isValid) {
            }
            return isValid;
          });

          // ✅ STEP 2: Group games by host ID
          const gamesByHost = new Map<string, GameData[]>();
          validGames.forEach(game => {
            if (!gamesByHost.has(game.hostId)) {
              gamesByHost.set(game.hostId, []);
            }
            gamesByHost.get(game.hostId)!.push(game);
          });

          const publicGames: GameData[] = [];

          // ✅ STEP 3: Smart game selection per host (THE KEY LOGIC!)
          gamesByHost.forEach((hostGames, hostId) => {

            // Priority 1: Find active game (not finished)
            const activeGame = hostGames.find(game => !game.gameState.gameOver);

            if (activeGame) {
              publicGames.push(activeGame);
              return; // Skip to next host
            }

            // Priority 2: Find most recent completed game (FOR WINNER DISPLAY!)
            const completedGames = hostGames
              .filter(game => game.gameState.gameOver && game.createdAt)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            if (completedGames.length > 0) {
              const recentCompleted = completedGames[0];
              publicGames.push(recentCompleted);
            } else {
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

          // businessName is synced to game records when host logs in
          // (see syncBusinessNameToGames in firebase-core.ts)
          callback(sortedGames);
        } else {
          callback([]);
        }
      } catch (error) {
        callback([]);
      }
    }, (error) => {
      callback([]);
    });

    return () => {
      off(gamesRef, 'value', unsubscribe);
    };
  }

}

// ================== SINGLETON EXPORT ==================

export const firebaseCore = new FirebaseCoreService();
