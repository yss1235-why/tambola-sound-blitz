// src/components/GameHost.tsx - Simplified Single-Page Design
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { NumberGrid } from './NumberGrid';
import { TicketDisplay } from './TicketDisplay';
import { PrizeManagementPanel } from './PrizeManagementPanel';
import { 
  Play, 
  Pause, 
  Square, 
  Users, 
  Plus,
  Clock,
  AlertCircle,
  Trophy,
  Ticket,
  Edit,
  Save,
  Phone,
  RotateCcw,
  Timer,
  RefreshCw,
  CheckCircle,
  Gamepad2
} from 'lucide-react';
import { 
  firebaseService, 
  GameData, 
  TambolaTicket, 
  HostUser,
  GameState,
  Prize,
  getCurrentUserRole
} from '@/services/firebase';

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
  maxTickets: number;
  selectedTicketSet: string;
  selectedPrizes: string[];
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

// Available game prizes
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
    id: 'fourCorners',
    name: 'Four Corners',
    pattern: 'All four corner numbers',
    description: 'Mark all four corner numbers of any ticket'
  },
  {
    id: 'fullHouse',
    name: 'Full House',
    pattern: 'Complete ticket',
    description: 'Complete all numbers on any ticket'
  }
];

export const GameHost: React.FC<GameHostProps> = ({ user, userRole }) => {
  // Single game state
  const [hostGame, setHostGame] = useState<GameData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Game creation form
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    hostPhone: '',
    maxTickets: 100,
    selectedTicketSet: '1',
    selectedPrizes: ['quickFive', 'topLine', 'middleLine', 'bottomLine', 'fourCorners', 'fullHouse']
  });

  // Game control states
  const [gameInterval, setGameInterval] = useState<NodeJS.Timeout | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>(
    Array.from({ length: 90 }, (_, i) => i + 1)
  );
  const [callInterval, setCallInterval] = useState<number>(5);
  const [countdownDuration, setCountdownDuration] = useState<number>(10);
  const [isGamePaused, setIsGamePaused] = useState<boolean>(false);
  const [currentCountdown, setCurrentCountdown] = useState<number>(0);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Subscription management
  const gameUnsubscribeRef = useRef<(() => void) | null>(null);

  // Determine current phase
  const gamePhase = React.useMemo(() => {
    if (!hostGame) return 'creation';
    if (hostGame.gameState.gameOver) return 'finished';
    if (hostGame.gameState.isActive || hostGame.gameState.isCountdown) return 'playing';
    return 'booking';
  }, [hostGame]);

  // Check subscription status
  const isSubscriptionValid = useCallback(() => {
    if (!user.isActive) return false;
    if (!user.subscriptionEndDate) return false;
    
    const subscriptionEnd = new Date(user.subscriptionEndDate);
    const now = new Date();
    
    return subscriptionEnd > now && user.isActive;
  }, [user.isActive, user.subscriptionEndDate]);

  const getSubscriptionStatus = useCallback(() => {
    if (!user.isActive) {
      return { status: 'inactive', message: 'Account is deactivated', variant: 'destructive' as const };
    }
    
    if (!user.subscriptionEndDate) {
      return { status: 'no-subscription', message: 'No subscription date', variant: 'destructive' as const };
    }
    
    const subscriptionEnd = new Date(user.subscriptionEndDate);
    const now = new Date();
    
    if (isNaN(subscriptionEnd.getTime())) {
      return { status: 'invalid-date', message: 'Invalid subscription date', variant: 'destructive' as const };
    }
    
    const daysLeft = Math.ceil((subscriptionEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft < 0) return { status: 'expired', message: 'Subscription expired', variant: 'destructive' as const };
    if (daysLeft <= 7) return { status: 'expiring', message: `Expires in ${daysLeft} days`, variant: 'secondary' as const };
    return { status: 'active', message: `Active (${daysLeft} days left)`, variant: 'default' as const };
  }, [user.isActive, user.subscriptionEndDate]);

  // Load host's current game
  const loadHostCurrentGame = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentGame = await firebaseService.getHostCurrentGame(user.uid);
      setHostGame(currentGame);
      
      if (currentGame) {
        // Set up subscription for the current game
        setupGameSubscription(currentGame);
        
        // Update available numbers if game in progress
        const called = currentGame.gameState.calledNumbers || [];
        const available = Array.from({ length: 90 }, (_, i) => i + 1)
          .filter(num => !called.includes(num));
        setAvailableNumbers(available);
      }
    } catch (error: any) {
      console.error('Error loading current game:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user.uid]);

  // Set up game subscription
  const setupGameSubscription = useCallback((game: GameData) => {
    // Clean up previous subscription
    if (gameUnsubscribeRef.current) {
      gameUnsubscribeRef.current();
      gameUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToGame(game.gameId, (updatedGame) => {
      if (updatedGame) {
        setHostGame(updatedGame);
        
        // Update available numbers based on called numbers
        const calledNums = updatedGame.gameState.calledNumbers || [];
        const availableNums = Array.from({ length: 90 }, (_, i) => i + 1)
          .filter(num => !calledNums.includes(num));
        setAvailableNumbers(availableNums);
        
        // Handle game state changes
        if (updatedGame.gameState.gameOver && gameInterval) {
          clearInterval(gameInterval);
          setGameInterval(null);
          setIsGamePaused(false);
        }

        // Handle countdown updates
        if (updatedGame.gameState.isCountdown) {
          setCurrentCountdown(updatedGame.gameState.countdownTime);
        }

        // Update paused state
        setIsGamePaused(!updatedGame.gameState.isActive && 
                        !updatedGame.gameState.isCountdown && 
                        !updatedGame.gameState.gameOver &&
                        (updatedGame.gameState.calledNumbers?.length || 0) > 0);
      }
    });

    gameUnsubscribeRef.current = unsubscribe;
  }, [gameInterval]);

  // Load on mount
  useEffect(() => {
    if (isSubscriptionValid()) {
      loadHostCurrentGame();
    } else {
      setIsLoading(false);
    }
  }, [isSubscriptionValid, loadHostCurrentGame]);

  // Load previous settings
  useEffect(() => {
    const loadPreviousSettings = async () => {
      try {
        const settings = await firebaseService.getHostSettings(user.uid);
        if (settings) {
          setCreateGameForm(prev => ({
            ...prev,
            hostPhone: settings.hostPhone || prev.hostPhone,
            maxTickets: settings.maxTickets || prev.maxTickets,
            selectedTicketSet: settings.selectedTicketSet || prev.selectedTicketSet,
            selectedPrizes: settings.selectedPrizes || prev.selectedPrizes
          }));
        }
      } catch (error) {
        console.error('Error loading previous settings:', error);
      }
    };
    
    loadPreviousSettings();
  }, [user.uid]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (gameInterval) {
        clearInterval(gameInterval);
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      if (gameUnsubscribeRef.current) {
        gameUnsubscribeRef.current();
      }
    };
  }, [gameInterval, countdownInterval]);

  // Save settings
  const savePreviousSettings = async () => {
    try {
      await firebaseService.saveHostSettings(user.uid, {
        hostPhone: createGameForm.hostPhone,
        maxTickets: createGameForm.maxTickets,
        selectedTicketSet: createGameForm.selectedTicketSet,
        selectedPrizes: createGameForm.selectedPrizes
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // Create new game
  const createNewGame = async () => {
    if (!isSubscriptionValid()) {
      alert('Your subscription has expired or account is inactive');
      return;
    }

    if (!createGameForm.hostPhone.trim()) {
      alert('Please enter your WhatsApp phone number');
      return;
    }

    if (createGameForm.selectedPrizes.length === 0) {
      alert('Please select at least one prize');
      return;
    }

    if (createGameForm.maxTickets < 1 || createGameForm.maxTickets > 600) {
      alert('Max tickets must be between 1 and 600');
      return;
    }

    setIsLoading(true);
    try {
      const gameData = await firebaseService.createGame(
        {
          name: 'Tambola Game', // Simple fixed name
          maxTickets: createGameForm.maxTickets,
          ticketPrice: 0,
          hostPhone: createGameForm.hostPhone
        },
        user.uid,
        createGameForm.selectedTicketSet,
        createGameForm.selectedPrizes
      );

      await savePreviousSettings();
      setHostGame(gameData);
      setupGameSubscription(gameData);
      setAvailableNumbers(Array.from({ length: 90 }, (_, i) => i + 1));

    } catch (error: any) {
      console.error('Create game error:', error);
      alert(error.message || 'Failed to create game. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Update game settings
  const updateGameSettings = async () => {
    if (!hostGame) return;

    setIsLoading(true);
    try {
      const updatedGameData = {
        maxTickets: createGameForm.maxTickets,
        hostPhone: createGameForm.hostPhone,
        prizes: {} as { [key: string]: Prize }
      };

      // Rebuild prizes
      createGameForm.selectedPrizes.forEach(prizeId => {
        const prizeDef = AVAILABLE_PRIZES.find(p => p.id === prizeId);
        if (prizeDef) {
          updatedGameData.prizes[prizeId] = {
            id: prizeId,
            name: prizeDef.name,
            pattern: prizeDef.pattern,
            won: false
          };
        }
      });

      await firebaseService.updateGameData(hostGame.gameId, updatedGameData);
      setEditMode(false);

    } catch (error: any) {
      console.error('Update game error:', error);
      alert(error.message || 'Failed to update game');
    } finally {
      setIsLoading(false);
    }
  };

  // Game control methods
  const startCountdown = async () => {
    if (!hostGame || !isSubscriptionValid()) return;

    try {
      setCurrentCountdown(countdownDuration);
      
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isCountdown: true,
        countdownTime: countdownDuration,
        isActive: false
      });

      const countdown = setInterval(async () => {
        setCurrentCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            setCountdownInterval(null);
            startGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      setCountdownInterval(countdown);
    } catch (error: any) {
      console.error('Start countdown error:', error);
    }
  };

  const startGame = async () => {
    if (!hostGame) return;

    try {
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isCountdown: false,
        isActive: true,
        countdownTime: 0
      });

      setIsGamePaused(false);
      startNumberCalling();

    } catch (error: any) {
      console.error('Start game error:', error);
    }
  };

  const startNumberCalling = () => {
    if (!hostGame) return;

    const interval = setInterval(async () => {
      if (availableNumbers.length === 0) {
        clearInterval(interval);
        await endGame();
        return;
      }

      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const numberToBeCalled = availableNumbers[randomIndex];
      
      setAvailableNumbers(prev => prev.filter(n => n !== numberToBeCalled));
      
      try {
        const result = await firebaseService.callNumberWithPrizeValidation(
          hostGame.gameId, 
          numberToBeCalled
        );

        if (result.gameEnded) {
          clearInterval(interval);
          setGameInterval(null);
          setIsGamePaused(false);
          return;
        }

        setTimeout(async () => {
          if (hostGame) {
            await firebaseService.clearCurrentNumber(hostGame.gameId);
          }
        }, 3000);

      } catch (error) {
        console.error('Error calling number:', error);
        setAvailableNumbers(prev => {
          if (!prev.includes(numberToBeCalled)) {
            return [...prev, numberToBeCalled].sort((a, b) => a - b);
          }
          return prev;
        });
      }
    }, callInterval * 1000);

    setGameInterval(interval);
  };

  const pauseGame = async () => {
    if (gameInterval) {
      clearInterval(gameInterval);
      setGameInterval(null);
    }

    if (countdownInterval) {
      clearInterval(countdownInterval);
      setCountdownInterval(null);
    }

    setIsGamePaused(true);

    if (hostGame) {
      try {
        await firebaseService.updateGameState(hostGame.gameId, {
          ...hostGame.gameState,
          isActive: false,
          isCountdown: false
        });
      } catch (error: any) {
        console.error('Pause game error:', error);
      }
    }
  };

  const resumeGame = async () => {
    if (!hostGame) return;

    try {
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isActive: true,
        isCountdown: false
      });

      setIsGamePaused(false);
      startNumberCalling();

    } catch (error: any) {
      console.error('Resume game error:', error);
    }
  };

  const endGame = async () => {
    if (gameInterval) {
      clearInterval(gameInterval);
      setGameInterval(null);
    }

    if (countdownInterval) {
      clearInterval(countdownInterval);
      setCountdownInterval(null);
    }

    setIsGamePaused(false);

    if (hostGame) {
      try {
        await firebaseService.updateGameState(hostGame.gameId, {
          ...hostGame.gameState,
          isActive: false,
          isCountdown: false,
          gameOver: true,
          currentNumber: null
        });
      } catch (error: any) {
        console.error('End game error:', error);
      }
    }
  };

  const deleteGame = async () => {
    if (!hostGame) return;

    const confirmed = window.confirm('Are you sure you want to delete this game? This action cannot be undone.');
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await firebaseService.deleteGame(hostGame.gameId);
      setHostGame(null);
    } catch (error: any) {
      console.error('Delete game error:', error);
      alert(error.message || 'Failed to delete game');
    } finally {
      setIsLoading(false);
    }
  };

  const createNewGameFromFinished = () => {
    setHostGame(null);
    setEditMode(false);
  };

  // Helper functions
  const getBookedTicketsCount = () => {
    if (!hostGame || !hostGame.tickets) return 0;
    return Object.values(hostGame.tickets).filter(ticket => ticket.isBooked).length;
  };

  const subscriptionStatus = getSubscriptionStatus();

  // Show subscription error
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

  // Show loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading...</h2>
            <p className="text-gray-600">Setting up your game dashboard</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Host Dashboard</h1>
            <p className="text-slate-600">Welcome back, {user.name}!</p>
            <Badge variant={subscriptionStatus.variant} className="mt-2">
              {subscriptionStatus.message}
            </Badge>
          </div>
          
          {/* Phase indicator */}
          <div className="text-right">
            <Badge variant="outline" className="text-lg px-4 py-2">
              {gamePhase === 'creation' && '🎮 Create Game'}
              {gamePhase === 'booking' && !editMode && '🎫 Booking Open'}
              {gamePhase === 'booking' && editMode && '✏️ Edit Settings'}
              {gamePhase === 'playing' && '🔴 Live Game'}
              {gamePhase === 'finished' && '🏆 Game Complete'}
            </Badge>
          </div>
        </div>

        {/* Main Content - Phase-based rendering */}
        
        {/* CREATION PHASE */}
        {gamePhase === 'creation' && (
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
                />
                <p className="text-sm text-gray-500 mt-1">
                  Players will use this number to book tickets via WhatsApp
                </p>
              </div>

              {/* Max Tickets */}
              <div>
                <Label htmlFor="max-tickets">Maximum Tickets (1-600)</Label>
                <Input
                  id="max-tickets"
                  type="number"
                  min="1"
                  max="600"
                  placeholder="100"
                  value={createGameForm.maxTickets || ''}
                  onChange={(e) => setCreateGameForm(prev => ({ ...prev, maxTickets: parseInt(e.target.value) || 100 }))}
                  className="border-2 border-gray-200 focus:border-blue-400"
                />
              </div>

              {/* Ticket Set Selection */}
              <div>
                <Label>Select Ticket Set</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  {TICKET_SETS.map((ticketSet) => (
                    <Card
                      key={ticketSet.id}
                      className={`cursor-pointer transition-all duration-200 ${
                        createGameForm.selectedTicketSet === ticketSet.id
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:border-blue-300'
                      } ${!ticketSet.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => ticketSet.available && setCreateGameForm(prev => ({ ...prev, selectedTicketSet: ticketSet.id }))}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold">{ticketSet.name}</h3>
                          <Badge variant={ticketSet.available ? "default" : "secondary"}>
                            {ticketSet.available ? 'Available' : 'Coming Soon'}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{ticketSet.description}</p>
                        <p className="text-xs text-gray-500">{ticketSet.ticketCount} tickets</p>
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

              {/* Create Game Button */}
              <Button
                onClick={createNewGame}
                disabled={isLoading || !createGameForm.hostPhone.trim() || createGameForm.selectedPrizes.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Creating Game...
                  </>
                ) : (
                  'Create & Open Booking'
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* BOOKING PHASE */}
        {gamePhase === 'booking' && !editMode && hostGame && (
          <div className="space-y-6">
            {/* Game Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Ticket className="w-6 h-6 mr-2" />
                    Tambola Game - Booking Open
                  </span>
                  <div className="flex space-x-2">
                    <Button onClick={() => setEditMode(true)} variant="outline">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Settings
                    </Button>
                    <Button onClick={startCountdown} className="bg-green-600 hover:bg-green-700">
                      <Play className="w-4 h-4 mr-2" />
                      Start Game
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{hostGame.maxTickets}</div>
                    <div className="text-sm text-blue-700">Max Tickets</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{getBookedTicketsCount()}</div>
                    <div className="text-sm text-green-700">Booked</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-600">{hostGame.maxTickets - getBookedTicketsCount()}</div>
                    <div className="text-sm text-gray-700">Available</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{Object.keys(hostGame.prizes).length}</div>
                    <div className="text-sm text-purple-700">Prizes</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-sm">
                    <Phone className="w-4 h-4 text-blue-600" />
                    <span>WhatsApp Booking: +{hostGame.hostPhone}</span>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">Selected Prizes:</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.values(hostGame.prizes).map(prize => (
                        <Badge key={prize.id} variant="outline">
                          {prize.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ticket Grid Component would go here */}
            {hostGame.tickets && (
              <Card>
                <CardHeader>
                  <CardTitle>Live Ticket Bookings</CardTitle>
                </CardHeader>
                <CardContent>
                  <TicketDisplay 
                    calledNumbers={[]} 
                    tickets={Object.values(hostGame.tickets).filter(ticket => ticket.isBooked)} 
                  />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* EDIT MODE (during booking phase) */}
        {gamePhase === 'booking' && editMode && hostGame && (
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

              {/* Host Phone */}
              <div>
                <Label htmlFor="edit-host-phone">WhatsApp Phone Number</Label>
                <Input
                  id="edit-host-phone"
                  type="tel"
                  value={createGameForm.hostPhone}
                  onChange={(e) => setCreateGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
                  className="border-2 border-gray-200 focus:border-blue-400"
                />
              </div>

              {/* Max Tickets */}
              <div>
                <Label htmlFor="edit-max-tickets">Maximum Tickets</Label>
                <Input
                  id="edit-max-tickets"
                  type="number"
                  min="1"
                  max="600"
                  value={createGameForm.maxTickets || ''}
                  onChange={(e) => setCreateGameForm(prev => ({ ...prev, maxTickets: parseInt(e.target.value) || 100 }))}
                  className="border-2 border-gray-200 focus:border-blue-400"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Current bookings: {getBookedTicketsCount()}. Cannot set below current bookings.
                </p>
              </div>

              {/* Prize Selection */}
              <div>
                <Label>Edit Prizes</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  {AVAILABLE_PRIZES.map((prize) => (
                    <div key={prize.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                      <Checkbox
                        id={`edit-${prize.id}`}
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
                      />
                      <div className="flex-1">
                        <Label htmlFor={`edit-${prize.id}`} className="font-medium cursor-pointer">
                          {prize.name}
                        </Label>
                        <p className="text-sm text-gray-600">{prize.pattern}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex space-x-4">
                <Button
                  onClick={updateGameSettings}
                  disabled={isLoading || createGameForm.maxTickets < getBookedTicketsCount()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save & Return to Booking
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setEditMode(false)}
                  variant="outline"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={deleteGame}
                  variant="destructive"
                  disabled={isLoading || getBookedTicketsCount() > 0}
                  title={getBookedTicketsCount() > 0 ? "Cannot delete game with booked tickets" : "Delete game"}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PLAYING PHASE */}
        {gamePhase === 'playing' && hostGame && (
          <div className="space-y-6">
            {/* Game Control Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Live Game Control</span>
                  <Badge variant="default" className="bg-red-600">
                    🔴 LIVE
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Control Buttons */}
                <div className="flex flex-wrap gap-3">
                  {!hostGame.gameState.isActive && !hostGame.gameState.isCountdown && (
                    <>
                      <Button
                        onClick={startCountdown}
                        className="bg-yellow-600 hover:bg-yellow-700"
                      >
                        <Timer className="w-4 h-4 mr-2" />
                        Start Countdown ({countdownDuration}s)
                      </Button>
                      <Button
                        onClick={startGame}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start Game
                      </Button>
                    </>
                  )}

                  {hostGame.gameState.isActive && (
                    <Button
                      onClick={pauseGame}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Pause Game
                    </Button>
                  )}

                  {isGamePaused && (
                    <Button
                      onClick={resumeGame}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Resume Game
                    </Button>
                  )}

                  <Button
                    onClick={endGame}
                    variant="destructive"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    End Game
                  </Button>
                </div>

                {/* Game Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="call-interval">Number Calling Interval (seconds)</Label>
                    <Input
                      id="call-interval"
                      type="number"
                      min="3"
                      max="15"
                      value={callInterval}
                      onChange={(e) => setCallInterval(parseInt(e.target.value) || 5)}
                      disabled={hostGame.gameState.isActive}
                    />
                  </div>
                  <div>
                    <Label htmlFor="countdown-duration">Countdown Duration (seconds)</Label>
                    <Input
                      id="countdown-duration"
                      type="number"
                      min="5"
                      max="30"
                      value={countdownDuration}
                      onChange={(e) => setCountdownDuration(parseInt(e.target.value) || 10)}
                      disabled={hostGame.gameState.isActive || hostGame.gameState.isCountdown}
                    />
                  </div>
                </div>

                {/* Game Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {(hostGame.gameState.calledNumbers || []).length}
                    </div>
                    <div className="text-sm text-blue-700">Numbers Called</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {getBookedTicketsCount()}
                    </div>
                    <div className="text-sm text-green-700">Active Players</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {Object.values(hostGame.prizes).filter(p => p.won).length}
                    </div>
                    <div className="text-sm text-purple-700">Prizes Won</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {90 - (hostGame.gameState.calledNumbers || []).length}
                    </div>
                    <div className="text-sm text-orange-700">Numbers Left</div>
                  </div>
                </div>

                {/* Countdown Display */}
                {hostGame.gameState.isCountdown && (
                  <div className="text-center p-8 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl">
                    <Clock className="w-12 h-12 mx-auto mb-4 animate-pulse" />
                    <div className="text-6xl font-bold animate-bounce">{currentCountdown}</div>
                    <p className="text-xl mt-2">Game starting...</p>
                  </div>
                )}

                {/* Current Number Display */}
                {hostGame.gameState.currentNumber && (
                  <div className="text-center p-8 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl">
                    <div className="text-8xl font-bold animate-pulse">{hostGame.gameState.currentNumber}</div>
                    <p className="text-xl mt-4">Current Number</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Number Grid */}
            <Card>
              <CardHeader>
                <CardTitle>Numbers Board</CardTitle>
              </CardHeader>
              <CardContent>
                <NumberGrid
                  calledNumbers={hostGame.gameState.calledNumbers || []}
                  currentNumber={hostGame.gameState.currentNumber}
                />
              </CardContent>
            </Card>

            {/* Prize Management */}
            <PrizeManagementPanel
              gameData={hostGame}
              onRefreshGame={() => {}} // Real-time updates handle this
            />
          </div>
        )}

        {/* FINISHED PHASE */}
        {gamePhase === 'finished' && hostGame && (
          <div className="space-y-6">
            <Card className="border-4 border-yellow-400 bg-gradient-to-br from-yellow-50 to-orange-50">
              <CardHeader className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-center">
                <CardTitle className="text-3xl font-bold">🏆 Game Complete! 🏆</CardTitle>
                <p className="text-yellow-100">Congratulations to all winners!</p>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Game Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-white rounded-lg shadow">
                    <div className="text-2xl font-bold text-blue-600">{getBookedTicketsCount()}</div>
                    <div className="text-sm text-blue-700">Total Players</div>
                  </div>
                  <div className="text-center p-4 bg-white rounded-lg shadow">
                    <div className="text-2xl font-bold text-green-600">
                      {Object.values(hostGame.prizes).filter(p => p.won).length}
                    </div>
                    <div className="text-sm text-green-700">Prizes Won</div>
                  </div>
                  <div className="text-center p-4 bg-white rounded-lg shadow">
                    <div className="text-2xl font-bold text-purple-600">
                      {(hostGame.gameState.calledNumbers || []).length}
                    </div>
                    <div className="text-sm text-purple-700">Numbers Called</div>
                  </div>
                  <div className="text-center p-4 bg-white rounded-lg shadow">
                    <div className="text-2xl font-bold text-orange-600">
                      {Object.values(hostGame.prizes).reduce((total, prize) => 
                        total + (prize.winners?.length || 0), 0
                      )}
                    </div>
                    <div className="text-sm text-orange-700">Total Winners</div>
                  </div>
                </div>

                {/* Winners Display */}
                <div className="space-y-3">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">🏆 Winners</h3>
                  {Object.values(hostGame.prizes)
                    .filter(prize => prize.won)
                    .map((prize, index) => (
                      <div
                        key={prize.id}
                        className="p-4 bg-white rounded-lg border-2 border-yellow-300 shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-lg font-bold text-gray-800">{prize.name}</h4>
                            <p className="text-gray-600">{prize.pattern}</p>
                          </div>
                          <div className="text-right">
                            {prize.winners && prize.winners.length > 0 && (
                              <div>
                                {prize.winners.map((winner, winnerIndex) => (
                                  <div key={winnerIndex}>
                                    <p className="text-lg font-bold text-green-600">
                                      {winner.name}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      Ticket #{winner.ticketId}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Action Buttons */}
                <div className="text-center pt-4">
                  <Button
                    onClick={createNewGameFromFinished}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold px-8 py-3 rounded-lg shadow-lg transform transition-transform hover:scale-105"
                    size="lg"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Create New Game
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
