const { randomUUID } = require('node:crypto');

function createId() {
  return randomUUID();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function textToRichHtml(text = '') {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '<p></p>';
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function createDocumentPage(options = {}) {
  const html =
    typeof options.html === 'string' && options.html.trim()
      ? options.html
      : textToRichHtml(options.text || 'Welcome to your interactive book.');

  return {
    id: options.id || createId(),
    type: 'document',
    title: String(options.title || ''),
    html,
    imagePath: ''
  };
}

function createImagePage(options = {}) {
  return {
    id: options.id || createId(),
    type: 'image',
    title: String(options.title || ''),
    html: '',
    imagePath: String(options.imagePath || '')
  };
}

function hasLegacyText(rawPage) {
  return Boolean(rawPage?.text || rawPage?.title);
}

function normalizePage(rawPage, fallbackText = '') {
  if (rawPage?.type === 'image') {
    return createImagePage(rawPage);
  }

  if (rawPage?.type === 'document') {
    return createDocumentPage({
      ...rawPage,
      text: rawPage.html ? '' : fallbackText
    });
  }

  if (hasLegacyText(rawPage)) {
    return createDocumentPage({
      ...rawPage,
      html: rawPage?.html || '',
      text: rawPage?.text || rawPage?.title || fallbackText
    });
  }

  return createDocumentPage({
    ...rawPage,
    text: fallbackText
  });
}

function hasPageData(rawPage) {
  return Boolean(
    rawPage && (rawPage.imagePath || rawPage.html || rawPage.text || rawPage.title)
  );
}

function normalizeContent(content = {}) {
  const legacyCovers = content.covers || {};
  const frontSource = hasPageData(content.frontCover) ? content.frontCover : legacyCovers.front;
  const backSource = hasPageData(content.backCover) ? content.backCover : legacyCovers.back;

  return {
    pages: Array.isArray(content.pages) && content.pages.length > 0
      ? content.pages.map((page) => normalizePage(page))
      : [createDocumentPage({ text: 'Welcome to your interactive book.' })],
    frontCover: normalizePage(frontSource, 'Book Title'),
    innerFront: normalizePage(content.innerFront, ''),
    innerBack: normalizePage(content.innerBack, ''),
    backCover: normalizePage(backSource, '')
  };
}

module.exports = {
  createDocumentPage,
  createImagePage,
  createId,
  normalizePage,
  normalizeContent,
  hasPageData,
  textToRichHtml
};
