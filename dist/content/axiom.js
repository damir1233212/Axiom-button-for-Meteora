(() => {
  const LOG_PREFIX = "[SWAP-EXT]";
  const URL_SIGNAL_KEYS = ["swapExtSide", "side", "action", "mode", "tab", "trade"];
  const RUN_AUTO_SELL_ALL = "swap-ext:run-auto-sell-all";
  const AXIOM_AUTO_SELL_REQUEST_KEY = "swapExtAxiomAutoSellRequest";
  const AXIOM_AUTO_SELL_REQUEST_TTL_MS = 2 * 60 * 1000;
  const MAX_ATTEMPTS = 40;
  const ATTEMPT_INTERVAL_MS = 350;
  const QUICK_AUTO_SELL_MAX_ATTEMPTS = 240;
  const QUICK_AUTO_SELL_INTERVAL_MS = 750;
  const AUTO_SELL_COOLDOWN_MS = 9000;
  let quickAutoSellRunning = false;
  let lastQuickAutoSellAt = 0;

  function wantsSell() {
    const url = new URL(window.location.href);
    for (const key of URL_SIGNAL_KEYS) {
      const value = (url.searchParams.get(key) || "").trim().toLowerCase();
      if (value === "sell") return true;
    }
    if (url.hash.toLowerCase() === "#sell") return true;
    return false;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function findSellControl() {
    const classBasedCandidates = Array.from(
      document.querySelectorAll("div.group.flex.h-\\[26px\\].rounded-full.px-\\[12px\\], div.group.rounded-full")
    );
    for (const node of classBasedCandidates) {
      if (!(node instanceof HTMLElement)) continue;
      const label = (node.textContent || "").trim().toLowerCase();
      if (label !== "sell") continue;
      if (isVisible(node)) return node;
    }

    const candidates = Array.from(document.querySelectorAll("button, [role='button'], [role='tab'], div, span, a"));
    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) continue;
      const text = (node.textContent || "").trim().toLowerCase();
      if (text !== "sell") continue;
      const clickable = node.closest("button, [role='button'], [role='tab'], a, div.group, div.rounded-full");
      const target = clickable instanceof HTMLElement ? clickable : node;
      if (isVisible(target)) return target;
    }
    return null;
  }

  function clickSellControl(el) {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  function findSellMaxControl() {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const node of buttons) {
      if (!(node instanceof HTMLElement)) continue;
      const label = (node.textContent || "").replace(/\s+/g, "").toLowerCase();
      if (label !== "100%") continue;
      if (!isVisible(node)) continue;
      if (!/decrease/i.test(node.className)) continue;
      return node;
    }

    for (const node of buttons) {
      if (!(node instanceof HTMLElement)) continue;
      const label = (node.textContent || "").replace(/\s+/g, "").toLowerCase();
      if (label !== "100%") continue;
      if (!isVisible(node)) continue;
      return node;
    }
    return null;
  }

  function clickAnyControl(el) {
    if (typeof el.click === "function") {
      el.click();
    }
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  function isControlDisabled(el) {
    const button = el;
    const ariaDisabled = (el.getAttribute("aria-disabled") || "").toLowerCase() === "true";
    return !!button.disabled || ariaDisabled;
  }

  function parseAmount(value) {
    const normalized = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : 0;
  }

  function hasPositiveSellAmount() {
    const inputs = Array.from(document.querySelectorAll("input[type='text'], input[inputmode='decimal']"));
    for (const input of inputs) {
      if (!(input instanceof HTMLInputElement)) continue;
      const amount = parseAmount(input.value || "");
      if (amount > 0) return true;
    }
    return false;
  }

  function hasZeroTokensMessage() {
    const text = (document.body && document.body.innerText || "").toLowerCase();
    return text.includes("transaction failed to send: you have 0 tokens");
  }

  function hasTransactionConfirmedMessage() {
    const text = (document.body && document.body.innerText || "").toLowerCase();
    return text.includes("transaction confirmed!");
  }

  function findSellSubmitButton() {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const node of buttons) {
      if (!(node instanceof HTMLElement)) continue;
      if (!isVisible(node)) continue;
      if (isControlDisabled(node)) continue;
      const label = (node.textContent || "").trim().toLowerCase();
      if (label !== "sell") continue;
      const cls = node.className || "";
      if (/border-decrease\/50/.test(cls) || /text-decrease/.test(cls)) continue;
      return node;
    }
    return null;
  }

  function runAutoSellAllQuick(reason) {
    const now = Date.now();
    if (quickAutoSellRunning) {
      return;
    }
    if (now - lastQuickAutoSellAt < AUTO_SELL_COOLDOWN_MS) {
      return;
    }
    quickAutoSellRunning = true;
    lastQuickAutoSellAt = now;
    let attempts = 0;

    const finish = () => {
      quickAutoSellRunning = false;
      lastQuickAutoSellAt = Date.now();
    };

    const step = () => {
      attempts += 1;
      if (hasTransactionConfirmedMessage()) {
        finish();
        return;
      }
      if (hasZeroTokensMessage()) {
      }
      if (hasPositiveSellAmount()) {
      }

      const sell = findSellControl();
      if (sell) clickSellControl(sell);

      const maxBtn = findSellMaxControl();
      if (maxBtn && !isControlDisabled(maxBtn)) {
        clickAnyControl(maxBtn);
      }

      const submit = findSellSubmitButton();
      if (submit) {
        clickAnyControl(submit);
      }

      if (hasTransactionConfirmedMessage()) {
        finish();
        return;
      }
      if (attempts >= QUICK_AUTO_SELL_MAX_ATTEMPTS) {
        finish();
        return;
      }
      window.setTimeout(step, QUICK_AUTO_SELL_INTERVAL_MS);
    };

    window.setTimeout(step, 500);
  }

  function initSellAutoselect(shouldAutoSellMax) {
    const force = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    if (!force && !wantsSell()) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (shouldAutoSellMax && hasPositiveSellAmount()) {
        window.clearInterval(timer);
        observer.disconnect();
        return;
      }

        const sell = findSellControl();
      if (sell) {
        clickSellControl(sell);
        if (shouldAutoSellMax) runAutoSellAllQuick("route");
        if (!shouldAutoSellMax) {
          window.clearInterval(timer);
          observer.disconnect();
        }
        return;
      }

      if (attempts >= MAX_ATTEMPTS) {
        window.clearInterval(timer);
        observer.disconnect();
      }
    }, ATTEMPT_INTERVAL_MS);

    const observer = new MutationObserver(() => {
      const sell = findSellControl();
      if (!sell) return;
      clickSellControl(sell);
      if (shouldAutoSellMax) runAutoSellAllQuick("observer");
      if (!shouldAutoSellMax) {
        window.clearInterval(timer);
        observer.disconnect();
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function init() {
    initSellAutoselect(false);

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && chrome.runtime && chrome.runtime.id) {
      chrome.storage.local.get([AXIOM_AUTO_SELL_REQUEST_KEY], (result) => {
        if (chrome.runtime.lastError) return;
        const payload = result && result[AXIOM_AUTO_SELL_REQUEST_KEY];
        const ts = Number((payload && payload.ts) || 0);
        const isFresh = ts > 0 && Date.now() - ts <= AXIOM_AUTO_SELL_REQUEST_TTL_MS;
        if (!isFresh) return;
        chrome.storage.local.remove([AXIOM_AUTO_SELL_REQUEST_KEY], () => {
          runAutoSellAllQuick("storage");
        });
      });
    }

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || message.type !== RUN_AUTO_SELL_ALL) return;
        runAutoSellAllQuick("message");
        sendResponse && sendResponse({ ok: true });
        return true;
      });
    }
  }

  void init();
})();
