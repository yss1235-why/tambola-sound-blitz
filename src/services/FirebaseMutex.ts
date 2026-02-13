// src/services/FirebaseMutex.ts
import { ref, set, get, remove, onValue, off } from 'firebase/database';
import { database } from '@/services/firebase-core';

interface MutexOptions {
  timeout?: number;
  retryDelay?: number;
  maxRetries?: number;
  lockTTL?: number;
}

interface MutexLock {
  id: string;
  timestamp: number;
  owner: string;
  ttl: number;
}

export class FirebaseMutex {
  private lockPath: string;
  private ownerId: string;
  private activeLocks = new Set<string>();

  constructor(lockPath: string, ownerId?: string) {
    this.lockPath = lockPath;
    this.ownerId = ownerId || `owner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Acquire a lock with automatic retry
  async acquireLock(
    lockName: string,
    options: MutexOptions = {}
  ): Promise<() => Promise<void>> {
    const {
      timeout = 30000,
      retryDelay = 100,
      maxRetries = 300,
      lockTTL = 60000
    } = options;

    const lockKey = `${this.lockPath}/${lockName}`;
    const lockId = `${this.ownerId}-${Date.now()}`;
    
    let attempts = 0;
    const startTime = Date.now();

    while (attempts < maxRetries && Date.now() - startTime < timeout) {
      try {
        const acquired = await this.tryAcquireLock(lockKey, lockId, lockTTL);
        
        if (acquired) {
          this.activeLocks.add(lockKey);
          
          // Return release function
          return async () => {
            await this.releaseLock(lockKey, lockId);
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        attempts++;
        
      } catch (error) {
        throw error;
      }
    }

    throw new Error(`Failed to acquire lock: ${lockName} after ${attempts} attempts`);
  }

  // Try to acquire lock atomically
  private async tryAcquireLock(
    lockKey: string,
    lockId: string,
    ttl: number
  ): Promise<boolean> {
    const lockRef = ref(database, lockKey);
    
    try {
      // Check if lock exists and is valid
      const snapshot = await get(lockRef);
      
      if (snapshot.exists()) {
        const existingLock: MutexLock = snapshot.val();
        
        // Check if lock is expired
        if (Date.now() - existingLock.timestamp > existingLock.ttl) {
          await remove(lockRef);
        } else if (existingLock.owner === this.ownerId) {
          // We already own this lock
          return true;
        } else {
          // Lock is held by someone else
          return false;
        }
      }

      // Try to create the lock
      const newLock: MutexLock = {
        id: lockId,
        timestamp: Date.now(),
        owner: this.ownerId,
        ttl
      };

      await set(lockRef, newLock);
      
      // Verify we actually got the lock (race condition check)
      const verifySnapshot = await get(lockRef);
      if (verifySnapshot.exists()) {
        const currentLock: MutexLock = verifySnapshot.val();
        return currentLock.id === lockId && currentLock.owner === this.ownerId;
      }
      
      return false;
      
    } catch (error) {
      return false;
    }
  }

  // Release a specific lock
  private async releaseLock(lockKey: string, lockId: string): Promise<void> {
    try {
      
      const lockRef = ref(database, lockKey);
      const snapshot = await get(lockRef);
      
      if (snapshot.exists()) {
        const currentLock: MutexLock = snapshot.val();
        
        // Only release if we own the lock
        if (currentLock.owner === this.ownerId && currentLock.id === lockId) {
          await remove(lockRef);
          this.activeLocks.delete(lockKey);
        } else {
        }
      }
      
    } catch (error) {
    }
  }

  // Execute function with lock protection
  async withLock<T>(
    lockName: string,
    fn: () => Promise<T>,
    options?: MutexOptions
  ): Promise<T> {
    const releaseLock = await this.acquireLock(lockName, options);
    
    try {
      const result = await fn();
      return result;
    } finally {
      await releaseLock();
    }
  }

  // Release all locks owned by this instance
  async releaseAllLocks(): Promise<void> {
    
    const releasePromises = Array.from(this.activeLocks).map(async (lockKey) => {
      try {
        const lockRef = ref(database, lockKey);
        const snapshot = await get(lockRef);
        
        if (snapshot.exists()) {
          const lock: MutexLock = snapshot.val();
          if (lock.owner === this.ownerId) {
            await remove(lockRef);
          }
        }
      } catch (error) {
      }
    });

    await Promise.all(releasePromises);
    this.activeLocks.clear();
  }

  // Clean up expired locks (utility function)
  async cleanupExpiredLocks(): Promise<void> {
    try {
      
      const locksRef = ref(database, this.lockPath);
      const snapshot = await get(locksRef);
      
      if (!snapshot.exists()) {
        return;
      }

      const locks = snapshot.val();
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, lock] of Object.entries(locks)) {
        const lockData = lock as MutexLock;
        if (now - lockData.timestamp > lockData.ttl) {
          expiredKeys.push(key);
        }
      }

      if (expiredKeys.length > 0) {
        const removePromises = expiredKeys.map(key => 
          remove(ref(database, `${this.lockPath}/${key}`))
        );
        await Promise.all(removePromises);
      }
      
    } catch (error) {
    }
  }

  // Get lock status
  async getLockStatus(lockName: string): Promise<MutexLock | null> {
    try {
      const lockRef = ref(database, `${this.lockPath}/${lockName}`);
      const snapshot = await get(lockRef);
      
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      return null;
    }
  }

  // Check if we own a specific lock
  async ownsLock(lockName: string): Promise<boolean> {
    const status = await this.getLockStatus(lockName);
    return status?.owner === this.ownerId && !this.isLockExpired(status);
  }

  // Check if a lock is expired
  private isLockExpired(lock: MutexLock): boolean {
    return Date.now() - lock.timestamp > lock.ttl;
  }

  // Get active locks count
  getActiveLockCount(): number {
    return this.activeLocks.size;
  }

  // Cleanup on destroy
  async cleanup(): Promise<void> {
    await this.releaseAllLocks();
  }
}

// Game-specific mutex instances
export const gameOperationMutex = new FirebaseMutex('game-locks');
export const numberCallingMutex = new FirebaseMutex('number-calling-locks');
