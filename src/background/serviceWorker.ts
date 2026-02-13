const LOG_PREFIX = "[SWAP-EXT]";
const OPEN_AXIOM_POPUP = "swap-ext:open-axiom-popup";
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 720;
const AXIOM_WINDOW_ID_KEY = "axiomPopupWindowId";
let axiomPopupWindowId: number | null = null;

function isAxiomUrl(url?: string): boolean {
  return !!url && /^https:\/\/axiom\.trade\//.test(url);
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

function writeStoredWindowId(windowId: number | null): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [AXIOM_WINDOW_ID_KEY]: windowId }, () => resolve());
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
    writeStoredWindowId(null);
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as { type?: string; payload?: { url?: string; left?: number; top?: number } };
  if (msg?.type !== OPEN_AXIOM_POPUP) return;

  const url = msg.payload?.url;
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
        void writeStoredWindowId(createdWindow.id);
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
