const { randomUUID } = require('node:crypto');

function createDefaultPage(text = 'Welcome to your interactive book.') {
  return {
    id: randomUUID(),
    type: 'text',
    text,
    imagePath: ''
  };
}

function createDefaultSpecialPage(text) {
  return {
    id: randomUUID(),
    type: 'text',
    text,
    imagePath: ''
  };
}

const defaultConfig = {
  mode: {
    settingsHoldSeconds: 10
  },
  design: {
    backgroundImage: '',
    displacementMap: '',
    pageOffsetX: 0,
    edgeZoneWidth: 92,
    firstLastPageScale: 1.14,
    innerPagePadding: 24,
    sideViewTexture: '',
    sideViewMaxWidth: 68,
    turnAnimationMs: 700,
    page: {
      background: '#ffffff',
      width: 900,
      height: 1200
    }
  },
  content: {
    frontCover: createDefaultSpecialPage('Book Title'),
    innerFront: createDefaultSpecialPage(''),
    innerBack: createDefaultSpecialPage(''),
    backCover: createDefaultSpecialPage(''),
    pages: [createDefaultPage()]
  },
  autoupdate: {
    policy: 'everything',
    detectExternalContent: false,
    autoCheckOnLaunch: true,
    lastImportedHash: ''
  }
};

module.exports = {
  defaultConfig,
  createDefaultPage
};
