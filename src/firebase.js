// src/firebase.ts
import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyBa_nlLWFV79V9LR7FuafT-4ESW1xZ-bi4",
  authDomain: "iddia-bayi.firebaseapp.com",
  projectId: "iddia-bayi",
  storageBucket: "iddia-bayi.firebasestorage.app",
  messagingSenderId: "121808567718",
  appId: "1:121808567718:web:e33c80af18f684c3222367",
  measurementId: "G-WLPKK14X22"
}

// Firebase'i başlat
const app = initializeApp(firebaseConfig)

// Firestore instance
export const db = getFirestore(app)