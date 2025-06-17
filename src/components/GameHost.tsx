// src/components/GameHost.tsx - Updated to use new architecture
import React, { useState, useEffect, useCallback } from 'react';
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
  Trash2
} from 'lucide-react';
import { 
  firebaseService, 
  HostUser
} from '@/services/firebase';
import { useGameData } from '@/providers/GameDataProvider';

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

// Available ticket sets (same as before)
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

// Available game prizes (same as before)
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
  // Use game data from provider
  const { gameData, currentPhase, isLoading } = useGameData();
  
  // Local state for game creation/editing
  const [editMode, setEditMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    hostPhone: '',
    maxTickets: '100',
    selectedTicketSet: '1',
    selectedPrizes: ['quickFive', 'topLine', 'middleLine', 'bottomLine', 'fullHouse']
  });

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
        console.error('Failed to load host settings:', error);
      }
    };

    loadPreviousSettings();
  }, [user.uid]);

  // Create new game
  const createNewGame = async () => {
    if (!isSubscriptionValid()) {
      alert('Your subscription has expired. Please contact the administrator.');
      return;
    }

    const maxTicketsNum = parseInt(createGameForm.maxTickets) || 100;

    setIsCreating(true);
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

      await firebaseService.createGame(
        gameConfig,
        user.uid,
        createGameForm.selectedTicketSet,
        createGameForm.selectedPrizes
      );
      
      // Game data will be updated via provider subscription

    } catch (error: any) {
      console.error('Create game error:', error);
      alert(error.message || 'Failed to create game. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // Update game settings
  const updateGameSettings = async () => {
    if (!gameData) return;

    const maxTicketsNum = parseInt(createGameForm.maxTickets);
    if (isNaN(maxTicketsNum) || maxTicketsNum < 1) {
      alert('Please enter a valid number for max tickets');
      return;
    }

    setIsCreating(true);
    try {
      await firebaseService.updateGameData(gameData.gameId, {
        maxTickets: maxTicketsNum,
        hostPhone: createGameForm.hostPhone
      });
      
      setEditMode(false);

    } catch (error: any) {
      console.error('Update game error:', error);
      alert(error.message || 'Failed to update game');
    } finally {
      setIsCreating(false);
    }
  };

  // Delete game
  const deleteGame = async () => {
    if (!gameData) return;

    const confirmed = window.confirm('Are you sure you want to delete this game? This action cannot be undone.');
    if (!confirmed) return;

    setIsCreating(true);
    try {
      await firebaseService.deleteGame(gameData.gameId);
      // Game data will be updated via provider subscription
    } catch (error: any) {
      console.error('Delete game error:', error);
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

  const getBookedTicketsCount = () => {
    if (!gameData?.tickets) return 0;
    return Object.values(gameData.tickets).filter(ticket => ticket.isBooked).length;
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
        </div>

        {/* CREATION PHASE - No active game */}
        {currentPhase === 'creation' && !gameData && (
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

              <Button
                onClick={createNewGame}
                disabled={isCreating || !createGameForm.hostPhone.trim() || !createGameForm.maxTickets.trim() || createGameForm.selectedPrizes.length === 0}
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
            </CardContent>
          </Card>
        )}

        {/* BOOKING PHASE - Game exists but not started */}
        {currentPhase === 'booking' && gameData && !editMode && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">Game Ready for Booking</h2>
              <div className="flex space-x-2">
                <Button onClick={() => setEditMode(true)} variant="outline">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Settings
                </Button>
              </div>
            </div>

            <HostDisplay onCreateNewGame={() => setEditMode(false)} />
            
            <TicketManagementGrid
              gameData={gameData}
              onRefreshGame={() => {}} // Provider handles updates
            />
          </div>
        )}

        {/* EDIT MODE */}
        {currentPhase === 'booking' && gameData && editMode && (
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
                  disabled={isCreating || !createGameForm.maxTickets.trim() || parseInt(createGameForm.maxTickets) < getBookedTicketsCount()}
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
                  onClick={() => setEditMode(false)}
                  variant="outline"
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={deleteGame}
                  variant="destructive"
                  disabled={isCreating || getBookedTicketsCount() > 0}
                  title={getBookedTicketsCount() > 0 ? 'Cannot delete game with booked tickets' : 'Delete this game'}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Game
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PLAYING & FINISHED PHASES - Use HostDisplay */}
        {(currentPhase === 'countdown' || currentPhase === 'playing' || currentPhase === 'finished') && gameData && (
          <HostDisplay onCreateNewGame={() => window.location.reload()} />
        )}

        {/* Audio Manager */}
        {gameData && (
          <AudioManager
            currentNumber={gameData.gameState.currentNumber}
            prizes={Object.values(gameData.prizes)}
            forceEnable={true}
          />
        )}
      </div>
    </div>
  );
};
