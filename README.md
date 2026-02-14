# Meteora Axiom Button Extension (MV3)

Chrome extension that injects a floating **Axiom** button on Meteora DLMM pages and opens Axiom in a popup window for fast trading flow.

## Features

- Injects a custom button on Meteora DLMM pool pages.
- Extracts pool context (`poolAddress`, `baseMint`, `quoteMint`, optional symbols/cluster).
- Resolves a best-liquidity Solana pair (DexScreener/GeckoTerminal fallback) before opening Axiom.
- Opens Axiom in a popup window (`420x720`).
- Reuses existing Axiom popup on repeated clicks (focus + URL update, no duplicate windows).
- Handles SPA navigation on Meteora.
- Uses robust logging with `[SWAP-EXT]` prefix.

## Project Structure

- `manifest.json` — extension manifest (MV3)
- `src/` — source files
- `dist/` — runtime files currently loaded by manifest
- `icons/` — extension and button assets
- `docs/` — ADR and test/checklist docs

## Load Locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open a Meteora DLMM URL, for example:
   - `https://app.meteora.ag/dlmm/<POOL_ADDRESS>?referrer=home`

## Behavior Notes

- If a Jupiter anchor is found, the button is positioned relative to Jupiter.
- If not found, fallback positioning is used.
- You can tune UI values through `localStorage.swapExtUi` (advanced/debug mode).

## Permissions

- `storage` — local settings and cache.
- `windows` — create/focus popup window.
- Host permissions:
  - `https://app.meteora.ag/*`
  - `https://axiom.trade/*`
  - `https://api.dexscreener.com/*`
  - `https://api.geckoterminal.com/*`
  - `https://dlmm-api.meteora.ag/*`

## Development Notes

- Current manifest loads scripts from `dist/`.
- Keep `src/` and `dist/` in sync unless build tooling is added.

## Disclaimer

Use at your own risk. Always verify token/pair details before signing transactions.
