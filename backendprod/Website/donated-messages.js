document.addEventListener("DOMContentLoaded", async () => {
  const donorPageBackBtn = document.getElementById("donorPageBackBtn");
  const donorWallFeedback = document.getElementById("donorWallFeedback");
  const donorMetricCount = document.getElementById("donorMetricCount");
  const donorMetricAmount = document.getElementById("donorMetricAmount");
  const donorMetricLatest = document.getElementById("donorMetricLatest");
  const donorFeedList = document.getElementById("donorFeedList");

  const appDb = window.appDb;

  if (!donorFeedList || !donorMetricCount || !donorMetricAmount || !donorMetricLatest) {
    console.error("donated-messages.js: required elements are missing");
    return;
  }

  function setFeedback(type, message) {
    if (!donorWallFeedback) return;
    donorWallFeedback.classList.remove("is-error", "is-success", "is-info");

    if (!message) {
      donorWallFeedback.textContent = "";
      donorWallFeedback.classList.add("hidden");
      return;
    }

    donorWallFeedback.textContent = message;
    donorWallFeedback.classList.add(`is-${type || "info"}`);
    donorWallFeedback.classList.remove("hidden");
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
    const raw = Number(value);
    const safe = Number.isFinite(raw) ? raw : 0;
    return `${String(currency || "PHP").toUpperCase()} ${safe.toFixed(2)}`;
  }

  function formatDateTime(value) {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  }

  function renderDonations(donations) {
    const list = Array.isArray(donations) ? donations : [];
    const totalAmount = list.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const latestDonor = list.length ? (list[0].donorDisplayName || "Anonymous") : "N/A";

    donorMetricCount.textContent = String(list.length);
    donorMetricAmount.textContent = formatMoney(totalAmount, list[0]?.currency || "PHP");
    donorMetricLatest.textContent = latestDonor;

    if (!list.length) {
      donorFeedList.innerHTML = `
        <div class="comments-state is-info">
          No donations yet. Be the first donor.
        </div>
      `;
      return;
    }

    donorFeedList.innerHTML = list
      .map((donation) => {
        const donorName = donation.donorDisplayName || "Anonymous";
        const message = escapeHtml(donation.message || "");
        const safeDate = escapeHtml(formatDateTime(donation.paidAt || donation.createdAt));
        const safeAmount = escapeHtml(formatMoney(donation.amount, donation.currency));
        return `
          <article class="donor-feed-item">
            <div class="donor-feed-head">
              <div class="donor-feed-name">${escapeHtml(donorName)}</div>
              <div class="donor-feed-amount">${safeAmount}</div>
            </div>
            <div class="donor-feed-date">${safeDate}</div>
            ${message ? `<p class="donor-feed-message">${message}</p>` : `<p class="donor-feed-message is-muted">No message provided.</p>`}
          </article>
        `;
      })
      .join("");
  }

  function renderLoadingSkeleton() {
    donorFeedList.innerHTML = Array.from({ length: 3 }).map(() => `
      <div class="skeleton-row">
        <div class="skeleton-line w-40"></div>
        <div class="skeleton-line w-80"></div>
        <div class="skeleton-line w-55"></div>
      </div>
    `).join("");
  }

  if (donorPageBackBtn) {
    donorPageBackBtn.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = "donate.html";
    });
  }

  if (!appDb || !appDb.isConfigured() || typeof appDb.watchRecentDonations !== "function") {
    setFeedback("error", "Donation wall service is unavailable.");
    donorFeedList.innerHTML = "<p>Failed to load donor messages.</p>";
    return;
  }

  renderLoadingSkeleton();
  setFeedback("info", "Loading recent donations...");

  const unsubscribe = appDb.watchRecentDonations(
    (donations) => {
      renderDonations(donations || []);
      setFeedback("", "");
    },
    (error) => {
      console.error("Failed to load donation wall", error);
      setFeedback("error", "Failed to load donor messages.");
      donorFeedList.innerHTML = "<p>Could not load donor messages right now.</p>";
    },
    80
  );

  window.addEventListener("beforeunload", () => {
    try {
      unsubscribe();
    } catch {}
  }, { once: true });
});
