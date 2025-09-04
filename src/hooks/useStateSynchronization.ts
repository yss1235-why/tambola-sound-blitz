// src/hooks/useStateSynchronization.ts
import { useState, useRef, useCallback } from 'react';

type StateUpdater<T> = (prevState: T) => T | Partial<T>;
type StateUpdate<T> = Partial<T> | StateUpdater<T>;

interface BatchedStateOptions {
  batchDelay?: number;
  maxBatchSize?: number;
}

export const useStateSynchronization = <T extends Record<string, any>>(
  initialState: T,
  options: BatchedStateOptions = {}
) => {
  const { batchDelay = 0, maxBatchSize = 10 } = options;
  
  const [state, setState] = useState<T>(initialState);
  const stateRef = useRef<T>(initialState);
  const pendingUpdates = useRef<StateUpdate<T>[]>([]);
  const isUpdating = useRef(false);
  const batchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Update both state and ref synchronously
  const updateState = useCallback((newState: T) => {
    stateRef.current = newState;
    setState(newState);
  }, []);

  // Process all pending updates atomically
  const processBatch = useCallback(() => {
    if (isUpdating.current || pendingUpdates.current.length === 0) return;

    isUpdating.current = true;
    const updates = [...pendingUpdates.current];
    pendingUpdates.current = [];

    if (batchTimeout.current) {
      clearTimeout(batchTimeout.current);
      batchTimeout.current = null;
    }

    try {
      let newState = { ...stateRef.current };

      for (const update of updates) {
        if (typeof update === 'function') {
          const result = (update as StateUpdater<T>)(newState);
          newState = { ...newState, ...result };
        } else {
          newState = { ...newState, ...update };
        }
      }

      updateState(newState);
    } catch (error) {
      console.error('❌ Batch update error:', error);
    } finally {
      isUpdating.current = false;
    }
  }, [updateState]);

  // Schedule batch processing
  const scheduleBatch = useCallback(() => {
    if (batchDelay === 0) {
      // Process immediately
      Promise.resolve().then(processBatch);
    } else {
      // Debounced processing
      if (batchTimeout.current) {
        clearTimeout(batchTimeout.current);
      }
      batchTimeout.current = setTimeout(processBatch, batchDelay);
    }
  }, [processBatch, batchDelay]);

  // Batch update function
  const batchUpdate = useCallback((updaters: StateUpdate<T> | StateUpdate<T>[]) => {
    const updates = Array.isArray(updaters) ? updaters : [updaters];
    
    pendingUpdates.current.push(...updates);

    // Process immediately if batch is full
    if (pendingUpdates.current.length >= maxBatchSize) {
      processBatch();
    } else {
      scheduleBatch();
    }
  }, [processBatch, scheduleBatch, maxBatchSize]);

  // Thread-safe state reader
  const getCurrentState = useCallback((): T => {
    return stateRef.current;
  }, []);

  // Atomic single update
  const atomicUpdate = useCallback((updater: StateUpdate<T>) => {
    if (isUpdating.current) {
      // Queue if currently updating
      batchUpdate(updater);
      return;
    }

    isUpdating.current = true;
    try {
      let newState: T;
      if (typeof updater === 'function') {
        const result = (updater as StateUpdater<T>)(stateRef.current);
        newState = { ...stateRef.current, ...result };
      } else {
        newState = { ...stateRef.current, ...updater };
      }
      updateState(newState);
    } finally {
      isUpdating.current = false;
    }
  }, [updateState, batchUpdate]);

  // Reset state
  const resetState = useCallback((newState?: T) => {
    const resetValue = newState ?? initialState;
    pendingUpdates.current = [];
    if (batchTimeout.current) {
      clearTimeout(batchTimeout.current);
      batchTimeout.current = null;
    }
    updateState(resetValue);
  }, [initialState, updateState]);

  // Cleanup
  const cleanup = useCallback(() => {
    if (batchTimeout.current) {
      clearTimeout(batchTimeout.current);
      batchTimeout.current = null;
    }
    pendingUpdates.current = [];
    isUpdating.current = false;
  }, []);

  return {
    state,
    batchUpdate,
    atomicUpdate,
    getCurrentState,
    resetState,
    cleanup,
    // Debug info
    getPendingUpdatesCount: () => pendingUpdates.current.length,
    isUpdating: () => isUpdating.current
  };
};
