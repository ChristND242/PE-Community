import {
  featureDocsPagesEn,
  featureDocsPagesFr,
  type FeatureDocsPageKey,
} from './feature-content';
import { operatorDocsPagesEn, operatorDocsPagesFr } from './operator-content';

export type DocsPageKey =
  | FeatureDocsPageKey
  | 'overview'
  | 'gettingStarted'
  | 'installation'
  | 'configuration'
  | 'deployment'
  | 'firstRunSetup'
  | 'dockerCompose'
  | 'environmentVariables'
  | 'backupRestore'
  | 'troubleshooting'
  | 'architecture'
  | 'upgrades'
  | 'contributing';

export type DocsCalloutVariant =
  | 'note'
  | 'warning'
  | 'security'
  | 'production'
  | 'tip';
export type DocsLang = 'en' | 'fr';

export type DocsDiagram = {
  caption: string;
  nodes: string[];
};

export type DocsMermaidDiagram = {
  title: string;
  description: string;
  unavailableLabel: string;
  sources: Record<DocsLang, string>;
};

export type DocsSection = {
  id: string;
  title: string;
  body?: string[];
  bullets?: string[];
  code?: {
    value: string;
    language?: string;
    label?: string;
    title?: string;
    meta?: string;
    showLineNumbers?: boolean;
  };
  callout?: {
    variant: DocsCalloutVariant;
    title: string;
    body: string;
    showIcon?: boolean;
  };
  table?: { headers: string[]; rows: string[][] };
  diagram?: DocsDiagram;
  mermaid?: DocsMermaidDiagram;
};

export type DocsCard = {
  title: string;
  body: string;
  href: string;
};

export type DocsPage = {
  title: string;
  description: string;
  eyebrow?: string;
  href: string;
  cards?: DocsCard[];
  sections: DocsSection[];
};

const productionComposeExample = `services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: pe
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: pe_community
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pe -d pe_community"]
      interval: 5s
      timeout: 5s
      retries: 20

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 20

  api:
    image: ghcr.io/pona-ekolo/pe-community-api:${PE_COMMUNITY_VERSION:?set PE_COMMUNITY_VERSION in .env}
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      API_PORT: "4000"
      DATABASE_URL: postgresql://pe:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@postgres:5432/pe_community?schema=public
      REDIS_URL: redis://redis:6379
      WEB_ORIGIN: ${WEB_ORIGIN:?set WEB_ORIGIN in .env}
      API_PUBLIC_URL: ${API_PUBLIC_URL:-${WEB_ORIGIN:?set WEB_ORIGIN in .env}}
      UPLOADS_DIR: /app/uploads
    volumes:
      - uploads_data:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    expose:
      - "4000"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:4000/health >/dev/null 2>&1"]
      interval: 10s
      timeout: 5s
      retries: 20

  worker:
    image: ghcr.io/pona-ekolo/pe-community-worker:${PE_COMMUNITY_VERSION:?set PE_COMMUNITY_VERSION in .env}
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://pe:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@postgres:5432/pe_community?schema=public
      REDIS_URL: redis://redis:6379
      UPLOADS_DIR: /app/uploads
    volumes:
      - uploads_data:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  web:
    image: ghcr.io/pona-ekolo/pe-community-web:${PE_COMMUNITY_VERSION:?set PE_COMMUNITY_VERSION in .env}
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      WEB_PORT: "3000"
      INTERNAL_API_URL: ${INTERNAL_API_URL:-http://api:4000}
      NEXT_PUBLIC_API_URL: "${NEXT_PUBLIC_API_URL:-/api/v1}"
      NEXT_PUBLIC_REALTIME_ORIGIN: "${NEXT_PUBLIC_REALTIME_ORIGIN:-}"
    depends_on:
      api:
        condition: service_healthy
    expose:
      - "3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    environment:
      APP_DOMAIN: "${APP_DOMAIN:-:80}"
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
      - "${HTTPS_PORT:-443}:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      web:
        condition: service_started
      api:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
  uploads_data:
  caddy_data:
  caddy_config:`;

const productionCaddyfileExample = `{$APP_DOMAIN::80} {
\tencode zstd gzip

\thandle /socket.io* {
\t\treverse_proxy api:4000
\t}

\thandle_path /api/v1/* {
\t\treverse_proxy api:4000
\t}

\thandle /uploads/* {
\t\treverse_proxy api:4000
\t}

\thandle {
\t\treverse_proxy web:3000
\t}
}`;

export const docsPageOrder: DocsPageKey[] = [
  'overview',
  'gettingStarted',
  'installation',
  'firstRunSetup',
  'environmentVariables',
  'dockerCompose',
  'configuration',
  'administration',
  'reminders',
  'messageTemplates',
  'rolesPermissions',
  'registrations',
  'calendarEvents',
  'announcementsFeed',
  'taskBoards',
  'automation',
  'notifications',
  'streaksEngagement',
  'auditLogs',
  'encryptedChat',
  'security',
  'deployment',
  'backupRestore',
  'upgrades',
  'troubleshooting',
  'architecture',
  'contributing',
];

