// Runs in MAIN world at document_start — bypasses page CSP by design.
// Patches XMLHttpRequest (Kite uses Axios/XHR, not fetch) to capture
// the holdings response before Kite's own JS ever loads.

(function () {
  var TARGET = '/oms/portfolio/holdings';
  var SS_KEY  = '__ktl_holdings';

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._ktlUrl = (typeof url === 'string') ? url : String(url || '');
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this._ktlUrl && this._ktlUrl.indexOf(TARGET) !== -1) {
      this.addEventListener('load', function () {
        try {
          // Axios sets responseType='json', so response is already parsed.
          // responseText is inaccessible when responseType !== '' or 'text'.
          var data = (this.responseType === 'json') ? this.response : JSON.parse(this.responseText);
          sessionStorage.setItem(SS_KEY, JSON.stringify(data));
          window.postMessage({ _ktl: 'holdings', data: data }, '*');
        } catch (_) {}
      });
    }
    return origSend.apply(this, arguments);
  };
})();
