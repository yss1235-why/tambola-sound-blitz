// src/hooks/useFirebaseSubscription.ts - FIXED: Proper async handling for host subscriptions
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

// ✅ FIXED: Host's current game subscription with proper async handling
export function useHostCurrentGameSubscription(hostId: string | null) {
  return useFirebaseSubscription(
    `host-current-${hostId}`,
    useCallback((callback) => {
      if (!hostId) {
        console.log('🔐 No hostId provided, resolving with null');
        // Immediately call callback to resolve loading state
        setTimeout(() => callback(null), 0);
        return () => {};
      }
      
      console.log(`🔍 Setting up host current game subscription for: ${hostId}`);
      
      // State management for subscription
      let currentGameId: string | null = null;
      let gameUnsubscribe: (() => void) | null = null;
      let isActive = true;
      let hasCalledInitialCallback = false;
      
      // ✅ FIXED: Proper async handling with immediate callback resolution
      const setupGameSubscription = async () => {
        try {
          console.log(`🎮 Fetching current game for host: ${hostId}`);
          const hostGame = await firebaseService.getHostCurrentGame(hostId);
          
          // Component might have unmounted during async operation
          if (!isActive) {
            console.log(`⚠️ Component unmounted during fetch for host: ${hostId}`);
            return;
          }
          
          if (hostGame && hostGame.gameId) {
            console.log(`✅ Found active game: ${hostGame.gameId} for host: ${hostId}`);
            
            // Cleanup old subscription if exists
            if (gameUnsubscribe) {
              gameUnsubscribe();
            }
            
            currentGameId = hostGame.gameId;
            
            // Subscribe to the active game
            gameUnsubscribe = firebaseService.subscribeToGame(hostGame.gameId, (gameData) => {
              if (isActive) {
                console.log(`📡 Game data updated for ${hostGame.gameId}`);
                callback(gameData);
                hasCalledInitialCallback = true;
              }
            });
          } else {
            console.log(`ℹ️ No active game found for host: ${hostId}`);
            
            // ✅ CRITICAL FIX: Ensure callback is called when no game exists
            if (isActive && !hasCalledInitialCallback) {
              console.log(`📞 Calling callback with null for host: ${hostId}`);
              callback(null);
              hasCalledInitialCallback = true;
            }
          }
        } catch (error: any) {
          console.error(`❌ Error fetching host game for ${hostId}:`, error);
          
          // ✅ CRITICAL FIX: Always call callback even on error
          if (isActive && !hasCalledInitialCallback) {
            console.log(`📞 Calling callback with null due to error for host: ${hostId}`);
            callback(null);
            hasCalledInitialCallback = true;
          }
        }
      };
      
      // ✅ FIXED: Add immediate callback for faster UI response
      // This prevents the loading state from hanging if async operation takes too long
      const initialCallbackTimer = setTimeout(() => {
        if (isActive && !hasCalledInitialCallback) {
          console.log(`⏰ Initial callback timeout for host: ${hostId}, resolving with null`);
          callback(null);
          hasCalledInitialCallback = true;
        }
      }, 100); // Very short timeout just to ensure callback is called
      
      // Start the async setup
      setupGameSubscription();
      
      // Return cleanup function
      return () => {
        console.log(`🧹 Cleaning up host subscription for: ${hostId}`);
        isActive = false;
        
        // Clear timeout
        if (initialCallbackTimer) {
          clearTimeout(initialCallbackTimer);
        }
        
        // Cleanup game subscription
        if (gameUnsubscribe) {
          gameUnsubscribe();
          gameUnsubscribe = null;
        }
      };
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
