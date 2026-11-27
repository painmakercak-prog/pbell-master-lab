/* Versioned local persistence for PBell Master Lab.
   localStorage is primary. IndexedDB is a mirror for the same document.
   Schema migrations run before the app reads state. */
(function (global) {
  "use strict";

  var KEY = "pbell-master-lab";
  var IDB_NAME = "pbell-master-lab";
  var IDB_STORE = "state";
  var CURRENT_VERSION = 1;

  function emptyStats() {
    return {
      rating: "Untested",
      generations: 0,
      successes: 0,
      notes: "",
      bestBpm: null,
      bestSettings: null,
      lastTested: null
    };
  }

  function defaultState() {
    return {
      schemaVersion: CURRENT_VERSION,
      favorites: [],
      customTriggers: [],
      recents: [],
      presets: [],
      triggerStats: {},
      history: [],
      discoveryNotes: {},
      builder: {
        mode: "quick",
        category: "Retro Gaming",
        trigger: "RuneScape-style MIDI",
        customInput: "",
        fusionOn: false,
        fusionTrigger: "",
        bpm: 150,
        audioReference: true,
        weirdness: 50,
        styleInfluence: 50,
        audioInfluence: 50,
        variety: 0,
        maxMode: false,
        search: "",
        trackerFilter: "All",
        trackerTier: "All",
        trackerSort: "name",
        discoveryArea: "Obscure video game soundtracks"
      }
    };
  }

  function migrate(raw) {
    var data = raw && typeof raw === "object" ? raw : defaultState();
    var version = Number(data.schemaVersion || 0);
    if (version < 1) {
      var next = defaultState();
      if (Array.isArray(data.favorites)) next.favorites = data.favorites;
      if (Array.isArray(data.customTriggers)) next.customTriggers = data.customTriggers;
      if (Array.isArray(data.recents)) next.recents = data.recents;
      if (Array.isArray(data.presets)) next.presets = data.presets;
      if (data.triggerStats && typeof data.triggerStats === "object") next.triggerStats = data.triggerStats;
      if (Array.isArray(data.history)) next.history = data.history;
      if (data.builder && typeof data.builder === "object") {
        Object.keys(next.builder).forEach(function (k) {
          if (data.builder[k] !== undefined) next.builder[k] = data.builder[k];
        });
      }
      data = next;
    }
    data.schemaVersion = CURRENT_VERSION;
    data.favorites = Array.isArray(data.favorites) ? data.favorites : [];
    data.customTriggers = Array.isArray(data.customTriggers) ? data.customTriggers : [];
    data.recents = Array.isArray(data.recents) ? data.recents : [];
    data.presets = Array.isArray(data.presets) ? data.presets : [];
    data.triggerStats = data.triggerStats && typeof data.triggerStats === "object" ? data.triggerStats : {};
    data.history = Array.isArray(data.history) ? data.history : [];
    data.discoveryNotes = data.discoveryNotes && typeof data.discoveryNotes === "object" ? data.discoveryNotes : {};
    var base = defaultState().builder;
    data.builder = Object.assign({}, base, data.builder || {});
    return data;
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch (e) {
      return { _error: String(e) };
    }
  }

  function writeLocal(state) {
    var payload = JSON.stringify(state);
    localStorage.setItem(KEY, payload);
    return payload;
  }

  function idb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function readIdb() {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var get = tx.objectStore(IDB_STORE).get("state");
        get.onsuccess = function () {
          db.close();
          resolve(get.result ? migrate(get.result) : null);
        };
        get.onerror = function () {
          db.close();
          reject(get.error);
        };
      });
    });
  }

  function writeIdb(state) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(state, "state");
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function load() {
    var local = readLocal();
    if (local && !local._error) return Promise.resolve({ state: local, source: "localStorage" });
    if (local && local._error) {
      return readIdb().then(function (idbState) {
        if (idbState) return { state: idbState, source: "indexedDB", warning: local._error };
        return { state: defaultState(), source: "default", warning: local._error };
      }).catch(function () {
        return { state: defaultState(), source: "default", warning: local._error };
      });
    }
    return readIdb().then(function (idbState) {
      if (idbState) {
        try { writeLocal(idbState); } catch (e) { /* ignore */ }
        return { state: idbState, source: "indexedDB" };
      }
      return { state: defaultState(), source: "default" };
    }).catch(function () {
      return { state: defaultState(), source: "default" };
    });
  }

  var saveTimer = null;
  function save(state, immediate) {
    state.schemaVersion = CURRENT_VERSION;
    function flush() {
      try { writeLocal(state); } catch (e) { console.warn("localStorage save failed", e); }
      writeIdb(state).catch(function (e) { console.warn("IndexedDB save failed", e); });
    }
    if (immediate) {
      if (saveTimer) clearTimeout(saveTimer);
      flush();
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 80);
  }

  function exportJson(state) {
    var copy = JSON.parse(JSON.stringify(state));
    copy.exportedAt = new Date().toISOString();
    copy.app = "PBell Master Lab";
    copy.appVersion = "2.0";
    return JSON.stringify(copy, null, 2);
  }

  function importJson(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Backup file is not a valid object.");
    var state = migrate(parsed);
    save(state, true);
    return state;
  }

  global.PBELL_STORAGE = {
    KEY: KEY,
    CURRENT_VERSION: CURRENT_VERSION,
    emptyStats: emptyStats,
    defaultState: defaultState,
    migrate: migrate,
    load: load,
    save: save,
    exportJson: exportJson,
    importJson: importJson
  };
})(window);
