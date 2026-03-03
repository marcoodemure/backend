document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const sessionId = String(params.get("session") || "").trim();
  const statusText = document.getElementById("scanStatusText");
  const doneBtn = document.getElementById("scanDoneBtn");
  const scanCard = document.getElementById("scanCard");
  const scanHelp = document.querySelector(".scan-help");
  const defaultHelpText = scanHelp ? scanHelp.textContent : "";
  const appDb = window.appDb;

  function setStatus(message, state) {
    if (statusText) {
      statusText.textContent = message || "";
    }
    if (scanCard && state) {
      scanCard.setAttribute("data-state", state);
      scanCard.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    }
    if (scanHelp) {
      if (state === "success") {
        scanHelp.textContent = "Checkout should update automatically in a few seconds.";
      } else if (state === "error") {
        scanHelp.textContent = "If this fails, close this tab and rescan from checkout.";
      } else {
        scanHelp.textContent = defaultHelpText || "";
      }
    }
  }

  function revealDoneButton(label) {
    if (!doneBtn) return;
    if (label) {
      doneBtn.textContent = label;
    }
    doneBtn.classList.remove("hidden");
  }

  function closeOrBack() {
    try {
      window.close();
    } catch {}
    setTimeout(() => {
      if (window.history.length > 1) {
        window.history.back();
      }
    }, 120);
  }

  function withTimeout(task, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const timeoutError = new Error("payment_confirmation_timeout");
        timeoutError.code = "payment_confirmation_timeout";
        reject(timeoutError);
      }, timeoutMs);

      Promise.resolve(task)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  function mapScanError(error) {
    const code = String(error?.code || "").toLowerCase();
    if (code === "payment_session_not_found") {
      return "Invalid payment session. Please open a fresh QR link.";
    }
    if (code === "permission-denied") {
      return "Permission denied while confirming payment.";
    }
    if (code === "payment_confirmation_timeout" || code === "deadline-exceeded" || code === "unavailable") {
      return "Payment confirmation timed out. Please try scanning again.";
    }
    return "Failed to confirm payment scan. Please try again.";
  }

  function notifyCheckout(session) {
    const payload = {
      type: "checkout_qr_payment_paid",
      sessionId: session,
      timestamp: Date.now()
    };

    try {
      localStorage.setItem("checkout_qr_payment_signal", JSON.stringify(payload));
    } catch {}

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
      }
    } catch {}

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, window.location.origin);
      }
    } catch {}
  }

  if (doneBtn) {
    doneBtn.addEventListener("click", closeOrBack);
  }

  if (!sessionId) {
    setStatus("Invalid payment session.", "error");
    revealDoneButton("Close");
    return;
  }

  if (!appDb || !appDb.isConfigured()) {
    setStatus("Payment service is not configured.", "error");
    revealDoneButton("Close");
    return;
  }

  setStatus("Confirming payment scan...", "loading");

  try {
    await withTimeout(
      appDb.markPaymentSessionPaid(sessionId, {
        source: "qr_scan",
        userAgent: navigator.userAgent || ""
      }),
      9000
    );

    notifyCheckout(sessionId);
    setStatus("Scan received. Payment confirmed. You can return to checkout.", "success");
    revealDoneButton("Return to checkout");

    setTimeout(() => {
      try {
        if (window.opener && !window.opener.closed) {
          window.close();
        }
      } catch {}
    }, 900);
  } catch (error) {
    console.error("Failed to mark payment session", error);
    setStatus(mapScanError(error), "error");
    revealDoneButton("Close");
  }
});
