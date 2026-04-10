// KOTN Listing Bible
// v0.3.0

(function () {
  'use strict';

  const KOTN = (window.KOTN = window.KOTN || {});

  // ============================================================
  // Config
  // ============================================================

  const rules = [
    {
      id: 'title-min-length',
      field: 'title',
      type: 'minLength',
      value: 20,
      severity: 'warning',
      message: 'Title is very short; consider adding more detail.'
    },
    {
      id: 'title-max-length',
      field: 'title',
      type: 'maxLength',
      value: 160,
      severity: 'warning',
      message: 'Title is very long; consider trimming.'
    },
    {
      id: 'title-double-space',
      field: 'title',
      type: 'regexFound',
      pattern: '\\s{2,}',
      severity: 'warning',
      message: 'Title contains repeated spaces.'
    },
    {
      id: 'notes-required-for-issue-condition',
      field: 'notes',
      type: 'missing',
      severity: 'error',
      where: {
        itemConditionContains: ['issue', 'used', 'damaged', 'defect']
      },
      message: 'Lister notes are required when item condition indicates an issue.'
    },
    {
      id: 'adult-apparel-size-missing',
      field: 'title',
      type: 'regexNotFound',
      pattern: '(\\bXS\\b|\\bS\\b|\\bM\\b|\\bL\\b|\\bXL\\b|\\bXXL\\b|\\b\\d{2}[WS]\\b)',
      severity: 'error',
      where: {
        categoryEquals: ['Adult apparel & shoes']
      },
      message: 'Adult apparel titles must include a size near the end of the title.',
      exceptions: []
    }
  ];

  // ============================================================
  // Helpers
  // ============================================================

  function norm(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function lower(value) {
    return norm(value).toLowerCase();
  }

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  function getField(record, field) {
    if (!record || !field) return '';
    if (field.indexOf('.') === -1) {
      return record[field];
    }
    return field.split('.').reduce((acc, key) => {
      if (acc == null) return undefined;
      return acc[key];
    }, record);
  }

  function containsAny(value, list) {
    const key = lower(value);
    return asList(list).some(item => key.includes(lower(item)));
  }

  function equalsAny(value, list) {
    const key = lower(value);
    return asList(list).some(item => key === lower(item));
  }

  function buildContext(record) {
    return {
      title: getField(record, 'title'),
      notes: getField(record, 'notes') || getField(record, 'editorNotes') || getField(record, 'staffNotes'),
      itemCondition: getField(record, 'itemConditionLabel') || getField(record, 'item_condition') || getField(record, 'itemCondition'),
      packageCondition: getField(record, 'packageConditionLabel') || getField(record, 'package_condition') || getField(record, 'packageCondition'),
      category: getField(record, 'primaryCategory') || getField(record, 'category') || getField(record, 'categoryName')
    };
  }

  function matchesWhere(record, where) {
    if (!where || typeof where !== 'object') return true;
    const ctx = buildContext(record);

    if (where.itemConditionContains && !containsAny(ctx.itemCondition, where.itemConditionContains)) {
      return false;
    }
    if (where.packageConditionContains && !containsAny(ctx.packageCondition, where.packageConditionContains)) {
      return false;
    }
    if (where.categoryEquals && !equalsAny(ctx.category, where.categoryEquals)) {
      return false;
    }
    if (where.titleContains && !containsAny(ctx.title, where.titleContains)) {
      return false;
    }
    if (where.notesContains && !containsAny(ctx.notes, where.notesContains)) {
      return false;
    }

    return true;
  }

  function toRegex(pattern, flags) {
    if (!pattern) return null;
    if (pattern instanceof RegExp) return pattern;
    try {
      return new RegExp(String(pattern), flags || 'i');
    } catch (err) {
      return null;
    }
  }

  function hasValue(value) {
    return norm(value) !== '';
  }

  function testRule(rule, record) {
    if (!matchesWhere(record, rule.where)) {
      return null;
    }

    const value = getField(record, rule.field);
    const text = norm(value);

    if (rule.type === 'minLength') {
      if (text.length < Number(rule.value || 0)) {
        return true;
      }
      return null;
    }

    if (rule.type === 'maxLength') {
      if (text.length > Number(rule.value || 0)) {
        return true;
      }
      return null;
    }

    if (rule.type === 'missing') {
      return hasValue(value) ? null : true;
    }

    if (rule.type === 'regexNotFound') {
      const re = toRegex(rule.pattern);
      if (!re) return null;
      return re.test(text) ? null : true;
    }

    if (rule.type === 'regexFound') {
      const re = toRegex(rule.pattern);
      if (!re) return null;
      return re.test(text) ? true : null;
    }

    if (rule.type === 'containsAny') {
      return containsAny(text, rule.values) ? null : true;
    }

    if (rule.type === 'equalsAny') {
      return equalsAny(text, rule.values) ? null : true;
    }

    return null;
  }

  function evaluate(record) {
    return rules
      .map(rule => {
        const hit = testRule(rule, record);
        if (!hit) return null;
        return {
          id: rule.id,
          field: rule.field,
          severity: rule.severity || 'warning',
          message: rule.message || rule.id
        };
      })
      .filter(Boolean);
  }

  // ============================================================
  // Export
  // ============================================================

  KOTN.listingBible = {
    version: '0.3.0',
    rules,
    evaluate,
    helpers: {
      normalize: norm,
      matchesWhere,
      testRule
    }
  };
})();
