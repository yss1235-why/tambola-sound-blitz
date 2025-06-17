// src/pages/Index.tsx - Updated to use GameDataProvider
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

  // Memoize callbacks to prevent infinite re-renders
  const handleUserLogin = useCallback((user: AdminUser | HostUser, role: 'admin' | 'host') => {
    setCurrentUser(user);
    setUserRole(role);
    
    // For hosts, we'll load their current game automatically
    if (role === 'host') {
      // GameDataProvider will handle loading the host's current game
      setSelectedGameId('HOST_CURRENT'); // Special identifier for host's current game
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

  const renderContent = () => {
    // Role-based content rendering
    if (currentUser && userRole) {
      if (userRole === 'admin') {
        // Admin Dashboard - User management only
        return <AdminDashboard user={currentUser as AdminUser} />;
      } else if (userRole === 'host') {
        // Host Dashboard - Single-page game management with provider
        return (
          <GameDataProvider 
            gameId={selectedGameId} 
            userId={currentUser.uid}
          >
            <GameHost user={currentUser as HostUser} userRole={userRole} />
          </GameDataProvider>
        );
      }
    }

    // Default: show public landing page for players
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
