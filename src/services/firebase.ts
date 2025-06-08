// src/services/firebase.ts - Complete Updated Version
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  push, 
  onValue, 
  off,
  update,
  remove
} from "firebase/database";
import { getAnalytics } from "firebase/analytics";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCH2WtQ2y3ln8ToHcapIsEMIXJ78Hsg7Bg",
  authDomain: "tambola-74046.firebaseapp.com",
  databaseURL: "https://tambola-74046-default-rtdb.firebaseio.com",
  projectId: "tambola-74046",
  storageBucket: "tambola-74046.firebasestorage.app",
  messagingSenderId: "310265084192",
  appId: "1:310265084192:web:c044bf9b83c444f4a2ff45",
  measurementId: "G-MP72F136BH"
};

// Initialize Firebase - Main app for admin/host login
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

// Initialize secondary app for creating users without affecting main auth state
const secondaryApp = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

// Initialize analytics only in browser environment
let analytics: any = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    console.warn("Analytics initialization failed:", error);
  }
}

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
  role: 'host';
  createdAt: string;
  createdBy: string;
  subscriptionEndDate: string;
  isActive: boolean;
  permissions: {
    createGames: boolean;
    manageGames: boolean;
  };
}

export interface TambolaTicket {
  ticketId: string;
  rows: number[][];
  isBooked: boolean;
  playerName: string;
  playerPhone: string;
  bookedAt?: string;
}

export interface GameData {
  gameId: string;
  hostUid: string;
  name: string;
  createdAt: string;
  status: 'waiting' | 'active' | 'completed';
  maxTickets: number;
  ticketPrice: number;
  gameState: {
    isActive: boolean;
    isCountdown: boolean;
    countdownTime: number;
    calledNumbers: number[];
    currentNumber: number | null;
    gameOver: boolean;
    callInterval: number;
  };
  prizes: { [key: string]: any };
  tickets: { [key: string]: TambolaTicket };
}

export interface BookingData {
  ticketId: string;
  playerName: string;
  playerPhone: string;
  gameId: string;
  timestamp: string;
  status: 'booked' | 'cancelled';
}

