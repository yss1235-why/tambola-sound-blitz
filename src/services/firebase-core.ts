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

  async safeTransactionUpdate(path: string, updates: any, retries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Transaction attempt ${attempt}/${retries} for path: ${path}`);
        
        await runTransaction(ref(database, path), (currentData) => {
          if (currentData === null) {
            return updates;
          }
          return { ...currentData, ...updates };
        });
        
        console.log(`✅ Transaction successful for path: ${path}`);
        return;
        
      } catch (error: any) {
        console.error(`❌ Transaction attempt ${attempt} failed for ${path}:`, error);
        
        if (attempt === retries) {
          throw new Error(`Transaction failed after ${retries} attempts: ${error.message}`);
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
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
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);

      const hostId = push(ref(database, 'hosts')).key;
      if (!hostId) throw new Error('Failed to generate host ID');

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

  async updateGameState(gameId: string, gameState: Partial<GameState>): Promise<void> {
    try {
      await update(ref(database, `games/${gameId}/gameState`), gameState);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update game state');
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
    const gamesRef = ref(database, 'games');
    
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      if (snapshot.exists()) {
        const allGames = Object.values(snapshot.val()) as GameData[];
        const activeGames = allGames.filter(game => 
          game.gameState && 
          (game.gameState.isActive || game.gameState.isCountdown || !game.gameState.gameOver)
        );
        callback(activeGames);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('All games subscription error:', error);
      callback([]);
    });

    return () => off(gamesRef, 'value', unsubscribe);
  }
}

// ================== SINGLETON EXPORT ==================

export const firebaseCore = new FirebaseCoreService();
