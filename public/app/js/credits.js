/**
 * RenterIQ — Credit & Gating System (RIQCredits)
 *
 * Pay-per-event utility model. NO subscriptions. NO recurring charges.
 * Credits never expire. Users only pay when they need high-stakes value.
 *
 * FREE FOREVER:
 *   Property Search & Tracker, Property Inspection, Rental Application,
 *   Renter Rights Hub, Maintenance Log, 1st Lease Review, Document Vault
 *   (local), Push Notifications
 *
 * PAID (credits):
 *   Lease Review (2nd+)       → 1 credit ($4.99)
 *   Bond-Shield Move-In       → 3 credits ($15.99)
 *   Routine Assist            → 1 credit ($4.99)
 *   Exit-Guard Bond Shield    → 4 credits ($19.99)
 *
 * CLOUD SYNC:
 *   One-time $9.99 unlock. When NOT purchased, RIQStore cloud writes
 *   are silently skipped — everything stays local-only (private by default).
 *
 * Usage:
 *   await RIQCredits.ready;
 *   var ok = await RIQCredits.gate('lease_review');   // checks + prompts if needed
 *   if (!ok) return;                                   // user declined or no credits
 *   // ... do the work ...
 *   await RIQCredits.consume('lease_review');          // deduct credits + log usage
 */
