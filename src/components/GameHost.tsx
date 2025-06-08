// src/components/GameHost.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Play, 
  Pause, 
  Square, 
  Users, 
  Trophy, 
  Settings, 
  Plus,
  Clock,
  DollarSign
} from 'lucide-react';
import { 
  firebaseService, 
  GameData, 
  TambolaTicket, 
  AdminUser, 
  HostUser 
} from '@/services/firebase';

interface GameHostProps {
  user: AdminUser | HostUser;
  userRole: 'admin' | 'host';
}

interface CreateGameForm {
  name: string;
  maxTickets: number;
  ticketPrice: number;
}

export const GameHost: React.FC<GameHostProps> = ({ user, userRole }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentGame, setCurrentGame] = useState<GameData | null>(null);
  const [gamesList, setGamesList] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    name: '',
    maxTickets: 50,
    ticketPrice: 100
  });
  const { toast } = useToast();

  // Game control states
  const [gameInterval, setGameInterval] = useState<NodeJS.Timeout | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>(
    Array.from({ length: 90 }, (_, i) => i + 1)
  );

  // Load games when component mounts
  useEffect(() => {
    loadGames();
  }, []);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (gameInterval) {
        clearInterval(gameInterval);
      }
    };
  }, [gameInterval]);

  const loadGames = async () => {
    setIsLoading(true);
    try {
      // In a real implementation, you'd fetch games from Firebase
      // For now, we'll use a placeholder
      setGamesList([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load games",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createNewGame = async () => {
    if (!createGameForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a game name",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const gameData = await firebaseService.createGame(
        {
          name: createGameForm.name,
          maxTickets: createGameForm.maxTickets,
          ticketPrice: createGameForm.ticketPrice
        },
        user.uid
      );

      setCurrentGame(gameData);
      setGamesList(prev => [...prev, gameData]);
      setCreateGameForm({ name: '', maxTickets: 50, ticketPrice: 100 });
      setActiveTab('game-control');

      toast({
        title: "Game Created",
        description: `${gameData.name} has been created successfully!`,
      });

      // Subscribe to game updates
      const unsubscribe = firebaseService.subscribeToGame(gameData.gameId, (updatedGame) => {
        if (updatedGame) {
          setCurrentGame(updatedGame);
        }
      });

      // Store unsubscribe function for cleanup
      return unsubscribe;
    } catch (error: any) {
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
    if (!currentGame) return;

    try {
      await firebaseService.updateGameState(currentGame.gameId, {
        ...currentGame.gameState,
        isCountdown: true,
        countdownTime: 10,
        isActive: false
      });

      // Start countdown
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

      toast({
        title: "Game Starting",
        description: "10 second countdown has begun!",
      });
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

        // Reset current number after 2 seconds
        setTimeout(async () => {
          await firebaseService.updateGameState(currentGame.gameId, {
            ...currentGame.gameState,
            currentNumber: null
          });
        }, 2000);
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
          gameOver: true
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
    if (!currentGame) return 0;
    return Object.values(currentGame.tickets).filter(ticket => ticket.isBooked).length;
  };

  const getTotalRevenue = () => {
    if (!currentGame) return 0;
    return getBookedTicketsCount() * currentGame.ticketPrice;
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Games</p>
                <p className="text-2xl font-bold">{gamesList.length}</p>
              </div>
              <Trophy className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Players</p>
                <p className="text-2xl font-bold">{currentGame ? getBookedTicketsCount() : 0}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Revenue</p>
                <p className="text-2xl font-bold">₹{getTotalRevenue()}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {currentGame && (
        <Card>
          <CardHeader>
            <CardTitle>Current Game: {currentGame.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <Badge variant={currentGame.gameState.isActive ? "default" : "secondary"}>
                {currentGame.gameState.isActive ? "Active" : "Waiting"}
              </Badge>
              <span className="text-sm text-gray-600">
                {getBookedTicketsCount()}/{currentGame.maxTickets} tickets booked
              </span>
            </div>
            
            {currentGame.gameState.calledNumbers.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Recent Numbers:</p>
                <div className="flex flex-wrap gap-2">
                  {currentGame.gameState.calledNumbers.slice(-10).map((num, index) => (
                    <Badge key={index} variant="outline">{num}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderCreateGame = () => (
    <Card>
      <CardHeader>
        <CardTitle>Create New Game</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="game-name">Game Name</Label>
          <Input
            id="game-name"
            placeholder="Enter game name"
            value={createGameForm.name}
            onChange={(e) => setCreateGameForm(prev => ({ ...prev, name: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="max-tickets">Max Tickets</Label>
            <Input
              id="max-tickets"
              type="number"
              min="1"
              max="100"
              value={createGameForm.maxTickets}
              onChange={(e) => setCreateGameForm(prev => ({ ...prev, maxTickets: parseInt(e.target.value) || 50 }))}
            />
          </div>

          <div>
            <Label htmlFor="ticket-price">Ticket Price (₹)</Label>
            <Input
              id="ticket-price"
              type="number"
              min="10"
              value={createGameForm.ticketPrice}
              onChange={(e) => setCreateGameForm(prev => ({ ...prev, ticketPrice: parseInt(e.target.value) || 100 }))}
            />
          </div>
        </div>

        <Button 
          onClick={createNewGame} 
          disabled={isLoading || !createGameForm.name.trim()}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          {isLoading ? 'Creating...' : 'Create Game'}
        </Button>
      </CardContent>
    </Card>
  );

  const renderGameControl = () => {
    if (!currentGame) {
      return (
        <Card>
          <CardContent className="p-6 text-center">
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {currentGame.gameState.calledNumbers.length}
                </div>
                <div className="text-sm text-blue-700">Numbers Called</div>
              </div>

              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {getBookedTicketsCount()}
                </div>
                <div className="text-sm text-green-700">Tickets Sold</div>
              </div>

              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  ₹{getTotalRevenue()}
                </div>
                <div className="text-sm text-purple-700">Revenue</div>
              </div>

              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {Object.values(currentGame.prizes).filter(p => p.won).length}
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
            Game Host Dashboard
          </h1>
          <p className="text-slate-600">
            Welcome back, {user.name}! Manage your Tambola games here.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="create-game">Create Game</TabsTrigger>
            <TabsTrigger value="game-control">Game Control</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            {renderDashboard()}
          </TabsContent>

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