export const docsPages: Record<DocsPageKey, DocsPage> = {
  ...featureDocsPagesEn,
  overview: {
    title: 'PE Community Management Docs',
    eyebrow: 'Documentation',
    href: '/docs',
    description:
      'Use this documentation to set up, administer, secure, operate, and contribute to PE Community Management.',
    cards: [
      {
        title: 'Getting started',
        body: 'Understand workspaces, roles, and first steps.',
        href: '/docs/getting-started',
      },
      {
        title: 'First-run setup',
        body: 'Initialize the first community and Owner account.',
        href: '/docs/first-run-setup',
      },
      {
        title: 'Administration',
        body: 'Manage members, communication, work, and governance.',
        href: '/docs/administration',
      },
      {
        title: 'Notifications',
        body: 'Understand unread state, delivery, and preferences.',
        href: '/docs/notifications',
      },
      {
        title: 'Automation',
        body: 'Configure, test, and review Task Board rules.',
        href: '/docs/automation',
      },
      {
        title: 'Encrypted chat',
        body: 'Manage recovery, authorized devices, and encrypted media.',
        href: '/docs/encrypted-chat',
      },
      {
        title: 'Security',
        body: 'Review authentication, permissions, sessions, and encryption boundaries.',
        href: '/docs/security',
      },
      {
        title: 'Architecture',
        body: 'Understand services, data flow, and background work.',
        href: '/docs/architecture',
      },
    ],
    sections: [
      {
        id: 'choose-where-to-begin',
        title: 'Choose where to begin',
        body: [
          'The guides are organized by task and audience. Start with the path that matches your role or objective.',
        ],
        bullets: [
          'Set up a new community: use Installation, Environment variables, Docker Compose, and First-run setup to prepare the application, initialize the community, create the Owner account, and confirm language and timezone defaults.',
          'Administer a community: Owners and authorized Admins should continue with Administration, Notifications, Automation, and Security for members, communication, events, Task Boards, governance, and audit activity.',
          'Use the Member workspace: begin with Getting started, then review Notifications and Encrypted chat for participant-facing updates, preferences, schedules, assigned work, and secure communication.',
          'Maintain or contribute: review Architecture, Configuration, Troubleshooting, and Contributing before operating the deployment or changing code.',
        ],
      },
      {
        id: 'platform-model',
        title: 'Platform model',
        body: [
          'PE Community Management separates community administration from member participation. Access is permission-based and community-scoped.',
        ],
        bullets: [
          'Administrative workspace: the Owner and authorized Admins manage membership, announcements, events, Task Boards, automation, notifications, storage governance, and supported audit activity according to assigned permissions.',
          'Member workspace: Members use participant-facing profiles, community information, assigned work, schedules, preferences, notifications, and encrypted communication made available to them.',
        ],
      },
      {
        id: 'before-you-begin',
        title: 'Before you begin',
        bullets: [
          'First-run setup is completed once: Prisma migrations prepare the database, then /setup initializes the first community and creates its first Owner. Initialization cannot be repeated after completion.',
          'Account security and encrypted-chat recovery are separate: account passwords protect application access, while encrypted-chat backups use separate recovery material that does not depend on the stored account password hash.',
          'Language and timezone are community-aware: setup establishes EN or FR and a timezone as community defaults. Supported user preferences may refine presentation, and date and time rendering follows the applicable community or user context.',
        ],
      },
      {
        id: 'documentation-coverage',
        title: 'Documentation coverage',
        bullets: [
          'Installation and first-run initialization.',
          'Community configuration, roles, permissions, and administration.',
          'Notifications, communication, Task Board automation, and encrypted chat recovery.',
          'Storage governance, security architecture, backup and restore fundamentals, troubleshooting, and contributing.',
        ],
      },
      {
        id: 'deployment-guidance-boundary',
        title: 'Deployment guidance boundary',
        body: [
          'The deployment guidance covers the supported Docker Compose workflow.',
        ],
        callout: {
          variant: 'production',
          title: 'Production guidance remains focused',
          body: 'Guidance for published release images, production sizing, high availability, automated backup operations, and zero-downtime upgrades will be finalized after production validation.',
        },
      },
      {
        id: 'recommended-next-steps',
        title: 'Recommended next steps',
        body: [
          'Start with Getting started if you are learning the product model. For a new installation, continue with Installation and First-run setup; for an existing community, choose the administration, notification, automation, encrypted-chat, security, or architecture guide that matches your task.',
        ],
      },
    ],
  },
  gettingStarted: {
    title: 'Getting started',
    eyebrow: 'Overview',
    href: '/docs/getting-started',
    description:
      'Learn how the platform is organized, identify your role, and take the right first operational steps.',
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
        body: [
          'PE Community Management gives community teams one place to manage members, communication, events, collaborative work, and day-to-day administration.',
          'The platform is open source and designed for self-hosted operation. The organization running it controls the deployment, database, email provider, file storage, and backup process.',
        ],
      },
      {
        id: 'how-the-platform-is-organized',
        title: 'How the platform is organized',
        body: [
          'The platform uses separate administrative and Member workspaces so operational authority does not become participant access by default.',
        ],
        bullets: [
          'Administrative workspace: the Owner and authorized Admins manage members, announcements, events, Task Boards, automation, audit logs, communication settings, and supported operational controls.',
          'Member workspace: Members manage their profile and preferences, use the directory, follow the Feed and notifications, review schedules and assigned tasks, and use encrypted chat when available to them.',
          'First-run setup creates the Owner with full administrative access. The Owner can delegate supported permissions; Admin access depends on those assignments, while Member access remains participant-facing.',
        ],
      },
      {
        id: 'choose-where-to-begin',
        title: 'Choose where to begin',
        bullets: [
          'New Owner: complete First-run setup, sign in, review community settings, confirm language and timezone, configure email delivery before email-dependent actions, review permissions, and begin member onboarding.',
          'Existing Owner or Admin: review Administration and your assigned permissions, then begin with the relevant membership applications, announcements, events, Task Boards, automation, or audit activity.',
          'Member: sign in to the Member workspace, complete your profile, review updates, manage notification preferences, check schedules and assigned work, and use encrypted chat when enabled and permitted.',
          'Maintainer: review Architecture, Configuration, Environment variables, Troubleshooting, and Contributing before changing or operating the platform.',
        ],
      },
      {
        id: 'first-steps-for-a-new-community',
        title: 'First steps for a new community',
        bullets: [
          '1. Complete first-run setup.',
          '2. Sign in as the Owner and review community settings.',
          '3. Confirm the default language and timezone.',
          '4. Configure email delivery before sending email-dependent communication.',
          '5. Review roles and permissions before delegating Admin access.',
          '6. Add members or review membership applications.',
          '7. Publish an initial announcement or create an event when the community is ready.',
        ],
      },
      {
        id: 'core-operating-areas',
        title: 'Core operating areas',
        bullets: [
          'Members and access: approved applications can become member records. Owners and authorized Admins manage member information, while roles and permissions control access.',
          'Communication: announcements, Feed updates, notifications, email, and supported reminders and templates serve defined audiences. Administrative and Member notification surfaces remain separate.',
          'Events and collaborative work: events and calendars coordinate schedules, while Task Boards, reusable task templates, and automation support assigned and repeatable work.',
          'Encrypted communication: direct and group chat use end-to-end encrypted message content. Private key material remains on authorized devices or in encrypted backups; authorization, recovery, and encrypted-media governance remain separate from account-password security.',
          'Governance and accountability: audit logs record supported administrative and security-sensitive activity. Permissions, confirmations, device limits, and storage controls support governance without giving Admins access to decrypted private-chat content.',
        ],
      },
      {
        id: 'data-ownership-and-responsibility',
        title: 'Data ownership and responsibility',
        body: [
          'The self-hosting operator controls PostgreSQL data, Redis-backed queued work and temporary runtime state, outbound email configuration, uploaded and encrypted-media storage, database and object-storage backups, runtime secrets, and infrastructure access.',
          'That control includes responsibility for availability, upgrades, backups, recovery testing, and infrastructure security. Redis supports queued work and temporary runtime state; it is not the authoritative permanent store for community records.',
        ],
      },
      {
        id: 'continue-with',
        title: 'Continue with',
        bullets: [
          'First-run setup for first-community initialization.',
          'Administration for roles, permissions, member operations, and governance.',
          'Configuration for community-wide operational settings.',
          'Notifications for audience separation, unread state, and preferences.',
          'Automation for Task Board rules, testing, and run history.',
          'Encrypted chat for privacy, recovery, authorized devices, and encrypted media.',
          'Security for authentication, sessions, permissions, and encryption boundaries.',
          'Troubleshooting for verified setup and operating issues.',
        ],
      },
    ],
  },
  installation: operatorDocsPagesEn.installation,
  firstRunSetup: operatorDocsPagesEn.firstRunSetup,
  environmentVariables: operatorDocsPagesEn.environmentVariables,
  dockerCompose: {
    title: 'Docker Compose',
    eyebrow: 'Install & Setup',
    href: '/docs/docker-compose',
    description:
      'Run PE Community and its required services with persistent storage and a single HTTPS entry point.',
    cards: [
      {
        title: 'Installation',
        body: 'Prepare the host before starting the deployment.',
        href: '/docs/installation',
      },
      {
        title: 'Environment variables',
        body: 'Configure domains, secrets, email, and optional security values.',
        href: '/docs/environment-variables',
      },
      {
        title: 'Deployment',
        body: 'Review public routing and production operating boundaries.',
        href: '/docs/deployment',
      },
      {
        title: 'Backup and restore',
        body: 'Protect PostgreSQL and uploaded files before changes.',
        href: '/docs/backup-restore',
      },
      {
        title: 'Upgrades',
        body: 'Review release-specific migration and compatibility guidance.',
        href: '/docs/upgrades',
      },
      {
        title: 'Troubleshooting',
        body: 'Diagnose startup, routing, background work, and storage problems.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
        body: [
          'Use Docker Compose to run PE Community, PostgreSQL, Redis, background processing, and the HTTPS entry point as one managed deployment. Named volumes preserve application data when containers are recreated.',
        ],
      },
      {
        id: 'before-you-start',
        title: 'Before you start',
        bullets: [
          'Install Docker Engine and the Docker Compose plugin.',
          'Copy and configure `.env` as described in Environment variables.',
          'Create a DNS record for APP_DOMAIN when using automatic HTTPS.',
          'Allow public traffic to ports 80 and 443.',
          'Reserve enough disk space for PostgreSQL, uploaded files, Redis state, TLS data, and backups.',
        ],
      },
      {
        id: 'production-compose-file',
        title: 'Production compose file',
        body: [
          'Use the repository `docker-compose.prod.yml` beside `.env`. It builds the API, worker, and web images from the checked-out source and starts the supporting services.',
        ],
        callout: {
          variant: 'note',
          title: 'Source-built release',
          body: 'No prebuilt public container images are published. Keep the source tree, lockfile, Dockerfiles, Compose file, and Caddy configuration from the same reviewed release.',
        },
        code: {
          label: 'compose.yml',
          language: 'yaml',
          value: productionComposeExample,
          showLineNumbers: true,
        },
      },
      {
        id: 'caddyfile',
        title: 'Caddyfile',
        body: [
          'The repository Caddyfile is mounted by the production Compose file. Route order is significant: realtime, API, and uploaded-file requests reach the application before the final interface route.',
        ],
        code: {
          label: 'Caddyfile',
          language: 'nginx',
          value: productionCaddyfileExample,
        },
      },
      {
        id: 'services',
        title: 'Services',
        table: {
          headers: ['Service', 'Role', 'Persistent data'],
          rows: [
            [
              'postgres',
              'Stores community and application data.',
              'postgres_data',
            ],
            [
              'redis',
              'Supports background jobs and temporary application state.',
              'redis_data',
            ],
            [
              'api',
              'Handles requests, authentication, uploads, and realtime connections.',
              'uploads_data',
            ],
            [
              'worker',
              'Processes background work such as email and notifications.',
              'Shared uploads and database records',
            ],
            ['web', 'Serves the PE Community application interface.', 'None'],
            [
              'caddy',
              'Provides the HTTPS entry point and routes application traffic.',
              'caddy_data, caddy_config',
            ],
          ],
        },
        body: [
          'PostgreSQL, Redis, and the application request service have health checks. Startup dependencies wait for the required healthy services. Pending database migrations are applied by the application image before it begins serving requests.',
        ],
      },
      {
        id: 'networking-and-https',
        title: 'Networking and HTTPS',
        body: [
          'Only Caddy needs to be publicly reachable. PostgreSQL, Redis, the application request service, and the interface remain internal to the Compose deployment.',
          'The standard deployment uses the same public origin for the interface, REST requests, uploads, and realtime connections. Published interface images are expected to use `/api/v1` and an empty explicit realtime origin. A custom browser endpoint requires an image built for that endpoint.',
        ],
        table: {
          headers: ['Port', 'Purpose'],
          rows: [
            ['80/tcp', 'HTTP access, redirects, and certificate validation.'],
            ['443/tcp', 'HTTPS application traffic.'],
            ['443/udp', 'HTTP/3 application traffic.'],
          ],
        },
      },
      {
        id: 'environment-file',
        title: 'Compose-specific environment values',
        body: [
          'Keep the full configuration in `.env` and use Environment variables as the reference. The values below control Compose identity, the public address, and same-origin browser routing.',
        ],
        code: {
          label: '.env',
          language: 'dotenv',
          value: [
            'COMPOSE_PROJECT_NAME=pe-community',
            'POSTGRES_PASSWORD=<strong-url-safe-database-password>',
            '',
            'APP_DOMAIN=community.example.com',
            'WEB_ORIGIN=https://community.example.com',
            '',
            'NEXT_PUBLIC_API_URL=/api/v1',
            'NEXT_PUBLIC_REALTIME_ORIGIN=',
          ].join('\n'),
        },
        callout: {
          variant: 'tip',
          title: 'Keep release files together',
          body: 'Build from one reviewed source release. Do not mix Dockerfiles, lockfiles, deployment configuration, or application source from different revisions.',
          showIcon: false,
        },
      },
      {
        id: 'start-and-check-status',
        title: 'Start and check status',
        body: [
          'Start the deployment, then confirm that all expected services are running. PostgreSQL, Redis, and the application request service should report healthy.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose -f docker-compose.prod.yml up -d --build\ndocker compose -f docker-compose.prod.yml ps',
        },
      },
      {
        id: 'view-logs',
        title: 'View logs',
        body: [
          'Use combined logs for the full startup sequence, or follow one service while diagnosing a specific problem.',
        ],
        bullets: [
          'api: startup, database migrations, requests, uploads, and realtime errors.',
          'worker: background jobs, notifications, and email delivery.',
          'caddy: HTTPS, certificate, and routing errors.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: [
            'docker compose logs -f',
            'docker compose logs -f api',
            'docker compose logs -f worker',
            'docker compose logs -f caddy',
          ].join('\n'),
        },
      },
      {
        id: 'restart-and-stop',
        title: 'Restart and stop',
        body: [
          'Restart keeps the existing containers and volumes. Stop pauses containers. Down removes containers and the Compose network but retains named volumes unless you add `-v`.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: [
            'docker compose restart',
            'docker compose restart worker',
            'docker compose stop',
            'docker compose down',
          ].join('\n'),
        },
        callout: {
          variant: 'warning',
          title: 'Do not remove production volumes',
          body: 'Do not run `docker compose down -v` on an installation whose data you need to keep. The `-v` option removes the named volumes managed by the deployment.',
        },
      },
      {
        id: 'persistent-data',
        title: 'Persistent data',
        table: {
          headers: ['Volume', 'Contains', 'Backup priority'],
          rows: [
            [
              'postgres_data',
              'Community and application database.',
              'Critical',
            ],
            ['uploads_data', 'Uploaded files and attachments.', 'Critical'],
            [
              'redis_data',
              'Persistent queue and background-job state.',
              'Operational',
            ],
            [
              'caddy_data',
              'TLS certificates and Caddy runtime state.',
              'Important',
            ],
            ['caddy_config', 'Caddy configuration runtime state.', 'Useful'],
          ],
        },
        callout: {
          variant: 'security',
          title: 'Back up database and uploads together',
          body: 'A PostgreSQL backup does not include uploaded files. A complete recovery plan must protect both PostgreSQL data and uploads. See Backup and restore for the supported procedures.',
        },
      },
      {
        id: 'project-name',
        title: 'Keep the project name stable',
        body: [
          'Set `COMPOSE_PROJECT_NAME=pe-community` before the first start and keep it stable. Docker Compose uses the project name to identify the deployment’s containers, network, and named volumes. Changing it can create a different volume set and make existing data appear missing.',
          'Use `docker compose ps` and `docker volume ls` when you need to inspect the resources associated with a deployment.',
        ],
      },
      {
        id: 'apply-updates',
        title: 'Apply updates',
        body: [
          'After reviewing a source release, rebuild and recreate the application containers. Named volumes remain attached when the Compose project name is unchanged.',
          'Back up the installation before a release that includes database changes. Database migrations run automatically during application startup.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose -f docker-compose.prod.yml up -d --build\ndocker compose -f docker-compose.prod.yml ps',
        },
        callout: {
          variant: 'warning',
          title: 'Do not assume image-only rollback is safe',
          body: 'An older image may not be compatible after a database migration. Follow release-specific upgrade and rollback instructions instead of changing a tag blindly.',
        },
      },
      {
        id: 'security-expectations',
        title: 'Security expectations',
        bullets: [
          'Expose only Caddy’s public ports during normal operation.',
          'Keep PostgreSQL and Redis internal to the deployment.',
          'Keep `.env` private and never commit secrets.',
          'Do not mount the Docker daemon socket or grant privileged container access.',
          'Treat named volumes and backups as sensitive data.',
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        bullets: [
          'Containers do not start: run `docker compose ps` and `docker compose logs`, then check required values in `.env`.',
          'The database is unavailable: inspect `docker compose logs postgres` and `docker compose logs api`, then check credentials and persistent storage.',
          'Background jobs or email are not processed: inspect `docker compose logs worker` and `docker compose logs redis`.',
          'HTTPS is unavailable: inspect `docker compose logs caddy`, then check DNS, APP_DOMAIN, firewall rules, and ports 80 and 443.',
          'Realtime or chat does not connect: check Caddy and application logs, then inspect the browser’s WebSocket request.',
          'Data appears missing after redeployment: confirm COMPOSE_PROJECT_NAME did not change and inspect existing named volumes.',
        ],
      },
    ],
  },
  configuration: {
    title: 'Configuration',
    eyebrow: 'Install & Setup',
    href: '/docs/configuration',
    description:
      'Use Settings to manage community-wide behavior after PE Community is running. Available sections depend on your role and permissions.',
    cards: [
      {
        title: 'First-run setup',
        body: 'Initialize a new community and its Owner once.',
        href: '/docs/first-run-setup',
      },
      {
        title: 'Environment variables',
        body: 'Configure deployment-level services and fallback values.',
        href: '/docs/environment-variables',
      },
      {
        title: 'Security',
        body: 'Review authentication and platform protection guidance.',
        href: '/docs/security',
      },
      {
        title: 'Notifications',
        body: 'Understand notification delivery, unread state, and preferences.',
        href: '/docs/notifications',
      },
      {
        title: 'Reminders',
        body: 'Understand due dates, recipients, channels, and manual checks.',
        href: '/docs/reminders',
      },
      {
        title: 'Message templates',
        body: 'Safely preview, test, and activate reminder and email copy.',
        href: '/docs/message-templates',
      },
      {
        title: 'Troubleshooting',
        body: 'Resolve configuration, email, and delivery problems.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'settings-scope',
        title: 'Settings scope',
        body: [
          'Community controls are organized into General, Security, Reminders, Templates, and Notifications. Sections appear only when your assigned permissions allow access. Profile manages the signed-in administrator’s own profile rather than community-wide behavior.',
        ],
      },
      {
        id: 'general',
        title: 'General',
        table: {
          headers: ['Setting', 'What it changes'],
          rows: [
            [
              'Community slug',
              'Displays the community identifier. This value is read-only in Settings.',
            ],
            [
              'Default language',
              'Sets English or French for community-level defaults and users without a personal language preference.',
            ],
            [
              'Timezone',
              'Sets the IANA timezone used for community scheduling and operational dates.',
            ],
            [
              'Support contact email',
              'Sets the optional administrative contact address. The value must be a valid email address when provided.',
            ],
            [
              'Public user audit export',
              'Downloads the available public user fields as a CSV audit list.',
            ],
          ],
        },
        body: [
          'General changes use Save changes. The saved language and timezone take effect in community defaults immediately; a user’s explicit language preference still takes priority.',
        ],
      },
      {
        id: 'registration-and-member-access',
        title: 'Registration and member access',
        table: {
          headers: ['Setting', 'What it changes'],
          rows: [
            [
              'Registration entry method',
              'Chooses Admin/Owner invite link or Portal registration.',
            ],
            [
              'Invite link',
              'Generates, copies, emails, replaces, or revokes the active invitation link when invite-link registration is selected.',
            ],
            [
              'Member directory visibility',
              'Allows active members to browse the directory, or hides the directory.',
            ],
            [
              'Registration protection',
              'Enables or disables the configured CAPTCHA challenge for registration.',
            ],
            [
              'Enforcement mode',
              'Uses Disabled or Always for registration challenges.',
            ],
            [
              'CAPTCHA provider',
              'Selects Cloudflare Turnstile, Google reCAPTCHA, hCaptcha, or Disabled.',
            ],
            [
              'Provider fields',
              'Configures the site key, secret key, allowed hostname, expected action, and the reCAPTCHA variant and minimum score when applicable.',
            ],
            [
              'Registration limits',
              'Sets attempts per IP and community, the IP window, notification cooldown, and daily registration-email limit.',
            ],
          ],
        },
        body: [
          'Save registration protection before using Test configuration. The test validates the saved fields; a live registration challenge is still required to verify provider credentials.',
        ],
      },
      {
        id: 'security',
        title: 'Security',
        bullets: [
          'Require two-factor authentication makes enrollment available and requires the second sign-in step only for accounts that are already enrolled. Enabling it does not force unenrolled members to enroll immediately.',
          'Disabling the community policy bypasses the second sign-in step without deleting a member’s existing enrollment. Re-enabling it restores the challenge for enrolled accounts.',
          'Reset two-factor authentication opens Member management, where an authorized operator can reset an enrolled member’s 2FA after confirmation.',
          'Registration protection is managed in the Security section but documented above with the other registration controls.',
        ],
      },
      {
        id: 'email-delivery',
        title: 'Email delivery',
        table: {
          headers: ['Setting', 'What it changes'],
          rows: [
            ['Email delivery', 'Enables or disables community email sending.'],
            [
              'SMTP host and SMTP port',
              'Set the mail provider connection endpoint.',
            ],
            [
              'SMTP username and SMTP password',
              'Set provider credentials. Leave the password blank to keep an already configured password.',
            ],
            [
              'Secure TLS',
              'Enables the secure SMTP connection option. Port 465 requires it.',
            ],
            [
              'From email and From name',
              'Set the sender identity shown on outgoing messages.',
            ],
            [
              'Test email recipient',
              'Queues a test message to the entered address after the settings have been saved.',
            ],
          ],
        },
        body: [
          'When email delivery is enabled, host, port, username, password, sender email, and sender name must be complete. Community email settings are managed here; see Environment variables only for deployment-level fallback email configuration.',
          'Send test email is available only after the current settings are saved. It queues a message in the community default language to the entered address, records the test in Audit logs, and returns before background delivery finishes.',
        ],
      },
      {
        id: 'notifications',
        title: 'Notifications',
        bullets: [
          'Admin in-app alerts is the main switch for administrative alerts.',
          'Operational alert switches cover email delivery issues, registrations waiting for review, passport expiration, and reminder-run summaries.',
          'Pausing Admin in-app alerts also pauses the visible operational alerts that depend on that channel.',
          'These switches affect future supported alert creation; they do not delete existing notifications. The reminder-run summary switch is stored, but Run due reminders currently reports its summary through temporary feedback and Audit logs rather than creating a summary alert.',
        ],
      },
      {
        id: 'reminders',
        title: 'Reminders',
        body: [
          'Settings contains birthday, membership anniversary, and passport-expiration controls. The Reminders guide explains every toggle, exact UTC due-date behavior, recipients, channels, repeat safety, failures, and Run due reminders.',
        ],
      },
      {
        id: 'templates',
        title: 'Templates',
        body: [
          'Templates contains reminder copy, localized transactional emails, and Task Board automation notifications. The Message templates guide explains inventories, variables, Preview, Send test, Save changes, Discard changes, and the family-specific Reset to default behavior.',
        ],
      },
      {
        id: 'chat-and-media',
        title: 'Chat and media',
        table: {
          headers: ['Setting', 'Allowed value'],
          rows: [
            ['Maximum active chat devices', '1 to 8 devices; default 3.'],
            ['Storage warning percent', '1% to 100%; default 80%.'],
            ['Chat attachment limit', '1 MB to 10 MB; default 10 MB.'],
            [
              'Chat media quota',
              'Optional whole-gigabyte quota; blank means no quota.',
            ],
          ],
        },
        body: [
          'Additional permissions control whether an operator can view or revoke community chat devices, inspect encrypted-media storage, change storage limits, or request supported media cleanup. These controls do not provide access to decrypted chat content.',
          'Changing Maximum active chat devices affects later device registration. It does not automatically revoke devices that are already active; use the device controls for an intentional revocation.',
        ],
      },
      {
        id: 'saving-and-testing',
        title: 'Saving and testing',
        bullets: [
          'Settings do not auto-save. Save actions are enabled when a valid draft differs from the saved values and show progress while a request is running.',
          'Discard changes restores the last saved values. Success and failure are reported as temporary notifications.',
          'SMTP test email and CAPTCHA Test configuration require saved settings. Template preview and test actions use the selected language.',
          'Switching away from a template with unsaved changes requires confirmation where the editor supports it.',
        ],
      },
      {
        id: 'permissions',
        title: 'Permissions',
        table: {
          headers: ['Section', 'Required permission'],
          rows: [
            ['General', 'Manage general settings'],
            [
              'Security and registration protection',
              'Manage security settings',
            ],
            ['Email delivery', 'Manage SMTP settings'],
            ['Reminders', 'Manage reminder settings'],
            ['Templates', 'Manage message templates'],
            ['Notifications', 'Manage notification settings'],
            [
              'Chat and media',
              'The matching chat device, storage, or media permission',
            ],
          ],
        },
        body: [
          'Owners can access all settings. Administrators see and modify only the sections allowed by their assigned permissions.',
        ],
      },
      {
        id: 'related-guides',
        title: 'Related guides',
        body: [
          'Use the related guides above for initial community creation, deployment-level values, security guidance, notification behavior, and troubleshooting. This page remains focused on controls available inside Settings.',
        ],
      },
    ],
  },
  deployment: {
    title: 'Deployment',
    eyebrow: 'Deployment',
    href: '/docs/deployment',
    description:
      'Deploy PE Community on a server using the production Compose configuration and a hostname that resolves to the server.',
    cards: [
      {
        title: 'Installation',
        body: 'Prepare the server and required deployment files.',
        href: '/docs/installation',
      },
      {
        title: 'Environment variables',
        body: 'Configure the hostname, origin, secrets, and optional services.',
        href: '/docs/environment-variables',
      },
      {
        title: 'Docker Compose',
        body: 'Use the authoritative container, volume, and lifecycle reference.',
        href: '/docs/docker-compose',
      },
      {
        title: 'Backup and restore',
        body: 'Protect the installation before and after going live.',
        href: '/docs/backup-restore',
      },
      {
        title: 'Troubleshooting',
        body: 'Diagnose startup, HTTPS, and application failures.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'before-deployment',
        title: 'Before deployment',
        bullets: [
          'Prepare a supported server with Docker Engine and the Docker Compose plugin.',
          'Complete `.env`, obtain the production `compose.yml`, and place the Caddy configuration beside it when distributed separately.',
          'Choose the public hostname, prepare its DNS records, and confirm that ports 80 and 443 can reach the server.',
          'Review Docker Compose for image placeholders, project identity, persistent volumes, and standard lifecycle commands.',
          'Understand the backup and recovery plan before the installation receives production data.',
        ],
      },
      {
        id: 'configure-hostname',
        title: 'Configure the hostname',
        body: [
          'Use the hostname that members will open. APP_DOMAIN gives Caddy its public hostname, while WEB_ORIGIN must use the same HTTPS origin so browser sessions and application requests remain aligned.',
        ],
        code: {
          label: '.env',
          language: 'dotenv',
          value:
            'APP_DOMAIN=community.example.com\nWEB_ORIGIN=https://community.example.com',
        },
      },
      {
        id: 'dns',
        title: 'DNS',
        bullets: [
          'Create an A record that points the hostname to the server’s public IPv4 address.',
          'Create an AAAA record only when IPv6 is configured and reachable on the server.',
          'Allow DNS changes to propagate before diagnosing certificate issuance.',
          'When using a CDN or proxy, keep its DNS, TLS, and firewall behavior compatible with Caddy serving the configured hostname.',
        ],
      },
      {
        id: 'firewall-and-public-ports',
        title: 'Firewall and public ports',
        table: {
          headers: ['Port', 'Purpose'],
          rows: [
            [
              '80/tcp',
              'HTTP access, HTTPS redirects, and certificate validation.',
            ],
            ['443/tcp', 'HTTPS application traffic.'],
            [
              '443/udp',
              'HTTP/3 traffic where the network and host support it.',
            ],
          ],
        },
        body: [
          'Secure administrative access separately using the operator’s chosen SSH policy. PostgreSQL, Redis, and internal application services do not need public ports in the standard deployment.',
        ],
      },
      {
        id: 'start-the-deployment',
        title: 'Start the deployment',
        body: [
          'From the reviewed source release, build and start the production Compose deployment. The canonical workflow does not depend on unpublished container images.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose -f docker-compose.prod.yml up -d --build',
        },
      },
      {
        id: 'verify-the-deployment',
        title: 'Verify the deployment',
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose ps',
        },
        bullets: [
          'Confirm that the expected services are running and that reported health checks complete successfully.',
          'Open the HTTPS hostname and confirm that the first-run or sign-in screen appears as appropriate.',
          'Test sign-in and a normal authenticated page.',
          'Confirm that realtime-dependent features connect and that an uploaded file remains available.',
          'Send a test email when community email delivery is configured.',
        ],
      },
      {
        id: 'https',
        title: 'HTTPS',
        body: [
          'Caddy provides the public entry point and routes application traffic to the appropriate services. For automatic certificate issuance and renewal, the public hostname must resolve to the server and ports 80 and 443 must reach Caddy.',
        ],
      },
      {
        id: 'after-deployment',
        title: 'After deployment',
        bullets: [
          'Verify sign-in, configured email delivery, uploads, and realtime features with normal user workflows.',
          'Create and test a recoverable backup of PostgreSQL, uploads, and required configuration.',
          'Keep the deployed source, lockfile, Dockerfiles, Compose file, and Caddyfile on the same reviewed release.',
          'Use Upgrades for release changes and Troubleshooting when verification fails.',
        ],
      },
    ],
  },
  backupRestore: {
    title: 'Backup and restore',
    eyebrow: 'Deployment',
    href: '/docs/backup-restore',
    description:
      'Back up application data, uploaded files, and required configuration before upgrades, migrations, or infrastructure changes.',
    cards: [
      {
        title: 'Docker Compose',
        body: 'Review persistent resources and Compose project identity.',
        href: '/docs/docker-compose',
      },
      {
        title: 'Environment variables',
        body: 'Identify deployment configuration and stable security values.',
        href: '/docs/environment-variables',
      },
      {
        title: 'Upgrades',
        body: 'Use backups as the recovery point for version changes.',
        href: '/docs/upgrades',
      },
      {
        title: 'Troubleshooting',
        body: 'Diagnose recovery and persistent-storage failures.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'what-to-back-up',
        title: 'What to back up',
        table: {
          headers: ['Resource', 'Why it matters'],
          rows: [
            [
              'PostgreSQL',
              'Stores community records, memberships, settings, events, audit information, message metadata, and other persistent application data.',
            ],
            [
              'Uploads',
              'Stores avatars, event and task files, and encrypted chat attachment objects referenced by database records.',
            ],
            [
              'Deployment configuration',
              'Preserves `.env`, the selected release, the public hostname, and stable security values needed by restored data.',
            ],
            [
              'Caddy state',
              'Optionally preserves certificate and proxy state; certificates can normally be issued again when DNS and public access are correct.',
            ],
            [
              'Redis state',
              'Contains queued and temporary operational state, not the authoritative community database. Preserve it only as part of a coordinated recovery plan.',
            ],
          ],
        },
        callout: {
          variant: 'warning',
          title: 'A database backup is not complete by itself',
          body: 'When uploaded files are stored separately, restore PostgreSQL and the matching uploads archive together. A database-only restore leaves file records without their stored objects.',
        },
      },
      {
        id: 'stable-security-values',
        title: 'Stable security values',
        body: [
          'Protect the `.env` backup as sensitive data. Restore the values that were active when the backup was created; never print them in support logs or documentation.',
        ],
        table: {
          headers: ['Value', 'Recovery consequence'],
          rows: [
            [
              'PASSWORD_PEPPER and PASSWORD_PEPPER_PREVIOUS',
              'Required to verify existing account passwords, including an in-progress pepper rotation.',
            ],
            [
              'EMAIL_ENCRYPTION_KEY',
              'Required to decrypt protected SMTP and registration-provider credentials saved in the database.',
            ],
            [
              'JWT_SECRET and session settings',
              'Changing them invalidates existing signed sessions and may also affect protected credentials when EMAIL_ENCRYPTION_KEY was not set separately.',
            ],
            [
              'REGISTRATION_KEY_HASH_SECRET',
              'Preserves continuity for privacy-safe registration rate-limit identifiers when configured.',
            ],
            [
              'OWNER_BREAK_GLASS_SECRET',
              'Preserve it only when the operator intends to keep the same optional server-side recovery control.',
            ],
          ],
        },
      },
      {
        id: 'consistent-backup',
        title: 'Create a consistent backup',
        body: [
          'PostgreSQL supports an online logical backup. For the most consistent database-and-uploads recovery point, use a maintenance window and pause services that accept writes before capturing both resources. PE Community does not provide a built-in maintenance mode.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose stop caddy web worker api',
        },
      },
      {
        id: 'postgresql-backup',
        title: 'Back up PostgreSQL',
        body: [
          'Create a PostgreSQL custom-format archive. Store the resulting file outside the production server and protect it as personal data.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value:
            'docker compose exec -T postgres pg_dump -U pe -d pe_community --format=custom > pe-community.dump',
        },
      },
      {
        id: 'uploads-backup',
        title: 'Back up uploads',
        body: [
          'Archive the mounted uploads directory through a temporary application container. This reads the named volume without editing Docker volume files directly.',
          'After the PostgreSQL and uploads archives complete successfully, run `docker compose up -d` to end the maintenance window.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value:
            'docker compose run --rm --no-deps -T api tar -C /app/uploads -czf - . > pe-community-uploads.tar.gz',
        },
      },
      {
        id: 'restore',
        title: 'Restore an installation',
        bullets: [
          '1. Select the application release that matches the backup, or another release explicitly documented as compatible.',
          '2. Restore `.env`, including the original stable security values, and keep the Compose project name unchanged.',
          '3. Start PostgreSQL and Redis without starting the application services.',
          '4. Restore the PostgreSQL archive into a new or intentionally prepared target database.',
          '5. Restore the matching uploads archive into a new or intentionally prepared uploads volume.',
          '6. Start the complete deployment. Pending migrations run during application startup when moving through a supported upgrade path.',
          '7. Validate sign-in, account security, uploaded files, realtime features, background work, and configured email delivery.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value:
            'docker compose up -d postgres redis\ndocker compose exec -T postgres pg_restore -U pe -d pe_community --no-owner < pe-community.dump\ndocker compose run --rm --no-deps -T api tar -C /app/uploads -xzf - < pe-community-uploads.tar.gz\ndocker compose up -d',
        },
        callout: {
          variant: 'warning',
          title: 'Restore only into the intended target',
          body: 'Do not layer a backup over an unrelated active installation. Confirm the target database, uploads volume, Compose project name, and release compatibility before restoring.',
        },
      },
      {
        id: 'recovery-boundaries',
        title: 'Recovery boundaries',
        bullets: [
          'Restore a backup into a compatible release, then follow release-specific upgrade guidance before moving to a newer version.',
          'Server backups do not contain members’ browser private chat keys or recovery passwords. Members must preserve their own encrypted chat-key backups.',
          'Keep the Compose project name unchanged; Docker Compose explains how project identity selects persistent resources.',
        ],
      },
      {
        id: 'verify-and-retain-backups',
        title: 'Verify and retain backups',
        bullets: [
          'A backup is not verified until it has been restored successfully in a controlled environment.',
          'Keep multiple restore points and store copies separately from the production server.',
          'Encrypt backups that contain secrets, personal data, or protected operational configuration.',
          'Test recovery periodically and record the compatible application release for each restore point.',
        ],
      },
    ],
  },
  troubleshooting: {
    title: 'Troubleshooting',
    eyebrow: 'Deployment',
    href: '/docs/troubleshooting',
    description:
      'Diagnose production symptoms with service status, targeted logs, and safe configuration checks.',
    cards: [
      {
        title: 'Environment variables',
        body: 'Check the authoritative deployment values and safe secret-handling guidance.',
        href: '/docs/environment-variables',
      },
      {
        title: 'Docker Compose',
        body: 'Review service names, persistent resources, and lifecycle commands.',
        href: '/docs/docker-compose',
      },
      {
        title: 'Configuration',
        body: 'Review settings managed inside the running application.',
        href: '/docs/configuration',
      },
      {
        title: 'Backup and restore',
        body: 'Protect data before destructive recovery work.',
        href: '/docs/backup-restore',
      },
    ],
    sections: [
      {
        id: 'first-checks',
        title: 'Start with service status and logs',
        body: [
          'Check the deployment as a whole first. When the symptom points to one service, follow that service’s logs instead of collecting unrelated output.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose ps\ndocker compose logs --tail=100',
        },
      },
      {
        id: 'application-does-not-open',
        title: 'Application does not open',
        bullets: [
          'Confirm that the expected services are running with `docker compose ps`.',
          'Check Caddy logs for listener, routing, DNS, and certificate errors.',
          'Confirm the hostname resolves to this server and that inbound ports 80 and 443 are allowed.',
          'Confirm APP_DOMAIN and WEB_ORIGIN use the hostname users actually open.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose logs caddy --tail=100',
        },
      },
      {
        id: 'https-certificate-not-issued',
        title: 'HTTPS certificate is not issued',
        bullets: [
          'Confirm that public A and, when used, AAAA records resolve to reachable addresses on this server.',
          'Confirm ports 80 and 443 reach Caddy and are not intercepted by another service.',
          'Review Caddy logs for the certificate authority response.',
          'Check whether a CDN, proxy, or hosting firewall prevents hostname validation.',
        ],
      },
      {
        id: 'application-actions-fail',
        title: 'Application opens but actions fail',
        body: [
          'Inspect the failed browser request without copying cookies or secrets. Confirm WEB_ORIGIN matches the public origin, then review API and Caddy logs for the same time. A page can load even when an application request is rejected or misrouted.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value:
            'docker compose logs api --tail=100\ndocker compose logs caddy --tail=100',
        },
      },
      {
        id: 'sign-in-does-not-work',
        title: 'Sign-in does not work',
        bullets: [
          'Review API logs without printing passwords, password hashes, cookies, MFA secrets, or JWT values.',
          'Confirm WEB_ORIGIN, HTTPS, and secure-cookie settings match the public deployment.',
          'Confirm the account has an active community membership and complete any required MFA or password-change step.',
          'Confirm the server clock is synchronized so signed-session and MFA time checks are reliable.',
        ],
      },
      {
        id: 'chat-or-realtime-does-not-connect',
        title: 'Chat or realtime features do not connect',
        bullets: [
          'Inspect the browser WebSocket request to `/socket.io` and note its status without exposing session cookies.',
          'Confirm Caddy receives and routes the realtime request.',
          'Leave the explicit realtime origin empty for the standard same-origin deployment, or confirm a custom value points to the correct public origin.',
          'Review API and Caddy logs for connection or authorization failures.',
        ],
      },
      {
        id: 'background-jobs-not-processing',
        title: 'Background jobs are not processing',
        bullets: [
          'Confirm that the worker and Redis services are running.',
          'Review worker and Redis logs for connectivity, queue, and job-specific errors.',
          'Check the affected workflow after the worker recovers; email and asynchronous media cleanup are examples of queued work.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value:
            'docker compose logs worker --tail=100\ndocker compose logs redis --tail=100',
        },
      },
      {
        id: 'email-not-sent',
        title: 'Email is not being sent',
        bullets: [
          'Review the saved community email settings: enabled state, SMTP host and port, secure/TLS mode, username, password, sender email, and sender name.',
          'Save changed settings before sending a test email.',
          'Review worker logs for connection, authentication, and provider errors.',
          'Confirm the server can reach the provider’s outbound SMTP port. Some hosting providers restrict outbound SMTP independently of the server firewall.',
        ],
      },
      {
        id: 'uploaded-files-unavailable',
        title: 'Uploaded files are unavailable',
        bullets: [
          'Confirm that the uploads volume exists and is mounted at the configured uploads path.',
          'Confirm the Compose project name has not changed and selected a different named volume.',
          'Check free disk space and review API logs for filesystem or permission errors.',
          'Do not edit Docker volume contents manually; recover files from a verified matching backup.',
        ],
      },
      {
        id: 'data-appears-missing',
        title: 'Data appears missing after redeployment',
        body: [
          'Changing COMPOSE_PROJECT_NAME can make Docker Compose select a different set of named volumes, causing an existing installation to appear empty. Stop before creating new community data, identify the original project name and volumes, and consult Docker Compose before reconnecting them.',
        ],
        callout: {
          variant: 'warning',
          title: 'Do not initialize over missing data',
          body: 'An empty-looking installation may be attached to new volumes while the original data still exists. Identify the original Compose project and volumes before setup, restore, or deletion work.',
        },
      },
      {
        id: 'database-or-migration-startup-fails',
        title: 'Database or migration startup fails',
        bullets: [
          'Confirm PostgreSQL is running and accepting the configured database credentials.',
          'Review PostgreSQL and API logs for the first migration or connection error.',
          'Do not edit applied migration history or repeatedly force migrations without understanding the database state.',
          'Create or verify a backup before destructive database recovery.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value:
            'docker compose logs postgres --tail=100\ndocker compose logs api --tail=100',
        },
      },
      {
        id: 'disk-space-low',
        title: 'Disk space is low',
        bullets: [
          'Use `df -h` to inspect host filesystems and `docker system df` to understand Docker disk usage.',
          'Identify whether PostgreSQL data, uploads, images, or logs are consuming space before deleting anything.',
          'Move or expire data according to an intentional retention plan. Do not run blanket volume-pruning commands against a production installation.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'df -h\ndocker system df',
        },
      },
      {
        id: 'service-keeps-restarting',
        title: 'A service keeps restarting',
        bullets: [
          'Inspect the service status and its latest 200 log lines.',
          'Check required environment values, PostgreSQL and Redis reachability, migration errors, and malformed configuration.',
          'For Caddy, also check public port conflicts and hostname configuration.',
          'Fix the first reported cause rather than increasing restart delays or repeatedly recreating containers.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose ps\ndocker compose logs <service> --tail=200',
        },
      },
    ],
  },
  architecture: {
    title: 'Architecture',
    eyebrow: 'Platform',
    href: '/docs/architecture',
    description:
      'High-level application, security, job, storage, and same-origin request architecture.',
    sections: [
      {
        id: 'components',
        title: 'Components',
        bullets: [
          'Application interface: browser-facing Next.js application and browser-side encrypted-chat cryptography.',
          'Application API: authentication, authorization, community operations, uploads, and realtime communication.',
          'Background worker: queued email, reminder, registration-notice, automation-delivery, and encrypted-media deletion work.',
          'PostgreSQL: primary application, audit, lifecycle, and aggregate metadata store.',
          'Redis and BullMQ: background queue infrastructure.',
          'Caddy: public HTTP and HTTPS entry point and same-origin reverse proxy.',
          'Uploads: persistent objects including avatars, task attachments, and encrypted chat attachments.',
        ],
        mermaid: {
          title: 'Production components',
          description:
            'The public entry point routes browser traffic to the application interface and API, which coordinate durable data, queues, uploaded objects, and background work.',
          unavailableLabel: 'Diagram unavailable.',
          sources: {
            en: `flowchart TB
  accTitle: Production components
  accDescr: The browser reaches Caddy, which routes to the application interface and API. The API uses PostgreSQL, Redis, and uploaded-file storage. A background worker consumes queued work and updates durable data or uploaded objects.
  Browser["Browser"] --> Caddy["Caddy entry point"]
  Caddy --> Interface["Application interface"]
  Caddy --> API["Application API"]
  Interface -->|Server-side checks| API
  API --> Database[(PostgreSQL)]
  API --> Queue[(Redis and BullMQ)]
  API --> Uploads[(Uploaded-file storage)]
  Queue --> Worker["Background worker"]
  Worker --> Database
  Worker --> Uploads`,
            fr: `flowchart TB
  accTitle: Composants de production
  accDescr: Le navigateur atteint Caddy, qui achemine vers l'interface applicative et l'API. L'API utilise PostgreSQL, Redis et le stockage des fichiers. Un worker consomme les tâches en file et met à jour les données durables ou les fichiers.
  Browser["Navigateur"] --> Caddy["Point d'entrée Caddy"]
  Caddy --> Interface["Interface applicative"]
  Caddy --> API["API applicative"]
  Interface -->|Vérifications serveur| API
  API --> Database[(PostgreSQL)]
  API --> Queue[(Redis et BullMQ)]
  API --> Uploads[(Stockage des fichiers)]
  Queue --> Worker["Worker en arrière-plan"]
  Worker --> Database
  Worker --> Uploads`,
          },
        },
      },
      {
        id: 'request-flow',
        title: 'Request flow',
        body: [
          'The browser talks to one public origin. Caddy sends page traffic to web:3000 and /api/v1 traffic to api:4000. The web server uses INTERNAL_API_URL for server-side setup checks inside the Compose network.',
        ],
        mermaid: {
          title: 'Production request flow',
          description:
            'One public origin separates page, API, uploaded-file, and realtime traffic at the reverse proxy.',
          unavailableLabel: 'Diagram unavailable.',
          sources: {
            en: `flowchart TB
  accTitle: Production request flow
  accDescr: Browser traffic reaches one Caddy origin. Page traffic goes to the application interface. API, upload, and realtime traffic go to the application API. The interface also uses the API for server-side checks.
  Browser["Browser"] requestToProxy@--> Caddy["Caddy"]
  Caddy pagesToInterface@-->|Pages| Interface["Application interface"]
  Caddy apiRequest@-->|API requests| API["Application API"]
  Caddy uploadRequest@-->|Uploaded files| API
  Caddy realtimeRequest@-->|Realtime connection| Realtime["API realtime service"]
  Interface serverCheck@-->|Server-side checks| API
  Realtime realtimeToApi@--> API
  requestToProxy@{ animation: fast }
  pagesToInterface@{ animation: fast }
  apiRequest@{ animation: fast }
  uploadRequest@{ animation: fast }
  realtimeRequest@{ animation: fast }
  serverCheck@{ animation: fast }
  realtimeToApi@{ animation: fast }`,
            fr: `flowchart TB
  accTitle: Flux des requêtes en production
  accDescr: Le trafic du navigateur atteint une origine Caddy unique. Les pages vont vers l'interface applicative. Les requêtes API, fichiers et connexions temps réel vont vers l'API. L'interface utilise aussi l'API pour les vérifications serveur.
  Browser["Navigateur"] requestToProxy@--> Caddy["Caddy"]
  Caddy pagesToInterface@-->|Pages| Interface["Interface applicative"]
  Caddy apiRequest@-->|Requêtes API| API["API applicative"]
  Caddy uploadRequest@-->|Fichiers téléversés| API
  Caddy realtimeRequest@-->|Connexion temps réel| Realtime["Service temps réel de l'API"]
  Interface serverCheck@-->|Vérifications serveur| API
  Realtime realtimeToApi@--> API
  requestToProxy@{ animation: fast }
  pagesToInterface@{ animation: fast }
  apiRequest@{ animation: fast }
  uploadRequest@{ animation: fast }
  realtimeRequest@{ animation: fast }
  serverCheck@{ animation: fast }
  realtimeToApi@{ animation: fast }`,
          },
        },
      },
      {
        id: 'setup-flow',
        title: 'First-run setup flow',
        body: [
          'A clean install opens the setup path once. After the first community and owner exist, setup is locked and owners sign in through the normal login flow.',
        ],
        mermaid: {
          title: 'First-run setup flow',
          description:
            'Initialization is available only to a fresh installation and closes after the first community and Owner are created.',
          unavailableLabel: 'Diagram unavailable.',
          sources: {
            en: `flowchart TD
  accTitle: First-run setup flow
  accDescr: A fresh installation checks whether setup is available, validates protected initialization, creates the first community and Owner in one transaction, closes setup, and continues through normal sign-in.
  Fresh["Fresh installation"] --> Check{"Setup available?"}
  Check -->|No| SignIn["Normal sign-in"]
  Check -->|Yes| Protect["Validate protected initialization"]
  Protect --> Create["Create community, roles, settings, and first Owner"]
  Create --> Locked["Setup closes"]
  Locked --> SignIn`,
            fr: `flowchart TD
  accTitle: Flux de configuration initiale
  accDescr: Une installation neuve vérifie la disponibilité du setup, valide l'initialisation protégée, crée la première communauté et le premier Owner dans une transaction, ferme le setup puis poursuit avec la connexion normale.
  Fresh["Installation neuve"] --> Check{"Setup disponible ?"}
  Check -->|Non| SignIn["Connexion normale"]
  Check -->|Oui| Protect["Valider l'initialisation protégée"]
  Protect --> Create["Créer communauté, rôles, paramètres et premier Owner"]
  Create --> Locked["Fermeture du setup"]
  Locked --> SignIn`,
          },
        },
      },
      {
        id: 'background-jobs',
        title: 'Background job flow',
        body: [
          'The API enqueues work in Redis/BullMQ. The worker consumes queue jobs and performs background email and notification processing.',
        ],
        mermaid: {
          title: 'Background job flow',
          description:
            'The application queues work, and the worker reloads durable state before delivery or encrypted-object deletion and then records the outcome.',
          unavailableLabel: 'Diagram unavailable.',
          sources: {
            en: `flowchart TD
  accTitle: Background job flow
  accDescr: The application adds asynchronous work to Redis and BullMQ. The worker claims it, reloads current PostgreSQL state, performs email delivery or encrypted object deletion, and records the result.
  App["Application"] enqueueJob@--> Queue["Redis and BullMQ queue"]
  Queue claimJob@--> Worker["Background worker"]
  Worker loadState@--> State["Reload current PostgreSQL state"]
  State evaluateJob@--> Kind{"Current job type"}
  Kind deliverEmail@-->|Email or notification| Provider["Email provider"]
  Kind deleteObject@-->|Encrypted media deletion| Uploads["Encrypted uploads"]
  Provider recordDelivery@--> Outcome["Record outcome"]
  Uploads recordDeletion@--> Outcome
  Outcome persistOutcome@--> DB[(PostgreSQL)]
  enqueueJob@{ animation: fast }
  claimJob@{ animation: fast }
  loadState@{ animation: slow }
  evaluateJob@{ animation: slow }
  deliverEmail@{ animation: fast }
  deleteObject@{ animation: slow }
  recordDelivery@{ animation: slow }
  recordDeletion@{ animation: slow }
  persistOutcome@{ animation: slow }`,
            fr: `flowchart TD
  accTitle: Flux des tâches en arrière-plan
  accDescr: L'application ajoute une tâche asynchrone à Redis et BullMQ. Le worker la prend, recharge l'état PostgreSQL actuel, effectue la livraison email ou la suppression d'un objet chiffré, puis enregistre le résultat.
  App["Application"] enqueueJob@--> Queue["File Redis et BullMQ"]
  Queue claimJob@--> Worker["Worker en arrière-plan"]
  Worker loadState@--> State["Recharger l'état PostgreSQL actuel"]
  State evaluateJob@--> Kind{"Type de tâche actuel"}
  Kind deliverEmail@-->|Email ou notification| Provider["Fournisseur email"]
  Kind deleteObject@-->|Suppression de média chiffré| Uploads["Fichiers chiffrés"]
  Provider recordDelivery@--> Outcome["Enregistrer le résultat"]
  Uploads recordDeletion@--> Outcome
  Outcome persistOutcome@--> DB[(PostgreSQL)]
  enqueueJob@{ animation: fast }
  claimJob@{ animation: fast }
  loadState@{ animation: slow }
  evaluateJob@{ animation: slow }
  deliverEmail@{ animation: fast }
  deleteObject@{ animation: slow }
  recordDelivery@{ animation: slow }
  recordDeletion@{ animation: slow }
  persistOutcome@{ animation: slow }`,
          },
        },
      },
      {
        id: 'notification-flow',
        title: 'Notification flow',
        body: [
          'Application services create audience-scoped notification records. The authenticated web shell reads the appropriate Admin or Member endpoint, maintains unread counts, and presents temporary Sonner toasts without changing read state. Optional email delivery is queued separately.',
        ],
        mermaid: {
          title: 'Notification flow',
          description:
            'Persistent notification state, transient interface feedback, and optional email delivery remain distinct.',
          unavailableLabel: 'Diagram unavailable.',
          sources: {
            en: `flowchart TD
  accTitle: Notification flow
  accDescr: An application event creates an audience-scoped notification record. The correct Admin tray or Member drawer reads it and owns unread state. A temporary toast may surface the event without marking it read. Optional email is queued separately.
  Event["Application event"] eventToRecord@--> Record["Audience-scoped notification record"]
  Record recordToSurface@--> Surface["Admin tray or Member drawer"]
  Surface --> Unread["Persistent unread state"]
  Record -.-> Toast["Temporary toast"]
  Event -.-> Optional{"Email enabled and eligible?"}
  Optional emailToQueue@-->|Yes| Queue["Queued email delivery"]
  Optional -->|No| Done["In-app delivery only"]
  eventToRecord@{ animation: slow }
  recordToSurface@{ animation: fast }
  emailToQueue@{ animation: fast }`,
            fr: `flowchart TD
  accTitle: Flux de notification
  accDescr: Un événement applicatif crée une notification limitée à son public. Le panneau Admin ou Membre approprié la lit et gère l'état non lu. Un toast temporaire peut signaler l'événement sans le marquer comme lu. L'email facultatif est mis en file séparément.
  Event["Événement applicatif"] eventToRecord@--> Record["Notification limitée à son public"]
  Record recordToSurface@--> Surface["Panneau Admin ou Membre"]
  Surface --> Unread["État non lu persistant"]
  Record -.-> Toast["Toast temporaire"]
  Event -.-> Optional{"Email activé et éligible ?"}
  Optional emailToQueue@-->|Oui| Queue["Livraison email en file"]
  Optional -->|Non| Done["Livraison dans l'application uniquement"]
  eventToRecord@{ animation: slow }
  recordToSurface@{ animation: fast }
  emailToQueue@{ animation: fast }`,
          },
        },
      },
      {
        id: 'automation-flow',
        title: 'Automation flow',
        body: [
          'Published Task Board rules are evaluated using task state, community timezone, recipients, delivery availability, and deduplication state. Runs record live, dry-run, or test-notification outcomes; queued email delivery is handled by the worker.',
        ],
        mermaid: {
          title: 'Automation lifecycle',
          description:
            'Every run reevaluates current board, rule, task, event, recipient, channel, and deduplication state before it can execute.',
          unavailableLabel: 'Diagram unavailable.',
          sources: {
            en: `flowchart TD
  accTitle: Automation lifecycle
  accDescr: A published rule reevaluates current eligibility. Ineligible or duplicate work is recorded as skipped. Eligible work executes, records its outcome, and queues email only when that channel is selected and available.
  Rule["Published rule"] evaluateEligibility@--> Eligibility{"Reevaluate current eligibility"}
  Eligibility -->|Board, rule, task, or event is ineligible| Skipped
  Eligibility resolveDelivery@-->|Eligible now| Recipients{"Resolve recipients and channels"}
  Recipients -->|No recipient, channel, or duplicate work| Skipped
  Recipients executeAction@-->|Delivery is eligible| Execute["Execute eligible action"]
  Execute recordOutcome@--> Recorded["Record outcome"]
  Recorded dispatchEmail@-->|Email selected| EmailQueue["Queue email delivery"]
  Recorded -->|In-app only| Done["Run complete"]
  EmailQueue --> Done
  Skipped["Record Skipped"] --> Done
  evaluateEligibility@{ animation: slow }
  resolveDelivery@{ animation: slow }
  executeAction@{ animation: slow }
  recordOutcome@{ animation: slow }
  dispatchEmail@{ animation: fast }`,
            fr: `flowchart TD
  accTitle: Cycle de vie d'une automatisation
  accDescr: Une règle publiée réévalue l'éligibilité actuelle. Le travail inéligible ou dupliqué est enregistré comme ignoré. Le travail éligible s'exécute, enregistre son résultat et met l'email en file seulement si ce canal est sélectionné et disponible.
  Rule["Règle publiée"] evaluateEligibility@--> Eligibility{"Réévaluer l'éligibilité actuelle"}
  Eligibility -->|Tableau, règle, tâche ou événement inéligible| Skipped
  Eligibility resolveDelivery@-->|Éligible maintenant| Recipients{"Résoudre destinataires et canaux"}
  Recipients -->|Aucun destinataire, canal ou travail dupliqué| Skipped
  Recipients executeAction@-->|Livraison éligible| Execute["Exécuter l'action éligible"]
  Execute recordOutcome@--> Recorded["Enregistrer le résultat"]
  Recorded dispatchEmail@-->|Email sélectionné| EmailQueue["Mettre la livraison email en file"]
  Recorded -->|Dans l'application uniquement| Done["Exécution terminée"]
  EmailQueue --> Done
  Skipped["Enregistrer Ignoré"] --> Done
  evaluateEligibility@{ animation: slow }
  resolveDelivery@{ animation: slow }
  executeAction@{ animation: slow }
  recordOutcome@{ animation: slow }
  dispatchEmail@{ animation: fast }`,
          },
        },
      },
      {
        id: 'chat-boundary',
        title: 'Encrypted-chat boundary',
        body: [
          'The browser owns private keys and plaintext encryption/decryption. The API authorizes participants and devices, validates immutable public-key versions, and stores ciphertext plus safe metadata. PostgreSQL tracks lifecycle and aggregate media accounting while encrypted objects remain in uploads storage.',
        ],
        mermaid: {
          title: 'Encrypted chat boundary',
          description:
            'Participant browsers own plaintext and private keys; the service authorizes participants while transporting ciphertext and encrypted attachment objects.',
          unavailableLabel: 'Diagram unavailable.',
          sources: {
            en: `sequenceDiagram
  accTitle: Encrypted chat boundary
  accDescr: The sender encrypts content in an authorized browser. The API authorizes participants and devices, stores ciphertext and safe metadata in PostgreSQL, stores encrypted attachment objects in uploads, and returns ciphertext for local recipient decryption.
  participant Sender as Sender browser
  participant API as Application API
  participant DB as PostgreSQL
  participant Uploads as Encrypted uploads
  participant Recipient as Recipient browser
  Sender->>Sender: Encrypt with local key material
  Sender->>API: Ciphertext and safe metadata
  API->>API: Authorize participant and device
  API->>DB: Store ciphertext and lifecycle metadata
  opt Encrypted attachment
    API->>Uploads: Store encrypted object
  end
  Recipient->>API: Request participant-visible messages
  API->>Recipient: Ciphertext and encrypted object
  Recipient->>Recipient: Decrypt locally`,
            fr: `sequenceDiagram
  accTitle: Frontière du chat chiffré
  accDescr: L'expéditeur chiffre le contenu dans un navigateur autorisé. L'API autorise participants et appareils, stocke le texte chiffré et les métadonnées sûres dans PostgreSQL, stocke les pièces jointes chiffrées, puis renvoie le contenu chiffré pour le déchiffrement local du destinataire.
  participant Sender as Navigateur expéditeur
  participant API as API applicative
  participant DB as PostgreSQL
  participant Uploads as Fichiers chiffrés
  participant Recipient as Navigateur destinataire
  Sender->>Sender: Chiffrer avec les clés locales
  Sender->>API: Contenu chiffré et métadonnées sûres
  API->>API: Autoriser participant et appareil
  API->>DB: Stocker contenu chiffré et cycle de vie
  opt Pièce jointe chiffrée
    API->>Uploads: Stocker l'objet chiffré
  end
  Recipient->>API: Demander les messages visibles du participant
  API->>Recipient: Contenu et objet chiffrés
  Recipient->>Recipient: Déchiffrer localement`,
          },
        },
      },
    ],
  },
  upgrades: {
    title: 'Upgrades',
    eyebrow: 'Deployment',
    href: '/docs/upgrades',
    description:
      'Back up the installation, select the target release, pull the published images, and recreate the deployment.',
    cards: [
      {
        title: 'Backup and restore',
        body: 'Create and verify the recovery point required before upgrading.',
        href: '/docs/backup-restore',
      },
      {
        title: 'Docker Compose',
        body: 'Review release variables, project identity, and lifecycle behavior.',
        href: '/docs/docker-compose',
      },
      {
        title: 'Troubleshooting',
        body: 'Diagnose startup or migration failures after a release change.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'before-upgrading',
        title: 'Before upgrading',
        bullets: [
          'Read the target release notes and confirm that the installed release has a supported path to it.',
          'Create and verify a PostgreSQL, uploads, and configuration backup.',
          'Record the installed source revision and confirm enough disk space is available for rebuilt images and the backup.',
          'Confirm the existing deployment is stable enough that new upgrade failures can be distinguished from earlier problems.',
        ],
      },
      {
        id: 'select-the-release',
        title: 'Select the release',
        body: [
          'Obtain a documented source release and review its release notes before replacing application source or deployment files. Keep `.env`, backups, and persistent volumes outside the source replacement.',
        ],
      },
      {
        id: 'pull-and-apply',
        title: 'Build and apply the release',
        body: [
          'Build the selected source release, then let Docker Compose recreate services whose image changed. Named volumes remain attached when the Compose project name is unchanged. This procedure does not promise zero downtime.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose -f docker-compose.prod.yml up -d --build',
        },
      },
      {
        id: 'database-migrations',
        title: 'Database migrations',
        body: [
          'Pending database migrations are applied before the API starts accepting traffic. Back up before upgrading, allow the startup migration to complete once, and inspect the first migration error instead of repeatedly forcing migration commands.',
        ],
        callout: {
          variant: 'warning',
          title: 'Database changes can limit rollback',
          body: 'An older application image may not be compatible after a newer release changes the database schema. Treat the pre-upgrade database and uploads backup as the recovery point.',
        },
      },
      {
        id: 'verify-the-upgrade',
        title: 'Verify the upgrade',
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose ps',
        },
        bullets: [
          'Open the application and confirm sign-in and the main authenticated workspace.',
          'Confirm realtime features connect and uploaded files remain available.',
          'Confirm background jobs run and send a test email when email delivery is configured.',
          'Review release-specific workflows called out in the release notes.',
        ],
      },
      {
        id: 'upgrade-failure',
        title: 'If the upgrade fails',
        body: [
          'Check service status and the latest logs, then use Troubleshooting to isolate startup, migration, storage, or configuration failures. Do not repeatedly restart a migration failure without preserving and understanding the first error.',
        ],
        code: {
          label: 'Terminal',
          language: 'shell',
          value: 'docker compose ps\ndocker compose logs --tail=100',
        },
      },
      {
        id: 'rollback',
        title: 'Rollback',
        body: [
          'Do not assume that restoring earlier source is a complete rollback. Consult the release notes. When the upgraded database is incompatible with the earlier release, restore the pre-upgrade PostgreSQL and uploads backup and run the matching application revision.',
          'Keep the Compose project name unchanged throughout upgrade and recovery; Docker Compose is the authoritative guide to project identity and persistent resources.',
        ],
      },
    ],
  },
  contributing: {
    title: 'Contributing',
    eyebrow: 'Community',
    href: '/docs/contributing',
    description:
      'Work on the existing monorepo with focused, reviewable changes.',
    sections: [
      {
        id: 'development-workflow',
        title: 'Development workflow',
        code: {
          label: 'local development',
          value:
            'docker compose up -d postgres redis\npnpm install\npnpm db:migrate\npnpm api:dev\npnpm web:dev\npnpm worker:dev',
        },
      },
      {
        id: 'contribution-standards',
        title: 'Contribution standards',
        bullets: [
          'Keep changes focused and easy to review.',
          'Follow existing module, component, naming, and permission patterns before adding abstractions.',
          'Include verification notes for builds, type checks, tests, migrations, and Docker changes that apply.',
          'Avoid committing local environment files, generated build output, dependency folders, uploaded files, or temporary artifacts.',
          'Update EN and FR documentation when behavior, configuration, security boundaries, or operator steps change.',
          'Keep maintainer implementation records separate from audience-focused documentation.',
          'Review authentication, authorization, encrypted chat, storage deletion, and automation changes as security-sensitive.',
        ],
      },
      {
        id: 'migration-discipline',
        title: 'Prisma migration discipline',
        body: [
          'Generate migrations from the current schema, inspect SQL before applying it, and use Prisma status and resolve workflows for failures. Never edit or delete an applied migration to repair an active database. Prefer an additive corrective migration and roll-forward recovery.',
        ],
      },
      {
        id: 'checks',
        title: 'Checks before PR',
        code: {
          label: 'verification',
          value:
            'pnpm --filter @pe/api build\npnpm --filter @pe/web build\npnpm --filter @pe/worker build\ngit diff --check',
        },
      },
    ],
  },
};

