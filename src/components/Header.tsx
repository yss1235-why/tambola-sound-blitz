// src/components/Header.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, Menu, LogOut, User } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
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
  const { toast } = useToast();

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

  // Admin login form state
  const [adminForm, setAdminForm] = useState({
    email: '',
    password: ''
  });

  // Host login form state
  const [hostForm, setHostForm] = useState({
    email: '',
    password: ''
  });

  // Listen for auth state changes - FIXED: Removed callback dependencies
  useEffect(() => {
    console.log('🔧 Header: Setting up auth listener');
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('🔍 Auth state changed:', user ? `user logged in: ${user.uid}` : 'user logged out');
      
      if (user) {
        try {
          const role = await getCurrentUserRole();
          console.log('🔍 User role:', role);
          
          if (role) {
            setUserRole(role);
            const userData = await firebaseService.getUserData();
            console.log('🔍 User data from Firebase:', userData);
            
            if (userData) {
              setCurrentUser(userData);
              // Use callback refs to avoid dependency issues
              if (onUserLoginRef.current) {
                onUserLoginRef.current(userData, role);
              }
            } else {
              console.log('❌ No user data found');
            }
          }
        } catch (error) {
          console.error('Error getting user role:', error);
        }
      } else {
        console.log('🔍 Auth state changed, user logged out');
        setCurrentUser(null);
        setUserRole(null);
        // Use callback refs to avoid dependency issues
        if (onUserLogoutRef.current) {
          onUserLogoutRef.current();
        }
      }
    });

    return () => {
      console.log('🔧 Header: Cleaning up auth listener');
      unsubscribe();
    };
  }, []); // Empty dependency array to prevent infinite loop

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const admin = await firebaseService.loginAdmin(adminForm.email, adminForm.password);
      if (admin) {
        toast({
          title: "Admin Login Successful",
          description: `Welcome back, ${admin.name}! You can now manage host accounts.`,
        });
        setIsAdminLoginOpen(false);
        setAdminForm({ email: '', password: '' });
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid admin credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleHostLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const host = await firebaseService.loginHost(hostForm.email, hostForm.password);
      if (host) {
        toast({
          title: "Host Login Successful",
          description: `Welcome back, ${host.name}! You can now create and manage games.`,
        });
        setIsHostLoginOpen(false);
        setHostForm({ email: '', password: '' });
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid host credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await firebaseService.logout();
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out.",
      });
    } catch (error: any) {
      toast({
        title: "Logout Error",
        description: error.message || "Failed to logout",
        variant: "destructive",
      });
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
                    {userRole === 'admin' ? 'Admin' : 'Host'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-2">
                    <p className="text-sm font-medium">{currentUser.email}</p>
                    <p className="text-xs text-gray-500 capitalize">{userRole}</p>
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
                <form onSubmit={handleHostLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="host-email" className="text-gray-700">Email</Label>
                    <Input 
                      id="host-email" 
                      type="email" 
                      placeholder="Enter your email" 
                      required 
                      value={hostForm.email}
                      onChange={(e) => setHostForm(prev => ({ ...prev, email: e.target.value }))}
                      className="border-2 border-orange-200 focus:border-orange-400"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <Label htmlFor="host-password" className="text-gray-700">Password</Label>
                    <Input 
                      id="host-password" 
                      type="password" 
                      placeholder="Enter your password" 
                      required 
                      value={hostForm.password}
                      onChange={(e) => setHostForm(prev => ({ ...prev, password: e.target.value }))}
                      className="border-2 border-orange-200 focus:border-orange-400"
                      disabled={isLoading}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Logging in...' : 'Login as Host'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Admin Login Dialog */}
            <Dialog open={isAdminLoginOpen} onOpenChange={setIsAdminLoginOpen}>
              <DialogContent className="sm:max-w-md bg-white border-2 border-orange-200">
                <DialogHeader>
                  <DialogTitle className="text-gray-800">Admin Login</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="admin-email" className="text-gray-700">Email</Label>
                    <Input 
                      id="admin-email" 
                      type="email" 
                      placeholder="Enter your email" 
                      required 
                      value={adminForm.email}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, email: e.target.value }))}
                      className="border-2 border-orange-200 focus:border-orange-400"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-password" className="text-gray-700">Password</Label>
                    <Input 
                      id="admin-password" 
                      type="password" 
                      placeholder="Enter your password" 
                      required 
                      value={adminForm.password}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, password: e.target.value }))}
                      className="border-2 border-orange-200 focus:border-orange-400"
                      disabled={isLoading}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Logging in...' : 'Login as Admin'}
                  </Button>
                </form>
                <div className="text-xs text-gray-500 mt-2">
                  <p>Default Admin Credentials:</p>
                  <p>Email: yurs@gmai.com</p>
                  <p>Password: Qwe123@</p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
};
