// src/pages/Index.tsx - COMPLETE: Updated to use simplified authentication
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/Header';
import { UserLandingPage } from '@/components/UserLandingPage';
import { GameHost } from '@/components/GameHost';
import { AdminDashboard } from '@/components/AdminDashboard';
import { GameDataProvider } from '@/providers/GameDataProvider';
import { ThemeProvider } from '@/providers/ThemeProvider'; // NEW: Theme support
import { useAuth } from '@/hooks/useAuth'; // CHANGED: Use simplified auth hook
import { useActiveGamesSubscription } from '@/hooks/useFirebaseSubscription';
import { AdminUser, HostUser } from '@/services/firebase';
import { GestureDetector } from '@/components/GestureDetector';
import { DEFAULT_GESTURE_CONFIG } from '@/utils/gestureConfig';

const Index = () => {
  // SIMPLIFIED: Use new auth hook (same interface, better implementation)
  const auth = useAuth();

  // UNCHANGED: Games loading works the same
  const { data: allGames, loading: gamesLoading, error: gamesError } = useActiveGamesSubscription();

  // UNCHANGED: Local state management
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showAdminLoginViaGesture, setShowAdminLoginViaGesture] = useState(false);

  // REMOVED: No need for manual auth initialization effects
  // The old useEffect for auto-initializing auth is no longer needed
  // Auth is always ready in the simplified version

  // UNIFIED: Single login handler - auto-detects role
  const handleUserLogin = useCallback(async (email: string, password: string) => {
    try {
      const role = await auth.loginUnified(email, password);

      // For hosts, set special identifier for their current game
      if (role === 'host') {
        setSelectedGameId('HOST_CURRENT');
      }
      return true;
    } catch (error: any) {
      // Error is handled by the auth hook
      return false;
    }
  }, [auth]);

  // SIMPLIFIED: Direct logout
  const handleUserLogout = useCallback(async () => {
    try {
      await auth.logout();
      setSelectedGameId(null);
      return true;
    } catch (error: any) {
      return false;
    }
  }, [auth]);

  // UNCHANGED: Game selection logic for public users
  const handleGameSelection = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
  }, []);

  // COMPATIBILITY: Keep the same interface for Header component
  // This is now a no-op since auth is always ready
  const handleRequestLogin = useCallback(async () => {
    // No-op since auth is always ready, but keep for compatibility
    await auth.initializeAuth();
  }, [auth]);
  const handleGestureComplete = useCallback(() => {

    // Clear any existing auth errors first
    if (auth.error) {
      auth.clearError();
    }

    setShowAdminLoginViaGesture(true);
  }, [auth]);
  // NEW: Handle gesture state cleanup
  useEffect(() => {
    // Reset gesture state when user successfully logs in
    if (auth.user && showAdminLoginViaGesture) {
      setShowAdminLoginViaGesture(false);
    }
  }, [auth.user, showAdminLoginViaGesture]);

  // Dynamic document.title: update browser tab to show business name
  useEffect(() => {
    const name =
      auth.userRole === 'host' && auth.user
        ? (auth.user as HostUser).businessName
        : (allGames?.find(g => g.gameId === selectedGameId)?.businessName || allGames?.[0]?.businessName);

    if (name) {
      document.title = name;
    }
  }, [auth.user, auth.userRole, allGames, selectedGameId]);

  // NEW: Handle admin login dialog close
  const handleAdminLoginClose = useCallback(() => {
    setShowAdminLoginViaGesture(false);
  }, []);

  // UNCHANGED: Render logic stays exactly the same
  const renderContent = () => {
    // Show admin dashboard if authenticated as admin
    if (auth.user && auth.userRole === 'admin') {
      return <AdminDashboard user={auth.user as AdminUser} />;
    }

    // Show host dashboard if authenticated as host
    if (auth.user && auth.userRole === 'host') {
      return (
        <ThemeProvider>
          <GameDataProvider userId={auth.user.uid}>
            <GameHost user={auth.user as HostUser} userRole={auth.userRole} />
          </GameDataProvider>
        </ThemeProvider>
      );
    }

    // Get businessName from the selected game's host data if available
    const selectedGame = allGames?.find(g => g.gameId === selectedGameId);
    // Look up the host data by hostId to get businessName
    // For now, pass the first game's host if available (games include host info)
    const activeGame = selectedGame || (allGames && allGames.length > 0 ? allGames[0] : null);
    // businessName would come from host data - for now we check if host set it
    const currentBusinessName = activeGame?.businessName;

    // Show public landing page (Player view with theme support)
    return (
      <ThemeProvider>
        <UserLandingPage
          onGameSelection={handleGameSelection}
          selectedGameId={selectedGameId}
          preloadedGames={allGames || []}
          gamesLoading={gamesLoading}
          gamesError={gamesError}
          businessName={currentBusinessName}
        />
      </ThemeProvider>
    );
  };

  // SIMPLIFIED: Only show loading if user is authenticated AND still loading
  // This prevents the loading screen from showing for public users
  const showAuthLoading = auth.loading && auth.user;

  // Index page render log removed for performance

  return (
    <div className="min-h-screen">
      {/* UNCHANGED: Header interface remains exactly the same */}
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
        // NEW: Pass businessName from host user or selected game
        businessName={
          auth.userRole === 'host' && auth.user
            ? (auth.user as HostUser).businessName
            : (allGames?.find(g => g.gameId === selectedGameId)?.businessName || allGames?.[0]?.businessName)
        }
      />

      {/* UNCHANGED: Loading overlay logic */}
      {showAuthLoading && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="bg-card text-card-foreground rounded-lg p-6 shadow-xl border border-border">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground">Loading dashboard...</p>
            </div>
          </div>
        </div>
      )}

      {/* UNCHANGED: Content rendering */}
      {renderContent()}

      {/* UNCHANGED: Error display */}
      {auth.error && (
        <div className="fixed bottom-4 right-4 bg-destructive/10 border border-destructive/30 rounded-lg p-4 shadow-lg z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="text-destructive">Warning</div>
              <p className="text-destructive text-sm">{auth.error}</p>
            </div>
            <button
              onClick={auth.clearError}
              className="text-destructive hover:text-destructive/80 ml-4"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* NEW: Gesture Detection Component */}
      <GestureDetector
        onGestureComplete={handleGestureComplete}
        enabled={!auth.user}
        config={{
          ...DEFAULT_GESTURE_CONFIG,
          debugMode: false
        }}
      />
    </div>
  );
};

export default Index;
