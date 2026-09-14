# Loading the Extension in Chrome

## Step 1 — Load unpacked

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this repository folder

The extension icon appears in the toolbar.

## Step 2 — Sync LT data from Console

1. Open `https://console.zerodha.com/portfolio/holdings`
2. Wait for the holdings table to fully load
3. The content script runs automatically and syncs:
   - LT vs ST quantity split per holding
   - Realised LTCG / STCG for the current financial year

Re-visit Console whenever you want fresh realised P&L figures.

## Step 3 — Use the overlay on Kite

1. Open `https://kite.zerodha.com/holdings`
2. The tax panel appears above the holdings table showing:
   - Hero: estimated tax saving available
   - Harvest wizard: exact stocks and quantities to sell before 31 March
   - Loss harvesting: LT losses that can offset gains
   - Free profit limit bar: how much of the ₹1,25,000 LTCG exemption is used
   - Portfolio at a glance: breakdown by instrument type
3. Each row in the holdings table shows an LT / ST / SGB / Govt Bond / Commodity ETF badge

## Running tests

```bash
npm install
npm test
```

Tests cover all pure functions in `lib/tax.js` — instrument detection, calcTaxData,
buildHarvestWizard, FY boundaries, and symbol resolution.

## Debugging

- Open DevTools → Application → Storage → Local Storage on any Kite page to inspect `ktl_console`
- `console.log` is suppressed by Kite in production; use `document.title = 'debug value'` instead
- Paste `demo-data.js` in the DevTools console on the Holdings page to inject fake portfolio
  data for screenshots — refresh to restore real data
