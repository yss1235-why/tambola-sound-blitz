// src/services/firebase.ts - Firebase Service Coordinator: delegates to specialized services

import {
  initializeApp,
  getApps,
  getApp,
  type FirebaseApp
} from 'firebase/app';

import {
  getDatabase,
  type Database
} from 'firebase/database';

import {
  getAuth,
  type Auth
} from 'firebase/auth';

// ✅ FIXED: Import specialized services for delegation
import { firebaseCore } from './firebase-core';
import { firebaseGame } from './firebase-game';

// Re-export types for external consumption
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

// ================== FIREBASE CONFIGURATION ==================

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const database: Database = getDatabase(app);
export const auth: Auth = getAuth(app);

// Re-export utility functions
export { removeUndefinedValues, getCurrentUserRole } from './firebase-core';

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

  // ========== TICKET OPERATIONS (delegate to game) ==========
  async loadTicketsFromSet(ticketSetId: string, maxTickets: number) {
    return this.game.loadTicketsFromSet(ticketSetId, maxTickets);
  }

  async expandTickets(gameId: string, newMaxTickets: number, ticketSetId: string) {
  return this.game.expandGameTickets(gameId, newMaxTickets, ticketSetId);  // ✅ CORRECT
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
  async getGameData(gameId: string) {
    return this.game.getGameData(gameId);
  }

  async validateTicketsForPrizes(tickets: any, calledNumbers: number[], prizes: any) {
    return this.game.validateTicketsForPrizes(tickets, calledNumbers, prizes);
  }

  generatePrizes(selectedPrizes: string[]) {
    return this.game.generatePrizes(selectedPrizes);
  }
}

// ================== SINGLETON EXPORT ==================

export const firebaseService = new FirebaseService();
