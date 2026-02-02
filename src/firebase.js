// src/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, setDoc, onSnapshot, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { firebaseConfig } from './config.js'; 

// 1. Initialize Firebase
let app, db, auth, googleProvider;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    // Debug Log: Check if the DB is actually connected
    console.log("🔥 Firestore Initialized for Project:", firebaseConfig.projectId);
} catch (error) {
    console.error("❌ FIREBASE INITIALIZATION FAILED ❌");
    console.error("This is often due to an invalid `firebaseConfig` object in `src/config.js` or a missing/incorrect setup in your Firebase project console.");
    console.error("\n👉 Action Steps:");
    console.error("1. Verify that the `firebaseConfig` values in `src/config.js` exactly match the config object from your Firebase project's settings.");
    console.error("2. Go to the Firebase Console -> Authentication -> Settings -> Authorized Domains. Make sure your application's domain (e.g., `localhost` or your deployed URL) is listed.");
    console.error("3. Ensure you have enabled the 'Google' sign-in provider in Firebase Console -> Authentication -> Sign-in method.");
    console.error("\nOriginal Error:", error);
    // Hide login button and show an error message to the user
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('login-btn').style.display = 'none';
        const authContainer = document.getElementById('auth-container');
        if(authContainer) {
            const errorDiv = document.createElement('div');
            errorDiv.innerText = "App not connected to Firebase. Please check the console (F12) for setup instructions.";
            errorDiv.style.color = "red";
            authContainer.appendChild(errorDiv);
        }
    });
}

export { app, db, auth, googleProvider };

/**
 * Saves a route to Firestore
 */
export const saveRouteToCloud = async (routeData) => {
    try {
        const docRef = await addDoc(collection(db, "routes"), {
            ...routeData,
            timestamp: new Date()
        });
        console.log("✅ Route saved with ID: ", docRef.id);
        return docRef.id;
    } catch (e) {
        console.error("❌ Error adding document: ", e);
        throw e; // Throw so app.js can catch it and alert the user
    }
};

/**
 * Fetches all saved routes for a specific user from the "routes" collection
 * @param {string} userId The UID of the user whose routes to fetch.
 */
export const fetchAllRoutes = async (userId) => {
    if (!userId) {
        console.warn("⚠️ Tried to fetch routes without a user ID.");
        return [];
    }
    try {
        const routesCol = collection(db, "routes");
        const q = query(routesCol, where("userId", "==", userId), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        const routes = [];
        querySnapshot.forEach((doc) => {
            routes.push({ id: doc.id, ...doc.data() });
        });
        return routes;
    } catch (error) {
        console.error("❌ Error fetching routes: ", error);
        return []; // Return empty array on error
    }
};

/**
 * Deletes a route from Firestore
 */
export const deleteRouteFromCloud = async (routeId) => {
    try {
        await deleteDoc(doc(db, "routes", routeId));
        console.log("🗑️ Route deleted:", routeId);
    } catch (e) {
        console.error("❌ Error deleting route:", e);
        throw e;
    }
};

/**
 * Renames a route in Firestore
 */
export const updateRouteName = async (routeId, newName) => {
    try {
        const routeRef = doc(db, "routes", routeId);
        await updateDoc(routeRef, { name: newName });
        console.log("✅ Route renamed:", routeId);
    } catch (e) {
        console.error("❌ Error renaming route:", e);
        throw e;
    }
};

/**
 * Saves a temporary shared route to Firestore
 */
export const saveSharedRoute = async (routeData) => {
    try {
        const docRef = await addDoc(collection(db, "shared_routes"), {
            ...routeData,
            timestamp: new Date()
        });
        return docRef.id;
    } catch (e) {
        console.error("❌ Error sharing route:", e);
        throw e;
    }
};

/**
 * Fetches a shared route by ID
 */
export const fetchSharedRoute = async (routeId) => {
    try {
        const docRef = doc(db, "shared_routes", routeId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    } catch (e) {
        console.error("❌ Error fetching shared route:", e);
        return null;
    }
};

/**
 * Creates a new live tracking session
 */
export const createLiveSession = async (userId, coords, routeGeometry = null) => {
    const payload = {
        hostId: userId,
        lastLocation: { lat: coords[1], lng: coords[0] },
        timestamp: new Date(),
        active: true
    };
    if (routeGeometry) {
        payload.routeGeometry = JSON.stringify(routeGeometry);
    }
    const sessionRef = await addDoc(collection(db, "live_sessions"), payload);
    return sessionRef.id;
};

/**
 * Updates an existing live session with new coordinates
 */
export const updateLiveSession = async (sessionId, coords) => {
    if (!sessionId) return;
    const sessionRef = doc(db, "live_sessions", sessionId);
    await setDoc(sessionRef, {
        lastLocation: { lat: coords[1], lng: coords[0] },
        timestamp: new Date()
    }, { merge: true });
};

/**
 * Subscribes to a live session for real-time updates
 */
export const subscribeToLiveSession = (sessionId, onUpdate) => {
    return onSnapshot(doc(db, "live_sessions", sessionId), (docSnap) => {
        if (docSnap.exists()) {
            onUpdate(docSnap.data());
        }
    });
};