const focusedDocsPagesFr: Pick<
  Record<DocsPageKey, DocsPage>,
  'overview' | 'gettingStarted'
> = {
  overview: {
    title: 'Documentation PE Community Management',
    eyebrow: 'Documentation',
    href: '/docs',
    description:
      'Utilisez cette documentation pour configurer, administrer, sécuriser, exploiter et faire évoluer PE Community Management.',
    cards: [
      {
        title: 'Bien démarrer',
        body: 'Comprendre les espaces, les rôles et les premières étapes.',
        href: '/docs/getting-started',
      },
      {
        title: 'Configuration initiale',
        body: 'Initialiser la première communauté et le compte Owner.',
        href: '/docs/first-run-setup',
      },
      {
        title: 'Administration',
        body: 'Gérer les membres, la communication, le travail et la gouvernance.',
        href: '/docs/administration',
      },
      {
        title: 'Notifications',
        body: 'Comprendre les éléments non lus, la diffusion et les préférences.',
        href: '/docs/notifications',
      },
      {
        title: 'Automatisation',
        body: 'Configurer, tester et examiner les règles des tableaux de tâches.',
        href: '/docs/automation',
      },
      {
        title: 'Chat chiffré',
        body: 'Gérer la récupération, les appareils autorisés et les médias chiffrés.',
        href: '/docs/encrypted-chat',
      },
      {
        title: 'Sécurité',
        body: 'Examiner l’authentification, les permissions, les sessions et les frontières de chiffrement.',
        href: '/docs/security',
      },
      {
        title: 'Architecture',
        body: 'Comprendre les services, les flux de données et le travail en arrière-plan.',
        href: '/docs/architecture',
      },
    ],
    sections: [
      {
        id: 'choose-where-to-begin',
        title: 'Choisir par où commencer',
        body: [
          'Les guides sont organisés par tâche et par public. Commencez par le parcours qui correspond à votre rôle ou à votre objectif.',
        ],
        bullets: [
          'Configurer une nouvelle communauté : utilisez Installation, Variables d’environnement, Docker Compose et Configuration initiale pour préparer l’application, initialiser la communauté, créer le compte Owner et confirmer les valeurs par défaut de langue et de fuseau horaire.',
          'Administrer une communauté : les Owners et Admins autorisés doivent consulter Administration, Notifications, Automatisation et Sécurité pour gérer les membres, la communication, les événements, les tableaux de tâches, la gouvernance et l’activité d’audit.',
          'Utiliser l’espace Membre : commencez par Bien démarrer, puis consultez Notifications et Chat chiffré pour les actualités, les préférences, les horaires, le travail attribué et la communication sécurisée.',
          'Maintenir ou contribuer : consultez Architecture, Configuration, Dépannage et Contribution avant d’exploiter le déploiement ou de modifier le code.',
        ],
      },
      {
        id: 'platform-model',
        title: 'Modèle de la plateforme',
        body: [
          'PE Community Management sépare l’administration de la communauté de la participation des membres. Les accès dépendent des permissions et restent limités à la communauté concernée.',
        ],
        bullets: [
          'Espace administratif : l’Owner et les Admins autorisés gèrent les adhésions, les annonces, les événements, les tableaux de tâches, les automatisations, les notifications, la gouvernance du stockage et les activités d’audit prises en charge, selon leurs permissions.',
          'Espace Membre : les Members utilisent les profils, les informations de la communauté, le travail attribué, les horaires, les préférences, les notifications et les communications chiffrées mises à leur disposition.',
        ],
      },
      {
        id: 'before-you-begin',
        title: 'Avant de commencer',
        bullets: [
          'La configuration initiale ne s’effectue qu’une fois : les migrations Prisma préparent la base de données, puis /setup initialise la première communauté et crée son premier Owner. L’initialisation ne peut pas être répétée une fois terminée.',
          'Les données de démonstration ne sont pas des données de production : le seed de démonstration est réservé au développement, aux tests et aux démonstrations. Un déploiement normal utilise les migrations et la configuration initiale.',
          'La sécurité du compte et la récupération du chat chiffré sont distinctes : le mot de passe protège l’accès à l’application, tandis que les sauvegardes du chat utilisent un matériel de récupération séparé qui ne dépend pas du hash du mot de passe du compte.',
          'La langue et le fuseau horaire tiennent compte de la communauté : la configuration initiale définit EN ou FR et un fuseau horaire par défaut. Les préférences utilisateur prises en charge peuvent affiner l’affichage, et les dates et heures suivent le contexte applicable de la communauté ou de l’utilisateur.',
        ],
      },
      {
        id: 'documentation-coverage',
        title: 'Périmètre de la documentation',
        bullets: [
          'Installation et initialisation de la première utilisation.',
          'Configuration de la communauté, rôles, permissions et administration.',
          'Notifications, communication, automatisation des tableaux de tâches et récupération du chat chiffré.',
          'Gouvernance du stockage, architecture de sécurité, fondamentaux de sauvegarde et restauration, dépannage et contribution.',
        ],
      },
      {
        id: 'deployment-guidance-boundary',
        title: 'Limite des conseils de déploiement',
        body: [
          'Les conseils de déploiement couvrent le parcours Docker Compose pris en charge.',
        ],
        callout: {
          variant: 'production',
          title: 'Des conseils de production volontairement ciblés',
          body: 'Les conseils sur les images de version publiées, le dimensionnement de production, la haute disponibilité, les sauvegardes automatisées et les mises à niveau sans interruption seront finalisés après validation en production.',
        },
      },
      {
        id: 'recommended-next-steps',
        title: 'Étapes suivantes recommandées',
        body: [
          'Commencez par Bien démarrer pour comprendre le modèle du produit. Pour une nouvelle installation, poursuivez avec Installation et Configuration initiale ; pour une communauté existante, choisissez le guide Administration, Notifications, Automatisation, Chat chiffré, Sécurité ou Architecture qui correspond à votre tâche.',
        ],
      },
    ],
  },
  gettingStarted: {
    title: 'Bien démarrer',
    eyebrow: 'Vue d’ensemble',
    href: '/docs/getting-started',
    description:
      'Comprenez l’organisation de la plateforme, identifiez votre rôle et suivez les premières étapes opérationnelles adaptées.',
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
        body: [
          'PE Community Management offre aux équipes communautaires un espace unique pour gérer les membres, la communication, les événements, le travail collaboratif et l’administration quotidienne.',
          'La plateforme est open source et conçue pour l’auto-hébergement. L’organisation qui l’exploite contrôle le déploiement, la base de données, le fournisseur de messagerie, le stockage des fichiers et le processus de sauvegarde.',
        ],
      },
      {
        id: 'how-the-platform-is-organized',
        title: 'Organisation de la plateforme',
        body: [
          'La plateforme utilise des espaces administratif et Membre distincts afin que l’autorité opérationnelle ne donne pas, par défaut, accès aux activités des participants.',
        ],
        bullets: [
          'Espace administratif : l’Owner et les Admins autorisés gèrent les membres, les annonces, les événements, les tableaux de tâches, les automatisations, les journaux d’audit, les paramètres de communication et les contrôles opérationnels pris en charge.',
          'Espace Membre : les Members gèrent leur profil et leurs préférences, utilisent l’annuaire, suivent le Feed et les notifications, consultent leurs horaires et tâches attribuées, et utilisent le chat chiffré lorsqu’il leur est accessible.',
          'La configuration initiale crée l’Owner avec un accès administratif complet. L’Owner peut déléguer les permissions prises en charge ; l’accès des Admins dépend de ces attributions, tandis que l’accès des Members reste orienté participant.',
        ],
      },
      {
        id: 'choose-where-to-begin',
        title: 'Choisir par où commencer',
        bullets: [
          'Nouvel Owner : terminez la configuration initiale, connectez-vous, examinez les paramètres de la communauté, confirmez la langue et le fuseau horaire, configurez l’envoi des emails avant les actions qui en dépendent, vérifiez les permissions et commencez l’intégration des membres.',
          'Owner ou Admin existant : consultez Administration et vos permissions attribuées, puis commencez par les demandes d’adhésion, annonces, événements, tableaux de tâches, automatisations ou activités d’audit qui relèvent de votre mission.',
          'Member : connectez-vous à l’espace Membre, complétez votre profil, consultez les actualités, gérez vos préférences de notification, vérifiez vos horaires et travaux attribués, puis utilisez le chat chiffré lorsqu’il est activé et autorisé.',
          'Mainteneur : consultez Architecture, Configuration, Variables d’environnement, Dépannage et Contribution avant de modifier ou d’exploiter la plateforme.',
        ],
      },
      {
        id: 'first-steps-for-a-new-community',
        title: 'Premières étapes pour une nouvelle communauté',
        bullets: [
          '1. Terminez la configuration initiale.',
          '2. Connectez-vous en tant qu’Owner et examinez les paramètres de la communauté.',
          '3. Confirmez la langue et le fuseau horaire par défaut.',
          '4. Configurez l’envoi des emails avant toute communication qui en dépend.',
          '5. Examinez les rôles et permissions avant de déléguer un accès Admin.',
          '6. Ajoutez des membres ou examinez les demandes d’adhésion.',
          '7. Publiez une première annonce ou créez un événement lorsque la communauté est prête.',
        ],
      },
      {
        id: 'core-operating-areas',
        title: 'Principaux domaines opérationnels',
        bullets: [
          'Membres et accès : les demandes approuvées peuvent devenir des dossiers membres. Les Owners et Admins autorisés gèrent les informations des membres, tandis que les rôles et permissions contrôlent les accès.',
          'Communication : les annonces, le Feed, les notifications, les emails ainsi que les rappels et modèles pris en charge servent des publics définis. Les surfaces de notification administratives et Membres restent séparées.',
          'Événements et travail collaboratif : les événements et calendriers coordonnent les horaires, tandis que les tableaux de tâches, les modèles de tâches réutilisables et les automatisations structurent le travail attribué et répétitif.',
          'Communication chiffrée : le contenu des chats directs et de groupe est chiffré de bout en bout. Le matériel de clé privée reste sur les appareils autorisés ou dans des sauvegardes chiffrées ; l’autorisation des appareils, la récupération et la gouvernance des médias chiffrés restent distinctes de la sécurité du mot de passe du compte.',
          'Gouvernance et responsabilité : les journaux d’audit enregistrent les activités administratives et sensibles prises en charge. Les permissions, confirmations, limites d’appareils et contrôles de stockage renforcent la gouvernance sans donner aux Admins accès au contenu déchiffré des chats privés.',
        ],
      },
      {
        id: 'data-ownership-and-responsibility',
        title: 'Propriété des données et responsabilités',
        body: [
          'L’opérateur auto-hébergeur contrôle les données PostgreSQL, les travaux en file et états temporaires gérés par Redis, la configuration des emails sortants, le stockage des fichiers et médias chiffrés, les sauvegardes de la base et du stockage objet, les secrets d’exécution et les accès à l’infrastructure.',
          'Ce contrôle implique la responsabilité de la disponibilité, des mises à niveau, des sauvegardes, des tests de restauration et de la sécurité de l’infrastructure. Redis prend en charge les travaux en file et les états temporaires ; il ne constitue pas le stockage permanent de référence des données communautaires.',
        ],
      },
      {
        id: 'continue-with',
        title: 'Poursuivre avec',
        bullets: [
          'Configuration initiale pour initialiser la première communauté.',
          'Administration pour les rôles, permissions, opérations membres et la gouvernance.',
          'Configuration pour les paramètres opérationnels de la communauté.',
          'Notifications pour la séparation des publics, les éléments non lus et les préférences.',
          'Automatisation pour les règles des tableaux de tâches, les tests et l’historique des exécutions.',
          'Chat chiffré pour la confidentialité, la récupération, les appareils autorisés et les médias chiffrés.',
          'Sécurité pour l’authentification, les sessions, les permissions et les frontières de chiffrement.',
          'Dépannage pour les problèmes vérifiés de configuration et d’exploitation.',
        ],
      },
    ],
  },
};

