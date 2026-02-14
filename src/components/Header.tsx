// src/components/Header.tsx - UNIFIED: Single login dialog for both Host and Admin
import React, { useState, useEffect } from 'react';
import { useHostControls } from '@/providers/HostControlsProvider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, LogOut, User, Loader2, ImageIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminUser, HostUser } from '@/services/firebase';

interface HeaderProps {
  currentUser: AdminUser | HostUser | null;
  userRole: 'admin' | 'host' | null;
  authLoading: boolean;
  authError: string | null;
  authInitialized: boolean;
  onRequestLogin: () => Promise<void>;
  onUserLogin: (email: string, password: string) => Promise<boolean>;
  onUserLogout: () => Promise<boolean>;
  onClearError: () => void;
  forceShowAdminLogin?: boolean;
  onAdminLoginClose?: () => void;
  businessName?: string;
  // HOST MODE GATE: When a host session exists but host mode is not active
  hasExistingHostSession?: boolean;
  onActivateHostMode?: () => void;
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
  onAdminLoginClose,
  businessName,
  hasExistingHostSession = false,
  onActivateHostMode
}) => {
  // Safely try to get host controls - may not be available on public pages
  let hostControls = null;
  try {
    hostControls = useHostControls();
  } catch (error) {
    // HostControlsProvider not available (public pages) - this is fine
  }

  // Single unified login state
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isPremiumLightTheme, setIsPremiumLightTheme] = useState(
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme-preset') === 'premiumLight'
  );

  // Single login form
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  });

  // Handle forced login from gesture detection
  useEffect(() => {
    if (forceShowAdminLogin && !isLoginOpen) {
      setIsLoginOpen(true);
    }
  }, [forceShowAdminLogin, isLoginOpen]);

  useEffect(() => {
    const root = document.documentElement;
    const updateThemePreset = () => {
      setIsPremiumLightTheme(root.getAttribute('data-theme-preset') === 'premiumLight');
    };

    updateThemePreset();
    const observer = new MutationObserver(updateThemePreset);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme-preset'] });

    return () => observer.disconnect();
  }, []);

  // Open login dialog — or activate host mode if session already exists
  const handleOpenLogin = async () => {
    try {
      // HOST MODE GATE: If host session exists, skip login form entirely
      if (hasExistingHostSession && onActivateHostMode) {
        onActivateHostMode();
        return;
      }

      if (authError) {
        onClearError();
      }
      if (!authInitialized) {
        await onRequestLogin();
      }
      setIsLoginOpen(true);
    } catch (error) {
    }
  };

  // Unified login handler
  const handleLogin = async () => {
    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      return;
    }

    setIsLoggingIn(true);

    try {
      const success = await onUserLogin(loginForm.email, loginForm.password);

      if (success) {
        setIsLoginOpen(false);
        setLoginForm({ email: '', password: '' });
      }
    } catch (error) {
      // Error handling is done by parent component
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await onUserLogout();
    } catch (error) {
    }
  };

  // Handle dialog close
  const handleCloseDialog = (open: boolean) => {
    if (!open) {
      setIsLoginOpen(false);
      setLoginForm({ email: '', password: '' });
      if (authError) onClearError();
      if (onAdminLoginClose) {
        onAdminLoginClose();
      }
    }
  };

  // Display title: use businessName if available, show nothing during loading
  const displayTitle = businessName || '';

  return (
    <header className="bg-card/90 backdrop-blur-sm shadow-lg border-b-2 border-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {displayTitle}
            </h1>
          </div>

          {/* Session Warning - Only show for authenticated hosts */}
          {userRole === 'host' && hostControls?.sessionStatus.conflictWarning && (
            <div className="bg-muted border border-border text-foreground px-4 py-2 rounded mr-4">
              ⚠️ {hostControls.sessionStatus.conflictWarning}
              {!hostControls.sessionStatus.isPrimary && (
                <div className="text-sm mt-1">
                  Another device has game control. You can view but cannot start/control games.
                  <button
                    onClick={() => hostControls?.requestPrimaryControl()}
                    className="text-primary underline ml-2 hover:text-primary/80"
                  >
                    Take Control
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center space-x-2">
            {currentUser ? (
              // Authenticated user dropdown
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-2 border-primary/40 text-primary hover:bg-primary/10 font-semibold"
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
                    <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
                    {userRole === 'admin' && 'permissions' in currentUser && (
                      <div className="text-xs text-accent mt-1">
                        {currentUser.permissions.createHosts && '✓ Create Hosts '}
                        {currentUser.permissions.manageUsers && '✓ Manage Users'}
                      </div>
                    )}
                    {userRole === 'host' && 'subscriptionEndDate' in currentUser && (
                      <div className="text-xs text-primary mt-1">
                        {currentUser.isActive ? '✓ Active' : '❌ Inactive'}
                      </div>
                    )}
                  </div>
                  <DropdownMenuSeparator />

                  {/* Create Poster Button */}
                  <DropdownMenuItem
                    onClick={() => window.open('https://tambolapos.netlify.app/', '_blank')}
                    className="cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Create Poster
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onUserLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // Single Login button
              <Button
                variant="outline"
                size="sm"
                className="border-2 border-primary/40 text-primary hover:bg-primary/10 font-semibold"
                disabled={authLoading}
                onClick={handleOpenLogin}
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4 mr-2" />
                )}
                Login
              </Button>
            )}

            {/* Unified Login Dialog */}
            <Dialog open={isLoginOpen} onOpenChange={handleCloseDialog}>
              <DialogContent className="sm:max-w-md bg-card border-2 border-border">
                <DialogHeader>
                  <DialogTitle className="text-foreground flex items-center">
                    Login
                    {!authInitialized && (
                      <Loader2 className="w-4 h-4 ml-2 animate-spin text-primary" />
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {!authInitialized && (
                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
                      <p className="text-sm text-primary font-medium">Initializing authentication...</p>
                      <p className="text-xs text-primary/80">Please wait while we set up the login system</p>
                    </div>
                  )}

                  {authError && (
                    <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                      <p className="text-sm text-destructive">{authError}</p>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="login-email" className="text-foreground font-medium">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email"
                      required
                      value={loginForm.email}
                      onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                      onKeyPress={(e) => e.key === 'Enter' && !loginForm.password && document.getElementById('login-password')?.focus()}
                      className="border-2 border-border focus:border-ring bg-background text-foreground placeholder:text-muted-foreground"
                      disabled={isLoggingIn || !authInitialized}
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-password" className="text-foreground font-medium">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      required
                      value={loginForm.password}
                      onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                      onKeyPress={(e) => e.key === 'Enter' && loginForm.email && loginForm.password && authInitialized && handleLogin()}
                      className="border-2 border-border focus:border-ring bg-background text-foreground placeholder:text-muted-foreground"
                      disabled={isLoggingIn || !authInitialized}
                    />
                  </div>
                  <Button
                    onClick={handleLogin}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isLoggingIn || !authInitialized || !loginForm.email || !loginForm.password}
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      'Login'
                    )}
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
