import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadConfig } from './config.js';
import { ProcessCommandExecutor } from './executor.js';
import {
  createUpdaterHttpServer,
  listenUpdaterSocket,
  removeStaleSocket,
} from './http-server.js';
import { GitHubReleaseProvider } from './release.js';
import { GitHubCliManifestAttestationVerifier } from './provenance.js';
import { AgentStore } from './store.js';
import { UpdaterAgent } from './updater.js';

const config = loadConfig();
await mkdir(dirname(config.socketPath), { recursive: true, mode: 0o750 });
await removeStaleSocket(config.socketPath);
const executor = new ProcessCommandExecutor();
const agent = new UpdaterAgent(
  config,
  new AgentStore(config.stateDir),
  executor,
  new GitHubReleaseProvider(fetch, new GitHubCliManifestAttestationVerifier(executor)),
);
await agent.initialize();
await listenUpdaterSocket(createUpdaterHttpServer(config, agent), config.socketPath);
