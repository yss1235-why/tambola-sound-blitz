// src/hooks/useGameResourceManager.ts
import { useRef, useCallback, useEffect } from 'react';

interface ResourceTracker {
  timers: Set<NodeJS.Timeout>;
  intervals: Set<NodeJS.Timeout>;
  audio: Set<HTMLAudioElement>;
  requests: Set<AbortController>;
  subscriptions: Set<() => void>;
  listeners: Map<EventTarget, { event: string; callback: EventListener }[]>;
  promises: Set<Promise<any>>;
}

interface SafeOperationOptions {
  timeout?: number;
  retries?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export const useGameResourceManager = () => {
  const resourcesRef = useRef<ResourceTracker>({
    timers: new Set(),
    intervals: new Set(),
    audio: new Set(),
    requests: new Set(),
    subscriptions: new Set(),
    listeners: new Map(),
    promises: new Set()
  });

  const isMountedRef = useRef(true);
  const operationInProgress = useRef<Set<string>>(new Set());

  // Timer management
  const registerTimer = useCallback((callback: () => void, delay: number): NodeJS.Timeout => {
    const timerId = setTimeout(() => {
      resourcesRef.current.timers.delete(timerId);
      if (isMountedRef.current) {
        callback();
      }
    }, delay);

    resourcesRef.current.timers.add(timerId);
    return timerId;
  }, []);

  const registerInterval = useCallback((callback: () => void, delay: number): NodeJS.Timeout => {
    const intervalId = setInterval(() => {
      if (isMountedRef.current) {
        callback();
      } else {
        clearInterval(intervalId);
        resourcesRef.current.intervals.delete(intervalId);
      }
    }, delay);

    resourcesRef.current.intervals.add(intervalId);
    return intervalId;
  }, []);

  const clearTimer = useCallback((timerId: NodeJS.Timeout) => {
    clearTimeout(timerId);
    resourcesRef.current.timers.delete(timerId);
  }, []);

  const clearInterval = useCallback((intervalId: NodeJS.Timeout) => {
    clearInterval(intervalId);
    resourcesRef.current.intervals.delete(intervalId);
  }, []);

  // Audio management
  const registerAudio = useCallback((audio: HTMLAudioElement): () => void => {
    resourcesRef.current.audio.add(audio);
    
    return () => {
      audio.pause();
      audio.currentTime = 0;
      resourcesRef.current.audio.delete(audio);
    };
  }, []);

  const createManagedAudio = useCallback((src: string): HTMLAudioElement => {
    const audio = new Audio(src);
    const cleanup = registerAudio(audio);
    
    // Auto-cleanup when audio ends
    audio.addEventListener('ended', cleanup);
    audio.addEventListener('error', cleanup);
    
    return audio;
  }, [registerAudio]);

  // Request management (for fetch operations)
  const createManagedRequest = useCallback((): AbortController => {
    const controller = new AbortController();
    resourcesRef.current.requests.add(controller);
    
    return controller;
  }, []);

  const registerRequest = useCallback((controller: AbortController): () => void => {
    resourcesRef.current.requests.add(controller);
    
    return () => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
      resourcesRef.current.requests.delete(controller);
    };
  }, []);

  // Subscription management
  const registerSubscription = useCallback((unsubscribe: () => void): () => void => {
    resourcesRef.current.subscriptions.add(unsubscribe);
    
    return () => {
      unsubscribe();
      resourcesRef.current.subscriptions.delete(unsubscribe);
    };
  }, []);

  // Event listener management
  const registerEventListener = useCallback((
    target: EventTarget,
    event: string,
    callback: EventListener,
    options?: AddEventListenerOptions
  ): () => void => {
    target.addEventListener(event, callback, options);
    
    if (!resourcesRef.current.listeners.has(target)) {
      resourcesRef.current.listeners.set(target, []);
    }
    resourcesRef.current.listeners.get(target)!.push({ event, callback });
    
    return () => {
      target.removeEventListener(event, callback);
      const listeners = resourcesRef.current.listeners.get(target);
      if (listeners) {
        const index = listeners.findIndex(l => l.event === event && l.callback === callback);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
        if (listeners.length === 0) {
          resourcesRef.current.listeners.delete(target);
        }
      }
    };
  }, []);

