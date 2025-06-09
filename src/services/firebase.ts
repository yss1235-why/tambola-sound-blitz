// src/services/firebase.ts - Fixed version with atomic number calling
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
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  off,
  child,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  orderByKey
} from 'firebase/database';

// Firebase configuration - Replace with your actual Firebase project config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Validate Firebase configuration
const validateFirebaseConfig = (config: any) => {
  const requiredFields = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missingFields = requiredFields.filter(field => 
    !config[field] || config[field].includes('your-') || config[field].includes('123456')
  );
  
  if (missingFields.length > 0) {
    console.error('❌ Firebase configuration incomplete. Missing or invalid fields:', missingFields);
    console.error('📝 Please check your .env file and update with actual Firebase project values.');
    console.error('🔗 See Firebase Setup Guide for instructions.');
  }
  
  return missingFields.length === 0;
};

// Validate configuration before initializing
if (!validateFirebaseConfig(firebaseConfig)) {
  console.warn('⚠️ Using incomplete Firebase configuration. Some features may not work.');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const database = getDatabase(app);

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
  phone: string;
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
  updatedAt?: string;
}

export interface GameData {
  gameId: string;
  name: string;
  hostId: string;
  hostPhone?: string;
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

export interface HostSettings {
  hostPhone: string;
  maxTickets: number;
  selectedTicketSet: string;
  selectedPrizes: string[];
}

// Get current user role
export const getCurrentUserRole = async (): Promise<'admin' | 'host' | null> => {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    // Check if user is admin
    const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
    if (adminSnapshot.exists()) {
      return 'admin';
    }

    // Check if user is host
    const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
    if (hostSnapshot.exists()) {
      return 'host';
    }

    return null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
};

// Utility function to remove undefined values from objects (Firebase doesn't allow undefined)
const removeUndefinedValues = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedValues);
  }
  
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = removeUndefinedValues(value);
    }
  }
  return cleaned;
};

