// src/types/raceConditionTypes.ts
// TypeScript interfaces and types for race condition prevention systems

// Timer Management Types
export interface TimerManagerConfig {
  masterInterval?: number;
  maxTimers?: number;
  enableDebug?: boolean;
}

export interface TimerCallback {
  callback: () => void;
  interval: number;
  lastRun: number;
  enabled: boolean;
}

export interface GameStateRef {
  current?: {
    isActive: boolean;
    gameOver: boolean;
    isCountdown: boolean;
  } | null;
}

// State Synchronization Types
export type StateUpdater<T> = (prevState: T) => T | Partial<T>;
export type StateUpdate<T> = Partial<T> | StateUpdater<T>;

export interface BatchedStateOptions {
  batchDelay?: number;
  maxBatchSize?: number;
}

export interface StateSynchronizationResult<T> {
  state: T;
  batchUpdate: (updaters: StateUpdate<T> | StateUpdate<T>[]) => void;
  atomicUpdate: (updater: StateUpdate<T>) => void;
  getCurrentState: () => T;
  resetState: (newState?: T) => void;
  cleanup: () => void;
  getPendingUpdatesCount: () => number;
  isUpdating: () => boolean;
}

// Audio Coordination Types
export interface AudioTask {
  id: string;
  type: 'number' | 'prize' | 'gameOver' | 'custom';
  data: any;
  priority: number;
  execute: () => Promise<void>;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
}

export interface AudioCoordinationConfig {
  maxQueueSize?: number;
  defaultTimeout?: number;
  enableFallback?: boolean;
}

// Resource Management Types
export interface ResourceTracker {
  timers: Set<NodeJS.Timeout>;
  intervals: Set<NodeJS.Timeout>;
  audio: Set<HTMLAudioElement>;
  requests: Set<AbortController>;
  subscriptions: Set<() => void>;
  listeners: Map<EventTarget, { event: string; callback: EventListener }[]>;
  promises: Set<Promise<any>>;
}

export interface SafeOperationOptions {
  timeout?: number;
  retries?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface ResourceManagerResult {
  registerTimer: (callback: () => void, delay: number) => NodeJS.Timeout;
  registerInterval: (callback: () => void, delay: number) => NodeJS.Timeout;
  registerAudio: (audio: HTMLAudioElement) => () => void;
  registerRequest: (controller: AbortController) => () => void;
  registerSubscription: (unsubscribe: () => void) => () => void;
  registerEventListener: (
    target: EventTarget,
    event: string,
    callback: EventListener,
    options?: AddEventListenerOptions
  ) => () => void;
  createManagedAudio: (src: string) => HTMLAudioElement;
  createManagedRequest: () => AbortController;
  safeAsyncOperation: <T>(
    operationId: string,
    asyncFn: () => Promise<T>,
    options?: SafeOperationOptions
  ) => Promise<T | null>;
  trackPromise: <T>(promise: Promise<T>) => Promise<T>;
  safeStateUpdate: <T>(
    setter: React.Dispatch<React.SetStateAction<T>>,
    newValue: T | ((prev: T) => T)
  ) => void;
  cleanupAll: () => void;
  isMounted: () => boolean;
  isOperationInProgress: (operationId: string) => boolean;
  getResourceCounts: () => ResourceCounts;
}

export interface ResourceCounts {
  timers: number;
  intervals: number;
  audio: number;
  requests: number;
  subscriptions: number;
  listeners: number;
  promises: number;
  operations: number;
}

// Operation Queue Types
export interface QueuedOperation<T = any> {
  id: string;
  name: string;
  priority: number;
  execute: () => Promise<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  timeout?: number;
  retries?: number;
  dependencies?: string[];
}

export interface OperationResult<T = any> {
  id: string;
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
}

export interface OperationQueueStatus {
  queued: number;
  running: number;
  completed: number;
  processing: boolean;
}

// Firebase Mutex Types
export interface MutexOptions {
  timeout?: number;
  retryDelay?: number;
  maxRetries?: number;
  lockTTL?: number;
}

export interface MutexLock {
  id: string;
  timestamp: number;
  owner: string;
  ttl: number;
}

// Secure Number Calling Types
export interface NumberCallResult {
  number: number;
  timestamp: number;
  sequenceId: number;
  success: boolean;
  error?: string;
}

export interface GameValidationResult {
  isValid: boolean;
  reason?: string;
  canContinue: boolean;
}

export interface GameStatistics {
  totalCalled: number;
  remainingNumbers: number;
  callSequence: number;
  lastCallTime?: number;
}

export interface GameStateForCalling {
  calledNumbers: number[];
  currentNumber?: number;
  lastCallTime?: number;
  callSequence?: number;
  sessionCache?: number[];
  isActive?: boolean;
  gameOver?: boolean;
}

// State Machine Types (XState integration)
export interface TambolaGameContext {
  gameId: string | null;
  calledNumbers: number[];
  currentNumber: number | null;
  timeRemaining: number;
  totalPlayers: number;
  prizesWon: string[];
  error: string | null;
  isPaused: boolean;
  isAudioReady: boolean;
}

export type TambolaGameEvent =
  | { type: 'START_GAME'; gameId: string }
  | { type: 'INITIALIZE_COMPLETE' }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'CALL_NUMBER'; number: number }
  | { type: 'AUDIO_READY' }
  | { type: 'AUDIO_COMPLETE' }
  | { type: 'PRIZE_WON'; prizeId: string }
  | { type: 'TIME_UP' }
  | { type: 'ALL_NUMBERS_CALLED' }
  | { type: 'END_GAME' }
  | { type: 'ERROR'; error: string }
  | { type: 'RETRY' }
  | { type: 'RESET' };

