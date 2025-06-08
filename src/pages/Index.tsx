// src/pages/Index.tsx
import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { UserLandingPage } from '@/components/UserLandingPage';
import { GameHost } from '@/components/GameHost';
import { AdminUser, HostUser } from '@/services/firebase';

const Index = () => {
  const [currentUser, setCurrentUser] = useState<AdminUser | HostUser | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'host' | null>(null);

  const handleUserLogin = (user: AdminUser | HostUser, role: 'admin' | 'host') => {
    setCurrentUser(user);
    setUserRole(role);
  };

  const handleUserLogout = () => {
    setCurrentUser(null);
    setUserRole(null);
  };

  const renderContent = () => {
    // If user is logged in as admin or host, show game management interface
    if (currentUser && userRole && (userRole === 'admin' || userRole === 'host')) {
      return <GameHost user={currentUser} userRole={userRole} />;
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
