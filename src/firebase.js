// src/firebase.ts
import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"

const firebaseConfig = {
  apiKey: "AIzaSyBa_nlLWFV79V9LR7FuafT-4ESW1xZ-bi4",
  authDomain: "iddia-bayi.firebaseapp.com",
  projectId: "iddia-bayi",
  storageBucket: "iddia-bayi.firebasestorage.app",
  messagingSenderId: "121808567718",
  appId: "1:121808567718:web:e33c80af18f684c3222367",
  measurementId: "G-WLPKK14X22"
}

const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)