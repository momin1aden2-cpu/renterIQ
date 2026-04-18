/**
 * RenterIQ — Secure on-device document storage (RIQSecureDocs)
 *
 * ID photos, payslips, bank statements and other sensitive docs live here.
 *
 * What this does:
 *  • AES-GCM encrypts every file before it touches disk.
 *  • The encryption key is generated with extractable:false and stored as a
 *    CryptoKey object inside IndexedDB — the raw key bytes never exist in
 *    JavaScript memory after generation, so a page script (including XSS)
 *    cannot exfiltrate them.
 *  • Encrypted bytes live in IndexedDB object stores, not localStorage.
 *    localStorage is cleared more aggressively by browsers and exposes
 *    values as plain strings to any script on the origin.
 *  • Nothing here syncs to the cloud. Bytes stay on this device.
 *    Only metadata (doc type, filename, size, upload timestamp, 100-point
 *    score contribution) is returned for cloud sync by the caller.
 *
 * API:
 *   RIQSecureDocs.put(docId, file)   → {id, name, size, mimeType, ts, ptsHint}
 *   RIQSecureDocs.get(docId)         → { name, size, mimeType, ts, blob } | null
 *   RIQSecureDocs.getObjectURL(id)   → string | null  (caller must revoke)
 *   RIQSecureDocs.remove(docId)      → void
 *   RIQSecureDocs.list()             → [{id, name, size, mimeType, ts}]
 *   RIQSecureDocs.clear()            → void
 *   RIQSecureDocs.migrateFromLegacy() → count of migrated docs (one-shot)
 */
