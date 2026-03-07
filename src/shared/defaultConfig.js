const { randomUUID } = require('node:crypto');

function createDefaultPage(text = 'Welcome to your interactive book.') {
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
    turnAnimationMs: 700,
    page: {
      background: '#ffffff',
      width: 900,
      height: 1200
    }
  },
  content: {
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
