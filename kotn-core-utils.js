// KOTN Core Utilities
// v0.1.0

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Root namespace
  // ---------------------------------------------------------------------------
  const KOTN = (window.KOTN = window.KOTN || {});

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  const dom = {
    qs(selector, root = document) {
      return root.querySelector(selector);
    },

    qsa(selector, root = document) {
      return Array.from(root.querySelectorAll(selector));
    },

    norm(text) {
      return (text || '').trim().replace(/\s+/g, ' ');
    },

    visible(el) {
      if (!el) return false;
      if (!(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },

    create(tag, props = {}, children = []) {
      const el = document.createElement(tag);
      Object.entries(props).forEach(([key, value]) => {
        if (value == null) return;
        if (key === 'style' && typeof value === 'object') {
          Object.assign(el.style, value);
        } else if (key in el) {
          el[key] = value;
        } else {
          el.setAttribute(key, value);
        }
      });
      if (!Array.isArray(children)) children = [children];
      children.forEach((child) => {
        if (child == null) return;
        if (child instanceof Node) {
          el.appendChild(child);
        } else {
          el.appendChild(document.createTextNode(String(child)));
        }
      });
      return el;
    },

    waitFor(selector, options = {}) {
      const {
        root = document,
        timeoutMs = 30000,
        pollMs = 50
      } = options;

      return new Promise((resolve, reject) => {
        const found = root.querySelector(selector);
        if (found) {
          resolve(found);
          return;
        }

        const start = Date.now();
        const id = setInterval(() => {
          const el = root.querySelector(selector);
          if (el) {
            clearInterval(id);
            resolve(el);
          } else if (Date.now() - start > timeoutMs) {
            clearInterval(id);
            reject(new Error(`waitFor: timeout waiting for ${selector}`));
          }
        }, pollMs);
      });
    }
  };

  KOTN.dom = dom;

  // ---------------------------------------------------------------------------
  // Async / concurrency helpers
  // ---------------------------------------------------------------------------
  const asyncUtils = {
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    async retry(fn, options = {}) {
      const {
        retries = 3,
        delayMs = 500,
        factor = 2
      } = options;
      let attempt = 0;
      let lastErr;
      let delay = delayMs;

      while (attempt <= retries) {
        try {
          return await fn(attempt);
        } catch (err) {
          lastErr = err;
          if (attempt === retries) break;
          // eslint-disable-next-line no-console
          console.warn('[KOTN retry]', err);
          // eslint-disable-next-line no-await-in-loop
          await asyncUtils.sleep(delay);
          delay *= factor;
          attempt += 1;
        }
      }

      throw lastErr;
    },

    async runWithConcurrency(items, worker, options = {}) {
      const {
        concurrency = 4,
        onProgress
      } = options;

      const results = [];
      let index = 0;
      let completed = 0;
      const total = items.length;

      async function workerLoop() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const current = index;
          if (current >= total) return;
          index += 1;
          const item = items[current];
          // eslint-disable-next-line no-await-in-loop
          const result = await worker(item, current);
          results[current] = result;
          completed += 1;
          if (onProgress) {
            onProgress({
              completed,
              total
            });
          }
        }
      }

      const lanes = [];
      const laneCount = Math.max(1, Math.min(concurrency, total));
      for (let i = 0; i < laneCount; i += 1) {
        lanes.push(workerLoop());
      }
      await Promise.all(lanes);
      return results;
    }
  };

  KOTN.async = asyncUtils;

  // ---------------------------------------------------------------------------
  // State / storage helpers
  // ---------------------------------------------------------------------------
  function makeStorageDriver(scope) {
    if (scope === 'session') {
      return {
        get: (key) => window.sessionStorage.getItem(key),
        set: (key, value) => window.sessionStorage.setItem(key, value),
        remove: (key) => window.sessionStorage.removeItem(key)
      };
    }

    if (scope === 'gm' && typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
      return {
        get: (key) => GM_getValue(key),
        set: (key, value) => GM_setValue(key, value),
        remove: (key) => GM_deleteValue && GM_deleteValue(key)
      };
    }

    // default: localStorage
    return {
      get: (key) => window.localStorage.getItem(key),
      set: (key, value) => window.localStorage.setItem(key, value),
      remove: (key) => window.localStorage.removeItem(key)
    };
  }

  function createStore(config) {
    const {
      name,
      scope = 'local'
    } = config;
    const storageKey = `KOTN:${name}`;
    const driver = makeStorageDriver(scope);

    function readAll() {
      try {
        const raw = driver.get(storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
        return {};
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[KOTN state] failed to parse store', name, err);
        return {};
      }
    }

    function writeAll(obj) {
      try {
        driver.set(storageKey, JSON.stringify(obj));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[KOTN state] failed to write store', name, err);
      }
    }

    return {
      get(key, defaultValue) {
        const all = readAll();
        return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : defaultValue;
      },
      set(key, value) {
        const all = readAll();
        all[key] = value;
        writeAll(all);
      },
      remove(key) {
        const all = readAll();
        delete all[key];
        writeAll(all);
      },
      clear() {
        driver.remove(storageKey);
      }
    };
  }

  KOTN.state = {
    createStore
  };

  // ---------------------------------------------------------------------------
  // UI / panel helpers
  // ---------------------------------------------------------------------------
  function createPanel(options) {
    const {
      id,
      title = 'KOTN',
      parent = document.body,
      rememberPosition = true,
      defaultPosition = {
        top: 80,
        right: 20
      }
    } = options;

    const store = rememberPosition ? createStore({
      name: `panel:${id || title}`,
      scope: 'local'
    }) : null;

    const panel = dom.create('div', {
      className: 'kotn-panel',
      style: {
        position: 'fixed',
        top: '0px',
        left: '0px',
        minWidth: '220px',
        maxWidth: '420px',
        background: '#111',
        color: '#f5f5f5',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '12px',
        borderRadius: '4px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
        padding: '0',
        zIndex: '999999'
      }
    });

    const header = dom.create('div', {
      className: 'kotn-panel-header',
      style: {
        cursor: 'move',
        padding: '4px 8px',
        background: '#222',
        borderBottom: '1px solid #333',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }
    }, [
      dom.create('span', {
        textContent: title
      })
    ]);

    const body = dom.create('div', {
      className: 'kotn-panel-body',
      style: {
        padding: '6px 8px',
        maxHeight: '70vh',
        overflow: 'auto'
      }
    });

    panel.appendChild(header);
    panel.appendChild(body);
    parent.appendChild(panel);

    function applyInitialPosition() {
      const stored = store ? store.get('pos') : null;
      let top = defaultPosition.top;
      let left;

      if (stored && typeof stored.top === 'number' && typeof stored.left === 'number') {
        top = stored.top;
        left = stored.left;
      } else if (typeof defaultPosition.left === 'number') {
        left = defaultPosition.left;
      } else if (typeof defaultPosition.right === 'number') {
        left = window.innerWidth - defaultPosition.right - panel.offsetWidth;
      } else {
        left = 20;
      }

      panel.style.top = `${Math.max(0, top)}px`;
      panel.style.left = `${Math.max(0, left)}px`;
    }

    applyInitialPosition();

    let dragStart = null;

    function onPointerDown(ev) {
      if (ev.button !== 0) return;
      // If the click is on an interactive control, do not initiate drag
      const tag = (ev.target && ev.target.tagName || '').toUpperCase();
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
      dragStart = {
        x: ev.clientX,
        y: ev.clientY,
        top: parseFloat(panel.style.top || '0'),
        left: parseFloat(panel.style.left || '0')
      };
      header.setPointerCapture(ev.pointerId);
    }

    function onPointerMove(ev) {
      if (!dragStart) return;
      const dx = ev.clientX - dragStart.x;
      const dy = ev.clientY - dragStart.y;
      let newTop = dragStart.top + dy;
      let newLeft = dragStart.left + dx;

      const maxTop = window.innerHeight - panel.offsetHeight;
      const maxLeft = window.innerWidth - panel.offsetWidth;

      newTop = Math.min(Math.max(0, newTop), Math.max(0, maxTop));
      newLeft = Math.min(Math.max(0, newLeft), Math.max(0, maxLeft));

      panel.style.top = `${newTop}px`;
      panel.style.left = `${newLeft}px`;
    }

    function onPointerUp(ev) {
      if (!dragStart) return;
      if (rememberPosition && store) {
        store.set('pos', {
          top: parseFloat(panel.style.top || '0'),
          left: parseFloat(panel.style.left || '0')
        });
      }
      header.releasePointerCapture(ev.pointerId);
      dragStart = null;
    }

    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('pointermove', onPointerMove);
    header.addEventListener('pointerup', onPointerUp);
    header.addEventListener('pointercancel', onPointerUp);

    return {
      panel,
      header,
      body,
      setPosition(top, left) {
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        if (rememberPosition && store) {
          store.set('pos', {
            top,
            left
          });
        }
      }
    };
  }

  KOTN.ui = {
    createPanel
  };

  // --- Collapsible wrapper for panels (mini-pill + persistence) ---
function makeCollapsible({ id, title = 'Panel', panel, header, miniLabel = title }) {
  if (!panel || !header) throw new Error('makeCollapsible requires panel and header from createPanel');

  const store = createStore({ name: `panel:${id}`, scope: 'local' });

  // Collapse button in header
  const btn = dom.create('button', {
    type: 'button',
    textContent: '▣',
    title: 'Collapse',
    style: {
      marginLeft: '8px',
      border: '1px solid #333',
      background: '#1d1d1d',
      color: '#f5f5f5',
      borderRadius: '6px',
      padding: '2px 6px',
      cursor: 'pointer'
    }
  });
  header.appendChild(btn);
      // Prevent header drag from swallowing the collapse click
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('mousedown',  e => e.stopPropagation()); // legacy safety
    btn.addEventListener('click',      e => { e.stopPropagation(); setCollapsed(true); });

  // Mini pill
  const mini = dom.create('div', {
    className: 'kotn-mini-pill',
    style: {
      position: 'fixed',
      right: '16px',
      top: '16px',
      zIndex: '999999',
      background: '#111',
      color: '#fff',
      border: '1px solid #2f2f2f',
      borderRadius: '10px',
      padding: '6px 8px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: '12px',
      display: 'none',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      boxShadow: '0 6px 18px rgba(0,0,0,.35)'
    }
  }, [ dom.create('span', { textContent: miniLabel }) ]);
  document.body.appendChild(mini);

  // Restore mini position and collapsed state
  (function restore() {
    const pos = store.get('miniPos');
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      mini.style.left = pos.left + 'px';
      mini.style.top  = pos.top  + 'px';
      mini.style.right = 'auto';
    }
    if (store.get('collapsed', false)) {
      panel.style.display = 'none';
      mini.style.display = 'inline-flex';
    }
  })();

  function setCollapsed(on) {
    panel.style.display = on ? 'none' : '';
    mini.style.display = on ? 'inline-flex' : 'none';
    store.set('collapsed', !!on);
  }

  // Drag the mini pill
  (function makeMiniDraggable() {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    function onDown(e) {
      if (e.type === 'mousedown' && e.button !== 0) return;
      const pt = e.touches ? e.touches[0] : e;
      const r = mini.getBoundingClientRect();
      dragging = true; sx = pt.clientX; sy = pt.clientY; ox = r.left; oy = r.top;
      mini.style.right = 'auto';
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const pt = e.touches ? e.touches[0] : e;
      const dx = pt.clientX - sx, dy = pt.clientY - sy;
      const left = clamp(ox + dx, 8, window.innerWidth  - mini.offsetWidth  - 8);
      const top  = clamp(oy + dy, 8, window.innerHeight - mini.offsetHeight - 8);
      mini.style.left = left + 'px';
      mini.style.top  = top  + 'px';
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      try {
        const r = mini.getBoundingClientRect();
        store.set('miniPos', { left: Math.round(r.left), top: Math.round(r.top) });
      } catch {}
    }
    mini.addEventListener('mousedown', onDown);
    mini.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  })();

  // Click actions
  btn.addEventListener('click', () => setCollapsed(true));
  mini.addEventListener('click', () => setCollapsed(false));

  return {
    collapse() { setCollapsed(true); },
    expand()   { setCollapsed(false); },
    isCollapsed() { return !!store.get('collapsed', false); },
    mini
  };
}

