// src/services/feature-flags.ts
// Feature flags for safely rolling out prize system fixes

/**
 * Feature flags to control bug fixes and new behavior
 * Start with all risky fixes OFF, enable after testing
 */
export const FEATURE_FLAGS = {
    // Phase 1 - Safe (enabled by default)
    USE_FIXED_NAME_PARSING: true,            // Fix underscore in player names
    LOG_PRIZE_VALIDATION_PERF: true,         // Add performance logging
    LOG_AUDIO_TIMEOUT_WARNING: true,         // Warn on audio timeout

    // Phase 2 - Medium risk (disabled by default)
    USE_STRICT_SECOND_FULLHOUSE: false,      // Reject corrupted winners data
    USE_MERGED_PRIZE_CHECK: false,           // Merge pending updates before game end check

    // Phase 3 - High risk (disabled by default)
    USE_ATOMIC_PRIZE_DETECTION: false,       // Use Firebase transactions
    USE_DEBOUNCED_LISTENERS: false,          // Debounce Firebase listeners

    // ========== NUMBER CALLING FIXES ==========

    // Phase 1 - Safe (enabled by default)
    USE_CRYPTO_FALLBACK: true,               // Fallback to Math.random if crypto fails
    SYNC_LOCAL_STATE_ON_INIT: true,          // Sync calledNumbers from Firebase on init
    CLEAN_TRANSACTION_META: true,            // Remove _transactionMeta from saved data

    // Phase 2 - Medium risk (disabled by default)
    USE_STRICT_VALIDATION: false,            // Return false on validation errors
    USE_LIMBO_RECOVERY: true,                // Recover games stuck in finalizing state

    // Phase 3 - High risk (disabled by default)
    USE_SINGLE_NUMBER_CALLER: false,         // Use singleton pattern for SecureNumberCaller
    USE_RELIABLE_GAME_ENDING: false,         // Replace setTimeout with Firebase-triggered ending

    // ========== AUDIO ==========
    USE_PRERECORDED_AUDIO: true,              // Use pre-recorded Opus audio files
}

/**
 * Check if a feature is enabled
 */
export const isFeatureEnabled = (flag: keyof typeof FEATURE_FLAGS): boolean => {
    return FEATURE_FLAGS[flag] ?? false
}

/**
 * Enable a feature at runtime (for testing)
 */
export const enableFeature = (flag: keyof typeof FEATURE_FLAGS): void => {
    FEATURE_FLAGS[flag] = true
    // console.log(`🚩 Feature enabled: ${flag}`)
}

/**
 * Disable a feature at runtime (for rollback)
 */
export const disableFeature = (flag: keyof typeof FEATURE_FLAGS): void => {
    FEATURE_FLAGS[flag] = false
    // console.log(`🚩 Feature disabled: ${flag}`)
}

export default FEATURE_FLAGS
