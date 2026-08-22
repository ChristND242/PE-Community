import type { DocsPage } from './content';

type OperatorDocsPageKey =
  | 'installation'
  | 'firstRunSetup'
  | 'environmentVariables';

const startCommand = 'docker compose -f docker-compose.prod.yml up -d --build';
const verifyCommands = [
  'docker compose -f docker-compose.prod.yml ps',
  'docker compose -f docker-compose.prod.yml logs --tail=100 api',
  'docker compose -f docker-compose.prod.yml logs --tail=100 web',
  'docker compose -f docker-compose.prod.yml logs --tail=100 worker',
].join('\n');
const environmentExample = [
  'COMPOSE_PROJECT_NAME=pe-community',
  '',
  'APP_DOMAIN=community.example.com',
  'WEB_ORIGIN=https://community.example.com',
  'NEXT_PUBLIC_API_URL=/api/v1',
  'NEXT_PUBLIC_REALTIME_ORIGIN=',
  '',
  'POSTGRES_PASSWORD=<strong-url-safe-database-password>',
  'JWT_SECRET=<strong-independent-secret>',
  'PASSWORD_PEPPER=<strong-independent-secret-at-least-32-bytes>',
  'EMAIL_ENCRYPTION_KEY=<strong-independent-stable-secret>',
  'REGISTRATION_KEY_HASH_SECRET=<strong-independent-secret>',
  '',
  'SETUP_TOKEN=<optional-setup-secret>',
  'OWNER_BREAK_GLASS_SECRET=<optional-recovery-secret>',
  '',
  'SMTP_HOST=',
  'SMTP_PORT=587',
  'SMTP_USER=',
  'SMTP_PASSWORD=',
  'SMTP_SECURE=false',
  'SMTP_FROM_EMAIL=',
  'SMTP_FROM_NAME=',
].join('\n');

const operatorDocsMixed: Pick<
  Record<OperatorDocsPageKey, DocsPage>,
  'installation'
> = {
  installation: {
    title: 'Installation',
    eyebrow: 'Install & Setup',
    href: '/docs/installation',
    description:
      'Prepare a host, start the Docker Compose deployment, verify its services, and continue to first-run setup.',
    cards: [
      {
        title: 'Environment variables',
        body: 'Review required values, secrets, routing, and change impact before startup.',
        href: '/docs/environment-variables',
      },
      {
        title: 'First-run setup',
        body: 'Initialize the first community and Owner after the services are ready.',
        href: '/docs/first-run-setup',
      },
      {
        title: 'Docker Compose',
        body: 'Review service dependencies, volumes, ports, and proxy routing.',
        href: '/docs/docker-compose',
      },
      {
        title: 'Backup and restore',
        body: 'Plan protection for PostgreSQL and persistent uploads.',
        href: '/docs/backup-restore',
      },
      {
        title: 'Security',
        body: 'Review secrets, sessions, permissions, and deployment safeguards.',
        href: '/docs/security',
      },
      {
        title: 'Troubleshooting',
        body: 'Diagnose verified startup, routing, and service issues.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
        body: [
          'This guide installs PE Community Management with the supported Docker Compose workflow. Compose builds the application images, starts the required services, waits for service dependencies, and exposes the application for first-run setup.',
          'The API container applies pending Prisma migrations before starting the API process. The operator does not start the API, worker, or web application separately.',
        ],
      },
      {
        id: 'what-this-installation-creates',
        title: 'What this installation creates',
        body: [
          'The stack separates browser traffic, application work, persistent records, queued work, and uploaded files. See Architecture for deeper service and data-flow detail.',
        ],
        table: {
          headers: ['Service', 'Operator-facing responsibility'],
          rows: [
            [
              'web',
              'Serves the browser interface and performs server-side setup-status checks.',
            ],
            [
              'api',
              'Handles authentication, permissions, community operations, uploads, and database migrations at container startup.',
            ],
            [
              'worker',
              'Processes queued email, automation, notification-related, and encrypted-media deletion work.',
            ],
            [
              'postgres',
              'Stores authoritative community, account, audit, configuration, and lifecycle records in a named volume.',
            ],
            [
              'redis',
              'Coordinates queues and temporary runtime state; it is not the permanent record for community data.',
            ],
            [
              'caddy',
              'Listens on the configured host HTTP port and routes web, /api/v1, and upload traffic to internal services.',
            ],
          ],
        },
      },
      {
        id: 'before-you-begin',
        title: 'Before you begin',
        body: [
          'Use a host that can run Docker Engine with the Docker Compose plugin and has access to the project files. No specific host operating-system version is required.',
        ],
        bullets: [
          'Confirm sufficient memory and disk capacity for image builds, running services, PostgreSQL growth, logs, and uploaded media.',
          'Reserve the host HTTP port configured by HTTP_PORT. PostgreSQL, Redis, API, and web remain internal in this Compose file.',
          'A domain is optional for the current HTTP workflow. A public installation should use a reviewed TLS-terminating proxy; detailed HTTPS guidance remains outside this validated baseline.',
          'Allow outbound access needed to fetch container images and packages during image builds. SMTP is needed only for email-dependent features, not for first-run setup.',
        ],
        code: {
          label: 'prerequisite check',
          value: 'docker --version\ndocker compose version',
        },
      },
      {
        id: 'resource-planning',
        title: 'Resource planning',
        body: [
          'Image builds temporarily use more memory, CPU, and disk than an idle stack. A constrained test host may complete a build with swap enabled, but builds and concurrent services can become slow or unstable; this is not a recommended sustained deployment size.',
          'Plan additional capacity for active users, media uploads, database growth, email and automation queues, backups, and image layers. No supported sizing matrix is available, so monitor the real workload and retain free storage for recovery operations.',
        ],
      },
      {
        id: 'prepare-the-environment',
        title: 'Prepare the environment',
        body: [
          'Work from the project directory and create a private `.env` from the supplied example. Open it with your preferred editor and review Environment variables before starting the stack.',
          'Replace placeholders, generate independent security secrets, select the public origin and host port, and confirm whether environment-based SMTP is required. The current Compose workflow uses a persistent local uploads volume rather than an S3 or MinIO service.',
        ],
        code: {
          label: 'create the environment file',
          value: 'cp .env.example .env',
        },
        callout: {
          variant: 'security',
          title: 'Protect configuration',
          body: 'Do not commit `.env`. Restrict access to the file and retain a protected record of secrets that must remain stable after installation.',
        },
      },
      {
        id: 'start-the-platform',
        title: 'Start the platform',
        body: [
          'Run the Compose command from the project directory. `-f` selects the deployment file, `-d` starts containers in the background, and `--build` builds the application images before startup.',
          'PostgreSQL and Redis start first and expose health checks. The API waits for both, applies pending migrations, starts, and reports its own health. The web waits for the API health check, and Caddy then routes the configured host port to the stack.',
        ],
        code: { label: 'start services', value: startCommand },
      },
      {
        id: 'verify-the-services',
        title: 'Verify the services',
        body: [
          'Inspect service state before opening setup. PostgreSQL, Redis, and API have health checks; web and worker do not expose health checks in the current Compose file, so use their status and recent logs.',
          'Look for completed migrations, the API listening on port 4000, the web server listening on port 3000, a running worker, and no repeated restart loop. Investigate recurring errors rather than treating container creation as successful verification.',
        ],
        code: { label: 'status and recent logs', value: verifyCommands },
      },
      {
        id: 'complete-initialization',
        title: 'Complete initialization',
        body: [
          'Open the URL represented by WEB_ORIGIN and HTTP_PORT. An empty installation routes to /setup. Complete First-run setup once, then sign in at /login with the new Owner account. Do not run the demo seed for a real community; it is reserved for development, testing, and demonstration.',
        ],
      },
      {
        id: 'protect-persistent-data',
        title: 'Protect persistent data',
        body: [
          'PostgreSQL records live in `postgres_data`, uploaded avatars and attachments live in `uploads_data`, and Redis append-only data lives in `redis_data`. Caddy also has configuration and data volumes. The Compose project name prefixes these resources.',
        ],
        bullets: [
          '`docker compose down` stops and removes containers while retaining named volumes.',
          '`docker compose down -v` removes the project’s named volumes and can destroy the database and uploaded files.',
          '`prisma migrate reset` recreates the database and is destructive.',
          'Changing COMPOSE_PROJECT_NAME can connect the stack to a different set of named volumes, making existing data appear missing.',
          'Changing database credentials or connection values after initialization requires coordinated database and application changes.',
        ],
        callout: {
          variant: 'warning',
          title: 'Named volumes contain community data',
          body: 'Back up PostgreSQL and persistent uploads before destructive Docker, migration, credential, or project-name changes.',
        },
      },
      {
        id: 'common-installation-issues',
        title: 'Common installation issues',
        bullets: [
          'Port already in use: change HTTP_PORT or stop the process already bound to that host port.',
          'Build exits or stalls: review available memory, swap, disk space, and package or image download access.',
          'API waits or restarts: verify POSTGRES_PASSWORD and inspect PostgreSQL health and migration logs.',
          'Worker cannot process jobs: confirm Redis is healthy and the worker uses the same internal REDIS_URL as the API.',
          'Browser requests fail: confirm WEB_ORIGIN and NEXT_PUBLIC_API_URL match the address and same-origin proxy path users actually open.',
          'Uploads fail: confirm the API and worker can write the mounted uploads volume.',
          'Setup does not appear: the installation may already contain a community or active privileged membership, or the web server may not reach the setup-status endpoint.',
        ],
        callout: {
          variant: 'note',
          title: 'Continue diagnosis',
          body: 'Use Troubleshooting for detailed service, routing, environment, and constrained-host checks.',
        },
      },
      {
        id: 'next-steps',
        title: 'Next steps',
        bullets: [
          'Review Environment variables before changing runtime or build-time values.',
          'Complete First-run setup and then review Configuration and Security.',
          'Establish a Backup and restore process before storing important community data.',
          'Use Docker Compose and Troubleshooting for service-specific operating details.',
        ],
      },
      {
        id: 'current-deployment-boundary',
        title: 'Current deployment boundary',
        callout: {
          variant: 'production',
          title: 'Validated workflow',
          body: 'This page covers the standard Compose workflow. Prebuilt release images, automated upgrades, high availability, a supported sizing matrix, zero-downtime deployment, and managed hosting are not covered by this guide.',
        },
      },
    ],
  },
};

