/**
 * RenterIQ Desktop Sidebar — injects the sidebar nav on all app pages.
 * Loaded by every app page. On mobile it does nothing (CSS hides .desktop-sidebar).
 * Tools list mirrors /app/pages/tools.html exactly.
 */
(function () {

  var NAV_ITEMS = [
    { label: 'Home',    icon: '🏠', path: '/app/index.html' },
    { label: 'Inspect', icon: '📋', path: '/app/pages/inspection.html' },
    { label: 'Vault',   icon: '🗄️', path: '/app/pages/vault.html' },
  ];

  var RENTING = [
    { label: 'Rent Tracker',  icon: '💰', path: '/app/pages/rent-tracker.html' },
    { label: 'Bond Tracker',  icon: '🛡️', path: '/app/pages/bond-tracker.html' },
  ];

  var TOOLS = [
    { label: 'Property Inspection',          icon: '📋', path: '/app/pages/inspection.html' },
    { label: 'Rental Application',           icon: '📝', path: '/app/pages/application.html' },
    { label: 'Lease Review',                 icon: '📑', path: '/app/pages/lease.html' },
    { label: 'Entry Condition Report',       icon: '🏠', path: '/app/pages/entry-audit.html' },
    { label: 'Routine Inspection Response',  icon: '🔍', path: '/app/pages/routine-inspection.html' },
    { label: 'Renter Rights',                icon: '⚖️', path: '/app/pages/rights.html' },
    { label: 'Exit Condition Report',        icon: '🔑', path: '/app/pages/exit.html' },
  ];
  

  function currentPath() {
    return window.location.pathname;
  }

  function isActive(itemPath) {
    var p = currentPath();
    if (itemPath === '/app/index.html' && (p === '/app' || p === '/app/')) return true;
    return p.endsWith(itemPath.replace('/app', '')) || p === itemPath;
  }

  function tabHTML(item) {
    var active = isActive(item.path) ? ' active' : '';
    return '<button class="ds-tab' + active + '" onclick="sidebarNavigate(\'' + item.path + '\')">' +
      '<span class="ds-tab-icon">' + item.icon + '</span>' + item.label + '</button>';
  }

  function buildSidebar() {
    var aside = document.createElement('aside');
    aside.className = 'desktop-sidebar';

    var navItems = NAV_ITEMS.map(tabHTML).join('');
    var rentingItems = RENTING.map(tabHTML).join('');
    var toolItems = TOOLS.map(tabHTML).join('');
    
    aside.innerHTML =
      '<a href="/" class="ds-brand">' +
        '<img src="/assets/logo-new.png" alt="RenterIQ" width="32" height="32" style="flex-shrink:0">' +
        '<div class="ds-brand-text">' +
          '<span class="ds-wordmark">RenterIQ</span>' +
          '<span class="ds-tagline">Your records. Your protection.</span>' +
        '</div>' +
      '</a>' +
      '<!-- Profile Card (Top) -->' +
      '<div class="ds-profile-card" id="sidebarUserCard" onclick="sidebarNavigate(\'/app/pages/profile.html\')">' +
        '<div class="ds-avatar" id="sidebarAvatar">?</div>' +
        '<div class="ds-user-info">' +
          '<div class="ds-user-name" id="sidebarUserName">Loading...</div>' +
          '<div class="ds-user-role">Renter</div>' +
        '</div>' +
        '<span style="margin-left:auto;font-size:18px;color:rgba(255,255,255,.5)">›</span>' +
      '</div>' +
      '<nav class="ds-nav">' +
        '<div class="ds-section-label">Navigation</div>' +
        navItems +
        '<div class="ds-section-label" style="margin-top:8px">Renting</div>' +
        rentingItems +
        '<div class="ds-section-label" style="margin-top:8px">Tools</div>' +
        toolItems +
      '</nav>';

    return aside;
  }


  function wrapInAppMain(shell) {
    // If already wrapped (index.html), skip
    if (shell.querySelector('.app-main')) return;

    var main = document.createElement('div');
    main.className = 'app-main';

    // Move all direct children except desktop-sidebar into app-main
    var children = Array.from(shell.children);
    children.forEach(function(child) {
      if (!child.classList.contains('desktop-sidebar')) {
        main.appendChild(child);
      }
    });
    shell.appendChild(main);
  }

  function injectDesktopCSS() {
    if (document.getElementById('riq-sidebar-css')) return;
    var style = document.createElement('style');
    style.id = 'riq-sidebar-css';
    style.textContent = [
      /* Hide sidebar on mobile */
      '@media (max-width:899px){.desktop-sidebar{display:none!important;}}',
      '@media (min-width:900px){',

        /* Layout */
        '.app-shell{max-width:none!important;display:flex!important;flex-direction:row!important;margin:0!important;background:#EEF3FF!important;position:relative!important;min-height:100vh!important;}',
        '.app-main{display:flex!important;flex-direction:column!important;flex:1!important;margin-left:240px!important;min-height:100vh!important;min-width:0!important;width:calc(100% - 240px)!important;overflow-x:hidden!important;}',
        '.bottom-nav{display:none!important;}',
        '#hdrAvatar{display:none!important;}',

        /* Sidebar shell */
        '.desktop-sidebar{display:flex!important;flex-direction:column!important;width:240px!important;min-width:240px!important;position:fixed!important;left:0!important;top:0!important;bottom:0!important;height:100vh!important;z-index:100!important;overflow-y:auto!important;overflow-x:hidden!important;background:linear-gradient(180deg,#0A2460 0%,#0D2F74 60%,#091E52 100%)!important;box-shadow:2px 0 20px rgba(10,36,96,.25)!important;}',

        /* Profile Card (Top) */
        '.ds-profile-card{display:flex!important;align-items:center!important;gap:12px!important;padding:14px 14px!important;margin:12px 12px 8px!important;border-radius:14px!important;background:rgba(255,255,255,.1)!important;border:1px solid rgba(255,255,255,.15)!important;cursor:pointer!important;transition:all .2s!important;}' +
        '.ds-profile-card:hover{background:rgba(255,255,255,.15)!important;border-color:rgba(255,255,255,.25)!important;}' +

        /* Brand */
        '.ds-brand{display:flex!important;align-items:center!important;gap:10px!important;padding:24px 20px 12px!important;text-decoration:none!important;}' +
        '.ds-brand-text{display:flex!important;flex-direction:column!important;}' +
        '.ds-wordmark{font-family:"Sora",sans-serif!important;font-weight:800!important;font-size:17px!important;color:#fff!important;letter-spacing:.3px!important;}' +
        '.ds-tagline{font-size:10px!important;color:rgba(255,255,255,.45)!important;font-weight:600!important;letter-spacing:.8px!important;text-transform:uppercase!important;margin-top:1px!important;}' +

        /* Nav */
        '.ds-nav{flex:1!important;padding:16px 12px!important;display:flex!important;flex-direction:column!important;gap:4px!important;}',
        '.ds-section-label{font-family:"Sora",sans-serif!important;font-size:10px!important;font-weight:700!important;letter-spacing:1.5px!important;color:rgba(255,255,255,.3)!important;text-transform:uppercase!important;padding:12px 10px 6px!important;}',

        /* Tabs */
        '.ds-tab{display:flex!important;align-items:center!important;gap:12px!important;padding:11px 12px!important;border-radius:12px!important;cursor:pointer!important;background:none!important;border:none!important;color:rgba(255,255,255,.65)!important;font-family:"Sora",sans-serif!important;font-weight:700!important;font-size:14px!important;transition:all .18s!important;text-decoration:none!important;width:100%!important;text-align:left!important;}',
        '.ds-tab:hover{background:rgba(255,255,255,.08)!important;color:#fff!important;}',
        '.ds-tab.active{background:rgba(255,255,255,.13)!important;color:#fff!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)!important;}',

        /* Tab icons */
        '.ds-tab-icon{width:34px!important;height:34px!important;border-radius:10px!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:17px!important;flex-shrink:0!important;background:rgba(255,255,255,.06)!important;transition:all .18s!important;}',
        '.ds-tab.active .ds-tab-icon{background:linear-gradient(135deg,#1B50C8,#2E63E0)!important;box-shadow:0 2px 10px rgba(27,80,200,.4)!important;}',


      '}'
    ].join('');
    document.head.appendChild(style);
  }

  /**
   * liftBottomNav — moves the mobile bottom nav to <body> so that
   * position:fixed is always relative to the viewport, never to a
   * parent stacking/scroll-container context (.app-shell, view divs, etc.).
   *
   * Also deduplicates: pages with multiple views each embed a copy of
   * the nav — we keep only the first and remove the rest.
   */
  function liftBottomNav() {
    var navs = document.querySelectorAll('.bottom-nav');
    if (!navs.length) return;

    // Keep the first nav; remove all subsequent duplicates from the DOM
    var primaryNav = navs[0];
    for (var i = 1; i < navs.length; i++) {
      if (navs[i].parentNode) navs[i].parentNode.removeChild(navs[i]);
    }

    // Append to <body> — the only guaranteed fixed-position safe container
    if (primaryNav.parentNode !== document.body) {
      document.body.appendChild(primaryNav);
    }
  }

  function injectSidebar() {
    injectDesktopCSS();

    // Only inject sidebar DOM on desktop — skip entirely on mobile/tablet
    if (!window.matchMedia('(min-width:900px)').matches) return;

    var shell = document.querySelector('.app-shell');
    if (!shell) return;
    if (shell.querySelector('.desktop-sidebar')) {
      return; // already injected (e.g. index.html)
    }

    // Build and prepend sidebar
    var aside = buildSidebar();
    shell.insertBefore(aside, shell.firstChild);

    // Wrap content
    wrapInAppMain(shell);

  }

  // Global nav function for sidebar buttons
  window.sidebarNavigate = function(path) {
    var routeMap = {
      '/app/index.html': '/app',
      '/app/pages/inspection.html': '/inspect',
      '/app/pages/entry-audit.html': '/move-in',
      '/app/pages/vault.html': '/vault',
      '/app/pages/rent-tracker.html': '/rent-tracker',
      '/app/pages/bond-tracker.html': '/bond-tracker',
      '/app/pages/tracked.html': '/tracked',
      '/app/pages/lease.html': '/lease',
      '/app/pages/routine-inspection.html': '/routine-inspection',
      '/app/pages/rights.html': '/rights',
      '/app/pages/exit.html': '/exit',
      '/app/pages/profile.html': '/profile',
      '/app/pages/tools.html': '/tools',
    };
    var route = routeMap[path] || path;
    var dest = (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? route : path;

    // When the browser supports cross-document View Transitions (@view-transition in CSS),
    // it animates the navigation automatically — skip the manual fade entirely.
    if (CSS && CSS.supports && CSS.supports('view-transition-name', 'none')) {
      window.location.href = dest;
      return;
    }

    // Fallback for browsers without View Transitions support
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity .18s ease';
    setTimeout(function() { window.location.href = dest; }, 180);
  };

  // Populate user info from any source
  function populateSidebarUser(name, initials) {
    var nameEl = document.getElementById('sidebarUserName');
    var avatarEl = document.getElementById('sidebarAvatar');
    if (nameEl && name) nameEl.textContent = name;
    if (avatarEl && initials) avatarEl.textContent = initials;
  }

  // Read from localStorage immediately (set by index.html on login)
  function populateFromCache() {
    try {
      var name = localStorage.getItem('riq-user-name');
      var initials = localStorage.getItem('riq-user-initials');
      if (name) populateSidebarUser(name, initials || name[0].toUpperCase());
    } catch(e) {}
  }

  // Hook into Firebase auth state if available (updates cache too)
  function tryHookAuth() {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && firebase.auth) {
      try {
        firebase.auth().onAuthStateChanged(function(user) {
          if (user) {
            var name = user.displayName || user.email.split('@')[0];
            var initials = (user.displayName || user.email || 'U')
              .split(' ').map(function(n) { return n[0]; }).slice(0, 2).join('').toUpperCase();
            populateSidebarUser(name, initials);
            try { localStorage.setItem('riq-user-name', name); localStorage.setItem('riq-user-initials', initials); } catch(e) {}
          }
        });
      } catch(e) {}
    } else {
      setTimeout(tryHookAuth, 300);
    }
  }

  // Prefetch all navigable app pages so subsequent loads are near-instant
  function prefetchAppPages() {
    var pages = [
      '/app/index.html',
      '/app/pages/inspection.html',
      '/app/pages/vault.html',
      '/app/pages/rent-tracker.html',
      '/app/pages/bond-tracker.html',
      '/app/pages/entry-audit.html',
      '/app/pages/lease.html',
      '/app/pages/routine-inspection.html',
      '/app/pages/rights.html',
      '/app/pages/exit.html',
      '/app/pages/profile.html',
      '/app/pages/tools.html',
      '/app/pages/tracked.html',
      '/app/pages/notifications.html',
      '/app/pages/renewal.html',
      '/app/pages/application.html',
    ];
    pages.forEach(function(href) {
      if (document.querySelector('link[rel="prefetch"][href="' + href + '"]')) return;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.as = 'document';
      document.head.appendChild(link);
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      liftBottomNav();   // Always runs first — moves nav to <body> before any wrapping
      injectSidebar();
      populateFromCache();
      tryHookAuth();
      prefetchAppPages();
    });
  } else {
    liftBottomNav();     // Always runs first — moves nav to <body> before any wrapping
    injectSidebar();
    populateFromCache();
    tryHookAuth();
    prefetchAppPages();
  }
})();
