// src/components/SetupInstructions.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, Copy, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { setupInitialAdmin } from '@/services/firebase';

export const SetupInstructions: React.FC = () => {
  const [setupSteps, setSetupSteps] = useState({
    firebaseConfig: false,
    databaseRules: false,
    authentication: false,
    initialAdmin: false
  });
  const [isSettingUpAdmin, setIsSettingUpAdmin] = useState(false);
  const { toast } = useToast();

  const handleCopyCode = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const handleSetupAdmin = async () => {
    setIsSettingUpAdmin(true);
    try {
      const admin = await setupInitialAdmin();
      if (admin) {
        setSetupSteps(prev => ({ ...prev, initialAdmin: true }));
        toast({
          title: "Admin Created Successfully!",
          description: `Initial admin account created. Email: ${admin.email}`,
        });
      } else {
        toast({
          title: "Admin Already Exists",
          description: "Initial admin account already exists in the system.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to create initial admin",
        variant: "destructive",
      });
    } finally {
      setIsSettingUpAdmin(false);
    }
  };

  const databaseRules = `{
  "rules": {
    ".read": false,
    ".write": false,
    
    "admins": {
      ".read": "auth != null && root.child('admins').child(auth.uid).exists()",
      ".write": "auth != null && root.child('admins').child(auth.uid).exists()"
    },
    
    "hosts": {
      ".read": "auth != null && (root.child('admins').child(auth.uid).exists() || root.child('hosts').child(auth.uid).exists())",
      ".write": "auth != null && root.child('admins').child(auth.uid).exists()"
    },
    
    "games": {
      ".read": true,
      ".write": "auth != null && (root.child('admins').child(auth.uid).exists() || root.child('hosts').child(auth.uid).exists())"
    },
    
    "bookings": {
      ".read": true,
      ".write": true
    }
  }
}`;

  const StepCard: React.FC<{
    title: string;
    completed: boolean;
    children: React.ReactNode;
  }> = ({ title, completed, children }) => (
    <Card className={`border-l-4 ${completed ? 'border-l-green-500' : 'border-l-orange-500'}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {completed ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-orange-500" />
          )}
          {title}
          <Badge variant={completed ? "default" : "secondary"}>
            {completed ? "Complete" : "Pending"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">
          Firebase Setup Instructions
        </h1>
        <p className="text-slate-600">
          Follow these steps to set up your Tambola game with Firebase
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          These setup steps are required for the first-time configuration. 
          Once completed, your Tambola game will be ready for hosting!
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <StepCard
          title="Step 1: Firebase Console Setup"
          completed={setupSteps.firebaseConfig}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              1. Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                Firebase Console <ExternalLink className="w-3 h-3" />
              </a>
            </p>
            <p className="text-sm text-gray-600">
              2. Select your project: <code className="bg-gray-100 px-2 py-1 rounded">tambola-74046</code>
            </p>
            <p className="text-sm text-gray-600">
              3. Verify your project configuration matches the app settings
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSetupSteps(prev => ({ ...prev, firebaseConfig: true }))}
            >
              Mark as Complete
            </Button>
          </div>
        </StepCard>

        <StepCard
          title="Step 2: Database Rules Configuration"
          completed={setupSteps.databaseRules}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Navigate to Realtime Database → Rules and replace with:
            </p>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg relative">
              <pre className="text-xs overflow-x-auto">{databaseRules}</pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2 text-gray-400 hover:text-white"
                onClick={() => handleCopyCode(databaseRules, "Database rules")}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSetupSteps(prev => ({ ...prev, databaseRules: true }))}
            >
              Rules Applied
            </Button>
          </div>
        </StepCard>

        <StepCard
          title="Step 3: Enable Authentication"
          completed={setupSteps.authentication}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              1. Go to Authentication → Sign-in method
            </p>
            <p className="text-sm text-gray-600">
              2. Enable <strong>Email/Password</strong> authentication
            </p>
            <p className="text-sm text-gray-600">
              3. Save the changes
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSetupSteps(prev => ({ ...prev, authentication: true }))}
            >
              Authentication Enabled
            </Button>
          </div>
        </StepCard>

        <StepCard
          title="Step 4: Create Initial Admin"
          completed={setupSteps.initialAdmin}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Create the first admin account to manage your Tambola system:
            </p>
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm font-medium text-blue-800">Default Admin Credentials:</p>
              <p className="text-sm text-blue-700">Email: admin@tambola.com</p>
              <p className="text-sm text-blue-700">Password: TambolaAdmin123!</p>
            </div>
            <Button
              onClick={handleSetupAdmin}
              disabled={isSettingUpAdmin}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSettingUpAdmin ? 'Creating Admin...' : 'Create Initial Admin'}
            </Button>
          </div>
        </StepCard>
      </div>

      {Object.values(setupSteps).every(Boolean) && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            🎉 Setup Complete! Your Firebase Tambola game is ready to use. 
            You can now login as admin and start creating games!
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-700">
            ✅ Login as admin using the credentials above
          </p>
          <p className="text-sm text-gray-700">
            ✅ Create host accounts for game management
          </p>
          <p className="text-sm text-gray-700">
            ✅ Start creating and hosting Tambola games
          </p>
          <p className="text-sm text-gray-700">
            ✅ Players can book tickets via WhatsApp integration
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
