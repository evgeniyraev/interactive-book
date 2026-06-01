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

function htmlToPlainText(html = '') {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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

function createPdfSource(options = {}) {
  return {
    assetPath: String(options.assetPath || ''),
    fileName: String(options.fileName || ''),
    importedAt: String(options.importedAt || ''),
    pageCount: Number(options.pageCount || 0)
  };
}

function normalizePdfSource(rawSource) {
  if (!rawSource?.assetPath) {
    return createPdfSource();
  }

  return createPdfSource(rawSource);
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
    backCover: normalizePage(backSource, ''),
    pdfSource: normalizePdfSource(content.pdfSource)
  };
}

function deriveBookTitle(content = {}, index = 0) {
  const frontCover = content.frontCover || {};
  const title = String(frontCover.title || '').trim();
  if (title) {
    return title;
  }

  const pdfFileName = String(content.pdfSource?.fileName || '').replace(/\.pdf$/i, '').trim();
  if (pdfFileName) {
    return pdfFileName;
  }

  const text = htmlToPlainText(frontCover.html || '').slice(0, 80).trim();
  if (text) {
    return text;
  }

  return `Book ${index + 1}`;
}

function createBook(options = {}) {
  const content = normalizeContent(options.content || {});
  const title = String(options.title || deriveBookTitle(content, 0)).trim();
  const sideViewColor = Object.prototype.hasOwnProperty.call(options, 'sideViewColor')
    ? String(options.sideViewColor || '')
    : '#c8b79b';
  const sideViewOpacity = Object.prototype.hasOwnProperty.call(options, 'sideViewOpacity')
    ? String(options.sideViewOpacity ?? '')
    : '1';

  return {
    id: options.id || createId(),
    title: title || 'Book 1',
    description: String(options.description || ''),
    sideViewColor,
    sideViewOpacity,
    content
  };
}

function normalizeBook(rawBook = {}, index = 0) {
  const source = rawBook && typeof rawBook === 'object' ? rawBook : {};
  const content = normalizeContent(source.content || source);
  const title = String(source.title || deriveBookTitle(content, index)).trim();
  const sideViewColor = Object.prototype.hasOwnProperty.call(source, 'sideViewColor')
    ? String(source.sideViewColor || '')
    : '#c8b79b';
  const sideViewOpacity = Object.prototype.hasOwnProperty.call(source, 'sideViewOpacity')
    ? String(source.sideViewOpacity ?? '')
    : '1';

  return {
    id: String(source.id || createId()),
    title: title || `Book ${index + 1}`,
    description: String(source.description || ''),
    sideViewColor,
    sideViewOpacity,
    content
  };
}

function normalizeBooks(rawBooks, legacyContent = {}) {
  const sourceBooks = Array.isArray(rawBooks) && rawBooks.length > 0
    ? rawBooks
    : [
        {
          title: '',
          description: '',
          content: legacyContent
        }
      ];

  return sourceBooks.map((book, index) => normalizeBook(book, index));
}

module.exports = {
  createDocumentPage,
  createImagePage,
  createPdfSource,
  createBook,
  createId,
  normalizePage,
  normalizePdfSource,
  normalizeContent,
  normalizeBook,
  normalizeBooks,
  hasPageData,
  textToRichHtml,
  htmlToPlainText
};
