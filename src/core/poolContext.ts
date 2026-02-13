export type Cluster = "mainnet-beta" | "devnet" | "testnet" | string;

export interface PoolContext {
  poolAddress: string | null;
  baseMint: string | null;
  quoteMint: string | null;
  baseSymbol?: string;
  quoteSymbol?: string;
  cluster?: Cluster;
}

const LOG_PREFIX = "[SWAP-EXT]";
const BASE58_MINT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
const CACHE_KEY = "poolContextCache";
const CACHE_TTL_MS = 10 * 60 * 1000;

interface PoolContextCacheEntry {
  ts: number;
  value: PoolContext;
}

interface PoolContextCacheStore {
  [poolAddress: string]: PoolContextCacheEntry;
}

function parsePoolAddressFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const dlmmIndex = parts.findIndex((p) => p.toLowerCase() === "dlmm");
  if (dlmmIndex === -1) return null;
  return parts[dlmmIndex + 1] ?? null;
}

function parseCluster(url: URL): Cluster {
  const cluster = url.searchParams.get("cluster") || url.searchParams.get("network");
  return cluster || "mainnet-beta";
}

function readMint(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && BASE58_MINT_RE.test(value)) return value;
  }
  return null;
}

function readSymbol(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length <= 16) return value;
  }
  return undefined;
}

function isMintCandidate(value: string | null, poolAddress: string): boolean {
  return !!value && value !== poolAddress && BASE58_MINT_RE.test(value);
}

async function tryApiStrategy(poolAddress: string): Promise<Partial<PoolContext> | null> {
  const endpoint = `https://dlmm-api.meteora.ag/pair/${poolAddress}`;
  try {
    const res = await fetch(endpoint, { credentials: "omit" });
    if (!res.ok) return null;
    const json = await res.json();
    const payload = (json && (json.data || json.pair || json)) as Record<string, unknown>;

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

async function storageGet<T>(key: string): Promise<T | undefined> {
  if (typeof chrome === "undefined" || !chrome.storage?.local || !chrome.runtime?.id) return undefined;
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          console.debug(LOG_PREFIX, "storageGet failed", chrome.runtime.lastError.message);
          resolve(undefined);
          return;
        }
        resolve(result?.[key] as T | undefined);
      });
    } catch (error) {
      console.debug(LOG_PREFIX, "storageGet exception", error);
      resolve(undefined);
    }
  });
}

async function storageSet(values: Record<string, unknown>): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local || !chrome.runtime?.id) return;
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) {
          console.debug(LOG_PREFIX, "storageSet failed", chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (error) {
      console.debug(LOG_PREFIX, "storageSet exception", error);
      resolve();
    }
  });
}

async function readPoolContextCache(poolAddress: string): Promise<PoolContext | null> {
  const store = await storageGet<PoolContextCacheStore>(CACHE_KEY);
  if (!store?.[poolAddress]) return null;

  const entry = store[poolAddress];
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    delete store[poolAddress];
    await storageSet({ [CACHE_KEY]: store });
    return null;
  }

  console.debug(LOG_PREFIX, "Cache hit for pool", poolAddress);
  return entry.value;
}

async function writePoolContextCache(context: PoolContext): Promise<void> {
  if (!context.poolAddress || !context.baseMint || !context.quoteMint) return;

  const store = (await storageGet<PoolContextCacheStore>(CACHE_KEY)) || {};
  store[context.poolAddress] = {
    ts: Date.now(),
    value: context
  };
  await storageSet({ [CACHE_KEY]: store });
}

function findMintsInObject(root: unknown): { baseMint: string; quoteMint: string } | null {
  const queue: unknown[] = [root];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;

    const obj = current as Record<string, unknown>;
    const baseMint = readMint(obj, ["mint_x", "token_x_mint", "tokenXMint", "baseMint", "token0Mint"]);
    const quoteMint = readMint(obj, ["mint_y", "token_y_mint", "tokenYMint", "quoteMint", "token1Mint"]);

    if (baseMint && quoteMint) return { baseMint, quoteMint };

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return null;
}

function tryNextDataStrategy(): Partial<PoolContext> | null {
  const script = document.querySelector("script#__NEXT_DATA__");
  if (!script?.textContent) return null;

  try {
    const parsed = JSON.parse(script.textContent);
    const mints = findMintsInObject(parsed);
    if (!mints) return null;
    return { baseMint: mints.baseMint, quoteMint: mints.quoteMint };
  } catch {
    return null;
  }
}

function tryDomStrategy(poolAddress: string): Partial<PoolContext> | null {
  const text = document.body?.innerText || "";
  const candidates = text.match(new RegExp(BASE58_MINT_RE, "g")) || [];
  const unique = Array.from(new Set(candidates)).filter((candidate) => candidate !== poolAddress);
  if (unique.length < 2) return null;

  if (!isMintCandidate(unique[0], poolAddress) || !isMintCandidate(unique[1], poolAddress)) return null;

  return {
    baseMint: unique[0],
    quoteMint: unique[1]
  };
}

export async function getPoolContext(): Promise<PoolContext> {
  const url = new URL(window.location.href);
  const poolAddress = parsePoolAddressFromUrl(url);
  const cluster = parseCluster(url);

  if (!poolAddress) {
    console.debug(LOG_PREFIX, "Pool address not found in URL", url.href);
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
  if (apiResult?.baseMint && apiResult?.quoteMint) {
    const context = { poolAddress, cluster, ...apiResult };
    await writePoolContextCache(context);
    return context;
  }

  const nextDataResult = tryNextDataStrategy();
  if (nextDataResult?.baseMint && nextDataResult?.quoteMint) {
    const context = { poolAddress, cluster, ...nextDataResult };
    await writePoolContextCache(context);
    return context;
  }

  const domResult = tryDomStrategy(poolAddress);
  if (domResult?.baseMint && domResult?.quoteMint) {
    const context = { poolAddress, cluster, ...domResult };
    await writePoolContextCache(context);
    return context;
  }

  return { poolAddress, baseMint: null, quoteMint: null, cluster };
}
