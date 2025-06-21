// src/hooks/useFirebaseSubscription.ts - COMPLETE FILE with Host Winner Display Fix
import { useState, useEffect, useRef, useCallback } from 'react';
import { firebaseService } from '@/services/firebase';

interface SubscriptionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface SubscriptionOptions {
  enabled?: boolean;
  onError?: (error: string) => void;
}

// Global subscription registry to prevent duplicates
const activeSubscriptions = new Map<string, {
  unsubscribe: () => void;
  callbacks: Set<(data: any) => void>;
}>();

/**
 * Smart Firebase subscription hook with automatic deduplication
 * Prevents infinite loops and manages cleanup automatically
 */
export function useFirebaseSubscription<T>(
  subscriptionKey: string,
  subscriptionFn: (callback: (data: T | null) => void) => () => void,
  options: SubscriptionOptions = {}
): SubscriptionState<T> {
  const { enabled = true, onError } = options;
  
  const [state, setState] = useState<SubscriptionState<T>>({
    data: null,
    loading: enabled,
    error: null
  });

  const callbackRef = useRef<(data: T | null) => void>();
  const isMountedRef = useRef(true);

  // Create stable callback that updates state
  const stableCallback = useCallback((data: T | null) => {
    if (!isMountedRef.current) return;
    
    setState(prev => ({
      ...prev,
      data,
      loading: false,
      error: null
    }));
  }, []);

  // Store current callback
  callbackRef.current = stableCallback;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Check if subscription already exists
      const existing = activeSubscriptions.get(subscriptionKey);
      
      if (existing) {
        // Add our callback to existing subscription
        existing.callbacks.add(stableCallback);
        console.log(`🔄 Reusing subscription: ${subscriptionKey}`);
      } else {
        // Create new subscription
        console.log(`🆕 Creating subscription: ${subscriptionKey}`);
        
        const callbacks = new Set<(data: any) => void>();
        callbacks.add(stableCallback);

        // Create master callback that notifies all subscribers
        const masterCallback = (data: T | null) => {
          callbacks.forEach(callback => {
            try {
              callback(data);
            } catch (error) {
              console.error('Callback error:', error);
            }
          });
        };

        const unsubscribe = subscriptionFn(masterCallback);
        
        activeSubscriptions.set(subscriptionKey, {
          unsubscribe,
          callbacks
        });
      }

      // Cleanup function
      return () => {
        const existing = activeSubscriptions.get(subscriptionKey);
        if (existing && callbackRef.current) {
          existing.callbacks.delete(callbackRef.current);
          
          // If no more callbacks, cleanup subscription
          if (existing.callbacks.size === 0) {
            console.log(`🧹 Cleaning up subscription: ${subscriptionKey}`);
            existing.unsubscribe();
            activeSubscriptions.delete(subscriptionKey);
          }
        }
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Subscription failed';
      console.error(`❌ Subscription error (${subscriptionKey}):`, errorMessage);
      
      setState({
        data: null,
        loading: false,
        error: errorMessage
      });
      
      if (onError) {
        onError(errorMessage);
      }
    }
  }, [subscriptionKey, enabled, subscriptionFn, stableCallback, onError]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return state;
}

/**
 * Specialized hooks for common subscription patterns
 */

// Single game subscription
export function useGameSubscription(gameId: string | null) {
  return useFirebaseSubscription(
    `game-${gameId}`,
    useCallback((callback) => {
      if (!gameId) {
        callback(null);
        return () => {};
      }
      return firebaseService.subscribeToGame(gameId, callback);
    }, [gameId]),
    { enabled: !!gameId }
  );
}

// All active games subscription  
export function useActiveGamesSubscription() {
  return useFirebaseSubscription(
    'active-games',
    useCallback((callback) => {
      return firebaseService.subscribeToAllActiveGames(callback);
    }, [])
  );
}

// ✅ FIXED: Host subscription with winner display support
export function useHostCurrentGameSubscription(hostId: string | null) {
  return useFirebaseSubscription(
    `host-all-games-${hostId}`,
    useCallback((callback) => {
      if (!hostId) {
        console.log('🔐 No hostId provided, resolving with null');
        setTimeout(() => callback(null), 0);
        return () => {};
      }
      
      console.log(`🔍 Setting up ALL GAMES subscription for host: ${hostId}`);
      
      // ✅ NEW APPROACH: Subscribe to ALL games and filter for host's active/completed games
      const unsubscribe = firebaseService.subscribeToAllActiveGames((allGames) => {
        try {
          console.log(`📡 Received ${allGames.length} total active games`);
          
          // Filter games for this specific host
          const hostGames = allGames.filter(game => game.hostId === hostId);
          console.log(`🎮 Found ${hostGames.length} games for host: ${hostId}`);
          
          if (hostGames.length === 0) {
            console.log(`ℹ️ No games found for host: ${hostId}`);
            callback(null);
            return;
          }
          
          // ✅ PRIORITY 1: Active game (not finished)
          const activeGames = hostGames.filter(game => 
            !game.gameState.gameOver && 
            game.gameState // Additional safety check
          );
          
          if (activeGames.length > 0) {
            // Sort by creation date and get the most recent active game
            const currentGame = activeGames
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            
            console.log(`✅ Selected active game: ${currentGame.gameId} for host: ${hostId}`);
            console.log(`📊 Game state: isActive=${currentGame.gameState.isActive}, gameOver=${currentGame.gameState.gameOver}, calledNumbers=${currentGame.gameState.calledNumbers?.length || 0}`);
            
            callback(currentGame);
            return;
          }
          
          // ✅ PRIORITY 2: Most recent completed game (NEW LOGIC FOR HOST WINNER DISPLAY)
          console.log(`🏁 No active games found. Checking for recent completed games for host: ${hostId}...`);
          const completedGames = hostGames
            .filter(game => {
              // ✅ SAFETY: Ensure game is properly completed
              return game.gameState && 
                     game.gameState.gameOver && 
                     game.createdAt; // Must have creation timestamp
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          if (completedGames.length > 0) {
            const recentCompleted = completedGames[0];
            console.log(`🏆 Selected recent completed game: ${recentCompleted.gameId} for host: ${hostId}`);
            console.log(`📊 Completed game state: gameOver=${recentCompleted.gameState.gameOver}, winners=${Object.values(recentCompleted.prizes).filter(p => p.won).length}`);
            
            callback(recentCompleted);
            return;
          }
          
          // ✅ PRIORITY 3: No games at all
          console.log(`ℹ️ No games (active or completed) found for host: ${hostId}`);
          callback(null);
          
        } catch (error) {
          console.error(`❌ Error processing host games for ${hostId}:`, error);
          callback(null);
        }
      });
      
      return unsubscribe;
    }, [hostId]),
    { enabled: !!hostId }
  );
}

/**
 * Utility function to cleanup all subscriptions (useful for app shutdown)
 */
export function cleanupAllSubscriptions() {
  console.log('🧹 Cleaning up all Firebase subscriptions');
  
  activeSubscriptions.forEach((subscription, key) => {
    try {
      subscription.unsubscribe();
      console.log(`✅ Cleaned up: ${key}`);
    } catch (error) {
      console.error(`❌ Cleanup error for ${key}:`, error);
    }
  });
  
  activeSubscriptions.clear();
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupAllSubscriptions);
}
