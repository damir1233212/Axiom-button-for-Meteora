(() => {
  const LOG_PREFIX = "[SWAP-EXT]";
  const BTN_ID = "swap-ext-meteora-btn";
  const EXIT_BTN_ID = "swap-ext-withdraw-axiom-btn";
  const ACTIONS_WRAP_ID = "swap-ext-actions-wrap";
  const MID_LINKS_WRAP_ID = "swap-ext-mid-links-wrap";
  const MID_LINKS_ROW_ID = "swap-ext-mid-links-row";
  const MID_LINKS_MORE_WRAP_ID = "swap-ext-mid-links-more-wrap";
  const MID_LINKS_MORE_BTN_ID = "swap-ext-mid-links-more-btn";
  const MID_LINKS_SETTINGS_BTN_ID = "swap-ext-mid-links-settings-btn";
  const MID_LINKS_SETTINGS_PANEL_ID = "swap-ext-mid-links-settings-panel";
  const MID_LINKS_MENU_ID = "swap-ext-mid-links-menu";
  const NEWPOS_BTN_ID = "swap-ext-newpos-axiom-btn";
  const MID_LINKS_PORTAL_MENU_ID = "swap-ext-mid-links-portal-menu";
  const MID_LINK_ANCHOR_CLASS = "inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-lg border border-v2-border-secondary bg-transparent hover:bg-v2-base-1 text-v2-text-primary transition-colors w-fit";
  const SAME_PAIR_WIDGET_ID = "swap-ext-same-pair-widget";
  const SAME_PAIR_HEADER_ID = "swap-ext-same-pair-header";
  const SAME_PAIR_BODY_ID = "swap-ext-same-pair-body";
  const SAME_PAIR_POLL_BASE_MS = 10_000;
  const SAME_PAIR_POLL_MAX_BACKOFF_MS = 120_000;
  const SAME_PAIR_MAX_ROWS = 5;
  const SAME_PAIR_TITLE = "Other Pools";
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const SOL_MINTS = new Set([
    "So11111111111111111111111111111111111111112",
    "11111111111111111111111111111111"
  ]);
  const DLMM_DATA_API_BASE_URL = "https://dlmm.datapi.meteora.ag";
  const DLMM_API_BASE_URL = "https://dlmm-api.meteora.ag";
  const SAME_PAIR_COMPACT_FMT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
  const ROOT_ID = "swap-ext-overlay-root";
  const FLOAT_LEFT_PX = 24;
  const FLOAT_BOTTOM_PX = 31;
  const FLOAT_SIZE_PX = 42;
  const BTN_GAP_PX = 15;
  const REPOSITION_INTERVAL_MS = 1200;
  const PANEL_GAP_PX = 15;
  const AXIOM_ICON_PATH = "icons/axiom-btn.png";
  const UI_CONFIG_KEY = "swapExtUi";
  const EXTERNAL_LINKS_SETTINGS_KEY = "swapExtExternalLinksConfig";
  const MAX_DUP_EXTERNAL_LINKS = 6;
  const TRIGGER_AUTO_SELL_ALL = "swap-ext:trigger-auto-sell-all";
  const WITHDRAW_WAIT_TIMEOUT_MS = 90_000;
  const WITHDRAW_WAIT_POLL_MS = 750;
  const POST_WITHDRAW_SETTLE_MS = 1_500;
  const CLOSE_ALL_SIGNAL_TIMEOUT_MS = 45_000;
  const CLOSE_ALL_SIGNAL_POLL_MS = 500;
  const EXIT_SELL_RELAY_DURATION_MS = 2 * 60 * 1000;
  const EXIT_SELL_RELAY_INTERVAL_MS = 2_000;
  const EXIT_SELL_MAX_6039_FAILURES = 3;
  const JUP_STABLE_REQUIRED_MS = 1200;
  const JUP_RECT_TOLERANCE_PX = 4;
  let LAST_POSITION_MODE = null;
  let isPositionLocked = false;
  let pendingAnchorRect = null;
  let pendingAnchorSince = 0;
  let routeCheckTimer = null;
  let lastSellWireAt = 0;
  let exitSellRelayTimer = null;
  let exitSellRelayStopAt = 0;
  let exitSell6039FailureCount = 0;
  let exitSellLast6039Signature = "";
  const ROUTE_CHECK_DEBOUNCE_MS = 400;
  const SELL_WIRE_INTERVAL_MS = 5000;
  const EXTERNAL_LINKS_SYNC_INTERVAL_MS = 1200;
  let lastExternalLinksConfigSignature = "";
  let isExternalLinksSyncBusy = false;
  let liveExternalLinksConfig = null;
  let midLinksLayoutRaf = null;
  let midLinksGlobalEventsBound = false;
  let midLinksLastHiddenCount = 0;
  let midLinksResizeObserver = null;
  let midLinksWatchdogTimer = null;
  let samePairPollTimer = null;
  let samePairPollInFlight = false;
  let samePairAbortController = null;
  let samePairConsecutiveErrors = 0;
  let samePairLastRenderedSignature = "";
  let samePairLastRouteKey = "";
  let samePairLastUpdatedAt = 0;
  let samePairSortState = { key: "volume5m", direction: "desc" };
  const cachedExternalLinksByLabel = new Map();
  let lastPreparedMidLinks = [];
  const EXTERNAL_LINK_ITEMS = [
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
  const DEFAULT_EXTERNAL_LINKS_CONFIG = {
    enabled: true,
    poolWidgetEnabled: true,
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getUiConfig() {
    const fallback = {
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
      const parsed = JSON.parse(raw);
      return {
        sizePx: clamp(Number((parsed && parsed.sizePx) || fallback.sizePx), 24, 96),
        gapPx: clamp(Number((parsed && parsed.gapPx) || fallback.gapPx), 0, 120),
        offsetYPx: clamp(Number((parsed && parsed.offsetYPx) || fallback.offsetYPx), -100, 100),
        iconScale: clamp(Number((parsed && parsed.iconScale) || fallback.iconScale), 0.4, 1),
        matchJupSize: typeof (parsed && parsed.matchJupSize) === "boolean" ? parsed.matchJupSize : fallback.matchJupSize,
        fallbackLeftPx: clamp(Number((parsed && parsed.fallbackLeftPx) || fallback.fallbackLeftPx), 0, 1000),
        fallbackBottomPx: clamp(Number((parsed && parsed.fallbackBottomPx) || fallback.fallbackBottomPx), 0, 1000)
      };
    } catch {
      return fallback;
    }
  }

  function getAxiomIconUrl() {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(AXIOM_ICON_PATH);
    }
    return AXIOM_ICON_PATH;
  }
  const BASE58_MINT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
  const CACHE_KEY = "poolContextCache";
  const CACHE_TTL_MS = 10 * 60 * 1000;

  const AXIOM_BASE_URL = "https://axiom.trade/meme/";
  const AXIOM_REF_SEGMENT = "@112233444";
  const DEXSCREENER_TOKEN_API = "https://api.dexscreener.com/latest/dex/tokens/";
  const GECKO_TERMINAL_TOKEN_POOLS_API = "https://api.geckoterminal.com/api/v2/networks/solana/tokens/";
  const PAIR_CACHE_KEY = "axiomPairCache";
  const PAIR_CACHE_TTL_MS = 2 * 60 * 1000;
  const AXIOM_PREFERRED_DEXES = new Set(["pumpswap", "raydium", "meteora", "orca", "pumpfun"]);

  function storageGet(key) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local || !chrome.runtime || !chrome.runtime.id) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            resolve(undefined);
            return;
          }
          resolve(result ? result[key] : undefined);
        });
      } catch (error) {
        resolve(undefined);
      }
    });
  }

  function storageSet(values) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local || !chrome.runtime || !chrome.runtime.id) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(values, () => {
          if (chrome.runtime.lastError) {
          }
          resolve();
        });
      } catch (error) {
        resolve();
      }
    });
  }

  function normalizeExternalLinksConfig(raw) {
    const normalized = {
      enabled: DEFAULT_EXTERNAL_LINKS_CONFIG.enabled,
      poolWidgetEnabled: DEFAULT_EXTERNAL_LINKS_CONFIG.poolWidgetEnabled,
      links: { ...DEFAULT_EXTERNAL_LINKS_CONFIG.links }
    };
    if (!raw || typeof raw !== "object") return normalized;
    if (typeof raw.enabled === "boolean") normalized.enabled = raw.enabled;
    if (typeof raw.poolWidgetEnabled === "boolean") normalized.poolWidgetEnabled = raw.poolWidgetEnabled;
    if (raw.links && typeof raw.links === "object") {
      for (const item of EXTERNAL_LINK_ITEMS) {
        if (typeof raw.links[item.key] === "boolean") {
          normalized.links[item.key] = raw.links[item.key];
        }
      }
    }
    let selected = 0;
    for (const item of EXTERNAL_LINK_ITEMS) {
      if (!normalized.links[item.key]) continue;
      selected += 1;
      if (selected > MAX_DUP_EXTERNAL_LINKS) {
        normalized.links[item.key] = false;
      }
    }
    return normalized;
  }

  async function readExternalLinksConfigFromStorage() {
    const raw = await storageGet(EXTERNAL_LINKS_SETTINGS_KEY);
    return normalizeExternalLinksConfig(raw);
  }

  async function getExternalLinksConfig() {
    if (liveExternalLinksConfig) return liveExternalLinksConfig;
    return readExternalLinksConfigFromStorage();
  }

  function chooseAxiomMint(context) {
    const stableLike = new Set(["SOL", "USDC", "USDT"]);
    const stableLikeMints = new Set([
      "So11111111111111111111111111111111111111112",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "Es9vMFrzaCERmJfrF4H2FYD8V4o5V8xYV7F6fM9wY7m"
    ]);
    const baseSym = String(context.baseSymbol || "").toUpperCase();
    const quoteSym = String(context.quoteSymbol || "").toUpperCase();
    const isAllowed = (mint) => !!mint && mint !== context.poolAddress;
    const isStableLike = (mint, sym) => {
      if (!mint) return stableLike.has(sym);
      return stableLike.has(sym) || stableLikeMints.has(mint);
    };

    if (isAllowed(context.baseMint) && !isStableLike(context.baseMint, baseSym)) return context.baseMint;
    if (isAllowed(context.quoteMint) && !isStableLike(context.quoteMint, quoteSym)) return context.quoteMint;
    if (isAllowed(context.baseMint)) return context.baseMint;
    if (isAllowed(context.quoteMint)) return context.quoteMint;
    return null;
  }

  function isBase58Address(value) {
    return !!value && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  }

  function getAxiomAddressMode() {
    try {
      const raw = (window.localStorage.getItem("swapExtAxiomAddressMode") || "pool").toLowerCase();
      if (raw === "pair" || raw === "mint" || raw === "pool" || raw === "auto") return raw;
    } catch {
      // ignore
    }
    return "pool";
  }

  function pairScore(pair) {
    const liquidity = Number((pair.liquidity && pair.liquidity.usd) || 0);
    const volume24h = Number((pair.volume && pair.volume.h24) || 0);
    // Primary sort key: liquidity. Volume is only a tie-breaker.
    return liquidity * 1000000 + volume24h;
  }

  function isLikelyPairAddress(value) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  }

  async function readPairCache(tokenMint) {
    const cache = await storageGet(PAIR_CACHE_KEY);
    const entry = cache && cache[tokenMint];
    if (!entry) return null;

    if (Date.now() - entry.ts > PAIR_CACHE_TTL_MS) {
      if (cache) {
        delete cache[tokenMint];
        await storageSet({ [PAIR_CACHE_KEY]: cache });
      }
      return null;
    }

    return entry.pairAddress;
  }

  async function writePairCache(tokenMint, pairAddress) {
    const cache = (await storageGet(PAIR_CACHE_KEY)) || {};
    cache[tokenMint] = { ts: Date.now(), pairAddress };
    await storageSet({ [PAIR_CACHE_KEY]: cache });
  }

  function matchesCounterMint(pair, tokenMint, counterMint) {
    const base = pair.baseToken && pair.baseToken.address;
    const quote = pair.quoteToken && pair.quoteToken.address;
    return (base === tokenMint && quote === counterMint) || (base === counterMint && quote === tokenMint);
  }

  async function resolveBestPairAddress(tokenMint, preferredCounterMint) {
    const cached = await readPairCache(tokenMint);
    if (cached) {
      return cached;
    }

    const tryDexScreener = async () => {
      const res = await fetch(`${DEXSCREENER_TOKEN_API}${tokenMint}`, { credentials: "omit" });
      if (!res.ok) return null;
      const data = await res.json();
      const pairs = Array.isArray(data.pairs) ? data.pairs : [];
      const solPairs = pairs.filter(
        (p) => p.chainId === "solana" && typeof p.pairAddress === "string" && isLikelyPairAddress(p.pairAddress)
      );
      if (!solPairs.length) return null;

      const filtered =
        preferredCounterMint && isLikelyPairAddress(preferredCounterMint)
          ? solPairs.filter((p) => matchesCounterMint(p, tokenMint, preferredCounterMint))
          : [];
      const candidatePairs = filtered.length ? filtered : solPairs;
      const best = candidatePairs.sort((a, b) => pairScore(b) - pairScore(a))[0];
      const bestAddress = best && best.pairAddress;
      if (!bestAddress) return null;

      (void 0) && console.debug(LOG_PREFIX, "Resolved best pair via DexScreener", {
        tokenMint,
        pairAddress: bestAddress,
        dexId: best.dexId,
        liquidityUsd: (best.liquidity && best.liquidity.usd) || 0
      });
      return bestAddress;
    };

    const tryGeckoTerminal = async () => {
      const res = await fetch(`${GECKO_TERMINAL_TOKEN_POOLS_API}${tokenMint}/pools`, { credentials: "omit" });
      if (!res.ok) return null;
      const data = await res.json();
      const pools = (data.data || []).filter(
        (pool) => typeof (pool.attributes && pool.attributes.address) === "string" && isLikelyPairAddress(pool.attributes.address)
      );
      if (!pools.length) return null;

      const toPair = (pool) => ({
        pairAddress: pool.attributes && pool.attributes.address,
        dexId: pool.attributes && pool.attributes.dex_id,
        liquidity: { usd: Number((pool.attributes && pool.attributes.reserve_in_usd) || 0) },
        volume: { h24: Number((pool.attributes && pool.attributes.volume_usd && pool.attributes.volume_usd.h24) || 0) },
        txns: {
          h24: {
            buys: (pool.attributes && pool.attributes.transactions && pool.attributes.transactions.h24 && pool.attributes.transactions.h24.buys) || 0,
            sells: (pool.attributes && pool.attributes.transactions && pool.attributes.transactions.h24 && pool.attributes.transactions.h24.sells) || 0
          }
        }
      });

      const best = pools.sort((a, b) => pairScore(toPair(b)) - pairScore(toPair(a)))[0];
      const bestAddress = best && best.attributes && best.attributes.address;
      if (!bestAddress) return null;

      (void 0) && console.debug(LOG_PREFIX, "Resolved best pair via GeckoTerminal", {
        tokenMint,
        pairAddress: bestAddress,
        dexId: best.attributes && best.attributes.dex_id,
        liquidityUsd: (best.attributes && best.attributes.reserve_in_usd) || 0
      });
      return bestAddress;
    };

    let bestAddress = null;

    try {
      bestAddress = await tryDexScreener();
    } catch (error) {
    }

    if (!bestAddress) {
      try {
        bestAddress = await tryGeckoTerminal();
      } catch (error) {
      }
    }

    if (!bestAddress) {
      return null;
    }

    await writePairCache(tokenMint, bestAddress);
    return bestAddress;
  }

  async function buildAxiomUrl(context) {
    const side = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "buy";
    const options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    const mint = chooseAxiomMint(context);
    if (!mint) {
      const fallbackResource =
        context.poolAddress && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(context.poolAddress) ? context.poolAddress : null;
      if (!fallbackResource) return "https://axiom.trade/?chain=sol";
      const fallbackUrl = new URL(`${AXIOM_BASE_URL}${fallbackResource}`);
      if (!options.autoSellAll) {
        fallbackUrl.pathname = `${fallbackUrl.pathname.replace(/\/$/, "")}/${AXIOM_REF_SEGMENT}`;
      }
      fallbackUrl.searchParams.set("chain", "sol");
      return fallbackUrl.toString();
    }

    const preferredCounterMint =
      context.baseMint === mint ? context.quoteMint : context.quoteMint === mint ? context.baseMint : null;
    const pairAddress = await resolveBestPairAddress(mint, preferredCounterMint);
    const poolAddress = isBase58Address(context.poolAddress) ? context.poolAddress : null;
    // Open the most liquid pair on Axiom; if Meteora pool is that pair, it is used naturally.
    const resource = pairAddress || poolAddress || mint;
    const url = new URL(`${AXIOM_BASE_URL}${resource}`);
    if (!options.autoSellAll) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/${AXIOM_REF_SEGMENT}`;
    }
    url.searchParams.set("chain", "sol");
    if (side === "sell") {
      // Keep sell routing minimal to avoid breaking Axiom page load.
      url.hash = "sell";
    }
    return url.toString();
  }

  function closeOverlay() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
  }

  function computePopupPosition(anchorRect) {
    const POPUP_W = 420;
    const POPUP_H = 720;
    const GAP = 16;

    const availLeft = typeof window.screen.availLeft === "number" ? window.screen.availLeft : window.screenX;
    const availTop = typeof window.screen.availTop === "number" ? window.screen.availTop : window.screenY;
    const availWidth = window.screen.availWidth;
    const availHeight = window.screen.availHeight;

    let left = Math.round(availLeft + GAP);
    let top = Math.round(availTop + availHeight - POPUP_H - GAP);
    if (left + POPUP_W > availLeft + availWidth) {
      left = Math.max(availLeft, availLeft + availWidth - POPUP_W - GAP);
    }
    if (top < availTop) top = availTop;
    return { left, top };
  }

  function showManualOpenButton(url, anchorRect) {
    closeOverlay();

    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.style.position = "fixed";
    const left = Math.round((anchorRect && anchorRect.left) || FLOAT_LEFT_PX);
    const bottom = Math.round(anchorRect ? window.innerHeight - anchorRect.top + PANEL_GAP_PX : FLOAT_BOTTOM_PX + FLOAT_SIZE_PX + PANEL_GAP_PX);
    host.style.left = `${left}px`;
    host.style.bottom = `${bottom}px`;
    host.style.zIndex = "2147483647";
    host.style.background = "#111";
    host.style.border = "1px solid #2d2d2d";
    host.style.borderRadius = "10px";
    host.style.padding = "10px";
    host.style.color = "#fff";
    host.style.width = "320px";
    host.style.maxWidth = "90vw";
    host.style.font = "12px/1.4 ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    const text = document.createElement("div");
    text.textContent = "Cannot open popup automatically. Open Axiom manually:";
    text.style.marginBottom = "8px";

    const btn = document.createElement("button");
    btn.textContent = "Open Axiom";
    btn.style.padding = "7px 10px";
    btn.style.border = "0";
    btn.style.borderRadius = "8px";
    btn.style.cursor = "pointer";
    btn.onclick = () => window.open(url, "_blank", "noopener,noreferrer");

    const close = document.createElement("button");
    close.textContent = "x";
    close.style.marginLeft = "8px";
    close.style.padding = "7px 10px";
    close.style.border = "0";
    close.style.borderRadius = "8px";
    close.style.cursor = "pointer";
    close.onclick = () => host.remove();

    host.append(text, btn, close);
    document.documentElement.appendChild(host);
  }

  async function openAxiomPopup(context) {
    const options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    const side = options.side || "buy";
    const url = await buildAxiomUrl(context, side, { autoSellAll: options.autoSellAll === true });
    const pos = computePopupPosition(options.anchorRect);

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
        {
          type: "swap-ext:open-axiom-popup",
          payload: {
            url,
            left: pos.left,
            top: pos.top,
            poolAddress: context.poolAddress || undefined,
            autoSellAll: options.autoSellAll === true,
            forceReload: options.autoSellAll === true
          }
        },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(res || { ok: false, error: "No response from service worker" });
          }
        );
      });

      if (response && response.ok) return;
      showManualOpenButton(url, options.anchorRect);
    } catch (error) {
      showManualOpenButton(url, options.anchorRect);
    }
  }

  function parsePoolAddressFromUrl(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    const poolIndex = parts.findIndex((p) => {
      const v = p.toLowerCase();
      return v === "dlmm" || v === "dammv2";
    });
    if (poolIndex === -1) return null;
    return parts[poolIndex + 1] || null;
  }

  function parseCluster(url) {
    const cluster = url.searchParams.get("cluster") || url.searchParams.get("network");
    return cluster || "mainnet-beta";
  }

  function readMint(obj, keys) {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string" && BASE58_MINT_RE.test(value)) return value;
    }
    return null;
  }

  function readSymbol(obj, keys) {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string" && value.length <= 16) return value;
    }
    return undefined;
  }

  async function tryApiStrategy(poolAddress) {
    const endpoint = `https://dlmm-api.meteora.ag/pair/${poolAddress}`;
    try {
      const res = await fetch(endpoint, { credentials: "omit" });
      if (!res.ok) return null;
      const json = await res.json();
      const payload = json && (json.data || json.pair || json);

      const baseMint = readMint(payload, ["mint_x", "token_x_mint", "tokenXMint", "baseMint"]);
      const quoteMint = readMint(payload, ["mint_y", "token_y_mint", "tokenYMint", "quoteMint"]);

      if (!baseMint || !quoteMint) return null;

      return {
        baseMint,
        quoteMint,
        baseSymbol: readSymbol(payload, ["name_x", "symbol_x", "tokenXSymbol", "baseSymbol"]),
        quoteSymbol: readSymbol(payload, ["name_y", "symbol_y", "tokenYSymbol", "quoteSymbol"])
      };
    } catch {
      return null;
    }
  }

  function findMintsInObject(root) {
    const queue = [root];

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object") continue;

      const obj = current;
      const baseMint = readMint(obj, ["mint_x", "token_x_mint", "tokenXMint", "baseMint", "token0Mint"]);
      const quoteMint = readMint(obj, ["mint_y", "token_y_mint", "tokenYMint", "quoteMint", "token1Mint"]);

      if (baseMint && quoteMint) return { baseMint, quoteMint };

      for (const value of Object.values(obj)) {
        if (value && typeof value === "object") queue.push(value);
      }
    }

    return null;
  }

  function tryNextDataStrategy() {
    const script = document.querySelector("script#__NEXT_DATA__");
    if (!script || !script.textContent) return null;

    try {
      const parsed = JSON.parse(script.textContent);
      const mints = findMintsInObject(parsed);
      if (!mints) return null;
      return { baseMint: mints.baseMint, quoteMint: mints.quoteMint };
    } catch {
      return null;
    }
  }

  function isMintCandidate(value, poolAddress) {
    return !!value && value !== poolAddress && BASE58_MINT_RE.test(value);
  }

  function tryDomStrategy(poolAddress) {
    const text = (document.body && document.body.innerText) || "";
    const candidates = text.match(new RegExp(BASE58_MINT_RE, "g")) || [];
    const unique = Array.from(new Set(candidates)).filter((candidate) => candidate !== poolAddress);
    if (unique.length < 2) return null;
    if (!isMintCandidate(unique[0], poolAddress) || !isMintCandidate(unique[1], poolAddress)) return null;

    return {
      baseMint: unique[0],
      quoteMint: unique[1]
    };
  }

  async function readPoolContextCache(poolAddress) {
    const store = (await storageGet(CACHE_KEY)) || {};
    const entry = store[poolAddress];
    if (!entry) return null;

    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      delete store[poolAddress];
      await storageSet({ [CACHE_KEY]: store });
      return null;
    }
    return entry.value;
  }

  async function writePoolContextCache(context) {
    if (!context.poolAddress || !context.baseMint || !context.quoteMint) return;
    const store = (await storageGet(CACHE_KEY)) || {};
    store[context.poolAddress] = {
      ts: Date.now(),
      value: context
    };
    await storageSet({ [CACHE_KEY]: store });
  }

  async function getPoolContext() {
    const url = new URL(window.location.href);
    const poolAddress = parsePoolAddressFromUrl(url);
    const cluster = parseCluster(url);

    if (!poolAddress) {
      return { poolAddress: null, baseMint: null, quoteMint: null, cluster };
    }

    const cached = await readPoolContextCache(poolAddress);
    if (cached) {
      return {
        ...cached,
        poolAddress,
        cluster
      };
    }

    const apiResult = await tryApiStrategy(poolAddress);
    if (apiResult && apiResult.baseMint && apiResult.quoteMint) {
      const context = { poolAddress, cluster, ...apiResult };
      await writePoolContextCache(context);
      return context;
    }

    const nextDataResult = tryNextDataStrategy();
    if (nextDataResult && nextDataResult.baseMint && nextDataResult.quoteMint) {
      const context = { poolAddress, cluster, ...nextDataResult };
      await writePoolContextCache(context);
      return context;
    }

    const domResult = tryDomStrategy(poolAddress);
    if (domResult && domResult.baseMint && domResult.quoteMint) {
      const context = { poolAddress, cluster, ...domResult };
      await writePoolContextCache(context);
      return context;
    }

    return { poolAddress, baseMint: null, quoteMint: null, cluster };
  }

  function isSupportedPoolUrl(url) {
    return /\/(dlmm|dammv2)\/[^/?#]+/i.test(url.pathname);
  }

  const SHADOW_RESCAN_MS = 5000;
  const SHADOW_SCAN_MAX_NODES = 1200;
  let shadowRootsCache = [];
  let shadowRootsScannedAt = 0;

  function refreshShadowRootsCacheIfNeeded() {
    const now = Date.now();
    if (now - shadowRootsScannedAt < SHADOW_RESCAN_MS) return;
    shadowRootsScannedAt = now;
    shadowRootsCache = [];

    const root = document.documentElement;
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let scanned = 0;
    let node = walker.currentNode;
    while (node && scanned < SHADOW_SCAN_MAX_NODES) {
      const shadow = node.shadowRoot;
      if (shadow) shadowRootsCache.push(shadow);
      scanned += 1;
      node = walker.nextNode();
    }
  }

  function findInAllRoots(selector) {
    const direct = document.querySelector(selector);
    if (direct) return direct;

    refreshShadowRootsCacheIfNeeded();
    for (const shadow of shadowRootsCache) {
      const found = shadow.querySelector(selector);
      if (found) return found;
    }

    return null;
  }

  function findAllInAllRoots(selector) {
    const found = [];
    found.push(...Array.from(document.querySelectorAll(selector)));

    refreshShadowRootsCacheIfNeeded();
    for (const shadow of shadowRootsCache) {
      found.push(...Array.from(shadow.querySelectorAll(selector)));
    }

    return found;
  }

  function queryButtonsInAllRoots() {
    const result = [];
    result.push(...Array.from(document.querySelectorAll("button")));
    refreshShadowRootsCacheIfNeeded();
    for (const shadow of shadowRootsCache) {
      result.push(...Array.from(shadow.querySelectorAll("button")));
    }
    return result;
  }

  function resolveAnchor() {
    const selectors = ["main header", "main [role='tablist']", "main"];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) return el;
    }
    return document.body;
  }

  function findJupiterRoot() {
    const branded =
      findInAllRoots("img[alt='Jupiter aggregator']") ||
      findInAllRoots("img[src*='jup.ag/svg/jupiter-logo.svg']") ||
      findInAllRoots("img[src*='jupiter-logo.svg']");
    if (branded instanceof HTMLElement) {
      const clickable = branded.closest("button,[role='button'],div.cursor-pointer,div.rounded-full");
      if (clickable instanceof HTMLElement) return clickable;
      const viaBrand = branded.closest("div.fixed.bottom-6.left-6");
      if (viaBrand instanceof HTMLElement) return viaBrand;
    }

    const fixedRoot = findInAllRoots("div.fixed.bottom-6.left-6");
    return fixedRoot instanceof HTMLElement ? fixedRoot : null;
  }

  function pickBestVisibleElement(candidates) {
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      // Prefer elements that sit lower and more to the left (Meteora floating launcher area).
      const score = rect.bottom * 10000 - rect.left;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function findJupiterPrimaryButton() {
    const exactCandidates = findAllInAllRoots(
      "div.h-14.w-14.rounded-full.bg-black.flex.items-center.justify-center.cursor-pointer"
    ).filter((el) => el.id !== BTN_ID);
    const exact = pickBestVisibleElement(exactCandidates);
    if (exact) return exact;

    const logoCandidates = findAllInAllRoots("img[alt='Jupiter aggregator'], img[src*='jup.ag/svg/jupiter-logo.svg'], img[src*='jupiter-logo.svg']")
      .map((el) => el.closest("button,[role='button'],div.cursor-pointer,div.rounded-full"))
      .filter((el) => el instanceof HTMLElement && el.id !== BTN_ID);
    const fromLogo = pickBestVisibleElement(logoCandidates);
    if (fromLogo) return fromLogo;

    const fixedRoot = findJupiterRoot();
    if (fixedRoot && fixedRoot.id !== BTN_ID) {
      const rect = fixedRoot.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return fixedRoot;
    }
    return null;
  }

  function findJupiterButtonRect() {
    const primaryBtn = findJupiterPrimaryButton();
    if (primaryBtn) {
      const rect = primaryBtn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return rect;
    }
    // Do not use broad logo-based fallbacks here, they can match inner plugin elements
    // and produce inconsistent size/position across tabs.
    return null;
  }

  function toSimpleRect(rect) {
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function isRectStableEnough(previous, current) {
    return (
      Math.abs(previous.left - current.left) <= JUP_RECT_TOLERANCE_PX &&
      Math.abs(previous.top - current.top) <= JUP_RECT_TOLERANCE_PX &&
      Math.abs(previous.width - current.width) <= JUP_RECT_TOLERANCE_PX &&
      Math.abs(previous.height - current.height) <= JUP_RECT_TOLERANCE_PX
    );
  }

  function applyFloatingButtonPosition(btn) {
    if (btn.dataset.swapExtInline === "1") return;
    if (isPositionLocked) return;
    const ui = getUiConfig();
    btn.style.visibility = "visible";
    if (btn.parentElement !== document.body) document.body.appendChild(btn);
    btn.style.position = "fixed";
    const jupRect = findJupiterButtonRect();
    if (jupRect && document.readyState === "complete") {
      const now = Date.now();
      const currentSimpleRect = toSimpleRect(jupRect);
      if (!pendingAnchorRect || !isRectStableEnough(pendingAnchorRect, currentSimpleRect)) {
        pendingAnchorRect = currentSimpleRect;
        pendingAnchorSince = now;
      }
      if (now - pendingAnchorSince < JUP_STABLE_REQUIRED_MS) {
        // Meteora/Jupiter UI still settling; keep temporary fixed position.
        pendingAnchorRect = currentSimpleRect;
        return;
      }
      const anchoredSize = ui.matchJupSize
        ? clamp(Math.round(Math.min(jupRect.width, jupRect.height) * ui.iconScale), 24, 96)
        : ui.sizePx;
      btn.style.width = `${anchoredSize}px`;
      btn.style.height = `${anchoredSize}px`;
      btn.style.left = `${Math.round(jupRect.right + ui.gapPx)}px`;
      btn.style.top = `${Math.round(jupRect.top + (jupRect.height - anchoredSize) / 2 + ui.offsetYPx)}px`;
      btn.style.bottom = "auto";
      if (LAST_POSITION_MODE !== "anchored") {
        (void 0) && console.debug(LOG_PREFIX, "Button anchored to Jupiter", {
          left: btn.style.left,
          top: btn.style.top,
          size: anchoredSize
        });
        LAST_POSITION_MODE = "anchored";
      }
      isPositionLocked = true;
      pendingAnchorRect = null;
      pendingAnchorSince = 0;
      return;
    }
    pendingAnchorRect = null;
    pendingAnchorSince = 0;

    btn.style.width = `${ui.sizePx}px`;
    btn.style.height = `${ui.sizePx}px`;
    btn.style.left = `${ui.fallbackLeftPx}px`;
    btn.style.top = "auto";
    btn.style.bottom = `${Math.max(0, ui.fallbackBottomPx + ui.offsetYPx)}px`;
    if (LAST_POSITION_MODE !== "fixed") {
      (void 0) && console.debug(LOG_PREFIX, "Button fixed position", {
        left: btn.style.left,
        bottom: btn.style.bottom
      });
      LAST_POSITION_MODE = "fixed";
    }
  }

  function getAnchorRect(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  function getPreferredPopupAnchorRect(fallbackEl) {
    const floatingBtn = document.getElementById(BTN_ID);
    if (floatingBtn instanceof HTMLElement) {
      const rect = floatingBtn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return getAnchorRect(floatingBtn);
    }
    return getAnchorRect(fallbackEl);
  }

  function ensureSwapButton() {
    const existing = document.getElementById(BTN_ID);
    if (existing instanceof HTMLButtonElement) {
      if (existing.dataset.swapExtInline !== "1") {
        applyFloatingButtonPosition(existing);
      }
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
      stopExitSellRelay();
      const context = await getPoolContext();
      await openAxiomPopup(context, { side: "sell", anchorRect: getAnchorRect(btn) });
    };
  }

  function findWithdrawCloseAllButton() {
    const buttons = queryButtonsInAllRoots();
    for (const btn of buttons) {
      if (!(btn instanceof HTMLButtonElement)) continue;
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text === "withdraw & close all" || text === "close all") return btn;
    }
    return null;
  }

  function findWithdrawButton() {
    const buttons = queryButtonsInAllRoots();
    for (const btn of buttons) {
      if (!(btn instanceof HTMLButtonElement)) continue;
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text.includes("withdraw")) return btn;
    }
    return null;
  }

  function findCreatePositionButton() {
    const buttons = queryButtonsInAllRoots();
    for (const btn of buttons) {
      if (!(btn instanceof HTMLButtonElement)) continue;
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text.includes("create position")) return btn;
    }
    return null;
  }

  function findNewPositionCreateButton() {
    const forms = findAllInAllRoots("form[data-sentry-component='NewPositionComponent']");
    for (const form of forms) {
      if (!(form instanceof HTMLElement)) continue;
      const buttons = Array.from(form.querySelectorAll("button"));
      for (const btn of buttons) {
        if (!(btn instanceof HTMLButtonElement)) continue;
        const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (text === "create position") return btn;
      }
    }
    return null;
  }

  function findClosedPositionsButton() {
    const buttons = queryButtonsInAllRoots();
    for (const btn of buttons) {
      if (!(btn instanceof HTMLButtonElement)) continue;
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text === "closed positions") return btn;
    }
    return null;
  }

  function findUiTemplateButton() {
    const all = queryButtonsInAllRoots();
    for (const btn of all) {
      if (!(btn instanceof HTMLButtonElement)) continue;
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text.includes("create position")) return btn;
    }
    for (const btn of all) {
      if (!(btn instanceof HTMLButtonElement)) continue;
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text.includes("withdraw")) return btn;
    }
    return all.find((btn) => btn instanceof HTMLButtonElement) || null;
  }

  function clickElement(el) {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  function getButtonState(btn) {
    return {
      text: (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase(),
      disabled: btn.disabled || (btn.getAttribute("aria-disabled") || "").toLowerCase() === "true",
      className: btn.className || ""
    };
  }

  function hasWithdrawStateChanged(baseline, current) {
    if (current.disabled && !baseline.disabled) return true;
    if (current.text !== baseline.text) return true;
    if (current.className !== baseline.className) return true;
    return false;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitForWithdrawProgress(withdrawBtn) {
    const baseline = getButtonState(withdrawBtn);
    const startedAt = Date.now();

    while (Date.now() - startedAt < WITHDRAW_WAIT_TIMEOUT_MS) {
      const currentBtn = findWithdrawButton();
      if (!currentBtn) return true;
      const current = getButtonState(currentBtn);
      if (hasWithdrawStateChanged(baseline, current)) return true;
      await sleep(WITHDRAW_WAIT_POLL_MS);
    }

    return false;
  }

  function hasCloseAllCompletionSignal() {
    const panel = document.querySelector("[data-sentry-component='TransactionNotification']");
    if (!(panel instanceof HTMLElement)) return false;
    const text = (panel.innerText || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) return false;
    return text.includes("jito bundles completed") || text.includes("liquidity removed");
  }

  function getTransactionNotificationTextAndSignature() {
    const panel = document.querySelector("[data-sentry-component='TransactionNotification']");
    if (!(panel instanceof HTMLElement)) return null;
    const text = (panel.innerText || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) return null;
    const signature = `${panel.childElementCount}:${text}`;
    return { text, signature };
  }

  function hasInstructionError6039(text) {
    return text.includes("instructionerror") && text.includes("custom") && text.includes("6039");
  }

  function consumeExitSell6039FailureSignal() {
    const data = getTransactionNotificationTextAndSignature();
    if (!data) return false;
    if (!hasInstructionError6039(data.text)) return false;
    if (data.signature === exitSellLast6039Signature) return false;
    exitSellLast6039Signature = data.signature;
    return true;
  }

  async function waitForCloseAllCompletionSignal() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < CLOSE_ALL_SIGNAL_TIMEOUT_MS) {
      if (hasCloseAllCompletionSignal()) return true;
      await sleep(CLOSE_ALL_SIGNAL_POLL_MS);
    }
    return false;
  }

  function stopExitSellRelay() {
    if (exitSellRelayTimer !== null) {
      window.clearTimeout(exitSellRelayTimer);
      exitSellRelayTimer = null;
    }
    exitSellRelayStopAt = 0;
    exitSell6039FailureCount = 0;
    exitSellLast6039Signature = "";
  }

  function sendExitSellTrigger() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;
    chrome.runtime.sendMessage({ type: TRIGGER_AUTO_SELL_ALL }, () => {
      // no-op
    });
  }

  function startExitSellRelay() {
    stopExitSellRelay();
    exitSellRelayStopAt = Date.now() + EXIT_SELL_RELAY_DURATION_MS;

    const tick = () => {
      if (Date.now() >= exitSellRelayStopAt) {
        stopExitSellRelay();
        return;
      }
      if (consumeExitSell6039FailureSignal()) {
        exitSell6039FailureCount += 1;
        (void 0) && console.debug(LOG_PREFIX, `Exit sell 6039 failure ${exitSell6039FailureCount}/${EXIT_SELL_MAX_6039_FAILURES}`);
        if (exitSell6039FailureCount >= EXIT_SELL_MAX_6039_FAILURES) {
          (void 0) && console.debug(LOG_PREFIX, "Exit sell relay stopped after 3 InstructionError Custom 6039 failures");
          stopExitSellRelay();
          return;
        }
      }
      sendExitSellTrigger();
      exitSellRelayTimer = window.setTimeout(tick, EXIT_SELL_RELAY_INTERVAL_MS);
    };

    sendExitSellTrigger();
    exitSellRelayTimer = window.setTimeout(tick, EXIT_SELL_RELAY_INTERVAL_MS);
  }

  async function runWithdrawAndAxiomFlow(triggerBtn, withdrawBtn) {
    if (triggerBtn.dataset.swapExtBusy === "1") return;
    triggerBtn.dataset.swapExtBusy = "1";
    const previousText = triggerBtn.textContent || "Exit to Axiom";
    triggerBtn.textContent = "Processing...";
    triggerBtn.disabled = true;

    try {
      const context = await getPoolContext();

      let withdrawProgressed = false;
      if (withdrawBtn) {
        clickElement(withdrawBtn);
        (void 0) && console.debug(LOG_PREFIX, "Triggered Close All");
        withdrawProgressed = await waitForWithdrawProgress(withdrawBtn);
        if (withdrawProgressed) {
          await sleep(POST_WITHDRAW_SETTLE_MS);
        }
      } else {
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
      if (withdrawBtn) {
        const hasSignal = await waitForCloseAllCompletionSignal();
        if (!hasSignal) {
          (void 0) && console.debug(LOG_PREFIX, "Close All completion signal wait timed out, starting sell relay anyway");
        }
      }
      startExitSellRelay();
    } catch (error) {
    } finally {
      window.setTimeout(() => {
        triggerBtn.disabled = false;
        triggerBtn.textContent = previousText;
        triggerBtn.dataset.swapExtBusy = "0";
      }, 1200);
    }
  }

  function applyExitButtonInlineStyle(btn, template) {
    btn.className = template.className
      .split(/\s+/)
      .filter((token) => token && token !== "ml-auto")
      .join(" ");
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
    btn.style.marginRight = "6px";
    btn.style.whiteSpace = "nowrap";
    btn.style.flex = "0 0 auto";
    const templateStyle = window.getComputedStyle(template);
    btn.style.paddingTop = templateStyle.paddingTop;
    btn.style.paddingBottom = templateStyle.paddingBottom;
    btn.style.paddingLeft = "12px";
    btn.style.paddingRight = "12px";
    btn.style.width = "";
    btn.style.minWidth = "";
  }

  function applyExitButtonFallbackStyle(btn) {
    btn.className = "";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.whiteSpace = "nowrap";
    btn.style.padding = "6px 12px";
    btn.style.marginRight = "6px";
    btn.style.border = "0";
    btn.style.borderRadius = "6px";
    btn.style.background = "#ff6b00";
    btn.style.color = "#ffffff";
    btn.style.fontSize = "12px";
    btn.style.fontWeight = "500";
    btn.style.cursor = "pointer";
    btn.style.flex = "0 0 auto";
  }

  function applySellButtonInlineStyle(btn, template) {
    applyExitButtonInlineStyle(btn, template);
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.gap = "6px";
    btn.style.marginRight = "4px";
    btn.style.marginLeft = "0";
  }

  function ensureSellButtonContent(btn) {
    const hasLogo = !!btn.querySelector("img[data-swap-ext='logo']");
    if (hasLogo) return;
    btn.textContent = "";
    const logo = document.createElement("img");
    logo.setAttribute("data-swap-ext", "logo");
    logo.src = getAxiomIconUrl();
    logo.alt = "Axiom";
    logo.style.width = "18px";
    logo.style.height = "18px";
    logo.style.borderRadius = "999px";
    logo.style.objectFit = "cover";
    logo.style.display = "block";
    const text = document.createElement("span");
    text.textContent = "Axiom";
    btn.append(logo, text);
  }

  function ensureWithdrawAxiomButton() {
    const withdrawBtn = findWithdrawCloseAllButton() || findWithdrawButton();
    const createPositionBtn = findCreatePositionButton();
    const closedPositionsBtn = findClosedPositionsButton();
    const existing = document.getElementById(EXIT_BTN_ID);
    const templateBtn = createPositionBtn || withdrawBtn || findUiTemplateButton();
    let host =
      (createPositionBtn && createPositionBtn.parentElement) ||
      (withdrawBtn && withdrawBtn.parentElement) ||
      (closedPositionsBtn && closedPositionsBtn.parentElement) ||
      resolveAnchor();
    if ((host == null ? void 0 : host.id) === ACTIONS_WRAP_ID && host.parentElement instanceof HTMLElement) {
      host = host.parentElement;
    }
    if (!host) {
      return;
    }
    const insertBeforeTarget =
      createPositionBtn && createPositionBtn.parentElement === host ? createPositionBtn : withdrawBtn || null;

    if (existing instanceof HTMLButtonElement) {
      if (existing.parentElement !== host) {
        existing.remove();
        if (insertBeforeTarget) {
          host.insertBefore(existing, insertBeforeTarget);
        } else {
          host.appendChild(existing);
        }
      }
      if (templateBtn) {
        applyExitButtonInlineStyle(existing, templateBtn);
      } else {
        applyExitButtonFallbackStyle(existing);
      }
      existing.onclick = () => {
        void runWithdrawAndAxiomFlow(existing, withdrawBtn);
      };
    } else {
      const btn = document.createElement("button");
      btn.id = EXIT_BTN_ID;
      btn.type = "button";
      btn.textContent = "Exit to Axiom";
      btn.title = "Withdraw and prepare Sell 100% on Axiom";
      if (templateBtn) {
        applyExitButtonInlineStyle(btn, templateBtn);
      } else {
        applyExitButtonFallbackStyle(btn);
      }
      if (insertBeforeTarget) {
        host.insertBefore(btn, insertBeforeTarget);
      } else {
        host.appendChild(btn);
      }
      btn.onclick = () => {
        void runWithdrawAndAxiomFlow(btn, withdrawBtn);
      };
    }

    const sellBtn = document.getElementById(BTN_ID);
    let sellEl;
    if (sellBtn instanceof HTMLButtonElement) {
      sellEl = sellBtn;
    } else {
      sellEl = document.createElement("button");
      sellEl.id = BTN_ID;
      sellEl.type = "button";
      sellEl.title = "Sell on Axiom";
      sellEl.setAttribute("aria-label", "Sell on Axiom");
      sellEl.onclick = async () => {
        stopExitSellRelay();
        const context = await getPoolContext();
        await openAxiomPopup(context, { side: "sell", anchorRect: getAnchorRect(sellEl) });
      };
    }
    sellEl.dataset.swapExtInline = "1";
    if (templateBtn) {
      applySellButtonInlineStyle(sellEl, templateBtn);
    } else {
      applyExitButtonFallbackStyle(sellEl);
      sellEl.style.gap = "6px";
      sellEl.style.marginRight = "4px";
    }
    ensureSellButtonContent(sellEl);
    if (closedPositionsBtn && closedPositionsBtn.parentElement) {
      sellEl.style.marginLeft = "6px";
      sellEl.style.marginRight = "0";
      closedPositionsBtn.parentElement.insertBefore(sellEl, closedPositionsBtn.nextSibling);
    }

    const exitEl = document.getElementById(EXIT_BTN_ID);
    if (createPositionBtn && createPositionBtn.parentElement === host && exitEl instanceof HTMLButtonElement) {
      let wrap = document.getElementById(ACTIONS_WRAP_ID);
      if (!(wrap instanceof HTMLDivElement)) {
        wrap = document.createElement("div");
        wrap.id = ACTIONS_WRAP_ID;
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "4px";
        wrap.style.marginLeft = "auto";
      }
      if (wrap !== host && wrap.parentElement !== host) {
        host.insertBefore(wrap, createPositionBtn);
      }
      createPositionBtn.classList.remove("ml-auto");
      createPositionBtn.style.marginLeft = "0";
      exitEl.style.marginLeft = "0";
      wrap.append(exitEl, createPositionBtn);
    } else {
      if (exitEl instanceof HTMLButtonElement && exitEl.parentElement === host) {
        const orderAnchor =
          createPositionBtn && createPositionBtn.parentElement === host ? createPositionBtn : insertBeforeTarget;
        if (orderAnchor) {
          host.insertBefore(exitEl, orderAnchor);
        } else {
          host.appendChild(exitEl);
        }
      }
    }
  }

  function findTabsListHost() {
    const candidate =
      findInAllRoots("div[role='tablist'][data-sentry-element='TabsList']") ||
      findInAllRoots("div[role='tablist']");
    if (candidate instanceof HTMLElement) return candidate;
    const createBtn = findCreatePositionButton();
    if (createBtn && createBtn.parentElement instanceof HTMLElement) return createBtn.parentElement;
    const closeAllBtn = findWithdrawCloseAllButton() || findWithdrawButton();
    if (closeAllBtn && closeAllBtn.parentElement instanceof HTMLElement) return closeAllBtn.parentElement;
    const fallback = resolveAnchor();
    return fallback instanceof HTMLElement ? fallback : null;
  }

  function findExternalLinksSourceHost() {
    const candidates = findAllInAllRoots("div[data-sentry-component='ExternalLinks']")
      .filter((el) => el instanceof HTMLElement);
    if (!candidates.length) return null;
    let best = null;
    let bestCount = -1;
    for (const host of candidates) {
      const count = host.querySelectorAll("a").length;
      if (count > bestCount) {
        best = host;
        bestCount = count;
      }
    }
    return best;
  }

  function resolveExternalLinkUrl(key, poolAddress, tokenMint) {
    switch (key) {
      case "jupiter":
        return tokenMint ? `https://jup.ag/tokens/${tokenMint}` : null;
      case "bananaGun":
        return "https://t.me/BananaGunSolana_bot";
      case "fluxbot":
        return "https://t.me/fluxbeam_bot";
      case "trojan":
        return "https://t.me/solana_trojanbot";
      case "maestro":
        return "https://t.me/maestro";
      case "bonkbot":
        return tokenMint ? `https://t.me/bonkbot_bot?start=ref_meteora_ca_${tokenMint}` : "https://t.me/bonkbot_bot";
      case "photon":
        return poolAddress ? `https://photon-sol.tinyastro.io/en/lp/${poolAddress}` : null;
      case "axiom":
        return poolAddress ? `https://axiom.trade/meme/${poolAddress}` : null;
      case "birdeye":
        return tokenMint && poolAddress ? `https://birdeye.so/token/${tokenMint}/${poolAddress}?chain=solana` : null;
      case "geckoTerminal":
        return poolAddress ? `https://geckoterminal.com/solana/pools/${poolAddress}` : null;
      case "dexScreener":
        return poolAddress ? `https://dexscreener.com/solana/${poolAddress}` : null;
      case "dexTools":
        return poolAddress ? `https://www.dextools.io/app/solana/pair-explorer/${poolAddress}` : null;
      case "gmgn":
        return tokenMint ? `https://gmgn.ai/sol/token/${tokenMint}` : null;
      default:
        return null;
    }
  }

  function inferExternalLinkKeyFromHref(href) {
    const value = href.toLowerCase();
    if (value.includes("jup.ag")) return "jupiter";
    if (value.includes("t.me/bananagunsolana_bot")) return "bananaGun";
    if (value.includes("t.me/fluxbeam_bot")) return "fluxbot";
    if (value.includes("t.me/solana_trojanbot")) return "trojan";
    if (value.includes("t.me/maestro")) return "maestro";
    if (value.includes("t.me/bonkbot_bot")) return "bonkbot";
    if (value.includes("photon-sol.tinyastro.io")) return "photon";
    if (value.includes("axiom.trade")) return "axiom";
    if (value.includes("birdeye.so")) return "birdeye";
    if (value.includes("geckoterminal.com")) return "geckoTerminal";
    if (value.includes("dexscreener.com")) return "dexScreener";
    if (value.includes("dextools.io")) return "dexTools";
    if (value.includes("gmgn.ai")) return "gmgn";
    return null;
  }

  function readLinkLabel(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return "";
    const span = anchor.querySelector("span");
    const raw = span && span.textContent ? span.textContent : anchor.textContent || "";
    return raw.replace(/\s+/g, " ").trim();
  }

  function createFallbackExternalIcon() {
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 10 10");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("aria-hidden", "true");
    svg.style.opacity = "0.75";
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute(
      "d",
      "M4 2V3H1.5V8.5H7V6H8V9C8 9.1326 7.947 9.26 7.854 9.354C7.76 9.447 7.633 9.5 7.5 9.5H1C0.867 9.5 0.74 9.447 0.646 9.354C0.553 9.26 0.5 9.133 0.5 9V2.5C0.5 2.367 0.553 2.24 0.646 2.146C0.74 2.053 0.867 2 1 2H4ZM9.5 0.5V4.5H8.5V2.206L4.604 6.103L3.896 5.396L7.793 1.5H5.5V0.5H9.5Z"
    );
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    return svg;
  }

  function closeMidLinksMenu() {
    const menu = getOrCreateMidLinksPortalMenu();
    const btn = document.getElementById(MID_LINKS_MORE_BTN_ID);
    if (menu instanceof HTMLElement) {
      menu.style.display = "none";
    }
    if (btn instanceof HTMLButtonElement) {
      btn.setAttribute("aria-expanded", "false");
    }
  }

  function closeInlineSettingsPanel() {
    const panel = document.getElementById(MID_LINKS_SETTINGS_PANEL_ID);
    if (panel) panel.remove();
    const btn = document.getElementById(MID_LINKS_SETTINGS_BTN_ID);
    if (btn instanceof HTMLButtonElement) btn.setAttribute("aria-expanded", "false");
  }

  function collectInlineSettings(panel) {
    const enabledInput = panel.querySelector("[data-swap-ext-setting='enabled']");
    const poolWidgetInput = panel.querySelector("[data-swap-ext-setting='poolWidgetEnabled']");
    const next = {
      enabled: (enabledInput && enabledInput.checked) || DEFAULT_EXTERNAL_LINKS_CONFIG.enabled,
      poolWidgetEnabled: (poolWidgetInput && poolWidgetInput.checked) || DEFAULT_EXTERNAL_LINKS_CONFIG.poolWidgetEnabled,
      links: { ...DEFAULT_EXTERNAL_LINKS_CONFIG.links }
    };
    const linkInputs = Array.from(panel.querySelectorAll("input[type='checkbox'][data-swap-ext-link-key]"));
    for (const input of linkInputs) {
      const key = input.dataset.swapExtLinkKey;
      if (!key || !(key in next.links)) continue;
      next.links[key] = input.checked;
    }
    return normalizeExternalLinksConfig(next);
  }

  function applyInlineSettingsLimitUi(panel, config) {
    const countEl = panel.querySelector("[data-swap-ext-selected-count='1']");
    let selected = 0;
    for (const item of EXTERNAL_LINK_ITEMS) {
      if (config.links[item.key]) selected += 1;
    }
    if (countEl instanceof HTMLElement) countEl.textContent = `Selected ${selected}/${MAX_DUP_EXTERNAL_LINKS}`;
    const atLimit = selected >= MAX_DUP_EXTERNAL_LINKS;
    const linkInputs = Array.from(panel.querySelectorAll("input[type='checkbox'][data-swap-ext-link-key]"));
    for (const input of linkInputs) {
      input.disabled = atLimit && !input.checked;
    }
  }

  function persistInlineSettings(config) {
    liveExternalLinksConfig = config;
    lastExternalLinksConfigSignature = JSON.stringify(config);
    void storageSet({ [EXTERNAL_LINKS_SETTINGS_KEY]: config });
    scheduleRouteCheck();
  }

  function openInlineSettingsPanel(anchorBtn) {
    closeMidLinksMenu();
    closeInlineSettingsPanel();

    const config = liveExternalLinksConfig || DEFAULT_EXTERNAL_LINKS_CONFIG;
    const panel = document.createElement("div");
    panel.id = MID_LINKS_SETTINGS_PANEL_ID;
    panel.style.position = "fixed";
    panel.style.minWidth = "260px";
    panel.style.maxWidth = "340px";
    panel.style.maxHeight = "70vh";
    panel.style.overflow = "auto";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "8px";
    panel.style.padding = "10px";
    panel.style.borderRadius = "10px";
    panel.style.border = "1px solid rgba(255,255,255,0.12)";
    panel.style.background = "rgba(16,18,24,0.98)";
    panel.style.backdropFilter = "blur(8px)";
    panel.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    panel.style.zIndex = "2147483647";

    const title = document.createElement("div");
    title.textContent = "Meteora Settings";
    title.style.fontSize = "12px";
    title.style.fontWeight = "600";
    title.style.color = "#f3f4f6";
    panel.appendChild(title);

    const mkToggle = (labelText, key, checked) => {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.fontSize = "12px";
      row.style.color = "#e5e7eb";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.dataset.swapExtSetting = key;
      const text = document.createElement("span");
      text.textContent = labelText;
      row.append(input, text);
      return row;
    };
    panel.appendChild(mkToggle("Duplicate external links in top panel", "enabled", !!config.enabled));
    panel.appendChild(mkToggle("Other Pools widget", "poolWidgetEnabled", !!config.poolWidgetEnabled));

    const count = document.createElement("div");
    count.dataset.swapExtSelectedCount = "1";
    count.style.fontSize = "11px";
    count.style.color = "#9ca3af";
    panel.appendChild(count);

    const linksWrap = document.createElement("div");
    linksWrap.style.display = "grid";
    linksWrap.style.gap = "6px";
    for (const item of EXTERNAL_LINK_ITEMS) {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.fontSize = "12px";
      row.style.color = "#e5e7eb";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!config.links[item.key];
      input.dataset.swapExtLinkKey = item.key;
      const text = document.createElement("span");
      text.textContent = item.label;
      row.append(input, text);
      linksWrap.appendChild(row);
    }
    panel.appendChild(linksWrap);

    panel.addEventListener("change", () => {
      const next = collectInlineSettings(panel);
      applyInlineSettingsLimitUi(panel, next);
      persistInlineSettings(next);
    });
    applyInlineSettingsLimitUi(panel, config);
    document.body.appendChild(panel);

    const rect = anchorBtn.getBoundingClientRect();
    const pw = Math.ceil(panel.getBoundingClientRect().width) || 300;
    const ph = Math.ceil(panel.getBoundingClientRect().height) || 220;
    const left = Math.max(8, Math.min(rect.right - pw, window.innerWidth - pw - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - ph - 8));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    anchorBtn.setAttribute("aria-expanded", "true");
  }

  function getOrCreateMidLinksPortalMenu() {
    let menu = document.getElementById(MID_LINKS_PORTAL_MENU_ID);
    if (menu instanceof HTMLDivElement) return menu;
    menu = document.createElement("div");
    menu.id = MID_LINKS_PORTAL_MENU_ID;
    menu.style.position = "fixed";
    menu.style.minWidth = "170px";
    menu.style.maxWidth = "280px";
    menu.style.display = "none";
    menu.style.flexDirection = "column";
    menu.style.gap = "6px";
    menu.style.padding = "8px";
    menu.style.borderRadius = "10px";
    menu.style.border = "1px solid rgba(255,255,255,0.12)";
    menu.style.background = "rgba(16,18,24,0.98)";
    menu.style.backdropFilter = "blur(8px)";
    menu.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    menu.style.zIndex = "2147483647";
    document.body.appendChild(menu);
    return menu;
  }

  function openMidLinksMenu(anchorBtn) {
    const menu = getOrCreateMidLinksPortalMenu();
    if (!(menu instanceof HTMLDivElement)) return;
    menu.textContent = "";
    const hiddenLinks = Array.from(document.querySelectorAll(`#${MID_LINKS_ROW_ID} a`)).filter(
      (el) => el instanceof HTMLAnchorElement && getComputedStyle(el).display === "none"
    );
    for (const link of hiddenLinks) {
      const cloned = link.cloneNode(true);
      if (!(cloned instanceof HTMLAnchorElement)) continue;
      cloned.style.display = "flex";
      cloned.style.width = "100%";
      cloned.style.whiteSpace = "nowrap";
      menu.appendChild(cloned);
    }
    if (!hiddenLinks.length) {
      menu.style.display = "none";
      anchorBtn.setAttribute("aria-expanded", "false");
      return;
    }
    menu.style.display = "flex";
    menu.style.visibility = "hidden";
    const rect = anchorBtn.getBoundingClientRect();
    const mw = Math.ceil(menu.getBoundingClientRect().width) || 220;
    const mh = Math.ceil(menu.getBoundingClientRect().height) || 120;
    const left = Math.max(8, Math.min(rect.right - mw, window.innerWidth - mw - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - mh - 8));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
    anchorBtn.setAttribute("aria-expanded", "true");
  }

  function applyMidLinksOverflowLayout() {
    const uniformGapPx = 6;
    const wrap = document.getElementById(MID_LINKS_WRAP_ID);
    if (!(wrap instanceof HTMLDivElement)) return;
    const row = document.getElementById(MID_LINKS_ROW_ID);
    const moreWrap = document.getElementById(MID_LINKS_MORE_WRAP_ID);
    const moreBtn = document.getElementById(MID_LINKS_MORE_BTN_ID);
    const settingsBtn = document.getElementById(MID_LINKS_SETTINGS_BTN_ID);
    const menu = getOrCreateMidLinksPortalMenu();
    if (!(row instanceof HTMLDivElement)) return;
    if (!(moreWrap instanceof HTMLDivElement)) return;
    if (!(moreBtn instanceof HTMLButtonElement)) return;
    const menuWasOpen = menu.style.display === "flex";

    const links = Array.from(row.querySelectorAll("a")).filter((el) => el instanceof HTMLAnchorElement);
    const wrapClientWidth = wrap.clientWidth;
    if (wrapClientWidth < 120) {
      // Meteora tablist can report transient tiny widths during relayout.
      // Keep last stable state to avoid transient disappearance of +N.
      if (midLinksLastHiddenCount > 0) {
        moreWrap.style.display = "inline-flex";
        moreBtn.textContent = `+${midLinksLastHiddenCount} \u25BE`;
        wrap.style.minWidth = "54px";
        moreWrap.style.marginLeft = `${uniformGapPx}px`;
        moreWrap.style.marginRight = `${uniformGapPx}px`;
      } else {
        moreWrap.style.display = "none";
        moreBtn.textContent = "+0 \u25BE";
        wrap.style.minWidth = "0";
        moreWrap.style.marginLeft = "0px";
        moreWrap.style.marginRight = "0px";
        closeMidLinksMenu();
      }
      return;
    }
    for (const link of links) {
      link.style.display = "inline-flex";
    }
    moreWrap.style.display = "none";
    moreWrap.style.visibility = "";

    const wrapRect = wrap.getBoundingClientRect();
    let leftLimit = wrapRect.left + 2;
    const leftGroup = wrap.previousElementSibling;
    if (leftGroup instanceof HTMLElement) {
      const leftRect = leftGroup.getBoundingClientRect();
      if (leftRect.width > 0 && leftRect.height > 0) {
        leftLimit = Math.max(leftLimit, leftRect.right + 8);
      }
    }
    const inlineAxiomBtn = document.getElementById(BTN_ID);
    if (inlineAxiomBtn instanceof HTMLElement && inlineAxiomBtn.dataset.swapExtInline === "1") {
      const axRect = inlineAxiomBtn.getBoundingClientRect();
      if (axRect.width > 0 && axRect.height > 0) {
        leftLimit = Math.max(leftLimit, axRect.right + 6);
      }
    }
    const actionsWrap = document.getElementById(ACTIONS_WRAP_ID);
    let rightLimit = wrapRect.right - 2;
    if (actionsWrap instanceof HTMLElement && actionsWrap.parentElement === wrap.parentElement) {
      const actionsRect = actionsWrap.getBoundingClientRect();
      // Use the right action group as the primary overflow anchor.
      if (actionsRect.left > wrapRect.left + 24) {
        rightLimit = Math.min(rightLimit, actionsRect.left - 8);
      }
    }
    const reserveBtnWidth = (() => {
      moreBtn.textContent = "+99 \u25BE";
      moreWrap.style.display = "inline-flex";
      moreWrap.style.visibility = "hidden";
      const w = Math.max(28, Math.ceil(moreWrap.getBoundingClientRect().width));
      moreWrap.style.display = "none";
      moreWrap.style.visibility = "";
      return w;
    })();
    const settingsBtnWidth = settingsBtn instanceof HTMLElement ? Math.ceil(settingsBtn.getBoundingClientRect().width) + uniformGapPx : 0;
    const availableWidth = Math.max(0, Math.floor(rightLimit - leftLimit - reserveBtnWidth - settingsBtnWidth - 4));
    if (availableWidth <= 48) {
      if (midLinksLastHiddenCount > 0) {
        moreWrap.style.display = "inline-flex";
        moreBtn.textContent = `+${midLinksLastHiddenCount} \u25BE`;
        wrap.style.minWidth = `${reserveBtnWidth + 8}px`;
        moreWrap.style.marginLeft = `${uniformGapPx}px`;
        moreWrap.style.marginRight = `${uniformGapPx}px`;
      } else {
        moreWrap.style.display = "none";
        moreBtn.textContent = "+0 \u25BE";
        wrap.style.minWidth = "0";
        moreWrap.style.marginLeft = "0px";
        moreWrap.style.marginRight = "0px";
        closeMidLinksMenu();
      }
      return;
    }

    const linksGap = Number.parseFloat(window.getComputedStyle(row).columnGap || window.getComputedStyle(row).gap || "0") || 0;
    const computeVisibleWidth = () => {
      const visible = links.filter((link) => link.style.display !== "none");
      if (!visible.length) return 0;
      let width = 0;
      for (const link of visible) {
        width += Math.ceil(link.getBoundingClientRect().width);
      }
      width += Math.ceil(linksGap * Math.max(0, visible.length - 1));
      return width;
    };
    const hasLeftOverlap = () => {
      const firstVisible = links.find((link) => link.style.display !== "none");
      if (!firstVisible) return false;
      const firstRect = firstVisible.getBoundingClientRect();
      if (firstRect.left < leftLimit) return true;
      if (inlineAxiomBtn instanceof HTMLElement && inlineAxiomBtn.dataset.swapExtInline === "1") {
        const axRect = inlineAxiomBtn.getBoundingClientRect();
        if (axRect.width > 0 && axRect.height > 0 && firstRect.left < axRect.right + 6) {
          return true;
        }
      }
      return false;
    };

    // Hide links one-by-one from the end until row truly fits.
    let hiddenCount = 0;
    let i = links.length - 1;
    while (i >= 0 && (computeVisibleWidth() > availableWidth || hasLeftOverlap())) {
      links[i].style.display = "none";
      hiddenCount += 1;
      i -= 1;
    }

    if (hiddenCount <= 0) {
      moreWrap.style.display = "none";
      moreBtn.textContent = "+0 \u25BE";
      moreWrap.style.marginLeft = "0px";
      moreWrap.style.marginRight = "0px";
      wrap.style.minWidth = "0";
      midLinksLastHiddenCount = 0;
      closeMidLinksMenu();
      return;
    }
    moreWrap.style.display = "inline-flex";
    moreBtn.textContent = `+${hiddenCount} \u25BE`;
    moreWrap.style.zIndex = "2147483646";
    moreWrap.style.position = "relative";
    moreWrap.style.marginLeft = `${uniformGapPx}px`;
    moreWrap.style.marginRight = `${uniformGapPx}px`;
    wrap.style.minWidth = `${reserveBtnWidth + 8}px`;
    if (inlineAxiomBtn instanceof HTMLElement && inlineAxiomBtn.dataset.swapExtInline === "1") {
      const axRect = inlineAxiomBtn.getBoundingClientRect();
      const moreRect = moreWrap.getBoundingClientRect();
      const overlapPx = Math.ceil(axRect.right + 6 - moreRect.left);
      if (overlapPx > 0) {
        moreWrap.style.marginLeft = `${uniformGapPx + overlapPx}px`;
      }
    }
    midLinksLastHiddenCount = hiddenCount;
    if (menuWasOpen) {
      openMidLinksMenu(moreBtn);
    }
  }

  function scheduleMidLinksLayout() {
    if (midLinksLayoutRaf !== null) {
      window.cancelAnimationFrame(midLinksLayoutRaf);
    }
    midLinksLayoutRaf = window.requestAnimationFrame(() => {
      midLinksLayoutRaf = null;
      applyMidLinksOverflowLayout();
    });
  }

  function bindMidLinksGlobalEvents() {
    if (midLinksGlobalEventsBound) return;
    midLinksGlobalEventsBound = true;
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const moreWrap = document.getElementById(MID_LINKS_MORE_WRAP_ID);
      if (moreWrap && moreWrap.contains(target)) return;
      const portal = document.getElementById(MID_LINKS_PORTAL_MENU_ID);
      if (portal && portal.contains(target)) return;
      const settingsBtn = document.getElementById(MID_LINKS_SETTINGS_BTN_ID);
      if (settingsBtn && settingsBtn.contains(target)) return;
      const settingsPanel = document.getElementById(MID_LINKS_SETTINGS_PANEL_ID);
      if (settingsPanel && settingsPanel.contains(target)) return;
      closeMidLinksMenu();
      closeInlineSettingsPanel();
    });
    window.addEventListener("resize", () => {
      closeMidLinksMenu();
      closeInlineSettingsPanel();
      scheduleMidLinksLayout();
    });

    if (midLinksWatchdogTimer === null) {
      midLinksWatchdogTimer = window.setInterval(() => {
        if (document.getElementById(MID_LINKS_WRAP_ID)) {
          scheduleMidLinksLayout();
        }
      }, 700);
    }
  }

  function bindMidLinksResizeObserver() {
    if (typeof ResizeObserver === "undefined") return;
    if (midLinksResizeObserver) {
      midLinksResizeObserver.disconnect();
      midLinksResizeObserver = null;
    }
    const wrap = document.getElementById(MID_LINKS_WRAP_ID);
    if (!(wrap instanceof HTMLElement)) return;
    const row = document.getElementById(MID_LINKS_ROW_ID);
    const actionsWrap = document.getElementById(ACTIONS_WRAP_ID);
    const host = wrap.parentElement;
    const leftGroup = wrap.previousElementSibling;

    midLinksResizeObserver = new ResizeObserver(() => {
      scheduleMidLinksLayout();
    });

    midLinksResizeObserver.observe(wrap);
    if (row instanceof HTMLElement) midLinksResizeObserver.observe(row);
    if (actionsWrap instanceof HTMLElement) midLinksResizeObserver.observe(actionsWrap);
    if (host instanceof HTMLElement) midLinksResizeObserver.observe(host);
    if (leftGroup instanceof HTMLElement) midLinksResizeObserver.observe(leftGroup);
  }

  function removeMidLinksWrap() {
    closeMidLinksMenu();
    closeInlineSettingsPanel();
    if (midLinksLayoutRaf !== null) {
      window.cancelAnimationFrame(midLinksLayoutRaf);
      midLinksLayoutRaf = null;
    }
    const existing = document.getElementById(MID_LINKS_WRAP_ID);
    if (existing) existing.remove();
    if (midLinksResizeObserver) {
      midLinksResizeObserver.disconnect();
      midLinksResizeObserver = null;
    }
    midLinksLastHiddenCount = 0;
  }

  function samePairIsRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function samePairToNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.replace(/,/g, "").trim();
      if (!normalized) return null;
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  function samePairReadString(obj, keys) {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  }

  function samePairReadNumber(obj, keys) {
    for (const key of keys) {
      const parsed = samePairToNumber(obj[key]);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function samePairNormalizeMetricKey(key) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function samePairReadWindowValue(value, keys) {
    if (!samePairIsRecord(value)) return null;
    const wanted = new Set(keys.map(samePairNormalizeMetricKey));
    for (const [key, raw] of Object.entries(value)) {
      if (!wanted.has(samePairNormalizeMetricKey(key))) continue;
      const parsed = samePairToNumber(raw);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function samePairBuildMintKey(baseMint, quoteMint) {
    return [baseMint, quoteMint].sort().join("-");
  }

  function samePairMintsMatch(item, baseMint, quoteMint) {
    if (!item.baseMint || !item.quoteMint) return false;
    return samePairBuildMintKey(item.baseMint, item.quoteMint) === samePairBuildMintKey(baseMint, quoteMint);
  }

  function samePairLikelyAddress(value) {
    return !!value && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  }

  function samePairNormalizePoolCandidate(candidate, options) {
    const nested =
      (samePairIsRecord(candidate.pair_info) ? candidate.pair_info : null) ||
      (samePairIsRecord(candidate.pair) ? candidate.pair : null) ||
      (samePairIsRecord(candidate.pool_info) ? candidate.pool_info : null) ||
      (samePairIsRecord(candidate.pool) ? candidate.pool : null);

    const readString = (keys) => {
      if (nested) {
        const nestedValue = samePairReadString(nested, keys);
        if (nestedValue) return nestedValue;
      }
      return samePairReadString(candidate, keys);
    };

    const readNumber = (keys) => {
      if (nested) {
        const nestedValue = samePairReadNumber(nested, keys);
        if (nestedValue !== null) return nestedValue;
      }
      return samePairReadNumber(candidate, keys);
    };

    const poolAddress = readString([
      "pair_address",
      "address",
      "lb_pair",
      "lb_pair_address",
      "pool_address",
      "pairAddress"
    ]);
    if (!samePairLikelyAddress(poolAddress)) return null;

    const baseMint = readString(["mint_x", "token_x_mint", "tokenXMint", "base_mint", "baseMint", "token0Mint"]);
    const quoteMint = readString(["mint_y", "token_y_mint", "tokenYMint", "quote_mint", "quoteMint", "token1Mint"]);

    const volumeObj =
      (nested && samePairIsRecord(nested.volume) ? nested.volume : null) ||
      (nested && samePairIsRecord(nested.volume_usd) ? nested.volume_usd : null) ||
      (samePairIsRecord(candidate.volume) ? candidate.volume : null) ||
      (samePairIsRecord(candidate.volume_usd) ? candidate.volume_usd : null);

    let volume5m =
      readNumber(["volume_5m", "volume5m", "volume_5m_usd"]) ||
      samePairReadWindowValue(volumeObj, ["5m", "5min", "minute_5", "min_5", "5m_usd", "volume_5m"]);
    const volume1h =
      readNumber(["volume_1h", "volume1h", "volume_hour_1", "hour_1"]) ||
      samePairReadWindowValue(volumeObj, ["1h", "hour_1", "60m", "60min", "1hour", "volume_1h"]);
    const volume24h =
      readNumber(["volume_24h", "volume24h", "volume_h24", "hour_24"]) ||
      samePairReadWindowValue(volumeObj, ["24h", "hour_24", "1d", "24hr", "volume_24h"]);

    if (volume5m === null && options.useMin30Proxy) {
      volume5m =
        readNumber(["min_30", "volume_30m", "volume30m"]) ||
        samePairReadWindowValue(volumeObj, ["30m", "30min", "min_30", "volume_30m"]);
    }

    const feeObj =
      (nested && samePairIsRecord(nested.fees) ? nested.fees : null) ||
      (samePairIsRecord(candidate.fees) ? candidate.fees : null);

    const fee =
      readNumber(["fee", "fees", "fee_24h", "fees_24h", "fee_usd_24h"]) ||
      samePairReadWindowValue(feeObj, ["24h", "hour_24", "1d", "total"]);

    const apr = readNumber(["apr", "fee_apr", "apr_24h", "apr24h"]);
    const binStep = readNumber(["bin_step", "binStep", "bin_size", "binSize"]);
    const baseFeePct = readNumber([
      "base_fee",
      "baseFee",
      "base_fee_pct",
      "base_fee_percent",
      "base_fee_percentage"
    ]);
    const baseFeeBps = readNumber(["base_fee_bps"]);
    const dynamicFeePct = readNumber([
      "dynamic_fee",
      "dynamicFee",
      "dynamic_fee_pct",
      "dynamic_fee_percent",
      "dynamic_fee_percentage",
      "variable_fee",
      "variableFee"
    ]);
    const dynamicFeeBps = readNumber(["dynamic_fee_bps", "variable_fee_bps"]);
    const baseFee = baseFeePct !== null ? baseFeePct : (baseFeeBps !== null ? baseFeeBps / 100 : null);
    const dynamicFee = dynamicFeePct !== null ? dynamicFeePct : (dynamicFeeBps !== null ? dynamicFeeBps / 100 : null);

    return {
      poolAddress,
      baseMint,
      quoteMint,
      metrics: {
        binStep,
        baseFee,
        dynamicFee,
        price: readNumber(["price", "current_price", "price_usd", "last_price"]),
        tvl: readNumber(["tvl", "tvl_usd", "liquidity", "liquidity_in_usd", "reserve_in_usd"]),
        volume5m,
        volume1h,
        volume24h,
        fee,
        apr
      }
    };
  }

  function samePairExtractCandidates(payload) {
    const result = [];
    const queue = [payload];
    const seen = new Set();
    let scanned = 0;
    while (queue.length && scanned < 2000) {
      const current = queue.shift();
      scanned += 1;
      if (!current || typeof current !== "object") continue;
      if (seen.has(current)) continue;
      seen.add(current);

      if (Array.isArray(current)) {
        for (const item of current) queue.push(item);
        continue;
      }

      const obj = current;
      result.push(obj);
      for (const value of Object.values(obj)) {
        if (value && typeof value === "object") queue.push(value);
      }
    }
    return result;
  }

  function samePairSortAndTrim(items, maxRows) {
    const dedup = new Map();
    for (const item of items) {
      dedup.set(item.poolAddress, item);
    }
    return Array.from(dedup.values())
      .sort((a, b) => {
        const aScore = a.metrics.volume5m ?? a.metrics.volume1h ?? a.metrics.volume24h ?? Number.NEGATIVE_INFINITY;
        const bScore = b.metrics.volume5m ?? b.metrics.volume1h ?? b.metrics.volume24h ?? Number.NEGATIVE_INFINITY;
        return bScore - aScore;
      })
      .slice(0, maxRows);
  }

  function samePairCollectItemsFromPayload(payload, baseMint, quoteMint, options) {
    const candidates = samePairExtractCandidates(payload);
    const normalized = [];
    for (const candidate of candidates) {
      const item = samePairNormalizePoolCandidate(candidate, options);
      if (!item) continue;
      if (!samePairMintsMatch(item, baseMint, quoteMint)) continue;
      normalized.push(item);
    }
    return samePairSortAndTrim(normalized, SAME_PAIR_MAX_ROWS);
  }

  async function samePairFetchJson(url, signal) {
    const res = await fetch(url, { credentials: "omit", signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  function samePairIsHttpNotFoundError(error) {
    const message = (error == null ? void 0 : error.message) || "";
    return /HTTP 404/i.test(message);
  }

  function samePairBuildLexicalKeys(baseMint, quoteMint) {
    const [a, b] = [baseMint, quoteMint].sort();
    return [`${a}-${b}`, `${a}_${b}`, `${a}:${b}`];
  }

  function samePairBuildDataApiUrls(baseMint, quoteMint) {
    const urls = new Set();
    const lexicalKeys = samePairBuildLexicalKeys(baseMint, quoteMint);
    for (const lexical of lexicalKeys) {
      const encoded = encodeURIComponent(lexical);
      urls.add(`${DLMM_DATA_API_BASE_URL}/pools/groups/${lexical}?page=1&page_size=30&sort_by=volume_5m:desc`);
      urls.add(`${DLMM_DATA_API_BASE_URL}/pools/groups/${lexical}?page=1&per_page=30&sort_by=volume_5m:desc`);
      urls.add(`${DLMM_DATA_API_BASE_URL}/pair/groups/${lexical}?page=1&per_page=30&sort_by=volume_5m:desc`);
      urls.add(`${DLMM_DATA_API_BASE_URL}/pair/groups/${lexical}?page=1&page_size=30&sort_by=volume_5m:desc`);
      urls.add(`${DLMM_DATA_API_BASE_URL}/pools?page=1&page_size=30&sort_by=volume_5m:desc&include_pool_token_pairs=${encoded}`);
      urls.add(`${DLMM_DATA_API_BASE_URL}/pair/all_with_pagination?page=1&page_size=30&sort_by=volume_5m:desc&include_pool_token_pairs=${encoded}`);
    }
    return Array.from(urls);
  }

  function samePairBuildDlmmApiUrls(baseMint, quoteMint) {
    const urls = new Set();
    const lexicalKeys = samePairBuildLexicalKeys(baseMint, quoteMint);
    for (const lexical of lexicalKeys) {
      urls.add(`${DLMM_API_BASE_URL}/pair/groups/${lexical}?page=1&per_page=30&sort_by=volume_24h:desc`);
      urls.add(`${DLMM_API_BASE_URL}/pair/groups/${lexical}?page=0&page_size=30&sort_by=volume_24h:desc`);
      urls.add(`${DLMM_API_BASE_URL}/pair/groups/${lexical}`);
    }
    return Array.from(urls);
  }

  async function samePairFetchFromDataApi(baseMint, quoteMint, signal) {
    const urls = samePairBuildDataApiUrls(baseMint, quoteMint);
    let lastError = null;
    for (const url of urls) {
      try {
        const payload = await samePairFetchJson(url, signal);
        const items = samePairCollectItemsFromPayload(payload, baseMint, quoteMint, { useMin30Proxy: false });
        if (!items.length) continue;
        return {
          items,
          source: "data-api",
          usedVolumeProxy: false
        };
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        lastError = error;
      }
    }
    if (lastError && !samePairIsHttpNotFoundError(lastError)) {
      console.debug(LOG_PREFIX, "Data API same-pair fetch failed, falling back to dlmm-api", lastError);
    }
    return null;
  }

  async function samePairFetchFromDlmmApi(baseMint, quoteMint, signal) {
    const urls = samePairBuildDlmmApiUrls(baseMint, quoteMint);
    let lastError = null;
    for (const url of urls) {
      try {
        const payload = await samePairFetchJson(url, signal);
        const items = samePairCollectItemsFromPayload(payload, baseMint, quoteMint, { useMin30Proxy: true });
        if (!items.length) continue;
        return {
          items,
          source: "dlmm-api",
          usedVolumeProxy: true
        };
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        lastError = error;
      }
    }
    if (lastError) {
      console.debug(LOG_PREFIX, "DLMM API same-pair fetch failed", lastError);
    }
    return null;
  }

  async function samePairFetchPools(context, signal) {
    if (!samePairLikelyAddress(context.baseMint) || !samePairLikelyAddress(context.quoteMint)) {
      throw new Error("Pool context does not contain pair mints");
    }

    const dataApiResult = await samePairFetchFromDataApi(context.baseMint, context.quoteMint, signal);
    if (dataApiResult) return dataApiResult;

    const fallbackResult = await samePairFetchFromDlmmApi(context.baseMint, context.quoteMint, signal);
    if (fallbackResult) return fallbackResult;

    return {
      items: [],
      source: "dlmm-api",
      usedVolumeProxy: true
    };
  }

  function samePairFindAnchorForm() {
    const found = findInAllRoots("form[data-sentry-component='NewPositionComponent']");
    return found instanceof HTMLFormElement ? found : null;
  }

  function ensureSamePairWidgetRoot() {
    const anchor = samePairFindAnchorForm();
    if (!anchor) return null;

    let root = document.getElementById(SAME_PAIR_WIDGET_ID);
    if (!(root instanceof HTMLDivElement)) {
      root = document.createElement("div");
      root.id = SAME_PAIR_WIDGET_ID;
      root.style.marginTop = "12px";
      root.style.marginBottom = "6px";
      root.style.border = "1px solid rgba(255,255,255,0.12)";
      root.style.borderRadius = "12px";
      root.style.background = "rgba(18, 22, 28, 0.86)";
      root.style.backdropFilter = "blur(6px)";
      root.style.padding = "10px";

      const header = document.createElement("div");
      header.id = SAME_PAIR_HEADER_ID;
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.gap = "8px";
      header.style.marginBottom = "8px";

      const body = document.createElement("div");
      body.id = SAME_PAIR_BODY_ID;

      root.append(header, body);
    }

    root.style.marginTop = "12px";
    root.style.marginBottom = "0";

    if (root.parentElement !== anchor || anchor.lastElementChild !== root) {
      anchor.appendChild(root);
    }

    return root;
  }

  function samePairRemoveWidget() {
    const widget = document.getElementById(SAME_PAIR_WIDGET_ID);
    if (widget) widget.remove();
  }

  function samePairSetHeader(text, status) {
    const root = ensureSamePairWidgetRoot();
    if (!root) return;
    const header = document.getElementById(SAME_PAIR_HEADER_ID);
    if (!(header instanceof HTMLDivElement)) return;
    header.textContent = "";

    const title = document.createElement("div");
    title.textContent = text;
    title.style.fontSize = "12px";
    title.style.fontWeight = "600";
    title.style.color = "#f3f4f6";

    const hint = document.createElement("div");
    hint.textContent = status;
    hint.dataset.swapExtSamePairStatus = "1";
    hint.style.fontSize = "11px";
    hint.style.color = "#9ca3af";

    header.append(title, hint);
  }

  function samePairFormatFeePercent(value) {
    if (value === null || !Number.isFinite(value)) return "--";
    let normalized = value;
    if (Math.abs(value) < 0.01) normalized = value * 100;
    if (Math.abs(normalized) >= 100) return `${normalized.toFixed(0)}%`;
    if (Math.abs(normalized) >= 10) return `${normalized.toFixed(1)}%`;
    return `${normalized.toFixed(2)}%`;
  }

  function samePairStatusText() {
    const seconds = Math.max(0, Math.floor((Date.now() - samePairLastUpdatedAt) / 1000));
    return `${seconds}s ago`;
  }

  function samePairSortValue(item, key) {
    if (key === "binStep") return item.metrics.binStep;
    if (key === "baseFee") return item.metrics.baseFee;
    if (key === "tvl") return item.metrics.tvl;
    if (key === "volume5m") return item.metrics.volume5m;
    if (key === "volume1h") return item.metrics.volume1h;
    if (key === "volume24h") return item.metrics.volume24h;
    return item.metrics.apr;
  }

  function samePairSortItems(items) {
    const sorted = items.slice();
    const directionSign = samePairSortState.direction === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      const av = samePairSortValue(a, samePairSortState.key);
      const bv = samePairSortValue(b, samePairSortState.key);
      const aMissing = av === null || !Number.isFinite(av);
      const bMissing = bv === null || !Number.isFinite(bv);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (av === bv) return 0;
      return (av - bv) * directionSign;
    });
    return sorted;
  }

  function samePairSortIndicator(key) {
    if (samePairSortState.key !== key) return "";
    return samePairSortState.direction === "asc" ? " ▲" : " ▼";
  }

  function samePairToggleSort(key) {
    if (samePairSortState.key === key) {
      samePairSortState.direction = samePairSortState.direction === "asc" ? "desc" : "asc";
      return;
    }
    samePairSortState = { key, direction: "asc" };
  }

  function samePairDisplayPair(item, context) {
    const mints = [item.baseMint, item.quoteMint, context.baseMint, context.quoteMint].filter(
      (v) => typeof v === "string" && !!v
    );
    if (mints.some((m) => m === USDC_MINT)) return "USDC";
    if (mints.some((m) => SOL_MINTS.has(m))) return "SOL";
    return "--";
  }

  function samePairRefreshHeaderAge() {
    if (!samePairLastUpdatedAt) return;
    const header = document.getElementById(SAME_PAIR_HEADER_ID);
    if (!(header instanceof HTMLDivElement)) return;
    const hint = header.querySelector("[data-swap-ext-same-pair-status='1']");
    if (!(hint instanceof HTMLDivElement)) return;
    hint.textContent = samePairStatusText();
  }

  function samePairFormatUsd(value) {
    if (value === null || !Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    if (abs >= 1000) return `$${SAME_PAIR_COMPACT_FMT.format(value)}`;
    if (abs >= 1) return `$${value.toFixed(2)}`;
    return `$${value.toFixed(6)}`;
  }

  function samePairFormatPrice(value) {
    if (value === null || !Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    if (abs >= 1) return value.toFixed(6);
    if (abs >= 0.01) return value.toFixed(8);
    return value.toExponential(2);
  }

  function samePairFormatPercent(value) {
    if (value === null || !Number.isFinite(value)) return "--";
    const normalized = Math.abs(value) <= 1 ? value * 100 : value;
    return `${normalized.toFixed(2)}%`;
  }

  function samePairRenderBody(children) {
    const root = ensureSamePairWidgetRoot();
    if (!root) return;
    const body = document.getElementById(SAME_PAIR_BODY_ID);
    if (!(body instanceof HTMLDivElement)) return;
    body.textContent = "";
    for (const child of children) body.appendChild(child);
  }

  function samePairRenderLoading() {
    samePairSetHeader(SAME_PAIR_TITLE, "Loading...");
    const text = document.createElement("div");
    text.textContent = "Collecting pools for this pair...";
    text.style.fontSize = "12px";
    text.style.color = "#9ca3af";
    samePairRenderBody([text]);
  }

  function samePairRenderError(errorText, nextDelayMs) {
    const nextSec = Math.max(1, Math.round(nextDelayMs / 1000));
    samePairSetHeader(SAME_PAIR_TITLE, `Retry in ${nextSec}s`);
    const text = document.createElement("div");
    text.textContent = errorText;
    text.style.fontSize = "12px";
    text.style.color = "#fca5a5";
    samePairRenderBody([text]);
  }

  function samePairBuildTargetUrl(poolAddress) {
    const next = new URL(window.location.href);
    next.pathname = `/dlmm/${poolAddress}`;
    return next.toString();
  }

  function samePairRenderList(result, context) {
    samePairSetHeader(SAME_PAIR_TITLE, samePairStatusText());
    if (!result.items.length) {
      const text = document.createElement("div");
      text.textContent = "No sibling DLMM pools found for this pair.";
      text.style.fontSize = "12px";
      text.style.color = "#9ca3af";
      samePairRenderBody([text]);
      return;
    }
    const wrap = document.createElement("div");
    wrap.style.overflowX = "auto";
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "separate";
    table.style.borderSpacing = "0 6px";
    table.style.fontSize = "11px";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const hasDynamicFee = result.items.some((item) => item.metrics.dynamicFee !== null && Number.isFinite(item.metrics.dynamicFee));
    const columns = hasDynamicFee
      ? [
        { label: "Pair", sortKey: null },
        { label: "Bin Step", sortKey: "binStep" },
        { label: "Base Fee", sortKey: "baseFee" },
        { label: "Dynamic Fee", sortKey: null },
        { label: "TVL", sortKey: "tvl" },
        { label: "Vol 5m", sortKey: "volume5m" },
        { label: "Vol 1h", sortKey: "volume1h" },
        { label: "Vol 24h", sortKey: "volume24h" },
        { label: "APR", sortKey: "apr" }
      ]
      : [
        { label: "Pair", sortKey: null },
        { label: "Bin Step", sortKey: "binStep" },
        { label: "Base Fee", sortKey: "baseFee" },
        { label: "TVL", sortKey: "tvl" },
        { label: "Vol 5m", sortKey: "volume5m" },
        { label: "Vol 1h", sortKey: "volume1h" },
        { label: "Vol 24h", sortKey: "volume24h" },
        { label: "APR", sortKey: "apr" }
      ];
    for (const col of columns) {
      const th = document.createElement("th");
      th.textContent = col.label + (col.sortKey ? samePairSortIndicator(col.sortKey) : "");
      th.style.textAlign = "right";
      th.style.fontWeight = "600";
      th.style.color = "#9ca3af";
      th.style.padding = "0 8px";
      if (col.sortKey) {
        th.style.cursor = "pointer";
        th.addEventListener("click", () => {
          samePairToggleSort(col.sortKey);
          samePairRenderList(result, context);
        });
      }
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    const tbody = document.createElement("tbody");
    const sortedItems = samePairSortItems(result.items);
    for (const item of sortedItems) {
      const row = document.createElement("tr");
      row.style.cursor = "pointer";
      row.style.borderRadius = "8px";
      const isCurrent = context.poolAddress === item.poolAddress;
      row.style.background = isCurrent ? "rgba(249, 115, 22, 0.22)" : "rgba(31, 41, 55, 0.55)";
      const addCell = (value, align) => {
        const td = document.createElement("td");
        td.textContent = value;
        td.style.padding = "6px 8px";
        td.style.whiteSpace = "nowrap";
        td.style.textAlign = align;
        td.style.color = isCurrent ? "#ffedd5" : "#e5e7eb";
        row.appendChild(td);
      };
      addCell(samePairDisplayPair(item, context), "left");
      addCell(item.metrics.binStep === null ? "--" : String(Math.round(item.metrics.binStep)), "right");
      addCell(samePairFormatFeePercent(item.metrics.baseFee), "right");
      if (hasDynamicFee) addCell(samePairFormatFeePercent(item.metrics.dynamicFee), "right");
      addCell(samePairFormatUsd(item.metrics.tvl), "right");
      addCell(samePairFormatUsd(item.metrics.volume5m), "right");
      addCell(samePairFormatUsd(item.metrics.volume1h), "right");
      addCell(samePairFormatUsd(item.metrics.volume24h), "right");
      addCell(samePairFormatPercent(item.metrics.apr), "right");
      const targetUrl = samePairBuildTargetUrl(item.poolAddress);
      row.addEventListener("click", (event) => {
        if (event.ctrlKey || event.metaKey) {
          window.open(targetUrl, "_blank", "noopener");
          return;
        }
        window.location.assign(targetUrl);
      });
      row.addEventListener("auxclick", (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        window.open(targetUrl, "_blank", "noopener");
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        window.location.assign(targetUrl);
      });
      row.tabIndex = 0;
      tbody.appendChild(row);
    }
    table.append(thead, tbody);
    wrap.appendChild(table);
    samePairRenderBody([wrap]);
  }
  function samePairClearPollTimer() {
    if (samePairPollTimer !== null) {
      window.clearTimeout(samePairPollTimer);
      samePairPollTimer = null;
    }
  }

  function samePairResetPollingState() {
    samePairClearPollTimer();
    if (samePairAbortController) {
      samePairAbortController.abort();
      samePairAbortController = null;
    }
    samePairPollInFlight = false;
    samePairConsecutiveErrors = 0;
  }

  function samePairStopPolling(removeWidget) {
    samePairResetPollingState();
    samePairLastUpdatedAt = 0;
    if (removeWidget) {
      samePairRemoveWidget();
      samePairLastRenderedSignature = "";
    }
  }

  function samePairComputeBackoffMs() {
    const pow = Math.max(0, samePairConsecutiveErrors - 1);
    const next = SAME_PAIR_POLL_BASE_MS * 2 ** pow;
    return Math.min(SAME_PAIR_POLL_MAX_BACKOFF_MS, next);
  }

  function samePairSchedulePoll(delayMs) {
    samePairClearPollTimer();
    samePairPollTimer = window.setTimeout(() => {
      samePairPollTimer = null;
      void samePairRunPoll();
    }, delayMs);
  }

  async function samePairRunPoll() {
    if (samePairPollInFlight) {
      samePairSchedulePoll(SAME_PAIR_POLL_BASE_MS);
      return;
    }

    const url = new URL(window.location.href);
    if (!isSupportedPoolUrl(url)) {
      samePairStopPolling(true);
      return;
    }

    const root = ensureSamePairWidgetRoot();
    if (!root) {
      samePairStopPolling(true);
      return;
    }

    samePairPollInFlight = true;
    const controller = new AbortController();
    samePairAbortController = controller;

    try {
      const context = await getPoolContext();
      if (!samePairLikelyAddress(context.baseMint) || !samePairLikelyAddress(context.quoteMint)) {
        samePairSetHeader(SAME_PAIR_TITLE, "Waiting for pair data...");
        samePairSchedulePoll(1500);
        return;
      }
      const result = await samePairFetchPools(context, controller.signal);
      if (controller.signal.aborted) return;

      const signature = JSON.stringify({
        pool: context.poolAddress,
        source: result.source,
        proxy: result.usedVolumeProxy,
        items: result.items.map((item) => [
          item.poolAddress,
          item.metrics.binStep,
          item.metrics.baseFee,
          item.metrics.dynamicFee,
          item.metrics.tvl,
          item.metrics.volume5m,
          item.metrics.volume1h,
          item.metrics.volume24h,
          item.metrics.fee,
          item.metrics.apr
        ])
      });

      if (signature !== samePairLastRenderedSignature) {
        samePairLastUpdatedAt = Date.now();
        samePairRenderList(result, context);
        samePairLastRenderedSignature = signature;
      } else {
        samePairSetHeader(SAME_PAIR_TITLE, samePairStatusText());
      }

      samePairConsecutiveErrors = 0;
      samePairSchedulePoll(SAME_PAIR_POLL_BASE_MS);
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      samePairConsecutiveErrors += 1;
      const backoffMs = samePairComputeBackoffMs();
      samePairRenderError("Failed to load same-pair pools metrics.", backoffMs);
      console.debug(LOG_PREFIX, "Same-pair pools poll failed", error);
      samePairSchedulePoll(backoffMs);
    } finally {
      if (samePairAbortController === controller) {
        samePairAbortController = null;
      }
      samePairPollInFlight = false;
    }
  }

  function ensureSamePairPoolsWidget() {
    const effectiveConfig = liveExternalLinksConfig || DEFAULT_EXTERNAL_LINKS_CONFIG;
    if (!effectiveConfig.poolWidgetEnabled) {
      samePairStopPolling(true);
      return;
    }
    const url = new URL(window.location.href);
    if (!isSupportedPoolUrl(url)) {
      samePairStopPolling(true);
      samePairLastRouteKey = "";
      return;
    }

    const root = ensureSamePairWidgetRoot();
    if (!root) {
      samePairStopPolling(true);
      return;
    }

    const routeKey = `${url.pathname}${url.search}`;
    const routeChanged = routeKey !== samePairLastRouteKey;
    if (routeChanged) {
      samePairLastRouteKey = routeKey;
      samePairLastRenderedSignature = "";
      samePairLastUpdatedAt = 0;
      samePairSortState = { key: "volume5m", direction: "desc" };
      samePairResetPollingState();
      samePairRenderLoading();
      samePairSchedulePoll(0);
      return;
    }

    if (!samePairPollInFlight && samePairPollTimer === null) {
      samePairSchedulePoll(0);
    }
  }
  async function ensureMiddleExternalLinks() {
    const config = await getExternalLinksConfig();
    if (!config.enabled) {
      lastPreparedMidLinks = [];
      removeMidLinksWrap();
      return;
    }

    const enabledItems = EXTERNAL_LINK_ITEMS.filter((item) => config.links[item.key]).slice(0, MAX_DUP_EXTERNAL_LINKS);
    if (!enabledItems.length) {
      lastPreparedMidLinks = [];
      removeMidLinksWrap();
      return;
    }

    const tabsHost = findTabsListHost();
    if (!tabsHost) return;

    const source = findExternalLinksSourceHost();
    const context = await getPoolContext();
    const poolAddress = context.poolAddress || "";
    const tokenMint = chooseAxiomMint(context) || context.baseMint || context.quoteMint || "";
    const prepared = [];
    const sourceAnchorsByKey = new Map();
    if (source) {
      for (const anchor of Array.from(source.querySelectorAll("a"))) {
        if (!(anchor instanceof HTMLAnchorElement)) continue;
        const key = inferExternalLinkKeyFromHref(anchor.href || "");
        if (!key) continue;
        sourceAnchorsByKey.set(key, anchor);
      }
    }
    for (const item of enabledItems) {
      const href = resolveExternalLinkUrl(item.key, poolAddress, tokenMint);
      if (!href) continue;
      prepared.push({ label: item.label, href });
    }
    if (prepared.length) {
      lastPreparedMidLinks = prepared.slice();
    } else if (lastPreparedMidLinks.length) {
      prepared.push(...lastPreparedMidLinks);
    } else {
      return;
    }

    let wrap = document.getElementById(MID_LINKS_WRAP_ID);
    if (!(wrap instanceof HTMLDivElement)) {
      wrap = document.createElement("div");
      wrap.id = MID_LINKS_WRAP_ID;
    }
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.justifyContent = "flex-end";
    wrap.style.gap = "6px";
    wrap.style.flex = "1 1 auto";
    wrap.style.minWidth = "0";
    wrap.style.marginLeft = "0";
    wrap.style.marginRight = "0";
    wrap.style.position = "relative";
    wrap.style.zIndex = "2147483645";
    wrap.style.overflow = "visible";
    wrap.style.padding = "0 4px";
    wrap.textContent = "";

    const row = document.createElement("div");
    row.id = MID_LINKS_ROW_ID;
    row.style.display = "inline-flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "flex-end";
    row.style.gap = "6px";
    row.style.flex = "1 1 auto";
    row.style.minWidth = "0";
    row.style.maxWidth = "100%";
    row.style.overflow = "hidden";

    for (const item of prepared) {
      const a = document.createElement("a");
      a.className = MID_LINK_ANCHOR_CLASS;
      a.href = item.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.flex = "0 0 auto";
      a.style.whiteSpace = "nowrap";
      a.style.alignItems = "center";
      a.style.justifyContent = "flex-start";
      const iconWrap = document.createElement("span");
      iconWrap.style.display = "inline-flex";
      iconWrap.style.alignItems = "center";
      iconWrap.style.justifyContent = "center";
      iconWrap.style.width = "20px";
      iconWrap.style.height = "20px";
      iconWrap.style.flex = "0 0 20px";
      const sourceAnchor = sourceAnchorsByKey.get(item.key);
      if (sourceAnchor) {
        const iconEl = sourceAnchor.querySelector("img") || sourceAnchor.querySelector("div[data-sentry-component]") || sourceAnchor.querySelector("svg");
        if (iconEl instanceof HTMLElement) {
          const iconClone = iconEl.cloneNode(true);
          if (iconClone instanceof HTMLElement) {
            iconClone.removeAttribute("id");
            iconClone.style.pointerEvents = "none";
            iconClone.style.maxWidth = "20px";
            iconClone.style.maxHeight = "20px";
            iconWrap.appendChild(iconClone);
          }
        } else if (iconEl instanceof SVGElement) {
          const iconClone = iconEl.cloneNode(true);
          if (iconClone instanceof SVGElement) {
            iconClone.style.pointerEvents = "none";
            iconWrap.appendChild(iconClone);
          }
        }
      }
      if (!iconWrap.childElementCount) iconWrap.appendChild(createFallbackExternalIcon());
      a.appendChild(iconWrap);
      const span = document.createElement("span");
      span.className = "text-xs whitespace-nowrap";
      span.textContent = item.label;
      a.appendChild(span);
      row.appendChild(a);
    }
    wrap.appendChild(row);

    const moreWrap = document.createElement("div");
    moreWrap.id = MID_LINKS_MORE_WRAP_ID;
    moreWrap.style.position = "relative";
    moreWrap.style.display = "none";
    moreWrap.style.flex = "0 0 auto";
    moreWrap.style.zIndex = "2147483646";
    const moreBtn = document.createElement("button");
    moreBtn.id = MID_LINKS_MORE_BTN_ID;
    moreBtn.type = "button";
    moreBtn.textContent = "+0 \u25BE";
    moreBtn.className = "inline-flex items-center justify-between gap-1.5 rounded-md border border-v2-border-secondary bg-transparent hover:bg-v2-base-1 text-v2-text-primary transition-colors text-xsm py-1 px-2";
    moreBtn.style.whiteSpace = "nowrap";
    moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.onclick = () => {
      const portal = getOrCreateMidLinksPortalMenu();
      const isOpen = portal.style.display === "flex";
      if (isOpen) {
        portal.style.display = "none";
        moreBtn.setAttribute("aria-expanded", "false");
      } else {
        openMidLinksMenu(moreBtn);
      }
    };
    moreWrap.append(moreBtn);
    wrap.appendChild(moreWrap);

    const settingsBtn = document.createElement("button");
    settingsBtn.id = MID_LINKS_SETTINGS_BTN_ID;
    settingsBtn.type = "button";
    settingsBtn.textContent = "\u2699";
    settingsBtn.className = "inline-flex items-center justify-center rounded-md border border-v2-border-secondary bg-transparent hover:bg-v2-base-1 text-v2-text-primary transition-colors text-sm py-1 px-2";
    settingsBtn.style.marginLeft = "4px";
    settingsBtn.style.flex = "0 0 auto";
    settingsBtn.title = "Extension settings";
    settingsBtn.setAttribute("aria-label", "Extension settings");
    settingsBtn.setAttribute("aria-expanded", "false");
    settingsBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const panel = document.getElementById(MID_LINKS_SETTINGS_PANEL_ID);
      if (panel) {
        closeInlineSettingsPanel();
        return;
      }
      openInlineSettingsPanel(settingsBtn);
    });
    wrap.appendChild(settingsBtn);

    const actionsWrap = document.getElementById(ACTIONS_WRAP_ID);
    if (actionsWrap && actionsWrap.parentElement === tabsHost) {
      tabsHost.insertBefore(wrap, actionsWrap);
    } else {
      tabsHost.appendChild(wrap);
    }
    bindMidLinksGlobalEvents();
    bindMidLinksResizeObserver();
    scheduleMidLinksLayout();
  }

  async function openFromPageSellButton(sourceButton) {
    stopExitSellRelay();
    const context = await getPoolContext();
    if (sourceButton) {
      await openAxiomPopup(context, { side: "sell", anchorRect: getAnchorRect(sourceButton) });
      return;
    }
    await openAxiomPopup(context, { side: "sell" });
  }

  function ensureNewPositionAxiomButton() {
    const existing = document.getElementById(NEWPOS_BTN_ID);
    if (existing) existing.remove();
  }

  function wireNativeSellButtons() {
    const candidates = Array.from(document.querySelectorAll("button, div.rounded-full, [role='button']"));
    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.dataset.swapExtSellHooked === "1") continue;

      const directLabel = (el.textContent || "").trim().toLowerCase();
      const spanLabel = ((el.querySelector("span") && el.querySelector("span").textContent) || "").trim().toLowerCase();
      const isSell = directLabel === "sell" || spanLabel === "sell";
      if (!isSell) continue;

      el.dataset.swapExtSellHooked = "1";
      el.addEventListener("click", () => {
        openFromPageSellButton(el).catch((error) => {
        });
      });
    }
  }

  function cleanupForNonPoolPages() {
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.remove();
    const exitBtn = document.getElementById(EXIT_BTN_ID);
    if (exitBtn) exitBtn.remove();
    const newPosBtn = document.getElementById(NEWPOS_BTN_ID);
    if (newPosBtn) newPosBtn.remove();
    removeMidLinksWrap();
    samePairStopPolling(true);
    samePairLastRouteKey = "";
    isPositionLocked = false;
    pendingAnchorRect = null;
    pendingAnchorSince = 0;
    closeOverlay();
  }

  function onRouteMaybeChanged() {
    const url = new URL(window.location.href);
    if (!isSupportedPoolUrl(url)) {
      cleanupForNonPoolPages();
      return;
    }
    ensureSwapButton();
    ensureWithdrawAxiomButton();
    ensureNewPositionAxiomButton();
    ensureMiddleExternalLinks().catch(() => {});
    ensureSamePairPoolsWidget();
    // Disabled in test mode: native Sell hook causes duplicate popup opens/races.
  }

  function scheduleRouteCheck() {
    if (routeCheckTimer !== null) return;
    routeCheckTimer = window.setTimeout(() => {
      routeCheckTimer = null;
      onRouteMaybeChanged();
    }, ROUTE_CHECK_DEBOUNCE_MS);
  }

  async function syncExternalLinksSettingsIfChanged() {
    if (isExternalLinksSyncBusy) return;
    isExternalLinksSyncBusy = true;
    try {
      const config = await readExternalLinksConfigFromStorage();
      const signature = JSON.stringify(config);
      if (signature === lastExternalLinksConfigSignature) return;
      liveExternalLinksConfig = config;
      lastExternalLinksConfigSignature = signature;
      scheduleRouteCheck();
    } catch {
      // no-op
    } finally {
      isExternalLinksSyncBusy = false;
    }
  }

  function watchForAnchor() {
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
      ensureSamePairPoolsWidget();
      samePairRefreshHeaderAge();
    }, REPOSITION_INTERVAL_MS);

    window.addEventListener("resize", () => {
      const el = document.getElementById(BTN_ID);
      if (el instanceof HTMLButtonElement) applyFloatingButtonPosition(el);
    });

    window.setInterval(() => {
      void syncExternalLinksSettingsIfChanged();
    }, EXTERNAL_LINKS_SYNC_INTERVAL_MS);
  }

  function patchHistoryForSpaNavigation() {
    const push = history.pushState;
    const replace = history.replaceState;

    history.pushState = function (...args) {
      push.apply(this, args);
      window.dispatchEvent(new Event("swap-ext:urlchange"));
    };

    history.replaceState = function (...args) {
      replace.apply(this, args);
      window.dispatchEvent(new Event("swap-ext:urlchange"));
    };

    window.addEventListener("popstate", () => window.dispatchEvent(new Event("swap-ext:urlchange")));
    window.addEventListener("swap-ext:urlchange", scheduleRouteCheck);
  }

  function setupRuntimeMessageListener() {
    if (!chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") return;
      if (message.type !== "swap-ext:external-links-updated") return;
      const payload = message.payload;
      if (payload && typeof payload === "object") {
        liveExternalLinksConfig = normalizeExternalLinksConfig(payload);
        lastExternalLinksConfigSignature = JSON.stringify(liveExternalLinksConfig);
        void ensureMiddleExternalLinks();
        return;
      }
      scheduleRouteCheck();
    });
  }

  function init() {
    patchHistoryForSpaNavigation();
    setupRuntimeMessageListener();
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        const entry = changes && changes[EXTERNAL_LINKS_SETTINGS_KEY];
        if (!entry) return;
        liveExternalLinksConfig = normalizeExternalLinksConfig(entry.newValue);
        lastExternalLinksConfigSignature = JSON.stringify(liveExternalLinksConfig);
        void ensureMiddleExternalLinks();
      });
    }
    watchForAnchor();
  }

  init();
})();

