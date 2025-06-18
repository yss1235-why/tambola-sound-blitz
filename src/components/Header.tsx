// src/components/Header.tsx - FIXED: Works with new role-based authentication
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, Menu, LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { firebaseService, getCurrentUserRole, AdminUser, HostUser } from '@/services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/services/firebase';

interface HeaderProps {
  onUserLogin?: (user: AdminUser | HostUser, role: 'admin' | 'host') => void;
  onUserLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onUserLogin, onUserLogout }) => {
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isHostLoginOpen, setIsHostLoginOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<AdminUser | HostUser | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'host' | null>(null);

  // Use refs to store latest callback values to avoid dependency issues
  const onUserLoginRef = useRef(onUserLogin);
  const onUserLogoutRef = useRef(onUserLogout);

  // Update refs when callbacks change
  useEffect(() => {
    onUserLoginRef.current = onUserLogin;
  }, [onUserLogin]);

  useEffect(() => {
    onUserLogoutRef.current = onUserLogout;
  }, [onUserLogout]);

  // Login form states
  const [adminForm, setAdminForm] = useState({
    email: '',
    password: ''
  });

  const [hostForm, setHostForm] = useState({
    email: '',
    password: ''
  });

  // ✅ FIXED: Listen for auth state changes with new role system
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          console.log('🔐 Auth state changed - user logged in:', user.email);
          
          // Get user role using new method
          const role = await getCurrentUserRole();
          
          if (role) {
            setUserRole(role);
            
            // Get user data from appropriate collection
            const userData = await firebaseService.getUserData();
            
            if (userData) {
              setCurrentUser(userData);
              if (onUserLoginRef.current) {
                onUserLoginRef.current(userData, role);
              }
              console.log('✅ User data loaded successfully');
            } else {
              console.log('❌ Failed to load user data');
              setCurrentUser(null);
              setUserRole(null);
            }
          } else {
            console.log('❌ No valid role found for user');
            setCurrentUser(null);
            setUserRole(null);
          }
        } catch (error) {
          console.error('❌ Error processing auth state change:', error);
          setCurrentUser(null);
          setUserRole(null);
        }
      } else {
        console.log('🔐 Auth state changed - user logged out');
        setCurrentUser(null);
        setUserRole(null);
        if (onUserLogoutRef.current) {
          onUserLogoutRef.current();
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // ✅ FIXED: Admin login using new method
  const handleAdminLogin = async () => {
    setIsLoading(true);
    
    try {
      console.log('🔐 Attempting admin login...');
      const admin = await firebaseService.loginAdmin(adminForm.email, adminForm.password);
      if (admin) {
        console.log('✅ Admin login successful');
        setIsAdminLoginOpen(false);
        setAdminForm({ email: '', password: '' });
      }
    } catch (error: any) {
      console.error('❌ Admin login failed:', error.message);
      alert(`Admin Login Failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ FIXED: Host login using new method
  const handleHostLogin = async () => {
    setIsLoading(true);
    
    try {
      console.log('🔐 Attempting host login...');
      const host = await firebaseService.loginHost(hostForm.email, hostForm.password);
      if (host) {
        console.log('✅ Host login successful');
        setIsHostLoginOpen(false);
        setHostForm({ email: '', password: '' });
      }
    } catch (error: any) {
      console.error('❌ Host login failed:', error.message);
      alert(`Host Login Failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ FIXED: Logout using new method
  const handleLogout = async () => {
    try {
      console.log('🔐 Logging out...');
      await firebaseService.logout();
      console.log('✅ Logout successful');
    } catch (error: any) {
      console.error('❌ Logout error:', error.message);
      alert(`Logout Failed: ${error.message}`);
    }
  };

  return (
    <header className="bg-white/90 backdrop-blur-sm shadow-lg border-b-2 border-orange-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              🎲 Tambola Game
            </h1>
          </div>
          
          <div className="flex items-center space-x-2">
            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-2 border-orange-400 text-orange-600 hover:bg-orange-50 font-semibold"
                  >
                    <User className="w-4 h-4 mr-2" />
                    {userRole === 'admin' ? 'Admin' : 'Host'}: {currentUser.name}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-2">
                    <p className="text-sm font-medium">{currentUser.email}</p>
                    <p className="text-xs text-gray-500 capitalize">{userRole}</p>
                    {userRole === 'admin' && 'permissions' in currentUser && (
                      <div className="text-xs text-green-600 mt-1">
                        {currentUser.permissions.createHosts && '✓ Create Hosts '}
                        {currentUser.permissions.manageUsers && '✓ Manage Users'}
                      </div>
                    )}
                    {userRole === 'host' && 'subscriptionEndDate' in currentUser && (
                      <div className="text-xs text-blue-600 mt-1">
                        {currentUser.isActive ? '✓ Active' : '❌ Inactive'}
                      </div>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onSelect={handleLogout}
                    className="cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-2 border-orange-400 text-orange-600 hover:bg-orange-50 font-semibold"
                  >
                    <Menu className="w-4 h-4 mr-2" />
                    Login
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem 
                    onSelect={(e) => {
                      e.preventDefault();
                      setIsHostLoginOpen(true);
                    }}
                    className="cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Host Login
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onSelect={(e) => {
                      e.preventDefault();
                      setIsAdminLoginOpen(true);
                    }}
                    className="cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Admin Login
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Host Login Dialog */}
            <Dialog open={isHostLoginOpen} onOpenChange={setIsHostLoginOpen}>
              <DialogContent className="sm:max-w-md bg-white border-2 border-orange-200">
                <DialogHeader>
                  <DialogTitle className="text-gray-800">Host Login</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="host-email" className="text-gray-700 font-medium">Email</Label>
                    <Input 
                      id="host-email" 
                      type="email" 
                      placeholder="Enter your email" 
                      required 
                      value={hostForm.email}
                      onChange={(e) => setHostForm(prev => ({ ...prev, email: e.target.value }))}
                      onKeyPress={(e) => e.key === 'Enter' && !hostForm.password && document.getElementById('host-password')?.focus()}
                      className="border-2 border-orange-200 focus:border-orange-400 bg-white text-gray-800 placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <Label htmlFor="host-password" className="text-gray-700 font-medium">Password</Label>
                    <Input 
                      id="host-password" 
                      type="password" 
                      placeholder="Enter your password" 
                      required 
                      value={hostForm.password}
                      onChange={(e) => setHostForm(prev => ({ ...prev, password: e.target.value }))}
                      onKeyPress={(e) => e.key === 'Enter' && hostForm.email && hostForm.password && handleHostLogin()}
                      className="border-2 border-orange-200 focus:border-orange-400 bg-white text-gray-800 placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </div>
                  <Button 
                    onClick={handleHostLogin}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                    disabled={isLoading || !hostForm.email || !hostForm.password}
                  >
                    {isLoading ? 'Logging in...' : 'Login as Host'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Admin Login Dialog */}
            <Dialog open={isAdminLoginOpen} onOpenChange={setIsAdminLoginOpen}>
              <DialogContent className="sm:max-w-md bg-white border-2 border-orange-200">
                <DialogHeader>
                  <DialogTitle className="text-gray-800">Admin Login</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800 font-medium">Admin Login</p>
                    <p className="text-xs text-blue-600">Enter your admin credentials</p>
                  </div>
                  <div>
                    <Label htmlFor="admin-email" className="text-gray-700 font-medium">Email</Label>
                    <Input 
                      id="admin-email" 
                      type="email" 
                      placeholder="Enter your email" 
                      required 
                      value={adminForm.email}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, email: e.target.value }))}
                      onKeyPress={(e) => e.key === 'Enter' && !adminForm.password && document.getElementById('admin-password')?.focus()}
                      className="border-2 border-orange-200 focus:border-orange-400 bg-white text-gray-800 placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-password" className="text-gray-700 font-medium">Password</Label>
                    <Input 
                      id="admin-password" 
                      type="password" 
                      placeholder="Enter your password" 
                      required 
                      value={adminForm.password}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, password: e.target.value }))}
                      onKeyPress={(e) => e.key === 'Enter' && adminForm.email && adminForm.password && handleAdminLogin()}
                      className="border-2 border-orange-200 focus:border-orange-400 bg-white text-gray-800 placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </div>
                  <Button 
                    onClick={handleAdminLogin}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                    disabled={isLoading || !adminForm.email || !adminForm.password}
                  >
                    {isLoading ? 'Logging in...' : 'Login as Admin'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
};
