// src/components/GameHost.tsx - Complete fixed version
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TicketManagementGrid } from './TicketManagementGrid';
import { NumberGrid } from './NumberGrid';
import { PrizeManagementPanel } from './PrizeManagementPanel';
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
  Edit,
  Trash2,
  Phone,
  RotateCcw,
  Timer,
  RefreshCw
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
import { auth } from '@/services/firebase';

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
  gameName: string;
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
  const [selectedGameInMyGames, setSelectedGameInMyGames] = useState<GameData | null>(null);
  const [allGames, setAllGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedGameForEdit, setSelectedGameForEdit] = useState<GameData | null>(null);
  
  const [isAutoResuming, setIsAutoResuming] = useState(true);
  const [autoResumeAttempted, setAutoResumeAttempted] = useState(false);
  
  const [createGameForm, setCreateGameForm] = useState<CreateGameForm>({
    hostPhone: '',
    maxTickets: 100,
    selectedTicketSet: '1',
    selectedPrizes: []
  });

  const [editGameForm, setEditGameForm] = useState<EditGameForm>({
    gameId: '',
    gameName: '',
    hostPhone: '',
    maxTickets: 100,
    selectedPrizes: []
  });

  // Game control states
  const [gameInterval, setGameInterval] = useState<NodeJS.Timeout | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>(
    Array.from({ length: 90 }, (_, i) => i + 1)
  );
  
  // Subscription management with refs
  const gameUnsubscribeRef = useRef<(() => void) | null>(null);
  const hostGamesUnsubscribeRef = useRef<(() => void) | null>(null);
  
  const [callInterval, setCallInterval] = useState<number>(5);
  const [countdownDuration, setCountdownDuration] = useState<number>(10);
  const [isGamePaused, setIsGamePaused] = useState<boolean>(false);
  const [currentCountdown, setCurrentCountdown] = useState<number>(0);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);

  // Safety timeout to prevent infinite loading
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      if (isAutoResuming && !autoResumeAttempted) {
        setIsAutoResuming(false);
        setAutoResumeAttempted(true);
      }
    }, 10000);

    return () => clearTimeout(safetyTimeout);
  }, [isAutoResuming, autoResumeAttempted]);

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

  const findActiveOrRecentGame = useCallback((games: GameData[]): GameData | null => {
    if (games.length === 0) return null;
    
    const sortedGames = games.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Check for active games first
    const activeGame = sortedGames.find(game => 
      game.gameState.isActive || 
      game.gameState.isCountdown
    );

    if (activeGame) return activeGame;

    // Check for recent games with progress
    const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
    const recentGame = sortedGames.find(game => {
      const gameDate = new Date(game.createdAt).getTime();
      const hasProgress = game.gameState.calledNumbers && game.gameState.calledNumbers.length > 0;
      const isRecent = gameDate > fourHoursAgo;
      
      return (game.gameState.gameOver || hasProgress) && isRecent;
    });

    if (recentGame) return recentGame;

    // Check for paused games
    const pausedGame = sortedGames.find(game => {
      const hasProgress = game.gameState.calledNumbers && game.gameState.calledNumbers.length > 0;
      return hasProgress && !game.gameState.gameOver;
    });

    return pausedGame || null;
  }, []);

  // Real-time game subscription with better error handling
  const setupGameSubscription = useCallback((game: GameData) => {
    // Clean up previous subscription
    if (gameUnsubscribeRef.current) {
      gameUnsubscribeRef.current();
      gameUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToGame(game.gameId, (updatedGame) => {
      if (updatedGame) {
        setCurrentGame(updatedGame);
        setSelectedGameInMyGames(updatedGame);
        
        // Update available numbers based on called numbers
        const calledNums = updatedGame.gameState.calledNumbers || [];
        const availableNums = Array.from({ length: 90 }, (_, i) => i + 1)
          .filter(num => !calledNums.includes(num));
        setAvailableNumbers(availableNums);
        
        // Handle game state changes automatically
        if (updatedGame.gameState.gameOver && gameInterval) {
          clearInterval(gameInterval);
          setGameInterval(null);
          setIsGamePaused(false);
        }

        // Handle countdown updates
        if (updatedGame.gameState.isCountdown) {
          setCurrentCountdown(updatedGame.gameState.countdownTime);
        }

        // Update game paused state based on real game state
        setIsGamePaused(!updatedGame.gameState.isActive && 
                        !updatedGame.gameState.isCountdown && 
                        !updatedGame.gameState.gameOver &&
                        (updatedGame.gameState.calledNumbers?.length || 0) > 0);
      }
    });

    gameUnsubscribeRef.current = unsubscribe;
  }, [gameInterval]);

  // Real-time host games subscription
  const setupHostGamesSubscription = useCallback(() => {
    // Clean up previous subscription
    if (hostGamesUnsubscribeRef.current) {
      hostGamesUnsubscribeRef.current();
      hostGamesUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToHostGames(user.uid, (games) => {
      setAllGames(games);

      // Auto-update current game if it's in the updated list
      if (currentGame) {
        const updatedCurrentGame = games.find(g => g.gameId === currentGame.gameId);
        if (updatedCurrentGame) {
          setCurrentGame(updatedCurrentGame);
          setSelectedGameInMyGames(updatedCurrentGame);
        }
      }

      // Auto-update selected game in my games
      if (selectedGameInMyGames) {
        const updatedSelectedGame = games.find(g => g.gameId === selectedGameInMyGames.gameId);
        if (updatedSelectedGame) {
          setSelectedGameInMyGames(updatedSelectedGame);
        }
      }
    });

    hostGamesUnsubscribeRef.current = unsubscribe;
  }, [user.uid, currentGame, selectedGameInMyGames]);

  const autoResumeFromGame = useCallback(async (game: GameData) => {
    setAutoResumeAttempted(true);
    
    try {
      setCurrentGame(game);
      setSelectedGameInMyGames(game);
      setActiveTab('game-control');
      
      const called = game.gameState.calledNumbers || [];
      const available = Array.from({ length: 90 }, (_, i) => i + 1)
        .filter(num => !called.includes(num));
      setAvailableNumbers(available);

      // Setup real-time subscription
      setupGameSubscription(game);

      if (game.gameState.isActive && !game.gameState.gameOver) {
        setIsGamePaused(false);
        setTimeout(() => {
          startNumberCalling();
        }, 1000);
      }

    } catch (error) {
      console.error('Error auto-resuming game:', error);
    } finally {
      setIsAutoResuming(false);
    }
  }, [setupGameSubscription]);

  const loadHostGames = useCallback(async () => {
    try {
      const games = await firebaseService.getHostGames(user.uid);
      setAllGames(games);
      
      // Setup real-time subscription for host games
      setupHostGamesSubscription();
      
      if (isAutoResuming && !autoResumeAttempted && games.length > 0) {
        const resumeGame = findActiveOrRecentGame(games);
        if (resumeGame) {
          await autoResumeFromGame(resumeGame);
          return;
        }
      }
      
      setIsAutoResuming(false);
      setAutoResumeAttempted(true);
      
    } catch (error: any) {
      console.error('Error loading host games:', error);
      setIsAutoResuming(false);
      setAutoResumeAttempted(true);
    }
  }, [user.uid, isAutoResuming, autoResumeAttempted, findActiveOrRecentGame, autoResumeFromGame, setupHostGamesSubscription]);

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

  useEffect(() => {
    if (isSubscriptionValid()) {
      loadHostGames();
      loadPreviousSettings();
    } else {
      setIsAutoResuming(false);
    }
  }, [isSubscriptionValid, loadHostGames]);

  const forceStopAutoResume = useCallback(() => {
    setIsAutoResuming(false);
    setAutoResumeAttempted(true);
  }, []);

  // Cleanup with proper subscription management
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
      if (hostGamesUnsubscribeRef.current) {
        hostGamesUnsubscribeRef.current();
      }
    };
  }, [gameInterval, countdownInterval]);

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

  // Form handlers
  const handleMaxTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (value === '') {
      setCreateGameForm(prev => ({ ...prev, maxTickets: 0 }));
      return;
    }
    
    const numValue = parseInt(value, 10);
    
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(1, Math.min(600, numValue));
      setCreateGameForm(prev => ({ ...prev, maxTickets: clampedValue }));
    }
  };

  const handleEditMaxTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (value === '') {
      setEditGameForm(prev => ({ ...prev, maxTickets: 0 }));
      return;
    }
    
    const numValue = parseInt(value, 10);
    
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(1, Math.min(600, numValue));
      setEditGameForm(prev => ({ ...prev, maxTickets: clampedValue }));
    }
  };

  const createNewGame = async () => {
    if (!isSubscriptionValid()) {
      alert('Your subscription has expired or account is inactive');
      return;
    }

    if (!createGameForm.hostPhone.trim()) {
      alert('Please enter your WhatsApp phone number');
      return;
    }

    if (!createGameForm.selectedTicketSet) {
      alert('Please select a ticket set');
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
      console.log('🎮 Starting game creation process...');
      
      // 1. Verify authentication first
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No authenticated user found. Please log in again.');
      }

      console.log('✅ Current user verified:', currentUser.uid, currentUser.email);

      // 2. Force token refresh to ensure it's valid
      console.log('🔄 Refreshing authentication token...');
      await currentUser.getIdToken(true);

      // 3. Verify user role and permissions
      console.log('🔍 Checking user permissions...');
      const userRole = await getCurrentUserRole();
      if (!userRole) {
        throw new Error('User role not found. Please contact administrator.');
      }

      if (userRole !== 'host' && userRole !== 'admin') {
        throw new Error('Insufficient permissions. Only hosts and admins can create games.');
      }

      console.log('✅ User authenticated as:', userRole);

      // 4. Create the game
      console.log('🎮 Creating game...');
      const gameName = `Game ${new Date().toLocaleString()}`;
      
      const gameData = await firebaseService.createGame(
        {
          name: gameName,
          maxTickets: createGameForm.maxTickets,
          ticketPrice: 0,
          hostPhone: createGameForm.hostPhone
        },
        currentUser.uid,
        createGameForm.selectedTicketSet,
        createGameForm.selectedPrizes
      );

      console.log('✅ Game created successfully:', gameData.gameId);

      await savePreviousSettings();

      setCurrentGame(gameData);
      setSelectedGameInMyGames(gameData);
      setActiveTab('my-games');

      setAvailableNumbers(Array.from({ length: 90 }, (_, i) => i + 1));

      // Setup real-time subscription for new game
      setupGameSubscription(gameData);

    } catch (error: any) {
      console.error('❌ Create game error:', error);
      
      // Provide specific error messages
      if (error.message.includes('Permission denied')) {
        alert('Permission Error: Unable to create game. This could be because:\n\n' +
              '1. Your session has expired - please log out and log in again\n' +
              '2. Your host account is not properly set up\n' +
              '3. Your account permissions have changed\n\n' +
              'Please contact the administrator if this continues.');
      } else if (error.message.includes('auth')) {
        alert('Authentication Error: Please log out and log in again.');
      } else {
        alert(error.message || 'Failed to create game. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Game selection with real-time subscription
  const selectGameForControl = useCallback((game: GameData) => {
    setCurrentGame(game);
    setSelectedGameInMyGames(game);
    setActiveTab('game-control');
    
    const called = game.gameState.calledNumbers || [];
    const available = Array.from({ length: 90 }, (_, i) => i + 1)
      .filter(num => !called.includes(num));
    setAvailableNumbers(available);

    // Setup real-time subscription
    setupGameSubscription(game);

    // Auto-resume if game is active
    if (game.gameState.isActive && !game.gameState.gameOver) {
      setIsGamePaused(false);
      setTimeout(() => {
        startNumberCalling();
      }, 1000);
    }
  }, [setupGameSubscription]);

  // Game control methods
  const startCountdown = async () => {
    if (!currentGame || !isSubscriptionValid()) return;

    try {
      setCurrentCountdown(countdownDuration);
      
      await firebaseService.updateGameState(currentGame.gameId, {
        ...currentGame.gameState,
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
    if (!currentGame) return;

    try {
      await firebaseService.updateGameState(currentGame.gameId, {
        ...currentGame.gameState,
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
    if (!currentGame) return;

    const interval = setInterval(async () => {
      if (availableNumbers.length === 0) {
        clearInterval(interval);
        await endGame();
        return;
      }

      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const numberToBeCalled = availableNumbers[randomIndex];
      
      setAvailableNumbers(prev => {
        const newAvailable = prev.filter(n => n !== numberToBeCalled);
        return newAvailable;
      });
      
      try {
        const result = await firebaseService.callNumberWithPrizeValidation(
          currentGame.gameId, 
          numberToBeCalled
        );

        if (result.gameEnded) {
          clearInterval(interval);
          setGameInterval(null);
          setIsGamePaused(false);
          return;
        }

        setTimeout(async () => {
          if (currentGame) {
            await firebaseService.clearCurrentNumber(currentGame.gameId);
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

    if (currentGame) {
      try {
        await firebaseService.updateGameState(currentGame.gameId, {
          ...currentGame.gameState,
          isActive: false,
          isCountdown: false
        });
      } catch (error: any) {
        console.error('Pause game error:', error);
      }
    }
  };

  const resumeGame = async () => {
    if (!currentGame) return;

    try {
      await firebaseService.updateGameState(currentGame.gameId, {
        ...currentGame.gameState,
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

    if (currentGame) {
      try {
        await firebaseService.updateGameState(currentGame.gameId, {
          ...currentGame.gameState,
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

  const resetGame = async () => {
    const confirmed = window.confirm('Are you sure you want to completely reset the game? This will clear all called numbers and reset all prizes. This action cannot be undone.');
    if (!confirmed) return;

    if (gameInterval) {
      clearInterval(gameInterval);
      setGameInterval(null);
    }

    if (countdownInterval) {
      clearInterval(countdownInterval);
      setCountdownInterval(null);
    }

    setIsGamePaused(false);
    setAvailableNumbers(Array.from({ length: 90 }, (_, i) => i + 1));

    if (currentGame) {
      try {
        const resetGameState: GameState = {
          isActive: false,
          isCountdown: false,
          countdownTime: 0,
          gameOver: false,
          calledNumbers: [],
          currentNumber: null,
          callInterval: callInterval * 1000
        };

        const resetPrizes: { [key: string]: Prize } = {};
        for (const [prizeId, prize] of Object.entries(currentGame.prizes)) {
          resetPrizes[prizeId] = {
            id: prize.id,
            name: prize.name,
            pattern: prize.pattern,
            won: false
          };
        }

        const resetData = {
          gameState: resetGameState,
          prizes: resetPrizes,
          lastWinnerAnnouncement: null,
          lastWinnerAt: null,
          resetAt: new Date().toISOString()
        };

        await firebaseService.updateGameData(currentGame.gameId, resetData);

      } catch (error: any) {
        console.error('Reset game error:', error);
        alert(error.message || 'Failed to reset game');
      }
    }
  };

  // Helper methods
  const getBookedTicketsCount = (game?: GameData) => {
    const gameToCheck = game || currentGame;
    if (!gameToCheck || !gameToCheck.tickets) return 0;
    return Object.values(gameToCheck.tickets).filter(ticket => ticket.isBooked).length;
  };

  const subscriptionStatus = getSubscriptionStatus();

  // Subscription check
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

  if (isAutoResuming) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading Your Games...</h2>
            <p className="text-gray-600 mb-4">
              Checking for active games to resume
            </p>
            
            <Button
              onClick={forceStopAutoResume}
              variant="outline"
              className="mt-4"
            >
              Skip Auto-Resume
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              Taking too long? Click to proceed manually.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800">Host Dashboard</h1>
          <p className="text-slate-600">Welcome back, {user.name}!</p>
          <div className="mt-2">
            <Badge variant={subscriptionStatus.variant}>
              {subscriptionStatus.message}
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="create-game">Create Game</TabsTrigger>
            <TabsTrigger value="my-games">My Games</TabsTrigger>
            <TabsTrigger value="game-control">Game Control</TabsTrigger>
          </TabsList>

          <TabsContent value="create-game" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Plus className="w-6 h-6 mr-2" />
                  Create New Game
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
                    onChange={handleMaxTicketsChange}
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
                    'Create Game'
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="my-games" className="mt-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Trophy className="w-6 h-6 mr-2" />
                      My Games ({allGames.length})
                    </div>
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
                        Create Your First Game
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {allGames.map((game) => (
                        <Card
                          key={game.gameId}
                          className={`cursor-pointer transition-all duration-200 ${
                            selectedGameInMyGames?.gameId === game.gameId
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-25'
                          }`}
                          onClick={() => setSelectedGameInMyGames(game)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-bold text-gray-800 truncate">{game.name}</h3>
                              <Badge
                                variant={
                                  game.gameState.isActive ? "default" :
                                  game.gameState.isCountdown ? "secondary" :
                                  game.gameState.gameOver ? "outline" : "secondary"
                                }
                              >
                                {game.gameState.isActive ? "🟢 Live" :
                                 game.gameState.isCountdown ? "🟡 Starting" :
                                 game.gameState.gameOver ? "🔴 Ended" : "⚪ Waiting"}
                              </Badge>
                            </div>
                            
                            <div className="space-y-2 text-sm text-gray-600">
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
                                <span>Numbers Called:</span>
                                <span className="font-medium text-blue-600">
                                  {(game.gameState.calledNumbers || []).length}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Prizes Won:</span>
                                <span className="font-medium text-purple-600">
                                  {Object.values(game.prizes).filter(p => p.won).length}/{Object.keys(game.prizes).length}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Created:</span>
                                <span className="font-medium text-gray-500">
                                  {new Date(game.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            {selectedGameInMyGames?.gameId === game.gameId && (
                              <div className="mt-4 pt-3 border-t border-gray-200">
                                <div className="flex space-x-2">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectGameForControl(game);
                                    }}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                                  >
                                    <Play className="w-4 h-4 mr-1" />
                                    Control
                                  </Button>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Ticket Management for Selected Game */}
              {selectedGameInMyGames && (
                <TicketManagementGrid
                  gameData={selectedGameInMyGames}
                  onRefreshGame={() => {}} // Real-time updates handle this
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="game-control" className="mt-6">
            {!currentGame ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No game selected. Select a game from "My Games" tab first.</p>
                  <Button
                    onClick={() => setActiveTab('my-games')}
                    className="mt-4"
                    variant="outline"
                  >
                    Go to My Games
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Game Control Panel */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Game Control: {currentGame.name}</span>
                      <Badge variant={currentGame.gameState.isActive ? "default" : "secondary"}>
                        {currentGame.gameState.isActive ? "🟢 Live" : 
                         currentGame.gameState.isCountdown ? "🟡 Starting" : 
                         currentGame.gameState.gameOver ? "🔴 Ended" : "⚪ Stopped"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Control Buttons */}
                    <div className="flex flex-wrap gap-3">
                      {!currentGame.gameState.isActive && !currentGame.gameState.isCountdown && !currentGame.gameState.gameOver && (
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

                      {currentGame.gameState.isActive && (
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

                      <Button
                        onClick={resetGame}
                        variant="outline"
                        className="text-orange-600 border-orange-300 hover:bg-orange-50"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset Game
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
                          disabled={currentGame.gameState.isActive}
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
                          disabled={currentGame.gameState.isActive || currentGame.gameState.isCountdown}
                        />
                      </div>
                    </div>

                    {/* Game Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                        <div className="text-sm text-green-700">Booked Tickets</div>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {Object.values(currentGame.prizes).filter(p => p.won).length}
                        </div>
                        <div className="text-sm text-purple-700">Prizes Won</div>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <div className="text-2xl font-bold text-orange-600">
                          {90 - (currentGame.gameState.calledNumbers || []).length}
                        </div>
                        <div className="text-sm text-orange-700">Numbers Left</div>
                      </div>
                    </div>

                    {/* Countdown Display */}
                    {currentGame.gameState.isCountdown && (
                      <div className="text-center p-8 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl">
                        <Clock className="w-12 h-12 mx-auto mb-4 animate-pulse" />
                        <div className="text-6xl font-bold animate-bounce">{currentCountdown}</div>
                        <p className="text-xl mt-2">Game starting...</p>
                      </div>
                    )}

                    {/* Current Number Display */}
                    {currentGame.gameState.currentNumber && (
                      <div className="text-center p-8 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl">
                        <div className="text-8xl font-bold animate-pulse">{currentGame.gameState.currentNumber}</div>
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
                      calledNumbers={currentGame.gameState.calledNumbers || []}
                      currentNumber={currentGame.gameState.currentNumber}
                    />
                  </CardContent>
                </Card>

                {/* Prize Management */}
                <PrizeManagementPanel
                  gameData={currentGame}
                  onRefreshGame={() => {}} // Real-time updates handle this
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
