// src/utils/gestureConfig.ts
// Configuration for gesture pattern detection

export interface GestureConfig {
  // Pattern sequence configuration
  pattern: Array<{
    taps: number;
    zone: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  }>;
  
  // Timing constraints
  totalTimeLimit: number; // Total time to complete entire pattern (ms)
  tapTimeLimit: number;   // Max time between taps in same zone (ms)
  zoneTimeLimit: number;  // Max time to complete taps in one zone (ms)
  
  // Zone definitions (percentage of screen)
  zones: {
    cornerSize: number;   // Size of corner zones (0-50)
    centerSize: number;   // Size of center zone (0-100)
  };
  
  // Security settings
  maxFailedAttempts: number;    // Max failed attempts before timeout
  cooldownPeriod: number;       // Cooldown after max failures (ms)
  debugMode: boolean;           // Enable console logging for testing
}

// Default gesture configuration
export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  // Pattern: 3 taps top-left → 2 taps bottom-right → 1 tap center
  pattern: [
  { taps: 3, zone: 'bottom-right' },
  { taps: 3, zone: 'bottom-left' }
],
  
  // Timing (all in milliseconds)
  totalTimeLimit: 5000,    // 5 second total limit
  tapTimeLimit: 500,       // 500ms between taps in same zone
  zoneTimeLimit: 2000,     // 2 seconds to complete each zone
  
  // Zone sizes (percentages)
  zones: {
    cornerSize: 15,        // 15% of screen for corners
    centerSize: 30         // 30% of screen for center
  },
  
  // Security
  maxFailedAttempts: 3,    // 3 failed attempts
  cooldownPeriod: 10000,   // 10 second cooldown
  debugMode: false         // Disable debug in production
};
