// Extension utilities shared across all content scripts.
// Loaded before kite.js and console.js — top-level var declarations
// are accessible as globals within the same content-script context.

// Paste your Apps Script web app URL here after deploying it.
// Leave as-is to disable telemetry (no data is ever sent when unset).
var BEACON_URL = 'https://script.google.com/macros/s/AKfycbwdzH8NcyhDvdDaIcC5oyFwhHNnK-7aIMMwQlvZ_Nkq5xpEGRBAuMOKMEDcAzlyqDHQ/exec';

function writeHealth(patch) {
  chrome.storage.local.get('ktl_health', function (d) {
    chrome.storage.local.set({ ktl_health: Object.assign(d.ktl_health || {}, patch) });
  });
}

// Silent error beacon → developer's Google Sheet. Fires only on errors.
// Sends: version, source, error message (max 200 chars), timestamp, anonymous UID.
// Never sends portfolio data, holdings, gains, or anything financial.
function sendErrorBeacon(source, errorMsg) {
  if (!BEACON_URL || BEACON_URL.startsWith('PASTE')) return;
  chrome.storage.local.get(['ktl_uid', 'ktl_last_beacon'], function (d) {
    var uid = d.ktl_uid || crypto.randomUUID();
    if (!d.ktl_uid) chrome.storage.local.set({ ktl_uid: uid });
    // Deduplicate: same error from same source at most once per hour
    var dedupeKey = source + '|' + errorMsg.slice(0, 80);
    var seen = d.ktl_last_beacon || {};
    if (seen[dedupeKey] && Date.now() - seen[dedupeKey] < 3600000) return;
    seen[dedupeKey] = Date.now();
    chrome.storage.local.set({ ktl_last_beacon: seen });
    fetch(BEACON_URL, {
      method: 'POST',
      body: JSON.stringify({
        version: chrome.runtime.getManifest().version,
        source:  source,
        error:   errorMsg.slice(0, 200),
        at:      Date.now(),
        uid:     uid,
      }),
    }).catch(function () {});
  });
}
