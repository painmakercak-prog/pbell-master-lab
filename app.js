(function () {
  "use strict";

  var D = window.PBELL_DATA;
  var S = window.PBELL_STORAGE;
  var state = S.defaultState();
  var storageSource = "default";
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function todayIso() { return new Date().toISOString(); }
  function fmtDate(iso) {
    if (!iso) return "Never";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "Never";
    return d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
  }
  function persist(immediate) { S.save(state, immediate); }
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1800);
  }
  function successRate(stats) {
    if (!stats || !stats.generations) return 0;
    return Math.round((stats.successes / stats.generations) * 1000) / 10;
  }
  function peekStats(name) {
    return state.triggerStats[name] || S.emptyStats();
  }
  function getStats(name) {
    if (!state.triggerStats[name]) state.triggerStats[name] = S.emptyStats();
    return state.triggerStats[name];
  }
  function foldOpen(id, isOpen) {
    state.builder.folds = state.builder.folds || {};
    state.builder.folds[id] = !!isOpen;
    persist();
  }
  function isFoldOpen(id) {
    return !!(state.builder.folds && state.builder.folds[id]);
  }
  function detailsTag(id, title) {
    return '<details class="fold" id="' + id + '"' + (isFoldOpen(id) ? " open" : "") + "><summary>" + title + "</summary>";
  }
  function wireFolds() {
    ["settings-fold","tracker-fold","history-fold","discovery-fold","backup-fold"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("toggle", function () { foldOpen(id, el.open); });
    });
  }
  function currentPrimary() {
    var custom = (state.builder.customInput || "").trim();
    if (custom) return custom;
    return state.builder.trigger;
  }
  function currentFusion() {
    if (!state.builder.fusionOn) return "";
    return (state.builder.fusionTrigger || "").trim();
  }
  function stylePrompt() {
    return D.buildStylePrompt(
      state.builder.bpm,
      currentPrimary(),
      currentFusion() || null,
      state.builder.audioReference
    );
  }
  function sunoSettings() {
    return {
      bpm: state.builder.bpm,
      weirdness: state.builder.weirdness,
      styleInfluence: state.builder.styleInfluence,
      audioInfluence: state.builder.audioInfluence,
      variety: state.builder.variety,
      maxMode: state.builder.maxMode,
      audioReference: state.builder.audioReference
    };
  }
  function labeledOutputs() {
    return (
      "STYLE\n" + stylePrompt() + "\n\n" +
      "LYRICS / STRUCTURE\n" + D.LYRICS + "\n\n" +
      "EXCLUDE STYLES\n" + D.EXCLUDE
    );
  }
  function settingsBlock() {
    var s = sunoSettings();
    return (
      "SUNO SETTINGS (do not paste into the style field)\n" +
      "BPM: " + s.bpm + "\n" +
      "Weirdness: " + s.weirdness + "\n" +
      "Style Influence: " + s.styleInfluence + "\n" +
      "Audio Influence: " + s.audioInfluence + "\n" +
      "Variety: " + s.variety + "\n" +
      "Max Mode: " + (s.maxMode ? "On" : "Off") + "\n" +
      "Audio Reference: " + (s.audioReference ? "On" : "Off")
    );
  }

  function copyText(text, okMsg) {
    function fallback() {
      var wrap = $("copy-fallback");
      var ta = $("copy-fallback-text");
      wrap.classList.add("show");
      ta.value = text;
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
    }
    function done(ok) {
      if (ok) toast(okMsg || "Copied");
      else fallback();
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () {
        tryExec();
      });
      return;
    }
    tryExec();
    function tryExec() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "0";
      ta.style.top = "0";
      ta.style.width = "1px";
      ta.style.height = "1px";
      ta.style.opacity = "0.01";
      ta.style.fontSize = "16px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }
  }

  function allLibraryEntries() {
    var list = D.allCoreEntries();
    D.allDiscoveryEntries().forEach(function (e) { list.push(e); });
    (state.customTriggers || []).forEach(function (c) {
      list.push({ name: c.name, category: "Custom saved", source: "custom", id: c.id });
    });
    return list;
  }
  function findEntry(name) {
    var list = allLibraryEntries();
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return { name: name, category: "Custom", source: "adhoc" };
  }
  function setTrigger(name, alsoCategory) {
    state.builder.trigger = name;
    state.builder.customInput = "";
    if (alsoCategory) {
      var e = findEntry(name);
      if (e && D.CORE_CATEGORIES.indexOf(e.category) !== -1) state.builder.category = e.category;
    }
    persist();
    render();
  }
  function pushRecent(name) {
    if (!name) return;
    state.recents = [name].concat(state.recents.filter(function (x) { return x !== name; })).slice(0, 20);
  }
  function toggleFavorite(name) {
    var i = state.favorites.indexOf(name);
    if (i === -1) state.favorites.unshift(name);
    else state.favorites.splice(i, 1);
    persist(true);
    render();
  }
  function pickRandom(pool) {
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function coreInCategory(cat) {
    return (D.CORE_TRIGGERS[cat] || []).slice();
  }
  function untestedCore() {
    return D.allCoreEntries().filter(function (e) {
      var st = state.triggerStats[e.name];
      return !st || st.rating === "Untested" || !st.rating;
    });
  }
  function highlyRated() {
    return allLibraryEntries().filter(function (e) {
      var st = state.triggerStats[e.name];
      return st && (st.rating === "S" || st.rating === "A");
    });
  }

  function resetBuilder() {
    state.builder.trigger = D.DEFAULTS.trigger;
    state.builder.category = D.DEFAULTS.category;
    state.builder.customInput = "";
    state.builder.fusionOn = false;
    state.builder.fusionTrigger = "";
    state.builder.bpm = D.DEFAULTS.bpm;
    state.builder.audioReference = true;
    persist(true);
    render();
    toast("Reset to RuneScape-style MIDI, 150 BPM, audio sentence on");
  }

  function saveHistory(rating, notes) {
    var item = {
      id: uid(),
      date: todayIso(),
      trigger: currentPrimary(),
      fusionTrigger: currentFusion() || null,
      stylePrompt: stylePrompt(),
      bpm: state.builder.bpm,
      settings: sunoSettings(),
      audioReference: state.builder.audioReference,
      rating: rating || "",
      notes: notes || ""
    };
    state.history.unshift(item);
    var stats = getStats(currentPrimary());
    stats.generations += 1;
    stats.lastTested = item.date;
    pushRecent(currentPrimary());
    if (currentFusion()) pushRecent(currentFusion());
    persist(true);
    render();
    toast("Saved to history");
  }

  function restoreHistory(id) {
    var item = state.history.filter(function (h) { return h.id === id; })[0];
    if (!item) return;
    state.builder.customInput = "";
    var entry = findEntry(item.trigger);
    if (entry.source === "core") {
      state.builder.trigger = item.trigger;
      state.builder.category = entry.category;
    } else {
      state.builder.trigger = item.trigger;
      state.builder.customInput = item.trigger;
    }
    state.builder.fusionOn = !!item.fusionTrigger;
    state.builder.fusionTrigger = item.fusionTrigger || "";
    state.builder.bpm = item.bpm || item.settings && item.settings.bpm || D.DEFAULTS.bpm;
    var s = item.settings || {};
    if (s.weirdness !== undefined) state.builder.weirdness = s.weirdness;
    if (s.styleInfluence !== undefined) state.builder.styleInfluence = s.styleInfluence;
    if (s.audioInfluence !== undefined) state.builder.audioInfluence = s.audioInfluence;
    if (s.variety !== undefined) state.builder.variety = s.variety;
    if (s.maxMode !== undefined) state.builder.maxMode = !!s.maxMode;
    if (item.audioReference !== undefined) state.builder.audioReference = !!item.audioReference;
    persist(true);
    render();
    toast("Restored into the builder");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- render helpers ---------- */
  function optionList(values, selected) {
    return values.map(function (v) {
      var val = typeof v === "string" ? v : v.value;
      var lab = typeof v === "string" ? v : v.label;
      return '<option value="' + escapeAttr(val) + '"' + (val === selected ? " selected" : "") + ">" + escapeHtml(lab) + "</option>";
    }).join("");
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function sliderField(id, label, min, max, value) {
    return (
      '<div class="field"><label for="' + id + '">' + escapeHtml(label) + '</label>' +
      '<div class="slider"><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="1" value="' + value + '">' +
      '<span class="val" id="' + id + '-val">' + value + "</span></div></div>"
    );
  }

  function bindSlider(id, key) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("input", function () {
      state.builder[key] = Number(el.value);
      var val = $(id + "-val");
      if (val) val.textContent = String(state.builder[key]);
      persist();
      refreshOutputs();
    });
  }

  function triggerButtons(names, current) {
    if (!names.length) return "";
    return '<div class="list">' + names.map(function (n) {
      var fav = state.favorites.indexOf(n) !== -1;
      var active = n === current ? " active" : "";
      return (
        '<button type="button" class="item' + active + '" data-set-trigger="' + escapeAttr(n) + '" ' +
        (n === current ? 'aria-current="true"' : "") + ">" +
        escapeHtml(n) + (fav ? "  *" : "") +
        "</button>"
      );
    }).join("") + "</div>";
  }

  function refreshOutputs() {
    var prompt = stylePrompt();
    var count = prompt.length;
    var over = count > D.CHAR_FLAG;
    ["quick-prompt", "lab-prompt"].forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = prompt;
    });
    ["quick-count", "lab-count"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.textContent = over ? count + " characters, over the " + D.CHAR_FLAG + " character flag" : count + " characters";
      el.className = "count" + (over ? " over" : "");
    });
    var lyric = $("lab-lyrics");
    if (lyric) lyric.textContent = D.LYRICS;
    var exc = $("lab-exclude");
    if (exc) exc.textContent = D.EXCLUDE;
    var bpmVals = document.querySelectorAll("[data-bpm-val]");
    bpmVals.forEach(function (el) { el.textContent = String(state.builder.bpm); });
  }

  function renderQuick(root) {
    var b = state.builder;
    var names = coreInCategory(b.category);
    root.innerHTML =
      '<section class="card" id="quick-cook">' +
        "<h2>Quick Cook</h2>" +
        '<div class="stack">' +
          '<div class="field"><label for="q-cat">Category</label><select id="q-cat">' + optionList(D.CORE_CATEGORIES, b.category) + "</select></div>" +
          '<div class="field"><label for="q-trig">Sample trigger</label><select id="q-trig">' + optionList(names, b.trigger) + "</select></div>" +
          '<div class="row">' +
            '<button type="button" class="btn" id="q-fav">' + (state.favorites.indexOf(b.trigger) !== -1 ? "Favorited" : "Favorite") + "</button>" +
            '<button type="button" class="btn primary" id="q-rand">Randomize</button>' +
            '<button type="button" class="btn" id="q-reset">Reset</button>' +
          "</div>" +
          sliderField("q-bpm", "BPM", D.DEFAULTS.minBpm, D.DEFAULTS.maxBpm, b.bpm) +
          '<div class="toggle"><label for="q-audio">Audio reference</label><input id="q-audio" type="checkbox"' + (b.audioReference ? " checked" : "") + "></div>" +
          '<div class="count" id="quick-count"></div>' +
          '<div class="prompt-box" id="quick-prompt"></div>' +
          '<div class="row">' +
            '<button type="button" class="btn primary" id="q-copy">Copy style</button>' +
            '<button type="button" class="btn" id="q-save">Save to history</button>' +
          "</div>" +
        "</div>" +
      "</section>";

    $("q-cat").addEventListener("change", function (e) {
      state.builder.category = e.target.value;
      var first = (D.CORE_TRIGGERS[state.builder.category] || [])[0];
      if (D.CORE_TRIGGERS[state.builder.category].indexOf(state.builder.trigger) === -1) {
        state.builder.trigger = first || D.DEFAULTS.trigger;
      }
      persist(); render();
    });
    $("q-trig").addEventListener("change", function (e) {
      state.builder.trigger = e.target.value;
      state.builder.customInput = "";
      persist(); render();
    });
    $("q-fav").addEventListener("click", function () { toggleFavorite(state.builder.trigger); });
    $("q-rand").addEventListener("click", function () {
      var pick = pickRandom(D.allCoreEntries());
      if (pick) setTrigger(pick.name, true);
    });
    $("q-reset").addEventListener("click", resetBuilder);
    $("q-audio").addEventListener("change", function (e) {
      state.builder.audioReference = e.target.checked;
      persist(); refreshOutputs();
    });
    bindSlider("q-bpm", "bpm");
    $("q-copy").addEventListener("click", function () {
      pushRecent(currentPrimary()); persist();
      copyText(stylePrompt(), "Style copied");
    });
    $("q-save").addEventListener("click", function () { saveHistory("", ""); });
    refreshOutputs();
  }

  function filteredCore(query, category) {
    var q = (query || "").toLowerCase();
    var list = category && category !== "All"
      ? coreInCategory(category).map(function (n) { return { name: n, category: category }; })
      : D.allCoreEntries();
    if (!q) return list;
    return list.filter(function (e) { return e.name.toLowerCase().indexOf(q) !== -1 || e.category.toLowerCase().indexOf(q) !== -1; });
  }

  function renderLab(root) {
    var b = state.builder;
    var results = filteredCore(b.search, b.category === "All" ? "All" : b.category);
    var fusionNames = D.allCoreEntries().map(function (e) { return e.name; }).concat(
      state.customTriggers.map(function (c) { return c.name; })
    );

    root.innerHTML =
      '<section class="card" id="builder">' +
        "<h2>Trigger engine</h2>" +
        '<div class="stack">' +
          '<div class="field"><label for="l-search">Search library</label><input id="l-search" type="search" placeholder="Search triggers" value="' + escapeAttr(b.search || "") + '"></div>' +
          '<div class="two">' +
            '<div class="field"><label for="l-cat">Category</label><select id="l-cat">' + optionList(["All"].concat(D.CORE_CATEGORIES), b.category) + "</select></div>" +
            '<div class="field"><label for="l-trig">Sample trigger</label><select id="l-trig">' + optionList(coreInCategory(b.category === "All" ? "Retro Gaming" : b.category).length && b.category !== "All" ? coreInCategory(b.category) : D.allCoreEntries().map(function(e){return e.name;}), b.trigger) + "</select></div>" +
          "</div>" +
          '<div class="field"><label for="l-custom">Custom trigger (overrides the dropdown when filled)</label><input id="l-custom" type="text" placeholder="Type a new trigger" value="' + escapeAttr(b.customInput || "") + '"></div>' +
          '<div class="row">' +
            '<button type="button" class="btn" id="l-save-custom">Save custom</button>' +
            '<button type="button" class="btn" id="l-fav">' + (state.favorites.indexOf(currentPrimary()) !== -1 ? "Favorited" : "Favorite") + "</button>" +
            '<button type="button" class="btn primary" id="l-rand-all">Random all</button>' +
            '<button type="button" class="btn" id="l-rand-cat">Random in category</button>' +
            '<button type="button" class="btn" id="l-rand-untested">Random untested</button>' +
            '<button type="button" class="btn" id="l-rand-high">Random highly rated</button>' +
            '<button type="button" class="btn" id="l-reset">Reset</button>' +
          "</div>" +
          (b.search ? triggerButtons(results.map(function (e) { return e.name; }).slice(0, 40), currentPrimary()) : "") +
          (state.favorites.length ? '<div class="field"><span class="hint">Favorites</span><div class="chiprow">' + state.favorites.map(function (n) {
            return '<button type="button" class="chip on" data-set-trigger="' + escapeAttr(n) + '">' + escapeHtml(n) + "</button>";
          }).join("") + "</div></div>" : "") +
          (state.recents.length ? '<div class="field"><span class="hint">Recently used</span><div class="chiprow">' + state.recents.map(function (n) {
            return '<button type="button" class="chip" data-set-trigger="' + escapeAttr(n) + '">' + escapeHtml(n) + "</button>";
          }).join("") + "</div></div>" : "") +
          (state.customTriggers.length ? '<div class="field"><span class="hint">Custom saved</span><div class="chiprow">' + state.customTriggers.map(function (c) {
            return '<button type="button" class="chip" data-set-trigger="' + escapeAttr(c.name) + '">' + escapeHtml(c.name) + "</button>";
          }).join("") + "</div></div>" : "") +
          '<div class="toggle"><label for="l-fusion-on">Fusion mode (optional)</label><input id="l-fusion-on" type="checkbox"' + (b.fusionOn ? " checked" : "") + "></div>" +
          (b.fusionOn ? '<div class="field"><label for="l-fusion">Second trigger</label><input id="l-fusion" type="text" list="fusion-list" placeholder="Combine a second aesthetic" value="' + escapeAttr(b.fusionTrigger || "") + '"><datalist id="fusion-list">' + fusionNames.map(function (n) { return '<option value="' + escapeAttr(n) + '">'; }).join("") + "</datalist><p class=\"hint\">Slot becomes Vintage A and B sample looping throughout. The rest of the formula stays locked.</p></div>" : "") +
          sliderField("l-bpm", "BPM", D.DEFAULTS.minBpm, D.DEFAULTS.maxBpm, b.bpm) +
          '<div class="toggle"><label for="l-audio">Audio reference</label><input id="l-audio" type="checkbox"' + (b.audioReference ? " checked" : "") + "></div>" +
        "</div>" +
      "</section>" +

      detailsTag("settings-fold", "Suno settings") + '<div class="fold-body stack">' +
        "<p class=\"hint\">These stay out of the style prompt. Variety defaults to 0 for controlled tests.</p>" +
        sliderField("s-weird", "Weirdness", 0, 100, b.weirdness) +
        sliderField("s-style", "Style Influence", 0, 100, b.styleInfluence) +
        sliderField("s-ainf", "Audio Influence", 0, 100, b.audioInfluence) +
        sliderField("s-var", "Variety", 0, 100, b.variety) +
        '<div class="toggle"><label for="s-max">Max Mode</label><input id="s-max" type="checkbox"' + (b.maxMode ? " checked" : "") + "></div>" +
        '<div class="field"><label for="s-preset-name">Save preset</label><input id="s-preset-name" type="text" placeholder="Preset name"></div>' +
        '<div class="row"><button type="button" class="btn primary" id="s-save-preset">Save preset</button><button type="button" class="btn" id="s-copy">Copy settings</button></div>' +
        (state.presets.length ? '<div class="list">' + state.presets.map(function (p) {
          return '<button type="button" class="item" data-load-preset="' + escapeAttr(p.id) + '"><strong>' + escapeHtml(p.name) + '</strong><span class="meta">BPM ' + p.settings.bpm + "  Variety " + p.settings.variety + "</span></button>";
        }).join("") + "</div>" : "") +
      "</div></details>" +

      '<section class="card" id="outputs">' +
        "<h2>Prompt output</h2>" +
        '<div class="stack">' +
          '<div class="count" id="lab-count"></div>' +
          '<div class="field"><label>Style</label><div class="prompt-box" id="lab-prompt"></div><button type="button" class="btn primary" id="c-style">Copy style</button></div>' +
          '<div class="field"><label>Lyrics / Structure</label><div class="prompt-box" id="lab-lyrics"></div><button type="button" class="btn" id="c-lyrics">Copy lyrics</button></div>' +
          '<div class="field"><label>Exclude Styles</label><div class="prompt-box" id="lab-exclude"></div><button type="button" class="btn" id="c-exclude">Copy exclude</button></div>' +
          '<div class="row">' +
            '<button type="button" class="btn primary" id="c-all">Copy all fields</button>' +
            '<button type="button" class="btn" id="c-settings">Copy Suno settings</button>' +
            '<button type="button" class="btn" id="c-save">Save to history</button>' +
          "</div>" +
        "</div>" +
      "</section>" +

      renderTracker() +
      renderHistory() +
      renderDiscovery() +
      renderBackup();

    /* keep settings fold open if user was interacting - default collapsed */
    wireLab();
    refreshOutputs();
  }

  function renderTracker() {
    var b = state.builder;
    var entries = allLibraryEntries();
    var tier = b.trackerTier || "All";
    var cat = b.trackerFilter || "All";
    var sort = b.trackerSort || "name";
    var rows = entries.filter(function (e) {
      if (cat !== "All" && e.category !== cat) return false;
      var st = peekStats(e.name);
      if (tier !== "All" && (st.rating || "Untested") !== tier) return false;
      return true;
    });
    rows.sort(function (a, b2) {
      var sa = peekStats(a.name), sb = peekStats(b2.name);
      if (sort === "success") return successRate(sb) - successRate(sa);
      if (sort === "tests") return (sb.generations || 0) - (sa.generations || 0);
      if (sort === "rating") {
        var order = { S: 0, A: 1, B: 2, C: 3, F: 4, Untested: 5 };
        return (order[sa.rating || "Untested"] || 9) - (order[sb.rating || "Untested"] || 9);
      }
      if (sort === "category") return a.category.localeCompare(b2.category) || a.name.localeCompare(b2.name);
      return a.name.localeCompare(b2.name);
    });
    var cats = ["All"].concat(D.CORE_CATEGORIES).concat(["Custom saved"]).concat(D.DISCOVERY_AREAS);
    var selected = currentPrimary();
    var sel = getStats(selected);
    return (
      detailsTag("tracker-fold", "Trigger intelligence") + '<div class="fold-body stack">' +
        '<p class="hint">Every trigger starts Untested with 0 generations. Nothing here is invented. Success rate is successes divided by generations after you log them.</p>' +
        '<div class="two">' +
          '<div class="field"><label for="t-cat">Category</label><select id="t-cat">' + optionList(cats, cat) + "</select></div>" +
          '<div class="field"><label for="t-tier">Rating</label><select id="t-tier">' + optionList(["All"].concat(D.TIERS.map(function(t){return t.value;})), tier) + "</select></div>" +
        "</div>" +
        '<div class="field"><label for="t-sort">Sort</label><select id="t-sort">' + optionList([
          { value: "name", label: "Name" },
          { value: "category", label: "Category" },
          { value: "rating", label: "Rating" },
          { value: "success", label: "Success rate" },
          { value: "tests", label: "Number of tests" }
        ], sort) + "</select></div>" +
        '<div class="table-wrap"><table><thead><tr><th>Trigger</th><th>Cat</th><th>Tier</th><th>Tests</th><th>Rate</th></tr></thead><tbody>' +
        rows.slice(0, 80).map(function (e) {
          var st = peekStats(e.name);
          var rate = st.generations ? successRate(st) + "%" : "n/a";
          return "<tr><td>" + escapeHtml(e.name) + "</td><td>" + escapeHtml(e.category) + "</td><td class=\"rate-" + (st.rating || "Untested").toLowerCase() + "\">" + escapeHtml(st.rating || "Untested") + "</td><td>" + (st.generations || 0) + "</td><td>" + rate + "</td></tr>";
        }).join("") +
        "</tbody></table></div>" +
        (rows.length > 80 ? '<p class="hint">Showing 80 of ' + rows.length + ". Narrow the filters to see the rest.</p>" : "") +
        '<hr class="sep"><p class="hint">Edit the selected trigger: ' + escapeHtml(selected) + "</p>" +
        '<div class="field"><label for="t-rating">Personal rating</label><select id="t-rating">' + optionList(D.TIERS, sel.rating || "Untested") + "</select></div>" +
        '<div class="row"><button type="button" class="btn" id="t-gen">Log a generation</button><button type="button" class="btn" id="t-win">Log a success</button></div>' +
        '<div class="field"><label for="t-notes">Notes</label><textarea id="t-notes" rows="3">' + escapeHtml(sel.notes || "") + "</textarea></div>" +
        '<div class="field"><label for="t-bestbpm">Best BPM</label><input id="t-bestbpm" type="number" min="100" max="180" value="' + escapeAttr(sel.bestBpm || "") + '" placeholder="Unset"></div>' +
        '<div class="row"><button type="button" class="btn" id="t-best">Save current settings as best</button><button type="button" class="btn" id="t-save">Save notes</button></div>' +
        '<p class="hint">Tests: ' + (sel.generations || 0) + "  Successes: " + (sel.successes || 0) + "  Rate: " + (sel.generations ? successRate(sel) + "%" : "n/a") + "  Last tested: " + escapeHtml(fmtDate(sel.lastTested)) + (sel.bestSettings ? "  Best settings saved." : "") + "</p>" +
      "</div></details>"
    );
  }

  function renderHistory() {
    var rows = state.history || [];
    return (
      detailsTag("history-fold", "Generation history") + '<div class="fold-body stack">' +
        '<p class="hint">History is saved on this device and survives refresh. Export a JSON backup before changing phones.</p>' +
        (rows.length ? '<div class="list">' + rows.slice(0, 50).map(function (h) {
          return (
            '<button type="button" class="item" data-restore="' + escapeAttr(h.id) + '">' +
            escapeHtml(h.trigger) + (h.fusionTrigger ? " + " + escapeHtml(h.fusionTrigger) : "") +
            '<span class="meta">' + escapeHtml(fmtDate(h.date)) + "  " + h.bpm + " BPM  " + (h.audioReference ? "Audio on" : "Audio off") + (h.rating ? "  " + escapeHtml(h.rating) : "") + "</span></button>"
          );
        }).join("") + "</div>" : '<p class="hint">No generations logged yet.</p>') +
      "</div></details>"
    );
  }

  function renderDiscovery() {
    var area = state.builder.discoveryArea || D.DISCOVERY_AREAS[0];
    var items = D.DISCOVERY_TRIGGERS[area] || [];
    return (
      detailsTag("discovery-fold", "Discovery Lab") + '<div class="fold-body stack">' +
        '<p class="hint">New melodic ideas, kept separate from the core 58. All start Untested until you rate them. The master formula stays locked.</p>' +
        '<div class="field"><label for="d-area">Area</label><select id="d-area">' + optionList(D.DISCOVERY_AREAS, area) + "</select></div>" +
        '<div class="list">' + items.map(function (n) {
          var st = peekStats(n);
          return '<button type="button" class="item" data-set-trigger="' + escapeAttr(n) + '">' + escapeHtml(n) + '<span class="meta">' + escapeHtml(st.rating || "Untested") + "  " + (st.generations || 0) + " tests</span></button>";
        }).join("") + "</div>" +
      "</div></details>"
    );
  }

  function renderBackup() {
    return (
      detailsTag("backup-fold", "Backup and restore") + '<div class="fold-body stack">' +
        '<p class="hint">Auto-saves to this browser (localStorage, mirrored in IndexedDB). Export JSON before an app update or a new phone.</p>' +
        '<div class="row">' +
          '<button type="button" class="btn primary" id="b-export">Export JSON</button>' +
          '<label class="btn" for="b-import">Import JSON</label>' +
          '<input id="b-import" class="sr-only" type="file" accept="application/json,.json">' +
        "</div>" +
        '<p class="hint" id="storage-source"></p>' +
      "</div></details>"
    );
  }

  function wireLab() {
    var b = state.builder;
    $("l-search").addEventListener("input", function (e) {
      state.builder.search = e.target.value;
      persist();
      /* avoid full rerender on each keystroke: update list only by rerendering lab is ok for 58 items */
      render();
      var s = $("l-search");
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    });
    $("l-cat").addEventListener("change", function (e) {
      state.builder.category = e.target.value;
      if (state.builder.category !== "All") {
        var list = coreInCategory(state.builder.category);
        if (list.indexOf(state.builder.trigger) === -1) state.builder.trigger = list[0] || D.DEFAULTS.trigger;
      }
      persist(); render();
    });
    $("l-trig").addEventListener("change", function (e) {
      state.builder.trigger = e.target.value;
      state.builder.customInput = "";
      persist(); render();
    });
    $("l-custom").addEventListener("input", function (e) {
      state.builder.customInput = e.target.value;
      persist();
      refreshOutputs();
    });
    $("l-save-custom").addEventListener("click", function () {
      var name = (state.builder.customInput || "").trim() || state.builder.trigger;
      if (!name) return;
      if (!state.customTriggers.some(function (c) { return c.name === name; })) {
        state.customTriggers.unshift({ id: uid(), name: name, createdAt: todayIso() });
        persist(true);
        toast("Custom trigger saved");
        render();
      } else toast("Already saved");
    });
    $("l-fav").addEventListener("click", function () { toggleFavorite(currentPrimary()); });
    $("l-rand-all").addEventListener("click", function () {
      var pick = pickRandom(D.allCoreEntries());
      if (pick) setTrigger(pick.name, true);
    });
    $("l-rand-cat").addEventListener("click", function () {
      var cat = state.builder.category === "All" ? D.CORE_CATEGORIES[Math.floor(Math.random()*D.CORE_CATEGORIES.length)] : state.builder.category;
      var pick = pickRandom(coreInCategory(cat));
      if (pick) { state.builder.category = cat; setTrigger(pick, true); }
    });
    $("l-rand-untested").addEventListener("click", function () {
      var pick = pickRandom(untestedCore());
      if (!pick) { toast("No untested core triggers left"); return; }
      setTrigger(pick.name, true);
    });
    $("l-rand-high").addEventListener("click", function () {
      var pick = pickRandom(highlyRated());
      if (!pick) { toast("No S or A ratings yet"); return; }
      setTrigger(pick.name, true);
    });
    $("l-reset").addEventListener("click", resetBuilder);
    $("l-fusion-on").addEventListener("change", function (e) {
      state.builder.fusionOn = e.target.checked;
      persist(); render();
    });
    if ($("l-fusion")) {
      $("l-fusion").addEventListener("input", function (e) {
        state.builder.fusionTrigger = e.target.value;
        persist();
        refreshOutputs();
      });
    }
    $("l-audio").addEventListener("change", function (e) {
      state.builder.audioReference = e.target.checked;
      persist(); refreshOutputs();
    });
    bindSlider("l-bpm", "bpm");
    bindSlider("s-weird", "weirdness");
    bindSlider("s-style", "styleInfluence");
    bindSlider("s-ainf", "audioInfluence");
    bindSlider("s-var", "variety");
    $("s-max").addEventListener("change", function (e) {
      state.builder.maxMode = e.target.checked;
      persist();
    });
    $("s-save-preset").addEventListener("click", function () {
      var name = ($("s-preset-name").value || "").trim();
      if (!name) { toast("Name the preset first"); return; }
      state.presets.unshift({ id: uid(), name: name, settings: sunoSettings(), createdAt: todayIso() });
      persist(true); toast("Preset saved"); render();
    });
    $("s-copy").addEventListener("click", function () { copyText(settingsBlock(), "Settings copied"); });
    document.querySelectorAll("[data-load-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = state.presets.filter(function (x) { return x.id === btn.getAttribute("data-load-preset"); })[0];
        if (!p) return;
        var s = p.settings;
        state.builder.bpm = s.bpm;
        state.builder.weirdness = s.weirdness;
        state.builder.styleInfluence = s.styleInfluence;
        state.builder.audioInfluence = s.audioInfluence;
        state.builder.variety = s.variety;
        state.builder.maxMode = !!s.maxMode;
        state.builder.audioReference = !!s.audioReference;
        persist(true); toast("Preset loaded"); render();
      });
    });
    $("c-style").addEventListener("click", function () { pushRecent(currentPrimary()); persist(); copyText(stylePrompt(), "Style copied"); });
    $("c-lyrics").addEventListener("click", function () { copyText(D.LYRICS, "Lyrics copied"); });
    $("c-exclude").addEventListener("click", function () { copyText(D.EXCLUDE, "Exclude copied"); });
    $("c-all").addEventListener("click", function () { pushRecent(currentPrimary()); persist(); copyText(labeledOutputs(), "All fields copied"); });
    $("c-settings").addEventListener("click", function () { copyText(settingsBlock(), "Settings copied"); });
    $("c-save").addEventListener("click", function () { saveHistory("", ""); });

    $("t-cat").addEventListener("change", function (e) { state.builder.trackerFilter = e.target.value; persist(); render(); });
    $("t-tier").addEventListener("change", function (e) { state.builder.trackerTier = e.target.value; persist(); render(); });
    $("t-sort").addEventListener("change", function (e) { state.builder.trackerSort = e.target.value; persist(); render(); });
    $("t-rating").addEventListener("change", function (e) {
      var st = getStats(currentPrimary());
      st.rating = e.target.value;
      persist(true); render();
    });
    $("t-gen").addEventListener("click", function () {
      var st = getStats(currentPrimary());
      st.generations += 1;
      st.lastTested = todayIso();
      persist(true); render();
    });
    $("t-win").addEventListener("click", function () {
      var st = getStats(currentPrimary());
      st.successes += 1;
      if (!st.generations) st.generations = 1;
      st.lastTested = todayIso();
      persist(true); render();
    });
    $("t-save").addEventListener("click", function () {
      var st = getStats(currentPrimary());
      st.notes = $("t-notes").value;
      var bpm = $("t-bestbpm").value;
      st.bestBpm = bpm ? Number(bpm) : null;
      persist(true); toast("Notes saved");
    });
    $("t-best").addEventListener("click", function () {
      var st = getStats(currentPrimary());
      st.bestBpm = state.builder.bpm;
      st.bestSettings = sunoSettings();
      persist(true); toast("Best settings saved"); render();
    });
    $("d-area").addEventListener("change", function (e) {
      state.builder.discoveryArea = e.target.value;
      persist(); render();
    });
    $("b-export").addEventListener("click", exportBackup);
    $("b-import").addEventListener("change", importBackup);
    var src = $("storage-source");
    if (src) src.textContent = "Loaded from " + storageSource + ".";
    wireFolds();

    document.querySelectorAll("[data-set-trigger]").forEach(function (btn) {
      btn.addEventListener("click", function () { setTrigger(btn.getAttribute("data-set-trigger"), true); });
    });
    document.querySelectorAll("[data-restore]").forEach(function (btn) {
      btn.addEventListener("click", function () { restoreHistory(btn.getAttribute("data-restore")); });
    });
  }

  function exportBackup() {
    var text = S.exportJson(state);
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pbell-master-lab-backup.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("Backup downloaded");
    copyText(text, "Backup copied and downloaded");
  }

  function importBackup(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        state = S.importJson(String(reader.result));
        persist(true);
        toast("Backup restored");
        render();
      } catch (err) {
        toast("Import failed");
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function render() {
    var mode = state.builder.mode || "quick";
    $("mode-quick").setAttribute("aria-pressed", mode === "quick" ? "true" : "false");
    $("mode-lab").setAttribute("aria-pressed", mode === "lab" ? "true" : "false");
    var root = $("main");
    if (mode === "quick") renderQuick(root);
    else renderLab(root);
  }

  function wireChrome() {
    $("mode-quick").addEventListener("click", function () {
      state.builder.mode = "quick"; persist(); render();
    });
    $("mode-lab").addEventListener("click", function () {
      state.builder.mode = "lab"; persist(); render();
    });
    $("copy-fallback-close").addEventListener("click", function () {
      $("copy-fallback").classList.remove("show");
    });
    $("copy-fallback-select").addEventListener("click", function () {
      var ta = $("copy-fallback-text");
      ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    });
  }

  /* Expose a small hook for QC tests */
  window.PBELL_APP = {
    getState: function () { return state; },
    setState: function (s) { state = s; persist(true); render(); },
    stylePrompt: stylePrompt,
    labeledOutputs: labeledOutputs,
    resetBuilder: resetBuilder,
    saveHistory: saveHistory,
    currentPrimary: currentPrimary,
    buildStylePrompt: D.buildStylePrompt
  };

  S.load().then(function (res) {
    state = res.state;
    storageSource = res.source;
    if (!state.builder.mode) state.builder.mode = "quick";
    wireChrome();
    render();
  }).catch(function () {
    state = S.defaultState();
    wireChrome();
    render();
  });
})();
