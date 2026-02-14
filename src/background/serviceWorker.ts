const LOG_PREFIX = "[SWAP-EXT]";
const OPEN_AXIOM_POPUP = "swap-ext:open-axiom-popup";
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 720;
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

      let fallbackId: number | null = null;
      for (const w of windows) {
        const hasAxiomTab = (w.tabs || []).some((t) => isAxiomUrl(t.url));
        if (!hasAxiomTab || !w.id) continue;
        if (w.type === "popup") {
          resolve(w.id);
          return;
        }
        fallbackId = fallbackId ?? w.id;
      }

      resolve(fallbackId);
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
  const msg = message as { type?: string; payload?: { url?: string; left?: number; top?: number; poolAddress?: string } };
  if (msg?.type !== OPEN_AXIOM_POPUP) return;

  const url = msg.payload?.url;
  const requestedPoolAddress = msg.payload?.poolAddress || null;
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
        void writeStoredWindowId(null);
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
      const shouldUpdateUrl = !sameRequestedPool && (targetRouteKey !== currentRouteKey || shouldForceSellUpdate);

      if (currentTab?.id && shouldUpdateUrl) {
        chrome.tabs.update(currentTab.id, { url }, () => {
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
            axiomPopupPoolAddress = requestedPoolAddress;
            void writeStoredPoolAddress(requestedPoolAddress);
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
