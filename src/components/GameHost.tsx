// src/components/GameHost.tsx - COMPLETE: Single Source of Truth Implementation + Expansion-Only Tickets

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
import { SimplifiedWinnerDisplay } from './SimplifiedWinnerDisplay';
import { useHostControls } from '@/providers/HostControlsProvider';
import {
  Plus,
  AlertCircle,
  RefreshCw,
  Save,
  Edit,
  Trash2,
  Loader2,
  CheckCircle,
  Clock,
  Users,
  Phone,
  Ticket,
  Settings,
  Crown,
  Timer
} from 'lucide-react';
import {
  firebaseService,
  HostUser,
  GameData
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
  order: number;
  difficulty: string;
}

interface CreateGameForm {
  hostPhone: string;
  maxTickets: string;
  selectedTicketSet: string;
  selectedPrizes: string[];
}

type UIState = 'calculated' | 'winners' | 'setup';

interface OperationState {
  type: 'create' | 'delete' | null;
  inProgress: boolean;
  message: string;
}

// Available ticket sets
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

// Available prizes with difficulty indicators
const AVAILABLE_PRIZES: GamePrize[] = [
  {
    id: 'fullHouse',
    name: 'Full House',
    pattern: '',
    description: '',
    order: 1,
    difficulty: ''
  },
  {
    id: 'secondFullHouse',
    name: 'Second Full House',
    pattern: '',
    description: '',
    order: 2,
    difficulty: ''
  },
  {
    id: 'fullSheet', // MINIMAL CHANGE: Added Full Sheet
    name: 'Full Sheet',
    pattern: '',
    description: '',
    order: 3,
    difficulty: ''
  },
  {
    id: 'halfSheet',
    name: 'Half Sheet',
    pattern: '',
    description: '',
    order: 4,
    difficulty: ''
  },
  {
    id: 'starCorner',
    name: 'Star Corner',
    pattern: '',
    description: '',
    order: 5,
    difficulty: ''
  },
  {
    id: 'corners',
    name: 'Four Corners',
    pattern: '',
    description: '',
    order: 6,
    difficulty: ''
  },
  {
    id: 'topLine',
    name: 'Top Line',
    pattern: '',
    description: '',
    order: 7,
    difficulty: ''
  },
  {
    id: 'middleLine',
    name: 'Middle Line',
    pattern: '',
    description: '',
    order: 8,
    difficulty: ''
  },
  {
    id: 'bottomLine',
    name: 'Bottom Line',
    pattern: '',
    description: '',
    order: 9,
    difficulty: ''
  },


  {
    id: 'earlyFive',
    name: 'Early Five',
    pattern: '',
    description: '',
    order: 10,
    difficulty: ''
  }

];

// Helper component to connect AudioManager with HostControls
// SECURE: Host-only component with full controls
const AudioManagerForHost: React.FC<{
  currentNumber: number | null;
  prizes: any[];
  forceEnable: boolean;
  gameState: any;
  lastWinnerAnnouncement?: string;  // FIX: Add missing prop for prize announcements
}> = ({ currentNumber, prizes, forceEnable, gameState, lastWinnerAnnouncement }) => {
  const {
    handleAudioComplete,
    handlePrizeAudioComplete,
    handleAudioStarted,
    speechRate
  } = useHostControls();

  return (
    <AudioManager
      currentNumber={currentNumber}
      prizes={prizes}
      gameState={gameState}
      lastWinnerAnnouncement={lastWinnerAnnouncement}  // FIX: Pass to AudioManager
      onAudioComplete={handleAudioComplete}
      onPrizeAudioComplete={handlePrizeAudioComplete}
      onAudioStarted={handleAudioStarted}
      forceEnable={forceEnable}
      speechRate={speechRate}
    />
  );
};

