// src/services/TambolaGameMachine.ts
import { createMachine, assign, StateFrom } from 'xstate';

// State machine context
interface TambolaGameContext {
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

// State machine events
type TambolaGameEvent =
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

export const tambolaGameMachine = createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAOjwGIBlAFQBUBRAGQG0AGAXUVAAdVYAXVNh4gAHogBMAdgAsAJgCMAGhABPRAHYVATmUB2FQBYVygKwqArCvXqANCACeivcZV6VAZhWnzAX3-W0jj4hKTkVAwAcgBqALIASgDyWTJIINx8giJiCEoqahpaOvoGxqbmVgg6Kh5aWpbWdo4u7l4IPiqBanUqfloBQSFhGNh4ABbYJITJ1KmZfAJCohUqGtoGRibmlpY29o2urh5ePr6BIVpBYxFRsQlJKWkZeYXFpeWVKtV1DU0tbTNbQtHRkfSIOzGZQqCxKbSuG53RBaJ7hLSWbSWdbuXbeAHbIGHEEnM5nc6Xa43O4POqtFptTodLqk3r9QbDUbjFiMuaMllrDaAdkhtkczns+GHI7I05nC5XW73R6PJJ5J7C0VvD5fVCkfBESaAilTGbzAFLIEcjbczk8vm7QVHEVip4Sp7Sl6vOqfBo4JoyoqNc3K7kqrnat0KvWGzkrTkgzkO3nOgXC13it6ej1vOo+xo-dz4FCkkwG5lh-2Rg3akMrCO8mOOhOJvlJlPp01klMZurzO2LR3F13lj01+uN5sslts8GcduhyM8qNx2PtrvdBOvd7Jz60hU-fCAA */
  id: 'tambolaGame',
  predictableActionArguments: true,
  initial: 'idle',
  context: {
    gameId: null,
    calledNumbers: [],
    currentNumber: null,
    timeRemaining: 0,
    totalPlayers: 0,
    prizesWon: [],
    error: null,
    isPaused: false,
    isAudioReady: false
  } as TambolaGameContext,
  states: {
    idle: {
      entry: 'resetGame',
      on: {
        START_GAME: {
          target: 'initializing',
          actions: ['setGameId', 'clearError']
        }
      }
    },
    
    initializing: {
      entry: 'startInitialization',
      invoke: {
        src: 'initializeGameResources',
        onDone: {
          target: 'waitingForAudio',
          actions: 'setInitializationComplete'
        },
        onError: {
          target: 'error',
          actions: 'setError'
        }
      },
      on: {
        ERROR: {
          target: 'error',
          actions: 'setError'
        }
      }
    },

    waitingForAudio: {
      on: {
        AUDIO_READY: {
          target: 'running',
          actions: 'setAudioReady'
        },
        ERROR: {
          target: 'error',
          actions: 'setError'
        }
      }
    },

    running: {
      entry: ['startGameTimers', 'enableNumberCalling'],
      exit: ['pauseGameTimers'],
      initial: 'active',
      states: {
        active: {
          on: {
            CALL_NUMBER: {
              target: 'callingNumber',
              actions: 'recordCalledNumber',
              cond: 'canCallNumber'
            }
          }
        },
        callingNumber: {
          entry: 'announceNumber',
          on: {
            AUDIO_COMPLETE: {
              target: 'active',
              actions: 'clearCurrentNumber'
            },
            PRIZE_WON: {
              actions: 'recordPrizeWon'
            }
          }
        }
      },
      on: {
        PAUSE_GAME: {
          target: 'paused',
          actions: 'setPaused'
        },
        TIME_UP: 'gameOver',
        ALL_NUMBERS_CALLED: 'gameOver',
        END_GAME: 'ending'
      }
    },

    paused: {
      entry: ['pauseAllSystems', 'setPaused'],
      on: {
        RESUME_GAME: {
          target: 'running',
          actions: 'clearPaused'
        },
        END_GAME: 'ending'
      }
    },

    gameOver: {
      entry: ['calculateFinalResults', 'stopAllSystems'],
      type: 'final'
    },

    ending: {
      entry: 'beginGameEnd',
      invoke: {
        src: 'finalizeGame',
        onDone: 'gameOver',
        onError: {
          target: 'error',
          actions: 'setError'
        }
      }
    },

    error: {
      entry: 'handleError',
      on: {
        RETRY: [
          {
            target: 'initializing',
            cond: 'hasGameId'
          },
          {
            target: 'idle'
          }
        ],
        RESET: 'idle'
      }
    }
  }
}, {
  actions: {
    resetGame: assign({
      gameId: null,
      calledNumbers: [],
      currentNumber: null,
      timeRemaining: 0,
      totalPlayers: 0,
      prizesWon: [],
      error: null,
      isPaused: false,
      isAudioReady: false
    }),

    setGameId: assign({
      gameId: (_, event) => event.type === 'START_GAME' ? event.gameId : null
    }),

    clearError: assign({
      error: null
    }),

    setError: assign({
      error: (_, event) => event.type === 'ERROR' ? event.error : 'Unknown error'
    }),

    setInitializationComplete: assign((context, event) => ({
      ...context,
      // Can add initialization data here
    })),

    setAudioReady: assign({
      isAudioReady: true
    }),

    recordCalledNumber: assign({
      calledNumbers: (context, event) => 
        event.type === 'CALL_NUMBER' 
          ? [...context.calledNumbers, event.number]
          : context.calledNumbers,
      currentNumber: (_, event) => 
        event.type === 'CALL_NUMBER' ? event.number : null
    }),

    clearCurrentNumber: assign({
      currentNumber: null
    }),

    recordPrizeWon: assign({
      prizesWon: (context, event) =>
        event.type === 'PRIZE_WON'
          ? [...context.prizesWon, event.prizeId]
          : context.prizesWon
    }),

    setPaused: assign({
      isPaused: true
    }),

    clearPaused: assign({
      isPaused: false
    }),

    startInitialization: () => {
      console.log('🎮 Starting game initialization');
    },

    startGameTimers: () => {
      console.log('⏰ Starting game timers');
    },

    pauseGameTimers: () => {
      console.log('⏸️ Pausing game timers');
    },

    enableNumberCalling: () => {
      console.log('📞 Enabling number calling');
    },

    announceNumber: (context) => {
      if (context.currentNumber) {
        console.log(`📢 Announcing number: ${context.currentNumber}`);
      }
    },

    pauseAllSystems: () => {
      console.log('⏸️ Pausing all game systems');
    },

    stopAllSystems: () => {
      console.log('🛑 Stopping all game systems');
    },

    calculateFinalResults: () => {
      console.log('📊 Calculating final game results');
    },

    beginGameEnd: () => {
      console.log('🏁 Beginning game end sequence');
    },

    handleError: (context) => {
      console.error('❌ Game error:', context.error);
    }
  },

  guards: {
    canCallNumber: (context) => {
      return context.calledNumbers.length < 90 && !context.isPaused;
    },

    hasGameId: (context) => {
      return context.gameId !== null;
    }
  },

  services: {
    initializeGameResources: async (context) => {
      // Simulate game initialization
      return new Promise((resolve) => {
        setTimeout(() => {
          console.log(`✅ Game resources initialized for: ${context.gameId}`);
          resolve(undefined);
        }, 1000);
      });
    },

    finalizeGame: async (context) => {
      // Simulate game finalization
      return new Promise((resolve) => {
        setTimeout(() => {
          console.log(`✅ Game finalized: ${context.gameId}`);
          resolve(undefined);
        }, 500);
      });
    }
  }
});

export type TambolaGameState = StateFrom<typeof tambolaGameMachine>;
export type { TambolaGameContext, TambolaGameEvent };