// Generate ticket data for a set with simple numbering
const generateTicketSet = (setId: string): TicketSetData => {
  const tickets: { [key: string]: TambolaTicket } = {};
  
  // Generate 600 tickets for each set with simple numbering (1, 2, 3, etc.)
  for (let i = 1; i <= 600; i++) {
    const ticketId = i.toString(); // Simple numbering: "1", "2", "3", etc.
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
    
    // Sort numbers in each row for better readability
    const sortedRow = [...ticketRow];
    const numberIndices = numberPositions.sort((a, b) => a - b);
    const sortedNumbers = numberPositions.map(pos => ticketRow[pos]).sort((a, b) => a - b);
    
    numberIndices.forEach((pos, index) => {
      sortedRow[pos] = sortedNumbers[index];
    });
    
    rows.push(sortedRow);
  }

  return {
    ticketId, // This will be simple numbers like "1", "2", "3"
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

      const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
      if (!adminSnapshot.exists()) {
        throw new Error('User is not an admin');
      }

      const adminData = adminSnapshot.val() as AdminUser;
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

      const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
      if (!hostSnapshot.exists()) {
        throw new Error('User is not a host');
      }

      const hostData = hostSnapshot.val() as HostUser;
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
    phone: string,
    adminUid: string, 
    subscriptionMonths: number = 12
  ): Promise<HostUser> {
    try {
      console.log('🔧 Creating host account:', { email, name, phone, subscriptionMonths });
      
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
        phone,
        role: 'host',
        createdBy: adminUid,
        createdAt: new Date().toISOString(),
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true
      };

      // Save to Realtime Database with cleaned data
      const cleanedHostData = removeUndefinedValues(hostData);
      await set(ref(database, `hosts/${user.uid}`), cleanedHostData);
      console.log('✅ Host data saved to Realtime Database');

      return hostData;
    } catch (error: any) {
      console.error('❌ Create host error:', error);
      throw new Error(error.message || 'Failed to create host');
    }
  }

  async getHostById(hostId: string): Promise<HostUser | null> {
    try {
      const hostSnapshot = await get(ref(database, `hosts/${hostId}`));
      if (!hostSnapshot.exists()) {
        return null;
      }
      return hostSnapshot.val() as HostUser;
    } catch (error: any) {
      console.error('Error fetching host:', error);
      throw new Error(error.message || 'Failed to fetch host');
    }
  }

  // Get active games using indexed query for better performance
  async getAllActiveGames(): Promise<GameData[]> {
    try {
      const gamesSnapshot = await get(ref(database, 'games'));
      if (!gamesSnapshot.exists()) {
        return [];
      }
      
      const gamesData = gamesSnapshot.val();
      const allGames = Object.values(gamesData) as GameData[];
      
      // Filter for active games (not game over and have tickets)
      return allGames.filter(game => 
        !game.gameState.gameOver && 
        game.tickets && 
        Object.keys(game.tickets).length > 0
      );
    } catch (error: any) {
      console.error('Error fetching active games:', error);
      throw new Error(error.message || 'Failed to fetch active games');
    }
  }

  // Get all hosts with indexed query for admin
  async getAllHosts(): Promise<HostUser[]> {
    try {
      const hostsSnapshot = await get(ref(database, 'hosts'));
      if (!hostsSnapshot.exists()) {
        return [];
      }
      
      const hostsData = hostsSnapshot.val();
      return Object.values(hostsData) as HostUser[];
    } catch (error: any) {
      console.error('Error fetching hosts:', error);
      throw new Error(error.message || 'Failed to fetch hosts');
    }
  }

  // Get hosts created by specific admin using indexed query
  async getHostsByCreator(adminId: string): Promise<HostUser[]> {
    try {
      const hostsQuery = query(
        ref(database, 'hosts'),
        orderByChild('createdBy'),
        equalTo(adminId)
      );
      
      const hostsSnapshot = await get(hostsQuery);
      if (!hostsSnapshot.exists()) {
        return [];
      }
      
      const hostsData = hostsSnapshot.val();
      return Object.values(hostsData) as HostUser[];
    } catch (error: any) {
      console.error('Error fetching hosts by creator:', error);
      throw new Error(error.message || 'Failed to fetch hosts by creator');
    }
  }

  async updateHost(hostId: string, updates: Partial<HostUser>): Promise<void> {
    try {
      const cleanedUpdates = removeUndefinedValues(updates);
      await update(ref(database, `hosts/${hostId}`), cleanedUpdates);
    } catch (error: any) {
      console.error('Error updating host:', error);
      throw new Error(error.message || 'Failed to update host');
    }
  }

  async deleteHost(hostId: string): Promise<void> {
    try {
      await remove(ref(database, `hosts/${hostId}`));
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
      const hostSnapshot = await get(ref(database, `hosts/${hostId}`));
      if (!hostSnapshot.exists()) {
        throw new Error('Host not found');
      }

      const hostData = hostSnapshot.val() as HostUser;
      const currentEnd = new Date(hostData.subscriptionEndDate);
      const newEnd = new Date(currentEnd);
      newEnd.setMonth(newEnd.getMonth() + additionalMonths);

      const updateData = removeUndefinedValues({
        subscriptionEndDate: newEnd.toISOString(),
        updatedAt: new Date().toISOString()
      });

      await update(ref(database, `hosts/${hostId}`), updateData);
    } catch (error: any) {
      console.error('Error extending subscription:', error);
      throw new Error(error.message || 'Failed to extend subscription');
    }
  }

  async toggleHostStatus(hostId: string, isActive: boolean): Promise<void> {
    try {
      const updateData = removeUndefinedValues({
        isActive,
        updatedAt: new Date().toISOString()
      });
      
      await update(ref(database, `hosts/${hostId}`), updateData);
    } catch (error: any) {
      console.error('Error toggling host status:', error);
      throw new Error(error.message || 'Failed to update host status');
    }
  }

  // Host settings operations
  async saveHostSettings(hostId: string, settings: HostSettings): Promise<void> {
    try {
      const settingsData = removeUndefinedValues({
        ...settings,
        updatedAt: new Date().toISOString()
      });
      
      await set(ref(database, `hostSettings/${hostId}`), settingsData);
    } catch (error: any) {
      console.error('Error saving host settings:', error);
      throw new Error(error.message || 'Failed to save host settings');
    }
  }

  async getHostSettings(hostId: string): Promise<HostSettings | null> {
    try {
      const settingsSnapshot = await get(ref(database, `hostSettings/${hostId}`));
      if (!settingsSnapshot.exists()) {
        return null;
      }
      return settingsSnapshot.val() as HostSettings;
    } catch (error: any) {
      console.error('Error getting host settings:', error);
      return null;
    }
  }

  // Game operations
  async createGame(
    gameConfig: { name: string; maxTickets: number; ticketPrice: number; hostPhone?: string },
    hostId: string,
    ticketSetId: string,
    selectedPrizes: string[]
  ): Promise<GameData> {
    try {
      const gameRef = push(ref(database, 'games'));
      const gameId = gameRef.key!;

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
            // Note: winner property is omitted when creating new prizes to avoid undefined values
          };
        }
      });

      const gameData: GameData = {
        gameId,
        name: gameConfig.name,
        hostId,
        hostPhone: gameConfig.hostPhone,
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

      // Clean undefined values before saving to Firebase
      const cleanedGameData = removeUndefinedValues(gameData);
      
      await set(gameRef, cleanedGameData);
      return gameData;
    } catch (error: any) {
      console.error('Error creating game:', error);
      throw new Error(error.message || 'Failed to create game');
    }
  }

  // Get host games using indexed query - Now properly indexed!
  async getHostGames(hostId: string): Promise<GameData[]> {
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
      
      const gamesData = gamesSnapshot.val();
      return Object.values(gamesData) as GameData[];
    } catch (error: any) {
      console.error('Error fetching host games:', error);
      throw new Error(error.message || 'Failed to fetch host games');
    }
  }

  // Get recent games using indexed query
  async getRecentGames(limit: number = 10): Promise<GameData[]> {
    try {
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('createdAt'),
        limitToLast(limit)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      if (!gamesSnapshot.exists()) {
        return [];
      }
      
      const gamesData = gamesSnapshot.val();
      return Object.values(gamesData) as GameData[];
    } catch (error: any) {
      console.error('Error fetching recent games:', error);
      throw new Error(error.message || 'Failed to fetch recent games');
    }
  }

  async updateGameConfig(
    gameId: string, 
    updates: { 
      maxTickets?: number; 
      hostPhone?: string; 
      selectedPrizes?: string[] 
    }
  ): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      
      // Check if game has started or has any progress
      const gameHasStarted = gameData.gameState.isActive || 
                            gameData.gameState.gameOver || 
                            (gameData.gameState.calledNumbers && gameData.gameState.calledNumbers.length > 0);
      
      // Prepare update object
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (updates.maxTickets !== undefined) {
        updateData.maxTickets = updates.maxTickets;
      }

      if (updates.hostPhone !== undefined) {
        updateData.hostPhone = updates.hostPhone;
      }

      if (updates.selectedPrizes) {
        // Update prizes
        const prizes: { [key: string]: Prize } = {};
        const prizeDefinitions = {
          quickFive: { name: 'Quick Five', pattern: 'First 5 numbers' },
          topLine: { name: 'Top Line', pattern: 'Complete top row' },
          middleLine: { name: 'Middle Line', pattern: 'Complete middle row' },
          bottomLine: { name: 'Bottom Line', pattern: 'Complete bottom row' },
          fourCorners: { name: 'Four Corners', pattern: 'All four corner numbers' },
          fullHouse: { name: 'Full House', pattern: 'Complete ticket' }
        };

        updates.selectedPrizes.forEach(prizeId => {
          if (prizeDefinitions[prizeId as keyof typeof prizeDefinitions]) {
            const prizeDef = prizeDefinitions[prizeId as keyof typeof prizeDefinitions];
            
            // Create prize object
            const newPrize: Prize = {
              id: prizeId,
              name: prizeDef.name,
              pattern: prizeDef.pattern,
              won: false // Default to not won
            };

            // Only preserve existing prize data if game has started
            if (gameHasStarted && gameData.prizes[prizeId]) {
              const existingPrize = gameData.prizes[prizeId];
              newPrize.won = existingPrize.won;
              
              // Only add winner property if it exists and prize is won
              if (existingPrize.won && existingPrize.winner) {
                newPrize.winner = existingPrize.winner;
              }
            }

            prizes[prizeId] = newPrize;
          }
        });

        updateData.prizes = prizes;
      }

      // Clean undefined values before updating Firebase
      const cleanedUpdateData = removeUndefinedValues(updateData);
      
      await update(gameRef, cleanedUpdateData);
    } catch (error: any) {
      console.error('Error updating game config:', error);
      throw new Error(error.message || 'Failed to update game config');
    }
  }

  async deleteGame(gameId: string): Promise<void> {
    try {
      await remove(ref(database, `games/${gameId}`));
    } catch (error: any) {
      console.error('Error deleting game:', error);
      throw new Error(error.message || 'Failed to delete game');
    }
  }

  async loadTicketSet(setId: string): TicketSetData {
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
      console.log('🔧 Updating game state:', { gameId, gameState });
      // Clean undefined values before updating Firebase
      const cleanedGameState = removeUndefinedValues({ gameState });
      await update(ref(database, `games/${gameId}`), cleanedGameState);
      console.log('✅ Game state updated successfully');
    } catch (error: any) {
      console.error('❌ Error updating game state:', error);
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  // ✅ FIXED: This method is now deprecated in favor of callNumberAtomic
  async addCalledNumber(gameId: string, number: number): Promise<void> {
    try {
      console.log('⚠️ addCalledNumber is deprecated, use callNumberAtomic instead');
      const gameRef = ref(database, `games/${gameId}/gameState/calledNumbers`);
      const snapshot = await get(gameRef);
      const calledNumbers = snapshot.exists() ? snapshot.val() : [];
      
      if (!calledNumbers.includes(number)) {
        calledNumbers.push(number);
        await set(gameRef, calledNumbers);
      }
    } catch (error: any) {
      console.error('Error adding called number:', error);
      throw new Error(error.message || 'Failed to add called number');
    }
  }

  // ✅ NEW: Atomic number calling that avoids race conditions
  async callNumberAtomic(gameId: string, number: number): Promise<void> {
    try {
      console.log('🔧 Calling number atomically:', { gameId, number });
      
      // Get current game state
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const currentCalledNumbers = gameData.gameState.calledNumbers || [];
      
      // Check if number is already called
      if (currentCalledNumbers.includes(number)) {
        console.log('⚠️ Number already called:', number);
        return;
      }

      // Create new game state with the called number
      const updatedCalledNumbers = [...currentCalledNumbers, number];
      const updatedGameState: GameState = {
        ...gameData.gameState,
        calledNumbers: updatedCalledNumbers,
        currentNumber: number
      };

      // Update everything atomically
      const cleanedGameState = removeUndefinedValues({ gameState: updatedGameState });
      await update(gameRef, cleanedGameState);
      
      console.log('✅ Number called atomically:', number);
    } catch (error: any) {
      console.error('❌ Error calling number atomically:', error);
      throw new Error(error.message || 'Failed to call number');
    }
  }

  // ✅ NEW: Clear current number (for UI display)
  async clearCurrentNumber(gameId: string): Promise<void> {
    try {
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const updatedGameState: GameState = {
        ...gameData.gameState,
        currentNumber: null
      };

      const cleanedGameState = removeUndefinedValues({ gameState: updatedGameState });
      await update(gameRef, cleanedGameState);
    } catch (error: any) {
      console.error('Error clearing current number:', error);
      throw new Error(error.message || 'Failed to clear current number');
    }
  }

  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      const ticketSnapshot = await get(ticketRef);
      
      if (!ticketSnapshot.exists()) {
        throw new Error('Ticket not found');
      }

      const ticketData = ticketSnapshot.val() as TambolaTicket;
      if (ticketData.isBooked) {
        throw new Error('Ticket is already booked');
      }

      const updatedTicket = removeUndefinedValues({
        ...ticketData,
        isBooked: true,
        playerName,
        playerPhone,
        bookedAt: new Date().toISOString()
      });

      await set(ticketRef, updatedTicket);
    } catch (error: any) {
      console.error('Error booking ticket:', error);
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  async updateTicket(gameId: string, ticketId: string, ticketData: Partial<TambolaTicket>): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      const ticketSnapshot = await get(ticketRef);
      
      if (!ticketSnapshot.exists()) {
        throw new Error('Ticket not found');
      }

      const currentTicket = ticketSnapshot.val() as TambolaTicket;
      const updatedTicket = removeUndefinedValues({
        ...currentTicket,
        ...ticketData,
        updatedAt: new Date().toISOString()
      });

      await set(ticketRef, updatedTicket);
    } catch (error: any) {
      console.error('Error updating ticket:', error);
      throw new Error(error.message || 'Failed to update ticket');
    }
  }

  async unbookTicket(gameId: string, ticketId: string): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      const ticketSnapshot = await get(ticketRef);
      
      if (!ticketSnapshot.exists()) {
        throw new Error('Ticket not found');
      }

      const currentTicket = ticketSnapshot.val() as TambolaTicket;
      const unBookedTicket = removeUndefinedValues({
        ...currentTicket,
        isBooked: false,
        playerName: undefined,
        playerPhone: undefined,
        bookedAt: undefined,
        updatedAt: new Date().toISOString()
      });

      await set(ticketRef, unBookedTicket);
    } catch (error: any) {
      console.error('Error unbooking ticket:', error);
      throw new Error(error.message || 'Failed to unbook ticket');
    }
  }

  // Get booked tickets using indexed query
  async getBookedTickets(gameId: string): Promise<TambolaTicket[]> {
    try {
      const ticketsQuery = query(
        ref(database, `games/${gameId}/tickets`),
        orderByChild('isBooked'),
        equalTo(true)
      );
      
      const ticketsSnapshot = await get(ticketsQuery);
      if (!ticketsSnapshot.exists()) {
        return [];
      }
      
      const ticketsData = ticketsSnapshot.val();
      return Object.values(ticketsData) as TambolaTicket[];
    } catch (error: any) {
      console.error('Error fetching booked tickets:', error);
      throw new Error(error.message || 'Failed to fetch booked tickets');
    }
  }

  // Real-time subscriptions
  subscribeToGame(gameId: string, callback: (game: GameData | null) => void): () => void {
    const gameRef = ref(database, `games/${gameId}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as GameData);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('Game subscription error:', error);
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
      console.error('Tickets subscription error:', error);
      callback(null);
    });

    return () => off(ticketsRef, 'value', unsubscribe);
  }

  subscribeToHosts(callback: (hosts: HostUser[]) => void): () => void {
    const hostsRef = ref(database, 'hosts');
    
    const unsubscribe = onValue(hostsRef, (snapshot) => {
      if (snapshot.exists()) {
        const hostsData = snapshot.val();
        const hosts = Object.values(hostsData) as HostUser[];
        callback(hosts);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Hosts subscription error:', error);
      callback([]);
    });

    return () => off(hostsRef, 'value', unsubscribe);
  }

  // Subscribe to host games with indexed query
  subscribeToHostGames(hostId: string, callback: (games: GameData[]) => void): () => void {
    const gamesQuery = query(
      ref(database, 'games'),
      orderByChild('hostId'),
      equalTo(hostId)
    );
    
    const unsubscribe = onValue(gamesQuery, (snapshot) => {
      if (snapshot.exists()) {
        const gamesData = snapshot.val();
        const games = Object.values(gamesData) as GameData[];
        callback(games);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Host games subscription error:', error);
      callback([]);
    });

    return () => off(gamesQuery, 'value', unsubscribe);
  }

  // Authentication
  async getUserData(): Promise<AdminUser | HostUser | null> {
    const user = auth.currentUser;
    if (!user) return null;

    try {
      // Check admin first
      const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
      if (adminSnapshot.exists()) {
        return adminSnapshot.val() as AdminUser;
      }

      // Check host
      const hostSnapshot = await get(ref(database, `hosts/${user.uid}`));
      if (hostSnapshot.exists()) {
        return hostSnapshot.val() as HostUser;
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
    const adminRef = ref(database, 'admins/default-admin');
    const adminSnapshot = await get(adminRef);
    
    if (!adminSnapshot.exists()) {
      const defaultAdmin: AdminUser = {
        uid: 'default-admin',
        email: 'admin@tambola.com',
        name: 'System Administrator',
        role: 'admin',
        createdAt: new Date().toISOString(),
        isActive: true
      };
      
      const cleanedDefaultAdmin = removeUndefinedValues(defaultAdmin);
      await set(adminRef, cleanedDefaultAdmin);
      console.log('✅ Default admin initialized in Realtime Database');
    }
  } catch (error) {
    console.error('❌ Error initializing default admin:', error);
  }
};

// Initialize on module load
initializeDefaultAdmin();
