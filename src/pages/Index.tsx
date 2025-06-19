// src/pages/Index.tsx - OPTIMIZED: Lazy authentication loading for better performance
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/Header';
import { UserLandingPage } from '@/components/UserLandingPage';
import { GameHost } from '@/components/GameHost';
import { AdminDashboard } from '@/components/AdminDashboard';
import { GameDataProvider } from '@/providers/GameDataProvider';
import { useLazyAuth } from '@/hooks/useLazyAuth';
import { useActiveGamesSubscription } from '@/hooks/useFirebaseSubscription';
import { AdminUser, HostUser } from '@/services/firebase';

const Index = () => {
  // ✅ NEW: Lazy authentication - only loads when needed
  const lazyAuth = useLazyAuth();
  
  // ✅ NEW: Load games immediately without waiting for auth
  const { data: allGames, loading: gamesLoading, error: gamesError } = useActiveGamesSubscription();
  
  // Local state for game selection
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  
  // ✅ NEW: Auto-initialize auth for management routes
  useEffect(() => {
    const currentPath = window.location.pathname;
    const needsAuth = currentPath.includes('/host') || 
                      currentPath.includes('/admin') || 
                      currentPath.includes('/manage');
    
    if (needsAuth && !lazyAuth.initialized) {
      console.log('🔐 Management route detected, initializing auth...');
      lazyAuth.initializeAuth();
    }
  }, [lazyAuth.initialized, lazyAuth.initializeAuth]);

  // ✅ NEW: Handle user-requested login (replaces old handleUserLogin)
  const handleUserLogin = useCallback(async (type: 'admin' | 'host', email: string, password: string) => {
    try {
      if (type === 'admin') {
        await lazyAuth.loginAdmin(email, password);
      } else {
        await lazyAuth.loginHost(email, password);
      }
      
      // For hosts, set special identifier for their current game
      if (type === 'host') {
        setSelectedGameId('HOST_CURRENT');
      }
      
      return true;
    } catch (error) {
      // Error is handled by the lazy auth hook
      return false;
    }
  }, [lazyAuth]);

  // ✅ NEW: Handle logout (replaces old handleUserLogout)
  const handleUserLogout = useCallback(async () => {
    try {
      await lazyAuth.logout();
      setSelectedGameId(null);
      return true;
    } catch (error) {
      // Error is handled by the lazy auth hook
      return false;
    }
  }, [lazyAuth]);

  // ✅ NEW: Handle game selection for public users
  const handleGameSelection = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
  }, []);

  // ✅ NEW: Trigger auth initialization for login attempts
  const handleRequestLogin = useCallback(async () => {
    if (!lazyAuth.initialized) {
      console.log('🔐 User requested login, initializing auth...');
      await lazyAuth.initializeAuth();
    }
  }, [lazyAuth.initialized, lazyAuth.initializeAuth]);

  // ✅ OPTIMIZED: Render content based on auth state and games
  const renderContent = () => {
    // Show admin dashboard if authenticated as admin
    if (lazyAuth.user && lazyAuth.userRole === 'admin') {
      return <AdminDashboard user={lazyAuth.user as AdminUser} />;
    }
    
    // Show host dashboard if authenticated as host
    if (lazyAuth.user && lazyAuth.userRole === 'host') {
      return (
        <GameDataProvider userId={lazyAuth.user.uid}>
          <GameHost user={lazyAuth.user as HostUser} userRole={lazyAuth.userRole} />
        </GameDataProvider>
      );
    }

    // ✅ NEW: Show public landing page with pre-loaded games (no auth required)
    return (
      <UserLandingPage 
        onGameSelection={handleGameSelection}
        selectedGameId={selectedGameId}
        preloadedGames={allGames || []}
        gamesLoading={gamesLoading}
        gamesError={gamesError}
      />
    );
  };

  // ✅ NEW: Show loading only if auth is loading AND user is authenticated
  const showAuthLoading = lazyAuth.loading && lazyAuth.user;

  return (
    <div className="min-h-screen">
      {/* ✅ NEW: Pass auth state and handlers to Header */}
      <Header 
        // Auth state
        currentUser={lazyAuth.user}
        userRole={lazyAuth.userRole}
        authLoading={lazyAuth.loading}
        authError={lazyAuth.error}
        authInitialized={lazyAuth.initialized}
        
        // Auth actions
        onRequestLogin={handleRequestLogin}
        onUserLogin={handleUserLogin}
        onUserLogout={handleUserLogout}
        onClearError={lazyAuth.clearError}
      />
      
      {/* ✅ NEW: Show loading overlay only for authenticated users */}
      {showAuthLoading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700">Loading dashboard...</p>
            </div>
          </div>
        </div>
      )}

      {/* ✅ OPTIMIZED: Content loads immediately without auth dependency */}
      {renderContent()}
      
      {/* ✅ NEW: Show auth error if present */}
      {lazyAuth.error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="text-red-600">⚠️</div>
              <p className="text-red-800 text-sm">{lazyAuth.error}</p>
            </div>
            <button
              onClick={lazyAuth.clearError}
              className="text-red-500 hover:text-red-700 ml-4"
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      {/* ✅ NEW: Development mode performance indicator */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-black/80 text-white p-2 rounded text-xs z-50">
          <div>🚀 Lazy Auth: {lazyAuth.initialized ? 'Loaded' : 'Not loaded'}</div>
          <div>🎮 Games: {gamesLoading ? 'Loading...' : `${allGames?.length || 0} active`}</div>
          <div>👤 User: {lazyAuth.user ? lazyAuth.userRole : 'Public'}</div>
        </div>
      )}
    </div>
  );
};

export default Index;
