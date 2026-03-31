const fs = require('node:fs/promises');
const path = require('node:path');

function readConfig() {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const username = process.env.INTERACTIVE_BOOK_SUPERADMIN_USERNAME || (isDevelopment ? 'admin' : '');
  const password = process.env.INTERACTIVE_BOOK_SUPERADMIN_PASSWORD || (isDevelopment ? 'admin' : '');
  const displayName = process.env.INTERACTIVE_BOOK_SUPERADMIN_DISPLAY_NAME || 'Superadmin';
  const salt = process.env.INTERACTIVE_BOOK_SUPERADMIN_SALT || 'interactive-book-superadmin';

  return {
    superadminUsername: username,
    superadminPassword: password,
    superadminDisplayName: displayName,
    superadminSalt: salt
  };
}

async function main() {
  const filePath = path.join(__dirname, '..', 'src', 'shared', 'buildEnv.js');
  const contents = `const buildEnv = ${JSON.stringify(readConfig(), null, 2)};\n\nmodule.exports = {\n  buildEnv\n};\n`;
  await fs.writeFile(filePath, contents, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
