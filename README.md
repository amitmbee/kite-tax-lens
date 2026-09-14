# Kite Tax Lens

A Chrome extension that overlays tax intelligence on the [Zerodha Kite](https://kite.zerodha.com) Holdings page.

---

## What it does

Indian equity taxation is non-trivial — different rates for long-term vs short-term, a ₹1,25,000 annual LTCG exemption that resets every April, and special treatment for SGBs, G-Secs, and commodity ETFs. Kite shows you your holdings; it doesn't show you what they cost you in tax.

Kite Tax Lens fills that gap:

- **LT / ST badges** on every holding — see at a glance whether selling now triggers 12.5% or 20% tax
- **Harvest wizard** — calculates exactly which stocks to sell-and-rebuy before 31 March to legally use your full ₹1,25,000 tax-free limit
- **Loss harvesting** — surfaces long-term losses you can book to offset gains
- **Free profit limit bar** — shows how much of your annual LTCG exemption you've used, synced from Console Tax P&L
- **SGB tracker** — maturity dates for all your Sovereign Gold Bonds with an early-sale warning
- **Special handling** for G-Secs (10% LTCG) and Gold/Silver ETFs (slab rate, not equity LTCG)
- **Popup dashboard** — portfolio breakdown by instrument type, accessible from the toolbar

## How it works

The extension reads data from two places, both within your own browser session — no credentials are ever shared:

1. **Kite Holdings page** — live prices, quantities, and unrealised P&L
2. **Console Holdings page** — long-term vs short-term quantity split per holding, and your realised LTCG/STCG for the current financial year from the Tax P&L API

All data is stored locally in `chrome.storage.local`. Nothing is sent anywhere.

## Installation

*(Link to Chrome Web Store listing once published)*

For manual installation:

1. Clone or download this repository
2. Go to `chrome://extensions` → enable **Developer mode**
3. Click **Load unpacked** → select the repository folder

## Usage

1. Visit [Console Holdings](https://console.zerodha.com/portfolio/holdings) once — this syncs your LT/ST split and realised LTCG for the year
2. Visit [Kite Holdings](https://kite.zerodha.com/holdings) — the overlay appears automatically
3. Click the 🍃 toolbar icon for a quick portfolio summary

Re-visit Console Holdings periodically to keep your realised LTCG figure current.

## Tax rates (FY 2025–26)

| Holding type | Condition | Tax rate |
|---|---|---|
| Equity (LT) | Held > 1 year | 12.5% above ₹1,25,000 |
| Equity (ST) | Held ≤ 1 year | 20% |
| SGB | Held to maturity | 0% |
| SGB | Sold early on exchange | 12.5% LTCG |
| G-Sec | Held > 1 year | 10% |
| Gold / Silver ETF | Any | Slab rate |

*Rates reflect the Finance Act 2023 and July 2024 Union Budget changes.*

## Privacy

All data stays on your device. See the full [privacy policy](https://amitmbee.github.io/kite-tax-lens/privacy.html).

## Disclaimer

This extension is for **informational purposes only** and does not constitute financial, tax, or investment advice. Consult a qualified Chartered Accountant or tax professional before making any investment or tax-related decisions.

- Gain estimates use blended average cost. Holdings acquired before 31 January 2018 use a grandfathered cost basis (FMV as of that date) — actual LTCG may differ from what is shown.
- Tax rates and exemption limits are based on the Finance Act 2023 and July 2024 Union Budget and are subject to change by Parliament. Verify current rates before relying on any figures.
- This extension is not registered with SEBI and does not provide investment advice. Sell/rebuy suggestions are purely illustrative of tax optimisation mechanics — they are not recommendations to trade any specific security.
- Always verify your tax liability against your official Zerodha Console Tax P&L report and your ITR before filing.
- This extension is not affiliated with, endorsed by, or in any way connected to Zerodha Broking Ltd.
