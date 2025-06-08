
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { setupInitialAdmin, firebaseService } from '@/services/firebase';

export const FirebaseSetup: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSetup = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🚀 Starting Firebase setup...');
      
      const admin = await setupInitialAdmin();
      
      if (admin) {
        console.log('✅ Initial admin created successfully!');
        setSetupComplete(true);
        toast({
          title: "Setup Complete!",
          description: "Firebase has been configured and initial admin created.",
        });
      } else {
        console.log('ℹ️ Admin already exists');
        setSetupComplete(true);
        toast({
          title: "Setup Already Complete",
          description: "Firebase is already configured with an admin account.",
        });
      }
    } catch (error: any) {
      console.error('❌ Setup failed:', error);
      setError(error.message || 'Setup failed');
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to setup Firebase",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (setupComplete) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-6 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-green-800 mb-2">
            Firebase Setup Complete!
          </h3>
          <p className="text-green-700 mb-4">
            Your Tambola game is now ready to use.
          </p>
          <div className="bg-green-50 p-3 rounded-lg text-left">
            <p className="text-sm font-medium text-green-800">Admin Credentials:</p>
            <p className="text-sm text-green-700">Email: admin@tambola.com</p>
            <p className="text-sm text-green-700">Password: TambolaAdmin123!</p>
          </div>
          <p className="text-xs text-green-600 mt-3">
            You can now login as admin using the header login options.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Firebase Setup Required</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Initialize Firebase to enable real-time game features, authentication, and data persistence.
          </AlertDescription>
        </Alert>

        <div className="space-y-2 text-sm text-gray-600">
          <p>This setup will:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Create initial admin account</li>
            <li>Configure authentication</li>
            <li>Set up real-time database</li>
            <li>Enable game management features</li>
          </ul>
        </div>

        <Button
          onClick={handleSetup}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Setting up Firebase...
            </>
          ) : (
            'Setup Firebase & Create Admin'
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
