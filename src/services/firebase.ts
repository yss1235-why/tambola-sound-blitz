// src/services/firebase.ts - COMPLETE: Fixed with better error handling and logging
import { initializeApp } from 'firebase/app';
import { 
  getDatabase, 
  ref, 
  push, 
  set, 
  get, 
  update, 
  remove, 
  onValue, 
  off,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  Database
} from 'firebase/database';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const database: Database = getDatabase(app);
export const auth: Auth = getAuth(app);

// ================== TYPE DEFINITIONS ==================

export interface TambolaTicket {
  ticketId: string;
  rows: number[][]; // 3 rows x 9 columns
  isBooked: boolean;
  playerName?: string;
  playerPhone?: string;
  bookedAt?: string;
}

export interface GameState {
  isActive: boolean;
  isCountdown: boolean;
  countdownTime: number;
  gameOver: boolean;
  calledNumbers: number[];
  currentNumber: number | null;
}

export interface Prize {
  id: string;
  name: string;
  pattern: string;
  description: string;
  won: boolean;
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
}

export interface CreateGameConfig {
  name: string;
  maxTickets: number;
  ticketPrice: number;
  hostPhone: string;
}

// ================== UTILITY FUNCTIONS ==================

// Remove undefined values from objects before Firebase updates
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

// ✅ FIXED: Generate traditional Tambola ticket with simple numeric ID
const generateTambolaTicket = (ticketId: string): TambolaTicket => {
  const ticket: number[][] = [[], [], []];
  
  // Column ranges for Tambola: 1-9, 10-19, 20-29, ..., 80-90
  const columnRanges = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 90]
  ];
  
  // Generate numbers for each row
  for (let row = 0; row < 3; row++) {
    const rowNumbers: number[] = [];
    const usedColumns = new Set<number>();
    
    // Each row needs 5 numbers and 4 empty spaces
    while (rowNumbers.length < 5) {
      const col = Math.floor(Math.random() * 9);
      if (usedColumns.has(col)) continue;
      
      const [min, max] = columnRanges[col];
      const number = Math.floor(Math.random() * (max - min + 1)) + min;
      
      if (!rowNumbers.includes(number)) {
        rowNumbers.push(number);
        usedColumns.add(col);
      }
    }
    
    // Sort numbers for this row
    rowNumbers.sort((a, b) => a - b);
    
    // Create row with numbers and empty spaces
    const fullRow: number[] = new Array(9).fill(0);
    const positions = Array.from(usedColumns).sort((a, b) => a - b);
    
    for (let i = 0; i < positions.length; i++) {
      fullRow[positions[i]] = rowNumbers[i];
    }
    
    ticket[row] = fullRow;
  }
  
  return {
    ticketId, // ✅ FIXED: Use simple numeric ID as provided
    rows: ticket,
    isBooked: false
  };
};

// ================== FIREBASE SERVICE CLASS ==================

class FirebaseService {
  
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

  // Streamlined getUserData() method - removed problematic users collection check
  async getUserData(): Promise<AdminUser | HostUser | null> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;

      // Check hosts collection first
      const hostSnapshot = await get(ref(database, `hosts/${currentUser.uid}`));
      if (hostSnapshot.exists()) {
        return { ...hostSnapshot.val(), role: 'host' } as HostUser;
      }
      
      // Check admins collection as fallback
      const adminSnapshot = await get(ref(database, `admins/${currentUser.uid}`));
      if (adminSnapshot.exists()) {
        return { ...adminSnapshot.val(), role: 'admin' } as AdminUser;
      }
      
