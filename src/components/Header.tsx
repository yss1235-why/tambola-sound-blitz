// src/components/Header.tsx - OPTIMIZED: Works with lazy authentication system
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, Menu, LogOut, User, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminUser, HostUser, firebaseService } from '@/services/firebase';


interface HeaderProps {
  currentUser: AdminUser | HostUser | null;
  userRole: 'admin' | 'host' | null;
  authLoading: boolean;
  authError: string | null;
  authInitialized: boolean;
  onRequestLogin: () => Promise<void>;
  onUserLogin: (type: 'admin' | 'host', email: string, password: string) => Promise<boolean>;
  onUserLogout: () => Promise<boolean>;
  onClearError: () => void;
  forceShowAdminLogin?: boolean;
  onAdminLoginClose?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  currentUser,
  userRole,
  authLoading,
  authError,
  authInitialized,
  onRequestLogin,
  onUserLogin,
  onUserLogout,
  onClearError,
  forceShowAdminLogin = false,
  onAdminLoginClose
}) => {
  // Local state for dialog management
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isHostLoginOpen, setIsHostLoginOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  // Admin creation state
  const [showAdminCreation, setShowAdminCreation] = useState(false);
  const [canCreateAdmin, setCanCreateAdmin] = useState(false);
  const [checkingAdminStatus, setCheckingAdminStatus] = useState(false);
  const [adminCreationForm, setAdminCreationForm] = useState({
    email: '',
    password: '',
    name: ''
  });
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  // Login form states
  const [adminForm, setAdminForm] = useState({
    email: '',
    password: ''
  });

  const [hostForm, setHostForm] = useState({
    email: '',
    password: ''
  });
  // ✅ NEW: Handle forced admin login from gesture
useEffect(() => {
  if (forceShowAdminLogin && !isAdminLoginOpen) {
    console.log('🎯 Gesture triggered admin login dialog');
    setIsAdminLoginOpen(true);
  }
}, [forceShowAdminLogin, isAdminLoginOpen]);
  // Check admin creation status when dialog opens
  useEffect(() => {
    if (isAdminLoginOpen && !checkingAdminStatus) {
      checkAdminCreationStatus();
    }
  }, [isAdminLoginOpen]);

  // ✅ NEW: Handle login dialog opening (triggers auth initialization)
  const handleOpenLogin = async (type: 'admin' | 'host') => {
    try {
      // Clear any previous errors
      if (authError) {
        onClearError();
      }
      
      // Initialize auth system if not already done
      if (!authInitialized) {
        console.log('🔐 Login requested, initializing auth system...');
        await onRequestLogin();
      }
      
      // Open appropriate dialog
      if (type === 'admin') {
        setIsAdminLoginOpen(true);
      } else {
        setIsHostLoginOpen(true);
      }
    } catch (error) {
      console.error('Failed to initialize auth for login:', error);
    }
  };

  // ✅ NEW: Handle admin login
  const handleAdminLogin = async () => {
    if (!adminForm.email.trim() || !adminForm.password.trim()) {
      return;
    }

    setIsLoggingIn(true);
    
    try {
      const success = await onUserLogin('admin', adminForm.email, adminForm.password);
      
      if (success) {
        setIsAdminLoginOpen(false);
        setAdminForm({ email: '', password: '' });
      }
    } catch (error) {
      // Error handling is done by parent component
      console.error('Admin login failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ✅ NEW: Handle host login
  const handleHostLogin = async () => {
    if (!hostForm.email.trim() || !hostForm.password.trim()) {
      return;
    }

    setIsLoggingIn(true);
    
    try {
      const success = await onUserLogin('host', hostForm.email, hostForm.password);
      
      if (success) {
        setIsHostLoginOpen(false);
        setHostForm({ email: '', password: '' });
      }
    } catch (error) {
      // Error handling is done by parent component
      console.error('Host login failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ✅ NEW: Handle logout
  const handleLogout = async () => {
    try {
      await onUserLogout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // ✅ NEW: Handle dialog close (clears forms)
 // ✅ NEW: Enhanced close handler for gesture support
const handleCloseAdminDialog = (open: boolean) => {
  if (!open) {
    setIsAdminLoginOpen(false);
    setAdminForm({ email: '', password: '' });
    if (authError) onClearError();
    if (onAdminLoginClose) {
      onAdminLoginClose();
    }
  }
};
  const checkAdminCreationStatus = async () => {
    setCheckingAdminStatus(true);
    try {
      const adminExists = await firebaseService.checkAdminExists();
      const canCreate = await firebaseService.checkCanCreateAdmin();
      
      // Show admin creation if no admins exist AND rules allow creation
      setShowAdminCreation(!adminExists && canCreate);
      setCanCreateAdmin(canCreate);
      
      console.log('🔧 Admin status check:', { adminExists, canCreate, showCreation: !adminExists && canCreate });
    } catch (error) {
      console.error('Error checking admin status:', error);
      setShowAdminCreation(false);
    } finally {
      setCheckingAdminStatus(false);
    }
  };

  const handleCreateFirstAdmin = async () => {
    if (!adminCreationForm.email.trim() || !adminCreationForm.password.trim() || !adminCreationForm.name.trim()) {
      alert('Please fill in all fields');
      return;
    }

    setIsCreatingAdmin(true);
    try {
      await firebaseService.createFirstAdmin(
        adminCreationForm.email,
        adminCreationForm.password,
        adminCreationForm.name
      );
      
      alert('Admin account created successfully! You can now login.');
      setAdminCreationForm({ email: '', password: '', name: '' });
      setShowAdminCreation(false);
      
      // Recheck status to hide the creation form
      await checkAdminCreationStatus();
      
    } catch (error: any) {
      console.error('Admin creation failed:', error);
      alert(error.message || 'Failed to create admin account');
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleCloseHostDialog = () => {
    setIsHostLoginOpen(false);
    setHostForm({ email: '', password: '' });
    if (authError) onClearError();
  };

  return (
    <header className="bg-white/90 backdrop-blur-sm shadow-lg border-b-2 border-orange-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              🎲 Tambola Game
            </h1>
            {/* ✅ NEW: Show auth status in development */}
            {process.env.NODE_ENV === 'development' && (
              <div className="ml-4 text-xs text-gray-500">
                {authInitialized ? '🔐 Auth Ready' : '⚡ Fast Load'}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {currentUser ? (
              // ✅ EXISTING: Authenticated user dropdown (unchanged)
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-2 border-orange-400 text-orange-600 hover:bg-orange-50 font-semibold"
                    disabled={authLoading}
                  >
                    {authLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <User className="w-4 h-4 mr-2" />
                    )}
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
                    disabled={authLoading}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // ✅ NEW: Login dropdown (triggers lazy auth)
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-2 border-orange-400 text-orange-600 hover:bg-orange-50 font-semibold"
                    disabled={authLoading}
                  >
                    {authLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Menu className="w-4 h-4 mr-2" />
                    )}
                    Login
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem 
                    onSelect={(e) => {
                      e.preventDefault();
                      handleOpenLogin('host');
                    }}
                    className="cursor-pointer"
                    disabled={authLoading}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Host Login
                  </DropdownMenuItem>
                 
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* ✅ Host Login Dialog */}
            <Dialog open={isHostLoginOpen} onOpenChange={handleCloseHostDialog}>
              <DialogContent className="sm:max-w-md bg-white border-2 border-orange-200">
                <DialogHeader>
                  <DialogTitle className="text-gray-800 flex items-center">
                    Host Login
                    {!authInitialized && (
                      <Loader2 className="w-4 h-4 ml-2 animate-spin text-orange-500" />
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {!authInitialized && (
                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="text-sm text-orange-800 font-medium">Initializing authentication...</p>
                      <p className="text-xs text-orange-600">Please wait while we set up the login system</p>
                    </div>
                  )}
                  
                  {authError && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm text-red-800">{authError}</p>
                    </div>
                  )}
                  
                  <div>
                    <Label htmlFor="host-email" className="text-gray-700 font-medium">Email</Label>
                    <Input 
                      id="host-email" 
                      type="email" 
                      placeholder="Enter your email" 
                      required 
                      value={hostForm.email}
                      onChange={(e) => setHostForm(prev => ({ ...prev, email: e.target.value }))}
                      className="border-2 border-orange-200 focus:border-orange-400 bg-white text-gray-800 placeholder:text-gray-500"
                      disabled={isLoggingIn || !authInitialized}
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
                      className="border-2 border-orange-200 focus:border-orange-400 bg-white text-gray-800 placeholder:text-gray-500"
                      disabled={isLoggingIn || !authInitialized}
                    />
                  </div>
                  <Button 
                    onClick={handleHostLogin}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                    disabled={isLoggingIn || !authInitialized || !hostForm.email || !hostForm.password}
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      'Login as Host'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* ✅ Admin Login Dialog (with Creation Support) */}
            <Dialog open={isAdminLoginOpen} onOpenChange={handleCloseAdminDialog}>
              <DialogContent className="sm:max-w-md bg-white border-2 border-orange-200">
                <DialogHeader>
                  <DialogTitle className="text-gray-800 flex items-center">
                    {showAdminCreation ? '🔧 Admin Setup' : 'Admin Login'}
                    {(!authInitialized || checkingAdminStatus) && (
                      <Loader2 className="w-4 h-4 ml-2 animate-spin text-orange-500" />
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Show checking status */}
                  {checkingAdminStatus && (
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-600">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                        Checking admin status...
                      </p>
                    </div>
                  )}

                  {/* Normal Admin Login Form */}
                  {!showAdminCreation && !checkingAdminStatus && (
                    <>
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-800 font-medium">Admin Login</p>
                        <p className="text-xs text-blue-600">Enter your admin credentials</p>
                      </div>
                      
                      {!authInitialized && (
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <p className="text-sm text-orange-800 font-medium">Initializing authentication...</p>
                          <p className="text-xs text-orange-600">Please wait while we set up the login system</p>
                        </div>
                      )}
                      
                      {authError && (
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-sm text-red-800">{authError}</p>
                        </div>
                      )}
                      
                      <div>
                        <Label htmlFor="admin-email" className="text-gray-700 font-medium">Email</Label>
                        <Input 
                          id="admin-email" 
                          type="email" 
                          placeholder="Enter your email" 
                          required 
                          value={adminForm.email}
                          onChange={(e) => setAdminForm(prev => ({ ...prev, email: e.target.value }))}
                          className="border-2 border-orange-200 focus:border-orange-400 bg-white text-gray-800 placeholder:text-gray-500"
                          disabled={isLoggingIn || !authInitialized}
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
                          className="border-2 border-orange-200 focus:border-orange-400 bg-white text-gray-800 placeholder:text-gray-500"
                          disabled={isLoggingIn || !authInitialized}
                        />
                      </div>
                      <Button 
                        onClick={handleAdminLogin}
                        className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                        disabled={isLoggingIn || !authInitialized || !adminForm.email || !adminForm.password}
                      >
                        {isLoggingIn ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Logging in...
                          </>
                        ) : (
                          'Login as Admin'
                        )}
                      </Button>
                    </>
                  )}

                  {/* Admin Creation Form */}
                  {showAdminCreation && !checkingAdminStatus && (
                    <>
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-sm text-green-800 font-medium">🔧 Setup Mode Detected</p>
                        <p className="text-xs text-green-600">No admin accounts found. Create the first admin account.</p>
                      </div>
                      
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-xs text-yellow-800">
                          <strong>Security Notice:</strong> This option is only available when Firebase rules allow public access. 
                          Once rules are secured for production, admin creation will be disabled.
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="admin-create-name" className="text-gray-700 font-medium">Full Name</Label>
                        <Input 
                          id="admin-create-name" 
                          type="text" 
                          placeholder="Enter admin name" 
                          required 
                          value={adminCreationForm.name}
                          onChange={(e) => setAdminCreationForm(prev => ({ ...prev, name: e.target.value }))}
                          className="border-2 border-green-200 focus:border-green-400 bg-white text-gray-800 placeholder:text-gray-500"
                          disabled={isCreatingAdmin}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="admin-create-email" className="text-gray-700 font-medium">Email</Label>
                        <Input 
                          id="admin-create-email" 
                          type="email" 
                          placeholder="Enter admin email" 
                          required 
                          value={adminCreationForm.email}
                          onChange={(e) => setAdminCreationForm(prev => ({ ...prev, email: e.target.value }))}
                          className="border-2 border-green-200 focus:border-green-400 bg-white text-gray-800 placeholder:text-gray-500"
                          disabled={isCreatingAdmin}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="admin-create-password" className="text-gray-700 font-medium">Password</Label>
                        <Input 
                          id="admin-create-password" 
                          type="password" 
                          placeholder="Enter admin password" 
                          required 
                          value={adminCreationForm.password}
                          onChange={(e) => setAdminCreationForm(prev => ({ ...prev, password: e.target.value }))}
                          className="border-2 border-green-200 focus:border-green-400 bg-white text-gray-800 placeholder:text-gray-500"
                          disabled={isCreatingAdmin}
                        />
                      </div>
                      
                      <Button 
                        onClick={handleCreateFirstAdmin}
                        className="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white hover:from-green-600 hover:to-blue-600"
                        disabled={isCreatingAdmin || !adminCreationForm.email || !adminCreationForm.password || !adminCreationForm.name}
                      >
                        {isCreatingAdmin ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating Admin...
                          </>
                        ) : (
                          '🔧 Create First Admin'
                        )}
                      </Button>
                      
                      <div className="text-center">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setShowAdminCreation(false)}
                          disabled={isCreatingAdmin}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Back to Login
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
};
