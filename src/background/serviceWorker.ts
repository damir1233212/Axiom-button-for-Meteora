const LOG_PREFIX = "[SWAP-EXT]";
const OPEN_AXIOM_POPUP = "swap-ext:open-axiom-popup";
const RUN_AUTO_SELL_ALL = "swap-ext:run-auto-sell-all";
const TRIGGER_AUTO_SELL_ALL = "swap-ext:trigger-auto-sell-all";
const AXIOM_AUTO_SELL_REQUEST_KEY = "swapExtAxiomAutoSellRequest";
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 720;
const AUTO_SELL_RETRIES = 12;
const AUTO_SELL_RETRY_MS = 500;
const AXIOM_WINDOW_ID_KEY = "axiomPopupWindowId";
const AXIOM_POOL_KEY = "axiomPopupPoolAddress";
let axiomPopupWindowId: number | null = null;
let axiomPopupPoolAddress: string | null = null;

function isAxiomUrl(url?: string): boolean {
  return !!url && /^https:\/\/axiom\.trade\//.test(url);
}

function getAxiomRouteKey(url?: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname !== "axiom.trade") return "";
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "meme" || parts[0] === "t")) {
      return `${parts[0]}/${parts[1]}`;
    }
    return u.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isSellUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const sellKeys = ["swapExtSide", "side", "action", "mode", "tab", "trade"];
    for (const key of sellKeys) {
      if ((u.searchParams.get(key) || "").toLowerCase() === "sell") return true;
    }
    return u.hash.toLowerCase() === "#sell";
  } catch {
    return false;
  }
}

function sendAutoSellAllToTab(tabId: number, attempt = 0): void {
  chrome.tabs.sendMessage(tabId, { type: RUN_AUTO_SELL_ALL }, () => {
    if (!chrome.runtime.lastError) {
      clearAutoSellAllRequest();
      return;
    }
    if (attempt >= AUTO_SELL_RETRIES) return;
    setTimeout(() => sendAutoSellAllToTab(tabId, attempt + 1), AUTO_SELL_RETRY_MS);
  });
}

function markAutoSellAllRequest(): void {
  if (!chrome.storage?.local) return;
  chrome.storage.local.set({
    [AXIOM_AUTO_SELL_REQUEST_KEY]: {
      ts: Date.now()
    }
  });
}

function clearAutoSellAllRequest(): void {
  if (!chrome.storage?.local) return;
  chrome.storage.local.remove([AXIOM_AUTO_SELL_REQUEST_KEY]);
}

function readAutoSellAllRequest(callback: (isFresh: boolean) => void): void {
  if (!chrome.storage?.local) {
    callback(false);
    return;
  }
  chrome.storage.local.get([AXIOM_AUTO_SELL_REQUEST_KEY], (result) => {
    if (chrome.runtime.lastError) {
      callback(false);
      return;
    }
    const payload = result?.[AXIOM_AUTO_SELL_REQUEST_KEY] as { ts?: number } | undefined;
    const ts = Number(payload?.ts || 0);
    callback(ts > 0 && Date.now() - ts <= 2 * 60 * 1000);
  });
}

function triggerAutoSellAll(windowId: number, tabId?: number): void {
  markAutoSellAllRequest();
  if (typeof tabId === "number") {
    sendAutoSellAllToTab(tabId);
    return;
  }
  chrome.tabs.query({ windowId }, (tabs) => {
    if (chrome.runtime.lastError || !Array.isArray(tabs)) return;
    const axiomTab = tabs.find((t) => isAxiomUrl(t.url) && typeof t.id === "number");
    if (!axiomTab?.id) return;
    sendAutoSellAllToTab(axiomTab.id);
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!isAxiomUrl(tab.url)) return;
  readAutoSellAllRequest((isFresh) => {
    if (!isFresh) return;
    sendAutoSellAllToTab(tabId);
  });
});

function readStoredWindowId(): Promise<number | null> {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get([AXIOM_WINDOW_ID_KEY], (result) => {
      const value = result?.[AXIOM_WINDOW_ID_KEY];
      resolve(typeof value === "number" ? value : null);
    });
  });
}

function readStoredPoolAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get([AXIOM_POOL_KEY], (result) => {
      const value = result?.[AXIOM_POOL_KEY];
      resolve(typeof value === "string" ? value : null);
    });
  });
}

