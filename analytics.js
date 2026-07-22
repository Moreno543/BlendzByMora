/**
 * Google Analytics 4 — loads only when CONFIG.GA_MEASUREMENT_ID is set (see SETUP_ANALYTICS.md).
 */
(function () {
  const id =
    typeof CONFIG !== 'undefined' && CONFIG && CONFIG.GA_MEASUREMENT_ID
      ? String(CONFIG.GA_MEASUREMENT_ID).trim()
      : '';
  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(script);
})();
