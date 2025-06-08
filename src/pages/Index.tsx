// src/pages/Index.tsx
import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { UserLandingPage } from '@/components/UserLandingPage';
import { GameHost } from '@/components/GameHost';
import { AdminDashboard } from '@/components/AdminDashboard';
import { FirebaseSetup } from '@/components/FirebaseSetup';
import { AdminUser, HostUser } from '@/services/firebase';

const Index = () => {
  const [currentUser, setCurrentUser] = useState<AdminUser | HostUser | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'host' | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const handleUserLogin = (user: AdminUser | HostUser, role: 'admin' | 'host') => {
    setCurrentUser(user);
    setUserRole(role);
  };

  const handleUserLogout = () => {
    setCurrentUser(null);
    setUserRole(null);
  };

  const renderContent = () => {
    // Show Firebase setup if requested
    if (showSetup) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                Firebase Configuration
              </h1>
              <p className="text-gray-600">
                Set up your Tambola game with real-time features
              </p>
              <button
                onClick={() => setShowSetup(false)}
                className="mt-4 text-orange-600 hover:text-orange-700 underline"
              >
                ← Back to Game
              </button>
            </div>
            <FirebaseSetup />
          </div>
        </div>
      );
    }

    // Role-based content rendering
    if (currentUser && userRole) {
      if (userRole === 'admin') {
        // Admin Dashboard - Only user management
        return <AdminDashboard user={currentUser as AdminUser} />;
      } else if (userRole === 'host') {
        // Host Dashboard - Game management only
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
        onShowSetup={() => setShowSetup(true)}
      />
      {renderContent()}
    </div>
  );
};

export default Index;
