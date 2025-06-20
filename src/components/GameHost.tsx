// src/components/GameHost.tsx - FIXED: Remove manual view control, add proper loading states
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { HostDisplay } from './HostDisplay';
import { TicketManagementGrid } from './TicketManagementGrid';
import { AudioManager } from './AudioManager';
import { 
  Plus,
  AlertCircle,
  RefreshCw,
  Save,
  Edit,
  Trash2,
  Loader2,
  CheckCircle,
  Clock
} from 'lucide-react';
import { 
  firebaseService, 
  HostUser
} from '@/services/firebase';
import { useGameData, useBookingStats } from '@/providers/GameDataProvider';
import { HostControlsProvider } from '@/providers/HostControlsProvider';

interface GameHostProps {
  user: HostUser;
  userRole: 'host';
}

interface GamePrize {
  id: string;
  name: string;
  pattern: string;
  description: string;
}

interface CreateGameForm {
  hostPhone: string;
  maxTickets: string;
  selectedTicketSet: string;
  selectedPrizes: string[];
}

// ✅ NEW: Operation states for better UX
interface OperationState {
  type: 'create' | 'delete' | null;
  inProgress: boolean;
  message: string;
}

// Available options
const TICKET_SETS = [
  {
    id: "1",
    name: "Standard Set",
    available: true,
    ticketCount: 600,
    description: "Traditional ticket set with balanced number distribution"
  },
  {
    id: "2", 
    name: "Premium Set",
    available: true,
    ticketCount: 600,
    description: "Premium ticket set with optimized winning patterns"
  }
];

const AVAILABLE_PRIZES: GamePrize[] = [
  {
    id: 'quickFive',
    name: 'Quick Five',
    pattern: 'First 5 numbers',
    description: 'First player to mark any 5 numbers'
  },
  {
    id: 'topLine',
    name: 'Top Line',
    pattern: 'Complete top row',
    description: 'Complete the top row of any ticket'
  },
  {
    id: 'middleLine',
    name: 'Middle Line',
    pattern: 'Complete middle row', 
    description: 'Complete the middle row of any ticket'
  },
  {
    id: 'bottomLine',
    name: 'Bottom Line',
    pattern: 'Complete bottom row',
    description: 'Complete the bottom row of any ticket'
  },
  {
    id: 'fullHouse',
    name: 'Full House',
    pattern: 'All numbers',
    description: 'Mark all numbers on the ticket'
  }
];

/**
 * GameHost Component - FIXED: Real-time driven view with proper loading states
 */
