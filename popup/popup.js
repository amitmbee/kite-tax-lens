(function () {
  'use strict';
  // Pure tax functions (isSGB, inr, resolveConsoleEntry, etc.) come from lib/tax.js,
  // loaded before this script in popup.html.

  function el(id) { return document.getElementById(id); }

  function glanceRow(dotClass, label, value, valueCls, rate) {
    const row = document.createElement('div');
    row.className = 'glance-row';
    row.innerHTML = `
      <span class="glance-dot ${dotClass}"></span>
      <span class="glance-label">${label}</span>
      <span class="glance-val ${valueCls}">${value}</span>
      <span class="glance-rate">${rate}</span>
    `;
    return row;
  }

  function renderHealth(h, hasKiteData, hasConsoleData) {
    const row = el('health-row');
    if (!row) return;
    const TWO_HOURS = 7200000;
    const recentError = h?.last_error && (Date.now() - h.last_error.at) < TWO_HOURS;

    let dotClass, msg;
    if (recentError) {
      // A real JS crash — this is the only thing that makes it red
      dotClass = 'health-err';
      msg = `Error in ${h.last_error.source}: ${h.last_error.msg}`;
    } else if (!hasConsoleData) {
      dotClass = 'health-warn';
      msg = 'Console not synced — open Console Holdings once';
    } else if (!hasKiteData) {
      dotClass = 'health-warn';
      msg = 'Visit Kite Holdings to load portfolio data';
    } else {
      dotClass = 'health-ok';
      msg = `All systems OK${h?.ext_version ? ' · v' + h.ext_version : ''}`;
    }

    row.style.display = 'flex';
    row.className = 'health-row';
    row.innerHTML = `<span class="health-dot ${dotClass}"></span><span>${msg}</span>`;
  }

  chrome.storage.local.get(['ktl_console_holdings', 'ktl_console_taxpnl', 'ktl_kite_holdings', 'ktl_kite_fetched_at', 'ktl_health'], data => {
    const consoleHoldings = data.ktl_console_holdings?.holdings || null;
    const taxPnl          = data.ktl_console_taxpnl            || null;
    const kiteHoldings    = data.ktl_kite_holdings             || null;
    const kiteFetchedAt   = data.ktl_kite_fetched_at           || null;

    if (!consoleHoldings && !taxPnl && !kiteHoldings) {
      el('loading').style.display = 'none';
      el('no-data').style.display = 'block';
      return;
    }

    el('loading').style.display = 'none';
    el('content').style.display = 'block';

    // FY label
    if (taxPnl?.fy) {
      const [a, b] = taxPnl.fy.split('_');
      el('fy-label').textContent = `FY ${a}–${b}`;
    }

    // ── Free limit section ──────────────────────────────────
    const realisedLTCG = taxPnl?.realised_ltcg || 0;
    const headroom     = Math.max(0, LTCG_EXEMPTION - realisedLTCG);
    const usedPct      = Math.min(100, Math.round((realisedLTCG / LTCG_EXEMPTION) * 100));
    el('limit-bar').style.width = usedPct + '%';
    el('limit-used').textContent = inr(realisedLTCG) + ' used';
    el('limit-sub').textContent  = inr(headroom) + ' still free this year';

    // ── Glance rows ─────────────────────────────────────────
    const glance = el('glance-rows');

    if (kiteHoldings) {
      let equityLTGain = 0, equityLTLoss = 0, stGain = 0;
      let sgbGain = 0, govtSecGain = 0, commodityGain = 0;

      kiteHoldings.forEach(h => {
        const sym   = h.tradingsymbol;
        const entry = resolveConsoleEntry(sym, consoleHoldings);

        const totalQty = h.quantity;
        const ltQty    = entry?.lt_qty ?? totalQty;
        const stQty    = Math.max(0, totalQty - ltQty);
        const pnl      = h.pnl;
        const ltG      = totalQty > 0 ? (ltQty / totalQty) * pnl : 0;
        const stG      = totalQty > 0 ? (stQty / totalQty) * pnl : 0;

        if (isSGB(sym)) {
          sgbGain += pnl;
        } else if (isGovtSec(sym)) {
          govtSecGain += pnl;
        } else if (isCommodityETF(sym)) {
          commodityGain += pnl;
        } else {
          if (ltG > 0) equityLTGain += ltG;
          if (ltG < 0) equityLTLoss += ltG;
          if (stG > 0) stGain += stG;
        }
      });

      if (equityLTGain > 0)
        glance.appendChild(glanceRow('dot-lt', 'Held over 1 year', inr(equityLTGain) + ' gains', 'pos', '12.5% tax above ₹1.25L'));
      if (equityLTLoss < 0)
        glance.appendChild(glanceRow('dot-loss', 'Long-term losses', '−' + inr(equityLTLoss), 'neg', 'Can offset gains'));
      if (stGain > 0)
        glance.appendChild(glanceRow('dot-st', 'Held < 1 year', inr(stGain) + ' gains', 'neg', '20% tax if sold'));
      if (sgbGain > 0)
        glance.appendChild(glanceRow('dot-sgb', 'Gold Bonds (SGB)', inr(sgbGain) + ' gains', 'pos', '0% at maturity'));
      if (govtSecGain !== 0)
        glance.appendChild(glanceRow('dot-gsec', 'Govt Securities', inr(Math.abs(govtSecGain)) + (govtSecGain > 0 ? ' gains' : ' loss'), govtSecGain > 0 ? 'pos' : 'neg', '10% LTCG · coupon at slab'));
      if (commodityGain !== 0)
        glance.appendChild(glanceRow('dot-commodity', 'Gold / Silver ETFs', inr(Math.abs(commodityGain)) + (commodityGain > 0 ? ' gains' : ' loss'), commodityGain > 0 ? 'pos' : 'neg', 'Slab-rate tax'));

    } else {
      const p = document.createElement('div');
      p.style.cssText = 'font-size:12px;color:#aaa;padding:4px 0';
      p.textContent = 'Visit Kite Holdings to load portfolio data.';
      glance.appendChild(p);
    }

    // ── SGB list ────────────────────────────────────────────
    const sgbs = kiteHoldings?.filter(h => isSGB(h.tradingsymbol)) || [];
    if (sgbs.length) {
      el('sgb-section').style.display = 'block';
      const container = el('sgb-rows');
      sgbs.forEach(h => {
        const maturity = parseSGBMaturity(h.tradingsymbol);
        const label    = maturity
          ? maturity.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
          : '?';
        const row = document.createElement('div');
        row.className = 'sgb-row';
        row.innerHTML = `
          <span class="sgb-sym">${h.tradingsymbol.replace(/-GB$/, '')}</span>
          <span class="sgb-maturity">Matures ${label}</span>
          <span class="sgb-val">${h.quantity} units</span>
        `;
        container.appendChild(row);
      });
    }

    // ── Console sync notice ──────────────────────────────────
    if (!taxPnl) el('notice-console').style.display = 'block';

    // ── Kite data staleness warning ──────────────────────────
    const kiteAgeH = kiteFetchedAt ? Math.round((Date.now() - kiteFetchedAt) / 3600000) : null;
    if (kiteAgeH !== null && kiteAgeH >= 24) {
      const notice = el('notice-console');
      notice.style.display = 'block';
      notice.textContent = `⏰ Portfolio prices are ${kiteAgeH}h old — visit Kite Holdings for fresh data.`;
    }

    // ── Health status — derived from actual data, not stale flags ───
    renderHealth(data.ktl_health || null, !!kiteHoldings, !!taxPnl);
  });
})();
