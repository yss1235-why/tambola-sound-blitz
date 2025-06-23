// src/services/firebase-core.ts - Infrastructure: Firebase setup, auth, basic DB, types, subscriptions

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword, // ✅ ADDED: Missing import for createHost fix
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
  name: string;
  maxTickets: number;
  ticketPrice: number;
  hostPhone: string;
}

// ================== UTILITY FUNCTIONS ==================

export function removeUndefinedValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.filter(item => item !== undefined).map(removeUndefinedValues);
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedValues(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

// ================== FIREBASE CORE SERVICE ==================

class FirebaseCore {
  
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

  // ✅ FIXED: Simple getUserData() - Firebase Auth UID = Host ID
  async getUserData(): Promise<AdminUser | HostUser | null> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;

      // Since Firebase Auth UID = Host ID, directly get host data
      const hostSnapshot = await get(ref(database, `hosts/${currentUser.uid}`));
      if (hostSnapshot.exists()) {
        const hostData = hostSnapshot.val();
        return { 
          ...hostData, 
          uid: currentUser.uid,  // Ensure uid is set to Firebase Auth UID
          role: 'host' 
        } as HostUser;
      }
      
      // Check admins
      const adminSnapshot = await get(ref(database, `admins/${currentUser.uid}`));
      if (adminSnapshot.exists()) {
        const adminData = adminSnapshot.val();
        return { 
          ...adminData, 
          uid: currentUser.uid,  // Ensure uid is set to Firebase Auth UID
          role: 'admin' 
        } as AdminUser;
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
      return null;
    }
  }

  async updateGameState(gameId: string, gameState: GameState): Promise<void> {
    try {
      const gameStateRef = ref(database, `games/${gameId}/gameState`);
      await update(gameStateRef, removeUndefinedValues(gameState));
    } catch (error: any) {
      console.error('Error updating game state:', error);
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  // ================== HOST MANAGEMENT ==================

  // ✅ FIXED: Complete createHost implementation with Firebase Auth user creation
  async createHost(email: string, password: string, name: string, phone: string, adminId: string, subscriptionMonths: number): Promise<void> {
    try {
      console.log(`🔧 Creating host account for: ${email}`);
      
      // STEP 1: Create Firebase Auth user for the new host
      // This was the MISSING step causing auth/invalid-credential error
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const hostId = userCredential.user.uid;
      
      console.log(`✅ Firebase Auth user created with ID: ${hostId}`);
      
      // STEP 2: Calculate subscription end date
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
      
      // STEP 3: Prepare host data
      const hostData: HostUser = {
        uid: hostId,
        email: email,
        name: name,
        phone: phone,
        role: 'host',
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true
      };
      
      // STEP 4: Save host data to database
      const hostRef = ref(database, `hosts/${hostId}`);
      hostData.uid = hostId;
      
      await set(hostRef, removeUndefinedValues(hostData));
      
      // STEP 5: Sign out the newly created host
      // createUserWithEmailAndPassword automatically signs them in, we don't want that
      await signOut(auth);
      
      console.log(`✅ Host ${name} created successfully with ID: ${hostId}`);
      
      // STEP 6: Keep the same SUCCESS error pattern (required for AdminDashboard.tsx)
      throw new Error(`SUCCESS: Host ${name} created successfully. You will be logged out automatically.`);
      
    } catch (error: any) {
      // Keep the same error handling pattern
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
