// Pure tax calculation functions.
// Loaded as a content script (exposes globals) and require()'d by the test suite.
'use strict';

// ── Constants ───────────────────────────────────────────────────────────
var LTCG_EXEMPTION = 125000;
var LTCG_RATE      = 0.125;  // 12.5% post July-2024 Union Budget
var STCG_RATE      = 0.20;   // 20% post July-2024 Union Budget

var SGB_MONTH_MAP = {
  JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6,
  JUL:7, AUG:8, SEP:9, OC:10, NOV:11, DEC:12,
  DE:12, // Zerodha uses 'DE' as alternate abbreviation for December
};

// ── Instrument classification ────────────────────────────────────────────
function isSGB(symbol) {
  return /^SGB[A-Z]{2,3}\d{2}/.test(symbol);
}

function isGovtSec(symbol) {
  return /^\d{3}GS\d{4}/.test(symbol) || symbol.endsWith('-GS');
}

function isCommodityETF(symbol) {
  // Gold/Silver ETFs: taxed at slab rate per Finance Act 2023, not equity LTCG
  return /GOLD|SILVER/.test(symbol) && /(ETF|BEES)/.test(symbol);
}

// ── SGB maturity ─────────────────────────────────────────────────────────
function parseSGBMaturity(symbol) {
  // Handles: SGBAUG28V, SGBJAN29IX-GB, SGBOC28VII-GB, SGBDE31III
  var m = symbol.replace(/-GB$/, '').match(/^SGB([A-Z]{2,3})(\d{2})/);
  if (!m) return null;
  var month = SGB_MONTH_MAP[m[1]];
  var year  = 2000 + parseInt(m[2], 10);
  if (!month || !year) return null;
  return new Date(year, month - 1, 1);
}

