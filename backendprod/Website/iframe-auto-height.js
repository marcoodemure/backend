/* iframe-auto-height.js
   Enables automatic iframe height sync:
   1) Child page -> posts its content height to parent.
   2) Parent page -> listens and resizes matching iframe element.
*/
(function () {
  "use strict";

  const MESSAGE_TYPE = "iframe:auto-height";
  const MIN_HEIGHT = 120;
  const POLL_MS = 1200;

  let lastHeight = 0;
  let rafId = 0;
  let pollId = 0;
  let resizeObserver = null;
  let mutationObserver = null;
  const frameToken = Math.random().toString(36).slice(2);

  function toHeight(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.max(MIN_HEIGHT, Math.ceil(num));
  }

  function getDocumentHeight() {
    const body = document.body;
    const doc = document.documentElement;
    if (!body || !doc) return 0;
    return Math.max(
      body.scrollHeight,
      body.offsetHeight,
      body.clientHeight,
      doc.scrollHeight,
      doc.offsetHeight,
      doc.clientHeight
    );
  }

  function postHeight(force) {
    if (window.parent === window) return;
    const nextHeight = toHeight(getDocumentHeight());
    if (!nextHeight) return;
    if (!force && nextHeight === lastHeight) return;

    lastHeight = nextHeight;

    const payload = {
      type: MESSAGE_TYPE,
      height: nextHeight,
      path: window.location.pathname,
      token: frameToken
    };

    try {
      window.parent.postMessage(payload, "*");
    } catch {}

    // Compatibility with simple parent listeners that expect a number.
    try {
      window.parent.postMessage(nextHeight, "*");
    } catch {}
  }

  function schedulePost() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(function () {
      rafId = 0;
      postHeight(false);
    });
  }

  function observeChildChanges() {
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(schedulePost);
      if (document.documentElement) resizeObserver.observe(document.documentElement);
      if (document.body) resizeObserver.observe(document.body);
    }

    if (window.MutationObserver) {
      mutationObserver = new MutationObserver(schedulePost);
      const target = document.documentElement || document.body;
      if (target) {
        mutationObserver.observe(target, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true
        });
      }
    }

    if (POLL_MS > 0) {
      pollId = window.setInterval(schedulePost, POLL_MS);
    }
  }

  function bindParentResizeListener() {
    window.addEventListener("message", function (event) {
      let height = 0;
      const data = event.data;

      if (typeof data === "number") {
        height = toHeight(data);
      } else if (typeof data === "string") {
        height = toHeight(data.trim());
      } else if (data && typeof data === "object" && data.type === MESSAGE_TYPE) {
        height = toHeight(data.height);
      }

      if (!height) return;

      const frames = document.querySelectorAll("iframe");
      for (let i = 0; i < frames.length; i += 1) {
        const frame = frames[i];
        if (frame && frame.contentWindow === event.source) {
          frame.style.height = height + "px";
          frame.style.minHeight = height + "px";
          frame.setAttribute("data-auto-height", "1");
          break;
        }
      }
    });
  }

  function initChildAutoHeight() {
    if (window.parent === window) return;

    postHeight(true);
    window.addEventListener("load", function () {
      postHeight(true);
    });
    window.addEventListener("resize", schedulePost);
    window.addEventListener("orientationchange", function () {
      window.setTimeout(function () {
        postHeight(true);
      }, 140);
    });
    document.addEventListener("DOMContentLoaded", function () {
      postHeight(true);
    });
    observeChildChanges();
  }

  function init() {
    bindParentResizeListener();
    initChildAutoHeight();
  }

  init();
})();
