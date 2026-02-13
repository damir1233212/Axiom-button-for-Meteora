(() => {
  const LOG_PREFIX = "[SWAP-EXT]";
  const URL_SIGNAL_KEYS = ["swapExtSide", "side", "action", "mode", "tab", "trade"];
  const MAX_ATTEMPTS = 40;
  const ATTEMPT_INTERVAL_MS = 350;

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

  function initSellAutoselect() {
    if (!wantsSell()) return;

    console.debug(LOG_PREFIX, "Axiom sell autoselect active");

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const sell = findSellControl();
      if (sell) {
        clickSellControl(sell);
        console.debug(LOG_PREFIX, "Axiom Sell control clicked");
        window.clearInterval(timer);
        observer.disconnect();
        return;
      }

      if (attempts >= MAX_ATTEMPTS) {
        console.debug(LOG_PREFIX, "Axiom Sell control not found");
        window.clearInterval(timer);
        observer.disconnect();
      }
    }, ATTEMPT_INTERVAL_MS);

    const observer = new MutationObserver(() => {
      const sell = findSellControl();
      if (!sell) return;
      clickSellControl(sell);
      console.debug(LOG_PREFIX, "Axiom Sell control clicked (observer)");
      window.clearInterval(timer);
      observer.disconnect();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  initSellAutoselect();
})();
