/**
 * RenterIQ Desktop Sidebar — injects the sidebar nav on all app pages.
 * Loaded by every app page. On mobile it does nothing (CSS hides .desktop-sidebar).
 */
(function () {
  var NAV_ITEMS = [
    { label: 'Home',          icon: '🏠', path: '/app/index.html' },
    { label: 'Smart Search',  icon: '🔍', path: '/app/pages/smart-search.html' },
    { label: 'Inspect',       icon: '📋', path: '/app/pages/inspection.html' },
    { label: 'Vault',         icon: '🗂️', path: '/app/pages/vault.html' },
  ];

  var TOOLS = [
    { label: 'Lease Review',  icon: '📑', path: '/app/pages/lease.html' },
    { label: 'Renter Rights', icon: '⚖️', path: '/app/pages/rights.html' },
    { label: 'Exit Clean',    icon: '🔑', path: '/app/pages/exit.html' },
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
    var toolItems = TOOLS.map(tabHTML).join('');

    aside.innerHTML =
      '<a href="/" class="ds-brand">' +
        '<img src="/assets/logo.svg" alt="RenterIQ" width="32" height="32" style="flex-shrink:0">' +
        '<div class="ds-brand-text">' +
          '<span class="ds-wordmark">RenterIQ</span>' +
          '<span class="ds-tagline">Rent Smart. Stay Protected.</span>' +
        '</div>' +
      '</a>' +
      '<nav class="ds-nav">' +
        '<div class="ds-section-label">Navigation</div>' +
        navItems +
        '<div class="ds-section-label" style="margin-top:8px">Tools</div>' +
        toolItems +
      '</nav>' +
      '<div class="ds-footer">' +
        '<div class="ds-user" id="sidebarUserCard">' +
          '<div class="ds-avatar" id="sidebarAvatar">?</div>' +
          '<div class="ds-user-info">' +
            '<div class="ds-user-name" id="sidebarUserName">Loading...</div>' +
            '<div class="ds-user-role">Renter</div>' +
          '</div>' +
        '</div>' +
        '<button class="ds-signout" onclick="sidebarSignOut()">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
          'Sign Out' +
        '</button>' +
      '</div>';

    return aside;
  }

  function buildSignOutModal() {
    var ov = document.createElement('div');
    ov.id = 'sidebarSoOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9900;background:rgba(10,36,96,.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;pointer-events:none;transition:opacity .2s';
    ov.onclick = function(e) { if (e.target === ov) sidebarHideSo(); };
    ov.innerHTML =
      '<div id="sidebarSoModal" style="background:#fff;border-radius:24px;padding:36px 28px 28px;max-width:340px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(27,80,200,.22);transform:scale(.94);transition:transform .2s">' +
        '<div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#0A2460,#1B50C8);display:flex;align-items:center;justify-content:center;margin:0 auto 18px">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '</div>' +
        '<h3 style="font-family:\'Sora\',sans-serif;font-weight:800;font-size:20px;color:#0A2460;margin-bottom:10px">Sign out?</h3>' +
        '<p style="font-size:14px;color:#4A5D7A;line-height:1.65;margin-bottom:24px">You\'ll need to sign in again to access your RenterIQ account.</p>' +
        '<div style="display:flex;gap:10px">' +
          '<button onclick="sidebarHideSo()" style="flex:1;padding:13px;border-radius:12px;border:2px solid #E5EBF8;background:#fff;font-family:\'Sora\',sans-serif;font-weight:700;font-size:14px;color:#4A5D7A;cursor:pointer">Cancel</button>' +
          '<button onclick="sidebarDoSignOut()" style="flex:1;padding:13px;border-radius:12px;border:none;background:#E84040;color:#fff;font-family:\'Sora\',sans-serif;font-weight:700;font-size:14px;cursor:pointer">Sign Out</button>' +
        '</div>' +
      '</div>';
    return ov;
  }

  function wrapInAppMain(shell) {
    // If already wrapped (index.html), skip
    if (shell.querySelector('.app-main')) return;

    var main = document.createElement('div');
    main.className = 'app-main';

    // Move all direct children except desktop-sidebar and signout modal into app-main
    var children = Array.from(shell.children);
    children.forEach(function(child) {
      if (!child.classList.contains('desktop-sidebar') && child.id !== 'sidebarSoOverlay') {
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
      '@media (min-width:900px){',
        '.app-shell{',
          'max-width:none!important;',
          'display:flex!important;',
          'flex-direction:row!important;',
          'margin:0!important;',
          'background:#EEF3FF!important;',
          'position:relative!important;',
          'min-height:100vh!important;',
        '}',
        '.desktop-sidebar{',
          'display:flex!important;',
          'flex-direction:column!important;',
          'width:240px!important;',
          'min-width:240px!important;',
          'position:fixed!important;',
          'left:0!important;',
          'top:0!important;',
          'bottom:0!important;',
          'height:100vh!important;',
          'z-index:100!important;',
          'overflow-y:auto!important;',
          'overflow-x:hidden!important;',
          'background:linear-gradient(180deg,#0A2460 0%,#0D2F74 60%,#091E52 100%)!important;',
          'box-shadow:2px 0 20px rgba(10,36,96,.25)!important;',
        '}',
        '.app-main{',
          'display:flex!important;',
          'flex-direction:column!important;',
          'flex:1!important;',
          'margin-left:240px!important;',
          'min-height:100vh!important;',
          'min-width:0!important;',
          'width:calc(100% - 240px)!important;',
          'overflow-x:hidden!important;',
        '}',
        '.bottom-nav{display:none!important;}',
      '}'
    ].join('');
    document.head.appendChild(style);
  }

  function injectSidebar() {
    injectDesktopCSS();
    var shell = document.querySelector('.app-shell');
    if (!shell) return;
    if (shell.querySelector('.desktop-sidebar')) return; // already injected (e.g. index.html)

    // Build and prepend sidebar
    var aside = buildSidebar();
    shell.insertBefore(aside, shell.firstChild);

    // Wrap content
    wrapInAppMain(shell);

    // Add sign-out modal
    shell.appendChild(buildSignOutModal());
  }

  // Global nav function for sidebar buttons
  window.sidebarNavigate = function(path) {
    var routeMap = {
      '/app/index.html': '/app',
      '/app/pages/smart-search.html': '/smart-search',
      '/app/pages/inspection.html': '/inspect',
      '/app/pages/vault.html': '/vault',
      '/app/pages/lease.html': '/lease',
      '/app/pages/rights.html': '/rights',
      '/app/pages/exit.html': '/exit',
    };
    var route = routeMap[path] || path;
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity .18s';
    setTimeout(function() {
      if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
        window.location.href = route;
      } else {
        window.location.href = path;
      }
    }, 180);
  };

  window.sidebarSignOut = function() {
    var ov = document.getElementById('sidebarSoOverlay');
    var modal = document.getElementById('sidebarSoModal');
    if (ov) { ov.style.opacity = '1'; ov.style.pointerEvents = 'auto'; }
    if (modal) modal.style.transform = 'scale(1)';
  };

  window.sidebarHideSo = function() {
    var ov = document.getElementById('sidebarSoOverlay');
    var modal = document.getElementById('sidebarSoModal');
    if (ov) { ov.style.opacity = '0'; ov.style.pointerEvents = 'none'; }
    if (modal) modal.style.transform = 'scale(.94)';
  };

  window.sidebarDoSignOut = function() {
    sidebarHideSo();
    try {
      firebase.auth().signOut().then(function() { window.location.href = '/'; });
    } catch (e) {
      window.location.href = '/';
    }
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

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      injectSidebar();
      populateFromCache();
      tryHookAuth();
    });
  } else {
    injectSidebar();
    populateFromCache();
    tryHookAuth();
  }
})();
