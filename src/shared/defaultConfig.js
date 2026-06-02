const { createBook, createDocumentPage, createPdfSource } = require('./contentModel');

const defaultContent = {
  frontCover: createDocumentPage({ text: 'Book Title' }),
  innerFront: createDocumentPage({ text: '' }),
  innerBack: createDocumentPage({ text: '' }),
  backCover: createDocumentPage({ text: '' }),
  pages: [createDocumentPage()],
  pdfSource: createPdfSource()
};

const defaultBook = createBook({
  title: 'Book Title',
  content: defaultContent
});

const defaultConfig = {
  mode: {
    settingsHoldSeconds: 10
  },
  design: {
    appBackgroundColor: '#101319',
    backgroundImage: '',
    displacementMap: '',
    pageOffsetX: 0,
    edgeZoneWidth: 92,
    innerPagePadding: 24,
    innerPagePaddingY: 24,
    sideViewMaxWidth: 68,
    sideViewColor: '#c8b79b',
    sideViewOpacity: 1,
    turnAnimationMs: 700,
    idleRandomFlipEnabled: false,
    idleRandomFlipDelaySec: 45,
    idleRandomFlipIntervalSec: 8,
    page: {
      background: '#ffffff',
      backgroundOpacity: 1,
      width: 900,
      height: 1200
    }
  },
  content: defaultBook.content,
  books: [defaultBook],
  activeBookId: defaultBook.id,
  autoupdate: {
    policy: 'everything',
    detectExternalContent: false,
    autoCheckOnLaunch: true,
    lastImportedHash: ''
  },
  adminServer: {
    enabled: false,
    port: 47831
  }
};

module.exports = {
  defaultConfig
};