// Firebase Service Class
class FirebaseService {
  private currentUser: User | null = null;

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
    });
  }

  // Authentication Methods with role separation
  async loginAdmin(email: string, password: string): Promise<AdminUser | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const adminRef = ref(database, `admins/${user.uid}`);
      const adminSnapshot = await get(adminRef);
      
      if (adminSnapshot.exists()) {
        const adminData = adminSnapshot.val() as AdminUser;
        if (adminData.role !== 'admin') {
          await signOut(auth);
          throw new Error("Invalid admin credentials");
        }
        return adminData;
      } else {
        const hostRef = ref(database, `hosts/${user.uid}`);
        const hostSnapshot = await get(hostRef);
        if (hostSnapshot.exists()) {
          await signOut(auth);
          throw new Error("This account is registered as a host. Please use host login.");
        }
        
        await signOut(auth);
        throw new Error("User is not an admin");
      }
    } catch (error: any) {
      console.error("Admin login error:", error);
      throw new Error(error.message || "Invalid admin credentials");
    }
  }

  async loginHost(email: string, password: string): Promise<HostUser | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const hostRef = ref(database, `hosts/${user.uid}`);
      const hostSnapshot = await get(hostRef);
      
      if (hostSnapshot.exists()) {
        const hostData = hostSnapshot.val() as HostUser;
        if (hostData.role !== 'host') {
          await signOut(auth);
          throw new Error("Invalid host credentials");
        }
        
        if (!hostData.isActive) {
          await signOut(auth);
          throw new Error("Your account has been deactivated. Please contact admin.");
        }
        
        const subscriptionEnd = new Date(hostData.subscriptionEndDate);
        if (subscriptionEnd < new Date()) {
          await signOut(auth);
          throw new Error("Your subscription has expired. Please contact admin to renew.");
        }
        
        return hostData;
      } else {
        const adminRef = ref(database, `admins/${user.uid}`);
        const adminSnapshot = await get(adminRef);
        if (adminSnapshot.exists()) {
          await signOut(auth);
          throw new Error("This account is registered as an admin. Please use admin login.");
        }
        
        await signOut(auth);
        throw new Error("User is not a host");
      }
    } catch (error: any) {
      console.error("Host login error:", error);
      throw new Error(error.message || "Invalid host credentials");
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error("Logout error:", error);
      throw new Error(error.message || "Failed to logout");
    }
  }

  // Admin User Management Methods
  async createAdmin(email: string, password: string, name: string): Promise<AdminUser> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const adminData: AdminUser = {
        uid: user.uid,
        email: email,
        name: name,
        role: 'admin',
        createdAt: new Date().toISOString(),
        permissions: {
          createHosts: true,
          manageUsers: true
        }
      };
      
      const adminRef = ref(database, `admins/${user.uid}`);
      await set(adminRef, adminData);
      
      return adminData;
    } catch (error: any) {
      console.error("Create admin error:", error);
      throw new Error(error.message || "Failed to create admin");
    }
  }

  // Create host without affecting main auth state
  async createHost(email: string, password: string, name: string, createdByUid: string, subscriptionMonths: number = 12): Promise<HostUser> {
    try {
      // Verify current user is admin
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Must be logged in as admin to create hosts");
      }
      
      const adminRef = ref(database, `admins/${currentUser.uid}`);
      const adminSnapshot = await get(adminRef);
      
      if (!adminSnapshot.exists()) {
        throw new Error("Only admins can create hosts");
      }
      
      const adminData = adminSnapshot.val();
      if (adminData.role !== 'admin') {
        throw new Error("Only admins can create hosts");
      }
      
      console.log('✅ Admin verification passed, creating host...');
      
      // Use secondary auth instance to create user without affecting main session
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUser = userCredential.user;
      
      console.log('✅ Host auth user created:', newUser.uid);
      
      // Sign out from secondary auth to clean up
      await signOut(secondaryAuth);
      
      // Create host data
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
      
      const hostData: HostUser = {
        uid: newUser.uid,
        email: email,
        name: name,
        role: 'host',
        createdAt: new Date().toISOString(),
        createdBy: createdByUid,
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true,
        permissions: {
          createGames: true,
          manageGames: true
        }
      };
      
      // Write host data using main auth (admin is still logged in)
      const hostRef = ref(database, `hosts/${newUser.uid}`);
      await set(hostRef, hostData);
      
      console.log('✅ Host record created successfully');
      console.log('✅ Admin remains logged in');
      
      return hostData;
      
    } catch (error: any) {
      console.error("Create host error:", error);
      throw new Error(error.message || "Failed to create host");
    }
  }

  async getAllHosts(): Promise<HostUser[]> {
    try {
      const hostsRef = ref(database, 'hosts');
      const snapshot = await get(hostsRef);
      
      if (snapshot.exists()) {
        const hostsData = snapshot.val();
        return Object.values(hostsData) as HostUser[];
      }
      return [];
    } catch (error: any) {
      console.error("Get hosts error:", error);
      throw new Error(error.message || "Failed to get hosts");
    }
  }

  async updateHost(hostUid: string, updates: Partial<HostUser>): Promise<void> {
    try {
      const hostRef = ref(database, `hosts/${hostUid}`);
      await update(hostRef, updates);
    } catch (error: any) {
      console.error("Update host error:", error);
      throw new Error(error.message || "Failed to update host");
    }
  }

  async deleteHost(hostUid: string): Promise<void> {
    try {
      const hostRef = ref(database, `hosts/${hostUid}`);
      await remove(hostRef);
    } catch (error: any) {
      console.error("Delete host error:", error);
      throw new Error(error.message || "Failed to delete host");
    }
  }

  async changeHostPassword(hostUid: string, newPassword: string): Promise<void> {
    try {
      const hostRef = ref(database, `hosts/${hostUid}`);
      await update(hostRef, {
        passwordChangeRequired: true,
        newPassword: newPassword,
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Change host password error:", error);
      throw new Error(error.message || "Failed to change host password");
    }
  }

  async extendHostSubscription(hostUid: string, additionalMonths: number): Promise<void> {
    try {
      const hostRef = ref(database, `hosts/${hostUid}`);
      const snapshot = await get(hostRef);
      
      if (snapshot.exists()) {
        const hostData = snapshot.val() as HostUser;
        const currentEndDate = new Date(hostData.subscriptionEndDate);
        const newEndDate = new Date(currentEndDate);
        newEndDate.setMonth(newEndDate.getMonth() + additionalMonths);
        
        await update(hostRef, {
          subscriptionEndDate: newEndDate.toISOString(),
          updatedAt: new Date().toISOString()
        });
      } else {
        throw new Error("Host not found");
      }
    } catch (error: any) {
      console.error("Extend subscription error:", error);
      throw new Error(error.message || "Failed to extend subscription");
    }
  }

  async toggleHostStatus(hostUid: string, isActive: boolean): Promise<void> {
    try {
      const hostRef = ref(database, `hosts/${hostUid}`);
      await update(hostRef, {
        isActive: isActive,
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Toggle host status error:", error);
      throw new Error(error.message || "Failed to toggle host status");
    }
  }

  // Method to load ticket sets from public/data directory
  async loadTicketSet(setId: string): Promise<any> {
    try {
      console.log(`Loading ticket set ${setId} from public/data/${setId}.json`);
      
      const response = await fetch(`/data/${setId}.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to load ticket set ${setId}: ${response.statusText}`);
      }
      
      const ticketSetData = await response.json();
      console.log(`✅ Loaded ticket set ${setId} with ${ticketSetData.length} rows`);
      
      // Transform the data from your format to the expected format
      const transformedData = this.transformTicketData(ticketSetData);
      
      return transformedData;
    } catch (error: any) {
      console.error(`❌ Error loading ticket set ${setId}:`, error);
      throw new Error(`Failed to load ticket set ${setId}: ${error.message}`);
    }
  }

  // Transform ticket data from your format to game format
  private transformTicketData(rawData: any[]): any {
    const ticketsMap = new Map();
    
    // Group rows by ticketId
    rawData.forEach(row => {
      const ticketId = `ticket_${row.ticketId}`;
      if (!ticketsMap.has(ticketId)) {
        ticketsMap.set(ticketId, {
          ticketId: ticketId,
          rows: []
        });
      }
      
      const ticket = ticketsMap.get(ticketId);
      ticket.rows[row.rowId - 1] = row.numbers; // rowId is 1-based, array is 0-based
    });
    
    // Convert map to array and get unique ticket count
    const tickets = Array.from(ticketsMap.values());
    const uniqueTicketIds = new Set(rawData.map(row => row.ticketId));
    
    return {
      setId: rawData[0]?.setId || 1,
      name: `Ticket Set ${rawData[0]?.setId || 1}`,
      ticketCount: uniqueTicketIds.size,
      tickets: tickets
    };
  }

  // Host Game Management Methods
  async createGame(gameData: Partial<GameData>, hostUid: string, ticketSetId?: string, selectedPrizes?: string[]): Promise<GameData> {
    try {
      const hostRef = ref(database, `hosts/${hostUid}`);
      const hostSnapshot = await get(hostRef);
      
      if (!hostSnapshot.exists()) {
        throw new Error("Only hosts can create games");
      }
      
      const gameRef = push(ref(database, 'games'));
      const gameId = gameRef.key!;
      
      // Load ticket set data if provided
      let ticketsData = {};
      let maxTickets = gameData.maxTickets || 50;
      
      if (ticketSetId) {
        const ticketSet = await this.loadTicketSet(ticketSetId);
        maxTickets = ticketSet.ticketCount;
        
        // Convert ticket set data to the format expected by the game
        ticketsData = ticketSet.tickets.reduce((acc: any, ticket: any) => {
          acc[ticket.ticketId] = {
            ticketId: ticket.ticketId,
            rows: ticket.rows,
            isBooked: false,
            playerName: '',
            playerPhone: '',
            bookedAt: undefined
          };
          return acc;
        }, {});
      }
      
      // Create prizes based on selected prizes or use defaults
      let prizesData = {};
      if (selectedPrizes && selectedPrizes.length > 0) {
        // Use only selected prizes
        const availablePrizes = [
          {
            id: 'quickFive',
            name: 'Quick Five',
            pattern: 'First 5 numbers',
            defaultAmount: 500
          },
          {
            id: 'topLine',
            name: 'Top Line',
            pattern: 'Complete top row',
            defaultAmount: 1000
          },
          {
            id: 'middleLine',
            name: 'Middle Line',
            pattern: 'Complete middle row', 
            defaultAmount: 1000
          },
          {
            id: 'bottomLine',
            name: 'Bottom Line',
            pattern: 'Complete bottom row',
            defaultAmount: 1000
          },
          {
            id: 'fourCorners',
            name: 'Four Corners',
            pattern: 'All four corner numbers',
            defaultAmount: 1500
          },
          {
            id: 'fullHouse',
            name: 'Full House',
            pattern: 'Complete ticket',
            defaultAmount: 3000
          },
          {
            id: 'twoLines',
            name: 'Two Lines',
            pattern: 'Any two complete rows',
            defaultAmount: 2000
          },
          {
            id: 'earlyTen',
            name: 'Early Ten',
            pattern: 'First 10 numbers',
            defaultAmount: 800
          }
        ];
        
        prizesData = selectedPrizes.reduce((acc: any, prizeId: string) => {
          const prizeInfo = availablePrizes.find(p => p.id === prizeId);
          if (prizeInfo) {
            acc[prizeId] = {
              id: prizeInfo.id,
              name: prizeInfo.name,
              pattern: prizeInfo.pattern,
              won: false,
              amount: prizeInfo.defaultAmount,
              winner: null
            };
          }
          return acc;
        }, {});
      } else {
        prizesData = this.getDefaultPrizes();
      }
      
      // Create full game data
      const fullGameData: GameData = {
        gameId,
        hostUid,
        name: gameData.name || 'New Tambola Game',
        createdAt: new Date().toISOString(),
        status: 'waiting',
        maxTickets,
        ticketPrice: gameData.ticketPrice || 0, // Set to 0 for free games
        gameState: {
          isActive: false,
          isCountdown: false,
          countdownTime: 0,
          calledNumbers: [], // Ensure this is always an array
          currentNumber: null,
          gameOver: false,
          callInterval: 6000
        },
        prizes: prizesData,
        tickets: ticketsData
      };
      
      await set(gameRef, fullGameData);
      
      console.log('✅ Game created successfully:', fullGameData);
      return fullGameData;
    } catch (error: any) {
      console.error("Create game error:", error);
      throw new Error(error.message || "Failed to create game");
    }
  }

  async updateGameState(gameId: string, gameState: any): Promise<void> {
    try {
      const gameStateRef = ref(database, `games/${gameId}/gameState`);
      await update(gameStateRef, gameState);
    } catch (error: any) {
      console.error("Update game state error:", error);
      throw new Error(error.message || "Failed to update game state");
    }
  }

  // Update addCalledNumber method to ensure array handling
  async addCalledNumber(gameId: string, number: number): Promise<void> {
    try {
      const calledNumbersRef = ref(database, `games/${gameId}/gameState/calledNumbers`);
      const snapshot = await get(calledNumbersRef);
      const currentNumbers = snapshot.val() || []; // Ensure it's always an array
      
      // Check if number is already called
      if (currentNumbers.includes(number)) {
        console.log(`Number ${number} already called`);
        return;
      }
      
      const updatedNumbers = [...currentNumbers, number];
      
      await set(calledNumbersRef, updatedNumbers);
      console.log(`✅ Number ${number} added to called numbers`);
    } catch (error: any) {
      console.error("Add called number error:", error);
      throw new Error(error.message || "Failed to add called number");
    }
  }

  // Public Ticket Management Methods
  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string): Promise<BookingData> {
    try {
      const bookingRef = push(ref(database, 'bookings'));
      const bookingData: BookingData = {
        ticketId,
        playerName,
        playerPhone,
        gameId,
        timestamp: new Date().toISOString(),
        status: 'booked'
      };
      
      await set(bookingRef, bookingData);
      
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      await update(ticketRef, {
        isBooked: true,
        playerName,
        playerPhone,
        bookedAt: new Date().toISOString()
      });
      
      return bookingData;
    } catch (error: any) {
      console.error("Book ticket error:", error);
      throw new Error(error.message || "Failed to book ticket");
    }
  }

  // Real-time listeners
  subscribeToGame(gameId: string, callback: (gameData: GameData | null) => void): () => void {
    const gameRef = ref(database, `games/${gameId}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const gameData = snapshot.val() as GameData;
        // Ensure arrays are properly initialized when received from Firebase
        if (!gameData.gameState.calledNumbers) {
          gameData.gameState.calledNumbers = [];
        }
        if (!gameData.tickets) {
          gameData.tickets = {};
        }
        if (!gameData.prizes) {
          gameData.prizes = {};
        }
        callback(gameData);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error("Game subscription error:", error);
      callback(null);
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
    }, (error) => {
      console.error("Tickets subscription error:", error);
      callback(null);
    });
    
    return () => off(ticketsRef, 'value', unsubscribe);
  }

  subscribeToHosts(callback: (hosts: HostUser[] | null) => void): () => void {
    const hostsRef = ref(database, 'hosts');
    
    const unsubscribe = onValue(hostsRef, (snapshot) => {
      if (snapshot.exists()) {
        const hostsData = snapshot.val();
        callback(Object.values(hostsData) as HostUser[]);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error("Hosts subscription error:", error);
      callback(null);
    });
    
    return () => off(hostsRef, 'value', unsubscribe);
  }

  subscribeToAuthState(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, callback);
  }

  // Utility Methods - Default prizes only
  private getDefaultPrizes() {
    return {
      quickFive: {
        id: 'quickFive',
        name: 'Quick Five',
        pattern: 'First 5 numbers',
        won: false,
        amount: 500,
        winner: null
      },
      topLine: {
        id: 'topLine',
        name: 'Top Line',
        pattern: 'Top row complete',
        won: false,
        amount: 1000,
        winner: null
      },
      middleLine: {
        id: 'middleLine',
        name: 'Middle Line',
        pattern: 'Middle row complete',
        won: false,
        amount: 1000,
        winner: null
      },
      bottomLine: {
        id: 'bottomLine',
        name: 'Bottom Line',
        pattern: 'Bottom row complete',
        won: false,
        amount: 1000,
        winner: null
      },
      fourCorners: {
        id: 'fourCorners',
        name: 'Four Corners',
        pattern: 'All four corners',
        won: false,
        amount: 1500,
        winner: null
      },
      fullHouse: {
        id: 'fullHouse',
        name: 'Full House',
        pattern: 'Complete ticket',
        won: false,
        amount: 3000,
        winner: null
      }
    };
  }

  // Get current user role
  async getCurrentUserRole(): Promise<'admin' | 'host' | null> {
    const user = auth.currentUser;
    if (!user) return null;
    
    try {
      const adminRef = ref(database, `admins/${user.uid}`);
      const adminSnapshot = await get(adminRef);
      if (adminSnapshot.exists()) {
        const adminData = adminSnapshot.val();
        if (adminData.role === 'admin') return 'admin';
      }
      
      const hostRef = ref(database, `hosts/${user.uid}`);
      const hostSnapshot = await get(hostRef);
      if (hostSnapshot.exists()) {
        const hostData = hostSnapshot.val();
        if (hostData.role === 'host') return 'host';
      }
      
      return null;
    } catch (error: any) {
      console.error("Get user role error:", error);
      return null;
    }
  }

  // Get user data
  async getUserData(): Promise<AdminUser | HostUser | null> {
    const user = auth.currentUser;
    if (!user) {
      console.log('❌ No authenticated user');
      return null;
    }

    try {
      console.log('🔍 Fetching user data for:', user.uid);
      
      // Try admin first
      const adminRef = ref(database, `admins/${user.uid}`);
      const adminSnapshot = await get(adminRef);
      if (adminSnapshot.exists()) {
        const adminData = adminSnapshot.val();
        console.log('✅ Found admin data:', adminData);
        if (adminData.role === 'admin') return adminData as AdminUser;
      }
      
      // Try host
      const hostRef = ref(database, `hosts/${user.uid}`);
      const hostSnapshot = await get(hostRef);
      if (hostSnapshot.exists()) {
        const hostData = hostSnapshot.val();
        console.log('✅ Found host data:', hostData);
        if (hostData.role === 'host') return hostData as HostUser;
      }
      
      console.log('❌ No user data found in database');
      return null;
    } catch (error: any) {
      console.error("Get user data error:", error);
      return null;
    }
  }
}

// Create and export service instance
export const firebaseService = new FirebaseService();

// Utility function to check current user role
export async function getCurrentUserRole(): Promise<'admin' | 'host' | null> {
  return firebaseService.getCurrentUserRole();
}

export default firebaseService;
