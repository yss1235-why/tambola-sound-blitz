// src/components/GameHost.tsx - Fixed subscription and performance issues
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
import { AudioManager } from './AudioManager';
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
  Hash,
  Volume2
} from 'lucide-react';
import { 
  firebaseService, 
  GameData, 
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
  maxTickets: string;
  selectedTicketSet: string;
  selectedPrizes: string[];
}

// Game state enum
enum GamePhase {
  CREATION = 'creation',
  BOOKING = 'booking', 
  PLAYING = 'playing',
  FINISHED = 'finished'
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
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    hostPhone: '',
    maxTickets: '100',
    selectedTicketSet: '1',
    selectedPrizes: ['quickFive', 'topLine', 'middleLine', 'bottomLine', 'fullHouse']
  });

  // Game timing state
  const [callInterval, setCallInterval] = useState(5);
  const [currentCountdown, setCurrentCountdown] = useState(0);
  const [isCallingNumber, setIsCallingNumber] = useState(false);
  const [isWaitingForAudio, setIsWaitingForAudio] = useState(false);
  
  // Timer references
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track game state
  const gameActiveRef = useRef(false);
  const lastCalledNumberRef = useRef<number | null>(null);
  
  // Track if game has started
  const [gameStarted, setGameStarted] = useState(false);

  // Single subscription reference
  const gameSubscriptionRef = useRef<(() => void) | null>(null);

  // Determine game phase
  const gamePhase: GamePhase = (() => {
    if (!hostGame) return GamePhase.CREATION;
    if (hostGame.gameState.gameOver) return GamePhase.FINISHED;
    if (gameStarted || hostGame.gameState.calledNumbers?.length > 0) return GamePhase.PLAYING;
    return GamePhase.BOOKING;
  })();

  // Subscription validity check
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

  // Clear all timers
  const clearAllTimers = useCallback(() => {
    if (gameTimerRef.current) {
      clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  // Call next number function
  const callNextNumber = useCallback(async () => {
    if (!hostGame || !gameActiveRef.current) {
      return;
    }

    if (isCallingNumber || isWaitingForAudio) {
      return;
    }

    const calledNumbers = hostGame.gameState.calledNumbers || [];
    const availableNumbers = Array.from({ length: 90 }, (_, i) => i + 1)
      .filter(num => !calledNumbers.includes(num));

    if (availableNumbers.length === 0) {
      endGame();
      return;
    }

    setIsCallingNumber(true);

    try {
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const number = availableNumbers[randomIndex];

      lastCalledNumberRef.current = number;

      const result = await firebaseService.callNumberWithPrizeValidation(hostGame.gameId, number);
      
      setIsCallingNumber(false);

      if (result.gameEnded || availableNumbers.length === 1) {
        gameActiveRef.current = false;
        endGame();
        return;
      }

    if (gameActiveRef.current) {
  // setIsWaitingForAudio(true);  // ← Comment this out
  
  // Skip audio waiting - call next number immediately after interval
  setTimeout(() => {
    if (gameActiveRef.current) {
      callNextNumber();
    }
  }, callInterval * 1000);
}

    } catch (error) {
      console.error('Failed to call number:', error);
      setIsCallingNumber(false);
      setIsWaitingForAudio(false);
      
      if (gameActiveRef.current) {
        gameTimerRef.current = setTimeout(() => {
          callNextNumber();
        }, 2000);
      }
    }
  }, [hostGame, isCallingNumber, isWaitingForAudio]);

  // Handle audio completion
  const handleAudioComplete = useCallback(() => {
    setIsWaitingForAudio(false);
    
    if (gameActiveRef.current && hostGame?.gameState.isActive && !hostGame.gameState.gameOver) {
      if (gameTimerRef.current) {
        clearTimeout(gameTimerRef.current);
        gameTimerRef.current = null;
      }

      gameTimerRef.current = setTimeout(() => {
        if (gameActiveRef.current) {
          callNextNumber();
        }
      }, callInterval * 1000);
    }
  }, [hostGame, callInterval, callNextNumber]);

  // Load host's current game with subscription management
  const loadHostCurrentGame = useCallback(async () => {
    try {
      // Clean up any existing subscription first
      if (gameSubscriptionRef.current) {
        gameSubscriptionRef.current();
        gameSubscriptionRef.current = null;
      }

      const game = await firebaseService.getHostCurrentGame(user.uid);
      if (game) {
        setHostGame(game);
        
        if ((game.gameState.calledNumbers?.length || 0) > 0) {
          setGameStarted(true);
        }
        
        setCreateGameForm(prev => ({
          ...prev,
          hostPhone: game.hostPhone || prev.hostPhone,
          maxTickets: game.maxTickets.toString(),
          selectedPrizes: Object.keys(game.prizes)
        }));
        
        // Setup single subscription
        const unsubscribe = firebaseService.subscribeToGame(game.gameId, (updatedGame) => {
          if (updatedGame) {
            setHostGame(updatedGame);
            
            if ((updatedGame.gameState.calledNumbers?.length || 0) > 0) {
              setGameStarted(true);
            }
            
            if (updatedGame.gameState.gameOver) {
              gameActiveRef.current = false;
              clearAllTimers();
              setIsCallingNumber(false);
              setIsWaitingForAudio(false);
              setGameStarted(false);
            }

            if (updatedGame.gameState.isCountdown) {
              setCurrentCountdown(updatedGame.gameState.countdownTime);
            }

            gameActiveRef.current = updatedGame.gameState.isActive && !updatedGame.gameState.gameOver;

            // Resume number calling if needed
            if (updatedGame.gameState.isActive && !updatedGame.gameState.gameOver) {
              const hasActiveTimer = gameTimerRef.current !== null;
              const isProcessing = isCallingNumber || isWaitingForAudio;
              
              if (!hasActiveTimer && !isProcessing) {
                setTimeout(() => {
                  if (gameActiveRef.current) {
                    callNextNumber();
                  }
                }, 1000);
              }
            }
          } else {
            // Game was deleted
            setHostGame(null);
            gameActiveRef.current = false;
            clearAllTimers();
          }
        });
        
        gameSubscriptionRef.current = unsubscribe;
      }
    } catch (error) {
      console.error('Failed to load host game:', error);
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [user.uid, clearAllTimers, callNextNumber, isCallingNumber, isWaitingForAudio]);

  // Load on mount
  useEffect(() => {
    if (isSubscriptionValid()) {
      loadHostCurrentGame();
    } else {
      setIsLoading(false);
      setIsInitialLoad(false);
    }

    // Cleanup on unmount
    return () => {
      gameActiveRef.current = false;
      clearAllTimers();
      if (gameSubscriptionRef.current) {
        gameSubscriptionRef.current();
        gameSubscriptionRef.current = null;
      }
    };
  }, []); // Empty dependency array - only run on mount

  // Load previous settings
  useEffect(() => {
    const loadPreviousSettings = async () => {
      if (isInitialLoad) return;
      
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
        console.error('Failed to load host settings:', error);
      }
    };

    loadPreviousSettings();
  }, [user.uid, isInitialLoad]);

  // Create new game
  const createNewGame = async () => {
    if (!isSubscriptionValid()) {
      alert('Your subscription has expired. Please contact the administrator.');
      return;
    }

    const maxTicketsNum = parseInt(createGameForm.maxTickets) || 100;

    setIsLoading(true);
    try {
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
      
      setHostGame(newGame);
      setGameStarted(false);
      
      // Load the game with subscription
      await loadHostCurrentGame();

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

    const maxTicketsNum = parseInt(createGameForm.maxTickets);
    if (isNaN(maxTicketsNum) || maxTicketsNum < 1) {
      alert('Please enter a valid number for max tickets');
      return;
    }

    setIsLoading(true);
    try {
      await firebaseService.updateGameData(hostGame.gameId, {
        maxTickets: maxTicketsNum,
        hostPhone: createGameForm.hostPhone
      });
      
      setEditMode(false);
      // NO need to refresh - subscription will handle update

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

    clearAllTimers();
    gameActiveRef.current = false;

    try {
      const countdownDuration = 10;
      setCurrentCountdown(countdownDuration);
      setGameStarted(true);
      
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isCountdown: true,
        countdownTime: countdownDuration,
        isActive: false
      });

      let timeLeft = countdownDuration;
      countdownTimerRef.current = setInterval(async () => {
        timeLeft--;
        setCurrentCountdown(timeLeft);
        
        if (timeLeft <= 0) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          startGame();
        }
      }, 1000);

    } catch (error) {
      console.error('Failed to start countdown:', error);
    }
  };

  const startGame = async () => {
    if (!hostGame || !isSubscriptionValid()) return;

    clearAllTimers();
    gameActiveRef.current = true;

    try {
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isActive: true,
        isCountdown: false,
        countdownTime: 0
      });

      setTimeout(() => {
        if (gameActiveRef.current) {
          callNextNumber();
        }
      }, 1000);

    } catch (error) {
      console.error('Failed to start game:', error);
      gameActiveRef.current = false;
    }
  };

  const pauseGame = async () => {
    if (!hostGame) return;

    gameActiveRef.current = false;
    clearAllTimers();
    setIsCallingNumber(false);
    setIsWaitingForAudio(false);

    try {
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

    clearAllTimers();
    gameActiveRef.current = true;

    try {
      await firebaseService.updateGameState(hostGame.gameId, {
        ...hostGame.gameState,
        isActive: true
      });

      setTimeout(() => {
        if (gameActiveRef.current) {
          callNextNumber();
        }
      }, 1000);
      
    } catch (error) {
      console.error('Failed to resume game:', error);
      gameActiveRef.current = false;
    }
  };

  const endGame = async () => {
    if (!hostGame) return;

    gameActiveRef.current = false;
    clearAllTimers();
    setIsCallingNumber(false);
    setIsWaitingForAudio(false);

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

    gameActiveRef.current = false;
    clearAllTimers();
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
    gameActiveRef.current = false;
    clearAllTimers();
    setHostGame(null);
    setEditMode(false);
    setGameStarted(false);
    setIsCallingNumber(false);
    setIsWaitingForAudio(false);
  };

  const handleIntervalChange = (newInterval: number) => {
    setCallInterval(newInterval);
  };

  const handleMaxTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setCreateGameForm(prev => ({ ...prev, maxTickets: value }));
    }
  };

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
  if (isInitialLoad && isLoading) {
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
          
          <div className="text-right">
            <Badge variant="outline" className="text-lg px-4 py-2">
              {gamePhase === GamePhase.CREATION && '🎮 Create Game'}
              {gamePhase === GamePhase.BOOKING && !editMode && '🎫 Booking Open'}
              {gamePhase === GamePhase.BOOKING && editMode && '✏️ Edit Settings'}
              {gamePhase === GamePhase.PLAYING && '🔴 Live Game'}
              {gamePhase === GamePhase.FINISHED && '🏆 Game Complete'}
            </Badge>
            {isWaitingForAudio && (
              <Badge variant="secondary" className="ml-2">
                <Volume2 className="w-3 h-3 mr-1 animate-pulse" />
                Announcing...
              </Badge>
            )}
          </div>
        </div>

        {/* CREATION PHASE */}
        {gamePhase === GamePhase.CREATION && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="w-6 h-6 mr-2" />
                Create New Tambola Game
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
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

              <div>
                <Label htmlFor="max-tickets">Maximum Tickets</Label>
                <Input
                  id="max-tickets"
                  type="number"
                  min="1"
                  max="600"
                  placeholder="Enter number of tickets"
                  value={createGameForm.maxTickets}
                  onChange={handleMaxTicketsChange}
                  className="border-2 border-gray-200 focus:border-blue-400"
                />
                <p className="text-sm text-gray-500 mt-1">How many tickets can be sold for this game</p>
              </div>

              {/* FIXED: Ticket Set Selection with better contrast */}
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
                      } ${!ticketSet.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => ticketSet.available && setCreateGameForm(prev => ({ ...prev, selectedTicketSet: ticketSet.id }))}
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

              <Button
                onClick={createNewGame}
                disabled={isLoading || !createGameForm.hostPhone.trim() || !createGameForm.maxTickets.trim() || createGameForm.selectedPrizes.length === 0}
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
        {gamePhase === GamePhase.BOOKING && !editMode && hostGame && (
          <div className="space-y-6">
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

            <TicketManagementGrid
              gameData={hostGame}
              onRefreshGame={() => {}} // No need to refresh anymore
            />
          </div>
        )}

        {/* EDIT MODE */}
        {gamePhase === GamePhase.BOOKING && editMode && hostGame && (
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
                  onChange={handleMaxTicketsChange}
                  className="border-2 border-gray-200 focus:border-blue-400"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Current bookings: {getBookedTicketsCount()}. Cannot set below current bookings.
                </p>
              </div>

              <div className="flex space-x-4">
                <Button
                  onClick={updateGameSettings}
                  disabled={isLoading || !createGameForm.maxTickets.trim() || parseInt(createGameForm.maxTickets) < getBookedTicketsCount()}
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

        {/* PLAYING PHASE */}
        {gamePhase === GamePhase.PLAYING && hostGame && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Gamepad2 className="w-6 h-6 mr-2" />
                    Live Game Control - Automatic Mode
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

                {isWaitingForAudio && (
                  <Alert className="mb-4">
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    <AlertDescription>
                      Audio announcement in progress. Next number will be called after announcement completes and delay period.
                    </AlertDescription>
                  </Alert>
                )}

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
                        onChange={(e) => handleIntervalChange(parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm text-gray-600 w-20 text-center">
                        {callInterval}s
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Time between number calls (after audio announcements complete)
                    </p>
                  </div>
                )}

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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Hash className="w-5 h-5 mr-2" />
                    Number Board - Automatic Generation Only
                  </span>
                  <Badge variant="outline">View Only</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    All numbers are generated automatically. Manual selection has been disabled to ensure fair play.
                  </AlertDescription>
                </Alert>
                <NumberGrid
                  calledNumbers={hostGame.gameState.calledNumbers || []}
                  currentNumber={hostGame.gameState.currentNumber}
                  isHost={false}
                />
              </CardContent>
            </Card>

            <PrizeManagementPanel
              gameData={hostGame}
              onRefreshGame={() => {}} // No need to refresh anymore
            />

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
        {gamePhase === GamePhase.FINISHED && hostGame && (
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

            <PrizeManagementPanel
              gameData={hostGame}
              onRefreshGame={() => {}} // No need to refresh anymore
            />
          </div>
        )}

        {/* Audio Manager */}
        {hostGame && (
          <AudioManager
            currentNumber={hostGame.gameState.currentNumber}
            prizes={Object.values(hostGame.prizes)}
            onAudioComplete={handleAudioComplete}
            forceEnable={true}
          />
        )}
      </div>
    </div>
  );
};
