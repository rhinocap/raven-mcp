(function() {
  var CENTER_LINKS = [];

  var PAGE_LINKS = [
    { label: 'Design Playground', href: '/raven-design' },
    { label: 'Docs', href: '/docs' },
    { label: 'Changelog', href: '/changelog' }
  ];

  var path = window.location.pathname;

  function isActive(href) {
    if (href === '/raven-design') return path === '/raven-design';
    if (href === '/docs') return path === '/docs';
    if (href === '/changelog') return path === '/changelog';
    return false;
  }

  function buildLinks(links, isMobile) {
    var html = '';
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var active = isActive(link.href) ? ' class="active"' : '';
      var href = link.href;
      if ((path === '/' || path === '/index') && href.charAt(0) === '/' && href.charAt(1) === '#') {
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
    .nav-brand { display: flex; align-items: center; gap: var(--space-3, 12px); text-decoration: none; min-height: 44px; }\
    .nav-brand span { display: inline-flex; align-items: center; min-height: 44px; font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em; }\
    .nav-links { display: none; }\
    .nav-actions { display: flex; align-items: center; gap: var(--space-3, 12px); }\
    .nav-page-links { display: flex; align-items: center; gap: var(--space-6, 24px); margin-right: var(--space-4, 16px); }\
    .nav-page-links a {\
      display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px;\
      font-size: 15px; font-weight: 500; color: var(--text-secondary);\
      transition: color 150ms cubic-bezier(0.16, 1, 0.3, 1);\
    }\
    .nav-page-links a:hover { color: var(--text-primary); }\
    .nav-page-links a.active { color: var(--text-accent); }\
    .btn {\
      display: inline-flex; align-items: center; gap: var(--space-2, 8px);\
      padding: 12px 28px; font-family: var(--font-body, "Untitled Sans", -apple-system, BlinkMacSystemFont, sans-serif);\
      font-size: 14px; font-weight: 700; letter-spacing: -0.01em; border-radius: 9999px; border: none; cursor: pointer;\
      transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1); white-space: nowrap; text-decoration: none;\
    }\
    .btn-primary {\
      background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-cyan) 100%); color: var(--text-on-accent);\
      box-shadow: 0 4px 24px rgba(0, 191, 255, 0.3), 0 0 60px rgba(0, 191, 255, 0.15);\
    }\
    .btn-primary:hover {\
      transform: translateY(-1px);\
      box-shadow: 0 8px 32px rgba(0, 191, 255, 0.45), 0 0 80px rgba(0, 191, 255, 0.2);\
    }\
    .nav-hamburger {\
      display: none; width: 44px; height: 44px;\
      align-items: center; justify-content: center;\
      background: none; border: none; cursor: pointer;\
      padding: 0; flex-shrink: 0;\
    }\
    .nav-hamburger span {\
      display: block; width: 20px; height: 2px;\
      background: var(--text-primary); border-radius: 1px;\
      position: relative; transition: all 0.3s ease;\
    }\
    .nav-hamburger span::before,\
    .nav-hamburger span::after {\
      content: ""; position: absolute; left: 0; width: 100%; height: 2px;\
      background: var(--text-primary); border-radius: 1px; transition: all 0.3s ease;\
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
      font-size: 16px; font-weight: 500; color: var(--text-secondary);\
      border-radius: var(--radius-md, 12px); transition: all 0.15s ease;\
      min-height: 44px;\
    }\
    .nav-mobile-menu a:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }\
    .nav-mobile-menu a.active { color: var(--text-accent); }\
    nav { container: raven-nav / inline-size; }\
    /* When the nav is narrowed (between the playground panels), the links move into the menu. */\
    @container raven-nav (max-width: 620px) {\
      .nav-page-links { display: none; }\
      .nav-hamburger { display: flex; }\
    }\
    @container raven-nav (max-width: 400px) {\
      .nav-inner { padding: 0 var(--space-3, 12px); }\
    }\
    /* Get Started stays while it fits beside the brand and the menu button. */\
    @container raven-nav (max-width: 300px) {\
      .nav-actions .btn-primary { display: none; }\
    }\
    @container raven-nav (max-width: 147px) {\
      .nav-brand { display: none; }\
      .nav-inner { justify-content: center; }\
    }\
    /* From 761px the menu matches the nav, so on the playground pages it stays in the gap between Grab panels. */\
    @media (min-width: 761px) {\
      .nav-mobile-menu {\
        left: 50%; right: auto; transform: translateX(-50%);\
        width: min(100% - 24px, var(--max-width, 1140px));\
        container: nav-menu / inline-size;\
        padding: clamp(6px, calc((min(100vw - 24px, var(--max-width, 1140px)) - 117px) / 4 + 6px), 16px);\
      }\
    }\
    @container nav-menu (max-width: 300px) {\
      .nav-mobile-menu a { padding: 10px 8px; font-size: 14px; overflow-wrap: anywhere; }\
    }\
    @media (max-width: 768px) {\
      nav { width: calc(100% - 24px); top: 8px; }\
      .nav-inner { padding: 0 var(--space-3, 12px); }\
      .nav-links { display: none; }\
      .nav-page-links { display: none; }\
      .nav-hamburger { display: flex; }\
      .nav-actions .btn-primary { font-size: 13px; padding: 8px 14px; }\
      .nav-brand span { font-size: 14px; }\
    }\
  ' + ((path === '/' || path === '/index') ? '\
    :host { --home-type-utility-size: 14px; --home-type-utility-weight: 400; }\
    nav, nav *, .nav-mobile-menu, .nav-mobile-menu * {\
      font-family: var(--font-body, "Untitled Sans", -apple-system, BlinkMacSystemFont, sans-serif) !important;\
      font-size: var(--home-type-utility-size) !important;\
      font-weight: var(--home-type-utility-weight) !important;\
      text-transform: none !important;\
      letter-spacing: normal !important;\
    }\
  ' : '') + ((path === '/raven-design' || path === '/motion') ? '\
    /* On the playground pages Grab keeps a 44px tab at the left edge on phones; the brand clears it. */\
    @media (max-width: 768px) {\
      .nav-brand { margin-left: 32px; }\
    }\
    /* Between 761px and 793px the nav is too narrow for the brand, so the menu carries Home. */\
    .nav-mobile-menu .nav-menu-home { display: none; }\
    @media (min-width: 761px) and (max-width: 793px) {\
      .nav-mobile-menu .nav-menu-home { display: block; }\
    }\
  ' : '');

  // On the playground pages Grab picks whatever is clicked; the site nav keeps its own clicks there.
  var GRAB_IGNORE = (path === '/raven-design' || path === '/motion') ? ' data-raven-grab-ignore=""' : '';

  var HTML = '\
    <nav' + GRAB_IGNORE + '>\
      <div class="nav-inner">\
        <a href="/" class="nav-brand">\
          <span>RavenMCP</span>\
        </a>\
        <div class="nav-actions">\
          <div class="nav-page-links">' + buildLinks(PAGE_LINKS, false).replace(/<\/?li>/g, '') + '</div>\
          <a href="/docs" class="btn btn-primary">Get Started</a>\
          <button class="nav-hamburger" aria-label="Toggle menu"><span></span></button>\
        </div>\
      </div>\
    </nav>\
    <div class="nav-mobile-menu"' + GRAB_IGNORE + '>' + (GRAB_IGNORE ? '<a href="/" class="nav-menu-home">Home</a>' : '') + allMobileLinks() + '\
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
