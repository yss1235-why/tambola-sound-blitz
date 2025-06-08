// src/services/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getDatabase, ref, set, get, push, onValue, off } from "firebase/database";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCH2WtQ2y3ln8ToHcapIsEMIXJ78Hsg7Bg",
  authDomain: "tambola-74046.firebaseapp.com",
  databaseURL: "https://tambola-74046-default-rtdb.firebaseio.com",
  projectId: "tambola-74046",
  storageBucket: "tambola-74046.firebasestorage.app",
  messagingSenderId: "310265084192",
  appId: "1:310265084192:web:c044bf9b83c444f4a2ff45",
  measurementId: "G-MP72F136BH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
const analytics = getAnalytics(app);

// Admin and Host Interfaces
export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  role: 'admin';
  createdAt: string;
  permissions: {
    createHosts: boolean;
    manageGames: boolean;
    viewStatistics: boolean;
    manageUsers: boolean;
  };
}

export interface HostUser {
  uid: string;
  email: string;
  name: string;
  role: 'host';
  createdAt: string;
  createdBy: string; // Admin UID who created this host
  permissions: {
    createGames: boolean;
    manageGames: boolean;
  };
}

// Firebase Service Class
class FirebaseService {
  
  // Authentication Methods
  async loginAdmin(email: string, password: string): Promise<AdminUser | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Check if user is admin
      const adminRef = ref(database, `admins/${user.uid}`);
      const adminSnapshot = await get(adminRef);
      
      if (adminSnapshot.exists()) {
        return adminSnapshot.val() as AdminUser;
      } else {
        await signOut(auth);
        throw new Error("User is not an admin");
      }
    } catch (error) {
      console.error("Admin login error:", error);
      throw error;
    }
  }

  async loginHost(email: string, password: string): Promise<HostUser | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Check if user is host
      const hostRef = ref(database, `hosts/${user.uid}`);
      const hostSnapshot = await get(hostRef);
      
      if (hostSnapshot.exists()) {
        return hostSnapshot.val() as HostUser;
      } else {
        await signOut(auth);
        throw new Error("User is not a host");
      }
    } catch (error) {
      console.error("Host login error:", error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  }

  // Admin Management Methods
  async createAdmin(email: string, password: string, name: string): Promise<AdminUser> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const adminData: AdminUser = {
        uid: user.uid,
        email: email,
        name: name,
        role: 'admin',
        createdAt: new Date().toISOString(),
        permissions: {
          createHosts: true,
          manageGames: true,
          viewStatistics: true,
          manageUsers: true
        }
      };
      
      // Save admin data to database
      const adminRef = ref(database, `admins/${user.uid}`);
      await set(adminRef, adminData);
      
      return adminData;
    } catch (error) {
      console.error("Create admin error:", error);
      throw error;
    }
  }

  async createHost(email: string, password: string, name: string, createdByUid: string): Promise<HostUser> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const hostData: HostUser = {
        uid: user.uid,
        email: email,
        name: name,
        role: 'host',
        createdAt: new Date().toISOString(),
        createdBy: createdByUid,
        permissions: {
          createGames: true,
          manageGames: true
        }
      };
      
      // Save host data to database
      const hostRef = ref(database, `hosts/${user.uid}`);
      await set(hostRef, hostData);
      
      return hostData;
    } catch (error) {
      console.error("Create host error:", error);
      throw error;
    }
  }

  // Game Management Methods
  async createGame(gameData: any, hostUid: string) {
    try {
      const gameRef = push(ref(database, 'games'));
      const gameId = gameRef.key;
      
      const fullGameData = {
        ...gameData,
        gameId,
        hostUid,
        createdAt: new Date().toISOString(),
        status: 'waiting' // waiting, active, completed
      };
      
      await set(gameRef, fullGameData);
      return { gameId, ...fullGameData };
    } catch (error) {
      console.error("Create game error:", error);
      throw error;
    }
  }

  // Ticket Management Methods
  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string) {
    try {
      const bookingRef = push(ref(database, 'bookings'));
      const bookingData = {
        ticketId,
        playerName,
        playerPhone,
        gameId,
        timestamp: new Date().toISOString(),
        status: 'booked'
      };
      
      await set(bookingRef, bookingData);
      
      // Update ticket status
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      await set(ticketRef, {
        ...ticketRef,
        isBooked: true,
        playerName,
        playerPhone,
        bookedAt: new Date().toISOString()
      });
      
      return bookingData;
    } catch (error) {
      console.error("Book ticket error:", error);
      throw error;
    }
  }

  // Real-time listeners
  subscribeToGame(gameId: string, callback: (gameData: any) => void) {
    const gameRef = ref(database, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val());
      }
    });
    
    return () => off(gameRef);
  }

  subscribeToTickets(gameId: string, callback: (tickets: any) => void) {
    const ticketsRef = ref(database, `games/${gameId}/tickets`);
    onValue(ticketsRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val());
      }
    });
    
    return () => off(ticketsRef);
  }
}

export const firebaseService = new FirebaseService();

// Initial Admin Setup Function (Run once to create first admin)
export async function setupInitialAdmin() {
  try {
    const adminEmail = "admin@tambola.com";
    const adminPassword = "TambolaAdmin123!";
    const adminName = "Super Admin";
    
    // Check if admin already exists
    const adminRef = ref(database, 'admins');
    const adminSnapshot = await get(adminRef);
    
    if (!adminSnapshot.exists() || Object.keys(adminSnapshot.val()).length === 0) {
      console.log("Creating initial admin...");
      const admin = await firebaseService.createAdmin(adminEmail, adminPassword, adminName);
      console.log("Initial admin created:", admin);
      return admin;
    } else {
      console.log("Admin already exists");
      return null;
    }
  } catch (error) {
    console.error("Setup initial admin error:", error);
    throw error;
  }
}

// Utility function to check current user role
export async function getCurrentUserRole(): Promise<'admin' | 'host' | null> {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    // Check if admin
    const adminRef = ref(database, `admins/${user.uid}`);
    const adminSnapshot = await get(adminRef);
    if (adminSnapshot.exists()) return 'admin';
    
    // Check if host
    const hostRef = ref(database, `hosts/${user.uid}`);
    const hostSnapshot = await get(hostRef);
    if (hostSnapshot.exists()) return 'host';
    
    return null;
  } catch (error) {
    console.error("Get user role error:", error);
    return null;
  }
}
