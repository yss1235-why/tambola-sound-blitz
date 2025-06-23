// src/services/index.ts - FIXED: Export all Firebase services and utilities with consistent paths
export { 
  firebaseService, 
  database, 
  auth, 
  getCurrentUserRole,
  removeUndefinedValues 
} from './firebase';

export type { 
  AdminUser, 
  HostUser, 
  GameData, 
  TambolaTicket, 
  Prize, 
  GameState, 
  HostSettings,
  CreateGameConfig 
} from './firebase';
