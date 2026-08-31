/* JB & Sandy Hotkeys / cart wall. Board + clip list load from hotkeys/*.json.
   Staff customizations (new pages, grid size, pad assignments) stay in this browser
   so a new clip can land on a pad without editing index.html. */
(function () {
  var STORAGE_KEY = 'jb-sandy-hotkeys-board';
  var BOARD_URL = 'hotkeys/board.json';
  var LIBRARY_URL = 'hotkeys/library.json';

  var FALLBACK_BOARD = {
    folders: [
      {
        id: 'farmed-audio',
        name: 'Farmed Audio',
        pages: [
          {
            id: 'drops',
            name: 'Drops',
            rows: 4,
            cols: 4,
            pads: [
              { name: 'Band on Lake', src: 'edited-audio/band on Lake.mp3' },
              { name: 'Monologue Bits', src: 'edited-audio/showprep_monologue_bits.mp3' }
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

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clipUrl(src) {
    return encodeURI(src);
  }

  function fileName(src) {
    var parts = String(src || '').split('/');
    return parts[parts.length - 1] || src;
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function clamp(n, min, max) {
    n = parseInt(n, 10);
    if (isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeBoard(data) {
    var raw = data && data.folders ? data : FALLBACK_BOARD;
    return {
      folders: (raw.folders || []).map(function (folder) {
        return {
          id: folder.id || uid('f'),
          name: folder.name || 'Folder',
          pages: (folder.pages || []).map(function (page) {
            return {
              id: page.id || uid('p'),
              name: page.name || 'Page',
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

  function getPlayer(index, src) {
    var key = playerKey(index);
    var rec = players[key];
    if (rec && rec.src === src) return rec.audio;
    if (rec) {
      rec.audio.pause();
      rec.audio.src = '';
    }
    var audio = new Audio();
    audio.preload = 'none';
    audio.src = clipUrl(src);
    audio.addEventListener('play', function () {
      playing[key] = true;
      paintPlaying();
    });
    audio.addEventListener('playing', function () {
      playing[key] = true;
      paintPlaying();
    });
    audio.addEventListener('ended', function () {
      playing[key] = false;
      paintPlaying();
    });
    audio.addEventListener('pause', function () {
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
      el.classList.toggle('playing', !!playing[key]);
    });
  }

  function playPad(index) {
    var page = currentPage();
    if (!page) return;
    var pad = padCell(page, index);
    if (!pad.src) return;
    var audio = getPlayer(index, pad.src);
    try { audio.currentTime = 0; } catch (err) { /* ignore seek before load */ }
    var start = audio.play();
    if (start && start.catch) start.catch(function () { /* autoplay / missing file */ });
  }

  function stopAll() {
    Object.keys(players).forEach(function (key) {
      try {
        players[key].audio.pause();
        players[key].audio.currentTime = 0;
      } catch (err) { /* ignore */ }
      playing[key] = false;
    });
    paintPlaying();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function render() {
    var mount = $('hotkeys-app');
    if (!mount || !board) return;
    var folder = currentFolder();
    var page = currentPage();
    var html = '';

    html += '<div class="hk-toolbar">';
    html += '<div class="hk-folders" role="tablist" aria-label="Hotkey folders">';
    board.folders.forEach(function (f) {
      html += '<button type="button" class="hk-tab' + (f.id === folderId ? ' on' : '') + '" data-act="folder" data-id="' + esc(f.id) + '">' + esc(f.name) + '</button>';
    });
    if (editing) {
      html += '<button type="button" class="hk-ghost" data-act="add-folder">+ Folder</button>';
    }
    html += '</div>';
    html += '<div class="hk-tools">';
    html += '<button type="button" class="hk-ghost" data-act="stop">Stop all</button>';
    html += '<button type="button" class="hk-edit-toggle' + (editing ? ' on' : '') + '" data-act="edit">' + (editing ? 'Done editing' : 'Edit board') + '</button>';
    html += '</div></div>';

    if (folder) {
      html += '<div class="hk-pages" role="tablist" aria-label="Pages in ' + esc(folder.name) + '">';
      folder.pages.forEach(function (p) {
        html += '<button type="button" class="new-subtab' + (p.id === pageId ? ' active' : '') + '" data-act="page" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button>';
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
      html += '<p class="note">Drop an mp3 in <strong>edited-audio/</strong>, add it to <strong>hotkeys/library.json</strong>, then assign it on a pad. Or type the file path on the pad. No index.html edit. This browser remembers your board; Copy board JSON if you want the shared site default updated.</p>';
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
      var label = pad.name || (pad.src ? fileName(pad.src) : 'Empty');
      var key = playerKey(i);
      html += '<div class="hk-pad' + (loaded ? '' : ' empty') + (playing[key] ? ' playing' : '') + '" data-act="pad" data-index="' + i + '" role="button" tabindex="0">';
      html += '<span class="hk-name">' + esc(label) + '</span>';
      if (pad.src) {
        html += '<a class="hk-dl" download="' + esc(fileName(pad.src)) + '" href="' + esc(clipUrl(pad.src)) + '" title="Download mp3">↓</a>';
      }
      if (editing) {
        html += '<button type="button" class="hk-assign" data-act="assign" data-index="' + i + '">Assign</button>';
      }
      html += '</div>';
    }
    html += '</div>';

    if (assignIndex != null) {
      html += renderAssign(page, assignIndex);
    }

    mount.innerHTML = html;
    bindChrome(mount);
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
    html += '<label>Or file path <input id="hk-pad-src" type="text" value="' + esc(pad.src) + '" placeholder="edited-audio/new-clip.mp3"></label>';
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
    addPage('Drops');
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
    var pad = ensurePad(page, assignIndex);
    var nameField = $('hk-pad-name');
    var srcField = $('hk-pad-src');
    var lib = $('hk-pad-lib');
    var src = (srcField && srcField.value.trim()) || (lib && lib.value) || '';
    var name = nameField ? nameField.value.trim() : '';
    if (!name && src) {
      var clip = library.filter(function (c) { return c.src === src; })[0];
      name = clip ? clip.name : fileName(src);
    }
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
    pad.name = '';
    pad.src = '';
    var key = playerKey(assignIndex);
    if (players[key]) {
      players[key].audio.pause();
      delete players[key];
    }
    playing[key] = false;
    assignIndex = null;
    persist();
    render();
  }

  function exportBoard() {
    var text = JSON.stringify(board, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        window.alert('Board JSON copied. Paste it into hotkeys/board.json to make this the shared site default.');
      }).catch(function () {
        window.prompt('Copy this board JSON', text);
      });
    } else {
      window.prompt('Copy this board JSON', text);
    }
  }

  function resetBoard() {
    if (!window.confirm('Throw away this browser’s hotkey edits and reload the site default?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
    assignIndex = null;
    editing = true;
    fetchBoard(true);
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
          { name: 'Monologue Bits', src: 'edited-audio/showprep_monologue_bits.mp3' }
        ];
      }
    });
  }

  function fetchBoard(forceRemote) {
    var local = null;
    if (!forceRemote) {
      try { local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (err) { local = null; }
    }
    if (local && local.folders && local.folders.length) {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
