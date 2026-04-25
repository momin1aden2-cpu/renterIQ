// AI pre-flight disclaimer system. Two layers:
//  1. Inline banner — calm strip rendered above any AI trigger surface, mounted
//     by RIQDisclaimer.banner(container) or auto-injected into elements with
//     [data-ai-disclaimer] at DOMContentLoaded.
//  2. Gate — Promise-based, fires once. The first time the renter runs an AI
//     feature anywhere in the app we show a one-tap acknowledgement bottom
//     sheet. After that the gate resolves immediately. Wrap any fetch call
//     to /api/<ai endpoint> with RIQDisclaimer.gate().then(ok => ...).

(function(){
  if (typeof window === 'undefined') return;
  if (window.RIQDisclaimer) return;

  var ACK_KEY = 'riq_ai_disclaimer_v1';
  var STYLE_ID = 'riq-ai-disclaimer-style';
  var GENERIC_COPY = 'RenterIQ helps you spot things worth a closer look. It can miss things or read them wrong. Treat the output as a starting point, not the final word.';

  function isAcknowledged(){
    try { return localStorage.getItem(ACK_KEY) === '1'; } catch(e){ return false; }
  }
  function setAcknowledged(){
    try { localStorage.setItem(ACK_KEY, '1'); } catch(e){}
  }

  function ensureStyles(){
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.riq-ai-banner{display:flex;gap:10px;align-items:flex-start;background:rgba(27,80,200,.05);border:1px solid rgba(27,80,200,.18);border-radius:12px;padding:10px 12px;font-family:Nunito,sans-serif;font-weight:600;font-size:12px;color:#1F3A6E;line-height:1.55;box-sizing:border-box;margin-bottom:12px}',
      '.riq-ai-banner-icon{width:20px;height:20px;border-radius:50%;background:#1B50C8;color:#fff;font-family:Sora,sans-serif;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;font-style:italic}',
      '.riq-ai-banner-text{flex:1;min-width:0}',
      '.riq-ai-banner.subtle{background:rgba(15,23,42,.04);border-color:rgba(15,23,42,.1);color:#475569}',
      '.riq-ai-banner.subtle .riq-ai-banner-icon{background:#475569}',
      '.riq-ai-banner.amber{background:rgba(245,166,35,.07);border-color:rgba(245,166,35,.25);color:#7A5500}',
      '.riq-ai-banner.amber .riq-ai-banner-icon{background:#C28100}',
      '.riq-ai-gate{position:fixed;inset:0;z-index:100050;background:rgba(10,36,96,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .22s ease}',
      '.riq-ai-gate.on{opacity:1}',
      '.riq-ai-gate-card{background:#fff;border-radius:22px 22px 0 0;width:100%;max-width:480px;max-height:90vh;display:flex;flex-direction:column;transform:translateY(100%);transition:transform .32s cubic-bezier(.2,.8,.3,1);overflow:hidden}',
      '.riq-ai-gate.on .riq-ai-gate-card{transform:translateY(0)}',
      '.riq-ai-gate-handle{width:44px;height:4px;border-radius:2px;background:rgba(15,23,42,.15);margin:12px auto 4px}',
      '.riq-ai-gate-body{padding:8px 22px 18px;overflow-y:auto;-webkit-overflow-scrolling:touch}',
      '.riq-ai-gate-emoji{font-size:34px;text-align:center;margin-bottom:6px}',
      '.riq-ai-gate-title{font-family:Sora,sans-serif;font-weight:800;font-size:18px;color:#0F172A;letter-spacing:-.3px;text-align:center;margin-bottom:8px}',
      '.riq-ai-gate-copy{font-family:Nunito,sans-serif;font-weight:600;font-size:13.5px;color:#475569;line-height:1.6;text-align:center;margin-bottom:14px}',
      '.riq-ai-gate-points{background:rgba(27,80,200,.05);border:1px solid rgba(27,80,200,.12);border-radius:14px;padding:12px 14px;margin-bottom:8px}',
      '.riq-ai-gate-point{display:flex;gap:10px;align-items:flex-start;padding:6px 0;font-family:Nunito,sans-serif;font-weight:600;font-size:12.5px;color:#1F3A6E;line-height:1.55}',
      '.riq-ai-gate-point + .riq-ai-gate-point{border-top:1px solid rgba(27,80,200,.08)}',
      '.riq-ai-gate-point-tick{width:18px;height:18px;border-radius:50%;background:#1B50C8;color:#fff;font-family:Sora,sans-serif;font-weight:800;font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}',
      '.riq-ai-gate-point.warn .riq-ai-gate-point-tick{background:#C28100}',
      '.riq-ai-gate-actions{display:flex;flex-direction:column;gap:8px;padding:10px 22px 22px}',
      '.riq-ai-gate-primary{width:100%;background:#1B50C8;color:#fff;border:none;border-radius:14px;padding:14px;font-family:Sora,sans-serif;font-weight:800;font-size:14.5px;cursor:pointer;-webkit-tap-highlight-color:transparent;letter-spacing:.2px;box-shadow:0 4px 14px rgba(27,80,200,.25)}',
      '.riq-ai-gate-primary:active{transform:scale(.98)}',
      '.riq-ai-gate-secondary{width:100%;background:transparent;color:#64748B;border:none;padding:10px;font-family:Sora,sans-serif;font-weight:700;font-size:13px;cursor:pointer;-webkit-tap-highlight-color:transparent;letter-spacing:.2px}'
    ].join('');
    document.head.appendChild(style);
  }

  function renderBannerInto(container, opts){
    if (!container) return null;
    ensureStyles();
    opts = opts || {};
    var node = document.createElement('div');
    var variant = opts.subtle ? ' subtle' : (opts.amber ? ' amber' : '');
    node.className = 'riq-ai-banner' + variant;
    node.setAttribute('role', 'note');
    var icon = document.createElement('span');
    icon.className = 'riq-ai-banner-icon';
    icon.textContent = 'i';
    var text = document.createElement('span');
    text.className = 'riq-ai-banner-text';
    text.textContent = opts.copy || GENERIC_COPY;
    node.appendChild(icon);
    node.appendChild(text);
    container.appendChild(node);
    return node;
  }

  function autoMount(root){
    root = root || document;
    var nodes = root.querySelectorAll('[data-ai-disclaimer]');
    Array.prototype.forEach.call(nodes, function(el){
      if (el.dataset.aiDisclaimerMounted === '1') return;
      el.dataset.aiDisclaimerMounted = '1';
      var copy = el.getAttribute('data-ai-copy') || GENERIC_COPY;
      var subtle = el.hasAttribute('data-ai-subtle');
      var amber = el.hasAttribute('data-ai-amber');
      renderBannerInto(el, { copy: copy, subtle: subtle, amber: amber });
    });
  }

  // gate() resolves with `true` if the user acknowledged (or had previously),
  // and `false` if they cancelled. Call sites can branch without try/catch.
  function gate(){
    return new Promise(function(resolve){
      if (isAcknowledged()) { resolve(true); return; }
      ensureStyles();
      var overlay = document.createElement('div');
      overlay.className = 'riq-ai-gate';
      overlay.innerHTML =
        '<div class="riq-ai-gate-card" role="dialog" aria-modal="true" aria-labelledby="riqAiGateTitle">' +
          '<div class="riq-ai-gate-handle"></div>' +
          '<div class="riq-ai-gate-body">' +
            '<div class="riq-ai-gate-emoji">📍</div>' +
            '<div class="riq-ai-gate-title" id="riqAiGateTitle">Before we run this</div>' +
            '<div class="riq-ai-gate-copy">A quick heads up on what RenterIQ does and doesn\'t do — so you know how to use what comes back.</div>' +
            '<div class="riq-ai-gate-points">' +
              '<div class="riq-ai-gate-point"><span class="riq-ai-gate-point-tick">✓</span><span>Helps you spot things worth a closer look in your lease, condition reports and other tenancy documents.</span></div>' +
              '<div class="riq-ai-gate-point"><span class="riq-ai-gate-point-tick">✓</span><span>Drafts emails and notes you can use as a starting point.</span></div>' +
              '<div class="riq-ai-gate-point warn"><span class="riq-ai-gate-point-tick">!</span><span>It can miss details or read something wrong. Always check the source document and your state tenancy authority before you act.</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="riq-ai-gate-actions">' +
            '<button type="button" class="riq-ai-gate-primary" data-riq-ai-confirm>Got it — continue</button>' +
            '<button type="button" class="riq-ai-gate-secondary" data-riq-ai-cancel>Cancel</button>' +
          '</div>' +
        '</div>';

      var settled = false;
      function close(ack){
        if (settled) return;
        settled = true;
        overlay.classList.remove('on');
        setTimeout(function(){
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 240);
        if (ack) setAcknowledged();
        resolve(!!ack);
      }
      overlay.querySelector('[data-riq-ai-confirm]').addEventListener('click', function(){ close(true); });
      overlay.querySelector('[data-riq-ai-cancel]').addEventListener('click', function(){ close(false); });
      overlay.addEventListener('click', function(e){ if (e.target === overlay) close(false); });
      document.body.appendChild(overlay);
      requestAnimationFrame(function(){ overlay.classList.add('on'); });
    });
  }

  // Convenience wrapper. Use as:
  //   RIQDisclaimer.runIfAcked(function(){ return fetch('/api/...'); })
  //     .then(handleResponse)
  //     .catch(handleError);
  // The wrapper resolves with the inner function's result, or rejects with
  // a sentinel error if the user cancels the gate.
  function runIfAcked(work){
    return gate().then(function(ok){
      if (!ok) {
        var err = new Error('disclaimer-cancelled');
        err.code = 'DISCLAIMER_CANCELLED';
        throw err;
      }
      return work();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ autoMount(); });
  } else {
    autoMount();
  }

  window.RIQDisclaimer = {
    banner: renderBannerInto,
    gate: gate,
    runIfAcked: runIfAcked,
    autoMount: autoMount,
    isAcknowledged: isAcknowledged,
    GENERIC_COPY: GENERIC_COPY
  };
})();
