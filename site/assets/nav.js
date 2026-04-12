(function() {
  var CENTER_LINKS = [];

  var PAGE_LINKS = [
    { label: 'Pricing', href: '/#pricing' },
    { label: 'Docs', href: '/docs.html' },
    { label: 'About', href: '/about.html' }
  ];

  var path = window.location.pathname;

  function isActive(href) {
    if (href === '/docs.html') return path === '/docs.html';
    if (href === '/about.html') return path === '/about.html';
    return false;
  }

  function buildLinks(links, isMobile) {
    var html = '';
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var active = isActive(link.href) ? ' class="active"' : '';
      var href = link.href;
      if ((path === '/' || path === '/index.html') && href.charAt(0) === '/' && href.charAt(1) === '#') {
        href = href.substring(1);
      }
      if (isMobile) {
        html += '<a href="' + href + '"' + active + '>' + link.label + '</a>';
      } else {
        html += '<li><a href="' + href + '"' + active + '>' + link.label + '</a></li>';
      }
    }
    return html;
  }

  function allMobileLinks() {
    return buildLinks(CENTER_LINKS, true) + buildLinks(PAGE_LINKS, true);
  }

  var CSS = '\
    :host { display: block; }\
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }\
    a { color: inherit; text-decoration: none; }\
    ul { list-style: none; }\
    nav {\
      position: fixed;\
      top: 12px; left: 50%;\
      transform: translateX(-50%);\
      width: calc(100% - 32px);\
      max-width: var(--max-width, 1140px);\
      z-index: 100;\
      height: var(--nav-height, 64px);\
      display: flex;\
      align-items: center;\
      background: rgba(36, 36, 46, 0.5);\
      backdrop-filter: blur(24px) saturate(1.6);\
      -webkit-backdrop-filter: blur(24px) saturate(1.6);\
      border: 1px solid rgba(255, 255, 255, 0.12);\
      border-radius: var(--radius-xl, 20px);\
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.2);\
      transition: background 300ms cubic-bezier(0.16, 1, 0.3, 1),\
                  border-color 300ms cubic-bezier(0.16, 1, 0.3, 1),\
                  box-shadow 300ms cubic-bezier(0.16, 1, 0.3, 1);\
    }\
    .nav-inner {\
      display: flex; align-items: center; justify-content: space-between;\
      width: 100%; padding: 0 var(--space-6, 24px);\
      position: relative;\
    }\
    .nav-brand { display: flex; align-items: center; gap: var(--space-3, 12px); text-decoration: none; }\
    .nav-brand img {\
      width: 30px; height: 30px; object-fit: contain;\
      filter: drop-shadow(0 0 16px rgba(0,191,255,0.5)) drop-shadow(0 0 8px rgba(0,191,255,0.3)) drop-shadow(0 0 40px rgba(0,191,255,0.15));\
    }\
    .nav-brand span { font-size: 16px; font-weight: 700; color: var(--text-primary, #F0F0F2); letter-spacing: -0.02em; }\
    .nav-links { display: none; }\
    .nav-actions { display: flex; align-items: center; gap: var(--space-3, 12px); }\
    .nav-page-links { display: flex; align-items: center; gap: var(--space-6, 24px); margin-right: var(--space-4, 16px); }\
    .nav-page-links a {\
      font-size: 15px; font-weight: 500; color: var(--text-secondary, #9498A0);\
      transition: color 150ms cubic-bezier(0.16, 1, 0.3, 1);\
    }\
    .nav-page-links a:hover { color: var(--text-primary, #F0F0F2); }\
    .nav-page-links a.active { color: var(--text-accent, #00BFFF); }\
    .btn {\
      display: inline-flex; align-items: center; gap: var(--space-2, 8px);\
      padding: 12px 24px; font-family: var(--font-body, "Inter", -apple-system, BlinkMacSystemFont, sans-serif);\
      font-size: 18px; font-weight: 600; border-radius: 9999px; border: none; cursor: pointer;\
      transition: all 300ms cubic-bezier(0.16, 1, 0.3, 1); white-space: nowrap; text-decoration: none;\
    }\
    .btn-primary {\
      background: var(--bg-accent, #00BFFF); color: #0a0a12; font-weight: 700;\
      box-shadow: 0 0 0 1px rgba(0, 191, 255, 0.6), 0 4px 16px rgba(0, 191, 255, 0.35), 0 0 40px rgba(0, 191, 255, 0.15);\
    }\
    .btn-primary:hover {\
      background: var(--bg-accent-hover, #33CFFF); transform: translateY(-2px);\
      box-shadow: 0 0 0 1px rgba(0, 191, 255, 0.8), 0 8px 32px rgba(0, 191, 255, 0.45), 0 0 60px rgba(0, 191, 255, 0.2);\
    }\
    .nav-hamburger {\
      display: none; width: 44px; height: 44px;\
      align-items: center; justify-content: center;\
      background: none; border: none; cursor: pointer;\
      padding: 0; flex-shrink: 0;\
    }\
    .nav-hamburger span {\
      display: block; width: 20px; height: 2px;\
      background: var(--text-primary, #F0F0F2); border-radius: 1px;\
      position: relative; transition: all 0.3s ease;\
    }\
    .nav-hamburger span::before,\
    .nav-hamburger span::after {\
      content: ""; position: absolute; left: 0; width: 100%; height: 2px;\
      background: var(--text-primary, #F0F0F2); border-radius: 1px; transition: all 0.3s ease;\
    }\
    .nav-hamburger span::before { top: -6px; }\
    .nav-hamburger span::after { top: 6px; }\
    .nav-hamburger.open span { background: transparent; }\
    .nav-hamburger.open span::before { top: 0; transform: rotate(45deg); }\
    .nav-hamburger.open span::after { top: 0; transform: rotate(-45deg); }\
    .nav-mobile-menu {\
      display: none; position: fixed;\
      top: calc(var(--nav-height, 64px) + 24px);\
      left: 12px; right: 12px;\
      background: rgba(36, 36, 46, 0.95);\
      backdrop-filter: blur(24px) saturate(1.6);\
      -webkit-backdrop-filter: blur(24px) saturate(1.6);\
      border: 1px solid rgba(255, 255, 255, 0.12);\
      border-radius: var(--radius-lg, 16px);\
      padding: var(--space-4, 16px); z-index: 99;\
      flex-direction: column; gap: 2px;\
    }\
    .nav-mobile-menu.open { display: flex; }\
    .nav-mobile-menu a {\
      display: block; padding: 14px 16px;\
      font-size: 16px; font-weight: 500; color: var(--text-secondary, #9498A0);\
      border-radius: var(--radius-md, 12px); transition: all 0.15s ease;\
      min-height: 44px;\
    }\
    .nav-mobile-menu a:hover { background: rgba(255,255,255,0.05); color: var(--text-primary, #F0F0F2); }\
    .nav-mobile-menu a.active { color: var(--text-accent, #00BFFF); }\
    @media (max-width: 768px) {\
      nav { width: calc(100% - 24px); top: 8px; }\
      .nav-inner { padding: 0 var(--space-3, 12px); }\
      .nav-links { display: none; }\
      .nav-page-links { display: none; }\
      .nav-hamburger { display: flex; }\
      .nav-actions .btn-primary { font-size: 13px; padding: 8px 14px; }\
      .nav-brand span { font-size: 14px; }\
    }\
  ';

  var HTML = '\
    <nav>\
      <div class="nav-inner">\
        <a href="/" class="nav-brand">\
          <img src="/assets/raven-logo.png" alt="Raven">\
          <span>Raven</span>\
        </a>\
        <div class="nav-actions">\
          <div class="nav-page-links">' + buildLinks(PAGE_LINKS, false).replace(/<\/?li>/g, '') + '</div>\
          <a href="/docs.html" class="btn btn-primary">Get Started</a>\
          <button class="nav-hamburger" aria-label="Toggle menu"><span></span></button>\
        </div>\
      </div>\
    </nav>\
    <div class="nav-mobile-menu">' + allMobileLinks() + '\
      <a href="https://github.com/rhinocap/raven-mcp">GitHub</a>\
    </div>\
  ';

  var RavenNav = function() {
    var el = Reflect.construct(HTMLElement, [], RavenNav);
    return el;
  };
  RavenNav.prototype = Object.create(HTMLElement.prototype);
  RavenNav.prototype.constructor = RavenNav;

  RavenNav.prototype.connectedCallback = function() {
    var shadow = this.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    var wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    shadow.appendChild(wrapper);

    // Hamburger toggle
    var btn = shadow.querySelector('.nav-hamburger');
    var menu = shadow.querySelector('.nav-mobile-menu');
    if (btn && menu) {
      btn.addEventListener('click', function() {
        btn.classList.toggle('open');
        menu.classList.toggle('open');
      });
      menu.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function() {
          btn.classList.remove('open');
          menu.classList.remove('open');
        });
      });
      document.addEventListener('click', function(e) {
        var host = e.target;
        // Click outside the component
        if (!shadow.host.contains(e.target)) {
          btn.classList.remove('open');
          menu.classList.remove('open');
        }
      });
    }

    // Scroll darken
    var nav = shadow.querySelector('nav');
    window.addEventListener('scroll', function() {
      if (window.scrollY > 50) {
        nav.style.borderColor = 'rgba(0, 191, 255, 0.12)';
        nav.style.background = 'rgba(36, 36, 46, 0.82)';
        nav.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 191, 255, 0.04)';
      } else {
        nav.style.borderColor = '';
        nav.style.background = '';
        nav.style.boxShadow = '';
      }
    });
  };

  customElements.define('raven-nav', RavenNav);
})();
