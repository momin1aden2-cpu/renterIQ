/**
 * RenterIQ — Direct Pay & Gating System (RIQPayments)
 *
 * Pay-per-tool model. NO subscriptions. NO credits. NO recurring charges.
 * Users pay once per premium report via Stripe Checkout (hosted redirect).
 *
 * FREE FOREVER:
 *   Property Search & Tracker, Property Inspection, Rental Application,
 *   Renter Rights Hub, Maintenance Log, 1st Lease Review, Document Vault,
 *   Cross-device Cloud Sync, Push Notifications, Routine Inspection Assist,
 *   Rent Tracker, Bond Tracker, Move-Out Checklist
 *
 * PAID (direct pay):
 *   Lease Review (2nd+)       → $4.99
 *   Bond-Shield Move-In       → $24.99
 *   Exit-Guard Bond Shield    → $29.99
 *
 * Flow:
 *   - gate(feature) → checks freebie counter + active paid entitlement → resolves true,
 *     or shows the service modal → Pay button → hits /api/create-checkout-session →
 *     redirects to Stripe → user returns via /app/pages/pay-success.html → entitlement
 *     lands in Firestore via webhook → user re-taps the action and gate passes.
 *   - recordPurchase(feature) is still called after a successful analysis so the
 *     freebie counter ticks (first lease review). The paid-purchase list itself
 *     is written only by the Stripe webhook so it cannot be forged client-side.
 *
 * Usage:
 *   await RIQPayments.ready;
 *   var ok = await RIQPayments.gate('lease_review');
 *   if (!ok) return;
 *   // ... do the work ...
 *   RIQPayments.recordPurchase('lease_review');
 */
