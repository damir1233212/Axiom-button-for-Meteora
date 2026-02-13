const LOG_PREFIX = "[SWAP-EXT]";
const OPEN_AXIOM_POPUP = "swap-ext:open-axiom-popup";
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 720;
const AXIOM_WINDOW_ID_KEY = "axiomPopupWindowId";
let axiomPopupWindowId = null;

function isAxiomUrl(url) {
  return !!url && /^https:\/\/axiom\.trade\//.test(url);
}

function readStoredWindowId() {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get([AXIOM_WINDOW_ID_KEY], (result) => {
      const value = result && result[AXIOM_WINDOW_ID_KEY];
      resolve(typeof value === "number" ? value : null);
    });
  });
}

function writeStoredWindowId(windowId) {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [AXIOM_WINDOW_ID_KEY]: windowId }, () => resolve());
  });
}

function findExistingAxiomWindow() {
  return new Promise((resolve) => {
    chrome.windows.getAll({ populate: true }, (windows) => {
      if (chrome.runtime.lastError || !Array.isArray(windows)) {
        resolve(null);
        return;
      }

      let fallbackId = null;
      for (const w of windows) {
        const hasAxiomTab = (w.tabs || []).some((t) => isAxiomUrl(t.url));
        if (!hasAxiomTab || !w.id) continue;
        if (w.type === "popup") {
          resolve(w.id);
          return;
        }
        fallbackId = fallbackId || w.id;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const msg = message;
  if (!msg || msg.type !== OPEN_AXIOM_POPUP) return;

  const url = msg.payload && msg.payload.url;
  if (!isAxiomUrl(url)) {
    sendResponse({ ok: false, error: "Invalid or missing Axiom URL" });
    return;
  }

  const openWindow = (left, top) => {
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
        if (chrome.runtime.lastError || !createdWindow || !createdWindow.id) {
          sendResponse({
            ok: false,
            error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || "Popup window creation failed"
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

  const focusExistingOrOpen = async (left, top) => {
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
      if (chrome.runtime.lastError || !existingWindow || !existingWindow.id) {
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

  const hintedLeft = msg.payload && msg.payload.left;
  const hintedTop = msg.payload && msg.payload.top;
  if (typeof hintedLeft === "number" && typeof hintedTop === "number") {
    focusExistingOrOpen(Math.round(hintedLeft), Math.round(hintedTop));
    return true;
  }

  if (sender && sender.tab && typeof sender.tab.windowId === "number") {
    chrome.windows.get(sender.tab.windowId, {}, (currentWindow) => {
      if (chrome.runtime.lastError || !currentWindow || !currentWindow.width || !currentWindow.height) {
        openWindow(undefined, undefined);
        return;
      }

      const baseLeft = typeof currentWindow.left === "number" ? currentWindow.left : 0;
      const baseTop = typeof currentWindow.top === "number" ? currentWindow.top : 0;
      const centeredLeft = baseLeft + Math.max(0, Math.floor((currentWindow.width - POPUP_WIDTH) / 2));
      const centeredTop = baseTop + Math.max(0, Math.floor((currentWindow.height - POPUP_HEIGHT) / 2));

      focusExistingOrOpen(centeredLeft, centeredTop);
    });
  } else {
    focusExistingOrOpen(undefined, undefined);
  }

  return true;
});
