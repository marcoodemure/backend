(function () {
  const ICON_MARK = "data-ui-iconized";
  const ICON_SKIP = "data-ui-noicon";
  const ICON_BLOCK = "data-ui-icon-block";
  const HEADING_SELECTORS = [
    "h1",
    "h2",
    "h3",
    ".section-title",
    ".section-title-sm",
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
        align-items: center;
        gap: 0.45em;
        vertical-align: middle;
      }

      a.with-icon,
      button.with-icon,
      [role="button"].with-icon {
        display: inline-flex;
      }

      .with-icon-heading {
        display: inline-flex;
      }

      .with-icon[${ICON_BLOCK}="1"] {
        display: flex;
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
        margin-right: 0.42em;
      }

      a.with-icon > .ui-icon,
      button.with-icon > .ui-icon,
      [role="button"].with-icon > .ui-icon,
      a.with-icon > svg.lucide.ui-icon,
      button.with-icon > svg.lucide.ui-icon,
      [role="button"].with-icon > svg.lucide.ui-icon,
      .with-icon-heading > .ui-icon,
      .with-icon-heading > svg.lucide.ui-icon,
      .with-icon[${ICON_BLOCK}="1"] > .ui-icon,
      .with-icon[${ICON_BLOCK}="1"] > svg.lucide.ui-icon {
        margin-right: 0;
      }

      .with-icon[disabled] .ui-icon,
      .with-icon[aria-disabled="true"] .ui-icon {
        opacity: 0.8;
      }
    `;
    document.head.appendChild(style);
  }

  function getText(el) {
    return String(el?.getAttribute("aria-label") || el?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasIconAlready(el) {
    if (!el) return true;
    return Boolean(el.querySelector(":scope > [data-lucide], :scope > svg.lucide, :scope > .ui-icon"));
  }

  function getExplicitIconName(el) {
    const name = String(el?.getAttribute("data-ui-icon") || "").trim().toLowerCase();
    if (!name) return "";
    return name;
  }

  function hasCustomHeadingBadge(el) {
    return Boolean(el?.querySelector(":scope > .title-icon, :scope > .title-icon-sm"));
  }

  function shouldSkipAction(el, text) {
    if (!el) return true;
    if (el.hasAttribute(ICON_SKIP) || el.closest(`[${ICON_SKIP}]`)) return true;
    if (el.closest("#commentsStarPicker")) return true;
    if (el.closest(".qty-control")) return true;

    const id = String(el.id || "").toLowerCase();
    const normalizedText = String(text || "").toLowerCase();

    if (id === "plusbtn" || id === "minusbtn") return true;
    if (/^[+-]$/.test(normalizedText)) return true;
    if (/^\d+\s*stars?$/.test(normalizedText)) return true;
    if (normalizedText.length <= 2) return true;
    return false;
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
    if (value.includes("contact")) return "mail";
    if (value.includes("delivery")) return "truck";
    if (value.includes("address")) return "map-pinned";
    if (value.includes("shipping")) return "package-check";
    if (value.includes("payment") || value.includes("scan")) return "scan-line";
    if (value.includes("note")) return "notebook-pen";
    if (value.includes("summary")) return "chart-no-axes-column";
    if (value.includes("sign in") || value.includes("login")) return "log-in";
    if (value.includes("create account")) return "user-plus";
    return "";
  }

  function pickIconForAction(el) {
    if (!el) return "";

    const id = String(el.id || "").toLowerCase();
    const href = String(el.getAttribute("href") || "").toLowerCase();
    const className = String(el.className || "").toLowerCase();
    const text = getText(el).toLowerCase();

    if (shouldSkipAction(el, text)) return "";

    if (id.includes("logout") || text.includes("log out") || text.includes("sign out")) return "log-out";
    if (id.includes("signin") || href.includes("signin") || href.includes("login") || text.includes("sign in") || text === "login") return "log-in";
    if (href.includes("create-account") || text.includes("create account")) return "user-plus";
    if (href.includes("profile") || text === "profile") return "user-round";
    if (href.includes("orders") || text.includes("order history") || text === "orders") return "package";
    if (href.includes("cart") || text === "cart" || text.includes("add to cart")) return "shopping-cart";
    if (id.includes("pay") || className.includes("pay-btn") || text.includes("pay now")) return "credit-card";
    if (id.includes("checkout") || text.includes("checkout")) return "badge-check";
    if (id.includes("remove") || text.includes("remove") || className.includes("danger") || className.includes("cancelbtn")) return "trash-2";
    if (text.includes("cancel")) return "x-circle";
    if (text.includes("clear")) return "eraser";
    if (id.includes("save") || text === "save" || text.includes("save ")) return "save";
    if (id.includes("copy") || text.includes("copy")) return "copy";
    if (id.includes("open") || text.includes("open")) return "external-link";
    if (id.includes("export") || text.includes("export")) return "download";
    if (id.includes("import") || text.includes("import")) return "upload";
    if (text.includes("invoice")) return "receipt-text";
    if (text.includes("return")) return "rotate-ccw";
    if (text.includes("notification")) return "bell";
    if (text.includes("overview")) return "layout-dashboard";
    if (text.includes("products")) return "boxes";
    if (text.includes("returns")) return "rotate-ccw";
    if (text.includes("metrics")) return "bar-chart-3";
    if (text.includes("analytics")) return "line-chart";
    if (text.includes("audit")) return "clipboard-list";
    if (text.includes("admin")) return "shield-check";
    if (text.includes("mark all") && text.includes("read")) return "check-check";
    if (text.includes("home")) return "house";
    if (text.includes("advocacy")) return "megaphone";
    if (text.includes("souvenir")) return "gift";
    if (text.includes("shirt")) return "shirt";
    if (text.includes("accessories")) return "watch";
    if (text.includes("foods")) return "utensils-crossed";
    if (text.includes("bags")) return "briefcase";
    if (text.includes("stories")) return "book-open";
    if (text.includes("search")) return "search";
    if (text.includes("back")) return "arrow-left";
    if (text.includes("next") || text.includes("continue")) return "arrow-right";
    if (text.includes("locate")) return "map-pin";
    if (text.includes("current location")) return "locate-fixed";
    if (text.includes("confirm")) return "check-circle";
    if (text.includes("send")) return "send";
    return "";
  }

  function markBlockIfNeeded(el, iconName) {
    if (!el) return;
    const id = String(el.id || "").toLowerCase();
    const className = String(el.className || "").toLowerCase();
    if (
      id === "addtocartbtn"
      || className.includes("pay-btn")
      || className.includes("comments-send-btn")
      || className.includes("order-history-btn")
      || className.includes("cartbtn")
      || iconName === "send"
    ) {
      el.setAttribute(ICON_BLOCK, "1");
    }
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
    } else {
      markBlockIfNeeded(el, iconName);
    }
  }

  function applyHeadingIcons() {
    document.querySelectorAll(HEADING_SELECTORS).forEach((el) => {
      if (!el || el.hasAttribute(ICON_SKIP) || el.closest(`[${ICON_SKIP}]`)) return;
      if (hasCustomHeadingBadge(el)) return;
      const icon = getExplicitIconName(el) || pickIconForHeading(getText(el));
      if (!icon) return;
      prependIcon(el, icon, true);
    });
  }

  function applyActionIcons() {
    document.querySelectorAll("a, button, label.file-import-btn, [data-ui-icon]").forEach((el) => {
      const icon = getExplicitIconName(el) || pickIconForAction(el);
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
