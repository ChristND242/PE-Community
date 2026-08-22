export const DOCS_TITLE = 'PE Community Management Docs';
export const DOCS_DESCRIPTION = 'Install, configure, and operate a self-hosted community management platform.';

export const DOCS_BASE_PATH = '/docs';

export const DOCS_QUICK_START = `cp .env.example .env
nano .env
docker compose -f docker-compose.prod.yml up -d --build`;

export const DOCS_PRODUCTION_SERVICES = ['postgres', 'redis', 'api', 'worker', 'web', 'caddy'] as const;
