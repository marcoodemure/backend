(function () {
  const firestoreDatabaseId = "dbbackend";

  const firebaseConfig = {
    apiKey: "AIzaSyD6pb-mQZDMgruLeCmypmNVWyidUula-FM",
    authDomain: "habitlikha.firebaseapp.com",
    projectId: "habitlikha",
    storageBucket: "habitlikha.firebasestorage.app",
    messagingSenderId: "54672465819",
    appId: "1:54672465819:web:29609e1f084357ecbf4b3e",
    measurementId: "G-3FP0ZXZCJD"
  };

  const configured = Object.values(firebaseConfig).every(
    (value) => typeof value === "string" && value.length > 0 && !value.startsWith("REPLACE_WITH_")
  );

  if (!configured) {
    console.warn("Firebase config is not set. Update firebase-config.js with your project values.");
    window.firebaseReady = false;
    return;
  }

  if (!window.firebase || !window.firebase.apps) {
    console.error("Firebase SDK is missing. Make sure firebase-app-compat and firebase-auth-compat are loaded first.");
    window.firebaseReady = false;
    return;
  }

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }

  window.firebaseDatabaseId = firestoreDatabaseId;
  window.firebaseAuth = window.firebase.auth();
  window.firebaseReady = true;
})();
