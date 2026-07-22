const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const header = fs.readFileSync(path.join(__dirname, 'src/header.js'), 'utf8');

esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'dist/autoMaxPPHPL_DEV.user.js',
  format: 'iife',
  platform: 'browser',
  banner: {
    js: header
  }
}).then(() => {
  console.log('Build completed: dist/autoMaxPPHPL_DEV.user.js');
}).catch(() => process.exit(1));