  // Safe async operations
  const safeAsyncOperation = useCallback(async <T>(
    operationId: string,
    asyncFn: () => Promise<T>,
    options: SafeOperationOptions = {}
  ): Promise<T | null> => {
    const { timeout = 10000, retries = 3, onRetry } = options;

    if (!isMountedRef.current) {
      throw new Error('Component not mounted');
    }

    if (operationInProgress.current.has(operationId)) {
      return null;
    }

    operationInProgress.current.add(operationId);

    try {
      for (let attempt = 1; attempt <= retries; attempt++) {
        if (!isMountedRef.current) {
          throw new Error('Component unmounted during operation');
        }

        try {
          // Create timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error(`Operation timeout after ${timeout}ms`));
            }, timeout);
            
            // Clean up timeout if component unmounts
            resourcesRef.current.timers.add(timeoutId);
          });

          // Race the operation against the timeout
          const result = await Promise.race([
            asyncFn(),
            timeoutPromise
          ]);

          return result;
          
        } catch (error) {
          if (attempt === retries) {
            throw error;
          }
          
          onRetry?.(attempt, error as Error);
          
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => {
            const timerId = setTimeout(resolve, delay);
            resourcesRef.current.timers.add(timerId);
          });
        }
      }
      
      return null;
      
    } finally {
      operationInProgress.current.delete(operationId);
    }
  }, []);

  // Promise tracking for automatic cleanup
  const trackPromise = useCallback(<T>(promise: Promise<T>): Promise<T> => {
    resourcesRef.current.promises.add(promise);
    
    const cleanup = () => {
      resourcesRef.current.promises.delete(promise);
    };
    
    promise.then(cleanup, cleanup);
    return promise;
  }, []);

  // Safe state update wrapper
  const safeStateUpdate = useCallback(<T>(
    setter: React.Dispatch<React.SetStateAction<T>>,
    newValue: T | ((prev: T) => T)
  ): void => {
    if (isMountedRef.current) {
      setter(newValue);
    }
  }, []);

  // Cleanup all resources
  const cleanupAll = useCallback(() => {
    isMountedRef.current = false;

    // Clear timers and intervals
    resourcesRef.current.timers.forEach(timerId => clearTimeout(timerId));
    resourcesRef.current.intervals.forEach(intervalId => clearInterval(intervalId));

    // Stop audio
    resourcesRef.current.audio.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });

    // Abort requests
    resourcesRef.current.requests.forEach(controller => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    });

    // Unsubscribe from subscriptions
    resourcesRef.current.subscriptions.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
      }
    });

    // Remove event listeners
    resourcesRef.current.listeners.forEach((listeners, target) => {
      listeners.forEach(({ event, callback }) => {
        target.removeEventListener(event, callback);
      });
    });

    // Clear all collections
    resourcesRef.current.timers.clear();
    resourcesRef.current.intervals.clear();
    resourcesRef.current.audio.clear();
    resourcesRef.current.requests.clear();
    resourcesRef.current.subscriptions.clear();
    resourcesRef.current.listeners.clear();
    resourcesRef.current.promises.clear();
    
    operationInProgress.current.clear();
  }, []);

  // Mount/unmount tracking
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  // Debug utilities
  const getResourceCounts = useCallback(() => ({
    timers: resourcesRef.current.timers.size,
    intervals: resourcesRef.current.intervals.size,
    audio: resourcesRef.current.audio.size,
    requests: resourcesRef.current.requests.size,
    subscriptions: resourcesRef.current.subscriptions.size,
    listeners: resourcesRef.current.listeners.size,
    promises: resourcesRef.current.promises.size,
    operations: operationInProgress.current.size
  }), []);

  const isOperationInProgress = useCallback((operationId: string): boolean => {
    return operationInProgress.current.has(operationId);
  }, []);

  return {
    // Resource registration
    registerTimer,
    registerInterval,
    registerAudio,
    registerRequest,
    registerSubscription,
    registerEventListener,
    
    // Resource creation helpers
    createManagedAudio,
    createManagedRequest,
    
    // Resource cleanup
    clearTimer,
    clearInterval,
    cleanupAll,
    
    // Safe operations
    safeAsyncOperation,
    trackPromise,
    safeStateUpdate,
    
    // State queries
    isMounted: () => isMountedRef.current,
    isOperationInProgress,
    getResourceCounts
  };
};