const deploymentOperationsDocsTextFr: Record<string, string> = {
  'Deploy PE Community on a server using the production Compose configuration and a hostname that resolves to the server.':
    'Déployez PE Community sur un serveur avec la configuration Compose de production et un nom d’hôte qui pointe vers ce serveur.',
  'Prepare the server and required deployment files.':
    'Préparez le serveur et les fichiers requis pour le déploiement.',
  'Configure the hostname, origin, secrets, and optional services.':
    'Configurez le nom d’hôte, l’origine, les secrets et les services facultatifs.',
  'Use the authoritative container, volume, and lifecycle reference.':
    'Consultez le guide de référence des conteneurs, des volumes et de leur cycle de vie.',
  'Protect the installation before and after going live.':
    'Protégez l’installation avant et après sa mise en service.',
  'Diagnose startup, HTTPS, and application failures.':
    'Diagnostiquez les échecs de démarrage, HTTPS et applicatifs.',
  'Before deployment': 'Avant le déploiement',
  'Prepare a supported server with Docker Engine and the Docker Compose plugin.':
    'Préparez un serveur pris en charge avec Docker Engine et le plugin Docker Compose.',
  'Complete `.env`, obtain the production `compose.yml`, and place the Caddy configuration beside it when distributed separately.':
    'Complétez `.env`, obtenez le fichier `compose.yml` de production et placez la configuration Caddy à côté lorsqu’elle est distribuée séparément.',
  'Choose the public hostname, prepare its DNS records, and confirm that ports 80 and 443 can reach the server.':
    'Choisissez le nom d’hôte public, préparez ses enregistrements DNS et vérifiez que les ports 80 et 443 atteignent le serveur.',
  'Review Docker Compose for image placeholders, project identity, persistent volumes, and standard lifecycle commands.':
    'Consultez Docker Compose pour les images provisoires, l’identité du projet, les volumes persistants et les commandes standard du cycle de vie.',
  'Understand the backup and recovery plan before the installation receives production data.':
    'Comprenez le plan de sauvegarde et de récupération avant que l’installation ne reçoive des données de production.',
  'Configure the hostname': 'Configurer le nom d’hôte',
  'Use the hostname that members will open. APP_DOMAIN gives Caddy its public hostname, while WEB_ORIGIN must use the same HTTPS origin so browser sessions and application requests remain aligned.':
    'Utilisez le nom d’hôte que les membres ouvriront. APP_DOMAIN fournit à Caddy son nom d’hôte public, tandis que WEB_ORIGIN doit utiliser la même origine HTTPS pour maintenir l’alignement des sessions navigateur et des requêtes applicatives.',
  'Create an A record that points the hostname to the server’s public IPv4 address.':
    'Créez un enregistrement A qui pointe le nom d’hôte vers l’adresse IPv4 publique du serveur.',
  'Create an AAAA record only when IPv6 is configured and reachable on the server.':
    'Créez un enregistrement AAAA uniquement si IPv6 est configuré et joignable sur le serveur.',
  'Allow DNS changes to propagate before diagnosing certificate issuance.':
    'Laissez les changements DNS se propager avant de diagnostiquer l’émission du certificat.',
  'When using a CDN or proxy, keep its DNS, TLS, and firewall behavior compatible with Caddy serving the configured hostname.':
    'Avec un CDN ou un proxy, conservez un comportement DNS, TLS et pare-feu compatible avec la mise à disposition du nom d’hôte configuré par Caddy.',
  'Firewall and public ports': 'Pare-feu et ports publics',
  'Secure administrative access separately using the operator’s chosen SSH policy. PostgreSQL, Redis, and internal application services do not need public ports in the standard deployment.':
    'Sécurisez séparément l’accès administratif selon la politique SSH choisie par l’opérateur. PostgreSQL, Redis et les services applicatifs internes ne nécessitent aucun port public dans le déploiement standard.',
  'HTTP access, HTTPS redirects, and certificate validation.':
    'Accès HTTP, redirections HTTPS et validation des certificats.',
  'HTTPS application traffic.': 'Trafic applicatif HTTPS.',
  'HTTP/3 traffic where the network and host support it.':
    'Trafic HTTP/3 lorsque le réseau et l’hôte le prennent en charge.',
  'Start the deployment': 'Démarrer le déploiement',
  'From the reviewed source release, build and start the production Compose deployment. The canonical workflow does not depend on unpublished container images.':
    'Depuis la version source examinée, construisez et démarrez le déploiement Compose de production. Le parcours de référence ne dépend pas d’images de conteneur non publiées.',
  'Verify the deployment': 'Vérifier le déploiement',
  'Confirm that the expected services are running and that reported health checks complete successfully.':
    'Vérifiez que les services attendus fonctionnent et que les contrôles de santé déclarés aboutissent.',
  'Open the HTTPS hostname and confirm that the first-run or sign-in screen appears as appropriate.':
    'Ouvrez le nom d’hôte HTTPS et vérifiez que l’écran de configuration initiale ou de connexion apparaît selon l’état de l’installation.',
  'Test sign-in and a normal authenticated page.':
    'Testez la connexion et une page authentifiée normale.',
  'Confirm that realtime-dependent features connect and that an uploaded file remains available.':
    'Vérifiez que les fonctionnalités en temps réel se connectent et qu’un fichier téléversé reste disponible.',
  'Send a test email when community email delivery is configured.':
    'Envoyez un email de test lorsque la livraison des emails communautaires est configurée.',
  'Caddy provides the public entry point and routes application traffic to the appropriate services. For automatic certificate issuance and renewal, the public hostname must resolve to the server and ports 80 and 443 must reach Caddy.':
    'Caddy fournit le point d’entrée public et dirige le trafic applicatif vers les services appropriés. Pour l’émission et le renouvellement automatiques des certificats, le nom d’hôte public doit pointer vers le serveur et les ports 80 et 443 doivent atteindre Caddy.',
  'After deployment': 'Après le déploiement',
  'Verify sign-in, configured email delivery, uploads, and realtime features with normal user workflows.':
    'Vérifiez la connexion, la livraison des emails configurée, les téléversements et le temps réel au moyen de parcours utilisateur normaux.',
  'Create and test a recoverable backup of PostgreSQL, uploads, and required configuration.':
    'Créez et testez une sauvegarde récupérable de PostgreSQL, des fichiers téléversés et de la configuration requise.',
  'Keep the deployed source, lockfile, Dockerfiles, Compose file, and Caddyfile on the same reviewed release.':
    'Conservez le source déployé, le lockfile, les Dockerfiles, le fichier Compose et le Caddyfile sur la même version examinée.',
  'Use Upgrades for release changes and Troubleshooting when verification fails.':
    'Consultez Mises à niveau pour les changements de version et Dépannage lorsqu’une vérification échoue.',
  'Back up application data, uploaded files, and required configuration before upgrades, migrations, or infrastructure changes.':
    'Sauvegardez les données applicatives, les fichiers téléversés et la configuration requise avant les mises à niveau, migrations ou changements d’infrastructure.',
  'Review persistent resources and Compose project identity.':
    'Consultez les ressources persistantes et l’identité du projet Compose.',
  'Identify deployment configuration and stable security values.':
    'Identifiez la configuration du déploiement et les valeurs de sécurité stables.',
  'Use backups as the recovery point for version changes.':
    'Utilisez les sauvegardes comme point de récupération lors des changements de version.',
  'Diagnose recovery and persistent-storage failures.':
    'Diagnostiquez les échecs de récupération et de stockage persistant.',
  'What to back up': 'Éléments à sauvegarder',
  'A database backup is not complete by itself':
    'Une sauvegarde de la base ne suffit pas à elle seule',
  'When uploaded files are stored separately, restore PostgreSQL and the matching uploads archive together. A database-only restore leaves file records without their stored objects.':
    'Lorsque les fichiers téléversés sont stockés séparément, restaurez PostgreSQL et l’archive correspondante des fichiers ensemble. Une restauration limitée à la base laisse des enregistrements sans leurs objets stockés.',
  Resource: 'Ressource',
  'Why it matters': 'Pourquoi elle est importante',
  'Stores community records, memberships, settings, events, audit information, message metadata, and other persistent application data.':
    'Stocke les données communautaires, adhésions, paramètres, événements, informations d’audit, métadonnées des messages et autres données applicatives persistantes.',
  Uploads: 'Fichiers téléversés',
  'Stores avatars, event and task files, and encrypted chat attachment objects referenced by database records.':
    'Stocke les avatars, les fichiers d’événements et de tâches ainsi que les pièces jointes chiffrées du chat référencées par la base.',
  'Deployment configuration': 'Configuration du déploiement',
  'Preserves `.env`, the selected release, the public hostname, and stable security values needed by restored data.':
    'Préserve `.env`, la version sélectionnée, le nom d’hôte public et les valeurs de sécurité stables nécessaires aux données restaurées.',
  'Caddy state': 'État de Caddy',
  'Optionally preserves certificate and proxy state; certificates can normally be issued again when DNS and public access are correct.':
    'Préserve facultativement l’état des certificats et du proxy ; les certificats peuvent normalement être réémis lorsque le DNS et l’accès public sont corrects.',
  'Redis state': 'État de Redis',
  'Contains queued and temporary operational state, not the authoritative community database. Preserve it only as part of a coordinated recovery plan.':
    'Contient l’état opérationnel temporaire et en file, et non la base communautaire de référence. Ne le préservez que dans le cadre d’un plan de récupération coordonné.',
  'Stable security values': 'Valeurs de sécurité stables',
  'Protect the `.env` backup as sensitive data. Restore the values that were active when the backup was created; never print them in support logs or documentation.':
    'Protégez la sauvegarde de `.env` comme une donnée sensible. Restaurez les valeurs actives lors de la création de la sauvegarde ; ne les imprimez jamais dans les journaux de support ni dans la documentation.',
  Value: 'Valeur',
  'Recovery consequence': 'Conséquence pour la récupération',
  'Required to verify existing account passwords, including an in-progress pepper rotation.':
    'Requis pour vérifier les mots de passe existants, y compris pendant une rotation du pepper.',
  'Required to decrypt protected SMTP and registration-provider credentials saved in the database.':
    'Requis pour déchiffrer les identifiants SMTP et du fournisseur d’inscription protégés dans la base.',
  'Changing them invalidates existing signed sessions and may also affect protected credentials when EMAIL_ENCRYPTION_KEY was not set separately.':
    'Leur modification invalide les sessions signées existantes et peut aussi affecter les identifiants protégés si EMAIL_ENCRYPTION_KEY n’a pas été défini séparément.',
  'Preserves continuity for privacy-safe registration rate-limit identifiers when configured.':
    'Préserve la continuité des identifiants respectueux de la confidentialité utilisés pour limiter les inscriptions, lorsqu’il est configuré.',
  'Preserve it only when the operator intends to keep the same optional server-side recovery control.':
    'Ne le préservez que si l’opérateur souhaite conserver le même contrôle facultatif de récupération côté serveur.',
  'Create a consistent backup': 'Créer une sauvegarde cohérente',
  'PostgreSQL supports an online logical backup. For the most consistent database-and-uploads recovery point, use a maintenance window and pause services that accept writes before capturing both resources. PE Community does not provide a built-in maintenance mode.':
    'PostgreSQL prend en charge une sauvegarde logique en ligne. Pour obtenir le point de récupération le plus cohérent entre la base et les fichiers, utilisez une fenêtre de maintenance et suspendez les services qui acceptent des écritures avant de capturer les deux ressources. PE Community ne fournit pas de mode maintenance intégré.',
  'Back up PostgreSQL': 'Sauvegarder PostgreSQL',
  'Create a PostgreSQL custom-format archive. Store the resulting file outside the production server and protect it as personal data.':
    'Créez une archive PostgreSQL au format personnalisé. Stockez le fichier obtenu hors du serveur de production et protégez-le comme une donnée personnelle.',
  'Back up uploads': 'Sauvegarder les fichiers téléversés',
  'Archive the mounted uploads directory through a temporary application container. This reads the named volume without editing Docker volume files directly.':
    'Archivez le répertoire de téléversement monté au moyen d’un conteneur applicatif temporaire. Cette opération lit le volume nommé sans modifier directement ses fichiers Docker.',
  'After the PostgreSQL and uploads archives complete successfully, run `docker compose up -d` to end the maintenance window.':
    'Une fois les archives PostgreSQL et des fichiers créées avec succès, exécutez `docker compose up -d` pour terminer la fenêtre de maintenance.',
  'Restore an installation': 'Restaurer une installation',
  '1. Select the application release that matches the backup, or another release explicitly documented as compatible.':
    '1. Sélectionnez la version applicative correspondant à la sauvegarde, ou une autre version explicitement documentée comme compatible.',
  '2. Restore `.env`, including the original stable security values, and keep the Compose project name unchanged.':
    '2. Restaurez `.env`, y compris les valeurs de sécurité stables d’origine, et conservez le nom du projet Compose.',
  '3. Start PostgreSQL and Redis without starting the application services.':
    '3. Démarrez PostgreSQL et Redis sans démarrer les services applicatifs.',
  '4. Restore the PostgreSQL archive into a new or intentionally prepared target database.':
    '4. Restaurez l’archive PostgreSQL dans une base cible nouvelle ou préparée volontairement.',
  '5. Restore the matching uploads archive into a new or intentionally prepared uploads volume.':
    '5. Restaurez l’archive correspondante des fichiers dans un volume nouveau ou préparé volontairement.',
  '6. Start the complete deployment. Pending migrations run during application startup when moving through a supported upgrade path.':
    '6. Démarrez le déploiement complet. Les migrations en attente s’exécutent au démarrage applicatif lorsque vous suivez un parcours de mise à niveau pris en charge.',
  '7. Validate sign-in, account security, uploaded files, realtime features, background work, and configured email delivery.':
    '7. Vérifiez la connexion, la sécurité des comptes, les fichiers téléversés, le temps réel, les travaux en arrière-plan et la livraison des emails configurée.',
  'Restore only into the intended target':
    'Restaurer uniquement dans la cible prévue',
  'Do not layer a backup over an unrelated active installation. Confirm the target database, uploads volume, Compose project name, and release compatibility before restoring.':
    'Ne superposez pas une sauvegarde à une installation active sans rapport. Vérifiez la base cible, le volume des fichiers, le nom du projet Compose et la compatibilité de version avant la restauration.',
  'Recovery boundaries': 'Limites de la récupération',
  'Restore a backup into a compatible release, then follow release-specific upgrade guidance before moving to a newer version.':
    'Restaurez une sauvegarde dans une version compatible, puis suivez les instructions de mise à niveau propres à la version avant de passer à une version plus récente.',
  'Server backups do not contain members’ browser private chat keys or recovery passwords. Members must preserve their own encrypted chat-key backups.':
    'Les sauvegardes serveur ne contiennent ni les clés privées de chat des navigateurs des membres ni leurs mots de passe de récupération. Les membres doivent conserver leurs propres sauvegardes chiffrées de clés de chat.',
  'Keep the Compose project name unchanged; Docker Compose explains how project identity selects persistent resources.':
    'Conservez le nom du projet Compose ; Docker Compose explique comment l’identité du projet sélectionne les ressources persistantes.',
  'Verify and retain backups': 'Vérifier et conserver les sauvegardes',
  'A backup is not verified until it has been restored successfully in a controlled environment.':
    'Une sauvegarde n’est vérifiée qu’après une restauration réussie dans un environnement contrôlé.',
  'Keep multiple restore points and store copies separately from the production server.':
    'Conservez plusieurs points de restauration et stockez des copies séparément du serveur de production.',
  'Encrypt backups that contain secrets, personal data, or protected operational configuration.':
    'Chiffrez les sauvegardes qui contiennent des secrets, des données personnelles ou une configuration opérationnelle protégée.',
  'Test recovery periodically and record the compatible application release for each restore point.':
    'Testez régulièrement la récupération et notez la version applicative compatible avec chaque point de restauration.',
  'Back up the installation, select the target release, pull the published images, and recreate the deployment.':
    'Sauvegardez l’installation, sélectionnez la version cible, récupérez les images publiées et recréez le déploiement.',
  'Create and verify the recovery point required before upgrading.':
    'Créez et vérifiez le point de récupération requis avant la mise à niveau.',
  'Review release variables, project identity, and lifecycle behavior.':
    'Consultez les variables de version, l’identité du projet et le comportement du cycle de vie.',
  'Diagnose startup or migration failures after a release change.':
    'Diagnostiquez les échecs de démarrage ou de migration après un changement de version.',
  'Before upgrading': 'Avant la mise à niveau',
  'Read the target release notes and confirm that the installed release has a supported path to it.':
    'Lisez les notes de la version cible et vérifiez que la version installée dispose d’un parcours de mise à niveau pris en charge.',
  'Create and verify a PostgreSQL, uploads, and configuration backup.':
    'Créez et vérifiez une sauvegarde de PostgreSQL, des fichiers téléversés et de la configuration.',
  'Record the installed source revision and confirm enough disk space is available for rebuilt images and the backup.':
    'Notez la révision source installée et vérifiez que l’espace disque suffit pour les images reconstruites et la sauvegarde.',
  'Confirm the existing deployment is stable enough that new upgrade failures can be distinguished from earlier problems.':
    'Vérifiez que le déploiement existant est assez stable pour distinguer les nouveaux échecs de mise à niveau des problèmes antérieurs.',
  'Select the release': 'Sélectionner la version',
  'Obtain a documented source release and review its release notes before replacing application source or deployment files. Keep `.env`, backups, and persistent volumes outside the source replacement.':
    'Obtenez une version source documentée et examinez ses notes avant de remplacer le source ou les fichiers de déploiement. Conservez `.env`, les sauvegardes et les volumes persistants hors du remplacement du source.',
  'Build and apply the release': 'Construire et appliquer la version',
  'Build the selected source release, then let Docker Compose recreate services whose image changed. Named volumes remain attached when the Compose project name is unchanged. This procedure does not promise zero downtime.':
    'Construisez la version source sélectionnée, puis laissez Docker Compose recréer les services dont l’image a changé. Les volumes nommés restent attachés lorsque le nom du projet Compose ne change pas. Cette procédure ne garantit aucune absence d’interruption.',
  'Database migrations': 'Migrations de la base de données',
  'Pending database migrations are applied before the API starts accepting traffic. Back up before upgrading, allow the startup migration to complete once, and inspect the first migration error instead of repeatedly forcing migration commands.':
    'Les migrations de base en attente sont appliquées avant que l’API n’accepte le trafic. Sauvegardez avant la mise à niveau, laissez la migration de démarrage s’exécuter une fois et examinez la première erreur au lieu de forcer plusieurs fois les commandes de migration.',
  'Database changes can limit rollback':
    'Les changements de base peuvent limiter le retour arrière',
  'An older application image may not be compatible after a newer release changes the database schema. Treat the pre-upgrade database and uploads backup as the recovery point.':
    'Une ancienne image applicative peut devenir incompatible après qu’une version plus récente a modifié le schéma de la base. Considérez la sauvegarde de la base et des fichiers antérieure à la mise à niveau comme le point de récupération.',
  'Verify the upgrade': 'Vérifier la mise à niveau',
  'Open the application and confirm sign-in and the main authenticated workspace.':
    'Ouvrez l’application et vérifiez la connexion ainsi que l’espace authentifié principal.',
  'Confirm realtime features connect and uploaded files remain available.':
    'Vérifiez que le temps réel se connecte et que les fichiers téléversés restent disponibles.',
  'Confirm background jobs run and send a test email when email delivery is configured.':
    'Vérifiez l’exécution des travaux en arrière-plan et envoyez un email de test lorsque la livraison est configurée.',
  'Review release-specific workflows called out in the release notes.':
    'Vérifiez les parcours propres à la version signalés dans les notes de publication.',
  'If the upgrade fails': 'En cas d’échec de la mise à niveau',
  'Check service status and the latest logs, then use Troubleshooting to isolate startup, migration, storage, or configuration failures. Do not repeatedly restart a migration failure without preserving and understanding the first error.':
    'Vérifiez l’état des services et les derniers journaux, puis utilisez Dépannage pour isoler les échecs de démarrage, migration, stockage ou configuration. Ne redémarrez pas plusieurs fois une migration en échec sans conserver ni comprendre la première erreur.',
  Rollback: 'Retour arrière',
  'Do not assume that restoring earlier source is a complete rollback. Consult the release notes. When the upgraded database is incompatible with the earlier release, restore the pre-upgrade PostgreSQL and uploads backup and run the matching application revision.':
    'Ne supposez pas que restaurer un source antérieur constitue un retour arrière complet. Consultez les notes de publication. Lorsque la base mise à niveau est incompatible avec l’ancienne version, restaurez la sauvegarde PostgreSQL et des fichiers antérieure à la mise à niveau, puis exécutez la révision applicative correspondante.',
  'Keep the Compose project name unchanged throughout upgrade and recovery; Docker Compose is the authoritative guide to project identity and persistent resources.':
    'Conservez le nom du projet Compose pendant toute la mise à niveau et la récupération ; Docker Compose est le guide de référence pour l’identité du projet et les ressources persistantes.',
  'Diagnose production symptoms with service status, targeted logs, and safe configuration checks.':
    'Diagnostiquez les symptômes de production grâce à l’état des services, des journaux ciblés et des contrôles sûrs de la configuration.',
  'Check the authoritative deployment values and safe secret-handling guidance.':
    'Consultez les valeurs de déploiement de référence et les conseils de gestion sûre des secrets.',
  'Review service names, persistent resources, and lifecycle commands.':
    'Consultez les noms des services, les ressources persistantes et les commandes du cycle de vie.',
  'Review settings managed inside the running application.':
    'Consultez les paramètres gérés dans l’application en service.',
  'Protect data before destructive recovery work.':
    'Protégez les données avant toute récupération destructive.',
  'Start with service status and logs':
    'Commencer par l’état des services et les journaux',
  'Check the deployment as a whole first. When the symptom points to one service, follow that service’s logs instead of collecting unrelated output.':
    'Vérifiez d’abord le déploiement dans son ensemble. Lorsqu’un symptôme désigne un service, suivez ses journaux plutôt que de collecter des sorties sans rapport.',
  'Application does not open': 'L’application ne s’ouvre pas',
  'Confirm that the expected services are running with `docker compose ps`.':
    'Vérifiez que les services attendus fonctionnent avec `docker compose ps`.',
  'Check Caddy logs for listener, routing, DNS, and certificate errors.':
    'Recherchez dans les journaux Caddy les erreurs d’écoute, de routage, DNS et de certificat.',
  'Confirm the hostname resolves to this server and that inbound ports 80 and 443 are allowed.':
    'Vérifiez que le nom d’hôte pointe vers ce serveur et que les ports entrants 80 et 443 sont autorisés.',
  'Confirm APP_DOMAIN and WEB_ORIGIN use the hostname users actually open.':
    'Vérifiez que APP_DOMAIN et WEB_ORIGIN utilisent le nom d’hôte réellement ouvert par les utilisateurs.',
  'HTTPS certificate is not issued': 'Le certificat HTTPS n’est pas émis',
  'Confirm that public A and, when used, AAAA records resolve to reachable addresses on this server.':
    'Vérifiez que les enregistrements publics A et, lorsqu’ils sont utilisés, AAAA pointent vers des adresses joignables de ce serveur.',
  'Confirm ports 80 and 443 reach Caddy and are not intercepted by another service.':
    'Vérifiez que les ports 80 et 443 atteignent Caddy sans être interceptés par un autre service.',
  'Review Caddy logs for the certificate authority response.':
    'Consultez les journaux Caddy pour la réponse de l’autorité de certification.',
  'Check whether a CDN, proxy, or hosting firewall prevents hostname validation.':
    'Vérifiez si un CDN, un proxy ou le pare-feu de l’hébergeur empêche la validation du nom d’hôte.',
  'Application opens but actions fail':
    'L’application s’ouvre mais les actions échouent',
  'Inspect the failed browser request without copying cookies or secrets. Confirm WEB_ORIGIN matches the public origin, then review API and Caddy logs for the same time. A page can load even when an application request is rejected or misrouted.':
    'Examinez la requête navigateur en échec sans copier de cookies ni de secrets. Vérifiez que WEB_ORIGIN correspond à l’origine publique, puis consultez les journaux API et Caddy au même moment. Une page peut se charger même si une requête applicative est rejetée ou mal acheminée.',
  'Sign-in does not work': 'La connexion ne fonctionne pas',
  'Review API logs without printing passwords, password hashes, cookies, MFA secrets, or JWT values.':
    'Consultez les journaux API sans imprimer de mots de passe, empreintes de mots de passe, cookies, secrets MFA ni valeurs JWT.',
  'Confirm WEB_ORIGIN, HTTPS, and secure-cookie settings match the public deployment.':
    'Vérifiez que WEB_ORIGIN, HTTPS et les paramètres de cookies sécurisés correspondent au déploiement public.',
  'Confirm the account has an active community membership and complete any required MFA or password-change step.':
    'Vérifiez que le compte dispose d’une adhésion communautaire active et terminez toute étape MFA ou de changement de mot de passe requise.',
  'Confirm the server clock is synchronized so signed-session and MFA time checks are reliable.':
    'Vérifiez que l’horloge du serveur est synchronisée afin de fiabiliser les contrôles temporels des sessions signées et de la MFA.',
  'Chat or realtime features do not connect':
    'Le chat ou le temps réel ne se connecte pas',
  'Inspect the browser WebSocket request to `/socket.io` and note its status without exposing session cookies.':
    'Examinez la requête WebSocket du navigateur vers `/socket.io` et notez son état sans exposer les cookies de session.',
  'Confirm Caddy receives and routes the realtime request.':
    'Vérifiez que Caddy reçoit et achemine la requête en temps réel.',
  'Leave the explicit realtime origin empty for the standard same-origin deployment, or confirm a custom value points to the correct public origin.':
    'Laissez l’origine explicite du temps réel vide pour le déploiement standard à origine unique, ou vérifiez qu’une valeur personnalisée pointe vers la bonne origine publique.',
  'Review API and Caddy logs for connection or authorization failures.':
    'Recherchez dans les journaux API et Caddy les échecs de connexion ou d’autorisation.',
  'Background jobs are not processing':
    'Les travaux en arrière-plan ne sont pas traités',
  'Confirm that the worker and Redis services are running.':
    'Vérifiez que les services worker et Redis fonctionnent.',
  'Review worker and Redis logs for connectivity, queue, and job-specific errors.':
    'Recherchez dans les journaux worker et Redis les erreurs de connexion, de file et propres aux travaux.',
  'Check the affected workflow after the worker recovers; email and asynchronous media cleanup are examples of queued work.':
    'Vérifiez le parcours concerné après la récupération du worker ; les emails et le nettoyage asynchrone des médias sont des exemples de travaux en file.',
  'Email is not being sent': 'Les emails ne sont pas envoyés',
  'Review the saved community email settings: enabled state, SMTP host and port, secure/TLS mode, username, password, sender email, and sender name.':
    'Consultez les paramètres email enregistrés de la communauté : activation, hôte et port SMTP, mode sécurisé/TLS, nom d’utilisateur, mot de passe, email et nom d’expéditeur.',
  'Save changed settings before sending a test email.':
    'Enregistrez les paramètres modifiés avant d’envoyer un email de test.',
  'Review worker logs for connection, authentication, and provider errors.':
    'Recherchez dans les journaux worker les erreurs de connexion, d’authentification et du fournisseur.',
  'Confirm the server can reach the provider’s outbound SMTP port. Some hosting providers restrict outbound SMTP independently of the server firewall.':
    'Vérifiez que le serveur peut atteindre le port SMTP sortant du fournisseur. Certains hébergeurs limitent le SMTP sortant indépendamment du pare-feu du serveur.',
  'Uploaded files are unavailable':
    'Les fichiers téléversés sont indisponibles',
  'Confirm that the uploads volume exists and is mounted at the configured uploads path.':
    'Vérifiez que le volume des fichiers existe et est monté au chemin configuré.',
  'Confirm the Compose project name has not changed and selected a different named volume.':
    'Vérifiez que le nom du projet Compose n’a pas changé et sélectionné un autre volume nommé.',
  'Check free disk space and review API logs for filesystem or permission errors.':
    'Vérifiez l’espace disque libre et recherchez dans les journaux API les erreurs de système de fichiers ou de permissions.',
  'Do not edit Docker volume contents manually; recover files from a verified matching backup.':
    'Ne modifiez pas manuellement le contenu des volumes Docker ; récupérez les fichiers depuis une sauvegarde correspondante vérifiée.',
  'Data appears missing after redeployment':
    'Les données semblent absentes après un redéploiement',
  'Changing COMPOSE_PROJECT_NAME can make Docker Compose select a different set of named volumes, causing an existing installation to appear empty. Stop before creating new community data, identify the original project name and volumes, and consult Docker Compose before reconnecting them.':
    'Modifier COMPOSE_PROJECT_NAME peut amener Docker Compose à sélectionner un autre ensemble de volumes nommés et faire paraître vide une installation existante. Arrêtez-vous avant de créer des données communautaires, identifiez le nom et les volumes du projet d’origine, puis consultez Docker Compose avant de les reconnecter.',
  'Do not initialize over missing data':
    'Ne pas initialiser par-dessus des données manquantes',
  'An empty-looking installation may be attached to new volumes while the original data still exists. Identify the original Compose project and volumes before setup, restore, or deletion work.':
    'Une installation apparemment vide peut être attachée à de nouveaux volumes alors que les données d’origine existent encore. Identifiez le projet Compose et les volumes d’origine avant toute initialisation, restauration ou suppression.',
  'Database or migration startup fails':
    'Le démarrage de la base ou des migrations échoue',
  'Confirm PostgreSQL is running and accepting the configured database credentials.':
    'Vérifiez que PostgreSQL fonctionne et accepte les identifiants configurés.',
  'Review PostgreSQL and API logs for the first migration or connection error.':
    'Recherchez dans les journaux PostgreSQL et API la première erreur de migration ou de connexion.',
  'Do not edit applied migration history or repeatedly force migrations without understanding the database state.':
    'Ne modifiez pas l’historique des migrations appliquées et ne forcez pas plusieurs migrations sans comprendre l’état de la base.',
  'Create or verify a backup before destructive database recovery.':
    'Créez ou vérifiez une sauvegarde avant toute récupération destructive de la base.',
  'Disk space is low': 'L’espace disque est faible',
  'Use `df -h` to inspect host filesystems and `docker system df` to understand Docker disk usage.':
    'Utilisez `df -h` pour examiner les systèmes de fichiers de l’hôte et `docker system df` pour comprendre l’utilisation du disque par Docker.',
  'Identify whether PostgreSQL data, uploads, images, or logs are consuming space before deleting anything.':
    'Identifiez si les données PostgreSQL, les fichiers téléversés, les images ou les journaux consomment l’espace avant toute suppression.',
  'Move or expire data according to an intentional retention plan. Do not run blanket volume-pruning commands against a production installation.':
    'Déplacez ou expirez les données selon un plan de conservation intentionnel. N’exécutez pas de commande générale de nettoyage des volumes sur une installation de production.',
  'A service keeps restarting': 'Un service redémarre en boucle',
  'Inspect the service status and its latest 200 log lines.':
    'Examinez l’état du service et ses 200 dernières lignes de journal.',
  'Check required environment values, PostgreSQL and Redis reachability, migration errors, and malformed configuration.':
    'Vérifiez les valeurs d’environnement requises, l’accessibilité de PostgreSQL et Redis, les erreurs de migration et les configurations mal formées.',
  'For Caddy, also check public port conflicts and hostname configuration.':
    'Pour Caddy, vérifiez aussi les conflits de ports publics et la configuration du nom d’hôte.',
  'Fix the first reported cause rather than increasing restart delays or repeatedly recreating containers.':
    'Corrigez la première cause signalée plutôt que d’augmenter les délais de redémarrage ou de recréer plusieurs fois les conteneurs.',
};

