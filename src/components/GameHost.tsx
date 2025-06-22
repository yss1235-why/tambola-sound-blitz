// src/components/GameHost.tsx - COMPLETE: Single Source of Truth Implementation + Expansion-Only Tickets

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { HostControlsProvider, useHostControls } from '@/providers/HostControlsProvider';

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

/**
 * ✅ MONITORING: Operation status tracking
 */
const logUpdateOperation = (
  phase: 'start' | 'validation' | 'live_update' | 'template_update' | 'success' | 'error',
  gameData?: GameData | null,
  data?: any
) => {
  const timestamp = new Date().toISOString();
  const gameId = gameData?.gameId || 'unknown';
  
  switch (phase) {
    case 'start':
      console.log(`🔧 [${timestamp}] Starting settings update for game: ${gameId}`);
      break;
    case 'validation':
      console.log(`✅ [${timestamp}] Validation passed for game: ${gameId}`);
      break;
    case 'live_update':
      console.log(`📡 [${timestamp}] Updating live game data for: ${gameId}`);
      break;
    case 'template_update':
      console.log(`💾 [${timestamp}] Updating host template for: ${gameId}`);
      break;
    case 'success':
      console.log(`🎉 [${timestamp}] Settings update completed for: ${gameId}`);
      break;
    case 'error':
      console.error(`❌ [${timestamp}] Settings update failed for: ${gameId}`, data);
      break;
  }
};

// ================== MAIN COMPONENT ==================

