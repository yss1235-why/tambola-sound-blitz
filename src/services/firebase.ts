// src/services/firebase.ts
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  User,
  updatePassword
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  addDoc,
  arrayUnion,
  writeBatch
} from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBvzZ8_TXxZ2Zp5Q_X1Y2Z3V4W5X6Y7Z8A",
  authDomain: "tambola-game-host.firebaseapp.com",
  projectId: "tambola-game-host",
  storageBucket: "tambola-game-host.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456ghi789"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

// Type definitions
export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  role: 'admin';
  createdAt: string;
  isActive: boolean;
}

export interface HostUser {
  uid: string;
  email: string;
  name: string;
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
  winner?: {
    name: string;
    ticketId: string;
  };
}

export interface TambolaTicket {
  ticketId: string;
  rows: number[][];
  isBooked: boolean;
  playerName?: string;
  playerPhone?: string;
  bookedAt?: string;
}

export interface GameData {
  gameId: string;
  name: string;
  hostId: string;
  maxTickets: number;
  ticketPrice: number;
  gameState: GameState;
  prizes: { [key: string]: Prize };
  tickets?: { [key: string]: TambolaTicket };
  createdAt: string;
  ticketSetId?: string;
}

export interface TicketSetData {
  ticketCount: number;
  tickets: { [key: string]: TambolaTicket };
}

// Get current user role
export const getCurrentUserRole = async (): Promise<'admin' | 'host' | null> => {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    // Check if user is admin
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    if (adminDoc.exists()) {
      return 'admin';
    }

    // Check if user is host
    const hostDoc = await getDoc(doc(db, 'hosts', user.uid));
    if (hostDoc.exists()) {
      return 'host';
    }

    return null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
};

// Generate ticket data for a set
const generateTicketSet = (setId: string): TicketSetData => {
  const tickets: { [key: string]: TambolaTicket } = {};
  
  // Generate 600 tickets for each set
  for (let i = 1; i <= 600; i++) {
    const ticketId = `${setId}_${i.toString().padStart(3, '0')}`;
    tickets[ticketId] = generateSingleTicket(ticketId);
  }

  return {
    ticketCount: 600,
    tickets
  };
};

