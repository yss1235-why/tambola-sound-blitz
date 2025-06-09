// src/components/GameHost.tsx - Fixed Maximum Tickets input handling
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  Lock,
  Edit,
  Trash2,
  Settings,
  Phone
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
  hostPhone: string;
  maxTickets: number;
  selectedTicketSet: string;
  selectedPrizes: string[];
}

interface EditGameForm {
  gameId: string;
  hostPhone: string;
  maxTickets: number;
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
  const [allGames, setAllGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedGameForEdit, setSelectedGameForEdit] = useState<GameData | null>(null);
  
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    hostPhone: '',
    maxTickets: 100,
    selectedTicketSet: '1',
    selectedPrizes: []
  });

  const [editGameForm, setEditGameForm] = useState<EditGameForm>({
    gameId: '',
    hostPhone: '',
    maxTickets: 100,
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

  // Load host games and settings
  useEffect(() => {
    if (isSubscriptionValid()) {
      loadHostGames();
      loadPreviousSettings();
    }
  }, [user.uid]);

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

  const loadHostGames = async () => {
    try {
      const games = await firebaseService.getHostGames(user.uid);
      setAllGames(games);
    } catch (error: any) {
      console.error('Error loading host games:', error);
      toast({
        title: "Error",
        description: "Failed to load your games",
        variant: "destructive",
      });
    }
  };

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

  // FIXED: Better handling for maxTickets input
  const handleMaxTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Allow empty string (user is clearing the field)
    if (value === '') {
      setCreateGameForm(prev => ({ ...prev, maxTickets: 0 })); // Use 0 as placeholder for empty
      return;
    }
    
    // Parse the number
    const numValue = parseInt(value, 10);
    
    // Only update if it's a valid number
    if (!isNaN(numValue)) {
      // Clamp between 1 and 600
      const clampedValue = Math.max(1, Math.min(600, numValue));
      setCreateGameForm(prev => ({ ...prev, maxTickets: clampedValue }));
    }
  };

  // FIXED: Better handling for edit maxTickets input
  const handleEditMaxTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Allow empty string (user is clearing the field)
    if (value === '') {
      setEditGameForm(prev => ({ ...prev, maxTickets: 0 })); // Use 0 as placeholder for empty
      return;
    }
    
    // Parse the number
    const numValue = parseInt(value, 10);
    
    // Only update if it's a valid number
    if (!isNaN(numValue)) {
      // Clamp between 1 and 600
      const clampedValue = Math.max(1, Math.min(600, numValue));
      setEditGameForm(prev => ({ ...prev, maxTickets: clampedValue }));
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

    if (!createGameForm.hostPhone.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter your WhatsApp phone number",
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

    // FIXED: Better validation for maxTickets
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
      // Generate game name based on timestamp
      const gameName = `Game ${new Date().toLocaleString()}`;
      
      // Create the game
      const gameData = await firebaseService.createGame(
        {
          name: gameName,
          maxTickets: createGameForm.maxTickets,
          ticketPrice: 0,
          hostPhone: createGameForm.hostPhone
        },
        user.uid,
        createGameForm.selectedTicketSet,
        createGameForm.selectedPrizes
      );

      // Save settings for next time
      await savePreviousSettings();

      setCurrentGame(gameData);
      setActiveTab('game-control');
      await loadHostGames(); // Refresh games list

      toast({
        title: "Game Created",
        description: `Game created successfully with ${createGameForm.maxTickets} tickets!`,
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

  const editGame = async () => {
    if (!selectedGameForEdit) return;

    setIsLoading(true);
    try {
      await firebaseService.updateGameConfig(editGameForm.gameId, {
        maxTickets: editGameForm.maxTickets,
        hostPhone: editGameForm.hostPhone,
        selectedPrizes: editGameForm.selectedPrizes
      });

      setShowEditDialog(false);
      setSelectedGameForEdit(null);
      await loadHostGames();

      toast({
        title: "Game Updated",
        description: "Game configuration updated successfully!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update game",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteGame = async (gameId: string, gameName: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${gameName}"? This action cannot be undone.`);
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await firebaseService.deleteGame(gameId);
      await loadHostGames();
      
      if (currentGame?.gameId === gameId) {
        setCurrentGame(null);
        setActiveTab('create-game');
      }

      toast({
        title: "Game Deleted",
        description: "Game has been deleted successfully!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete game",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectGame = (game: GameData) => {
    setCurrentGame(game);
    setActiveTab('game-control');

    // Subscribe to real-time updates for selected game
    if (gameUnsubscribe) {
      gameUnsubscribe();
    }

    const unsubscribe = firebaseService.subscribeToGame(game.gameId, (updatedGame) => {
      if (updatedGame) {
        setCurrentGame(updatedGame);
        const called = updatedGame.gameState.calledNumbers || [];
        const available = Array.from({ length: 90 }, (_, i) => i + 1)
          .filter(num => !called.includes(num));
        setAvailableNumbers(available);
      }
    });

    setGameUnsubscribe(() => unsubscribe);
  };

  const openEditDialog = (game: GameData) => {
    // Check if game has started
    const gameHasStarted = game.gameState.isActive || 
                          game.gameState.gameOver || 
                          (game.gameState.calledNumbers && game.gameState.calledNumbers.length > 0);
    
    if (gameHasStarted) {
      toast({
        title: "Cannot Edit Active Game",
        description: "This game has already started or has progress. Only phone number and max tickets can be modified for active games.",
        variant: "destructive",
      });
    }
    
    setSelectedGameForEdit(game);
    setEditGameForm({
      gameId: game.gameId,
      hostPhone: game.hostPhone || '',
      maxTickets: game.maxTickets,
      selectedPrizes: Object.keys(game.prizes)
    });
    setShowEditDialog(true);
  };

  // Game control functions (same as before)
  const startGame = async () => {
    if (!currentGame || !isSubscriptionValid()) return;

    try {
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

      setTimeout(async () => {
        await firebaseService.updateGameState(currentGame.gameId, {
          ...currentGame.gameState,
          isCountdown: false,
          isActive: true,
          countdownTime: 0
        });

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
        await firebaseService.addCalledNumber(currentGame.gameId, numberToBeCalled);
        await firebaseService.updateGameState(currentGame.gameId, {
          ...currentGame.gameState,
          currentNumber: numberToBeCalled
        });

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

  const getBookedTicketsCount = (game?: GameData) => {
    const gameToCheck = game || currentGame;
    if (!gameToCheck || !gameToCheck.tickets) return 0;
    return Object.values(gameToCheck.tickets).filter(ticket => ticket.isBooked).length;
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

  const handleEditPrizeToggle = (prizeId: string, checked: boolean) => {
    setEditGameForm(prev => ({
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
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const renderMyGames = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            My Games
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allGames.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No games created yet</p>
              <Button
                onClick={() => setActiveTab('create-game')}
                className="mt-4"
                variant="outline"
              >
                Create First Game
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allGames.map((game) => (
                <Card key={game.gameId} className="border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-gray-800">{game.name}</h3>
                      <Badge variant={game.gameState.isActive ? "default" : "secondary"}>
                        {game.gameState.isActive ? "Active" : 
                         game.gameState.gameOver ? "Completed" : "Waiting"}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div className="flex justify-between">
                        <span>Max Tickets:</span>
                        <span className="font-medium">{game.maxTickets}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Booked:</span>
                        <span className="font-medium text-green-600">
                          {getBookedTicketsCount(game)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Prizes:</span>
                        <span className="font-medium text-purple-600">
                          {Object.values(game.prizes).filter(p => p.won).length} / {Object.keys(game.prizes).length}
                        </span>
                      </div>
                      {game.hostPhone && (
                        <div className="flex justify-between">
                          <span>WhatsApp:</span>
                          <span className="font-medium text-blue-600 flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {game.hostPhone}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        onClick={() => selectGame(game)}
                        className="flex-1"
                      >
                        Select
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(game)}
                        disabled={game.gameState.isActive}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteGame(game.gameId, game.name)}
                        disabled={game.gameState.isActive}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

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
          {/* Game Settings */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="host-phone" className="text-base font-semibold">WhatsApp Phone Number</Label>
              <p className="text-sm text-gray-600 mb-2">Your WhatsApp number for ticket bookings (e.g., 919876543210)</p>
              <Input
                id="host-phone"
                placeholder="919876543210"
                value={createGameForm.hostPhone}
                onChange={(e) => setCreateGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
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
                value={createGameForm.maxTickets === 0 ? '' : createGameForm.maxTickets.toString()}
                onChange={handleMaxTicketsChange}
                className="border-2 border-gray-200 focus:border-blue-400"
              />
              {createGameForm.maxTickets === 0 && (
                <p className="text-xs text-red-500 mt-1">Please enter a number between 1 and 600</p>
              )}
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
            disabled={isLoading || !createGameForm.hostPhone.trim() || !createGameForm.selectedTicketSet || createGameForm.selectedPrizes.length === 0 || createGameForm.maxTickets < 1}
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
            <p className="text-gray-600">No game selected. Create or select a game to start.</p>
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="create-game">Create Game</TabsTrigger>
            <TabsTrigger value="my-games">My Games</TabsTrigger>
            <TabsTrigger value="game-control">Game Control</TabsTrigger>
          </TabsList>

          <TabsContent value="create-game" className="mt-6">
            {renderCreateGame()}
          </TabsContent>

          <TabsContent value="my-games" className="mt-6">
            {renderMyGames()}
          </TabsContent>

          <TabsContent value="game-control" className="mt-6">
            {renderGameControl()}
          </TabsContent>
        </Tabs>

        {/* Edit Game Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Game Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-phone">WhatsApp Phone Number</Label>
                <Input
                  id="edit-phone"
                  placeholder="919876543210"
                  value={editGameForm.hostPhone}
                  onChange={(e) => setEditGameForm(prev => ({ ...prev, hostPhone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-max-tickets">Maximum Tickets</Label>
                <Input
                  id="edit-max-tickets"
                  type="number"
                  min="1"
                  max="600"
                  value={editGameForm.maxTickets === 0 ? '' : editGameForm.maxTickets.toString()}
                  onChange={handleEditMaxTicketsChange}
                />
                {editGameForm.maxTickets === 0 && (
                  <p className="text-xs text-red-500 mt-1">Please enter a number between 1 and 600</p>
                )}
              </div>
              <div>
                <Label className="text-base font-semibold">Update Game Prizes</Label>
                <div className="grid grid-cols-1 gap-2 mt-2 max-h-40 overflow-y-auto">
                  {AVAILABLE_PRIZES.map((prize) => (
                    <div key={prize.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-prize-${prize.id}`}
                        checked={editGameForm.selectedPrizes.includes(prize.id)}
                        onCheckedChange={(checked) => handleEditPrizeToggle(prize.id, checked as boolean)}
                      />
                      <Label 
                        htmlFor={`edit-prize-${prize.id}`}
                        className="text-sm cursor-pointer"
                      >
                        {prize.name} - {prize.pattern}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                onClick={editGame}
                disabled={isLoading || !editGameForm.hostPhone.trim() || editGameForm.selectedPrizes.length === 0 || editGameForm.maxTickets < 1}
                className="w-full"
              >
                {isLoading ? 'Updating...' : 'Update Game'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
