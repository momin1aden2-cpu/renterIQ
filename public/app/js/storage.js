/**
 * RenterIQ — Unified Storage Helper (RIQStore)
 *
 * Single API for reading/writing user data. Every save dual-writes to:
 *   1. localStorage    (instant, offline-first cache + landing-page anonymous use)
 *   2. Firestore       (cloud sync, cross-device, source of truth when authed)
 *
 * Files (PDFs, photos) go to Firebase Storage with auto-generated download URLs.
 *
 * Usage:
 *   await RIQStore.ready;                      // wait for auth state
 *   var uid = RIQStore.uid();                  // current user, or null
 *
 *   // Documents (per-user collections)
 *   await RIQStore.write('tracked-properties', 'prop_123', { address: '...' });
 *   var props = await RIQStore.list('tracked-properties');
 *   var one   = await RIQStore.read('tracked-properties', 'prop_123');
 *   await RIQStore.delete('tracked-properties', 'prop_123');
 *
 *   // Files
 *   var { url, path } = await RIQStore.uploadFile('leases/lease_456.pdf', file);
 *   await RIQStore.deleteFile('leases/lease_456.pdf');
 *
 *   // Bind a localStorage key to a Firestore collection (for migration)
 *   RIQStore.bindArray('renteriq_tracked_properties', 'tracked-properties', 'id');
 */
