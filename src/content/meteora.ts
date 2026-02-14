import { getPoolContext } from "../core/poolContext";
import { closeOverlay, openAxiomPopup } from "../ui/overlay";

const LOG_PREFIX = "[SWAP-EXT]";
const BTN_ID = "swap-ext-meteora-btn";
const EXIT_BTN_ID = "swap-ext-withdraw-axiom-btn";
const FLOAT_LEFT_PX = 24;
const FLOAT_BOTTOM_PX = 31;
const FLOAT_SIZE_PX = 42;
const BTN_GAP_PX = 15;
const REPOSITION_INTERVAL_MS = 1200;
const AXIOM_ICON_PATH = "icons/axiom-btn.png";
const UI_CONFIG_KEY = "swapExtUi";
const TRIGGER_AUTO_SELL_ALL = "swap-ext:trigger-auto-sell-all";
const WITHDRAW_WAIT_TIMEOUT_MS = 90_000;
const WITHDRAW_WAIT_POLL_MS = 750;
const POST_WITHDRAW_SETTLE_MS = 1_500;
const EXIT_SELL_RELAY_DURATION_MS = 2 * 60 * 1000;
const EXIT_SELL_RELAY_INTERVAL_MS = 2_000;
let LAST_POSITION_MODE: "fixed" | null = null;
let isPositionLocked = false;
let routeCheckTimer: number | null = null;
let lastSellWireAt = 0;
let exitSellRelayTimer: number | null = null;
let exitSellRelayStopAt = 0;
const ROUTE_CHECK_DEBOUNCE_MS = 400;
const SELL_WIRE_INTERVAL_MS = 5000;

type UiConfig = {
  sizePx: number;
  gapPx: number;
  offsetYPx: number;
  iconScale: number;
  matchJupSize: boolean;
  fallbackLeftPx: number;
  fallbackBottomPx: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getUiConfig(): UiConfig {
  const fallback: UiConfig = {
    sizePx: FLOAT_SIZE_PX,
    gapPx: BTN_GAP_PX,
    offsetYPx: 0,
    iconScale: 1,
    matchJupSize: true,
    fallbackLeftPx: FLOAT_LEFT_PX + FLOAT_SIZE_PX + BTN_GAP_PX,
    fallbackBottomPx: FLOAT_BOTTOM_PX
  };

  try {
    const raw = localStorage.getItem(UI_CONFIG_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UiConfig>;
    return {
      sizePx: clamp(Number(parsed.sizePx ?? fallback.sizePx), 24, 96),
      gapPx: clamp(Number(parsed.gapPx ?? fallback.gapPx), 0, 120),
      offsetYPx: clamp(Number(parsed.offsetYPx ?? fallback.offsetYPx), -100, 100),
      iconScale: clamp(Number(parsed.iconScale ?? fallback.iconScale), 0.4, 1),
      matchJupSize: typeof parsed.matchJupSize === "boolean" ? parsed.matchJupSize : fallback.matchJupSize,
      fallbackLeftPx: clamp(Number(parsed.fallbackLeftPx ?? fallback.fallbackLeftPx), 0, 1000),
      fallbackBottomPx: clamp(Number(parsed.fallbackBottomPx ?? fallback.fallbackBottomPx), 0, 1000)
    };
  } catch {
    return fallback;
  }
}

function getAxiomIconUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(AXIOM_ICON_PATH);
  }
  return AXIOM_ICON_PATH;
}

function isSupportedPoolUrl(url: URL): boolean {
  return /\/(dlmm|dammv2)\/[^/?#]+/i.test(url.pathname);
}

const SHADOW_RESCAN_MS = 5000;
const SHADOW_SCAN_MAX_NODES = 1200;
let shadowRootsCache: ShadowRoot[] = [];
let shadowRootsScannedAt = 0;

function refreshShadowRootsCacheIfNeeded(): void {
  const now = Date.now();
  if (now - shadowRootsScannedAt < SHADOW_RESCAN_MS) return;
  shadowRootsScannedAt = now;
  shadowRootsCache = [];

  const root = document.documentElement;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let scanned = 0;
  let node = walker.currentNode as Element | null;
  while (node && scanned < SHADOW_SCAN_MAX_NODES) {
    const shadow = (node as HTMLElement).shadowRoot;
    if (shadow) shadowRootsCache.push(shadow);
    scanned += 1;
    node = walker.nextNode() as Element | null;
  }
}

function findInAllRoots(selector: string): Element | null {
  const direct = document.querySelector(selector);
  if (direct) return direct;

  refreshShadowRootsCacheIfNeeded();
  for (const shadow of shadowRootsCache) {
    const found = shadow.querySelector(selector);
    if (found) return found;
  }

  return null;
}

function resolveAnchor(): HTMLElement | null {
  const selectors = [
    "main header",
    "main [role='tablist']",
    "main"
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) return el;
  }

  return document.body;
}