const configurationDocsTextFr: Record<string, string> = {
  'Use Settings to manage community-wide behavior after PE Community is running. Available sections depend on your role and permissions.':
    'Utilisez Paramètres pour gérer le fonctionnement de la communauté une fois PE Community en service. Les sections disponibles dépendent de votre rôle et de vos permissions.',
  'Initialize a new community and its Owner once.':
    'Initialisez une seule fois une nouvelle communauté et son Owner.',
  'Configure deployment-level services and fallback values.':
    'Configurez les services et valeurs de repli du déploiement.',
  'Review authentication and platform protection guidance.':
    'Consultez les conseils sur l’authentification et la protection de la plateforme.',
  'Understand notification delivery, unread state, and preferences.':
    'Comprenez la livraison des notifications, leur état non lu et les préférences.',
  'Resolve configuration, email, and delivery problems.':
    'Résolvez les problèmes de configuration, d’email et de livraison.',
  'Settings scope': 'Portée des paramètres',
  General: 'Général',
  'Community slug': 'Slug de communauté',
  'Default language': 'Langue par défaut',
  Timezone: 'Fuseau horaire',
  'Support contact email': 'Courriel de support',
  'Community controls are organized into General, Security, Reminders, Templates, and Notifications. Sections appear only when your assigned permissions allow access. Profile manages the signed-in administrator’s own profile rather than community-wide behavior.':
    'Les contrôles communautaires sont organisés en Général, Sécurité, Rappels, Modèles et Notifications. Une section apparaît uniquement lorsque vos permissions vous y donnent accès. Profil gère le profil personnel de l’administrateur connecté, et non le fonctionnement de toute la communauté.',
  Setting: 'Paramètre',
  'What it changes': 'Effet',
  'Displays the community identifier. This value is read-only in Settings.':
    'Affiche l’identifiant de la communauté. Cette valeur est en lecture seule dans Paramètres.',
  'Sets English or French for community-level defaults and users without a personal language preference.':
    'Définit l’anglais ou le français pour les valeurs communautaires et les utilisateurs sans préférence linguistique personnelle.',
  'Sets the IANA timezone used for community scheduling and operational dates.':
    'Définit le fuseau horaire IANA utilisé pour la planification communautaire et les dates opérationnelles.',
  'Sets the optional administrative contact address. The value must be a valid email address when provided.':
    'Définit l’adresse de contact administratif facultative. Lorsqu’elle est renseignée, elle doit être une adresse email valide.',
  'Public user audit export': 'Export d’audit public des utilisateurs',
  'Downloads the available public user fields as a CSV audit list.':
    'Télécharge les champs publics disponibles des utilisateurs sous forme de liste d’audit CSV.',
  'General changes use Save changes. The saved language and timezone take effect in community defaults immediately; a user’s explicit language preference still takes priority.':
    'Les changements généraux utilisent Enregistrer les modifications. La langue et le fuseau horaire enregistrés s’appliquent immédiatement aux valeurs communautaires ; la préférence linguistique explicite d’un utilisateur reste prioritaire.',
  'Registration and member access': 'Inscription et accès des membres',
  'Registration entry method': 'Méthode d’entrée des inscriptions',
  'Member directory visibility': 'Visibilité de l’annuaire des membres',
  'Registration protection': 'Protection des inscriptions',
  'Chooses Admin/Owner invite link or Portal registration.':
    'Choisit entre le lien d’invitation Admin/Owner et l’inscription par le portail.',
  'Invite link': 'Lien d’invitation',
  'Generates, copies, emails, replaces, or revokes the active invitation link when invite-link registration is selected.':
    'Génère, copie, envoie par email, remplace ou révoque le lien d’invitation actif lorsque l’inscription par invitation est sélectionnée.',
  'Allows active members to browse the directory, or hides the directory.':
    'Autorise les membres actifs à consulter l’annuaire, ou masque celui-ci.',
  'Enables or disables the configured CAPTCHA challenge for registration.':
    'Active ou désactive le défi CAPTCHA configuré pour l’inscription.',
  'Enforcement mode': 'Mode d’application',
  'Uses Disabled or Always for registration challenges.':
    'Utilise Désactivé ou Toujours pour les défis d’inscription.',
  'CAPTCHA provider': 'Fournisseur CAPTCHA',
  'Selects Cloudflare Turnstile, Google reCAPTCHA, hCaptcha, or Disabled.':
    'Sélectionne Cloudflare Turnstile, Google reCAPTCHA, hCaptcha ou Désactivé.',
  'Provider fields': 'Champs du fournisseur',
  'Configures the site key, secret key, allowed hostname, expected action, and the reCAPTCHA variant and minimum score when applicable.':
    'Configure la clé de site, la clé secrète, le nom d’hôte autorisé, l’action attendue ainsi que la variante et le score minimal reCAPTCHA, le cas échéant.',
  'Registration limits': 'Limites d’inscription',
  'Sets attempts per IP and community, the IP window, notification cooldown, and daily registration-email limit.':
    'Définit les tentatives par IP et communauté, la fenêtre IP, le délai des notifications et la limite quotidienne d’emails d’inscription.',
  'Save registration protection before using Test configuration. The test validates the saved fields; a live registration challenge is still required to verify provider credentials.':
    'Enregistrez la protection des inscriptions avant d’utiliser Tester la configuration. Le test valide les champs enregistrés ; un défi d’inscription réel reste nécessaire pour vérifier les identifiants du fournisseur.',
  'Require two-factor authentication controls whether community 2FA is available and whether enrolled accounts complete the second sign-in step.':
    'Exiger l’authentification à deux facteurs détermine si la 2FA communautaire est disponible et si les comptes inscrits effectuent la seconde étape de connexion.',
  'Reset two-factor authentication opens Member management, where an authorized operator can reset an enrolled member’s 2FA after confirmation.':
    'Réinitialiser l’authentification à deux facteurs ouvre la gestion des membres, où un opérateur autorisé peut réinitialiser la 2FA d’un membre inscrit après confirmation.',
  'Registration protection is managed in the Security section but documented above with the other registration controls.':
    'La protection des inscriptions se gère dans la section Sécurité, mais elle est documentée ci-dessus avec les autres contrôles d’inscription.',
  'Email delivery': 'Livraison des emails',
  'Enables or disables community email sending.':
    'Active ou désactive l’envoi d’emails communautaires.',
  'SMTP host and SMTP port': 'Hôte SMTP et port SMTP',
  'Set the mail provider connection endpoint.':
    'Définissent le point de connexion au fournisseur de messagerie.',
  'SMTP username and SMTP password':
    'Nom d’utilisateur SMTP et mot de passe SMTP',
  'Set provider credentials. Leave the password blank to keep an already configured password.':
    'Définissent les identifiants du fournisseur. Laissez le mot de passe vide pour conserver celui déjà configuré.',
  'Secure TLS': 'TLS sécurisé',
  'Enables the secure SMTP connection option. Port 465 requires it.':
    'Active l’option de connexion SMTP sécurisée. Le port 465 l’exige.',
  'From email and From name': 'Email expéditeur et nom d’expéditeur',
  'Set the sender identity shown on outgoing messages.':
    'Définissent l’identité d’expéditeur affichée sur les messages sortants.',
  'Test email recipient': 'Destinataire de l’email de test',
  'Queues a test message to the entered address after the settings have been saved.':
    'Place un message de test en file pour l’adresse saisie après enregistrement des paramètres.',
  'When email delivery is enabled, host, port, username, password, sender email, and sender name must be complete. Community email settings are managed here; see Environment variables only for deployment-level fallback email configuration.':
    'Lorsque la livraison des emails est activée, l’hôte, le port, le nom d’utilisateur, le mot de passe, l’email expéditeur et le nom d’expéditeur doivent être complets. Les paramètres communautaires se gèrent ici ; consultez Variables d’environnement uniquement pour la configuration email de repli du déploiement.',
  'Admin in-app alerts is the main switch for administrative alerts.':
    'Alertes Admin dans l’application est l’interrupteur principal des alertes administratives.',
  'Operational alert switches cover email delivery issues, registrations waiting for review, passport expiration, and reminder-run summaries.':
    'Les interrupteurs d’alertes opérationnelles couvrent les problèmes de livraison des emails, les inscriptions en attente, l’expiration des passeports et les résumés d’exécution des rappels.',
  'Pausing Admin in-app alerts also pauses the visible operational alerts that depend on that channel.':
    'Suspendre les alertes Admin dans l’application suspend aussi les alertes opérationnelles visibles qui dépendent de ce canal.',
  'Birthday reminders control advance reminders, day-of notifications, days before, and whether all members are notified.':
    'Les rappels d’anniversaire contrôlent les rappels anticipés, les notifications du jour même, le nombre de jours avant et la notification de tous les membres.',
  'Membership anniversary reminders control advance reminders, day-of notifications, and days before.':
    'Les rappels d’ancienneté contrôlent les rappels anticipés, les notifications du jour même et le nombre de jours avant.',
  'Passport expiration reminders control member/admin audiences, email delivery, day-of notices, and three ordered advance stages. The stages must be positive, unique, and ordered from largest to smallest.':
    'Les rappels d’expiration du passeport contrôlent les publics Membre/Admin, la livraison par email, les avis du jour même et trois étapes anticipées ordonnées. Les étapes doivent être positives, uniques et classées de la plus grande à la plus petite.',
  'New communities default birthday and anniversary advance reminders to 3 days with day-of notifications enabled. Passport reminders start disabled; their default stages are 180, 90, and 30 days.':
    'Pour une nouvelle communauté, les rappels anticipés d’anniversaire et d’ancienneté sont définis par défaut à 3 jours, avec les notifications du jour même activées. Les rappels de passeport commencent désactivés ; leurs étapes par défaut sont 180, 90 et 30 jours.',
  'Run due reminders is an explicit maintenance action. It runs independently from saving a reminder draft.':
    'Exécuter les rappels dus est une action de maintenance explicite. Elle s’exécute indépendamment de l’enregistrement d’un brouillon de rappels.',
  Reminders: 'Rappels',
  Templates: 'Modèles',
  'Automation notification templates and email templates support English and French content where a localized variant is available.':
    'Les modèles de notifications d’automatisation et les modèles d’email prennent en charge le contenu anglais et français lorsqu’une variante localisée est disponible.',
  'Editable email fields include Subject, Preview text, Email heading, Greeting, Message body, Button label, Fallback instructions, Expiration notice, Security notice, and Footer explanation.':
    'Les champs d’email modifiables comprennent Objet, Texte d’aperçu, Titre de l’email, Salutation, Corps du message, Libellé du bouton, Instructions de repli, Avis d’expiration, Avis de sécurité et Explication du pied de page.',
  'Variables shown beside a template can be inserted into content. Required variables must remain present, and editable message bodies are limited to 5,000 characters.':
    'Les variables affichées avec un modèle peuvent être insérées dans le contenu. Les variables obligatoires doivent rester présentes et les corps de message modifiables sont limités à 5 000 caractères.',
  'Preview renders the current draft. Send test is available for supported email and automation templates. Reset to default and Discard changes restore supported content without changing unrelated templates.':
    'Aperçu affiche le brouillon actuel. Envoyer un test est disponible pour les modèles d’email et d’automatisation pris en charge. Rétablir les valeurs par défaut et Ignorer les modifications restaurent le contenu pris en charge sans modifier les autres modèles.',
  'Chat and media': 'Discussion et médias',
  'Allowed value': 'Valeur autorisée',
  'Maximum active chat devices':
    'Nombre maximal d’appareils de discussion actifs',
  '1 to 8 devices; default 3.': '1 à 8 appareils ; 3 par défaut.',
  'Storage warning percent': 'Pourcentage d’alerte de stockage',
  '1% to 100%; default 80%.': '1 % à 100 % ; 80 % par défaut.',
  'Chat attachment limit': 'Limite des pièces jointes de discussion',
  '1 MB to 10 MB; default 10 MB.': '1 Mo à 10 Mo ; 10 Mo par défaut.',
  'Chat media quota': 'Quota des médias de discussion',
  'Optional whole-gigabyte quota; blank means no quota.':
    'Quota facultatif en gigaoctets entiers ; une valeur vide signifie aucun quota.',
  'Additional permissions control whether an operator can view or revoke community chat devices, inspect encrypted-media storage, change storage limits, or request supported media cleanup. These controls do not provide access to decrypted chat content.':
    'Des permissions supplémentaires déterminent si un opérateur peut consulter ou révoquer les appareils de discussion communautaires, examiner le stockage des médias chiffrés, modifier les limites de stockage ou demander le nettoyage pris en charge. Ces contrôles ne donnent pas accès au contenu déchiffré des discussions.',
  'Saving and testing': 'Enregistrement et tests',
  'Settings do not auto-save. Save actions are enabled when a valid draft differs from the saved values and show progress while a request is running.':
    'Les paramètres ne s’enregistrent pas automatiquement. Les actions d’enregistrement sont activées lorsqu’un brouillon valide diffère des valeurs enregistrées et affichent la progression pendant la requête.',
  'Discard changes restores the last saved values. Success and failure are reported as temporary notifications.':
    'Ignorer les modifications restaure les dernières valeurs enregistrées. Les réussites et les échecs sont signalés par des notifications temporaires.',
  'SMTP test email and CAPTCHA Test configuration require saved settings. Template preview and test actions use the selected language.':
    'L’email de test SMTP et Tester la configuration CAPTCHA exigent des paramètres enregistrés. Les actions d’aperçu et de test des modèles utilisent la langue sélectionnée.',
  'Switching away from a template with unsaved changes requires confirmation where the editor supports it.':
    'Quitter un modèle contenant des modifications non enregistrées exige une confirmation lorsque l’éditeur le prend en charge.',
  Section: 'Section',
  'Required permission': 'Permission requise',
  'Manage general settings': 'Gérer les paramètres généraux',
  'Security and registration protection':
    'Sécurité et protection des inscriptions',
  'Manage security settings': 'Gérer les paramètres de sécurité',
  'Manage SMTP settings': 'Gérer les paramètres SMTP',
  'Manage reminder settings': 'Gérer les paramètres de rappels',
  'Manage message templates': 'Gérer les modèles de messages',
  'Manage notification settings': 'Gérer les paramètres de notification',
  'The matching chat device, storage, or media permission':
    'La permission correspondante pour les appareils, le stockage ou les médias de discussion',
  'Owners can access all settings. Administrators see and modify only the sections allowed by their assigned permissions.':
    'Les Owners peuvent accéder à tous les paramètres. Les Administrateurs voient et modifient uniquement les sections autorisées par leurs permissions.',
  'Related guides': 'Guides associés',
  'Use the related guides above for initial community creation, deployment-level values, security guidance, notification behavior, and troubleshooting. This page remains focused on controls available inside Settings.':
    'Utilisez les guides associés ci-dessus pour la création initiale de la communauté, les valeurs de déploiement, les conseils de sécurité, le comportement des notifications et le dépannage. Cette page reste centrée sur les contrôles disponibles dans Paramètres.',
};

