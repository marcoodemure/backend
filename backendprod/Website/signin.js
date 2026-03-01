document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const signinBtn = document.getElementById("signinBtn");
  const createAccountLink = document.getElementById("createAccountLink");
  const appAuth = window.appAuth;
  const appDb = window.appDb;

  if (!emailInput || !passwordInput || !signinBtn) {
    console.error("signin.js: Missing required elements");
    return;
  }

  if (!appAuth) {
    console.error("signin.js: appAuth is not available");
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
    const pendingDraft = appAuth.readJson("pendingOrderDraft", null);

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

  signinBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    if (!appAuth.isConfigured()) {
      alert("Firebase is not configured yet. Update firebase-config.js first.");
      return;
    }

    const auth = appAuth.getAuthInstance();
    if (!auth) {
      alert("Authentication service is not available. Please refresh the page.");
      return;
    }

    signinBtn.disabled = true;

    try {
      const signInPromise = auth.signInWithEmailAndPassword(email, password);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("auth/timeout")), 15000)
      );
      const credential = await Promise.race([signInPromise, timeoutPromise]);
      
      const localUser = appAuth.upsertLocalUser(credential.user);
      if (appDb && appDb.isConfigured()) {
        try {
          const profile = await appDb.ensureUserDocument(localUser || credential.user);
          if (profile) {
            appAuth.updateCurrentUser({ role: profile.role || "customer" });
          }
        } catch (dbError) {
          console.error("Failed to sync user document:", dbError);
          // Continue anyway - user is authenticated
        }
      }
      window.location.href = getRedirectUrl();
    } catch (error) {
      console.error("Sign in failed:", error);
      if (error.message === "auth/timeout") {
        alert("Sign in request timed out. Please check your internet connection and try again.");
      } else {
        alert(formatSignInError(error));
      }
    } finally {
      signinBtn.disabled = false;
    }
  });
});
