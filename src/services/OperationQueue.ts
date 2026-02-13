// src/services/OperationQueue.ts
interface QueuedOperation<T = any> {
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

interface OperationResult<T = any> {
  id: string;
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
}

export class OperationQueue {
  private queue: QueuedOperation[] = [];
  private processing = false;
  private completed = new Map<string, OperationResult>();
  private running = new Set<string>();
  private maxConcurrent: number = 1; // Sequential by default
  
  constructor(maxConcurrent: number = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  // Queue an operation
  enqueue<T>(operation: Omit<QueuedOperation<T>, 'id'>): Promise<T> {
    const operationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise<T>((resolve, reject) => {
      const queuedOp: QueuedOperation<T> = {
        ...operation,
        id: operationId,
        timeout: operation.timeout ?? 30000, // 30 second default
        retries: operation.retries ?? 0,
        onSuccess: (result) => {
          operation.onSuccess?.(result);
          resolve(result);
        },
        onError: (error) => {
          operation.onError?.(error);
          reject(error);
        }
      };

      // Insert by priority (higher number = higher priority)
      const insertIndex = this.queue.findIndex(op => op.priority < queuedOp.priority);
      if (insertIndex === -1) {
        this.queue.push(queuedOp);
      } else {
        this.queue.splice(insertIndex, 0, queuedOp);
      }
      
      this.processQueue();
    });
  }

  // High-level helper methods for common operations
  enqueueHighPriority<T>(name: string, execute: () => Promise<T>): Promise<T> {
    return this.enqueue({
      name,
      priority: 100,
      execute,
      timeout: 10000
    });
  }

  enqueueMediumPriority<T>(name: string, execute: () => Promise<T>): Promise<T> {
    return this.enqueue({
      name,
      priority: 50,
      execute,
      timeout: 20000
    });
  }

  enqueueLowPriority<T>(name: string, execute: () => Promise<T>): Promise<T> {
    return this.enqueue({
      name,
      priority: 10,
      execute,
      timeout: 30000
    });
  }

  // Process the queue
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0 || this.running.size > 0) {
        // Start operations up to max concurrent
        while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
          const operation = this.findNextExecutableOperation();
          if (operation) {
            this.startOperation(operation);
          } else {
            break; // No executable operations available
          }
        }

        // If nothing is running, we're done
        if (this.running.size === 0) {
          break;
        }

        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      this.processing = false;
    }
  }

  // Find the next operation that can be executed (no dependency conflicts)
  private findNextExecutableOperation(): QueuedOperation | null {
    for (let i = 0; i < this.queue.length; i++) {
      const operation = this.queue[i];
      
      if (this.canExecuteOperation(operation)) {
        return this.queue.splice(i, 1)[0];
      }
    }
    return null;
  }

  // Check if an operation's dependencies are satisfied
  private canExecuteOperation(operation: QueuedOperation): boolean {
    if (!operation.dependencies || operation.dependencies.length === 0) {
      return true;
    }

    return operation.dependencies.every(depId => {
      const result = this.completed.get(depId);
      return result && result.success;
    });
  }

  // Execute a single operation
  private async startOperation<T>(operation: QueuedOperation<T>): Promise<void> {
    const { id, name, execute, timeout, retries, onSuccess, onError } = operation;
    
    this.running.add(id);
    
    const startTime = Date.now();
    let lastError: Error | null = null;
    
    // Retry loop
    for (let attempt = 0; attempt <= (retries || 0); attempt++) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Operation timeout after ${timeout}ms`));
          }, timeout);
        });

        // Race execution against timeout
        const result = await Promise.race([
          execute(),
          timeoutPromise
        ]);

        // Success
        const duration = Date.now() - startTime;
        const operationResult: OperationResult<T> = {
          id,
          success: true,
          result,
          duration
        };
        
        this.completed.set(id, operationResult);
        this.running.delete(id);
        onSuccess?.(result);
        return;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < (retries || 0)) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    const duration = Date.now() - startTime;
    const operationResult: OperationResult = {
      id,
      success: false,
      error: lastError!,
      duration
    };
    
    this.completed.set(id, operationResult);
    this.running.delete(id);
    onError?.(lastError!);
  }

  // Clear all pending operations
  clearQueue(): void {
    this.queue = [];
  }

  // Wait for all operations to complete
  async waitForCompletion(): Promise<void> {
    while (this.queue.length > 0 || this.running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Get queue status
  getStatus() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      processing: this.processing
    };
  }

  // Get operation results
  getResult(operationId: string): OperationResult | null {
    return this.completed.get(operationId) || null;
  }

  // Get all completed operations
  getCompletedOperations(): OperationResult[] {
    return Array.from(this.completed.values());
  }

  // Clear completed operations (for memory management)
  clearCompleted(): void {
    this.completed.clear();
  }

  // Cleanup
  cleanup(): void {
    this.clearQueue();
    this.clearCompleted();
    this.running.clear();
    this.processing = false;
  }
}

// Create game-specific operation queue
export const gameOperationQueue = new OperationQueue(1); // Sequential operations for game logic
