const LOG_PREFIX = "[SWAP-EXT]";
const BASE58_MINT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

function parsePoolAddressFromUrl(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const dlmmIndex = parts.findIndex((p) => p.toLowerCase() === "dlmm");
  if (dlmmIndex === -1) return null;
  return parts[dlmmIndex + 1] ?? null;
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
    const payload = (json && (json.data || json.pair || json));

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

function tryDomStrategy() {
  const text = document.body?.innerText || "";
  const candidates = text.match(new RegExp(BASE58_MINT_RE, "g")) || [];
  const unique = Array.from(new Set(candidates));
  if (unique.length < 2) return null;

  return {
    baseMint: unique[0],
    quoteMint: unique[1]
  };
}

export async function getPoolContext() {
  const url = new URL(window.location.href);
  const poolAddress = parsePoolAddressFromUrl(url);
  const cluster = parseCluster(url);

  if (!poolAddress) {
    console.debug(LOG_PREFIX, "Pool address not found in URL", url.href);
    return { poolAddress: null, baseMint: null, quoteMint: null, cluster };
  }

  const apiResult = await tryApiStrategy(poolAddress);
  if (apiResult?.baseMint && apiResult?.quoteMint) {
    return { poolAddress, cluster, ...apiResult };
  }

  const nextDataResult = tryNextDataStrategy();
  if (nextDataResult?.baseMint && nextDataResult?.quoteMint) {
    return { poolAddress, cluster, ...nextDataResult };
  }

  const domResult = tryDomStrategy();
  if (domResult?.baseMint && domResult?.quoteMint) {
    return { poolAddress, cluster, ...domResult };
  }

  return { poolAddress, baseMint: null, quoteMint: null, cluster };
}