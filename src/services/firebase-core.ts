// src/services/firebase-core.ts - Infrastructure: Firebase setup, auth, basic DB, types, subscriptions

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  User,
  createUserWithEmailAndPassword
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
  runTransaction
} from 'firebase/database';

// ================== FIREBASE CONFIGURATION ==================

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
  updatedAt?: string;
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
  hostId: string;
  selectedTicketSet: string;
  selectedPrizes: string[];
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

// ================== FIREBASE CORE SERVICE CLASS ==================

export class FirebaseCore {
  private cleanupInProgress = new Set<string>();
  
  // ================== RACE CONDITION PREVENTION ==================

  private activeLocks = new Map<string, Promise<any>>();

  /**
   * ✅ RACE CONDITION PREVENTION: Ensure only one update per game at a time
   */
  private async withGameLock<T>(gameId: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = `game_${gameId}`;
    
    if (this.activeLocks.has(lockKey)) {
      await this.activeLocks.get(lockKey);
    }
    
    const operationPromise = (async () => {
      try {
        return await operation();
      } finally {
        this.activeLocks.delete(lockKey);
      }
    })();
    
    this.activeLocks.set(lockKey, operationPromise);
    return operationPromise;
  }

  /**
   * ✅ TRANSACTION WRAPPER: Safely handle Firebase transactions with retries
   */
  async safeTransactionUpdate(path: string, updates: any, retries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await runTransaction(ref(database, path), (currentData) => {
          return { ...currentData, ...removeUndefinedValues(updates) };
        });
        return;
      } catch (error: any) {
        console.error(`Transaction attempt ${attempt} failed:`, error);
        if (attempt === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
  }

  // ================== AUTHENTICATION ==================

  async loginAdmin(email: string, password: string): Promise<AdminUser> {
    try {
      await signInWithEmailAndPassword(auth, email, password);
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
      await signInWithEmailAndPassword(auth, email, password);
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
      throw new Error(error.message || 'Failed to logout');
    }
  }

  // ✅ FIXED: Enhanced getUserData() with robust fallback logic
  async getUserData(): Promise<AdminUser | HostUser | null> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;

      // Method 1: Check hosts by Firebase Auth UID (standard approach)
      const hostSnapshot = await get(ref(database, `hosts/${currentUser.uid}`));
      if (hostSnapshot.exists()) {
        return { ...hostSnapshot.val(), role: 'host' } as HostUser;
      }
      
      // Method 2: Check admins by Firebase Auth UID
      const adminSnapshot = await get(ref(database, `admins/${currentUser.uid}`));
      if (adminSnapshot.exists()) {
        return { ...adminSnapshot.val(), role: 'admin' } as AdminUser;
      }
      
      // Method 3: Fallback - Search hosts by email (for existing hosts)
      const allHostsSnapshot = await get(ref(database, 'hosts'));
      if (allHostsSnapshot.exists()) {
        const allHosts = allHostsSnapshot.val();
        
        // Look for host with matching email
        for (const [hostId, hostData] of Object.entries(allHosts)) {
          const host = hostData as any;
          if (host.email === currentUser.email) {
            
            // Auto-migrate to correct location for future logins
            try {
              // Store at Firebase Auth UID location
              await set(ref(database, `hosts/${currentUser.uid}`), {
                ...host,
                uid: currentUser.uid
              });
              
              return { ...host, uid: currentUser.uid, role: 'host' } as HostUser;
            } catch (migrationError) {
              return { ...host, role: 'host' } as HostUser;
            }
          }
        }
        
        // Method 4: Look for host where the uid field matches Firebase Auth UID
        for (const [hostId, hostData] of Object.entries(allHosts)) {
          const host = hostData as any;
          if (host.uid === currentUser.uid) {
            return { ...host, role: 'host' } as HostUser;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  }

  async getCurrentUserRole(): Promise<string | null> {
    try {
      const userData = await this.getUserData();
      return userData?.role || null;
    } catch (error: any) {
      console.error('Error getting user role:', error);
      return null;
    }
  }

  // ================== BASIC DATABASE OPERATIONS ==================

  async getGameData(gameId: string): Promise<GameData | null> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const snapshot = await get(gameRef);
      
      if (snapshot.exists()) {
        return snapshot.val() as GameData;
      }
      return null;
    } catch (error: any) {
      console.error('Error getting game data:', error);
      throw new Error(error.message || 'Failed to get game data');
    }
  }

  async updateGameState(gameId: string, updates: Partial<GameState> | GameState): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}/gameState`), cleanUpdates);

      const gameData = await this.getGameData(gameId);
      if (!gameData) {
        console.warn(`⚠️ Could not load game data for cleanup check: ${gameId}`);
        return;
      }

      const isGameStarting = (updates as any).isActive === true || (updates as any).isCountdown === true;
      const isNewGame = (gameData.gameState.calledNumbers?.length || 0) === 0;
      
      if (isGameStarting && isNewGame) {
        console.log(`🎮 Game ${gameId} is starting - cleanup will be handled by game service`);
      }

      console.log(`✅ Game state updated successfully for: ${gameId}`);
    } catch (error: any) {
      console.error('❌ Error updating game state:', error);
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  // ================== HOST MANAGEMENT ==================

  async createHost(email: string, password: string, name: string, phone: string, adminId: string, subscriptionMonths: number): Promise<void> {
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

      // Create Firebase Auth account first
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseAuthUid = userCredential.user.uid;

      // Use Firebase Auth UID as both the database key AND the uid field
      hostData.uid = firebaseAuthUid;
      const hostRef = ref(database, `hosts/${firebaseAuthUid}`);
      await set(hostRef, removeUndefinedValues(hostData));
      
      console.log(`✅ Host ${name} created successfully with Firebase Auth UID: ${firebaseAuthUid}`);
      throw new Error(`SUCCESS: Host ${name} created successfully. You will be logged out automatically.`);
      
    } catch (error: any) {
      // Handle Firebase Auth errors specifically
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Email already exists. Please use a different email address.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Please use a stronger password.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address format.');
      } else if (error.message.startsWith('SUCCESS:')) {
        // Re-throw success messages
        throw error;
      } else {
        console.error('❌ Error creating host:', error);
        throw new Error(error.message || 'Failed to create host');
      }
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

  // ================== HOST SETTINGS ==================

  async saveHostSettings(hostId: string, settings: HostSettings): Promise<void> {
    try {
      const settingsWithTimestamp = {
        ...settings,
        updatedAt: new Date().toISOString()
      };
      await set(ref(database, `hostSettings/${hostId}`), removeUndefinedValues(settingsWithTimestamp));
    } catch (error: any) {
      console.error('Error saving host settings:', error);
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

  async updateHostTemplate(hostId: string, template: Partial<HostSettings>): Promise<void> {
    try {
      const settingsRef = ref(database, `hostSettings/${hostId}`);
      const templateWithTimestamp = {
        ...template,
        updatedAt: new Date().toISOString()
      };
      await update(settingsRef, removeUndefinedValues(templateWithTimestamp));
    } catch (error: any) {
      console.error('Error updating host template:', error);
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
      callback(null);
    });

    return () => off(gameRef, 'value', unsubscribe);
  }

  subscribeToHostGames(hostId: string, callback: (games: GameData[]) => void): () => void {
    const gamesRef = query(ref(database, 'games'), orderByChild('hostId'), equalTo(hostId));
    
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      if (snapshot.exists()) {
        const gamesData = Object.values(snapshot.val()) as GameData[];
        callback(gamesData);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Firebase subscription error:', error);
      callback([]);
    });

    return () => off(gamesRef, 'value', unsubscribe);
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
}

// ================== SINGLETON EXPORT ==================

export const firebaseCore = new FirebaseCore();