(function() {
  'use strict';

  var FEATURES = {
    lease_review:      { name: 'Lease Review',            price: '$4.99',  priceCents: 499,  freeFirst: true, freeField: 'leaseReviewCount', heroIcon: '📑', heroLine: 'Get a plain-English breakdown of every clause in your lease.' },
    entry_condition:   { name: 'Bond-Shield Move-In',     price: '$24.99', priceCents: 2499, freeFirst: false, heroIcon: '🏠', heroLine: 'Document the property at move-in with timestamped photos — protects your bond from day one.' },
    exit_bond_shield:  { name: 'Exit-Guard Bond Shield',  price: '$29.99', priceCents: 2999, freeFirst: false, heroIcon: '🚪', heroLine: 'Compare your exit vs entry photos, flag discrepancies, and get bond recovery suggestions.' }
  };

  // Entitlements are valid for 7 days from payment — matches the server-side
  // grace window in src/lib/feature-gate.ts. Keep these in sync.
  var ENTITLEMENT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

  var LOCAL_KEY = 'riq_payment_state';
  var readyResolve;
  var readyPromise = new Promise(function(res) { readyResolve = res; });
  var payState = null;

  function loadState() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      if (raw) payState = JSON.parse(raw);
    } catch (e) {}

    // Migrate from old credit system if present
    if (!payState) {
      try {
        var oldState = localStorage.getItem('riq_credit_state');
        if (oldState) {
          var old = JSON.parse(oldState);
          payState = {
            cloudSyncEnabled: !!old.cloudSyncEnabled,
            leaseReviewCount: old.leaseReviewCount || 0,
            purchases: []
          };
        }
      } catch (e) {}
    }

    if (!payState) {
      payState = { cloudSyncEnabled: false, leaseReviewCount: 0, purchases: [] };
    }

    // Sync from Firestore in background. Server is the source of truth for
    // purchases[] (webhook-written). Freebie counters merge client-local
    // max against remote.
    if (window.RIQStore) {
      RIQStore.ready.then(function() {
        if (!RIQStore.isAuthed()) { readyResolve(); return; }
        RIQStore.read('state', 'payments').then(function(remote) {
          if (remote) {
            payState.leaseReviewCount = Math.max(payState.leaseReviewCount || 0, remote.leaseReviewCount || 0);
            if (Array.isArray(remote.purchases)) {
              payState.purchases = remote.purchases;
            }
            saveLocal();
          }
          readyResolve();
        }).catch(function() { readyResolve(); });
      });
    } else {
      readyResolve();
    }
  }

  function saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(payState)); } catch (e) {}
  }

  function saveRemoteCounters() {
    // Only writes freebie counters. The purchases[] array is owned by the
    // Stripe webhook and must never be mutated from the browser.
    if (!window.RIQStore) return;
    RIQStore.ready.then(function() {
      if (!RIQStore.isAuthed()) return;
      RIQStore.write('state', 'payments', {
        leaseReviewCount: payState.leaseReviewCount || 0
      });
    });
  }

  function hasActiveEntitlement(featureKey) {
    if (!payState || !Array.isArray(payState.purchases)) return false;
    var now = Date.now();
    for (var i = 0; i < payState.purchases.length; i++) {
      var p = payState.purchases[i];
      if (!p || p.feature !== featureKey) continue;
      var ts = typeof p.createdAt === 'number' ? p.createdAt : 0;
      if (now - ts <= ENTITLEMENT_GRACE_MS) return true;
    }
    return false;
  }

  // Pull the freshest payment doc straight from Firestore — used right before
  // we show the paywall so a user who already paid (e.g. on another device or
  // in the last few seconds) is not asked to pay again.
  function refreshFromRemote() {
    return new Promise(function(resolve) {
      if (!window.RIQStore) { resolve(); return; }
      RIQStore.ready.then(function() {
        if (!RIQStore.isAuthed()) { resolve(); return; }
        RIQStore.read('state', 'payments').then(function(remote) {
          if (remote && payState) {
            payState.leaseReviewCount = Math.max(payState.leaseReviewCount || 0, remote.leaseReviewCount || 0);
            if (Array.isArray(remote.purchases)) payState.purchases = remote.purchases;
            saveLocal();
          }
          resolve();
        }).catch(function() { resolve(); });
      });
    });
  }

  function getCurrentUserEmail() {
    try {
      if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        return firebase.auth().currentUser.email || null;
      }
    } catch (e) {}
    return null;
  }

  function startCheckout(featureKey) {
    var returnTo = window.location.pathname + (window.location.search || '');
    var email = getCurrentUserEmail();
    return fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: featureKey, returnTo: returnTo, email: email })
    }).then(function(r) {
      return r.json().then(function(body) {
        if (!r.ok || !body || !body.url) {
          var msg = (body && body.error) || 'We could not start the payment. Please try again.';
          throw new Error(msg);
        }
        window.location.href = body.url;
      });
    });
  }

  function showErrorToast(message) {
    try {
      var host = document.body;
      if (!host) return;
      var existing = document.getElementById('riq-pay-error-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.id = 'riq-pay-error-toast';
      toast.textContent = message;
      toast.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#2a1a1a;color:#ffd3d3;padding:14px 20px;border-radius:14px;font-family:Nunito,sans-serif;font-weight:600;font-size:13px;z-index:100003;box-shadow:0 10px 40px rgba(0,0,0,.35);max-width:85vw;text-align:center;line-height:1.45';
      host.appendChild(toast);
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4500);
    } catch (e) {}
  }

  // ── Service Modal — shows price and launches Stripe Checkout ──
  function showServiceModal(featureKey) {
    return new Promise(function(resolve) {
      var feat = FEATURES[featureKey];
      if (!feat) { resolve(false); return; }

      var existing = document.getElementById('riq-service-modal-overlay');
      if (existing) existing.remove();

      var bondExample = featureKey === 'entry_condition' || featureKey === 'exit_bond_shield'
        ? '<div style="background:rgba(0,200,150,.06);border:1px solid rgba(0,200,150,.25);border-radius:12px;padding:12px 14px;margin-top:14px;font-weight:600;font-size:13px;color:var(--teal-dk);line-height:1.6">Your bond is typically $1,500–$3,000. This report costs just ' + feat.price + '.</div>'
        : '';

      var overlay = document.createElement('div');
      overlay.id = 'riq-service-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(10,36,96,.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .25s ease';

      var card = document.createElement('div');
      card.style.cssText = 'width:100%;max-width:430px;background:#fff;border-radius:28px 28px 0 0;padding:28px 24px calc(env(safe-area-inset-bottom,0px)+110px);transform:translateY(100%);transition:transform .35s cubic-bezier(.34,1.56,.64,1);max-height:90vh;overflow-y:auto';

      card.innerHTML =
        '<div style="width:40px;height:4px;background:var(--border);border-radius:100px;margin:0 auto 20px"></div>' +
        '<div style="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--blue),var(--blue-md));display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 18px">' + feat.heroIcon + '</div>' +
        '<div style="font-family:\'Sora\',sans-serif;font-weight:800;font-size:20px;color:var(--text);text-align:center;line-height:1.3">' + feat.name + '</div>' +
        '<div style="font-family:\'Nunito\',sans-serif;font-weight:600;font-size:14px;color:var(--muted);text-align:center;margin-top:8px;line-height:1.65">' + feat.heroLine + '</div>' +
        bondExample +
        '<div style="background:var(--blue-xl);border-radius:14px;padding:16px;margin-top:18px;text-align:center">' +
          '<div style="font-family:\'Sora\',sans-serif;font-weight:700;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">One-time payment</div>' +
          '<div style="font-family:\'Sora\',sans-serif;font-weight:800;font-size:28px;color:var(--blue);margin-top:4px">' + feat.price + '</div>' +
          '<div style="font-family:\'Nunito\',sans-serif;font-weight:600;font-size:12px;color:var(--muted);margin-top:4px">Charged once — no subscription, no recurring fees</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">' +
          '<button id="svcModalPay" style="background:linear-gradient(135deg,var(--blue),var(--blue-md));color:#fff;border:none;border-radius:14px;padding:16px;font-family:\'Sora\',sans-serif;font-weight:700;font-size:15px;cursor:pointer;min-height:52px;box-shadow:0 4px 16px rgba(27,80,200,.25)">Pay ' + feat.price + ' &amp; Continue →</button>' +
          '<button id="svcModalCancel" style="background:#fff;color:var(--muted);border:2px solid var(--border);border-radius:14px;padding:14px;font-family:\'Sora\',sans-serif;font-weight:700;font-size:14px;cursor:pointer;min-height:50px">Not now</button>' +
        '</div>' +
        '<div style="text-align:center;margin-top:14px;font-family:\'Nunito\',sans-serif;font-weight:600;font-size:11.5px;color:var(--muted)">Secure payment via Stripe · You only pay for what you use</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      requestAnimationFrame(function() {
        overlay.style.opacity = '1';
        requestAnimationFrame(function() { card.style.transform = 'translateY(0)'; });
      });

      function close(result) {
        overlay.style.opacity = '0';
        card.style.transform = 'translateY(100%)';
        setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
        resolve(result);
      }

      var payBtn = document.getElementById('svcModalPay');
      var cancelBtn = document.getElementById('svcModalCancel');

      if (payBtn) {
        payBtn.onclick = function() {
          payBtn.disabled = true;
          payBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:riqSpin .8s linear infinite;vertical-align:-3px;margin-right:8px"></span>Redirecting to secure payment…';
          ensureSpinnerKeyframes();
          startCheckout(featureKey).catch(function(err) {
            payBtn.disabled = false;
            payBtn.innerHTML = 'Pay ' + feat.price + ' &amp; Continue →';
            showErrorToast(err && err.message ? err.message : 'Payment could not start. Please try again.');
          });
          // We do not resolve here — the page is being redirected away. If
          // startCheckout fails, the button is restored for retry.
        };
      }
      if (cancelBtn) {
        cancelBtn.onclick = function() { close(false); };
      }

      overlay.onclick = function(e) { if (e.target === overlay) close(false); };
    });
  }

  function ensureSpinnerKeyframes() {
    if (document.getElementById('riq-pay-spinner-kf')) return;
    var style = document.createElement('style');
    style.id = 'riq-pay-spinner-kf';
    style.textContent = '@keyframes riqSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  // Cloud sync is free for every signed-in renter. The legacy upsell prompt
  // has been retired along with the paywall.

  // ── Public API ──
  var RIQPayments = {
    ready: readyPromise,
    FEATURES: FEATURES,

    isCloudSyncEnabled: function() { return true; },

    getState: function() { return payState ? JSON.parse(JSON.stringify(payState)) : null; },

    hasActiveEntitlement: hasActiveEntitlement,

    /**
     * Gate a feature. Returns Promise<boolean>.
     * Free features pass through. Paid features with an active entitlement
     * pass through. Otherwise the payment modal is shown, which redirects
     * the user off-page to Stripe Checkout — so the returned Promise never
     * resolves `true` for a paid feature in a single session: the user lands
     * back on the page, re-taps the action, and this time the entitlement is
     * present.
     */
    gate: function(featureKey) {
      var feat = FEATURES[featureKey];
      if (!feat) return Promise.resolve(true);

      return readyPromise.then(function() {
        // Freebie check (1st lease review)
        if (feat.freeFirst && feat.freeField && payState) {
          if ((payState[feat.freeField] || 0) === 0) return true;
        }

        // Already paid within the grace window
        if (hasActiveEntitlement(featureKey)) return true;

        // Last-chance refresh in case the webhook landed moments ago
        return refreshFromRemote().then(function() {
          if (hasActiveEntitlement(featureKey)) return true;
          return showServiceModal(featureKey);
        });
      });
    },

    /**
     * Record that a feature was used. Call AFTER the work is done.
     * Only bumps the freebie counter — the paid purchases list is owned
     * by the Stripe webhook and must never be written from the browser.
     */
    recordPurchase: function(featureKey) {
      var feat = FEATURES[featureKey];
      if (!feat || !payState) return Promise.resolve();

      if (feat.freeFirst && feat.freeField) {
        var prev = payState[feat.freeField] || 0;
        payState[feat.freeField] = prev + 1;
        saveLocal();
        saveRemoteCounters();
        if (prev === 0) {
          logUsage(featureKey, 0);
          return Promise.resolve();
        }
      }

      logUsage(featureKey, feat.priceCents);
      return Promise.resolve();
    },

    /**
     * Legacy — cloud sync is now included with every signed-in account.
     * Kept as a no-op so old call sites don't break.
     */
    enableCloudSync: function() {},

    promptCloudSync: function() {
      return Promise.resolve(false);
    }
  };

  // ── Usage logging ──
  function logUsage(featureKey, priceCents) {
    if (!window.RIQStore) return;
    RIQStore.ready.then(function() {
      if (!RIQStore.isAuthed()) return;
      var id = 'usage_' + Date.now();
      RIQStore.write('usage', id, {
        id: id,
        feature: featureKey,
        priceCents: priceCents,
        createdAt: Date.now()
      });
    });
  }

  // Cloud sync is free for every signed-in renter. No write-gating — RIQStore.write
  // goes straight through to Firestore for all collections.
  function patchCloudSyncGate() { /* intentionally empty */ }

  // ── Boot ──
  function init() {
    loadState();
  }

  // Backwards compat — expose as both RIQPayments and RIQCredits
  window.RIQPayments = RIQPayments;
  window.RIQCredits = RIQPayments;
  init();
})();
