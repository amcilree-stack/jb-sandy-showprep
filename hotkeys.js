/* JB & Sandy Hotkeys / cart wall. Board + clip list load from hotkeys/*.json.
   Staff customizations (new pages, grid size, pad assignments) stay in this browser
   so a new clip can land on a pad without editing index.html.
   Drag an mp3 onto a pad to play it here. Local drops live in IndexedDB on this
   computer only — they are not published to the shared GitHub Pages site. */
(function () {
  var STORAGE_KEY = 'jb-sandy-hotkeys-board';
  var BOARD_URL = 'hotkeys/board.json';
  var LIBRARY_URL = 'hotkeys/library.json';
  var DB_NAME = 'jb-sandy-hotkeys';
  var DB_STORE = 'clips';

  var FALLBACK_BOARD = {
    folders: [
      {
        id: 'hotkeys',
        name: 'Hotkeys',
        pages: [
          {
            id: 'pads',
            name: 'Pads',
            rows: 4,
            cols: 4,
            pads: [
              { name: 'Band on Lake', src: 'edited-audio/band on Lake.mp3' },
              { name: 'Monologue Bits', src: 'edited-audio/showprep_monologue_bits.mp3' },
              { name: 'Harrison Ford Cookie Monster', src: 'edited-audio/Harrison-Ford-Cookie-Monster-Raiders.mp3' }
            ]
          }
        ]
      }
    ]
  };

  var board = null;
  var library = [];
  var folderId = null;
  var pageId = null;
  var editing = false;
  var assignIndex = null;
  var players = {};
  var playing = {};
  var fades = {};
  var FADE_MS = 3000;
  var localUrls = {};
  var statusMsg = '';
  var dbPromise = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isLocalSrc(src) {
    return String(src || '').indexOf('local:') === 0;
  }

  function localId(src) {
    return String(src || '').slice(6);
  }

  function clipUrl(src) {
    if (!src || isLocalSrc(src) || String(src).indexOf('blob:') === 0) return src || '';
    return encodeURI(src);
  }

  function fileName(src) {
    var parts = String(src || '').split('/');
    return parts[parts.length - 1] || src;
  }

  function prettyName(file) {
    var raw = String(file || 'Clip').replace(/^.*[\\/]/, '');
    var base = raw.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return base || raw || 'Clip';
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function clamp(n, min, max) {
    n = parseInt(n, 10);
    if (isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  var DEFAULT_PAD_SRCS = {
    'edited-audio/band on Lake.mp3': true,
    'edited-audio/showprep_monologue_bits.mp3': true,
    'edited-audio/Harrison-Ford-Cookie-Monster-Raiders.mp3': true
  };

  function normalizeBoard(data) {
    var raw = data && data.folders ? data : FALLBACK_BOARD;
    return {
      touched: !!raw.touched,
      folders: (raw.folders || []).map(function (folder) {
        return {
          id: folder.id || uid('f'),
          name: folder.name || 'Hotkeys',
          pages: (folder.pages || []).map(function (page) {
            return {
              id: page.id || uid('p'),
              name: page.name || 'Pads',
              rows: clamp(page.rows == null ? 4 : page.rows, 1, 8),
              cols: clamp(page.cols == null ? 4 : page.cols, 1, 10),
              pads: (page.pads || []).map(function (pad) {
                return { name: pad.name || '', src: pad.src || '' };
              })
            };
          })
        };
      })
    };
  }

  /* Site default is one folder + one page. Treat that as "not customized"
     so a new shipped pad (and flattened names) replace the old dummy board
     instead of staying stuck in localStorage. */
  function isShippedDefaultBoard(data) {
    if (!data || data.touched) return false;
    if (!data.folders || data.folders.length !== 1) return false;
    var folder = data.folders[0];
    if (!folder || !folder.pages || folder.pages.length !== 1) return false;
    var pads = folder.pages[0].pads || [];
    var filled = 0;
    var i;
    for (i = 0; i < pads.length; i++) {
      var src = pads[i] && pads[i].src;
      if (!src) continue;
      filled += 1;
      if (!DEFAULT_PAD_SRCS[src]) return false;
    }
    return filled <= 3;
  }

  function currentFolder() {
    if (!board) return null;
    return board.folders.filter(function (f) { return f.id === folderId; })[0] || board.folders[0] || null;
  }

  function currentPage() {
    var folder = currentFolder();
    if (!folder) return null;
    return folder.pages.filter(function (p) { return p.id === pageId; })[0] || folder.pages[0] || null;
  }

  function selectDefaults() {
    var folder = currentFolder();
    folderId = folder ? folder.id : null;
    var page = currentPage();
    pageId = page ? page.id : null;
  }

  function persist() {
    try {
      if (board) board.touched = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    } catch (err) { /* ignore quota / private mode */ }
  }

  function padCell(page, index) {
    return (page.pads && page.pads[index]) || { name: '', src: '' };
  }

  function ensurePad(page, index) {
    if (!page.pads) page.pads = [];
    while (page.pads.length <= index) page.pads.push({ name: '', src: '' });
    return page.pads[index];
  }

  function playerKey(index) {
    return folderId + '/' + pageId + '/' + index;
  }

  function setStatus(msg) {
    statusMsg = msg || '';
    var el = $('hk-status');
    if (el) el.textContent = statusMsg;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbPut(rec) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readwrite');
        tx.oncomplete = function () { resolve(rec); };
        tx.onerror = function () { reject(tx.error); };
        tx.objectStore(DB_STORE).put(rec);
      });
    });
  }

  function idbGet(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readonly');
        var req = tx.objectStore(DB_STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDelete(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readwrite');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.objectStore(DB_STORE).delete(id);
      });
    }).catch(function () { /* ignore */ });
  }

  function idbClear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readwrite');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.objectStore(DB_STORE).clear();
      });
    }).catch(function () { /* ignore */ });
  }

  function revokeLocalUrl(src) {
    if (localUrls[src]) {
      try { URL.revokeObjectURL(localUrls[src]); } catch (err) { /* ignore */ }
      delete localUrls[src];
    }
  }

  function srcStillUsed(src, exceptKey) {
    if (!board || !src) return false;
    var f, p, i, key;
    for (f = 0; f < board.folders.length; f++) {
      var folder = board.folders[f];
      for (p = 0; p < folder.pages.length; p++) {
        var page = folder.pages[p];
        var pads = page.pads || [];
        for (i = 0; i < pads.length; i++) {
          key = folder.id + '/' + page.id + '/' + i;
          if (exceptKey && key === exceptKey) continue;
          if (pads[i] && pads[i].src === src) return true;
        }
      }
    }
    return false;
  }

  function cancelFade(key) {
    var fade = fades[key];
    if (fade && fade.raf) {
      try { cancelAnimationFrame(fade.raf); } catch (err) { /* ignore */ }
    }
    delete fades[key];
  }

  /* Cosine ease: no initial dip, full 3s radio-cart fade to silence. */
  function fadeGain(t) {
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    return 0.5 * (1 + Math.cos(Math.PI * t));
  }

  function hardStop(key, audio) {
    cancelFade(key);
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
      } catch (err) { /* ignore */ }
    }
    playing[key] = false;
    paintPlaying();
  }

  function startFade(key, audio) {
    cancelFade(key);
    if (!audio) return;
    var from = audio.volume > 0 ? audio.volume : 1;
    var started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var fade = { raf: 0, started: started, from: from };
    fades[key] = fade;
    paintPlaying();

    function tick(now) {
      if (fades[key] !== fade) return;
      var t = (now - fade.started) / FADE_MS;
      if (t >= 1 || audio.ended || audio.paused) {
        hardStop(key, audio);
        return;
      }
      try { audio.volume = fade.from * fadeGain(t); } catch (err) { /* ignore */ }
      fade.raf = requestAnimationFrame(tick);
    }
    fade.raf = requestAnimationFrame(tick);
  }

  function releasePadMedia(index, src) {
    var key = playerKey(index);
    if (players[key]) {
      hardStop(key, players[key].audio);
      try { players[key].audio.src = ''; } catch (err) { /* ignore */ }
      delete players[key];
    }
    playing[key] = false;
    if (isLocalSrc(src) && !srcStillUsed(src, key)) {
      revokeLocalUrl(src);
      idbDelete(localId(src));
    }
  }

  function resolveUrl(src) {
    if (!src) return Promise.resolve('');
    if (String(src).indexOf('blob:') === 0) return Promise.resolve(src);
    if (!isLocalSrc(src)) return Promise.resolve(clipUrl(src));
    if (localUrls[src]) return Promise.resolve(localUrls[src]);
    return idbGet(localId(src)).then(function (rec) {
      if (!rec || !rec.blob) throw new Error('That dropped file is no longer on this computer.');
      localUrls[src] = URL.createObjectURL(rec.blob);
      return localUrls[src];
    });
  }

  function getPlayer(index, src, url) {
    var key = playerKey(index);
    var rec = players[key];
    if (rec && rec.src === src && rec.audio) {
      if (url && rec.audio.getAttribute('src') !== url) rec.audio.src = url;
      return rec.audio;
    }
    cancelFade(key);
    if (rec) {
      rec.audio.pause();
      rec.audio.src = '';
    }
    var audio = new Audio();
    audio.preload = 'none';
    audio.volume = 1;
    audio.src = url || clipUrl(src);
    audio.addEventListener('play', function () {
      if (fades[key]) return;
      playing[key] = true;
      paintPlaying();
    });
    audio.addEventListener('playing', function () {
      if (fades[key]) return;
      playing[key] = true;
      paintPlaying();
    });
    audio.addEventListener('ended', function () {
      hardStop(key, audio);
    });
    audio.addEventListener('pause', function () {
      if (fades[key]) return;
      if (audio.ended || audio.currentTime === 0) playing[key] = false;
      paintPlaying();
    });
    players[key] = { audio: audio, src: src };
    return audio;
  }

  function paintPlaying() {
    var root = document.getElementById('hk-grid');
    if (!root) return;
    root.querySelectorAll('.hk-pad').forEach(function (el) {
      var key = playerKey(el.getAttribute('data-index'));
      var on = !!playing[key] || !!fades[key];
      el.classList.toggle('playing', on);
      el.classList.toggle('fading', !!fades[key]);
    });
  }

  function isPadPlaying(key, audio) {
    return !!(audio && !audio.paused && !audio.ended);
  }

  function isPadFading(key, audio) {
    if (fades[key]) return true;
    return !!(audio && !audio.paused && !audio.ended && audio.volume < 0.999);
  }

  /* Click cycle: play from start → slow fade (~3s) → immediate cut → play. */
  function playPad(index) {
    var page = currentPage();
    if (!page) return;
    var pad = padCell(page, index);
    if (!pad.src) return;
    var key = playerKey(index);
    var rec = players[key];
    var audio = rec && rec.audio;

    if (isPadFading(key, audio)) {
      hardStop(key, audio);
      return;
    }
    if (isPadPlaying(key, audio)) {
      startFade(key, audio);
      return;
    }

    resolveUrl(pad.src).then(function (url) {
      var next = players[playerKey(index)];
      var live = next && next.audio;
      if (isPadFading(playerKey(index), live) || isPadPlaying(playerKey(index), live)) return;
      audio = getPlayer(index, pad.src, url);
      cancelFade(key);
      try { audio.volume = 1; } catch (err) { /* ignore */ }
      try { audio.currentTime = 0; } catch (err) { /* ignore seek before load */ }
      playing[key] = true;
      paintPlaying();
      var start = audio.play();
      if (start && start.catch) start.catch(function () { /* autoplay / missing file */ });
    }).catch(function (err) {
      setStatus(err && err.message ? err.message : 'Could not play that pad.');
    });
  }

  function stopAll() {
    Object.keys(players).forEach(function (key) {
      hardStop(key, players[key].audio);
    });
    Object.keys(fades).forEach(function (key) { cancelFade(key); });
    paintPlaying();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function isAudioFile(file) {
    if (!file || !file.name) return false;
    if (file.type && file.type.indexOf('audio/') === 0) return true;
    return /\.(mp3|wav|m4a|aac|ogg|oga|flac|mp4|mpeg|mpg|aif|aiff)$/i.test(file.name);
  }

  function looksLikeFileDrag(ev) {
    var types = ev.dataTransfer && ev.dataTransfer.types;
    if (!types) return false;
    var i;
    for (i = 0; i < types.length; i++) {
      if (types[i] === 'Files' || types[i] === 'application/x-moz-file') return true;
    }
    return false;
  }

  function matchLibraryClip(name) {
    var base = String(name || '').replace(/^.*[\\/]/, '').toLowerCase();
    if (!base) return null;
    var i, clip, fn;
    for (i = 0; i < library.length; i++) {
      clip = library[i];
      fn = fileName(clip.src).toLowerCase();
      if (fn === base) return clip;
    }
    return null;
  }

  function probeSitePath(name) {
    var base = String(name || '').replace(/^.*[\\/]/, '');
    var paths = ['edited-audio/' + base, 'edited-audio/archive/' + base];
    return Promise.all(paths.map(function (path) {
      return fetch(encodeURI(path), { method: 'HEAD', cache: 'no-store' }).then(function (res) {
        return res.ok ? path : null;
      }).catch(function () { return null; });
    })).then(function (hits) {
      var path = hits.filter(Boolean)[0];
      return path ? { name: prettyName(base), src: path } : null;
    });
  }

  function findSiteClip(fileNameStr) {
    var clip = matchLibraryClip(fileNameStr);
    if (clip) return Promise.resolve(clip);
    return probeSitePath(fileNameStr);
  }

  function firstEmptyIndex(page, start) {
    var total = page.rows * page.cols;
    var i;
    for (i = start || 0; i < total; i++) {
      if (!padCell(page, i).src) return i;
    }
    return -1;
  }

  function writePad(index, name, src) {
    var page = currentPage();
    if (!page) return null;
    var prev = padCell(page, index);
    if (prev.src && prev.src !== src) releasePadMedia(index, prev.src);
    var pad = ensurePad(page, index);
    pad.name = name;
    pad.src = src;
    persist();
    return pad;
  }

  function assignLocalFile(index, file, shouldPlay) {
    var id = uid('c');
    var src = 'local:' + id;
    var name = prettyName(file.name);
    var url = URL.createObjectURL(file);
    localUrls[src] = url;
    writePad(index, name, src);
    idbPut({
      id: id,
      name: name,
      fileName: file.name,
      type: file.type || 'audio/mpeg',
      blob: file,
      addedAt: Date.now()
    }).catch(function () {
      setStatus('Playing now, but this browser could not save the file for next time.');
    });
    render();
    setStatus(name + ' — on this computer only. Not uploaded to the shared site.');
    if (shouldPlay) playPad(index);
  }

  function assignOneFile(index, file, shouldPlay) {
    return findSiteClip(file.name).then(function (site) {
      if (site) {
        writePad(index, site.name, site.src);
        render();
        setStatus(site.name + ' — using the shared site file.');
        if (shouldPlay) playPad(index);
        return;
      }
      assignLocalFile(index, file, shouldPlay);
    });
  }

  function assignFiles(startIndex, files, replaceFirst) {
    var page = currentPage();
    if (!page || !files.length) return Promise.resolve();
    var jobs = [];
    var i;
    var idx = startIndex;
    for (i = 0; i < files.length; i++) {
      if (i === 0 && replaceFirst && startIndex >= 0) {
        idx = startIndex;
      } else {
        idx = firstEmptyIndex(page, i === 0 ? (startIndex >= 0 ? startIndex : 0) : idx + 1);
        if (idx < 0) {
          if (i === 0) setStatus('No empty pad. Drop onto a specific pad to replace it.');
          break;
        }
      }
      jobs.push({ index: idx, file: files[i], play: i === 0 });
    }
    var chain = Promise.resolve();
    jobs.forEach(function (job) {
      chain = chain.then(function () { return assignOneFile(job.index, job.file, job.play); });
    });
    return chain;
  }

  function filesFromDrop(ev) {
    var list = ev.dataTransfer && ev.dataTransfer.files;
    if (!list || !list.length) return [];
    return Array.prototype.filter.call(list, isAudioFile);
  }

  function handleDrop(ev, mount) {
    if (!looksLikeFileDrag(ev) && !(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length)) return;
    ev.preventDefault();
    ev.stopPropagation();
    clearDropOver(mount);
    var files = filesFromDrop(ev);
    if (!files.length) {
      setStatus('Drop an audio file (mp3, wav, m4a…).');
      return;
    }
    var pad = ev.target.closest && ev.target.closest('.hk-pad');
    var start = pad ? parseInt(pad.getAttribute('data-index'), 10) : -1;
    loadLibrary().then(function () {
      return assignFiles(isNaN(start) ? -1 : start, files, !!pad);
    });
  }

  function clearDropOver(mount) {
    if (!mount) return;
    mount.classList.remove('hk-dragging');
    mount.querySelectorAll('.drop-over').forEach(function (el) { el.classList.remove('drop-over'); });
  }

  function bindDrops(mount) {
    mount.ondragenter = function (ev) {
      if (!looksLikeFileDrag(ev)) return;
      ev.preventDefault();
      mount.classList.add('hk-dragging');
    };
    mount.ondragover = function (ev) {
      if (!looksLikeFileDrag(ev)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
      var pad = ev.target.closest && ev.target.closest('.hk-pad');
      mount.querySelectorAll('.hk-pad.drop-over').forEach(function (el) {
        if (el !== pad) el.classList.remove('drop-over');
      });
      if (pad) pad.classList.add('drop-over');
    };
    mount.ondragleave = function (ev) {
      if (!mount.contains(ev.relatedTarget)) clearDropOver(mount);
    };
    mount.ondrop = function (ev) {
      handleDrop(ev, mount);
    };
  }

  function render() {
    var mount = $('hotkeys-app');
    if (!mount || !board) return;
    var folder = currentFolder();
    var page = currentPage();
    var html = '';

    var showFolderTabs = editing || board.folders.length > 1;
    var showPageTabs = !!(folder && (editing || folder.pages.length > 1));

    html += '<div class="hk-toolbar">';
    html += '<div class="hk-folders"' + (showFolderTabs ? ' role="tablist" aria-label="Hotkey folders"' : '') + '>';
    if (showFolderTabs) {
      board.folders.forEach(function (f) {
        html += '<button type="button" class="hk-tab' + (f.id === folderId ? ' on' : '') + '" data-act="folder" data-id="' + esc(f.id) + '">' + esc(f.name) + '</button>';
      });
      if (editing) {
        html += '<button type="button" class="hk-ghost" data-act="add-folder">+ Folder</button>';
      }
    }
    html += '</div>';
    html += '<div class="hk-tools">';
    html += '<button type="button" class="hk-ghost" data-act="stop">Stop all</button>';
    html += '<button type="button" class="hk-edit-toggle' + (editing ? ' on' : '') + '" data-act="edit">' + (editing ? 'Done editing' : 'Edit board') + '</button>';
    html += '</div></div>';

    if (showPageTabs) {
      html += '<div class="hk-pages" role="tablist" aria-label="Pages in ' + esc(folder.name) + '">';
      folder.pages.forEach(function (p) {
        html += '<button type="button" class="hk-tab' + (p.id === pageId ? ' on' : '') + '" data-act="page" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button>';
      });
      if (editing) {
        html += '<button type="button" class="hk-ghost" data-act="add-page">+ Page</button>';
      }
      html += '</div>';
    }

    if (editing && folder && page) {
      html += '<div class="hk-editbar">';
      html += '<label>Folder <input id="hk-folder-name" type="text" value="' + esc(folder.name) + '"></label>';
      html += '<label>Page <input id="hk-page-name" type="text" value="' + esc(page.name) + '"></label>';
      html += '<label>Rows <input id="hk-rows" type="number" min="1" max="8" value="' + page.rows + '"></label>';
      html += '<label>Cols <input id="hk-cols" type="number" min="1" max="10" value="' + page.cols + '"></label>';
      html += '<button type="button" class="copy-all-btn" data-act="apply-meta">Apply</button>';
      html += '<button type="button" class="hk-ghost" data-act="export">Copy board JSON</button>';
      html += '<button type="button" class="hk-ghost" data-act="reset">Reset to site default</button>';
      if (folder.pages.length > 1) {
        html += '<button type="button" class="hk-danger" data-act="del-page">Delete page</button>';
      }
      if (board.folders.length > 1) {
        html += '<button type="button" class="hk-danger" data-act="del-folder">Delete folder</button>';
      }
      html += '</div>';
      html += '<p class="note">Drag an mp3 onto a pad anytime — Edit is not required. Dropped files stay in this browser; they are not published. To share a clip with everyone, put the mp3 in <strong>edited-audio/</strong> and add it to <strong>hotkeys/library.json</strong>. This browser remembers your board; Copy board JSON if you want the shared site default updated (local: pads will not work on other computers).</p>';
    }

    if (!page) {
      html += '<p class="note">No pages yet. Turn on Edit board and add a page.</p>';
      mount.innerHTML = html;
      bindChrome(mount);
      return;
    }

    html += '<div class="hk-grid" id="hk-grid" style="grid-template-columns:repeat(' + page.cols + ',minmax(0,1fr))">';
    var total = page.rows * page.cols;
    var i;
    for (i = 0; i < total; i++) {
      var pad = padCell(page, i);
      var loaded = !!(pad.src && pad.name || pad.src);
      var local = isLocalSrc(pad.src);
      var label = pad.name || (pad.src ? prettyName(fileName(pad.src)) : 'Drop mp3');
      var key = playerKey(i);
      html += '<div class="hk-pad' + (loaded ? '' : ' empty') + ((playing[key] || fades[key]) ? ' playing' : '') + (fades[key] ? ' fading' : '') + '" data-act="pad" data-index="' + i + '" role="button" tabindex="0">';
      html += '<span class="hk-name">' + esc(label) + '</span>';
      if (pad.src && !local) {
        html += '<a class="hk-dl" download="' + esc(fileName(pad.src)) + '" href="' + esc(clipUrl(pad.src)) + '" title="Download mp3">↓</a>';
      } else if (pad.src && local && localUrls[pad.src]) {
        html += '<a class="hk-dl" download="' + esc((pad.name || 'clip') + '.mp3') + '" href="' + esc(localUrls[pad.src]) + '" title="Download this computer’s copy">↓</a>';
      }
      if (local) {
        html += '<span class="hk-local">this computer</span>';
      }
      if (editing) {
        html += '<button type="button" class="hk-assign" data-act="assign" data-index="' + i + '">Assign</button>';
      }
      html += '</div>';
    }
    html += '</div>';
    html += '<p class="note hk-status" id="hk-status">' + esc(statusMsg || 'Drag an mp3 onto a pad or an empty square. Dropped files stay on this computer.') + '</p>';

    if (assignIndex != null) {
      html += renderAssign(page, assignIndex);
    }

    mount.innerHTML = html;
    bindChrome(mount);
    paintPlaying();
  }

  function renderAssign(page, index) {
    var pad = padCell(page, index);
    var opts = '<option value="">Choose a clip…</option>';
    library.forEach(function (clip) {
      var sel = clip.src === pad.src ? ' selected' : '';
      opts += '<option value="' + esc(clip.src) + '"' + sel + '>' + esc(clip.name) + '</option>';
    });
    var html = '<div class="hk-assign-box" id="hk-assign-box">';
    html += '<h3>Assign pad ' + (index + 1) + '</h3>';
    html += '<label>Name <input id="hk-pad-name" type="text" value="' + esc(pad.name) + '" placeholder="On-air label"></label>';
    html += '<label>Clip from library <select id="hk-pad-lib">' + opts + '</select></label>';
    html += '<label>Or file path <input id="hk-pad-src" type="text" value="' + esc(isLocalSrc(pad.src) ? '' : pad.src) + '" placeholder="edited-audio/new-clip.mp3"></label>';
    html += '<div class="hk-assign-actions">';
    html += '<button type="button" class="copy-all-btn" data-act="save-assign">Save pad</button>';
    html += '<button type="button" class="hk-ghost" data-act="clear-assign">Clear pad</button>';
    html += '<button type="button" class="hk-ghost" data-act="cancel-assign">Cancel</button>';
    html += '</div></div>';
    return html;
  }

  function bindChrome(mount) {
    mount.onclick = function (ev) {
      var t = ev.target.closest('[data-act]');
      if (!t || !mount.contains(t)) return;
      var act = t.getAttribute('data-act');
      var id = t.getAttribute('data-id');
      var index = t.getAttribute('data-index');
      if (act === 'folder') {
        folderId = id;
        pageId = null;
        selectDefaults();
        assignIndex = null;
        render();
      } else if (act === 'page') {
        pageId = id;
        assignIndex = null;
        render();
      } else if (act === 'edit') {
        editing = !editing;
        if (!editing) assignIndex = null;
        render();
      } else if (act === 'stop') {
        ev.preventDefault();
        stopAll();
      } else if (act === 'pad') {
        if (ev.target.closest('.hk-dl') || ev.target.closest('.hk-assign')) return;
        playPad(parseInt(index, 10));
      } else if (act === 'assign') {
        ev.preventDefault();
        ev.stopPropagation();
        assignIndex = parseInt(index, 10);
        loadLibrary().then(render);
      } else if (act === 'add-folder') {
        addFolder();
      } else if (act === 'add-page') {
        addPage();
      } else if (act === 'apply-meta') {
        applyMeta();
      } else if (act === 'export') {
        exportBoard();
      } else if (act === 'reset') {
        resetBoard();
      } else if (act === 'del-page') {
        deletePage();
      } else if (act === 'del-folder') {
        deleteFolder();
      } else if (act === 'save-assign') {
        saveAssign();
      } else if (act === 'clear-assign') {
        clearAssign();
      } else if (act === 'cancel-assign') {
        assignIndex = null;
        render();
      }
    };

    mount.onkeydown = function (ev) {
      var pad = ev.target.closest('.hk-pad');
      if (!pad || ev.target.closest('input,select,textarea,a,button.hk-assign')) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        playPad(parseInt(pad.getAttribute('data-index'), 10));
      }
    };

    var lib = $('hk-pad-lib');
    if (lib) {
      lib.onchange = function () {
        var src = lib.value;
        if (!src) return;
        var clip = library.filter(function (c) { return c.src === src; })[0];
        var nameField = $('hk-pad-name');
        var srcField = $('hk-pad-src');
        if (srcField) srcField.value = src;
        if (nameField && clip) nameField.value = clip.name;
      };
    }

    bindDrops(mount);
  }

  function applyMeta() {
    var folder = currentFolder();
    var page = currentPage();
    if (!folder || !page) return;
    var fname = $('hk-folder-name');
    var pname = $('hk-page-name');
    var rows = $('hk-rows');
    var cols = $('hk-cols');
    if (fname && fname.value.trim()) folder.name = fname.value.trim();
    if (pname && pname.value.trim()) page.name = pname.value.trim();
    if (rows) page.rows = clamp(rows.value, 1, 8);
    if (cols) page.cols = clamp(cols.value, 1, 10);
    persist();
    render();
  }

  function addFolder() {
    var name = window.prompt('Folder name', 'New folder');
    if (!name || !name.trim()) return;
    var folder = { id: uid('f'), name: name.trim(), pages: [] };
    board.folders.push(folder);
    folderId = folder.id;
    addPage('Pads');
  }

  function addPage(presetName) {
    var folder = currentFolder();
    if (!folder) return;
    var name = presetName || window.prompt('Page name', 'New page');
    if (!name || !name.trim()) return;
    var page = { id: uid('p'), name: name.trim(), rows: 4, cols: 4, pads: [] };
    folder.pages.push(page);
    pageId = page.id;
    assignIndex = null;
    persist();
    render();
  }

  function deletePage() {
    var folder = currentFolder();
    if (!folder || folder.pages.length < 2) return;
    if (!window.confirm('Delete this page from the board?')) return;
    folder.pages = folder.pages.filter(function (p) { return p.id !== pageId; });
    pageId = folder.pages[0].id;
    assignIndex = null;
    persist();
    render();
  }

  function deleteFolder() {
    if (!board || board.folders.length < 2) return;
    if (!window.confirm('Delete this folder and its pages?')) return;
    board.folders = board.folders.filter(function (f) { return f.id !== folderId; });
    folderId = board.folders[0].id;
    pageId = null;
    selectDefaults();
    assignIndex = null;
    persist();
    render();
  }

  function saveAssign() {
    var page = currentPage();
    if (!page || assignIndex == null) return;
    var prev = padCell(page, assignIndex);
    var nameField = $('hk-pad-name');
    var srcField = $('hk-pad-src');
    var lib = $('hk-pad-lib');
    var src = (srcField && srcField.value.trim()) || (lib && lib.value) || '';
    var name = nameField ? nameField.value.trim() : '';
    if (!name && src) {
      var clip = library.filter(function (c) { return c.src === src; })[0];
      name = clip ? clip.name : fileName(src);
    }
    if (prev.src && prev.src !== src) releasePadMedia(assignIndex, prev.src);
    var pad = ensurePad(page, assignIndex);
    pad.name = name;
    pad.src = src;
    assignIndex = null;
    persist();
    render();
  }

  function clearAssign() {
    var page = currentPage();
    if (!page || assignIndex == null) return;
    var pad = ensurePad(page, assignIndex);
    releasePadMedia(assignIndex, pad.src);
    pad.name = '';
    pad.src = '';
    assignIndex = null;
    persist();
    render();
  }

  function exportBoard() {
    var text = JSON.stringify(board, null, 2);
    var note = 'Board JSON copied. Paste it into hotkeys/board.json to make this the shared site default. Pads that say “this computer” (local:…) will not play for anyone else.';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        window.alert(note);
      }).catch(function () {
        window.prompt('Copy this board JSON', text);
      });
    } else {
      window.prompt('Copy this board JSON', text);
    }
  }

  function resetBoard() {
    if (!window.confirm('Throw away this browser’s hotkey edits and local drops, and reload the site default?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
    Object.keys(localUrls).forEach(revokeLocalUrl);
    assignIndex = null;
    editing = true;
    statusMsg = '';
    idbClear().then(function () { fetchBoard(true); }, function () { fetchBoard(true); });
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error(url + ' ' + res.status);
      return res.json();
    });
  }

  function loadLibrary() {
    return fetchJson(LIBRARY_URL).then(function (data) {
      library = (data && data.clips) || [];
    }).catch(function () {
      if (!library.length) {
        library = [
          { name: 'Band on Lake', src: 'edited-audio/band on Lake.mp3' },
          { name: 'Monologue Bits', src: 'edited-audio/showprep_monologue_bits.mp3' },
          { name: 'Harrison Ford Cookie Monster', src: 'edited-audio/Harrison-Ford-Cookie-Monster-Raiders.mp3' }
        ];
      }
    });
  }

  function fetchBoard(forceRemote) {
    var local = null;
    if (!forceRemote) {
      try { local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (err) { local = null; }
    }
    if (local && local.folders && local.folders.length && !isShippedDefaultBoard(local)) {
      board = normalizeBoard(local);
      selectDefaults();
      render();
      return Promise.resolve();
    }
    return fetchJson(BOARD_URL).then(function (data) {
      board = normalizeBoard(data);
      selectDefaults();
      render();
    }).catch(function () {
      board = normalizeBoard(FALLBACK_BOARD);
      selectDefaults();
      render();
    });
  }

  function init() {
    var mount = $('hotkeys-app');
    if (!mount) return;
    Promise.all([fetchBoard(false), loadLibrary()]);
  }


  window.JBSandyHotkeys = {
    addClip: function (name, src) {
      if (!board) return 'Open Hotkeys once so the board can load, then try again.';
      var folder = board.folders.filter(function (f) { return f.id === folderId; })[0] || board.folders[0];
      var page = (folder.pages || []).filter(function (pg) { return pg.id === pageId; })[0] || folder.pages[0];
      if (!page) return 'No Hotkeys page found.';
      page.pads = page.pads || [];
      var slots = (page.rows || 5) * (page.cols || 5);
      while (page.pads.length < slots) page.pads.push({ name: '', src: '' });
      var idx = -1;
      for (var i = 0; i < page.pads.length; i++) {
        if (!page.pads[i] || !page.pads[i].src) { idx = i; break; }
      }
      if (idx < 0) return 'Hotkeys board is full. Clear a pad first.';
      page.pads[idx] = { name: name || prettyName(src), src: src };
      board.touched = true;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(board)); } catch (e) {}
      render();
      return 'Parked “' + (name || prettyName(src)) + '” on pad ' + (idx + 1) + '.';
    }
  };

  window.__hotkeysPadState = function (index) {
    var key = playerKey(index);
    var audio = players[key] && players[key].audio;
    return {
      exists: !!audio,
      fading: !!fades[key],
      lit: !!playing[key] || !!fades[key],
      paused: audio ? audio.paused : null,
      ended: audio ? audio.ended : null,
      volume: audio ? audio.volume : null,
      currentTime: audio ? audio.currentTime : null
    };
  };

  window.__hotkeysAssignFile = function (index, file, play) {
    return assignOneFile(index, file, !!play);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
