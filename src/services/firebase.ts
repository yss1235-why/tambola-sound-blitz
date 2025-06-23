// src/services/firebase.ts - Firebase Service Coordinator: delegates to specialized services

// ✅ Import from firebase-core (both types and instance)
import { database, auth, firebaseCore } from './firebase-core';
import { firebaseGame } from './firebase-game';

// Re-export types and database/auth for external consumption
export { database, auth } from './firebase-core';
export type {
  AdminUser,
  HostUser,
  GameData,
  TambolaTicket,
  Prize,
  GameState,
  HostSettings,
  CreateGameConfig
} from './firebase-core';

// Re-export utility functions
export { removeUndefinedValues } from './firebase-core';

// ================== FIREBASE COORDINATOR SERVICE ==================

/**
 * Main Firebase Service - Coordinates between specialized services
 * This class delegates operations to the appropriate specialized service:
 * - Core operations (users, hosts, settings) → firebaseCore
 * - Game operations (games, tickets, prizes) → firebaseGame
 */
class FirebaseService {
  private core = firebaseCore;
  private game = firebaseGame;

  // ========== CORE OPERATIONS (delegate to core) ==========
  async safeTransactionUpdate(path: string, updates: any, retries: number = 3) {
    return this.core.safeTransactionUpdate(path, updates, retries);
  }

  // ========== AUTHENTICATION (delegate to core) ==========
  async loginAdmin(email: string, password: string) {
    return this.core.loginAdmin(email, password);
  }

  async loginHost(email: string, password: string) {
    return this.core.loginHost(email, password);
  }

  async logout() {
    return this.core.logout();
  }

  async getUserData() {
    return this.core.getUserData();
  }

  async getCurrentUserRole() {
    return this.core.getCurrentUserRole();
  }

  // ========== GAME DATA (delegate to core) ==========
  async getGameData(gameId: string) {
    return this.core.getGameData(gameId);
  }

  async updateGameState(gameId: string, gameState: any) {
    return this.core.updateGameState(gameId, gameState);
  }

  // ========== HOST MANAGEMENT (delegate to core) ==========
  async createHost(email: string, password: string, name: string, phone: string, adminId: string, subscriptionMonths: number) {
    return this.core.createHost(email, password, name, phone, adminId, subscriptionMonths);
  }

  async getAllHosts() {
    return this.core.getAllHosts();
  }

  async updateHost(hostId: string, updates: any) {
    return this.core.updateHost(hostId, updates);
  }

  async deleteHost(hostId: string) {
    return this.core.deleteHost(hostId);
  }

  async getHostById(hostId: string) {
    return this.core.getHostById(hostId);
  }

  async extendHostSubscription(hostId: string, additionalMonths: number) {
    return this.core.extendHostSubscription(hostId, additionalMonths);
  }

  async toggleHostStatus(hostId: string, isActive: boolean) {
    return this.core.toggleHostStatus(hostId, isActive);
  }

  async changeHostPassword(hostId: string, newPassword: string) {
    return this.core.changeHostPassword(hostId, newPassword);
  }

  // ========== HOST SETTINGS (delegate to core) ==========
  async saveHostSettings(hostId: string, settings: any) {
    return this.core.saveHostSettings(hostId, settings);
  }

  async getHostSettings(hostId: string) {
    return this.core.getHostSettings(hostId);
  }

  async updateHostTemplate(hostId: string, template: any) {
    return this.core.updateHostTemplate(hostId, template);
  }

  // ========== GAME OPERATIONS (delegate to game) ==========
  // ✅ FIXED: createGame method with proper validation and config formatting
  async createGame(config: any, hostId: string, ticketSetId: string, selectedPrizes: string[]) {
    // ✅ VALIDATION: Ensure hostId is available
    if (!hostId) {
      // ✅ FALLBACK: Try to get hostId from current Firebase Auth user
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) {
        throw new Error('Host ID is required. Please ensure you are logged in.');
      }
      hostId = currentUser.uid;
      console.log('🔧 Using Firebase Auth UID as fallback hostId:', hostId);
    }

