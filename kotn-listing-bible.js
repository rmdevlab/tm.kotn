// KOTN Listing Bible
// v0.2.0

(function () {
  'use strict';

  const KOTN = (window.KOTN = window.KOTN || {});

  // ============================================================
  // Listing Bible Rules
  // ============================================================

  const listingBible = {
    version: '0.2.0',
    rules: [
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
    ]
  };

  KOTN.listingBible = listingBible;
})();
