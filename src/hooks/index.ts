// src/hooks/index.ts - Updated exports for new architecture with lazy auth
export { 
  useFirebaseSubscription,
  useGameSubscription,
  useActiveGamesSubscription,
  useHostCurrentGameSubscription,
  cleanupAllSubscriptions
} from './useFirebaseSubscription';

export { useLazyAuth } from './useLazyAuth';
export { useToast } from './use-toast';
export { useIsMobile } from './use-mobile';