function findJupiterRoot(): HTMLElement | null {
  const branded =
    findInAllRoots("img[alt='Jupiter aggregator']") ||
    findInAllRoots("img[src*='jup.ag/svg/jupiter-logo.svg']") ||
    findInAllRoots("img[src*='jupiter-logo.svg']");
  if (branded instanceof HTMLElement) {
    const viaBrand = branded.closest("div.fixed.bottom-6.left-6");
    if (viaBrand instanceof HTMLElement) return viaBrand;
  }

  const fixedRoot = findInAllRoots("div.fixed.bottom-6.left-6");
  return fixedRoot instanceof HTMLElement ? fixedRoot : null;
}

function findJupiterPrimaryButton(): HTMLElement | null {
  const fixedRoot = findJupiterRoot();
  if (fixedRoot) {
    const primary =
      fixedRoot.querySelector(`:scope > div.h-14.w-14:not(#${BTN_ID})`) ||
      fixedRoot.querySelector(":scope > div.h-14.w-14") ||
      fixedRoot.firstElementChild ||
      fixedRoot;
    if (primary instanceof HTMLElement) {
      if (primary.id === BTN_ID) return null;
      const rect = primary.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return primary;
    }
  }

  return null;
}

function findJupiterButtonRect(): DOMRect | null {
  const primaryBtn = findJupiterPrimaryButton();
  if (primaryBtn) {
    const rect = primaryBtn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }

  // Do not use broad logo-based fallbacks here, they can match inner plugin elements
  // and produce inconsistent size/position across tabs.
  return null;
}

function applyFloatingButtonPosition(btn: HTMLButtonElement): void {
  if (isPositionLocked) return;
  const ui = getUiConfig();
  btn.style.visibility = "visible";
  if (btn.parentElement !== document.body) document.body.appendChild(btn);
  btn.style.position = "fixed";
  btn.style.width = `${ui.sizePx}px`;
  btn.style.height = `${ui.sizePx}px`;
  btn.style.left = `${ui.fallbackLeftPx}px`;
  btn.style.top = "auto";
  btn.style.bottom = `${Math.max(0, ui.fallbackBottomPx + ui.offsetYPx)}px`;
  if (LAST_POSITION_MODE !== "fixed") {
    console.debug(LOG_PREFIX, "Button fixed position", {
      left: btn.style.left,
      bottom: btn.style.bottom
    });
    LAST_POSITION_MODE = "fixed";
  }
  isPositionLocked = true;
}

function getAnchorRect(el: HTMLElement): { left: number; top: number; right: number; bottom: number } {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function getPreferredPopupAnchorRect(fallbackEl: HTMLElement): { left: number; top: number; right: number; bottom: number } {
  const floatingBtn = document.getElementById(BTN_ID);
  if (floatingBtn instanceof HTMLElement) {
    const rect = floatingBtn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return getAnchorRect(floatingBtn);
  }
  return getAnchorRect(fallbackEl);
}

function ensureSwapButton(): void {
  const existing = document.getElementById(BTN_ID);
  if (existing instanceof HTMLButtonElement) {
    applyFloatingButtonPosition(existing);
    return;
  }
  const anchor = resolveAnchor();
  if (!anchor) return;

  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.type = "button";
  btn.title = "Sell on Axiom";
  btn.setAttribute("aria-label", "Sell on Axiom");
  btn.style.cssText = [
    (() => {
      const ui = getUiConfig();
      return `width: ${ui.sizePx}px;height: ${ui.sizePx}px`;
    })(),
    "position: fixed",
    `left: ${FLOAT_LEFT_PX}px`,
    `bottom: ${FLOAT_BOTTOM_PX}px`,
    "z-index: 2147483646",
    "display: flex",
    "box-sizing: border-box",
    "padding: 0",
    "margin: 0",
    "line-height: 0",
    "appearance: none",
    "align-items: center",
    "justify-content: center",
    "overflow: hidden",
    "border-radius: 999px",
    "border: 0",
    "background: transparent",
    "box-shadow: none",
    "cursor: pointer"
  ].join(";");

  const img = document.createElement("img");
  img.src = getAxiomIconUrl();
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.display = "block";
  img.style.objectFit = "cover";
  img.style.borderRadius = "999px";
  img.alt = "Axiom";
  btn.appendChild(img);
  anchor.appendChild(btn);
  applyFloatingButtonPosition(btn);

  btn.onclick = async () => {
    const context = await getPoolContext();
    console.debug(LOG_PREFIX, "Pool context", context);
    await openAxiomPopup(context, { side: "sell", anchorRect: getAnchorRect(btn) });
  };

  console.debug(LOG_PREFIX, "Injected Swap button");
}

function findWithdrawCloseAllButton(): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll("button"));
  for (const btn of buttons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text === "withdraw & close all") return btn;
  }
  return null;
}

