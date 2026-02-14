const ROOT_ID = "swap-ext-overlay-root";
const LOG_PREFIX = "[SWAP-EXT]";
const AXIOM_BASE_URL = "https://axiom.trade/meme/";
const AXIOM_REF_SEGMENT = "@112233444";
const DEXSCREENER_TOKEN_API = "https://api.dexscreener.com/latest/dex/tokens/";
const GECKO_TERMINAL_TOKEN_POOLS_API = "https://api.geckoterminal.com/api/v2/networks/solana/tokens/";
const PAIR_CACHE_KEY = "axiomPairCache";
const PAIR_CACHE_TTL_MS = 2 * 60 * 1000;
const FLOAT_LEFT_PX = 24;
const FLOAT_BOTTOM_PX = 24;
const FLOAT_SIZE_PX = 56;
const PANEL_GAP_PX = 15;
const AXIOM_PREFERRED_DEXES = new Set(["pumpswap", "raydium", "meteora", "orca", "pumpfun"]);

function storageGet(key) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local || !chrome.runtime || !chrome.runtime.id)
    return Promise.resolve(undefined);
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
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local || !chrome.runtime || !chrome.runtime.id)
    return Promise.resolve();
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
    const solPairs = (data.pairs || []).filter(
      (p) => p.chainId === "solana" && typeof p.pairAddress === "string" && isLikelyPairAddress(p.pairAddress)
    );
    if (!solPairs.length) return null;

    const filtered =
      preferredCounterMint && isLikelyPairAddress(preferredCounterMint)
        ? solPairs.filter((p) => matchesCounterMint(p, tokenMint, preferredCounterMint))
        : [];
    const candidatePairs = filtered.length ? filtered : solPairs;
    const best = candidatePairs.sort((a, b) => pairScore(b) - pairScore(a))[0];
    const bestAddress = best.pairAddress || null;
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

export async function buildAxiomUrl(context) {
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

export function closeOverlay() {
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

export async function openAxiomPopup(context) {
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

