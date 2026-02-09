const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverDir = path.join(root, '.next-dev', 'server');
const middlewareManifestPath = path.join(serverDir, 'middleware-manifest.json');

const defaultManifest = {
  version: 3,
  middleware: {},
  functions: {},
  sortedMiddleware: [],
};

try {
  fs.mkdirSync(serverDir, { recursive: true });
  if (!fs.existsSync(middlewareManifestPath)) {
    fs.writeFileSync(
      middlewareManifestPath,
      JSON.stringify(defaultManifest, null, 2),
      'utf8'
    );
    console.log('[predev] created .next-dev/server/middleware-manifest.json');
  }
} catch (error) {
  console.warn('[predev] warning:', error?.message || error);
}
