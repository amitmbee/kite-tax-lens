'use strict';

const {
  LTCG_EXEMPTION, LTCG_RATE,
  isSGB, isGovtSec, isCommodityETF,
  parseSGBMaturity,
  safeNum, esc,
  resolveConsoleEntry,
  calcTaxData, buildHarvestWizard,
  currentFY, currentFYLabel, deadlineYear,
} = require('../lib/tax');

// ─────────────────────────────────────────────────────────────────────────────
// Instrument detection
// ─────────────────────────────────────────────────────────────────────────────

describe('isSGB', () => {
  const yes = ['SGBAUG28V', 'SGBJAN29IX-GB', 'SGBDE31III', 'SGBOC28VII', 'SGBJUL28IV', 'SGBJUN28', 'SGBSEP31II'];
  const no  = ['TATAPOWER', '754GS2036', 'GOLDBEES', 'NIFTYBEES', 'HDFCBANK', 'CAPLIPOINT'];

  test.each(yes)('recognises %s as SGB', sym => expect(isSGB(sym)).toBe(true));
  test.each(no)('%s is not an SGB',      sym => expect(isSGB(sym)).toBe(false));
});

describe('isGovtSec', () => {
  test('recognises 754GS2036',   () => expect(isGovtSec('754GS2036')).toBe(true));
  test('recognises 754GS2036-GS',() => expect(isGovtSec('754GS2036-GS')).toBe(true));
  test('TATAPOWER is not G-Sec', () => expect(isGovtSec('TATAPOWER')).toBe(false));
  test('SGB is not G-Sec',       () => expect(isGovtSec('SGBAUG28V')).toBe(false));
});

