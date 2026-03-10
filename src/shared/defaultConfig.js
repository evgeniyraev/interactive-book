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
    appBackgroundColor: '#101319',
    backgroundImage: '',
    displacementMap: '',
    pageOffsetX: 0,
    edgeZoneWidth: 92,
    innerPagePadding: 24,
    innerPagePaddingY: 24,
    sideViewTexture: '',
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
