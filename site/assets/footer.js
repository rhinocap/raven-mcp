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
      display: flex; align-items: center; justify-content: space-between;\
    }\
    .footer-brand { display: flex; align-items: center; gap: var(--space-3, 12px); }\
    .footer-brand img { width: 22px; height: 22px; object-fit: contain; opacity: 0.5; }\
    .footer-brand span { font-size: 13px; color: var(--text-tertiary, #5C5F68); }\
    .footer-links { display: flex; gap: var(--space-6, 24px); }\
    .footer-links a {\
      font-size: 13px; color: var(--text-tertiary, #5C5F68);\
      transition: color 150ms cubic-bezier(0.16, 1, 0.3, 1);\
    }\
    .footer-links a:hover { color: var(--text-primary, #F0F0F2); }\
    @media (max-width: 768px) {\
      .footer-inner { flex-direction: column; gap: var(--space-4, 16px); text-align: center; }\
      .footer-links { justify-content: center; flex-wrap: wrap; }\
    }\
  ';

  var HTML = '\
    <footer>\
      <div class="footer-inner">\
        <div class="footer-brand">\
          <img src="/assets/raven-logo.png" alt="Raven">\
          <span>Raven MCP &mdash; ravenmcp.ai</span>\
        </div>\
        <ul class="footer-links">\
          <li><a href="https://github.com/rhinocap/raven-mcp">GitHub</a></li>\
          <li><a href="/docs.html">Docs</a></li>\
          <li><a href="/#systems">Systems</a></li>\
          <li><a href="/about.html">About</a></li>\
        </ul>\
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
  };

  customElements.define('raven-footer', RavenFooter);
})();