export const GameHost: React.FC<GameHostProps> = ({ user, userRole }) => {
  // ✅ REAL-TIME: Keep all existing real-time functionality
  const { gameData, currentPhase, isLoading, error } = useGameData();
  const { bookedCount } = useBookingStats();
  
  // ✅ FIXED: Remove currentView state - let real-time data drive everything
  // const [currentView, setCurrentView] = useState<'create' | 'booking' | 'live'>('create'); // REMOVED
  
  // ✅ NEW: Operation tracking for better UX during transitions
  const [operation, setOperation] = useState<OperationState>({
    type: null,
    inProgress: false,
    message: ''
  });
  
  // ✅ UNCHANGED: All existing state
  const [editMode, setEditMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    hostPhone: '',
    maxTickets: '100',
    selectedTicketSet: '1',
    selectedPrizes: ['quickFive', 'topLine', 'middleLine', 'bottomLine', 'fullHouse']
  });

  // ✅ UNCHANGED: All existing functions
  const isSubscriptionValid = React.useCallback(() => {
    const now = new Date();
    const endDate = new Date(user.subscriptionEndDate);
    return endDate > now && user.isActive;
  }, [user.subscriptionEndDate, user.isActive]);

  const getSubscriptionStatus = React.useCallback(() => {
    const now = new Date();
    const endDate = new Date(user.subscriptionEndDate);
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (!user.isActive) {
      return { message: 'Account is inactive', variant: 'destructive' as const };
    }
    
    if (daysLeft <= 0) {
      return { message: 'Subscription expired', variant: 'destructive' as const };
    }
    
    if (daysLeft <= 7) {
      return { message: `${daysLeft} days left`, variant: 'secondary' as const };
    }
    
    return { message: `Active until ${endDate.toLocaleDateString()}`, variant: 'default' as const };
  }, [user.subscriptionEndDate, user.isActive]);

  // ✅ UNCHANGED: Load previous settings
  useEffect(() => {
    const loadPreviousSettings = async () => {
      try {
        console.log('🔧 Loading previous host settings...');
        const settings = await firebaseService.getHostSettings(user.uid);
        if (settings) {
          console.log('✅ Previous settings loaded');
          setCreateGameForm(prev => ({
            ...prev,
            hostPhone: settings.hostPhone || prev.hostPhone,
            maxTickets: settings.maxTickets?.toString() || prev.maxTickets,
            selectedTicketSet: settings.selectedTicketSet || prev.selectedTicketSet,
            selectedPrizes: settings.selectedPrizes || prev.selectedPrizes
          }));
        }
      } catch (error) {
        console.error('Failed to load host settings:', error);
      }
    };

    loadPreviousSettings();
  }, [user.uid]);

  // ✅ REMOVED: Auto-detect view based on real-time data useEffect
  // The view is now determined purely by the render logic based on gameData and currentPhase

  // ✅ NEW: Clear operation state when real-time data updates
  useEffect(() => {
    if (operation.inProgress) {
      // Check if operation completed based on real-time data
      if (operation.type === 'create' && gameData) {
        console.log('✅ Create operation completed - game data received via real-time');
        setOperation({ type: null, inProgress: false, message: 'Game created successfully!' });
        // Clear success message after 3 seconds
        setTimeout(() => {
          setOperation({ type: null, inProgress: false, message: '' });
        }, 3000);
      } else if (operation.type === 'delete' && !gameData) {
        console.log('✅ Delete operation completed - game data cleared via real-time');
        setOperation({ type: null, inProgress: false, message: 'Game deleted successfully!' });
        // Clear success message after 3 seconds
        setTimeout(() => {
          setOperation({ type: null, inProgress: false, message: '' });
        }, 3000);
      }
    }
  }, [gameData, operation]);

  // ✅ FIXED: Updated createNewGame - remove manual view control
  const createNewGame = async () => {
    if (!isSubscriptionValid()) {
      alert('Your subscription has expired. Please contact the administrator.');
      return;
    }

    const maxTicketsNum = parseInt(createGameForm.maxTickets) || 100;

    setIsCreating(true);
    setOperation({
      type: 'create',
      inProgress: true,
      message: 'Creating game and setting up tickets...'
    });

    try {
      console.log('🎮 Starting game creation process...');
      
      await firebaseService.saveHostSettings(user.uid, {
        hostPhone: createGameForm.hostPhone,
        maxTickets: maxTicketsNum,
        selectedTicketSet: createGameForm.selectedTicketSet,
        selectedPrizes: createGameForm.selectedPrizes
      });

      const gameConfig = {
        name: `Tambola Game ${new Date().toLocaleDateString()}`,
        maxTickets: maxTicketsNum,
        ticketPrice: 0,
        hostPhone: createGameForm.hostPhone
      };

      const newGame = await firebaseService.createGame(
        gameConfig,
        user.uid,
        createGameForm.selectedTicketSet,
        createGameForm.selectedPrizes
      );
      
      console.log('✅ Game created successfully:', newGame.gameId);
      
      // ✅ FIXED: Remove manual view switch - let real-time data handle it
      // setCurrentView('booking'); // REMOVED
      // console.log('🎯 Switched to booking view immediately'); // REMOVED

      // ✅ NEW: Update operation state - real-time data will trigger view change
      setOperation(prev => ({
        ...prev,
        message: 'Game created! Waiting for real-time update...'
      }));

    } catch (error: any) {
      console.error('❌ Create game error:', error);
      setOperation({ type: null, inProgress: false, message: '' });
      alert(error.message || 'Failed to create game. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // ✅ UNCHANGED: Enhanced updateGameSettings function
  const updateGameSettings = async () => {
    if (!gameData) return;

    const maxTicketsNum = parseInt(createGameForm.maxTickets);
    if (isNaN(maxTicketsNum) || maxTicketsNum < 1) {
      alert('Please enter a valid number for max tickets');
      return;
    }

    if (createGameForm.selectedPrizes.length === 0) {
      alert('Please select at least one prize');
      return;
    }

    setIsCreating(true);
    try {
      // Update basic game data
      await firebaseService.updateGameData(gameData.gameId, {
        maxTickets: maxTicketsNum,
        hostPhone: createGameForm.hostPhone
      });

      // Save updated host settings
      await firebaseService.saveHostSettings(user.uid, {
        hostPhone: createGameForm.hostPhone,
        maxTickets: maxTicketsNum,
        selectedTicketSet: createGameForm.selectedTicketSet,
        selectedPrizes: createGameForm.selectedPrizes
      });
      
      setEditMode(false);
      console.log('✅ Game settings updated successfully');

    } catch (error: any) {
      console.error('Update game error:', error);
      alert(error.message || 'Failed to update game');
    } finally {
      setIsCreating(false);
    }
  };

  // ✅ FIXED: Updated deleteGame - remove manual view control
  const deleteGame = async () => {
    if (!gameData) return;

    const confirmed = window.confirm('Are you sure you want to delete this game? This action cannot be undone.');
    if (!confirmed) return;

    setIsCreating(true);
    setOperation({
      type: 'delete',
      inProgress: true,
      message: 'Deleting game...'
    });

    try {
      await firebaseService.deleteGame(gameData.gameId);
      console.log('✅ Game deleted successfully');
      
      // ✅ FIXED: Remove manual view switch - let real-time data handle it
      // setCurrentView('create'); // REMOVED
      // console.log('🎯 Switched to create view immediately'); // REMOVED

      // ✅ NEW: Update operation state - real-time data will trigger view change
      setOperation(prev => ({
        ...prev,
        message: 'Game deleted! Waiting for real-time update...'
      }));
      
    } catch (error: any) {
      console.error('Delete game error:', error);
      setOperation({ type: null, inProgress: false, message: '' });
      alert(error.message || 'Failed to delete game');
    } finally {
      setIsCreating(false);
    }
  };

  // ✅ UNCHANGED: Handle max tickets change
  const handleMaxTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setCreateGameForm(prev => ({ ...prev, maxTickets: value }));
    }
  };

  const subscriptionStatus = getSubscriptionStatus();

  // ✅ UNCHANGED: Loading state management
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 3000);
      
      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [isLoading]);

  // ✅ NEW: Determine current view based on real-time data (pure calculation)
  const getCurrentView = (): 'create' | 'booking' | 'live' => {
    if (!gameData) {
      return 'create';
    }
    
    if (currentPhase === 'countdown' || currentPhase === 'playing' || currentPhase === 'finished') {
      return 'live';
    }
    
    if (currentPhase === 'booking') {
      return 'booking';
    }
    
    return 'create';
  };

  const currentView = getCurrentView();

  // ✅ UNCHANGED: Loading and error states
  if (isLoading && loadingTimeout) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading Dashboard...</h2>
            <p className="text-gray-600">Setting up your host interface</p>
            <p className="text-sm text-gray-500 mt-2">If this takes too long, please refresh the page</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4 flex items-center justify-center">
        <Card className="border-red-300">
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ✅ UNCHANGED: Subscription validation
  if (!isSubscriptionValid()) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-800">Host Dashboard</h1>
            <p className="text-slate-600">Welcome back, {user.name}!</p>
          </div>

          <Card className="border-red-500">
            <CardHeader>
              <CardTitle className="flex items-center text-red-600">
                <AlertCircle className="w-6 h-6 mr-2" />
                Account Access Restricted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {subscriptionStatus.message}. Please contact the administrator to restore access to your account.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* ✅ UNCHANGED: Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Host Dashboard</h1>
            <p className="text-slate-600">Welcome back, {user.name}!</p>
            <Badge variant={subscriptionStatus.variant} className="mt-2">
              {subscriptionStatus.message}
            </Badge>
          </div>
        </div>

        {/* ✅ NEW: Operation Status Display */}
        {operation.message && (
          <Alert className={operation.inProgress ? "border-blue-500 bg-blue-50" : "border-green-500 bg-green-50"}>
            <div className="flex items-center">
              {operation.inProgress ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
              )}
              <AlertDescription className={operation.inProgress ? "text-blue-800" : "text-green-800"}>
                {operation.message}
                {operation.inProgress && operation.type === 'create' && (
                  <span className="block text-sm mt-1">Real-time system will automatically switch to booking view when ready.</span>
                )}
                {operation.inProgress && operation.type === 'delete' && (
                  <span className="block text-sm mt-1">Real-time system will automatically switch to create view when ready.</span>
                )}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* ✅ FIXED: Use calculated currentView instead of state */}
        {/* Create Game Form */}
        {currentView === 'create' && !editMode && (
          <CreateGameForm 
            createGameForm={createGameForm}
            setCreateGameForm={setCreateGameForm}
            onCreateGame={createNewGame}
            onMaxTicketsChange={handleMaxTicketsChange}
            isCreating={isCreating}
            operationInProgress={operation.inProgress}
          />
        )}

        {/* ✅ FIXED: Use calculated currentView instead of state */}
        {/* Booking Phase */}
        {currentView === 'booking' && gameData && !editMode && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">Game Ready for Booking</h2>
              <div className="flex space-x-2">
                <Button 
                  onClick={() => setEditMode(true)} 
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={operation.inProgress}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Settings
                </Button>
              </div>
            </div>

            {/* ✅ UNCHANGED: Real-time components continue working */}
            <HostControlsProvider userId={user.uid}>
              <HostDisplay />
            </HostControlsProvider>
            
            <TicketManagementGrid
              gameData={gameData}
              onRefreshGame={() => {}} // No manual refresh needed with subscriptions
            />
          </div>
        )}

        {/* ✅ UNCHANGED: Edit Game Form */}
        {currentView === 'booking' && gameData && editMode && (
          <EditGameForm
            gameData={gameData}
            createGameForm={createGameForm}
            setCreateGameForm={setCreateGameForm}
            onUpdateGame={updateGameSettings}
            onDeleteGame={deleteGame}
            onCancel={() => setEditMode(false)}
            onMaxTicketsChange={handleMaxTicketsChange}
            bookedCount={bookedCount}
            isCreating={isCreating}
            operationInProgress={operation.inProgress}
          />
        )}

        {/* ✅ FIXED: Use calculated currentView instead of state */}
        {/* Live Game Phases - Real-time continues working */}
        {currentView === 'live' && gameData && (
          <HostControlsProvider userId={user.uid}>
            <HostDisplay onCreateNewGame={createNewGame} />
          </HostControlsProvider>
        )}

        {/* ✅ UNCHANGED: Audio Manager - Real-time continues working */}
        {gameData && (
          <AudioManager
            currentNumber={gameData.gameState.currentNumber}
            prizes={Object.values(gameData.prizes)}
            forceEnable={true}
          />
        )}

        {/* ✅ ENHANCED: Development Debug Info */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="border-gray-300 bg-gray-50">
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">Debug: GameHost State</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 gap-4 text-xs">
                <div>
                  <span className="font-medium">View:</span> {currentView}
                </div>
                <div>
                  <span className="font-medium">Phase:</span> {currentPhase}
                </div>
                <div>
                  <span className="font-medium">Game ID:</span> {gameData?.gameId || 'None'}
                </div>
                <div>
                  <span className="font-medium">Loading:</span> {isLoading ? 'Yes' : 'No'}
                </div>
                <div>
                  <span className="font-medium">Edit:</span> {editMode ? 'Yes' : 'No'}
                </div>
                <div>
                  <span className="font-medium">Operation:</span> {operation.inProgress ? operation.type : 'None'}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

// ✅ ENHANCED: CreateGameForm component with operation status
const CreateGameForm = ({ 
  createGameForm, 
  setCreateGameForm, 
  onCreateGame, 
  onMaxTicketsChange, 
  isCreating,
  operationInProgress 
}: any) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center">
        <Plus className="w-6 h-6 mr-2" />
        Create New Tambola Game
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-6">
      {/* Host Phone */}
      <div>
        <Label htmlFor="host-phone">WhatsApp Phone Number (with country code)</Label>
        <Input
          id="host-phone"
          type="tel"
          placeholder="e.g., 919876543210"
          value={createGameForm.hostPhone}
          onChange={(e) => setCreateGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
          className="border-2 border-gray-200 focus:border-blue-400"
          disabled={operationInProgress}
        />
        <p className="text-sm text-gray-500 mt-1">Players will contact you on this number</p>
      </div>

      {/* Max Tickets */}
      <div>
        <Label htmlFor="max-tickets">Maximum Tickets</Label>
        <Input
          id="max-tickets"
          type="number"
          min="1"
          max="600"
          placeholder="Enter number of tickets"
          value={createGameForm.maxTickets}
          onChange={onMaxTicketsChange}
          className="border-2 border-gray-200 focus:border-blue-400"
          disabled={operationInProgress}
        />
        <p className="text-sm text-gray-500 mt-1">How many tickets can be sold for this game</p>
      </div>

      {/* Ticket Set Selection */}
      <div>
        <Label>Select Ticket Set</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {TICKET_SETS.map((ticketSet) => (
            <Card
              key={ticketSet.id}
              className={`cursor-pointer transition-all ${
                createGameForm.selectedTicketSet === ticketSet.id
                  ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-300'
                  : 'hover:shadow-md border-gray-200'
              } ${!ticketSet.available || operationInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !operationInProgress && ticketSet.available && setCreateGameForm(prev => ({ ...prev, selectedTicketSet: ticketSet.id }))}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`font-bold ${
                    createGameForm.selectedTicketSet === ticketSet.id ? 'text-blue-900' : 'text-gray-800'
                  }`}>{ticketSet.name}</h3>
                  <Badge 
                    variant={ticketSet.available ? "default" : "secondary"}
                    className={createGameForm.selectedTicketSet === ticketSet.id ? 'bg-blue-600 text-white' : ''}
                  >
                    {ticketSet.available ? 'Available' : 'Coming Soon'}
                  </Badge>
                </div>
                <p className={`text-sm mb-2 ${
                  createGameForm.selectedTicketSet === ticketSet.id ? 'text-blue-800' : 'text-gray-600'
                }`}>{ticketSet.description}</p>
                <p className={`text-xs ${
                  createGameForm.selectedTicketSet === ticketSet.id ? 'text-blue-700' : 'text-gray-500'
                }`}>{ticketSet.ticketCount} tickets</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Prize Selection */}
      <div>
        <Label>Select Prizes</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {AVAILABLE_PRIZES.map((prize) => (
            <div key={prize.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
              <Checkbox
                id={prize.id}
                checked={createGameForm.selectedPrizes.includes(prize.id)}
                disabled={operationInProgress}
                onCheckedChange={(checked) => {
                  if (operationInProgress) return;
                  
                  if (checked) {
                    setCreateGameForm(prev => ({
                      ...prev,
                      selectedPrizes: [...prev.selectedPrizes, prize.id]
                    }));
                  } else {
                    setCreateGameForm(prev => ({
                      ...prev,
                      selectedPrizes: prev.selectedPrizes.filter(id => id !== prize.id)
                    }));
                  }
                }}
              />
              <div className="flex-1">
                <Label htmlFor={prize.id} className="font-medium cursor-pointer">
                  {prize.name}
                </Label>
                <p className="text-sm text-gray-600">{prize.pattern}</p>
                <p className="text-xs text-gray-500">{prize.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <Button
        onClick={onCreateGame}
        disabled={isCreating || operationInProgress || !createGameForm.hostPhone.trim() || !createGameForm.maxTickets.trim() || createGameForm.selectedPrizes.length === 0}
        className="w-full bg-blue-600 hover:bg-blue-700"
        size="lg"
      >
        {isCreating ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Creating Game...
          </>
        ) : (
          'Create & Open Booking'
        )}
      </Button>
      
      {operationInProgress && (
        <div className="text-center text-sm text-blue-600">
          <Clock className="w-4 h-4 inline mr-1" />
          Real-time system will automatically update the view when ready
        </div>
      )}
    </CardContent>
  </Card>
);

// ✅ ENHANCED: EditGameForm component with operation status
const EditGameForm = ({ 
  gameData, 
  createGameForm, 
  setCreateGameForm, 
  onUpdateGame, 
  onDeleteGame, 
  onCancel, 
  onMaxTicketsChange, 
  bookedCount, 
  isCreating,
  operationInProgress
}: any) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center">
        <Edit className="w-6 h-6 mr-2" />
        Edit Game Settings
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You can edit game settings as long as the game hasn't started yet.
        </AlertDescription>
      </Alert>

      <div>
        <Label htmlFor="edit-host-phone">WhatsApp Phone Number</Label>
        <Input
          id="edit-host-phone"
          type="tel"
          value={createGameForm.hostPhone}
          onChange={(e) => setCreateGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
          className="border-2 border-gray-200 focus:border-blue-400"
          disabled={isCreating || operationInProgress}
        />
      </div>

      <div>
        <Label htmlFor="edit-max-tickets">Maximum Tickets</Label>
        <Input
          id="edit-max-tickets"
          type="number"
          min="1"
          max="600"
          placeholder="Enter number of tickets"
          value={createGameForm.maxTickets}
          onChange={onMaxTicketsChange}
          className="border-2 border-gray-200 focus:border-blue-400"
          disabled={isCreating || operationInProgress}
        />
        <p className="text-sm text-gray-500 mt-1">
          Current bookings: {bookedCount}. Cannot set below current bookings.
        </p>
      </div>

      {/* Ticket Set Selection */}
      <div>
        <Label>Select Ticket Set</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {TICKET_SETS.map((ticketSet) => (
            <Card
              key={ticketSet.id}
              className={`cursor-pointer transition-all ${
                createGameForm.selectedTicketSet === ticketSet.id
                  ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-300'
                  : 'hover:shadow-md border-gray-200'
              } ${!ticketSet.available || isCreating || operationInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !isCreating && !operationInProgress && ticketSet.available && setCreateGameForm(prev => ({ ...prev, selectedTicketSet: ticketSet.id }))}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`font-bold ${
                    createGameForm.selectedTicketSet === ticketSet.id ? 'text-blue-900' : 'text-gray-800'
                  }`}>{ticketSet.name}</h3>
                  <Badge 
                    variant={ticketSet.available ? "default" : "secondary"}
                    className={createGameForm.selectedTicketSet === ticketSet.id ? 'bg-blue-600 text-white' : ''}
                  >
                    {ticketSet.available ? 'Available' : 'Coming Soon'}
                  </Badge>
                </div>
                <p className={`text-sm mb-2 ${
                  createGameForm.selectedTicketSet === ticketSet.id ? 'text-blue-800' : 'text-gray-600'
                }`}>{ticketSet.description}</p>
                <p className={`text-xs ${
                  createGameForm.selectedTicketSet === ticketSet.id ? 'text-blue-700' : 'text-gray-500'
                }`}>{ticketSet.ticketCount} tickets</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Prize Selection */}
      <div>
        <Label>Select Prizes</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {AVAILABLE_PRIZES.map((prize) => (
            <div key={prize.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
              <Checkbox
                id={`edit-${prize.id}`}
                checked={createGameForm.selectedPrizes.includes(prize.id)}
                disabled={isCreating || operationInProgress}
                onCheckedChange={(checked) => {
                  if (isCreating || operationInProgress) return;
                  
                  if (checked) {
                    setCreateGameForm(prev => ({
                      ...prev,
                      selectedPrizes: [...prev.selectedPrizes, prize.id]
                    }));
                  } else {
                    setCreateGameForm(prev => ({
                      ...prev,
                      selectedPrizes: prev.selectedPrizes.filter(id => id !== prize.id)
                    }));
                  }
                }}
              />
              <div className="flex-1">
                <Label htmlFor={`edit-${prize.id}`} className="font-medium cursor-pointer">
                  {prize.name}
                </Label>
                <p className="text-sm text-gray-600">{prize.pattern}</p>
                <p className="text-xs text-gray-500">{prize.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex space-x-4">
        <Button
          onClick={onUpdateGame}
          disabled={isCreating || operationInProgress || !createGameForm.maxTickets.trim() || parseInt(createGameForm.maxTickets) < bookedCount}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {isCreating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          disabled={isCreating || operationInProgress}
        >
          Cancel
        </Button>
        <Button
          onClick={onDeleteGame}
          variant="destructive"
          disabled={isCreating || operationInProgress || bookedCount > 0}
          title={bookedCount > 0 ? 'Cannot delete game with booked tickets' : 'Delete this game'}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Game
        </Button>
      </div>
      
      {operationInProgress && (
        <div className="text-center text-sm text-blue-600">
          <Clock className="w-4 h-4 inline mr-1" />
          Real-time system will automatically update the view when ready
        </div>
      )}
    </CardContent>
  </Card>
);
