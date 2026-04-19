/**
 * RenterIQ — Direct Pay & Gating System (RIQPayments)
 *
 * Pay-per-tool model. NO subscriptions. NO credits. NO recurring charges.
 * Users pay once per premium report via Stripe checkout.
 *
 * FREE FOREVER:
 *   Property Search & Tracker, Property Inspection, Rental Application,
 *   Renter Rights Hub, Maintenance Log, 1st Lease Review, Document Vault
 *   (local), Push Notifications, Routine Inspection Assist, Rent Tracker,
 *   Bond Tracker, Move-Out Checklist
 *
 * PAID (direct pay):
 *   Lease Review (2nd+)       → $4.99
 *   Bond-Shield Move-In       → $24.99
 *   Exit-Guard Bond Shield    → $29.99
 *
 * CLOUD SYNC:
 *   One-time $14.99 unlock. Prompted on first valuable save.
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

  var CLOUD_SYNC_PRICE = '$14.99';
  var CLOUD_SYNC_CENTS = 1499;
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

    // Sync from Firestore in background
    if (window.RIQStore) {
      RIQStore.ready.then(function() {
        if (!RIQStore.isAuthed()) { readyResolve(); return; }
        RIQStore.read('state', 'payments').then(function(remote) {
          if (remote) {
            payState.cloudSyncEnabled = payState.cloudSyncEnabled || !!remote.cloudSyncEnabled;
            payState.leaseReviewCount = Math.max(payState.leaseReviewCount, remote.leaseReviewCount || 0);
            if (remote.purchases && remote.purchases.length > (payState.purchases || []).length) {
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

  function saveRemote() {
    if (!window.RIQStore) return;
    RIQStore.ready.then(function() {
      if (RIQStore.isAuthed()) RIQStore.write('state', 'payments', payState);
    });
  }

  // ── Service Modal — shows price and Stripe checkout ──
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
          '<button id="svcModalPay" style="background:linear-gradient(135deg,var(--blue),var(--blue-md));color:#fff;border:none;border-radius:14px;padding:16px;font-family:\'Sora\',sans-serif;font-weight:700;font-size:15px;cursor:pointer;min-height:52px;box-shadow:0 4px 16px rgba(27,80,200,.25)">Pay ' + feat.price + ' &amp; Generate Report →</button>' +
          '<button id="svcModalCancel" style="background:#fff;color:var(--muted);border:2px solid var(--border);border-radius:14px;padding:14px;font-family:\'Sora\',sans-serif;font-weight:700;font-size:14px;cursor:pointer;min-height:50px">Not now</button>' +
        '</div>' +
        '<div style="text-align:center;margin-top:14px;font-family:\'Nunito\',sans-serif;font-weight:600;font-size:11.5px;color:var(--muted)">Secure payment via Stripe. You only pay for what you use.</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      requestAnimationFrame(function() {
        overlay.style.opacity = '1';
        requestAnimationFrame(function() { card.style.transform = 'translateY(0)'; });
      });

      function close(result) {
        overlay.style.opacity = '0';
        card.style.transform = 'translateY(100%)';
        setTimeout(function() { overlay.remove(); }, 300);
        resolve(result);
      }

      var payBtn = document.getElementById('svcModalPay');
      var cancelBtn = document.getElementById('svcModalCancel');

      if (payBtn) {
        payBtn.onclick = function() {
          // Stripe checkout placeholder — allow through during beta
          if (typeof showToast === 'function') {
            showToast('Beta access', 'Free during beta — generating your report', '🛡️');
          }
          close(true);
        };
      }
      if (cancelBtn) {
        cancelBtn.onclick = function() { close(false); };
      }

      overlay.onclick = function(e) { if (e.target === overlay) close(false); };
    });
  }

  // ── Cloud sync upsell prompt ──
  function showCloudSyncPrompt() {
    return new Promise(function(resolve) {
      if (payState && payState.cloudSyncEnabled) { resolve(false); return; }

      var existing = document.getElementById('riq-cloud-sync-prompt');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'riq-cloud-sync-prompt';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(10,36,96,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s ease';

      var card = document.createElement('div');
      card.style.cssText = 'width:100%;max-width:380px;background:#fff;border-radius:22px;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25);transform:scale(.9);transition:transform .3s cubic-bezier(.34,1.56,.64,1)';

      card.innerHTML =
        '<div style="text-align:center">' +
          '<div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,var(--teal),var(--teal-dk));display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px">☁️</div>' +
          '<div style="font-family:\'Sora\',sans-serif;font-weight:800;font-size:18px;color:var(--text)">Protect this document</div>' +
          '<div style="font-family:\'Nunito\',sans-serif;font-weight:600;font-size:13px;color:var(--muted);margin-top:8px;line-height:1.65">This is saved on your device only. If you lose or change your phone, this document is gone.</div>' +
          '<div style="font-family:\'Nunito\',sans-serif;font-weight:600;font-size:13px;color:var(--teal-dk);margin-top:8px;line-height:1.65">Secure it in the cloud for <strong>$14.99 one-time</strong> — access your documents from any device, forever.</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">' +
          '<button id="cloudPromptBuy" style="background:var(--teal);color:#fff;border:none;border-radius:14px;padding:14px;font-family:\'Sora\',sans-serif;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 4px 16px rgba(0,200,150,.25)">Unlock Cloud Sync — $14.99 →</button>' +
          '<button id="cloudPromptSkip" style="background:none;color:var(--muted);border:none;padding:10px;font-family:\'Nunito\',sans-serif;font-weight:600;font-size:13px;cursor:pointer">Keep it local for now</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      requestAnimationFrame(function() {
        overlay.style.opacity = '1';
        requestAnimationFrame(function() { card.style.transform = 'scale(1)'; });
      });

      function close() {
        overlay.style.opacity = '0';
        card.style.transform = 'scale(.9)';
        setTimeout(function() { overlay.remove(); }, 300);
      }

      document.getElementById('cloudPromptBuy').onclick = function() {
        // Stripe placeholder — show toast during beta
        if (typeof showToast === 'function') {
          showToast('Coming soon', 'Cloud sync purchase is being set up', '☁️');
        }
        close();
        resolve(true);
      };

      document.getElementById('cloudPromptSkip').onclick = function() {
        // Remember they dismissed it — don't show again this session
        try { sessionStorage.setItem('riq_cloud_prompt_dismissed', '1'); } catch(e) {}
        close();
        resolve(false);
      };

      overlay.onclick = function(e) { if (e.target === overlay) { close(); resolve(false); } };
    });
  }

  // ── Public API ──
  var RIQPayments = {
    ready: readyPromise,
    FEATURES: FEATURES,
    CLOUD_SYNC_PRICE: CLOUD_SYNC_PRICE,

    isCloudSyncEnabled: function() { return true; },

    getState: function() { return payState ? Object.assign({}, payState) : null; },

    /**
     * Gate a feature. Returns Promise<boolean>.
     * Free features pass through. Paid features show the payment modal.
     */
    gate: function(featureKey) {
      var feat = FEATURES[featureKey];
      if (!feat) return Promise.resolve(true);

      // Freebie check (1st lease review)
      if (feat.freeFirst && feat.freeField && payState) {
        if ((payState[feat.freeField] || 0) === 0) {
          return Promise.resolve(true);
        }
      }

      // Show payment modal
      return showServiceModal(featureKey);
    },

    /**
     * Record that a feature was used. Call AFTER the work is done.
     * Logs the purchase to Firestore.
     */
    recordPurchase: function(featureKey) {
      var feat = FEATURES[featureKey];
      if (!feat || !payState) return Promise.resolve();

      // Track freebie usage
      if (feat.freeFirst && feat.freeField) {
        if ((payState[feat.freeField] || 0) === 0) {
          payState[feat.freeField] = 1;
          saveLocal();
          saveRemote();
          logUsage(featureKey, 0);
          return Promise.resolve();
        }
      }

      // Record paid purchase
      if (feat.freeField) payState[feat.freeField] = (payState[feat.freeField] || 0) + 1;
      var purchase = {
        id: 'pur_' + Date.now(),
        feature: featureKey,
        name: feat.name,
        price: feat.price,
        priceCents: feat.priceCents,
        createdAt: Date.now()
      };
      if (!payState.purchases) payState.purchases = [];
      payState.purchases.push(purchase);
      saveLocal();
      saveRemote();
      logUsage(featureKey, feat.priceCents);

      return Promise.resolve();
    },

    /**
     * Enable cloud sync (one-time $14.99).
     * In production, called via Stripe webhook Cloud Function.
     */
    enableCloudSync: function() {
      if (!payState) return;
      payState.cloudSyncEnabled = true;
      saveLocal();
      saveRemote();
    },

    /**
     * Trigger cloud sync upsell if user hasn't purchased and hasn't dismissed this session.
     * Call after saving a valuable document (lease, condition report, entry report).
     */
    // Cloud sync is free for every signed-in renter. Call sites keep working;
    // the prompt simply resolves without showing anything.
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