const GameHostInner: React.FC<GameHostProps> = ({ user }) => {
  const { gameData, currentPhase, isLoading, error, reloadData } = useGameData();
  const { bookedCount, availableCount } = useBookingStats();
  
  // 🔧 ONLY NEW ADDITION: Get pause state from HostControlsProvider
  const hostControls = useHostControls();
  const { isPaused, pauseRequestedRef } = hostControls || { 
    isPaused: false, 
    pauseRequestedRef: { current: false } 
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
    selectedPrizes: ['earlyFive', 'halfSheet', 'topLine', 'fullHouse']
  });

  // Component-level state for winner display management
  const [uiState, setUIState] = useState<UIState>('calculated');
  const [cachedWinnerData, setCachedWinnerData] = useState<GameData | null>(null);

  // Game control state
  const [callInterval, setCallInterval] = useState(5);
  const [isCallingNumber, setIsCallingNumber] = useState(false);
  const [isWaitingForAudio, setIsWaitingForAudio] = useState(false);

  // Refs for game control
  const gameActiveRef = useRef(false);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // ================== GAME MANAGEMENT FUNCTIONS ==================

  /**
   * ✅ VALIDATION: Complete form validation
   */
  const validateGameSettings = (formData: CreateGameForm, gameData?: GameData): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    const maxTicketsNum = parseInt(formData.maxTickets);
    if (isNaN(maxTicketsNum) || maxTicketsNum < 1 || maxTicketsNum > 600) {
      errors.push('Max tickets must be between 1 and 600');
    }
    
    if (gameData && maxTicketsNum < bookedCount) {
      errors.push(`Cannot reduce max tickets below current bookings (${bookedCount}). You can only increase the ticket count. To reduce tickets, create a new game instead.`);
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
   * ✅ SAFETY: Check if update is safe to perform
   */
  const canUpdateGameSettings = (gameData: GameData): { canUpdate: boolean; reason?: string } => {
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

  // ================== AUTOMATIC NUMBER CALLING ==================

  // 🔧 ONLY MODIFICATION: Updated handleAudioComplete with pause checking
  const handleAudioComplete = useCallback(() => {
    setIsWaitingForAudio(false);
    
    // 🔧 CRITICAL: Check pause state BEFORE scheduling next number
    if (pauseRequestedRef?.current || isPaused) {
      console.log(`🚫 Game is paused, skipping next number schedule`);
      return;
    }
    
    if (gameActiveRef.current && gameData?.gameState.isActive) {
      // Schedule next number after configurable interval
      gameTimerRef.current = setTimeout(() => {
        // 🔧 CRITICAL: Check pause state again in timer callback
        if (pauseRequestedRef?.current || isPaused) {
          console.log(`🚫 Game paused during timer, aborting number call`);
          return;
        }
        
        if (gameActiveRef.current) {
          callNextNumber();
        }
      }, callInterval * 1000);
    }
  }, [gameData, callInterval, isPaused, pauseRequestedRef]);

  const callNextNumber = useCallback(async () => {
    if (!gameData || !gameActiveRef.current || isCallingNumber) return;

    // 🔧 ADDITIONAL: Check pause state before calling
    if (pauseRequestedRef?.current || isPaused) {
      console.log(`🚫 Game is paused, aborting number call`);
      return;
    }

    const calledNumbers = gameData.gameState.calledNumbers || [];
    const availableNumbers = Array.from({ length: 90 }, (_, i) => i + 1)
      .filter(num => !calledNumbers.includes(num));

    if (availableNumbers.length === 0) {
      endGame();
      return;
    }

    setIsCallingNumber(true);
    
    try {
      console.log(`🎯 Calling next number for game ${gameData.gameId}`);
      const result = await firebaseService.callNextNumber(gameData.gameId);
      
      // Check for game end conditions
      if (result.gameEnded || availableNumbers.length === 1) {
        endGame();
        return;
      }

      // Schedule next number call after audio completion
      if (gameActiveRef.current && !pauseRequestedRef?.current && !isPaused) {
        setIsWaitingForAudio(true);
      }
    } catch (error) {
      console.error('❌ Error calling next number:', error);
    } finally {
      setIsCallingNumber(false);
    }
  }, [gameData, isCallingNumber, isPaused, pauseRequestedRef]);

  const endGame = useCallback(async () => {
    if (!gameData) return;
    
    try {
      gameActiveRef.current = false;
      clearAllTimers();
      
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: false,
        isCountdown: false,
        gameOver: true
      });
      
      console.log(`✅ Game ended successfully: ${gameData.gameId}`);
    } catch (error) {
      console.error('❌ Error ending game:', error);
    }
  }, [gameData]);

  const clearAllTimers = useCallback(() => {
    if (gameTimerRef.current) {
      clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
    }
  }, []);

  // ================== ENHANCED SINGLE SOURCE UPDATE + EXPANSION ==================

  /**
   * ✅ ENHANCED SINGLE SOURCE UPDATE: Complete settings update with safety checks + NEW EXPANSION LOGIC
   * CRITICAL: This updates BOTH live game data AND host template + handles ticket expansion
   */
  const updateGameSettings = async () => {
    if (!gameData) {
      console.error('❌ No game data available for update');
      alert('No active game found');
      return;
    }

    if (!user?.uid) {
      console.error('❌ No user context available');
      alert('User not authenticated');
      return;
    }

    logUpdateOperation('start', gameData);
    
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
    
    logUpdateOperation('validation', gameData);
    
    // Step 3: Prepare update data
    const maxTicketsNum = parseInt(createGameForm.maxTickets);
    const isExpanding = maxTicketsNum > gameData.maxTickets;
    
    try {
      logUpdateOperation('live_update', gameData);
      
      // ✅ CORE UPDATE: Update live game settings
      await firebaseService.updateLiveGameSettings(gameData.gameId, {
        maxTickets: maxTicketsNum,
        hostPhone: createGameForm.hostPhone
      });
      
      logUpdateOperation('template_update', gameData);
      
      // ✅ TEMPLATE UPDATE: Save host settings template for future games
      await firebaseService.saveHostSettings(user.uid, {
        hostPhone: createGameForm.hostPhone,
        maxTickets: maxTicketsNum,
        selectedTicketSet: createGameForm.selectedTicketSet,
        selectedPrizes: createGameForm.selectedPrizes
      });

      // Step 4: Success handling
      logUpdateOperation('success', gameData);
      setEditMode(false);
      
      if (isExpanding) {
        alert(`✅ Game settings updated successfully!\n\n🎫 Ticket limit expanded from ${gameData.maxTickets} to ${maxTicketsNum}.\nNew tickets are now available for booking.`);
      } else {
        alert('✅ Game settings updated successfully!');
      }
      
    } catch (error: any) {
      logUpdateOperation('error', gameData, error);
      console.error('❌ Update game error:', error);
      alert(error.message || 'Failed to update game settings');
    }
  };

  // ================== GAME CREATION ==================

  const createNewGame = async () => {
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
    setOperation({
      type: 'create',
      inProgress: true,
      message: 'Creating game and setting up tickets...'
    });

    try {
      console.log('🎮 Starting game creation process...');
      
      // If we have cached winner data, delete the old game BEFORE creating new one
      if (cachedWinnerData) {
        console.log('🗑️ Deleting previous completed game before creating new one:', cachedWinnerData.gameId);
        try {
          await firebaseService.deleteGame(cachedWinnerData.gameId);
          console.log('✅ Previous game deleted successfully');
        } catch (deleteError) {
          console.error('⚠️ Error deleting previous game (continuing with creation):', deleteError);
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
      
      console.log('✅ Game created successfully:', newGame.gameId);
      
      setUIState('calculated');
      
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

  // ================== OTHER EVENT HANDLERS ==================

  const deleteGame = async () => {
    if (!gameData) return;

    const confirmed = window.confirm('Are you sure you want to delete this game? This action cannot be undone.');
    if (!confirmed) return;

    setOperation({
      type: 'delete',
      inProgress: true,
      message: 'Deleting game...'
    });

    try {
      await firebaseService.deleteGame(gameData.gameId);
      console.log('✅ Game deleted successfully');
    } catch (error: any) {
      console.error('❌ Delete game error:', error);
      setOperation({ type: null, inProgress: false, message: '' });
      alert(error.message || 'Failed to delete game');
    }
  };

  const handleCreateNewGameFromWinners = useCallback(() => {
    const confirmed = window.confirm(
      'Create a new game? This will clear the winner display and start fresh.'
    );
    
    if (confirmed) {
      console.log('✅ Host confirmed new game creation from winner display');
      console.log('🎯 Transitioning to setup mode (winner data preserved until new game created)');
      setUIState('setup');
    } else {
      console.log('🚫 Host cancelled new game creation from winner display');
    }
  }, []);

  const handleMaxTicketsChange = (value: string) => {
    console.log('📊 Max tickets changed:', value);
  };

  // ================== SYNC GAME ACTIVE REF ==================

  useEffect(() => {
    if (gameData) {
      const shouldBeActive = gameData.gameState.isActive && !gameData.gameState.gameOver;
      gameActiveRef.current = shouldBeActive;
      console.log(`🔄 Synced gameActiveRef: ${shouldBeActive}`);
    }
  }, [gameData?.gameState.isActive, gameData?.gameState.gameOver]);

  // ================== USEEFFECTS ==================
  
  // Load previous settings
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

  // Handle game completion and winner display
  useEffect(() => {
    if (gameData?.gameState.gameOver && uiState === 'calculated') {
      console.log('🏆 Game completed, caching winner data for display');
      setCachedWinnerData(gameData);
      setUIState('winners');
    }
    
    if (!gameData && uiState === 'winners' && cachedWinnerData) {
      console.log('🎮 Game deleted, transitioning to setup mode');
      setUIState('setup');
    }
  }, [gameData?.gameState.gameOver, gameData, uiState, cachedWinnerData]);

  // Clear operation state when real-time data updates
  useEffect(() => {
    if (operation.inProgress) {
      if (operation.type === 'create' && gameData) {
        console.log('✅ Create operation completed - game data received via real-time');
        setOperation({ type: null, inProgress: false, message: 'Game created successfully!' });
        setTimeout(() => {
          setOperation({ type: null, inProgress: false, message: '' });
        }, 3000);
      } else if (operation.type === 'delete' && !gameData) {
        console.log('✅ Delete operation completed - game data cleared via real-time');
        setOperation({ type: null, inProgress: false, message: 'Game deleted successfully!' });
        setTimeout(() => {
          setOperation({ type: null, inProgress: false, message: '' });
        }, 3000);
      }
    }
  }, [gameData, operation]);

  // ================== CLEANUP ==================

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // ================== VIEW CALCULATION ==================

  const getCurrentView = (): 'create' | 'booking' | 'live' | 'winners' | 'setup' => {
    if (uiState === 'winners') return 'winners';
    if (uiState === 'setup') return 'setup';
    if (!gameData) return 'setup';
    if (gameData.gameState.gameOver) return 'winners';
    if (gameData.gameState.isActive || gameData.gameState.isCountdown) return 'live';
    return 'booking';
  };

  const currentView = getCurrentView();
  const subscriptionStatus = getSubscriptionStatus();

  // ================== LOADING STATES ==================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Game</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">{error}</p>
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
            <CardTitle className="text-red-600">Subscription Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              Your subscription has expired. Please contact the administrator to renew your subscription.
            </p>
            <p className="text-sm text-gray-600">
              Contact: admin@tambola.com
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ================== RENDER DIFFERENT VIEWS ==================

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Host Info */}
        <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold">🎲 Host Dashboard 🎲</CardTitle>
            <p className="text-blue-100">Welcome back, {user.name}!</p>
            <div className="flex justify-center items-center space-x-4 mt-2">
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                📞 {user.phone}
              </Badge>
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                ⏰ {subscriptionStatus.message}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Setup Phase */}
        {currentView === 'setup' && (
          <CreateGameForm
            createGameForm={createGameForm}
            setCreateGameForm={setCreateGameForm}
            onCreateGame={createNewGame}
            onMaxTicketsChange={handleMaxTicketsChange}
            isCreating={isCreating}
            operationInProgress={operation.inProgress}
            isFromWinners={!cachedWinnerData}
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

            <HostDisplay />
            
            <TicketManagementGrid
              gameData={gameData}
              onRefreshGame={() => {}}
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
          <HostDisplay onCreateNewGame={createNewGame} />
        )}

        {/* Audio Manager */}
        {gameData && (
          <AudioManager
            currentNumber={gameData.gameState.currentNumber}
            prizes={Object.values(gameData.prizes)}
            onAudioComplete={handleAudioComplete}
            forceEnable={true}
          />
        )}

        {/* Operation Status */}
        {operation.message && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{operation.message}</AlertDescription>
          </Alert>
        )}

        {/* Development Debug Info */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="border-gray-300 bg-gray-50 mt-6">
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">Debug: GameHost State</CardTitle>
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
      {isFromWinners && (
        <p className="text-sm text-blue-600">
          ✅ Previous game winner data cleared from view. Configure your new game below.
        </p>
      )}
    </CardHeader>
    <CardContent className="space-y-4">
      <div>
        <Label htmlFor="hostPhone">Host WhatsApp Number</Label>
        <Input
          id="hostPhone"
          value={createGameForm.hostPhone}
          onChange={(e) => setCreateGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
          placeholder="Enter your WhatsApp number"
          disabled={operationInProgress}
        />
      </div>

      <div>
        <Label htmlFor="maxTickets">Maximum Tickets (1-600)</Label>
        <Input
          id="maxTickets"
          type="number"
          min="1"
          max="600"
          value={createGameForm.maxTickets}
          onChange={(e) => {
            setCreateGameForm(prev => ({ ...prev, maxTickets: e.target.value }));
            if (onMaxTicketsChange) onMaxTicketsChange(e.target.value);
          }}
          disabled={operationInProgress}
        />
      </div>

      <div>
        <Label>Ticket Set</Label>
        <select
          value={createGameForm.selectedTicketSet}
          onChange={(e) => setCreateGameForm(prev => ({ ...prev, selectedTicketSet: e.target.value }))}
          className="w-full p-2 border rounded"
          disabled={operationInProgress}
        >
          <option value="1">Set 1 (Classic)</option>
          <option value="2">Set 2 (Premium)</option>
          <option value="3">Set 3 (Deluxe)</option>
        </select>
      </div>

      <div>
        <Label>Select Prizes</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { id: 'earlyFive', name: 'Early Five' },
            { id: 'topLine', name: 'Top Line' },
            { id: 'middleLine', name: 'Middle Line' },
            { id: 'bottomLine', name: 'Bottom Line' },
            { id: 'fourCorners', name: 'Four Corners' },
            { id: 'fullHouse', name: 'Full House' }
          ].map(prize => (
            <div key={prize.id} className="flex items-center space-x-2">
              <Checkbox
                id={prize.id}
                checked={createGameForm.selectedPrizes.includes(prize.id)}
                onCheckedChange={(checked) => {
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
                disabled={operationInProgress}
              />
              <Label htmlFor={prize.id}>{prize.name}</Label>
            </div>
          ))}
        </div>
      </div>

      <Button 
        onClick={onCreateGame}
        disabled={isCreating || operationInProgress}
        className="w-full"
      >
        {isCreating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Creating Game...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 mr-2" />
            Create Game
          </>
        )}
      </Button>
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
    <CardContent className="space-y-4">
      <div>
        <Label htmlFor="editHostPhone">Host WhatsApp Number</Label>
        <Input
          id="editHostPhone"
          value={createGameForm.hostPhone}
          onChange={(e) => setCreateGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
          disabled={operationInProgress}
        />
      </div>

      <div>
        <Label htmlFor="editMaxTickets">Maximum Tickets</Label>
        <Input
          id="editMaxTickets"
          type="number"
          min={Math.max(1, bookedCount)}
          max="600"
          value={createGameForm.maxTickets}
          onChange={(e) => {
            setCreateGameForm(prev => ({ ...prev, maxTickets: e.target.value }));
            if (onMaxTicketsChange) onMaxTicketsChange(e.target.value);
          }}
          disabled={operationInProgress}
        />
        <p className="text-sm text-gray-600 mt-1">
          Currently {bookedCount} tickets booked. You can only increase the limit.
        </p>
      </div>

      <div className="flex space-x-2">
        <Button 
          onClick={onUpdateGame}
          disabled={operationInProgress}
          className="flex-1"
        >
          {operationInProgress ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Update Settings
            </>
          )}
        </Button>
        <Button 
          onClick={onCancel}
          variant="outline"
          disabled={operationInProgress}
        >
          Cancel
        </Button>
        <Button 
          onClick={onDeleteGame}
          variant="destructive"
          disabled={operationInProgress}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>
    </CardContent>
  </Card>
);

// ================== MAIN EXPORT WITH PROVIDER WRAPPER ==================

export const GameHost: React.FC<GameHostProps> = (props) => {
  return (
    <HostControlsProvider userId={props.user.uid}>
      <GameHostInner {...props} />
    </HostControlsProvider>
  );
};
