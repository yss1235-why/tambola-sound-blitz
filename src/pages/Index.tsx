// src/pages/Index.tsx - COMPLETE: Updated to use simplified authentication
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/Header';
import { UserLandingPage } from '@/components/UserLandingPage';
import { GameHost } from '@/components/GameHost';
import { AdminDashboard } from '@/components/AdminDashboard';
import { GameDataProvider } from '@/providers/GameDataProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { useAuth } from '@/hooks/useAuth';
import { useActiveGamesSubscription } from '@/hooks/useFirebaseSubscription';
import { useBusinessName } from '@/hooks/useBusinessName';
import { AdminUser, HostUser } from '@/services/firebase';
import { GestureDetector } from '@/components/GestureDetector';
import { DEFAULT_GESTURE_CONFIG } from '@/utils/gestureConfig';

const Index = () => {
  // SIMPLIFIED: Use new auth hook (same interface, better implementation)
  const auth = useAuth();

  // UNCHANGED: Games loading works the same
  const { data: allGames, loading: gamesLoading, error: gamesError } = useActiveGamesSubscription();

  // Business name from systemSettings (publicly accessible, same pattern as theme)
  const { businessName: publicBusinessName } = useBusinessName();

  // UNCHANGED: Local state management
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showAdminLoginViaGesture, setShowAdminLoginViaGesture] = useState(false);

  // HOST MODE GATE: Hosts see player view by default.
  // Only switch to host dashboard when they explicitly click Login.
  // This is per-tab (React state), so one tab can be host, another can be player.
  const [hostModeActive, setHostModeActive] = useState(false);

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
        setHostModeActive(true); // Activate host mode after explicit login
      }
      return true;
    } catch (error: any) {
      // Error is handled by the auth hook
      return false;
    }
  }, [auth]);

  // HOST MODE GATE: Activate host dashboard when host clicks Login with existing session
  const handleActivateHostMode = useCallback(() => {
    setHostModeActive(true);
    setSelectedGameId('HOST_CURRENT');
  }, []);

  // SIMPLIFIED: Direct logout
  const handleUserLogout = useCallback(async () => {
    try {
      await auth.logout();
      setSelectedGameId(null);
      setHostModeActive(false); // Reset host mode on logout
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
        : publicBusinessName;

    if (name) {
      document.title = name;
    }
  }, [auth.user, auth.userRole, publicBusinessName]);

  // NEW: Handle admin login dialog close
  const handleAdminLoginClose = useCallback(() => {
    setShowAdminLoginViaGesture(false);
  }, []);

  // UNCHANGED: Render logic stays exactly the same
  const renderContent = () => {
    // Show admin dashboard if authenticated as admin (admin always auto-redirects)
    if (auth.user && auth.userRole === 'admin') {
      return <AdminDashboard user={auth.user as AdminUser} />;
    }

    // Show host dashboard ONLY if host explicitly activated host mode
    if (auth.user && auth.userRole === 'host' && hostModeActive) {
      return (
        <ThemeProvider>
          <GameDataProvider userId={auth.user.uid}>
            <GameHost user={auth.user as HostUser} userRole={auth.userRole} />
          </GameDataProvider>
        </ThemeProvider>
      );
    }

    // Show public landing page (Player view with theme support)
    return (
      <ThemeProvider>
        <UserLandingPage
          onGameSelection={handleGameSelection}
          selectedGameId={selectedGameId}
          preloadedGames={allGames || []}
          gamesLoading={gamesLoading}
          gamesError={gamesError}
          businessName={publicBusinessName}
        />
      </ThemeProvider>
    );
  };

  // SIMPLIFIED: Only show loading if user is authenticated AND still loading
  // This prevents the loading screen from showing for public users
  const showAuthLoading = auth.loading && auth.user;

  // Index page render log removed for performance

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — when host mode is NOT active, hide host identity so Login button shows */}
      <Header
        // HOST MODE GATE: When hostModeActive is false, pretend no user is logged in
        // so the Header shows the Login button instead of the user dropdown
        currentUser={(!hostModeActive && auth.userRole === 'host') ? null : auth.user}
        userRole={(!hostModeActive && auth.userRole === 'host') ? null : auth.userRole}
        authLoading={auth.loading}
        authError={auth.error}
        authInitialized={auth.initialized}

        // Auth actions
        onRequestLogin={handleRequestLogin}
        onUserLogin={handleUserLogin}
        onUserLogout={handleUserLogout}
        onClearError={auth.clearError}

        forceShowAdminLogin={showAdminLoginViaGesture}
        onAdminLoginClose={handleAdminLoginClose}
        businessName={
          auth.userRole === 'host' && auth.user
            ? (auth.user as HostUser).businessName
            : publicBusinessName
        }

        // HOST MODE GATE: Let Header know there's an existing host session
        hasExistingHostSession={!hostModeActive && auth.user !== null && auth.userRole === 'host'}
        onActivateHostMode={handleActivateHostMode}
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

      {/* Footer */}
      <footer className="w-full border-t border-border/40 bg-card/50 backdrop-blur-sm mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* CTA */}
            <a
              href="https://innovarc.uk/products?category=app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:text-accent transition-colors duration-200 flex items-center gap-1.5"
            >
              <span>🎯</span>
              <span>Host your own Tambola games</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            {/* Credit */}
            <p className="text-xs text-muted-foreground">
              Designed & Developed by{' '}
              <a
                href="https://innovarc.uk/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-foreground/70 hover:text-primary transition-colors duration-200"
              >
                Innovative Archive
              </a>
            </p>
          </div>
        </div>
      </footer>

      {/* Gesture Detection Component */}
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
