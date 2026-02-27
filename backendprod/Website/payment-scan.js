document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");
  const statusText = document.getElementById("scanStatusText");
  const doneBtn = document.getElementById("scanDoneBtn");
  const scanCard = document.getElementById("scanCard");

  const appDb = window.appDb;

  function setStatus(message, state) {
    statusText.textContent = message;
    if (scanCard && state) {
      scanCard.setAttribute("data-state", state);
    }
  }

  doneBtn.addEventListener("click", () => {
    window.close();
  });

  if (!sessionId) {
    setStatus("Invalid payment session.", "error");
    doneBtn.classList.remove("hidden");
    return;
  }

  if (!appDb || !appDb.isConfigured()) {
    setStatus("Payment service is not configured.", "error");
    doneBtn.classList.remove("hidden");
    return;
  }

  try {
    await appDb.markPaymentSessionPaid(sessionId, {
      source: "qr_scan",
      userAgent: navigator.userAgent || ""
    });

    setStatus("Scan received. Payment marked as successful. You can close this page.", "success");
  } catch (error) {
    console.error("Failed to mark payment session", error);
    setStatus("Failed to confirm payment scan.", "error");
  }

  doneBtn.classList.remove("hidden");
});
