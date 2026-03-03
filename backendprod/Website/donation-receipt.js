document.addEventListener("DOMContentLoaded", async () => {
  const receiptCard = document.getElementById("donationReceiptCard");
  const receiptFeedback = document.getElementById("donationReceiptFeedback");
  const printBtn = document.getElementById("printDonationReceiptBtn");
  const downloadBtn = document.getElementById("downloadDonationPdfBtn");

  const appDb = window.appDb;

  function setFeedback(type, message) {
    if (!receiptFeedback) return;
    receiptFeedback.classList.remove("is-error", "is-success", "is-info");

    if (!message) {
      receiptFeedback.textContent = "";
      receiptFeedback.classList.add("hidden");
      return;
    }

    receiptFeedback.textContent = message;
    receiptFeedback.classList.add(`is-${type || "info"}`);
    receiptFeedback.classList.remove("hidden");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(value, currency) {
    const amount = Number(value);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return `${String(currency || "PHP").toUpperCase()} ${safeAmount.toFixed(2)}`;
  }

  function formatDateTime(value) {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  }

  function renderReceipt(donation) {
    const donorName = donation.donorDisplayName || (donation.isAnonymous ? "Anonymous" : donation.donorName) || "Anonymous";
    const amountLabel = formatMoney(donation.amount, donation.currency);
    const statusLabel = String(donation.status || "completed").replace(/_/g, " ");
    const donationId = escapeHtml(donation.id || "N/A");
    const receiptRef = `DON-${donationId}`;
    const paymentMethod = escapeHtml(String(donation.paymentMethod || "gcash").replace(/_/g, " "));
    const message = escapeHtml(donation.message || "");
    const paidAt = escapeHtml(formatDateTime(donation.paidAt || donation.createdAt));

    receiptCard.innerHTML = `
      <div class="invoice-receipt-head">
        <div class="invoice-branding">
          <div class="invoice-brand-logo" aria-hidden="true">HL</div>
          <div class="invoice-brand-copy">
            <p class="invoice-brand-kicker">Habi't Likha e-Receipt</p>
            <h1 data-ui-icon="hand-heart">Donation Receipt</h1>
            <p class="invoice-receipt-ref">Reference: ${receiptRef}</p>
          </div>
        </div>
        <span class="status-chip status-delivered">${statusLabel}</span>
      </div>

      <div class="invoice-amount-panel">
        <p class="invoice-amount-label">Amount Donated</p>
        <p class="invoice-amount-value">${amountLabel}</p>
        <div class="invoice-amount-meta">
          <span data-ui-icon="user-round">${escapeHtml(donorName)}</span>
          <span data-ui-icon="credit-card">${paymentMethod}</span>
        </div>
      </div>

      <div class="invoice-meta-grid">
        <div class="invoice-meta-item">
          <small>Donation ID</small>
          <strong>${donationId}</strong>
        </div>
        <div class="invoice-meta-item">
          <small>Date Paid</small>
          <strong>${paidAt}</strong>
        </div>
        <div class="invoice-meta-item">
          <small>Donor</small>
          <strong>${escapeHtml(donorName)}</strong>
        </div>
        <div class="invoice-meta-item">
          <small>Payment Session</small>
          <strong>${escapeHtml(donation.paymentSessionId || "N/A")}</strong>
        </div>
      </div>

      <div class="invoice-line-items">
        <div class="summary-line"><strong>Details</strong><strong>Amount</strong></div>
        <div class="summary-line"><span>Community donation support</span><span>${amountLabel}</span></div>
      </div>

      <div class="invoice-map-proof">
        <h3 data-ui-icon="message-square">Donor Message</h3>
        <p>${message || "No message provided."}</p>
      </div>

      <div class="total invoice-total"><span>Total donated</span><span>${amountLabel}</span></div>
      <p class="invoice-footnote">Thank you for supporting Habi't Likha community programs.</p>
    `;
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      setFeedback("info", "Use your browser print dialog and choose Save as PDF.");
      window.print();
    });
  }

  if (!appDb || !appDb.isConfigured() || typeof appDb.getDonationById !== "function") {
    setFeedback("error", "Donation receipt service is unavailable.");
    receiptCard.innerHTML = "<p>Unable to load donation receipt.</p>";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const donationId = String(params.get("donation_id") || "").trim();

  if (!donationId) {
    setFeedback("error", "Missing donation ID.");
    receiptCard.innerHTML = "<p>Invalid donation receipt link.</p>";
    return;
  }

  try {
    const donation = await appDb.getDonationById(donationId);
    if (!donation) {
      setFeedback("error", "Donation record not found.");
      receiptCard.innerHTML = "<p>Donation receipt not found.</p>";
      return;
    }

    renderReceipt(donation);
    setFeedback("", "");
  } catch (error) {
    console.error("Failed to load donation receipt", error);
    setFeedback("error", "Failed to load donation receipt.");
    receiptCard.innerHTML = "<p>Could not load donation receipt right now.</p>";
  }
});