const operatorDocsPagesFrRest: Pick<
  Record<OperatorDocsPageKey, DocsPage>,
  'firstRunSetup' | 'environmentVariables'
> = {
  firstRunSetup: {
    title: 'Configuration initiale',
    eyebrow: 'Installation et configuration',
    href: '/docs/first-run-setup',
    description:
      'Initialisez une installation vide une seule fois en créant sa première communauté, son Owner, ses permissions et ses valeurs opérationnelles par défaut.',
    cards: [
      {
        title: 'Bien démarrer',
        body: 'Comprenez les parcours d’intégration Owner, Admin et Member.',
        href: '/docs/getting-started',
      },
      {
        title: 'Administration',
        body: 'Examinez rôles, permissions, opérations membres et gouvernance.',
        href: '/docs/administration',
      },
      {
        title: 'Configuration',
        body: 'Poursuivez avec les paramètres communautaires, emails, rappels et messages.',
        href: '/docs/configuration',
      },
      {
        title: 'Notifications',
        body: 'Comprenez les préférences initiales et la séparation des publics.',
        href: '/docs/notifications',
      },
      {
        title: 'Sécurité',
        body: 'Examinez authentification, protection du setup, sessions et frontières de chiffrement.',
        href: '/docs/security',
      },
      {
        title: 'Sauvegarde et restauration',
        body: 'Protégez la base et les fichiers après l’initialisation.',
        href: '/docs/backup-restore',
      },
    ],
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
        body: [
          'La configuration initiale initialise une installation exactement une fois. Elle crée la première communauté et son Owner et doit être réalisée par la personne responsable du déploiement. Ce n’est pas un formulaire d’administration récurrent.',
        ],
      },
      {
        id: 'when-setup-is-available',
        title: 'Disponibilité de la configuration initiale',
        body: [
          'Le setup est disponible uniquement lorsque la base ne contient aucune communauté et aucune adhésion Owner ou Admin active. En mode `app`, `/` mène à `/setup` tant que cette condition est vraie, puis à `/login` après l’initialisation.',
          'L’API vérifie de nouveau cet état à l’envoi du formulaire. Une requête répétée, ou une base non vide sans être complètement initialisée, est rejetée au lieu de créer une autre première communauté.',
        ],
      },
      {
        id: 'before-you-begin',
        title: 'Avant de commencer',
        bullets: [
          'Préparez le nom de la communauté et un slug stable et unique.',
          'Préparez le nom complet de l’Owner, une adresse email qu’il contrôle et un mot de passe unique.',
          'Choisissez la langue par défaut et le fuseau horaire IANA de la communauté.',
          'Gardez le token de setup disponible si SETUP_TOKEN est configuré.',
          'Confirmez l’URL de l’application et la réussite des vérifications d’état du setup.',
          'Déterminez si l’envoi d’emails est configuré. SMTP n’est pas requis pour terminer le setup et peut être configuré ensuite.',
        ],
      },
      {
        id: 'information-required',
        title: 'Informations requises',
        table: {
          headers: ['Champ', 'Signification et validation'],
          rows: [
            [
              'Nom de la communauté',
              'Nom affiché pour l’organisation et la communauté initiale. Il ne peut pas être vide.',
            ],
            [
              'Slug de la communauté',
              'Identifiant unique en minuscules de 3 à 63 caractères, avec lettres, chiffres et tirets internes. Le formulaire normalise le texte ; vérifiez le résultat avant l’envoi.',
            ],
            [
              'Nom complet de l’Owner',
              'Nom affiché pour la première identité administrative. Il ne peut pas être vide.',
            ],
            [
              'Email de l’Owner',
              'Adresse de connexion. Elle est nettoyée, passée en minuscules, validée et ne doit pas déjà appartenir à un utilisateur.',
            ],
            [
              'Mot de passe de l’Owner',
              'Au moins 8 caractères dans le formulaire et l’API. Il est haché par le service centralisé et jamais stocké en clair. Il ne déchiffre pas les sauvegardes du chat.',
            ],
            [
              'Langue par défaut',
              'Anglais (`en`) ou français (`fr`) pour la présentation initiale de la communauté.',
            ],
            [
              'Fuseau horaire par défaut',
              'Fuseau IANA pris en charge pour la planification et l’affichage des dates et heures.',
            ],
          ],
        },
      },
      {
        id: 'setup-token-protection',
        title: 'Protection par token de setup',
        body: [
          'SETUP_TOKEN est facultatif dans l’API, mais recommandé dès qu’une installation non initialisée est accessible à une autre personne ou à un réseau. Lorsqu’il est configuré, le setup échoue si la valeur transmise ne correspond pas.',
          'L’interface actuelle lit le token depuis `/setup?token=...` et l’envoie dans le corps de la requête. Une valeur de requête pouvant rester dans l’historique ou des traces intermédiaires, utilisez ce lien dans une session contrôlée et effacez-le ensuite. L’API accepte aussi `x-setup-token` pour les clients hors navigateur.',
        ],
        code: {
          label: 'générer un token compatible URL',
          value: 'openssl rand -hex 32',
        },
        callout: {
          variant: 'security',
          title: 'Conserver le token privé',
          body: 'Stockez-le dans SETUP_TOKEN, ne le committez pas et ne l’incluez pas dans les captures, tickets, journaux ou historiques shell partagés.',
        },
      },
      {
        id: 'complete-the-setup-form',
        title: 'Remplir le formulaire',
        bullets: [
          '1. Ouvrez l’URL configurée et confirmez l’affichage de `/setup`.',
          '2. Utilisez l’URL de setup contenant le token lorsque SETUP_TOKEN est configuré.',
          '3. Saisissez et vérifiez le nom de la communauté et le slug normalisé.',
          '4. Saisissez le nom, l’email, le mot de passe de l’Owner et sa confirmation identique.',
          '5. Choisissez la langue et le fuseau horaire par défaut.',
          '6. Envoyez une fois et attendez pendant que l’interface indique la création de l’espace.',
          '7. Après réussite, poursuivez vers `/login?setup=complete` et connectez-vous.',
        ],
        body: [
          'Les contrôles navigateur couvrent le format du slug, la confirmation et le minimum de 8 caractères du mot de passe. Les erreurs serveur sont présentées comme un échec, un token rejeté, un conflit d’email ou un setup déjà terminé. Si la réponse est incertaine, vérifiez l’état du setup et les journaux API avant un nouvel envoi.',
        ],
      },
      {
        id: 'what-the-platform-creates',
        title: 'Éléments créés par la plateforme',
        bullets: [
          'Fondation communautaire : l’organisation initiale, la communauté, le profil Membre de l’Owner et les paramètres avec langue et fuseau par défaut.',
          'Identité et accès : l’utilisateur Owner et son adhésion active, les rôles Owner/Admin/Member, le catalogue de permissions actuel et les attributions par défaut.',
          'Valeurs de communication : paramètres communautaires de rappels et d’emails, préférences initiales de l’Owner, modèles de messages et modèles de notifications d’automatisation.',
          'Journal d’audit : un événement communautaire `installation.initialized` avec la langue et le fuseau choisis.',
        ],
      },
      {
        id: 'what-setup-does-not-create',
        title: 'Éléments non créés par le setup',
        body: [
          'Le setup n’ajoute aucun contenu opérationnel ou de démonstration. La communauté démarre vide afin que l’Owner saisisse volontairement les données réelles.',
        ],
        bullets: [
          'Aucun membre ou demande de démonstration.',
          'Aucune annonce, événement, tâche ou contenu de tableau de tâches.',
          'Aucune conversation, campagne email ou média d’exemple.',
        ],
      },
      {
        id: 'language-and-timezone-behavior',
        title: 'Comportement de la langue et du fuseau',
        body: [
          'Les valeurs choisies deviennent les valeurs communautaires par défaut et sont renvoyées avec l’identité authentifiée. L’interface applique le fuseau communautaire aux vues de dates et de planification prises en charge.',
          'La langue communautaire est appliquée sauf si le navigateur conserve déjà un choix explicite de l’utilisateur. Changer la langue de l’interface ne modifie pas les données métier. L’interface actuelle n’expose pas de préférence de fuseau individuelle ; la planification prise en charge utilise le fuseau communautaire.',
        ],
      },
      {
        id: 'validation-and-failure-behavior',
        title: 'Validation et comportement en cas d’échec',
        body: [
          'L’API valide les noms requis, le slug normalisé, le format et l’unicité de l’email Owner, la longueur du mot de passe, la langue EN/FR, le fuseau pris en charge, le token configuré et l’état de l’installation.',
          'L’initialisation écrit les données requises dans une seule transaction. En cas d’échec avant validation, la plateforme ne conserve pas intentionnellement une communauté partiellement initialisée. Les conflits d’unicité sont présentés comme un setup déjà terminé.',
        ],
      },
      {
        id: 'after-setup',
        title: 'Après le setup',
        bullets: [
          'Confirmez que `/setup` n’est plus disponible et connectez-vous sur `/login` en tant qu’Owner.',
          'Consultez Bien démarrer, la Configuration communautaire et les paramètres de Notifications.',
          'Configurez et testez les emails avant toute communication qui en dépend.',
          'Examinez les permissions avant de créer des comptes Admin individuels ou de déléguer des accès.',
          'Commencez l’intégration des membres et mettez en place les sauvegardes de la base et des fichiers dès que la configuration devient importante.',
        ],
      },
      {
        id: 'security-guidance',
        title: 'Conseils de sécurité',
        bullets: [
          'Utilisez un mot de passe Owner unique et gardez le compte individuel plutôt que partagé.',
          'Créez des comptes Admin distincts et accordez uniquement les permissions nécessaires.',
          'Protégez SETUP_TOKEN et les secrets d’exécution des commits, historiques shell, captures, tickets et journaux.',
          'Séparez les identifiants du compte des sauvegardes du chat chiffré et de leurs mots de passe de récupération.',
          'Vérifiez que le setup est indisponible après sa finalisation.',
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Dépannage',
        bullets: [
          'Page absente : vérifiez le mode `app`, la réponse d’état et l’existence éventuelle d’une communauté ou adhésion privilégiée active.',
          'Token rejeté : confirmez la correspondance exacte avec SETUP_TOKEN et l’absence de troncature ou de décodage URL incorrect.',
          'Slug, email ou mot de passe rejeté : corrigez le slug normalisé, utilisez un email contrôlé valide et respectez les contrôles de mot de passe.',
          'Échec pendant le démarrage : attendez la santé de PostgreSQL et de l’API, puis examinez les journaux de migration et démarrage avant de réessayer.',
          'Langue ou fuseau obsolète après connexion : déconnectez-vous puis reconnectez-vous, et vérifiez les paramètres communautaires et tout choix de langue explicite du navigateur.',
        ],
      },
      {
        id: 'related-documentation',
        title: 'Documentation associée',
        body: [
          'Poursuivez avec Bien démarrer, Administration, Configuration, Notifications, Sécurité et Sauvegarde et restauration. Utilisez Dépannage lorsque l’état du setup ou la disponibilité des services reste incertain.',
        ],
      },
    ],
  },
  environmentVariables: {
    title: 'Variables d’environnement',
    eyebrow: 'Installation et configuration',
    href: '/docs/environment-variables',
    description:
      'Configurez les valeurs requises, les secrets, l’adresse de votre communauté, l’email et les options de sécurité avant le premier démarrage.',
    cards: [
      {
        title: 'Installation',
        body: 'Préparez l’hôte et démarrez le déploiement après avoir vérifié la configuration.',
        href: '/docs/installation',
      },
      {
        title: 'Docker Compose',
        body: 'Consultez les commandes, ports et volumes du déploiement standard.',
        href: '/docs/docker-compose',
      },
      {
        title: 'Configuration',
        body: 'Configurez les paramètres enregistrés dans l’application après l’installation.',
        href: '/docs/configuration',
      },
      {
        title: 'Sécurité',
        body: 'Protégez les secrets, les sessions et les procédures de récupération.',
        href: '/docs/security',
      },
      {
        title: 'Dépannage',
        body: 'Résolvez les problèmes de connexion, temps réel, email et stockage.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'introduction',
        title: 'Avant de commencer',
        body: [
          'Copiez `.env.example` vers `.env` et remplacez les valeurs requises avant le premier démarrage. Gardez `.env` privé et utilisez des secrets indépendants pour chaque fonction de sécurité.',
        ],
      },
      {
        id: 'quick-start',
        title: 'Démarrage rapide',
        body: [
          'Créez le fichier privé, puis définissez le domaine de production, les secrets requis et le mot de passe PostgreSQL. Configurez SMTP uniquement si vous souhaitez un repli email au niveau du déploiement. Ajoutez une protection du setup lorsque la page d’initialisation est accessible depuis Internet.',
        ],
        bullets: [
          'Définissez APP_DOMAIN et WEB_ORIGIN avec l’adresse utilisée par les membres.',
          'Remplacez tous les espaces réservés de secret par des valeurs aléatoires indépendantes.',
          'Définissez POSTGRES_PASSWORD avec une valeur forte compatible URL.',
          'Vérifiez l’exemple de production avant de suivre le guide Installation.',
        ],
        code: {
          title: 'Terminal',
          language: 'shell',
          value: 'cp .env.example .env',
        },
      },
      {
        id: 'required-production-configuration',
        title: 'Configuration requise en production',
        table: {
          headers: ['Variable', 'Exigence', 'Rôle'],
          rows: [
            [
              'APP_DOMAIN',
              'Requise',
              'Nom d’hôte public, par exemple community.example.com. Utilisez :80 uniquement pour un déploiement HTTP direct.',
            ],
            [
              'WEB_ORIGIN',
              'Requise',
              'Adresse exacte ouverte par les utilisateurs, avec schéma et sans barre finale.',
            ],
            [
              'POSTGRES_PASSWORD',
              'Requise',
              'Mot de passe privé et stable du rôle PostgreSQL. Utilisez une valeur forte compatible URL.',
            ],
            [
              'JWT_SECRET',
              'Requise',
              'Secret privé et stable qui protège les sessions. Le changer invalide les sessions actives.',
            ],
            [
              'PASSWORD_PEPPER',
              'Requise',
              'Secret privé et stable d’au moins 32 octets pour la protection des mots de passe.',
            ],
            [
              'COMPOSE_PROJECT_NAME',
              'Recommandée',
              'Identité stable du déploiement et de ses volumes. Conservez pe-community sauf besoin explicite.',
            ],
          ],
        },
      },
      {
        id: 'recommended-security-configuration',
        title: 'Configuration de sécurité recommandée',
        table: {
          headers: ['Variable', 'Exigence', 'Rôle'],
          rows: [
            [
              'EMAIL_ENCRYPTION_KEY',
              'Recommandée',
              'Clé privée et stable qui protège les identifiants SMTP et CAPTCHA enregistrés.',
            ],
            [
              'REGISTRATION_KEY_HASH_SECRET',
              'Recommandée',
              'Secret privé et stable qui renforce la protection des limites d’inscription.',
            ],
            [
              'SETUP_TOKEN',
              'Recommandée avant l’initialisation',
              'Protège la configuration initiale lorsqu’elle est accessible depuis un réseau non fiable.',
            ],
            [
              'OWNER_BREAK_GLASS_SECRET',
              'Facultative',
              'Ajoute une preuve secrète à la procédure d’urgence de récupération 2FA de l’Owner.',
            ],
          ],
        },
        callout: {
          variant: 'security',
          title: 'Utilisez des secrets indépendants',
          body: 'Ne réutilisez pas une même valeur pour JWT_SECRET, PASSWORD_PEPPER, EMAIL_ENCRYPTION_KEY, REGISTRATION_KEY_HASH_SECRET ou OWNER_BREAK_GLASS_SECRET. Ne placez jamais une valeur privée dans une variable NEXT_PUBLIC_*.',
        },
      },
      {
        id: 'application-address',
        title: 'Adresse de l’application',
        body: [
          'Pour le déploiement standard, utilisez un nom d’hôte public, faites correspondre WEB_ORIGIN à l’adresse HTTPS exacte ouverte par les utilisateurs, conservez le chemin API même origine et laissez l’origine temps réel vide.',
        ],
        code: {
          title: '.env',
          language: 'dotenv',
          value: [
            'APP_DOMAIN=community.example.com',
            'WEB_ORIGIN=https://community.example.com',
            'NEXT_PUBLIC_API_URL=/api/v1',
            'NEXT_PUBLIC_REALTIME_ORIGIN=',
          ].join('\n'),
        },
        bullets: [
          'APP_DOMAIN contient le nom d’hôte, sans chemin.',
          'WEB_ORIGIN inclut le schéma et ne doit pas se terminer par une barre oblique.',
          'NEXT_PUBLIC_API_URL et NEXT_PUBLIC_REALTIME_ORIGIN sont visibles du navigateur. Reconstruisez l’application après les avoir modifiées.',
          'Définissez NEXT_PUBLIC_REALTIME_ORIGIN seulement si le temps réel utilise une origine différente.',
        ],
        callout: {
          variant: 'warning',
          title: 'Faites correspondre l’origine publique',
          body: 'Une valeur APP_DOMAIN ou WEB_ORIGIN incorrecte peut empêcher la connexion, les requêtes du navigateur, les liens générés ou les fonctions temps réel.',
        },
      },
      {
        id: 'database-and-redis',
        title: 'Base de données et Redis',
        body: [
          'Définissez POSTGRES_PASSWORD avant le premier démarrage. Le déploiement standard configure automatiquement les connexions PostgreSQL et Redis ; vous ne devez normalement pas modifier DATABASE_URL ou REDIS_URL.',
          'Si vous utilisez une base ou un service Redis externe, configurez les adresses avancées et vérifiez la connectivité avant le démarrage.',
        ],
      },
      {
        id: 'authentication-and-sessions',
        title: 'Authentification et sessions',
        body: [
          'Les sessions expirent après 20 minutes d’inactivité et au plus tard après sept jours. Ces durées sont actuellement fixes.',
        ],
        table: {
          headers: ['Variable', 'Exigence', 'Rôle'],
          rows: [
            [
              'JWT_SECRET',
              'Requise',
              'Gardez-la privée et stable. Une rotation déconnecte les sessions actives.',
            ],
            [
              'PASSWORD_PEPPER',
              'Requise',
              'Gardez-la privée et stable. Elle doit contenir au moins 32 octets.',
            ],
            [
              'PASSWORD_PEPPER_PREVIOUS',
              'Rotation uniquement',
              'Définissez temporairement l’ancien pepper pendant une rotation planifiée, puis retirez-le après migration des comptes actifs.',
            ],
            [
              'SESSION_COOKIE_NAME',
              'Facultative',
              'Nom du cookie de session. La valeur par défaut est pe_session ; un changement abandonne les cookies existants.',
            ],
            [
              'SESSION_COOKIE_SECURE',
              'Facultative',
              'Utilisez true ou false pour forcer le comportement Secure. Laissez vide pour suivre WEB_ORIGIN et le mode de production.',
            ],
          ],
        },
      },
      {
        id: 'generate-secure-secrets',
        title: 'Générer des secrets sûrs',
        body: [
          'La commande suivante produit une valeur hexadécimale de 32 octets adaptée aux secrets de cette page. Exécutez-la séparément pour chaque variable afin que les valeurs restent indépendantes.',
        ],
        code: {
          title: 'Terminal',
          language: 'shell',
          value: 'openssl rand -hex 32',
        },
      },
      {
        id: 'email-delivery',
        title: 'Livraison des emails',
        body: [
          'Vous pouvez configurer l’email depuis l’interface d’administration. Les variables SMTP fournissent un repli au niveau du déploiement lorsqu’aucun réglage communautaire actif ne le remplace.',
        ],
        table: {
          headers: ['Variable', 'Exigence', 'Rôle'],
          rows: [
            [
              'SMTP_HOST',
              'Requise avec le repli SMTP',
              'Nom d’hôte fourni par votre prestataire SMTP.',
            ],
            [
              'SMTP_PORT',
              'Facultative, défaut 587',
              'Utilisez 587 avec STARTTLS ou 465 avec TLS implicite.',
            ],
            [
              'SMTP_USER',
              'Requise avec le repli SMTP',
              'Nom d’utilisateur SMTP.',
            ],
            [
              'SMTP_PASSWORD',
              'Requise avec le repli SMTP, privée',
              'Mot de passe ou identifiant SMTP. Ne l’enregistrez jamais dans le contrôle de version.',
            ],
            [
              'SMTP_SECURE',
              'Facultative, défaut false',
              'Utilisez false pour le port 587 et true pour le port 465.',
            ],
            [
              'SMTP_FROM_EMAIL',
              'Requise avec le repli SMTP',
              'Adresse d’expéditeur utilisée pour les emails.',
            ],
            [
              'SMTP_FROM_NAME',
              'Requise avec le repli SMTP',
              'Nom d’expéditeur affiché.',
            ],
            [
              'EMAIL_ENCRYPTION_KEY',
              'Recommandée, privée et stable',
              'Protège les identifiants SMTP et CAPTCHA enregistrés dans l’administration.',
            ],
          ],
        },
        callout: {
          variant: 'warning',
          title: 'Gardez la clé de chiffrement stable',
          body: 'Changer EMAIL_ENCRYPTION_KEY rend les identifiants SMTP et CAPTCHA déjà enregistrés illisibles.',
        },
      },
      {
        id: 'registration-protection',
        title: 'Protection des inscriptions',
        body: [
          'Configurez CAPTCHA/Turnstile depuis les paramètres d’administration plutôt que dans `.env`. Définissez REGISTRATION_KEY_HASH_SECRET avec une valeur privée et stable pour renforcer la protection des limites d’inscription.',
        ],
      },
      {
        id: 'first-run-protection',
        title: 'Protection de la configuration initiale',
        body: [
          'Définissez SETUP_TOKEN lorsque la page de configuration initiale est accessible depuis Internet. Ouvrez ensuite `/setup?token=<valeur>` dans une session de confiance. Après une initialisation réussie, la configuration initiale ne peut pas être répétée.',
        ],
      },
      {
        id: 'owner-account-recovery',
        title: 'Récupération du compte Owner',
        body: [
          'OWNER_BREAK_GLASS_SECRET est une protection facultative pour la procédure serveur d’urgence de récupération 2FA de l’Owner. Gardez-la privée et consultez le guide Sécurité pour la procédure complète. La modifier affecte uniquement les futures opérations de récupération.',
        ],
      },
      {
        id: 'file-uploads',
        title: 'Fichiers téléversés',
        body: [
          'Le déploiement standard conserve les fichiers téléversés dans un volume persistant et définit UPLOADS_DIR automatiquement. Vous ne devez normalement pas modifier ce chemin. Incluez le volume des fichiers et PostgreSQL dans votre stratégie de sauvegarde.',
        ],
      },
      {
        id: 'advanced-and-custom-deployments',
        title: 'Déploiements avancés et personnalisés',
        body: [
          'Le déploiement standard gère automatiquement les adresses internes, les ports des processus et le chemin des fichiers. Modifiez les valeurs ci-dessous uniquement pour un développement sur l’hôte, un service externe ou une topologie personnalisée.',
        ],
        table: {
          headers: ['Variable', 'Utilisation'],
          rows: [
            [
              'DATABASE_URL',
              'Connexion PostgreSQL personnalisée ou développement sur l’hôte. Format : postgresql://utilisateur:mot-de-passe@hôte:5432/base?schema=public.',
            ],
            [
              'REDIS_URL',
              'Connexion Redis personnalisée ou développement sur l’hôte. La valeur locale habituelle est redis://localhost:6379.',
            ],
            [
              'INTERNAL_API_URL',
              'Adresse interne utilisée par le rendu serveur. Le déploiement standard la définit automatiquement.',
            ],
            [
              'API_PUBLIC_URL',
              'Base publique personnalisée des URL de médias générées. Par défaut, le déploiement utilise WEB_ORIGIN.',
            ],
            [
              'API_PORT',
              'Port du processus d’application pour une exécution sur l’hôte. Défaut : 4000.',
            ],
            [
              'WEB_PORT',
              'Port de l’interface pour une exécution sur l’hôte. Défaut : 3000.',
            ],
            ['HTTP_PORT', 'Port HTTP publié par Docker Compose. Défaut : 80.'],
            [
              'HTTPS_PORT',
              'Port HTTPS publié par Docker Compose. Défaut : 443.',
            ],
            [
              'UPLOADS_DIR',
              'Chemin personnalisé des fichiers téléversés. Le déploiement standard utilise /app/uploads.',
            ],
            [
              'REALTIME_DIAGNOSTICS',
              'Définissez true temporairement pour ajouter des diagnostics de connexion temps réel aux journaux.',
            ],
          ],
        },
      },
      {
        id: 'development-only-settings',
        title: 'Paramètres de développement uniquement',
        body: [
          'EMAIL_DEV_LOG=true remplace l’envoi SMTP manquant par une journalisation des emails uniquement hors production. Ne l’utilisez pas pour valider une livraison réelle.',
        ],
      },
      {
        id: 'changing-configuration',
        title: 'Modifier la configuration plus tard',
        table: {
          headers: ['Variable', 'Impact du changement'],
          rows: [
            ['JWT_SECRET', 'Invalide les sessions actives.'],
            [
              'PASSWORD_PEPPER',
              'Nécessite une rotation planifiée avec PASSWORD_PEPPER_PREVIOUS.',
            ],
            [
              'EMAIL_ENCRYPTION_KEY',
              'Rend illisibles les identifiants SMTP et CAPTCHA déjà enregistrés.',
            ],
            [
              'POSTGRES_PASSWORD',
              'Doit rester synchronisé avec les identifiants PostgreSQL.',
            ],
            [
              'COMPOSE_PROJECT_NAME',
              'Peut sélectionner un autre ensemble de volumes et faire paraître les données absentes.',
            ],
            [
              'APP_DOMAIN et WEB_ORIGIN',
              'Nécessite une vérification DNS/TLS et le redémarrage ou redéploiement des services concernés.',
            ],
            [
              'NEXT_PUBLIC_API_URL et NEXT_PUBLIC_REALTIME_ORIGIN',
              'Nécessite de reconstruire les ressources de l’application.',
            ],
            [
              'OWNER_BREAK_GLASS_SECRET',
              'Modifie la preuve demandée lors des futures récupérations Owner.',
            ],
          ],
        },
      },
      {
        id: 'production-example',
        title: 'Exemple de production',
        body: [
          'Utilisez cet exemple comme point de départ et remplacez chaque espace réservé. Laissez les valeurs SMTP vides si vous configurez l’email uniquement depuis l’administration.',
        ],
        code: {
          title: '.env (exemple de production expurgé)',
          language: 'dotenv',
          value: environmentExample,
        },
      },
      {
        id: 'validation-checklist',
        title: 'Liste de validation',
        bullets: [
          'Le fichier `.env` n’est pas versionné et tous les espaces réservés requis sont remplacés.',
          'Chaque fonction de sécurité utilise un secret indépendant.',
          'APP_DOMAIN et WEB_ORIGIN correspondent à l’adresse ouverte par les utilisateurs.',
          'POSTGRES_PASSWORD est défini avec une valeur forte compatible URL.',
          'La configuration email a été testée si les fonctions email sont nécessaires.',
          'SETUP_TOKEN protège une installation vide exposée à Internet.',
          'PostgreSQL et les fichiers téléversés sont inclus dans les sauvegardes.',
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Dépannage',
        bullets: [
          'Connexion ou requêtes navigateur en échec : vérifiez APP_DOMAIN, WEB_ORIGIN, DNS, HTTPS et le proxy inverse.',
          'Fonctions temps réel déconnectées : vérifiez NEXT_PUBLIC_REALTIME_ORIGIN si vous l’avez définie, puis la connectivité du proxy et les erreurs du navigateur.',
          'Email non envoyé : vérifiez hôte, port, mode TLS, identifiants, identité expéditeur et restrictions SMTP sortantes de l’hébergeur.',
          'Base inaccessible : vérifiez POSTGRES_PASSWORD et l’état du déploiement ; vérifiez DATABASE_URL seulement pour un déploiement personnalisé.',
          'Identifiants email ou CAPTCHA illisibles : restaurez la précédente EMAIL_ENCRYPTION_KEY ou ressaisissez les identifiants sous la nouvelle clé.',
          'Fichiers indisponibles : vérifiez que le volume persistant des téléversements est monté et restauré.',
        ],
      },
    ],
  },
};