function formatSGBMaturity(symbol) {
  var d = parseSGBMaturity(symbol);
  if (!d) return null;
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

// ── Utilities ────────────────────────────────────────────────────────────
function safeNum(v) {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inr(n) {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function inrSigned(n) {
  return (n < 0 ? '−' : '+') + inr(n);
}

// ── Symbol normalisation ──────────────────────────────────────────────────
// Kite and Console use different suffixes for the same instrument.
function resolveConsoleEntry(sym, consoleHoldings) {
  if (!consoleHoldings) return undefined;
  var entry = consoleHoldings[sym]
    || consoleHoldings[sym + '-GS']
    || consoleHoldings[sym + '-E']
    || consoleHoldings[sym + '-GB'];
  if (!entry) {
    // Strip NSE settlement-group and instrument-type suffixes
    var stripped = sym.replace(/(-GS|-E|-GB|-B|-T|-S|-Z)$/, '');
    if (stripped !== sym) entry = consoleHoldings[stripped];
  }
  return entry;
}

// ── Core tax calculations ─────────────────────────────────────────────────
function calcTaxData(kiteHoldings, consoleData) {
  var consoleHoldings = (consoleData && consoleData.holdings) || {};

  return kiteHoldings.map(function(h) {
    var sym          = h.tradingsymbol;
    var consoleEntry = resolveConsoleEntry(sym, consoleHoldings);

    var totalQty   = safeNum(h.quantity);
    var ltQty      = safeNum(consoleEntry != null ? consoleEntry.lt_qty : totalQty);
    // Fallback: if no Console data, assume all shares are LT
    if (!consoleEntry) ltQty = totalQty;
    var stQty      = Math.max(0, totalQty - ltQty);
    var pledgedQty = safeNum(h.collateral_quantity);
    var t1Qty      = safeNum(h.t1_quantity);

    var availableToSell = Math.max(0, totalQty - pledgedQty - t1Qty);
    var sellableLtQty   = Math.min(ltQty, availableToSell);

    var pnl         = safeNum(h.pnl);
    var ltGain      = totalQty > 0 ? (ltQty / totalQty) * pnl : 0;
    var stGain      = totalQty > 0 ? (stQty / totalQty) * pnl : 0;
    var perSharePnl = totalQty > 0 ? pnl / totalQty : 0;

    return {
      tradingsymbol:  sym,
      quantity:       totalQty,
      average_price:  safeNum(h.average_price),
      last_price:     safeNum(h.last_price),
      pnl:            pnl,
      ltQty:          ltQty,
      stQty:          stQty,
      ltGain:         ltGain,
      stGain:         stGain,
      perSharePnl:    perSharePnl,
      pledgedQty:     pledgedQty,
      t1Qty:          t1Qty,
      sellableLtQty:  sellableLtQty,
      isSGB:          isSGB(sym),
      isGovtSec:      isGovtSec(sym),
      isCommodityETF: isCommodityETF(sym),
      hasConsole:     !!consoleEntry,
    };
  });
}

function buildHarvestWizard(taxData, realisedLTCG) {
  var headroom = LTCG_EXEMPTION - realisedLTCG;
  if (headroom <= 0) return { headroom: 0, suggestions: [], remaining: 0 };

  var eligible = taxData
    .filter(function(h) {
      return h.sellableLtQty > 0 && h.ltGain > 0 && !h.isSGB && !h.isGovtSec && !h.isCommodityETF;
    })
    .sort(function(a, b) { return b.ltGain - a.ltGain; }); // largest gain first

  var suggestions = [];
  var remaining   = headroom;

  for (var i = 0; i < eligible.length; i++) {
    var h = eligible[i];
    if (remaining <= 0) break;
    if (h.perSharePnl <= 0) continue;

    // floor — never exceed the remaining headroom
    var sharesToSell = Math.min(
      h.sellableLtQty,
      Math.floor(remaining / h.perSharePnl)
    );
    if (sharesToSell <= 0) continue;

    var gainFromSell = sharesToSell * h.perSharePnl;
    suggestions.push({
      symbol:        h.tradingsymbol,
      shares:        sharesToSell,
      gain:          gainFromSell,
      ltp:           h.last_price,
      totalValue:    sharesToSell * h.last_price,
      restrictedQty: h.ltQty - h.sellableLtQty,
    });
    remaining -= gainFromSell;
  }

  return { headroom: headroom, suggestions: suggestions, remaining: Math.max(0, remaining) };
}

// ── FY helpers ───────────────────────────────────────────────────────────
function currentFY(now) {
  // Zerodha FY runs April–March
  var d     = now || new Date();
  var start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { start: start, end: start + 1, label: 'Apr ' + start + ' – Mar ' + (start + 1) };
}

function currentFYLabel(taxPnl, now) {
  var raw = taxPnl && taxPnl.fy;
  if (raw) {
    var parts = raw.split('_');
    return 'Apr ' + parts[0] + ' – Mar ' + parts[1];
  }
  return currentFY(now).label;
}

function deadlineYear(now) {
  return currentFY(now).end;
}

// ── Node.js export (tests) ───────────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    LTCG_EXEMPTION: LTCG_EXEMPTION,
    LTCG_RATE:      LTCG_RATE,
    STCG_RATE:      STCG_RATE,
    SGB_MONTH_MAP:  SGB_MONTH_MAP,
    isSGB:             isSGB,
    isGovtSec:         isGovtSec,
    isCommodityETF:    isCommodityETF,
    parseSGBMaturity:  parseSGBMaturity,
    formatSGBMaturity: formatSGBMaturity,
    safeNum:           safeNum,
    esc:               esc,
    inr:               inr,
    inrSigned:         inrSigned,
    resolveConsoleEntry: resolveConsoleEntry,
    calcTaxData:       calcTaxData,
    buildHarvestWizard: buildHarvestWizard,
    currentFY:         currentFY,
    currentFYLabel:    currentFYLabel,
    deadlineYear:      deadlineYear,
  };
}
