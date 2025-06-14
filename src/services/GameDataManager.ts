// src/services/GameDataManager.ts - Centralized Firebase Subscription Management
import { firebaseService, GameData, TambolaTicket } from './firebase';

type GameUpdateCallback = (game: GameData | null) => void;
type TicketsUpdateCallback = (tickets: { [key: string]: TambolaTicket } | null) => void;
type GamesListUpdateCallback = (games: GameData[]) => void;

interface Subscription {
  id: string;
  callback: Function;
  type: 'game' | 'tickets' | 'gamesList';
  gameId?: string;
}

class GameDataManager {
  private subscriptions: Map<string, Subscription> = new Map();
  private activeFirebaseSubscriptions: Map<string, () => void> = new Map();
  private gameCache: Map<string, GameData> = new Map();
  private ticketsCache: Map<string, { [key: string]: TambolaTicket }> = new Map();
  private gamesListCache: GameData[] = [];
  
  // Subscription counters for cleanup
  private gameSubscriptionCount: Map<string, number> = new Map();
  private ticketsSubscriptionCount: Map<string, number> = new Map();
  private gamesListSubscriptionCount: number = 0;

  /**
   * Subscribe to a specific game's updates
   */
  subscribeToGame(gameId: string, callback: GameUpdateCallback): () => void {
    const subscriptionId = `game-${gameId}-${Date.now()}-${Math.random()}`;
    
    // Store subscription
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      callback,
      type: 'game',
      gameId
    });

    // Increment counter
    const count = this.gameSubscriptionCount.get(gameId) || 0;
    this.gameSubscriptionCount.set(gameId, count + 1);

    // Setup Firebase subscription if first subscriber
    if (count === 0) {
      this.setupGameSubscription(gameId);
    }

    // Return cached data immediately if available
    const cachedGame = this.gameCache.get(gameId);
    if (cachedGame) {
      setTimeout(() => callback(cachedGame), 0);
    }

    // Return unsubscribe function
    return () => this.unsubscribeFromGame(subscriptionId, gameId);
  }

  /**
   * Subscribe to a game's tickets
   */
  subscribeToTickets(gameId: string, callback: TicketsUpdateCallback): () => void {
    const subscriptionId = `tickets-${gameId}-${Date.now()}-${Math.random()}`;
    
    // Store subscription
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      callback,
      type: 'tickets',
      gameId
    });

    // Increment counter
    const count = this.ticketsSubscriptionCount.get(gameId) || 0;
    this.ticketsSubscriptionCount.set(gameId, count + 1);

    // Setup Firebase subscription if first subscriber
    if (count === 0) {
      this.setupTicketsSubscription(gameId);
    }

    // Return cached data immediately if available
    const cachedTickets = this.ticketsCache.get(gameId);
    if (cachedTickets) {
      setTimeout(() => callback(cachedTickets), 0);
    }

    // Return unsubscribe function
    return () => this.unsubscribeFromTickets(subscriptionId, gameId);
  }

  /**
   * Subscribe to active games list
   */
  subscribeToGamesList(callback: GamesListUpdateCallback): () => void {
    const subscriptionId = `gamesList-${Date.now()}-${Math.random()}`;
    
    // Store subscription
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      callback,
      type: 'gamesList'
    });

    // Increment counter
    this.gamesListSubscriptionCount++;

    // Setup Firebase subscription if first subscriber
    if (this.gamesListSubscriptionCount === 1) {
      this.setupGamesListSubscription();
    }

    // Return cached data immediately if available
    if (this.gamesListCache.length > 0) {
      setTimeout(() => callback([...this.gamesListCache]), 0);
    }

    // Return unsubscribe function
    return () => this.unsubscribeFromGamesList(subscriptionId);
  }

  /**
   * Get cached game data synchronously
   */
  getCachedGame(gameId: string): GameData | null {
    return this.gameCache.get(gameId) || null;
  }

  /**
   * Get cached tickets data synchronously
   */
  getCachedTickets(gameId: string): { [key: string]: TambolaTicket } | null {
    return this.ticketsCache.get(gameId) || null;
  }

  /**
   * Get cached games list synchronously
   */
  getCachedGamesList(): GameData[] {
    return [...this.gamesListCache];
  }

  /**
   * Force refresh a specific game
   */
  async refreshGame(gameId: string): Promise<GameData | null> {
    try {
      // This will trigger the subscription callback
      return await firebaseService.subscribeToGame(gameId, () => {});
    } catch (error) {
      console.error('Failed to refresh game:', error);
      return null;
    }
  }

  /**
   * Clear all caches and subscriptions (for cleanup)
   */
  cleanup(): void {
    // Cancel all Firebase subscriptions
    this.activeFirebaseSubscriptions.forEach(unsubscribe => unsubscribe());
    
    // Clear all data
    this.subscriptions.clear();
    this.activeFirebaseSubscriptions.clear();
    this.gameCache.clear();
    this.ticketsCache.clear();
    this.gamesListCache = [];
    this.gameSubscriptionCount.clear();
    this.ticketsSubscriptionCount.clear();
    this.gamesListSubscriptionCount = 0;
  }

  // Private methods

  private setupGameSubscription(gameId: string): void {
    const unsubscribe = firebaseService.subscribeToGame(gameId, (updatedGame) => {
      if (updatedGame) {
        // Update cache
        this.gameCache.set(gameId, updatedGame);
        
        // Notify all subscribers
        this.subscriptions.forEach(sub => {
          if (sub.type === 'game' && sub.gameId === gameId) {
            (sub.callback as GameUpdateCallback)(updatedGame);
          }
        });
      } else {
        // Game was deleted
        this.gameCache.delete(gameId);
        
        // Notify subscribers
        this.subscriptions.forEach(sub => {
          if (sub.type === 'game' && sub.gameId === gameId) {
            (sub.callback as GameUpdateCallback)(null);
          }
        });
      }
    });

    this.activeFirebaseSubscriptions.set(`game-${gameId}`, unsubscribe);
  }

  private setupTicketsSubscription(gameId: string): void {
    const unsubscribe = firebaseService.subscribeToTickets(gameId, (updatedTickets) => {
      if (updatedTickets) {
        // Update cache
        this.ticketsCache.set(gameId, updatedTickets);
        
        // Notify all subscribers
        this.subscriptions.forEach(sub => {
          if (sub.type === 'tickets' && sub.gameId === gameId) {
            (sub.callback as TicketsUpdateCallback)(updatedTickets);
          }
        });
      } else {
        // Tickets were cleared
        this.ticketsCache.delete(gameId);
        
        // Notify subscribers
        this.subscriptions.forEach(sub => {
          if (sub.type === 'tickets' && sub.gameId === gameId) {
            (sub.callback as TicketsUpdateCallback)(null);
          }
        });
      }
    });

    this.activeFirebaseSubscriptions.set(`tickets-${gameId}`, unsubscribe);
  }

  private setupGamesListSubscription(): void {
    const unsubscribe = firebaseService.subscribeToAllActiveGames((updatedGames) => {
      // Update cache
      this.gamesListCache = [...updatedGames];
      
      // Update individual game caches
      updatedGames.forEach(game => {
        this.gameCache.set(game.gameId, game);
      });
      
      // Notify all subscribers
      this.subscriptions.forEach(sub => {
        if (sub.type === 'gamesList') {
          (sub.callback as GamesListUpdateCallback)([...updatedGames]);
        }
      });
    });

    this.activeFirebaseSubscriptions.set('gamesList', unsubscribe);
  }

  private unsubscribeFromGame(subscriptionId: string, gameId: string): void {
    // Remove subscription
    this.subscriptions.delete(subscriptionId);
    
    // Decrement counter
    const count = this.gameSubscriptionCount.get(gameId) || 0;
    const newCount = Math.max(0, count - 1);
    this.gameSubscriptionCount.set(gameId, newCount);
    
    // If no more subscribers, cleanup Firebase subscription
    if (newCount === 0) {
      const firebaseUnsubscribe = this.activeFirebaseSubscriptions.get(`game-${gameId}`);
      if (firebaseUnsubscribe) {
        firebaseUnsubscribe();
        this.activeFirebaseSubscriptions.delete(`game-${gameId}`);
      }
      
      // Remove from cache after a delay (in case someone re-subscribes quickly)
      setTimeout(() => {
        if ((this.gameSubscriptionCount.get(gameId) || 0) === 0) {
          this.gameCache.delete(gameId);
        }
      }, 5000);
    }
  }

  private unsubscribeFromTickets(subscriptionId: string, gameId: string): void {
    // Remove subscription
    this.subscriptions.delete(subscriptionId);
    
    // Decrement counter
    const count = this.ticketsSubscriptionCount.get(gameId) || 0;
    const newCount = Math.max(0, count - 1);
    this.ticketsSubscriptionCount.set(gameId, newCount);
    
    // If no more subscribers, cleanup Firebase subscription
    if (newCount === 0) {
      const firebaseUnsubscribe = this.activeFirebaseSubscriptions.get(`tickets-${gameId}`);
      if (firebaseUnsubscribe) {
        firebaseUnsubscribe();
        this.activeFirebaseSubscriptions.delete(`tickets-${gameId}`);
      }
      
      // Remove from cache after a delay
      setTimeout(() => {
        if ((this.ticketsSubscriptionCount.get(gameId) || 0) === 0) {
          this.ticketsCache.delete(gameId);
        }
      }, 5000);
    }
  }

  private unsubscribeFromGamesList(subscriptionId: string): void {
    // Remove subscription
    this.subscriptions.delete(subscriptionId);
    
    // Decrement counter
    this.gamesListSubscriptionCount = Math.max(0, this.gamesListSubscriptionCount - 1);
    
    // If no more subscribers, cleanup Firebase subscription
    if (this.gamesListSubscriptionCount === 0) {
      const firebaseUnsubscribe = this.activeFirebaseSubscriptions.get('gamesList');
      if (firebaseUnsubscribe) {
        firebaseUnsubscribe();
        this.activeFirebaseSubscriptions.delete('gamesList');
      }
      
      // Clear cache after a delay
      setTimeout(() => {
        if (this.gamesListSubscriptionCount === 0) {
          this.gamesListCache = [];
        }
      }, 5000);
    }
  }
}

// Export singleton instance
export const gameDataManager = new GameDataManager();
export default gameDataManager;
