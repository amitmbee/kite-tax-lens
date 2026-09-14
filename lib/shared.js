// Extension utilities shared across all content scripts.
// Loaded before kite.js and console.js — top-level var declarations
// are accessible as globals within the same content-script context.

function writeHealth(patch) {
  chrome.storage.local.get('ktl_health', function (d) {
    chrome.storage.local.set({ ktl_health: Object.assign(d.ktl_health || {}, patch) });
  });
}

function sendErrorBeacon() {}  // no-op — no data collection in this version
