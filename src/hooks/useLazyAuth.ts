// src/hooks/useLazyAuth.ts - Lazy Authentication Loading Hook
import { useState, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, getCurrentUserRole, firebaseService, AdminUser, HostUser } from '@/services/firebase';

interface LazyAuthState {
  user: AdminUser | HostUser | null;
  userRole: 'admin' | 'host' | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

interface LazyAuthActions {
  initializeAuth: () => Promise<() => void>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  loginHost: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useLazyAuth = (): LazyAuthState & LazyAuthActions => {
  const [state, setState] = useState<LazyAuthState>({
    user: null,
    userRole: null,
    loading: false,
    initialized: false,
    error: null
  });

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const initializationPromiseRef = useRef<Promise<() => void> | null>(null);

  // Initialize authentication system (called lazily)
  const initializeAuth = useCallback(async (): Promise<() => void> => {
    // Return existing promise if already initializing
    if (initializationPromiseRef.current) {
      return initializationPromiseRef.current;
    }

    // Return no-op if already initialized
    if (state.initialized && unsubscribeRef.current) {
      return unsubscribeRef.current;
    }

    console.log('🔐 Lazy loading authentication system...');
    
    // Create initialization promise
    initializationPromiseRef.current = new Promise((resolve) => {
      setState(prev => ({ 
        ...prev, 
        loading: true, 
        initialized: true,
        error: null 
      }));

      try {
        // Setup auth state listener
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            try {
              console.log('🔐 Auth state changed - user logged in:', firebaseUser.email);
              
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
                  console.log('✅ Lazy auth: User data loaded successfully');
                } else {
                  console.log('❌ Lazy auth: Failed to load user data');
                  setState({
                    user: null,
                    userRole: null,
                    loading: false,
                    initialized: true,
                    error: 'Failed to load user data'
                  });
                }
              } else {
                console.log('❌ Lazy auth: No valid role found for user');
                setState({
                  user: null,
                  userRole: null,
                  loading: false,
                  initialized: true,
                  error: 'Invalid user role'
                });
              }
            } catch (error: any) {
              console.error('❌ Lazy auth: Error processing auth state:', error);
              setState({
                user: null,
                userRole: null,
                loading: false,
                initialized: true,
                error: error.message || 'Authentication error'
              });
            }
          } else {
            console.log('🔐 Lazy auth: User logged out');
            setState(prev => ({ 
              ...prev, 
              user: null, 
              userRole: null, 
              loading: false,
              error: null
            }));
          }
        });

        unsubscribeRef.current = unsubscribe;
        resolve(unsubscribe);
        
        console.log('✅ Lazy auth system initialized');
      } catch (error: any) {
        console.error('❌ Lazy auth initialization failed:', error);
        setState({
          user: null,
          userRole: null,
          loading: false,
          initialized: true,
          error: error.message || 'Failed to initialize authentication'
        });
        resolve(() => {});
      }
    });

    return initializationPromiseRef.current;
  }, [state.initialized]);

  // Login methods that automatically initialize auth if needed
  const loginAdmin = useCallback(async (email: string, password: string) => {
    try {
      // Ensure auth is initialized
      await initializeAuth();
      
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      console.log('🔐 Attempting admin login...');
      const admin = await firebaseService.loginAdmin(email, password);
      
      if (admin) {
        console.log('✅ Admin login successful');
        // State will be updated by the auth state listener
      }
    } catch (error: any) {
      console.error('❌ Admin login failed:', error.message);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Admin login failed'
      }));
      throw error;
    }
  }, [initializeAuth]);

  const loginHost = useCallback(async (email: string, password: string) => {
    try {
      // Ensure auth is initialized
      await initializeAuth();
      
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      console.log('🔐 Attempting host login...');
      const host = await firebaseService.loginHost(email, password);
      
      if (host) {
        console.log('✅ Host login successful');
        // State will be updated by the auth state listener
      }
    } catch (error: any) {
      console.error('❌ Host login failed:', error.message);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Host login failed'
      }));
      throw error;
    }
  }, [initializeAuth]);

  const logout = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      console.log('🔐 Logging out...');
      await firebaseService.logout();
      
      console.log('✅ Logout successful');
      // State will be updated by the auth state listener
    } catch (error: any) {
      console.error('❌ Logout error:', error.message);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Logout failed'
      }));
      throw error;
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    initializationPromiseRef.current = null;
  }, []);

  // Return cleanup function for external use
  React.useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    ...state,
    initializeAuth,
    loginAdmin,
    loginHost,
    logout,
    clearError
  };
};
