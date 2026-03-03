(function () {
  const ICON_MARK = "data-ui-iconized";
  const ICON_SKIP = "data-ui-noicon";
  const HEADING_SELECTORS = [
    "h1",
    "h2",
    ".section-title",
    ".comments-list-title",
    ".comments-compose-title"
  ].join(", ");

  function injectIconStyles() {
    if (document.getElementById("uiIconsStyle")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "uiIconsStyle";
    style.textContent = `
      .with-icon {
        display: inline-flex;
        align-items: center;
        gap: 0.45em;
        vertical-align: middle;
      }
      .with-icon-heading {
        display: flex;
        align-items: center;
        gap: 0.45em;
      }
      .ui-icon,
      svg.lucide.ui-icon {
        width: 1.05em;
        height: 1.05em;
        flex: 0 0 auto;
        stroke-width: 2;
      }
      .with-icon > .ui-icon,
      .with-icon > svg.lucide.ui-icon {
        margin-top: -0.01em;
      }
      .with-icon[disabled] .ui-icon,
      .with-icon[aria-disabled="true"] .ui-icon {
        opacity: 0.8;
      }
    `;
    document.head.appendChild(style);
  }

  function getText(el) {
    return String(el?.getAttribute("aria-label") || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function pickIconForHeading(text) {
    const value = text.toLowerCase();
    if (value.includes("checkout")) return "shopping-bag";
    if (value.includes("cart")) return "shopping-cart";
    if (value.includes("order")) return "package";
    if (value.includes("admin")) return "layout-dashboard";
    if (value.includes("profile")) return "user-round";
    if (value.includes("comment")) return "messages-square";
    if (value.includes("invoice")) return "receipt-text";
    if (value.includes("sign in") || value.includes("login")) return "log-in";
    if (value.includes("create account")) return "user-plus";
    if (value.includes("payment") || value.includes("scan")) return "scan-line";
    return "";
  }

  function pickIconForAction(el) {
    if (!el) return "";
    if (el.hasAttribute(ICON_SKIP) || el.closest("[data-ui-noicon]")) return "";
    if (el.closest("#commentsStarPicker")) return "";

    const id = String(el.id || "").toLowerCase();
    const href = String(el.getAttribute("href") || "").toLowerCase();
    const className = String(el.className || "").toLowerCase();
    const text = getText(el).toLowerCase();

    if (id.includes("logout") || text.includes("log out") || text.includes("sign out")) return "log-out";
    if (id.includes("signin") || href.includes("signin") || href.includes("login") || text.includes("sign in") || text === "login") return "log-in";
    if (href.includes("create-account") || text.includes("create account")) return "user-plus";
    if (href.includes("profile") || text === "profile") return "user-round";
    if (href.includes("orders") || text.includes("order history") || text === "orders") return "package";
    if (href.includes("cart") || text === "cart" || text.includes("add to cart")) return "shopping-cart";
    if (id.includes("pay") || className.includes("pay-btn") || text.includes("pay now")) return "credit-card";
    if (id.includes("checkout") || text.includes("checkout")) return "badge-check";
    if (id.includes("remove") || text.includes("remove") || className.includes("danger") || className.includes("cancelbtn")) return "trash-2";
    if (id.includes("save") || text === "save" || text.includes("save ")) return "save";
    if (id.includes("copy") || text.includes("copy")) return "copy";
    if (id.includes("open") || text.includes("open")) return "external-link";
    if (id.includes("export") || text.includes("export")) return "download";
    if (id.includes("import") || text.includes("import")) return "upload";
    if (text.includes("invoice")) return "receipt-text";
    if (text.includes("return")) return "rotate-ccw";
    if (text.includes("notification")) return "bell";
    if (text.includes("admin")) return "shield-check";
    return "";
  }

  function hasIconAlready(el) {
    if (!el) return true;
    return Boolean(el.querySelector(":scope > [data-lucide], :scope > svg.lucide"));
  }

  function prependIcon(el, iconName, isHeading) {
    if (!el || !iconName || hasIconAlready(el)) return;

    const iconNode = document.createElement("i");
    iconNode.setAttribute("data-lucide", iconName);
    iconNode.className = "ui-icon";
    iconNode.setAttribute("aria-hidden", "true");
    iconNode.setAttribute(ICON_MARK, "1");

    el.prepend(iconNode);
    el.classList.add("with-icon");
    if (isHeading) {
      el.classList.add("with-icon-heading");
    }
  }

  function applyHeadingIcons() {
    document.querySelectorAll(HEADING_SELECTORS).forEach((el) => {
      if (!el || el.hasAttribute(ICON_SKIP) || el.closest("[data-ui-noicon]")) return;
      const icon = pickIconForHeading(getText(el));
      if (!icon) return;
      prependIcon(el, icon, true);
    });
  }

  function applyActionIcons() {
    document.querySelectorAll("a, button").forEach((el) => {
      const icon = pickIconForAction(el);
      if (!icon) return;
      prependIcon(el, icon, false);
    });
  }

  function renderLucide() {
    if (!window.lucide || typeof window.lucide.createIcons !== "function") {
      return;
    }
    window.lucide.createIcons({
      attrs: {
        class: "ui-icon"
      }
    });
  }

  let runTimer = null;
  function scheduleApply(delayMs) {
    if (runTimer) {
      clearTimeout(runTimer);
    }
    runTimer = setTimeout(() => {
      runTimer = null;
      applyIconsNow();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function applyIconsNow() {
    injectIconStyles();
    applyHeadingIcons();
    applyActionIcons();
    renderLucide();
  }

  function initObserver() {
    if (!document.body || typeof MutationObserver !== "function") {
      return;
    }

    const observer = new MutationObserver(() => {
      scheduleApply(100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener("beforeunload", () => {
      observer.disconnect();
    }, { once: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyIconsNow();
    scheduleApply(450);
    scheduleApply(1600);
    initObserver();
  });
})();