(function() {
  'use strict';

  var STORAGE_SDK_URL = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js';
  var storageLoadPromise = null;

  // ── Auth-ready promise ─────────────────────────────────────────
  var readyResolve;
  var readyPromise = new Promise(function(res) { readyResolve = res; });
  var currentUid = null;
  var firestoreReady = false;

  function waitForFirebase(retries) {
    retries = retries || 0;
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      try {
        firebase.auth().onAuthStateChanged(function(user) {
          currentUid = user ? user.uid : null;
          firestoreReady = true;
          readyResolve();
        });
      } catch (e) {
        console.warn('[RIQStore] auth listener failed:', e);
        readyResolve();
      }
      return;
    }
    if (retries > 20) {
      console.warn('[RIQStore] Firebase did not initialize in time, falling back to localStorage-only mode');
      readyResolve();
      return;
    }
    setTimeout(function() { waitForFirebase(retries + 1); }, 200);
  }
  waitForFirebase();

  // ── Internal helpers ──────────────────────────────────────────
  function safeJSON(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('[RIQStore] localStorage write failed:', e); return false; }
  }
  function db() {
    if (!firestoreReady || !currentUid || typeof firebase === 'undefined') return null;
    try { return firebase.firestore(); } catch (e) { return null; }
  }
  function userDoc() {
    var d = db();
    if (!d || !currentUid) return null;
    return d.collection('users').doc(currentUid);
  }

  // ── Image compression ─────────────────────────────────────────
  // Renter photos average 2–4MB from modern phones. Downscale + re-encode to
  // JPEG before upload: ~10× smaller files, faster uploads, cheaper storage,
  // zero perceivable quality loss at the display sizes we use.
  var MAX_IMAGE_EDGE = 1600;
  var JPEG_QUALITY = 0.78;
  var COMPRESS_MIN_BYTES = 200 * 1024; // skip compression for already-small images

  function isCompressibleImage(file) {
    if (!file || !file.type) return false;
    if (file.type === 'image/gif') return false;
    return /^image\//.test(file.type);
  }

  function compressImage(file) {
    return new Promise(function(resolve) {
      try {
        if (!isCompressibleImage(file) || (file.size && file.size < COMPRESS_MIN_BYTES)) {
          resolve(file);
          return;
        }
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function() {
          try {
            var w = img.naturalWidth || img.width;
            var h = img.naturalHeight || img.height;
            if (!w || !h) { URL.revokeObjectURL(url); resolve(file); return; }
            var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
            var tw = Math.round(w * scale);
            var th = Math.round(h * scale);
            var canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, tw, th);
            canvas.toBlob(function(blob) {
              URL.revokeObjectURL(url);
              if (!blob || blob.size >= file.size) { resolve(file); return; }
              resolve(blob);
            }, 'image/jpeg', JPEG_QUALITY);
          } catch (e) { URL.revokeObjectURL(url); resolve(file); }
        };
        img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      } catch (e) { resolve(file); }
    });
  }

  function loadStorageSDK() {
    if (typeof firebase !== 'undefined' && firebase.storage) return Promise.resolve();
    if (storageLoadPromise) return storageLoadPromise;
    storageLoadPromise = new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = STORAGE_SDK_URL;
      s.async = true;
      s.onload = function() { resolve(); };
      s.onerror = function() { reject(new Error('Failed to load Firebase Storage SDK')); };
      document.head.appendChild(s);
    });
    return storageLoadPromise;
  }

  // ── Public API ────────────────────────────────────────────────
  var RIQStore = {
    ready: readyPromise,
    uid: function() { return currentUid; },
    isAuthed: function() { return !!currentUid; },

    /** Compress an image File/Blob for callers that store locally (e.g. Quick Scans). */
    compressImage: function(file) { return compressImage(file); },

    /**
     * Write a single document. Always writes to localStorage cache first
     * (instant + offline), then mirrors to Firestore if signed in.
     *
     * @param {string} collection — e.g. 'tracked-properties'
     * @param {string} id — doc id
     * @param {object} data — must be JSON-serializable
     * @returns {Promise<void>}
     */
    write: function(collection, id, data) {
      // Firestore rejects null/undefined on .set() — route callers that
      // pass null through the delete path to keep the cache and server in sync.
      if (data === null || data === undefined) {
        return this.delete(collection, id);
      }

      var cacheKey = 'riqcache:' + collection;
      var cache = safeJSON(cacheKey, {});
      cache[id] = data;
      safeSet(cacheKey, cache);

      var doc = userDoc();
      if (!doc) return Promise.resolve();
      return doc.collection(collection).doc(id).set(data, { merge: true }).catch(function(err) {
        console.warn('[RIQStore] Firestore write failed (will retry on next save):', err);
      });
    },

    /**
     * Read a single document. Returns the cached version immediately
     * if Firestore is offline or not signed in. Refreshes cache from
     * Firestore in the background.
     */
    read: function(collection, id) {
      var cacheKey = 'riqcache:' + collection;
      var cache = safeJSON(cacheKey, {});
      var cached = cache[id] || null;

      var doc = userDoc();
      if (!doc) return Promise.resolve(cached);

      return doc.collection(collection).doc(id).get().then(function(snap) {
        if (snap.exists) {
          var fresh = snap.data();
          cache[id] = fresh;
          safeSet(cacheKey, cache);
          return fresh;
        }
        return cached;
      }).catch(function(err) {
        console.warn('[RIQStore] Firestore read failed, returning cache:', err);
        return cached;
      });
    },

    /**
     * List all documents in a collection. Returns an array.
     * Reads from Firestore when signed in, falls back to localStorage cache.
     */
    list: function(collection) {
      var cacheKey = 'riqcache:' + collection;
      var cache = safeJSON(cacheKey, {});
      var cachedArray = Object.keys(cache).map(function(k) {
        var v = cache[k];
        if (v && typeof v === 'object' && !v.id) v.id = k;
        return v;
      });

      var doc = userDoc();
      if (!doc) return Promise.resolve(cachedArray);

      return doc.collection(collection).get().then(function(snap) {
        var fresh = {};
        var arr = [];
        snap.forEach(function(d) {
          var data = d.data();
          if (!data.id) data.id = d.id;
          fresh[d.id] = data;
          arr.push(data);
        });
        safeSet(cacheKey, fresh);
        return arr;
      }).catch(function(err) {
        console.warn('[RIQStore] Firestore list failed, returning cache:', err);
        return cachedArray;
      });
    },

    /** Delete a document from both Firestore and the local cache. */
    delete: function(collection, id) {
      var cacheKey = 'riqcache:' + collection;
      var cache = safeJSON(cacheKey, {});
      delete cache[id];
      safeSet(cacheKey, cache);

      var doc = userDoc();
      if (!doc) return Promise.resolve();
      return doc.collection(collection).doc(id).delete().catch(function(err) {
        console.warn('[RIQStore] Firestore delete failed:', err);
      });
    },

    /**
     * Upload a file to Firebase Storage under users/{uid}/{path}.
     * Returns { url, path, size } on success.
     */
    uploadFile: function(path, file, metadata) {
      if (!currentUid) return Promise.reject(new Error('Not signed in'));
      return loadStorageSDK().then(function() {
        var fullPath = 'users/' + currentUid + '/' + path;
        var storageRef = firebase.storage().ref(fullPath);
        return storageRef.put(file, metadata || {}).then(function(snap) {
          return snap.ref.getDownloadURL().then(function(url) {
            return { url: url, path: fullPath, size: file.size };
          });
        });
      });
    },

    /**
     * Resumable upload with per-byte progress. Returns { promise, cancel, pause, resume, path }.
     * - promise resolves with { url, path, size }
     * - cancel()/pause()/resume() control the in-flight task
     * - onProgress(pct, transferred, total) fires as bytes move
     * Safe to call before loadStorageSDK resolves — controls are wired once the task exists.
     */
    uploadFileResumable: function(path, file, options) {
      options = options || {};
      var onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      var metadata = options.metadata || {};
      var skipCompress = options.skipCompress === true;

      if (!currentUid) {
        return {
          promise: Promise.reject(new Error('Not signed in')),
          cancel: function() {}, pause: function() {}, resume: function() {},
          path: null
        };
      }

      var fullPath = 'users/' + currentUid + '/' + path;
      var task = null;
      var cancelled = false;

      var prep = skipCompress ? Promise.resolve(file) : compressImage(file);

      var promise = prep.then(function(readyFile) {
        return loadStorageSDK().then(function() { return readyFile; });
      }).then(function(readyFile) {
        if (cancelled) throw new Error('Upload cancelled');
        var storageRef = firebase.storage().ref(fullPath);
        var meta = metadata;
        if (!skipCompress && readyFile && readyFile.type && readyFile !== file) {
          meta = Object.assign({}, metadata, { contentType: readyFile.type });
        }
        task = storageRef.put(readyFile, meta);

        return new Promise(function(resolve, reject) {
          task.on('state_changed',
            function(snap) {
              if (!onProgress) return;
              var total = snap.totalBytes || readyFile.size || 1;
              var pct = Math.min(100, Math.round((snap.bytesTransferred / total) * 100));
              try { onProgress(pct, snap.bytesTransferred, total); } catch (e) {}
            },
            function(err) { reject(err); },
            function() {
              task.snapshot.ref.getDownloadURL().then(function(url) {
                resolve({ url: url, path: fullPath, size: readyFile.size });
              }).catch(reject);
            }
          );
        });
      });

      return {
        promise: promise,
        path: fullPath,
        cancel: function() {
          cancelled = true;
          if (task) { try { task.cancel(); } catch (e) {} }
        },
        pause: function() { if (task) { try { task.pause(); } catch (e) {} } },
        resume: function() { if (task) { try { task.resume(); } catch (e) {} } }
      };
    },

    /** Delete a file from Firebase Storage. */
    deleteFile: function(path) {
      if (!currentUid) return Promise.resolve();
      return loadStorageSDK().then(function() {
        var fullPath = path.indexOf('users/') === 0 ? path : 'users/' + currentUid + '/' + path;
        return firebase.storage().ref(fullPath).delete().catch(function(err) {
          console.warn('[RIQStore] Storage delete failed:', err);
        });
      });
    },

    /**
     * Migration helper: take an existing localStorage array (e.g. renteriq_tracked_properties)
     * and write each item to a Firestore collection. Idempotent — uses each item's id.
     *
     * @param {string} localKey — the existing localStorage key
     * @param {string} collection — Firestore collection name
     * @param {string} idField — the field on each item that should become the doc id (default 'id')
     */
    migrateArray: function(localKey, collection, idField) {
      idField = idField || 'id';
      var doc = userDoc();
      if (!doc) return Promise.resolve({ migrated: 0, skipped: 0 });

      var arr = safeJSON(localKey, []);
      if (!Array.isArray(arr) || arr.length === 0) return Promise.resolve({ migrated: 0, skipped: 0 });

      var batch = firebase.firestore().batch();
      var col = doc.collection(collection);
      var migrated = 0;
      arr.forEach(function(item) {
        if (!item) return;
        var id = item[idField] || (collection + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
        batch.set(col.doc(id), Object.assign({}, item, { id: id, _migratedAt: Date.now() }), { merge: true });
        migrated++;
      });
      return batch.commit().then(function() {
        // Mark this localKey as migrated so we don't repeat
        try { localStorage.setItem('riqmigrated:' + localKey, String(Date.now())); } catch(e) {}
        return { migrated: migrated, skipped: 0 };
      }).catch(function(err) {
        console.warn('[RIQStore] migrateArray failed for ' + localKey + ':', err);
        return { migrated: 0, skipped: arr.length, error: err.message };
      });
    },

    /** Has this localStorage key already been migrated? */
    isMigrated: function(localKey) {
      try { return !!localStorage.getItem('riqmigrated:' + localKey); }
      catch (e) { return false; }
    }
  };

  window.RIQStore = RIQStore;
})();
