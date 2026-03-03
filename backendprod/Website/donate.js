document.addEventListener("DOMContentLoaded", async () => {
  const donateUserStatus = document.getElementById("donateUserStatus");
  const donateFeedback = document.getElementById("donateFeedback");
  const donateAmountInput = document.getElementById("donateAmountInput");
  const donateMessageInput = document.getElementById("donateMessageInput");
  const donateMessageCount = document.getElementById("donateMessageCount");
  const donateQuickAmounts = document.getElementById("donateQuickAmounts");
  const donatePageBackBtn = document.getElementById("donatePageBackBtn");
  const startDonateBtn = document.getElementById("startDonateBtn");
  const donateQrSection = document.getElementById("donateQrSection");
  const donateQrImage = document.getElementById("donateQrImage");
  const donateQrStatusText = document.getElementById("donateQrStatusText");
  const donateOpenScanBtn = document.getElementById("donateOpenScanBtn");
  const donateCancelBtn = document.getElementById("donateCancelBtn");
  const donateSuccessCard = document.getElementById("donateSuccessCard");
  const donateSuccessSummary = document.getElementById("donateSuccessSummary");
  const donateSuccessDonor = document.getElementById("donateSuccessDonor");
  const donateSuccessAmount = document.getElementById("donateSuccessAmount");
  const donateSuccessStatus = document.getElementById("donateSuccessStatus");
  const donateSuccessDate = document.getElementById("donateSuccessDate");
  const viewDonationReceiptBtn = document.getElementById("viewDonationReceiptBtn");
  const donateChoiceModal = document.getElementById("donateChoiceModal");
  const donateChoiceCloseBtn = document.getElementById("donateChoiceCloseBtn");
  const donateChoicePrompt = document.getElementById("donateChoicePrompt");
  const donateChoiceActions = document.getElementById("donateChoiceActions");
  const donateChoiceSigninBtn = document.getElementById("donateChoiceSigninBtn");
  const donateChoiceGuestBtn = document.getElementById("donateChoiceGuestBtn");
  const donateGuestForm = document.getElementById("donateGuestForm");
  const donateGuestNameInput = document.getElementById("donateGuestNameInput");
  const donateGuestAnonymousCheckbox = document.getElementById("donateGuestAnonymousCheckbox");
  const donateGuestError = document.getElementById("donateGuestError");
  const donateGuestBackBtn = document.getElementById("donateGuestBackBtn");
  const donateGuestContinueBtn = document.getElementById("donateGuestContinueBtn");

  const auth = window.authService;
  const appDb = window.appDb;

  if (
    !donateUserStatus
    || !donateAmountInput
    || !donateMessageInput
    || !startDonateBtn
    || !donateQrSection
    || !donateQrImage
    || !donateQrStatusText
    || !donateOpenScanBtn
    || !donateCancelBtn
    || !donateSuccessCard
    || !donateChoiceModal
  ) {
    console.error("donate.js: required elements are missing");
    return;
  }

  const DONATION_DRAFT_KEY = "pendingDonationDraft";
  const defaultStartButtonLabel = startDonateBtn.textContent.trim() || "Donate via QR";
  let currentUser = null;
  let currentUserDisplayName = "";
  let activePaymentSessionId = "";
  let activeDonationDraft = null;
  let stopPaymentSessionWatch = null;
  let paymentStatusPollTimer = null;
  let paymentStatusPollBusy = false;
  let paymentFinalizing = false;

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function setDonateFeedback(type, message) {
    if (!donateFeedback) {
      return;
    }

    donateFeedback.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      donateFeedback.textContent = "";
      donateFeedback.classList.add("hidden");
      return;
    }

    donateFeedback.textContent = message;
    donateFeedback.classList.add(`is-${type || "info"}`);
    donateFeedback.classList.remove("hidden");
  }

  function formatMoney(value, currency) {
    const raw = Number(value);
    const safe = Number.isFinite(raw) ? raw : 0;
    return `${String(currency || "PHP").toUpperCase()} ${safe.toFixed(2)}`;
  }

  function formatDateTime(value) {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  }

  function toDonationAmount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    if (parsed <= 0) {
      return 0;
    }
    return Number(parsed.toFixed(2));
  }

  function getEmailDisplayName(email) {
    const normalized = String(email || "").trim();
    if (!normalized.includes("@")) {
      return normalized || "Donor";
    }
    return normalized.split("@")[0] || "Donor";
  }

  function setStartButtonState(isLoading, label) {
    startDonateBtn.disabled = Boolean(isLoading);
    startDonateBtn.classList.toggle("is-loading", Boolean(isLoading));
    startDonateBtn.textContent = label || defaultStartButtonLabel;
  }

  function setQrStatus(message) {
    donateQrStatusText.textContent = message || "";
  }

  function updateMessageCounter() {
    if (!donateMessageCount) return;
    const currentLength = String(donateMessageInput.value || "").length;
    donateMessageCount.textContent = `${currentLength} / 500`;
  }

  function stopPaymentWatcher() {
    if (stopPaymentSessionWatch) {
      stopPaymentSessionWatch();
      stopPaymentSessionWatch = null;
    }
    if (paymentStatusPollTimer) {
      clearInterval(paymentStatusPollTimer);
      paymentStatusPollTimer = null;
    }
    paymentStatusPollBusy = false;
    paymentFinalizing = false;
    activePaymentSessionId = "";
    activeDonationDraft = null;
  }

  function hideQrSection() {
    donateQrSection.classList.add("hidden");
    donateQrImage.removeAttribute("src");
    donateOpenScanBtn.href = "#";
    setQrStatus("Generating QR code...");
  }

  function resetSuccessCard() {
    donateSuccessSummary.textContent = "";
    donateSuccessDonor.textContent = "N/A";
    donateSuccessAmount.textContent = "PHP 0.00";
    donateSuccessStatus.textContent = "Completed";
    donateSuccessDate.textContent = "N/A";
    viewDonationReceiptBtn.href = "#";
    donateSuccessCard.classList.add("hidden");
  }

  function showGuestForm(show) {
    if (show) {
      if (donateChoicePrompt) {
        donateChoicePrompt.classList.add("hidden");
      }
      if (donateChoiceActions) {
        donateChoiceActions.classList.add("hidden");
      }
      donateGuestForm.classList.remove("hidden");
      donateGuestNameInput.focus();
      return;
    }

    if (donateChoicePrompt) {
      donateChoicePrompt.classList.remove("hidden");
    }
    if (donateChoiceActions) {
      donateChoiceActions.classList.remove("hidden");
    }
    donateGuestForm.classList.add("hidden");
    donateGuestError.classList.add("hidden");
    donateGuestError.textContent = "";
  }

  function openChoiceModal() {
    donateChoiceModal.classList.remove("hidden");
    showGuestForm(false);
  }

  function closeChoiceModal() {
    donateChoiceModal.classList.add("hidden");
    showGuestForm(false);
  }

  function toggleGuestNameMode() {
    const isAnonymous = Boolean(donateGuestAnonymousCheckbox.checked);
    donateGuestNameInput.disabled = isAnonymous;
    donateGuestNameInput.placeholder = isAnonymous ? "Anonymous donor" : "Enter your name";
    if (isAnonymous) {
      donateGuestNameInput.value = "";
    }
  }

  function buildDonationScanUrl(sessionId) {
    const scanUrl = new URL("payment-scan.html", window.location.href);
    scanUrl.search = "";
    scanUrl.searchParams.set("session", sessionId);
    scanUrl.searchParams.set("intent", "donation");
    return scanUrl.toString();
  }

  function persistDraftForSignin() {
    const amount = toDonationAmount(donateAmountInput.value);
    const message = String(donateMessageInput.value || "").trim().slice(0, 500);
    const guestName = String(donateGuestNameInput.value || "").trim().slice(0, 80);
    const anonymous = Boolean(donateGuestAnonymousCheckbox.checked);

    try {
      localStorage.setItem(DONATION_DRAFT_KEY, JSON.stringify({
        amount,
        message,
        guestName,
        anonymous
      }));
    } catch {}
  }

  function prefillDraftFromStorage() {
    const draft = readJson(DONATION_DRAFT_KEY, null);
    if (!draft || typeof draft !== "object") {
      return;
    }

    try {
      localStorage.removeItem(DONATION_DRAFT_KEY);
    } catch {}

    if (draft.amount && Number.isFinite(Number(draft.amount))) {
      donateAmountInput.value = String(Number(draft.amount));
    }
    if (typeof draft.message === "string") {
      donateMessageInput.value = draft.message.slice(0, 500);
    }
    if (typeof draft.guestName === "string") {
      donateGuestNameInput.value = draft.guestName.slice(0, 80);
    }
    donateGuestAnonymousCheckbox.checked = Boolean(draft.anonymous);
    toggleGuestNameMode();
    updateMessageCounter();
  }

  function renderUserStatus() {
    donateUserStatus.innerHTML = "";

    if (currentUser?.uid) {
      const label = currentUserDisplayName || getEmailDisplayName(currentUser.email);
      const emailStatus = document.createElement("span");
      emailStatus.className = "email";
      emailStatus.textContent = `Signed in as ${label} (${currentUser.email || "No email"})`;

      const profileLink = document.createElement("a");
      profileLink.href = "profile.html";
      profileLink.className = "cartBtn";
      profileLink.textContent = "Profile";

      donateUserStatus.append(emailStatus, profileLink);
      return;
    }

    const guestStatus = document.createElement("span");
    guestStatus.className = "email";
    guestStatus.textContent = "You are donating as guest right now.";

    const signinLink = document.createElement("a");
    signinLink.href = "login.html?from=donate";
    signinLink.className = "signinBtn";
    signinLink.textContent = "Sign in";

    donateUserStatus.append(guestStatus, signinLink);
  }

  async function resolveSignedInDisplayName(user) {
    if (!user?.uid) {
      return "";
    }

    if (appDb && appDb.isConfigured() && typeof appDb.getUserProfile === "function") {
      try {
        const profile = await appDb.getUserProfile(user.uid);
        const firstName = String(profile?.profile?.firstName || "").trim();
        const lastName = String(profile?.profile?.lastName || "").trim();
        const joined = [firstName, lastName].filter(Boolean).join(" ");
        if (joined) {
          return joined;
        }
      } catch (error) {
        console.error("Failed to resolve donor profile name", error);
      }
    }

    return getEmailDisplayName(user.email);
  }

  async function refreshCurrentUserState() {
    let nextUser = null;

    if (auth && typeof auth.getCurrentUser === "function") {
      nextUser = auth.getCurrentUser();
    }
    if (!nextUser?.uid && auth && typeof auth.waitForAuthState === "function") {
      try {
        nextUser = await auth.waitForAuthState(3000);
      } catch {}
    }

    currentUser = nextUser?.uid ? nextUser : null;
    currentUserDisplayName = currentUser ? await resolveSignedInDisplayName(currentUser) : "";
    renderUserStatus();
  }

  function validateDonationDraft() {
    const amount = toDonationAmount(donateAmountInput.value);
    const message = String(donateMessageInput.value || "").trim().slice(0, 500);

    if (!amount) {
      setDonateFeedback("error", "Enter a valid donation amount.");
      donateAmountInput.focus();
      return null;
    }

    if (amount > 1000000) {
      setDonateFeedback("error", "Donation amount is too high for a single transaction.");
      donateAmountInput.focus();
      return null;
    }

    return {
      amount,
      message,
      currency: "PHP"
    };
  }

  async function finalizeDonationFromSession() {
    if (!activeDonationDraft || !activePaymentSessionId) {
      return;
    }

    const payload = {
      sessionId: activePaymentSessionId,
      paymentSessionId: activePaymentSessionId,
      uid: activeDonationDraft.uid || "",
      email: activeDonationDraft.email || "",
      donorName: activeDonationDraft.donorName || "Anonymous",
      isAnonymous: Boolean(activeDonationDraft.isAnonymous),
      message: activeDonationDraft.message || "",
      amount: activeDonationDraft.amount,
      currency: activeDonationDraft.currency || "PHP",
      source: activeDonationDraft.source || "donate_page",
      paymentMethod: "gcash"
    };

    const donation = await appDb.recordDonation(payload);
    if (!donation?.id) {
      throw new Error("donation_record_failed");
    }

    if (typeof appDb.markPaymentSessionCompleted === "function") {
      await appDb.markPaymentSessionCompleted(activePaymentSessionId, donation.id).catch((error) => {
        console.error("Failed to mark donation payment session completed", error);
      });
    }

    const donorDisplayName = donation.donorDisplayName || (donation.isAnonymous ? "Anonymous" : donation.donorName) || "Donor";
    donateSuccessSummary.textContent = `Thank you, ${donorDisplayName}. Your support has been received.`;
    donateSuccessDonor.textContent = donorDisplayName;
    donateSuccessAmount.textContent = formatMoney(donation.amount, donation.currency);
    donateSuccessStatus.textContent = String(donation.status || "completed").replace(/_/g, " ");
    donateSuccessDate.textContent = formatDateTime(donation.paidAt || donation.createdAt);
    viewDonationReceiptBtn.href = `donation-receipt.html?donation_id=${encodeURIComponent(donation.id)}`;
    donateSuccessCard.classList.remove("hidden");

    setQrStatus("Donated successfully.");
    setDonateFeedback("success", `Donation completed: ${formatMoney(donation.amount, donation.currency)}.`);
    setStartButtonState(false, "Donate Again");
    stopPaymentWatcher();
  }

  async function handlePaidSession(paymentSession) {
    if (!paymentSession || paymentFinalizing || !activePaymentSessionId) {
      return;
    }

    if (paymentSession.id !== activePaymentSessionId) {
      return;
    }

    if (paymentSession.status !== "paid" && paymentSession.status !== "completed") {
      return;
    }

    paymentFinalizing = true;
    setQrStatus("Payment detected. Finalizing donation...");
    setDonateFeedback("info", "Payment detected. Finalizing your donation...");
    setStartButtonState(true, "Finalizing...");

    try {
      await finalizeDonationFromSession();
    } catch (error) {
      paymentFinalizing = false;
      console.error("Failed to finalize donation", error);
      setQrStatus("Payment detected but donation confirmation failed. Please retry.");
      setDonateFeedback("error", "Payment detected, but donation confirmation failed. Try again.");
      setStartButtonState(false, defaultStartButtonLabel);
    }
  }

  async function pollPaymentStatusOnce() {
    if (!activePaymentSessionId || paymentFinalizing || paymentStatusPollBusy || !appDb.getPaymentSession) {
      return;
    }

    paymentStatusPollBusy = true;
    try {
      const latest = await appDb.getPaymentSession(activePaymentSessionId);
      await handlePaidSession(latest);
    } catch (error) {
      console.error("Donation payment status poll failed", error);
    } finally {
      paymentStatusPollBusy = false;
    }
  }

  function syncFromExternalSignal(sessionId) {
    if (!sessionId || !activePaymentSessionId || sessionId !== activePaymentSessionId) {
      return;
    }

    setQrStatus("Scan received. Verifying donation...");
    setDonateFeedback("info", "Scan received. Verifying donation status...");
    setStartButtonState(true, "Verifying...");
    pollPaymentStatusOnce().catch((error) => console.error("Failed to verify donation from signal", error));
  }

  async function startDonationSession(identity) {
    const draft = validateDonationDraft();
    if (!draft) {
      return;
    }

    if (
      !appDb
      || !appDb.isConfigured()
      || typeof appDb.createPaymentSession !== "function"
      || typeof appDb.watchPaymentSession !== "function"
      || typeof appDb.getPaymentSession !== "function"
      || typeof appDb.recordDonation !== "function"
    ) {
      setDonateFeedback("error", "Donation service is unavailable right now.");
      return;
    }

    closeChoiceModal();
    resetSuccessCard();
    hideQrSection();
    setDonateFeedback("info", "Generating donation QR code...");
    setStartButtonState(true, "Preparing QR...");

    try {
      const session = await appDb.createPaymentSession({
        uid: identity.uid || "",
        email: identity.email || "",
        amount: draft.amount,
        currency: draft.currency,
        draft: {
          totalPrice: draft.amount,
          paymentMethod: "gcash",
          orderNotes: draft.message,
          contactEmail: identity.email || ""
        },
        source: "donation_qr"
      });

      if (!session?.id) {
        throw new Error("donation_session_failed");
      }

      activePaymentSessionId = session.id;
      activeDonationDraft = {
        amount: draft.amount,
        currency: draft.currency,
        message: draft.message,
        donorName: identity.name || "Anonymous",
        isAnonymous: Boolean(identity.isAnonymous),
        uid: identity.uid || "",
        email: identity.email || "",
        source: identity.source || "donate_page"
      };

      const scanUrl = buildDonationScanUrl(session.id);
      donateQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(scanUrl)}`;
      donateOpenScanBtn.href = scanUrl;
      donateQrSection.classList.remove("hidden");
      setQrStatus("Waiting for scan...");
      setStartButtonState(true, "Waiting for scan...");

      if (stopPaymentSessionWatch) {
        stopPaymentSessionWatch();
        stopPaymentSessionWatch = null;
      }
      if (paymentStatusPollTimer) {
        clearInterval(paymentStatusPollTimer);
        paymentStatusPollTimer = null;
      }
      paymentFinalizing = false;
      paymentStatusPollBusy = false;

      stopPaymentSessionWatch = appDb.watchPaymentSession(
        session.id,
        (paymentSession) => {
          handlePaidSession(paymentSession).catch((error) => console.error("Failed to process donation payment session", error));
        },
        (error) => {
          console.error("Donation payment listener failed", error);
          setQrStatus("Realtime listener interrupted. Checking payment status...");
          setDonateFeedback("info", "Realtime listener interrupted. Verifying payment status...");
        }
      );

      paymentStatusPollTimer = setInterval(() => {
        pollPaymentStatusOnce().catch((error) => console.error("Donation poll loop failed", error));
      }, 900);

      setTimeout(() => {
        pollPaymentStatusOnce().catch((error) => console.error("Initial donation poll failed", error));
      }, 220);
    } catch (error) {
      console.error("Failed to start donation session", error);
      setDonateFeedback("error", "Failed to start donation QR. Please try again.");
      setStartButtonState(false, defaultStartButtonLabel);
      hideQrSection();
      stopPaymentWatcher();
    }
  }

  donateMessageInput.addEventListener("input", updateMessageCounter);
  updateMessageCounter();
  prefillDraftFromStorage();
  hideQrSection();
  resetSuccessCard();
  setStartButtonState(false, defaultStartButtonLabel);

  if (donatePageBackBtn) {
    donatePageBackBtn.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = "orders.html";
    });
  }

  if (donateQuickAmounts) {
    donateQuickAmounts.querySelectorAll("[data-amount]").forEach((button) => {
      button.addEventListener("click", () => {
        const amount = toDonationAmount(button.getAttribute("data-amount"));
        if (!amount) return;
        donateAmountInput.value = String(amount);
        setDonateFeedback("", "");
      });
    });
  }

  donateChoiceModal.addEventListener("click", (event) => {
    if (event.target === donateChoiceModal) {
      closeChoiceModal();
    }
  });
  donateChoiceCloseBtn.addEventListener("click", closeChoiceModal);
  donateChoiceSigninBtn.addEventListener("click", () => {
    persistDraftForSignin();
    window.location.href = "login.html?from=donate";
  });
  donateChoiceGuestBtn.addEventListener("click", () => {
    showGuestForm(true);
  });
  donateGuestBackBtn.addEventListener("click", () => {
    closeChoiceModal();
  });

  donateGuestAnonymousCheckbox.addEventListener("change", () => {
    donateGuestError.classList.add("hidden");
    donateGuestError.textContent = "";
    toggleGuestNameMode();
  });
  toggleGuestNameMode();

  donateGuestContinueBtn.addEventListener("click", async () => {
    const isAnonymous = Boolean(donateGuestAnonymousCheckbox.checked);
    const typedName = String(donateGuestNameInput.value || "").trim().slice(0, 80);
    const donorName = isAnonymous ? "Anonymous" : typedName;

    if (!isAnonymous && !donorName) {
      donateGuestError.textContent = "Please enter your name or select anonymous donation.";
      donateGuestError.classList.remove("hidden");
      donateGuestNameInput.focus();
      return;
    }

    donateGuestError.classList.add("hidden");
    donateGuestError.textContent = "";

    await startDonationSession({
      uid: "",
      email: "",
      name: donorName,
      isAnonymous,
      source: "donate_page_guest"
    });
  });

  donateCancelBtn.addEventListener("click", () => {
    hideQrSection();
    stopPaymentWatcher();
    setStartButtonState(false, defaultStartButtonLabel);
    setDonateFeedback("info", "Donation flow canceled.");
  });

  startDonateBtn.addEventListener("click", async () => {
    if (activePaymentSessionId) {
      setDonateFeedback("info", "A donation QR is already active. Complete or cancel it first.");
      return;
    }

    if (currentUser?.uid) {
      const donorName = currentUserDisplayName || getEmailDisplayName(currentUser.email);
      await startDonationSession({
        uid: currentUser.uid,
        email: currentUser.email || "",
        name: donorName,
        isAnonymous: false,
        source: "donate_page_account"
      });
      return;
    }

    openChoiceModal();
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) {
      return;
    }
    const data = event?.data || {};
    if (data.type !== "payment_session_paid" && data.type !== "checkout_qr_payment_paid") {
      return;
    }
    syncFromExternalSignal(String(data.sessionId || "").trim());
  });

  window.addEventListener("storage", (event) => {
    if (
      event.key !== "payment_session_paid_signal"
      && event.key !== "checkout_qr_payment_signal"
    ) {
      return;
    }
    if (!event.newValue) {
      return;
    }

    try {
      const payload = JSON.parse(event.newValue);
      const sessionId = String(payload?.sessionId || "").trim();
      syncFromExternalSignal(sessionId);
    } catch {}
  });

  if (auth && typeof auth.onAuthStateChanged === "function") {
    const unsubscribe = auth.onAuthStateChanged(() => {
      refreshCurrentUserState().catch((error) => {
        console.error("Failed to refresh donation auth state", error);
      });
    });
    window.addEventListener("beforeunload", () => {
      try {
        unsubscribe();
      } catch {}
    }, { once: true });
  }

  await refreshCurrentUserState();
});
