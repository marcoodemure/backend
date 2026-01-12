import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6pb-mQZDMgruLeCmypmNVWyidUula-FM",
  authDomain: "habitlikha.firebaseapp.com",
  projectId: "habitlikha",
  storageBucket: "habitlikha.firebasestorage.app",
  messagingSenderId: "54672465819",
  appId: "1:54672465819:web:29609e1f084357ecbf4b3e",
  measurementId: "G-3FP0ZXZCJD"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