(function () {
  'use strict';

  var _supported = ('indexedDB' in window) && (window.crypto && crypto.subtle && typeof crypto.subtle.generateKey === 'function');
  if (!_supported) {
    window.RIQSecureDocs = {
      put: function () { return Promise.reject(new Error('Secure storage not supported on this browser')); },
      get: function () { return Promise.resolve(null); },
      getObjectURL: function () { return Promise.resolve(null); },
      remove: function () { return Promise.resolve(); },
      list: function () { return Promise.resolve([]); },
      has: function () { return Promise.resolve(false); },
      meta: function () { return Promise.resolve(null); },
      clear: function () { return Promise.resolve(); },
      migrateFromLegacy: function () { return Promise.resolve(0); },
      supported: false
    };
    return;
  }

  var DB_NAME = 'riq-secure-docs';
  var DB_VERSION = 1;
  var STORE_DOCS = 'docs';
  var STORE_KEYS = 'keys';
  var MASTER_KEY_ID = 'master';

  var _dbPromise = null;
  var _keyPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB not available'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
    return _dbPromise;
  }

  function tx(storeName, mode) {
    return openDB().then(function (db) {
      return db.transaction(storeName, mode).objectStore(storeName);
    });
  }

  function idbGet(storeName, key) {
    return tx(storeName, 'readonly').then(function (store) {
      return new Promise(function (res, rej) {
        var r = store.get(key);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function idbPut(storeName, value) {
    return tx(storeName, 'readwrite').then(function (store) {
      return new Promise(function (res, rej) {
        var r = store.put(value);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function idbDelete(storeName, key) {
    return tx(storeName, 'readwrite').then(function (store) {
      return new Promise(function (res, rej) {
        var r = store.delete(key);
        r.onsuccess = function () { res(); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function idbList(storeName) {
    return tx(storeName, 'readonly').then(function (store) {
      return new Promise(function (res, rej) {
        var r = store.getAll();
        r.onsuccess = function () { res(r.result || []); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function idbClear(storeName) {
    return tx(storeName, 'readwrite').then(function (store) {
      return new Promise(function (res, rej) {
        var r = store.clear();
        r.onsuccess = function () { res(); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  // Get or create the device master key. Non-extractable so raw bytes cannot
  // be read back. Stored as a live CryptoKey in IndexedDB — browsers persist
  // the handle across sessions.
  function getMasterKey() {
    if (_keyPromise) return _keyPromise;
    _keyPromise = idbGet(STORE_KEYS, MASTER_KEY_ID).then(function (rec) {
      if (rec && rec.key) return rec.key;
      return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // extractable:false — raw bytes cannot be read
        ['encrypt', 'decrypt']
      ).then(function (key) {
        return idbPut(STORE_KEYS, { id: MASTER_KEY_ID, key: key }).then(function () {
          return key;
        });
      });
    });
    return _keyPromise;
  }

  function fileToArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsArrayBuffer(file);
    });
  }

  function encrypt(plainBuf) {
    return getMasterKey().then(function (key) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plainBuf)
        .then(function (ct) { return { iv: iv, ciphertext: ct }; });
    });
  }

  function decrypt(iv, ct) {
    return getMasterKey().then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    });
  }

  function sanitizeMeta(rec) {
    return {
      id: rec.id,
      name: rec.name,
      size: rec.size,
      mimeType: rec.mimeType,
      ts: rec.ts,
      pts: rec.pts || 0
    };
  }

  var API = {
    put: function (docId, file, ptsHint) {
      if (!docId || !file) return Promise.reject(new Error('Missing docId or file'));
      return fileToArrayBuffer(file).then(function (buf) {
        return encrypt(buf);
      }).then(function (enc) {
        var rec = {
          id: docId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          ts: Date.now(),
          pts: ptsHint || 0,
          iv: enc.iv,
          ciphertext: enc.ciphertext
        };
        return idbPut(STORE_DOCS, rec).then(function () { return sanitizeMeta(rec); });
      });
    },

    get: function (docId) {
      return idbGet(STORE_DOCS, docId).then(function (rec) {
        if (!rec) return null;
        return decrypt(rec.iv, rec.ciphertext).then(function (plainBuf) {
          return {
            id: rec.id,
            name: rec.name,
            size: rec.size,
            mimeType: rec.mimeType,
            ts: rec.ts,
            pts: rec.pts,
            blob: new Blob([plainBuf], { type: rec.mimeType })
          };
        });
      });
    },

    getObjectURL: function (docId) {
      return API.get(docId).then(function (res) {
        if (!res) return null;
        return URL.createObjectURL(res.blob);
      });
    },

    remove: function (docId) { return idbDelete(STORE_DOCS, docId); },

    list: function () {
      return idbList(STORE_DOCS).then(function (rows) {
        return rows.map(sanitizeMeta).sort(function (a, b) { return b.ts - a.ts; });
      });
    },

    has: function (docId) {
      return idbGet(STORE_DOCS, docId).then(function (rec) { return !!rec; });
    },

    meta: function (docId) {
      return idbGet(STORE_DOCS, docId).then(function (rec) {
        return rec ? sanitizeMeta(rec) : null;
      });
    },

    clear: function () { return idbClear(STORE_DOCS); },

    // One-shot migration from the legacy localStorage 'riq_personal_docs'
    // JSON blob (which held base64 data URLs). Moves everything into the
    // encrypted store and strips bytes from localStorage. Returns the count
    // migrated. Safe to call repeatedly — it no-ops once the legacy key is
    // cleaned.
    migrateFromLegacy: function () {
      var raw;
      try { raw = localStorage.getItem('riq_personal_docs'); }
      catch (e) { return Promise.resolve(0); }
      if (!raw) return Promise.resolve(0);

      var record;
      try { record = JSON.parse(raw); }
      catch (e) { return Promise.resolve(0); }

      var uploaded = record && record.uploadedDocs;
      if (!uploaded || typeof uploaded !== 'object') return Promise.resolve(0);

      var ids = Object.keys(uploaded).filter(function (id) {
        var d = uploaded[id];
        return d && typeof d.data === 'string' && d.data.indexOf('data:') === 0;
      });
      if (!ids.length) return Promise.resolve(0);

      var jobs = ids.map(function (id) {
        var d = uploaded[id];
        var blob = dataURLToBlob(d.data);
        if (!blob) return Promise.resolve();
        var fakeFile = new File([blob], d.name || (id + '.bin'), { type: blob.type });
        return API.put(id, fakeFile, d.pts || 0).then(function () {
          delete uploaded[id].data; // strip bytes from legacy record
        }).catch(function () {});
      });

      return Promise.all(jobs).then(function () {
        try {
          record.uploadedDocs = uploaded;
          record._migratedAt = Date.now();
          localStorage.setItem('riq_personal_docs', JSON.stringify(record));
        } catch (e) {}
        return ids.length;
      });
    }
  };

  function dataURLToBlob(dataUrl) {
    try {
      var parts = dataUrl.split(',');
      var mime = (parts[0].match(/:(.*?);/) || [null, 'application/octet-stream'])[1];
      var bstr = atob(parts[1]);
      var n = bstr.length;
      var u8 = new Uint8Array(n);
      while (n--) u8[n] = bstr.charCodeAt(n);
      return new Blob([u8], { type: mime });
    } catch (e) { return null; }
  }

  API.supported = true;
  window.RIQSecureDocs = API;

  // Kick off legacy migration on load — quiet, best-effort.
  try {
    API.migrateFromLegacy().then(function (n) {
      if (n > 0) console.info('[RIQSecureDocs] migrated ' + n + ' legacy docs to encrypted store');
    }).catch(function (e) { console.warn('[RIQSecureDocs] migration failed', e); });
  } catch (e) {}
})();
