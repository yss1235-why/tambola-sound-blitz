// src/utils/setupAdmin.ts
import { setupInitialAdmin } from '@/services/firebase';

/**
 * Run this script once to create the initial admin user
 * You can call this function from the browser console or create a temporary component
 */
export async function runInitialSetup() {
  try {
    console.log('🚀 Starting initial admin setup...');
    
    const admin = await setupInitialAdmin();
    
    if (admin) {
      console.log('✅ Initial admin created successfully!');
      console.log('📧 Email:', admin.email);
      console.log('🔑 Password: Qwe123@');
      console.log('👤 Name:', admin.name);
      console.log('🆔 UID:', admin.uid);
      
      alert(`Initial admin setup complete!
Email: ${admin.email}
Password: Qwe123@!
Please save these credentials safely.`);
    } else {
      console.log('ℹ️ Admin already exists in the system');
      alert('Admin already exists in the system');
    }
  } catch (error) {
    console.error('❌ Initial setup failed:', error);
    alert(`Setup failed: ${error.message}`);
  }
}

// Temporary setup component for easier execution
export const SetupComponent: React.FC = () => {
  const [isSetupComplete, setIsSetupComplete] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSetup = async () => {
    setIsLoading(true);
    try {
      await runInitialSetup();
      setIsSetupComplete(true);
    } catch (error) {
      console.error('Setup error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSetupComplete) {
    return (
      <div className="p-4 bg-green-100 border border-green-400 rounded">
        <h3 className="text-green-800 font-bold">Setup Complete!</h3>
        <p className="text-green-700">Initial admin has been created. You can now login.</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-blue-100 border border-blue-400 rounded">
      <h3 className="text-blue-800 font-bold">Initial Setup Required</h3>
      <p className="text-blue-700 mb-4">
        Click the button below to create the initial admin user.
      </p>
      <button
        onClick={handleSetup}
        disabled={isLoading}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {isLoading ? 'Setting up...' : 'Create Initial Admin'}
      </button>
    </div>
  );
};

// Console helper function
declare global {
  interface Window {
    setupTambolaAdmin: () => Promise<void>;
  }
}

// Make the function available globally for console access
if (typeof window !== 'undefined') {
  window.setupTambolaAdmin = runInitialSetup;
}

export default runInitialSetup;
