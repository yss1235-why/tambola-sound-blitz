// src/hooks/useSmartPolling.ts - Smart Polling Hook with Activity Detection
import { useState, useEffect, useCallback, useRef } from 'react';
import { firebaseService, GameData } from '@/services/firebase';

interface SmartPollingState {
  games: GameData[];
  isLoading: boolean;
  lastUpdate: Date | null;
  isActive: boolean;
  isVisible: boolean;
  pollCount: number;
  error: string | null;
}

interface SmartPollingOptions {
  activeInterval?: number;    // Polling interval when user is active (ms)
  idleInterval?: number;      // Polling interval when user is idle (ms)
  activityTimeout?: number;   // Time before considering user idle (ms)
  enabled?: boolean;          // Enable/disable polling
}

const DEFAULT_OPTIONS: SmartPollingOptions = {
  activeInterval: 10000,      // 10 seconds when active
  idleInterval: 30000,        // 30 seconds when idle
  activityTimeout: 30000,     // 30 seconds of no activity = idle
  enabled: true
};

export const useSmartPolling = (options: SmartPollingOptions = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  const [state, setState] = useState<SmartPollingState>({
    games: [],
    isLoading: true,
    lastUpdate: null,
    isActive: true,
    isVisible: true,
    pollCount: 0,
    error: null
  });

  // Refs for cleanup and state management
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Activity detection
  const resetActivityTimer = useCallback(() => {
    setState(prev => ({ ...prev, isActive: true }));
    
    // Clear existing timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }
    
    // Set new timeout for idle detection
    activityTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, isActive: false }));
    }, config.activityTimeout);
  }, [config.activityTimeout]);

  // Visibility change handler
  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    setState(prev => ({ ...prev, isVisible }));
    
    if (isVisible) {
      resetActivityTimer();
    }
  }, [resetActivityTimer]);

  // Activity event handlers
  const handleActivity = useCallback(() => {
    resetActivityTimer();
  }, [resetActivityTimer]);

  // Setup activity listeners
  useEffect(() => {
    if (!config.enabled) return;

    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    // Add activity listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });
    
    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initialize activity timer
    resetActivityTimer();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
    };
  }, [config.enabled, handleActivity, handleVisibilityChange, resetActivityTimer]);

  // Get current polling interval based on state
  const getCurrentInterval = useCallback(() => {
    if (!state.isVisible) {
      return config.idleInterval! * 2; // Even slower when tab is hidden
    }
    return state.isActive ? config.activeInterval! : config.idleInterval!;
  }, [state.isActive, state.isVisible, config.activeInterval, config.idleInterval]);

  // Fetch games function
  const fetchGames = useCallback(async (): Promise<GameData[]> => {
    try {
      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      console.log(`🔄 Smart polling: Fetching games (${state.isActive ? 'active' : 'idle'} mode)`);

      const games = await firebaseService.getAllActiveGames();
      
      setState(prev => ({
        ...prev,
        games,
        isLoading: false,
        lastUpdate: new Date(),
        pollCount: prev.pollCount + 1,
        error: null
      }));

      console.log(`✅ Smart polling: Found ${games.length} active games`);
      return games;

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('❌ Smart polling: Error fetching games:', error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error.message || 'Failed to fetch games'
        }));
      }
      return [];
    }
  }, [state.isActive]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    await fetchGames();
  }, [fetchGames]);

  // Setup polling interval
  useEffect(() => {
    if (!config.enabled) return;

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Initial fetch
    fetchGames();

    // Setup recurring polling
    const interval = getCurrentInterval();
    console.log(`⏰ Smart polling: Setting interval to ${interval / 1000}s (${state.isActive ? 'active' : 'idle'} mode)`);
    
    intervalRef.current = setInterval(fetchGames, interval);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [config.enabled, getCurrentInterval, fetchGames, state.isActive, state.isVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Return state and actions
  return {
    games: state.games,
    isLoading: state.isLoading,
    lastUpdate: state.lastUpdate,
    isActive: state.isActive,
    isVisible: state.isVisible,
    pollCount: state.pollCount,
    error: state.error,
    refresh,
    currentInterval: getCurrentInterval(),
    
    // Helper functions
    getStatusText: () => {
      if (state.isLoading) return 'Loading...';
      if (state.error) return 'Error loading games';
      if (!state.isVisible) return 'Paused (tab hidden)';
      return state.isActive ? 'Active monitoring' : 'Idle monitoring';
    },
    
    getNextUpdateIn: () => {
      if (!state.lastUpdate) return 0;
      const elapsed = Date.now() - state.lastUpdate.getTime();
      const interval = getCurrentInterval();
      return Math.max(0, interval - elapsed);
    }
  };
};
