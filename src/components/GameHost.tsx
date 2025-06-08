// src/components/GameHost.tsx - Updated with game name and max tickets
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  Pause, 
  Square, 
  Users, 
  Plus,
  Clock,
  Calendar,
  AlertCircle,
  Trophy,
  Ticket,
  Lock
} from 'lucide-react';
import { 
  firebaseService, 
  GameData, 
  TambolaTicket, 
  HostUser 
} from '@/services/firebase';

interface GameHostProps {
  user: HostUser;
  userRole: 'host';
}

interface TicketSet {
  id: string;
  name: string;
  available: boolean;
  ticketCount: number;
  description: string;
}

interface GamePrize {
  id: string;
  name: string;
  pattern: string;
  description: string;
}

interface CreateGameForm {
  gameName: string;
  maxTickets: number;
  selectedTicketSet: string;
  selectedPrizes: string[];
}

// Ticket sets data
const TICKET_SETS: TicketSet[] = [
  {
    id: "1",
    name: "Classic Set 1",
    available: true,
    ticketCount: 600,
    description: "Traditional ticket set with balanced number distribution"
  },
  {
    id: "2", 
    name: "Premium Set 2",
    available: true,
    ticketCount: 600,
    description: "Premium ticket set with optimized winning patterns"
  },
  {
    id: "3",
    name: "Deluxe Set 3", 
    available: false,
    ticketCount: 600,
    description: "Deluxe ticket set (Coming Soon)"
  },
  {
    id: "4",
    name: "Ultimate Set 4",
    available: false, 
    ticketCount: 600,
    description: "Ultimate ticket set (Coming Soon)"
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
  const [activeTab, setActiveTab] = useState('create-game');
  const [currentGame, setCurrentGame] = useState<GameData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    gameName: '',
    maxTickets: 100,
    selectedTicketSet: '1', // Default to ticket set 1
    selectedPrizes: []
  });
  const { toast } = useToast();

  // Game control states
  const [gameInterval, setGameInterval] = useState<NodeJS.Timeout | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>(
    Array.from({ length: 90 }, (_, i) => i + 1)
  );
  const [gameUnsubscribe, setGameUnsubscribe] = useState<(() => void) | null>(null);

  // Check subscription status
  const isSubscriptionValid = useCallback(() => {
    console.log('🔍 Checking subscription validity for user:', user.email);
    console.log('🔍 User isActive:', user.isActive);
    console.log('🔍 User subscriptionEndDate:', user.subscriptionEndDate);
    
    if (!user.isActive) {
      console.log('❌ User is not active');
      return false;
    }
    
    if (!user.subscriptionEndDate) {
      console.log('❌ No subscription end date');
      return false;
    }
    
    const subscriptionEnd = new Date(user.subscriptionEndDate);
    const now = new Date();
    
    console.log('🔍 Subscription end date:', subscriptionEnd);
    console.log('🔍 Current date:', now);
    console.log('🔍 Is subscription valid?', subscriptionEnd > now);
    
    return subscriptionEnd > now && user.isActive;
  }, [user.isActive, user.subscriptionEndDate, user.email]);

  const getSubscriptionStatus = useCallback(() => {
    console.log('🔍 Getting subscription status for user:', user.email);
    
    if (!user.isActive) {
      console.log('❌ User is inactive');
      return { status: 'inactive', message: 'Account is deactivated', variant: 'destructive' as const };
    }
    
    if (!user.subscriptionEndDate) {
      console.log('❌ No subscription end date');
      return { status: 'no-subscription', message: 'No subscription date', variant: 'destructive' as const };
    }
    
    const subscriptionEnd = new Date(user.subscriptionEndDate);
    const now = new Date();
    
    // Check if date is valid
    if (isNaN(subscriptionEnd.getTime())) {
      console.log('❌ Invalid subscription date:', user.subscriptionEndDate);
      return { status: 'invalid-date', message: 'Invalid subscription date', variant: 'destructive' as const };
    }
    
    const daysLeft = Math.ceil((subscriptionEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log('🔍 Days left:', daysLeft);
    
    if (daysLeft < 0) return { status: 'expired', message: 'Subscription expired', variant: 'destructive' as const };
    if (daysLeft <= 7) return { status: 'expiring', message: `Expires in ${daysLeft} days`, variant: 'secondary' as const };
    return { status: 'active', message: `Active (${daysLeft} days left)`, variant: 'default' as const };
  }, [user.isActive, user.subscriptionEndDate, user.email]);

  // Cleanup intervals and subscriptions on unmount
  useEffect(() => {
    return () => {
      if (gameInterval) {
        clearInterval(gameInterval);
      }
      if (gameUnsubscribe) {
        gameUnsubscribe();
      }
    };
  }, [gameInterval, gameUnsubscribe]);

  const loadTicketSetData = async (setId: string) => {
    try {
      return await firebaseService.loadTicketSet(setId);
    } catch (error) {
      console.error('Error loading ticket set:', error);
      throw new Error('Failed to load ticket set data');
    }
  };

  const createNewGame = async () => {
    if (!isSubscriptionValid()) {
      toast({
        title: "Access Denied",
        description: "Your subscription has expired or account is inactive",
        variant: "destructive",
      });
      return;
    }

    if (!createGameForm.gameName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a game name",
        variant: "destructive",
      });
      return;
    }

    if (!createGameForm.selectedTicketSet) {
      toast({
        title: "Validation Error",
        description: "Please select a ticket set",
        variant: "destructive",
      });
      return;
    }

    if (createGameForm.selectedPrizes.length === 0) {
      toast({
        title: "Validation Error", 
        description: "Please select at least one prize",
        variant: "destructive",
      });
      return;
    }

    if (createGameForm.maxTickets < 1 || createGameForm.maxTickets > 600) {
      toast({
        title: "Validation Error",
        description: "Max tickets must be between 1 and 600",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Load ticket data for selected set
      const ticketSetData = await loadTicketSetData(createGameForm.selectedTicketSet);
      
      // Create the game using the form values
      const gameData = await firebaseService.createGame(
        {
          name: createGameForm.gameName,
          maxTickets: createGameForm.maxTickets,
          ticketPrice: 0, // No ticket price as per requirement
        },
        user.uid,
        createGameForm.selectedTicketSet, // Pass ticket set ID
        createGameForm.selectedPrizes // Pass selected prizes
      );

      setCurrentGame(gameData);
      setCreateGameForm({ 
        gameName: '',
        maxTickets: 100,
        selectedTicketSet: '', 
        selectedPrizes: [] 
      });
      setActiveTab('game-control');

      toast({
        title: "Game Created",
        description: `"${createGameForm.gameName}" has been created successfully with ${createGameForm.maxTickets} tickets!`,
      });

      // Subscribe to real-time game updates
      const unsubscribe = firebaseService.subscribeToGame(gameData.gameId, (updatedGame) => {
        if (updatedGame) {
          setCurrentGame(updatedGame);
          const called = updatedGame.gameState.calledNumbers || [];
          const available = Array.from({ length: 90 }, (_, i) => i + 1)
            .filter(num => !called.includes(num));
          setAvailableNumbers(available);
        }
      });

      setGameUnsubscribe(() => unsubscribe);
    } catch (error: any) {
      console.error('Create game error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create game",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startGame = async () => {
    if (!currentGame || !isSubscriptionValid()) return;

    try {
      // Start countdown
      await firebaseService.updateGameState(currentGame.gameId, {
        ...currentGame.gameState,
        isCountdown: true,
        countdownTime: 10,
        isActive: false
      });

      toast({
        title: "Game Starting",
        description: "10 second countdown has begun!",
      });

      // Start the actual game after countdown
      setTimeout(async () => {
        await firebaseService.updateGameState(currentGame.gameId, {
          ...currentGame.gameState,
          isCountdown: false,
          isActive: true,
          countdownTime: 0
        });

        // Start number calling
        startNumberCalling();
      }, 10000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start game",
        variant: "destructive",
      });
    }
  };

  const startNumberCalling = () => {
    if (!currentGame) return;

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
        // Add the number to called numbers
        await firebaseService.addCalledNumber(currentGame.gameId, numberToBeCalled);
        
        // Update current number (for display)
        await firebaseService.updateGameState(currentGame.gameId, {
          ...currentGame.gameState,
          currentNumber: numberToBeCalled
        });

        console.log(`Number called: ${numberToBeCalled}`);

        // Reset current number after 3 seconds
        setTimeout(async () => {
          await firebaseService.updateGameState(currentGame.gameId, {
            ...currentGame.gameState,
            currentNumber: null
          });
        }, 3000);
      } catch (error) {
        console.error('Error calling number:', error);
      }
    }, currentGame.gameState.callInterval);

    setGameInterval(interval);
  };

  const pauseGame = async () => {
    if (gameInterval) {
      clearInterval(gameInterval);
      setGameInterval(null);
    }

    if (currentGame) {
      try {
        await firebaseService.updateGameState(currentGame.gameId, {
          ...currentGame.gameState,
          isActive: false
        });

        toast({
          title: "Game Paused",
          description: "The game has been paused.",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to pause game",
          variant: "destructive",
        });
      }
    }
  };

  const endGame = async () => {
    if (gameInterval) {
      clearInterval(gameInterval);
      setGameInterval(null);
    }

    if (currentGame) {
      try {
        await firebaseService.updateGameState(currentGame.gameId, {
          ...currentGame.gameState,
          isActive: false,
          gameOver: true,
          currentNumber: null
        });

        toast({
          title: "Game Ended",
          description: "The game has been completed.",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to end game",
          variant: "destructive",
        });
      }
    }
  };

  const getBookedTicketsCount = () => {
    if (!currentGame || !currentGame.tickets) return 0;
    return Object.values(currentGame.tickets || {}).filter(ticket => ticket.isBooked).length;
  };

  const handleTicketSetSelect = (setId: string) => {
    const ticketSet = TICKET_SETS.find(set => set.id === setId);
    if (ticketSet && ticketSet.available) {
      setCreateGameForm(prev => ({ ...prev, selectedTicketSet: setId }));
    }
  };

  const handlePrizeToggle = (prizeId: string, checked: boolean) => {
    setCreateGameForm(prev => ({
      ...prev,
      selectedPrizes: checked 
        ? [...prev.selectedPrizes, prizeId]
        : prev.selectedPrizes.filter(id => id !== prizeId)
    }));
  };

  const subscriptionStatus = getSubscriptionStatus();

  // If subscription is invalid, show warning
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
              
              <div className="mt-6 space-y-2">
                <p className="text-sm text-gray-600">
                  <strong>Account Status:</strong> {user.isActive ? 'Active' : 'Inactive'}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Subscription End:</strong> {user.subscriptionEndDate ? new Date(user.subscriptionEndDate).toLocaleDateString() : 'Not set'}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Created:</strong> {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Not set'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const renderCreateGame = () => (
    <div className="space-y-6">
      {/* Subscription Status */}
      <Card className={`border-l-4 ${
        subscriptionStatus.status === 'active' ? 'border-l-green-500' :
        subscriptionStatus.status === 'expiring' ? 'border-l-yellow-500' : 'border-l-red-500'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Subscription Status</p>
              <Badge variant={subscriptionStatus.variant}>{subscriptionStatus.message}</Badge>
            </div>
            <Calendar className="w-8 h-8 text-gray-400" />
          </div>
        </CardContent>
      </Card>

      {/* Create New Game */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Plus className="w-5 h-5 mr-2" />
            Create New Game
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Game Details */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="game-name" className="text-base font-semibold">Game Name</Label>
              <p className="text-sm text-gray-600 mb-2">Enter a name for your game</p>
              <Input
                id="game-name"
                placeholder="e.g., Sunday Evening Tambola"
                value={createGameForm.gameName}
                onChange={(e) => setCreateGameForm(prev => ({ ...prev, gameName: e.target.value }))}
                className="border-2 border-gray-200 focus:border-blue-400"
              />
            </div>
            
            <div>
              <Label htmlFor="max-tickets" className="text-base font-semibold">Maximum Tickets</Label>
              <p className="text-sm text-gray-600 mb-2">Set the maximum number of tickets to sell (1-600)</p>
              <Input
                id="max-tickets"
                type="number"
                min="1"
                max="600"
                placeholder="100"
                value={createGameForm.maxTickets}
                onChange={(e) => setCreateGameForm(prev => ({ 
                  ...prev, 
                  maxTickets: parseInt(e.target.value) || 1 
                }))}
                className="border-2 border-gray-200 focus:border-blue-400"
              />
            </div>
          </div>

          {/* Ticket Set Selection */}
          <div>
            <Label className="text-base font-semibold">Select Ticket Set</Label>
            <p className="text-sm text-gray-600 mb-4">Choose from available ticket sets</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TICKET_SETS.map((ticketSet) => (
                <Card 
                  key={ticketSet.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    !ticketSet.available 
                      ? 'bg-gray-100 border-gray-300 opacity-60' 
                      : createGameForm.selectedTicketSet === ticketSet.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-25'
                  }`}
                  onClick={() => handleTicketSetSelect(ticketSet.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <Ticket className={`w-5 h-5 mr-2 ${
                            !ticketSet.available ? 'text-gray-400' : 'text-blue-600'
                          }`} />
                          <h3 className={`font-semibold ${
                            !ticketSet.available ? 'text-gray-500' : 'text-gray-800'
                          }`}>
                            {ticketSet.name}
                          </h3>
                          {!ticketSet.available && (
                            <Lock className="w-4 h-4 ml-2 text-gray-400" />
                          )}
                        </div>
                        <p className={`text-sm mb-2 ${
                          !ticketSet.available ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {ticketSet.description}
                        </p>
                        <Badge variant={ticketSet.available ? "default" : "secondary"}>
                          {ticketSet.ticketCount} Tickets
                        </Badge>
                      </div>
                      {createGameForm.selectedTicketSet === ticketSet.id && (
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Prize Selection */}
          <div>
            <Label className="text-base font-semibold">Select Game Prizes</Label>
            <p className="text-sm text-gray-600 mb-4">Choose which prizes to include in this game</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {AVAILABLE_PRIZES.map((prize) => (
                <Card key={prize.id} className="border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id={`prize-${prize.id}`}
                        checked={createGameForm.selectedPrizes.includes(prize.id)}
                        onCheckedChange={(checked) => handlePrizeToggle(prize.id, checked as boolean)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label 
                          htmlFor={`prize-${prize.id}`}
                          className="cursor-pointer"
                        >
                          <div className="mb-1">
                            <h4 className="font-semibold text-gray-800">{prize.name}</h4>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">{prize.pattern}</p>
                          <p className="text-xs text-gray-500">{prize.description}</p>
                        </Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Create Game Button */}
          <Button 
            onClick={createNewGame} 
            disabled={isLoading || !createGameForm.gameName.trim() || !createGameForm.selectedTicketSet || createGameForm.selectedPrizes.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            {isLoading ? 'Creating Game...' : 'Create Game'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderGameControl = () => {
    if (!currentGame) {
      return (
        <Card>
          <CardContent className="p-6 text-center">
            <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No active game. Create a new game to start.</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Game Control: {currentGame.name}
              <Badge variant={currentGame.gameState.isActive ? "default" : "secondary"}>
                {currentGame.gameState.isActive ? "Active" : 
                 currentGame.gameState.isCountdown ? "Starting" : "Waiting"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex space-x-4">
              {!currentGame.gameState.isActive && !currentGame.gameState.isCountdown && !currentGame.gameState.gameOver && (
                <Button onClick={startGame} className="bg-green-500 hover:bg-green-600">
                  <Play className="w-4 h-4 mr-2" />
                  Start Game
                </Button>
              )}

              {currentGame.gameState.isActive && (
                <Button onClick={pauseGame} variant="outline">
                  <Pause className="w-4 h-4 mr-2" />
                  Pause Game
                </Button>
              )}

              {(currentGame.gameState.isActive || currentGame.gameState.isCountdown) && (
                <Button onClick={endGame} variant="destructive">
                  <Square className="w-4 h-4 mr-2" />
                  End Game
                </Button>
              )}
            </div>

            {currentGame.gameState.isCountdown && (
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <Clock className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                <p className="text-lg font-bold text-yellow-800">
                  Game starting in {currentGame.gameState.countdownTime} seconds...
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {(currentGame.gameState.calledNumbers || []).length}
                </div>
                <div className="text-sm text-blue-700">Numbers Called</div>
              </div>

              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {getBookedTicketsCount()}
                </div>
                <div className="text-sm text-green-700">Tickets Booked</div>
              </div>

              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {currentGame.maxTickets}
                </div>
                <div className="text-sm text-purple-700">Max Tickets</div>
              </div>

              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {Object.values(currentGame.prizes || {}).filter(p => p.won).length}
                </div>
                <div className="text-sm text-yellow-700">Prizes Won</div>
              </div>
            </div>

            {currentGame.gameState.currentNumber && (
              <div className="text-center p-6 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg">
                <p className="text-lg mb-2">Current Number</p>
                <p className="text-4xl font-bold">{currentGame.gameState.currentNumber}</p>
              </div>
            )}

            {/* Selected Prizes Display */}
            <div>
              <h4 className="text-lg font-semibold mb-3">Active Prizes</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.values(currentGame.prizes || {}).map((prize: any) => (
                  <div
                    key={prize.id}
                    className={`p-3 rounded-lg border-2 transition-all duration-300 ${
                      prize.won
                        ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 shadow-lg'
                        : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className={`font-bold ${prize.won ? 'text-green-800' : 'text-gray-800'}`}>
                          {prize.name}
                        </h3>
                        <p className={`text-sm ${prize.won ? 'text-green-600' : 'text-gray-600'}`}>
                          {prize.pattern}
                        </p>
                        {prize.winner && (
                          <p className="text-xs text-green-700 font-medium mt-1">
                            Won by: {prize.winner.name}
                          </p>
                        )}
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        prize.won 
                          ? 'bg-green-500 text-white animate-bounce-in' 
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {prize.won ? '✓' : '?'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Numbers */}
            {(currentGame.gameState.calledNumbers || []).length > 0 && (
              <div>
                <h4 className="text-lg font-semibold mb-3">Recent Numbers</h4>
                <div className="flex flex-wrap gap-2">
                  {(currentGame.gameState.calledNumbers || [])
                    .slice(-15)
                    .reverse()
                    .map((num, index) => (
                      <div
                        key={`${num}-${index}`}
                        className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white text-sm
                          ${index === 0 
                            ? 'bg-gradient-to-br from-red-400 to-red-600 ring-4 ring-red-200 animate-pulse' 
                            : 'bg-gradient-to-br from-emerald-400 to-emerald-600'
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
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800">
            Host Dashboard
          </h1>
          <p className="text-slate-600">
            Welcome back, {user.name}! Create and manage your Tambola games.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create-game">Create Game</TabsTrigger>
            <TabsTrigger value="game-control">Game Control</TabsTrigger>
          </TabsList>

          <TabsContent value="create-game" className="mt-6">
            {renderCreateGame()}
          </TabsContent>

          <TabsContent value="game-control" className="mt-6">
            {renderGameControl()}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
