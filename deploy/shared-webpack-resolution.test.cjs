const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const webDirectory = path.join(root, 'apps/web');
const webRequire = createRequire(path.join(webDirectory, 'package.json'));
const nextWebpack = webRequire('next/dist/compiled/webpack/webpack');
nextWebpack.init();

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-shared-webpack-'));
const entry = path.join(temporaryDirectory, 'entry.mjs');
fs.writeFileSync(
  entry,
  "import { DEFAULT_COMMUNITY_ID } from '@pe/shared'; console.log(DEFAULT_COMMUNITY_ID);\n",
  'utf8',
);

const compiler = nextWebpack.webpack({
  mode: 'development',
  context: webDirectory,
  entry,
  output: {
    path: path.join(temporaryDirectory, 'out'),
    filename: 'bundle.js',
  },
  resolve: {
    modules: [path.join(webDirectory, 'node_modules'), 'node_modules'],
    conditionNames: ['browser', 'development', 'import', 'module', '...'],
  },
});

compiler.run((error, stats) => {
  try {
    assert.ifError(error);
    const result = stats.toJson({ all: false, errors: true, modules: true });
    assert.deepEqual(result.errors, []);
    const sharedModules = result.modules.filter((module) =>
      String(module.name ?? '').includes('packages/shared/dist/'),
    );
    assert.ok(sharedModules.length >= 2);
    for (const module of sharedModules) {
      assert.match(module.name, /packages\/shared\/dist\/esm\/.+\.js$/);
      assert.equal(module.moduleType, 'javascript/esm');
    }
    console.log('shared Webpack resolution contract passed');
  } finally {
    compiler.close(() => {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    });
  }
});