export interface GameStateMachineResult {
  state: any;
  context: TambolaGameContext;
  isIdle: boolean;
  isInitializing: boolean;
  isRunning: boolean;
  isPaused: boolean;
  isGameOver: boolean;
  isError: boolean;
  isCallingNumber: boolean;
  gameId: string | null;
  calledNumbers: number[];
  currentNumber: number | null;
  prizesWon: string[];
  error: string | null;
  startGame: (gameId: string) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => Promise<void>;
  callNumber: (number: number) => Promise<boolean>;
  notifyAudioReady: () => void;
  notifyAudioComplete: () => void;
  notifyPrizeWon: (prizeId: string) => void;
  notifyTimeUp: () => void;
  notifyAllNumbersCalled: () => void;
  handleError: (error: string) => void;
  retry: () => void;
  reset: () => void;
  canCallNumber: (number: number) => boolean;
  canPause: () => boolean;
  canResume: () => boolean;
  canEnd: () => boolean;
}

// Timer Hook Types
export interface UseGameTimerProps {
  initialTime?: number;
  onTick?: (timeRemaining: number) => void;
  onNumberCall?: () => void;
  onGameComplete?: () => void;
  isPaused?: boolean;
  autoStart?: boolean;
  callInterval?: number;
}

export interface GameTimerState {
  timeRemaining: number;
  isRunning: boolean;
  totalCalls: number;
}

export interface UseGameTimerResult {
  timeRemaining: number;
  isRunning: boolean;
  totalCalls: number;
  startTimer: () => void;
  stopTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: (newInitialTime?: number) => void;
}

// Audio Game Coordination Types
export interface UseAudioGameCoordinationProps {
  gameStateRef?: React.MutableRefObject<any>;
  onAudioComplete?: (type: string, data?: any) => void;
  onAudioError?: (error: Error, type: string) => void;
}

export interface UseAudioGameCoordinationResult {
  playNumberAudio: (number: number) => Promise<void>;
  playPrizeAudio: (prizeId: string, ticketNumber: number) => Promise<void>;
  playGameOverAudio: () => Promise<void>;
  stopAllAudio: () => void;
  clearAudioQueue: () => void;
  isAudioPlaying: () => boolean;
  getQueueLength: () => number;
  getCurrentAudioTask: () => AudioTask | null;
  currentAudioId: string | null;
}

// Utility Types
export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerConfig {
  threshold?: number;
  timeout?: number;
  resetTimeout?: number;
}

export interface BatchProcessorConfig<T, R> {
  processor: (batch: T[]) => Promise<R[]>;
  batchSize?: number;
  flushInterval?: number;
}

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

export interface SafeEventEmitterConfig {
  maxListeners?: number;
  enableLogging?: boolean;
}

// Error Types
export class RaceConditionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'RaceConditionError';
  }
}

export class TimerConflictError extends RaceConditionError {
  constructor(timerId: string) {
    super(`Timer conflict detected: ${timerId}`, 'TIMER_CONFLICT');
  }
}

export class StateInconsistencyError extends RaceConditionError {
  constructor(stateName: string) {
    super(`State inconsistency detected: ${stateName}`, 'STATE_INCONSISTENCY');
  }
}

export class AudioConflictError extends RaceConditionError {
  constructor(audioType: string) {
    super(`Audio conflict detected: ${audioType}`, 'AUDIO_CONFLICT');
  }
}

export class OperationTimeoutError extends RaceConditionError {
  constructor(operationName: string, timeout: number) {
    super(`Operation timeout: ${operationName} after ${timeout}ms`, 'OPERATION_TIMEOUT');
  }
}

// Re-export common types
export type { GameData, GameState, TambolaTicket, Prize } from '@/services/firebase-core';

// Configuration Types
export interface RaceConditionConfig {
  timers: TimerManagerConfig;
  audio: AudioCoordinationConfig;
  operations: {
    maxConcurrent?: number;
    defaultTimeout?: number;
    maxRetries?: number;
  };
  resources: {
    cleanupInterval?: number;
    maxResources?: number;
  };
  debug: {
    enableLogging?: boolean;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
  };
}

// Default configuration
export const DEFAULT_RACE_CONDITION_CONFIG: RaceConditionConfig = {
  timers: {
    masterInterval: 100,
    maxTimers: 50,
    enableDebug: false
  },
  audio: {
    maxQueueSize: 10,
    defaultTimeout: 10000,
    enableFallback: true
  },
  operations: {
    maxConcurrent: 1,
    defaultTimeout: 30000,
    maxRetries: 3
  },
  resources: {
    cleanupInterval: 30000,
    maxResources: 100
  },
  debug: {
    enableLogging: true,
    logLevel: 'info'
  }
};

// Export all error classes
export {
  RaceConditionError,
  TimerConflictError,
  StateInconsistencyError,
  AudioConflictError,
  OperationTimeoutError
};
