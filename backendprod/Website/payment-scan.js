document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const sessionId = String(params.get("session") || "").trim();
  const paymentIntent = String(params.get("intent") || "").trim().toLowerCase();
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
        scanHelp.textContent = paymentIntent === "donation"
          ? "Donation page should update automatically in a few seconds."
          : "Checkout should update automatically in a few seconds.";
      } else if (state === "error") {
        scanHelp.textContent = paymentIntent === "donation"
          ? "If this fails, close this tab and rescan from donation page."
          : "If this fails, close this tab and rescan from checkout.";
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

  function notifyPaymentPaid(session) {
    const basePayload = {
      sessionId: session,
      intent: paymentIntent || "",
      timestamp: Date.now()
    };

    const payloads = [
      { ...basePayload, type: "payment_session_paid" },
      { ...basePayload, type: "checkout_qr_payment_paid" }
    ];

    try {
      localStorage.setItem("payment_session_paid_signal", JSON.stringify(payloads[0]));
    } catch {}

    try {
      localStorage.setItem("checkout_qr_payment_signal", JSON.stringify(payloads[1]));
    } catch {}

    payloads.forEach((payload) => {
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
    });
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

    notifyPaymentPaid(sessionId);
    const successText = paymentIntent === "donation"
      ? "Scan received. Donation payment confirmed. You can return now."
      : "Scan received. Payment confirmed. You can return to checkout.";
    const doneLabel = paymentIntent === "donation" ? "Return to donation" : "Return to checkout";
    setStatus(successText, "success");
    revealDoneButton(doneLabel);

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
