// src/utils/errorHandler.ts - Centralized error handling utility
// Provides consistent error handling patterns across the application

import { logger } from './logger';

/**
 * Error severity levels for categorization
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error context for better debugging
 */
export interface ErrorContext {
    /** Operation that was being performed */
    operation: string;
    /** Component or service where error occurred */
    component?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
    /** Error severity */
    severity?: ErrorSeverity;
}

/**
 * Structured error result
 */
export interface ErrorResult {
    success: false;
    error: string;
    code?: string;
    context?: ErrorContext;
}

/**
 * Success result
 */
export interface SuccessResult<T> {
    success: true;
    data: T;
}

export type Result<T> = SuccessResult<T> | ErrorResult;

/**
 * Handle an error with consistent logging and optional callback
 */
export const handleError = (
    context: string,
    error: unknown,
    options?: {
        rethrow?: boolean;
        severity?: ErrorSeverity;
        metadata?: Record<string, unknown>;
    }
): void => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(context, error, { context: options?.metadata });

    // In production, you could add error reporting service here
    // e.g., Sentry.captureException(error);

    if (options?.rethrow) {
        throw error;
    }
};

/**
 * Wrap an async function with error handling
 */
export const withErrorHandler = <T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: string
): T => {
    return (async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
        try {
            return await fn(...args);
        } catch (error) {
            handleError(context, error);
            return undefined;
        }
    }) as T;
};

/**
 * Safe async execution with Result type
 */
export const safeAsync = async <T>(
    fn: () => Promise<T>,
    context: ErrorContext
): Promise<Result<T>> => {
    try {
        const data = await fn();
        return { success: true, data };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        handleError(context.operation, error, {
            severity: context.severity,
            metadata: context.metadata
        });
        return {
            success: false,
            error: errorMessage,
            context
        };
    }
};

/**
 * Create a try-catch wrapper for consistent error handling
 * Usage: const result = await tryCatch(() => someAsyncOperation(), 'Operation name');
 */
export const tryCatch = async <T>(
    fn: () => Promise<T>,
    operation: string,
    options?: {
        fallback?: T;
        rethrow?: boolean;
        silent?: boolean;
    }
): Promise<T | undefined> => {
    try {
        return await fn();
    } catch (error) {
        if (!options?.silent) {
            handleError(operation, error);
        }
        if (options?.rethrow) {
            throw error;
        }
        return options?.fallback;
    }
};

/**
 * Validate and handle Firebase-specific errors
 */
export const handleFirebaseError = (
    error: unknown,
    operation: string
): { code: string; message: string } => {
    const firebaseError = error as { code?: string; message?: string };
    const code = firebaseError?.code ?? 'unknown';
    const message = firebaseError?.message ?? String(error);

    logger.error(`Firebase ${operation}`, error, {
        context: { code, operation }
    });

    return { code, message };
};

export default {
    handleError,
    withErrorHandler,
    safeAsync,
    tryCatch,
    handleFirebaseError,
};