    // ✅ FORMAT: Create properly structured config object
    const gameConfig = {
      name: config.name,
      maxTickets: config.maxTickets,
      ticketPrice: config.ticketPrice || 0,
      hostPhone: config.hostPhone,
      // ✅ ADD missing required fields
      hostId: hostId,
      selectedTicketSet: ticketSetId,
      selectedPrizes: selectedPrizes
    };

    console.log('🎮 Creating game with config:', gameConfig);
    
    // ✅ PASS single config object (not separate parameters)
    return this.game.createGame(gameConfig);
  }

  async updateGameData(gameId: string, updates: any) {
    return this.game.updateGameData(gameId, updates);
  }

  async deleteGame(gameId: string) {
    return this.game.deleteGame(gameId);
  }

  async updateLiveGameSettings(gameId: string, updates: any) {
    return this.game.updateLiveGameSettings(gameId, updates);
  }

  async updateGameAndHostSettings(gameId: string, gameUpdates: any, hostId: string, hostUpdates: any) {
    return this.game.updateGameAndHostSettings(gameId, gameUpdates, hostId, hostUpdates);
  }

  async getHostCurrentGame(hostId: string) {
    return this.game.getHostCurrentGame(hostId);
  }

  async getAllActiveGames() {
    return this.game.getAllActiveGames();
  }

  async updateGameAndTemplate(gameId: string, hostId: string, settings: any) {
    return this.game.updateGameAndTemplate(gameId, hostId, settings);
  }

  // ========== TICKET OPERATIONS (delegate to game) ==========
  async loadTicketsFromSet(ticketSetId: string, maxTickets: number) {
    return this.game.loadTicketsFromSet(ticketSetId, maxTickets);
  }

  async expandTickets(gameId: string, newMaxTickets: number, ticketSetId: string) {
    return this.game.expandGameTickets(gameId, newMaxTickets, ticketSetId);
  }

  async expandGameTickets(gameId: string, newMaxTickets: number, ticketSetId: string) {
    return this.game.expandGameTickets(gameId, newMaxTickets, ticketSetId);
  }

  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string) {
    return this.game.bookTicket(ticketId, playerName, playerPhone, gameId);
  }

  async unbookTicket(gameId: string, ticketId: string) {
    return this.game.unbookTicket(gameId, ticketId);
  }

  // ========== GAME STATE OPERATIONS (delegate to game) ==========
  async startGame(gameId: string) {
    return this.game.startGame(gameId);
  }

  async pauseGame(gameId: string) {
    return this.game.pauseGame(gameId);
  }

  async resumeGame(gameId: string) {
    return this.game.resumeGame(gameId);
  }

  async endGame(gameId: string) {
    return this.game.endGame(gameId);
  }

  async callNextNumber(gameId: string) {
    return this.game.callNextNumber(gameId);
  }

  async processNumberCall(gameId: string, number: number) {
    return this.game.processNumberCall(gameId, number);
  }

  async announceWinners(gameId: string, winners: any) {
    return this.game.announceWinners(gameId, winners);
  }

  // ========== SUBSCRIPTION METHODS (delegate to appropriate service) ==========
  subscribeToGame(gameId: string, callback: (gameData: any) => void) {
    return this.core.subscribeToGame(gameId, callback);
  }

  subscribeToHostGames(hostId: string, callback: (games: any[]) => void) {
    return this.core.subscribeToHostGames(hostId, callback);
  }

  subscribeToAllActiveGames(callback: (games: any[]) => void) {
    return this.core.subscribeToAllActiveGames(callback);
  }

  // ========== UTILITY METHODS (delegate to game) ==========
  async validateTicketsForPrizes(tickets: any, calledNumbers: number[], prizes: any) {
    return this.game.validateTicketsForPrizes(tickets, calledNumbers, prizes);
  }

  generatePrizes(selectedPrizes: string[]) {
    return this.game.generatePrizes(selectedPrizes);
  }
}

// ================== SINGLETON EXPORT ==================

export const firebaseService = new FirebaseService();

// ✅ Export standalone getCurrentUserRole function
export const getCurrentUserRole = async (): Promise<string | null> => {
  return firebaseService.getCurrentUserRole();
};

export default firebaseService;
