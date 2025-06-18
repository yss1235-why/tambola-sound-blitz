// src/hooks/index.ts - Updated exports for new architecture
export { 
  useFirebaseSubscription,
  useGameSubscription,
  useActiveGamesSubscription,
  useHostCurrentGameSubscription,
  cleanupAllSubscriptions
} from './useFirebaseSubscription';

export { useToast } from './use-toast';
export { useIsMobile } from './use-mobile';
