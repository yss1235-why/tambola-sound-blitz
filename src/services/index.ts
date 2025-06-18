// src/services/index.ts - Export all Firebase services and utilities
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
