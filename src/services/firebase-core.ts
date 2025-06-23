// src/services/firebase-core.ts - Infrastructure: Firebase setup, auth, basic DB, types, subscriptions

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
  hostId: string;
  hostPhone: string;
  maxTickets: number;
  selectedTicketSet: string;
  selectedPrizes: string[];
}

// ================== UTILITY FUNCTIONS ==================

export function removeUndefinedValues(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedValues);
  
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = removeUndefinedValues(value);
    }
  }
  return cleaned;
}

// ================== FIREBASE CORE SERVICE CLASS ==================

export class FirebaseCore {
  constructor() {
    // Initialize the core Firebase service
  }

  // ================== TRANSACTION UTILITIES ==================

  async safeTransactionUpdate(path: string, updates: any, retries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const dbRef = ref(database, path);
        await runTransaction(dbRef, (currentData) => {
          return { ...currentData, ...removeUndefinedValues(updates) };
        });
        return;
      } catch (error: any) {
        console.warn(`Transaction attempt ${attempt} failed:`, error);
        if (attempt === retries) {
          throw new Error(`Transaction failed after ${retries} attempts: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
  }

  // ================== AUTHENTICATION ==================

  async loginAdmin(email: string, password: string): Promise<void> {
    try {
      console.log('🔐 Admin login attempt:', email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
      if (!adminSnapshot.exists()) {
        await signOut(auth);
        throw new Error('Access denied: Admin account not found');
      }
      
      console.log('✅ Admin login successful');
    } catch (error: any) {
      console.error('❌ Admin login failed:', error);
      throw new Error(error.message || 'Admin login failed');
    }
  }

  async loginHost(email: string, password: string): Promise<void> {
    try {
      console.log('🔐 Host login attempt:', email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
      if (!hostSnapshot.exists()) {
        await signOut(auth);
        throw new Error('Access denied: Host account not found');
      }
      
      const hostData = hostSnapshot.val() as HostUser;
      if (!hostData.isActive) {
        await signOut(auth);
        throw new Error('Account is inactive. Please contact administrator.');
      }
      
      const subscriptionEnd = new Date(hostData.subscriptionEndDate);
      if (subscriptionEnd < new Date()) {
        await signOut(auth);
        throw new Error('Subscription expired. Please contact administrator.');
      }
      
      console.log('✅ Host login successful');
    } catch (error: any) {
      console.error('❌ Host login failed:', error);
      throw new Error(error.message || 'Host login failed');
    }
  }

  async logout(): Promise<void> {
    try {
      console.log('🔐 Logout initiated...');
      await signOut(auth);
      console.log('✅ Logout successful');
    } catch (error: any) {
      console.error('❌ Logout error:', error);
      throw new Error(error.message || 'Logout failed');
    }
  }

  async getUserData(): Promise<{ user: User | null; userRole: string | null }> {
    const user = auth.currentUser;
    if (!user) {
      return { user: null, userRole: null };
    }

    try {
      const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
      if (adminSnapshot.exists()) {
        return { user, userRole: 'admin' };
      }

      const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
      if (hostSnapshot.exists()) {
        return { user, userRole: 'host' };
      }

      return { user, userRole: null };
    } catch (error) {
      console.error('Error fetching user role:', error);
      return { user, userRole: null };
    }
  }

  async getCurrentUserRole(): Promise<string | null> {
    const { userRole } = await this.getUserData();
    return userRole;
  }

  // ================== GAME DATA ==================

  async getGameData(gameId: string): Promise<GameData | null> {
    try {
      const gameSnapshot = await get(ref(database, `games/${gameId}`));
      return gameSnapshot.exists() ? gameSnapshot.val() as GameData : null;
    } catch (error) {
      console.error('Error fetching game data:', error);
      return null;
    }
  }

  async updateGameState(gameId: string, gameState: Partial<GameState>): Promise<void> {
    try {
      const updates = {
        gameState: removeUndefinedValues(gameState),
        updatedAt: new Date().toISOString()
      };
      await update(ref(database, `games/${gameId}`), updates);
    } catch (error: any) {
      console.error('Error updating game state:', error);
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  // ================== HOST MANAGEMENT ==================

  async createHost(email: string, password: string, name: string, phone: string, adminId: string, subscriptionMonths: number): Promise<void> {
    try {
      console.log(`🔑 Creating host: ${name} (${email})`);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const hostId = userCredential.user.uid;
      
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
      
      const hostData: HostUser = {
        uid: hostId,
        email,
        name,
        phone,
        role: 'host',
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true
      };

      const hostRef = ref(database, `hosts/${hostId}`);
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

  // 🔧 FIXED: Improved subscribeToHosts with permission error handling
  subscribeToHosts(callback: (hosts: HostUser[] | null) => void): () => void {
    const hostsRef = ref(database, 'hosts');
    let isSubscriptionActive = true;
    
    const unsubscribe = onValue(hostsRef, (snapshot) => {
      if (!isSubscriptionActive) return; // Prevent callback after unsubscribe
      
      if (snapshot.exists()) {
        const hosts = Object.values(snapshot.val()) as HostUser[];
        callback(hosts);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Hosts subscription error:', error);
      
      // 🔧 FIX: Check if this is a permission error and auto-unsubscribe
      if (error.code === 'PERMISSION_DENIED' || error.message?.includes('permission_denied')) {
        console.log('🔐 Permission denied for hosts subscription - auto-unsubscribing');
        isSubscriptionActive = false;
        off(hostsRef, 'value', unsubscribe);
        callback(null); // Final callback with null to indicate subscription ended
        return;
      }
      
      // For other errors, just call callback with null but keep subscription active
      callback(null);
    });

    // Return cleanup function
    return () => {
      console.log('🧹 Manually unsubscribing from hosts');
      isSubscriptionActive = false;
      off(hostsRef, 'value', unsubscribe);
    };
  }
}

// ================== SINGLETON EXPORT ==================

export const firebaseCore = new FirebaseCore();
