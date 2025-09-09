// src/hooks/useAuth.ts - SIMPLIFIED: Replaces useLazyAuth.ts completely
import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, update, get, query, orderByChild, equalTo } from 'firebase/database';
import { auth, getCurrentUserRole, firebaseService, AdminUser, HostUser, database } from '@/services/firebase';
import { cleanupAllSubscriptions } from './useFirebaseSubscription';
interface AuthState {
  user: AdminUser | HostUser | null;
  userRole: 'admin' | 'host' | null;
  loading: boolean;
  error: string | null;
  initialized: boolean; // Keep for compatibility with existing components
}

interface AuthActions {
  loginAdmin: (email: string, password: string) => Promise<void>;
  loginHost: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  initializeAuth: () => Promise<() => void>; // Keep for compatibility - but no-op
}

/**
 * SIMPLIFIED Authentication Hook
 * 
 * Key Changes from useLazyAuth:
 * 1. Auth is ALWAYS initialized on app start (no lazy loading)
 * 2. No race conditions between initialization and login
 * 3. Simple, predictable state management
 * 4. Same interface as useLazyAuth for compatibility
 * 
 * FIXES:
 * - No more auto-login issues
 * - No more loading state hangs
 * - No more unexpected logouts
 * - Reliable, predictable authentication flow
 * - ✅ ADDED: Subscription cleanup before logout to prevent permission errors
 */
export const useAuth = (): AuthState & AuthActions => {
  const [state, setState] = useState<AuthState>({
    user: null,
    userRole: null,
    loading: true, // Start loading immediately
    error: null,
    initialized: false // Will be set to true after first auth check
  });

  // ✅ SIMPLIFIED: Auth is always initialized - no complex lazy loading
  useEffect(() => {
    console.log('🔐 Initializing simplified auth system...');
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          console.log('🔐 User session detected:', firebaseUser.email);
          
          const role = await getCurrentUserRole();
          
          if (role) {
            const userData = await firebaseService.getUserData();
            
            if (userData) {
              setState({
                user: userData,
                userRole: role,
                loading: false,
                initialized: true,
                error: null
              });
              console.log('✅ Simplified Auth: User profile loaded successfully');
            } else {
              console.log('❌ Simplified Auth: Failed to load user profile');
              setState({
                user: null,
                userRole: null,
                loading: false,
                initialized: true,
                error: 'Failed to load user profile'
              });
            }
          } else {
            console.log('❌ Simplified Auth: Invalid user role');
            setState({
              user: null,
              userRole: null,
              loading: false,
              initialized: true,
              error: 'Invalid user role'
            });
          }
        } catch (error: any) {
          console.error('❌ Simplified Auth: Error loading user data:', error);
          setState({
            user: null,
            userRole: null,
            loading: false,
            initialized: true,
            error: error.message || 'Authentication error'
          });
        }
      } else {
        console.log('🔐 No user session found (user logged out or first visit)');
        setState({
          user: null,
          userRole: null,
          loading: false,
          initialized: true,
          error: null
        });
      }
    });

    // Set a timeout to ensure we don't hang in loading state
    const loadingTimeout = setTimeout(() => {
      setState(prev => {
        if (prev.loading && !prev.initialized) {
          console.warn('⚠️ Auth loading timeout reached, resolving...');
          return {
            ...prev,
            loading: false,
            initialized: true
          };
        }
        return prev;
      });
    }, 5000); // 5 second timeout

    return () => {
      console.log('🧹 Cleaning up simplified auth listener');
      clearTimeout(loadingTimeout);
      unsubscribe();
    };
  }, []); // ✅ SIMPLIFIED: No dependencies, runs once

  // ✅ SIMPLIFIED: Direct admin login - no initialization needed
  const loginAdmin = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      console.log('🔐 Admin login attempt:', email);
      await firebaseService.loginAdmin(email, password);
      console.log('✅ Admin login successful - auth state will update automatically');
      // State will be updated by onAuthStateChanged listener
    } catch (error: any) {
      console.error('❌ Admin login failed:', error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Admin login failed'
      }));
      throw error;
    }
  }, []);

  const loginHost = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      console.log('🔐 Host login attempt:', email);
      await firebaseService.loginHost(email, password);
      
      // Register session after successful login
      await registerHostSession();
      
      console.log('✅ Host login successful - auth state will update automatically');
      // State will be updated by onAuthStateChanged listener
    } catch (error: any) {
      console.error('❌ Host login failed:', error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Host login failed'
      }));
      throw error;
    }
  }, []);

 // Add session registration function
  const registerHostSession = useCallback(async () => {
    if (!auth.currentUser) return;
    
    try {
      const sessionId = generateSessionId();
      
      // Get fresh user data for name
      const userData = await firebaseService.getUserData();
      
      const sessionData = {
        hostId: auth.currentUser.uid,
        lastActivity: new Date().toISOString(),
        hostName: userData?.name || 'Unknown Host',
        deviceInfo: navigator.userAgent.slice(0, 50),
        lastHeartbeat: new Date().toISOString()
      };
      
      // Store session ID locally
      sessionStorage.setItem('hostSessionId', sessionId);
      
      // Get all host's games using Firebase query
      const gamesQuery = query(
        ref(database, 'games'),
        orderByChild('hostId'),
        equalTo(auth.currentUser.uid)
      );
      
      const gamesSnapshot = await get(gamesQuery);
      
      if (gamesSnapshot.exists()) {
        const hostGames = Object.values(gamesSnapshot.val());
        
        for (const game of hostGames as any[]) {
          // Add this session to the game
          await update(
            ref(database, `games/${game.gameId}/activeSessions/${sessionId}`),
            sessionData
          );
          
          // Set as primary if no primary exists
          const currentGame = await get(ref(database, `games/${game.gameId}`));
          if (!currentGame.val()?.primarySession) {
            await update(ref(database, `games/${game.gameId}`), {
              primarySession: sessionId
            });
          }
        }
        
        console.log(`✅ Session registered for ${hostGames.length} games`);
      }
    } catch (error) {
      console.error('❌ Failed to register session:', error);
      // Don't throw - session registration is not critical for login
    }
  }, []);

  const generateSessionId = () => {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  };

  // ✅ FIXED: Logout with subscription cleanup to prevent permission errors
  const logout = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      console.log('🔐 Logout initiated...');
      
      // ✅ ADDED: Cleanup all subscriptions BEFORE logout to prevent permission errors
      console.log('🧹 Cleaning up all subscriptions before logout...');
      cleanupAllSubscriptions();
      
      await firebaseService.logout();
      console.log('✅ Logout successful - auth state will update automatically');
      // State will be updated by onAuthStateChanged listener
    } catch (error: any) {
      console.error('❌ Logout error:', error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Logout failed'
      }));
      throw error;
    }
  }, []);

  const clearError = useCallback(() => {
    console.log('🧹 Clearing auth error');
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // ✅ COMPATIBILITY: Keep initializeAuth for existing components but make it a no-op
  const initializeAuth = useCallback(async (): Promise<() => void> => {
    // No-op since auth is always initialized in simplified version
    console.log('🔐 initializeAuth called (no-op in simplified version - auth already ready)');
    return () => {}; // Return empty cleanup function for compatibility
  }, []);

  return {
    ...state,
    loginAdmin,
    loginHost,
    logout,
    clearError,
    initializeAuth
  };
};
