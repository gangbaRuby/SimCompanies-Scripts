const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const versionFlag = args.findIndex(arg => arg === '--version' || arg.startsWith('--version='));
let requestedVersion;

if (versionFlag !== -1) {
  requestedVersion = args[versionFlag].startsWith('--version=')
    ? args[versionFlag].slice('--version='.length)
    : args[versionFlag + 1];
  if (!requestedVersion || requestedVersion.startsWith('--')) fail('Missing value for --version.');
}

const changelog = args.filter((arg, index) => {
  if (arg === '--dry-run' || arg === '--version' || arg.startsWith('--version=')) return false;
  return index !== versionFlag + 1 || args[versionFlag] !== '--version';
}).join(' ').trim();

if (!changelog) fail('A changelog is required. Example: npm run release -- "Fix market price calculation"');
if (/\r|\n/.test(changelog)) fail('The changelog must be a single line.');

const headerPath = path.join(root, 'src', 'header.js');
const statePath = path.join(root, 'src', 'core', 'state.js');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const changelogPath = path.join(root, 'CHANGELOG.md');
const artifactPath = path.join(root, 'autoMaxPPHPL.user.js');
const header = fs.readFileSync(headerPath, 'utf8');
const currentVersionMatch = header.match(/@version\s+([0-9.]+)/);

if (!currentVersionMatch) fail('Could not find @version in src/header.js.');
const currentVersion = currentVersionMatch[1];
assertSupportedVersion(currentVersion, 'Current version');
const nextVersion = requestedVersion || incrementPatch(currentVersion);
assertSupportedVersion(nextVersion, 'Requested version');

const state = fs.readFileSync(statePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const changelogFile = fs.readFileSync(changelogPath, 'utf8');

if (dryRun) {
  console.log(`Dry run: ${currentVersion} -> ${nextVersion}`);
  console.log(`Changelog: ${changelog}`);
  console.log('No files were changed.');
  process.exit(0);
}

const originals = new Map([
  [headerPath, header],
  [statePath, state],
  [packagePath, fs.readFileSync(packagePath, 'utf8')],
  [lockPath, fs.readFileSync(lockPath, 'utf8')],
  [changelogPath, changelogFile]
]);

try {
  writeVersionFiles(nextVersion, header, state, packageJson, packageLock);
  const build = spawnSync(process.execPath, ['build.js', '--release'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('Release build failed.');

  const artifact = fs.readFileSync(artifactPath, 'utf8');
  if (/\(DEV\)/.test(artifact)) throw new Error('Release artifact still contains (DEV).');
  if (!new RegExp(`@version\\s+${escapeRegExp(nextVersion)}`).test(artifact)) {
    throw new Error('Release artifact version does not match the requested version.');
  }

  fs.appendFileSync(artifactPath, `\n// @changelog ${changelog}\n`, 'utf8');
  fs.writeFileSync(changelogPath, addChangelogEntry(changelogFile, nextVersion, changelog), 'utf8');
  console.log(`Release completed: autoMaxPPHPL.user.js (${nextVersion})`);
} catch (error) {
  for (const [filePath, content] of originals) fs.writeFileSync(filePath, content, 'utf8');
  console.error(error.message);
  process.exit(1);
}

function writeVersionFiles(version, headerText, stateText, packageData, lockData) {
  const updatedHeader = replaceOnce(headerText, /(@version\s+)([0-9.]+)/, `$1${version}`, 'src/header.js @version');
  const updatedState = replaceOnce(
    stateText,
    /(localVersion:\s*typeof GM_info !== 'undefined' \? GM_info\.script\.version : ')([0-9.]+)(')/,
    `$1${version}$3`,
    'src/core/state.js fallback version'
  );
  packageData.version = version;
  lockData.version = version;
  if (!lockData.packages || !lockData.packages['']) throw new Error('Could not find the root package entry in package-lock.json.');
  lockData.packages[''].version = version;

  fs.writeFileSync(headerPath, updatedHeader, 'utf8');
  fs.writeFileSync(statePath, updatedState, 'utf8');
  fs.writeFileSync(packagePath, `${JSON.stringify(packageData, null, 2)}\n`, 'utf8');
  fs.writeFileSync(lockPath, `${JSON.stringify(lockData, null, 2)}\n`, 'utf8');
}

function incrementPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function assertSupportedVersion(version, label) {
  if (!/^1\.\d+\.\d+$/.test(version)) fail(`${label} must use the 1.x.y format.`);
}

function replaceOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`Could not update ${label}.`);
  return text.replace(pattern, replacement);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addChangelogEntry(changelogText, version, changelog) {
  const marker = '## [未发布]';
  const markerIndex = changelogText.indexOf(marker);
  if (markerIndex === -1) throw new Error('Could not find the [未发布] section in CHANGELOG.md.');

  const nextSectionIndex = changelogText.indexOf('\n## ', markerIndex + marker.length);
  const insertionIndex = nextSectionIndex === -1 ? changelogText.length : nextSectionIndex;
  const date = new Date().toISOString().slice(0, 10);
  const entry = `\n\n## [${version}] - ${date}\n\n- ${changelog}`;
  return `${changelogText.slice(0, insertionIndex)}${entry}${changelogText.slice(insertionIndex)}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
