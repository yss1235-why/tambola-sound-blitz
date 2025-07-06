// src/providers/GameDataProvider.tsx - FIXED: Better loading state management
import React, { createContext, useContext, useMemo } from 'react';
import { GameData } from '@/services/firebase';
import { useGameSubscription, useHostCurrentGameSubscription } from '@/hooks/useFirebaseSubscription';

// Game phase enum for cleaner state management
export type GamePhase = 'creation' | 'setup' | 'booking' | 'countdown' | 'playing' | 'finished';

interface GameDataContextValue {
  gameData: GameData | null;
  currentPhase: GamePhase;
  timeUntilAction: number;
  isLoading: boolean;
  error: string | null;
}

const GameDataContext = createContext<GameDataContextValue | null>(null);

interface GameDataProviderProps {
  children: React.ReactNode;
  gameId?: string | null;
  userId?: string | null; // For host mode
}

/**
 * Simplified GameDataProvider - Only handles data, no subscriptions or actions
 * FIXED: Better loading state management to prevent infinite loading
 */
export const GameDataProvider: React.FC<GameDataProviderProps> = ({
  children,
  gameId,
  userId
}) => {
  // Determine subscription type based on props
  const isHostMode = !!userId && (!gameId || gameId === 'HOST_CURRENT');
  
  // Use appropriate subscription
  const hostGameSub = useHostCurrentGameSubscription(isHostMode ? userId : null);
  const directGameSub = useGameSubscription(!isHostMode && gameId ? gameId : null);
  
  // Select active subscription data
  const activeSubscription = isHostMode ? hostGameSub : directGameSub;
  const gameData = activeSubscription.data;
  const subscriptionLoading = activeSubscription.loading;
  const error = activeSubscription.error;

  // ✅ FIXED: Better loading state logic
  // Only show loading for a reasonable amount of time
  const [loadingStartTime] = React.useState(Date.now());
  const isLoading = useMemo(() => {
    // If subscription resolved (loading false) or has data/error, don't show loading
    if (!subscriptionLoading || gameData || error) {
      return false;
    }
    
    // If loading for more than 5 seconds, stop showing loading
    const loadingTime = Date.now() - loadingStartTime;
    if (loadingTime > 5000) {
      console.warn('GameDataProvider: Loading timeout reached, resolving...');
      return false;
    }
    
    return true;
  }, [subscriptionLoading, gameData, error, loadingStartTime]);

  // Calculate current game phase (pure function)
  const currentPhase = useMemo((): GamePhase => {
    if (!gameData) {
      return 'creation';
    }

    const { gameState } = gameData;
    
    if (gameState.gameOver) {
      return 'finished';
    }
    
    if (gameState.isCountdown) {
      return 'countdown';
    }
    
    if (gameState.isActive || (gameState.calledNumbers && gameState.calledNumbers.length > 0)) {
      return 'playing';
    }
    
    return 'booking';
  }, [gameData]);

  // Calculate time until next action (pure function)
  const timeUntilAction = useMemo((): number => {
    if (currentPhase === 'countdown' && gameData?.gameState.countdownTime) {
      return gameData.gameState.countdownTime;
    }
    return 0;
  }, [currentPhase, gameData?.gameState.countdownTime]);

  // ✅ FIXED: Debug logging for host mode
  React.useEffect(() => {
    if (isHostMode) {
      console.log(`🎮 GameDataProvider (Host Mode):`, {
        userId,
        gameData: gameData ? `Found: ${gameData.gameId}` : 'None',
        currentPhase,
        isLoading,
        subscriptionLoading,
        error
      });
    }
 }, [isHostMode, userId, gameData, currentPhase, isLoading, subscriptionLoading, error]);

  // ✅ NEW: Listen for explicit game end events
  React.useEffect(() => {
    const handleGameEnd = (event: CustomEvent) => {
      const { gameId: endedGameId, showWinners, gameData: endedGameData } = event.detail;
      console.log(`🎉 GameDataProvider received game end event for ${endedGameId} - current game: ${gameData?.gameId}`);
      
      if (gameData?.gameId === endedGameId && endedGameData) {
        console.log('✅ Game end event matches current game - data should auto-update via subscription');
        
        // Since this provider uses subscriptions, the data should auto-update
        // This event listener is mainly for debugging and potential manual refresh
        if (endedGameData.gameState?.gameOver) {
          console.log('🏆 Game Over confirmed - winner display should now show');
        }
      }
    };

    window.addEventListener('tambola-game-ended', handleGameEnd as EventListener);
    
    return () => {
      window.removeEventListener('tambola-game-ended', handleGameEnd as EventListener);
    };
  }, [gameData?.gameId]);

  // Create stable context value
  const contextValue = useMemo((): GameDataContextValue => ({
    gameData,
    currentPhase,
    timeUntilAction,
    isLoading,
    error
  }), [gameData, currentPhase, timeUntilAction, isLoading, error]);

  return (
    <GameDataContext.Provider value={contextValue}>
      {children}
    </GameDataContext.Provider>
  );
};

/**
 * Hook to access game data from any child component
 */
export const useGameData = (): GameDataContextValue => {
  const context = useContext(GameDataContext);
  if (!context) {
    throw new Error('useGameData must be used within a GameDataProvider');
  }
  return context;
};

/**
 * Utility hooks for specific data needs
 */

// Get booking statistics
export const useBookingStats = () => {
  const { gameData } = useGameData();
  
  return useMemo(() => {
    if (!gameData?.tickets) {
      return { bookedCount: 0, availableCount: 0, totalCount: 0 };
    }
    
    const bookedCount = Object.values(gameData.tickets).filter(t => t.isBooked).length;
    const totalCount = gameData.maxTickets;
    const availableCount = totalCount - bookedCount;
    
    return { bookedCount, availableCount, totalCount };
  }, [gameData?.tickets, gameData?.maxTickets]);
};

// Get game progress
export const useGameProgress = () => {
  const { gameData } = useGameData();
  
  return useMemo(() => {
    if (!gameData?.gameState.calledNumbers) {
      return { called: 0, remaining: 90, percentage: 0 };
    }
    
    const called = gameData.gameState.calledNumbers.length;
    const remaining = 90 - called;
    const percentage = Math.round((called / 90) * 100);
    
    return { called, remaining, percentage };
  }, [gameData?.gameState.calledNumbers]);
};

// Get prize statistics
export const usePrizeStats = () => {
  const { gameData } = useGameData();
  
  return useMemo(() => {
    if (!gameData?.prizes) {
      return { total: 0, won: 0, remaining: 0 };
    }
    
    const prizes = Object.values(gameData.prizes);
    const total = prizes.length;
    const won = prizes.filter(p => p.won).length;
    const remaining = total - won;
    
    return { total, won, remaining };
  }, [gameData?.prizes]);
};
