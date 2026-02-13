import type { PoolContext } from "../core/poolContext";

const ROOT_ID = "swap-ext-overlay-root";
const LOG_PREFIX = "[SWAP-EXT]";
const AXIOM_BASE_URL = "https://axiom.trade/meme/";
const DEXSCREENER_TOKEN_API = "https://api.dexscreener.com/latest/dex/tokens/";
const GECKO_TERMINAL_TOKEN_POOLS_API = "https://api.geckoterminal.com/api/v2/networks/solana/tokens/";
const PAIR_CACHE_KEY = "axiomPairCache";
const PAIR_CACHE_TTL_MS = 10 * 60 * 1000;
const FLOAT_LEFT_PX = 24;
const FLOAT_BOTTOM_PX = 24;
const FLOAT_SIZE_PX = 56;
const PANEL_GAP_PX = 15;

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
}

interface DexScreenerTokenResponse {
  pairs?: DexScreenerPair[];
}

interface GeckoTerminalPool {
  attributes?: {
    address?: string;
    reserve_in_usd?: string | number;
    volume_usd?: { h24?: string | number };
    dex_id?: string;
    transactions?: { h24?: { buys?: number; sells?: number } };
  };
}

interface GeckoTerminalPoolsResponse {
  data?: GeckoTerminalPool[];
}

interface PairCacheEntry {
  ts: number;
  pairAddress: string;
}

interface PairCacheStore {
  [tokenMint: string]: PairCacheEntry;
}

type OpenAxiomPopupResponse = {
  ok: boolean;
  error?: string;
};

type TradeSide = "buy" | "sell";

export interface PopupAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OpenAxiomPopupOptions {
  side?: TradeSide;
  anchorRect?: PopupAnchorRect;
}

function storageGet<T>(key: string): Promise<T | undefined> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result?.[key] as T | undefined));
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return Promise.resolve();
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

function chooseAxiomMint(context: PoolContext): string | null {
  const stableLike = new Set(["SOL", "USDC", "USDT"]);
  const baseSym = (context.baseSymbol || "").toUpperCase();
  const quoteSym = (context.quoteSymbol || "").toUpperCase();
  const isAllowed = (mint: string | null): mint is string => !!mint && mint !== context.poolAddress;

  if (isAllowed(context.baseMint) && !stableLike.has(baseSym)) return context.baseMint;
  if (isAllowed(context.quoteMint) && !stableLike.has(quoteSym)) return context.quoteMint;
  if (isAllowed(context.baseMint)) return context.baseMint;
  if (isAllowed(context.quoteMint)) return context.quoteMint;
  return null;
}

const AXIOM_PREFERRED_DEXES = new Set(["pumpswap", "raydium", "meteora", "orca", "pumpfun"]);

function pairScore(pair: DexScreenerPair): number {
  const liquidity = Number(pair.liquidity?.usd || 0);
  const volume24h = Number(pair.volume?.h24 || 0);
  const buys = Number(pair.txns?.h24?.buys || 0);
  const sells = Number(pair.txns?.h24?.sells || 0);
  const dexBoost = AXIOM_PREFERRED_DEXES.has((pair.dexId || "").toLowerCase()) ? 1_000_000_000 : 0;

  return dexBoost + liquidity * 100 + volume24h * 10 + (buys + sells);
}

function isLikelyPairAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

