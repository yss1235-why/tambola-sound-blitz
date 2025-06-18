// src/pages/Index.tsx - SIMPLIFIED: Using new provider architecture
import React, { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { UserLandingPage } from '@/components/UserLandingPage';
import { GameHost } from '@/components/GameHost';
import { AdminDashboard } from '@/components/AdminDashboard';
import { GameDataProvider } from '@/providers/GameDataProvider';
import { AdminUser, HostUser } from '@/services/firebase';

const Index = () => {
  const [currentUser, setCurrentUser] = useState<AdminUser | HostUser | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'host' | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  // ✅ SIMPLIFIED: Memoized callbacks (same as before)
  const handleUserLogin = useCallback((user: AdminUser | HostUser, role: 'admin' | 'host') => {
    setCurrentUser(user);
    setUserRole(role);
    
    // For hosts, set special identifier for their current game
    if (role === 'host') {
      setSelectedGameId('HOST_CURRENT');
    }
  }, []);

  const handleUserLogout = useCallback(() => {
    setCurrentUser(null);
    setUserRole(null);
    setSelectedGameId(null);
  }, []);

  const handleGameSelection = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
  }, []);

  // ✅ SIMPLIFIED: Cleaner content rendering
  const renderContent = () => {
    // Admin Dashboard - No game data needed
    if (currentUser && userRole === 'admin') {
      return <AdminDashboard user={currentUser as AdminUser} />;
    }
    
    // Host Dashboard - Single GameDataProvider with HostControlsProvider inside
    if (currentUser && userRole === 'host') {
      return (
        <GameDataProvider userId={currentUser.uid}>
          <GameHost user={currentUser as HostUser} userRole={userRole} />
        </GameDataProvider>
      );
    }

    // Public landing page for players
    return (
      <UserLandingPage 
        onGameSelection={handleGameSelection}
        selectedGameId={selectedGameId}
      />
    );
  };

  return (
    <div className="min-h-screen">
      <Header 
        onUserLogin={handleUserLogin}
        onUserLogout={handleUserLogout}
      />
      {renderContent()}
    </div>
  );
};

export default Index;