const operatorDocsPagesEnRest: Pick<
  Record<OperatorDocsPageKey, DocsPage>,
  'firstRunSetup' | 'environmentVariables'
> = {
  firstRunSetup: {
    title: 'First-run setup',
    eyebrow: 'Install & Setup',
    href: '/docs/first-run-setup',
    description:
      'Initialize an empty installation once, creating its first community, Owner, permissions, and operating defaults.',
    cards: [
      {
        title: 'Getting started',
        body: 'Understand the Owner, Admin, and Member onboarding paths.',
        href: '/docs/getting-started',
      },
      {
        title: 'Administration',
        body: 'Review roles, permissions, member operations, and governance.',
        href: '/docs/administration',
      },
      {
        title: 'Configuration',
        body: 'Continue with community, email, reminder, and message settings.',
        href: '/docs/configuration',
      },
      {
        title: 'Notifications',
        body: 'Understand the initial preferences and separate notification audiences.',
        href: '/docs/notifications',
      },
      {
        title: 'Security',
        body: 'Review authentication, setup protection, sessions, and encryption boundaries.',
        href: '/docs/security',
      },
      {
        title: 'Backup and restore',
        body: 'Protect the database and uploads after initialization.',
        href: '/docs/backup-restore',
      },
    ],
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
        body: [
          'First-run setup initializes an installation exactly once. It creates the first community and its Owner and is intended for the person responsible for the deployment. It is not a recurring administrative form.',
        ],
      },
      {
        id: 'when-setup-is-available',
        title: 'When setup is available',
        body: [
          'Setup is available only when the database contains no community and no active Owner or Admin membership. `/` routes to `/setup` while that state is true and resolves the current session after initialization.',
          'The API checks the state again when the form is submitted. A repeated request, or an inconsistent database that is not empty but is also not fully initialized, is rejected rather than creating another first community.',
        ],
      },
      {
        id: 'before-you-begin',
        title: 'Before you begin',
        bullets: [
          'Prepare the community name and a stable, unique slug.',
          'Prepare the individual Owner’s full name, controlled email address, and unique password.',
          'Choose the community’s default language and IANA timezone.',
          'Have the setup token available if SETUP_TOKEN is configured.',
          'Confirm the application URL and that API setup-status checks succeed.',
          'Know whether email delivery is configured. SMTP is not required to complete setup and can be configured afterward.',
        ],
      },
      {
        id: 'information-required',
        title: 'Information required',
        table: {
          headers: ['Field', 'Meaning and validation'],
          rows: [
            [
              'Community name',
              'The display name for the organization and initial community. It cannot be blank.',
            ],
            [
              'Community slug',
              'A unique lowercase identifier, 3–63 characters, using letters, numbers, and internal hyphens. The form normalizes entered text; review the result before submission.',
            ],
            [
              'Owner full name',
              'The name shown for the first administrative identity. It cannot be blank.',
            ],
            [
              'Owner email',
              'The sign-in address. It is trimmed, lowercased, format-checked, and must not already belong to a user.',
            ],
            [
              'Owner password',
              'At least 8 characters in the setup form and API. It is hashed by the centralized password service and is never stored as plaintext. It does not decrypt chat backups.',
            ],
            [
              'Default language',
              'English (`en`) or French (`fr`) for the initial community presentation.',
            ],
            [
              'Default timezone',
              'A supported IANA timezone used for community scheduling and date/time presentation.',
            ],
          ],
        },
      },
      {
        id: 'setup-token-protection',
        title: 'Setup token protection',
        body: [
          'SETUP_TOKEN is optional in the API, but it is recommended whenever an uninitialized installation is reachable by another person or network. When configured, setup fails unless the submitted value matches.',
          'The current setup interface reads the token from `/setup?token=...` and sends it in the request body. Because a query value can remain in browser history and intermediary records, use the link only in a controlled session and clear it after setup. The API also accepts `x-setup-token` for non-browser clients.',
        ],
        code: {
          label: 'generate a URL-safe token',
          value: 'openssl rand -hex 32',
        },
        callout: {
          variant: 'security',
          title: 'Keep the token private',
          body: 'Store it in SETUP_TOKEN, do not commit it, and do not include it in screenshots, tickets, logs, or shared shell history.',
        },
      },
      {
        id: 'complete-the-setup-form',
        title: 'Complete the setup form',
        bullets: [
          '1. Open the configured application URL and confirm that `/setup` is displayed.',
          '2. Use the token-bearing setup URL when SETUP_TOKEN is configured.',
          '3. Enter and review the community name and normalized slug.',
          '4. Enter the Owner name, email, password, and matching confirmation.',
          '5. Choose the default language and timezone.',
          '6. Submit once and wait while the interface reports that it is creating the workspace.',
          '7. On success, continue to `/login?setup=complete` and sign in.',
        ],
        body: [
          'Client-side checks cover slug format, password confirmation, and the 8-character minimum. Server errors are shown as a setup failure, token rejection, email conflict, or already-completed state. If the response is uncertain, inspect setup status and API logs before submitting again.',
        ],
      },
      {
        id: 'what-the-platform-creates',
        title: 'What the platform creates',
        bullets: [
          'Community foundation: the initial organization, community, Member profile for the Owner, and community settings with language and timezone defaults.',
          'Identity and access: the Owner user and active membership, Owner/Admin/Member roles, the current permission catalog, and default role-permission assignments.',
          'Communication defaults: community reminder and email settings, the Owner’s initial notification preferences, community message templates, and automation notification templates.',
          'Audit record: an `installation.initialized` community audit event with the selected language and timezone metadata.',
        ],
      },
      {
        id: 'what-setup-does-not-create',
        title: 'What setup does not create',
        body: [
          'Setup does not seed operational or demonstration content. The community starts clean so the Owner can add real information deliberately.',
        ],
        bullets: [
          'No demo members or applications.',
          'No announcements, events, tasks, or Task Board content.',
          'No chat conversations, email campaigns, or sample uploaded media.',
        ],
      },
      {
        id: 'language-and-timezone-behavior',
        title: 'Language and timezone behavior',
        body: [
          'The selected values become community defaults and are returned with the authenticated identity after sign-in. The web interface applies the community timezone to supported date and schedule views.',
          'The community language is applied unless the browser already records an explicit user language choice. Changing interface language changes presentation, not stored business data. The current interface does not expose a separate per-user timezone preference; supported scheduling uses the community timezone.',
        ],
      },
      {
        id: 'validation-and-failure-behavior',
        title: 'Validation and failure behavior',
        body: [
          'The API validates required names, the normalized slug, Owner email format and uniqueness, password length, EN/FR language, a supported timezone, the configured setup token, and the installation state.',
          'Initialization writes the required records in one database transaction. If it fails before commit, the platform does not intentionally retain a partially initialized community. Unique-state conflicts are reported as setup already completed.',
        ],
      },
      {
        id: 'after-setup',
        title: 'After setup',
        bullets: [
          'Confirm `/setup` is no longer available and sign in through `/login` as the Owner.',
          'Review Getting started, community Configuration, and Notification settings.',
          'Configure and test email before using email-dependent communication.',
          'Review permissions before creating individual Admin accounts or delegating access.',
          'Begin member onboarding and establish database and upload backups after meaningful configuration starts.',
        ],
      },
      {
        id: 'security-guidance',
        title: 'Security guidance',
        bullets: [
          'Use a unique Owner password and keep the Owner account individual rather than shared.',
          'Create separate Admin accounts and grant only the permissions each person needs.',
          'Protect SETUP_TOKEN and runtime secrets from commits, shell history, screenshots, tickets, and logs.',
          'Keep account credentials separate from encrypted-chat backup files and recovery passwords.',
          'Verify setup is unavailable after completion.',
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        bullets: [
          'Setup page does not appear: confirm the setup-status response and whether a community or active privileged membership already exists.',
          'Token is rejected: confirm the URL-safe value exactly matches SETUP_TOKEN and was not truncated or URL-decoded incorrectly.',
          'Slug, email, or password is rejected: correct the normalized slug, use a valid controlled email, and satisfy password and confirmation checks.',
          'Request fails while services start: wait for PostgreSQL and API health, then inspect API migration and startup logs before retrying.',
          'Language or timezone seems stale after sign-in: sign out and back in, then verify community settings and any explicit browser language choice.',
        ],
      },
      {
        id: 'related-documentation',
        title: 'Related documentation',
        body: [
          'Continue with Getting started, Administration, Configuration, Notifications, Security, and Backup and restore. Use Troubleshooting when setup status or service readiness is unclear.',
        ],
      },
    ],
  },
  environmentVariables: {
    title: 'Environment variables',
    eyebrow: 'Install & Setup',
    href: '/docs/environment-variables',
    description:
      'Configure required values, secrets, your community address, email, and security options before the first start.',
    cards: [
      {
        title: 'Installation',
        body: 'Prepare the host and start the deployment after reviewing configuration.',
        href: '/docs/installation',
      },
      {
        title: 'Docker Compose',
        body: 'Review commands, ports, and volumes for the standard deployment.',
        href: '/docs/docker-compose',
      },
      {
        title: 'Configuration',
        body: 'Configure settings stored in the application after installation.',
        href: '/docs/configuration',
      },
      {
        title: 'Security',
        body: 'Protect secrets, sessions, and account-recovery procedures.',
        href: '/docs/security',
      },
      {
        title: 'Troubleshooting',
        body: 'Resolve connection, realtime, email, and storage problems.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'introduction',
        title: 'Before you begin',
        body: [
          'Copy `.env.example` to `.env` and replace the required values before the first start. Keep `.env` private and use an independent secret for each security purpose.',
        ],
      },
      {
        id: 'quick-start',
        title: 'Quick start',
        body: [
          'Create the private file, then set the production domain, required secrets, and PostgreSQL password. Configure SMTP only when you want a deployment-level email fallback. Add setup protection when initialization is reachable from the internet.',
        ],
        bullets: [
          'Set APP_DOMAIN and WEB_ORIGIN to the address used by members.',
          'Replace every secret placeholder with an independent random value.',
          'Set POSTGRES_PASSWORD to a strong URL-safe value.',
          'Review the production example before continuing to Installation.',
        ],
        code: {
          title: 'Terminal',
          language: 'shell',
          value: 'cp .env.example .env',
        },
      },
      {
        id: 'required-production-configuration',
        title: 'Required production configuration',
        table: {
          headers: ['Variable', 'Requirement', 'Purpose'],
          rows: [
            [
              'APP_DOMAIN',
              'Required',
              'Public hostname, such as community.example.com. Use :80 only for direct HTTP deployment.',
            ],
            [
              'WEB_ORIGIN',
              'Required',
              'Exact address opened by users, including the scheme and without a trailing slash.',
            ],
            [
              'POSTGRES_PASSWORD',
              'Required',
              'Private, stable password for the PostgreSQL role. Use a strong URL-safe value.',
            ],
            [
              'JWT_SECRET',
              'Required',
              'Private, stable secret that protects sessions. Changing it invalidates active sessions.',
            ],
            [
              'PASSWORD_PEPPER',
              'Required',
              'Private, stable secret of at least 32 bytes for password protection.',
            ],
            [
              'COMPOSE_PROJECT_NAME',
              'Recommended',
              'Stable deployment and volume identity. Keep pe-community unless you have a specific reason to change it.',
            ],
          ],
        },
      },
      {
        id: 'recommended-security-configuration',
        title: 'Recommended security configuration',
        table: {
          headers: ['Variable', 'Requirement', 'Purpose'],
          rows: [
            [
              'EMAIL_ENCRYPTION_KEY',
              'Recommended',
              'Private, stable key that protects saved SMTP and CAPTCHA credentials.',
            ],
            [
              'REGISTRATION_KEY_HASH_SECRET',
              'Recommended',
              'Private, stable secret that strengthens registration rate-limit protection.',
            ],
            [
              'SETUP_TOKEN',
              'Recommended before initialization',
              'Protects first-run setup when it is reachable from an untrusted network.',
            ],
            [
              'OWNER_BREAK_GLASS_SECRET',
              'Optional',
              'Adds secret proof to the emergency Owner 2FA recovery procedure.',
            ],
          ],
        },
        callout: {
          variant: 'security',
          title: 'Use independent secrets',
          body: 'Do not reuse one value for JWT_SECRET, PASSWORD_PEPPER, EMAIL_ENCRYPTION_KEY, REGISTRATION_KEY_HASH_SECRET, or OWNER_BREAK_GLASS_SECRET. Never place a private value in a NEXT_PUBLIC_* variable.',
        },
      },
      {
        id: 'application-address',
        title: 'Application address',
        body: [
          'For the standard deployment, use a public hostname, match WEB_ORIGIN to the exact HTTPS address opened by users, keep the same-origin API path, and leave the explicit realtime origin empty.',
        ],
        code: {
          title: '.env',
          language: 'dotenv',
          value: [
            'APP_DOMAIN=community.example.com',
            'WEB_ORIGIN=https://community.example.com',
            'NEXT_PUBLIC_API_URL=/api/v1',
            'NEXT_PUBLIC_REALTIME_ORIGIN=',
          ].join('\n'),
        },
        bullets: [
          'APP_DOMAIN contains the hostname without a path.',
          'WEB_ORIGIN includes the scheme and must not end with a slash.',
          'NEXT_PUBLIC_API_URL and NEXT_PUBLIC_REALTIME_ORIGIN are browser-visible. Rebuild the application after changing them.',
          'Set NEXT_PUBLIC_REALTIME_ORIGIN only when realtime uses a different origin.',
        ],
        callout: {
          variant: 'warning',
          title: 'Match the public origin',
          body: 'An incorrect APP_DOMAIN or WEB_ORIGIN can prevent sign-in, browser requests, generated links, or realtime features.',
        },
      },
      {
        id: 'database-and-redis',
        title: 'Database and Redis',
        body: [
          'Set POSTGRES_PASSWORD before the first start. The standard deployment configures PostgreSQL and Redis connections automatically, so you normally do not need to change DATABASE_URL or REDIS_URL.',
          'If you use an external database or Redis service, set the advanced addresses and verify connectivity before startup.',
        ],
      },
      {
        id: 'authentication-and-sessions',
        title: 'Authentication and sessions',
        body: [
          'Sessions expire after 20 minutes of inactivity and no later than seven days after creation. These durations are currently fixed.',
        ],
        table: {
          headers: ['Variable', 'Requirement', 'Purpose'],
          rows: [
            [
              'JWT_SECRET',
              'Required',
              'Keep it private and stable. Rotation signs out active sessions.',
            ],
            [
              'PASSWORD_PEPPER',
              'Required',
              'Keep it private and stable. It must contain at least 32 bytes.',
            ],
            [
              'PASSWORD_PEPPER_PREVIOUS',
              'Rotation only',
              'Temporarily set the old pepper during a planned rotation, then remove it after active accounts have migrated.',
            ],
            [
              'SESSION_COOKIE_NAME',
              'Optional',
              'Session cookie name. The default is pe_session; changing it abandons existing cookies.',
            ],
            [
              'SESSION_COOKIE_SECURE',
              'Optional',
              'Use true or false to force Secure behavior. Leave it empty to follow WEB_ORIGIN and production mode.',
            ],
          ],
        },
      },
      {
        id: 'generate-secure-secrets',
        title: 'Generate secure secrets',
        body: [
          'This command produces a 32-byte hexadecimal value suitable for the secrets on this page. Run it separately for every variable so the values remain independent.',
        ],
        code: {
          title: 'Terminal',
          language: 'shell',
          value: 'openssl rand -hex 32',
        },
      },
      {
        id: 'email-delivery',
        title: 'Email delivery',
        body: [
          'You can configure email from the administration interface. SMTP environment variables provide a deployment-level fallback when no active community setting overrides them.',
        ],
        table: {
          headers: ['Variable', 'Requirement', 'Purpose'],
          rows: [
            [
              'SMTP_HOST',
              'Required with SMTP fallback',
              'Hostname supplied by your SMTP provider.',
            ],
            [
              'SMTP_PORT',
              'Optional, default 587',
              'Use 587 with STARTTLS or 465 with implicit TLS.',
            ],
            ['SMTP_USER', 'Required with SMTP fallback', 'SMTP username.'],
            [
              'SMTP_PASSWORD',
              'Required with SMTP fallback, private',
              'SMTP password or credential. Never commit it to version control.',
            ],
            [
              'SMTP_SECURE',
              'Optional, default false',
              'Use false for port 587 and true for port 465.',
            ],
            [
              'SMTP_FROM_EMAIL',
              'Required with SMTP fallback',
              'Sender address used for email.',
            ],
            [
              'SMTP_FROM_NAME',
              'Required with SMTP fallback',
              'Displayed sender name.',
            ],
            [
              'EMAIL_ENCRYPTION_KEY',
              'Recommended, private, stable',
              'Protects SMTP and CAPTCHA credentials saved through administration.',
            ],
          ],
        },
        callout: {
          variant: 'warning',
          title: 'Keep the encryption key stable',
          body: 'Changing EMAIL_ENCRYPTION_KEY makes previously saved SMTP and CAPTCHA credentials unreadable.',
        },
      },
      {
        id: 'registration-protection',
        title: 'Registration protection',
        body: [
          'Configure CAPTCHA/Turnstile from administration settings rather than `.env`. Set REGISTRATION_KEY_HASH_SECRET to a private, stable value to strengthen registration rate-limit protection.',
        ],
      },
      {
        id: 'first-run-protection',
        title: 'First-run protection',
        body: [
          'Set SETUP_TOKEN when first-run setup is reachable from the internet. Then open `/setup?token=<value>` in a trusted session. After successful initialization, first-run setup cannot be repeated.',
        ],
      },
      {
        id: 'owner-account-recovery',
        title: 'Owner account recovery',
        body: [
          'OWNER_BREAK_GLASS_SECRET is optional additional protection for the server-side emergency Owner 2FA recovery procedure. Keep it private and see Security for the complete procedure. Changing it affects only future recovery operations.',
        ],
      },
      {
        id: 'file-uploads',
        title: 'File uploads',
        body: [
          'The standard deployment keeps uploaded files in a persistent volume and sets UPLOADS_DIR automatically. You normally do not need to change this path. Include both the uploads volume and PostgreSQL in your backup plan.',
        ],
      },
      {
        id: 'advanced-and-custom-deployments',
        title: 'Advanced and custom deployments',
        body: [
          'The standard deployment manages internal addresses, process ports, and the uploads path automatically. Change the values below only for host development, an external service, or a custom topology.',
        ],
        table: {
          headers: ['Variable', 'Use'],
          rows: [
            [
              'DATABASE_URL',
              'Custom PostgreSQL connection or host development. Format: postgresql://user:password@host:5432/database?schema=public.',
            ],
            [
              'REDIS_URL',
              'Custom Redis connection or host development. The usual local value is redis://localhost:6379.',
            ],
            [
              'INTERNAL_API_URL',
              'Internal address used by server rendering. The standard deployment sets it automatically.',
            ],
            [
              'API_PUBLIC_URL',
              'Custom public base for generated media URLs. The deployment uses WEB_ORIGIN by default.',
            ],
            [
              'API_PORT',
              'Application process port for host execution. Default: 4000.',
            ],
            [
              'WEB_PORT',
              'Interface process port for host execution. Default: 3000.',
            ],
            [
              'HTTP_PORT',
              'HTTP port published by Docker Compose. Default: 80.',
            ],
            [
              'HTTPS_PORT',
              'HTTPS port published by Docker Compose. Default: 443.',
            ],
            [
              'UPLOADS_DIR',
              'Custom uploaded-file path. The standard deployment uses /app/uploads.',
            ],
            [
              'REALTIME_DIAGNOSTICS',
              'Set true temporarily to add realtime connection diagnostics to logs.',
            ],
          ],
        },
      },
      {
        id: 'development-only-settings',
        title: 'Development-only settings',
        body: [
          'EMAIL_DEV_LOG=true replaces missing SMTP delivery with email logging outside production only. Do not use it to validate real delivery.',
        ],
      },
      {
        id: 'changing-configuration',
        title: 'Changing configuration later',
        table: {
          headers: ['Variable', 'Impact when changed'],
          rows: [
            ['JWT_SECRET', 'Invalidates active sessions.'],
            [
              'PASSWORD_PEPPER',
              'Requires a planned rotation with PASSWORD_PEPPER_PREVIOUS.',
            ],
            [
              'EMAIL_ENCRYPTION_KEY',
              'Makes previously saved SMTP and CAPTCHA credentials unreadable.',
            ],
            [
              'POSTGRES_PASSWORD',
              'Must remain synchronized with PostgreSQL credentials.',
            ],
            [
              'COMPOSE_PROJECT_NAME',
              'Can select a different volume set and make existing data appear absent.',
            ],
            [
              'APP_DOMAIN / WEB_ORIGIN',
              'Requires DNS/TLS review and a restart or redeployment of affected services.',
            ],
            [
              'NEXT_PUBLIC_API_URL / NEXT_PUBLIC_REALTIME_ORIGIN',
              'Requires rebuilding application assets.',
            ],
            [
              'OWNER_BREAK_GLASS_SECRET',
              'Changes the proof requested for future Owner recovery.',
            ],
          ],
        },
      },
      {
        id: 'production-example',
        title: 'Production example',
        body: [
          'Use this as a starting point and replace every placeholder. Leave SMTP values empty when email is configured only through administration.',
        ],
        code: {
          title: '.env (redacted production example)',
          language: 'dotenv',
          value: environmentExample,
        },
      },
      {
        id: 'validation-checklist',
        title: 'Validation checklist',
        bullets: [
          'The `.env` file is not committed and every required placeholder is replaced.',
          'Each security purpose uses an independent secret.',
          'APP_DOMAIN and WEB_ORIGIN match the address opened by users.',
          'POSTGRES_PASSWORD is set to a strong URL-safe value.',
          'Email configuration has been tested when email features are required.',
          'SETUP_TOKEN protects an empty installation exposed to the internet.',
          'PostgreSQL and uploaded files are included in backups.',
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        bullets: [
          'Sign-in or browser requests fail: check APP_DOMAIN, WEB_ORIGIN, DNS, HTTPS, and the reverse proxy.',
          'Realtime features disconnect: check NEXT_PUBLIC_REALTIME_ORIGIN if set, then proxy connectivity and browser errors.',
          'Email is not sent: check host, port, TLS mode, credentials, sender identity, and outbound SMTP restrictions from your host.',
          'The database is unavailable: check POSTGRES_PASSWORD and deployment status; check DATABASE_URL only for a custom deployment.',
          'Saved email or CAPTCHA credentials are unreadable: restore the previous EMAIL_ENCRYPTION_KEY or re-enter credentials under the new key.',
          'Uploaded files are unavailable: verify that the persistent uploads volume is mounted and restored.',
        ],
      },
    ],
  },
};

