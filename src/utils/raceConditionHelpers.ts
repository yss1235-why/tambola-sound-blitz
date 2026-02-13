// src/utils/raceConditionHelpers.ts
// Race condition prevention utilities and helper functions

// Debounce function with leading/trailing options
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = { trailing: true }
): T {
  let timeout: NodeJS.Timeout | null = null;
  let previous = 0;

  const later = function(context: any, args: any[]) {
    previous = options.leading === false ? 0 : Date.now();
    timeout = null;
    func.apply(context, args);
  };

  return (function(this: any, ...args: any[]) {
    const now = Date.now();
    if (!previous && options.leading === false) previous = now;
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(() => later(this, args), remaining);
    }
  } as any);
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): T {
  let inThrottle: boolean;
  
  return (function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  } as any);
}

// src/utils/raceConditionHelpers.ts (continued)

// Mutex implementation for preventing concurrent execution
export class SimpleMutex {
  private locked = false;
  private queue: (() => void)[] = [];

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve(() => this.release());
      } else {
        this.queue.push(() => {
          this.locked = true;
          resolve(() => this.release());
        });
      }
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

// Atomic counter for generating unique IDs
export class AtomicCounter {
  private count = 0;
  private prefix: string;

  constructor(prefix: string = 'id') {
    this.prefix = prefix;
  }

  next(): string {
    return `${this.prefix}-${++this.count}-${Date.now()}`;
  }

  current(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
  }
}

// Promise with timeout utility
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timeout'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
}

// Retry mechanism with exponential backoff
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    onRetry
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }

      onRetry?.(attempt, lastError);

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Circuit breaker pattern for preventing cascading failures
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private resetTimeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await withTimeout(fn(), this.timeout);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = 0;
  }
}

// Batch processor for grouping operations
export class BatchProcessor<T, R> {
  private batch: T[] = [];
  private processing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private processor: (batch: T[]) => Promise<R[]>,
    private batchSize: number = 10,
    private flushInterval: number = 1000
  ) {}

  add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.batch.push(item);

      // Store resolve/reject with the item
      (item as any)._resolve = resolve;
      (item as any)._reject = reject;

      if (this.batch.length >= this.batchSize) {
        this.flush();
      } else {
        this.scheduleFlush();
      }
    });
  }

  private scheduleFlush(): void {
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.flushInterval);
    }
  }

  private async flush(): Promise<void> {
    if (this.processing || this.batch.length === 0) {
      return;
    }

    this.processing = true;
    const currentBatch = [...this.batch];
    this.batch = [];

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    try {
      const results = await this.processor(currentBatch);

      currentBatch.forEach((item, index) => {
        (item as any)._resolve(results[index]);
      });
    } catch (error) {
      currentBatch.forEach((item) => {
        (item as any)._reject(error);
      });
    } finally {
      this.processing = false;
    }
  }

  async forceFlush(): Promise<void> {
    await this.flush();
  }
}

// Safe JSON parser that handles race conditions
export function safeJsonParse<T>(
  jsonString: string,
  defaultValue: T
): T {
  try {
    const parsed = JSON.parse(jsonString);
    return parsed !== undefined ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Generate cryptographically secure random ID
export function generateSecureId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

// Validate and sanitize user input
export function sanitizeInput(input: string, maxLength: number = 100): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '') // Remove potential HTML
    .replace(/\s+/g, ' '); // Normalize whitespace
}

// Deep clone with cycle detection
export function deepClone<T>(obj: T): T {
  const seen = new WeakSet();
  
  function clone(item: any): any {
    if (item === null || typeof item !== 'object') {
      return item;
    }
    
    if (seen.has(item)) {
      throw new Error('Circular reference detected');
    }
    
    seen.add(item);
    
    if (item instanceof Date) {
      return new Date(item.getTime());
    }
    
    if (item instanceof Array) {
      return item.map(clone);
    }
    
    if (typeof item === 'object') {
      const cloned: any = {};
      for (const key in item) {
        if (item.hasOwnProperty(key)) {
          cloned[key] = clone(item[key]);
        }
      }
      return cloned;
    }
    
    return item;
  }
  
  return clone(obj);
}

// Rate limiter
export class RateLimiter {
  private requests: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  isAllowed(): boolean {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }
    
    return false;
  }

  getNextAllowedTime(): number {
    if (this.requests.length < this.maxRequests) {
      return 0;
    }
    
    const oldestRequest = Math.min(...this.requests);
    return oldestRequest + this.windowMs - Date.now();
  }

  reset(): void {
    this.requests = [];
  }
}

// Event emitter with race condition protection
export class SafeEventEmitter {
  private listeners = new Map<string, Set<Function>>();
  private processing = new Set<string>();

  on(event: string, listener: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(listener);
    
    return () => this.off(event, listener);
  }

  off(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  async emit(event: string, ...args: any[]): Promise<void> {
    const processingKey = `${event}-${Date.now()}`;
    
    if (this.processing.has(event)) {
      return;
    }

    this.processing.add(event);
    
    try {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        const promises = Array.from(eventListeners).map(async (listener) => {
          try {
            await listener(...args);
          } catch (error) {
          }
        });
        
        await Promise.all(promises);
      }
    } finally {
      this.processing.delete(event);
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }
}

// Memory-efficient LRU cache
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Default instances for common use cases
export const gameEventEmitter = new SafeEventEmitter();
export const globalRateLimiter = new RateLimiter(100, 60000); // 100 requests per minute
export const operationMutex = new SimpleMutex();
export const secureIdGenerator = new AtomicCounter('secure');