async function readPairCache(tokenMint: string): Promise<string | null> {
  const cache = await storageGet<PairCacheStore>(PAIR_CACHE_KEY);
  const entry = cache?.[tokenMint];
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

async function writePairCache(tokenMint: string, pairAddress: string): Promise<void> {
  const cache = (await storageGet<PairCacheStore>(PAIR_CACHE_KEY)) || {};
  cache[tokenMint] = {
    ts: Date.now(),
    pairAddress
  };
  await storageSet({ [PAIR_CACHE_KEY]: cache });
}

async function resolveBestPairAddress(tokenMint: string): Promise<string | null> {
  const cached = await readPairCache(tokenMint);
  if (cached) {
    console.debug(LOG_PREFIX, "Pair cache hit", { tokenMint, pairAddress: cached });
    return cached;
  }

  const tryDexScreener = async (): Promise<string | null> => {
    const res = await fetch(`${DEXSCREENER_TOKEN_API}${tokenMint}`, { credentials: "omit" });
    if (!res.ok) return null;
    const data = (await res.json()) as DexScreenerTokenResponse;
    const solPairs = (data.pairs || []).filter(
      (p) => p.chainId === "solana" && typeof p.pairAddress === "string" && isLikelyPairAddress(p.pairAddress)
    );
    if (!solPairs.length) return null;

    const best = solPairs.sort((a, b) => pairScore(b) - pairScore(a))[0];
    const bestAddress = best.pairAddress || null;
    if (!bestAddress) return null;

    console.debug(LOG_PREFIX, "Resolved best pair via DexScreener", {
      tokenMint,
      pairAddress: bestAddress,
      dexId: best.dexId,
      liquidityUsd: best.liquidity?.usd || 0
    });
    return bestAddress;
  };

  const tryGeckoTerminal = async (): Promise<string | null> => {
    const res = await fetch(`${GECKO_TERMINAL_TOKEN_POOLS_API}${tokenMint}/pools`, { credentials: "omit" });
    if (!res.ok) return null;
    const data = (await res.json()) as GeckoTerminalPoolsResponse;
    const pools = (data.data || []).filter(
      (pool) => typeof pool.attributes?.address === "string" && isLikelyPairAddress(pool.attributes.address)
    );
    if (!pools.length) return null;

    const best = pools.sort((a, b) => {
      const aPair: DexScreenerPair = {
        pairAddress: a.attributes?.address,
        dexId: a.attributes?.dex_id,
        liquidity: { usd: Number(a.attributes?.reserve_in_usd || 0) },
        volume: { h24: Number(a.attributes?.volume_usd?.h24 || 0) },
        txns: { h24: { buys: a.attributes?.transactions?.h24?.buys || 0, sells: a.attributes?.transactions?.h24?.sells || 0 } }
      };
      const bPair: DexScreenerPair = {
        pairAddress: b.attributes?.address,
        dexId: b.attributes?.dex_id,
        liquidity: { usd: Number(b.attributes?.reserve_in_usd || 0) },
        volume: { h24: Number(b.attributes?.volume_usd?.h24 || 0) },
        txns: { h24: { buys: b.attributes?.transactions?.h24?.buys || 0, sells: b.attributes?.transactions?.h24?.sells || 0 } }
      };
      return pairScore(bPair) - pairScore(aPair);
    })[0];

    const bestAddress = best.attributes?.address || null;
    if (!bestAddress) return null;

    console.debug(LOG_PREFIX, "Resolved best pair via GeckoTerminal", {
      tokenMint,
      pairAddress: bestAddress,
      dexId: best.attributes?.dex_id,
      liquidityUsd: best.attributes?.reserve_in_usd || 0
    });
    return bestAddress;
  };

  let bestAddress: string | null = null;

  try {
    bestAddress = await tryDexScreener();
  } catch (error) {
    console.debug(LOG_PREFIX, "DexScreener resolution failed", error);
  }

  if (!bestAddress) {
    try {
      bestAddress = await tryGeckoTerminal();
    } catch (error) {
      console.debug(LOG_PREFIX, "GeckoTerminal resolution failed", error);
    }
  }

  if (!bestAddress) {
    console.debug(LOG_PREFIX, "Pair resolution failed on all providers", { tokenMint });
    return null;
  }

  await writePairCache(tokenMint, bestAddress);
  return bestAddress;
}

export async function buildAxiomUrl(context: PoolContext, side: TradeSide = "buy"): Promise<string> {
  const mint = chooseAxiomMint(context);
  if (!mint) return "https://axiom.trade/?chain=sol";

  const pairAddress = await resolveBestPairAddress(mint);
  const resource = pairAddress || mint;
  const url = new URL(`${AXIOM_BASE_URL}${resource}`);
  url.searchParams.set("chain", "sol");
  if (side === "sell") {
    // Best-effort hints; ignored safely if Axiom doesn't support some keys.
    url.searchParams.set("swapExtSide", "sell");
    url.searchParams.set("side", "sell");
    url.searchParams.set("action", "sell");
    url.searchParams.set("mode", "sell");
    url.searchParams.set("tab", "sell");
    url.searchParams.set("trade", "sell");

    const outputMint = context.baseMint === mint ? context.quoteMint : context.baseMint;
    if (mint) {
      url.searchParams.set("inputMint", mint);
      url.searchParams.set("fromMint", mint);
    }
    if (outputMint) {
      url.searchParams.set("outputMint", outputMint);
      url.searchParams.set("toMint", outputMint);
    }
    url.hash = "sell";
  }
  return url.toString();
}

function computePopupPosition(anchorRect?: PopupAnchorRect): { left?: number; top?: number } {
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

function showManualOpenButton(url: string, anchorRect?: PopupAnchorRect): void {
  closeOverlay();

  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.style.position = "fixed";
  const left = Math.round(anchorRect?.left ?? FLOAT_LEFT_PX);
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

export function closeOverlay(): void {
  const existing = document.getElementById(ROOT_ID);
  if (existing) existing.remove();
}

export async function openAxiomPopup(context: PoolContext, options: OpenAxiomPopupOptions = {}): Promise<void> {
  const side = options.side || "buy";
  const url = await buildAxiomUrl(context, side);
  const pos = computePopupPosition(options.anchorRect);
  console.debug(LOG_PREFIX, "Request popup open", { url });

  try {
    const response = await new Promise<OpenAxiomPopupResponse>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "swap-ext:open-axiom-popup",
          payload: { url, left: pos.left, top: pos.top }
        },
        (res: OpenAxiomPopupResponse | undefined) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { ok: false, error: "No response from service worker" });
        }
      );
    });

    if (response.ok) return;

    console.debug(LOG_PREFIX, "Popup request failed, fallback to manual open", response.error);
    showManualOpenButton(url, options.anchorRect);
  } catch (error) {
    console.debug(LOG_PREFIX, "Popup request exception", error);
    showManualOpenButton(url, options.anchorRect);
  }
}
