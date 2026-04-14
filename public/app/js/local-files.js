/* On-device file store. Holds blobs in IndexedDB so lease PDFs,
   receipts, etc. stay accessible even when cloud sync isn't enabled. */

(function () {
  'use strict';

  var DB_NAME = 'riq-local-files';
  var DB_VERSION = 1;
  var STORE = 'files';

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(mode) {
    return openDb().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function put(id, fileOrBlob, meta) {
    if (!id || !fileOrBlob) return Promise.reject(new Error('put: missing id or blob'));
    var record = {
      blob: fileOrBlob,
      name: (fileOrBlob && fileOrBlob.name) || (meta && meta.name) || '',
      mimeType: (fileOrBlob && fileOrBlob.type) || (meta && meta.mimeType) || 'application/octet-stream',
      size: (fileOrBlob && fileOrBlob.size) || 0,
      savedAt: Date.now()
    };
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.put(record, id);
        req.onsuccess = function () { resolve(record); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function get(id) {
    return tx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function remove(id) {
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function openInNewTab(id) {
    return get(id).then(function (rec) {
      if (!rec || !rec.blob) return null;
      var url = URL.createObjectURL(rec.blob);
      window.open(url, '_blank');
      // Revoke after a minute so the tab has time to load and render
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return rec;
    });
  }

  window.RIQLocalFiles = { put: put, get: get, remove: remove, openInNewTab: openInNewTab };
}());
