import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// AsyncStorage persistence for React Native
import AsyncStorage from "@react-native-async-storage/async-storage";
// Use environment variables from @env (configured via babel plugin)
import {
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
} from "@env";

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY || "AIzaSyBQ-6ow708w8mCozqzavwvHKni1HI5ncu0",
  authDomain: FIREBASE_AUTH_DOMAIN || "smartkitchenapp-a2f3e.firebaseapp.com",
  projectId: FIREBASE_PROJECT_ID || "smartkitchenapp-a2f3e",
  storageBucket:
    FIREBASE_STORAGE_BUCKET || "smartkitchenapp-a2f3e.firebasestorage.app",
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID || "9957505494",
  appId: FIREBASE_APP_ID || "1:9957505494:web:91f9045cdabfc93063cc77",
};

const app = initializeApp(firebaseConfig);

// Initialize Auth with React Native persistence so auth state survives app restarts
let authInstance;
// Try to initialize with the React Native persistence helper at runtime.
// We do a runtime require to avoid TypeScript/Metro resolution issues
// when `firebase/auth/react-native` isn't available at build-time in some environments.
try {
  // Try multiple locations for getReactNativePersistence to be resilient across
  // firebase package distributions and bundler resolution quirks.

  let getRN: any = null;
  try {
    // Some builds expose getReactNativePersistence from the main auth entry.

    const authPkg = require("firebase/auth");
    if (authPkg && typeof authPkg.getReactNativePersistence === "function") {
      getRN = authPkg.getReactNativePersistence;
    }
  } catch (e) {
    // ignore and try the react-native-specific entry next
  }

  if (!getRN) {
    try {
      const rnAuth = require("firebase/auth/react-native");
      if (rnAuth && typeof rnAuth.getReactNativePersistence === "function") {
        getRN = rnAuth.getReactNativePersistence;
      }
    } catch (e) {
      // module not found or other resolution issue
    }
  }

  if (getRN) {
    authInstance = initializeAuth(app, {
      persistence: getRN(AsyncStorage),
    });
    console.log("Initialized Auth with React Native persistence");
  } else {
    console.warn(
      "getReactNativePersistence not found in firebase auth packages, falling back to getAuth"
    );
    authInstance = getAuth(app);
  }
} catch (e) {
  // Fallback to getAuth if the module isn't present or require fails.
  console.warn(
    "initializeAuth (RN persistence) failed, falling back to getAuth:",
    e
  );
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);
export const storage = getStorage(app);

// Debug: verify whether env value loaded (remove in production)
if (__DEV__) {
  // Print the loaded firebase config (mask API key partially) to help debug env issues.
  const maskedKey = FIREBASE_API_KEY
    ? `${FIREBASE_API_KEY.slice(0, 6)}...${FIREBASE_API_KEY.slice(-4)}`
    : null;
  console.log("Firebase config loaded. API key present:", !!FIREBASE_API_KEY);
  console.log("Firebase config (dev):", {
    apiKey: maskedKey,
    authDomain: FIREBASE_AUTH_DOMAIN,
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: FIREBASE_STORAGE_BUCKET,
    messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
    appId: FIREBASE_APP_ID,
  });
}