// Generate a single tambola ticket
const generateSingleTicket = (ticketId: string): TambolaTicket => {
  const rows: number[][] = [];
  
  for (let row = 0; row < 3; row++) {
    const ticketRow: number[] = [];
    const usedNumbers = new Set<number>();
    
    // Each row has 5 numbers and 4 empty spaces
    const numberPositions = Array.from({length: 9}, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
    
    for (let col = 0; col < 9; col++) {
      if (numberPositions.includes(col)) {
        // Add a number in this column's range
        let number: number;
        do {
          const min = col === 0 ? 1 : col * 10;
          const max = col === 8 ? 90 : (col + 1) * 10 - 1;
          number = Math.floor(Math.random() * (max - min + 1)) + min;
        } while (usedNumbers.has(number));
        
        usedNumbers.add(number);
        ticketRow.push(number);
      } else {
        ticketRow.push(0); // Empty space
      }
    }
    
    rows.push(ticketRow);
  }

  return {
    ticketId,
    rows,
    isBooked: false
  };
};

// Firebase service class
class FirebaseService {
  // Admin operations
  async loginAdmin(email: string, password: string): Promise<AdminUser | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (!adminDoc.exists()) {
        throw new Error('User is not an admin');
      }

      const adminData = adminDoc.data() as AdminUser;
      if (!adminData.isActive) {
        throw new Error('Admin account is deactivated');
      }

      return adminData;
    } catch (error: any) {
      console.error('Admin login error:', error);
      throw new Error(error.message || 'Admin login failed');
    }
  }

  // Host operations
  async loginHost(email: string, password: string): Promise<HostUser | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const hostDoc = await getDoc(doc(db, 'hosts', user.uid));
      if (!hostDoc.exists()) {
        throw new Error('User is not a host');
      }

      const hostData = hostDoc.data() as HostUser;
      if (!hostData.isActive) {
        throw new Error('Host account is deactivated');
      }

      // Check subscription
      const subscriptionEnd = new Date(hostData.subscriptionEndDate);
      if (subscriptionEnd < new Date()) {
        throw new Error('Host subscription has expired');
      }

      return hostData;
    } catch (error: any) {
      console.error('Host login error:', error);
      throw new Error(error.message || 'Host login failed');
    }
  }

  async createHost(
    email: string, 
    password: string, 
    name: string, 
    adminUid: string, 
    subscriptionMonths: number = 12
  ): Promise<HostUser> {
    try {
      console.log('🔧 Creating host account:', { email, name, subscriptionMonths });
      
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      console.log('✅ Firebase user created:', user.uid);

      // Calculate subscription end date
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);

      const hostData: HostUser = {
        uid: user.uid,
        email,
        name,
        role: 'host',
        createdBy: adminUid,
        createdAt: new Date().toISOString(),
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true
      };

      // Save to Firestore
      await setDoc(doc(db, 'hosts', user.uid), hostData);
      console.log('✅ Host data saved to Firestore');

      return hostData;
    } catch (error: any) {
      console.error('❌ Create host error:', error);
      throw new Error(error.message || 'Failed to create host');
    }
  }

  async getAllHosts(): Promise<HostUser[]> {
    try {
      const hostsSnapshot = await getDocs(collection(db, 'hosts'));
      return hostsSnapshot.docs.map(doc => doc.data() as HostUser);
    } catch (error: any) {
      console.error('Error fetching hosts:', error);
      throw new Error(error.message || 'Failed to fetch hosts');
    }
  }

  async updateHost(hostId: string, updates: Partial<HostUser>): Promise<void> {
    try {
      await updateDoc(doc(db, 'hosts', hostId), updates);
    } catch (error: any) {
      console.error('Error updating host:', error);
      throw new Error(error.message || 'Failed to update host');
    }
  }

  async deleteHost(hostId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'hosts', hostId));
    } catch (error: any) {
      console.error('Error deleting host:', error);
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
      console.error('Error changing password:', error);
      throw new Error(error.message || 'Failed to change password');
    }
  }

  async extendHostSubscription(hostId: string, additionalMonths: number): Promise<void> {
    try {
      const hostDoc = await getDoc(doc(db, 'hosts', hostId));
      if (!hostDoc.exists()) {
        throw new Error('Host not found');
      }

      const hostData = hostDoc.data() as HostUser;
      const currentEnd = new Date(hostData.subscriptionEndDate);
      const newEnd = new Date(currentEnd);
      newEnd.setMonth(newEnd.getMonth() + additionalMonths);

      await updateDoc(doc(db, 'hosts', hostId), {
        subscriptionEndDate: newEnd.toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error extending subscription:', error);
      throw new Error(error.message || 'Failed to extend subscription');
    }
  }

  async toggleHostStatus(hostId: string, isActive: boolean): Promise<void> {
    try {
      await updateDoc(doc(db, 'hosts', hostId), {
        isActive,
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error toggling host status:', error);
      throw new Error(error.message || 'Failed to update host status');
    }
  }

  // Game operations
  async createGame(
    gameConfig: { name: string; maxTickets: number; ticketPrice: number },
    hostId: string,
    ticketSetId: string,
    selectedPrizes: string[]
  ): Promise<GameData> {
    try {
      const gameRef = doc(collection(db, 'games'));
      const gameId = gameRef.id;

      // Load ticket set data
      const ticketSetData = await this.loadTicketSet(ticketSetId);

      // Create prizes
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

      await setDoc(gameRef, gameData);
      return gameData;
    } catch (error: any) {
      console.error('Error creating game:', error);
      throw new Error(error.message || 'Failed to create game');
    }
  }

  async loadTicketSet(setId: string): Promise<TicketSetData> {
    try {
      // For now, generate ticket sets dynamically
      // In a real implementation, these would be pre-generated and stored
      return generateTicketSet(setId);
    } catch (error: any) {
      console.error('Error loading ticket set:', error);
      throw new Error(error.message || 'Failed to load ticket set');
    }
  }

  async updateGameState(gameId: string, gameState: GameState): Promise<void> {
    try {
      await updateDoc(doc(db, 'games', gameId), { gameState });
    } catch (error: any) {
      console.error('Error updating game state:', error);
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  async addCalledNumber(gameId: string, number: number): Promise<void> {
    try {
      await updateDoc(doc(db, 'games', gameId), {
        'gameState.calledNumbers': arrayUnion(number)
      });
    } catch (error: any) {
      console.error('Error adding called number:', error);
      throw new Error(error.message || 'Failed to add called number');
    }
  }

  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string): Promise<void> {
    try {
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameDoc.data() as GameData;
      if (gameData.tickets && gameData.tickets[ticketId]) {
        if (gameData.tickets[ticketId].isBooked) {
          throw new Error('Ticket is already booked');
        }

        gameData.tickets[ticketId] = {
          ...gameData.tickets[ticketId],
          isBooked: true,
          playerName,
          playerPhone,
          bookedAt: new Date().toISOString()
        };

        await updateDoc(doc(db, 'games', gameId), {
          tickets: gameData.tickets
        });
      } else {
        throw new Error('Ticket not found');
      }
    } catch (error: any) {
      console.error('Error booking ticket:', error);
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  // Real-time subscriptions
  subscribeToGame(gameId: string, callback: (game: GameData | null) => void): () => void {
    return onSnapshot(doc(db, 'games', gameId), (doc) => {
      if (doc.exists()) {
        callback(doc.data() as GameData);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('Game subscription error:', error);
      callback(null);
    });
  }

  subscribeToTickets(gameId: string, callback: (tickets: { [key: string]: TambolaTicket } | null) => void): () => void {
    return onSnapshot(doc(db, 'games', gameId), (doc) => {
      if (doc.exists()) {
        const gameData = doc.data() as GameData;
        callback(gameData.tickets || null);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('Tickets subscription error:', error);
      callback(null);
    });
  }

  subscribeToHosts(callback: (hosts: HostUser[]) => void): () => void {
    return onSnapshot(collection(db, 'hosts'), (snapshot) => {
      const hosts = snapshot.docs.map(doc => doc.data() as HostUser);
      callback(hosts);
    }, (error) => {
      console.error('Hosts subscription error:', error);
      callback([]);
    });
  }

  // Authentication
  async getUserData(): Promise<AdminUser | HostUser | null> {
    const user = auth.currentUser;
    if (!user) return null;

    try {
      // Check admin first
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists()) {
        return adminDoc.data() as AdminUser;
      }

      // Check host
      const hostDoc = await getDoc(doc(db, 'hosts', user.uid));
      if (hostDoc.exists()) {
        return hostDoc.data() as HostUser;
      }

      return null;
    } catch (error) {
      console.error('Error getting user data:', error);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error('Logout error:', error);
      throw new Error(error.message || 'Failed to logout');
    }
  }
}

export const firebaseService = new FirebaseService();

// Initialize default admin on first run
const initializeDefaultAdmin = async () => {
  try {
    const adminRef = doc(db, 'admins', 'default-admin');
    const adminDoc = await getDoc(adminRef);
    
    if (!adminDoc.exists()) {
      const defaultAdmin: AdminUser = {
        uid: 'default-admin',
        email: 'yurs@gmai.com',
        name: 'System Administrator',
        role: 'admin',
        createdAt: new Date().toISOString(),
        isActive: true
      };
      
      await setDoc(adminRef, defaultAdmin);
      console.log('✅ Default admin initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing default admin:', error);
  }
};

// Initialize on module load
initializeDefaultAdmin();

// Note: Statistics services have been removed from this project
// All game data is tracked through Firebase real-time updates
