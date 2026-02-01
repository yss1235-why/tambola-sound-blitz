// src/pages/Index.tsx - COMPLETE: Updated to use simplified authentication
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/Header';
import { UserLandingPage } from '@/components/UserLandingPage';
import { GameHost } from '@/components/GameHost';
import { AdminDashboard } from '@/components/AdminDashboard';
import { GameDataProvider } from '@/providers/GameDataProvider';
import { ThemeProvider } from '@/providers/ThemeProvider'; // ✅ NEW: Theme support
import { useAuth } from '@/hooks/useAuth'; // ✅ CHANGED: Use simplified auth hook
import { useActiveGamesSubscription } from '@/hooks/useFirebaseSubscription';
import { AdminUser, HostUser } from '@/services/firebase';
import { GestureDetector } from '@/components/GestureDetector';
import { DEFAULT_GESTURE_CONFIG } from '@/utils/gestureConfig';

const Index = () => {
  // ✅ SIMPLIFIED: Use new auth hook (same interface, better implementation)
  const auth = useAuth();

  // ✅ UNCHANGED: Games loading works the same
  const { data: allGames, loading: gamesLoading, error: gamesError } = useActiveGamesSubscription();

  // ✅ UNCHANGED: Local state management
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showAdminLoginViaGesture, setShowAdminLoginViaGesture] = useState(false);

  // ✅ REMOVED: No need for manual auth initialization effects
  // The old useEffect for auto-initializing auth is no longer needed
  // Auth is always ready in the simplified version

  // ✅ SIMPLIFIED: Direct login handling - no complex initialization
  const handleUserLogin = useCallback(async (type: 'admin' | 'host', email: string, password: string) => {
    try {
      console.log(`🔐 Handling ${type} login from Index page`);

      if (type === 'admin') {
        await auth.loginAdmin(email, password);
      } else {
        await auth.loginHost(email, password);
      }

      // For hosts, set special identifier for their current game
      if (type === 'host') {
        console.log('🎮 Setting host current game view');
        setSelectedGameId('HOST_CURRENT');
      }

      console.log(`✅ ${type} login handled successfully`);
      return true;
    } catch (error: any) {
      console.error(`❌ ${type} login failed in Index:`, error);
      // Error is handled by the auth hook
      return false;
    }
  }, [auth]);

  // ✅ SIMPLIFIED: Direct logout
  const handleUserLogout = useCallback(async () => {
    try {
      console.log('🔐 Handling logout from Index page');
      await auth.logout();
      setSelectedGameId(null);
      console.log('✅ Logout handled successfully');
      return true;
    } catch (error: any) {
      console.error('❌ Logout failed in Index:', error);
      return false;
    }
  }, [auth]);

  // ✅ UNCHANGED: Game selection logic for public users
  const handleGameSelection = useCallback((gameId: string) => {
    console.log('🎯 Game selected:', gameId);
    setSelectedGameId(gameId);
  }, []);

  // ✅ COMPATIBILITY: Keep the same interface for Header component
  // This is now a no-op since auth is always ready
  const handleRequestLogin = useCallback(async () => {
    console.log('🔐 Login requested (no-op in simplified auth)');
    // No-op since auth is always ready, but keep for compatibility
    await auth.initializeAuth();
  }, [auth]);
  const handleGestureComplete = useCallback(() => {
    console.log('🎯 Admin gesture detected, opening login dialog');

    // Clear any existing auth errors first
    if (auth.error) {
      auth.clearError();
    }

    setShowAdminLoginViaGesture(true);
  }, [auth]);
  // ✅ NEW: Handle gesture state cleanup
  useEffect(() => {
    // Reset gesture state when user successfully logs in
    if (auth.user && showAdminLoginViaGesture) {
      console.log('🎯 User logged in, resetting gesture state');
      setShowAdminLoginViaGesture(false);
    }
  }, [auth.user, showAdminLoginViaGesture]);

  // ✅ NEW: Handle admin login dialog close
  const handleAdminLoginClose = useCallback(() => {
    console.log('🎯 Admin login dialog closed, resetting gesture state');
    setShowAdminLoginViaGesture(false);
  }, []);

  // ✅ UNCHANGED: Render logic stays exactly the same
  const renderContent = () => {
    // Show admin dashboard if authenticated as admin
    if (auth.user && auth.userRole === 'admin') {
      console.log('🎨 Rendering admin dashboard');
      return <AdminDashboard user={auth.user as AdminUser} />;
    }

    // Show host dashboard if authenticated as host
    if (auth.user && auth.userRole === 'host') {
      console.log('🎨 Rendering host dashboard');
      return (
        <ThemeProvider>
          <GameDataProvider userId={auth.user.uid}>
            <GameHost user={auth.user as HostUser} userRole={auth.userRole} />
          </GameDataProvider>
        </ThemeProvider>
      );
    }

    // Show public landing page (Player view with theme support)
    console.log('🎨 Rendering public landing page');
    return (
      <ThemeProvider>
        <UserLandingPage
          onGameSelection={handleGameSelection}
          selectedGameId={selectedGameId}
          preloadedGames={allGames || []}
          gamesLoading={gamesLoading}
          gamesError={gamesError}
        />
      </ThemeProvider>
    );
  };

  // ✅ SIMPLIFIED: Only show loading if user is authenticated AND still loading
  // This prevents the loading screen from showing for public users
  const showAuthLoading = auth.loading && auth.user;

  console.log('🎨 Index page render:', {
    authLoading: auth.loading,
    authInitialized: auth.initialized,
    user: auth.user ? `${auth.userRole}: ${auth.user.name}` : 'None',
    selectedGameId,
    showAuthLoading
  });

  return (
    <div className="min-h-screen">
      {/* ✅ UNCHANGED: Header interface remains exactly the same */}
      <Header
        // Auth state - same interface as before
        currentUser={auth.user}
        userRole={auth.userRole}
        authLoading={auth.loading}
        authError={auth.error}
        authInitialized={auth.initialized}

        // Auth actions - same interface as before
        onRequestLogin={handleRequestLogin}
        onUserLogin={handleUserLogin}
        onUserLogout={handleUserLogout}
        onClearError={auth.clearError}

        forceShowAdminLogin={showAdminLoginViaGesture}
        onAdminLoginClose={handleAdminLoginClose}
      />

      {/* ✅ UNCHANGED: Loading overlay logic */}
      {showAuthLoading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground">Loading dashboard...</p>
            </div>
          </div>
        </div>
      )}

      {/* ✅ UNCHANGED: Content rendering */}
      {renderContent()}

      {/* ✅ UNCHANGED: Error display */}
      {auth.error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="text-red-600">⚠️</div>
              <p className="text-red-800 text-sm">{auth.error}</p>
            </div>
            <button
              onClick={auth.clearError}
              className="text-red-500 hover:text-red-700 ml-4"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ✅ UPDATED: Better development indicators */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-black/80 text-white p-2 rounded text-xs z-50">
          <div>🔐 Auth: {auth.initialized ? 'Ready' : 'Initializing'}</div>
          <div>🎮 Games: {gamesLoading ? 'Loading...' : `${allGames?.length || 0} active`}</div>
          <div>👤 User: {auth.user ? `${auth.userRole}: ${auth.user.name}` : 'Public'}</div>
          <div className="text-green-400">✅ Simplified Auth Active</div>
          {auth.error && <div className="text-red-400">❌ {auth.error}</div>}
        </div>
      )}
      {/* ✅ NEW: Gesture Detection Component */}
      <GestureDetector
        onGestureComplete={handleGestureComplete}
        enabled={!auth.user}
        config={{
          ...DEFAULT_GESTURE_CONFIG,
          debugMode: process.env.NODE_ENV === 'development'
        }}
      />
    </div>
  );
};

export default Index;
