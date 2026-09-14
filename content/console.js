// Runs on console.zerodha.com/portfolio/holdings
// Reads LT qty per holding from the rendered DOM and stores to chrome.storage.local.
// Also fetches the Tax P&L API (same-origin) and stores realized LTCG/STCG.

(function () {
  'use strict';

  const STORAGE_KEY_HOLDINGS = 'ktl_console_holdings';
  const STORAGE_KEY_TAXPNL   = 'ktl_console_taxpnl';
  // BEACON_URL, writeHealth, sendErrorBeacon come from lib/shared.js

  // ------------------------------------------------------------------
  // 1. Tax P&L — fetch from Console API
  // ------------------------------------------------------------------
  function getCsrfToken() {
    return document.cookie.match(/public_token=([^;]+)/)?.[1] || '';
  }

  async function fetchTaxPnl() {
    const now = new Date();
    // Zerodha FY: April–March. FY2026-27 = "2026_2027"
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fy = `${fyStart}_${fyStart + 1}`;

    // Determine quarters elapsed so far in this FY
    const fyMonth = (now.getMonth() - 3 + 12) % 12; // 0 = April
    const toQ = fyMonth < 3 ? 'Q1' : fyMonth < 6 ? 'Q2' : fyMonth < 9 ? 'Q3' : 'Q4';

    try {
      const res = await fetch(
        `/api/reports/taxpnl?fy=${fy}&from_quarter=Q1&to_quarter=${toQ}`,
        { headers: { 'X-CSRFToken': getCsrfToken() } }
      );
      const json = await res.json();
      if (json.status === 'success') {
        const eq = json.data?.result?.EQ || {};
        const payload = {
          fy,
          realised_ltcg: eq.long_term_profit  || 0,
          realised_stcg: eq.short_term_profit  || 0,
          charges:       eq.charges            || 0,
          fetched_at:    Date.now(),
        };
        chrome.storage.local.set({ [STORAGE_KEY_TAXPNL]: payload });
        writeHealth({ console_sync_ok: true, console_sync_at: Date.now() });
      } else {
        const msg = 'taxpnl: ' + (json.message || 'API error');
        writeHealth({ console_sync_ok: false, last_error: { msg, source: 'console', at: Date.now() } });
        sendErrorBeacon('console', msg);
      }
    } catch (e) {
      writeHealth({ console_sync_ok: false, last_error: { msg: e.message, source: 'console', at: Date.now() } });
      sendErrorBeacon('console', e.message);
    }
  }

  // ------------------------------------------------------------------
  // 2. Holdings LT data — parse rendered Console DOM
  // ------------------------------------------------------------------
  function parseHoldingsFromDOM() {
    const rows = document.querySelectorAll('tbody tr');
    if (!rows.length) return null;

    const holdings = {};

    rows.forEach(row => {
      const symbolEl = row.querySelector('span.symbol');
      if (!symbolEl) return;

      const symbol = symbolEl.textContent.trim();
      if (!symbol) return;

      // Total qty is in the second <td>
      const tds = row.querySelectorAll('td');
      const totalQty = tds.length >= 2 ? parseFloat(tds[1].textContent.trim().replace(/,/g, '')) || 0 : 0;

      // LT qty from longterm-flag span
      const ltFlagEl = row.querySelector('span.status-flag.longterm-flag');
      let ltQty = 0;
      if (ltFlagEl) {
        // Text content is " <img> 500 " — get the number after stripping tags
        const text = ltFlagEl.textContent.trim().replace(/,/g, '');
        ltQty = parseInt(text, 10) || 0;
      }

      holdings[symbol] = {
        total_qty: totalQty,
        lt_qty:    ltQty,
        st_qty:    Math.max(0, totalQty - ltQty),
      };
    });

    return Object.keys(holdings).length ? holdings : null;
  }

  function saveHoldings(holdings) {
    chrome.storage.local.set({
      [STORAGE_KEY_HOLDINGS]: {
        holdings,
        fetched_at: Date.now(),
      },
    });
  }

  // ------------------------------------------------------------------
  // 3. Wait for table to render, then extract
  // ------------------------------------------------------------------
  function waitForTable(callback) {
    // Already rendered
    if (document.querySelector('tbody tr span.symbol')) {
      callback();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector('tbody tr span.symbol')) {
        observer.disconnect();
        callback();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Safety timeout: 30s
    setTimeout(() => observer.disconnect(), 30000);
  }

  // ------------------------------------------------------------------
  // Run
  // ------------------------------------------------------------------
  fetchTaxPnl();

  waitForTable(() => {
    // Small delay to let Vue finish rendering all rows
    setTimeout(() => {
      const holdings = parseHoldingsFromDOM();
      if (holdings) {
        saveHoldings(holdings);
      } else {
        writeHealth({ console_sync_ok: false, last_error: { msg: 'Holdings DOM parse returned no rows', source: 'console', at: Date.now() } });
      }
    }, 500);
  });
})();
