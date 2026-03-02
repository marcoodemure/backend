document.addEventListener("DOMContentLoaded", async () => {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const signinBtn = document.getElementById("signinBtn");
  const createAccountLink = document.getElementById("createAccountLink");
  const appDb = window.appDb;
  const auth = window.authService;

  if (!emailInput || !passwordInput || !signinBtn) {
    console.error("signin.js: Missing required elements");
    return;
  }

  if (!auth || !auth.isConfigured()) {
    console.error("signin.js: Authentication service not available");
    return;
  }

  const pageParams = new URLSearchParams(window.location.search);

  if (createAccountLink) {
    const linkParams = new URLSearchParams();
    const from = pageParams.get("from");
    const productId = pageParams.get("product_id");

    if (from) linkParams.set("from", from);
    if (productId) linkParams.set("product_id", productId);

    const query = linkParams.toString();
    createAccountLink.href = query ? `create-account.html?${query}` : "create-account.html";
  }

  function getRedirectUrl() {
    const from = pageParams.get("from");
    const paramProductId = Number(pageParams.get("product_id"));
    const pendingDraft = JSON.parse(localStorage.getItem("pendingOrderDraft")||"null");

    if (from === "admin") {
      return "admin.html";
    }

    if (from === "orders") {
      return "orders.html";
    }

    if (from === "profile") {
      return "profile.html";
    }

    const pendingProductId = Number(pendingDraft?.productId);
    const cartProductId = Number(localStorage.getItem("cartProductId"));
    const resolvedProductId = paramProductId || pendingProductId || cartProductId;

    if (resolvedProductId) {
      const resumeFlag = pendingDraft ? "&resume=1" : "";
      return `checkout.html?product_id=${resolvedProductId}${resumeFlag}`;
    }

    if (pendingDraft) {
      return "checkout.html?resume=1";
    }

    return "checkout.html";
  }

  function formatSignInError(error) {
    switch (error?.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Invalid email or password.";
      case "auth/invalid-email":
        return "Invalid email format.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again later.";
      default:
        return error?.message || "Sign in failed.";
    }
  }

  async function redirectIfAlreadySignedIn() {
    try {
      let currentUser = typeof auth.getCurrentUser === "function" ? auth.getCurrentUser() : null;
      if (!currentUser?.uid && typeof auth.waitForAuthState === "function") {
        currentUser = await auth.waitForAuthState(2500);
      }
      if (currentUser?.uid) {
        window.location.replace(getRedirectUrl());
        return true;
      }
    } catch (error) {
      console.error("signin.js: Failed to check existing session", error);
    }
    return false;
  }

  signinBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    if (!auth.isConfigured()) {
      alert("Firebase authentication is not configured yet.");
      return;
    }

    signinBtn.disabled = true;

    try {
      const credential = await auth.signIn(email, password);
      // ensure user document in firestore
      if (appDb && appDb.isConfigured()) {
        try {
          const profile = await appDb.ensureUserDocument(credential.user);
          if (profile) {
            // optionally store role locally
            localStorage.setItem('userRole', profile.role || 'customer');
          }
        } catch (dbError) {
          console.error("Failed to sync user document:", dbError);
        }
      }
      window.location.href = getRedirectUrl();
    } catch (error) {
      console.error("Sign in failed:", error);
      const message = formatSignInError(error);
      alert(message);
    } finally {
      signinBtn.disabled = false;
    }
  });

  redirectIfAlreadySignedIn().catch(() => {});
});
