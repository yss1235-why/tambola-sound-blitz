import '@testing-library/jest-dom'

// Mock Firebase
vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({})),
}))

vi.mock('firebase/database', () => ({
    getDatabase: vi.fn(() => ({})),
    ref: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    push: vi.fn(),
    remove: vi.fn(),
    onValue: vi.fn(),
    off: vi.fn(),
    query: vi.fn(),
    orderByChild: vi.fn(),
    equalTo: vi.fn(),
    runTransaction: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({})),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
}))

// Global test utilities
globalThis.console = {
    ...console,
    // Suppress console logs during tests unless debugging
    log: vi.fn(),
    warn: vi.fn(),
    // Keep error visible
    error: console.error,
}
