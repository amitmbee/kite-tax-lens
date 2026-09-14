# Loading the Extension in Chrome

## Step 1 — Load unpacked

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this folder: `kite-extension/`

The extension icon (blue square) appears in the toolbar.

## Step 2 — Sync LT data from Console

1. Open `https://console.zerodha.com/portfolio/holdings`
2. Wait for the page to fully load (the holdings table must be visible)
3. The extension's content script runs automatically and syncs your LT qty data
4. Also syncs realized LTCG/STCG for this FY from the Tax P&L API

You only need to do this once per session (or whenever you want fresh data).

## Step 3 — Use the overlay on Kite

1. Open `https://kite.zerodha.com/holdings`
2. The tax panel appears above the holdings table with:
   - Unrealised LTCG / STCG
   - Realized LTCG this FY + remaining exemption
   - Harvest Wizard (exact shares to sell)
3. Each holding row shows an LT/ST/SGB badge

## Debugging

- Open DevTools → Console on kite.zerodha.com to see any errors
- Check `chrome.storage.local` in DevTools → Application → Storage to verify Console data synced

## What the Harvest Wizard shows on your portfolio

```
Remaining LTCG headroom: ₹1,11,997  (₹1,25,000 − ₹13,003 realised)

  Sell 406 shares of TATAPOWER    gain: ₹1,11,902   @ ₹365/sh
  Sell   1 share  of SILVERIETF  gain: ₹135         @ ₹226/sh
                                  ─────────────────
  Total LTCG to realise: ₹1,12,037   ✅ Within exemption
```

Selling these before March 31 would use your full ₹1,25,000 LTCG exemption tax-free.
