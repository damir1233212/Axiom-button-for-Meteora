(() => {
  const STORAGE_KEY = "swapExtExternalLinksConfig";
  const MAX_SELECTED_LINKS = 6;
  const LINK_ITEMS = [
    { key: "jupiter", label: "Jupiter" },
    { key: "bananaGun", label: "Banana Gun" },
    { key: "fluxbot", label: "Fluxbot" },
    { key: "trojan", label: "Trojan" },
    { key: "maestro", label: "Maestro" },
    { key: "bonkbot", label: "BONKbot" },
    { key: "photon", label: "Photon" },
    { key: "axiom", label: "Axiom" },
    { key: "birdeye", label: "Birdeye" },
    { key: "geckoTerminal", label: "GeckoTerminal" },
    { key: "dexScreener", label: "DEXScreener" },
    { key: "dexTools", label: "DEXTools" },
    { key: "gmgn", label: "GMGN" }
  ];
  const DEFAULT_CONFIG = {
    enabled: true,
    links: {
      jupiter: true,
      bananaGun: false,
      fluxbot: false,
      trojan: false,
      maestro: false,
      bonkbot: false,
      photon: true,
      axiom: true,
      birdeye: true,
      geckoTerminal: true,
      dexScreener: true,
      dexTools: false,
      gmgn: true
    }
  };

  function openUrl(url) {
    if (!url) return;
    chrome.tabs.create({ url, active: true }, () => {
      window.close();
    });
  }

  function normalizeConfig(raw) {
    const normalized = {
      enabled: DEFAULT_CONFIG.enabled,
      links: { ...DEFAULT_CONFIG.links }
    };
    if (!raw || typeof raw !== "object") return normalized;
    if (typeof raw.enabled === "boolean") normalized.enabled = raw.enabled;
    if (raw.links && typeof raw.links === "object") {
      for (const item of LINK_ITEMS) {
        if (typeof raw.links[item.key] === "boolean") {
          normalized.links[item.key] = raw.links[item.key];
        }
      }
    }
    let selected = 0;
    for (const item of LINK_ITEMS) {
      if (!normalized.links[item.key]) continue;
      selected += 1;
      if (selected > MAX_SELECTED_LINKS) {
        normalized.links[item.key] = false;
      }
    }
    return normalized;
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }
        resolve(result ? result[key] : undefined);
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set(values, () => {
        resolve();
      });
    });
  }

  async function loadConfig() {
    const stored = await storageGet(STORAGE_KEY);
    return normalizeConfig(stored);
  }

  async function saveConfig(config) {
    await storageSet({ [STORAGE_KEY]: config });
    notifyMeteoraTabs(config);
  }

  function notifyMeteoraTabs(config) {
    if (!chrome.tabs || !chrome.tabs.query || !chrome.tabs.sendMessage) return;
    chrome.tabs.query({ url: ["https://app.meteora.ag/*", "https://www.meteora.ag/*"] }, (tabs) => {
      if (!Array.isArray(tabs)) return;
      for (const tab of tabs) {
        if (!tab || typeof tab.id !== "number") continue;
        chrome.tabs.sendMessage(tab.id, { type: "swap-ext:external-links-updated", payload: config }, () => {
          // Prevent unchecked runtime.lastError when no content script is attached yet.
          void chrome.runtime.lastError;
        });
      }
    });
  }

  function renderSettings(config) {
    const linksWrap = document.getElementById("settings-links");
    const enabledInput = document.getElementById("dup-enabled");
    if (!(linksWrap instanceof HTMLElement) || !(enabledInput instanceof HTMLInputElement)) return;

    enabledInput.checked = !!config.enabled;
    linksWrap.textContent = "";

    for (const item of LINK_ITEMS) {
      const row = document.createElement("label");
      row.className = "setting-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!config.links[item.key];
      input.dataset.key = item.key;
      const text = document.createElement("span");
      text.textContent = item.label;
      row.append(input, text);
      linksWrap.appendChild(row);
    }
    applyLimitUi(config);
  }

  function getSelectedCount(config) {
    let count = 0;
    for (const item of LINK_ITEMS) {
      if (config.links[item.key]) count += 1;
    }
    return count;
  }

  function applyLimitUi(config) {
    const linksWrap = document.getElementById("settings-links");
    const limitEl = document.getElementById("settings-limit");
    if (!(linksWrap instanceof HTMLElement)) return;
    const selectedCount = getSelectedCount(config);
    if (limitEl instanceof HTMLElement) {
      limitEl.textContent = "Selected " + selectedCount + "/" + MAX_SELECTED_LINKS;
    }
    const atLimit = selectedCount >= MAX_SELECTED_LINKS;
    const inputs = Array.from(linksWrap.querySelectorAll("input[type='checkbox'][data-key]"));
    for (const input of inputs) {
      if (!(input instanceof HTMLInputElement)) continue;
      input.disabled = atLimit && !input.checked;
    }
  }

  function collectConfigFromUi() {
    const enabledInput = document.getElementById("dup-enabled");
    const linksWrap = document.getElementById("settings-links");
    const next = {
      enabled: enabledInput instanceof HTMLInputElement ? enabledInput.checked : DEFAULT_CONFIG.enabled,
      links: { ...DEFAULT_CONFIG.links }
    };
    if (linksWrap instanceof HTMLElement) {
      const inputs = Array.from(linksWrap.querySelectorAll("input[type='checkbox'][data-key]"));
      for (const input of inputs) {
        if (!(input instanceof HTMLInputElement)) continue;
        const key = input.dataset.key;
        if (!key || !(key in next.links)) continue;
        next.links[key] = input.checked;
      }
    }
    return next;
  }

  const buttons = Array.from(document.querySelectorAll("[data-url]"));
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const url = button.getAttribute("data-url");
      openUrl(url);
    });
  }

  const settingsPanel = document.getElementById("settings-panel");
  const settingsToggle = document.getElementById("settings-toggle");
  if (settingsPanel instanceof HTMLElement && settingsToggle instanceof HTMLButtonElement) {
    settingsToggle.addEventListener("click", () => {
      settingsPanel.classList.toggle("hidden");
    });
  }

  loadConfig().then((config) => {
    renderSettings(config);

    const enabledInput = document.getElementById("dup-enabled");
    const linksWrap = document.getElementById("settings-links");
    if (enabledInput instanceof HTMLInputElement) {
      enabledInput.addEventListener("change", () => {
        const next = normalizeConfig(collectConfigFromUi());
        renderSettings(next);
        void saveConfig(next);
      });
    }
    if (linksWrap instanceof HTMLElement) {
      linksWrap.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const next = normalizeConfig(collectConfigFromUi());
        renderSettings(next);
        void saveConfig(next);
      });
    }
  });
})();
