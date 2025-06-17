// src/services/firebase.ts - COMPLETE CLEANED VERSION
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

// Generate traditional Tambola ticket (3 rows x 9 columns)
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
    ticketId,
    rows: ticket,
    isBooked: false
  };
};

// ================== FIREBASE SERVICE CLASS ==================

class FirebaseService {
  
  // ================== AUTHENTICATION ==================
  
  async signIn(email: string, password: string): Promise<HostUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await this.getUserData(userCredential.user.uid);
      if (!userData) {
        throw new Error('User data not found');
      }
      return userData;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign in');
    }
  }

  async signUp(email: string, password: string, userData: Partial<HostUser>): Promise<HostUser> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const hostUser: HostUser = {
        uid: userCredential.user.uid,
        email,
        role: 'host',
        ...userData
      } as HostUser;
      
      await set(ref(database, `users/${userCredential.user.uid}`), removeUndefinedValues(hostUser));
      return hostUser;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create account');
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign out');
    }
  }

  async getUserData(uid: string): Promise<HostUser | null> {
    try {
      const userSnapshot = await get(ref(database, `users/${uid}`));
      return userSnapshot.exists() ? userSnapshot.val() as HostUser : null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  }

  onAuthStateChanged(callback: (user: HostUser | null) => void): () => void {
    return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        const userData = await this.getUserData(firebaseUser.uid);
        callback(userData);
      } else {
        callback(null);
      }
    });
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

      // Generate tickets based on selected set
      const tickets: { [ticketId: string]: TambolaTicket } = {};
      for (let i = 1; i <= config.maxTickets; i++) {
        const ticketId = i.toString().padStart(3, '0');
        tickets[ticketId] = generateTambolaTicket(ticketId);
      }

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

  async getHostCurrentGame(hostId: string): Promise<GameData | null> {
    try {
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(hostId)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      
      if (!gamesSnapshot.exists()) {
        return null;
      }

      // Find the most recent non-finished game
      const games = Object.values(gamesSnapshot.val()) as GameData[];
      const activeGame = games
        .filter(game => !game.gameState.gameOver)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      return activeGame || null;
    } catch (error) {
      console.error('Error fetching host current game:', error);
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

  async bookTicket(
    ticketId: string, 
    playerName: string, 
    playerPhone: string, 
    gameId: string
  ): Promise<void> {
    try {
      const ticketData = {
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        bookedAt: new Date().toISOString()
      };

      await update(
        ref(database, `games/${gameId}/tickets/${ticketId}`),
        removeUndefinedValues(ticketData)
      );
      
      console.log(`✅ Ticket ${ticketId} booked for ${playerName}`);
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

  // ================== AUTOMATIC NUMBER CALLING ==================

  /**
   * ✅ NEW: Automatic number calling (generates random number)
   */
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
      
      // Validate the selected number
      if (typeof selectedNumber !== 'number' || selectedNumber < 1 || selectedNumber > 90) {
        console.error('❌ Invalid number generated:', selectedNumber);
        throw new Error(`Invalid number generated: ${selectedNumber}`);
      }

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

  /**
   * ✅ RENAMED: Internal method for processing number calls (was callNumberWithPrizeValidation)
   */
  private async processNumberCall(gameId: string, number: number): Promise<{
    success: boolean;
    winners?: { [prizeId: string]: any };
    announcements?: string[];
    gameEnded?: boolean;
  }> {
    try {
      // Input validation
      if (typeof number !== 'number' || number < 1 || number > 90 || !Number.isInteger(number)) {
        console.error('❌ Invalid number provided:', number);
        throw new Error(`Invalid number: ${number}. Must be integer between 1-90.`);
      }

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
      
      // Validate the array before updating
      if (updatedCalledNumbers.some(n => typeof n !== 'number' || n < 1 || n > 90)) {
        console.error('❌ Invalid numbers in calledNumbers array:', updatedCalledNumbers);
        throw new Error('Invalid numbers detected in calledNumbers array');
      }
      
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

  subscribeToGames(callback: (games: GameData[]) => void): () => void {
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
}

// ================== EXPORT SINGLETON ==================

export const firebaseService = new FirebaseService();
export default firebaseService;