const frDocsText: Record<string, string> = {
  ...deploymentOperationsDocsTextFr,
  ...configurationDocsTextFr,
  Documentation: 'Documentation',
  Overview: 'Vue d’ensemble',
  'Install & Setup': 'Installation et configuration',
  Deployment: 'Déploiement',
  Platform: 'Plateforme',
  Community: 'Communauté',
  'Choose the documentation path for your role or task.':
    'Choisissez le parcours documentaire adapté à votre rôle ou à votre tâche.',
  'Docs home': 'Accueil docs',
  'Role-based onboarding and first operational steps.':
    'Parcours par rôle et premières étapes opérationnelles.',
  'Prepare, start, verify, and protect the Compose deployment.':
    'Préparer, démarrer, vérifier et protéger le déploiement Compose.',
  'Initialize the first community and Owner once.':
    'Initialiser une seule fois la première communauté et son Owner.',
  'Configure secrets, services, routing, email, and storage.':
    'Configurer les secrets, services, routage, emails et stockage.',
  'Current local-build installation requirements.':
    'Prérequis actuels d’installation par build local.',
  'Create the first community and owner.':
    'Créer la première communauté et le premier propriétaire.',
  'Production and development configuration.':
    'Configuration de production et de développement.',
  'Services, volumes, and naming.': 'Services, volumes et nommage.',
  'Settings after the first owner signs in.':
    'Paramètres après la connexion du premier propriétaire.',
  'Current Caddy same-origin deployment flow.':
    'Parcours actuel de déploiement même origine avec Caddy.',
  'Protect database and uploads.':
    'Protéger la base de données et les fichiers téléversés.',
  'Current source and migration update process.':
    'Processus actuel de mise à jour du code source et des migrations.',
  'Known setup and VPS issues.': 'Problèmes connus de setup et de VPS.',
  'Web, API, worker, data, and proxy flow.':
    'Flux web, API, worker, données et proxy.',
  'Self-hosting security guidance.':
    'Conseils de sécurité pour l’auto-hébergement.',
  'Development workflow and checks.':
    'Workflow de développement et vérifications.',
  'PE Community Management Docs': 'Documentation PE Community Management',
  'First-run setup': 'Configuration initiale',
  Configuration: 'Configuration',
  'Message templates': 'Modèles de messages',
  'Understand due dates, recipients, channels, and manual checks.':
    'Comprendre les échéances, destinataires, canaux et vérifications manuelles.',
  'Safely preview, test, and activate reminder and email copy.':
    'Prévisualiser, tester et activer en toute sécurité les textes de rappels et d’emails.',
  'Settings contains birthday, membership anniversary, and passport-expiration controls. The Reminders guide explains every toggle, exact UTC due-date behavior, recipients, channels, repeat safety, failures, and Run due reminders.':
    'Paramètres contient les contrôles d’anniversaire, d’ancienneté et d’expiration de passeport. Le guide Rappels explique chaque option, les échéances UTC exactes, les destinataires, les canaux, la sûreté des répétitions, les échecs et Exécuter les rappels dus.',
  'Templates contains reminder copy, localized transactional emails, and Task Board automation notifications. The Message templates guide explains inventories, variables, Preview, Send test, Save changes, Discard changes, and the family-specific Reset to default behavior.':
    'Modèles contient les textes de rappels, les emails transactionnels localisés et les notifications d’automatisation. Le guide Modèles de messages explique les inventaires, variables, Aperçu, Envoyer un test, Enregistrer, Abandonner et la réinitialisation propre à chaque famille.',
  'Require two-factor authentication makes enrollment available and requires the second sign-in step only for accounts that are already enrolled. Enabling it does not force unenrolled members to enroll immediately.':
    'Exiger l’authentification à deux facteurs rend l’inscription disponible et exige la seconde étape uniquement pour les comptes déjà inscrits. Son activation ne force pas immédiatement les autres membres à s’inscrire.',
  'Disabling the community policy bypasses the second sign-in step without deleting a member’s existing enrollment. Re-enabling it restores the challenge for enrolled accounts.':
    'Désactiver la politique communautaire contourne la seconde étape sans supprimer l’inscription existante d’un membre. La réactiver restaure le défi pour les comptes inscrits.',
  'Send test email is available only after the current settings are saved. It queues a message in the community default language to the entered address, records the test in Audit logs, and returns before background delivery finishes.':
    'Envoyer un email de test est disponible uniquement après l’enregistrement des paramètres courants. L’action met en file un message dans la langue communautaire par défaut vers l’adresse saisie, enregistre le test dans les Journaux d’audit et répond avant la fin de la livraison.',
  'These switches affect future supported alert creation; they do not delete existing notifications. The reminder-run summary switch is stored, but Run due reminders currently reports its summary through temporary feedback and Audit logs rather than creating a summary alert.':
    'Ces interrupteurs affectent la création future des alertes prises en charge ; ils ne suppriment pas les notifications existantes. L’interrupteur de résumé des rappels est enregistré, mais Exécuter les rappels dus présente actuellement son résumé par retour temporaire et dans les Journaux d’audit sans créer d’alerte de résumé.',
  'Changing Maximum active chat devices affects later device registration. It does not automatically revoke devices that are already active; use the device controls for an intentional revocation.':
    'Modifier le maximum d’appareils de chat actifs affecte les enregistrements ultérieurs. Les appareils déjà actifs ne sont pas révoqués automatiquement ; utilisez les contrôles d’appareils pour une révocation volontaire.',
  'Backup and restore': 'Sauvegarde et restauration',
  Security: 'Sécurité',
  'Getting started': 'Bien démarrer',
  Installation: 'Installation',
  'Install the local-build production stack with Docker Compose.':
    'Installez la pile de production construite localement avec Docker Compose.',
  Requirements: 'Prérequis',
  'Docker and Docker Compose.': 'Docker et Docker Compose.',
  '2GB RAM recommended for comfortable local image builds.':
    '2 Go de RAM sont recommandés pour construire les images localement confortablement.',
  'A domain is recommended for public production, though HTTP/IP testing is supported.':
    'Un domaine est recommandé en production publique, même si les tests HTTP/IP sont pris en charge.',
  'Install steps': 'Étapes d’installation',
  'Do not run demo seed': 'Ne lancez pas le seed de démonstration',
  'Production installs use migrations plus /setup. The demo seed is for development, demo, and testing data only.':
    'Les installations de production utilisent les migrations puis /setup. Le seed de démonstration sert uniquement au développement, aux démos et aux tests.',
  'Preserve production state': 'Préserver l’état de production',
  'Do not run migrate reset or down -v on a real production stack unless you intentionally want to remove data.':
    'N’exécutez pas migrate reset ou down -v sur une vraie pile de production, sauf si vous voulez supprimer volontairement les données.',
  'Use /setup to create the first community and owner account from a clean database.':
    'Utilisez /setup pour créer la première communauté et le premier compte propriétaire à partir d’une base propre.',
  'Clean database behavior': 'Comportement avec une base propre',
  'When the database has no community and no active privileged membership, / redirects to /setup. After setup completes, / resolves the current session.':
    'Quand la base ne contient aucune communauté ni adhésion privilégiée active, / redirige vers /setup. Une fois la configuration terminée, / résout la session actuelle.',
  'First owner': 'Premier propriétaire',
  'The setup form creates the initial community, owner role, admin/member roles, permissions, community settings, reminder settings, email settings, notification preferences, and message templates.':
    'Le formulaire de setup crée la communauté initiale, le rôle propriétaire, les rôles admin/membre, les permissions, les paramètres communautaires, les rappels, les emails, les préférences de notification et les modèles de messages.',
  'Setup token': 'Setup token',
  'If SETUP_TOKEN is configured, the setup request must include the same value. Use a URL-safe token such as output from openssl rand -hex 32.':
    'Si SETUP_TOKEN est configuré, la requête de setup doit inclure la même valeur. Utilisez un token compatible URL, par exemple la sortie de openssl rand -hex 32.',
  'token generation': 'génération du token',
  'Language and timezone': 'Langue et fuseau horaire',
  'The selected default language and timezone are stored in community settings during first-run setup and appear in the authenticated session after login.':
    'La langue et le fuseau horaire par défaut sélectionnés sont enregistrés dans les paramètres communautaires lors du setup initial et apparaissent dans la session authentifiée après connexion.',
  'Environment variables': 'Variables d’environnement',
  Variable: 'Variable',
  'Production guidance': 'Conseil de production',
  'Use pe-community for clean container and volume prefixes.':
    'Utilisez pe-community pour des préfixes propres de conteneurs et de volumes.',
  'Set a long private value before first start.':
    'Définissez une valeur longue et privée avant le premier démarrage.',
  'Inside Compose, use postgres as the host, not localhost.':
    'Dans Compose, utilisez postgres comme hôte, pas localhost.',
  'Inside Compose, use redis://redis:6379.':
    'Dans Compose, utilisez redis://redis:6379.',
  'Use a long random secret and keep it stable.':
    'Utilisez un secret long et aléatoire, puis gardez-le stable.',
  'Defaults to pe_session.': 'Par défaut : pe_session.',
  'Optional but recommended; use URL-safe hex.':
    'Facultatif mais recommandé ; utilisez une valeur hex compatible URL.',
  'Must match the public browser origin exactly.':
    'Doit correspondre exactement à l’origine publique du navigateur.',
  'Use /api/v1 for same-origin Caddy routing.':
    'Utilisez /api/v1 pour le routage même origine via Caddy.',
  'Use http://api:4000 for server-side web checks inside Compose.':
    'Utilisez http://api:4000 pour les vérifications serveur du web dans Compose.',
  'Use app for self-hosted installs.':
    'Utilisez app pour les installations auto-hébergées.',
  'The current HTTP Compose flow accepts :80 or the verified domain/front-proxy value.':
    'Le parcours HTTP Compose actuel accepte :80 ou la valeur de domaine/proxy frontal vérifiée.',
  'Development versus production': 'Développement et production',
  'Docker Compose': 'Docker Compose',
  'Run PE Community and its required services with persistent storage and a single HTTPS entry point.':
    'Exécutez PE Community et ses services requis avec un stockage persistant et un point d’entrée HTTPS unique.',
  'Prepare the host before starting the deployment.':
    'Préparez l’hôte avant de démarrer le déploiement.',
  'Configure domains, secrets, email, and optional security values.':
    'Configurez les domaines, les secrets, l’email et les valeurs de sécurité facultatives.',
  'Review public routing and production operating boundaries.':
    'Examinez le routage public et les limites d’exploitation en production.',
  'Protect PostgreSQL and uploaded files before changes.':
    'Protégez PostgreSQL et les fichiers téléversés avant toute modification.',
  'Review release-specific migration and compatibility guidance.':
    'Consultez les conseils de migration et de compatibilité propres à chaque version.',
  'Diagnose startup, routing, background work, and storage problems.':
    'Diagnostiquez les problèmes de démarrage, de routage, de travaux en arrière-plan et de stockage.',
  'Use Docker Compose to run PE Community, PostgreSQL, Redis, background processing, and the HTTPS entry point as one managed deployment. Named volumes preserve application data when containers are recreated.':
    'Utilisez Docker Compose pour exécuter PE Community, PostgreSQL, Redis, le traitement en arrière-plan et le point d’entrée HTTPS comme un seul déploiement géré. Les volumes nommés préservent les données lorsque les conteneurs sont recréés.',
  'Before you start': 'Avant de commencer',
  'Install Docker Engine and the Docker Compose plugin.':
    'Installez Docker Engine et le plugin Docker Compose.',
  'Copy and configure `.env` as described in Environment variables.':
    'Copiez et configurez `.env` comme indiqué dans Variables d’environnement.',
  'Create a DNS record for APP_DOMAIN when using automatic HTTPS.':
    'Créez un enregistrement DNS pour APP_DOMAIN lorsque vous utilisez le HTTPS automatique.',
  'Allow public traffic to ports 80 and 443.':
    'Autorisez le trafic public vers les ports 80 et 443.',
  'Reserve enough disk space for PostgreSQL, uploaded files, Redis state, TLS data, and backups.':
    'Réservez assez d’espace disque pour PostgreSQL, les fichiers téléversés, l’état Redis, les données TLS et les sauvegardes.',
  'Production compose file': 'Fichier Compose de production',
  'Use the repository `docker-compose.prod.yml` beside `.env`. It builds the API, worker, and web images from the checked-out source and starts the supporting services.':
    'Utilisez le fichier `docker-compose.prod.yml` du dépôt à côté de `.env`. Il construit les images API, worker et web depuis le source extrait et démarre les services associés.',
  'Source-built release': 'Version construite depuis le source',
  'No prebuilt public container images are published. Keep the source tree, lockfile, Dockerfiles, Compose file, and Caddy configuration from the same reviewed release.':
    'Aucune image de conteneur publique préconstruite n’est publiée. Conservez le source, le lockfile, les Dockerfiles, le fichier Compose et la configuration Caddy de la même version examinée.',
  Caddyfile: 'Caddyfile',
  'The repository Caddyfile is mounted by the production Compose file. Route order is significant: realtime, API, and uploaded-file requests reach the application before the final interface route.':
    'Le Caddyfile du dépôt est monté par le fichier Compose de production. L’ordre des routes est important : les requêtes temps réel, API et de fichiers téléversés atteignent l’application avant la route finale de l’interface.',
  Services: 'Services',
  Service: 'Service',
  Role: 'Rôle',
  'Persistent data': 'Données persistantes',
  'Stores community and application data.':
    'Stocke les données communautaires et applicatives.',
  'Supports background jobs and temporary application state.':
    'Prend en charge les travaux en arrière-plan et l’état applicatif temporaire.',
  'Handles requests, authentication, uploads, and realtime connections.':
    'Gère les requêtes, l’authentification, les téléversements et les connexions temps réel.',
  'Processes background work such as email and notifications.':
    'Traite les travaux en arrière-plan tels que les emails et les notifications.',
  'Shared uploads and database records':
    'Téléversements partagés et enregistrements de base de données',
  'Serves the PE Community application interface.':
    'Sert l’interface de l’application PE Community.',
  None: 'Aucune',
  'Provides the HTTPS entry point and routes application traffic.':
    'Fournit le point d’entrée HTTPS et achemine le trafic applicatif.',
  'PostgreSQL, Redis, and the application request service have health checks. Startup dependencies wait for the required healthy services. Pending database migrations are applied by the application image before it begins serving requests.':
    'PostgreSQL, Redis et le service de requêtes possèdent des contrôles de santé. Les dépendances de démarrage attendent les services requis en bonne santé. Les migrations de base en attente sont appliquées par l’image applicative avant le traitement des requêtes.',
  'Networking and HTTPS': 'Réseau et HTTPS',
  'Only Caddy needs to be publicly reachable. PostgreSQL, Redis, the application request service, and the interface remain internal to the Compose deployment.':
    'Seul Caddy doit être accessible publiquement. PostgreSQL, Redis, le service de requêtes et l’interface restent internes au déploiement Compose.',
  'The standard deployment uses the same public origin for the interface, REST requests, uploads, and realtime connections. Published interface images are expected to use `/api/v1` and an empty explicit realtime origin. A custom browser endpoint requires an image built for that endpoint.':
    'Le déploiement standard utilise la même origine publique pour l’interface, les requêtes REST, les téléversements et les connexions temps réel. Les images publiées de l’interface doivent utiliser `/api/v1` et une origine temps réel explicite vide. Un endpoint navigateur personnalisé exige une image construite pour cet endpoint.',
  Port: 'Port',
  Purpose: 'Usage',
  '80/tcp': '80/tcp',
  'HTTP access, redirects, and certificate validation.':
    'Accès HTTP, redirections et validation des certificats.',
  '443/tcp': '443/tcp',
  'HTTPS application traffic.': 'Trafic applicatif HTTPS.',
  '443/udp': '443/udp',
  'HTTP/3 application traffic.': 'Trafic applicatif HTTP/3.',
  'Compose-specific environment values':
    'Valeurs d’environnement propres à Compose',
  'Keep the full configuration in `.env` and use Environment variables as the reference. The values below control Compose identity, the public address, and same-origin browser routing.':
    'Conservez la configuration complète dans `.env` et utilisez Variables d’environnement comme référence. Les valeurs ci-dessous contrôlent l’identité Compose, l’adresse publique et le routage navigateur même origine.',
  'Keep release files together': 'Conserver ensemble les fichiers de version',
  'Build from one reviewed source release. Do not mix Dockerfiles, lockfiles, deployment configuration, or application source from different revisions.':
    'Construisez depuis une seule version source examinée. Ne mélangez pas Dockerfiles, lockfiles, configuration de déploiement ou source applicatif de révisions différentes.',
  'Start and check status': 'Démarrer et vérifier l’état',
  'Start the deployment, then confirm that all expected services are running. PostgreSQL, Redis, and the application request service should report healthy.':
    'Démarrez le déploiement, puis confirmez que tous les services attendus sont en cours d’exécution. PostgreSQL, Redis et le service de requêtes doivent indiquer healthy.',
  'View logs': 'Consulter les journaux',
  'Use combined logs for the full startup sequence, or follow one service while diagnosing a specific problem.':
    'Utilisez les journaux combinés pour la séquence complète de démarrage ou suivez un service pour diagnostiquer un problème précis.',
  'api: startup, database migrations, requests, uploads, and realtime errors.':
    'api : démarrage, migrations de base, requêtes, téléversements et erreurs temps réel.',
  'worker: background jobs, notifications, and email delivery.':
    'worker : travaux en arrière-plan, notifications et livraison des emails.',
  'caddy: HTTPS, certificate, and routing errors.':
    'caddy : erreurs HTTPS, de certificat et de routage.',
  'Restart and stop': 'Redémarrer et arrêter',
  'Restart keeps the existing containers and volumes. Stop pauses containers. Down removes containers and the Compose network but retains named volumes unless you add `-v`.':
    'Restart conserve les conteneurs et volumes existants. Stop met les conteneurs en pause. Down supprime les conteneurs et le réseau Compose mais conserve les volumes nommés, sauf si vous ajoutez `-v`.',
  'Do not remove production volumes':
    'Ne supprimez pas les volumes de production',
  'Do not run `docker compose down -v` on an installation whose data you need to keep. The `-v` option removes the named volumes managed by the deployment.':
    'N’exécutez pas `docker compose down -v` sur une installation dont vous devez conserver les données. L’option `-v` supprime les volumes nommés gérés par le déploiement.',
  Volume: 'Volume',
  Contains: 'Contenu',
  'Backup priority': 'Priorité de sauvegarde',
  'Community and application database.':
    'Base de données communautaire et applicative.',
  Critical: 'Critique',
  'Uploaded files and attachments.': 'Fichiers téléversés et pièces jointes.',
  'Persistent queue and background-job state.':
    'État persistant des files et travaux en arrière-plan.',
  Operational: 'Opérationnelle',
  'TLS certificates and Caddy runtime state.':
    'Certificats TLS et état d’exécution de Caddy.',
  Important: 'Importante',
  'Caddy configuration runtime state.':
    'État d’exécution de la configuration Caddy.',
  Useful: 'Utile',
  'Back up database and uploads together':
    'Sauvegardez ensemble la base et les téléversements',
  'A PostgreSQL backup does not include uploaded files. A complete recovery plan must protect both PostgreSQL data and uploads. See Backup and restore for the supported procedures.':
    'Une sauvegarde PostgreSQL n’inclut pas les fichiers téléversés. Un plan de restauration complet doit protéger les données PostgreSQL et les téléversements. Consultez Sauvegarde et restauration pour les procédures prises en charge.',
  'Keep the project name stable': 'Gardez le nom du projet stable',
  'Set `COMPOSE_PROJECT_NAME=pe-community` before the first start and keep it stable. Docker Compose uses the project name to identify the deployment’s containers, network, and named volumes. Changing it can create a different volume set and make existing data appear missing.':
    'Définissez `COMPOSE_PROJECT_NAME=pe-community` avant le premier démarrage et gardez-le stable. Docker Compose utilise le nom du projet pour identifier les conteneurs, le réseau et les volumes nommés du déploiement. Le changer peut créer un autre ensemble de volumes et faire paraître les données existantes absentes.',
  'Use `docker compose ps` and `docker volume ls` when you need to inspect the resources associated with a deployment.':
    'Utilisez `docker compose ps` et `docker volume ls` pour examiner les ressources associées à un déploiement.',
  'Apply updates': 'Appliquer les mises à jour',
  'After reviewing a source release, rebuild and recreate the application containers. Named volumes remain attached when the Compose project name is unchanged.':
    'Après examen d’une version source, reconstruisez et recréez les conteneurs applicatifs. Les volumes nommés restent attachés lorsque le nom du projet Compose ne change pas.',
  'Back up the installation before a release that includes database changes. Database migrations run automatically during application startup.':
    'Sauvegardez l’installation avant une version qui contient des modifications de base de données. Les migrations s’exécutent automatiquement au démarrage de l’application.',
  'Do not assume image-only rollback is safe':
    'Ne supposez pas qu’un retour par image seule est sûr',
  'An older image may not be compatible after a database migration. Follow release-specific upgrade and rollback instructions instead of changing a tag blindly.':
    'Une ancienne image peut être incompatible après une migration de base. Suivez les instructions de mise à niveau et de retour propres à la version au lieu de modifier aveuglément un tag.',
  'Security expectations': 'Attentes de sécurité',
  'Expose only Caddy’s public ports during normal operation.':
    'Exposez uniquement les ports publics de Caddy en fonctionnement normal.',
  'Keep PostgreSQL and Redis internal to the deployment.':
    'Gardez PostgreSQL et Redis internes au déploiement.',
  'Keep `.env` private and never commit secrets.':
    'Gardez `.env` privé et ne committez jamais de secrets.',
  'Do not mount the Docker daemon socket or grant privileged container access.':
    'Ne montez pas le socket du démon Docker et n’accordez pas d’accès privilégié aux conteneurs.',
  'Treat named volumes and backups as sensitive data.':
    'Traitez les volumes nommés et les sauvegardes comme des données sensibles.',
  'Containers do not start: run `docker compose ps` and `docker compose logs`, then check required values in `.env`.':
    'Les conteneurs ne démarrent pas : exécutez `docker compose ps` et `docker compose logs`, puis vérifiez les valeurs requises dans `.env`.',
  'The database is unavailable: inspect `docker compose logs postgres` and `docker compose logs api`, then check credentials and persistent storage.':
    'La base est indisponible : consultez `docker compose logs postgres` et `docker compose logs api`, puis vérifiez les identifiants et le stockage persistant.',
  'Background jobs or email are not processed: inspect `docker compose logs worker` and `docker compose logs redis`.':
    'Les travaux en arrière-plan ou les emails ne sont pas traités : consultez `docker compose logs worker` et `docker compose logs redis`.',
  'HTTPS is unavailable: inspect `docker compose logs caddy`, then check DNS, APP_DOMAIN, firewall rules, and ports 80 and 443.':
    'HTTPS est indisponible : consultez `docker compose logs caddy`, puis vérifiez DNS, APP_DOMAIN, les règles du pare-feu et les ports 80 et 443.',
  'Realtime or chat does not connect: check Caddy and application logs, then inspect the browser’s WebSocket request.':
    'Le temps réel ou le chat ne se connecte pas : vérifiez les journaux Caddy et applicatifs, puis examinez la requête WebSocket du navigateur.',
  'Data appears missing after redeployment: confirm COMPOSE_PROJECT_NAME did not change and inspect existing named volumes.':
    'Les données semblent absentes après redéploiement : confirmez que COMPOSE_PROJECT_NAME n’a pas changé et examinez les volumes nommés existants.',
  'Configure the platform after the first owner signs in.':
    'Configurez la plateforme après la connexion du premier propriétaire.',
  'Admin settings': 'Paramètres admin',
  'After setup, owners can use Settings to review general community fields, security controls, reminder settings, notification settings, message templates, and SMTP configuration.':
    'Après le setup, les propriétaires peuvent utiliser Paramètres pour vérifier les champs généraux de la communauté, la sécurité, les rappels, les notifications, les modèles de messages et la configuration SMTP.',
  'The default language and timezone selected during /setup are persisted in Settings > General. They are also returned in the authenticated session payload.':
    'La langue et le fuseau horaire par défaut sélectionnés pendant /setup sont enregistrés dans Paramètres > Général. Ils sont aussi renvoyés dans la session authentifiée.',
  'SMTP provider': 'Fournisseur SMTP',
  'Bring your own SMTP provider for password reset and operational email delivery. Environment variables are available as a fallback before in-app SMTP settings are saved.':
    'Utilisez votre propre fournisseur SMTP pour la réinitialisation de mot de passe et les emails opérationnels. Les variables d’environnement servent de repli avant l’enregistrement des paramètres SMTP dans l’application.',
  Troubleshooting: 'Dépannage',
  Architecture: 'Architecture',
  'High-level production architecture for the self-hosted stack.':
    'Architecture de production de haut niveau pour la pile auto-hébergée.',
  Components: 'Composants',
  'Application interface: browser-facing Next.js application and browser-side encrypted-chat cryptography.':
    'Interface applicative : application Next.js accessible au navigateur et cryptographie du chat chiffré côté navigateur.',
  'Application API: authentication, authorization, community operations, uploads, and realtime communication.':
    'API applicative : authentification, autorisation, opérations communautaires, téléversements et communication temps réel.',
  'Background worker: queued email, reminder, registration-notice, automation-delivery, and encrypted-media deletion work.':
    'Worker en arrière-plan : emails, rappels, avis d’inscription, livraisons d’automatisation et suppressions de médias chiffrés mis en file.',
  'PostgreSQL: primary application, audit, lifecycle, and aggregate metadata store.':
    'PostgreSQL : stockage principal des données applicatives, d’audit, de cycle de vie et des métadonnées agrégées.',
  'Redis and BullMQ: background queue infrastructure.':
    'Redis et BullMQ : infrastructure des files de tâches en arrière-plan.',
  'Caddy: public HTTP and HTTPS entry point and same-origin reverse proxy.':
    'Caddy : point d’entrée HTTP et HTTPS public et reverse proxy de même origine.',
  'Uploads: persistent objects including avatars, task attachments, and encrypted chat attachments.':
    'Fichiers : objets persistants comprenant les avatars, les pièces jointes des tâches et celles du chat chiffré.',
  'Production components': 'Composants de production',
  'The public entry point routes browser traffic to the application interface and API, which coordinate durable data, queues, uploaded objects, and background work.':
    'Le point d’entrée public achemine le trafic du navigateur vers l’interface applicative et l’API, qui coordonnent les données durables, les files, les objets téléversés et les tâches en arrière-plan.',
  'Diagram unavailable.': 'Diagramme indisponible.',
  'Web: Next.js app router frontend.': 'Web : frontend Next.js App Router.',
  'API: NestJS service with Prisma.': 'API : service NestJS avec Prisma.',
  'Worker: background queues for email and notifications.':
    'Worker : files de tâches en arrière-plan pour les emails et notifications.',
  'PostgreSQL: primary database.': 'PostgreSQL : base de données principale.',
  'Redis and BullMQ: queue infrastructure.':
    'Redis et BullMQ : infrastructure de files de tâches.',
  'Caddy: same-origin reverse proxy.': 'Caddy : reverse proxy même origine.',
  'Uploads: persistent local file volume.':
    'Uploads : volume local persistant pour les fichiers.',
  'Request flow': 'Flux des requêtes',
  'The browser talks to one public origin. Caddy sends page traffic to web:3000 and /api/v1 traffic to api:4000. The web server uses INTERNAL_API_URL for server-side setup checks inside the Compose network.':
    'Le navigateur communique avec une seule origine publique. Caddy envoie le trafic des pages vers web:3000 et le trafic /api/v1 vers api:4000. Le serveur web utilise INTERNAL_API_URL pour les vérifications côté serveur dans le réseau Compose.',
  'Production request flow': 'Flux des requêtes en production',
  'One public origin separates page, API, uploaded-file, and realtime traffic at the reverse proxy.':
    'Une origine publique unique sépare au niveau du reverse proxy le trafic des pages, de l’API, des fichiers téléversés et du temps réel.',
  Browser: 'Navigateur',
  'Web container': 'Conteneur web',
  'API container': 'Conteneur API',
  'PostgreSQL / Redis / uploads': 'PostgreSQL / Redis / uploads',
  'First-run setup flow': 'Flux de setup initial',
  'Initialization is available only to a fresh installation and closes after the first community and Owner are created.':
    'L’initialisation est disponible uniquement sur une installation neuve et se ferme après la création de la première communauté et du premier Owner.',
  'A clean install opens the setup path once. After the first community and owner exist, setup is locked and owners sign in through the normal login flow.':
    'Une installation propre ouvre le parcours de setup une seule fois. Après la création de la première communauté et du premier propriétaire, le setup est verrouillé et les propriétaires se connectent par le flux normal.',
  'Clean database': 'Base propre',
  '/setup required': '/setup requis',
  'Create community + first owner':
    'Créer la communauté + premier propriétaire',
  'Setup locked': 'Setup verrouillé',
  Login: 'Connexion',
  'Admin workspace': 'Espace admin',
  'Background job flow': 'Flux des tâches en arrière-plan',
  'The API enqueues work in Redis/BullMQ. The worker consumes queue jobs and performs background email and notification processing.':
    'L’API place les tâches dans Redis/BullMQ. Le worker consomme la file et traite les emails et notifications en arrière-plan.',
  'Background jobs flow': 'Flux des tâches en arrière-plan',
  'The application queues work, and the worker reloads durable state before delivery or encrypted-object deletion and then records the outcome.':
    'L’application met le travail en file, puis le worker recharge l’état durable avant une livraison ou la suppression d’un objet chiffré et enregistre ensuite le résultat.',
  'Redis queue': 'File Redis',
  'Email / reminders / notifications': 'Emails / rappels / notifications',
  'Audit and logs': 'Audit et logs',
  'Practical security guidance for production self-hosted installs.':
    'Conseils de sécurité pratiques pour les installations auto-hébergées en production.',
  'Protect first-run setup': 'Protéger le setup initial',
  'Use SETUP_TOKEN for public installs so only someone with the token can initialize the first community and owner account. Protect the first-run screen before exposing the app publicly.':
    'Utilisez SETUP_TOKEN pour les installations publiques afin que seule une personne avec le token puisse initialiser la première communauté et le compte propriétaire. Protégez l’écran initial avant d’exposer l’application publiquement.',
  'Secrets and cookies': 'Secrets et cookies',
  'Use a long JWT_SECRET and keep it stable.':
    'Utilisez un JWT_SECRET long et gardez-le stable.',
  'WEB_ORIGIN should match the public origin exactly.':
    'WEB_ORIGIN doit correspondre exactement à l’origine publique.',
  'Session cookies are secure automatically for HTTPS origins.':
    'Les cookies de session sont sécurisés automatiquement pour les origines HTTPS.',
  'Do not use * CORS with credentialed cookies.':
    'N’utilisez pas CORS * avec des cookies authentifiés.',
  'Production data': 'Données de production',
  'Do not run demo seed in production. Do not delete Docker volumes unless intentionally resetting an install. The Docker socket is not mounted into application containers.':
    'Ne lancez pas le seed de démonstration en production. Ne supprimez pas les volumes Docker sauf pour réinitialiser volontairement une installation. Le socket Docker n’est pas monté dans les conteneurs applicatifs.',
  'Two-factor authentication': 'Authentification à deux facteurs',
  'Where enabled, two-factor authentication helps protect owner and admin accounts. Members can use an authenticator app where supported, and strong passwords plus 2FA are recommended for owner accounts. Store backup codes safely if your installation provides them.':
    'Lorsqu’elle est activée, l’authentification à deux facteurs aide à protéger les comptes propriétaire et admin. Les membres peuvent utiliser une application d’authentification lorsque c’est pris en charge, et les mots de passe robustes avec 2FA sont recommandés pour les comptes propriétaire. Conservez les codes de secours en lieu sûr si votre installation les fournit.',
  Upgrades: 'Mises à jour',
  API: 'API',
  Contributing: 'Contribuer',
  'Work on the existing monorepo with focused, reviewable changes.':
    'Travaillez dans le monorepo existant avec des changements ciblés et faciles à relire.',
  'Development workflow': 'Workflow de développement',
  'local development': 'développement local',
  'Contribution standards': 'Standards de contribution',
  'Keep changes focused and easy to review.':
    'Gardez les changements ciblés et faciles à relire.',
  'Separate unrelated concerns into separate pull requests.':
    'Séparez les sujets sans rapport dans des pull requests distinctes.',
  'Include verification notes for build, type-check, and Docker changes.':
    'Ajoutez des notes de vérification pour les changements de build, de type-check et Docker.',
  'Avoid committing local environment files, generated build output, dependency folders, uploaded files, or temporary artifacts.':
    'Évitez de committer les fichiers d’environnement locaux, les sorties de build générées, les dossiers de dépendances, les fichiers téléversés ou les artefacts temporaires.',
  'Update documentation when behavior, configuration, or deployment steps change.':
    'Mettez la documentation à jour lorsque le comportement, la configuration ou les étapes de déploiement changent.',
  'For Docker or deployment changes, include the commands used to test the stack.':
    'Pour les changements Docker ou de déploiement, indiquez les commandes utilisées pour tester la pile.',
  'Checks before PR': 'Vérifications avant PR',
  verification: 'vérification',
  'Guidance for using, administering, securing, developing, and operating PE Community Management.':
    'Guides pour utiliser, administrer, sécuriser, développer et exploiter PE Community Management.',
  'Understand the platform, workspaces, roles, and core operating model.':
    'Comprendre la plateforme, les espaces, les rôles et le modèle opérationnel principal.',
  Administration: 'Administration',
  'Roles, workspaces, announcements, and audit logs.':
    'Rôles, espaces, annonces et journaux d’audit.',
  'Unread state, toasts, preferences, and delivery.':
    'Statut non lu, toasts, préférences et livraison.',
  'Task Board rules, tests, schedules, and runs.':
    'Règles de tableaux de tâches, tests, planifications et exécutions.',
  'Privacy, key recovery, devices, and encrypted media.':
    'Confidentialité, récupération des clés, appareils et médias chiffrés.',
  'Review roles, permissions, announcements, member workflows, and audit logs.':
    'Examiner les rôles, permissions, annonces, parcours membres et journaux d’audit.',
  Automation: 'Automatisation',
  'Configure and observe Task Board automation rules and delivery.':
    'Configurer et observer les règles d’automatisation des tableaux de tâches et leur livraison.',
  'Encrypted chat': 'Chat chiffré',
  'Understand participant privacy, recovery, devices, and encrypted media.':
    'Comprendre la confidentialité des participants, la récupération, les appareils et les médias chiffrés.',
  'Platform scope': 'Portée de la plateforme',
  'PE Community Management provides separate Owner/Admin and Member workspaces for membership, registrations, profiles, announcements, events, calendars, tasks, automation, notifications, email operations, audit records, and participant-scoped encrypted chat.':
    'PE Community Management fournit des espaces distincts pour les Propriétaires/Admins et les Membres afin de gérer les adhésions, inscriptions, profils, annonces, événements, calendriers, tâches, automatisations, notifications, opérations email, journaux d’audit et le chat chiffré limité aux participants.',
  'New installations use Prisma migrations and the one-time /setup flow.':
    'Les nouvelles installations utilisent les migrations Prisma et le parcours /setup à usage unique.',
  'Demo seed data is limited to development, demonstration, and testing.':
    'Les données de démonstration sont réservées au développement, à la démonstration et aux tests.',
  'English and French are supported throughout the product and documentation.':
    'L’anglais et le français sont pris en charge dans tout le produit et la documentation.',
  'Workspaces and roles': 'Espaces et rôles',
  'Owners and Admins use the administrative workspace according to their permissions. Members use a separate workspace for their profile, directory, Feed, notifications, schedule, assigned tasks, preferences, and participant-scoped encrypted chat.':
    'Les Propriétaires et Admins utilisent l’espace administratif selon leurs permissions. Les Membres disposent d’un espace distinct pour leur profil, l’annuaire, le Fil, les notifications, leur calendrier, les tâches assignées, les préférences et le chat chiffré limité aux participants.',
  'Owner receives the full permission set and can manage supported role permissions.':
    'Le Propriétaire reçoit toutes les permissions et peut gérer les permissions de rôle prises en charge.',
  'Admin receives the default operational permission set, which an Owner can adjust.':
    'L’Admin reçoit l’ensemble opérationnel par défaut, qu’un Propriétaire peut ajuster.',
  'Member receives member-facing access and the default participant chat permissions.':
    'Le Membre reçoit l’accès à l’espace membre et les permissions de chat participant par défaut.',
  'Core capabilities': 'Fonctionnalités principales',
  'Membership applications, member records, profiles, roles, and permissions.':
    'Demandes d’adhésion, dossiers membres, profils, rôles et permissions.',
  'Announcements, Feed interactions, notifications, email campaigns, and configurable templates.':
    'Annonces, interactions du Fil, notifications, campagnes email et modèles configurables.',
  'Events, calendars, Task Boards, collaboration, reusable templates, and automation.':
    'Événements, calendriers, tableaux de tâches, collaboration, modèles réutilisables et automatisation.',
  'End-to-end encrypted direct and group chat, encrypted attachments, authorized devices, and media governance.':
    'Chat direct et de groupe chiffré de bout en bout, pièces jointes chiffrées, appareils autorisés et gouvernance des médias.',
  'Community-scoped audit logs and operational settings.':
    'Journaux d’audit et paramètres opérationnels limités à la communauté.',
  'Current delivery boundary': 'Limite actuelle de livraison',
  'Managed hosting, prebuilt release images, one-click upgrades, high-availability guidance, and a finalized zero-downtime production rollout are not documented as current capabilities.':
    'L’hébergement géré, les images de version préconstruites, les mises à jour en un clic, la haute disponibilité et un déploiement finalisé sans interruption ne sont pas documentés comme fonctionnalités actuelles.',
  'The setup form creates the initial organization and community, Owner account and membership, Owner/Admin/Member roles, current permissions, community settings, reminder and email settings, Owner notification preferences, message templates, automation notification templates, and an installation audit event. It does not create demo members, announcements, events, tasks, conversations, or campaigns.':
    'Le formulaire de setup crée l’organisation et la communauté initiales, le compte et l’adhésion du Propriétaire, les rôles Propriétaire/Admin/Membre, les permissions courantes, les paramètres communautaires, de rappel et d’email, les préférences de notification du Propriétaire, les modèles de messages et d’automatisation, ainsi qu’un événement d’audit d’installation. Il ne crée aucun membre, annonce, événement, tâche, conversation ou campagne de démonstration.',
  'Completion and protection': 'Finalisation et protection',
  'Setup validates the community slug, Owner email, password minimum, supported language, and timezone. The Owner password is hashed through the centralized password service before storage.':
    'Le setup valide le slug de la communauté, l’email du Propriétaire, la longueur minimale du mot de passe, la langue et le fuseau pris en charge. Le mot de passe du Propriétaire est haché par le service centralisé avant stockage.',
  'Initialization is transaction protected and rejected when a community or active privileged membership already exists. After completion, sign in through /login with the Owner credentials. Do not place the password or setup token in logs, screenshots, issue reports, or shell history.':
    'L’initialisation est protégée par transaction et refusée lorsqu’une communauté ou une adhésion privilégiée active existe déjà. Une fois terminée, connectez-vous via /login avec les identifiants du Propriétaire. Ne placez jamais le mot de passe ou le token de setup dans des logs, captures, tickets ou l’historique du shell.',
  'The default language and timezone selected during /setup are persisted in Settings > General and returned in authenticated state. An explicit user language preference takes priority over the community default. Dates and times use the active locale and configured community timezone where the feature provides community-local rendering.':
    'La langue et le fuseau par défaut sélectionnés dans /setup sont conservés dans Paramètres > Général et renvoyés dans l’état authentifié. Une préférence de langue explicite de l’utilisateur est prioritaire sur la valeur communautaire. Les dates et heures utilisent la locale active et le fuseau configuré lorsque la fonctionnalité propose un rendu local à la communauté.',
  'Security and governance': 'Sécurité et gouvernance',
  'Settings sections are permission gated. Supported controls include registration and directory behavior, notification and message templates, MFA policy, SMTP, reminder behavior, chat-device limits, and encrypted-media quota. Changing a setting does not bypass existing per-operation authorization.':
    'Les sections de Paramètres sont contrôlées par permissions. Les contrôles pris en charge couvrent les inscriptions et l’annuaire, les modèles de notification et de message, la politique MFA, SMTP, les rappels, les limites d’appareils de chat et le quota de médias chiffrés. Modifier un paramètre ne contourne pas l’autorisation propre à chaque opération.',
  'High-level application, security, job, storage, and same-origin request architecture.':
    'Architecture de haut niveau de l’application, de la sécurité, des tâches, du stockage et des requêtes même origine.',
  'Web: Next.js App Router frontend and browser-side encrypted-chat cryptography.':
    'Web : frontend Next.js App Router et cryptographie du chat chiffré dans le navigateur.',
  'API: NestJS service with Prisma, cookie authentication, authorization, and community-scoped application services.':
    'API : service NestJS avec Prisma, authentification par cookie, autorisation et services limités à la communauté.',
  'Worker: BullMQ processing for email, notification-related jobs, and asynchronous encrypted-media deletion.':
    'Worker : traitement BullMQ des emails, tâches de notification et suppressions asynchrones de médias chiffrés.',
  'Caddy: same-origin reverse proxy for the current Compose flow.':
    'Caddy : reverse proxy même origine du parcours Compose actuel.',
  'Notification flow': 'Flux de notification',
  'Application services create audience-scoped notification records. The authenticated web shell reads the appropriate Admin or Member endpoint, maintains unread counts, and presents temporary Sonner toasts without changing read state. Optional email delivery is queued separately.':
    'Les services créent des notifications limitées à leur public. Le shell authentifié lit l’endpoint Admin ou Membre approprié, maintient les compteurs non lus et présente des toasts Sonner temporaires sans modifier le statut de lecture. L’email facultatif utilise une file distincte.',
  'Application event': 'Événement applicatif',
  'Notification record': 'Notification enregistrée',
  'Admin tray or Member drawer': 'Panneau Admin ou tiroir Membre',
  'Temporary toast': 'Toast temporaire',
  'Optional email job': 'Tâche email facultative',
  'Automation flow': 'Flux d’automatisation',
  'Automation lifecycle': 'Cycle de vie d’une automatisation',
  'Every run reevaluates current board, rule, task, event, recipient, channel, and deduplication state before it can execute.':
    'Chaque exécution réévalue l’état actuel du tableau, de la règle, de la tâche, de l’événement, du destinataire, du canal et de la déduplication avant de pouvoir s’exécuter.',
  'Published Task Board rules are evaluated using task state, community timezone, recipients, delivery availability, and deduplication state. Runs record live, dry-run, or test-notification outcomes; queued email delivery is handled by the worker.':
    'Les règles publiées sont évaluées selon l’état de la tâche, le fuseau communautaire, les destinataires, la disponibilité de livraison et la déduplication. Les exécutions enregistrent les résultats réels, de test à blanc ou de notification de test ; le worker traite les emails en file.',
  'Published rule': 'Règle publiée',
  'Eligibility and recipients': 'Éligibilité et destinataires',
  'Run record': 'Exécution enregistrée',
  'In-app result / queue': 'Résultat dans l’application / file',
  'Worker and email campaign': 'Worker et campagne email',
  'Encrypted-chat boundary': 'Frontière du chat chiffré',
  'Encrypted chat boundary': 'Frontière du chat chiffré',
  'Participant browsers own plaintext and private keys; the service authorizes participants while transporting ciphertext and encrypted attachment objects.':
    'Les navigateurs des participants détiennent le texte en clair et les clés privées ; le service autorise les participants tout en transportant le contenu chiffré et les pièces jointes chiffrées.',
  'Persistent notification state, transient interface feedback, and optional email delivery remain distinct.':
    'L’état persistant des notifications, le retour temporaire de l’interface et la livraison email facultative restent distincts.',
  'The browser owns private keys and plaintext encryption/decryption. The API authorizes participants and devices, validates immutable public-key versions, and stores ciphertext plus safe metadata. PostgreSQL tracks lifecycle and aggregate media accounting while encrypted objects remain in uploads storage.':
    'Le navigateur détient les clés privées et chiffre ou déchiffre le texte clair. L’API autorise les participants et appareils, valide les versions immuables de clés publiques et stocke le texte chiffré avec des métadonnées sûres. PostgreSQL suit les cycles de vie et agrégats, tandis que les objets chiffrés restent dans uploads.',
  'Authorized browser': 'Navigateur autorisé',
  'Local private key': 'Clé privée locale',
  'Ciphertext API': 'API de texte chiffré',
  'PostgreSQL metadata': 'Métadonnées PostgreSQL',
  'Encrypted attachment object': 'Objet de pièce jointe chiffrée',
  'Authentication, authorization, encrypted-chat, and infrastructure security boundaries.':
    'Frontières de sécurité de l’authentification, de l’autorisation, du chat chiffré et de l’infrastructure.',
  'Authentication security': 'Sécurité de l’authentification',
  'New password hashes use the centralized Argon2id service with explicit parameters, a unique library-generated salt, and a required server-side pepper kept outside PostgreSQL. Recognized legacy bcrypt hashes remain verifiable and upgrade after successful authentication.':
    'Les nouveaux hachages utilisent le service Argon2id centralisé avec des paramètres explicites, un sel unique généré par la bibliothèque et un pepper serveur obligatoire conservé hors de PostgreSQL. Les hachages bcrypt historiques reconnus restent vérifiables et sont mis à niveau après une authentification réussie.',
  'Sessions use an HttpOnly SameSite=Lax cookie and are invalidated on logout and supported security-sensitive account changes.':
    'Les sessions utilisent un cookie HttpOnly SameSite=Lax et sont invalidées à la déconnexion ainsi que lors des changements de compte sensibles pris en charge.',
  'MFA uses authenticator codes and one-time backup codes where enabled.':
    'La MFA utilise des codes d’application d’authentification et des codes de secours à usage unique lorsqu’elle est activée.',
  'Password reset tokens are time limited, one time, and stored only in hashed form.':
    'Les tokens de réinitialisation sont limités dans le temps, à usage unique et stockés uniquement sous forme hachée.',
  'Required password changes block normal use until completed.':
    'Un changement de mot de passe obligatoire bloque l’usage normal jusqu’à sa finalisation.',
  'Application authorization': 'Autorisation applicative',
  'Roles organize permissions, but the API checks the actual permission and community scope for each protected operation. Member routes do not expose Admin-only data, and Owner status does not override participant-only encrypted-chat access.':
    'Les rôles organisent les permissions, mais l’API vérifie la permission réelle et la communauté pour chaque opération protégée. Les routes Membre n’exposent pas les données réservées aux Admins et le statut de Propriétaire ne contourne pas l’accès au chat limité aux participants.',
  'Encrypted-chat security': 'Sécurité du chat chiffré',
  'Chat private keys and backup recovery passwords remain in the browser. Administrators can govern authorized devices and encrypted-media metadata but cannot decrypt participant content. Account passwords, Argon2id, the password pepper, MFA, and sessions are not chat-key recovery mechanisms.':
    'Les clés privées de chat et mots de passe de récupération restent dans le navigateur. Les administrateurs peuvent gouverner les appareils autorisés et métadonnées des médias chiffrés, mais pas déchiffrer le contenu. Les mots de passe de compte, Argon2id, le pepper, la MFA et les sessions ne récupèrent pas les clés de chat.',
  'Audit and destructive actions': 'Audit et actions destructives',
  'Sensitive operations create community-scoped audit records where implemented. Confirmations protect destructive interface actions, while server authorization remains authoritative. Audit metadata excludes passwords, secrets, private keys, recovery material, decrypted content, and storage credentials.':
    'Les opérations sensibles créent des journaux limités à la communauté lorsqu’ils sont mis en œuvre. Les confirmations protègent les actions destructives de l’interface et l’autorisation serveur reste déterminante. Les métadonnées excluent mots de passe, secrets, clés privées, matériel de récupération, contenu déchiffré et identifiants de stockage.',
  'Infrastructure security': 'Sécurité de l’infrastructure',
  'Use strong unique JWT, password-pepper, database, SMTP, and setup secrets; never commit or print them.':
    'Utilisez des secrets JWT, pepper de mot de passe, base de données, SMTP et setup forts et uniques ; ne les committez ni ne les affichez jamais.',
  'WEB_ORIGIN must match the public origin, and credentialed CORS must never use a wildcard.':
    'WEB_ORIGIN doit correspondre à l’origine publique et CORS avec identifiants ne doit jamais utiliser de joker.',
  'Secure cookies require HTTPS in production.':
    'Les cookies sécurisés exigent HTTPS en production.',
  'Do not run demo seed or delete persistent volumes on a real installation.':
    'Ne lancez pas le seed de démonstration et ne supprimez pas les volumes persistants sur une installation réelle.',
  'The Docker socket is not mounted into application containers.':
    'Le socket Docker n’est pas monté dans les conteneurs applicatifs.',
  'Current limits': 'Limites actuelles',
  'The platform does not claim externally immutable audit storage, complete per-chat-device session binding, automatic high availability, or recovery of historical private keys that no longer exist. These boundaries must remain explicit during security review.':
    'La plateforme ne prétend pas fournir un audit externe immuable, une liaison complète des sessions à chaque appareil de chat, une haute disponibilité automatique ni la récupération de clés privées historiques disparues. Ces limites doivent rester explicites lors des revues de sécurité.',
  Authentication: 'Authentification',
  Public: 'Public',
  'Optional setup token': 'Token de setup facultatif',
  'Authenticate or return an MFA challenge.':
    'Authentifie ou renvoie un défi MFA.',
  'MFA challenge': 'Défi MFA',
  'Complete MFA and set the session cookie.':
    'Termine la MFA et définit le cookie de session.',
  'Session cookie': 'Cookie de session',
  'Invalidate the current session and clear the cookie.':
    'Invalide la session courante et efface le cookie.',
  'Follow existing module, component, naming, and permission patterns before adding abstractions.':
    'Suivez les modèles existants de modules, composants, nommage et permissions avant d’ajouter des abstractions.',
  'Include verification notes for builds, type checks, tests, migrations, and Docker changes that apply.':
    'Ajoutez les résultats de build, vérification de types, tests, migrations et changements Docker applicables.',
  'Update EN and FR documentation when behavior, configuration, security boundaries, or operator steps change.':
    'Mettez à jour la documentation EN et FR lorsque le comportement, la configuration, les frontières de sécurité ou les étapes opérateur changent.',
  'Keep maintainer implementation records separate from audience-focused documentation.':
    'Séparez les dossiers d’implémentation destinés aux mainteneurs de la documentation destinée aux publics.',
  'Review authentication, authorization, encrypted chat, storage deletion, and automation changes as security-sensitive.':
    'Examinez les changements d’authentification, d’autorisation, de chat chiffré, de suppression du stockage et d’automatisation comme sensibles pour la sécurité.',
  'Prisma migration discipline': 'Discipline des migrations Prisma',
  'Generate migrations from the current schema, inspect SQL before applying it, and use Prisma status and resolve workflows for failures. Never edit or delete an applied migration to repair an active database. Prefer an additive corrective migration and roll-forward recovery.':
    'Générez les migrations depuis le schéma courant, examinez le SQL avant application et utilisez les workflows Prisma status et resolve en cas d’échec. Ne modifiez ni ne supprimez jamais une migration appliquée pour réparer une base active. Préférez une migration corrective additive et une récupération en avançant.',
};