function clickElement(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function getButtonState(btn: HTMLButtonElement): { text: string; disabled: boolean; className: string } {
  return {
    text: (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase(),
    disabled: btn.disabled || (btn.getAttribute("aria-disabled") || "").toLowerCase() === "true",
    className: btn.className || ""
  };
}

function hasWithdrawStateChanged(
  baseline: { text: string; disabled: boolean; className: string },
  current: { text: string; disabled: boolean; className: string }
): boolean {
  if (current.disabled && !baseline.disabled) return true;
  if (current.text !== baseline.text) return true;
  if (current.className !== baseline.className) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function waitForWithdrawProgress(withdrawBtn: HTMLButtonElement): Promise<boolean> {
  const baseline = getButtonState(withdrawBtn);
  const startedAt = Date.now();

  while (Date.now() - startedAt < WITHDRAW_WAIT_TIMEOUT_MS) {
    const currentBtn = findWithdrawCloseAllButton();
    if (!currentBtn) return true;
    const current = getButtonState(currentBtn);
    if (hasWithdrawStateChanged(baseline, current)) return true;
    await sleep(WITHDRAW_WAIT_POLL_MS);
  }

  return false;
}

function stopExitSellRelay(): void {
  if (exitSellRelayTimer !== null) {
    window.clearTimeout(exitSellRelayTimer);
    exitSellRelayTimer = null;
  }
  exitSellRelayStopAt = 0;
}

function sendExitSellTrigger(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ type: TRIGGER_AUTO_SELL_ALL }, () => {
    // no-op
  });
}

function startExitSellRelay(): void {
  stopExitSellRelay();
  exitSellRelayStopAt = Date.now() + EXIT_SELL_RELAY_DURATION_MS;

  const tick = (): void => {
    if (Date.now() >= exitSellRelayStopAt) {
      stopExitSellRelay();
      return;
    }
    sendExitSellTrigger();
    exitSellRelayTimer = window.setTimeout(tick, EXIT_SELL_RELAY_INTERVAL_MS);
  };

  sendExitSellTrigger();
  exitSellRelayTimer = window.setTimeout(tick, EXIT_SELL_RELAY_INTERVAL_MS);
}

async function runWithdrawAndAxiomFlow(triggerBtn: HTMLButtonElement, withdrawBtn: HTMLButtonElement | null): Promise<void> {
  if (triggerBtn.dataset.swapExtBusy === "1") return;
  triggerBtn.dataset.swapExtBusy = "1";
  const previousText = triggerBtn.textContent || "Exit to Axiom";
  triggerBtn.textContent = "Processing...";
  triggerBtn.disabled = true;

  try {
    const context = await getPoolContext();
    console.debug(LOG_PREFIX, "Pool context (withdraw flow)", context);

    let withdrawProgressed = false;
    if (withdrawBtn) {
      clickElement(withdrawBtn);
      console.debug(LOG_PREFIX, "Triggered Withdraw & Close All");
      withdrawProgressed = await waitForWithdrawProgress(withdrawBtn);
      if (withdrawProgressed) {
        await sleep(POST_WITHDRAW_SETTLE_MS);
      } else {
        console.debug(LOG_PREFIX, "Withdraw confirmation wait timed out, continuing with sell relay");
      }
    } else {
      console.debug(LOG_PREFIX, "Withdraw button not found, running Axiom-only exit flow");
    }
    // Use exactly the same open path as the regular sell button.
    const mainBtn = document.getElementById(BTN_ID);
    if (mainBtn instanceof HTMLButtonElement && mainBtn !== triggerBtn) {
      mainBtn.click();
    } else {
      await openAxiomPopup(context, {
        side: "sell",
        anchorRect: getPreferredPopupAnchorRect(triggerBtn)
      });
    }
    startExitSellRelay();

  } catch (error) {
    console.debug(LOG_PREFIX, "Withdraw -> Axiom flow failed", error);
  } finally {
    window.setTimeout(() => {
      triggerBtn.disabled = false;
      triggerBtn.textContent = previousText;
      triggerBtn.dataset.swapExtBusy = "0";
    }, 1200);
  }
}

function applyExitButtonInlineStyle(btn: HTMLButtonElement, template: HTMLButtonElement): void {
  btn.className = template.className;
  btn.style.position = "";
  btn.style.left = "";
  btn.style.bottom = "";
  btn.style.zIndex = "";
  btn.style.height = "";
  btn.style.padding = "";
  btn.style.border = "";
  btn.style.borderRadius = "";
  btn.style.background = "";
  btn.style.color = "";
  btn.style.fontSize = "";
  btn.style.fontWeight = "";
  btn.style.cursor = "";
  btn.style.display = "";
  btn.style.alignItems = "";
  btn.style.justifyContent = "";
  btn.style.marginRight = "8px";
  btn.style.whiteSpace = "nowrap";
}

function ensureWithdrawAxiomButton(): void {
  const withdrawBtn = findWithdrawCloseAllButton();
  const existing = document.getElementById(EXIT_BTN_ID);
  if (!withdrawBtn) {
    if (existing) existing.remove();
    return;
  }
  const host = withdrawBtn.parentElement;
  if (!host) {
    if (existing) existing.remove();
    return;
  }

  if (existing instanceof HTMLButtonElement) {
    if (existing.parentElement !== host) {
      existing.remove();
      host.insertBefore(existing, withdrawBtn);
    }
    applyExitButtonInlineStyle(existing, withdrawBtn);
    existing.onclick = () => {
      void runWithdrawAndAxiomFlow(existing, withdrawBtn);
    };
    return;
  }

  const btn = document.createElement("button");
  btn.id = EXIT_BTN_ID;
  btn.type = "button";
  btn.textContent = "Exit to Axiom";
  btn.title = "Withdraw and prepare Sell 100% on Axiom";
  applyExitButtonInlineStyle(btn, withdrawBtn);
  host.insertBefore(btn, withdrawBtn);
  btn.onclick = () => {
    void runWithdrawAndAxiomFlow(btn, withdrawBtn);
  };
  console.debug(LOG_PREFIX, "Injected Withdraw + Axiom button");
}

async function openFromPageSellButton(sourceButton?: HTMLElement): Promise<void> {
  const context = await getPoolContext();
  console.debug(LOG_PREFIX, "Pool context (sell button)", context);
  if (sourceButton) {
    await openAxiomPopup(context, { side: "sell", anchorRect: getAnchorRect(sourceButton) });
    return;
  }
  await openAxiomPopup(context, { side: "sell" });
}

function wireNativeSellButtons(): void {
  const candidates = Array.from(document.querySelectorAll("button, div.rounded-full, [role='button']"));
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.dataset.swapExtSellHooked === "1") continue;

    const directLabel = (el.textContent || "").trim().toLowerCase();
    const spanLabel = (el.querySelector("span")?.textContent || "").trim().toLowerCase();
    const isSell = directLabel === "sell" || spanLabel === "sell";
    if (!isSell) continue;

    el.dataset.swapExtSellHooked = "1";
    el.addEventListener("click", () => {
      openFromPageSellButton(el).catch((error) => {
        console.debug(LOG_PREFIX, "Sell button hook failed", error);
      });
    });
    console.debug(LOG_PREFIX, "Hooked native Sell control");
  }
}