(function() {
  'use strict';

  // ── Feature definitions ──
  var FEATURES = {
    lease_review:      { name: 'Lease Review',              credits: 1, price: '$4.99',  freeFirst: true,  freeField: 'leaseReviewCount', heroIcon: '📑', heroLine: 'Get a plain-English breakdown of every clause in your lease.' },
    entry_condition:   { name: 'Bond-Shield Move-In',       credits: 3, price: '$15.99', freeFirst: false, heroIcon: '🏠', heroLine: 'Document the property at move-in with timestamped photos — protects your bond from day one.' },
    routine_assist:    { name: 'Routine Assist',            credits: 1, price: '$4.99',  freeFirst: false, heroIcon: '🛡️', heroLine: 'Respond professionally to your agent\'s quarterly inspection — items categorised, response drafted.' },
    exit_bond_shield:  { name: 'Exit-Guard Bond Shield',   credits: 4, price: '$19.99', freeFirst: false, heroIcon: '🚪', heroLine: 'Compare your exit vs entry photos, flag discrepancies, and get bond recovery suggestions.' }
  };

  var CLOUD_SYNC_PRICE = '$9.99';
  var LOCAL_KEY = 'riq_credit_state';
  var readyResolve;
  var readyPromise = new Promise(function(res) { readyResolve = res; });
  var creditState = null;

  // ── Read / write credit state ──
  function loadState() {
    // Try localStorage first (instant)
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      if (raw) creditState = JSON.parse(raw);
    } catch (e) {}

    if (!creditState) {
      creditState = { credits: 0, cloudSyncEnabled: false, leaseReviewCount: 0, lifetimeCredits: 0, betaCredited: false };
    }

    // Then try Firestore (background, may override)
    if (window.RIQStore) {
      RIQStore.ready.then(function() {
        if (!RIQStore.isAuthed()) { readyResolve(); return; }
        RIQStore.read('state', 'credits').then(function(remote) {
          if (remote) {
            // Merge: prefer higher credit count (handles offline consumption)
            creditState.credits = Math.max(creditState.credits, remote.credits || 0);
            creditState.cloudSyncEnabled = creditState.cloudSyncEnabled || remote.cloudSyncEnabled || false;
            creditState.leaseReviewCount = Math.max(creditState.leaseReviewCount, remote.leaseReviewCount || 0);
            creditState.lifetimeCredits = Math.max(creditState.lifetimeCredits, remote.lifetimeCredits || 0);
            creditState.betaCredited = creditState.betaCredited || remote.betaCredited || false;
            saveLocal();
          }
          // Grant beta credits on first ever load (5 free credits as thanks for testing)
          if (!creditState.betaCredited) {
            creditState.credits += 99;
            creditState.lifetimeCredits += 99;
            creditState.betaCredited = true;
            saveLocal();
            saveRemote();
          }
          readyResolve();
        }).catch(function() { readyResolve(); });
      });
    } else {
      // No RIQStore — grant beta credits locally
      if (!creditState.betaCredited) {
        creditState.credits += 99;
        creditState.lifetimeCredits += 99;
        creditState.betaCredited = true;
        saveLocal();
      }
      readyResolve();
    }
  }

  function saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(creditState)); } catch (e) {}
  }

  function saveRemote() {
    if (!window.RIQStore) return;
    RIQStore.ready.then(function() {
      if (RIQStore.isAuthed()) RIQStore.write('state', 'credits', creditState);
    });
  }

  // ── Public API ──
  var RIQCredits = {
    ready: readyPromise,
    FEATURES: FEATURES,

    /** Current credit balance */
    getBalance: function() { return creditState ? creditState.credits : 0; },

    /** Is cloud sync purchased? */
    isCloudSyncEnabled: function() { return creditState ? !!creditState.cloudSyncEnabled : false; },

    /** Get the full state object (for UI rendering) */
    getState: function() { return creditState ? Object.assign({}, creditState) : null; },

    /**
     * Can the user use this feature right now?
     * Returns true if: feature is free, OR user used their freebie, OR has enough credits.
     */
    canUse: function(featureKey) {
      var feat = FEATURES[featureKey];
      if (!feat) return true; // unknown feature → don't gate

      // Check freebie (1st lease review is always free)
      if (feat.freeFirst && feat.freeField && creditState) {
        if ((creditState[feat.freeField] || 0) === 0) return true; // hasn't used freebie yet
      }

      // Check credit balance
      return creditState && creditState.credits >= feat.credits;
    },

    /**
     * Gate a feature: check if user can use it, and if not, show the Service Modal.
     * Returns a Promise<boolean>: true = proceed, false = user declined or can't afford.
     */
    gate: function(featureKey) {
      var feat = FEATURES[featureKey];
      if (!feat) return Promise.resolve(true);

      // Freebie check
      if (feat.freeFirst && feat.freeField && creditState) {
        if ((creditState[feat.freeField] || 0) === 0) {
          return Promise.resolve(true); // first use is free
        }
      }

      // Has enough credits?
      if (creditState && creditState.credits >= feat.credits) {
        return Promise.resolve(true);
      }

      // Show the Service Modal
      return showServiceModal(featureKey);
    },

    /**
     * Consume credits for a feature. Call AFTER the work is done.
     * Decrements credits, logs usage, syncs to Firestore.
     * Returns Promise<void>.
     */
    consume: function(featureKey) {
      var feat = FEATURES[featureKey];
      if (!feat || !creditState) return Promise.resolve();

      // Is this the freebie?
      if (feat.freeFirst && feat.freeField) {
        if ((creditState[feat.freeField] || 0) === 0) {
          // First use — don't charge, just mark the freebie as used
          creditState[feat.freeField] = 1;
          saveLocal();
          saveRemote();
          // Log usage
          logUsage(featureKey, 0);
          return Promise.resolve();
        }
      }

      // Deduct credits
      creditState.credits = Math.max(0, creditState.credits - feat.credits);
      if (feat.freeField) creditState[feat.freeField] = (creditState[feat.freeField] || 0) + 1;
      saveLocal();
      saveRemote();

      // Log usage
      logUsage(featureKey, feat.credits);
      return Promise.resolve();
    },

    /**
     * Add credits (for purchases). In production this should only
     * be called by a Cloud Function via Stripe webhook.
     * During beta it's called client-side for the initial grant.
     */
    addCredits: function(amount, reason) {
      if (!creditState) return;
      creditState.credits += amount;
      creditState.lifetimeCredits += amount;
      saveLocal();
      saveRemote();

      // Log transaction
      if (window.RIQStore) {
        RIQStore.ready.then(function() {
          if (!RIQStore.isAuthed()) return;
          var txnId = 'txn_' + Date.now();
          RIQStore.write('transactions', txnId, {
            id: txnId,
            type: 'credit_purchase',
            credits: amount,
            reason: reason || 'manual',
            amount: 0, // $0 for beta grants; Stripe sets real amount
            stripeId: null,
            status: 'completed',
            createdAt: Date.now()
          });
        });
      }
    },

    /**
     * Enable cloud sync (one-time $9.99 purchase).
     * During beta, called directly. In production, via Stripe webhook.
     */
    enableCloudSync: function() {
      if (!creditState) return;
      creditState.cloudSyncEnabled = true;
      saveLocal();
      saveRemote();
    }
  };

  // ── Usage logging ──
  function logUsage(featureKey, credits) {
    if (!window.RIQStore) return;
    RIQStore.ready.then(function() {
      if (!RIQStore.isAuthed()) return;
      var usageId = 'usage_' + Date.now();
      RIQStore.write('usage', usageId, {
        id: usageId,
        feature: featureKey,
        credits: credits,
        createdAt: Date.now()
      });
    });
  }

  // ── Service Modal ──
  // Shows a premium overlay explaining the value of the feature
  // and offering to use credits or buy more.
  function showServiceModal(featureKey) {
    return new Promise(function(resolve) {
      var feat = FEATURES[featureKey];
      if (!feat) { resolve(false); return; }

      var balance = creditState ? creditState.credits : 0;
      var canAfford = balance >= feat.credits;
      var deficit = feat.credits - balance;

      // Remove any existing modal
      var existing = document.getElementById('riq-service-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'riq-service-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(10,36,96,.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .25s ease';

      var card = document.createElement('div');
      card.style.cssText = 'width:100%;max-width:430px;background:#fff;border-radius:28px 28px 0 0;padding:28px 24px calc(env(safe-area-inset-bottom,0px)+110px);transform:translateY(100%);transition:transform .35s cubic-bezier(.34,1.56,.64,1);max-height:90vh;overflow-y:auto';

      var bondExample = featureKey === 'entry_condition' || featureKey === 'exit_bond_shield'
        ? '<div style="background:rgba(0,200,150,.06);border:1px solid rgba(0,200,150,.25);border-radius:12px;padding:12px 14px;margin-top:14px;font-weight:600;font-size:13px;color:var(--teal-dk);line-height:1.6">Your bond is typically $1,500–$3,000. This report costs just ' + feat.price + '.</div>'
        : '';

      card.innerHTML =
        '<div style="width:40px;height:4px;background:var(--border);border-radius:100px;margin:0 auto 20px"></div>' +
        '<div style="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--blue),var(--blue-md));display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 18px">' + feat.heroIcon + '</div>' +
        '<div style="font-family:\'Sora\',sans-serif;font-weight:800;font-size:20px;color:var(--text);text-align:center;line-height:1.3">' + feat.name + '</div>' +
        '<div style="font-family:\'Nunito\',sans-serif;font-weight:600;font-size:14px;color:var(--muted);text-align:center;margin-top:8px;line-height:1.65">' + feat.heroLine + '</div>' +
        bondExample +
        '<div style="background:var(--blue-xl);border-radius:14px;padding:16px;margin-top:18px;display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="font-family:\'Sora\',sans-serif;font-weight:700;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Cost</div><div style="font-family:\'Sora\',sans-serif;font-weight:800;font-size:18px;color:var(--blue)">' + feat.credits + ' credit' + (feat.credits !== 1 ? 's' : '') + '</div></div>' +
          '<div style="text-align:right"><div style="font-family:\'Sora\',sans-serif;font-weight:700;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Your balance</div><div style="font-family:\'Sora\',sans-serif;font-weight:800;font-size:18px;color:' + (canAfford ? 'var(--teal-dk)' : 'var(--red)') + '">' + balance + ' credit' + (balance !== 1 ? 's' : '') + '</div></div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">' +
          (canAfford
            ? '<button id="svcModalUnlock" style="background:linear-gradient(135deg,var(--blue),var(--blue-md));color:#fff;border:none;border-radius:14px;padding:16px;font-family:\'Sora\',sans-serif;font-weight:700;font-size:15px;cursor:pointer;min-height:52px;box-shadow:0 4px 16px rgba(27,80,200,.25)">Unlock for ' + feat.credits + ' credit' + (feat.credits !== 1 ? 's' : '') + ' →</button>'
            : '<button id="svcModalBuy" style="background:linear-gradient(135deg,var(--blue),var(--blue-md));color:#fff;border:none;border-radius:14px;padding:16px;font-family:\'Sora\',sans-serif;font-weight:700;font-size:15px;cursor:pointer;min-height:52px;box-shadow:0 4px 16px rgba(27,80,200,.25)">Buy ' + deficit + ' more credit' + (deficit !== 1 ? 's' : '') + ' · ' + feat.price + '</button>'
          ) +
          '<button id="svcModalCancel" style="background:#fff;color:var(--muted);border:2px solid var(--border);border-radius:14px;padding:14px;font-family:\'Sora\',sans-serif;font-weight:700;font-size:14px;cursor:pointer;min-height:50px">Not now</button>' +
        '</div>' +
        '<div style="text-align:center;margin-top:14px;font-family:\'Nunito\',sans-serif;font-weight:600;font-size:11.5px;color:var(--muted)">No subscription. No recurring charges. Credits never expire.</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Animate in
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

      // Button handlers
      var unlockBtn = document.getElementById('svcModalUnlock');
      var buyBtn = document.getElementById('svcModalBuy');
      var cancelBtn = document.getElementById('svcModalCancel');

      if (unlockBtn) {
        unlockBtn.onclick = function() { close(true); };
      }
      if (buyBtn) {
        buyBtn.onclick = function() {
          // Stripe placeholder — show toast for now
          if (typeof showToast === 'function') {
            showToast('Coming soon', 'Credit purchases are being set up', '✦');
          } else {
            alert('Credit purchases are being set up — check back shortly.');
          }
          close(false);
        };
      }
      if (cancelBtn) {
        cancelBtn.onclick = function() { close(false); };
      }

      // Close on backdrop tap
      overlay.onclick = function(e) { if (e.target === overlay) close(false); };
    });
  }

  // ── Cloud sync gate ──
  // Patches RIQStore.write so cloud writes only fire when cloudSyncEnabled is true.
  // Local cache writes always work regardless.
  function patchCloudSyncGate() {
    if (!window.RIQStore || !RIQStore._originalWrite) {
      if (window.RIQStore && RIQStore.write) {
        RIQStore._originalWrite = RIQStore.write;
        RIQStore.write = function(collection, id, data) {
          // Always write to localStorage cache
          var cacheKey = 'riqcache:' + collection;
          try {
            var cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
            cache[id] = data;
            localStorage.setItem(cacheKey, JSON.stringify(cache));
          } catch (e) {}

          // Cloud sync only if enabled OR if writing to state/* (always allowed for settings)
          if (creditState && creditState.cloudSyncEnabled) {
            return RIQStore._originalWrite.call(RIQStore, collection, id, data);
          }
          if (collection === 'state' || collection === 'transactions' || collection === 'usage' || collection === 'reviews') {
            return RIQStore._originalWrite.call(RIQStore, collection, id, data);
          }
          // Cloud sync not enabled — skip Firestore write silently
          return Promise.resolve();
        };
      }
    }
  }

  // ── Boot ──
  function init() {
    loadState();
    // Patch cloud sync gate once RIQStore is available
    if (window.RIQStore) {
      patchCloudSyncGate();
    } else {
      // Wait for RIQStore to load (it's deferred)
      var attempts = 0;
      var check = setInterval(function() {
        if (window.RIQStore || attempts > 40) {
          clearInterval(check);
          if (window.RIQStore) patchCloudSyncGate();
        }
        attempts++;
      }, 150);
    }
  }

  window.RIQCredits = RIQCredits;
  init();
})();
