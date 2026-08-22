import { localizeDocsText, type DocsLang } from './content';

export type DocsNavItem = {
  title: string;
  href: string;
  description?: string;
  children?: Array<{ title: string; href: string; description?: string }>;
};

export type DocsNavGroup = {
  title: string;
  items: DocsNavItem[];
};

export const docsNavigation: DocsNavGroup[] = [
  {
    title: 'Overview',
    items: [
      {
        title: 'Docs home',
        href: '/docs',
        description: 'Choose the documentation path for your role or task.',
      },
      {
        title: 'Getting started',
        href: '/docs/getting-started',
        description: 'Role-based onboarding and first operational steps.',
      },
    ],
  },
  {
    title: 'Install & Setup',
    items: [
      {
        title: 'Installation',
        href: '/docs/installation',
        description:
          'Prepare, start, verify, and protect the Compose deployment.',
      },
      {
        title: 'First-run setup',
        href: '/docs/first-run-setup',
        description: 'Initialize the first community and Owner once.',
      },
      {
        title: 'Environment variables',
        href: '/docs/environment-variables',
        description:
          'Configure secrets, services, routing, email, and storage.',
      },
      {
        title: 'Docker Compose',
        href: '/docs/docker-compose',
        description: 'Services, volumes, and naming.',
      },
      {
        title: 'Configuration',
        href: '/docs/configuration',
        description: 'Settings after the first owner signs in.',
      },
    ],
  },
  {
    title: 'Deployment',
    items: [
      {
        title: 'Deployment',
        href: '/docs/deployment',
        description: 'Current Caddy same-origin deployment flow.',
      },
      {
        title: 'Backup and restore',
        href: '/docs/backup-restore',
        description: 'Protect database and uploads.',
      },
      {
        title: 'Upgrades',
        href: '/docs/upgrades',
        description: 'Current source and migration update process.',
      },
      {
        title: 'Troubleshooting',
        href: '/docs/troubleshooting',
        description: 'Known setup and VPS issues.',
      },
    ],
  },
  {
    title: 'Platform',
    items: [
      {
        title: 'Administration',
        href: '/docs/administration',
        description:
          'A map of the operational workspace and delegated responsibilities.',
      },
      {
        title: 'Reminders',
        href: '/docs/reminders',
        description:
          'Birthday, membership anniversary, passport, and manual due-date checks.',
      },
      {
        title: 'Message templates',
        href: '/docs/message-templates',
        description:
          'Reminder, transactional email, and automation message customization.',
      },
      {
        title: 'Roles and permissions',
        href: '/docs/roles-and-permissions',
        description:
          'Access roles, delegated administration, and authorization boundaries.',
      },
      {
        title: 'Registrations',
        href: '/docs/registrations',
        description:
          'Applications, approval, onboarding, suspension, and directory access.',
      },
      {
        title: 'Calendar and events',
        href: '/docs/calendar-and-events',
        description:
          'Event scheduling, member RSVPs, task deadlines, and lifecycle behavior.',
      },
      {
        title: 'Announcements and Feed',
        href: '/docs/announcements-and-feed',
        description:
          'Publishing, email delivery, engagement, and read reporting.',
      },
      {
        title: 'Task boards',
        href: '/docs/task-boards',
        description:
          'Boards, tasks, assignments, collaboration, and lifecycle.',
      },
      {
        title: 'Automation',
        href: '/docs/automation',
        description: 'Rules, eligibility, delivery, testing, and run history.',
      },
      {
        title: 'Notifications',
        href: '/docs/notifications',
        description:
          'Notification centers, unread state, preferences, and delivery.',
      },
      {
        title: 'Streaks and engagement',
        href: '/docs/streaks-and-engagement',
        description: 'Login streaks, rankings, timezone behavior, and privacy.',
      },
      {
        title: 'Audit logs',
        href: '/docs/audit-logs',
        description:
          'Operational history, filters, outcomes, and security boundaries.',
      },
      {
        title: 'Encrypted chat',
        href: '/docs/encrypted-chat',
        description:
          'E2EE, recovery, devices, encrypted media, and participant privacy.',
      },
      {
        title: 'Security',
        href: '/docs/security',
        description:
          'Authentication, sessions, authorization, and operator responsibilities.',
      },
    ],
  },
  {
    title: 'Technical reference',
    items: [
      {
        title: 'Architecture',
        href: '/docs/architecture',
        description: 'Web, API, worker, data, and proxy flow.',
      },
      {
        title: 'Contributing',
        href: '/docs/contributing',
        description: 'Development workflow and checks.',
      },
    ],
  },
];

