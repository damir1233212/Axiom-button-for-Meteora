# Manual test checklist

- Load unpacked extension from this folder in Chrome (`chrome://extensions`).
- Open a DLMM page (`https://app.meteora.ag/dlmm/<POOL>?referrer=...`) and verify a `Swap` button appears.
- Click `Swap` and verify overlay opens with parsed `poolAddress`, `baseMint`, `quoteMint`, `cluster`.
- Verify clicking `Swap` opens an extension popup window (`420x720`) on `axiom.trade` for the selected pool token.
- If popup creation fails, verify in-page fallback button `Open Axiom` appears and opens `axiom.trade`.
- Verify URL path uses pair address (best-liquidity pair) instead of raw token CA when available.
- Navigate between Meteora routes without full reload and verify button appears/disappears correctly.
- Use at least 3 pools, including SOL/USDC and non-standard symbol pools.
- Verify logs are grouped with `[SWAP-EXT]` in DevTools console.
- Confirm no duplicate button after repeated route changes.
- With Phantom installed, verify wallet flow works in the opened Axiom tab.
- Verify extraction fallback by throttling network / blocking `dlmm-api.meteora.ag` and checking NEXT_DATA/DOM fallback.
- Test malformed pool URL (`/dlmm/invalid`) and ensure no uncaught errors.
- Check pages with large numbers/symbol edge cases and confirm overlay text remains stable.
