const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const header = fs.readFileSync(path.join(__dirname, 'src/header.js'), 'utf8');
const args = process.argv.slice(2);
const release = args.includes('--release');
const staging = args.includes('--staging');
const outfileIndex = args.indexOf('--outfile');

if (staging && release) {
  console.error('staging 开发构建不能与正式发布同时使用。');
  process.exit(1);
}

if (outfileIndex !== -1 && !args[outfileIndex + 1]) {
  console.error('Missing value for --outfile.');
  process.exit(1);
}

const outfile = outfileIndex === -1
  ? (release ? 'autoMaxPPHPL.user.js' : staging ? 'dist/autoMaxPPHPL_STAGING_DEV.user.js' : 'dist/autoMaxPPHPL_DEV.user.js')
  : args[outfileIndex + 1];

let buildHeader = release
  ? header.replace(/^(\/\/\s*@name\s+.*)\s+\(DEV\)\s*$/m, '$1')
  : header;

// staging 使用独立安装身份，仅在构建时转换源码；正式服源文件及开发包保持独立。
const stagingPlugins = [];
if (staging) {
  buildHeader = buildHeader
    .replace(/^(\/\/\s*@name\s+.*)\(DEV\)\s*$/m, '$1(STAGING DEV)')
    .replace(/^(\/\/\s*@namespace\s+\S+)/m, '$1/staging')
    .replaceAll('www.simcompanies.com', 'staging.simcompanies.com')
    .replace(/^(\/\/\s*@(updateURL|downloadURL)\s+).*$/gm, '$1none');
  stagingPlugins.push({
    name: 'simcompanies-staging',
    setup(build) {
      build.onLoad({ filter: /\.js$/ }, async ({ path: sourcePath }) => {
        const relative = path.relative(path.join(__dirname, 'src'), sourcePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return;
        let contents = await fs.promises.readFile(sourcePath, 'utf8');
        contents = contents
          .replaceAll('www.simcompanies.com', 'staging.simcompanies.com')
          .replaceAll('www\\.simcompanies\\.com', 'staging\\.simcompanies\\.com');
        if (relative === 'index.js') {
          // 内置更新器也指向正式安装包，staging 中停用；锚点变化时让构建明确失败。
          const updater = 'setTimeout(checkUpdate, 3000);';
          if (contents.split(updater).length !== 2) throw new Error('staging 构建未找到唯一的更新器入口。');
          contents = contents.replace(updater, '// staging 开发包通过本地构建更新。');
        }
        return { contents, loader: 'js' };
      });
    }
  });
}

esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile,
  format: 'iife',
  platform: 'browser',
  plugins: stagingPlugins,
  banner: {
    js: buildHeader
  }
}).then(() => {
  console.log(`Build completed: ${outfile}`);
}).catch(() => process.exit(1));