describe('isCommodityETF', () => {
  test('GOLDBEES is commodity',   () => expect(isCommodityETF('GOLDBEES')).toBe(true));
  test('GOLDIETF is commodity',   () => expect(isCommodityETF('GOLDIETF')).toBe(true));
  test('SILVERIETF is commodity', () => expect(isCommodityETF('SILVERIETF')).toBe(true));
  test('NIFTYBEES is not',        () => expect(isCommodityETF('NIFTYBEES')).toBe(false));
  test('TATAPOWER is not',        () => expect(isCommodityETF('TATAPOWER')).toBe(false));
  test('HDFCBANK is not',         () => expect(isCommodityETF('HDFCBANK')).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// SGB maturity parsing — every symbol from the real portfolio
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSGBMaturity', () => {
  const cases = [
    ['SGBAUG28V',      2028,  7],  // August 2028
    ['SGBJAN29IX',     2029,  0],  // January 2029
    ['SGBJUL28IV',     2028,  6],  // July 2028
    ['SGBJUN28',       2028,  5],  // June 2028
    ['SGBOC28VII',     2028,  9],  // October 2028 — Zerodha uses 'OC'
    ['SGBDE31III',     2031, 11],  // December 2031 — Zerodha uses 'DE'
    ['SGBSEP31II',     2031,  8],  // September 2031
    ['SGBJAN29IX-GB',  2029,  0],  // -GB suffix stripped
  ];

  test.each(cases)('%s → year %i month-index %i', (sym, year, monthIndex) => {
    const d = parseSGBMaturity(sym);
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(year);
    expect(d.getMonth()).toBe(monthIndex);
  });

  test('non-SGB symbol returns null', () => {
    expect(parseSGBMaturity('TATAPOWER')).toBeNull();
    expect(parseSGBMaturity('754GS2036')).toBeNull();
  });

  test('unknown month code returns null', () => {
    expect(parseSGBMaturity('SGBXXX28I')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// safeNum
// ─────────────────────────────────────────────────────────────────────────────

describe('safeNum', () => {
  test('passes through valid numbers', () => {
    expect(safeNum(100)).toBe(100);
    expect(safeNum(-50.5)).toBe(-50.5);
    expect(safeNum(0)).toBe(0);
  });
  test('coerces null to 0',      () => expect(safeNum(null)).toBe(0));
  test('coerces undefined to 0', () => expect(safeNum(undefined)).toBe(0));
  test('coerces NaN to 0',       () => expect(safeNum(NaN)).toBe(0));
  test('coerces Infinity to 0',  () => expect(safeNum(Infinity)).toBe(0));
  test('coerces -Infinity to 0', () => expect(safeNum(-Infinity)).toBe(0));
  test('coerces string to 0',    () => expect(safeNum('100')).toBe(0));
});

// ─────────────────────────────────────────────────────────────────────────────
// esc (XSS prevention)
// ─────────────────────────────────────────────────────────────────────────────

describe('esc', () => {
  test('escapes < and >',  () => expect(esc('<script>')).toBe('&lt;script&gt;'));
  test('escapes &',        () => expect(esc('A&B')).toBe('A&amp;B'));
  test('escapes quotes',   () => expect(esc('"value"')).toBe('&quot;value&quot;'));
  test('passes normal symbols', () => expect(esc('TATAPOWER')).toBe('TATAPOWER'));
  test('coerces numbers',  () => expect(esc(42)).toBe('42'));
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveConsoleEntry — symbol normalisation
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveConsoleEntry', () => {
  const db = {
    'TATAPOWER':    { lt_qty: 406, total_qty: 406 },
    '754GS2036-GS': { lt_qty: 50,  total_qty: 50  },
    'GOLDBEES-E':   { lt_qty: 0,   total_qty: 40  },
    'SGBAUG28V-GB': { lt_qty: 2,   total_qty: 2   },
    'KLBRENG':      { lt_qty: 100, total_qty: 100 },
  };

  test('exact match',               () => expect(resolveConsoleEntry('TATAPOWER', db)).toBeDefined());
  test('-GS suffix added',          () => expect(resolveConsoleEntry('754GS2036', db)).toBeDefined());
  test('-E suffix added',           () => expect(resolveConsoleEntry('GOLDBEES', db)).toBeDefined());
  test('-GB suffix added',          () => expect(resolveConsoleEntry('SGBAUG28V', db)).toBeDefined());
  test('-B suffix stripped (NSE B-group)', () => expect(resolveConsoleEntry('KLBRENG-B', db)).toBeDefined());
  test('unknown symbol returns undefined', () => expect(resolveConsoleEntry('UNKNOWN', db)).toBeUndefined());
  test('null consoleHoldings',      () => expect(resolveConsoleEntry('TATAPOWER', null)).toBeUndefined());
});

// ─────────────────────────────────────────────────────────────────────────────
// calcTaxData
// ─────────────────────────────────────────────────────────────────────────────

function makeHolding(overrides) {
  return Object.assign({
    tradingsymbol: 'TEST',
    quantity: 100,
    average_price: 100,
    last_price: 150,
    pnl: 5000,
    collateral_quantity: 0,
    t1_quantity: 0,
  }, overrides);
}

describe('calcTaxData', () => {
  test('all LT when Console says so', () => {
    const h   = makeHolding({ tradingsymbol: 'TATAPOWER', quantity: 406, pnl: 111902 });
    const con = { holdings: { TATAPOWER: { lt_qty: 406, total_qty: 406 } } };
    const [r] = calcTaxData([h], con);
    expect(r.ltQty).toBe(406);
    expect(r.stQty).toBe(0);
    expect(r.ltGain).toBeCloseTo(111902);
    expect(r.stGain).toBe(0);
  });

  test('all ST when Console says lt_qty=0', () => {
    const h   = makeHolding({ tradingsymbol: 'CAPLIPOINT', quantity: 20, pnl: 18018 });
    const con = { holdings: { CAPLIPOINT: { lt_qty: 0, total_qty: 20 } } };
    const [r] = calcTaxData([h], con);
    expect(r.ltQty).toBe(0);
    expect(r.stQty).toBe(20);
    expect(r.ltGain).toBe(0);
    expect(r.stGain).toBeCloseTo(18018);
  });

  test('mixed LT/ST proportional split', () => {
    const h   = makeHolding({ quantity: 100, pnl: 10000 });
    const con = { holdings: { TEST: { lt_qty: 60, total_qty: 100 } } };
    const [r] = calcTaxData([h], con);
    expect(r.ltQty).toBe(60);
    expect(r.stQty).toBe(40);
    expect(r.ltGain).toBeCloseTo(6000);
    expect(r.stGain).toBeCloseTo(4000);
  });

  test('assumes all LT when no Console data', () => {
    const [r] = calcTaxData([makeHolding({ quantity: 50, pnl: 5000 })], null);
    expect(r.ltQty).toBe(50);
    expect(r.stQty).toBe(0);
  });

  test('pledged shares reduce sellableLtQty', () => {
    const h   = makeHolding({ quantity: 100, collateral_quantity: 30, pnl: 5000 });
    const con = { holdings: { TEST: { lt_qty: 100, total_qty: 100 } } };
    const [r] = calcTaxData([h], con);
    expect(r.sellableLtQty).toBe(70);
    expect(r.pledgedQty).toBe(30);
  });

  test('T+1 shares reduce sellableLtQty', () => {
    const h   = makeHolding({ quantity: 100, t1_quantity: 20, pnl: 5000 });
    const con = { holdings: { TEST: { lt_qty: 100, total_qty: 100 } } };
    const [r] = calcTaxData([h], con);
    expect(r.sellableLtQty).toBe(80);
  });

  test('null/undefined fields coerced to 0 — no NaN', () => {
    const h = { tradingsymbol: 'BROKEN', quantity: null, pnl: undefined, last_price: null,
                average_price: null, collateral_quantity: null, t1_quantity: null };
    const [r] = calcTaxData([h], null);
    expect(r.pnl).toBe(0);
    expect(r.ltGain).toBe(0);
    expect(isNaN(r.perSharePnl)).toBe(false);
  });

  test('SGB flagged correctly', () => {
    const [r] = calcTaxData([makeHolding({ tradingsymbol: 'SGBAUG28V' })], null);
    expect(r.isSGB).toBe(true);
    expect(r.isGovtSec).toBe(false);
  });

  test('G-Sec flagged correctly', () => {
    const [r] = calcTaxData([makeHolding({ tradingsymbol: '754GS2036' })], null);
    expect(r.isGovtSec).toBe(true);
    expect(r.isSGB).toBe(false);
  });

  test('commodity ETF flagged correctly', () => {
    const [r] = calcTaxData([makeHolding({ tradingsymbol: 'SILVERIETF' })], null);
    expect(r.isCommodityETF).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildHarvestWizard
// ─────────────────────────────────────────────────────────────────────────────

function makeTaxRow(overrides) {
  const base = {
    tradingsymbol: 'TEST',
    last_price: 100,
    quantity: 100,
    ltQty: 100,
    sellableLtQty: 100,
    ltGain: 10000,
    perSharePnl: 100,
    isSGB: false,
    isGovtSec: false,
    isCommodityETF: false,
  };
  return Object.assign({}, base, overrides);
}

describe('buildHarvestWizard', () => {
  test('returns empty when exemption fully used', () => {
    const r = buildHarvestWizard([], 125000);
    expect(r.headroom).toBe(0);
    expect(r.suggestions).toHaveLength(0);
  });

  test('returns empty when exemption exceeded', () => {
    const r = buildHarvestWizard([], 130000);
    expect(r.headroom).toBe(0);
  });

  test('uses full headroom when nothing realised yet', () => {
    const data = [makeTaxRow({ tradingsymbol: 'TATAPOWER', ltGain: 111902, perSharePnl: 275.6, sellableLtQty: 406 })];
    const r = buildHarvestWizard(data, 0);
    expect(r.headroom).toBe(125000);
    expect(r.suggestions[0].symbol).toBe('TATAPOWER');
    expect(r.suggestions[0].gain).toBeLessThanOrEqual(125000);
  });

  test('respects partial headroom (₹13,003 realised)', () => {
    const headroom = LTCG_EXEMPTION - 13003;
    const data = [makeTaxRow({ tradingsymbol: 'TATAPOWER', ltGain: 111902, perSharePnl: 275.6, sellableLtQty: 406 })];
    const r = buildHarvestWizard(data, 13003);
    expect(r.headroom).toBe(headroom);
    const totalGain = r.suggestions.reduce((s, x) => s + x.gain, 0);
    expect(totalGain).toBeLessThanOrEqual(headroom);
  });

  test('uses floor not ceil — never exceeds headroom', () => {
    // perSharePnl=99, headroom=100 → floor(100/99)=1 share, gain=99 (not 2 shares=198)
    const data = [makeTaxRow({ perSharePnl: 99, sellableLtQty: 10, ltGain: 990 })];
    const r = buildHarvestWizard(data, LTCG_EXEMPTION - 100);
    expect(r.suggestions[0].shares).toBe(1);
    expect(r.suggestions[0].gain).toBeLessThanOrEqual(100);
  });

  test('sorts by largest gain first', () => {
    const data = [
      makeTaxRow({ tradingsymbol: 'SMALL', ltGain: 5000,  perSharePnl: 50,  sellableLtQty: 100 }),
      makeTaxRow({ tradingsymbol: 'BIG',   ltGain: 80000, perSharePnl: 800, sellableLtQty: 100 }),
    ];
    const r = buildHarvestWizard(data, 0);
    expect(r.suggestions[0].symbol).toBe('BIG');
  });

  test('skips SGBs', () => {
    const data = [makeTaxRow({ tradingsymbol: 'SGBAUG28V', isSGB: true })];
    expect(buildHarvestWizard(data, 0).suggestions).toHaveLength(0);
  });

  test('skips G-Sec', () => {
    const data = [makeTaxRow({ tradingsymbol: '754GS2036', isGovtSec: true })];
    expect(buildHarvestWizard(data, 0).suggestions).toHaveLength(0);
  });

  test('skips commodity ETFs', () => {
    const data = [makeTaxRow({ tradingsymbol: 'SILVERIETF', isCommodityETF: true })];
    expect(buildHarvestWizard(data, 0).suggestions).toHaveLength(0);
  });

  test('skips holdings with zero or negative perSharePnl', () => {
    const data = [makeTaxRow({ perSharePnl: 0 }), makeTaxRow({ perSharePnl: -10 })];
    expect(buildHarvestWizard(data, 0).suggestions).toHaveLength(0);
  });

  test('skips holdings with zero sellableLtQty (all pledged)', () => {
    const data = [makeTaxRow({ sellableLtQty: 0 })];
    expect(buildHarvestWizard(data, 0).suggestions).toHaveLength(0);
  });

  test('restrictedQty shows pledged/T+1 shares', () => {
    const data = [makeTaxRow({ ltQty: 100, sellableLtQty: 70 })];
    const r = buildHarvestWizard(data, 0);
    expect(r.suggestions[0].restrictedQty).toBe(30);
  });

  test('remaining is 0 or positive, never negative', () => {
    const data = [makeTaxRow({ ltGain: 200000, perSharePnl: 1000, sellableLtQty: 200 })];
    const r = buildHarvestWizard(data, 0);
    expect(r.remaining).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FY boundary
// ─────────────────────────────────────────────────────────────────────────────

describe('currentFY', () => {
  test('April 1 starts new FY', () => {
    const fy = currentFY(new Date(2026, 3, 1)); // April = month 3
    expect(fy.start).toBe(2026);
    expect(fy.end).toBe(2027);
  });

  test('March 31 is still old FY', () => {
    const fy = currentFY(new Date(2027, 2, 31)); // March = month 2
    expect(fy.start).toBe(2026);
    expect(fy.end).toBe(2027);
  });

  test('September is mid-FY', () => {
    const fy = currentFY(new Date(2026, 8, 14)); // September = month 8
    expect(fy.start).toBe(2026);
    expect(fy.end).toBe(2027);
  });
});

describe('currentFYLabel', () => {
  test('uses taxPnl.fy when present', () => {
    expect(currentFYLabel({ fy: '2026_2027' })).toBe('Apr 2026 – Mar 2027');
  });

  test('falls back to current date', () => {
    const label = currentFYLabel(null, new Date(2026, 8, 14));
    expect(label).toBe('Apr 2026 – Mar 2027');
  });
});

describe('deadlineYear', () => {
  test('March 31 deadline is current year end', () => {
    expect(deadlineYear(new Date(2026, 8, 14))).toBe(2027);
  });
  test('April 1 starts new deadline', () => {
    expect(deadlineYear(new Date(2027, 3, 1))).toBe(2028);
  });
});
