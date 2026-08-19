/*
 * Klyfton request boundary.
 *
 * Adds the crew access code to same-origin API calls after CREW_CODE is enabled,
 * while leaving external services and Vercel's own assets untouched. Keeping this
 * at one boundary prevents individual modules from silently breaking when access
 * control is turned on.
 */
(function () {
  var nativeFetch = window.fetch.bind(window);

  function crewCode() {
    try {
      return String(window.appCrewCode || localStorage.getItem('klyfton_crew_code') || '').trim();
    } catch (_) {
      return String(window.appCrewCode || '').trim();
    }
  }

  function isLocalApi(input) {
    var value = typeof input === 'string' ? input : (input && input.url) || '';
    try {
      var url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && url.pathname.indexOf('/api/') === 0;
    } catch (_) {
      return false;
    }
  }

  window.fetch = function (input, init) {
    if (!isLocalApi(input)) return nativeFetch(input, init);
    var code = crewCode();
    if (!code) return nativeFetch(input, init);
    var options = Object.assign({}, init || {});
    var headers = new Headers((input && input.headers) || (init && init.headers) || undefined);
    if (!headers.has('x-crew-code')) headers.set('x-crew-code', code);
    options.headers = headers;
    return nativeFetch(input, options);
  };
}());
