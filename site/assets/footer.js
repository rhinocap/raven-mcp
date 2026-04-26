(function() {
  var CSS = '\
    :host { display: block; }\
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }\
    a { color: inherit; text-decoration: none; }\
    ul { list-style: none; }\
    footer {\
      border-top: 1px solid var(--border, rgba(255, 255, 255, 0.06));\
      padding: var(--space-10, 40px) 0;\
    }\
    .footer-inner {\
      max-width: var(--max-width, 1140px);\
      margin: 0 auto;\
      padding: 0 clamp(16px, 4vw, 24px);\
      display: grid;\
      grid-template-columns: 1fr 1fr 1fr;\
      gap: var(--space-8, 32px);\
      align-items: start;\
    }\
    .footer-brand { display: flex; flex-direction: column; gap: var(--space-2, 8px); }\
    .footer-brand-row { display: flex; align-items: center; gap: var(--space-3, 12px); }\
    .footer-brand img { width: 22px; height: 22px; object-fit: contain; opacity: 0.5; }\
    .footer-brand-name { font-size: 13px; font-weight: 600; color: var(--text-secondary, #9498A0); }\
    .footer-copy { font-size: 12px; color: var(--text-tertiary, #5C5F68); }\
    .footer-links { display: flex; flex-wrap: wrap; gap: var(--space-2, 8px) var(--space-5, 20px); padding-top: 3px; }\
    .footer-links a {\
      font-size: 13px; color: var(--text-tertiary, #5C5F68);\
      transition: color 150ms cubic-bezier(0.16, 1, 0.3, 1);\
    }\
    .footer-links a:hover { color: var(--text-primary, #F0F0F2); }\
    .footer-newsletter { display: flex; flex-direction: column; gap: var(--space-2, 8px); align-items: flex-end; }\
    .footer-newsletter-label { font-size: 12px; color: var(--text-tertiary, #5C5F68); text-align: right; line-height: 1.4; }\
    .footer-newsletter-form { display: flex; gap: 0; width: 100%; max-width: 240px; }\
    .footer-newsletter-input {\
      flex: 1; min-width: 0;\
      padding: 9px 12px;\
      background: var(--bg-surface, #212129);\
      border: 1px solid var(--border-strong, rgba(255,255,255,0.1));\
      border-right: none;\
      border-radius: 8px 0 0 8px;\
      color: var(--text-primary, #F0F0F2);\
      font-size: 13px;\
      font-family: ui-monospace, "SF Mono", monospace;\
      transition: border-color 150ms ease;\
    }\
    .footer-newsletter-input::placeholder { color: var(--text-tertiary, #5C5F68); }\
    .footer-newsletter-input:focus { outline: none; border-color: rgba(0,191,255,0.4); }\
    .footer-newsletter-submit {\
      flex-shrink: 0;\
      padding: 9px 14px;\
      background: var(--bg-accent, #00BFFF);\
      color: #0a0a12;\
      border: none;\
      border-radius: 0 8px 8px 0;\
      font-size: 13px; font-weight: 700;\
      cursor: pointer;\
      transition: background 150ms ease;\
      white-space: nowrap;\
    }\
    .footer-newsletter-submit:hover { background: #33CFFF; }\
    .footer-newsletter-status { font-size: 11px; color: var(--text-tertiary, #5C5F68); text-align: right; min-height: 16px; }\
    .footer-newsletter-status.success { color: var(--accent-green, #00E676); }\
    .footer-newsletter-status.error { color: #FF6B6B; }\
    @media (max-width: 768px) {\
      .footer-inner { grid-template-columns: 1fr; gap: var(--space-6, 24px); }\
      .footer-links { justify-content: flex-start; }\
      .footer-newsletter { align-items: flex-start; }\
      .footer-newsletter-label { text-align: left; }\
      .footer-newsletter-form { max-width: 100%; }\
    }\
  ';

  var HTML = '\
    <footer>\
      <div class="footer-inner">\
        <div class="footer-brand">\
          <div class="footer-brand-row">\
            <img src="/assets/raven-logo.png" alt="Raven">\
            <span class="footer-brand-name">RavenMCP</span>\
          </div>\
          <span class="footer-copy">&copy; 2026 &middot; MIT License</span>\
        </div>\
        <ul class="footer-links">\
          <li><a href="/docs.html">Docs</a></li>\
          <li><a href="/changelog.html">Changelog</a></li>\
          <li><a href="/about.html">About</a></li>\
          <li><a href="https://github.com/rhinocap/raven-mcp">GitHub</a></li>\
        </ul>\
        <div class="footer-newsletter">\
          <span class="footer-newsletter-label">New patterns in your inbox</span>\
          <form class="footer-newsletter-form" id="footer-nl-form" novalidate>\
            <input class="footer-newsletter-input" id="footer-nl-email" type="email" placeholder="you@work.com" required autocomplete="email" aria-label="Email address">\
            <button class="footer-newsletter-submit" type="submit">→</button>\
          </form>\
          <div class="footer-newsletter-status" id="footer-nl-status" aria-live="polite"></div>\
        </div>\
      </div>\
    </footer>\
  ';

  var RavenFooter = function() {
    var el = Reflect.construct(HTMLElement, [], RavenFooter);
    return el;
  };
  RavenFooter.prototype = Object.create(HTMLElement.prototype);
  RavenFooter.prototype.constructor = RavenFooter;

  RavenFooter.prototype.connectedCallback = function() {
    var shadow = this.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
    var wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    shadow.appendChild(wrapper);

    var form = shadow.getElementById('footer-nl-form');
    var input = shadow.getElementById('footer-nl-email');
    var statusEl = shadow.getElementById('footer-nl-status');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var email = (input.value || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          statusEl.textContent = "Enter a valid email.";
          statusEl.className = 'footer-newsletter-status error';
          return;
        }
        var btn = form.querySelector('button');
        btn.disabled = true;
        statusEl.textContent = '';
        statusEl.className = 'footer-newsletter-status';
        fetch('/api/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        })
          .then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
          .then(function(res) {
            if (res.ok) {
              statusEl.textContent = "You're in.";
              statusEl.className = 'footer-newsletter-status success';
              input.value = '';
            } else {
              statusEl.textContent = (res.body && res.body.error) ? res.body.error : 'Try again.';
              statusEl.className = 'footer-newsletter-status error';
            }
          })
          .catch(function() {
            statusEl.textContent = "Couldn't reach the server.";
            statusEl.className = 'footer-newsletter-status error';
          })
          .finally(function() { btn.disabled = false; });
      });
    }
  };

  customElements.define('raven-footer', RavenFooter);
})();
