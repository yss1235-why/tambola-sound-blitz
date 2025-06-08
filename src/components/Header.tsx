
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
    console.log('Admin login attempted');
    setIsAdminLoginOpen(false);
  };

  const handleHostLogin = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Host login attempted');
    setIsHostLoginOpen(false);
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
          
          <div className="flex items-center space-x-4">
            <Dialog open={isHostLoginOpen} onOpenChange={setIsHostLoginOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-2 border-orange-400 text-orange-600 hover:bg-orange-50 font-semibold"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Host Login
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white border-2 border-orange-200">
                <DialogHeader>
                  <DialogTitle className="text-orange-800">Host Login</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleHostLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="host-email" className="text-orange-700">Email</Label>
                    <Input 
                      id="host-email" 
                      type="email" 
                      placeholder="Enter your email" 
                      required 
                      className="border-2 border-orange-200 focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <Label htmlFor="host-password" className="text-orange-700">Password</Label>
                    <Input 
                      id="host-password" 
                      type="password" 
                      placeholder="Enter your password" 
                      required 
                      className="border-2 border-orange-200 focus:border-orange-400"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                  >
                    Login as Host
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isAdminLoginOpen} onOpenChange={setIsAdminLoginOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-2 border-orange-400 text-orange-600 hover:bg-orange-50 font-semibold"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Admin Login
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white border-2 border-orange-200">
                <DialogHeader>
                  <DialogTitle className="text-orange-800">Admin Login</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="admin-email" className="text-orange-700">Email</Label>
                    <Input 
                      id="admin-email" 
                      type="email" 
                      placeholder="Enter your email" 
                      required 
                      className="border-2 border-orange-200 focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-password" className="text-orange-700">Password</Label>
                    <Input 
                      id="admin-password" 
                      type="password" 
                      placeholder="Enter your password" 
                      required 
                      className="border-2 border-orange-200 focus:border-orange-400"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                  >
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
