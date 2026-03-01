(function () {
  const firestoreDatabaseId = "";

  const firebaseConfig = {
    apiKey: "AIzaSyDTSdGQo-CVxSyig4V1oIz60WDZmy62HuQ",
    authDomain: "backend-153ff.firebaseapp.com",
    projectId: "backend-153ff",
    storageBucket: "backend-153ff.firebasestorage.app",
    messagingSenderId: "186787272282",
    appId: "1:186787272282:web:9e59cda437ce90da90ea63"
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
