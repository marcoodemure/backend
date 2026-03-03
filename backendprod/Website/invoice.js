document.addEventListener("DOMContentLoaded", async () => {
  const invoiceCard = document.getElementById("invoiceCard");
  const invoiceFeedback = document.getElementById("invoiceFeedback");
  const printInvoiceBtn = document.getElementById("printInvoiceBtn");
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");

  const auth = window.authService;
  const appDb = window.appDb;

  function setFeedback(type, message) {
    if (!invoiceFeedback) {
      return;
    }

    invoiceFeedback.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      invoiceFeedback.textContent = "";
      invoiceFeedback.classList.add("hidden");
      return;
    }

    invoiceFeedback.textContent = message;
    invoiceFeedback.classList.add(`is-${type || "info"}`);
    invoiceFeedback.classList.remove("hidden");
  }

  function formatMoney(value) {
    return `PHP ${Number(value || 0).toFixed(2)}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatPaymentLabel(method) {
    const raw = String(method || "cash_on_delivery").toLowerCase();
    if (raw === "gcash") return "GCash Wallet";
    if (raw === "cash_on_delivery") return "Cash on Delivery";
    return raw.replace(/_/g, " ");
  }

  function formatDeliveryLabel(method) {
    return method === "pickup" ? "Store Pickup" : "Ship to Address";
  }

  function formatDateTime(value) {
    if (!value) {
      return "N/A";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  }

  function renderInvoice(order) {
    const quantity = Math.max(1, Number(order.quantity) || 1);
    const unitPrice = Number(order.unitPrice) || 0;
    const shippingFee = Number(order.shippingFee) || 0;
    const subtotal = unitPrice * quantity;
    const totalPrice = Number(order.totalPrice) || unitPrice * quantity + shippingFee;
    const payment = formatPaymentLabel(order.paymentMethod);
    const delivery = order.deliveryMethod === "pickup" ? "pickup" : "ship";
    const deliveryLabel = formatDeliveryLabel(delivery);
    const rawStatus = String(order.status || "pending");
    const status = rawStatus.replace(/_/g, " ");
    const statusClass = rawStatus === "in_transit" ? "status-transit" : rawStatus === "delivered" ? "status-delivered" : rawStatus === "canceled" ? "status-canceled" : "status-pending";
    const orderIdLabel = escapeHtml(order.id || "N/A");
    const receiptRef = `HL-${orderIdLabel}`;
    const billTo = escapeHtml(order.contactEmail || order.email || "N/A");
    const productLabel = escapeHtml(order.productName || `Product #${order.productId || ""}`);
    const lat = Number(order.shippingLocation?.lat);
    const lng = Number(order.shippingLocation?.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const mapLinkUrl = order.shippingLocationSnapshot?.mapUrl
      || (
        hasCoords
          ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`
          : ""
      );
    const mapSnapshotUrl = order.shippingLocationSnapshot?.embedUrl || order.shippingLocationSnapshot?.imageUrl || "";
    const proofMapHtml = delivery === "ship" && (hasCoords || mapLinkUrl)
      ? `
        <div class="invoice-map-proof">
          <h3 data-ui-icon="map-pinned">Delivery Pin Proof</h3>
          <div class="summary-line"><span>Coordinates</span><span>${hasCoords ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "N/A"}</span></div>
          <div class="summary-line"><span>Map link</span><span>${mapLinkUrl ? `<a href="${mapLinkUrl}" target="_blank" rel="noopener noreferrer" data-ui-icon="external-link">Open map pin</a>` : "N/A"}</span></div>
          ${mapSnapshotUrl ? `<img src="${mapSnapshotUrl}" alt="Pinned delivery map preview" class="invoice-map-image" onerror="this.style.display='none'">` : ""}
        </div>
      `
      : "";
    const pickupDetails = order.pickupDetails && typeof order.pickupDetails === "object" ? order.pickupDetails : null;
    const pickupQrHtml = delivery === "pickup" && pickupDetails?.reference
      ? `
        <div class="invoice-map-proof">
          <h3 data-ui-icon="qr-code">Pickup Claim Proof</h3>
          <div class="summary-line"><span>Reference</span><span>${escapeHtml(pickupDetails.reference)}</span></div>
          <div class="summary-line"><span>Pickup schedule</span><span>${escapeHtml(pickupDetails.pickupDate || "N/A")} ${escapeHtml(pickupDetails.pickupTimeSlot || "")}</span></div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`PICKUP_CLAIM|ORDER:${order.id || "N/A"}|REF:${pickupDetails.reference}`)}" alt="Pickup claim QR code" class="invoice-map-image" onerror="this.style.display='none'">
        </div>
      `
      : "";

    invoiceCard.innerHTML = `
      <div class="invoice-receipt-head">
        <div class="invoice-branding">
          <div class="invoice-brand-logo" aria-hidden="true">HL</div>
          <div class="invoice-brand-copy">
            <p class="invoice-brand-kicker">Habi't Likha e-Receipt</p>
            <h1 data-ui-icon="receipt-text">Payment Receipt</h1>
            <p class="invoice-receipt-ref">Reference: ${receiptRef}</p>
          </div>
        </div>
        <span class="status-chip ${statusClass}">${status}</span>
      </div>

      <div class="invoice-amount-panel">
        <p class="invoice-amount-label">Amount Paid</p>
        <p class="invoice-amount-value">${formatMoney(totalPrice)}</p>
        <div class="invoice-amount-meta">
          <span data-ui-icon="credit-card">${escapeHtml(payment)}</span>
          <span data-ui-icon="truck">${escapeHtml(deliveryLabel)}</span>
        </div>
      </div>

      <div class="invoice-meta-grid">
        <div class="invoice-meta-item">
          <small>Order ID</small>
          <strong>${orderIdLabel}</strong>
        </div>
        <div class="invoice-meta-item">
          <small>Date Paid</small>
          <strong>${escapeHtml(formatDateTime(order.updatedAt || order.createdAt))}</strong>
        </div>
        <div class="invoice-meta-item">
          <small>Billed To</small>
          <strong>${billTo}</strong>
        </div>
        <div class="invoice-meta-item">
          <small>Placed</small>
          <strong>${escapeHtml(formatDateTime(order.createdAt))}</strong>
        </div>
      </div>

      <div class="invoice-line-items">
        <div class="summary-line"><strong>Details</strong><strong>Amount</strong></div>
        <div class="summary-line"><span>${productLabel} x ${quantity}</span><span>${formatMoney(subtotal)}</span></div>
        <div class="summary-line"><span>Unit price</span><span>${formatMoney(unitPrice)}</span></div>
        <div class="summary-line"><span>Shipping fee</span><span>${formatMoney(shippingFee)}</span></div>
      </div>

      ${proofMapHtml}
      ${pickupQrHtml}
      <div class="total invoice-total"><span>Total paid</span><span>${formatMoney(totalPrice)}</span></div>
      <p class="invoice-footnote">This is a system-generated e-receipt for demo/reporting use.</p>
    `;
  }

  if (printInvoiceBtn) {
    printInvoiceBtn.addEventListener("click", () => {
      window.print();
    });
  }

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", () => {
      setFeedback("info", "Use your browser's Save as PDF option in the print dialog.");
      window.print();
    });
  }

  if (!auth || !appDb || !auth.isConfigured() || !appDb.isConfigured()) {
    setFeedback("error", "Invoice service is not configured.");
    invoiceCard.innerHTML = "<p>Unable to load invoice.</p>";
    return;
  }

  let user = auth.getCurrentUser();
  if (!user?.uid && typeof auth.waitForAuthState === "function") {
    user = await auth.waitForAuthState(5000);
  }

  if (!user || !user.uid) {
    setFeedback("error", "Sign in first to view invoices.");
    invoiceCard.innerHTML = "<p>You need to sign in.</p>";
    return;
  }

  let resolvedRole = localStorage.getItem("userRole") || "";
  try {
    const profile = await appDb.ensureUserDocument(user);
    if (profile) {
      resolvedRole = profile.role || "customer";
      try { localStorage.setItem("userRole", resolvedRole); } catch (e) {}
    }
  } catch (error) {
    console.error("Failed to sync invoice user profile", error);
  }

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id");
  const orderUid = params.get("uid");

  if (!orderId) {
    setFeedback("error", "Missing order ID.");
    invoiceCard.innerHTML = "<p>Invalid invoice link.</p>";
    return;
  }

  const targetUid = orderUid || user.uid;
  if (resolvedRole !== "admin" && targetUid !== user.uid) {
    setFeedback("error", "You cannot open this invoice.");
    invoiceCard.innerHTML = "<p>Access denied for this invoice.</p>";
    return;
  }

  try {
    const order = await appDb.getOrderById(targetUid, orderId);
    if (!order) {
      setFeedback("error", "Order not found.");
      invoiceCard.innerHTML = "<p>Invoice data not found.</p>";
      return;
    }

    renderInvoice(order);
    setFeedback("", "");
  } catch (error) {
    console.error("Failed to load invoice", error);
    setFeedback("error", "Failed to load invoice.");
    invoiceCard.innerHTML = "<p>Could not load invoice right now.</p>";
  }
});
