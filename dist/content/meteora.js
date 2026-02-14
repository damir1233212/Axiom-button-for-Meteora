(() => {
  const LOG_PREFIX = "[SWAP-EXT]";
  const BTN_ID = "swap-ext-meteora-btn";
  const EXIT_BTN_ID = "swap-ext-withdraw-axiom-btn";
  const ROOT_ID = "swap-ext-overlay-root";
  const FLOAT_LEFT_PX = 24;
  const FLOAT_BOTTOM_PX = 31;
  const FLOAT_SIZE_PX = 42;
  const BTN_GAP_PX = 15;
  const REPOSITION_INTERVAL_MS = 1200;
  const PANEL_GAP_PX = 15;
  const AXIOM_ICON_PATH = "icons/axiom-btn.png";
  const UI_CONFIG_KEY = "swapExtUi";
  const TRIGGER_AUTO_SELL_ALL = "swap-ext:trigger-auto-sell-all";
  let LAST_POSITION_MODE = null;
  let isPositionLocked = false;
  let routeCheckTimer = null;
  let lastSellWireAt = 0;
  const ROUTE_CHECK_DEBOUNCE_MS = 400;
  const SELL_WIRE_INTERVAL_MS = 5000;

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
    if (!anchorRect) return {};

    const CHROME_X = Math.max(0, window.outerWidth - window.innerWidth);
    const CHROME_Y = Math.max(0, window.outerHeight - window.innerHeight);
    const viewportLeft = window.screenX + Math.floor(CHROME_X / 2);
    const viewportTop = window.screenY + CHROME_Y;
    const POPUP_W = 420;
    const POPUP_H = 720;
    const GAP = 15;

    let left = Math.round(viewportLeft + anchorRect.right + GAP);
    let top = Math.round(viewportTop + anchorRect.bottom - POPUP_H);
    if (left + POPUP_W > window.screenX + window.screen.availWidth) {
      left = Math.round(viewportLeft + Math.max(0, anchorRect.left - GAP - POPUP_W));
    }
    if (top < window.screenY) top = window.screenY;
    if (top + POPUP_H > window.screenY + window.screen.availHeight) {
      top = Math.max(window.screenY, window.screenY + window.screen.availHeight - POPUP_H);
    }
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
      const viaBrand = branded.closest("div.fixed.bottom-6.left-6");
      if (viaBrand instanceof HTMLElement) return viaBrand;
    }

    const fixedRoot = findInAllRoots("div.fixed.bottom-6.left-6");
    return fixedRoot instanceof HTMLElement ? fixedRoot : null;
  }

  function findJupiterPrimaryButton() {
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

  function applyFloatingButtonPosition(btn) {
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
      (void 0) && console.debug(LOG_PREFIX, "Button fixed position", {
        left: btn.style.left,
        bottom: btn.style.bottom
      });
      LAST_POSITION_MODE = "fixed";
    }
    isPositionLocked = true;
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
      await openAxiomPopup(context, { side: "sell", anchorRect: getAnchorRect(btn) });
    };
  }

  function findWithdrawCloseAllButton() {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const btn of buttons) {
      if (!(btn instanceof HTMLButtonElement)) continue;
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text === "withdraw & close all") return btn;
    }
    return null;
  }

  function clickElement(el) {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  async function runWithdrawAndAxiomFlow(triggerBtn, withdrawBtn) {
    if (triggerBtn.dataset.swapExtBusy === "1") return;
    triggerBtn.dataset.swapExtBusy = "1";
    const previousText = triggerBtn.textContent || "Exit to Axiom";
    triggerBtn.textContent = "Processing...";
    triggerBtn.disabled = true;

    try {
      const context = await getPoolContext();

      if (withdrawBtn) {
        clickElement(withdrawBtn);
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
      window.setTimeout(() => {
        chrome.runtime.sendMessage({ type: TRIGGER_AUTO_SELL_ALL }, () => {
          // no-op
        });
      }, 3000);
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

  function ensureWithdrawAxiomButton() {
    const withdrawBtn = findWithdrawCloseAllButton();
    const existing = document.getElementById(EXIT_BTN_ID);
    if (!withdrawBtn) {
      if (existing) existing.remove();
      return;
    }
    const host = withdrawBtn && withdrawBtn.parentElement;
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
  }

  async function openFromPageSellButton(sourceButton) {
    const context = await getPoolContext();
    if (sourceButton) {
      await openAxiomPopup(context, { side: "sell", anchorRect: getAnchorRect(sourceButton) });
      return;
    }
    await openAxiomPopup(context, { side: "sell" });
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
    isPositionLocked = false;
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
    // Disabled in test mode: native Sell hook causes duplicate popup opens/races.
  }

  function scheduleRouteCheck() {
    if (routeCheckTimer !== null) return;
    routeCheckTimer = window.setTimeout(() => {
      routeCheckTimer = null;
      onRouteMaybeChanged();
    }, ROUTE_CHECK_DEBOUNCE_MS);
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
    }, REPOSITION_INTERVAL_MS);

    window.addEventListener("resize", () => {
      const el = document.getElementById(BTN_ID);
      if (el instanceof HTMLButtonElement) applyFloatingButtonPosition(el);
    });
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

  function init() {
    patchHistoryForSpaNavigation();
    watchForAnchor();
  }

  init();
})();

