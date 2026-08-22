import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set(['.git', '.next', '.turbo', 'coverage', 'dist', 'node_modules']);
const forbiddenDirectoryPaths = new Set(['apps/api/uploads', 'backups', 'logs', 'tmp', 'uploads']);
const forbiddenNames = new Set([
  '.env',
  'PROJECT_SPEC.md',
  'account-email-change-security.md',
  'api-build-output-audit.md',
  'email-template-standard.md',
  'instruction.md',
  'platform.md',
  'profile-social-links.md',
  'project-learn.md',
  'public-site-mode-retirement.md',
  'public-site-parity.md',
  'report.md',
  'run.md',
  'self-hosted-distribution-foundation.md',
  'session-inactivity-security.md',
  'shared-development-build-race.md',
  'shared-package-cross-runtime-regression.md',
  'user-guide.md',
  'user-guide-fr.md',
]);
const forbiddenPaths = new Set([
  'docs/API.md',
  'docs/ARCHITECTURE.md',
  'docs/DEPLOYMENT.md',
  'docs/LOCAL_UPLOADS.md',
  'docs/SECURITY.md',
]);
const forbiddenExtensions = new Set(['.backup', '.bak', '.db', '.dump', '.jks', '.key', '.p12', '.pem', '.pfx', '.sqlite', '.sqlite3']);
const textExtensions = new Set(['.cjs', '.css', '.env', '.html', '.js', '.json', '.md', '.mjs', '.sql', '.svg', '.ts', '.tsx', '.txt', '.yml', '.yaml']);
const forbiddenContent = [
  { label: 'private local path', pattern: /\/home\/cnd400\// },
  { label: 'private development identity', pattern: /christnd|Christ ND/i },
  { label: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'known private hostname', pattern: /community\.christnd\.studio/i },
];

const failures = [];

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    const path = relative(root, absolute);
    if (entry.isDirectory()) {
      if (entry.name === '.pnpm-store' || forbiddenDirectoryPaths.has(path)) {
        failures.push(`${path}: forbidden runtime directory`);
        continue;
      }
      await inspect(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    if (path === 'scripts/check-public-tree.mjs') continue;
    if (
      forbiddenNames.has(entry.name) ||
      forbiddenPaths.has(path) ||
      entry.name === '.envrc' ||
      (entry.name.startsWith('.env.') && entry.name !== '.env.example')
    ) {
      failures.push(`${path}: forbidden publication file`);
      continue;
    }
    if (forbiddenExtensions.has(extname(entry.name).toLowerCase())) {
      failures.push(`${path}: sensitive file extension`);
      continue;
    }
    if (!textExtensions.has(extname(entry.name).toLowerCase()) && entry.name !== '.env.example') continue;
    const content = await readFile(absolute, 'utf8');
    for (const rule of forbiddenContent) {
      if (rule.pattern.test(content)) failures.push(`${path}: ${rule.label}`);
    }
  }
}

await inspect(root);

if (failures.length) {
  console.error('Public-tree check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Public-tree check passed.');
}
