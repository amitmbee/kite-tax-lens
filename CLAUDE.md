# Kite Tax Lens — Claude Code Guide

## What this is

A Chrome MV3 extension that overlays tax intelligence on the Zerodha Kite Holdings page.
It reads live holding data from Kite and LT/ST split + realised P&L from Console,
then shows tax badges, a harvest wizard, loss harvesting suggestions, and a free-limit bar.

## Architecture

```
lib/shared.js        Extension utilities — writeHealth(), sendErrorBeacon() (no-op)
lib/tax.js           Pure tax functions — single source of truth, UMD, also runs in Node for tests
content/kite.js      Main overlay injected on kite.zerodha.com/holdings
content/console.js   Syncs LT/ST data + realised LTCG from console.zerodha.com
content/kite-interceptor.js  Intercepts XHR to patch holdings data before kite.js sees it
popup/popup.html     Toolbar popup
popup/popup.js       Popup logic — reads chrome.storage.local
styles/overlay.css   All overlay styles
icons/               icon16/48/128.png
tests/tax.test.js    Jest unit tests for lib/tax.js
```

**Load order matters** (defined in manifest.json content_scripts):
- Kite: `lib/shared.js → lib/tax.js → content/kite.js`
- Console: `lib/shared.js → content/console.js`

`lib/shared.js` and `lib/tax.js` use top-level `var` so their exports are globals within
the content script isolated world — no module system, no bundler.

## Tax rules implemented

| Instrument | Detection | LTCG rate | STCG rate | Notes |
|---|---|---|---|---|
| Equity | default | 12.5% | 20% | ₹1,25,000 annual exemption |
| SGB | `/^SGB[A-Z]{2,3}\d{2}/` | 0% at maturity | 12.5% | Tax-free only at RBI maturity |
| G-Sec | `/^\d{3}GS\d{4}/` | 10% | Slab | Coupon taxed at slab rate |
| Commodity ETF | GOLD or SILVER + ETF/BEES | Slab | Slab | Not equity LTCG |

LTCG exemption: ₹1,25,000. Rates from Finance Act 2024 (July 2024 Budget).

## Key functions in lib/tax.js

- `calcTaxData(holdings, consoleData)` — annotates each holding with ltQty, stQty, ltGain, stGain, flags
- `buildHarvestWizard(taxData, realisedLTCG)` — returns sell suggestions within headroom
- `resolveConsoleEntry(sym, db)` — matches Kite symbols to Console symbols (handles -GS, -GB, -E suffixes)
- `isSGB(sym)`, `isGovtSec(sym)`, `isCommodityETF(sym)` — instrument detection
- `currentFY(now?)`, `currentFYLabel(taxPnl?, now?)`, `deadlineYear(now?)` — FY helpers

## Data flow

1. User visits `console.zerodha.com/portfolio/holdings`
   - `console.js` intercepts the Tax P&L API response
   - Writes `{ holdings, realisedLTCG, realisedSTCG, fy }` to `chrome.storage.local` as `ktl_console`

2. User visits `kite.zerodha.com/holdings`
   - `kite-interceptor.js` intercepts the holdings XHR
   - `kite.js` reads `ktl_console` from storage + live holdings
   - Calls `calcTaxData()` then `buildHarvestWizard()`
   - Injects overlay HTML above the holdings table

## Development commands

```bash
npm test           # run Jest unit tests
npm run test:watch # watch mode
node --check content/kite.js   # syntax check without running
```

## Extension CSS classes

All overlay elements use `ktl-` prefix. Key classes:

```
.ktl-header            Overlay header bar
.ktl-section           Each collapsible section
.ktl-section-title     Section heading
.ktl-action-table      Harvest / loss tables
.ktl-badge             Per-row instrument badge (ktl-lt / ktl-st / ktl-mix / ktl-sgb / ktl-gsec / ktl-commodity)
.ktl-glance-row        "At a glance" instrument category rows
.ktl-limit-used        Free profit limit — used amount
.ktl-progress-fill     Progress bar fill element
.ktl-pos / .ktl-neg    Green / red text
```

## Chrome storage keys

| Key | Written by | Contains |
|---|---|---|
| `ktl_console` | console.js | `{ holdings, realisedLTCG, realisedSTCG, fy, syncedAt }` |
| `ktl_health` | shared.js | `{ lastSync, version, ... }` |

## What NOT to do

- Never add `console.debug()` or `console.log()` calls — Kite overrides `console.log` in production
- Never use `chrome.storage.sync` — holdings data is too large; always use `.local`
- Never send financial data (holdings, gains, quantities) externally
- Never add duplicate function definitions — `lib/tax.js` is the single source of truth for all tax logic
- Never use `:first-of-type` / `:last-of-type` on class selectors — use `querySelectorAll()[n]`
- Do not add `// Co-Authored-By` to commits

## Screenshot / demo workflow

Use `demo-data.js` — paste it in DevTools console on kite.zerodha.com/holdings to inject
fake portfolio data for screenshots. Refreshing the page restores real data.
Note: `console.log` is suppressed by Kite in production; use `document.title` for debugging.

## Building the extension ZIP

```bash
zip -r kite-tax-lens-v1.x.x.zip \
  manifest.json \
  lib/shared.js lib/tax.js \
  content/kite.js content/console.js content/kite-interceptor.js \
  popup/popup.html popup/popup.js \
  styles/overlay.css \
  icons/icon16.png icons/icon48.png icons/icon128.png
```

Only the files above ship in the extension. `demo-data.js`, `icon-generator.html`,
`store-screenshots/`, and `tests/` are development artefacts and must not be zipped.

## Privacy

Zero data collection. `sendErrorBeacon()` is a no-op stub in v1.1.0+.
All data stays in `chrome.storage.local` on the user's device.
