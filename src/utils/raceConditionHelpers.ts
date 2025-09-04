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

// Mutex implementation for preventing concurrent execution
export class SimpleMutex {
  private locked = false;
  private queue: (() => void)[] = [];