KOTN.ui.makeCollapsible = makeCollapsible;

  // ---------------------------------------------------------------------------
  // CSV + download helpers
  // ---------------------------------------------------------------------------
  function escapeCell(value) {
    if (value == null) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function rowsToCSV(rows, headers) {
    const lines = [];
    if (headers && headers.length) {
      lines.push(headers.map(escapeCell).join(','));
    }

    rows.forEach((row) => {
      if (Array.isArray(row)) {
        lines.push(row.map(escapeCell).join(','));
      } else if (row && typeof row === 'object') {
        const keys = headers || Object.keys(row);
        const line = keys.map((key) => escapeCell(row[key]));
        lines.push(line.join(','));
      } else {
        lines.push(escapeCell(row));
      }
    });

    return lines.join('\r\n');
  }

  function downloadTextFile(filename, mimeType, content) {
    const blob = new Blob([content], {
      type: mimeType
    });
    const url = URL.createObjectURL(blob);
    const a = dom.create('a', {
      href: url,
      download: filename
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadCSV(filename, rows, headers) {
    const csv = rowsToCSV(rows, headers);
    // BOM to keep Excel happy
    const content = `\uFEFF${csv}`;
    downloadTextFile(filename, 'text/csv;charset=utf-8;', content);
  }

  KOTN.csv = {
    escapeCell,
    rowsToCSV,
    downloadCSV,
    downloadTextFile
  };

  // ---------------------------------------------------------------------------
  // Iframe loader / page hydration helpers
  // ---------------------------------------------------------------------------
  async function loadInIframe(config) {
    const {
      url,
      selector,
      ready,
      timeoutMs = 30000
    } = config;

    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.src = url;

      let done = false;
      const timeoutId = setTimeout(() => {
        if (done) return;
        done = true;
        iframe.remove();
        reject(new Error(`loadInIframe: timeout for ${url}`));
      }, timeoutMs);

      function finish(result) {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        iframe.remove();
        resolve(result);
      }

      iframe.addEventListener('load', () => {
        try {
          const w = iframe.contentWindow;
          const d = iframe.contentDocument;
          if (!w || !d) {
            finish({
              window: w,
              document: d
            });
            return;
          }

          if (ready && typeof ready === 'function') {
            Promise.resolve(ready(w, d))
              .then((val) => finish(val))
              .catch((err) => reject(err));
          } else if (selector) {
            dom
              .waitFor(selector, {
                root: d,
                timeoutMs
              })
              .then((el) => finish({
                window: w,
                document: d,
                element: el
              }))
              .catch((err) => reject(err));
          } else {
            finish({
              window: w,
              document: d
            });
          }
        } catch (err) {
          reject(err);
        }
      });

      document.body.appendChild(iframe);
    });
  }

  KOTN.page = {
    loadInIframe
  };

  // ---------------------------------------------------------------------------
  // Staff / dropdown parsing helpers
  // ---------------------------------------------------------------------------
  function parseStaffDropdown(selectEl) {
    if (!selectEl) return [];
    const options = Array.from(selectEl.querySelectorAll('option'));
    return options
      .map((opt) => {
        const value = (opt.value || '').trim();
        if (!value || Number.isNaN(Number(value))) return null;
        const id = Number(value);
        const label = dom.norm(opt.textContent);
        return {
          id,
          label,
          selected: opt.selected,
          disabled: opt.disabled
        };
      })
      .filter(Boolean);
  }

  KOTN.staff = {
    parseStaffDropdown
  };

  // ---------------------------------------------------------------------------
  // HTTP / CSRF helpers
  // ---------------------------------------------------------------------------
  function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    const input = document.querySelector('input[name="_token"]');
    if (input && input.value) return input.value;
    return null;
  }

  async function csrfFetch(input, init = {}) {
    const options = {
      ...init
    };
    const headers = new Headers(options.headers || {});
    const csrf = getCSRFToken();
    if (csrf && !headers.has('X-CSRF-TOKEN')) {
      headers.set('X-CSRF-TOKEN', csrf);
    }
    if (!headers.has('X-Requested-With')) {
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    options.headers = headers;

    const res = await fetch(input, options);
    if (!res.ok) {
      throw new Error(`csrfFetch: HTTP ${res.status} for ${input}`);
    }
    return res;
  }

  async function fetchJSON(input, init = {}) {
    const res = await csrfFetch(input, init);
    return res.json();
  }

  KOTN.http = {
    getCSRFToken,
    csrfFetch,
    fetchJSON
  };

  // ---------------------------------------------------------------------------
  // Mutation observer helpers
  // ---------------------------------------------------------------------------
  function onAdded(config) {
    const {
      root = document,
      selector,
      callback,
      debounceMs = 0
    } = config;

    if (!selector || typeof callback !== 'function') {
      throw new Error('onAdded requires selector and callback');
    }

    const seen = new WeakSet();
    let queued = [];
    let timer = null;

    function flush() {
      if (!queued.length) return;
      const batch = queued;
      queued = [];
      timer = null;
      batch.forEach((el) => {
        try {
          callback(el);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[KOTN observer] callback error', err);
        }
      });
    }

    function enqueue(el) {
      if (seen.has(el)) return;
      seen.add(el);
      queued.push(el);
      if (debounceMs > 0) {
        if (timer == null) {
          timer = window.setTimeout(flush, debounceMs);
        }
      } else {
        flush();
      }
    }

    dom.qsa(selector, root).forEach(enqueue);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(selector)) enqueue(node);
          dom.qsa(selector, node).forEach(enqueue);
        });
      });
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }

  KOTN.observer = {
    onAdded
  };

  // ---------------------------------------------------------------------------
  // Logging helper (thin wrapper; keeps your old patterns consistent)
  // ---------------------------------------------------------------------------
  function log(label, payload) {
    const ts = new Date().toISOString();
    if (payload !== undefined) {
      // eslint-disable-next-line no-console
      console.log(`[KOTN ${ts}] ${label}`, payload);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[KOTN ${ts}] ${label}`);
    }
  }

  KOTN.log = log;

})();


