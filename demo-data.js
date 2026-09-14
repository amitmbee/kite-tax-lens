// Paste in DevTools console on kite.zerodha.com/holdings
// Refresh the page to restore real data.

(function () {
  try {
  var log = (window.console.log || function(){}).bind(window.console);

  // ── Helpers ──────────────────────────────────────────────────────
  var INR_SYM = '₹';   // ₹
  var MINUS   = '−';   // −

  function inr(n) {
    return INR_SYM + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  function inrSigned(n) { return (n < 0 ? MINUS : '+') + inr(n); }
  function isSGB(s)          { return /^SGB[A-Z]{2,3}\d{2}/.test(s); }
  function isGovtSec(s)      { return /^\d{3}GS\d{4}/.test(s) || s.endsWith('-GS'); }
  function isCommodityETF(s) { return /GOLD|SILVER/.test(s) && /(ETF|BEES)/.test(s); }

  var SGB_MONTHS = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,
                     JUL:7,AUG:8,SEP:9,OC:10,NOV:11,DEC:12,DE:12 };
  function sgbLabel(sym) {
    var m = sym.replace(/-GB$/, '').match(/^SGB([A-Z]{2,3})(\d{2})/);
    if (!m) return null;
    var mo = SGB_MONTHS[m[1]], yr = 2000 + parseInt(m[2], 10);
    if (!mo) return null;
    return new Date(yr, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  // ── Fake portfolio — all instrument categories ───────────────────
  var raw = [
    // Equity — long term gainers
    { sym:'HDFCBANK',   qty:50,   avg:1524.00, ltp:1683.45, lt:50,  st:0   },
    { sym:'RELIANCE',   qty:25,   avg:2341.00, ltp:2886.20, lt:25,  st:0   },
    { sym:'INFY',       qty:100,  avg:1452.00, ltp:1621.30, lt:100, st:0   },
    { sym:'TCS',        qty:15,   avg:3198.00, ltp:3847.60, lt:15,  st:0   },
    { sym:'ICICIBANK',  qty:60,   avg:742.00,  ltp:1245.80, lt:60,  st:0   },
    { sym:'AXISBANK',   qty:45,   avg:848.00,  ltp:1187.30, lt:45,  st:0   },
    { sym:'MARUTI',     qty:8,    avg:8450.00, ltp:11240.00,lt:8,   st:0   },
    { sym:'BAJFINANCE', qty:20,   avg:5120.00, ltp:7340.00, lt:20,  st:0   },
    { sym:'POWERGRID',  qty:300,  avg:182.00,  ltp:298.40,  lt:300, st:0   },
    { sym:'NTPC',       qty:200,  avg:156.00,  ltp:352.70,  lt:200, st:0   },
    { sym:'HINDUNILVR', qty:30,   avg:2340.00, ltp:2680.50, lt:30,  st:0   },
    // Equity — mixed LT/ST
    { sym:'KOTAKBANK',  qty:40,   avg:1782.00, ltp:1923.10, lt:35,  st:5   },
    { sym:'LTIM',       qty:12,   avg:4200.00, ltp:5640.00, lt:8,   st:4   },
    // Equity — long term losses
    { sym:'TITAN',      qty:20,   avg:3105.00, ltp:2890.50, lt:20,  st:0   },
    { sym:'NESTLEIND',  qty:5,    avg:2380.00, ltp:2110.00, lt:5,   st:0   },
    // Equity — short term only (high tax)
    { sym:'WIPRO',      qty:200,  avg:412.00,  ltp:498.35,  lt:0,   st:200 },
    { sym:'ONGC',       qty:150,  avg:168.00,  ltp:247.60,  lt:0,   st:150 },
    // Equity ETFs (index funds — equity treatment)
    { sym:'NIFTYBEES',  qty:50,   avg:196.00,  ltp:249.80,  lt:50,  st:0   },
    { sym:'BANKBEES',   qty:30,   avg:432.00,  ltp:523.40,  lt:30,  st:0   },
    // SGBs — Sovereign Gold Bonds (0% tax at maturity)
    { sym:'SGBAUG28V',  qty:8,    avg:4800.00, ltp:6818.00, lt:8,   st:0   },
    { sym:'SGBJAN29IX', qty:10,   avg:5200.00, ltp:7142.00, lt:10,  st:0   },
    { sym:'SGBOC28VII', qty:5,    avg:4620.00, ltp:6534.00, lt:5,   st:0   },
    { sym:'SGBFEB29IV', qty:6,    avg:4980.00, ltp:7065.00, lt:6,   st:0   },
    // Government Securities — 10% LTCG
    { sym:'754GS2036',  qty:1000, avg:98.50,   ltp:99.14,   lt:1000,st:0   },
    { sym:'640GS2028',  qty:500,  avg:97.20,   ltp:98.45,   lt:500, st:0   },
    // Gold ETFs — slab rate (commodity)
    { sym:'GOLDBEES',   qty:10,   avg:4810.00, ltp:6295.00, lt:10,  st:0   },
    { sym:'GOLDIETF',   qty:5,    avg:4750.00, ltp:6280.00, lt:5,   st:0   },
    // Silver ETFs — slab rate (commodity)
    { sym:'SILVERIETF', qty:50,   avg:618.00,  ltp:822.00,  lt:50,  st:0   },
    { sym:'SILVERBEES', qty:20,   avg:612.00,  ltp:815.00,  lt:20,  st:0   },
  ];

  var p = raw.map(function(d) {
    var pnl    = (d.ltp - d.avg) * d.qty;
    var ltGain = d.qty > 0 ? (d.lt / d.qty) * pnl : 0;
    var stGain = d.qty > 0 ? (d.st / d.qty) * pnl : 0;
    return { sym:d.sym, qty:d.qty, avg:d.avg, ltp:d.ltp, lt:d.lt, st:d.st,
             pnl:pnl, ltGain:ltGain, stGain:stGain,
             isSGB:isSGB(d.sym), isGovtSec:isGovtSec(d.sym), isCommodityETF:isCommodityETF(d.sym) };
  });

  // ── Summary ──────────────────────────────────────────────────────
  var equity      = p.filter(function(d) { return !d.isSGB && !d.isGovtSec && !d.isCommodityETF; });
  var equityLTGain = equity.reduce(function(s,d){ return s+(d.ltGain>0?d.ltGain:0); }, 0);
  var equityLTLoss = equity.reduce(function(s,d){ return s+(d.ltGain<0?d.ltGain:0); }, 0);
  var equityST     = equity.reduce(function(s,d){ return s+(d.stGain>0?d.stGain:0); }, 0);
  var sgbGain      = p.filter(function(d){ return d.isSGB; }).reduce(function(s,d){ return s+d.pnl; }, 0);
  var govtSecGain  = p.filter(function(d){ return d.isGovtSec; }).reduce(function(s,d){ return s+d.pnl; }, 0);
  var commGain     = p.filter(function(d){ return d.isCommodityETF; }).reduce(function(s,d){ return s+d.pnl; }, 0);

  var fakeRealised = 43250;
  var EXEMPTION    = 125000;
  var RATE         = 0.125;
  var headroom     = EXEMPTION - fakeRealised;
  var usedPct      = Math.round((fakeRealised / EXEMPTION) * 100);

  // Harvest suggestions
  var gainers = equity.filter(function(d){ return d.ltGain>0 && d.lt>0; });
  gainers.sort(function(a,b){ return b.ltGain-a.ltGain; });
  var suggestions = [], remaining = headroom;
  for (var i = 0; i < gainers.length; i++) {
    var g = gainers[i];
    if (remaining <= 0) break;
    var perShare = g.ltGain / g.lt;
    if (perShare <= 0) continue;
    var shares = Math.min(g.lt, Math.floor(remaining / perShare));
    if (shares <= 0) continue;
    var gain = shares * perShare;
    suggestions.push({ sym:g.sym, shares:shares, gain:gain, value:shares*g.ltp });
    remaining -= gain;
  }
  var totalHarvest  = suggestions.reduce(function(s,x){ return s+x.gain; }, 0);
  var totalProceeds = suggestions.reduce(function(s,x){ return s+x.value; }, 0);
  var taxSaving     = Math.round(totalHarvest * RATE);

  var ltLosses  = equity.filter(function(d){ return d.lt>0 && d.ltGain<0; });
  ltLosses.sort(function(a,b){ return a.ltGain-b.ltGain; });
  var totalLoss  = ltLosses.reduce(function(s,d){ return s+d.ltGain; }, 0);
  var lossSaving = Math.round(Math.abs(totalLoss) * RATE);

  // ── 1. Replace table rows ────────────────────────────────────────
  var rows = Array.from(document.querySelectorAll('tbody tr'));
  rows.forEach(function(row, i) {
    var d = p[i];
    if (!d) { row.style.display = 'none'; return; }

    // Symbol — try progressively broader selectors
    var symEl = row.querySelector('td a span') ||
                row.querySelector('td a') ||
                row.querySelector('td:first-child span') ||
                row.querySelector('td:first-child');
    if (symEl) symEl.textContent = d.sym;

    // Badge
    var badge = row.querySelector('.ktl-badge');
    if (badge) {
      badge.className = 'ktl-badge';
      if (d.isSGB) {
        var mat = sgbLabel(d.sym);
        badge.className += ' ktl-sgb';
        badge.textContent = 'Gold Bond' + (mat ? ' · ' + mat : '');
      } else if (d.isGovtSec) {
        badge.className += ' ktl-gsec'; badge.textContent = 'Govt Bond';
      } else if (d.isCommodityETF) {
        badge.className += ' ktl-commodity'; badge.textContent = 'Commodity ETF';
      } else if (d.lt === 0) {
        badge.className += ' ktl-st'; badge.textContent = 'High tax if sold';
      } else if (d.st === 0) {
        badge.className += ' ktl-lt'; badge.textContent = 'Long term ✓';
      } else {
        badge.className += ' ktl-mix'; badge.textContent = d.lt + ' long / ' + d.st + ' short';
      }
    }

    // Numeric cells — replace the deepest text-bearing child
    function setCell(cell, text) {
      if (!cell) return;
      var inner = cell.querySelector('span') || cell.querySelector('div') || cell;
      inner.textContent = text;
    }
    var cells = row.querySelectorAll('td');
    setCell(cells[1], d.qty);
    setCell(cells[2], d.avg.toFixed(2));
    setCell(cells[3], d.ltp.toFixed(2));
    setCell(cells[4], Math.round(d.qty * d.avg).toLocaleString('en-IN'));
    setCell(cells[5], Math.round(d.qty * d.ltp).toLocaleString('en-IN'));
    if (cells[6]) {
      setCell(cells[6], (d.pnl >= 0 ? '+' : MINUS) + inr(d.pnl));
      cells[6].style.color = d.pnl >= 0 ? '#1a6e2e' : '#c0392b';
    }
  });

  // ── 2. Limit bar ─────────────────────────────────────────────────
  function qs(s) { return document.querySelector(s); }
  if (qs('.ktl-limit-used'))    qs('.ktl-limit-used').textContent    = inr(fakeRealised) + ' used';
  if (qs('.ktl-limit-sub'))     qs('.ktl-limit-sub').textContent     = inr(headroom) + ' still free to use this year';
  if (qs('.ktl-limit-total'))   qs('.ktl-limit-total').textContent   = 'limit: ' + inr(EXEMPTION);
  if (qs('.ktl-progress-fill')) qs('.ktl-progress-fill').style.width = usedPct + '%';

  // ── 3. Hero ──────────────────────────────────────────────────────
  if (qs('.ktl-hero-saving'))
    qs('.ktl-hero-saving').innerHTML = '💰 You can save <strong>' + inr(taxSaving) + '</strong> in taxes this year';

  // ── 4. Overlay sections ──────────────────────────────────────────
  function findSection(frag) {
    var secs = Array.from(document.querySelectorAll('.ktl-section'));
    for (var i = 0; i < secs.length; i++) {
      var t = secs[i].querySelector('.ktl-section-title');
      if (t && t.textContent.indexOf(frag) !== -1) return secs[i];
    }
    return null;
  }

  var wizardSec = findSection('WHAT TO SELL');
  if (wizardSec) {
    var wTbody = wizardSec.querySelector('tbody');
    if (wTbody) {
      wTbody.innerHTML = suggestions.map(function(s) {
        return '<tr>' +
          '<td class="ktl-act-sym">' + s.sym + '</td>' +
          '<td class="ktl-act-qty">' + s.shares + '</td>' +
          '<td class="ktl-act-val">' + inr(s.value) + '</td>' +
          '<td class="ktl-act-gain">+' + inr(s.gain) + '</td>' +
          '</tr>';
      }).join('');
    }
    var wFoot = wizardSec.querySelectorAll('tfoot td');
    if (wFoot[2]) wFoot[2].textContent = inr(totalProceeds);
    if (wFoot[3]) wFoot[3].textContent = '+' + inr(totalHarvest);
    var wTitle = wizardSec.querySelector('.ktl-section-title');
    if (wTitle) wTitle.textContent = 'WHAT TO SELL BEFORE 31 MAR 2027';
  }

  var lossSec = findSection('BOOK LOSSES');
  if (!lossSec && ltLosses.length > 0 && wizardSec && wizardSec.parentNode) {
    lossSec = document.createElement('div');
    lossSec.className = 'ktl-section';
    wizardSec.parentNode.insertBefore(lossSec, wizardSec.nextSibling);
  }
  if (lossSec) {
    lossSec.innerHTML =
      '<div class="ktl-section-title">ALSO CONSIDER: BOOK LOSSES TO OFFSET GAINS</div>' +
      '<div class="ktl-loss-intro">Selling these stocks realises losses that offset your long-term gains — legally reducing your taxable LTCG. Potential additional tax saving: <strong class="ktl-pos">' + inr(lossSaving) + '</strong></div>' +
      '<table class="ktl-action-table">' +
        '<thead><tr><th>Stock</th><th>LT shares</th><th>Unrealised loss</th><th>Tax saving</th></tr></thead>' +
        '<tbody>' +
          ltLosses.map(function(d) {
            return '<tr>' +
              '<td class="ktl-act-sym">' + d.sym + '</td>' +
              '<td class="ktl-act-qty">' + d.lt + '</td>' +
              '<td class="ktl-act-loss">' + inrSigned(d.ltGain) + '</td>' +
              '<td class="ktl-act-saving">' + inr(Math.abs(d.ltGain) * RATE) + '</td>' +
              '</tr>';
          }).join('') +
        '</tbody>' +
        '<tfoot><tr>' +
          '<td colspan="2" class="ktl-act-foot-label">Total loss</td>' +
          '<td class="ktl-act-loss ktl-act-foot">' + inrSigned(totalLoss) + '</td>' +
          '<td class="ktl-act-saving ktl-act-foot">' + inr(lossSaving) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div class="ktl-action-tip">Book these losses before 31 March, then rebuy immediately to maintain your position. LT losses first offset LT gains; any excess carries forward to next FY.</div>';
  }

  // ── 5. At a glance ───────────────────────────────────────────────
  var glanceRows = document.querySelectorAll('.ktl-glance-row');
  var glanceData = [
    { dot:'ktl-dot-lt',        label:'Held over 1 year',     val:inr(equityLTGain)+' gains', cls:'ktl-pos', rate:'12.5% tax above ' + INR_SYM + '1.25L limit' },
    { dot:'ktl-dot-loss',      label:'Long-term losses',      val:inrSigned(equityLTLoss),    cls:'ktl-neg', rate:'Can offset gains' },
    { dot:'ktl-dot-st',        label:'Held under 1 year',     val:inr(equityST)+' gains',     cls:'ktl-neg', rate:'20% tax if sold now — wait if possible' },
    { dot:'ktl-dot-sgb',       label:'Gold Bonds (SGBs)',      val:inr(sgbGain)+' gains',      cls:'ktl-pos', rate:'0% at maturity · 12.5% if sold early' },
    { dot:'ktl-dot-gsec',      label:'Govt Securities',        val:inr(govtSecGain)+' gains',  cls:'ktl-pos', rate:'10% LTCG if sold' },
    { dot:'ktl-dot-commodity', label:'Gold / Silver ETFs',     val:inr(commGain)+' gains',     cls:'ktl-pos', rate:'Slab-rate tax — not equity LTCG' },
  ];
  Array.from(glanceRows).forEach(function(row, i) {
    var g = glanceData[i]; if (!g) return;
    var dot  = row.querySelector('.ktl-glance-dot');
    var lbl  = row.querySelector('.ktl-glance-label');
    var val  = row.querySelector('.ktl-glance-val');
    var rate = row.querySelector('.ktl-glance-rate');
    if (dot)  dot.className   = 'ktl-glance-dot ' + g.dot;
    if (lbl)  lbl.textContent = g.label;
    if (val)  { val.textContent = g.val; val.className = 'ktl-glance-val ' + g.cls; }
    if (rate) rate.textContent = g.rate;
  });

  document.title = 'KTL demo injected';

  } catch(e) {
    document.title = 'KTL ERR: ' + e.message;
    (window.console.error || function(){}).call(window.console, '[KTL]', e.message, e.stack);
  }
})();