function writeStoredWindowId(windowId: number | null): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [AXIOM_WINDOW_ID_KEY]: windowId }, () => resolve());
  });
}

function writeStoredPoolAddress(poolAddress: string | null): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [AXIOM_POOL_KEY]: poolAddress }, () => resolve());
  });
}

function findExistingAxiomWindow(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.windows.getAll({ populate: true }, (windows) => {
      if (chrome.runtime.lastError || !Array.isArray(windows)) {
        resolve(null);
        return;
      }

      for (const w of windows) {
        const hasAxiomTab = (w.tabs || []).some((t) => isAxiomUrl(t.url));
        if (!hasAxiomTab || !w.id) continue;
        if (w.type === "popup") {
          resolve(w.id);
          return;
        }
      }

      resolve(null);
    });
  });
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (axiomPopupWindowId === windowId) {
    axiomPopupWindowId = null;
    axiomPopupPoolAddress = null;
    writeStoredWindowId(null);
    writeStoredPoolAddress(null);
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as {
    type?: string;
    payload?: { url?: string; left?: number; top?: number; poolAddress?: string; autoSellAll?: boolean; forceReload?: boolean };
  };
  if (msg?.type === TRIGGER_AUTO_SELL_ALL) {
    const tryTrigger = async (): Promise<void> => {
      if (axiomPopupWindowId == null) {
        axiomPopupWindowId = await readStoredWindowId();
      }
      if (axiomPopupWindowId != null) {
        triggerAutoSellAll(axiomPopupWindowId);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: "Axiom popup not found" });
    };
    void tryTrigger();
    return true;
  }
  if (msg?.type !== OPEN_AXIOM_POPUP) return;

  const url = msg.payload?.url;
  const requestedPoolAddress = msg.payload?.poolAddress || null;
  const requestAutoSellAll = msg.payload?.autoSellAll === true;
  const forceReload = msg.payload?.forceReload === true;
  if (!requestAutoSellAll) {
    clearAutoSellAllRequest();
  }
  if (!isAxiomUrl(url)) {
    sendResponse({ ok: false, error: "Invalid or missing Axiom URL" });
    return;
  }

  const openWindow = (left?: number, top?: number): void => {
    chrome.windows.create(
      {
        url,
        type: "popup",
        width: POPUP_WIDTH,
        height: POPUP_HEIGHT,
        left,
        top
      },
      (createdWindow) => {
        if (chrome.runtime.lastError || !createdWindow?.id) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message || "Popup window creation failed"
          });
          return;
        }

        axiomPopupWindowId = createdWindow.id;
        axiomPopupPoolAddress = requestedPoolAddress;
        void writeStoredWindowId(createdWindow.id);
        void writeStoredPoolAddress(requestedPoolAddress);
        if (requestAutoSellAll) {
          triggerAutoSellAll(createdWindow.id);
        }
        console.debug(LOG_PREFIX, "Opened Axiom popup", {
          url,
          windowId: createdWindow.id,
          left: createdWindow.left,
          top: createdWindow.top
        });
        sendResponse({ ok: true });
      }
    );
  };

  const focusExistingOrOpen = async (left?: number, top?: number): Promise<void> => {
    if (axiomPopupWindowId == null) {
      axiomPopupWindowId = await readStoredWindowId();
    }
    if (axiomPopupPoolAddress == null) {
      axiomPopupPoolAddress = await readStoredPoolAddress();
    }

    if (axiomPopupWindowId == null) {
      axiomPopupWindowId = await findExistingAxiomWindow();
      if (axiomPopupWindowId != null) {
        void writeStoredWindowId(axiomPopupWindowId);
      }
    }

    if (axiomPopupWindowId == null) {
      openWindow(left, top);
      return;
    }

    chrome.windows.get(axiomPopupWindowId, { populate: true }, (existingWindow) => {
      if (chrome.runtime.lastError || !existingWindow?.id) {
        axiomPopupWindowId = null;
        axiomPopupPoolAddress = null;
        void writeStoredWindowId(null);
        void writeStoredPoolAddress(null);
        openWindow(left, top);
        return;
      }

      if (existingWindow.type !== "popup") {
        axiomPopupWindowId = null;
        axiomPopupPoolAddress = null;
        void writeStoredWindowId(null);
        void writeStoredPoolAddress(null);
        openWindow(left, top);
        return;
      }

      const hasAxiomTab = (existingWindow.tabs || []).some((t) => isAxiomUrl(t.url));
      if (!hasAxiomTab) {
        axiomPopupWindowId = null;
        axiomPopupPoolAddress = null;
        void writeStoredWindowId(null);
        void writeStoredPoolAddress(null);
        openWindow(left, top);
        return;
      }

      const currentTab = (existingWindow.tabs || []).find((t) => isAxiomUrl(t.url));
      const targetRouteKey = getAxiomRouteKey(url);
      const currentRouteKey = getAxiomRouteKey(currentTab?.url);
      const shouldForceSellUpdate = isSellUrl(url) && !isSellUrl(currentTab?.url);
      const sameRequestedPool = !!requestedPoolAddress && requestedPoolAddress === axiomPopupPoolAddress;
      const shouldUpdateUrl = forceReload || targetRouteKey !== currentRouteKey || shouldForceSellUpdate;

      if (currentTab?.id && shouldUpdateUrl) {
        chrome.tabs.update(currentTab.id, { url, active: true }, () => {
          if (chrome.runtime.lastError) {
            axiomPopupWindowId = null;
            void writeStoredWindowId(null);
            openWindow(left, top);
            return;
          }

          chrome.windows.update(existingWindow.id, { focused: true }, () => {
            if (chrome.runtime.lastError) {
              axiomPopupWindowId = null;
              void writeStoredWindowId(null);
              openWindow(left, top);
              return;
            }
            console.debug(LOG_PREFIX, "Focused existing Axiom popup (updated URL)", {
              windowId: existingWindow.id,
              url
            });
            if (!sameRequestedPool) {
              axiomPopupPoolAddress = requestedPoolAddress;
              void writeStoredPoolAddress(requestedPoolAddress);
            }
            if (requestAutoSellAll && currentTab.id) {
              triggerAutoSellAll(existingWindow.id, currentTab.id);
            }
            sendResponse({ ok: true });
          });
        });
        return;
      }

      if (currentTab?.id) {
        chrome.tabs.update(currentTab.id, { active: true }, () => {
          chrome.windows.update(existingWindow.id, { focused: true }, () => {
            if (chrome.runtime.lastError) {
              axiomPopupWindowId = null;
              void writeStoredWindowId(null);
              openWindow(left, top);
              return;
            }
            console.debug(LOG_PREFIX, "Focused existing Axiom popup (no reload)", {
              windowId: existingWindow.id
            });
            if (requestAutoSellAll && currentTab.id) {
              triggerAutoSellAll(existingWindow.id, currentTab.id);
            }
            sendResponse({ ok: true });
          });
        });
        return;
      }

      chrome.windows.update(existingWindow.id, { focused: true }, () => {
        if (chrome.runtime.lastError) {
          axiomPopupWindowId = null;
          void writeStoredWindowId(null);
          openWindow(left, top);
          return;
        }
        console.debug(LOG_PREFIX, "Focused existing Axiom popup (no reload)", {
          windowId: existingWindow.id
        });
        if (requestAutoSellAll) {
          triggerAutoSellAll(existingWindow.id);
        }
        sendResponse({ ok: true });
      });
    });
  };

  const hintedLeft = msg.payload?.left;
  const hintedTop = msg.payload?.top;
  if (typeof hintedLeft === "number" && typeof hintedTop === "number") {
    focusExistingOrOpen(Math.round(hintedLeft), Math.round(hintedTop));
    return true;
  }

  if (typeof sender?.tab?.windowId === "number") {
    chrome.windows.get(sender.tab.windowId, {}, (currentWindow) => {
      if (chrome.runtime.lastError || !currentWindow?.width || !currentWindow?.height) {
        openWindow();
        return;
      }

      const baseLeft = typeof currentWindow.left === "number" ? currentWindow.left : 0;
      const baseTop = typeof currentWindow.top === "number" ? currentWindow.top : 0;
      const centeredLeft = baseLeft + Math.max(0, Math.floor((currentWindow.width - POPUP_WIDTH) / 2));
      const centeredTop = baseTop + Math.max(0, Math.floor((currentWindow.height - POPUP_HEIGHT) / 2));

      focusExistingOrOpen(centeredLeft, centeredTop);
    });
  } else {
    focusExistingOrOpen();
  }

  return true;
});