const operatorDocsPagesFrInstallation: Pick<
  Record<OperatorDocsPageKey, DocsPage>,
  'installation'
> = {
  installation: {
    title: 'Installation',
    eyebrow: 'Installation et configuration',
    href: '/docs/installation',
    description:
      'Préparez un hôte, démarrez le déploiement Docker Compose, vérifiez ses services et poursuivez avec la configuration initiale.',
    cards: [
      {
        title: 'Variables d’environnement',
        body: 'Examinez les valeurs requises, les secrets, le routage et l’impact des changements avant le démarrage.',
        href: '/docs/environment-variables',
      },
      {
        title: 'Configuration initiale',
        body: 'Initialisez la première communauté et l’Owner une fois les services prêts.',
        href: '/docs/first-run-setup',
      },
      {
        title: 'Docker Compose',
        body: 'Examinez les dépendances des services, les volumes, les ports et le routage du proxy.',
        href: '/docs/docker-compose',
      },
      {
        title: 'Sauvegarde et restauration',
        body: 'Planifiez la protection de PostgreSQL et des fichiers persistants.',
        href: '/docs/backup-restore',
      },
      {
        title: 'Sécurité',
        body: 'Examinez les secrets, sessions, permissions et protections du déploiement.',
        href: '/docs/security',
      },
      {
        title: 'Dépannage',
        body: 'Diagnostiquez les problèmes vérifiés de démarrage, routage et services.',
        href: '/docs/troubleshooting',
      },
    ],
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
        body: [
          'Ce guide installe PE Community Management avec le parcours Docker Compose pris en charge. Compose construit les images applicatives, démarre les services requis, attend leurs dépendances et expose l’application pour sa configuration initiale.',
          'Le conteneur API applique les migrations Prisma en attente avant de démarrer le processus API. L’opérateur ne lance pas séparément l’API, le worker ou l’application web.',
        ],
      },
      {
        id: 'what-this-installation-creates',
        title: 'Services créés par l’installation',
        body: [
          'La pile sépare le trafic navigateur, le traitement applicatif, les données persistantes, les travaux en file et les fichiers téléversés. Consultez Architecture pour approfondir les services et flux de données.',
        ],
        table: {
          headers: ['Service', 'Responsabilité pour l’opérateur'],
          rows: [
            [
              'web',
              'Sert l’interface navigateur et vérifie côté serveur l’état de la configuration initiale.',
            ],
            [
              'api',
              'Gère l’authentification, les permissions, les opérations communautaires, les fichiers et les migrations de base au démarrage du conteneur.',
            ],
            [
              'worker',
              'Traite les emails, automatisations, notifications et suppressions de médias chiffrés placés en file.',
            ],
            [
              'postgres',
              'Stocke les données de référence de la communauté, des comptes, de l’audit, de la configuration et des cycles de vie dans un volume nommé.',
            ],
            [
              'redis',
              'Coordonne les files et l’état temporaire ; il ne constitue pas le stockage permanent des données communautaires.',
            ],
            [
              'caddy',
              'Écoute sur le port HTTP hôte configuré et achemine le web, `/api/v1` et les fichiers vers les services internes.',
            ],
          ],
        },
      },
      {
        id: 'before-you-begin',
        title: 'Avant de commencer',
        body: [
          'Utilisez un hôte capable d’exécuter Docker Engine avec le plugin Docker Compose et ayant accès aux fichiers du projet. Aucune version précise du système d’exploitation hôte n’est requise.',
        ],
        bullets: [
          'Prévoyez assez de mémoire et d’espace disque pour la construction des images, les services actifs, la croissance de PostgreSQL, les journaux et les médias téléversés.',
          'Réservez le port HTTP hôte défini par HTTP_PORT. PostgreSQL, Redis, l’API et le web restent internes dans ce fichier Compose.',
          'Un domaine est facultatif pour le parcours HTTP actuel. Une installation publique doit utiliser un proxy TLS examiné ; les conseils HTTPS détaillés restent hors de ce socle validé.',
          'Autorisez les accès sortants nécessaires au téléchargement des images et paquets pendant la construction. SMTP est requis uniquement pour les fonctions dépendantes des emails, pas pour la configuration initiale.',
        ],
        code: {
          label: 'vérification des prérequis',
          value: 'docker --version\ndocker compose version',
        },
      },
      {
        id: 'resource-planning',
        title: 'Planification des ressources',
        body: [
          'La construction des images utilise temporairement plus de mémoire, de processeur et de disque qu’une pile inactive. Un hôte de test limité peut terminer une construction avec du swap, mais les builds et services simultanés peuvent devenir lents ou instables ; ce n’est pas une taille recommandée pour une exploitation durable.',
          'Prévoyez une capacité supplémentaire pour les utilisateurs actifs, les médias, la croissance de la base, les files d’emails et d’automatisation, les sauvegardes et les couches d’images. Aucune matrice de dimensionnement prise en charge n’est disponible : surveillez la charge réelle et conservez de l’espace libre pour les opérations de restauration.',
        ],
      },
      {
        id: 'prepare-the-environment',
        title: 'Préparer l’environnement',
        body: [
          'Travaillez depuis le répertoire du projet et créez un fichier `.env` privé depuis l’exemple fourni. Ouvrez-le avec l’éditeur de votre choix et consultez Variables d’environnement avant de démarrer la pile.',
          'Remplacez les valeurs temporaires, générez des secrets indépendants, choisissez l’origine publique et le port hôte, puis déterminez si SMTP via l’environnement est nécessaire. Le parcours Compose actuel utilise un volume local persistant pour les fichiers, et non un service S3 ou MinIO.',
        ],
        code: {
          label: 'créer le fichier d’environnement',
          value: 'cp .env.example .env',
        },
        callout: {
          variant: 'security',
          title: 'Protéger la configuration',
          body: 'Ne committez pas `.env`. Limitez l’accès au fichier et conservez une copie protégée des secrets qui doivent rester stables après l’installation.',
        },
      },
      {
        id: 'start-the-platform',
        title: 'Démarrer la plateforme',
        body: [
          'Exécutez la commande Compose depuis le répertoire du projet. `-f` sélectionne le fichier de déploiement, `-d` démarre les conteneurs en arrière-plan et `--build` construit les images applicatives.',
          'PostgreSQL et Redis démarrent en premier avec leurs contrôles de santé. L’API les attend, applique les migrations, démarre et publie son propre contrôle de santé. Le web attend l’API, puis Caddy achemine le port hôte configuré vers la pile.',
        ],
        code: { label: 'démarrer les services', value: startCommand },
      },
      {
        id: 'verify-the-services',
        title: 'Vérifier les services',
        body: [
          'Examinez l’état des services avant d’ouvrir la configuration initiale. PostgreSQL, Redis et l’API ont des contrôles de santé ; le web et le worker n’en exposent pas dans le fichier Compose actuel, utilisez donc leur statut et leurs journaux récents.',
          'Vérifiez la fin des migrations, l’écoute de l’API sur le port 4000, celle du web sur le port 3000, un worker actif et l’absence de boucle de redémarrage. Analysez les erreurs récurrentes au lieu de considérer la seule création des conteneurs comme une validation.',
        ],
        code: { label: 'état et journaux récents', value: verifyCommands },
      },
      {
        id: 'complete-initialization',
        title: 'Terminer l’initialisation',
        body: [
          'Ouvrez l’URL représentée par WEB_ORIGIN et HTTP_PORT. En mode `app`, une installation vide mène à `/setup`. Terminez une fois la Configuration initiale, puis connectez-vous sur `/login` avec le nouvel Owner. N’exécutez pas le seed de démonstration pour une vraie communauté ; il est réservé au développement, aux tests et aux démonstrations.',
        ],
      },
      {
        id: 'protect-persistent-data',
        title: 'Protéger les données persistantes',
        body: [
          'Les données PostgreSQL résident dans `postgres_data`, les avatars et pièces jointes dans `uploads_data`, et les données append-only de Redis dans `redis_data`. Caddy possède aussi des volumes de configuration et de données. Le nom du projet Compose préfixe ces ressources.',
        ],
        bullets: [
          '`docker compose down` arrête et supprime les conteneurs tout en conservant les volumes nommés.',
          '`docker compose down -v` supprime les volumes nommés du projet et peut détruire la base et les fichiers téléversés.',
          '`prisma migrate reset` recrée la base de données et est destructif.',
          'Changer COMPOSE_PROJECT_NAME peut connecter la pile à un autre ensemble de volumes, donnant l’impression que les données ont disparu.',
          'Modifier les identifiants ou connexions de base après l’initialisation exige des changements coordonnés côté base et application.',
        ],
        callout: {
          variant: 'warning',
          title: 'Les volumes nommés contiennent les données communautaires',
          body: 'Sauvegardez PostgreSQL et les fichiers persistants avant toute modification destructive de Docker, des migrations, des identifiants ou du nom de projet.',
        },
      },
      {
        id: 'common-installation-issues',
        title: 'Problèmes d’installation courants',
        bullets: [
          'Port déjà utilisé : changez HTTP_PORT ou arrêtez le processus lié à ce port hôte.',
          'Construction interrompue ou bloquée : vérifiez mémoire, swap, espace disque et accès aux téléchargements de paquets ou d’images.',
          'API en attente ou en redémarrage : vérifiez POSTGRES_PASSWORD, la santé de PostgreSQL et les journaux de migration.',
          'Worker incapable de traiter les tâches : confirmez que Redis est sain et que le worker utilise le même REDIS_URL interne que l’API.',
          'Requêtes navigateur en échec : confirmez que WEB_ORIGIN et NEXT_PUBLIC_API_URL correspondent à l’adresse et au chemin proxy réellement ouverts.',
          'Fichiers en échec : confirmez que l’API et le worker peuvent écrire dans le volume de fichiers monté.',
          'Configuration initiale absente : une communauté ou une adhésion privilégiée active peut déjà exister, ou le mode `app` peut ne pas avoir été intégré à l’image web.',
        ],
        callout: {
          variant: 'note',
          title: 'Poursuivre le diagnostic',
          body: 'Utilisez Dépannage pour les contrôles détaillés des services, du routage, de l’environnement et des hôtes limités.',
        },
      },
      {
        id: 'next-steps',
        title: 'Étapes suivantes',
        bullets: [
          'Consultez Variables d’environnement avant de modifier une valeur d’exécution ou de build.',
          'Terminez la Configuration initiale, puis examinez Configuration et Sécurité.',
          'Établissez un processus de Sauvegarde et restauration avant d’enregistrer des données importantes.',
          'Utilisez Docker Compose et Dépannage pour les détails d’exploitation propres aux services.',
        ],
      },
      {
        id: 'current-deployment-boundary',
        title: 'Limite actuelle du déploiement',
        callout: {
          variant: 'production',
          title: 'Parcours validé',
          body: 'Cette page couvre le parcours Compose standard. Les images de version préconstruites, les mises à niveau automatisées, la haute disponibilité, une matrice de dimensionnement prise en charge, le déploiement sans interruption et l’hébergement géré ne sont pas couverts par ce guide.',
        },
      },
    ],
  },
};

export const operatorDocsPagesEn: Record<OperatorDocsPageKey, DocsPage> = {
  installation: operatorDocsMixed.installation,
  ...operatorDocsPagesEnRest,
};

export const operatorDocsPagesFr: Record<OperatorDocsPageKey, DocsPage> = {
  ...operatorDocsPagesFrInstallation,
  ...operatorDocsPagesFrRest,
};