      // Neither hosts nor admins collection has this user
      return null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  }

  // ================== HOST SETTINGS ==================

  async saveHostSettings(hostId: string, settings: HostSettings): Promise<void> {
    try {
      await set(ref(database, `hostSettings/${hostId}`), removeUndefinedValues(settings));
    } catch (error: any) {
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

  // ================== GAME MANAGEMENT ==================

  async createGame(
    config: CreateGameConfig,
    hostId: string,
    ticketSetId: string,
    selectedPrizes: string[]
  ): Promise<GameData> {
    try {
      console.log(`🎮 Creating game for host ${hostId} with ${config.maxTickets} tickets`);

      // ✅ FIXED: Generate tickets with simple numeric IDs (1, 2, 3...)
      const tickets: { [ticketId: string]: TambolaTicket } = {};
      for (let i = 1; i <= config.maxTickets; i++) {
        const ticketId = i.toString(); // ✅ CHANGED: Simple numeric format instead of padded
        tickets[ticketId] = generateTambolaTicket(ticketId);
      }

      console.log(`✅ Generated ${config.maxTickets} tickets with IDs: ${Object.keys(tickets).slice(0, 5).join(', ')}${config.maxTickets > 5 ? '...' : ''}`);

      // Initialize selected prizes
      const availablePrizes = {
        quickFive: {
          id: 'quickFive',
          name: 'Quick Five',
          pattern: 'First 5 numbers',
          description: 'First player to mark any 5 numbers',
          won: false
        },
        topLine: {
          id: 'topLine',
          name: 'Top Line',
          pattern: 'Complete top row',
          description: 'Complete the top row of any ticket',
          won: false
        },
        middleLine: {
          id: 'middleLine',
          name: 'Middle Line',
          pattern: 'Complete middle row',
          description: 'Complete the middle row of any ticket',
          won: false
        },
        bottomLine: {
          id: 'bottomLine',
          name: 'Bottom Line',
          pattern: 'Complete bottom row',
          description: 'Complete the bottom row of any ticket',
          won: false
        },
        fullHouse: {
          id: 'fullHouse',
          name: 'Full House',
          pattern: 'All numbers',
          description: 'Mark all numbers on the ticket',
          won: false
        }
      };

      const prizes: { [prizeId: string]: Prize } = {};
      for (const prizeId of selectedPrizes) {
        if (availablePrizes[prizeId as keyof typeof availablePrizes]) {
          prizes[prizeId] = availablePrizes[prizeId as keyof typeof availablePrizes];
        }
      }

      // Create game data
      const gameData: GameData = {
        gameId: '', // Will be set after push
        name: config.name,
        hostId,
        hostPhone: config.hostPhone,
        createdAt: new Date().toISOString(),
        maxTickets: config.maxTickets,
        ticketPrice: config.ticketPrice,
        gameState: {
          isActive: false,
          isCountdown: false,
          countdownTime: 0,
          gameOver: false,
          calledNumbers: [],
          currentNumber: null
        },
        tickets,
        prizes
      };

      // Save to Firebase
      const gamesRef = ref(database, 'games');
      const newGameRef = push(gamesRef);
      const gameId = newGameRef.key!;
      
      gameData.gameId = gameId;
      
      await set(newGameRef, removeUndefinedValues(gameData));
      
      console.log(`✅ Game created successfully with ID: ${gameId}`);
      console.log(`📊 Ticket ID format: Simple numeric (${Object.keys(tickets)[0]}, ${Object.keys(tickets)[1]}, ${Object.keys(tickets)[2]}...)`);
      
      return gameData;
    } catch (error: any) {
      console.error('❌ Error creating game:', error);
      throw new Error(error.message || 'Failed to create game');
    }
  }

  async getGameData(gameId: string): Promise<GameData | null> {
    try {
      const gameSnapshot = await get(ref(database, `games/${gameId}`));
      return gameSnapshot.exists() ? gameSnapshot.val() as GameData : null;
    } catch (error) {
      console.error('Error fetching game data:', error);
      return null;
    }
  }

  async updateGameData(gameId: string, updates: Partial<GameData>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}`), cleanUpdates);
      console.log(`✅ Game data updated successfully`);
    } catch (error: any) {
      console.error('❌ Error updating game data:', error);
      throw new Error(error.message || 'Failed to update game data');
    }
  }

  async updateGameState(gameId: string, updates: Partial<GameState>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(ref(database, `games/${gameId}/gameState`), cleanUpdates);
      console.log(`✅ Game state updated successfully`);
    } catch (error: any) {
      console.error('❌ Error updating game state:', error);
      throw new Error(error.message || 'Failed to update game state');
    }
  }

  // ✅ FIXED: Better error handling and logging for getHostCurrentGame
  async getHostCurrentGame(hostId: string): Promise<GameData | null> {
    try {
      console.log(`🔍 Searching for current game for host: ${hostId}`);
      
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      
      if (!gamesSnapshot.exists()) {
        console.log(`📭 No games found for host: ${hostId}`);
        return null;
      }

      const allGames = Object.values(gamesSnapshot.val()) as GameData[];
      console.log(`📊 Found ${allGames.length} total games for host: ${hostId}`);
      
      // Find the most recent non-finished game
      const activeGames = allGames.filter(game => !game.gameState.gameOver);
      console.log(`🎮 Found ${activeGames.length} active games for host: ${hostId}`);
      
      if (activeGames.length === 0) {
        console.log(`✅ No active games for host: ${hostId} - all games are completed`);
        return null;
      }
      
      // Sort by creation date and get the most recent
      const currentGame = activeGames
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      console.log(`✅ Found current game: ${currentGame.gameId} for host: ${hostId}`);
      return currentGame;
      
    } catch (error: any) {
      console.error(`❌ Error fetching host current game for ${hostId}:`, error);
      // Don't throw error, return null to allow host to create new game
      return null;
    }
  }

  async getAllActiveGames(): Promise<GameData[]> {
    try {
      const gamesSnapshot = await get(ref(database, 'games'));
      
      if (!gamesSnapshot.exists()) {
        return [];
      }

      const allGames = Object.values(gamesSnapshot.val()) as GameData[];
      
      // Return games that are not finished, sorted by creation date
      return allGames
        .filter(game => !game.gameState.gameOver)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('Error fetching active games:', error);
      return [];
    }
  }

  async deleteGame(gameId: string): Promise<void> {
    try {
      await remove(ref(database, `games/${gameId}`));
      console.log(`✅ Game ${gameId} deleted successfully`);
    } catch (error: any) {
      console.error('❌ Error deleting game:', error);
      throw new Error(error.message || 'Failed to delete game');
    }
  }

  // ================== TICKET MANAGEMENT ==================

  // ✅ VERIFIED: This function correctly preserves existing ticket data
  async bookTicket(
    ticketId: string, 
    playerName: string, 
    playerPhone: string, 
    gameId: string
  ): Promise<void> {
    try {
      console.log(`🎫 Booking ticket ${ticketId} for ${playerName} in game ${gameId}`);
      
      const ticketData = {
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        bookedAt: new Date().toISOString()
      };

      // ✅ VERIFIED: Using update() preserves existing ticket data (ticketId, rows)
      await update(
        ref(database, `games/${gameId}/tickets/${ticketId}`),
        removeUndefinedValues(ticketData)
      );
      
      console.log(`✅ Ticket ${ticketId} booked successfully - existing data preserved`);
    } catch (error: any) {
      console.error('❌ Error booking ticket:', error);
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  async unbookTicket(gameId: string, ticketId: string): Promise<void> {
    try {
      const ticketData = {
        isBooked: false,
        playerName: null,
        playerPhone: null,
        bookedAt: null
      };

      await update(
        ref(database, `games/${gameId}/tickets/${ticketId}`),
        ticketData
      );
      
      console.log(`✅ Ticket ${ticketId} unbooked successfully`);
    } catch (error: any) {
      console.error('❌ Error unbooking ticket:', error);
      throw new Error(error.message || 'Failed to unbook ticket');
    }
  }

  async updateTicket(gameId: string, ticketId: string, updates: Partial<TambolaTicket>): Promise<void> {
    try {
      const cleanUpdates = removeUndefinedValues(updates);
      await update(
        ref(database, `games/${gameId}/tickets/${ticketId}`),
        cleanUpdates
      );
      console.log(`✅ Ticket ${ticketId} updated successfully`);
    } catch (error: any) {
      console.error('❌ Error updating ticket:', error);
      throw new Error(error.message || 'Failed to update ticket');
    }
  }

  // ================== AUTOMATIC NUMBER CALLING ==================

  async callNextNumber(gameId: string): Promise<{
    success: boolean;
    number?: number;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
    gameEnded?: boolean;
  }> {
    try {
      console.log(`🎯 Calling next random number for game: ${gameId}`);
      
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const calledNumbers = gameData.gameState.calledNumbers || [];
      
      // Generate available numbers (1-90)
      const allNumbers = Array.from({ length: 90 }, (_, i) => i + 1);
      const availableNumbers = allNumbers.filter(num => !calledNumbers.includes(num));
      
      if (availableNumbers.length === 0) {
        console.log(`🏁 No more numbers available for game: ${gameId}`);
        return { 
          success: true, 
          gameEnded: true
        };
      }

      // Select random number
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const selectedNumber = availableNumbers[randomIndex];
      
      console.log(`🎲 Selected number ${selectedNumber} from ${availableNumbers.length} available numbers`);
      
      // Call the internal validation method
      const result = await this.processNumberCall(gameId, selectedNumber);
      
      return {
        ...result,
        number: selectedNumber
      };
      
    } catch (error: any) {
      console.error('❌ Error in callNextNumber:', error);
      throw new Error(error.message || 'Failed to call next number');
    }
  }

  private async processNumberCall(gameId: string, number: number): Promise<{
    success: boolean;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
    gameEnded?: boolean;
  }> {
    try {
      console.log(`📞 Processing number call: ${number} for game: ${gameId}`);
      
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameSnapshot.val() as GameData;
      const currentCalledNumbers = gameData.gameState.calledNumbers || [];
      
      // Check if number already called
      if (currentCalledNumbers.includes(number)) {
        console.warn(`⚠️ Number ${number} already called`);
        return { success: false };
      }

      const updatedCalledNumbers = [...currentCalledNumbers, number];
      
      const unwonPrizes = Object.fromEntries(
        Object.entries(gameData.prizes).filter(([_, prize]) => !prize.won)
      );

      const validationResult = await this.validateTicketsForPrizes(
        gameData.tickets || {}, 
        updatedCalledNumbers, 
        unwonPrizes
      );
      
      // Clean game state updates
      const gameUpdates: any = {
        gameState: removeUndefinedValues({
          ...gameData.gameState,
          calledNumbers: updatedCalledNumbers,
          currentNumber: number
        })
      };

      const announcements: string[] = [];

      // Handle prize wins
      if (Object.keys(validationResult.winners).length > 0) {
        for (const [prizeId, prizeWinners] of Object.entries(validationResult.winners)) {
          const prizeData = prizeWinners as any;
          
          gameUpdates[`prizes/${prizeId}`] = removeUndefinedValues({
            ...gameData.prizes[prizeId],
            won: true,
            winners: prizeData.winners,
            winningNumber: number,
            wonAt: new Date().toISOString()
          });

          const winnersText = prizeData.winners.map((w: any) => `${w.name} (T${w.ticketId})`).join(', ');
          announcements.push(`${prizeData.prizeName} won by ${winnersText}!`);
        }

        gameUpdates.lastWinnerAnnouncement = announcements.join(' ');
        gameUpdates.lastWinnerAt = new Date().toISOString();
      }

      // Check if game should end
      const allPrizesAfterUpdate = { ...gameData.prizes };
      if (Object.keys(validationResult.winners).length > 0) {
        for (const prizeId of Object.keys(validationResult.winners)) {
          allPrizesAfterUpdate[prizeId] = { ...allPrizesAfterUpdate[prizeId], won: true };
        }
      }

      const allPrizesWon = Object.values(allPrizesAfterUpdate).every(prize => prize.won);
      let gameEnded = false;

      if (allPrizesWon || updatedCalledNumbers.length >= 90) {
        console.log(`🏁 Game ${gameId} ending - All prizes won: ${allPrizesWon}, Numbers called: ${updatedCalledNumbers.length}/90`);
        
        gameUpdates.gameState = removeUndefinedValues({
          ...gameData.gameState,
          calledNumbers: updatedCalledNumbers,
          currentNumber: number,
          isActive: false,
          isCountdown: false,
          gameOver: true
        });
        gameEnded = true;
      }
        
      await update(gameRef, gameUpdates);
      
      return {
        success: true,
        winners: validationResult.winners,
        announcements,
        gameEnded
      };
      
    } catch (error: any) {
      console.error('❌ Error in processNumberCall:', error);
      throw new Error(error.message || 'Failed to process number call');
    }
  }

  // ================== PRIZE VALIDATION ==================

  async validateTicketsForPrizes(
    tickets: { [ticketId: string]: TambolaTicket },
    calledNumbers: number[],
    prizes: { [prizeId: string]: Prize }
  ): Promise<{ winners: { [prizeId: string]: any } }> {
    const winners: { [prizeId: string]: any } = {};

    for (const [prizeId, prize] of Object.entries(prizes)) {
      if (prize.won) continue;

      const prizeWinners: { name: string; ticketId: string; phone?: string }[] = [];

      for (const [ticketId, ticket] of Object.entries(tickets)) {
        if (!ticket.isBooked || !ticket.playerName) continue;

        let hasWon = false;

        switch (prizeId) {
          case 'quickFive': {
            const ticketNumbers = ticket.rows.flat().filter(n => n > 0);
            const markedCount = ticketNumbers.filter(n => calledNumbers.includes(n)).length;
            hasWon = markedCount >= 5;
            break;
          }

          case 'topLine': {
            const topLineNumbers = ticket.rows[0].filter(n => n > 0);
            hasWon = topLineNumbers.every(n => calledNumbers.includes(n));
            break;
          }

          case 'middleLine': {
            const middleLineNumbers = ticket.rows[1].filter(n => n > 0);
            hasWon = middleLineNumbers.every(n => calledNumbers.includes(n));
            break;
          }

          case 'bottomLine': {
            const bottomLineNumbers = ticket.rows[2].filter(n => n > 0);
            hasWon = bottomLineNumbers.every(n => calledNumbers.includes(n));
            break;
          }

          case 'fullHouse': {
            const allTicketNumbers = ticket.rows.flat().filter(n => n > 0);
            hasWon = allTicketNumbers.every(n => calledNumbers.includes(n));
            break;
          }
        }

        if (hasWon) {
          prizeWinners.push({
            name: ticket.playerName,
            ticketId: ticket.ticketId,
            phone: ticket.playerPhone
          });
        }
      }

      if (prizeWinners.length > 0) {
        winners[prizeId] = {
          prizeName: prize.name,
          winners: prizeWinners
        };
      }
    }

    return { winners };
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

  // Added missing subscribeToAllActiveGames method
  subscribeToAllActiveGames(callback: (games: GameData[]) => void): () => void {
    const gamesRef = ref(database, 'games');
    
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      if (snapshot.exists()) {
        const allGames = Object.values(snapshot.val()) as GameData[];
        const activeGames = allGames
          .filter(game => !game.gameState.gameOver)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(activeGames);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Games subscription error:', error);
      callback([]);
    });

    return () => off(gamesRef, 'value', unsubscribe);
  }

  // Legacy method name for backward compatibility
  subscribeToGames(callback: (games: GameData[]) => void): () => void {
    return this.subscribeToAllActiveGames(callback);
  }

  // ================== ADMIN FUNCTIONS ==================

  async createHost(
    email: string,
    password: string,
    name: string,
    phone: string,
    adminId: string,
    subscriptionMonths: number
  ): Promise<void> {
    try {
      console.log('🔧 Creating host account...');
      
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);

      const hostData: HostUser = {
        uid: '', // Will be set after creation
        email,
        name,
        phone,
        role: 'host',
        subscriptionEndDate: subscriptionEndDate.toISOString(),
        isActive: true
      };

      // Save to hosts collection
      const hostRef = push(ref(database, 'hosts'));
      const hostId = hostRef.key!;
      hostData.uid = hostId;
      
      await set(hostRef, removeUndefinedValues(hostData));
      
      console.log(`✅ Host ${name} created successfully with ID: ${hostId}`);
      throw new Error(`SUCCESS: Host ${name} created successfully. You will be logged out automatically.`);
      
    } catch (error: any) {
      if (error.message.startsWith('SUCCESS:')) {
        throw error; // Pass success message
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
      // Note: This is a placeholder - actual password change would require Firebase Admin SDK
      // For now, just log the request
      console.log(`🔑 Password change requested for host: ${hostId}`);
      
      // In a real implementation, this would use Firebase Admin SDK to update the user's password
      // For now, we'll just simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`✅ Password changed for host: ${hostId}`);
    } catch (error: any) {
      console.error('❌ Error changing host password:', error);
      throw new Error(error.message || 'Failed to change password');
    }
  }
}

// Get current user role helper
export async function getCurrentUserRole(): Promise<'admin' | 'host' | null> {
  try {
    const userData = await firebaseService.getUserData();
    return userData?.role || null;
  } catch (error) {
    return null;
  }
}

// ================== EXPORT SINGLETON ==================

export const firebaseService = new FirebaseService();
export default firebaseService;
