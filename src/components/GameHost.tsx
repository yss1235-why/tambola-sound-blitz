// src/components/GameHost.tsx - Fixed version with all issues resolved
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { NumberGrid } from './NumberGrid';
import { TicketManagementGrid } from './TicketManagementGrid';
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
  RefreshCw,
  CheckCircle,
  Gamepad2,
  Trash2,
  Timer,
  Hash
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
    id: 'fullHouse',
    name: 'Full House',
    pattern: 'All numbers',
    description: 'Mark all numbers on the ticket'
  }
];

export const GameHost: React.FC<GameHostProps> = ({ user, userRole }) => {
  // State management
  const [hostGame, setHostGame] = useState<GameData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    hostPhone: '',
    maxTickets: 100,
    selectedTicketSet: '1',
    selectedPrizes: ['quickFive', 'topLine', 'middleLine', 'bottomLine', 'fullHouse']
  });

  // Game play states
  const [availableNumbers, setAvailableNumbers] = useState<number[]>(
    Array.from({ length: 90 }, (_, i) => i + 1)
  );
  const [gameInterval, setGameInterval] = useState<NodeJS.Timeout | null>(null);
  const [callInterval, setCallInterval] = useState(5);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);
  const [currentCountdown, setCurrentCountdown] = useState(0);
  const [countdownDuration] = useState(10);
  
  // Track if game has started (to maintain playing phase)
  const [gameStarted, setGameStarted] = useState(false);

  // Refs
  const gameUnsubscribeRef = useRef<(() => void) | null>(null);

  // FIXED: Determine game phase - once in playing, stay in playing until game over
  const gamePhase = (() => {
    if (!hostGame) return 'creation';
    if (hostGame.gameState.gameOver) return 'finished';
    
    // FIXED: Once game has started (has called numbers or is/was active), stay in playing phase
    if (gameStarted || 
        hostGame.gameState.isActive || 
        hostGame.gameState.isCountdown || 
        (hostGame.gameState.calledNumbers && hostGame.gameState.calledNumbers.length > 0)) {
      return 'playing';
    }
    
    return 'booking';
  })();

  // Check subscription validity
  const isSubscriptionValid = useCallback(() => {
    const now = new Date();
    const endDate = new Date(user.subscriptionEndDate);
    return endDate > now && user.isActive;
  }, [user.subscriptionEndDate, user.isActive]);

  const getSubscriptionStatus = useCallback(() => {
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

  // Load host's current game
  const loadHostCurrentGame = useCallback(async () => {
    try {
      const game = await firebaseService.getHostCurrentGame(user.uid);
      if (game) {
        setHostGame(game);
        
        // Check if game has started
        if (game.gameState.calledNumbers && game.gameState.calledNumbers.length > 0) {
          setGameStarted(true);
        }
        
        // Setup form with existing game data for editing
        setCreateGameForm(prev => ({
          ...prev,
          hostPhone: game.hostPhone || prev.hostPhone,
          maxTickets: game.maxTickets,
          selectedPrizes: Object.keys(game.prizes)
        }));
        
        // Subscribe to updates
        subscribeToGameUpdates(game);
      }
    } catch (error) {
      console.error('Failed to load host game:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user.uid]);

  const subscribeToGameUpdates = useCallback((game: GameData) => {
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
        
        // Track if game has started
        if (calledNums.length > 0) {
          setGameStarted(true);
        }
        
        // Handle game state changes
        if (updatedGame.gameState.gameOver && gameInterval) {
          clearInterval(gameInterval);
          setGameInterval(null);
          setGameStarted(false);
        }

        // Handle countdown updates
        if (updatedGame.gameState.isCountdown) {
          setCurrentCountdown(updatedGame.gameState.countdownTime);
        }
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
        console.error('Failed to load host settings:', error);
      }
    };

    loadPreviousSettings();
  }, [user.uid]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gameUnsubscribeRef.current) {
        gameUnsubscribeRef.current();
      }
      if (gameInterval) {
        clearInterval(gameInterval);
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, [gameInterval, countdownInterval]);

  // Create new game
  const createNewGame = async () => {
    if (!isSubscriptionValid()) {
      alert('Your subscription has expired. Please contact the administrator.');
      return;
    }

    setIsLoading(true);
    try {
      // Save host settings
      await firebaseService.saveHostSettings(user.uid, {
        hostPhone: createGameForm.hostPhone,
        maxTickets: createGameForm.maxTickets,
        selectedTicketSet: createGameForm.selectedTicketSet,
        selectedPrizes: createGameForm.selectedPrizes
      });

      // Create game
      const gameConfig = {
        name: `Tambola Game ${new Date().toLocaleDateString()}`,
        maxTickets: createGameForm.maxTickets,
        ticketPrice: 0,
        hostPhone: createGameForm.hostPhone
      };

      const newGame = await firebaseService.createGame(
        gameConfig,
        user.uid,
        createGameForm.selectedTicketSet,
        createGameForm.selectedPrizes
      );
      
      setHostGame(newGame);
      setGameStarted(false);
      
      // Subscribe to updates
      subscribeToGameUpdates(newGame);

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
      await firebaseService.updateGameData(hostGame.gameId, {
        maxTickets: createGameForm.maxTickets,
        hostPhone: createGameForm.hostPhone
      });
      
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
      setGameStarted(true); // Mark game as started
      
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
    } catch (error) {
      console.error('Failed to start countdown:', error);
    }
  };

  const startGame = async () => {
    if (!hostGame || !isSubscriptionValid()) return;

    try {
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isActive: true,
        isCountdown: false,
        countdownTime: 0
      });

      // Start auto-calling numbers
      const interval = setInterval(() => {
        callNextNumber();
      }, callInterval * 1000);

      setGameInterval(interval);

    } catch (error) {
      console.error('Failed to start game:', error);
    }
  };

  const pauseGame = async () => {
    if (!hostGame) return;

    // Clear the interval but don't change game state
    if (gameInterval) {
      clearInterval(gameInterval);
      setGameInterval(null);
    }

    try {
      // FIXED: Only set isActive to false, don't end the game
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isActive: false
      });
    } catch (error) {
      console.error('Failed to pause game:', error);
    }
  };

  const resumeGame = async () => {
    if (!hostGame || !isSubscriptionValid()) return;

    try {
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isActive: true
      });

      // Resume auto-calling numbers
      const interval = setInterval(() => {
        callNextNumber();
      }, callInterval * 1000);

      setGameInterval(interval);
    } catch (error) {
      console.error('Failed to resume game:', error);
    }
  };

  // FIXED: Auto-calling function
  const callNextNumber = async () => {
    if (!hostGame || availableNumbers.length === 0) return;

    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const number = availableNumbers[randomIndex];

    try {
      // FIXED: Use the correct method name
      const result = await firebaseService.callNumberWithPrizeValidation(hostGame.gameId, number);
      
      // Update available numbers locally
      setAvailableNumbers(prev => prev.filter(n => n !== number));
      
      // Check if game ended due to all prizes won
      if (result.gameEnded) {
        if (gameInterval) {
          clearInterval(gameInterval);
          setGameInterval(null);
        }
        setGameStarted(false);
      }
      
      // Handle prize announcements if any
      if (result.announcements && result.announcements.length > 0) {
        // You can add toast notifications here
        console.log('🎉 Prize Winners:', result.announcements);
      }
      
      // If no numbers left, end the game
      if (availableNumbers.length === 1) { // 1 because we haven't filtered yet
        endGame();
      }
    } catch (error) {
      console.error('Failed to call number:', error);
    }
  };

  // FIXED: Manual number calling
  const manualCallNumber = async (number: number) => {
    if (!hostGame || !availableNumbers.includes(number)) return;

    try {
      // FIXED: Use the correct method name
      const result = await firebaseService.callNumberWithPrizeValidation(hostGame.gameId, number);
      
      // Update available numbers locally
      setAvailableNumbers(prev => prev.filter(n => n !== number));
      
      // Check if game ended due to all prizes won
      if (result.gameEnded) {
        if (gameInterval) {
          clearInterval(gameInterval);
          setGameInterval(null);
        }
        setGameStarted(false);
      }
      
      // Handle prize announcements
      if (result.announcements && result.announcements.length > 0) {
        alert('🎉 ' + result.announcements.join('\n'));
      }
      
      // If no numbers left, end the game
      if (availableNumbers.length === 1) {
        endGame();
      }
    } catch (error) {
      console.error('Failed to manually call number:', error);
    }
  };

  const endGame = async () => {
    if (!hostGame) return;

    if (gameInterval) {
      clearInterval(gameInterval);
      setGameInterval(null);
    }

    try {
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isActive: false,
        gameOver: true
      });
      
      setGameStarted(false);
    } catch (error) {
      console.error('Failed to end game:', error);
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
      setGameStarted(false);
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
    setGameStarted(false);
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
                  value={createGameForm.maxTickets || ''}
                  onChange={(e) => setCreateGameForm(prev => ({ ...prev, maxTickets: parseInt(e.target.value) || 100 }))}
                  className="border-2 border-gray-200 focus:border-blue-400"
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
                          ? 'ring-2 ring-blue-500 bg-blue-50'
                          : 'hover:shadow-md'
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
                    <Button 
                      onClick={startCountdown} 
                      className="bg-green-600 hover:bg-green-700"
                      disabled={getBookedTicketsCount() === 0}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Game
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <Users className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-2xl font-bold text-blue-800">{getBookedTicketsCount()}</p>
                    <p className="text-sm text-blue-600">Booked Tickets</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <Ticket className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    <p className="text-2xl font-bold text-green-800">{hostGame.maxTickets}</p>
                    <p className="text-sm text-green-600">Max Tickets</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <Trophy className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                    <p className="text-2xl font-bold text-purple-800">{Object.keys(hostGame.prizes).length}</p>
                    <p className="text-sm text-purple-600">Prizes</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Phone className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    <p className="text-lg font-bold text-gray-800">{hostGame.hostPhone}</p>
                    <p className="text-sm text-gray-600">Contact</p>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Game is ready for booking. Share your contact number with players to book tickets.
                  </AlertDescription>
                </Alert>

                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Configured Prizes:</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.values(hostGame.prizes).map(prize => (
                      <Badge key={prize.id} variant="outline">
                        {prize.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ticket Management Grid */}
            <TicketManagementGrid
              gameData={hostGame}
              onRefreshGame={loadHostCurrentGame}
            />
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
                      Save Changes
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
                  title={getBookedTicketsCount() > 0 ? 'Cannot delete game with booked tickets' : 'Delete this game'}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Game
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PLAYING PHASE - SIMPLIFIED UI */}
        {gamePhase === 'playing' && hostGame && (
          <div className="space-y-6">
            {/* Game Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Gamepad2 className="w-6 h-6 mr-2" />
                    Live Game Control
                  </span>
                  <Badge variant={hostGame.gameState.isActive ? 'default' : 'secondary'} className="text-lg px-4">
                    {hostGame.gameState.isCountdown && `Countdown: ${currentCountdown}s`}
                    {hostGame.gameState.isActive && '🟢 Game Active'}
                    {!hostGame.gameState.isActive && !hostGame.gameState.isCountdown && !hostGame.gameState.gameOver && '⏸️ Game Paused'}
                    {hostGame.gameState.gameOver && '🏆 Game Finished'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Game Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-4xl font-bold text-blue-800">
                      {hostGame.gameState.currentNumber || '-'}
                    </p>
                    <p className="text-sm text-blue-600">Current Number</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-3xl font-bold text-green-800">
                      {hostGame.gameState.calledNumbers?.length || 0}
                    </p>
                    <p className="text-sm text-green-600">Numbers Called</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-3xl font-bold text-purple-800">
                      {90 - (hostGame.gameState.calledNumbers?.length || 0)}
                    </p>
                    <p className="text-sm text-purple-600">Numbers Left</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <p className="text-3xl font-bold text-orange-800">
                      {getBookedTicketsCount()}
                    </p>
                    <p className="text-sm text-orange-600">Players</p>
                  </div>
                </div>

                {/* Game Control Buttons - FIXED PAUSE/PLAY */}
                <div className="flex flex-wrap gap-4 mb-6">
                  {hostGame.gameState.isCountdown ? (
                    <Button disabled className="flex-1">
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Starting in {currentCountdown}s...
                    </Button>
                  ) : (
                    <>
                      {hostGame.gameState.isActive ? (
                        <Button onClick={pauseGame} variant="secondary" className="flex-1">
                          <Pause className="w-4 h-4 mr-2" />
                          Pause Game
                        </Button>
                      ) : (
                        <Button 
                          onClick={hostGame.gameState.calledNumbers?.length > 0 ? resumeGame : startCountdown} 
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          disabled={hostGame.gameState.gameOver}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          {hostGame.gameState.calledNumbers?.length > 0 ? 'Resume Game' : 'Start Game'}
                        </Button>
                      )}
                    </>
                  )}

                  {!hostGame.gameState.gameOver && hostGame.gameState.calledNumbers && hostGame.gameState.calledNumbers.length > 0 && (
                    <Button onClick={endGame} variant="destructive">
                      <Square className="w-4 h-4 mr-2" />
                      End Game
                    </Button>
                  )}

                  {hostGame.gameState.gameOver && (
                    <Button onClick={createNewGameFromFinished} className="flex-1 bg-blue-600 hover:bg-blue-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Create New Game
                    </Button>
                  )}
                </div>

                {/* Call Interval Control */}
                {!hostGame.gameState.gameOver && (
                  <div className="mb-6">
                    <Label htmlFor="call-interval">Auto Call Interval: {callInterval} seconds</Label>
                    <div className="flex items-center space-x-4 mt-2">
                      <Input
                        id="call-interval"
                        type="range"
                        min="3"
                        max="15"
                        value={callInterval}
                        onChange={(e) => setCallInterval(parseInt(e.target.value))}
                        className="flex-1"
                        disabled={hostGame.gameState.isActive}
                      />
                      <span className="text-sm text-gray-600 w-20 text-center">
                        {callInterval}s
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Adjust the speed of automatic number calling (only when paused)
                    </p>
                  </div>
                )}

                {/* Recent Numbers */}
                {hostGame.gameState.calledNumbers && hostGame.gameState.calledNumbers.length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-semibold mb-3">Recent Numbers Called:</h4>
                    <div className="flex flex-wrap gap-2">
                      {hostGame.gameState.calledNumbers
                        .slice(-20)
                        .reverse()
                        .map((num, index) => (
                          <div
                            key={`${num}-${index}`}
                            className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white
                              ${index === 0 
                                ? 'bg-gradient-to-br from-red-500 to-red-600 ring-2 ring-red-300 text-lg' 
                                : 'bg-gradient-to-br from-blue-500 to-blue-600 text-sm'
                              }`}
                          >
                            {num}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Number Grid for Manual Calling */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Hash className="w-5 h-5 mr-2" />
                  Number Board - Click to Call Manually
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NumberGrid
                  calledNumbers={hostGame.gameState.calledNumbers || []}
                  currentNumber={hostGame.gameState.currentNumber}
                  onNumberClick={manualCallNumber}
                  isHost={true}
                />
              </CardContent>
            </Card>

            {/* Prize Management - Shows status and winners */}
            <PrizeManagementPanel
              gameData={hostGame}
              onRefreshGame={loadHostCurrentGame}
            />

            {/* REMOVED: Full ticket display - only showing count */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Player Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-800">{getBookedTicketsCount()}</p>
                    <p className="text-sm text-blue-600">Total Players</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-800">
                      {Object.values(hostGame.prizes).filter(p => p.won).length}
                    </p>
                    <p className="text-sm text-green-600">Prizes Won</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-800">
                      {Object.values(hostGame.prizes).reduce((total, prize) => 
                        total + (prize.winners?.length || 0), 0
                      )}
                    </p>
                    <p className="text-sm text-purple-600">Total Winners</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* FINISHED PHASE */}
        {gamePhase === 'finished' && hostGame && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Trophy className="w-6 h-6 mr-2" />
                    Game Complete
                  </span>
                  <Button onClick={createNewGameFromFinished} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Game
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Alert className="mb-6">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Game has ended successfully. All {hostGame.gameState.calledNumbers?.length || 0} numbers were called.
                  </AlertDescription>
                </Alert>

                {/* Game Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-800">
                      {getBookedTicketsCount()}
                    </p>
                    <p className="text-sm text-blue-600">Total Players</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-800">
                      {Object.values(hostGame.prizes).filter(p => p.won).length}
                    </p>
                    <p className="text-sm text-green-600">Prizes Awarded</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-800">
                      {hostGame.gameState.calledNumbers?.length || 0}
                    </p>
                    <p className="text-sm text-purple-600">Numbers Called</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Prize Winners */}
            <PrizeManagementPanel
              gameData={hostGame}
              onRefreshGame={loadHostCurrentGame}
            />
          </div>
        )}
      </div>
    </div>
  );
};