function cleanupForNonPoolPages(): void {
  const btn = document.getElementById(BTN_ID);
  if (btn) btn.remove();
  const exitBtn = document.getElementById(EXIT_BTN_ID);
  if (exitBtn) exitBtn.remove();
  isPositionLocked = false;
  closeOverlay();
}

function onRouteMaybeChanged(): void {
  const url = new URL(window.location.href);
  if (!isSupportedPoolUrl(url)) {
    cleanupForNonPoolPages();
    return;
  }
  ensureSwapButton();
  ensureWithdrawAxiomButton();
  // Disabled in test mode: native Sell hook causes duplicate popup opens/races.
}

function scheduleRouteCheck(): void {
  if (routeCheckTimer !== null) return;
  routeCheckTimer = window.setTimeout(() => {
    routeCheckTimer = null;
    onRouteMaybeChanged();
  }, ROUTE_CHECK_DEBOUNCE_MS);
}

function watchForAnchor(): void {
  const observer = new MutationObserver(() => {
    scheduleRouteCheck();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  scheduleRouteCheck();

  window.setInterval(() => {
    const el = document.getElementById(BTN_ID);
    if (el instanceof HTMLButtonElement) applyFloatingButtonPosition(el);
  }, REPOSITION_INTERVAL_MS);

  window.addEventListener("resize", () => {
    const el = document.getElementById(BTN_ID);
    if (el instanceof HTMLButtonElement) applyFloatingButtonPosition(el);
  });
}

function patchHistoryForSpaNavigation(): void {
  const push = history.pushState;
  const replace = history.replaceState;

  history.pushState = function (...args) {
    push.apply(this, args as never);
    window.dispatchEvent(new Event("swap-ext:urlchange"));
  };

  history.replaceState = function (...args) {
    replace.apply(this, args as never);
    window.dispatchEvent(new Event("swap-ext:urlchange"));
  };

  window.addEventListener("popstate", () => window.dispatchEvent(new Event("swap-ext:urlchange")));
  window.addEventListener("swap-ext:urlchange", scheduleRouteCheck);
}

function init(): void {
  console.debug(LOG_PREFIX, "Initializing Meteora injector");
  patchHistoryForSpaNavigation();
  watchForAnchor();
}

init();
