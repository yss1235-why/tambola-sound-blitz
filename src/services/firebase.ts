// src/services/firebase.ts - MAIN COORDINATOR FILE
// Re-export everything so existing components don't break

// Import from both split files
import { firebaseCore, database, auth } from './firebase-core';
import { firebaseGame } from './firebase-game';

// ✅ Re-export all types and utilities (no changes to existing imports)
export { database, auth } from './firebase-core';
export * from './firebase-core'; // Re-export all types

// ✅ Main service class that coordinates both
class FirebaseService {
  private core = firebaseCore;
  private game = firebaseGame;

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

  // ========== BASIC DATABASE (delegate to core) ==========
  async getGameData(gameId: string) {
    return this.core.getGameData(gameId);
  }

  async updateGameState(gameId: string, gameState: any) {
    return this.core.updateGameState(gameId, gameState);
  }

  async safeTransactionUpdate(path: string, updates: any, retries?: number) {
    return this.core.safeTransactionUpdate(path, updates, retries);
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
  async createGame(config: any, hostId: string, ticketSetId: string, selectedPrizes: string[]) {
    return this.game.createGame(config, hostId, ticketSetId, selectedPrizes);
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

  async updateHostTemplate(hostId: string, templateSettings: any) {
    return this.game.updateHostTemplate(hostId, templateSettings);
  }

  // ========== TICKET OPERATIONS (delegate to game) ==========
  async loadTicketsFromSet(ticketSetId: string, maxTickets: number) {
    return this.game.loadTicketsFromSet(ticketSetId, maxTickets);
  }

  async expandTickets(gameId: string, newMaxTickets: number, ticketSetId: string) {
    return this.game.expandTickets(gameId, newMaxTickets, ticketSetId);
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

  async updateTicket(gameId: string, ticketId: string, updates: any) {
    return this.game.updateTicket(gameId, ticketId, updates);
  }

  // ========== PRIZE OPERATIONS (delegate to game) ==========
  generatePrizes(selectedPrizes: string[]) {
    return this.game.generatePrizes(selectedPrizes);
  }

  async validateTicketsForPrizes(tickets: any, calledNumbers: number[], prizes: any) {
    return this.game.validateTicketsForPrizes(tickets, calledNumbers, prizes);
  }

  async processNumberCall(gameId: string, number: number) {
    return this.game.processNumberCall(gameId, number);
  }

  async callNumberWithPrizeValidation(gameId: string, number: number) {
    return this.game.callNumberWithPrizeValidation(gameId, number);
  }

  async callNextNumber(gameId: string) {
    return this.game.callNextNumber(gameId);
  }

  // ========== SUBSCRIPTIONS (delegate to core) ==========
  subscribeToGame(gameId: string, callback: any) {
    return this.core.subscribeToGame(gameId, callback);
  }

  subscribeToAllActiveGames(callback: any) {
    return this.core.subscribeToAllActiveGames(callback);
  }

  subscribeToGames(callback: any) {
    return this.core.subscribeToGames(callback);
  }

  subscribeToHosts(callback: any) {
    return this.core.subscribeToHosts(callback);
  }
}

// ✅ Export singleton exactly as before
export const firebaseService = new FirebaseService();

// ✅ Export standalone functions exactly as before
export const getCurrentUserRole = async (): Promise<string | null> => {
  return firebaseService.getCurrentUserRole();
};

// ✅ Re-export removeUndefinedValues utility
export { removeUndefinedValues } from './firebase-core';

export default firebaseService;
