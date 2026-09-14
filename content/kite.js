// Runs on kite.zerodha.com — overlays tax intelligence on the Holdings page.
// Data sources:
//   1. /oms/portfolio/holdings  — live prices, quantities, pnl (same-origin fetch)
//   2. chrome.storage.local     — LT qty data synced from Console
//   3. chrome.storage.local     — realized LTCG/STCG synced from Console
// Pure tax functions (isSGB, calcTaxData, etc.) live in lib/tax.js, loaded before this.

(function () {
  'use strict';

  const STORAGE_HOLDINGS  = 'ktl_console_holdings';
  const STORAGE_TAXPNL    = 'ktl_console_taxpnl';
  const STALE_MS          = 24 * 60 * 60 * 1000; // 24 hours
  // BEACON_URL, writeHealth, sendErrorBeacon come from lib/shared.js

  // ── Storage helper ────────────────────────────────────────────────
  function getStorage(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }

  // ── Kite Holdings data — read from page-intercepted fetch ────────
  // kite-interceptor.js (MAIN world) patches window.fetch and writes the
  // holdings response to both sessionStorage and window.postMessage.
  // We read sessionStorage first (catches data fetched before this script
  // ran), then fall back to waiting for the postMessage.

  const SS_KEY = '__ktl_holdings';

  function cacheForPopup(data) {
    if (!data.length) return;
    const slim = data.map(({ tradingsymbol, quantity, average_price, last_price, pnl,
                              collateral_quantity, t1_quantity }) =>
      ({ tradingsymbol, quantity, average_price, last_price, pnl,
         collateral_quantity, t1_quantity })
    );
    chrome.storage.local.set({ ktl_kite_holdings: slim, ktl_kite_fetched_at: Date.now() });
  }

  function getHoldingsFromSessionStorage() {
    try {
      const raw = window.sessionStorage.getItem(SS_KEY);
      if (!raw) return null;
      const json = JSON.parse(raw);
      return json?.status === 'success' ? json.data : null;
    } catch (_) {
      return null;
    }
  }

  function waitForHoldingsMessage() {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 15000);

      function handler(e) {
        if (e.source !== window || e.data?._ktl !== 'holdings') return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        const data = e.data.data;
        resolve(data?.status === 'success' ? data.data : null);
      }

      window.addEventListener('message', handler);
    });
  }

  async function getKiteHoldings() {
    // Fast path: already in sessionStorage from a fetch that beat us
    const cached = getHoldingsFromSessionStorage();
    if (cached) {
      cacheForPopup(cached);
      writeHealth({ kite_intercept_ok: true, ext_version: chrome.runtime.getManifest().version });
      return cached;
    }
    // Slow path: wait for the next fetch (Vue router navigation, refetch)
    const data = await waitForHoldingsMessage();
    if (data) {
      cacheForPopup(data);
      writeHealth({ kite_intercept_ok: true, ext_version: chrome.runtime.getManifest().version });
    } else {
      writeHealth({ kite_intercept_ok: false });
    }
    return data || [];
  }

  // ── Badge HTML per holding ────────────────────────────────────────
  function badgeHTML(h) {
    if (h.isSGB) {
      const maturity = formatSGBMaturity(h.tradingsymbol);
      return `<span class="ktl-badge ktl-sgb" title="Sovereign Gold Bond — 100% tax-free only if held to maturity (${esc(maturity || 'check date')}). Selling on exchange before maturity is taxed at 12.5% LTCG.">Gold Bond${maturity ? ' · ' + esc(maturity) : ''}</span>`;
    }
    if (h.isGovtSec) {
      return `<span class="ktl-badge ktl-gsec" title="Government Security — held over 1 year, taxed at 10% if sold">Govt Bond</span>`;
    }
    if (h.isCommodityETF) {
      return `<span class="ktl-badge ktl-commodity" title="Gold/Silver ETF — taxed at slab rate, not equity LTCG. Check Console Tax P&amp;L for actual liability.">Commodity ETF</span>`;
    }
    if (h.stQty === 0) {
      return `<span class="ktl-badge ktl-lt" title="Held over 1 year — taxed at 12.5% only above ₹1.25L limit">Long term ✓</span>`;
    }
    if (h.ltQty === 0) {
      return `<span class="ktl-badge ktl-st" title="Held less than 1 year — taxed at 20% if sold now">High tax if sold</span>`;
    }
    return `<span class="ktl-badge ktl-mix" title="${h.ltQty} shares held &gt;1yr (low tax) · ${h.stQty} shares held &lt;1yr (high tax)">${h.ltQty} long / ${h.stQty} short</span>`;
  }

  // ── Summary panel HTML ────────────────────────────────────────────
  function summaryPanelHTML(taxData, taxPnl) {
    // Equity LT/ST (exclude SGBs, GovtSec, and commodity ETFs — all have different tax rules)
    const equityLT     = taxData.filter(h => !h.isSGB && !h.isGovtSec && !h.isCommodityETF);
    const equityLTGain = equityLT.reduce((s, h) => s + (h.ltGain > 0 ? h.ltGain : 0), 0);
    const equityLTLoss = equityLT.reduce((s, h) => s + (h.ltGain < 0 ? h.ltGain : 0), 0);
    const stGain       = equityLT.reduce((s, h) => s + (h.stGain > 0 ? h.stGain : 0), 0);
    const sgbGain       = taxData.filter(h => h.isSGB).reduce((s, h) => s + h.pnl, 0);
    const govtSecGain   = taxData.filter(h => h.isGovtSec).reduce((s, h) => s + h.pnl, 0);
    const commodityGain = taxData.filter(h => h.isCommodityETF).reduce((s, h) => s + h.pnl, 0);

    const realisedLTCG   = taxPnl?.realised_ltcg || 0;
    const headroom       = Math.max(0, LTCG_EXEMPTION - realisedLTCG);
    const usedPct        = Math.min(100, Math.round((realisedLTCG / LTCG_EXEMPTION) * 100));
    const hasConsoleSync = taxPnl !== null;
    const fyLabel        = currentFYLabel(taxPnl);
    const deadline       = `31 Mar ${deadlineYear()}`;

    // Stale data check — warn if Console was last synced > 24h ago
    const fetchedAt = taxPnl?.fetched_at;
    const ageMs     = fetchedAt ? Date.now() - fetchedAt : null;
    const isStale   = ageMs !== null && ageMs > STALE_MS;
    const ageHours  = ageMs !== null ? Math.round(ageMs / 3600000) : null;

    const wizard        = buildHarvestWizard(taxData, realisedLTCG);
    const totalHarvest  = wizard.suggestions.reduce((s, x) => s + x.gain, 0);
    const taxSaving     = Math.round(totalHarvest * LTCG_RATE);
    const totalProceeds = wizard.suggestions.reduce((s, x) => s + x.totalValue, 0);

    // Loss harvesting — LT holdings with unrealised losses
    const ltLossHoldings = taxData
      .filter(h => h.ltQty > 0 && h.ltGain < 0 && !h.isSGB && !h.isGovtSec)
      .sort((a, b) => a.ltGain - b.ltGain); // biggest loss first
    const totalLTLoss        = ltLossHoldings.reduce((s, h) => s + h.ltGain, 0);
    const lossHarvestSaving  = Math.round(Math.abs(totalLTLoss) * LTCG_RATE);

    // ── Hero section ─────────────────────────────────────
    const heroHTML = wizard.suggestions.length && taxSaving > 0 && hasConsoleSync
      ? `<div class="ktl-hero">
          <div class="ktl-hero-saving">💰 You can save <strong>${inr(taxSaving)}</strong> in taxes this year</div>
          <div class="ktl-hero-sub">Sell &amp; rebuy a few stocks before ${deadline} · takes 5 minutes</div>
        </div>`
      : headroom <= 0 && hasConsoleSync
        ? (function() {
            const excess = Math.max(0, realisedLTCG - LTCG_EXEMPTION);
            const taxOwed = Math.round(excess * LTCG_RATE);
            return excess > 0
              ? `<div class="ktl-hero ktl-hero-done">⚠️ You've exceeded the ₹1.25L limit by ${inr(excess)} — estimated LTCG tax owed: <strong>${inr(taxOwed)}</strong></div>`
              : `<div class="ktl-hero ktl-hero-done">✅ You've used your full ₹1.25L annual tax-free limit — well done!</div>`;
          })()
        : !hasConsoleSync
          ? `<div class="ktl-hero ktl-hero-warn">⚠️ Sync Console to unlock personalized harvest recommendations</div>`
          : `<div class="ktl-hero ktl-hero-neutral">No gains available to harvest right now.</div>`;

    // ── Sell action section ───────────────────────────────
    // Blocked when Console not synced — recommending without realised LTCG data
    // could cause user to over-harvest and breach the ₹1.25L exemption limit.
    const actionHTML = !hasConsoleSync
      ? `<div class="ktl-section">
          <div class="ktl-section-title">HARVEST WIZARD</div>
          <div class="ktl-wizard-blocked">
            <strong>Console sync required before showing sell recommendations.</strong><br>
            Without knowing how much LTCG you've already realised this year, we can't
            safely calculate how much more you can harvest — you could accidentally exceed
            the ₹1.25L exemption and owe tax on the overage.<br><br>
            <a href="https://console.zerodha.com/portfolio/holdings" target="_blank">Open Console Holdings to sync →</a>
          </div>
        </div>`
      : wizard.suggestions.length
        ? `<div class="ktl-section">
            <div class="ktl-section-title">WHAT TO SELL BEFORE ${deadline.toUpperCase()}</div>
            <table class="ktl-action-table">
              <thead>
                <tr>
                  <th>Stock</th><th>Shares to sell</th><th>You receive</th><th>Tax-free profit</th>
                </tr>
              </thead>
              <tbody>
                ${wizard.suggestions.map(s => `
                  <tr>
                    <td class="ktl-act-sym">${esc(s.symbol)}${s.restrictedQty > 0 ? `<span class="ktl-act-note" title="${s.restrictedQty} shares excluded — pledged as collateral or unsettled (T+1)"> · ${s.restrictedQty} excluded</span>` : ''}</td>
                    <td class="ktl-act-qty">${s.shares}</td>
                    <td class="ktl-act-val">${inr(s.totalValue)}</td>
                    <td class="ktl-act-gain">+${inr(s.gain)}</td>
                  </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2" class="ktl-act-foot-label">Total</td>
                  <td class="ktl-act-foot">${inr(totalProceeds)}</td>
                  <td class="ktl-act-foot">+${inr(totalHarvest)}</td>
                </tr>
              </tfoot>
            </table>
            <div class="ktl-action-tip">
              After selling, <strong>immediately rebuy</strong> the same stocks to keep your position unchanged.
              This resets your purchase price and legally uses your ₹1,25,000 annual tax-free profit limit
              before it expires on 31 March.
            </div>
          </div>`
        : '';

    // ── Loss harvesting section ───────────────────────────
    // Only show if there are LT losses AND there are gains to offset
    const lossHTML = ltLossHoldings.length && (realisedLTCG > 0 || totalHarvest > 0) && hasConsoleSync
      ? `<div class="ktl-section">
          <div class="ktl-section-title">ALSO CONSIDER: BOOK LOSSES TO OFFSET GAINS</div>
          <div class="ktl-loss-intro">
            Selling these stocks realises losses that offset your long-term gains — legally reducing your taxable LTCG.
            Potential additional tax saving: <strong class="ktl-pos">${inr(lossHarvestSaving)}</strong>
          </div>
          <table class="ktl-action-table">
            <thead>
              <tr>
                <th>Stock</th><th>LT shares</th><th>Unrealised loss</th><th>Tax saving</th>
              </tr>
            </thead>
            <tbody>
              ${ltLossHoldings.map(h => `
                <tr>
                  <td class="ktl-act-sym">${esc(h.tradingsymbol)}</td>
                  <td class="ktl-act-qty">${h.ltQty}</td>
                  <td class="ktl-act-loss">${inrSigned(h.ltGain)}</td>
                  <td class="ktl-act-saving">${inr(Math.abs(h.ltGain) * LTCG_RATE)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" class="ktl-act-foot-label">Total loss</td>
                <td class="ktl-act-loss ktl-act-foot">${inrSigned(totalLTLoss)}</td>
                <td class="ktl-act-saving ktl-act-foot">${inr(lossHarvestSaving)}</td>
              </tr>
            </tfoot>
          </table>
          <div class="ktl-action-tip">
            Book these losses before 31 March, then rebuy immediately to maintain your position.
            LT losses first offset LT gains; any excess carries forward to next FY.
          </div>
        </div>`
      : '';

    // ── Free limit section ────────────────────────────────
    const staleNotice = isStale
      ? `<div class="ktl-stale-notice">⏰ Console data is ${ageHours}h old — <a href="https://console.zerodha.com/portfolio/holdings" target="_blank">refresh Console</a> for accurate figures.</div>`
      : '';

    const limitHTML = `<div class="ktl-section">
        <div class="ktl-section-title">YOUR FREE PROFIT LIMIT (resets every April)</div>
        <div class="ktl-limit-row">
          <span class="ktl-limit-used">${inr(realisedLTCG)} used</span>
          <span class="ktl-limit-total">limit: ${inr(LTCG_EXEMPTION)}</span>
        </div>
        <div class="ktl-progress-bar">
          <div class="ktl-progress-fill" style="width:${usedPct}%"></div>
        </div>
        <div class="ktl-limit-sub">${inr(headroom)} still free to use this year</div>
        ${!hasConsoleSync
          ? `<div class="ktl-sync-notice">⚠️ <a href="https://console.zerodha.com/portfolio/holdings" target="_blank">Open Console Holdings</a> once so we can see what you've sold this year.</div>`
          : staleNotice}
      </div>`;

    // ── At a glance section ───────────────────────────────
    const glanceHTML = `<div class="ktl-section ktl-glance">
        <div class="ktl-section-title">YOUR PORTFOLIO AT A GLANCE</div>
        <div class="ktl-glance-row">
          <span class="ktl-glance-dot ktl-dot-lt"></span>
          <span class="ktl-glance-label">Held over 1 year</span>
          <span class="ktl-glance-val ${equityLTGain > 0 ? 'ktl-pos' : ''}">${inr(equityLTGain)} gains</span>
          <span class="ktl-glance-rate">12.5% tax above ₹1.25L limit</span>
        </div>
        ${equityLTLoss < 0 ? `<div class="ktl-glance-row">
          <span class="ktl-glance-dot ktl-dot-loss"></span>
          <span class="ktl-glance-label">Long-term losses</span>
          <span class="ktl-glance-val ktl-neg">${inrSigned(equityLTLoss)}</span>
          <span class="ktl-glance-rate">Can offset gains</span>
        </div>` : ''}
        ${stGain > 0 ? `<div class="ktl-glance-row">
          <span class="ktl-glance-dot ktl-dot-st"></span>
          <span class="ktl-glance-label">Held less than 1 year</span>
          <span class="ktl-glance-val ktl-neg">${inr(stGain)} gains</span>
          <span class="ktl-glance-rate">20% tax if sold now — wait if possible</span>
        </div>` : ''}
        ${sgbGain > 0 ? `<div class="ktl-glance-row">
          <span class="ktl-glance-dot ktl-dot-sgb"></span>
          <span class="ktl-glance-label">Gold Bonds (SGBs)</span>
          <span class="ktl-glance-val ktl-pos">${inr(sgbGain)} gains</span>
          <span class="ktl-glance-rate">0% at maturity · early sale = 12.5% LTCG</span>
        </div>` : ''}
        ${govtSecGain !== 0 ? `<div class="ktl-glance-row">
          <span class="ktl-glance-dot ktl-dot-gsec"></span>
          <span class="ktl-glance-label">Govt Securities</span>
          <span class="ktl-glance-val ${govtSecGain > 0 ? 'ktl-pos' : 'ktl-neg'}">${inr(Math.abs(govtSecGain))} ${govtSecGain > 0 ? 'gains' : 'loss'}</span>
          <span class="ktl-glance-rate">10% LTCG if sold · interest taxed at slab</span>
        </div>` : ''}
        ${commodityGain !== 0 ? `<div class="ktl-glance-row">
          <span class="ktl-glance-dot ktl-dot-commodity"></span>
          <span class="ktl-glance-label">Gold / Silver ETFs</span>
          <span class="ktl-glance-val ${commodityGain > 0 ? 'ktl-pos' : 'ktl-neg'}">${inr(Math.abs(commodityGain))} ${commodityGain > 0 ? 'gains' : 'loss'}</span>
          <span class="ktl-glance-rate">Slab-rate tax · not LTCG</span>
        </div>` : ''}
      </div>`;

    // ── Disclaimer ────────────────────────────────────────
    // Pre-2018 grandfathering: Zerodha uses Jan 31, 2018 FMV as cost basis for older
    // lots, not the original purchase price. average_price in the API is the actual
    // purchase average — so LT gain estimates for holdings bought before 2018 may differ.
    const disclaimerHTML = `<div class="ktl-disclaimer">
        ℹ️ Gain estimates use blended average cost. Holdings acquired before 31 Jan 2018 use
        a grandfathered cost basis — actual LTCG may differ. Verify with your Console Tax P&amp;L
        before trading.
      </div>`;

    return `
      <div id="ktl-panel">
        <div class="ktl-header">
          <span class="ktl-logo">🍃 Kite Tax Lens</span>
          <span class="ktl-fy">${fyLabel}</span>
        </div>
        ${heroHTML}
        ${actionHTML}
        ${lossHTML}
        ${limitHTML}
        ${glanceHTML}
        ${disclaimerHTML}
      </div>
    `;
  }

  // ── DOM injection ────────────────────────────────────────────────
  //
  // Actual Kite Holdings table structure (verified from live page):
  //   <th class="instrument right-border sticky sortable">Instrument</th>
  //   <td class="instrument right-border sticky pos-relative">
  //     <a href="" class="initial"><span>754GS2036</span></a>
  //   </td>

  function extractSymbolFromCell(td) {
    // Symbol is the text of the first span inside the anchor link
    const span = td.querySelector('a span');
    if (span) return span.textContent.trim();
    // Fallback: first whitespace-delimited token
    return td.textContent.trim().split(/\s+/)[0];
  }

  function injectBadges(taxData) {
    const bySymbol = {};
    taxData.forEach(h => { bySymbol[h.tradingsymbol] = h; });

    document.querySelectorAll('td.instrument').forEach(td => {
      if (td.querySelector('.ktl-badge')) return;

      const sym = extractSymbolFromCell(td);
      if (!sym || !bySymbol[sym]) return;

      const h     = bySymbol[sym];
      const badge = document.createElement('span');
      badge.innerHTML = badgeHTML(h);
      td.appendChild(badge);
    });
  }

  function injectSummaryPanel(taxData, taxPnl) {
    const existing = document.getElementById('ktl-panel');
    if (existing) existing.remove();

    // The Kite holdings table header has class 'instrument' on the th
    const instrumentTh = document.querySelector('th.instrument');
    if (!instrumentTh) return;

    const table  = instrumentTh.closest('table');
    const parent = table?.parentElement;
    if (!parent) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = summaryPanelHTML(taxData, taxPnl);
    parent.insertBefore(wrapper.firstElementChild, table);
  }

  // Re-inject badges when Vue re-renders rows (e.g. after sort)
  function watchTableForRerenders(taxData) {
    const tbody = document.querySelector('th.instrument')
      ?.closest('table')
      ?.querySelector('tbody');
    if (!tbody) return;

    let debounce = null;
    const tableObserver = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => injectBadges(taxData), 80);
    });
    tableObserver.observe(tbody, { childList: true, subtree: false });
  }

  // ── Main ─────────────────────────────────────────────────────────
  let injected = false;

  async function run() {
    try {
      await _run();
    } catch (e) {
      writeHealth({ last_error: { msg: e.message, source: 'kite', at: Date.now() } });
      sendErrorBeacon('kite', e.message);
    }
  }

  async function _run() {
    if (!location.pathname.includes('/holdings')) return;

    const [kiteHoldings, stored] = await Promise.all([
      getKiteHoldings(),
      getStorage([STORAGE_HOLDINGS, STORAGE_TAXPNL]),
    ]);

    if (!kiteHoldings.length) return;

    const consoleData = stored[STORAGE_HOLDINGS] || null;
    const taxPnl      = stored[STORAGE_TAXPNL]   || null;
    const taxData     = calcTaxData(kiteHoldings, consoleData);

    function tryInject() {
      if (document.querySelector('th.instrument')) {
        injectSummaryPanel(taxData, taxPnl);
        injectBadges(taxData);
        watchTableForRerenders(taxData);
        injected = true;
        writeHealth({ kite_inject_ok: true, kite_inject_at: Date.now() });
      }
    }

    tryInject();
    if (!injected) {
      const observer = new MutationObserver(() => {
        if (document.querySelector('th.instrument')) {
          observer.disconnect();
          tryInject();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        if (!injected && location.pathname.includes('/holdings')) {
          const msg = 'Holdings table not found — Kite may have updated their layout';
          writeHealth({ kite_inject_ok: false, last_error: { msg, source: 'kite', at: Date.now() } });
          sendErrorBeacon('kite', msg);
        }
      }, 30000);
    }
  }

  // Handle Vue SPA navigation (pushState without page reload)
  let lastPath = location.pathname;
  let navDebounce = null;
  const navObserver = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      injected = false;
      if (location.pathname.includes('/holdings')) {
        clearTimeout(navDebounce);
        navDebounce = setTimeout(run, 800);
      }
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  run();
})();
