// src/utils/logger.ts - Centralized logging utility
// Provides consistent formatting for all log messages across the application

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  /** Additional context data to log */
  context?: Record<string, unknown>;
  /** Stack trace for errors */
  stack?: string;
}

/**
 * Centralized logger with consistent emoji prefixes and formatting.
 * Use this instead of direct console calls for consistent output.
 */
export const logger = {
  /**
   * Debug level - for development debugging
   */
  debug: (message: string, options?: LogOptions) => {
    if (import.meta.env.DEV) {
      console.log(`🔍 ${message}`, options?.context ?? '');
    }
  },

  /**
   * Info level - for general information
   */
  info: (message: string, options?: LogOptions) => {
    console.log(`ℹ️ ${message}`, options?.context ?? '');
  },

  /**
   * Success level - for successful operations
   */
  success: (message: string, options?: LogOptions) => {
    console.log(`✅ ${message}`, options?.context ?? '');
  },

  /**
   * Warning level - for non-critical issues
   */
  warn: (message: string, options?: LogOptions) => {
    console.warn(`⚠️ ${message}`, options?.context ?? '');
  },

  /**
   * Error level - for errors and failures
   */
  error: (message: string, error?: unknown, options?: LogOptions) => {
    const errorMessage = error instanceof Error ? error.message : String(error ?? '');
    const stack = error instanceof Error ? error.stack : options?.stack;
    
    console.error(`❌ ${message}`, errorMessage, options?.context ?? '');
    
    if (stack && import.meta.env.DEV) {
      console.error('Stack trace:', stack);
    }
  },

  /**
   * Group related log messages
   */
  group: (label: string, fn: () => void) => {
    console.group(`📦 ${label}`);
    try {
      fn();
    } finally {
      console.groupEnd();
    }
  },

  /**
   * Performance timing
   */
  time: (label: string) => {
    console.time(`⏱️ ${label}`);
    return () => console.timeEnd(`⏱️ ${label}`);
  },
};

export default logger;