export function getDocsPage(key: DocsPageKey, lang: DocsLang = 'en') {
  if (lang === 'fr' && (key === 'overview' || key === 'gettingStarted')) {
    return focusedDocsPagesFr[key];
  }
  if (
    lang === 'fr' &&
    (key === 'installation' ||
      key === 'firstRunSetup' ||
      key === 'environmentVariables')
  ) {
    return operatorDocsPagesFr[key];
  }
  if (lang === 'fr' && key in featureDocsPagesFr) {
    return featureDocsPagesFr[key as FeatureDocsPageKey];
  }
  return localizeDocsPage(docsPages[key], lang);
}

export function getDocsPrevNext(key: DocsPageKey, lang: DocsLang = 'en') {
  const index = docsPageOrder.indexOf(key);
  const previousKey = index > 0 ? docsPageOrder[index - 1] : undefined;
  const nextKey =
    index >= 0 && index < docsPageOrder.length - 1
      ? docsPageOrder[index + 1]
      : undefined;
  return {
    previous: previousKey ? getDocsPage(previousKey, lang) : undefined,
    next: nextKey ? getDocsPage(nextKey, lang) : undefined,
  };
}

export function getDocsPageKeyByHref(href: string): DocsPageKey {
  const match = docsPageOrder.find((key) => docsPages[key].href === href);
  return match ?? 'overview';
}

