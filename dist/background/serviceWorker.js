const LOG_PREFIX = "[SWAP-EXT]";
const OPEN_AXIOM_POPUP = "swap-ext:open-axiom-popup";
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 720;
let axiomPopupWindowId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const msg = message;
  if (!msg || msg.type !== OPEN_AXIOM_POPUP) return;

  const url = msg.payload && msg.payload.url;
  if (!url || !/^https:\/\/axiom\.trade\//.test(url)) {
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

  const focusExistingOrOpen = (left, top) => {
    if (axiomPopupWindowId == null) {
      openWindow(left, top);
      return;
    }

    chrome.windows.get(axiomPopupWindowId, { populate: true }, (existingWindow) => {
      if (chrome.runtime.lastError || !existingWindow || !existingWindow.id) {
        axiomPopupWindowId = null;
        openWindow(left, top);
        return;
      }

      const firstTab = existingWindow.tabs && existingWindow.tabs[0];
      if (firstTab && firstTab.id) {
        chrome.tabs.update(firstTab.id, { url }, () => {
          chrome.windows.update(existingWindow.id, { focused: true }, () => {
            if (chrome.runtime.lastError) {
              axiomPopupWindowId = null;
              openWindow(left, top);
              return;
            }
            console.debug(LOG_PREFIX, "Focused existing Axiom popup", {
              url,
              windowId: existingWindow.id
            });
            sendResponse({ ok: true });
          });
        });
        return;
      }

      chrome.windows.update(existingWindow.id, { focused: true }, () => {
        if (chrome.runtime.lastError) {
          axiomPopupWindowId = null;
          openWindow(left, top);
          return;
        }
        console.debug(LOG_PREFIX, "Focused existing Axiom popup (no tab update)", {
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