export function getDocsNavigation(lang: DocsLang = 'en'): DocsNavGroup[] {
  return docsNavigation.map((group) => ({
    ...group,
    title: localizeNavigationText(group.title, lang),
    items: group.items.map((item) => localizeDocsNavItem(item, lang)),
  }));
}

export function getDocsNavItems(lang: DocsLang = 'en') {
  return getDocsNavigation(lang).flatMap((group) =>
    group.items.flatMap((item) => [item, ...(item.children ?? [])]),
  );
}

function localizeDocsNavItem(item: DocsNavItem, lang: DocsLang): DocsNavItem {
  return {
    ...item,
    title: localizeNavigationText(item.title, lang),
    description: item.description
      ? localizeNavigationText(item.description, lang)
      : undefined,
    children: item.children?.map((child) => localizeDocsNavItem(child, lang)),
  };
}

const navigationTranslations: Record<string, string> = {
  'Technical reference': 'Référence technique',
  Reminders: 'Rappels',
  'Message templates': 'Modèles de messages',
  'Birthday, membership anniversary, passport, and manual due-date checks.':
    'Anniversaires, ancienneté, passeports et vérifications manuelles des échéances.',
  'Reminder, transactional email, and automation message customization.':
    'Personnalisation des rappels, emails transactionnels et messages d’automatisation.',
  'Roles and permissions': 'Rôles et permissions',
  Registrations: 'Inscriptions',
  'Calendar and events': 'Calendrier et événements',
  'Announcements and Feed': 'Annonces et Fil',
  'Task boards': 'Tableaux de tâches',
  'Streaks and engagement': 'Séries et engagement',
  'Audit logs': 'Journaux d’audit',
  Security: 'Sécurité',
  'A map of the operational workspace and delegated responsibilities.':
    'Une vue d’ensemble de l’espace opérationnel et des responsabilités déléguées.',
  'Access roles, delegated administration, and authorization boundaries.':
    'Rôles d’accès, administration déléguée et limites d’autorisation.',
  'Applications, approval, onboarding, suspension, and directory access.':
    'Demandes, approbation, intégration, suspension et accès à l’annuaire.',
  'Event scheduling, member RSVPs, task deadlines, and lifecycle behavior.':
    'Planification des événements, réponses, échéances et cycle de vie.',
  'Publishing, email delivery, engagement, and read reporting.':
    'Publication, diffusion par email, engagement et suivi de lecture.',
  'Boards, tasks, assignments, collaboration, and lifecycle.':
    'Tableaux, tâches, affectations, collaboration et cycle de vie.',
  'Rules, eligibility, delivery, testing, and run history.':
    'Règles, éligibilité, diffusion, tests et historique d’exécution.',
  'Notification centers, unread state, preferences, and delivery.':
    'Centres de notifications, non-lus, préférences et diffusion.',
  'Login streaks, rankings, timezone behavior, and privacy.':
    'Séries de connexion, classement, fuseau horaire et confidentialité.',
  'Operational history, filters, outcomes, and security boundaries.':
    'Historique opérationnel, filtres, résultats et limites de sécurité.',
  'E2EE, recovery, devices, encrypted media, and participant privacy.':
    'E2EE, récupération, appareils, médias chiffrés et confidentialité des participants.',
  'Authentication, sessions, authorization, and operator responsibilities.':
    'Authentification, sessions, autorisation et responsabilités de l’opérateur.',
};

function localizeNavigationText(value: string, lang: DocsLang) {
  if (lang === 'fr')
    return navigationTranslations[value] ?? localizeDocsText(value, lang);
  return value;
}