// SECURE: Player-only component with NO host controls
const AudioManagerForPlayer: React.FC<{
  currentNumber: number | null;
  prizes: any[];
  gameState?: any;
}> = ({ currentNumber, prizes, gameState }) => {
  return (
    <AudioManager
      currentNumber={currentNumber}
      prizes={prizes}
      gameState={gameState}
      forceEnable={false}
    // NO host callbacks - players cannot control game timing
    />
  );
};
export const GameHost: React.FC<GameHostProps> = ({ user }) => {
  const { gameData, currentPhase, isLoading, error } = useGameData();
  const { bookedCount } = useBookingStats();

  // ================== SAFETY AND VALIDATION UTILITIES ==================

  /**
   * VALIDATION: Comprehensive input validation + NEW: Expansion-only validation
   */
  const validateGameSettings = (formData: CreateGameForm, gameData: GameData): {
    isValid: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];

    const maxTickets = parseInt(formData.maxTickets);
    if (isNaN(maxTickets) || maxTickets < 1) {
      errors.push('Max tickets must be a valid number (minimum 1)');
    }
    if (maxTickets > 600) {
      errors.push('Max tickets cannot exceed 600');
    }

    const bookedCount = Object.values(gameData.tickets || {})
      .filter(ticket => ticket.isBooked).length;
    if (maxTickets < bookedCount) {
      errors.push(`Cannot set max tickets (${maxTickets}) below current bookings (${bookedCount})`);
    }

    // NEW: Validate ticket reduction (expansion-only approach)
    const currentMaxTickets = gameData.maxTickets;
    if (maxTickets < currentMaxTickets) {
      errors.push(`Cannot reduce tickets from ${currentMaxTickets} to ${maxTickets}. You can only increase the ticket count. To reduce tickets, create a new game instead.`);
    }

    if (!formData.hostPhone?.trim()) {
      errors.push('Host phone number is required');
    }

    if (!formData.selectedPrizes || formData.selectedPrizes.length === 0) {
      errors.push('At least one prize must be selected');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  /**
   * SAFETY: Check if update is safe to perform
   */
  const canUpdateGameSettings = (gameData: GameData): {
    canUpdate: boolean;
    reason?: string;
  } => {
    if (gameData.gameState.isActive) {
      return { canUpdate: false, reason: 'Game is currently active' };
    }

    if (gameData.gameState.isCountdown) {
      return { canUpdate: false, reason: 'Game is starting (countdown active)' };
    }

    if (gameData.gameState.gameOver) {
      return { canUpdate: false, reason: 'Game has already ended' };
    }

    const numbersCalledCount = gameData.gameState.calledNumbers?.length || 0;
    if (numbersCalledCount > 0) {
      return { canUpdate: false, reason: 'Numbers have already been called' };
    }

    return { canUpdate: true };
  };

  /**
   * MONITORING: Operation status tracking
   */
  const logUpdateOperation = (
    phase: 'start' | 'validation' | 'live_update' | 'template_update' | 'success' | 'error',
    data?: any
  ) => {
    const timestamp = new Date().toISOString();
    const gameId = gameData?.gameId || 'unknown';

    switch (phase) {
      case 'start':
        break;
      case 'validation':
        break;
      case 'live_update':
        break;
      case 'template_update':
        break;
      case 'success':
        break;
      case 'error':
        break;
    }
  };

  // ================== STATE MANAGEMENT ==================

  const [operation, setOperation] = useState<OperationState>({
    type: null,
    inProgress: false,
    message: ''
  });
  const [editMode, setEditMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    hostPhone: '',
    maxTickets: '100',
    selectedTicketSet: '1',
    selectedPrizes: ['quickFive', 'topLine', 'middleLine', 'bottomLine', 'fullHouse']
  });
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [gameCreationError, setGameCreationError] = useState<string | null>(null);

  // Component-level state for winner display management
  const [uiState, setUIState] = useState<UIState>('calculated');
  const [cachedWinnerData, setCachedWinnerData] = useState<GameData | null>(null);

  // ================== SUBSCRIPTION VALIDATION ==================

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

  // ================== ENHANCED SINGLE SOURCE UPDATE + EXPANSION ==================

  /**
   * ENHANCED SINGLE SOURCE UPDATE: Complete settings update with safety checks + NEW EXPANSION LOGIC
   * CRITICAL: This updates BOTH live game data AND host template + handles ticket expansion
   */
  const updateGameSettings = async () => {
    if (!gameData) {
      alert('No active game found');
      return;
    }

    if (!user?.uid) {
      alert('User not authenticated');
      return;
    }

    logUpdateOperation('start');

    // Step 1: Input validation
    const validation = validateGameSettings(createGameForm, gameData);
    if (!validation.isValid) {
      alert('Validation failed:\n' + validation.errors.join('\n'));
      return;
    }

    // Step 2: Safety checks
    const safetyCheck = canUpdateGameSettings(gameData);
    if (!safetyCheck.canUpdate) {
      alert(`Cannot update settings: ${safetyCheck.reason}`);
      return;
    }

    logUpdateOperation('validation');

    // Step 3: Prepare update data
    const maxTicketsNum = parseInt(createGameForm.maxTickets);
    const updateData = {
      maxTickets: maxTicketsNum,
      hostPhone: createGameForm.hostPhone.trim(),
      selectedPrizes: [...createGameForm.selectedPrizes], // Create copy to avoid mutations
      selectedTicketSet: createGameForm.selectedTicketSet
    };

    setIsCreating(true);

    try {
      // UPDATED: Handle ticket expansion and other updates
      logUpdateOperation('live_update');

      const currentMaxTickets = gameData.maxTickets;
      const newMaxTickets = maxTicketsNum;

      // Check if we need to expand tickets
      if (newMaxTickets > currentMaxTickets) {

        // Use expansion method for ticket count increase
        await firebaseService.expandGameTickets(
          gameData.gameId,
          newMaxTickets,
          createGameForm.selectedTicketSet
        );

        // Update host template separately (expansion method doesn't handle template)
        await firebaseService.updateHostTemplate(user.uid, {
          hostPhone: createGameForm.hostPhone.trim(),
          maxTickets: newMaxTickets,
          selectedTicketSet: createGameForm.selectedTicketSet,
          selectedPrizes: createGameForm.selectedPrizes
        });
      }
      else {
        // No ticket expansion needed - use existing update method

        await firebaseService.updateGameAndTemplate(
          gameData.gameId,
          user.uid,
          updateData
        );
      }

      logUpdateOperation('success');

      // Step 5: Update UI state
      setEditMode(false);

      // Note: Real-time listeners will automatically update the UI
      // No manual state updates needed

    } catch (error: any) {
      logUpdateOperation('error', error);

      // Step 6: User-friendly error handling
      let errorMessage = 'Failed to update game settings';

      if (error.message.includes('below current bookings')) {
        errorMessage = error.message;
      } else if (error.message.includes('active') || error.message.includes('starting')) {
        errorMessage = 'Cannot change settings while game is running or starting';
      } else if (error.message.includes('Transaction failed')) {
        errorMessage = 'Update failed due to database conflict. Please try again.';
      } else if (error.message.includes('network') || error.message.includes('offline')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message.includes('expand') || error.message.includes('expansion')) {
        errorMessage = `Ticket expansion failed: ${error.message}`;
      } else if (error.message) {
        errorMessage = error.message;
      }

      alert(errorMessage);

    } finally {
      setIsCreating(false);
    }
  };

  // ================== ENHANCED CREATE NEW GAME ==================

  const createNewGame = async () => {
    // UI-LEVEL PROTECTION: Prevent rapid clicking
    if (isCreating) {
      alert('Game creation already in progress. Please wait...');
      return;
    }

    // SAFETY: Additional validation before game creation
    if (!user?.uid) {
      alert('User authentication required');
      return;
    }

    if (!isSubscriptionValid()) {
      alert('Your subscription has expired. Please contact the administrator.');
      return;
    }

    // Validate form inputs
    const maxTicketsNum = parseInt(createGameForm.maxTickets);
    if (isNaN(maxTicketsNum) || maxTicketsNum < 1 || maxTicketsNum > 600) {
      alert('Please enter valid max tickets (1-600)');
      return;
    }

    if (!createGameForm.hostPhone.trim()) {
      alert('Please enter your phone number');
      return;
    }

    if (createGameForm.selectedPrizes.length === 0) {
      alert('Please select at least one prize');
      return;
    }

    setIsCreating(true);
    setGameCreationError(null);
    setOperation({
      type: 'create',
      inProgress: true,
      message: 'Creating game and setting up tickets...'
    });

    try {

      // If we have cached winner data, delete the old game BEFORE creating new one
      // FIXED: Only clear UI cache, cleanup will happen after successful creation
      if (cachedWinnerData) {
        try {
          await firebaseService.deleteGame(cachedWinnerData.gameId);
        } catch (deleteError) {
          // Continue with creation even if deletion fails
        }
        setCachedWinnerData(null);
      }

      // Save host template settings
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

      setUIState('calculated');

      setOperation(prev => ({
        ...prev,
        message: 'Game created! Waiting for real-time update...'
      }));

    } catch (error: any) {
      setOperation({ type: null, inProgress: false, message: '' });
      setGameCreationError(error.message);

      // Show user-friendly error messages
      if (error.message.includes('already has an active game')) {
        alert('You already have an active game running. Please complete or delete it first.');
      } else if (error.message.includes('already creating a game')) {
        alert('Game creation is already in progress. Please wait a moment.');
      } else {
        alert(error.message || 'Failed to create game. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  // ================== OTHER EVENT HANDLERS ==================

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

      setOperation(prev => ({
        ...prev,
        message: 'Game deleted! Waiting for real-time update...'
      }));

    } catch (error: any) {
      setOperation({ type: null, inProgress: false, message: '' });
      alert(error.message || 'Failed to delete game');
    } finally {
      setIsCreating(false);
    }
  };

  const handleMaxTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setCreateGameForm(prev => ({ ...prev, maxTickets: value }));
    }
  };

  const handleCreateNewGameFromWinners = React.useCallback(() => {
    const confirmed = window.confirm(
      'Create New Game\n\n' +
      'This will clear the winner display and take you to game setup.\n\n' +
      'The winner information will be removed from view but you can note down contact details now.\n\n' +
      'Continue to create a new game?'
    );

    if (confirmed) {
      setUIState('setup');
    } else {
    }
  }, []);

  // ================== USEEFFECTS ==================

  // Load previous settings
  useEffect(() => {
    const loadPreviousSettings = async () => {
      try {
        const settings = await firebaseService.getHostSettings(user.uid);
        if (settings) {
          setCreateGameForm(prev => ({
            ...prev,
            hostPhone: settings.hostPhone || prev.hostPhone,
            maxTickets: settings.maxTickets?.toString() || prev.maxTickets,
            selectedTicketSet: settings.selectedTicketSet || prev.selectedTicketSet,
            selectedPrizes: settings.selectedPrizes || prev.selectedPrizes
          }));
        }
      } catch (error) {
      }
    };

    loadPreviousSettings();
  }, [user.uid]);

  // Handle game completion and winner display
  useEffect(() => {
    if (gameData?.gameState.gameOver && uiState === 'calculated') {
      setCachedWinnerData(gameData);
      setUIState('winners');
    }

    if (!gameData && uiState === 'winners' && cachedWinnerData) {
      setUIState('setup');
    }
  }, [gameData?.gameState.gameOver, gameData, uiState, cachedWinnerData]);

  // Clear operation state when real-time data updates
  useEffect(() => {
    if (operation.inProgress) {
      if (operation.type === 'create' && gameData) {
        setOperation({ type: null, inProgress: false, message: 'Game created successfully!' });
        setTimeout(() => {
          setOperation({ type: null, inProgress: false, message: '' });
        }, 3000);
      } else if (operation.type === 'delete' && !gameData) {
        setOperation({ type: null, inProgress: false, message: 'Game deleted successfully!' });
        setTimeout(() => {
          setOperation({ type: null, inProgress: false, message: '' });
        }, 3000);
      }
    }
  }, [gameData, operation]);


  // ================== VIEW CALCULATION ==================

  const getCurrentView = (): 'create' | 'booking' | 'live' | 'winners' | 'setup' => {
    // View calculation log removed for performance

    if (uiState === 'winners') {
      return 'winners';
    }
    if (uiState === 'setup') {
      return 'setup';
    }
    if (!gameData) {
      return 'setup';
    }
    if (gameData.gameState.gameOver) {
      return 'winners';
    }
    // FIXED: Include paused games with called numbers as 'live'
    if (gameData.gameState.isActive || gameData.gameState.isCountdown ||
      (gameData.gameState.calledNumbers && gameData.gameState.calledNumbers.length > 0)) {
      return 'live';
    }
    return 'booking';
  };
  const currentView = getCurrentView();
  const subscriptionStatus = getSubscriptionStatus();

  // ================== LOADING STATES ==================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading game data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Game</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isSubscriptionValid()) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Subscription Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Your subscription has expired. Please contact the administrator to renew your subscription.
            </p>
            <Button onClick={() => window.location.reload()}>
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ================== MAIN RENDER ==================

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Unified Header */}
        <div className="flex justify-between items-center mb-6 p-4 bg-card rounded-lg shadow-sm border">
          <div className="flex items-center space-x-4">
            <span className="text-lg font-semibold text-foreground">Welcome, {user.name}</span>
            <Badge variant={subscriptionStatus.variant} className="text-xs">
              {subscriptionStatus.message}
            </Badge>
            {(currentView === 'booking' || currentView === 'live') && (
              <Badge variant={currentView === 'booking' ? 'outline' : 'default'} className="text-xs text-foreground">
                {currentView === 'booking' && 'Booking Open'}
                {currentView === 'live' && '�� Live Game'}
              </Badge>
            )}
          </div>
          {(currentView === 'booking' || currentView === 'live') && gameData && (
            <Button
              onClick={() => setEditMode(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={operation.inProgress}
              size="sm"
            >
              <Edit className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline"></span>Edit
            </Button>
          )}
        </div>

        {/* Status Display */}
        {operation.inProgress && (
          <Card className="mb-6 border-primary/30 bg-primary/10">
            <CardContent className="py-4">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                <span className="text-primary">{operation.message}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game Setup Phase */}
        {currentView === 'setup' && (
          <CreateGameForm
            createGameForm={createGameForm}
            setCreateGameForm={setCreateGameForm}
            onCreateGame={createNewGame}
            onMaxTicketsChange={handleMaxTicketsChange}
            isCreating={isCreating}
            operationInProgress={operation.inProgress}
            isFromWinners={!!cachedWinnerData}
          />
        )}

        {/* Winners Display Phase */}
        {currentView === 'winners' && cachedWinnerData && (
          <SimplifiedWinnerDisplay
            gameData={cachedWinnerData}
            onCreateNewGame={handleCreateNewGameFromWinners}
          />
        )}

        {/* Game Booking Phase */}
        {currentView === 'booking' && gameData && !editMode && (
          <div className="space-y-6">

            <HostControlsProvider userId={user.uid}>
              <HostDisplay />
            </HostControlsProvider>

            <TicketManagementGrid
              gameData={gameData}
              onRefreshGame={() => { }}
            />
          </div>
        )}

        {/* Edit Game Form */}
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


        {/* Live Game Phases */}
        {currentView === 'live' && gameData && (
          <div className="space-y-4">

            <HostControlsProvider userId={user.uid}>
              <HostDisplay onCreateNewGame={createNewGame} />
              <AudioManagerForHost
                currentNumber={gameData.gameState.currentNumber}
                prizes={Object.values(gameData.prizes)}
                forceEnable={true}
                gameState={gameData.gameState}
                lastWinnerAnnouncement={gameData.lastWinnerAnnouncement}  // FIX: Pass prize announcement
              />
            </HostControlsProvider>
          </div>
        )}

        {/* Development Debug Info */}

        {process.env.NODE_ENV === 'development' && (
          <Card className="border-border bg-muted mt-6">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Debug: GameHost State</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-4 text-xs">
                <div>
                  <span className="font-medium">View:</span> {currentView}
                </div>
                <div>
                  <span className="font-medium">UI State:</span> {uiState}
                </div>
                <div>
                  <span className="font-medium">Phase:</span> {currentPhase}
                </div>
                <div>
                  <span className="font-medium">Game ID:</span> {gameData?.gameId || 'None'}
                </div>
                <div>
                  <span className="font-medium">Cached:</span> {cachedWinnerData?.gameId || 'None'}
                </div>
                <div>
                  <span className="font-medium">Loading:</span> {isLoading ? 'Yes' : 'No'}
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

// ================== FORM COMPONENTS ==================

const CreateGameForm = ({
  createGameForm,
  setCreateGameForm,
  onCreateGame,
  onMaxTicketsChange,
  isCreating,
  operationInProgress,
  isFromWinners = false
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
        <Label htmlFor="hostPhone" className="flex items-center mb-2">
          <Phone className="w-4 h-4 mr-2" />
          Your WhatsApp Number
        </Label>
        <Input
          id="hostPhone"
          type="tel"
          value={createGameForm.hostPhone}
          onChange={(e) => setCreateGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
          placeholder="Enter your WhatsApp number"
          disabled={isCreating || operationInProgress}
        />
      </div>

      {/* Max Tickets */}
      <div>
        <Label htmlFor="maxTickets" className="flex items-center mb-2">
          <Ticket className="w-4 h-4 mr-2" />
          Maximum Tickets
        </Label>
        <Input
          id="maxTickets"
          type="number"
          min="1"
          max="600"
          value={createGameForm.maxTickets}
          onChange={onMaxTicketsChange}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          placeholder="Enter maximum tickets (1-600)"
          disabled={isCreating || operationInProgress}
        />
      </div>

      {/* Ticket Set Selection */}
      <div>
        <Label className="flex items-center mb-3">
          <Settings className="w-4 h-4 mr-2" />
          Ticket Set
        </Label>
        <div className="grid grid-cols-1 gap-3">
          {TICKET_SETS.map(set => (
            <div
              key={set.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${createGameForm.selectedTicketSet === set.id
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/40'
                } ${(!set.available || isCreating || operationInProgress) ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (set.available && !isCreating && !operationInProgress) {
                  setCreateGameForm(prev => ({ ...prev, selectedTicketSet: set.id }));
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      checked={createGameForm.selectedTicketSet === set.id}
                      onChange={() => { }}
                      className="mr-3"
                      disabled={!set.available || isCreating || operationInProgress}
                    />
                    <h3 className="font-medium">{set.name}</h3>
                    <Badge variant="outline" className="ml-2 text-xs">
                      {set.ticketCount} tickets
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{set.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prize Selection */}
      <div>
        <Label className="flex items-center mb-3">
          <Crown className="w-4 h-4 mr-2" />
          Select Prizes
        </Label>
        <div className="grid grid-cols-1 gap-3">
          {AVAILABLE_PRIZES
            .sort((a, b) => a.order - b.order)
            .map(prize => (
              <div key={prize.id} className="flex items-start space-x-3">
                <Checkbox
                  id={prize.id}
                  checked={createGameForm.selectedPrizes.includes(prize.id)}
                  onCheckedChange={(checked) => {
                    if (isCreating || operationInProgress) return;

                    setCreateGameForm(prev => ({
                      ...prev,
                      selectedPrizes: checked
                        ? [...prev.selectedPrizes, prize.id]
                        : prev.selectedPrizes.filter(id => id !== prize.id)
                    }));
                  }}
                  disabled={isCreating || operationInProgress}
                />
                <div className="flex-1">
                  <Label htmlFor={prize.id} className="flex items-center">
                    {prize.name}
                    <Badge
                      variant="outline"
                      className={`ml-2 text-xs ${prize.difficulty === 'easy' ? 'text-accent border-accent/40' :
                        prize.difficulty === 'medium' ? 'text-primary border-primary/40' :
                          prize.difficulty === 'hard' ? 'text-secondary-foreground border-secondary/40' :
                            'text-destructive border-destructive/40'
                        }`}
                    >
                      {prize.difficulty}
                    </Badge>

                  </Label>
                  <p className="text-sm text-muted-foreground">{prize.description}</p>
                </div>
              </div>
            ))}
        </div>
      </div>

      <Button
        onClick={onCreateGame}
        disabled={isCreating || operationInProgress || !createGameForm.hostPhone.trim() || !createGameForm.maxTickets.trim() || createGameForm.selectedPrizes.length === 0}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
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
        <div className="text-center text-sm text-primary">
          <Clock className="w-4 h-4 inline mr-1" />
          Real-time system will automatically update the view when ready
        </div>
      )}


    </CardContent>
  </Card>
);

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
          You can edit game settings as long as the game hasn't started yet. Ticket expansion is supported - you can only increase the ticket count.
        </AlertDescription>
      </Alert>

      {/* Current Stats */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{bookedCount}</p>
          <p className="text-sm text-muted-foreground">Booked</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-accent">{gameData.maxTickets - bookedCount}</p>
          <p className="text-sm text-muted-foreground">Available</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{gameData.maxTickets}</p>
          <p className="text-sm text-muted-foreground">Total</p>
        </div>
      </div>

      {/* NEW: Expansion Notice */}
      {parseInt(createGameForm.maxTickets) > gameData.maxTickets && (
        <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
          <p className="text-sm text-primary font-medium">
            �� Ticket Expansion Detected
          </p>
          <p className="text-xs text-primary/80 mt-1">
            Will expand from {gameData.maxTickets} to {createGameForm.maxTickets} tickets (+{parseInt(createGameForm.maxTickets) - gameData.maxTickets} new tickets). All existing bookings will be preserved.
          </p>
        </div>
      )}

      {/* Host Phone */}
      <div>
        <Label htmlFor="editHostPhone" className="flex items-center mb-2">
          <Phone className="w-4 h-4 mr-2" />
          Your WhatsApp Number
        </Label>
        <Input
          id="editHostPhone"
          type="tel"
          value={createGameForm.hostPhone}
          onChange={(e) => setCreateGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
          disabled={isCreating || operationInProgress}
        />
      </div>

      {/* Max Tickets */}
      <div>
        <Label htmlFor="editMaxTickets" className="flex items-center mb-2">
          <Ticket className="w-4 h-4 mr-2" />
          Maximum Tickets
        </Label>
        <Input
          id="editMaxTickets"
          type="number"
          min={gameData.maxTickets} // NEW: Prevent reduction
          max="600"
          value={createGameForm.maxTickets}
          onChange={onMaxTicketsChange}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          disabled={isCreating || operationInProgress}
        />
        <p className="text-sm text-muted-foreground mt-1">
          Can only increase tickets (current: {gameData.maxTickets}, minimum: {gameData.maxTickets})
        </p>
      </div>

      {/* Prize Selection */}
      <div>
        <Label className="flex items-center mb-3">
          <Crown className="w-4 h-4 mr-2" />
          Update Prizes
        </Label>
        <div className="grid grid-cols-1 gap-3">
          {AVAILABLE_PRIZES
            .sort((a, b) => a.order - b.order)
            .map(prize => (
              <div key={prize.id} className="flex items-start space-x-3">
                <Checkbox
                  id={`edit-${prize.id}`}
                  checked={createGameForm.selectedPrizes.includes(prize.id)}
                  onCheckedChange={(checked) => {
                    if (isCreating || operationInProgress) return;

                    setCreateGameForm(prev => ({
                      ...prev,
                      selectedPrizes: checked
                        ? [...prev.selectedPrizes, prize.id]
                        : prev.selectedPrizes.filter(id => id !== prize.id)
                    }));
                  }}
                  disabled={isCreating || operationInProgress}
                />
                <div className="flex-1">
                  <Label htmlFor={`edit-${prize.id}`} className="flex items-center">
                    {prize.name}
                    <Badge
                      variant="outline"
                      className={`ml-2 text-xs ${prize.difficulty === 'easy' ? 'text-accent border-accent/40' :
                        prize.difficulty === 'medium' ? 'text-primary border-primary/40' :
                          prize.difficulty === 'hard' ? 'text-secondary-foreground border-secondary/40' :
                            'text-destructive border-destructive/40'
                        }`}
                    >
                      {prize.difficulty}
                    </Badge>

                    {gameData.prizes[prize.id]?.won && (
                      <Badge variant="default" className="ml-2 text-xs bg-accent text-accent-foreground">
                        Won
                      </Badge>
                    )}
                  </Label>
                  <p className="text-sm text-muted-foreground">{prize.description}</p>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="flex space-x-4">
        <Button
          onClick={onUpdateGame}
          disabled={isCreating || operationInProgress}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {parseInt(createGameForm.maxTickets) > gameData.maxTickets ? 'Expanding...' : 'Updating...'}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {parseInt(createGameForm.maxTickets) > gameData.maxTickets ? 'Expand & Update' : 'Update Settings'}
            </>
          )}
        </Button>
        <Button
          onClick={onCancel}
          disabled={operationInProgress}
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          onClick={onDeleteGame}
          disabled={operationInProgress}
          variant="destructive"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Game
        </Button>
      </div>
    </CardContent>
  </Card>
);

export default GameHost;

