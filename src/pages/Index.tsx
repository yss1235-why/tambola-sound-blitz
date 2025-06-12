// src/pages/Index.tsx - Simplified version for single-page design
import React, { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { UserLandingPage } from '@/components/UserLandingPage';
import { GameHost } from '@/components/GameHost';
import { AdminDashboard } from '@/components/AdminDashboard';
import { AdminUser, HostUser } from '@/services/firebase';

const Index = () => {
  const [currentUser, setCurrentUser] = useState<AdminUser | HostUser | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'host' | null>(null);

  // Memoize callbacks to prevent infinite re-renders
  const handleUserLogin = useCallback((user: AdminUser | HostUser, role: 'admin' | 'host') => {
    setCurrentUser(user);
    setUserRole(role);
  }, []);

  const handleUserLogout = useCallback(() => {
    setCurrentUser(null);
    setUserRole(null);
  }, []);

  const renderContent = () => {
    // Role-based content rendering
    if (currentUser && userRole) {
      if (userRole === 'admin') {
        // Admin Dashboard - User management only
        return <AdminDashboard user={currentUser as AdminUser} />;
      } else if (userRole === 'host') {
        // Host Dashboard - Single-page game management
        return <GameHost user={currentUser as HostUser} userRole={userRole} />;
      }
    }

    // Default: show public landing page for players
    return <UserLandingPage />;
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
