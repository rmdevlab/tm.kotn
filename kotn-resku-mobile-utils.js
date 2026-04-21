// KOTN ReSKU Mobile Utilities
// v0.1.0

(function () {
  'use strict';

  const KOTN = (window.KOTN = window.KOTN || {});

  // ============================================================
  // Config
  // ============================================================

  const GRID_URL = '/management/shelves/grid';
  const GRID_GROUP_SWITCH_DELAY_MS = 140;
  const GRID_LOAD_TIMEOUT_MS = 15000;
  const DEFAULT_PAGE_SIZE = 100;

  // ============================================================
  // Core References
  // ============================================================

  const dom = KOTN.dom || {};
  const asyncUtils = KOTN.async || {};
  const shelves = KOTN.shelves || {};

  // ============================================================
  // Helpers
  // ============================================================

  function norm(value) {
    return typeof dom.norm === 'function'
      ? dom.norm(value || '')
      : String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function upper(value) {
    return norm(value).toUpperCase();
  }

  function qsa(selector, root) {
    if (dom && typeof dom.qsa === 'function') {
      return dom.qsa(selector, root || document);
    }
    return Array.from((root || document).querySelectorAll(selector));
  }

  function sleep(ms) {
    if (asyncUtils && typeof asyncUtils.sleep === 'function') {
      return asyncUtils.sleep(ms);
    }
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function toAbsoluteUrl(raw) {
    const value = norm(raw || '');
    if (!value) return '';
    try {
      return new URL(value, window.location.origin).toString();
    } catch (err) {
      return '';
    }
  }

  function uniq(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
  }

  function compareNatural(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function getAbortError() {
    try {
      return new DOMException('Aborted', 'AbortError');
    } catch (err) {
      const e = new Error('Aborted');
      e.name = 'AbortError';
      return e;
    }
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) {
      throw getAbortError();
    }
  }

  // ============================================================
  // Hidden Grid Frame
  // ============================================================

  let gridFrame = null;
  let gridFrameUrl = '';
  const inventoryUrlCache = new Map();

  function getGridFrame() {
    if (gridFrame && document.body.contains(gridFrame)) {
      return gridFrame;
    }
    const iframe = document.createElement('iframe');
    iframe.id = 'kotn-resku-mobile-grid-frame';
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    gridFrame = iframe;
    return iframe;
  }

  function waitForFrameLoad(frame, url, timeoutMs) {
    const limit = timeoutMs == null ? GRID_LOAD_TIMEOUT_MS : timeoutMs;
    return new Promise(function (resolve, reject) {
      let done = false;
      function cleanup() {
        frame.removeEventListener('load', onLoad);
        clearTimeout(timer);
      }
      function onLoad() {
        if (done) return;
        done = true;
        cleanup();
        resolve({
          frame: frame,
          win: frame.contentWindow || null,
          doc: frame.contentDocument || null
        });
      }
      const timer = setTimeout(function () {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('Grid frame load timeout for ' + url));
      }, limit);
      frame.addEventListener('load', onLoad);
      frame.src = url;
    });
  }

  function isGridFrameLoaded(frame, url) {
    if (!frame || !frame.contentDocument || !frame.contentWindow) return false;
    if (gridFrameUrl !== url) return false;
    try {
      return String(frame.contentWindow.location.pathname || '').indexOf('/management/shelves/grid') === 0;
    } catch (err) {
      return false;
    }
  }

  async function ensureGridFrame(options) {
    const cfg = options || {};
    const force = !!cfg.force;
    const url = cfg.url || GRID_URL;
    const frame = getGridFrame();
    if (!force && isGridFrameLoaded(frame, url)) {
      return {
        frame: frame,
        win: frame.contentWindow,
        doc: frame.contentDocument
      };
    }
    const loaded = await waitForFrameLoad(frame, url, cfg.timeoutMs);
    gridFrameUrl = url;
    return loaded;
  }

  // ============================================================
  // Shelf Discovery
  // ============================================================

  function isShelfNameToken(value) {
    return /^[A-Z]+\d+[A-Z]*$/.test(upper(value || ''));
  }

  function extractInventoryUrlFromElement(el) {
    if (!el || !(el instanceof Element)) return '';
    const attrs = [
      'href',
      'data-href',
      'data-url',
      'data-target',
      'data-target-url',
      'data-link',
      'data-path'
    ];
    for (let i = 0; i < attrs.length; i += 1) {
      const raw = el.getAttribute(attrs[i]) || '';
      if (raw.indexOf('/management/shelves/inventory') !== -1) {
        return toAbsoluteUrl(raw);
      }
    }
    const onclick = el.getAttribute('onclick') || '';
    if (onclick.indexOf('/management/shelves/inventory') !== -1) {
      const match = onclick.match(/(["'`])([^"'`]*\/management\/shelves\/inventory[^"'`]*)\1/);
      if (match && match[2]) {
        return toAbsoluteUrl(match[2]);
      }
    }
    return '';
  }

  function collectShelfTokensFromText(text) {
    const matches = upper(text || '').match(/\b[A-Z]+\d+[A-Z]*\b/g) || [];
    return Array.from(new Set(matches.map(function (value) {
      return norm(value);
    }).filter(Boolean)));
  }

  function findShelfNameNearElement(el) {
    if (!el) return '';
    const seen = new Set();
    const tokens = [];

    function addText(value) {
      collectShelfTokensFromText(value).forEach(function (token) {
        if (seen.has(token)) return;
        seen.add(token);
        tokens.push(token);
      });
    }

    addText(el.getAttribute('data-shelf') || '');
    addText(el.getAttribute('title') || '');
    addText(el.textContent || '');

    let node = el;
    let depth = 0;
    while (node && depth < 4) {
      addText(node.textContent || '');
      Array.from(node.children || []).forEach(function (child) {
        addText(child.textContent || '');
      });
      node = node.parentElement;
      depth += 1;
    }

    return tokens[0] || '';
  }

  function parseClassicShelfDirectoryFromDoc(doc) {
    const grid = doc.querySelector('.shelf-grid');
    if (!grid) return [];
    return qsa('.shelf-grid-item', grid).map(function (item) {
      const countLink = item.querySelector('.shelf-count[href]');
      const nameEl = item.querySelector('.shelf-name a,.shelf-name');
      const shelf = norm(nameEl && nameEl.textContent || '');
      const href = countLink && countLink.getAttribute('href')
        ? new URL(countLink.getAttribute('href'), window.location.origin).toString()
        : '';
      const countLabel = norm(countLink && countLink.textContent || '');
      if (!shelf) return null;
      return {
        shelf: shelf,
        key: upper(shelf),
        url: href,
        countLabel: countLabel
      };
    }).filter(Boolean).sort(function (a, b) {
      return compareNatural(a.shelf, b.shelf);
    });
  }

  function harvestVisibleShelfEntries(root) {
    const map = new Map();

    function upsert(entry) {
      if (!entry || !entry.shelf) return;
      const key = upper(entry.shelf);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          shelf: entry.shelf,
          key: key,
          url: entry.url || '',
          countLabel: entry.countLabel || ''
        });
        return;
      }
      if (!existing.url && entry.url) {
        existing.url = entry.url;
      }
      if (!existing.countLabel && entry.countLabel) {
        existing.countLabel = entry.countLabel;
      }
    }

    parseClassicShelfDirectoryFromDoc(root).forEach(upsert);

    qsa('a[href*="/management/shelves/inventory"],[data-href*="/management/shelves/inventory"],[onclick*="/management/shelves/inventory"]', root).forEach(function (el) {
      const url = extractInventoryUrlFromElement(el);
      const shelf = findShelfNameNearElement(el);
      if (!shelf) return;
      upsert({
        shelf: shelf,
        url: url,
        countLabel: norm(el.textContent || '')
      });
    });

    qsa('button,a,.btn,.tab,[role="button"]', root).forEach(function (el) {
      const shelf = upper(el.textContent || '');
      if (!isShelfNameToken(shelf)) return;
      const url = extractInventoryUrlFromElement(el)
        || extractInventoryUrlFromElement(el.parentElement)
        || extractInventoryUrlFromElement(el.closest('div,li,tr,td,section,article'))
        || '';
      upsert({
        shelf: shelf,
        url: url,
        countLabel: norm(el.textContent || '')
      });
    });

    const out = Array.from(map.values()).sort(function (a, b) {
      return compareNatural(a.shelf, b.shelf);
    });

    out.forEach(function (entry) {
      if (entry.url) {
        inventoryUrlCache.set(entry.key, entry.url);
      }
    });

    return out;
  }

  function getHarvestGroupButtons(root) {
    const ignore = new Set(['SCOPE', 'OA', 'RESKU', 'FULL', 'CLAIMED', 'NOTCLAIMABLE', 'ASSIGNED', 'OK']);
    const out = [];
    const seen = new Set();
    qsa('button,a,.btn,.tab,[role="button"]', root).forEach(function (el) {
      const text = upper(el.textContent || '');
      if (!text) return;
      if (ignore.has(text)) return;
      if (isShelfNameToken(text)) return;
      if (!/^[A-Z@]+$/.test(text)) return;
      if (text.length > 12) return;
      const key = text + '|' + (el.className || '');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(el);
    });
    return out;
  }

  function findGroupButton(doc, prefix) {
    const wanted = upper(prefix || '');
    const buttons = getHarvestGroupButtons(doc);
    return buttons.find(function (el) {
      return upper(el.textContent || '') === wanted;
    }) || null;
  }

  async function safeTriggerHarvestButton(button, options) {
    const cfg = options || {};
    const delayMs = cfg.delayMs == null ? GRID_GROUP_SWITCH_DELAY_MS : cfg.delayMs;
    const signal = cfg.signal || null;

    if (!button || !(button instanceof Element)) return;

    const restores = [];
    const tag = String(button.tagName || '').toUpperCase();
    const form = button.form || button.closest('form');

    function restoreAll() {
      while (restores.length) {
        try {
          restores.pop()();
        } catch (err) {
        }
      }
    }

    try {
      if (form) {
        const preventSubmit = function (event) {
          event.preventDefault();
          event.stopPropagation();
        };
        form.addEventListener('submit', preventSubmit, true);
        restores.push(function () {
          form.removeEventListener('submit', preventSubmit, true);
        });
      }

      if (tag === 'BUTTON' || (tag === 'INPUT' && String(button.getAttribute('type') || '').toLowerCase() === 'submit')) {
        const originalType = button.getAttribute('type');
        button.setAttribute('type', 'button');
        restores.push(function () {
          if (originalType == null) {
            button.removeAttribute('type');
          } else {
            button.setAttribute('type', originalType);
          }
        });
      }

      if (tag === 'A') {
        const originalHref = button.getAttribute('href');
        button.setAttribute('href', '#');
        restores.push(function () {
          if (originalHref == null) {
            button.removeAttribute('href');
          } else {
            button.setAttribute('href', originalHref);
          }
        });
      }

      button.click();
      await sleep(delayMs);
      throwIfAborted(signal);
    } finally {
      restoreAll();
    }
  }

  function getShelfPrefix(name) {
    if (shelves && typeof shelves.parseName === 'function') {
      const parsed = shelves.parseName(name);
      return upper(parsed && parsed.prefix || '');
    }
    const match = upper(name || '').match(/^([A-Z]+)/);
    return match ? match[1] : '';
  }

  async function resolveInventoryUrlsForShelves(names, options) {
    const cfg = options || {};
    const wanted = uniq((Array.isArray(names) ? names : []).map(upper)).filter(Boolean);
    const signal = cfg.signal || null;
    const onProgress = typeof cfg.onProgress === 'function' ? cfg.onProgress : null;
    const result = new Map();

    wanted.forEach(function (name) {
      const cached = inventoryUrlCache.get(name);
      if (cached) {
        result.set(name, cached);
      }
    });

    let unresolved = wanted.filter(function (name) {
      return !result.get(name);
    });

    if (!unresolved.length) {
      return {
        urls: result,
        unresolved: []
      };
    }

    let ctx = await ensureGridFrame({
      force: !!cfg.forceFrame,
      timeoutMs: cfg.timeoutMs
    });
    harvestVisibleShelfEntries(ctx.doc);

    unresolved.forEach(function (name) {
      const cached = inventoryUrlCache.get(name);
      if (cached) {
        result.set(name, cached);
      }
    });
    unresolved = unresolved.filter(function (name) {
      return !result.get(name);
    });

    if (!unresolved.length) {
      return {
        urls: result,
        unresolved: []
      };
    }

    const prefixOrder = uniq(unresolved.map(getShelfPrefix).filter(Boolean));

    for (let i = 0; i < prefixOrder.length; i += 1) {
      throwIfAborted(signal);
      const prefix = prefixOrder[i];
      const button = findGroupButton(ctx.doc, prefix);
      if (!button) continue;
      if (onProgress) {
        onProgress({
          stage: 'group',
          label: 'Scanning ' + prefix,
          index: i + 1,
          total: prefixOrder.length
        });
      }
      await safeTriggerHarvestButton(button, { signal: signal });
      ctx = await ensureGridFrame({
        force: !isGridFrameLoaded(gridFrame, GRID_URL),
        timeoutMs: cfg.timeoutMs
      });
      harvestVisibleShelfEntries(ctx.doc);
      unresolved.forEach(function (name) {
        const cached = inventoryUrlCache.get(name);
        if (cached) {
          result.set(name, cached);
        }
      });
      unresolved = unresolved.filter(function (name) {
        return !result.get(name);
      });
      if (!unresolved.length) {
        break;
      }
    }

    if (unresolved.length) {
      const buttons = getHarvestGroupButtons(ctx.doc);
      for (let i = 0; i < buttons.length; i += 1) {
        throwIfAborted(signal);
        const button = buttons[i];
        const label = upper(button.textContent || '');
        if (onProgress) {
          onProgress({
            stage: 'fallback',
            label: 'Scanning ' + label,
            index: i + 1,
            total: buttons.length
          });
        }
        await safeTriggerHarvestButton(button, { signal: signal });
        ctx = await ensureGridFrame({
          force: !isGridFrameLoaded(gridFrame, GRID_URL),
          timeoutMs: cfg.timeoutMs
        });
        harvestVisibleShelfEntries(ctx.doc);
        unresolved.forEach(function (name) {
          const cached = inventoryUrlCache.get(name);
          if (cached) {
            result.set(name, cached);
          }
        });
        unresolved = unresolved.filter(function (name) {
          return !result.get(name);
        });
        if (!unresolved.length) {
          break;
        }
      }
    }

    return {
      urls: result,
      unresolved: unresolved.slice()
    };
  }

  // ============================================================
  // Inventory Page Parsing
  // ============================================================

  function parseInventoryHTML(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');

    const root = doc.querySelector('#inventoryItems.index-table-v3');
    if (root) {
      const rows = [];
      const list = Array.from(root.querySelectorAll('.index-row.present'));
      for (let i = 0; i < list.length; i += 1) {
        const row = list[i];
        const skuEl = row.querySelector('.index-cell.sku .text');
        const listingEl = row.querySelector('.index-cell.listing-id .text');
        const titleEl = row.querySelector('.index-cell.title .text');
        const listingRaw = norm(listingEl && listingEl.textContent || '');
        const match = listingRaw.match(/\d+/);
        const listing = match ? match[0] : '';
        if (!listing || listing.length < 6) continue;
        rows.push({
          listing: listing,
          sku: norm(skuEl && skuEl.textContent || ''),
          title: norm(titleEl && (titleEl.getAttribute('title') || titleEl.textContent) || '')
        });
      }
      return rows;
    }

    const tables = Array.from(doc.querySelectorAll('table'));
    for (let i = 0; i < tables.length; i += 1) {
      const table = tables[i];
      const headers = Array.from(table.querySelectorAll('thead th,tr th')).map(function (th) {
        return norm(th.textContent).toLowerCase();
      });
      const skuIndex = headers.findIndex(function (h) { return /^sku\b/.test(h); });
      const listingIndex = headers.findIndex(function (h) { return /^listing\b/.test(h); });
      const titleIndex = headers.findIndex(function (h) { return /^title\b/.test(h); });
      if (skuIndex === -1 || listingIndex === -1 || titleIndex === -1) continue;

      const rows = [];
      qsa('tbody tr', table).forEach(function (tr) {
        const tds = qsa('td', tr);
        const listingRaw = norm(tds[listingIndex] && tds[listingIndex].textContent || '');
        const match = listingRaw.match(/\d+/);
        const listing = match ? match[0] : '';
        if (!listing || listing.length < 6) return;
        rows.push({
          listing: listing,
          sku: norm(tds[skuIndex] && tds[skuIndex].textContent || ''),
          title: norm(tds[titleIndex] && tds[titleIndex].textContent || '')
        });
      });
      if (rows.length) return rows;
    }

    return [];
  }

  function buildPagedUrl(baseUrl, page, pageSize) {
    const url = new URL(String(baseUrl || ''), window.location.origin);
    if (pageSize) {
      url.searchParams.set('per_page', String(pageSize));
    }
    if (page && page > 1) {
      url.searchParams.set('page', String(page));
    } else {
      url.searchParams.delete('page');
    }
    return url.toString();
  }

  async function fetchShelfPageText(baseUrl, page, pageSize, options) {
    const cfg = options || {};
    throwIfAborted(cfg.signal);
    const url = buildPagedUrl(baseUrl, page, pageSize);
    const res = await fetch(url, {
      credentials: 'same-origin',
      signal: cfg.signal || undefined
    });
    if (!res.ok) {
      throw new Error('Shelf fetch failed HTTP ' + res.status + ' for ' + url);
    }
    return res.text();
  }

  async function loadShelfRowsByUrl(baseUrl, options) {
    const cfg = options || {};
    const pageSize = Math.max(1, Number(cfg.pageSize || DEFAULT_PAGE_SIZE));
    const maxPages = Math.max(1, Number(cfg.maxPages || 50));
    const onProgress = typeof cfg.onProgress === 'function' ? cfg.onProgress : null;
    const all = [];
    const seen = new Set();

    for (let page = 1; page <= maxPages; page += 1) {
      throwIfAborted(cfg.signal);
      const html = await fetchShelfPageText(baseUrl, page, pageSize, cfg);
      const rows = parseInventoryHTML(html);
      rows.forEach(function (row) {
        if (!row || !row.listing) return;
        if (seen.has(row.listing)) return;
        seen.add(row.listing);
        all.push(row);
      });
      if (onProgress) {
        onProgress({
          page: page,
          pageSize: pageSize,
          pageCount: rows.length,
          totalCount: all.length
        });
      }
      if (rows.length < pageSize) {
        break;
      }
      await sleep(20);
    }

    return all;
  }

  // ============================================================
  // Sticker DOCX Export
  // ============================================================

  const STICKER_TEMPLATE_DOCX_BASE64 = [
        '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',
        'HagQgQ7U456BCu1xgQrtXQIVUlwCFVLQgQoR6ECFCHSgQgQ6UCECHagQgQpUYO4UqJCCDlSIQAcqRLT5Z3mK0naZ/Qh/1NN6xT7iPp+iUT/qt3JvHUPtjqpa',
        'ZWd1vxfhs5RPXuONh4eH3SFiHgppDlFbTqvXuSfoE5/fp+13+HR4jEfXrpT3QphzpgA+6WoJjqlM2ly+bgmKvEmbp9ctwapz0pZ965ZgGpy0JV0Tl9VFKXo6',
        'AsZtaaZmPLKYt2Xrmjkc4rYcXTOEI9yWmWuGcIDb8nHN8MjLk/Ou9VHHcTpeX18KCG3uWCOc2Altbgm1sh7b7yyandBVPTuhq4x2AkpPKwYvrB2FVtiOcpMa',
        'hhlWavdAtROwUkOCk9QA4y41RDlLDVFuUsPEiJUaErBSuydnO8FJaoBxlxqinKWGKDep4VSGlRoSsFJDAlbqnhOyFeMuNUQ5Sw1RblLDxR1WakjASg0JWKkh',
        'wUlqgHGXGqKcpYYoN6lBlYyWGhKwUkMCVmpIcJIaYNylhihnqSGqTWpzFMW9WqqZ4xZhNUPchFwzxCXnmqFDtVSzdqyWagTHaglq5VYt1UVzq5bq6rlVS3UZ',
        '3aoloKdbtdQorFu11KiwW7VklxpXLTVJ7R6obtVSk9S4askqNa5aapUaVy21So2rluxS46qlJqlx1VKT1O7J2a1askqNq5ZapcZVS61S46olu9S4aqlJaly1',
        '1CQ1rlpqkrrnhOxWLbVKjauWWqXGVUt2qXHVUpPUuGqpSWpctdQkNa5askqNq5ZapcZVS61S46olu9S4aqlJaly11CQ1rlpqkhpXLVmlxlVLrVLjqqVWqXHV',
        '0jdtIggeATWLWJJ6dM+Lu2ZqmbL+Dyf8GSdcyfCZBx5tV29RvRy+bL3+Kmebl/rp36d6zPInoNduVwqKJ8CWQPPDm2D9mqrcOG+JV766q9xsGlyerjV/Jyp/',
        'TVnxm4OD0XhydVmeFl0V7x1T2WqVP+PsMkulVk63WBVNLb+3vJ7sQURceXf8xfshI2bGc/PSsIYvy3eTNXyTv5psd7NpoPqravh4Um2Zqt1tO+8v+znbbspf',
        'yw/Tu3LwqxeWmbGEo+8v9fD75eO8LKNfPpZ3fV+ZeSjvrhaWZ/ea5m5isvp16WUbFyp+t+VAw7Z2p3kOaGmzyRGtblM+KszSwLOzbi3U7ZmHhbfoP27i3O9e',
        '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',
    ].join('');
  const WORD_XML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  function base64ToUint8Array(base64) {
    const binary = window.atob(String(base64 || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function downloadBlobFile(filename, blob) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = String(filename || 'download');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () {
      window.URL.revokeObjectURL(url);
    }, 1500);
  }

  async function loadStickerTemplateArrayBuffer(options) {
    const cfg = options || {};
    let lastErr = null;
    if (cfg.templateUrl) {
      try {
        const resp = await fetch(cfg.templateUrl, { credentials: 'omit' });
        if (!resp.ok) throw new Error('Sticker template fetch failed HTTP ' + resp.status);
        return await resp.arrayBuffer();
      } catch (err) {
        lastErr = err;
      }
    }
    if (cfg.templateBase64 || STICKER_TEMPLATE_DOCX_BASE64) {
      const bytes = base64ToUint8Array(cfg.templateBase64 || STICKER_TEMPLATE_DOCX_BASE64);
      return bytes.buffer.slice(0);
    }
    throw lastErr || new Error('Sticker DOCX template is not configured');
  }

  function getXmlDirectChildrenByLocalName(node, localName) {
    return Array.from(node && node.childNodes ? node.childNodes : []).filter(function (child) {
      return child && child.nodeType === 1 && child.localName === localName;
    });
  }

  function getXmlFirstDirectChildByLocalName(node, localName) {
    const list = getXmlDirectChildrenByLocalName(node, localName);
    return list.length ? list[0] : null;
  }

  function createWordElement(xmlDoc, localName) {
    return xmlDoc.createElementNS(WORD_XML_NS, 'w:' + localName);
  }

  function clearXmlDirectChildrenByLocalName(node, localName) {
    getXmlDirectChildrenByLocalName(node, localName).forEach(function (child) {
      node.removeChild(child);
    });
  }

  function cloneWordParagraphStructure(templateParagraph) {
    const p = templateParagraph.cloneNode(true);
    Array.from(p.childNodes || []).forEach(function (child) {
      if (child && child.nodeType === 1 && child.localName !== 'pPr') {
        p.removeChild(child);
      }
    });
    return p;
  }

  function cloneWordRunStructure(xmlDoc, templateParagraph) {
    const templateRun = Array.from(templateParagraph.childNodes || []).find(function (child) {
      return child && child.nodeType === 1 && child.localName === 'r';
    });
    if (templateRun) {
      const r = templateRun.cloneNode(true);
      Array.from(r.childNodes || []).forEach(function (child) {
        if (child && child.nodeType === 1 && child.localName !== 'rPr') {
          r.removeChild(child);
        }
      });
      return r;
    }
    const r = createWordElement(xmlDoc, 'r');
    const pPr = getXmlFirstDirectChildByLocalName(templateParagraph, 'pPr');
    const pPrRunProps = pPr ? getXmlFirstDirectChildByLocalName(pPr, 'rPr') : null;
    if (pPrRunProps) {
      r.appendChild(pPrRunProps.cloneNode(true));
    }
    return r;
  }

  function buildStickerParagraphFromTemplate(xmlDoc, templateParagraph, text) {
    const p = cloneWordParagraphStructure(templateParagraph);
    const value = String(text == null ? '' : text);
    if (!value) {
      return p;
    }
    const r = cloneWordRunStructure(xmlDoc, templateParagraph);
    const t = createWordElement(xmlDoc, 't');
    if (/^\s|\s$|\s\s/.test(value)) {
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    }
    t.textContent = value;
    r.appendChild(t);
    p.appendChild(r);
    return p;
  }

  function buildBlankStickerParagraph(templateParagraph) {
    return cloneWordParagraphStructure(templateParagraph);
  }

  function splitStickerSkuParts(newSku) {
    const value = norm(newSku || '');
    if (!value) {
      return {
        prefixLine: '',
        positionLine: ''
      };
    }
    const splitAt = value.lastIndexOf('-');
    if (splitAt <= 0 || splitAt === value.length - 1) {
      return {
        prefixLine: value,
        positionLine: ''
      };
    }
    return {
      prefixLine: value.slice(0, splitAt + 1),
      positionLine: value.slice(splitAt + 1)
    };
  }

  function buildStickerCellLines(entry, templateParagraphCount, layoutMode) {
    if (!entry) return [];
    const oldSku = norm(entry.oldSku || '');
    const newSku = norm(entry.newSku || '');
    const oldLine = oldSku ? oldSku + ' →' : '→';
    const split = splitStickerSkuParts(newSku);
    if (layoutMode === 'old_blank_prefix_position' && templateParagraphCount >= 4) {
      return [oldLine, '', split.prefixLine, split.positionLine];
    }
    if (templateParagraphCount >= 3) {
      return [oldLine, split.prefixLine, split.positionLine || newSku];
    }
    return [oldLine, newSku];
  }

  function fillStickerCellXml(xmlDoc, tc, entry, templateParagraphs, blankParagraphTemplate, layoutMode) {
    clearXmlDirectChildrenByLocalName(tc, 'p');
    if (!entry) {
      tc.appendChild(buildBlankStickerParagraph(blankParagraphTemplate || templateParagraphs[0]));
      return;
    }
    const lines = buildStickerCellLines(entry, templateParagraphs.length, layoutMode);
    for (let i = 0; i < templateParagraphs.length; i += 1) {
      const value = i < lines.length ? lines[i] : '';
      tc.appendChild(buildStickerParagraphFromTemplate(xmlDoc, templateParagraphs[i], value));
    }
  }

  function buildStickerPageBreakParagraph(xmlDoc) {
    const p = createWordElement(xmlDoc, 'p');
    const r = createWordElement(xmlDoc, 'r');
    const br = createWordElement(xmlDoc, 'br');
    br.setAttributeNS(WORD_XML_NS, 'w:type', 'page');
    r.appendChild(br);
    p.appendChild(r);
    return p;
  }

  function buildStickerDocumentXml(documentXmlText, entries, options) {
    const cfg = options || {};
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(String(documentXmlText || ''), 'application/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length) {
      throw new Error('Unable to parse sticker DOCX XML');
    }
    const body = xmlDoc.getElementsByTagNameNS(WORD_XML_NS, 'body')[0];
    if (!body) throw new Error('Sticker DOCX body not found');
    const baseTable = getXmlFirstDirectChildByLocalName(body, 'tbl');
    const sectPr = getXmlFirstDirectChildByLocalName(body, 'sectPr');
    if (!baseTable || !sectPr) throw new Error('Sticker DOCX template is missing required nodes');
    const baseRows = getXmlDirectChildrenByLocalName(baseTable, 'tr');
    const baseCells = [];
    for (let i = 0; i < baseRows.length; i += 1) {
      Array.prototype.push.apply(baseCells, getXmlDirectChildrenByLocalName(baseRows[i], 'tc'));
    }
    if (!baseCells.length) throw new Error('Sticker DOCX template has no table cells');
    const firstTemplateCell = baseCells[0];
    const templateParagraphs = getXmlDirectChildrenByLocalName(firstTemplateCell, 'p');
    if (!templateParagraphs.length) throw new Error('Sticker DOCX template has no first-cell paragraph template');
    let blankParagraphTemplate = null;
    for (let i = 1; i < baseCells.length; i += 1) {
      const candidateParagraphs = getXmlDirectChildrenByLocalName(baseCells[i], 'p');
      if (!candidateParagraphs.length) continue;
      const candidateText = candidateParagraphs.map(function (p) {
        return norm(p.textContent || '');
      }).join('');
      if (!candidateText) {
        blankParagraphTemplate = candidateParagraphs[0];
        break;
      }
    }
    if (!blankParagraphTemplate) {
      blankParagraphTemplate = templateParagraphs[0];
    }
    const totalEntries = Array.isArray(entries) ? entries.length : 0;
    const perPage = baseCells.length || Number(cfg.perPage || 50);
    const totalPages = Math.max(1, Math.ceil(totalEntries / perPage));
    while (body.firstChild) {
      body.removeChild(body.firstChild);
    }
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      const pageTable = baseTable.cloneNode(true);
      const pageRows = getXmlDirectChildrenByLocalName(pageTable, 'tr');
      const pageCells = [];
      for (let i = 0; i < pageRows.length; i += 1) {
        Array.prototype.push.apply(pageCells, getXmlDirectChildrenByLocalName(pageRows[i], 'tc'));
      }
      const pageEntries = entries.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
      for (let cellIndex = 0; cellIndex < pageCells.length; cellIndex += 1) {
        fillStickerCellXml(xmlDoc, pageCells[cellIndex], pageEntries[cellIndex] || null, templateParagraphs, blankParagraphTemplate, cfg.layoutMode || 'old_blank_prefix_position');
      }
      body.appendChild(pageTable);
      if (pageIndex < totalPages - 1) {
        body.appendChild(buildStickerPageBreakParagraph(xmlDoc));
      }
    }
    body.appendChild(sectPr);
    const serialized = new XMLSerializer().serializeToString(xmlDoc);
    if (/^<\?xml/i.test(serialized)) {
      return serialized;
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + serialized;
  }

  function parseSkuSortParts(value) {
    const raw = upper(value || '');
    const match = raw.match(/^(.*?)-(\d+)$/);
    return {
      label: match ? match[1] : raw,
      position: match ? parseInt(match[2], 10) : Number.MAX_SAFE_INTEGER,
      raw: raw
    };
  }

  function compareEntriesForExport(a, b) {
    const aSku = parseSkuSortParts(a && a.oldSku || '');
    const bSku = parseSkuSortParts(b && b.oldSku || '');
    const labelCmp = compareNatural(aSku.label, bSku.label);
    if (labelCmp) return labelCmp;
    if (aSku.position !== bSku.position) return aSku.position - bSku.position;
    const aTs = Number(a && a.ts || 0);
    const bTs = Number(b && b.ts || 0);
    if (aTs !== bTs) return aTs - bTs;
    return compareNatural(a && a.id || '', b && b.id || '');
  }

  async function exportStickerTemplateDocx(entries, options) {
    if (!window.JSZip || typeof window.JSZip.loadAsync !== 'function') {
      throw new Error('JSZip is not available');
    }
    const cfg = options || {};
    const list = Array.isArray(entries) ? entries.slice().sort(compareEntriesForExport) : [];
    if (!list.length) throw new Error('No sticker rows to export');

    const templateBuffer = await loadStickerTemplateArrayBuffer(cfg);
    const zip = await window.JSZip.loadAsync(templateBuffer);
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('word/document.xml was not found in the sticker template');
    const xmlText = await documentFile.async('string');
    const stickerEntries = list.map(function (entry) {
      return {
        oldSku: norm(entry && entry.oldSku || ''),
        newSku: norm(entry && entry.newSku || '')
      };
    });
    const updatedXml = buildStickerDocumentXml(xmlText, stickerEntries, cfg);
    zip.file('word/document.xml', updatedXml);

    const labelCount = stickerEntries.length;
    const perPage = Number(cfg.perPage || 50);
    const sheetCount = Math.max(1, Math.ceil(labelCount / perPage));
    const target = String(cfg.target || 'batch')
      .trim()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'batch';
    const prefix = cfg.filenamePrefix || 'resku-sticker-template';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
    const filename = prefix + '-' + target + '-' + labelCount + '-labels-' + sheetCount + '-sheet' + (sheetCount === 1 ? '' : 's') + '-' + stamp + '.docx';
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    downloadBlobFile(filename, blob);
    return {
      filename: filename,
      labelCount: labelCount,
      sheetCount: sheetCount
    };
  }

  // ============================================================
  // Export
  // ============================================================

  KOTN.reskuMobileUtils = {
    version: '0.1.0',
    harvestVisibleShelfEntries,
    resolveInventoryUrlsForShelves,
    parseInventoryHTML,
    loadShelfRowsByUrl,
    exportStickerTemplateDocx,
    caches: {
      inventoryUrlCache
    }
  };
})();
