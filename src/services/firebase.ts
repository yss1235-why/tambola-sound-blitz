// src/services/firebase.ts - COMPLETE: Main Firebase Service with Option A Support

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
  CreateGameConfig,
   NumberGenerationResult
} from './firebase-core';

// Re-export utility functions
export { removeUndefinedValues } from './firebase-core';

// ================== FIREBASE COORDINATOR SERVICE ==================

/**
 * Main Firebase Service - Coordinates between specialized services
 * This class delegates operations to the appropriate specialized service:
 * - Core operations (users, hosts, settings) → firebaseCore
 * - Game operations (games, tickets, prizes) → firebaseGame
 * 
 * ✅ ENHANCED: Now includes Option A methods for simplified HostControlsProvider
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

  // ========== HOST SETTINGS (delegate to core) ==========
  async saveHostSettings(hostId: string, settings: any) {
    return this.core.saveHostSettings(hostId, settings);
  }

  async getHostSettings(hostId: string) {
    return this.core.getHostSettings(hostId);
  }

  async updateHostTemplate(hostId: string, templateSettings: any) {
    return this.core.updateHostTemplate(hostId, templateSettings);
  }

  // ========== DIRECT DATABASE ACCESS ==========
  getGameRef(gameId: string) {
    return ref(database, `games/${gameId}`);
  }

  async updateRef(refPath: any, updates: any) {
    return update(refPath, updates);
  }

  // =======

  // ========== GAME OPERATIONS (delegate to game) ==========
  async createGame(config: any, hostId: string, ticketSetId: string, selectedPrizes: string[]) {
    return this.game.createGame(config, hostId, ticketSetId, selectedPrizes);
  }

  async deleteGame(gameId: string) {
    return this.game.deleteGame(gameId);
  }

  async getHostCurrentGame(hostId: string) {
    return this.game.getHostCurrentGame(hostId);
  }

  async getAllActiveGames() {
    return this.game.getAllActiveGames();
  }

  async updateLiveGameSettings(gameId: string, updates: any) {
    return this.game.updateLiveGameSettings(gameId, updates);
  }

  async updateGameAndTemplate(gameId: string, hostId: string, settings: any) {
    return this.game.updateGameAndTemplate(gameId, hostId, settings);
  }

  async expandGameTickets(gameId: string, newMaxTickets: number, ticketSetId: string) {
    return this.game.expandGameTickets(gameId, newMaxTickets, ticketSetId);
  }

  // ========== TICKET OPERATIONS (delegate to game) ==========
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
  
  // ========== NEW: RACE CONDITION FREE OPERATIONS ==========
  async callNextNumberAndContinue(gameId: string): Promise<boolean> {
    return this.game.callNextNumberAndContinue(gameId);
  }
  
  async startGameWithCountdown(gameId: string): Promise<void> {
    return this.game.startGameWithCountdown(gameId);
  }
  
  async updateCountdownTime(gameId: string, timeLeft: number): Promise<void> {
    return this.game.updateCountdownTime(gameId, timeLeft);
  }
  
  async activateGameAfterCountdown(gameId: string): Promise<void> {
    return this.game.activateGameAfterCountdown(gameId);
  }
  async endGame(gameId: string) {
    return this.game.endGame(gameId);
  }

  // ========== OPTION A: NEW METHODS FOR SIMPLIFIED HOSTCONTROLSPROVIDER ==========



  async callNextNumberAndContinue(gameId: string): Promise<boolean> {
  console.log(`🎯 FirebaseService: callNextNumberAndContinue called for ${gameId}`);
  
  // ✅ REMOVED: Security check no longer needed since auto-resume conflict is fixed
  return this.game.callNextNumberAndContinue(gameId);
}
  /**
   * 🎯 NEW: Start game with countdown setup
   * Sets up countdown state in database
   */
  async startGameWithCountdown(gameId: string): Promise<void> {
    return this.game.startGameWithCountdown(gameId);
  }
  async updateCountdownTime(gameId: string, timeLeft: number): Promise<void> {
  return this.game.updateCountdownTime(gameId, timeLeft);
}

  /**
   * 🎯 NEW: Activate game after countdown completes
   * Transitions from countdown to active state
   */
  async activateGameAfterCountdown(gameId: string): Promise<void> {
    return this.game.activateGameAfterCountdown(gameId);
  }
  
  /**
   * 🎯 NEW: Generate and validate game numbers for pre-generation
   */
  async generateGameNumbers(gameId: string): Promise<NumberGenerationResult> {
    return this.game.generateGameNumbers(gameId);
  }

  // ========== LEGACY NUMBER CALLING METHODS ==========

  /**
   * @deprecated Use callNextNumberAndContinue instead for Option A
   * Kept for backward compatibility
   */
 async callNextNumber(gameId: string) {
  console.log('🚫 BLOCKED: Legacy callNextNumber method called');
  console.log('🎯 Only HostControlsProvider should call numbers via callNextNumberAndContinue');
  throw new Error('Legacy method disabled. Use HostControlsProvider for number calling.');
}

  /**
   * @deprecated Use callNextNumberAndContinue instead
   */
 async processNumberCall(gameId: string, number: number) {
  console.log('🚫 BLOCKED: Legacy processNumberCall method called');
  console.log('🎯 Only HostControlsProvider should call numbers via callNextNumberAndContinue');
  throw new Error('Legacy method disabled. Use HostControlsProvider for number calling.');
}
  async announceWinners(gameId: string, winners: any) {
    return this.game.announceWinners(gameId, winners);
  }

  // ========== SUBSCRIPTION METHODS (delegate to core) ==========
  subscribeToGame(gameId: string, callback: (gameData: any) => void) {
    return this.core.subscribeToGame(gameId, callback);
  }

  subscribeToHostGames(hostId: string, callback: (games: any[]) => void) {
    return this.core.subscribeToHostGames(hostId, callback);
  }

  subscribeToAllActiveGames(callback: (games: any[]) => void) {
    return this.core.subscribeToAllActiveGames(callback);
  }
  subscribeToHosts(callback: (hosts: any[] | null) => void) {
    return this.core.subscribeToHosts(callback);
  }

 createPrizeConfiguration(selectedPrizes: string[]) {
  return this.game.createPrizeConfiguration(selectedPrizes);
}

  // ========== CONVENIENCE METHODS FOR BACKWARDS COMPATIBILITY ==========

  /**
   * Legacy method - kept for compatibility
   * @deprecated Use callNextNumberAndContinue for new implementations
   */
  async callNumberWithPrizeValidation(gameId: string, number: number) {
  console.log('🚫 BLOCKED: Legacy callNumberWithPrizeValidation method called');
  console.log('🎯 Only HostControlsProvider should call numbers via callNextNumberAndContinue');
  console.log(`📍 Attempted to call with gameId: ${gameId}, number: ${number}`);
  throw new Error('Legacy method disabled. Use HostControlsProvider for number calling.');
}
}

// ================== SINGLETON EXPORT ==================

export const firebaseService = new FirebaseService();

// ✅ Export standalone getCurrentUserRole function
export const getCurrentUserRole = async (): Promise<string | null> => {
  return firebaseService.getCurrentUserRole();
};
