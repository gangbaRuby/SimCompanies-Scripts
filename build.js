const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const header = fs.readFileSync(path.join(__dirname, 'src/header.js'), 'utf8');
const args = process.argv.slice(2);
const release = args.includes('--release');
const outfileIndex = args.indexOf('--outfile');

if (outfileIndex !== -1 && !args[outfileIndex + 1]) {
  console.error('Missing value for --outfile.');
  process.exit(1);
}

const outfile = outfileIndex === -1
  ? (release ? 'autoMaxPPHPL.user.js' : 'dist/autoMaxPPHPL_DEV.user.js')
  : args[outfileIndex + 1];

const buildHeader = release
  ? header.replace(/^(\/\/\s*@name\s+.*)\s+\(DEV\)\s*$/m, '$1')
  : header;

esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile,
  format: 'iife',
  platform: 'browser',
  banner: {
    js: buildHeader
  }
}).then(() => {
  console.log(`Build completed: ${outfile}`);
}).catch(() => process.exit(1));
