
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn } from 'lucide-react';

export const Header: React.FC = () => {
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isHostLoginOpen, setIsHostLoginOpen] = useState(false);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement admin login logic
    console.log('Admin login attempted');
    setIsAdminLoginOpen(false);
  };

  const handleHostLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement host login logic
    console.log('Host login attempted');
    setIsHostLoginOpen(false);
  };

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-gray-900">🎲 Tambola Game</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <Dialog open={isHostLoginOpen} onOpenChange={setIsHostLoginOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <LogIn className="w-4 h-4 mr-2" />
                  Host Login
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Host Login</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleHostLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="host-email">Email</Label>
                    <Input id="host-email" type="email" placeholder="Enter your email" required />
                  </div>
                  <div>
                    <Label htmlFor="host-password">Password</Label>
                    <Input id="host-password" type="password" placeholder="Enter your password" required />
                  </div>
                  <Button type="submit" className="w-full">
                    Login as Host
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isAdminLoginOpen} onOpenChange={setIsAdminLoginOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <LogIn className="w-4 h-4 mr-2" />
                  Admin Login
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Admin Login</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="admin-email">Email</Label>
                    <Input id="admin-email" type="email" placeholder="Enter your email" required />
                  </div>
                  <div>
                    <Label htmlFor="admin-password">Password</Label>
                    <Input id="admin-password" type="password" placeholder="Enter your password" required />
                  </div>
                  <Button type="submit" className="w-full">
                    Login as Admin
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
};
