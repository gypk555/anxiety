// Applies a stored light/dark override before first paint. No preference means "follow the system".
(function () {
  try {
    var t = localStorage.getItem('anxiocare-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
      var colour = t === 'dark' ? '#16163c' : '#f6e9e3';
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
        m.setAttribute('content', colour);
      });
    }
  } catch (e) {
    /* storage blocked: follow the system */
  }
})();
