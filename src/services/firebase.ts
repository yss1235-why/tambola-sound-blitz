// src/services/firebase.ts - Complete Firebase service with prize validation
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
  winners?: Array<{
    ticketId: string;
    name: string;
    phone?: string;
  }>;
  winningNumber?: number;
  wonAt?: string;
  manuallyAwarded?: boolean;
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
  lastWinnerAnnouncement?: string;
  lastWinnerAt?: string;
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
              if (existingPrize.won && existingPrize.winners) {
                newPrize.winners = existingPrize.winners;
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

  // ✅ DEPRECATED: This method is now deprecated in favor of callNumberWithPrizeValidation
  async addCalledNumber(gameId: string, number: number): Promise<void> {
    try {
      console.log('⚠️ addCalledNumber is deprecated, use callNumberWithPrizeValidation instead');
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

  // ✅ NEW: Call a number with automatic prize validation
  async callNumberWithPrizeValidation(gameId: string, number: number): Promise<{
    success: boolean;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
  }> {
    try {
      console.log('🎯 Calling number with prize validation:', { gameId, number });
      
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
        return { success: false };
      }

      // Create new game state with the called number
      const updatedCalledNumbers = [...currentCalledNumbers, number];
      
      // First, update the game state with the new number
      const updatedGameState: GameState = {
        ...gameData.gameState,
        calledNumbers: updatedCalledNumbers,
        currentNumber: number
      };

      await update(gameRef, { gameState: removeUndefinedValues(updatedGameState) });

      // Now validate prizes with the updated called numbers
      const validationResult = await this.validateTicketsForPrizes(gameData.tickets || {}, updatedCalledNumbers, gameData.prizes);
      
      // Update prizes if winners found
      if (Object.keys(validationResult.winners).length > 0) {
        const prizeUpdates: any = {};
        const announcements: string[] = [];
        
        for (const [prizeId, prizeWinners] of Object.entries(validationResult.winners)) {
          const prizeData = prizeWinners as any;
          
          // Update prize with winners
          prizeUpdates[`prizes/${prizeId}`] = removeUndefinedValues({
            ...gameData.prizes[prizeId],
            won: true,
            winners: prizeData.winners,
            winningNumber: number,
            wonAt: new Date().toISOString()
          });
          
          // Create announcement
          const announcement = this.formatWinnerAnnouncement(prizeData);
          announcements.push(announcement);
        }
        
        // Update all prize data and last winner announcement
        if (announcements.length > 0) {
          prizeUpdates.lastWinnerAnnouncement = announcements.join(' | ');
          prizeUpdates.lastWinnerAt = new Date().toISOString();
        }
        
        await update(gameRef, prizeUpdates);
        
        console.log('✅ Number called with prize validation complete:', {
          number,
          winnersFound: Object.keys(validationResult.winners).length,
          announcements
        });
        
        return {
          success: true,
          winners: validationResult.winners,
          announcements
        };
      }
      
      console.log('✅ Number called, no winners detected:', number);
      return { success: true };
      
    } catch (error: any) {
      console.error('❌ Error calling number with prize validation:', error);
      throw new Error(error.message || 'Failed to call number with prize validation');
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

  // ✅ NEW: Validate current prizes for a game
  async validateCurrentPrizes(gameId: string): Promise<{
    winners: { [prizeId: string]: any };
    statistics: any;
  }> {
    try {
      const gameSnapshot = await get(ref(database, `games/${gameId}`));
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const calledNumbers = gameData.gameState.calledNumbers || [];
      
      return this.validateTicketsForPrizes(gameData.tickets || {}, calledNumbers, gameData.prizes);
    } catch (error: any) {
      console.error('Error validating current prizes:', error);
      throw new Error(error.message || 'Failed to validate prizes');
    }
  }

  // ✅ NEW: Internal prize validation logic
  private async validateTicketsForPrizes(
    tickets: { [key: string]: TambolaTicket },
    calledNumbers: number[],
    prizes: { [key: string]: Prize }
  ): Promise<{
    winners: { [prizeId: string]: any };
    statistics: any;
  }> {
    const bookedTickets = Object.values(tickets).filter(ticket => ticket.isBooked);
    const calledSet = new Set(calledNumbers);
    const winners: { [prizeId: string]: any } = {};
    
    for (const [prizeId, prize] of Object.entries(prizes)) {
      if (prize.won) continue; // Skip already won prizes

      const prizeWinners: any[] = [];

      for (const ticket of bookedTickets) {
        const isWinner = this.checkTicketForPrize(ticket, calledSet, prize);
        if (isWinner) {
          prizeWinners.push({
            ticketId: ticket.ticketId,
            name: ticket.playerName || 'Unknown Player',
            phone: ticket.playerPhone
          });
        }
      }

      if (prizeWinners.length > 0) {
        winners[prizeId] = {
          prizeName: prize.name,
          prizePattern: prize.pattern,
          winners: prizeWinners,
          winningNumber: calledNumbers[calledNumbers.length - 1]
        };
      }
    }

    return {
      winners,
      statistics: {
        totalTickets: Object.keys(tickets).length,
        bookedTickets: bookedTickets.length,
        calledNumbers: calledNumbers.length
      }
    };
  }

  // ✅ NEW: Check if a ticket has won a specific prize
  private checkTicketForPrize(
    ticket: TambolaTicket,
    calledNumbers: Set<number>,
    prize: Prize
  ): boolean {
    switch (prize.id) {
      case 'quickFive':
        return this.checkQuickFive(ticket, calledNumbers);
      case 'topLine':
        return this.checkTopLine(ticket, calledNumbers);
      case 'middleLine':
        return this.checkMiddleLine(ticket, calledNumbers);
      case 'bottomLine':
        return this.checkBottomLine(ticket, calledNumbers);
      case 'fourCorners':
        return this.checkFourCorners(ticket, calledNumbers);
      case 'fullHouse':
        return this.checkFullHouse(ticket, calledNumbers);
      default:
        return false;
    }
  }

  private checkQuickFive(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    let markedCount = 0;
    for (const row of ticket.rows) {
      for (const number of row) {
        if (number !== 0 && calledNumbers.has(number)) {
          markedCount++;
          if (markedCount >= 5) return true;
        }
      }
    }
    return false;
  }

  private checkTopLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    if (ticket.rows.length === 0) return false;
    const topRow = ticket.rows[0];
    
    for (const number of topRow) {
      if (number !== 0 && !calledNumbers.has(number)) {
        return false;
      }
    }
    return true;
  }

  private checkMiddleLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    if (ticket.rows.length < 2) return false;
    const middleRow = ticket.rows[1];
    
    for (const number of middleRow) {
      if (number !== 0 && !calledNumbers.has(number)) {
        return false;
      }
    }
    return true;
  }

  private checkBottomLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    if (ticket.rows.length < 3) return false;
    const bottomRow = ticket.rows[2];
    
    for (const number of bottomRow) {
      if (number !== 0 && !calledNumbers.has(number)) {
        return false;
      }
    }
    return true;
  }

  private checkFourCorners(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    if (ticket.rows.length < 3) return false;

    const topRow = ticket.rows[0];
    const bottomRow = ticket.rows[2];
    
    // Find first and last non-zero numbers in top and bottom rows
    const topLeft = topRow.find(num => num !== 0);
    const topRight = topRow.slice().reverse().find(num => num !== 0);
    const bottomLeft = bottomRow.find(num => num !== 0);
    const bottomRight = bottomRow.slice().reverse().find(num => num !== 0);

    const corners = [topLeft, topRight, bottomLeft, bottomRight].filter(num => num !== undefined);
    
    return corners.length === 4 && corners.every(corner => calledNumbers.has(corner!));
  }

  private checkFullHouse(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
    for (const row of ticket.rows) {
      for (const number of row) {
        if (number !== 0 && !calledNumbers.has(number)) {
          return false;
        }
      }
    }
    return true;
  }

  // ✅ NEW: Reset a specific prize
  async resetPrize(gameId: string, prizeId: string): Promise<void> {
    try {
      const prizeRef = ref(database, `games/${gameId}/prizes/${prizeId}`);
      const prizeSnapshot = await get(prizeRef);
      
      if (!prizeSnapshot.exists()) {
        throw new Error('Prize not found');
      }

      const prizeData = prizeSnapshot.val() as Prize;
      
      // Reset prize to initial state
      const resetPrize = removeUndefinedValues({
        ...prizeData,
        won: false,
        winners: undefined,
        winningNumber: undefined,
        wonAt: undefined,
        manuallyAwarded: undefined
      });

      await set(prizeRef, resetPrize);
      
      // Also clear any related winner announcements
      await update(ref(database, `games/${gameId}`), {
        lastWinnerAnnouncement: null,
        lastWinnerAt: null
      });
      
    } catch (error: any) {
      console.error('Error resetting prize:', error);
      throw new Error(error.message || 'Failed to reset prize');
    }
  }

  // ✅ NEW: Manually award a prize to specific winners
  async awardPrizeManually(
    gameId: string,
    prizeId: string,
    winners: Array<{
      ticketId: string;
      playerName: string;
      playerPhone?: string;
    }>
  ): Promise<void> {
    try {
      const prizeRef = ref(database, `games/${gameId}/prizes/${prizeId}`);
      const prizeSnapshot = await get(prizeRef);
      
      if (!prizeSnapshot.exists()) {
        throw new Error('Prize not found');
      }

      const prizeData = prizeSnapshot.val() as Prize;
      
      // Format winners for storage
      const formattedWinners = winners.map(winner => ({
        ticketId: winner.ticketId,
        name: winner.playerName,
        phone: winner.playerPhone
      }));

      // Update prize with manual winners
      const updatedPrize = removeUndefinedValues({
        ...prizeData,
        won: true,
        winners: formattedWinners,
        wonAt: new Date().toISOString(),
        manuallyAwarded: true
      });

      await set(prizeRef, updatedPrize);
      
      // Create winner announcement
      const announcement = this.formatWinnerAnnouncement({
        prizeName: prizeData.name,
        winners: formattedWinners
      });

      // Update last winner announcement
      await update(ref(database, `games/${gameId}`), {
        lastWinnerAnnouncement: announcement,
        lastWinnerAt: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Error awarding prize manually:', error);
      throw new Error(error.message || 'Failed to award prize manually');
    }
  }

  // ✅ NEW: Format winner announcement
  private formatWinnerAnnouncement(data: {
    prizeName: string;
    winners: Array<{ name: string; ticketId: string; phone?: string }>;
  }): string {
    if (data.winners.length === 1) {
      const winner = data.winners[0];
      return `🎉 ${data.prizeName} won by ${winner.name} (Ticket ${winner.ticketId})!`;
    } else if (data.winners.length > 1) {
      const winnerNames = data.winners.map(w => `${w.name} (T${w.ticketId})`).join(', ');
      return `🎉 ${data.prizeName} won by ${data.winners.length} players: ${winnerNames}!`;
    }
    return `🎉 ${data.prizeName} has been won!`;
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
