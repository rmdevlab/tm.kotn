// KOTN Core Utilities
// v1.3.3

(function () {
  'use strict';

  const KOTN = (window.KOTN = window.KOTN || {});

  // ============================================================
  // DOM Utilities
  // ============================================================

  const dom = {
    qs(selector, root = document) {
      return root.querySelector(selector);
    },
    qsa(selector, root = document) {
      return Array.from(root.querySelectorAll(selector));
    },
    text(el) {
      return (el && el.textContent ? String(el.textContent) : '').replace(/\s+/g, ' ').trim();
    },
    norm(text) {
      return (text || '').trim().replace(/\s+/g, ' ');
    },
    attr(el, name, fallback = '') {
      if (!el || !name) return fallback;
      const value = el.getAttribute(name);
      return value == null ? fallback : value;
    },
    closest(el, selector) {
      if (!el || typeof el.closest !== 'function') return null;
      return el.closest(selector);
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
    injectStyle(id, css) {
      const key = id ? 'kotn-style-' + String(id) : null;
      if (key) {
        const existing = document.getElementById(key);
        if (existing) {
          if (existing.textContent !== String(css || '')) {
            existing.textContent = String(css || '');
          }
          return existing;
        }
      }
      const style = document.createElement('style');
      if (key) style.id = key;
      style.textContent = String(css || '');
      document.head.appendChild(style);
      return style;
    },
    create(tag, props = {}, children = []) {
      const el = document.createElement(tag);
      Object.entries(props).forEach(([key, value]) => {
        if (value == null) return;
        if (key === 'style' && typeof value === 'object') {
          Object.assign(el.style, value);
        } else if (key === 'dataset' && typeof value === 'object') {
          Object.entries(value).forEach(([dk, dv]) => {
            if (dv == null) return;
            el.dataset[dk] = String(dv);
          });
        } else if (key in el) {
          el[key] = value;
        } else {
          el.setAttribute(key, value);
        }
      });
      if (!Array.isArray(children)) children = [children];
      children.forEach(child => {
        if (child == null) return;
        if (child instanceof Node) {
          el.appendChild(child);
        } else {
          el.appendChild(document.createTextNode(String(child)));
        }
      });
      return el;
    },
    nextFrame() {
      return new Promise(resolve => requestAnimationFrame(() => resolve()));
    },
    waitFor(selector, options = {}) {
      const root = options.root || document;
      const timeoutMs = options.timeoutMs == null ? 30000 : options.timeoutMs;
      const pollMs = options.pollMs == null ? 50 : options.pollMs;
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
            reject(new Error('waitFor: timeout waiting for ' + selector));
          }
        }, pollMs);
      });
    },
    waitForAll(selector, options = {}) {
      const root = options.root || document;
      const timeoutMs = options.timeoutMs == null ? 30000 : options.timeoutMs;
      const pollMs = options.pollMs == null ? 50 : options.pollMs;
      const minCount = options.minCount == null ? 1 : options.minCount;
      return new Promise((resolve, reject) => {
        const found = Array.from(root.querySelectorAll(selector));
        if (found.length >= minCount) {
          resolve(found);
          return;
        }
        const start = Date.now();
        const id = setInterval(() => {
          const list = Array.from(root.querySelectorAll(selector));
          if (list.length >= minCount) {
            clearInterval(id);
            resolve(list);
          } else if (Date.now() - start > timeoutMs) {
            clearInterval(id);
            reject(new Error('waitForAll: timeout waiting for ' + selector));
          }
        }, pollMs);
      });
    },
    waitForAny(selectors, options = {}) {
      const root = options.root || document;
      const timeoutMs = options.timeoutMs == null ? 30000 : options.timeoutMs;
      const pollMs = options.pollMs == null ? 50 : options.pollMs;
      const list = Array.isArray(selectors) ? selectors.filter(Boolean) : [selectors].filter(Boolean);
      return new Promise((resolve, reject) => {
        for (let i = 0; i < list.length; i += 1) {
          const selector = list[i];
          const found = root.querySelector(selector);
          if (found) {
            resolve({ selector, element: found });
            return;
          }
        }
        const start = Date.now();
        const id = setInterval(() => {
          for (let i = 0; i < list.length; i += 1) {
            const selector = list[i];
            const found = root.querySelector(selector);
            if (found) {
              clearInterval(id);
              resolve({ selector, element: found });
              return;
            }
          }
          if (Date.now() - start > timeoutMs) {
            clearInterval(id);
            reject(new Error('waitForAny: timeout waiting for selectors'));
          }
        }, pollMs);
      });
    }
  };

  KOTN.dom = dom;

  // ============================================================
  // Search / Token Utilities
  // ============================================================

  const search = {
    normalize(text) {
      return dom.norm(text || '').toLowerCase();
    },
    toTokens(query) {
      const normalized = search.normalize(query || '');
      if (!normalized) {
        return [];
      }
      return normalized.split(' ').filter(Boolean);
    },
    buildKey(text) {
      return search.normalize(text || '');
    },
    matchesTokens(haystack, tokensOrQuery) {
      const key = search.buildKey(haystack || '');
      const tokens = Array.isArray(tokensOrQuery)
        ? tokensOrQuery
        : search.toTokens(tokensOrQuery);

      if (!tokens.length) {
        return true;
      }
      return tokens.every(t => key.includes(t));
    },
    highlightTokens(label, tokensOrQuery, options) {
      const text = label == null ? '' : String(label);
      const tokens = Array.isArray(tokensOrQuery)
        ? tokensOrQuery
        : search.toTokens(tokensOrQuery);

      if (!tokens.length) {
        return text;
      }
      const uniqTokens = Array.from(new Set(tokens.filter(Boolean)));
      if (!uniqTokens.length) {
        return text;
      }

      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pat = uniqTokens.map(esc).join('|');
      if (!pat) {
        return text;
      }

      const re = new RegExp('(' + pat + ')', 'ig');
      const cls = options && options.className
        ? String(options.className)
        : 'kotn-mark';

      return text.replace(re, '<span class="' + cls + '">$1</span>');
    }
  };

  KOTN.search = search;

  // ============================================================
  // Async Utilities
  // ============================================================

  const asyncUtils = {
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    debounce(fn, waitMs = 150) {
      let timer = null;
      let lastArgs = null;
      let lastThis = null;
      function wrapped(...args) {
        lastArgs = args;
        lastThis = this;
        clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          fn.apply(lastThis, lastArgs);
        }, waitMs);
      }
      wrapped.cancel = function () {
        clearTimeout(timer);
        timer = null;
      };
      wrapped.flush = function () {
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
        fn.apply(lastThis, lastArgs || []);
      };
      return wrapped;
    },
    throttle(fn, waitMs = 150) {
      let lastRun = 0;
      let timer = null;
      let queuedArgs = null;
      let queuedThis = null;
      function invoke() {
        lastRun = Date.now();
        timer = null;
        fn.apply(queuedThis, queuedArgs || []);
      }
      return function (...args) {
        const now = Date.now();
        const remaining = waitMs - (now - lastRun);
        queuedArgs = args;
        queuedThis = this;
        if (remaining <= 0 || remaining > waitMs) {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          invoke();
        } else if (!timer) {
          timer = setTimeout(invoke, remaining);
        }
      };
    },
    createQueue(options = {}) {
      const concurrency = options.concurrency == null ? 1 : Math.max(1, Number(options.concurrency) || 1);
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      const pending = [];
      let running = 0;
      let completed = 0;
      let failed = 0;
      let idleResolvers = [];
      function resolveIdle() {
        if (running === 0 && pending.length === 0) {
          const resolvers = idleResolvers.slice();
          idleResolvers = [];
          resolvers.forEach(resolve => resolve({
            running,
            pending: pending.length,
            completed,
            failed
          }));
        }
      }
      function pump() {
        while (running < concurrency && pending.length) {
          const job = pending.shift();
          running += 1;
          Promise.resolve()
            .then(job.task)
            .then(value => {
              running -= 1;
              completed += 1;
              if (onProgress) {
                onProgress({
                  running,
                  pending: pending.length,
                  completed,
                  failed
                });
              }
              job.resolve(value);
              pump();
              resolveIdle();
            })
            .catch(err => {
              running -= 1;
              failed += 1;
              if (onProgress) {
                onProgress({
                  running,
                  pending: pending.length,
                  completed,
                  failed
                });
              }
              job.reject(err);
              pump();
              resolveIdle();
            });
        }
      }
      return {
        push(task) {
          if (typeof task !== 'function') {
            return Promise.reject(new Error('queue.push requires a task function'));
          }
          return new Promise((resolve, reject) => {
            pending.push({ task, resolve, reject });
            pump();
          });
        },
        onIdle() {
          if (running === 0 && pending.length === 0) {
            return Promise.resolve({
              running,
              pending: pending.length,
              completed,
              failed
            });
          }
          return new Promise(resolve => {
            idleResolvers.push(resolve);
          });
        },
        stats() {
          return {
            running,
            pending: pending.length,
            completed,
            failed
          };
        }
      };
    },
    async retry(fn, options = {}) {
      const retries = options.retries == null ? 3 : options.retries;
      const factor = options.factor == null ? 2 : options.factor;
      let delayMs = options.delayMs == null ? 500 : options.delayMs;
      let attempt = 0;
      let lastErr;
      while (attempt <= retries) {
        try {
          return await fn(attempt);
        } catch (err) {
          lastErr = err;
          if (attempt === retries) {
            break;
          }
          console.warn('[KOTN retry]', err);
          await asyncUtils.sleep(delayMs);
          delayMs *= factor;
          attempt += 1;
        }
      }
      throw lastErr;
    },
    async runWithConcurrency(items, worker, options = {}) {
      const concurrency = options.concurrency == null ? 4 : options.concurrency;
      const onProgress = options.onProgress;
      const results = [];
      let index = 0;
      let completed = 0;
      const total = items.length;
      async function workerLoop() {
        while (true) {
          const current = index;
          if (current >= total) return;
          index += 1;
          const item = items[current];
          const result = await worker(item, current);
          results[current] = result;
          completed += 1;
          if (onProgress) {
            onProgress({ completed, total });
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

  // ============================================================
  // State
  // ============================================================

  function makeStorageDriver(scope) {
    if (scope === 'session') {
      return {
        get(key) {
          return window.sessionStorage.getItem(key);
        },
        set(key, value) {
          window.sessionStorage.setItem(key, value);
        },
        remove(key) {
          window.sessionStorage.removeItem(key);
        }
      };
    }
    if (scope === 'gm' && typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
      return {
        get(key) {
          return GM_getValue(key);
        },
        set(key, value) {
          GM_setValue(key, value);
        },
        remove(key) {
          if (typeof GM_deleteValue === 'function') {
            GM_deleteValue(key);
          }
        }
      };
    }
    return {
      get(key) {
        return window.localStorage.getItem(key);
      },
      set(key, value) {
        window.localStorage.setItem(key, value);
      },
      remove(key) {
        window.localStorage.removeItem(key);
      }
    };
  }

  function createStore(config) {
    const name = config.name;
    const scope = config.scope || 'local';
    const storageKey = 'KOTN:' + name;
    const driver = makeStorageDriver(scope);
    function readAll() {
      try {
        const raw = driver.get(storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
        return {};
      } catch (err) {
        console.warn('[KOTN state] failed to parse store ' + name, err);
        return {};
      }
    }
    function writeAll(obj) {
      try {
        driver.set(storageKey, JSON.stringify(obj));
      } catch (err) {
        console.warn('[KOTN state] failed to write store ' + name, err);
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

  // ============================================================
  // UI: Panels, Mini-Pills, Tabs
  // ============================================================

  function createPanel(options) {
    const cfg = options || {};
    const id = cfg.id || cfg.title || 'KOTN';
    const title = cfg.title || 'KOTN';
    const parent = cfg.parent || document.body;
    const rememberPosition = cfg.rememberPosition !== false;
    const rememberSize = cfg.rememberSize !== false;
    const minWidth = cfg.minWidth == null ? 260 : cfg.minWidth;
    const minHeight = cfg.minHeight == null ? 120 : cfg.minHeight;
    const maxWidth = cfg.maxWidth == null ? 680 : cfg.maxWidth;
    const defaultPosition = cfg.defaultPosition || { top: 80, right: 20 };
    const defaultSize = cfg.defaultSize || { width: 360, height: null };
    const store = createStore({ name: 'panel:' + id, scope: 'local' });

    dom.injectStyle('panel-base', `
      .kotn-panel{
        position:fixed;
        z-index:999999;
        background:#111;
        color:#f5f5f5;
        font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        font-size:12px;
        border:1px solid #2f2f2f;
        border-radius:12px;
        box-shadow:0 12px 28px rgba(0,0,0,0.35);
        overflow:hidden;
        resize:both;
      }
      .kotn-panel-header{
        cursor:move;
        padding:8px 10px;
        background:#181818;
        border-bottom:1px solid #2b2b2b;
        font-weight:600;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        min-height:40px;
      }
      .kotn-panel-title{
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .kotn-panel-header-actions{
        display:flex;
        align-items:center;
        gap:6px;
        flex:0 0 auto;
      }
      .kotn-panel-body{
        padding:10px;
        overflow:auto;
        max-height:calc(90vh - 40px);
      }
      .kotn-panel-footer{
        padding:8px 10px;
        border-top:1px solid #2b2b2b;
        background:#151515;
      }
      .kotn-panel button,
      .kotn-panel input,
      .kotn-panel select,
      .kotn-panel textarea{
        font:inherit;
      }
      .kotn-panel button{
        border:1px solid #343434;
        background:#1d1d1d;
        color:#f5f5f5;
        border-radius:8px;
        padding:6px 10px;
        cursor:pointer;
      }
      .kotn-panel button:hover{
        background:#252525;
      }
      .kotn-panel button:disabled{
        opacity:0.55;
        cursor:not-allowed;
      }
      .kotn-panel input,
      .kotn-panel select,
      .kotn-panel textarea{
        width:100%;
        background:#151515;
        color:#f5f5f5;
        border:1px solid #333;
        border-radius:8px;
        padding:6px 8px;
        box-sizing:border-box;
      }
      .kotn-panel .kotn-row{
        display:flex;
        gap:8px;
        align-items:center;
        flex-wrap:wrap;
      }
      .kotn-panel .kotn-field{
        display:flex;
        flex-direction:column;
        gap:4px;
        flex:1 1 140px;
        min-width:0;
      }
      .kotn-panel .kotn-muted{
        opacity:0.75;
      }
      @media (max-width: 720px){
        .kotn-panel{
          max-width:96vw !important;
          width:min(96vw, 420px) !important;
          left:2vw !important;
          right:auto !important;
        }
      }
    `);

    const panel = dom.create('div', {
      className: 'kotn-panel',
      style: {
        top: '0px',
        left: '0px',
        minWidth: String(minWidth) + 'px',
        minHeight: String(minHeight) + 'px',
        maxWidth: String(maxWidth) + 'px'
      }
    });
    const titleEl = dom.create('span', {
      className: 'kotn-panel-title',
      textContent: title
    });
    const headerActions = dom.create('div', {
      className: 'kotn-panel-header-actions'
    });
    const header = dom.create('div', {
      className: 'kotn-panel-header'
    }, [
      titleEl,
      headerActions
    ]);
    const body = dom.create('div', {
      className: 'kotn-panel-body'
    });
    panel.appendChild(header);
    panel.appendChild(body);
    if (cfg.footer) {
      panel.appendChild(cfg.footer);
    }
    parent.appendChild(panel);

    function clampPosition(top, left) {
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight - 4);
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth - 4);
      return {
        top: Math.max(0, Math.min(maxTop, top)),
        left: Math.max(0, Math.min(maxLeft, left))
      };
    }

    function applyInitialSize() {
      const stored = rememberSize ? store.get('size') : null;
      const width = stored && Number.isFinite(stored.width) ? stored.width : defaultSize.width;
      const height = stored && Number.isFinite(stored.height) ? stored.height : defaultSize.height;
      if (Number.isFinite(width) && width > 0) {
        panel.style.width = String(Math.max(minWidth, Math.min(maxWidth, width))) + 'px';
      }
      if (Number.isFinite(height) && height > 0) {
        panel.style.height = String(Math.max(minHeight, height)) + 'px';
      }
    }

    function applyInitialPosition() {
      const stored = rememberPosition ? store.get('pos') : null;
      let top = Number.isFinite(defaultPosition.top) ? defaultPosition.top : 80;
      let left = 20;
      if (stored && Number.isFinite(stored.top) && Number.isFinite(stored.left)) {
        top = stored.top;
        left = stored.left;
      } else if (Number.isFinite(defaultPosition.left)) {
        left = defaultPosition.left;
      } else if (Number.isFinite(defaultPosition.right)) {
        left = window.innerWidth - defaultPosition.right - panel.offsetWidth;
      }
      const next = clampPosition(top, left);
      panel.style.top = String(next.top) + 'px';
      panel.style.left = String(next.left) + 'px';
    }

    function savePosition() {
      if (!rememberPosition) return;
      store.set('pos', {
        top: parseFloat(panel.style.top || '0'),
        left: parseFloat(panel.style.left || '0')
      });
    }

    function saveSize() {
      if (!rememberSize) return;
      const rect = panel.getBoundingClientRect();
      store.set('size', {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      });
    }

    applyInitialSize();
    applyInitialPosition();

    let dragStart = null;

    function onPointerDown(ev) {
      if (ev.button !== 0) return;
      const tag = (ev.target && ev.target.tagName || '').toUpperCase();
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'LABEL') {
        return;
      }
      dragStart = {
        x: ev.clientX,
        y: ev.clientY,
        top: parseFloat(panel.style.top || '0'),
        left: parseFloat(panel.style.left || '0')
      };
      try {
        header.setPointerCapture(ev.pointerId);
      } catch (err) {
      }
    }

    function onPointerMove(ev) {
      if (!dragStart) return;
      const dx = ev.clientX - dragStart.x;
      const dy = ev.clientY - dragStart.y;
      const next = clampPosition(dragStart.top + dy, dragStart.left + dx);
      panel.style.top = String(next.top) + 'px';
      panel.style.left = String(next.left) + 'px';
    }

    function onPointerUp(ev) {
      if (!dragStart) return;
      try {
        header.releasePointerCapture(ev.pointerId);
      } catch (err) {
      }
      dragStart = null;
      savePosition();
    }

    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('pointermove', onPointerMove);
    header.addEventListener('pointerup', onPointerUp);
    header.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', () => {
      const next = clampPosition(parseFloat(panel.style.top || '0'), parseFloat(panel.style.left || '0'));
      panel.style.top = String(next.top) + 'px';
      panel.style.left = String(next.left) + 'px';
      savePosition();
      saveSize();
    });

    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => {
        saveSize();
      });
      ro.observe(panel);
    }

    return {
      panel,
      header,
      headerActions,
      titleEl,
      body,
      setTitle(nextTitle) {
        titleEl.textContent = String(nextTitle || '');
      },
      setPosition(top, left) {
        const next = clampPosition(top, left);
        panel.style.top = String(next.top) + 'px';
        panel.style.left = String(next.left) + 'px';
        savePosition();
      },
      setSize(width, height) {
        if (Number.isFinite(width) && width > 0) {
          panel.style.width = String(Math.max(minWidth, Math.min(maxWidth, width))) + 'px';
        }
        if (Number.isFinite(height) && height > 0) {
          panel.style.height = String(Math.max(minHeight, height)) + 'px';
        }
        saveSize();
      },
      destroy() {
        panel.remove();
      }
    };
  }

  function injectTabButton(options) {
    const root = options && options.root ? options.root : document;
    const groupSelector = options && options.groupSelector ? options.groupSelector : '.filters';
    const tabSelector = options && options.tabSelector ? options.tabSelector : 'button.tab';
    const labelRaw = options && options.label ? options.label : '';
    const label = dom.norm(labelRaw);
    if (!label) {
      throw new Error('injectTabButton requires label');
    }
    const matchText = options && options.matchText ? dom.norm(options.matchText).toUpperCase() : null;
    const className = options && options.className ? options.className : null;
    const activeClass = options && options.activeClass ? options.activeClass : 'btn-dark';
    let group = null;
    const groups = dom.qsa(groupSelector, root);
    if (typeof options.findGroup === 'function') {
      group = options.findGroup(groups, root) || null;
    } else if (matchText) {
      group = groups.find(g => {
        const tabs = dom.qsa(tabSelector, g);
        return tabs.some(btn => dom.norm(btn.textContent).toUpperCase() === matchText);
      }) || null;
    } else {
      group = groups[0] || null;
    }
    if (!group) return null;
    const existingTabs = dom.qsa(tabSelector, group);
    const targetUpper = label.toUpperCase();
    let button = existingTabs.find(btn => dom.norm(btn.textContent).toUpperCase() === targetUpper) || null;
    if (!button) {
      const baseClass = className || (existingTabs[0] ? existingTabs[0].className : 'btn btn-sm btn-secondary tab');
      button = dom.create('button', {
        type: 'button',
        className: baseClass,
        textContent: label
      });
      group.appendChild(button);
    }
    function activate() {
      if (!activeClass) return;
      const tabs = dom.qsa(tabSelector, group);
      tabs.forEach(t => {
        if (t === button) {
          t.classList.add(activeClass);
        } else {
          t.classList.remove(activeClass);
        }
      });
    }
    return {
      group,
      button,
      activate,
      tabSelector,
      activeClass,
      label
    };
  }

  KOTN.ui = {
    createPanel,
    injectTabButton
  };

  function makeCollapsible(config) {
    const id = config.id;
    const title = config.title || 'Panel';
    const panel = config.panel;
    const header = config.header;
    const miniLabel = config.miniLabel || title;
    if (!panel || !header) {
      throw new Error('makeCollapsible requires panel and header from createPanel');
    }
    const store = createStore({ name: 'panel:' + id, scope: 'local' });
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
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setCollapsed(true);
    });
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
        fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
        fontSize: '12px',
        display: 'none',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)'
      }
    }, [
      dom.create('span', { textContent: miniLabel })
    ]);
    document.body.appendChild(mini);
    (function restore() {
      const pos = store.get('miniPos');
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        mini.style.left = String(pos.left) + 'px';
        mini.style.top = String(pos.top) + 'px';
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
   (function makeMiniDraggable() {
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  const DRAG_THRESHOLD = 6;

  let dragging = false;
  let moved = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;

  mini.style.touchAction = 'manipulation';

  function onDown(e) {
    if (e.type === 'mousedown' && e.button !== 0) return;
    const pt = e.touches ? e.touches[0] : e;
    const r = mini.getBoundingClientRect();
    dragging = true;
    moved = false;
    sx = pt.clientX;
    sy = pt.clientY;
    ox = r.left;
    oy = r.top;
  }

  function onMove(e) {
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - sx;
    const dy = pt.clientY - sy;

    if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
      return;
    }

    moved = true;
    mini.style.right = 'auto';

    if (e.cancelable) {
      e.preventDefault();
    }

    const left = clamp(ox + dx, 8, window.innerWidth - mini.offsetWidth - 8);
    const top = clamp(oy + dy, 8, window.innerHeight - mini.offsetHeight - 8);
    mini.style.left = String(left) + 'px';
    mini.style.top = String(top) + 'px';
  }

  function onUp() {
    if (!dragging) return;
    const wasMoved = moved;
    dragging = false;
    moved = false;

    if (!wasMoved) {
      return;
    }

    try {
      const r = mini.getBoundingClientRect();
      store.set('miniPos', {
        left: Math.round(r.left),
        top: Math.round(r.top)
      });
    } catch (err) {
    }
  }

  mini.addEventListener('mousedown', onDown);
  mini.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
  window.addEventListener('touchcancel', onUp);
})();
    btn.addEventListener('click', () => setCollapsed(true));
    mini.addEventListener('click', () => setCollapsed(false));
    return {
      collapse() {
        setCollapsed(true);
      },
      expand() {
        setCollapsed(false);
      },
      isCollapsed() {
        return !!store.get('collapsed', false);
      },
      mini
    };
  }

  KOTN.ui.makeCollapsible = makeCollapsible;

  // ============================================================
  // UI: Activity Log
  // ============================================================

  function createActivityLog(options = {}) {
    const id = options.id || null;
    const className = options.className || 'kotn-activity-log';
    const maxEntries = typeof options.maxEntries === 'number' && options.maxEntries > 0 ? options.maxEntries : 500;
    const store = id ? createStore({ name: 'activity-log:' + id, scope: 'local' }) : null;

    dom.injectStyle('activity-log', `
      .kotn-activity-log{
        white-space:pre-wrap;
        background:#121212;
        color:#eaeaea;
        border:1px solid #2e2e2e;
        border-radius:10px;
        padding:8px;
        min-height:64px;
        max-height:220px;
        overflow:auto;
        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
        font-size:11px;
        line-height:1.45;
      }
    `);

    const box = dom.create('div', {
      className
    });

    function readStoredLines() {
      if (!store) return [];
      const raw = store.get('lines', []);
      return Array.isArray(raw) ? raw.slice() : [];
    }

    function writeStoredLines(lines) {
      if (!store) return;
      store.set('lines', lines.slice());
    }

    function render(lines) {
      box.textContent = lines.join('\n');
      box.scrollTop = box.scrollHeight;
    }

    let lines = readStoredLines();
    if (lines.length) {
      render(lines);
    }

    function append(level, text) {
      const ts = new Date().toISOString();
      const line = '[' + ts + '] ' + String(level || 'info').toUpperCase() + ' ' + String(text || '');
      lines.push(line);
      if (lines.length > maxEntries) {
        lines = lines.slice(lines.length - maxEntries);
      }
      writeStoredLines(lines);
      render(lines);
    }

    return {
      box,
      log(text) {
        append('info', text);
      },
      info(text) {
        append('info', text);
      },
      warn(text) {
        append('warn', text);
      },
      error(text) {
        append('error', text);
      },
      clear() {
        lines = [];
        writeStoredLines(lines);
        render(lines);
      },
      getLines() {
        return lines.slice();
      }
    };
  }

  KOTN.ui.createActivityLog = createActivityLog;

  // ============================================================
  // CSV Helpers
  // ============================================================

  function escapeCell(value) {
    if (value == null) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function rowsToCSV(rows, headers) {
    const lines = [];
    if (headers && headers.length) {
      lines.push(headers.map(escapeCell).join(','));
    }
    rows.forEach(row => {
      if (Array.isArray(row)) {
        lines.push(row.map(escapeCell).join(','));
      } else if (row && typeof row === 'object') {
        const keys = headers || Object.keys(row);
        const line = keys.map(key => escapeCell(row[key]));
        lines.push(line.join(','));
      } else {
        lines.push(escapeCell(row));
      }
    });
    return lines.join('\r\n');
  }

  function downloadTextFile(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
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
    const content = '\uFEFF' + csv;
    downloadTextFile(filename, 'text/csv;charset=utf-8;', content);
  }

  function makeCsvText(rows, headers, withBom = false) {
    return (withBom ? '\uFEFF' : '') + rowsToCSV(rows, headers);
  }

  function countDelimsOutsideQuotes(line, delim) {
    let count = 0;
    let inQuotes = false;
    const text = String(line || '');
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && ch === delim) {
        count += 1;
      }
    }
    return count;
  }

  function detectDelimiter(text) {
    const sample = String(text || '').split(/\r?\n/).find(line => String(line || '').trim()) || '';
    const delimiters = [',', '\t', ';', '|'];
    let best = ',';
    let bestCount = -1;
    delimiters.forEach(delim => {
      const count = countDelimsOutsideQuotes(sample, delim);
      if (count > bestCount) {
        best = delim;
        bestCount = count;
      }
    });
    return best;
  }

  function parseDelimited(text, delimiter) {
    const value = String(text == null ? '' : text);
    const delim = delimiter || ',';
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      const next = value[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === delim) {
        row.push(cell);
        cell = '';
        continue;
      }
      if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }
      if (ch === '\r') {
        continue;
      }
      cell += ch;
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    return rows;
  }

  function parseDelimitedTable(text) {
    const delimiter = detectDelimiter(text);
    const matrix = parseDelimited(text, delimiter);
    if (!matrix.length) {
      return {
        delimiter,
        headers: [],
        rows: []
      };
    }
    const headers = (matrix[0] || []).map(v => String(v == null ? '' : v));
    const rows = matrix.slice(1);
    return {
      delimiter,
      headers,
      rows,
      toObjects() {
        return rows.map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] == null ? '' : row[index];
          });
          return obj;
        });
      }
    };
  }

  KOTN.csv = {
    escapeCell,
    rowsToCSV,
    makeCsvText,
    downloadCSV,
    downloadTextFile,
    detectDelimiter,
    parseDelimited,
    parseDelimitedTable,
    headersFromRows(rows) {
      const list = Array.isArray(rows) ? rows : [];
      const set = new Set();
      list.forEach(row => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return;
        Object.keys(row).forEach(key => set.add(key));
      });
      return Array.from(set);
    }
  };

  // ============================================================
  // Clipboard Helpers
  // ============================================================

  async function copyText(value) {
    const text = String(value == null ? '' : value);
    if (!text) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
    }
    try {
      const ta = dom.create('textarea', {
        value: text,
        style: {
          position: 'fixed',
          left: '-9999px',
          top: '0'
        }
      });
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (err) {
      return false;
    }
  }

  KOTN.clipboard = {
    copyText,
    async copyRowsAsCSV(rows, headers, withBom = false) {
      return copyText(makeCsvText(rows, headers, withBom));
    }
  };

  // ============================================================
  // Page Helpers
  // ============================================================

  async function loadInIframe(config) {
    const url = config.url;
    const selector = config.selector;
    const ready = config.ready;
    const timeoutMs = config.timeoutMs == null ? 30000 : config.timeoutMs;
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
        reject(new Error('loadInIframe: timeout for ' + url));
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
            finish({ window: w, document: d });
            return;
          }
          if (ready && typeof ready === 'function') {
            Promise.resolve(ready(w, d)).then(val => {
              finish(val);
            }).catch(err => {
              reject(err);
            });
          } else if (selector) {
            dom.waitFor(selector, { root: d, timeoutMs }).then(el => {
              finish({ window: w, document: d, element: el });
            }).catch(err => {
              reject(err);
            });
          } else {
            finish({ window: w, document: d });
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

  // ============================================================
  // Shelf Scope DSL
  // ============================================================

  function normalizeScopePrefix(prefix) {
    return dom.norm(prefix || '').toUpperCase();
  }

  function mergeScopeRules(rules) {
    const list = Array.isArray(rules) ? rules : [];
    const byPrefix = new Map();
    list.forEach(r => {
      if (!r) return;
      const p = normalizeScopePrefix(r.prefix);
      const lo = Number(r.lo);
      const hi = Number(r.hi);
      if (!p || !Number.isFinite(lo) || !Number.isFinite(hi)) return;
      if (!byPrefix.has(p)) byPrefix.set(p, []);
      byPrefix.get(p).push({ prefix: p, lo: Math.min(lo, hi), hi: Math.max(lo, hi) });
    });
    const out = [];
    byPrefix.forEach(ranges => {
      ranges.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
      let cur = null;
      ranges.forEach(r => {
        if (!cur) {
          cur = { prefix: r.prefix, lo: r.lo, hi: r.hi };
          return;
        }
        if (r.lo <= cur.hi + 1) {
          cur.hi = Math.max(cur.hi, r.hi);
        } else {
          out.push(cur);
          cur = { prefix: r.prefix, lo: r.lo, hi: r.hi };
        }
      });
      if (cur) out.push(cur);
    });
    return out;
  }

  function compileShelfScope(text, options = {}) {
    const raw = dom.norm(text || '');
    const implicit = Array.isArray(options.implicitPrefixes)
      ? options.implicitPrefixes.map(normalizeScopePrefix).filter(Boolean)
      : [];
    if (!raw) {
      return { raw: '', rules: [], errors: [], implicitPrefixes: implicit };
    }
    const parts = raw.split(',').map(p => String(p || '').trim()).filter(Boolean);
    const rules = [];
    const errors = [];
    let lastPrefix = null;

    function addRule(prefix, a, b) {
      const p = normalizeScopePrefix(prefix);
      const lo = Number(a);
      const hi = Number(b);
      if (!p || !Number.isFinite(lo) || !Number.isFinite(hi)) return;
      rules.push({ prefix: p, lo: Math.min(lo, hi), hi: Math.max(lo, hi) });
    }

    parts.forEach(tokenRaw => {
      const token = String(tokenRaw || '').replace(/\s+/g, '');
      if (!token) return;

      let prefix = null;
      let rangeText = null;

      const colon = token.match(/^([A-Za-z]+)\:(.+)$/);
      if (colon) {
        prefix = colon[1];
        rangeText = colon[2];
      } else {
        const prefixed = token.match(/^([A-Za-z]+)(\d+)(?:\-(\d+))?$/);
        if (prefixed) {
          prefix = prefixed[1];
          rangeText = prefixed[2] + (prefixed[3] ? '-' + prefixed[3] : '');
        }
      }

      if (prefix) {
        lastPrefix = normalizeScopePrefix(prefix);
        const m = String(rangeText || '').match(/^(\d+)(?:\-(\d+))?$/);
        if (!m) {
          errors.push('Invalid range: ' + tokenRaw);
          return;
        }
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2] ? m[2] : m[1], 10);
        addRule(lastPrefix, a, b);
        return;
      }

      const digitsOnly = token.match(/^(\d+)(?:\-(\d+))?$/);
      if (digitsOnly) {
        const a = parseInt(digitsOnly[1], 10);
        const b = parseInt(digitsOnly[2] ? digitsOnly[2] : digitsOnly[1], 10);
        const pfxs = lastPrefix ? [lastPrefix] : implicit;
        if (!pfxs.length) {
          errors.push('Missing prefix for: ' + tokenRaw);
          return;
        }
        pfxs.forEach(p => addRule(p, a, b));
        return;
      }

      errors.push('Unrecognized token: ' + tokenRaw);
    });

    return { raw, rules: mergeScopeRules(rules), errors, implicitPrefixes: implicit };
  }

  function matchShelfNameScope(name, scope) {
    if (!scope) return true;
    const compiled = typeof scope === 'string' ? compileShelfScope(scope) : scope;
    if (!compiled || !compiled.rules || !compiled.rules.length) return true;
    const parts = parseShelfName(name);
    if (!parts || parts.number == null) return false;
    const prefix = normalizeScopePrefix(parts.prefix);
    const n = Number(parts.number);
    if (!prefix || !Number.isFinite(n)) return false;
    const rules = compiled.rules;
    for (let i = 0; i < rules.length; i += 1) {
      const r = rules[i];
      if (r.prefix !== prefix) continue;
      if (n >= r.lo && n <= r.hi) return true;
    }
    return false;
  }

  function filterShelfNamesByScope(names, scope) {
    const list = Array.isArray(names) ? names : [];
    if (!scope) return list.slice();
    const compiled = typeof scope === 'string' ? compileShelfScope(scope) : scope;
    if (!compiled || !compiled.rules || !compiled.rules.length) return list.slice();
    return list.filter(n => matchShelfNameScope(n, compiled));
  }

  KOTN.shelfScope = {
    compile: compileShelfScope,
    matchName: matchShelfNameScope,
    filterNames: filterShelfNamesByScope
  };

  // ============================================================
  // Auth Helpers
  // ============================================================

  let authProfileCache = null;

  async function getAuthProfile(options = {}) {
    if (authProfileCache && !options.force) return authProfileCache;
    const url = options.url || '/account/dashboard';
    const result = await loadInIframe({
      url,
      ready(win, doc) {
        let id = null;
        if (win && typeof win.authUserId === 'number') {
          id = win.authUserId;
        } else {
          const idBadge = doc.querySelector('.user-badges .user-role-badge.id .value');
          if (idBadge) {
            const digits = (idBadge.textContent || '').replace(/[^\d]/g, '');
            if (digits) id = Number(digits);
          } else {
            const mobileSpan = doc.querySelector('.user-info .username .mobile-only');
            if (mobileSpan) {
              const digits = (mobileSpan.textContent || '').replace(/[^\d]/g, '');
              if (digits) id = Number(digits);
            }
          }
        }
        let username = null;
        const usernameEl = doc.querySelector('.user-info .username');
        if (usernameEl) {
          let base = '';
          const nodes = Array.from(usernameEl.childNodes || []);
          const textNode = nodes.find(n => n.nodeType === Node.TEXT_NODE && n.textContent);
          if (textNode && textNode.textContent) {
            base = textNode.textContent;
          } else {
            base = usernameEl.textContent || '';
          }
          base = base.replace(/\(.*/, '');
          username = dom.norm(base);
        }
        let fullname = null;
        const fullEl = doc.querySelector('.user-info .fullname');
        if (fullEl) {
          fullname = dom.norm(fullEl.textContent);
        }
        return {
          id,
          username,
          fullname
        };
      },
      timeoutMs: options.timeoutMs
    });
    authProfileCache = result;
    return result;
  }

  KOTN.auth = {
    getProfile: getAuthProfile
  };

  // ============================================================
  // Staff Helpers
  // ============================================================

  function parseStaffDropdown(selectEl) {
    if (!selectEl) return [];
    const options = Array.from(selectEl.querySelectorAll('option'));
    return options.map(opt => {
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
    }).filter(Boolean);
  }

  KOTN.staff = {
    parseStaffDropdown
  };

  // ============================================================
  // HTTP Helpers
  // ============================================================

  function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    const input = document.querySelector('input[name="_token"]');
    if (input && input.value) return input.value;
    return null;
  }

  function getCookie(name) {
    const target = String(name || '') + '=';
    const parts = String(document.cookie || '').split(';');
    for (let i = 0; i < parts.length; i += 1) {
      const s = parts[i].trim();
      if (s.startsWith(target)) return s.substring(target.length);
    }
    return '';
  }

  function safeDecode(value) {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch (err) {
      return String(value);
    }
  }

  function getXSRFToken() {
    return safeDecode(getCookie('XSRF-TOKEN'));
  }

  function getSocketId() {
    return safeDecode(getCookie('io'));
  }

  function safeGet(obj, path) {
    try {
      return String(path || '').split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
    } catch (err) {
      return undefined;
    }
  }

  function getWindowCandidates() {
    const list = [];
    try {
      const scriptWindow = getScriptWindow();
      if (scriptWindow) list.push(scriptWindow);
    } catch (err) {
    }
    if (typeof window !== 'undefined' && window && !list.includes(window)) {
      list.push(window);
    }
    return list;
  }

  function getAxiosCandidate(root) {
    if (!root) return null;
    const candidates = [
      root.axios,
      safeGet(root, 'app.axios'),
      safeGet(root, '__app.axios'),
      safeGet(root, 'Laravel.axios')
    ].filter(Boolean);
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (candidate && typeof candidate.request === 'function') return candidate;
      if (typeof candidate === 'function') return candidate;
    }
    return null;
  }

  function getAppAxios() {
    const windows = getWindowCandidates();
    for (let i = 0; i < windows.length; i += 1) {
      const candidate = getAxiosCandidate(windows[i]);
      if (candidate) return candidate;
    }
    return null;
  }

  function discoverAuthorizationToken(options = {}) {
    const override = dom.norm(options.authTokenOverride || '');
    if (override) return override;

    const windows = getWindowCandidates();
    const headerPaths = [
      'defaults.headers.common.authorization',
      'defaults.headers.common.Authorization',
      'defaults.headers.authorization',
      'defaults.headers.Authorization'
    ];

    for (let i = 0; i < windows.length; i += 1) {
      const ax = getAxiosCandidate(windows[i]);
      if (!ax) continue;
      for (let j = 0; j < headerPaths.length; j += 1) {
        const value = safeGet(ax, headerPaths[j]);
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }

    const keys = [
      'authorization',
      'auth_token',
      'authToken',
      'api_token',
      'apiToken',
      'access_token',
      'accessToken',
      'token'
    ];

    for (let i = 0; i < windows.length; i += 1) {
      const w = windows[i];
      for (let j = 0; j < keys.length; j += 1) {
        const k = keys[j];
        try {
          const v = w.localStorage ? w.localStorage.getItem(k) : null;
          if (typeof v === 'string' && v.trim()) return v.trim();
        } catch (err) {
        }
        try {
          const v2 = w.sessionStorage ? w.sessionStorage.getItem(k) : null;
          if (typeof v2 === 'string' && v2.trim()) return v2.trim();
        } catch (err) {
        }
      }
    }

    return '';
  }

  function buildAppHeaders(options = {}) {
    const includeAuth = options.includeAuth !== false;
    const includeCSRF = options.includeCSRF !== false;
    const includeXSRF = options.includeXSRF !== false;
    const includeSocketId = options.includeSocketId !== false;
    const requestedWith = options.requestedWith !== false;

    const accept = options.accept || 'application/json, text/plain, */*';
    const hasBody = !!options.hasBody;
    const isJSON = options.json !== false;

    const headers = {};
    headers.accept = accept;

    if (requestedWith) {
      headers['x-requested-with'] = 'XMLHttpRequest';
    }

    if (hasBody && isJSON) {
      headers['content-type'] = 'application/json;charset=UTF-8';
    }

    let auth = '';
    if (includeAuth) {
      auth = discoverAuthorizationToken({ authTokenOverride: options.authTokenOverride });
      if (auth) headers.authorization = auth;
    }

    let csrf = '';
    if (includeCSRF) {
      csrf = getCSRFToken() || '';
      if (csrf) {
        headers['x-csrf-token'] = csrf;
      }
    }

    let xsrf = '';
    if (includeXSRF) {
      xsrf = getXSRFToken() || '';
      if (xsrf) {
        headers['x-xsrf-token'] = xsrf;
      }
    }

    let socketId = '';
    if (includeSocketId) {
      socketId = getSocketId() || '';
      if (socketId) headers['x-socket-id'] = socketId;
    }

    const extra = options.headers && typeof options.headers === 'object' ? options.headers : null;
    if (extra) {
      Object.keys(extra).forEach(k => {
        headers[k] = extra[k];
      });
    }

    return {
      headers,
      diag: {
        authorizationPresent: !!auth,
        csrfMetaPresent: !!csrf,
        xsrfCookiePresent: !!xsrf,
        socketIdPresent: !!socketId
      }
    };
  }

  async function csrfFetch(input, init = {}) {
    const options = Object.assign({}, init);
    const method = String(options.method || 'GET').toUpperCase();
    const hasBody = options.body !== undefined && options.body !== null && method !== 'GET' && method !== 'HEAD';
    const explicitHeaders = new Headers(options.headers || {});
    const accept = explicitHeaders.get('accept') || explicitHeaders.get('Accept') || '*/*';
    const built = buildAppHeaders({
      json: false,
      hasBody,
      accept,
      headers: {},
      authTokenOverride: options.authTokenOverride
    });
    const headers = new Headers(built.headers || {});
    explicitHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
    options.headers = headers;
    if (!options.credentials) {
      options.credentials = 'same-origin';
    }
    const res = await fetch(input, options);
    if (!res.ok) {
      const err = new Error('csrfFetch: HTTP ' + res.status + ' for ' + input);
      err.status = res.status;
      err.url = String(input || '');
      err.diag = built.diag;
      throw err;
    }
    return res;
  }

  async function fetchJSON(input, init = {}) {
    const res = await csrfFetch(input, init);
    return res.json();
  }

  async function requestJSON(input, options = {}) {
    const url = String(input || '');
    const method = String(options.method || 'GET').toUpperCase();
    const body = options.body;
    const hasBody = body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD';

    const built = buildAppHeaders({
      json: true,
      hasBody,
      includeAuth: options.includeAuth,
      includeCSRF: options.includeCSRF,
      includeXSRF: options.includeXSRF,
      includeSocketId: options.includeSocketId,
      requestedWith: options.requestedWith,
      accept: options.accept,
      headers: options.headers,
      authTokenOverride: options.authTokenOverride
    });

    const axiosClient = getAppAxios();
    if (axiosClient) {
      try {
        const config = {
          url,
          method: method.toLowerCase(),
          headers: built.headers,
          withCredentials: options.credentials !== 'omit',
          responseType: 'json',
          validateStatus: function () {
            return true;
          }
        };
        if (hasBody) {
          config.data = body;
        }
        const response = typeof axiosClient.request === 'function'
          ? await axiosClient.request(config)
          : await axiosClient(config);
        const status = Number(response && response.status) || 0;
        const json = response && response.data !== undefined ? response.data : null;
        if (status < 200 || status >= 300) {
          const err = new Error('requestJSON: HTTP ' + status + ' for ' + url);
          err.status = status;
          err.url = url;
          err.bodyText = typeof json === 'string' ? json : JSON.stringify(json || null);
          err.bodyJson = json;
          err.diag = built.diag;
          throw err;
        }
        return json;
      } catch (err) {
        if (err && err.status) {
          throw err;
        }
      }
    }

    const init = {
      method,
      credentials: options.credentials || 'same-origin',
      headers: built.headers
    };

    if (hasBody) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url, init);

    let text = '';
    try {
      text = await res.text();
    } catch (err) {
    }

    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (err) {
    }

    if (!res.ok) {
      const err = new Error('requestJSON: HTTP ' + res.status + ' for ' + url);
      err.status = res.status;
      err.url = url;
      err.bodyText = text;
      err.bodyJson = json;
      err.diag = built.diag;
      throw err;
    }

    return json;
  }

  KOTN.http = {
    getCSRFToken,
    getCookie,
    safeDecode,
    getXSRFToken,
    getSocketId,
    discoverAuthorizationToken,
    buildAppHeaders,
    csrfFetch,
    fetchJSON,
    async fetchText(input, init = {}) {
      const res = await csrfFetch(input, init);
      return res.text();
    },
    async fetchHTML(input, init = {}) {
      const html = await this.fetchText(input, init);
      return new DOMParser().parseFromString(String(html || ''), 'text/html');
    },
    requestJSON,
    async requestText(input, options = {}) {
      const url = String(input || '');
      const method = String(options.method || 'GET').toUpperCase();
      const body = options.body;
      const hasBody = body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD';

      const built = buildAppHeaders({
        json: options.json,
        hasBody,
        includeAuth: options.includeAuth,
        includeCSRF: options.includeCSRF,
        includeXSRF: options.includeXSRF,
        includeSocketId: options.includeSocketId,
        requestedWith: options.requestedWith,
        accept: options.accept || 'text/html,application/json,text/plain,*/*',
        headers: options.headers,
        authTokenOverride: options.authTokenOverride
      });

      const init = {
        method,
        credentials: options.credentials || 'same-origin',
        headers: built.headers
      };

      if (hasBody) {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const res = await fetch(url, init);
      const text = await res.text();
      if (!res.ok) {
        const err = new Error('requestText: HTTP ' + res.status + ' for ' + url);
        err.status = res.status;
        err.url = url;
        err.bodyText = text;
        err.diag = built.diag;
        throw err;
      }
      return text;
    }
  };

  // ============================================================
  // Mutation Observer Helpers
  // ============================================================

  function onAdded(config) {
    const root = config.root || document;
    const selector = config.selector;
    const callback = config.callback;
    const debounceMs = config.debounceMs == null ? 0 : config.debounceMs;
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
      batch.forEach(el => {
        try {
          callback(el);
        } catch (err) {
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
    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
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

  // ============================================================
  // Numeric Helpers
  // ============================================================

  function toInt(value, defaultValue) {
    if (value == null) {
      return defaultValue == null ? 0 : defaultValue;
    }
    const match = String(value).match(/-?\d+/);
    if (!match) {
      return defaultValue == null ? 0 : defaultValue;
    }
    const n = parseInt(match[0], 10);
    if (Number.isNaN(n)) {
      return defaultValue == null ? 0 : defaultValue;
    }
    return n;
  }

  function ordinal(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return '';
    }
    const abs = Math.abs(n);
    const v = abs % 100;
    if (v >= 11 && v <= 13) {
      return n + 'th';
    }
    const r = abs % 10;
    if (r === 1) return n + 'st';
    if (r === 2) return n + 'nd';
    if (r === 3) return n + 'rd';
    return n + 'th';
  }

  KOTN.num = {
    toInt,
    ordinal
  };

  // ============================================================
  // Logging
  // ============================================================

  function log(label, payload) {
    const ts = new Date().toISOString();
    if (payload !== undefined) {
      console.log('[KOTN ' + ts + '] ' + label, payload);
    } else {
      console.log('[KOTN ' + ts + '] ' + label);
    }
  }

  KOTN.log = log;

  // ============================================================
  // Shelf Helpers
  // ============================================================

  function normalizeShelfName(name) {
    return dom.norm(name || '').toUpperCase();
  }

  function parseShelfName(name) {
    const full = dom.norm(name || '');
    const m = full.match(/^([A-Za-z]+)(\d+)([A-Za-z]+)?$/);
    if (!m) {
      return {
        full,
        prefix: '',
        number: null,
        digits: '',
        suffix: ''
      };
    }
    const digits = m[2];
    const n = parseInt(digits, 10);
    return {
      full,
      prefix: m[1],
      number: Number.isFinite(n) ? n : null,
      digits,
      suffix: m[3] || ''
    };
  }

  function buildShelfIndexFromArray(arr) {
    const map = new Map();
    if (!Array.isArray(arr)) return map;
    arr.forEach(o => {
      if (!o || typeof o !== 'object') return;
      const id = o.id != null ? o.id : (o.shelf_id != null ? o.shelf_id : o.ID);
      const name = o.name || o.label || o.shelf || o.shelf_label || o.title;
      if (id == null || !name) return;
      const key = normalizeShelfName(name);
      if (!key) return;
      map.set(key, String(id));
    });
    return map;
  }

  let shelfIndexCache = null;

  async function loadShelfIndex(options = {}) {
    const url = options.url || '/management/shelves/get-index-data?order_by=name';
    const force = !!options.force;
    if (shelfIndexCache && !force) {
      return shelfIndexCache;
    }
    let json;
    try {
      json = await fetchJSON(url, {
        method: 'GET',
        credentials: 'same-origin'
      });
    } catch (err) {
      console.warn('[KOTN shelves] loadShelfIndex failed', err);
      json = null;
    }
    let arr;
    if (Array.isArray(json)) {
      arr = json;
    } else if (json && (json.shelves || json.rows || json.data || json.items)) {
      arr = json.shelves || json.rows || json.data || json.items;
    } else {
      arr = [];
    }
    const index = buildShelfIndexFromArray(arr);
    shelfIndexCache = { items: arr, index };
    return shelfIndexCache;
  }

  function getShelfIdByName(source, name) {
    const key = normalizeShelfName(name);
    const map = source instanceof Map ? source : (source && source.index instanceof Map ? source.index : null);
    if (!map) return null;
    const value = map.get(key);
    return value == null ? null : String(value);
  }

  async function patchShelf(id, body) {
    if (id == null) {
      throw new Error('patchShelf requires id');
    }
    const url = '/management/shelves/' + encodeURIComponent(String(id));
    const init = {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8'
      },
      body: JSON.stringify(body || {})
    };
    return csrfFetch(url, init);
  }

  async function assignShelfTeam(id, teamCode) {
    return patchShelf(id, { team_assigned: teamCode });
  }

  async function clearShelfTeam(id) {
    return patchShelf(id, { team_assigned: null });
  }

  async function assignShelfStaff(id, staffId) {
    const url = '/management/shelves/' + encodeURIComponent(String(id)) + '/assign/' + encodeURIComponent(String(staffId));
    return csrfFetch(url, {
      method: 'POST',
      credentials: 'same-origin'
    });
  }

  async function removeShelfStaff(id, staffId) {
    const url = '/management/shelves/' + encodeURIComponent(String(id)) + '/remove/' + encodeURIComponent(String(staffId));
    return csrfFetch(url, {
      method: 'POST',
      credentials: 'same-origin'
    });
  }

  function parseNumRangesText(text) {
    const value = dom.norm(text || '');
    if (!value) return null;
    const parts = value.split(',');
    const set = new Set();
    parts.forEach(part => {
      const p = String(part || '').trim();
      if (!p) return;
      if (/^\d+$/.test(p)) {
        set.add(parseInt(p, 10));
        return;
      }
      const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return;
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let n = lo; n <= hi; n += 1) set.add(n);
    });
    return set.size ? set : null;
  }

  function parseLetterRangesText(text) {
    const value = dom.norm(text || '');
    if (!value) return null;
    const parts = value.split(',');
    const set = new Set();
    parts.forEach(part => {
      const p = String(part || '').trim().toUpperCase();
      if (!p) return;
      if (/^[A-Z]$/.test(p)) {
        set.add(p);
        return;
      }
      const m = p.match(/^([A-Z])\s*-\s*([A-Z])$/);
      if (!m) return;
      const a = m[1].charCodeAt(0);
      const b = m[2].charCodeAt(0);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let c = lo; c <= hi; c += 1) set.add(String.fromCharCode(c));
    });
    return set.size ? set : null;
  }

  function readShelfRowName(row) {
    if (!row) return '';
    if (row.dataset && row.dataset.kName) return String(row.dataset.kName);
    const cell = row.querySelector && row.querySelector('.shelf-col.name');
    if (!cell) return '';
    return dom.norm(cell.textContent || '');
  }

  function readShelfRowHasStaff(row) {
    if (!row) return false;
    if (row.dataset && row.dataset.kHasStaff === '1') return true;
    if (row.dataset && row.dataset.kHasStaff === '0') return false;
    const txt = dom.norm(row.querySelector && row.querySelector('.shelf-col.staff .assigned-list') && row.querySelector('.shelf-col.staff .assigned-list').textContent || '');
    return !!txt;
  }

  function readShelfRowHasTeam(row) {
    if (!row) return false;
    if (row.dataset && row.dataset.kHasTeam === '1') return true;
    if (row.dataset && row.dataset.kHasTeam === '0') return false;
    const txt = dom.norm(row.querySelector && row.querySelector('.shelf-col.team .assigned-list') && row.querySelector('.shelf-col.team .assigned-list').textContent || '');
    return !!txt;
  }

  function normalizeRegexList(val) {
    if (!val) return [];
    const list = Array.isArray(val) ? val : [val];
    return list.filter(Boolean).map(r => {
      if (r instanceof RegExp) return r;
      try {
        return new RegExp(String(r));
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  }

  function matchShelfRow(row, options = {}) {
    const name = readShelfRowName(row);
    if (!name) return false;

    if (typeof options.hasStaff === 'boolean') {
      const ok = readShelfRowHasStaff(row);
      if (ok !== options.hasStaff) return false;
    }

    if (typeof options.hasTeam === 'boolean') {
      const ok = readShelfRowHasTeam(row);
      if (ok !== options.hasTeam) return false;
    }

    const include = normalizeRegexList(options.includeRegex);
    if (include.length) {
      const hit = include.some(re => re.test(name));
      if (!hit) return false;
    }

    const exclude = normalizeRegexList(options.excludeRegex);
    if (exclude.length) {
      const hit = exclude.some(re => re.test(name));
      if (hit) return false;
    }

    if (options.regex) {
      let re;
      try {
        re = options.regex instanceof RegExp ? options.regex : new RegExp(String(options.regex));
      } catch (e) {
        return false;
      }
      return re.test(name);
    }

    const prefix = dom.norm(options.prefix || '').toUpperCase();
    const nums = parseNumRangesText(options.nums || '');
    const letters = parseLetterRangesText(options.letters || '');
    if (!prefix && !nums && !letters) return true;

    const parts = parseShelfName(name);
    if (!parts || !parts.full) return false;
    if (prefix && String(parts.prefix || '').toUpperCase() !== prefix) return false;
    if (nums && (parts.number == null || !nums.has(parts.number))) return false;
    if (letters) {
      const suf = String(parts.suffix || '').toUpperCase();
      if (!letters.has(suf)) return false;
    }
    return true;
  }

  function filterShelfRows(rows, options = {}) {
    const list = Array.isArray(rows) ? rows : [];
    return list.filter(row => matchShelfRow(row, options));
  }

  KOTN.shelves = {
    normalizeName: normalizeShelfName,
    parseName: parseShelfName,
    buildIndexFromArray: buildShelfIndexFromArray,
    loadIndex: loadShelfIndex,
    getIdByName: getShelfIdByName,
    assignTeam: assignShelfTeam,
    clearTeam: clearShelfTeam,
    assignStaff: assignShelfStaff,
    removeStaff: removeShelfStaff,
    matchRow: matchShelfRow,
    filterRows: filterShelfRows
  };

  // ============================================================
  // Prompt Helpers
  // ============================================================

  function getScriptWindow() {
    try {
      return typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    } catch (err) {
      return window;
    }
  }

  function ensurePromptPatched() {
    const w = getScriptWindow();
    if (w.kotnArmPrompt) return;
    const code = '(function(){var o=window.prompt,a=null;window.kotnArmPrompt=function(v){try{a=String(v);}catch(e){a="";}};window.prompt=function(m,d){try{if(a!==null&&a!==undefined){var t=a;a=null;return t;}}catch(e){}return o.call(window,m,d);};})();';
    const s = document.createElement('script');
    s.textContent = code;
    document.documentElement.appendChild(s);
    s.remove();
  }

  function armPrompt(value) {
    try {
      ensurePromptPatched();
      const w = getScriptWindow();
      if (w.kotnArmPrompt) {
        w.kotnArmPrompt(String(value));
      }
    } catch (err) {
    }
  }

  KOTN.prompt = {
    ensurePatched: ensurePromptPatched,
    arm: armPrompt
  };

  // ============================================================
  // Re-SKU Helpers
  // ============================================================

  let reskuIframe = null;

  function getReskuIframe() {
    if (reskuIframe && document.body.contains(reskuIframe)) return reskuIframe;
    const iframe = document.createElement('iframe');
    iframe.id = 'kotn-resku-frame';
    iframe.style.position = 'fixed';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.left = '-9999px';
    iframe.style.bottom = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
    reskuIframe = iframe;
    return iframe;
  }

  function waitForIframeLoad(iframe, url, timeoutMs) {
    const limit = timeoutMs == null ? 15000 : timeoutMs;
    return new Promise((resolve, reject) => {
      let done = false;
      function finishOk() {
        if (done) return;
        done = true;
        iframe.removeEventListener('load', onLoad);
        clearTimeout(timer);
        resolve();
      }
      function finishErr(err) {
        if (done) return;
        done = true;
        iframe.removeEventListener('load', onLoad);
        clearTimeout(timer);
        reject(err);
      }
      function onLoad() {
        finishOk();
      }
      const timer = setTimeout(() => {
        finishErr(new Error('resku iframe load timeout for ' + url));
      }, limit);
      iframe.addEventListener('load', onLoad, { once: true });
      iframe.src = url;
    });
  }

  function waitForIframeNextLoad(iframe, timeoutMs) {
    const limit = timeoutMs == null ? 8000 : timeoutMs;
    return new Promise(resolve => {
      let done = false;
      function finish() {
        if (done) return;
        done = true;
        iframe.removeEventListener('load', finish);
        resolve();
      }
      iframe.addEventListener('load', finish, { once: true });
      setTimeout(finish, limit);
    });
  }

function parseSavedNewSku(doc, expectedPrefix) {
  try {
    const expected = dom.norm(expectedPrefix || '').toUpperCase();
    const expectedNeedle = expected ? expected + '-' : '';
    const candidates = [];

    function collect(text) {
      const matches = String(text == null ? '' : text).toUpperCase().match(/\b[A-Z]+[A-Z0-9]*-\d+\b/g);
      if (!matches) return;
      matches.forEach(sku => {
        const value = dom.norm(sku);
        if (!value) return;
        if (candidates.indexOf(value) === -1) {
          candidates.push(value);
        }
      });
    }

    const valueEl = doc.querySelector('.sku .value');
    if (valueEl) {
      Array.from(valueEl.querySelectorAll('a.kotn-sku-link')).forEach(function(link) {
        collect(link.textContent || '');
      });
      collect(valueEl.textContent || '');
    }

    Array.from(doc.querySelectorAll('a.kotn-sku-link')).forEach(function(link) {
      collect(link.textContent || '');
    });

    const usable = expectedNeedle
      ? candidates.filter(function(sku) {
          return sku.indexOf(expectedNeedle) === 0;
        })
      : candidates;

    if (usable.length) {
      return usable[0];
    }

    const bodyText = dom.norm(doc && doc.body && doc.body.textContent || '');
    const bodyMatches = String(bodyText).toUpperCase().match(/\b[A-Z]+[A-Z0-9]*-\d+\b/g) || [];
    const bodyCandidates = Array.from(new Set(bodyMatches.map(function(sku) {
      return dom.norm(sku);
    }).filter(Boolean)));

    if (expectedNeedle) {
      const prefixed = bodyCandidates.filter(function(sku) {
        return sku.indexOf(expectedNeedle) === 0;
      });
      return prefixed[0] || '';
    }

    return bodyCandidates[0] || '';
  } catch (err) {
    return '';
  }
}


  async function reassignOneSku(listingId, targetShelf, options = {}) {
    if (!listingId) {
      throw new Error('reassignOneSku requires listingId');
    }
    const idStr = String(listingId);
    const shelf = dom.norm(targetShelf || '');
    if (!shelf) {
      throw new Error('reassignOneSku requires targetShelf');
    }
    const iframe = getReskuIframe();
    const loadTimeoutMs = options.loadTimeoutMs;
    const saveTimeoutMs = options.saveTimeoutMs;
    const url = new URL('/management/listings/' + encodeURIComponent(idStr) + '/edit', window.location.origin).toString();
    await waitForIframeLoad(iframe, url, loadTimeoutMs);
    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error('reassignOneSku iframe document unavailable');
    }
    const images = Array.from(doc.querySelectorAll('.image-upload-grid img[src]')).map(img => img.src).filter(Boolean);
    const input = doc.querySelector('#shelf_name');
    const submit = doc.getElementById('submitButton');
    if (!input || !submit) {
      throw new Error('reassignOneSku edit form controls not found');
    }
    input.focus();
    input.value = shelf;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const nextLoad = waitForIframeNextLoad(iframe, saveTimeoutMs);
    submit.click();
    await nextLoad;
    const savedDoc = iframe.contentDocument;
    const newSku = parseSavedNewSku(savedDoc, shelf);
    return {
      listingId: idStr,
      targetShelf: shelf,
      newSku,
      images
    };
  }

  async function bulkResku(listingIds, targetShelf, options = {}) {
    const ids = Array.isArray(listingIds) ? listingIds : [];
    const total = ids.length;
    const shelf = dom.norm(targetShelf || '');
    if (!shelf) {
      throw new Error('bulkResku requires targetShelf');
    }
    if (!total) {
      return {
        ok: 0,
        fail: 0,
        total: 0
      };
    }
    const onProgress = options.onProgress;
    const onResult = options.onResult;
    const loadTimeoutMs = options.loadTimeoutMs;
    const saveTimeoutMs = options.saveTimeoutMs;
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < total; i += 1) {
      const id = ids[i];
      if (onProgress) {
        try {
          onProgress({ index: i + 1, total, id });
        } catch (err) {
        }
      }
      try {
        const info = await reassignOneSku(id, shelf, {
          loadTimeoutMs,
          saveTimeoutMs
        });
        ok += 1;
        if (onResult) {
          try {
            onResult(info);
          } catch (err) {
          }
        }
      } catch (err) {
        fail += 1;
        console.error('[KOTN resku] failed for listing ' + id, err);
      }
    }
    return {
      ok,
      fail,
      total
    };
  }

  let _reskuQueue = Promise.resolve();

  function enqueueResku(task) {
    const run = () => task().catch(err => {
      throw err;
    });
    _reskuQueue = _reskuQueue.then(run, run);
    return _reskuQueue;
  }

  async function apiUpdateShelf(listingId, targetShelf) {
    const idStr = String(listingId);
    const shelf = dom.norm(targetShelf || '');
    if (!idStr || !shelf) {
      throw new Error('apiUpdateShelf requires listingId and targetShelf');
    }
    return enqueueResku(async () => {
      const payload = { shelf_name: shelf };
      const json = await KOTN.http.fetchJSON('/management/listings/' + encodeURIComponent(idStr) + '/update-shelf', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8'
        },
        body: JSON.stringify(payload)
      });
      const verified = await verifyNewSkuViaEdit(idStr, shelf);
      return {
        listingId: idStr,
        targetShelf: shelf,
        newSku: verified.newSku,
        images: verified.images,
        apiResponse: json
      };
    });
  }

  async function verifyNewSkuViaEdit(listingId, shelf) {
    const idStr = String(listingId);
    const url = '/management/listings/' + encodeURIComponent(idStr) + '/edit';
    const frame = await KOTN.page.loadInIframe({
      url,
      selector: '#shelf_name',
      timeoutMs: 15000
    });
    const doc = frame.document;
    const newSku = parseSavedNewSku(doc, shelf) || '';
    const images = Array.from(doc.querySelectorAll('.image-upload-grid img[src]')).map(img => img.src).filter(Boolean);
    return {
      listingId: idStr,
      targetShelf: shelf,
      newSku,
      images
    };
  }

  async function bulkReskuViaApi(listingIds, targetShelf, options = {}) {
    const ids = Array.isArray(listingIds) ? listingIds : [];
    const shelf = dom.norm(targetShelf || '');
    const total = ids.length;
    if (!shelf) {
      throw new Error('bulkReskuViaApi requires targetShelf');
    }
    if (!total) {
      return {
        ok: 0,
        fail: 0,
        total: 0
      };
    }
    const onProgress = options.onProgress;
    const onResult = options.onResult;
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < total; i += 1) {
      const id = ids[i];
      if (onProgress) {
        try {
          onProgress({ index: i + 1, total, id });
        } catch (err) {
        }
      }
      try {
        const info = await apiUpdateShelf(id, shelf);
        ok += 1;
        if (onResult) {
          try {
            onResult(info);
          } catch (err) {
          }
        }
      } catch (err) {
        fail += 1;
        console.error('[KOTN resku api] failed for listing ' + id, err);
      }
    }
    return {
      ok,
      fail,
      total
    };
  }

  KOTN.resku = {
    bulk: bulkResku,
    bulkViaApi: bulkReskuViaApi,
    updateShelfViaApi: apiUpdateShelf,
    verifyViaEdit: verifyNewSkuViaEdit,
    reassignOne: reassignOneSku,
    parseSavedNewSku
  };

  // ============================================================
  // Lister Stats Helpers
  // ============================================================

  function findListerDomRows() {
    const tiles = dom.qsa('.lister-stats-tile');
    const rows = [];
    tiles.forEach(tile => {
      const nameLink = tile.querySelector('.lister a[href*="/management/users/"]');
      if (!nameLink) return;
      const rawName = dom.norm(nameLink.textContent || '');
      if (!rawName) return;
      const lowerName = rawName.toLowerCase();
      if (lowerName.includes('team')) return;
      const href = String(nameLink.getAttribute('href') || '');
      const m = href.match(/\/management\/users\/(\d+)/);
      if (!m) return;
      const staffId = Number(m[1]);
      if (!Number.isFinite(staffId)) return;
      const badgeEl = tile.querySelector('.lister .badge');
      const teamBadge = badgeEl ? dom.norm(badgeEl.textContent || '') : '';
      rows.push({
        tile,
        staffId,
        name: rawName,
        teamBadge
      });
    });
    return rows;
  }

  KOTN.listers = KOTN.listers || {};
  KOTN.listers.findDomRows = findListerDomRows;

  // ============================================================
  // Leaderboard Helpers
  // ============================================================

  function lbExtraToBeatByPct(candidate, ahead) {
    if (!candidate || !ahead) return null;
    if (!candidate.rankable || !ahead.rankable) return null;
    if (candidate.target <= 0 || ahead.target <= 0) return null;
    const threshold = (ahead.count / ahead.target) * candidate.target;
    const raw = Math.floor(threshold - candidate.count) + 1;
    if (!Number.isFinite(raw)) return null;
    return raw > 0 ? raw : 0;
  }

  function lbExtraToQualify(row, qualifyPct) {
    if (!row || !row.rankable) return null;
    if (row.target <= 0) return null;
    const pct = typeof qualifyPct === 'number' && Number.isFinite(qualifyPct) ? qualifyPct : 1;
    const required = Math.ceil(pct * row.target);
    const need = required - row.count;
    return need > 0 ? need : 0;
  }

  KOTN.leaderboard = {
    extraToBeatByPct: lbExtraToBeatByPct,
    extraToQualify: lbExtraToQualify
  };

  // ============================================================
  // Listing Parser Helpers
  // ============================================================

  function extractListingFromEdit(doc, id, options) {
    const data = {
      id: String(id),
      title: '',
      primaryCategory: '',
      secondaryCategory: '',
      categoryIdsJson: '',
      auctionId: '',
      auctionType: '',
      shelfName: '',
      lot: '',
      pickingChannel: '',
      productUrl: '',
      itemConditionId: '',
      packageConditionId: '',
      itemConditionLabel: '',
      packageConditionLabel: '',
      macroNotes: '',
      conditionNotes: '',
      editorNotes: '',
      staffNotes: '',
      createdBy: '',
      createdByRaw: '',
      createdAtText: '',
      skuText: '',
      skuCore: '',
      copiedFrom: '',
      isDraft: false,
      toBeCleared: false,
      isPublic: false,
      imageCount: 0,
      imageTitles: [],
      imageUrls: []
    };
    const createdRow = doc.querySelector('.form-group.row span.col-form-label');
    if (createdRow && createdRow.textContent && dom.norm(createdRow.textContent).toLowerCase() === 'created by') {
      const row = createdRow.parentElement;
      const input = row && row.querySelector('.input-group input[disabled][type="text"]');
      if (input && input.value) {
        data.createdBy = input.value;
        data.createdByRaw = input.value;
      }
      const small = row && row.querySelector('.small, .text-muted');
      if (small && small.textContent) {
        data.createdAtText = dom.norm(small.textContent);
      }
    }
    const skuValueEl = doc.querySelector('.sku .value');
    if (skuValueEl && skuValueEl.textContent) {
      data.skuText = dom.norm(skuValueEl.textContent);
      data.skuCore = dom.norm((data.skuText.split('-')[0] || data.skuText).trim());
    }

    const auctionHiddenId = doc.querySelector('input[name="auction_id"]');
    if (auctionHiddenId && auctionHiddenId.value) {
      data.auctionId = String(auctionHiddenId.value);
    }
    const auctionTypeInput = doc.querySelector('#auctionType');
    if (auctionTypeInput && auctionTypeInput.value) {
      data.auctionType = String(auctionTypeInput.value);
    }
    const shelfInput = doc.querySelector('input[name="shelf_name"]');
    if (shelfInput && shelfInput.value) {
      data.shelfName = shelfInput.value;
    }
    const lotSelect = doc.querySelector('select[name="lot"]');
    if (lotSelect && lotSelect.value) {
      data.lot = lotSelect.value;
    }
    const channelFront = doc.querySelector('input[name="picking_channel"][value="front"]');
    const channelBack = doc.querySelector('input[name="picking_channel"][value="back"]');
    if (channelFront && channelFront.checked) {
      data.pickingChannel = 'front';
    } else if (channelBack && channelBack.checked) {
      data.pickingChannel = 'back';
    }
    const urlInput = doc.querySelector('input[name="url"]');
    if (urlInput && urlInput.value) {
      data.productUrl = urlInput.value;
    }
    const copiedFromInput = doc.querySelector('input[name="copied_from"]');
    if (copiedFromInput && copiedFromInput.value) {
      data.copiedFrom = String(copiedFromInput.value);
    }
    const cat1Button = doc.querySelector('.cat-1-button');
    if (cat1Button && cat1Button.textContent) {
      data.primaryCategory = dom.norm(cat1Button.textContent);
    }
    const cat2Button = doc.querySelector('.cat-2-button');
    if (cat2Button && cat2Button.textContent) {
      data.secondaryCategory = dom.norm(cat2Button.textContent);
    }
    const catIdsHidden = doc.querySelector('#categoryIdsJson');
    if (catIdsHidden && catIdsHidden.value) {
      data.categoryIdsJson = catIdsHidden.value;
    }
    const titleInput = doc.querySelector('input[name="title"]');
    if (titleInput && titleInput.value) {
      data.title = titleInput.value;
    }
    const itemCondSelect = doc.querySelector('select[name="item_condition_id"]');
    if (itemCondSelect) {
      data.itemConditionId = itemCondSelect.value || '';
      const sel = itemCondSelect.options[itemCondSelect.selectedIndex];
      if (sel && sel.textContent) {
        data.itemConditionLabel = dom.norm(sel.textContent);
      }
    }
    const pkgCondSelect = doc.querySelector('select[name="package_condition_id"]');
    if (pkgCondSelect) {
      data.packageConditionId = pkgCondSelect.value || '';
      const sel = pkgCondSelect.options[pkgCondSelect.selectedIndex];
      if (sel && sel.textContent) {
        data.packageConditionLabel = dom.norm(sel.textContent);
      }
    }
    const macroNotesTextarea = doc.querySelector('textarea[name="macro_notes"]');
    if (macroNotesTextarea && macroNotesTextarea.value) {
      data.macroNotes = macroNotesTextarea.value;
    }
    const conditionNotesTextarea = doc.querySelector('textarea[name="condition_notes"]');
    if (conditionNotesTextarea && conditionNotesTextarea.value) {
      data.conditionNotes = conditionNotesTextarea.value;
    }
    const editorNotesTextarea = doc.querySelector('textarea[name="notes"]');
    if (editorNotesTextarea && editorNotesTextarea.value) {
      data.editorNotes = editorNotesTextarea.value;
    }
    const staffNotesTextarea = doc.querySelector('textarea[name="staff_notes"]');
    if (staffNotesTextarea && staffNotesTextarea.value) {
      data.staffNotes = staffNotesTextarea.value;
    }
    const imageCountInput = doc.querySelector('#imageCount');
    if (imageCountInput && imageCountInput.value) {
      const n = parseInt(String(imageCountInput.value), 10);
      data.imageCount = Number.isFinite(n) ? n : 0;
    }
    const images = Array.from(doc.querySelectorAll('.image-upload-grid img[src]'));
    if (images.length) {
      data.imageUrls = images.map(img => img.getAttribute('src') || '').filter(Boolean);
      data.imageTitles = images.map(img => img.getAttribute('title') || '').filter(Boolean);
      if (!data.imageCount) {
        data.imageCount = images.length;
      }
    }
    const draftCheckbox = doc.querySelector('input[name="is_draft"]');
    if (draftCheckbox) {
      data.isDraft = !!draftCheckbox.checked;
    }
    const toBeClearedCheckbox = doc.querySelector('input[name="to_be_cleared"]');
    if (toBeClearedCheckbox) {
      data.toBeCleared = !!toBeClearedCheckbox.checked;
    }
    const isPublicCheckbox = doc.querySelector('input[name="is_public"]');
    if (isPublicCheckbox) {
      data.isPublic = !!isPublicCheckbox.checked;
    }
    return data;
  }

  async function loadListingFromEdit(id, options) {
    const cfg = options || {};
    const baseUrl = cfg.baseUrl || '/management/listings/';
    const url = baseUrl + encodeURIComponent(String(id)) + '/edit';
    const timeoutMs = cfg.timeoutMs == null ? 30000 : cfg.timeoutMs;
    const result = await KOTN.page.loadInIframe({
      url,
      ready(win, doc) {
        return extractListingFromEdit(doc, id, cfg);
      },
      timeoutMs
    });
    return result;
  }

  async function collectListingIdsFromIndex(url, options) {
    const cfg = options || {};
    const timeoutMs = cfg.timeoutMs == null ? 30000 : cfg.timeoutMs;
    const selector = cfg.selector || '.tile .id a[href*="/management/listings/lookup?id="]';
    const pattern = cfg.pattern || /lookup\?id=(\d+)/i;
    const result = await KOTN.page.loadInIframe({
      url,
      ready(win, doc) {
        return KOTN.dom.waitFor(selector, {
          root: doc,
          timeoutMs: timeoutMs
        }).then(function () {
          const links = doc.querySelectorAll(selector);
          const list = [];
          links.forEach(function (a) {
            const href = a.getAttribute('href') || '';
            const m = href.match(pattern);
            if (m && m[1]) {
              list.push(m[1]);
            }
          });
          return list;
        }).catch(function () {
          const links = doc.querySelectorAll('a[href*="/management/listings/lookup?id="]');
          const fallback = [];
          links.forEach(function (a) {
            const href = a.getAttribute('href') || '';
            const m = href.match(pattern);
            if (m && m[1]) {
              fallback.push(m[1]);
            }
          });
          return fallback;
        });
      },
      timeoutMs
    });
    return Array.isArray(result) ? result : [];
  }

  KOTN.listings = {
    extractFromEdit: extractListingFromEdit,
    loadFromEdit: loadListingFromEdit,
    collectIdsFromIndex: collectListingIdsFromIndex
  };

  // ============================================================
  // Listing Operation Helpers
  // ============================================================

  function normalizeListingId(value) {
    const match = String(value == null ? '' : value).match(/\d+/);
    return match ? match[0] : '';
  }

  function getListingIdFromPath(pathname) {
    const match = String(pathname || '').match(/\/management\/listings\/(\d+)(?:\/|$)/i);
    return match ? match[1] : '';
  }

  function listingUrl(id, suffix) {
    const listingId = normalizeListingId(id);
    if (!listingId) {
      throw new Error('listingUrl requires a listing id');
    }
    return '/management/listings/' + encodeURIComponent(listingId) + (suffix || '');
  }

  async function getManagementModalDetails(id, options = {}) {
    return KOTN.http.requestJSON(listingUrl(id, '/management-modal-details'), {
      method: 'GET',
      authTokenOverride: options.authTokenOverride,
      headers: options.headers
    });
  }

  async function updateInventory(id, payload, options = {}) {
    return KOTN.http.requestJSON(listingUrl(id, '/update-inventory'), {
      method: 'PATCH',
      body: payload || {},
      authTokenOverride: options.authTokenOverride,
      headers: options.headers
    });
  }

  async function deleteListing(id, payload, options = {}) {
    if (options.prefetchModalDetails) {
      try {
        await getManagementModalDetails(id, options);
      } catch (err) {
      }
    }
    return KOTN.http.requestJSON(listingUrl(id, '/delete'), {
      method: 'POST',
      body: payload || {},
      authTokenOverride: options.authTokenOverride,
      headers: options.headers
    });
  }

  async function updateCreator(id, creatorUsername, options = {}) {
    if (options.prefetchModalDetails) {
      try {
        await getManagementModalDetails(id, options);
      } catch (err) {
      }
    }
    return KOTN.http.requestJSON(listingUrl(id, '/update-creator'), {
      method: 'POST',
      body: {
        creator_username: dom.norm(creatorUsername || '')
      },
      authTokenOverride: options.authTokenOverride,
      headers: options.headers
    });
  }

  async function updateShelf(id, shelfName, options = {}) {
    if (options.prefetchModalDetails) {
      try {
        await getManagementModalDetails(id, options);
      } catch (err) {
      }
    }
    return KOTN.http.requestJSON(listingUrl(id, '/update-shelf'), {
      method: 'POST',
      body: {
        shelf_name: dom.norm(shelfName || '')
      },
      authTokenOverride: options.authTokenOverride,
      headers: options.headers
    });
  }

  async function removeBids(id, reason, options = {}) {
    if (options.prefetchModalDetails) {
      try {
        await getManagementModalDetails(id, options);
      } catch (err) {
      }
    }
    return KOTN.http.requestJSON(listingUrl(id, '/remove-bids'), {
      method: 'POST',
      body: {
        reason: String(reason == null ? '' : reason)
      },
      authTokenOverride: options.authTokenOverride,
      headers: options.headers
    });
  }

  async function setPublicState(id, value, options = {}) {
    const isPublic = !!value;
    const body = {
      value: isPublic
    };
    if (!isPublic) {
      const reason = dom.norm(options.reason || '') || 'not public';
      body.reason = reason;
    }
    return KOTN.http.requestJSON(listingUrl(id, '/public'), {
      method: 'PATCH',
      body,
      authTokenOverride: options.authTokenOverride,
      headers: options.headers
    });
  }

  KOTN.listingOps = {
    normalizeListingId,
    getListingIdFromPath,
    listingUrl,
    getManagementModalDetails,
    updateInventory,
    deleteListing,
    updateCreator,
    updateShelf,
    removeBids,
    setPublicState
  };

})();
