document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const createBtn = document.getElementById("createBtn");
  const signinLink = document.getElementById("signinLink");
  const appAuth = window.appAuth;
  const appDb = window.appDb;

  if (!emailInput || !passwordInput || !createBtn) {
    console.error("create-account.js: Missing required elements");
    return;
  }

  if (!appAuth) {
    console.error("create-account.js: appAuth is not available");
    return;
  }

  const pageParams = new URLSearchParams(window.location.search);

  if (signinLink) {
    const linkParams = new URLSearchParams();
    const from = pageParams.get("from");
    const productId = pageParams.get("product_id");

    if (from) linkParams.set("from", from);
    if (productId) linkParams.set("product_id", productId);

    const query = linkParams.toString();
    signinLink.href = query ? `signin.html?${query}` : "signin.html";
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

  function formatCreateError(error) {
    switch (error?.code) {
      case "auth/email-already-in-use":
        return "Email is already in use.";
      case "auth/invalid-email":
        return "Invalid email format.";
      case "auth/weak-password":
        return "Password should be at least 6 characters.";
      default:
        return error?.message || "Failed to create account.";
    }
  }

  createBtn.addEventListener("click", async () => {
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

    createBtn.disabled = true;

    try {
      const createPromise = auth.createUserWithEmailAndPassword(email, password);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("auth/timeout")), 15000)
      );
      const credential = await Promise.race([createPromise, timeoutPromise]);
      
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
      console.error("Account creation failed:", error);
      if (error.message === "auth/timeout") {
        alert("Request timed out. Please check your internet connection and try again.");
      } else {
        alert(formatCreateError(error));
      }
    } finally {
      createBtn.disabled = false;
    }
  });
});