export function localizeDocsText(value: string, lang: DocsLang = 'en') {
  return lang === 'fr' ? (frDocsText[value] ?? value) : value;
}

function localizeDocsPage(page: DocsPage, lang: DocsLang): DocsPage {
  if (lang === 'en') return page;
  return {
    ...page,
    title: localizeDocsText(page.title, lang),
    description: localizeDocsText(page.description, lang),
    eyebrow: page.eyebrow ? localizeDocsText(page.eyebrow, lang) : undefined,
    cards: page.cards?.map((card) => ({
      ...card,
      title: localizeDocsText(card.title, lang),
      body: localizeDocsText(card.body, lang),
    })),
    sections: page.sections.map((section) => ({
      ...section,
      title: localizeDocsText(section.title, lang),
      body: section.body?.map((item) => localizeDocsText(item, lang)),
      bullets: section.bullets?.map((item) => localizeDocsText(item, lang)),
      code: section.code
        ? {
            ...section.code,
            label: section.code.label
              ? localizeDocsText(section.code.label, lang)
              : undefined,
          }
        : undefined,
      callout: section.callout
        ? {
            ...section.callout,
            title: localizeDocsText(section.callout.title, lang),
            body: localizeDocsText(section.callout.body, lang),
          }
        : undefined,
      table: section.table
        ? {
            headers: section.table.headers.map((item) =>
              localizeDocsText(item, lang),
            ),
            rows: section.table.rows.map((row) =>
              row.map((cell) => localizeDocsText(cell, lang)),
            ),
          }
        : undefined,
      diagram: section.diagram
        ? {
            caption: localizeDocsText(section.diagram.caption, lang),
            nodes: section.diagram.nodes.map((node) =>
              localizeDocsText(node, lang),
            ),
          }
        : undefined,
      mermaid: section.mermaid
        ? {
            ...section.mermaid,
            title: localizeDocsText(section.mermaid.title, lang),
            description: localizeDocsText(section.mermaid.description, lang),
            unavailableLabel: localizeDocsText(
              section.mermaid.unavailableLabel,
              lang,
            ),
          }
        : undefined,
    })),
  };
}
