import type { DocsLang, DocsPage } from './content';

export type FeatureDocsPageKey =
  | 'administration'
  | 'reminders'
  | 'messageTemplates'
  | 'rolesPermissions'
  | 'registrations'
  | 'calendarEvents'
  | 'announcementsFeed'
  | 'taskBoards'
  | 'automation'
  | 'notifications'
  | 'streaksEngagement'
  | 'auditLogs'
  | 'encryptedChat'
  | 'security';

const text = (lang: DocsLang, english: string, french: string) =>
  lang === 'fr' ? french : english;

function platformPages(lang: DocsLang): Record<FeatureDocsPageKey, DocsPage> {
  const t = (english: string, french: string) => text(lang, english, french);
  return {
    administration: {
      title: t('Administration', 'Administration'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/administration',
      description: t(
        'A map of the operational workspace and the responsibilities administrators can delegate.',
        'Une vue d’ensemble de l’espace opérationnel et des responsabilités que les administrateurs peuvent déléguer.',
      ),
      cards: [
        {
          title: t('Roles and permissions', 'Rôles et permissions'),
          body: t(
            'Understand delegated access and server-side authorization.',
            'Comprendre les accès délégués et l’autorisation côté serveur.',
          ),
          href: '/docs/roles-and-permissions',
        },
        {
          title: t('Registrations', 'Inscriptions'),
          body: t(
            'Review applications and member onboarding.',
            'Examiner les demandes et l’intégration des membres.',
          ),
          href: '/docs/registrations',
        },
        {
          title: t('Task boards', 'Tableaux de tâches'),
          body: t(
            'Organize event work and standalone operations.',
            'Organiser le travail événementiel et les opérations autonomes.',
          ),
          href: '/docs/task-boards',
        },
        {
          title: t('Audit logs', 'Journaux d’audit'),
          body: t(
            'Review sensitive and operational actions.',
            'Examiner les actions sensibles et opérationnelles.',
          ),
          href: '/docs/audit-logs',
        },
      ],
      sections: [
        {
          id: 'operational-scope',
          title: t('Operational scope', 'Périmètre opérationnel'),
          body: [
            t(
              'The administrative workspace brings together member management, registration review, events and calendar operations, announcements and email, task boards, automation, audit history, and community settings. Each area appears only when the signed-in person has the required permission.',
              'L’espace d’administration réunit la gestion des membres, l’examen des inscriptions, les événements et le calendrier, les annonces et les emails, les tableaux de tâches, les automatisations, l’historique d’audit et les paramètres de la communauté. Chaque zone apparaît uniquement lorsque la personne connectée possède la permission requise.',
            ),
          ],
        },
        {
          id: 'member-operations',
          title: t('Members and onboarding', 'Membres et intégration'),
          bullets: [
            t(
              'Review registration applications before they become active memberships.',
              'Examiner les demandes d’inscription avant qu’elles ne deviennent des adhésions actives.',
            ),
            t(
              'Maintain member profiles, roles, active status, suspension, and reactivation according to delegated access.',
              'Gérer les profils, rôles, statuts actifs, suspensions et réactivations selon les accès délégués.',
            ),
            t(
              'Control directory visibility and community-wide registration protection from settings.',
              'Contrôler la visibilité de l’annuaire et la protection des inscriptions dans les paramètres.',
            ),
          ],
        },
        {
          id: 'community-operations',
          title: t('Community operations', 'Opérations communautaires'),
          body: [
            t(
              'Administrators can schedule events, publish announcements, inspect email delivery, coordinate task boards, and configure automation. The dedicated guides explain each lifecycle and the corresponding member experience.',
              'Les administrateurs peuvent planifier des événements, publier des annonces, examiner la livraison des emails, coordonner des tableaux de tâches et configurer des automatisations. Les guides dédiés expliquent chaque cycle de vie et l’expérience correspondante des membres.',
            ),
          ],
        },
        {
          id: 'administrative-boundary',
          title: t('Administrative boundary', 'Frontière administrative'),
          body: [
            t(
              'Administrative status is not a universal data override. Community scope, assigned permissions, membership state, and participant-only boundaries still apply. In particular, an Owner or Admin cannot open private chat conversations unless they are a participant.',
              'Le statut administratif ne constitue pas un accès universel aux données. La communauté, les permissions attribuées, l’état d’adhésion et les frontières réservées aux participants restent applicables. En particulier, un Propriétaire ou Admin ne peut pas ouvrir un chat privé sans en être participant.',
            ),
          ],
          callout: {
            variant: 'security',
            title: t(
              'Permission-gated by design',
              'Accès fondé sur les permissions',
            ),
            body: t(
              'The interface helps people find allowed tools, while the server independently validates every protected action.',
              'L’interface aide à trouver les outils autorisés, tandis que le serveur valide indépendamment chaque action protégée.',
            ),
          },
        },
      ],
    },
    reminders: {
      title: t('Reminders', 'Rappels'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/reminders',
      description: t(
        'Configure birthday, membership anniversary, and passport-expiration reminders, then run an exact due-date check safely.',
        'Configurez les rappels d’anniversaire, d’ancienneté et d’expiration de passeport, puis lancez une vérification exacte des échéances.',
      ),
      cards: [
        {
          title: t('Message templates', 'Modèles de messages'),
          body: t(
            'Customize the notification and email copy used by reminders.',
            'Personnalisez les notifications et emails utilisés par les rappels.',
          ),
          href: '/docs/message-templates',
        },
        {
          title: t('Notifications', 'Notifications'),
          body: t(
            'Understand personal preferences and the difference between in-app and email delivery.',
            'Comprenez les préférences personnelles et la différence entre livraison dans l’application et par email.',
          ),
          href: '/docs/notifications',
        },
        {
          title: t('Audit logs', 'Journaux d’audit'),
          body: t(
            'Review completed manual reminder checks.',
            'Consultez les vérifications manuelles de rappels terminées.',
          ),
          href: '/docs/audit-logs',
        },
      ],
      sections: [
        {
          id: 'mental-model',
          title: t('How reminders work', 'Fonctionnement des rappels'),
          body: [
            t(
              'Enabling a reminder type makes matching active members eligible for evaluation; it does not send anything immediately. The Settings reminder family is evaluated only when an authorized administrator selects Run due reminders.',
              'Activer un type de rappel rend les membres actifs correspondants éligibles à l’évaluation ; aucun message n’est envoyé immédiatement. Cette famille de rappels est évaluée uniquement lorsqu’un administrateur autorisé sélectionne Exécuter les rappels dus.',
            ),
            t(
              'Each check compares today with the exact configured calendar-day offset, resolves eligible recipients, creates new in-app notifications immediately, and queues eligible passport emails for background delivery. Disabled types and previously handled instances are skipped.',
              'Chaque vérification compare la date du jour au décalage calendaire exact configuré, détermine les destinataires éligibles, crée immédiatement les nouvelles notifications et met en file les emails de passeport éligibles. Les types désactivés et les occurrences déjà traitées sont ignorés.',
            ),
          ],
          callout: {
            variant: 'note',
            title: t('Manual checks only', 'Vérifications manuelles uniquement'),
            body: t(
              'There is currently no automatic schedule for birthday, membership anniversary, or passport reminders in Settings. Task Board and event-task automation are separate systems.',
              'Il n’existe actuellement aucune planification automatique pour les rappels d’anniversaire, d’ancienneté ou de passeport dans Paramètres. Les automatisations des tableaux de tâches et des tâches d’événement sont distinctes.',
            ),
          },
        },
        {
          id: 'birthday-controls',
          title: t('Birthday reminders', 'Rappels d’anniversaire'),
          table: {
            headers: [t('Control', 'Contrôle'), t('Effect', 'Effet')],
            rows: [
              [
                t('Birthday reminders', 'Rappels d’anniversaire'),
                t(
                  'Main switch for both advance and day-of birthday notifications. When off, birthday dates are skipped and a missed window is not backfilled later.',
                  'Interrupteur principal des notifications anticipées et du jour même. Lorsqu’il est désactivé, les dates sont ignorées et une fenêtre manquée n’est pas rattrapée plus tard.',
                ),
              ],
              [
                t('Advance reminder days before', 'Jours avant le rappel anticipé'),
                t(
                  'Matches one exact nonzero number of calendar days before the next birthday. New communities use 3 days.',
                  'Correspond à un nombre exact et non nul de jours calendaires avant le prochain anniversaire. Les nouvelles communautés utilisent 3 jours.',
                ),
              ],
              [
                t('Send day-of birthday notification', 'Envoyer une notification le jour de l’anniversaire'),
                t(
                  'Adds the exact birthday date when the main birthday switch is on. Turning it off leaves the advance reminder available.',
                  'Ajoute la date exacte de l’anniversaire lorsque l’interrupteur principal est actif. Sa désactivation conserve le rappel anticipé.',
                ),
              ],
              [
                t('Notify all active members about birthdays', 'Notifier tous les membres actifs des anniversaires'),
                t(
                  'Adds all active members to the recipient set. When off, the subject member and active Owners/Admins remain eligible.',
                  'Ajoute tous les membres actifs aux destinataires. Lorsqu’il est désactivé, le membre concerné et les Propriétaires/Admins actifs restent éligibles.',
                ),
              ],
            ],
          },
          body: [
            t(
              'Birthday reminders are in-app only. Every recipient is filtered by their birthday-reminder preference, so an eligible person who opted out does not receive one.',
              'Les rappels d’anniversaire sont uniquement intégrés à l’application. Chaque destinataire est filtré selon sa préférence de rappel d’anniversaire ; une personne éligible qui s’est désabonnée ne reçoit rien.',
            ),
          ],
        },
        {
          id: 'anniversary-controls',
          title: t('Membership anniversary reminders', 'Rappels d’anniversaire d’adhésion'),
          table: {
            headers: [t('Control', 'Contrôle'), t('Effect', 'Effet')],
            rows: [
              [
                t('Enable membership anniversary reminders', 'Activer les rappels d’anniversaire d’adhésion'),
                t(
                  'Main switch for advance and day-of notices based on each active membership join date. When off, anniversary dates are skipped.',
                  'Interrupteur principal des avis anticipés et du jour même basés sur la date d’adhésion active. Lorsqu’il est désactivé, ces dates sont ignorées.',
                ),
              ],
              [
                t('Advance reminder days before', 'Jours avant le rappel anticipé'),
                t(
                  'Matches one exact nonzero number of calendar days before the annual join-date anniversary. New communities use 3 days.',
                  'Correspond à un nombre exact et non nul de jours calendaires avant l’anniversaire annuel d’adhésion. Les nouvelles communautés utilisent 3 jours.',
                ),
              ],
              [
                t('Send day-of anniversary notification', 'Envoyer une notification le jour de l’anniversaire d’adhésion'),
                t(
                  'Adds the anniversary date itself when the main switch is on.',
                  'Ajoute la date d’anniversaire elle-même lorsque l’interrupteur principal est actif.',
                ),
              ],
            ],
          },
          body: [
            t(
              'The member and active Owners/Admins are eligible for an in-app notification. The same personal birthday-reminder preference controls receipt. There is no notify-all-members option for anniversaries.',
              'Le membre et les Propriétaires/Admins actifs sont éligibles à une notification dans l’application. La même préférence personnelle de rappels d’anniversaire contrôle la réception. Il n’existe pas d’option pour notifier tous les membres.',
            ),
          ],
        },
        {
          id: 'passport-controls',
          title: t('Passport expiration reminders', 'Rappels d’expiration du passeport'),
          table: {
            headers: [t('Control', 'Contrôle'), t('Effect', 'Effet')],
            rows: [
              [
                t('Enable passport expiration reminders', 'Activer les rappels d’expiration du passeport'),
                t(
                  'Main switch for every passport stage and channel. It is off by default for new communities.',
                  'Interrupteur principal pour toutes les étapes et tous les canaux de passeport. Il est désactivé par défaut dans les nouvelles communautés.',
                ),
              ],
              [
                t('Notify member', 'Notifier le membre'),
                t(
                  'Creates a private in-app reminder for the active member when their passport preference allows it.',
                  'Crée un rappel privé dans l’application pour le membre actif lorsque sa préférence de passeport l’autorise.',
                ),
              ],
              [
                t('Notify admins', 'Notifier les admins'),
                t(
                  'Creates operational alerts for active Owners/Admins only when Admin in-app alerts and Passport expiration alerts are also enabled.',
                  'Crée des alertes opérationnelles pour les Propriétaires/Admins actifs uniquement si Alertes admin dans l’application et Alertes d’expiration de passeport sont également activées.',
                ),
              ],
              [
                t('Email reminders', 'Rappels courriel'),
                t(
                  'Queues email only when email delivery is available and a corresponding new in-app reminder was created. Email is not an independent fallback.',
                  'Met un email en file uniquement lorsque la livraison email est disponible et qu’un nouveau rappel correspondant a été créé dans l’application. L’email n’est pas une solution de secours indépendante.',
                ),
              ],
              [
                t('First notice / Second notice / Final notice', 'Premier avis / Deuxième avis / Avis final'),
                t(
                  'Three exact positive, unique, descending day offsets. Defaults are 180, 90, and 30 days.',
                  'Trois décalages exacts, positifs, uniques et décroissants. Les valeurs par défaut sont 180, 90 et 30 jours.',
                ),
              ],
              [
                t('Day-of expiration reminder', 'Rappel le jour de l’expiration'),
                t(
                  'Adds the passport expiration date itself when the main passport switch is on.',
                  'Ajoute la date d’expiration elle-même lorsque l’interrupteur principal est actif.',
                ),
              ],
            ],
          },
        },
        {
          id: 'run-due-reminders',
          title: t('Run due reminders', 'Exécuter les rappels dus'),
          body: [
            t(
              'Run due reminders performs the complete check before returning: it loads active memberships, evaluates enabled birthday, anniversary, and passport settings, creates eligible in-app records, queues eligible passport email campaigns, and reports counts by category.',
              'Exécuter les rappels dus effectue la vérification complète avant de répondre : chargement des adhésions actives, évaluation des paramètres activés, création des notifications éligibles, mise en file des emails de passeport éligibles et compte rendu par catégorie.',
            ),
            t(
              'It does not evaluate events, Task Board due dates, task reminders, or registrations. Those features have their own workflows. The action is permission-gated and runs independently from Save changes.',
              'Cette action n’évalue pas les événements, échéances de tableaux de tâches, rappels de tâches ni inscriptions. Ces fonctionnalités ont leurs propres workflows. L’action est soumise à permission et indépendante d’Enregistrer les modifications.',
            ),
          ],
          bullets: [
            t(
              'Disabled reminder families are skipped, even when a date otherwise matches.',
              'Les familles de rappels désactivées sont ignorées, même lorsqu’une date correspondrait.',
            ),
            t(
              'A successful all-zero summary means the check completed and nothing new matched.',
              'Un résumé réussi avec uniquement des zéros signifie que la vérification est terminée et qu’aucun nouvel élément ne correspondait.',
            ),
            t(
              'In-app notifications exist when the action returns; queued passport emails continue through background delivery and may still fail later.',
              'Les notifications dans l’application existent au retour de l’action ; les emails de passeport mis en file poursuivent leur livraison en arrière-plan et peuvent encore échouer.',
            ),
          ],
        },
        {
          id: 'timing-and-timezone',
          title: t('Due dates and UTC boundaries', 'Échéances et limites UTC'),
          body: [
            t(
              'A reminder is due only when the current UTC calendar date exactly matches a configured offset or the enabled day-of date. The community timezone is not used for this Settings reminder check.',
              'Un rappel est dû uniquement lorsque la date calendaire UTC actuelle correspond exactement à un décalage configuré ou à la date du jour même activée. Le fuseau horaire de la communauté n’est pas utilisé pour cette vérification.',
            ),
            t(
              'The check does not sweep overdue or missed windows. If a type is disabled on its matching day, or no administrator runs the check that day, enabling or running it later does not backfill that occurrence.',
              'La vérification ne recherche pas les fenêtres dépassées ou manquées. Si un type est désactivé le jour correspondant, ou si aucun administrateur ne lance la vérification ce jour-là, une activation ou exécution ultérieure ne rattrape pas cette occurrence.',
            ),
          ],
          callout: {
            variant: 'warning',
            title: t('Run on the matching UTC date', 'Exécuter à la date UTC correspondante'),
            body: t(
              'Because this reminder family has no automatic schedule or catch-up window, establish an operational routine for Run due reminders.',
              'Comme cette famille n’a ni planification automatique ni fenêtre de rattrapage, établissez une routine opérationnelle pour Exécuter les rappels dus.',
            ),
          },
        },
        {
          id: 'recipients-and-channels',
          title: t('Recipients and channels', 'Destinataires et canaux'),
          table: {
            headers: [t('Type', 'Catégorie'), t('Recipients', 'Destinataires'), t('Channel', 'Canal')],
            rows: [
              [
                t('Birthday', 'Anniversaire'),
                t('Subject member, active Owners/Admins, and optionally all active members; each recipient preference applies.', 'Membre concerné, Propriétaires/Admins actifs et éventuellement tous les membres actifs ; la préférence de chacun s’applique.'),
                t('In-app', 'Dans l’application'),
              ],
              [
                t('Membership anniversary', 'Anniversaire d’adhésion'),
                t('Subject member and active Owners/Admins; each recipient preference applies.', 'Membre concerné et Propriétaires/Admins actifs ; la préférence de chacun s’applique.'),
                t('In-app', 'Dans l’application'),
              ],
              [
                t('Passport expiration', 'Expiration du passeport'),
                t('Active member and/or active Owners/Admins according to audience, community alert, and personal preference switches.', 'Membre actif et/ou Propriétaires/Admins actifs selon les contrôles d’audience, d’alertes communautaires et de préférences personnelles.'),
                t('In-app; optional queued email', 'Dans l’application ; email facultatif mis en file'),
              ],
            ],
          },
          body: [
            t(
              'Inactive or suspended memberships are not recipients. Optional email also requires a usable destination and current email configuration.',
              'Les adhésions inactives ou suspendues ne sont pas destinataires. L’email facultatif exige aussi une adresse utilisable et une configuration email disponible.',
            ),
          ],
        },
        {
          id: 'repeat-runs-and-history',
          title: t('Repeat runs and history', 'Exécutions répétées et historique'),
          body: [
            t(
              'Running the check repeatedly on the same UTC date is safe: a reminder already created for the same person, occurrence, and stage is skipped. Because passport email is queued only with a newly created in-app reminder, the repeat check does not queue that email again.',
              'Répéter la vérification à la même date UTC est sûr : un rappel déjà créé pour la même personne, occurrence et étape est ignoré. Comme l’email de passeport est mis en file uniquement avec un nouveau rappel dans l’application, il n’est pas remis en file.',
            ),
            t(
              'A completed manual check records the initiating administrator and the resulting category counts in Audit logs. Saving reminder settings is not currently listed as a separate reminder-settings audit event.',
              'Une vérification manuelle terminée enregistre l’administrateur initiateur et les comptes par catégorie dans les Journaux d’audit. L’enregistrement des paramètres de rappels n’apparaît pas actuellement comme un événement d’audit distinct.',
            ),
          ],
        },
        {
          id: 'failure-behavior',
          title: t('Failure behavior', 'Comportement en cas d’échec'),
          body: [
            t(
              'If the due check itself fails, Settings shows an error instead of the count summary. Work created before the error may remain, later members may not be evaluated, and a completed-run audit entry is not guaranteed. A later retry remains duplicate-safe for records already created.',
              'Si la vérification échoue, Paramètres affiche une erreur au lieu du résumé. Le travail créé avant l’erreur peut rester, les membres suivants peuvent ne pas être évalués et l’entrée d’audit de fin n’est pas garantie. Une nouvelle tentative reste protégée contre les doublons déjà créés.',
            ),
            t(
              'Background email delivery has its own retry and delivery history after a campaign is queued. An email failure does not remove the in-app notification. Review the Email workspace and Audit logs when results need investigation.',
              'La livraison email en arrière-plan possède ses propres tentatives et son historique après mise en file. Un échec email ne supprime pas la notification dans l’application. Consultez l’espace Email et les Journaux d’audit pour enquêter.',
            ),
          ],
        },
        {
          id: 'examples',
          title: t('Examples', 'Exemples'),
          bullets: [
            t(
              'Birthday due: a birthday is August 12 and the advance value is 3. A check on August 9 UTC creates eligible in-app notifications. Repeating the check that day creates nothing new.',
              'Anniversaire dû : un anniversaire tombe le 12 août et l’avance vaut 3. Une vérification le 9 août UTC crée les notifications éligibles. La répéter ce jour-là ne crée rien de nouveau.',
            ),
            t(
              'Nothing due: a check finds no exact enabled date match. It succeeds with zero counts and creates or queues nothing.',
              'Rien n’est dû : aucune date exacte activée ne correspond. La vérification réussit avec des comptes à zéro et ne crée ni ne met rien en file.',
            ),
            t(
              'Birthday disabled: a member is three days from their birthday, but Birthday reminders is off. Birthday is skipped while enabled anniversary or passport matches can still be processed.',
              'Anniversaire désactivé : un membre est à trois jours de son anniversaire, mais Rappels d’anniversaire est désactivé. Il est ignoré tandis que les correspondances d’ancienneté ou de passeport activées peuvent être traitées.',
            ),
            t(
              'Passport already processed: the 90-day stage created a member reminder and queued email earlier that UTC date. A repeat check skips both; it does not resend the email.',
              'Passeport déjà traité : l’étape à 90 jours a créé un rappel membre et mis un email en file plus tôt à cette date UTC. Une nouvelle vérification ignore les deux et ne renvoie pas l’email.',
            ),
          ],
        },
        {
          id: 'permissions',
          title: t('Permissions', 'Permissions'),
          body: [
            t(
              'Viewing and changing this section, including Run due reminders, requires Manage reminder settings. Owners have this access; Admins need the delegated permission.',
              'Consulter et modifier cette section, y compris Exécuter les rappels dus, exige Gérer les paramètres de rappels. Les Propriétaires y ont accès ; les Admins ont besoin de la permission déléguée.',
            ),
          ],
        },
      ],
    },
    messageTemplates: {
      title: t('Message templates', 'Modèles de messages'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/message-templates',
      description: t(
        'Safely customize reminder, transactional email, and Task Board automation messages in English and French.',
        'Personnalisez en toute sécurité les rappels, emails transactionnels et messages d’automatisation en anglais et en français.',
      ),
      cards: [
        {
          title: t('Reminders', 'Rappels'),
          body: t('See when reminder copy is used and who can receive it.', 'Découvrez quand les textes de rappels sont utilisés et qui peut les recevoir.'),
          href: '/docs/reminders',
        },
        {
          title: t('Automation', 'Automatisation'),
          body: t('Understand the rules that use automation notification templates.', 'Comprenez les règles qui utilisent les modèles de notifications d’automatisation.'),
          href: '/docs/automation',
        },
        {
          title: t('Notifications', 'Notifications'),
          body: t('Understand in-app and email delivery outcomes.', 'Comprenez les résultats de livraison dans l’application et par email.'),
          href: '/docs/notifications',
        },
      ],
      sections: [
        {
          id: 'template-families',
          title: t('Choose the right template family', 'Choisir la bonne famille de modèles'),
          table: {
            headers: [t('Family', 'Famille'), t('Used for', 'Utilisée pour')],
            rows: [
              [t('Automation Notification templates', 'Modèles de notifications d’automatisation'), t('Task Board automation output in the application and, when available, by email.', 'Résultats des automatisations de tableaux de tâches dans l’application et, si disponible, par email.')],
              [t('Reminder notification templates', 'Modèles de notifications de rappels'), t('Birthday, membership anniversary, and passport reminder bodies.', 'Corps des rappels d’anniversaire, d’ancienneté et de passeport.')],
              [t('Transactional email templates', 'Modèles d’emails transactionnels'), t('Account, registration, invitation, verification, and recovery messages.', 'Messages de compte, inscription, invitation, vérification et récupération.')],
            ],
          },
          body: [
            t(
              'Select a family and template, then edit only the fields and language variant shown. Changes to one template do not rewrite unrelated templates.',
              'Sélectionnez une famille et un modèle, puis modifiez uniquement les champs et la langue affichés. Les changements d’un modèle ne réécrivent pas les autres.',
            ),
          ],
        },
        {
          id: 'transactional-email-inventory',
          title: t('Transactional email templates', 'Modèles d’emails transactionnels'),
          table: {
            headers: [t('Template', 'Modèle'), t('Purpose and recipient', 'Objectif et destinataire')],
            rows: [
              [t('Password reset email', 'Email de réinitialisation du mot de passe'), t('Sends a one-time reset action to the account email after a reset request.', 'Envoie une action de réinitialisation à usage unique à l’email du compte après une demande.')],
              [t('Registration invite email', 'Email d’invitation à l’inscription'), t('Sends an administrator-created registration invitation to the entered address.', 'Envoie une invitation d’inscription créée par un administrateur à l’adresse saisie.')],
              [t('Email change verification', 'Vérification du changement d’email'), t('Asks the proposed new address to verify the change before it completes.', 'Demande à la nouvelle adresse proposée de vérifier le changement avant sa finalisation.')],
              [t('Email change request notice', 'Avis de demande de changement d’email'), t('Warns the current address that a change was requested.', 'Avertit l’adresse actuelle qu’un changement a été demandé.')],
              [t('Email change completion notice', 'Avis de fin de changement d’email'), t('Confirms that the account email was changed.', 'Confirme que l’email du compte a été modifié.')],
              [t('Registration acknowledgement', 'Accusé de réception d’inscription'), t('Confirms that a new request entered review.', 'Confirme qu’une nouvelle demande est entrée en révision.')],
              [t('Pending registration reminder', 'Rappel d’inscription en attente'), t('Explains that another attempt found an existing pending request.', 'Explique qu’une nouvelle tentative a trouvé une demande déjà en attente.')],
              [t('Existing-account registration notice', 'Avis d’inscription pour compte existant'), t('Sends safe sign-in guidance when the address is already associated with access.', 'Envoie des instructions de connexion sûres lorsque l’adresse est déjà associée à un accès.')],
              [t('Registration policy guidance', 'Instructions de politique d’inscription'), t('Offers sign-in or account-recovery guidance for an existing address.', 'Propose des instructions de connexion ou de récupération pour une adresse existante.')],
            ],
          },
        },
        {
          id: 'reminder-template-inventory',
          title: t('Reminder templates', 'Modèles de rappels'),
          table: {
            headers: [t('Template', 'Modèle'), t('Channel', 'Canal')],
            rows: [
              [t('Birthday in-app notification', 'Notification d’anniversaire dans l’application'), t('Advance birthday notification', 'Notification anticipée d’anniversaire')],
              [t('Birthday day in-app notification', 'Notification du jour d’anniversaire dans l’application'), t('Birthday date notification', 'Notification à la date d’anniversaire')],
              [t('Anniversary in-app notification', 'Notification d’ancienneté dans l’application'), t('Advance membership anniversary notification', 'Notification anticipée d’anniversaire d’adhésion')],
              [t('Anniversary day in-app notification', 'Notification du jour d’ancienneté dans l’application'), t('Membership anniversary date notification', 'Notification à la date d’anniversaire d’adhésion')],
              [t('Passport expiration in-app notification', 'Notification d’expiration de passeport dans l’application'), t('Private member or admin reminder', 'Rappel privé pour membre ou admin')],
              [t('Passport expiration email', 'Email d’expiration du passeport'), t('Optional queued passport email', 'Email de passeport facultatif mis en file')],
            ],
          },
          body: [
            t(
              'The passport in-app and email entries currently edit the same passport reminder copy. A saved change in either entry therefore affects both uses.',
              'Les entrées de passeport dans l’application et par email modifient actuellement le même texte de rappel. Une modification enregistrée dans l’une affecte donc les deux usages.',
            ),
          ],
        },
        {
          id: 'automation-template-inventory',
          title: t('Automation Notification templates', 'Modèles de notifications d’automatisation'),
          body: [
            t(
              'The available templates are Task due soon, Task overdue, Test automation notification, Task auto-completed, Unassigned task flagged, Stale task follow-up, Checklist incomplete before due, and Overdue task escalation.',
              'Les modèles disponibles sont Tâche bientôt due, Tâche en retard, Notification de test d’automatisation, Tâche terminée automatiquement, Tâche non assignée signalée, Relance de tâche inactive, Checklist incomplète avant échéance et Escalade de tâche en retard.',
            ),
            t(
              'Each has controlled EN/FR subject, in-app title and body, email title and body, and button label fields. A template version advances when its message content changes.',
              'Chacun possède des champs contrôlés EN/FR pour l’objet, le titre et corps dans l’application, le titre et corps email et le libellé du bouton. La version avance lorsque le contenu change.',
            ),
          ],
        },
        {
          id: 'editor-fields',
          title: t('Editor fields', 'Champs de l’éditeur'),
          body: [
            t(
              'Transactional email templates always require Subject, Email heading, and Message body. Depending on the template, the editor can also show Preview text, Greeting, Button label, Fallback instructions, Expiration notice, Security notice, and Footer explanation.',
              'Les modèles d’emails transactionnels exigent toujours Objet, Titre de l’email et Corps du message. Selon le modèle, l’éditeur peut aussi afficher Texte d’aperçu, Salutation, Libellé du bouton, Instructions de secours, Avis d’expiration, Avis de sécurité et Explication de pied de page.',
            ),
            t(
              'Action templates also require a button label. Not every template exposes or needs every optional field.',
              'Les modèles avec action exigent aussi un libellé de bouton. Tous les modèles n’affichent ni ne nécessitent chaque champ facultatif.',
            ),
          ],
        },
        {
          id: 'variables',
          title: t('Variables', 'Variables de modèle'),
          body: [
            t(
              'Variables use double braces, for example Hello {{recipientName}}. At render time, the value is replaced with recipient or community context; Preview shows Hello Exaud with the canonical sample identity.',
              'Les variables utilisent des doubles accolades, par exemple Bonjour {{recipientName}}. Au rendu, la valeur est remplacée par le contexte du destinataire ou de la communauté ; Aperçu affiche Bonjour Exaud avec l’identité d’exemple canonique.',
            ),
            t(
              'Open Variables to see the names available for the selected template. Availability differs by family. Keep the spelling and braces exactly as shown; the panel is a reference and does not provide an automatic insert action.',
              'Ouvrez Variables pour voir les noms disponibles pour le modèle sélectionné. Ils diffèrent selon la famille. Conservez exactement l’orthographe et les accolades affichées ; le panneau sert de référence et n’insère pas automatiquement.',
            ),
          ],
          bullets: [
            t('Birthday and anniversary copy can use memberName, communityName, date, and years.', 'Les textes d’anniversaire et d’ancienneté peuvent utiliser memberName, communityName, date et years.'),
            t('Passport copy can use memberName, communityName, expirationDate, daysRemaining, and stageLabel.', 'Les textes de passeport peuvent utiliser memberName, communityName, expirationDate, daysRemaining et stageLabel.'),
            t('Automation copy uses the controlled list shown in its Variables panel, including task, board, rule, recipient, due-date, status, checklist, and action context where supported.', 'Les textes d’automatisation utilisent la liste contrôlée du panneau Variables, notamment les contextes de tâche, tableau, règle, destinataire, échéance, statut, checklist et action lorsqu’ils sont pris en charge.'),
          ],
        },
        {
          id: 'required-variables',
          title: t('Required variables and action links', 'Variables requises et liens d’action'),
          body: [
            t(
              'Save and Preview validate required variables across the editable fields. If required content is removed, the action is rejected and identifies the first missing variable. Passport reminder copy must retain {{expirationDate}}.',
              'Enregistrer et Aperçu valident les variables requises dans les champs modifiables. Si un contenu requis est supprimé, l’action est rejetée et identifie la première variable manquante. Le texte de passeport doit conserver {{expirationDate}}.',
            ),
            t(
              'For password reset, invitation, email verification, existing-account sign-in, and account-recovery templates, the secure action URL is supplied by the email layout. Keep a meaningful Button label, but do not paste resetUrl, inviteUrl, verificationUrl, loginUrl, or passwordRecoveryUrl into the message body.',
              'Pour les modèles de réinitialisation, invitation, vérification d’email, connexion à un compte existant et récupération, l’URL sécurisée est fournie par la mise en page. Conservez un libellé de bouton pertinent, sans coller resetUrl, inviteUrl, verificationUrl, loginUrl ou passwordRecoveryUrl dans le corps.',
            ),
            t(
              'Other required values remain visible in their relevant fields, such as recipientName, communityName, expiresInMinutes, or maskedNewEmail. Follow the selected template’s Variables panel rather than copying requirements from another template.',
              'Les autres valeurs requises restent visibles dans leurs champs pertinents, comme recipientName, communityName, expiresInMinutes ou maskedNewEmail. Suivez le panneau Variables du modèle sélectionné plutôt que de copier les exigences d’un autre.',
            ),
          ],
        },
        {
          id: 'preview',
          title: t('Preview a template', 'Prévisualiser un modèle'),
          body: [
            t(
              'For transactional email templates, Preview validates and renders the current unsaved draft in the selected EN or FR locale using safe example values such as Exaud and non-production action links. It sends nothing and does not require an email provider.',
              'Pour les emails transactionnels, Aperçu valide et affiche le brouillon non enregistré dans la langue EN ou FR sélectionnée avec des valeurs sûres comme Exaud et des liens non productifs. Il n’envoie rien et n’exige aucun fournisseur email.',
            ),
            t(
              'Reminder Preview is produced locally from the current body and sample values and also sends nothing. Automation Preview renders the selected locale from the last saved template while the editor is in view mode.',
              'L’Aperçu des rappels est produit localement depuis le corps courant et des valeurs d’exemple, sans envoi. L’Aperçu d’automatisation affiche la langue sélectionnée depuis le dernier modèle enregistré en mode consultation.',
            ),
          ],
        },
        {
          id: 'send-test',
          title: t('Send a test message', 'Envoyer un message de test'),
          body: [
            t(
              'For a transactional email, Send test queues the selected EN or FR sample rendering to the signed-in administrator’s account email. Unsaved changes disable the action, and usable email delivery is required. The campaign and its delivery result appear in the Email workspace.',
              'Pour un email transactionnel, Envoyer un test met en file le rendu d’exemple EN ou FR vers l’email du compte de l’administrateur connecté. Les modifications non enregistrées désactivent l’action et une livraison email utilisable est requise. La campagne et son résultat apparaissent dans l’espace Email.',
            ),
            t(
              'For an automation template, Send test creates an in-app notification only for the signed-in active Owner/Admin. It also queues email to that same account when email is available. Members, assignees, and production rule recipients are not notified, and the test is recorded in Audit logs.',
              'Pour un modèle d’automatisation, Envoyer un test crée une notification uniquement pour le Propriétaire/Admin actif connecté. Un email est aussi mis en file vers ce même compte si disponible. Membres, assignés et destinataires réels ne sont pas notifiés, et le test est enregistré dans les Journaux d’audit.',
            ),
          ],
        },
        {
          id: 'preview-vs-test',
          title: t('Preview versus Send test', 'Aperçu ou Envoyer un test'),
          table: {
            headers: [t('Action', 'Commande'), t('Sends', 'Envoie'), t('Content source', 'Source du contenu'), t('Email provider', 'Fournisseur email')],
            rows: [
              [t('Transactional Preview', 'Aperçu transactionnel'), t('Nothing', 'Rien'), t('Current unsaved draft with example data', 'Brouillon non enregistré avec données d’exemple'), t('Not required', 'Non requis')],
              [t('Transactional Send test', 'Envoyer un test transactionnel'), t('Email to your account', 'Email vers votre compte'), t('Saved selected-locale content with example message data', 'Contenu enregistré de la langue sélectionnée avec données d’exemple'), t('Required', 'Requis')],
              [t('Automation Preview', 'Aperçu d’automatisation'), t('Nothing', 'Rien'), t('Saved selected-locale template with example data', 'Modèle enregistré de la langue sélectionnée avec données d’exemple'), t('Not required', 'Non requis')],
              [t('Automation Send test', 'Envoyer un test d’automatisation'), t('In-app to your account; email when available', 'Dans l’application vers votre compte ; email si disponible'), t('Saved selected-locale template with test context', 'Modèle enregistré de la langue sélectionnée avec contexte de test'), t('Optional for its email copy', 'Facultatif pour sa copie email')],
            ],
          },
        },
        {
          id: 'save-changes',
          title: t('Save changes', 'Enregistrer les modifications'),
          body: [
            t(
              'Save changes validates required fields and variables, then makes the selected template and language active for future messages. Messages already queued keep the rendered content captured when they were queued.',
              'Enregistrer les modifications valide les champs et variables requis, puis active le modèle et la langue sélectionnés pour les futurs messages. Les messages déjà mis en file conservent le rendu capturé lors de leur mise en file.',
            ),
            t(
              'Automation template content changes advance the saved version and are listed in Audit logs. Supported message-template body changes are also audited. Keep the success feedback before navigating away.',
              'Les changements de contenu d’automatisation font avancer la version enregistrée et apparaissent dans les Journaux d’audit. Les modifications de corps prises en charge sont aussi auditées. Attendez le retour de réussite avant de quitter.',
            ),
          ],
        },
        {
          id: 'discard-and-reset',
          title: t('Discard changes and Reset to default', 'Abandonner les modifications et Réinitialiser'),
          table: {
            headers: [t('Action', 'Commande'), t('Result', 'Résultat')],
            rows: [
              [t('Discard changes', 'Abandonner les modifications'), t('Restores the selected editor to its last saved values. It does not restore the platform default.', 'Restaure les dernières valeurs enregistrées de l’éditeur sélectionné. Il ne restaure pas la valeur par défaut de la plateforme.')],
              [t('Reset to default — transactional email', 'Réinitialiser — email transactionnel'), t('Loads the built-in EN or FR values into the draft. Select Save changes to activate them.', 'Charge les valeurs EN ou FR intégrées dans le brouillon. Sélectionnez Enregistrer les modifications pour les activer.')],
              [t('Reset to default — reminder template', 'Réinitialiser — modèle de rappel'), t('Immediately validates and saves the built-in body for that entry.', 'Valide et enregistre immédiatement le corps intégré pour cette entrée.')],
            ],
          },
          callout: {
            variant: 'warning',
            title: t('Reset behavior differs by editor', 'Le comportement de réinitialisation diffère selon l’éditeur'),
            body: t(
              'Check which template family is open before selecting Reset to default: reminder reset persists immediately, while transactional email reset remains a draft until saved.',
              'Vérifiez la famille ouverte avant Réinitialiser : la réinitialisation d’un rappel est enregistrée immédiatement, tandis que celle d’un email transactionnel reste un brouillon jusqu’à l’enregistrement.',
            ),
          },
        },
        {
          id: 'safe-workflow',
          title: t('Example: customize a registration acknowledgement', 'Exemple : personnaliser un accusé de réception d’inscription'),
          bullets: [
            t('Open Templates, choose Email templates, then select Registration acknowledgement.', 'Ouvrez Modèles, choisissez Modèles d’emails, puis Accusé de réception d’inscription.'),
            t('Select EN, review Variables, and update the wording without renaming placeholders.', 'Sélectionnez EN, consultez Variables et modifiez le texte sans renommer les espaces réservés.'),
            t('Select Preview and confirm the Exaud sample rendering. Repeat for FR.', 'Sélectionnez Aperçu et vérifiez le rendu d’exemple Exaud. Répétez pour FR.'),
            t('Select Save changes for each language. Send test becomes available once the current draft is saved.', 'Sélectionnez Enregistrer les modifications pour chaque langue. Envoyer un test devient disponible lorsque le brouillon courant est enregistré.'),
            t('Send the test to your own administrator account, then confirm its campaign outcome in the Email workspace.', 'Envoyez le test à votre propre compte administrateur, puis vérifiez le résultat de la campagne dans l’espace Email.'),
          ],
        },
        {
          id: 'security-guidance',
          title: t('Security-sensitive templates', 'Modèles sensibles à la sécurité'),
          bullets: [
            t('Treat password reset, email verification, email-change notices, invitations, and account-recovery guidance as security messages.', 'Traitez la réinitialisation du mot de passe, la vérification d’email, les avis de changement, les invitations et la récupération comme des messages de sécurité.'),
            t('Keep action labels clear and retain relevant expiry and security language. Never ask a recipient to reply with a password, reset token, or MFA code.', 'Conservez des libellés d’action clairs ainsi que les mentions d’expiration et de sécurité pertinentes. Ne demandez jamais un mot de passe, jeton ou code MFA en réponse.'),
            t('Preview both languages and send a test before activating sensitive copy. Tests use safe example message data and your own administrator destination.', 'Prévisualisez les deux langues et envoyez un test avant d’activer un texte sensible. Les tests utilisent des données d’exemple sûres et votre propre destination administrateur.'),
          ],
        },
        {
          id: 'permissions',
          title: t('Permissions', 'Permissions'),
          body: [
            t(
              'Viewing, editing, previewing, and testing Templates requires Manage message templates. Owners have this access; Admins need the delegated permission. Email tests additionally depend on usable community email settings.',
              'Consulter, modifier, prévisualiser et tester Modèles exige Gérer les modèles de messages. Les Propriétaires y ont accès ; les Admins ont besoin de la permission déléguée. Les tests email dépendent aussi d’une configuration email communautaire utilisable.',
            ),
          ],
        },
      ],
    },
    rolesPermissions: {
      title: t('Roles and permissions', 'Rôles et permissions'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/roles-and-permissions',
      description: t(
        'How PE Community delegates authority without weakening community or participant boundaries.',
        'Comment PE Community délègue l’autorité sans affaiblir les frontières de communauté ou de participation.',
      ),
      cards: [
        {
          title: t('Administration', 'Administration'),
          body: t(
            'See the operational areas permissions unlock.',
            'Voir les zones opérationnelles ouvertes par les permissions.',
          ),
          href: '/docs/administration',
        },
        {
          title: t('Security', 'Sécurité'),
          body: t(
            'Review authentication and authorization controls.',
            'Examiner les contrôles d’authentification et d’autorisation.',
          ),
          href: '/docs/security',
        },
      ],
      sections: [
        {
          id: 'system-roles',
          title: t('Owner, Admin, and Member', 'Propriétaire, Admin et Membre'),
          table: {
            headers: [
              t('Role', 'Rôle'),
              t('Default responsibility', 'Responsabilité par défaut'),
            ],
            rows: [
              [
                t('Owner', 'Propriétaire'),
                t(
                  'Full community permission set, including security and role governance.',
                  'Ensemble complet des permissions, y compris la sécurité et la gouvernance des rôles.',
                ),
              ],
              [
                t('Admin', 'Admin'),
                t(
                  'Default operational permissions for members, registrations, communication, events, task boards, audit, and supported settings.',
                  'Permissions opérationnelles par défaut pour les membres, inscriptions, communications, événements, tâches, audit et paramètres pris en charge.',
                ),
              ],
              [
                t('Member', 'Membre'),
                t(
                  'Member workspace and participant-scoped chat capabilities; no administrative authority by default.',
                  'Espace membre et capacités de chat limitées aux participants ; aucune autorité administrative par défaut.',
                ),
              ],
            ],
          },
        },
        {
          id: 'permissions-are-authoritative',
          title: t(
            'Permissions are authoritative',
            'Les permissions font autorité',
          ),
          body: [
            t(
              'A role is a managed collection of permissions. The permission assigned to the active membership determines whether a protected read or action is allowed; the role label alone is not the final check.',
              'Un rôle est un ensemble géré de permissions. La permission attribuée à l’adhésion active détermine si une lecture ou action protégée est autorisée ; le libellé du rôle n’est pas le contrôle final.',
            ),
          ],
          callout: {
            variant: 'security',
            title: t(
              'Authorization remains server-side',
              'L’autorisation reste côté serveur',
            ),
            body: t(
              'Navigation visibility improves usability, but protected actions are still validated by the server.',
              'La visibilité de la navigation améliore l’utilisation, mais les actions protégées restent validées par le serveur.',
            ),
          },
        },
        {
          id: 'delegated-administration',
          title: t('Delegated administration', 'Administration déléguée'),
          body: [
            t(
              'Owners can delegate supported administrative work by adjusting role permissions. Delegate only the areas a person needs, then verify both the visible workspace and the intended protected actions.',
              'Les Propriétaires peuvent déléguer les tâches administratives prises en charge en ajustant les permissions des rôles. N’accordez que les zones nécessaires, puis vérifiez l’espace visible et les actions protégées prévues.',
            ),
          ],
          bullets: [
            t(
              'Member, registration, announcement, event, email, settings, role, audit, notification, and chat-governance permissions are grouped by responsibility.',
              'Les permissions liées aux membres, inscriptions, annonces, événements, emails, paramètres, rôles, audit, notifications et gouvernance du chat sont regroupées par responsabilité.',
            ),
            t(
              'Sensitive private member fields use additional permissions rather than broad member-read access.',
              'Les champs privés sensibles des membres utilisent des permissions supplémentaires plutôt qu’un accès général en lecture.',
            ),
          ],
        },
        {
          id: 'community-scope',
          title: t('Community-scoped access', 'Accès limité à la communauté'),
          body: [
            t(
              'Permissions apply within the active community membership. A valid permission in one community does not authorize access to another community, and suspended memberships cannot use normal authenticated access.',
              'Les permissions s’appliquent dans l’adhésion communautaire active. Une permission valide dans une communauté n’autorise pas l’accès à une autre, et une adhésion suspendue ne peut pas utiliser l’accès authentifié normal.',
            ),
          ],
        },
        {
          id: 'chat-scope',
          title: t('Participant-scoped chat', 'Chat limité aux participants'),
          body: [
            t(
              'Chat visibility and send permissions control whether the workspace and actions are available. They do not turn chat into a global inbox: conversation reads, messages, keys, attachments, presence, and realtime rooms still require active participation in that conversation.',
              'Les permissions de visibilité et d’envoi contrôlent la disponibilité de l’espace et des actions. Elles ne transforment pas le chat en boîte globale : lectures, messages, clés, pièces jointes, présence et salons temps réel exigent toujours une participation active à la conversation.',
            ),
          ],
        },
        {
          id: 'role-changes',
          title: t(
            'Role and status changes',
            'Changements de rôle et de statut',
          ),
          body: [
            t(
              'A role change affects later authenticated permission checks. Suspension removes active membership access; reactivation restores the membership with its assigned role. Ownership safeguards prevent unsafe self-removal and changes that would leave the community without an active owner.',
              'Un changement de rôle affecte les contrôles de permission authentifiés suivants. La suspension retire l’accès de l’adhésion active ; la réactivation restaure l’adhésion avec son rôle attribué. Les protections de propriété empêchent l’auto-suppression dangereuse et les changements qui laisseraient la communauté sans Propriétaire actif.',
            ),
          ],
        },
      ],
    },
    registrations: {
      title: t('Registrations', 'Inscriptions'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/registrations',
      description: t(
        'Application review, duplicate-safe submission, approval, and the transition to active membership.',
        'Examen des demandes, soumission sûre en cas de doublon, approbation et passage à une adhésion active.',
      ),
      cards: [
        {
          title: t('Roles and permissions', 'Rôles et permissions'),
          body: t(
            'Understand approval permissions and the default Member role.',
            'Comprendre les permissions d’approbation et le rôle Membre par défaut.',
          ),
          href: '/docs/roles-and-permissions',
        },
        {
          title: t('Notifications', 'Notifications'),
          body: t(
            'Understand registration review alerts.',
            'Comprendre les alertes d’examen des inscriptions.',
          ),
          href: '/docs/notifications',
        },
      ],
      sections: [
        {
          id: 'joining',
          title: t('How people join', 'Comment rejoindre la communauté'),
          body: [
            t(
              'A community can accept portal registrations or require a valid invitation link. The application collects name, email, password, sex, and a review note. Every public response is deliberately neutral so it does not reveal whether an account or pending application already exists.',
              'Une communauté peut accepter les inscriptions via le portail ou exiger un lien d’invitation valide. La demande recueille le nom, l’email, le mot de passe, le sexe et une note d’examen. Toute réponse publique reste volontairement neutre afin de ne pas révéler l’existence d’un compte ou d’une demande en attente.',
            ),
          ],
        },
        {
          id: 'registration-protection',
          title: t('Registration protection', 'Protection des inscriptions'),
          body: [
            t(
              'Submissions are protected by per-address and per-network rate limits. When configured, a CAPTCHA challenge is verified before a request is accepted. Invitation links can expire, be revoked, carry a use limit, and are counted when a new application is created.',
              'Les soumissions sont protégées par des limites de fréquence par adresse et par réseau. Lorsqu’il est configuré, un CAPTCHA est vérifié avant l’acceptation. Les liens d’invitation peuvent expirer, être révoqués, avoir une limite d’utilisation et sont comptabilisés lors de la création d’une demande.',
            ),
          ],
          callout: {
            variant: 'security',
            title: t(
              'Account-enumeration resistance',
              'Résistance à l’énumération des comptes',
            ),
            body: t(
              'Applicants receive the same safe acknowledgement for new, pending, and existing-account cases. Follow the email guidance rather than repeatedly resubmitting.',
              'Les demandeurs reçoivent le même accusé sûr pour les cas nouveaux, en attente ou déjà existants. Suivez les indications reçues par email plutôt que de soumettre plusieurs fois.',
            ),
          },
        },
        {
          id: 'review',
          title: t('For administrators', 'Pour les administrateurs'),
          bullets: [
            t(
              'Review the applicant name, address, note, invitation context, and prior attempt information before deciding.',
              'Examinez le nom, l’adresse, la note, le contexte d’invitation et les tentatives précédentes avant de décider.',
            ),
            t(
              'Approve and Reject are separate permissions; a completed or superseded application is no longer actionable.',
              'Approuver et Rejeter sont des permissions distinctes ; une demande terminée ou remplacée n’est plus actionnable.',
            ),
            t(
              'Configured review alerts create persistent notifications for active Owners and Admins.',
              'Les alertes d’examen configurées créent des notifications persistantes pour les Propriétaires et Admins actifs.',
            ),
          ],
        },
        {
          id: 'approval',
          title: t('After approval', 'Après approbation'),
          body: [
            t(
              'Approval creates or reuses the account, creates or reactivates the community membership, assigns the Member role, and creates the initial profile identity. Other pending applications for the same address are superseded. The application-held password hash is cleared after review.',
              'L’approbation crée ou réutilise le compte, crée ou réactive l’adhésion, attribue le rôle Membre et crée l’identité de profil initiale. Les autres demandes en attente pour la même adresse sont remplacées. L’empreinte de mot de passe détenue par la demande est effacée après examen.',
            ),
          ],
        },
        {
          id: 'rejection',
          title: t('After rejection', 'Après rejet'),
          body: [
            t(
              'Rejection closes the application without creating membership access. The review action and optional reason are recorded in audit history, while the public submission flow continues to avoid revealing account state.',
              'Le rejet clôt la demande sans créer d’accès membre. L’action d’examen et le motif facultatif sont consignés dans l’audit, tandis que le parcours public continue d’éviter de révéler l’état du compte.',
            ),
          ],
        },
        {
          id: 'duplicate-submissions',
          title: t(
            'Duplicate and repeat submissions',
            'Soumissions répétées et doublons',
          ),
          body: [
            t(
              'A repeat submission does not create parallel active applications. PE Community records the attempt, keeps the canonical pending application, and queues a cooldown-controlled reminder or account guidance message. Concurrent submissions converge on the same application.',
              'Une soumission répétée ne crée pas plusieurs demandes actives. PE Community consigne la tentative, conserve la demande en attente de référence et place en file un rappel ou conseil soumis à un délai. Les soumissions simultanées convergent vers la même demande.',
            ),
          ],
        },
        {
          id: 'membership-status',
          title: t(
            'Approval is not permanent active status',
            'L’approbation ne garantit pas un statut actif permanent',
          ),
          body: [
            t(
              'Registration review and membership administration are different workflows. After approval, an authorized administrator may suspend an active membership and later reactivate that suspended membership. Only active members appear in the member directory, and directory access can also be hidden community-wide.',
              'L’examen d’inscription et l’administration des adhésions sont deux parcours distincts. Après approbation, un administrateur autorisé peut suspendre une adhésion active puis la réactiver. Seuls les membres actifs apparaissent dans l’annuaire, dont l’accès peut aussi être masqué pour toute la communauté.',
            ),
          ],
        },
      ],
    },
    calendarEvents: {
      title: t('Calendar and events', 'Calendrier et événements'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/calendar-and-events',
      description: t(
        'Schedule community events, coordinate attendance, and see event and assigned-task dates together.',
        'Planifier les événements, coordonner les présences et voir ensemble événements et échéances attribuées.',
      ),
      cards: [
        {
          title: t('Task boards', 'Tableaux de tâches'),
          body: t(
            'Coordinate work linked to an event.',
            'Coordonner le travail lié à un événement.',
          ),
          href: '/docs/task-boards',
        },
        {
          title: t('Automation', 'Automatisation'),
          body: t(
            'Understand the event cutoff for linked rules.',
            'Comprendre la limite événementielle des règles liées.',
          ),
          href: '/docs/automation',
        },
      ],
      sections: [
        {
          id: 'calendar',
          title: t(
            'One schedule for community activity',
            'Un calendrier pour l’activité communautaire',
          ),
          body: [
            t(
              'The member calendar combines community event dates with due dates for tasks assigned to the signed-in member. Source filters separate events from task deadlines, and dates are grouped using the community timezone.',
              'Le calendrier membre combine les dates des événements et les échéances des tâches attribuées au membre connecté. Les filtres séparent événements et tâches, et les dates utilisent le fuseau horaire de la communauté.',
            ),
          ],
        },
        {
          id: 'administrators',
          title: t('For administrators', 'Pour les administrateurs'),
          bullets: [
            t(
              'Create and edit a title, description, scheduled time, location, optional online link, and optional capacity.',
              'Créer et modifier un titre, une description, une date, un lieu, un lien en ligne facultatif et une capacité facultative.',
            ),
            t(
              'Review RSVP totals and individual responses, and email attendee groups when permitted.',
              'Examiner les totaux et réponses individuelles, puis envoyer un email aux groupes de participants lorsque cela est autorisé.',
            ),
            t(
              'Link one active task board to an event; its name follows the event title.',
              'Lier un tableau de tâches actif à un événement ; son nom suit le titre de l’événement.',
            ),
            t(
              'Deleting an event removes its RSVP records and archives its linked task board before removing the event.',
              'La suppression d’un événement retire ses réponses et archive son tableau de tâches lié avant de retirer l’événement.',
            ),
          ],
        },
        {
          id: 'members',
          title: t('For members', 'Pour les membres'),
          body: [
            t(
              'Members can browse events, open the full details, see location or online joining information, view attendance totals, and change their own RSVP. RSVP does not close automatically at capacity or at the scheduled time.',
              'Les membres peuvent parcourir les événements, ouvrir les détails, voir le lieu ou le lien en ligne, consulter les totaux de présence et modifier leur propre réponse. Les réponses ne se ferment pas automatiquement à capacité atteinte ni à l’heure prévue.',
            ),
          ],
        },
        {
          id: 'rsvp',
          title: t(
            'Going, Maybe, and Not going',
            'Présent, Peut-être et Absent',
          ),
          table: {
            headers: [t('Response', 'Réponse'), t('Meaning', 'Signification')],
            rows: [
              [
                t('Going', 'Présent'),
                t('Confirms attendance.', 'Confirme la présence.'),
              ],
              [
                t('Maybe', 'Peut-être'),
                t(
                  'Shows interest without a commitment.',
                  'Indique un intérêt sans engagement.',
                ),
              ],
              [
                t('Not going', 'Absent'),
                t('Declines attendance.', 'Décline la participation.'),
              ],
            ],
          },
        },
        {
          id: 'rsvp-changes',
          title: t('Changing an RSVP', 'Modifier une réponse'),
          body: [
            t(
              'Submitting a new response replaces the member’s prior response for that event. Capacity is displayed for planning but is not currently enforced as a reservation limit, and there is no waiting list.',
              'Une nouvelle réponse remplace la réponse précédente du membre pour cet événement. La capacité est affichée pour la planification, mais n’est pas imposée comme limite de réservation et aucune liste d’attente n’existe.',
            ),
          ],
        },
        {
          id: 'event-task-lifecycle',
          title: t(
            'Event and task-board lifecycle',
            'Cycle de vie événement et tableau',
          ),
          body: [
            t(
              'An event-linked task board remains the operational history for that event. Automation treats the event’s scheduled time as its terminal cutoff: once that time is reached, linked rules are evaluated as ineligible. Deleting the event archives the board and its tasks.',
              'Un tableau lié reste l’historique opérationnel de l’événement. L’automatisation considère l’heure prévue comme limite terminale : une fois atteinte, les règles liées deviennent inéligibles. Supprimer l’événement archive le tableau et ses tâches.',
            ),
          ],
          callout: {
            variant: 'warning',
            title: t(
              'Scheduled time is the automation cutoff',
              'L’heure prévue est la limite d’automatisation',
            ),
            body: t(
              'PE Community does not currently store a separate event end time or canceled state. Plan event-linked automation around the scheduled event time.',
              'PE Community ne stocke actuellement ni heure de fin distincte ni état annulé. Planifiez les automatisations liées autour de l’heure prévue de l’événement.',
            ),
          },
        },
      ],
    },
    announcementsFeed: {
      title: t('Announcements and Feed', 'Annonces et Fil'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/announcements-and-feed',
      description: t(
        'Publish community updates, optionally email active members, and measure member engagement.',
        'Publier des informations communautaires, envoyer facultativement un email aux membres actifs et mesurer l’engagement.',
      ),
      cards: [
        {
          title: t('Notifications', 'Notifications'),
          body: t(
            'Separate Feed read confirmation from general unread state.',
            'Distinguer la confirmation de lecture du Fil de l’état général non lu.',
          ),
          href: '/docs/notifications',
        },
        {
          title: t('Audit logs', 'Journaux d’audit'),
          body: t(
            'Review publication and delivery operations.',
            'Examiner les opérations de publication et de livraison.',
          ),
          href: '/docs/audit-logs',
        },
      ],
      sections: [
        {
          id: 'publishing',
          title: t('For administrators', 'Pour les administrateurs'),
          body: [
            t(
              'Authorized administrators can create a draft, publish immediately or later, edit, unpublish back to draft, archive, and delete. Only published, non-deleted announcements appear in the member Feed.',
              'Les administrateurs autorisés peuvent créer un brouillon, publier immédiatement ou plus tard, modifier, dépublier vers le brouillon, archiver et supprimer. Seules les annonces publiées et non supprimées apparaissent dans le Fil membre.',
            ),
          ],
        },
        {
          id: 'community-identity',
          title: t(
            'Publish as the community team',
            'Publier au nom de l’équipe communautaire',
          ),
          body: [
            t(
              'An Owner or Admin can use the community-team identity for an announcement and for administrative comments or replies. Members then see the community as the publisher instead of the individual administrator. The actual administrative action remains permission-checked and auditable.',
              'Un Propriétaire ou Admin peut utiliser l’identité de l’équipe communautaire pour une annonce et pour les commentaires ou réponses administratives. Les membres voient alors la communauté comme auteur plutôt que l’administrateur individuel. L’action administrative réelle reste soumise aux permissions et auditée.',
            ),
          ],
        },
        {
          id: 'email-active-members',
          title: t(
            'Email active members',
            'Envoyer un email aux membres actifs',
          ),
          body: [
            t(
              'Emailing active members is an optional publication action. It creates an email campaign for every active membership, using the announcement title and body. Suspended and pending memberships are excluded. Feed publication still succeeds independently; email delivery depends on configured email service and background processing, and delivery failures remain visible in email campaign reporting.',
              'L’envoi aux membres actifs est une action facultative de publication. Il crée une campagne pour chaque adhésion active à partir du titre et du corps de l’annonce. Les adhésions suspendues et en attente sont exclues. La publication dans le Fil reste indépendante ; la livraison dépend de la configuration email et du traitement en arrière-plan, et les échecs restent visibles dans le suivi des campagnes.',
            ),
          ],
        },
        {
          id: 'feed-reading',
          title: t('For members', 'Pour les membres'),
          body: [
            t(
              'The Feed lists published announcements newest first. An eligible item has an explicit Mark as read action. Liking the item or opening its comments also marks it as read. This receipt supports announcement reporting and is distinct from merely seeing a temporary toast.',
              'Le Fil affiche les annonces publiées de la plus récente à la plus ancienne. Un élément éligible propose l’action explicite Marquer comme lu. Aimer l’élément ou ouvrir ses commentaires le marque aussi comme lu. Ce reçu alimente le suivi de l’annonce et reste distinct de l’affichage d’un toast temporaire.',
            ),
          ],
        },
        {
          id: 'likes-comments-replies',
          title: t(
            'Likes, comments, and replies',
            'J’aime, commentaires et réponses',
          ),
          bullets: [
            t(
              'Members can like or unlike an announcement; each member contributes at most one active like.',
              'Les membres peuvent aimer ou retirer leur J’aime ; chaque membre contribue au plus un J’aime actif.',
            ),
            t(
              'Members can add comments up to the current text limit and like or unlike comments.',
              'Les membres peuvent ajouter des commentaires dans la limite de texte actuelle et aimer ou retirer leur J’aime sur les commentaires.',
            ),
            t(
              'Replies are one level deep: a reply must target a top-level comment and cannot create a nested reply chain.',
              'Les réponses sont limitées à un niveau : elles ciblent un commentaire principal et ne peuvent pas créer une chaîne imbriquée.',
            ),
          ],
        },
        {
          id: 'reporting',
          title: t(
            'Publication and engagement reporting',
            'Suivi de publication et d’engagement',
          ),
          body: [
            t(
              'The announcement detail can report active-member recipients, notifications created, read and unread counts, read rate, likes, and comments. Email campaign status is observed separately because in-app publication and email delivery are different channels.',
              'Le détail d’une annonce peut présenter les destinataires actifs, les notifications créées, les lectures et non-lectures, le taux de lecture, les J’aime et les commentaires. Le statut de campagne email est suivi séparément, car publication dans l’application et livraison email sont deux canaux différents.',
            ),
          ],
        },
      ],
    },
    taskBoards: {
      title: t('Task boards', 'Tableaux de tâches'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/task-boards',
      description: t(
        'Plan event work and standalone operations with assignments, collaboration, and lifecycle controls.',
        'Planifier le travail événementiel et les opérations autonomes avec affectations, collaboration et cycles de vie.',
      ),
      cards: [
        {
          title: t('Calendar and events', 'Calendrier et événements'),
          body: t(
            'Understand event-linked boards and dates.',
            'Comprendre les tableaux et dates liés aux événements.',
          ),
          href: '/docs/calendar-and-events',
        },
        {
          title: t('Automation', 'Automatisation'),
          body: t(
            'Attach governed rules to active board work.',
            'Associer des règles gouvernées au travail actif du tableau.',
          ),
          href: '/docs/automation',
        },
      ],
      sections: [
        {
          id: 'board-purpose',
          title: t('What a task board organizes', 'Ce qu’organise un tableau'),
          body: [
            t(
              'A board groups tasks for an event or a standalone community operation. Event-linked boards inherit the event title and cannot be archived independently; standalone boards have their own name, description, visibility, and archive action.',
              'Un tableau regroupe les tâches d’un événement ou d’une opération autonome. Les tableaux liés héritent du titre de l’événement et ne peuvent pas être archivés séparément ; les tableaux autonomes ont leur nom, description, visibilité et action d’archivage.',
            ),
          ],
        },
        {
          id: 'board-lifecycle',
          title: t('Board lifecycle', 'Cycle de vie du tableau'),
          table: {
            headers: [t('State', 'État'), t('Behavior', 'Comportement')],
            rows: [
              [
                t('Active', 'Actif'),
                t(
                  'Normal planning, collaboration, and eligible automation.',
                  'Planification, collaboration et automatisation éligible normales.',
                ),
              ],
              [
                t('Paused', 'En pause'),
                t(
                  'Board remains visible; automation is suppressed until resumed.',
                  'Le tableau reste visible ; l’automatisation est suspendue jusqu’à la reprise.',
                ),
              ],
              [
                t('Completed', 'Terminé'),
                t(
                  'Board remains as history; automation is suppressed and the board can be reopened.',
                  'Le tableau reste dans l’historique ; l’automatisation est suspendue et le tableau peut être rouvert.',
                ),
              ],
              [
                t('Archived', 'Archivé'),
                t(
                  'Standalone board and active tasks leave the active workspace; automation cannot execute.',
                  'Le tableau autonome et ses tâches actives quittent l’espace actif ; l’automatisation ne peut plus s’exécuter.',
                ),
              ],
            ],
          },
        },
        {
          id: 'tasks-and-status',
          title: t('Tasks and status', 'Tâches et statut'),
          body: [
            t(
              'Tasks move among To do, In progress, and Done. They can carry a description, Low/Medium/High priority, label, due date, order, and one or more assignees. Completed tasks remain in board history and can be moved again by an authorized operator.',
              'Les tâches passent entre À faire, En cours et Terminé. Elles peuvent contenir une description, une priorité Basse/Moyenne/Haute, une étiquette, une échéance, un ordre et plusieurs responsables. Les tâches terminées restent dans l’historique et peuvent être déplacées à nouveau par un opérateur autorisé.',
            ),
          ],
        },
        {
          id: 'administrators',
          title: t('For administrators', 'Pour les administrateurs'),
          bullets: [
            t(
              'Create standalone or event-linked boards and control Public or Private visibility.',
              'Créer des tableaux autonomes ou liés et contrôler la visibilité Publique ou Privée.',
            ),
            t(
              'Create, edit, assign, reorder, move, and archive tasks; use reusable task templates where appropriate.',
              'Créer, modifier, affecter, réordonner, déplacer et archiver les tâches ; utiliser des modèles lorsque pertinent.',
            ),
            t(
              'Pause, complete, resume, or reopen a board using the allowed lifecycle transitions.',
              'Mettre en pause, terminer, reprendre ou rouvrir un tableau selon les transitions autorisées.',
            ),
          ],
        },
        {
          id: 'members',
          title: t('For members', 'Pour les membres'),
          body: [
            t(
              'Members can view boards available to them and see whether they are assigned or viewing. An assigned member can move their task, add comments and attachments, and create, edit, complete, reopen, reorder, or archive checklist items. Unassigned viewers cannot perform those assigned-member changes.',
              'Les membres peuvent voir les tableaux disponibles et leur statut de responsable ou lecteur. Un membre affecté peut déplacer sa tâche, ajouter commentaires et pièces jointes, puis créer, modifier, terminer, rouvrir, réordonner ou archiver les éléments de checklist. Les lecteurs non affectés ne peuvent pas effectuer ces changements.',
            ),
          ],
        },
        {
          id: 'collaboration',
          title: t(
            'Comments, attachments, checklists, and activity',
            'Commentaires, pièces jointes, checklists et activité',
          ),
          body: [
            t(
              'Each task keeps a chronological activity history for assignment, status, priority, due date, content, comments, attachments, checklist work, archival, and reordering. Task attachments are normal protected task files; they are not encrypted-chat attachments and should be handled according to community data policy.',
              'Chaque tâche conserve un historique chronologique des affectations, statuts, priorités, échéances, contenus, commentaires, pièces jointes, checklists, archivages et réordonnancements. Les pièces jointes de tâche sont des fichiers protégés ordinaires ; elles ne sont pas des pièces jointes de chat chiffré et doivent suivre la politique de données de la communauté.',
            ),
          ],
        },
        {
          id: 'visibility',
          title: t('Visibility and access', 'Visibilité et accès'),
          body: [
            t(
              'Public boards are visible in the member board list. Private boards are visible to assigned members. Administrative reads and changes remain permission-checked, and all member task actions verify the current community and assignment where required.',
              'Les tableaux publics apparaissent dans la liste membre. Les tableaux privés sont visibles des membres affectés. Les lectures et changements administratifs restent soumis aux permissions, et chaque action membre vérifie la communauté et l’affectation lorsque nécessaire.',
            ),
          ],
        },
      ],
    },
    automation: {
      title: t('Automation', 'Automatisation'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/automation',
      description: t(
        'Create, validate, test, publish, and observe rules attached to task boards.',
        'Créer, valider, tester, publier et observer les règles associées aux tableaux de tâches.',
      ),
      cards: [
        {
          title: t('Task boards', 'Tableaux de tâches'),
          body: t(
            'Understand the tasks and lifecycle rules evaluate.',
            'Comprendre les tâches et cycles de vie évalués.',
          ),
          href: '/docs/task-boards',
        },
        {
          title: t('Notifications', 'Notifications'),
          body: t(
            'Understand in-app and email outcomes.',
            'Comprendre les résultats dans l’application et par email.',
          ),
          href: '/docs/notifications',
        },
      ],
      sections: [
        {
          id: 'rule-catalog',
          title: t('Supported rules', 'Règles prises en charge'),
          table: {
            headers: [t('Rule', 'Règle'), t('Purpose', 'Objectif')],
            rows: [
              [
                t('Due before', 'Avant échéance'),
                t('Notify before a due date.', 'Notifier avant une échéance.'),
              ],
              [
                t('Overdue', 'En retard'),
                t(
                  'Notify for incomplete overdue work.',
                  'Notifier pour un travail incomplet en retard.',
                ),
              ],
              [
                t('Stale task follow-up', 'Relance de tâche inactive'),
                t(
                  'Notify after a period without activity.',
                  'Notifier après une période sans activité.',
                ),
              ],
              [
                t(
                  'Checklist incomplete before due',
                  'Checklist incomplète avant échéance',
                ),
                t(
                  'Notify when checklist work remains near the due date.',
                  'Notifier lorsqu’une checklist reste incomplète près de l’échéance.',
                ),
              ],
              [
                t('Overdue escalation', 'Escalade de retard'),
                t(
                  'Escalate after a configured grace period.',
                  'Escalader après un délai de grâce configuré.',
                ),
              ],
              [
                t('Auto-complete checklist', 'Complétion automatique'),
                t(
                  'Move eligible tasks to Done when all checklist items are complete.',
                  'Passer les tâches éligibles à Terminé lorsque la checklist est complète.',
                ),
              ],
              [
                t('Flag unassigned', 'Signaler sans responsable'),
                t(
                  'Surface tasks without an active assignee.',
                  'Faire ressortir les tâches sans responsable actif.',
                ),
              ],
            ],
          },
        },
        {
          id: 'rule-lifecycle',
          title: t('Rule lifecycle', 'Cycle de vie d’une règle'),
          body: [
            t(
              'Rules have a published configuration, optional draft, enabled state, immutable version history, and optional archive state. Draft editing does not affect live execution until published. Authorized users can validate, test, archive, restore, and roll back supported versions.',
              'Les règles possèdent une configuration publiée, un brouillon facultatif, un état activé, un historique de versions immuable et un archivage facultatif. Un brouillon n’affecte pas l’exécution avant publication. Les utilisateurs autorisés peuvent valider, tester, archiver, restaurer et revenir à une version prise en charge.',
            ),
          ],
        },
        {
          id: 'recipients-actions',
          title: t(
            'Conditions, recipients, and actions',
            'Conditions, destinataires et actions',
          ),
          body: [
            t(
              'A rule combines its trigger type with timing or state configuration, recipient choices, and delivery channels. Notifications can target task assignees and eligible administrators. In-app and email channels are evaluated independently, and email requires an eligible address and available email configuration.',
              'Une règle combine son déclencheur avec une configuration temporelle ou d’état, des choix de destinataires et des canaux. Les notifications peuvent cibler les responsables et administrateurs éligibles. Les canaux dans l’application et email sont évalués séparément, et l’email exige une adresse éligible et une configuration disponible.',
            ),
          ],
        },
        {
          id: 'testing',
          title: t('Validation and testing', 'Validation et tests'),
          bullets: [
            t(
              'Validation reports missing recipients, unsupported delivery, invalid timing, duplicate rules, and whether work currently matches.',
              'La validation signale destinataires absents, livraison indisponible, timing invalide, doublons et correspondances actuelles.',
            ),
            t(
              'A dry run evaluates current matching without replacing scheduled execution.',
              'Un test à blanc évalue les correspondances sans remplacer l’exécution planifiée.',
            ),
            t(
              'A test notification targets the requesting authorized administrator and records its own test result.',
              'Une notification de test cible l’administrateur autorisé demandeur et consigne son propre résultat.',
            ),
          ],
        },
        {
          id: 'run-history',
          title: t('Run history', 'Historique des exécutions'),
          body: [
            t(
              'Run history distinguishes Live, Dry run, and Test notification modes. Each run records start and finish times, rule and optional task context, delivery summaries, safe failure information, and one of Success, Skipped, or Failed.',
              'L’historique distingue les modes Réel, Test à blanc et Notification de test. Chaque exécution consigne les dates, le contexte de règle et de tâche éventuelle, les résumés de livraison, les informations d’échec sûres et un résultat Réussi, Ignoré ou Échoué.',
            ),
          ],
        },
        {
          id: 'skipped',
          title: t('What Skipped means', 'Signification de Ignoré'),
          body: [
            t(
              'Skipped means the rule was evaluated but intentionally produced no action. Common reasons include a paused, completed, or archived board; a reached event cutoff; a disabled or archived rule; a completed or archived task; no longer matching conditions; duplicate prevention; or no supported delivery result.',
              'Ignoré signifie que la règle a été évaluée sans produire d’action. Les causes courantes sont un tableau en pause, terminé ou archivé ; une limite d’événement atteinte ; une règle désactivée ou archivée ; une tâche terminée ou archivée ; des conditions devenues fausses ; la prévention des doublons ; ou aucun résultat de livraison pris en charge.',
            ),
          ],
        },
        {
          id: 'lifecycle-safety',
          title: t('Lifecycle safety', 'Sécurité du cycle de vie'),
          body: [
            t(
              'Automation executes only while the board is Active, the rule is enabled and not archived, and the relevant task is neither Done nor archived. For an event-linked board, the event’s scheduled time is an additional cutoff. Retrying an old run reevaluates current state and records Skipped instead of replaying stale work when the original conditions no longer apply.',
              'L’automatisation s’exécute uniquement si le tableau est Actif, la règle activée et non archivée, et la tâche concernée ni Terminée ni archivée. Pour un tableau lié, l’heure prévue de l’événement est une limite supplémentaire. Relancer une ancienne exécution réévalue l’état actuel et consigne Ignoré au lieu de rejouer un travail obsolète.',
            ),
          ],
          callout: {
            variant: 'security',
            title: t(
              'Reopening does not replay stale actions',
              'La réouverture ne rejoue pas les actions obsolètes',
            ),
            body: t(
              'Resuming or reopening makes future eligible evaluations possible. It does not automatically replay notifications or changes suppressed while the board was ineligible.',
              'Reprendre ou rouvrir permet de futures évaluations éligibles. Cela ne rejoue pas automatiquement les notifications ou changements supprimés pendant l’inéligibilité.',
            ),
          },
        },
        {
          id: 'presets',
          title: t('Presets and templates', 'Préréglages et modèles'),
          body: [
            t(
              'Automation presets package reusable rule configurations. Applying a preset previews validation and creates the eligible rules without changing the meaning of existing rules or task templates.',
              'Les préréglages regroupent des configurations réutilisables. Leur application prévisualise la validation et crée les règles éligibles sans modifier le sens des règles existantes ni des modèles de tâches.',
            ),
          ],
        },
      ],
    },
    notifications: {
      title: t('Notifications', 'Notifications'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/notifications',
      description: t(
        'Persistent notification state, temporary feedback, preferences, and email delivery.',
        'État persistant, retours temporaires, préférences et livraison email.',
      ),
      cards: [
        {
          title: t('Announcements and Feed', 'Annonces et Fil'),
          body: t(
            'Understand announcement-specific read confirmation.',
            'Comprendre la confirmation de lecture propre aux annonces.',
          ),
          href: '/docs/announcements-and-feed',
        },
        {
          title: t('Automation', 'Automatisation'),
          body: t(
            'Understand rule delivery outcomes.',
            'Comprendre les résultats de livraison des règles.',
          ),
          href: '/docs/automation',
        },
      ],
      sections: [
        {
          id: 'audiences',
          title: t('Separate audiences', 'Publics séparés'),
          body: [
            t(
              'Administrative alerts use the Admin or Owner notification tray. Member notifications use the member drawer and notification page. A registration review alert never becomes a member notification, and audience-specific counts remain separate.',
              'Les alertes administratives utilisent le panneau Admin ou Propriétaire. Les notifications membres utilisent le tiroir et la page membre. Une alerte d’examen d’inscription ne devient jamais une notification membre, et les compteurs restent séparés.',
            ),
          ],
        },
        {
          id: 'persistent-state',
          title: t(
            'Persistent notifications and unread state',
            'Notifications persistantes et état non lu',
          ),
          body: [
            t(
              'A persistent notification is stored until product retention removes it. It has its own unread state and can be marked read. Opening the tray or seeing another form of feedback does not itself mark that record as read.',
              'Une notification persistante est stockée jusqu’à son retrait selon la conservation du produit. Elle possède son état non lu et peut être marquée comme lue. Ouvrir le panneau ou voir un autre retour ne marque pas ce reçu comme lu.',
            ),
          ],
        },
        {
          id: 'toasts',
          title: t('Temporary toasts', 'Toasts temporaires'),
          body: [
            t(
              'Toasts report transient results and may also surface unread persistent notifications at session start. They disappear automatically or can be dismissed. Dismissing a toast changes only the temporary presentation, not the stored notification or unread count.',
              'Les toasts indiquent des résultats temporaires et peuvent aussi présenter des notifications persistantes non lues au début de session. Ils disparaissent ou peuvent être fermés. Fermer un toast ne change que l’affichage temporaire, pas la notification stockée ni son compteur.',
            ),
          ],
          callout: {
            variant: 'note',
            title: t('A toast is not a receipt', 'Un toast n’est pas un reçu'),
            body: t(
              'Use the notification tray, drawer, or page to review and mark persistent items as read.',
              'Utilisez le panneau, le tiroir ou la page de notifications pour examiner et marquer les éléments persistants comme lus.',
            ),
          },
        },
        {
          id: 'delivery-channels',
          title: t(
            'In-app and email delivery',
            'Livraison dans l’application et par email',
          ),
          body: [
            t(
              'In-app notification creation and email delivery are separate outcomes. Email depends on the notification category, member preference, community setting, recipient eligibility, available email configuration, and background processing. A successful in-app notification does not prove that an optional email was delivered.',
              'La création dans l’application et la livraison email sont des résultats distincts. L’email dépend de la catégorie, de la préférence membre, du paramètre communautaire, de l’éligibilité du destinataire, de la configuration et du traitement en arrière-plan. Une notification créée ne prouve pas la livraison de l’email facultatif.',
            ),
          ],
        },
        {
          id: 'preferences',
          title: t('Preferences', 'Préférences'),
          body: [
            t(
              'Members can manage supported announcement, event, birthday, and passport-reminder preferences. Community administrators control supported notification behavior and templates. Changing a preference affects future eligible delivery; it does not erase prior notifications.',
              'Les membres peuvent gérer les préférences prises en charge pour annonces, événements, anniversaires et rappels de passeport. Les administrateurs contrôlent les comportements et modèles pris en charge. Un changement affecte les futures livraisons éligibles sans effacer l’historique.',
            ),
          ],
        },
        {
          id: 'feature-specific-state',
          title: t(
            'Feature-specific read state',
            'État de lecture propre aux fonctionnalités',
          ),
          body: [
            t(
              'Announcement read confirmation and chat unread state are owned by those features. They may contribute badges, but they are not interchangeable with the general notification receipt. Follow the Announcements and Feed or Encrypted chat guide for those semantics.',
              'La confirmation de lecture des annonces et l’état non lu du chat appartiennent à ces fonctionnalités. Ils peuvent alimenter des badges, mais ne sont pas interchangeables avec le reçu général. Consultez les guides correspondants.',
            ),
          ],
        },
      ],
    },
    streaksEngagement: {
      title: t('Streaks and engagement', 'Séries et engagement'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/streaks-and-engagement',
      description: t(
        'How successful daily sign-ins produce current streaks, personal bests, rank, and operator insight.',
        'Comment les connexions quotidiennes réussies produisent séries actuelles, records, rangs et suivi opérateur.',
      ),
      cards: [
        {
          title: t('Security', 'Sécurité'),
          body: t(
            'Review the authentication controls behind a successful sign-in.',
            'Examiner les contrôles derrière une connexion réussie.',
          ),
          href: '/docs/security',
        },
        {
          title: t('Audit logs', 'Journaux d’audit'),
          body: t(
            'Understand operational history boundaries.',
            'Comprendre les limites de l’historique opérationnel.',
          ),
          href: '/docs/audit-logs',
        },
      ],
      sections: [
        {
          id: 'earning-a-streak',
          title: t('Earning a streak', 'Gagner une série'),
          body: [
            t(
              'A successful authenticated sign-in creates the first day of a login streak. Another successful sign-in on the next calendar day increments it. Additional sign-ins on the same day update activity time without adding another day.',
              'Une connexion authentifiée réussie crée le premier jour d’une série. Une autre connexion réussie le jour calendaire suivant l’incrémente. Les connexions supplémentaires le même jour actualisent l’activité sans ajouter de jour.',
            ),
          ],
        },
        {
          id: 'timezone-reset',
          title: t(
            'Timezone and reset behavior',
            'Fuseau horaire et remise à zéro',
          ),
          body: [
            t(
              'Day boundaries use the community timezone. If the previous recorded day is neither today nor yesterday, the next successful sign-in starts the current streak again at one. The longest streak remains the all-time best.',
              'Les limites de journée utilisent le fuseau communautaire. Si le dernier jour enregistré n’est ni aujourd’hui ni hier, la prochaine connexion réussie recommence la série à un. La plus longue série conserve le record historique.',
            ),
          ],
          callout: {
            variant: 'note',
            title: t('At risk after yesterday', 'À risque après hier'),
            body: t(
              'A member who last signed in yesterday keeps the current count but is marked at risk until signing in today. Older activity is shown as a lost current streak.',
              'Un membre connecté pour la dernière fois hier conserve son compte mais apparaît à risque jusqu’à sa connexion du jour. Une activité plus ancienne correspond à une série actuelle perdue.',
            ),
          },
        },
        {
          id: 'rank',
          title: t('Rank and leader', 'Rang et leader'),
          body: [
            t(
              'The leaderboard includes active community members with streak records. It sorts by current streak, then longest streak, then most recent login. Rank reflects that current ordering; the leader is the first row.',
              'Le classement inclut les membres actifs possédant une série. Il trie par série actuelle, puis record, puis connexion la plus récente. Le rang reflète cet ordre ; le leader est la première ligne.',
            ),
          ],
        },
        {
          id: 'member-view',
          title: t('What members see', 'Ce que voient les membres'),
          body: [
            t(
              'A member sees their current streak, best streak, whether today is active, rank, number of ranked users, and the current leader’s display name, avatar, and streak totals. It does not expose detailed login timestamps for every member.',
              'Un membre voit sa série actuelle, son record, l’activité du jour, son rang, le nombre de classés et le nom, l’avatar et les totaux du leader. Les horodatages détaillés de connexion de tous les membres ne sont pas exposés.',
            ),
          ],
        },
        {
          id: 'administrator-view',
          title: t(
            'What administrators see',
            'Ce que voient les administrateurs',
          ),
          body: [
            t(
              'Authorized operators can inspect active-today, at-risk, lost, and no-streak states; current and best values; last active day; rank; aggregate metrics; and recent created, incremented, reset, and best-update events. Suspended and pending memberships are excluded.',
              'Les opérateurs autorisés peuvent examiner les états actif aujourd’hui, à risque, perdu et sans série ; les valeurs actuelles et records ; le dernier jour actif ; le rang ; les agrégats ; et les événements récents de création, incrément, remise à zéro et record. Les adhésions suspendues et en attente sont exclues.',
            ),
          ],
        },
        {
          id: 'engagement-boundary',
          title: t(
            'Engagement and privacy boundary',
            'Frontière d’engagement et de confidentialité',
          ),
          body: [
            t(
              'A streak measures successful sign-in days only. It does not measure message content, pages viewed, time spent, event attendance, task completion, or Feed activity. Treat it as a lightweight participation signal, not a productivity or security score.',
              'Une série mesure uniquement les jours de connexion réussie. Elle ne mesure ni contenu des messages, pages vues, temps passé, présence aux événements, tâches terminées ni activité du Fil. Considérez-la comme un signal léger, pas comme un score de productivité ou de sécurité.',
            ),
          ],
        },
      ],
    },
    auditLogs: {
      title: t('Audit logs', 'Journaux d’audit'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/audit-logs',
      description: t(
        'Review who performed sensitive or operational actions, when, against what target, and with what outcome.',
        'Examiner qui a effectué des actions sensibles ou opérationnelles, quand, sur quelle cible et avec quel résultat.',
      ),
      cards: [
        {
          title: t('Administration', 'Administration'),
          body: t(
            'See the operations that produce audit history.',
            'Voir les opérations qui produisent l’historique.',
          ),
          href: '/docs/administration',
        },
        {
          title: t('Security', 'Sécurité'),
          body: t(
            'Review platform-wide security controls.',
            'Examiner les contrôles de sécurité globaux.',
          ),
          href: '/docs/security',
        },
      ],
      sections: [
        {
          id: 'record-content',
          title: t('What an audit record shows', 'Contenu d’un enregistrement'),
          body: [
            t(
              'A record identifies the action, category, outcome, severity, actor or system source, target, and timestamp. Where available, detail includes a safe reason, before/after changes, recorded role and label, request or job context, and approved operational metadata.',
              'Un enregistrement identifie l’action, la catégorie, le résultat, la gravité, l’acteur ou la source système, la cible et la date. Lorsque disponibles, le détail comprend un motif sûr, les changements avant/après, le rôle et libellé enregistrés, le contexte de requête ou de tâche et des métadonnées approuvées.',
            ),
          ],
        },
        {
          id: 'coverage',
          title: t('Current coverage', 'Couverture actuelle'),
          body: [
            t(
              'Audit categories cover authentication, authorization, members, roles, community settings, security, email, notifications, task boards, automation, events, documents, announcements, registration, chat, and system work where those workflows emit records.',
              'Les catégories couvrent authentification, autorisation, membres, rôles, paramètres communautaires, sécurité, email, notifications, tâches, automatisation, événements, documents, annonces, inscriptions, chat et travaux système lorsque ces parcours émettent des enregistrements.',
            ),
          ],
        },
        {
          id: 'finding-records',
          title: t(
            'Filters, search, and detail',
            'Filtres, recherche et détail',
          ),
          bullets: [
            t(
              'Filter by category, outcome, action, actor, target type, and community-local date range.',
              'Filtrer par catégorie, résultat, action, acteur, type de cible et période locale à la communauté.',
            ),
            t(
              'Search action and target identifiers, matching actors, and retained request, correlation, or job references.',
              'Rechercher actions, identifiants de cible, acteurs correspondants et références de requête, corrélation ou tâche.',
            ),
            t(
              'Results are newest first and paginated; open one record for its approved detail.',
              'Les résultats sont paginés du plus récent au plus ancien ; ouvrez un enregistrement pour son détail approuvé.',
            ),
          ],
        },
        {
          id: 'sensitive-data',
          title: t(
            'Sensitive-data exclusion',
            'Exclusion des données sensibles',
          ),
          body: [
            t(
              'Audit metadata is allow-listed, size-limited, depth-limited, and removes keys associated with passwords, password hashes, tokens, cookies, authorization headers, API keys, private keys, SMTP passwords, CAPTCHA secrets, and encryption keys.',
              'Les métadonnées sont limitées par liste autorisée, taille et profondeur, et retirent les clés associées aux mots de passe, empreintes, jetons, cookies, autorisations, clés API, clés privées, mots de passe SMTP, secrets CAPTCHA et clés de chiffrement.',
            ),
          ],
          callout: {
            variant: 'security',
            title: t(
              'Never a content archive',
              'Jamais une archive de contenu',
            ),
            body: t(
              'Audit logs must not contain MFA secrets, chat recovery passwords, decrypted messages or attachments, protected credentials, or raw security secrets.',
              'Les journaux ne doivent contenir ni secrets MFA, mots de passe de récupération du chat, messages ou pièces jointes déchiffrés, identifiants protégés ni secrets bruts.',
            ),
          },
        },
        {
          id: 'storage-boundary',
          title: t(
            'Storage and trust boundary',
            'Stockage et frontière de confiance',
          ),
          body: [
            t(
              'Audit records are stored in the application database. They support operational review and investigation, but PE Community does not claim external immutable, write-once, or tamper-proof logging. Operators who require that property must export or forward records into an independently controlled system.',
              'Les journaux sont stockés dans la base de l’application. Ils soutiennent l’examen et l’investigation, mais PE Community ne revendique pas de stockage externe immuable, en écriture unique ou inviolable. Les opérateurs qui l’exigent doivent exporter ou transférer les enregistrements vers un système indépendant.',
            ),
          ],
        },
        {
          id: 'review-practice',
          title: t('Review practice', 'Pratique d’examen'),
          body: [
            t(
              'Use audit history to investigate unexpected access denials, role and member changes, registration decisions, publication and delivery operations, task and automation outcomes, security changes, and chat-device or encrypted-media governance. Correlate the record with product state rather than treating a single entry as complete forensic evidence.',
              'Utilisez l’historique pour examiner refus d’accès, changements de rôles et membres, décisions d’inscription, publications et livraisons, résultats de tâches et automatisations, changements de sécurité et gouvernance des appareils ou médias chiffrés. Corrélez l’enregistrement avec l’état du produit plutôt que de le considérer comme preuve forensique complète.',
            ),
          ],
        },
      ],
    },
    encryptedChat: {
      title: t('Encrypted chat', 'Chat chiffré'),
      eyebrow: t('Platform security', 'Sécurité de la plateforme'),
      href: '/docs/encrypted-chat',
      description: t(
        'The participant, encryption, device, recovery, media, and threat boundaries you must understand before relying on chat.',
        'Les frontières de participation, chiffrement, appareils, récupération, médias et menaces à comprendre avant d’utiliser le chat.',
      ),
      cards: [
        {
          title: t('Security', 'Sécurité'),
          body: t(
            'Review account, session, and platform controls around chat.',
            'Examiner les contrôles de compte, session et plateforme autour du chat.',
          ),
          href: '/docs/security',
        },
        {
          title: t('Notifications', 'Notifications'),
          body: t(
            'Understand persistent notifications and chat unread state.',
            'Comprendre les notifications persistantes et l’état non lu du chat.',
          ),
          href: '/docs/notifications',
        },
      ],
      sections: [
        {
          id: 'e2ee-model',
          title: t(
            'What end-to-end encryption means here',
            'Signification du chiffrement de bout en bout ici',
          ),
          body: [
            t(
              'PE Community creates chat key material in the browser. A direct message is encrypted with a key derived from the sender’s private key and recipient’s public key. A group message is encrypted separately for every current participant, including the sender. Decryption happens in an authorized participant browser that holds the required private key.',
              'PE Community crée les clés de chat dans le navigateur. Un message direct est chiffré avec une clé dérivée de la clé privée de l’expéditeur et de la clé publique du destinataire. Un message de groupe est chiffré séparément pour chaque participant actuel, expéditeur compris. Le déchiffrement a lieu dans le navigateur autorisé d’un participant possédant la clé privée requise.',
            ),
          ],
          mermaid: {
            title: t('Encrypted message path', 'Parcours du message chiffré'),
            description: t(
              'Plaintext and private keys remain in participant browsers while the service authorizes access and stores or transports ciphertext with permitted metadata.',
              'Le texte clair et les clés privées restent dans les navigateurs des participants tandis que le service autorise l’accès et stocke ou transporte le contenu chiffré avec les métadonnées permises.',
            ),
            unavailableLabel: t(
              'Diagram unavailable.',
              'Diagramme indisponible.',
            ),
            sources: {
              en: `flowchart TD
  accTitle: Encrypted message path
  accDescr: The sender browser encrypts plaintext locally for a direct recipient or separately for each current group participant. The service authorizes access and stores ciphertext with permitted metadata. The recipient browser receives ciphertext and decrypts it locally.
  Sender["Sender browser: plaintext and private key local"] --> Mode{"Conversation type"}
  Mode --> Direct["Direct: recipient public key"]
  Mode --> Group["Group: one encrypted copy per current participant"]
  Direct directEncrypt@--> Ciphertext["Ciphertext and permitted metadata"]
  Group groupEncrypt@--> Ciphertext
  Ciphertext sendCiphertext@--> Service["PE Community service: ciphertext and permitted metadata"]
  Service authorizeRequest@--> Authorized["Authorize participant and device key version"]
  Authorized storeCiphertext@--> Store["Ciphertext and lifecycle metadata"]
  Authorized deliverCiphertext@--> Recipient["Recipient browser: ciphertext"]
  Recipient decryptLocally@--> Plaintext["Recipient browser: plaintext after local decryption"]
  directEncrypt@{ animation: slow }
  groupEncrypt@{ animation: slow }
  sendCiphertext@{ animation: fast }
  authorizeRequest@{ animation: slow }
  storeCiphertext@{ animation: slow }
  deliverCiphertext@{ animation: fast }
  decryptLocally@{ animation: slow }`,
              fr: `flowchart TD
  accTitle: Parcours du message chiffré
  accDescr: Le navigateur expéditeur chiffre le texte localement pour le destinataire direct ou séparément pour chaque participant actuel du groupe. Le service autorise l'accès et stocke le contenu chiffré avec les métadonnées permises. Le navigateur destinataire reçoit puis déchiffre localement.
  Sender["Navigateur expéditeur : texte clair et clé privée locaux"] --> Mode{"Type de conversation"}
  Mode --> Direct["Directe : clé publique du destinataire"]
  Mode --> Group["Groupe : une copie chiffrée par participant actuel"]
  Direct directEncrypt@--> Ciphertext["Contenu chiffré et métadonnées permises"]
  Group groupEncrypt@--> Ciphertext
  Ciphertext sendCiphertext@--> Service["Service PE Community : contenu chiffré et métadonnées permises"]
  Service authorizeRequest@--> Authorized["Autoriser participant et version de clé"]
  Authorized storeCiphertext@--> Store["Contenu chiffré et cycle de vie"]
  Authorized deliverCiphertext@--> Recipient["Navigateur destinataire : contenu chiffré"]
  Recipient decryptLocally@--> Plaintext["Navigateur destinataire : texte clair après déchiffrement local"]
  directEncrypt@{ animation: slow }
  groupEncrypt@{ animation: slow }
  sendCiphertext@{ animation: fast }
  authorizeRequest@{ animation: slow }
  storeCiphertext@{ animation: slow }
  deliverCiphertext@{ animation: fast }
  decryptLocally@{ animation: slow }`,
            },
          },
          callout: {
            variant: 'security',
            title: t(
              'Participant-only access',
              'Accès réservé aux participants',
            ),
            body: t(
              'Owner or Admin status does not provide a private-chat override. Conversation data and realtime rooms require active participation.',
              'Le statut Propriétaire ou Admin ne donne aucun accès général au chat privé. Les données et salons temps réel exigent une participation active.',
            ),
          },
        },
        {
          id: 'algorithms',
          title: t(
            'Current cryptographic construction',
            'Construction cryptographique actuelle',
          ),
          body: [
            t(
              'Message keys use ECDH on P-256 to derive AES-GCM-256 keys, with a fresh 12-byte nonce for each encryption. Attachment bytes use a fresh AES-GCM-256 file key and nonce. Group delivery stores a recipient-specific encrypted envelope. This is a browser E2EE model, not the Signal protocol or a ratcheting protocol.',
              'Les clés de message utilisent ECDH P-256 pour dériver AES-GCM-256, avec un nonce neuf de 12 octets par chiffrement. Les pièces jointes utilisent une clé et un nonce AES-GCM-256 neufs. Les groupes stockent une enveloppe chiffrée par destinataire. Il s’agit d’un modèle E2EE navigateur, pas du protocole Signal ni d’un protocole à cliquet.',
            ),
          ],
        },
        {
          id: 'server-boundary',
          title: t(
            'What the service stores and can observe',
            'Ce que le service stocke et peut observer',
          ),
          table: {
            headers: [
              t('Visible to the service', 'Visible par le service'),
              t(
                'Not intentionally sent in plaintext',
                'Non envoyé volontairement en clair',
              ),
            ],
            rows: [
              [
                t(
                  'Conversation identifiers, type, title, participants, roles, and membership changes',
                  'Identifiants, type, titre, participants, rôles et changements',
                ),
                t(
                  'Message body and locally derived reply text',
                  'Corps du message et texte de réponse dérivé localement',
                ),
              ],
              [
                t(
                  'Sender, timestamps, read/delivery state, ciphertext size, reactions, stars, reports, and deletion state',
                  'Expéditeur, dates, lecture/livraison, taille chiffrée, réactions, favoris, signalements et suppressions',
                ),
                t(
                  'Participant private keys and recovery password',
                  'Clés privées et mot de passe de récupération',
                ),
              ],
              [
                t(
                  'Public keys, key versions, fingerprints, device labels/status, and presence metadata',
                  'Clés publiques, versions, empreintes, appareils et présence',
                ),
                t(
                  'Decrypted attachment bytes, previews, file key, filename, MIME type, and original size',
                  'Octets et aperçus déchiffrés, clé de fichier, nom, type MIME et taille originale',
                ),
              ],
              [
                t(
                  'Encrypted attachment blob, encrypted size, media category, quota, lifecycle, sender, and conversation',
                  'Blob chiffré, taille chiffrée, catégorie, quota, cycle de vie, auteur et conversation',
                ),
                t(
                  'Decrypted message or attachment search index',
                  'Index de recherche déchiffré de messages ou pièces jointes',
                ),
              ],
            ],
          },
        },
        {
          id: 'device-key-model',
          title: t(
            'Browser and device key model',
            'Modèle de clés du navigateur et de l’appareil',
          ),
          body: [
            t(
              'The current private identity is stored in IndexedDB for the account and community within that browser profile; older local private identities are retained in a local key ring after rotation. An opaque device identifier and descriptive device metadata are stored separately. Browser profiles, private browsing sessions, and different computers do not share this storage automatically.',
              'L’identité privée actuelle est stockée dans IndexedDB pour le compte et la communauté de ce profil ; les anciennes identités locales sont conservées dans un trousseau local après rotation. Un identifiant opaque et des métadonnées descriptives sont stockés séparément. Les profils, sessions privées et ordinateurs ne partagent pas automatiquement ce stockage.',
            ),
          ],
          callout: {
            variant: 'warning',
            title: t(
              'Back up before switching',
              'Sauvegardez avant de changer',
            ),
            body: t(
              'Back up your encrypted-chat keys before switching browsers, browser profiles, computers, reinstalling software, or clearing site data. Signing in to the account alone does not restore a device-local private key.',
              'Sauvegardez vos clés de chat avant de changer de navigateur, profil ou ordinateur, de réinstaller un logiciel ou d’effacer les données du site. Se connecter au compte ne restaure pas à lui seul une clé privée locale.',
            ),
          },
        },
        {
          id: 'backup',
          title: t(
            'Back up your encrypted-chat keys',
            'Sauvegarder vos clés de chat',
          ),
          body: [
            t(
              'Use the chat recovery control to export an encrypted JSON backup after initial key setup and before any device or browser change. The backup contains the current private key encrypted locally with AES-GCM-256. A key derived from the recovery password uses PBKDF2-SHA-256 with a random salt and 210,000 iterations. The recovery password and unencrypted private key are not sent to the service.',
              'Utilisez le contrôle de récupération du chat pour exporter une sauvegarde JSON chiffrée après la configuration initiale et avant tout changement. Elle contient la clé privée actuelle chiffrée localement avec AES-GCM-256. Une clé dérivée du mot de passe utilise PBKDF2-SHA-256, un sel aléatoire et 210 000 itérations. Le mot de passe et la clé privée en clair ne sont pas envoyés au service.',
            ),
          ],
          bullets: [
            t(
              'Store the backup somewhere protected and separate from the browser.',
              'Stockez la sauvegarde dans un endroit protégé et distinct du navigateur.',
            ),
            t(
              'Use a strong, unique recovery password and store it separately from the backup file.',
              'Utilisez un mot de passe de récupération fort et unique, stocké séparément du fichier.',
            ),
            t(
              'Create a fresh backup after an intentional key rotation because an earlier file contains only the key exported at that time.',
              'Créez une nouvelle sauvegarde après une rotation volontaire, car l’ancien fichier ne contient que la clé exportée à ce moment.',
            ),
          ],
          mermaid: {
            title: t(
              'Key backup and restore',
              'Sauvegarde et restauration des clés',
            ),
            description: t(
              'The current private key is encrypted locally into a user-held backup, then restored locally and matched to a retained, non-revoked public key before the new browser is authorized.',
              'La clé privée actuelle est chiffrée localement dans une sauvegarde détenue par l’utilisateur, puis restaurée localement et comparée à une clé publique conservée et non révoquée avant l’autorisation du nouveau navigateur.',
            ),
            unavailableLabel: t(
              'Diagram unavailable.',
              'Diagramme indisponible.',
            ),
            sources: {
              en: `flowchart TD
  accTitle: Key backup and restore
  accDescr: The browser derives a backup key from the recovery password and a random salt, encrypts the current private key locally with AES-GCM, and downloads an encrypted JSON file. On a new browser, import and decryption happen locally. The service accepts authorization only when the reconstructed public key matches a retained, non-revoked key version.
  Current["Current private key in browser"] deriveBackupKey@--> Derive["Derive backup key from recovery password and random salt"]
  Derive encryptPrivateKey@--> Encrypt["Encrypt private key locally with AES-GCM-256"]
  Encrypt createBackup@--> Backup["Download encrypted JSON backup"]
  Backup protectBackup@--> Protect["Store backup and recovery password separately"]
  Protect --> NewBrowser["New browser or device"]
  NewBrowser importBackup@--> Import["Import backup and enter recovery password"]
  Import restoreLocally@--> LocalRestore["Decrypt backup and reconstruct public key locally"]
  LocalRestore verifyPublicKey@--> Verify{"Matches a retained, non-revoked key version?"}
  Verify authorizeDevice@-->|Yes| Authorize["Authorize restored browser as a device"]
  Verify -->|No| Reject["Reject restore"]
  Authorize decryptHistory@--> History["Decrypt only eligible history covered by restored key material"]
  deriveBackupKey@{ animation: slow }
  encryptPrivateKey@{ animation: slow }
  createBackup@{ animation: slow }
  protectBackup@{ animation: slow }
  importBackup@{ animation: slow }
  restoreLocally@{ animation: slow }
  verifyPublicKey@{ animation: slow }
  authorizeDevice@{ animation: slow }
  decryptHistory@{ animation: slow }`,
              fr: `flowchart TD
  accTitle: Sauvegarde et restauration des clés
  accDescr: Le navigateur dérive une clé de sauvegarde du mot de passe de récupération et d'un sel aléatoire, chiffre localement la clé privée actuelle avec AES-GCM et télécharge un fichier JSON chiffré. Sur un nouveau navigateur, l'import et le déchiffrement restent locaux. Le service autorise uniquement une clé publique reconstruite correspondant à une version conservée et non révoquée.
  Current["Clé privée actuelle dans le navigateur"] deriveBackupKey@--> Derive["Dériver une clé du mot de passe et d'un sel aléatoire"]
  Derive encryptPrivateKey@--> Encrypt["Chiffrer localement la clé privée avec AES-GCM-256"]
  Encrypt createBackup@--> Backup["Télécharger la sauvegarde JSON chiffrée"]
  Backup protectBackup@--> Protect["Conserver séparément sauvegarde et mot de passe"]
  Protect --> NewBrowser["Nouveau navigateur ou appareil"]
  NewBrowser importBackup@--> Import["Importer et saisir le mot de passe de récupération"]
  Import restoreLocally@--> LocalRestore["Déchiffrer et reconstruire la clé publique localement"]
  LocalRestore verifyPublicKey@--> Verify{"Correspond à une version conservée non révoquée ?"}
  Verify authorizeDevice@-->|Oui| Authorize["Autoriser le navigateur restauré comme appareil"]
  Verify -->|Non| Reject["Refuser la restauration"]
  Authorize decryptHistory@--> History["Déchiffrer uniquement l'historique éligible couvert par la clé restaurée"]
  deriveBackupKey@{ animation: slow }
  encryptPrivateKey@{ animation: slow }
  createBackup@{ animation: slow }
  protectBackup@{ animation: slow }
  importBackup@{ animation: slow }
  restoreLocally@{ animation: slow }
  verifyPublicKey@{ animation: slow }
  authorizeDevice@{ animation: slow }
  decryptHistory@{ animation: slow }`,
            },
          },
        },
        {
          id: 'recovery-password',
          title: t(
            'Recovery password responsibility',
            'Responsabilité du mot de passe de récupération',
          ),
          body: [
            t(
              'The chat recovery password is separate from the account password, MFA, and password-reset process. Administrators cannot retrieve it. If the browser keys, usable backup, or recovery password needed for historical messages are all lost, PE Community cannot decrypt that history for the user.',
              'Le mot de passe de récupération du chat est distinct du mot de passe du compte, de la MFA et de la réinitialisation. Les administrateurs ne peuvent pas le récupérer. Si les clés du navigateur, la sauvegarde utilisable ou le mot de passe nécessaire sont perdus, PE Community ne peut pas déchiffrer cet historique.',
            ),
          ],
          callout: {
            variant: 'security',
            title: t('Loss can be permanent', 'La perte peut être définitive'),
            body: t(
              'Server backups contain ciphertext and public key metadata, not participant private keys or recovery passwords.',
              'Les sauvegardes serveur contiennent le texte chiffré et les métadonnées de clés publiques, pas les clés privées ni mots de passe de récupération des participants.',
            ),
          },
        },
        {
          id: 'restore',
          title: t(
            'Restore on a new browser or device',
            'Restaurer sur un nouveau navigateur ou appareil',
          ),
          body: [
            t(
              'When Chat detects an existing server identity without the matching local private key, it presents Restore encrypted chat. Choose the backup file, enter its recovery password, import it, and authorize the restored browser as a device. Decryption of the file and reconstruction of its public key happen locally; the service verifies that the public key matches a retained, non-revoked key version.',
              'Lorsque le Chat détecte une identité serveur sans clé privée locale correspondante, il présente Restaurer le chat chiffré. Choisissez le fichier, entrez son mot de passe, importez-le et autorisez le navigateur restauré comme appareil. Le déchiffrement et la reconstruction de la clé publique ont lieu localement ; le service vérifie la correspondance avec une version conservée et non révoquée.',
            ),
          ],
          bullets: [
            t(
              'Restore does not add the user to conversations they do not belong to.',
              'La restauration n’ajoute pas l’utilisateur aux conversations auxquelles il n’appartient pas.',
            ),
            t(
              'Restore cannot recover key versions absent from the backup and local history.',
              'Elle ne récupère pas les versions absentes de la sauvegarde et de l’historique local.',
            ),
            t(
              'A backup for a revoked key is rejected.',
              'Une sauvegarde d’une clé révoquée est rejetée.',
            ),
          ],
        },
        {
          id: 'device-management',
          title: t(
            'Device management and revocation',
            'Gestion et révocation des appareils',
          ),
          body: [
            t(
              'Members can list, rename, and revoke their own authorized devices. Authorized operators can inspect and revoke community devices without gaining decryption access. The default active-device limit is three and can be configured from one to eight; lowering it does not revoke devices automatically.',
              'Les membres peuvent lister, renommer et révoquer leurs appareils. Les opérateurs autorisés peuvent inspecter et révoquer les appareils communautaires sans obtenir l’accès au déchiffrement. La limite par défaut est trois, configurable de un à huit ; la réduire ne révoque rien automatiquement.',
            ),
          ],
          mermaid: {
            title: t(
              'Device access lifecycle',
              'Cycle d’accès d’un appareil',
            ),
            description: t(
              'A browser generates or restores key material locally, registers only its public identity and device record, and remains eligible until that device is revoked.',
              'Un navigateur génère ou restaure les clés localement, enregistre uniquement son identité publique et sa fiche appareil, puis reste éligible jusqu’à la révocation de cet appareil.',
            ),
            unavailableLabel: t(
              'Diagram unavailable.',
              'Diagramme indisponible.',
            ),
            sources: {
              en: `stateDiagram-v2
  accTitle: Device access lifecycle
  accDescr: A browser generates or imports private key material locally, registers its public key and device metadata, and becomes an active authorized device. The member or an authorized operator can revoke the device record, which blocks future key eligibility but does not erase material already copied to the endpoint.
  [*] --> LocalKey: Generate or restore locally
  state "Local private key available" as LocalKey
  state "Authorized active device" as Active
  state "Revoked device record" as Revoked
  LocalKey --> Active: Register public key and device metadata
  Active --> Active: Use participant-scoped chat
  Active --> Revoked: Member or authorized operator revokes
  Revoked --> [*]: Future device key eligibility blocked
  note right of Revoked
    Revocation is not remote erasure
  end note`,
              fr: `stateDiagram-v2
  accTitle: Cycle d'accès d'un appareil
  accDescr: Un navigateur génère ou importe localement la clé privée, enregistre sa clé publique et ses métadonnées d'appareil, puis devient un appareil actif autorisé. Le membre ou un opérateur autorisé peut révoquer la fiche, ce qui bloque l'éligibilité future sans effacer les éléments déjà copiés sur l'appareil.
  [*] --> LocalKey: Générer ou restaurer localement
  state "Clé privée locale disponible" as LocalKey
  state "Appareil actif autorisé" as Active
  state "Fiche appareil révoquée" as Revoked
  LocalKey --> Active: Enregistrer clé publique et métadonnées
  Active --> Active: Utiliser le chat limité aux participants
  Active --> Revoked: Révocation par membre ou opérateur autorisé
  Revoked --> [*]: Éligibilité future de l'appareil bloquée
  note right of Revoked
    La révocation n'est pas un effacement distant
  end note`,
            },
          },
          callout: {
            variant: 'warning',
            title: t(
              'Revocation is not remote erasure',
              'La révocation n’est pas un effacement distant',
            ),
            body: t(
              'Revocation blocks future key eligibility and participant requests for that device record. It cannot erase plaintext, screenshots, downloads, or private key material already copied from an endpoint, and current sessions are not fully bound to individual chat devices.',
              'La révocation bloque l’éligibilité future de la clé et les requêtes liées à cet appareil. Elle ne peut effacer le texte clair, captures, téléchargements ou clés déjà copiés, et les sessions ne sont pas entièrement liées à chaque appareil de chat.',
            ),
          },
        },
        {
          id: 'conversation-types',
          title: t(
            'Direct and group conversations',
            'Conversations directes et de groupe',
          ),
          body: [
            t(
              'Direct chat is between two active community members and respects participant blocking. Group chat has a title, one owner, and at least two selected members in addition to the creator. The owner can rename the group, add active members, remove non-owners, and transfer ownership; non-owners can leave, while an owner must transfer ownership first.',
              'Le chat direct relie deux membres actifs et respecte le blocage entre participants. Un groupe possède un titre, un propriétaire et au moins deux membres sélectionnés en plus du créateur. Le propriétaire peut renommer, ajouter des membres actifs, retirer des non-propriétaires et transférer la propriété ; les autres peuvent quitter, mais le propriétaire doit d’abord transférer.',
            ),
          ],
        },
        {
          id: 'participant-changes',
          title: t(
            'Participant changes and key distribution',
            'Changements de participants et distribution des clés',
          ),
          body: [
            t(
              'Each new group message is encrypted for the active participant set at send time. Adding a participant lets that member receive future envelopes but does not re-encrypt old messages for them. Leaving or removal ends future conversation, key, attachment, message, and realtime access. Membership changes do not automatically rotate every participant key, and chat does not provide forward secrecy.',
              'Chaque nouveau message de groupe est chiffré pour les participants actifs au moment de l’envoi. Ajouter un participant lui permet de recevoir les futures enveloppes sans rechiffrer l’historique. Quitter ou être retiré met fin aux futurs accès à la conversation, aux clés, pièces jointes, messages et temps réel. Les changements de participants ne font pas tourner automatiquement toutes les clés et le chat n’offre pas de confidentialité persistante.',
            ),
          ],
          callout: {
            variant: 'note',
            title: t(
              'Previously received content remains a recipient risk',
              'Le contenu déjà reçu reste un risque destinataire',
            ),
            body: t(
              'Removing a participant cannot recall plaintext or files they already decrypted, copied, downloaded, or captured.',
              'Retirer un participant ne peut pas rappeler le texte ou les fichiers qu’il a déjà déchiffrés, copiés, téléchargés ou capturés.',
            ),
          },
        },
        {
          id: 'message-features',
          title: t(
            'Message and conversation features',
            'Fonctions de message et de conversation',
          ),
          bullets: [
            t(
              'Realtime text, typing, presence, delivery/read state, unread counts, replies, and local decrypted search.',
              'Texte temps réel, saisie, présence, livraison/lecture, non-lus, réponses et recherche locale déchiffrée.',
            ),
            t(
              'Editing and delete-for-everyone for the sender within 15 minutes; delete-for-me at any visible message.',
              'Modification et suppression pour tous par l’expéditeur sous 15 minutes ; suppression pour soi sur tout message visible.',
            ),
            t(
              'Six allowed reactions with one reaction per user per message, plus private per-user starred messages.',
              'Six réactions autorisées avec une réaction par utilisateur et message, plus des favoris privés par utilisateur.',
            ),
            t(
              'Per-user clear chat and delete conversation; neither changes the other participant’s view.',
              'Effacement du chat et suppression de conversation par utilisateur ; aucune n’affecte la vue de l’autre participant.',
            ),
            t(
              'Mute settings, pinned conversation organization in the browser, direct-user blocking, and participant-authored message reporting.',
              'Sourdine, organisation des conversations épinglées dans le navigateur, blocage direct et signalement de messages par les participants.',
            ),
          ],
        },
        {
          id: 'attachments',
          title: t(
            'Encrypted attachments and media',
            'Pièces jointes et médias chiffrés',
          ),
          body: [
            t(
              'The browser accepts current image, video, PDF, text, SVG, Word, and Excel types and rejects unsupported or plaintext files over 8 MiB before encryption. It encrypts the bytes before upload. Filename, MIME type, original size, file key, and file nonce travel inside the encrypted message payload; the service stores the encrypted blob and operational metadata only. The server-side encrypted-object limit defaults to 10 MiB and a community media quota may also apply.',
              'Le navigateur accepte les types image, vidéo, PDF, texte, SVG, Word et Excel actuels et refuse les types non pris en charge ou fichiers en clair de plus de 8 Mio avant chiffrement. Il chiffre les octets avant l’envoi. Nom, type MIME, taille originale, clé et nonce voyagent dans le message chiffré ; le service ne stocke que le blob chiffré et les métadonnées opérationnelles. La limite serveur de l’objet chiffré vaut 10 Mio par défaut et un quota communautaire peut aussi s’appliquer.',
            ),
          ],
          bullets: [
            t(
              'Downloads require current conversation participation; decryption and previews happen locally.',
              'Les téléchargements exigent la participation actuelle ; déchiffrement et aperçus ont lieu localement.',
            ),
            t(
              'No server-side plaintext thumbnail, preview, text extraction, filename, or MIME index is generated.',
              'Aucune miniature, aperçu, extraction de texte, nom ou index MIME en clair n’est généré côté serveur.',
            ),
            t(
              'Normal media can be opened and downloaded after local decryption. Direct-chat view-once images use a server-recorded one-time recipient open and do not expose download; group view-once media is not supported.',
              'Les médias normaux peuvent être ouverts et téléchargés après déchiffrement local. Les images à ouverture unique en direct utilisent une ouverture destinataire enregistrée par le serveur sans téléchargement ; ce mode n’est pas pris en charge en groupe.',
            ),
          ],
        },
        {
          id: 'storage-governance',
          title: t(
            'Encrypted-media governance',
            'Gouvernance des médias chiffrés',
          ),
          body: [
            t(
              'Authorized operators can view encrypted-byte totals, category usage, lifecycle state, uploader, conversation identifiers, and deletion operations. They can request asynchronous encrypted-object deletion and reconciliation without seeing plaintext. Deleting an encrypted object does not necessarily delete its surrounding message or conversation.',
              'Les opérateurs autorisés peuvent voir totaux d’octets chiffrés, catégories, cycles de vie, auteur, identifiants de conversation et opérations de suppression. Ils peuvent demander la suppression asynchrone et la réconciliation sans voir le texte clair. Supprimer un objet chiffré ne supprime pas nécessairement son message ou sa conversation.',
            ),
          ],
        },
        {
          id: 'threat-boundary',
          title: t(
            'What E2EE does not protect against',
            'Ce que l’E2EE ne protège pas',
          ),
          bullets: [
            t(
              'A compromised browser, operating system, extension, or device that can access decrypted content or local keys.',
              'Un navigateur, système, extension ou appareil compromis pouvant accéder au contenu ou aux clés locales.',
            ),
            t(
              'A recipient copying, forwarding, photographing, or screenshotting content.',
              'Un destinataire qui copie, transfère, photographie ou capture le contenu.',
            ),
            t(
              'Exported decrypted files, weakly protected backups, or storing the backup beside its recovery password.',
              'Des fichiers déchiffrés exportés, sauvegardes mal protégées ou stockées avec leur mot de passe.',
            ),
            t(
              'Service-visible metadata such as participants, timestamps, sizes, reactions, device registration, presence, and delivery state.',
              'Les métadonnées visibles comme participants, dates, tailles, réactions, appareils, présence et livraison.',
            ),
            t(
              'Loss of private keys or recovery material, lack of forward secrecy, and content already decrypted before revocation or participant removal.',
              'La perte des clés ou moyens de récupération, l’absence de confidentialité persistante et le contenu déjà déchiffré avant révocation ou retrait.',
            ),
          ],
        },
        {
          id: 'safe-practices',
          title: t('Safe user practices', 'Bonnes pratiques'),
          bullets: [
            t(
              'Create and verify a key backup before changing or clearing a browser, profile, computer, or operating system.',
              'Créez et vérifiez une sauvegarde avant de changer ou effacer navigateur, profil, ordinateur ou système.',
            ),
            t(
              'Use a unique recovery password and never send the backup and password together.',
              'Utilisez un mot de passe unique et n’envoyez jamais sauvegarde et mot de passe ensemble.',
            ),
            t(
              'Keep devices, browsers, and extensions updated; avoid shared browser profiles and private browsing for persistent chat use.',
              'Maintenez appareils, navigateurs et extensions à jour ; évitez les profils partagés et la navigation privée pour un usage persistant.',
            ),
            t(
              'Review authorized devices, revoke lost devices promptly, and understand that revocation is not remote wipe.',
              'Examinez les appareils autorisés, révoquez rapidement les appareils perdus et comprenez que ce n’est pas un effacement distant.',
            ),
            t(
              'Treat every recipient as able to retain plaintext after decryption.',
              'Considérez que chaque destinataire peut conserver le texte clair après déchiffrement.',
            ),
          ],
        },
      ],
    },
    security: {
      title: t('Security', 'Sécurité'),
      eyebrow: t('Platform', 'Plateforme'),
      href: '/docs/security',
      description: t(
        'Platform-wide authentication, session, authorization, registration, audit, and operator security responsibilities.',
        'Responsabilités globales d’authentification, session, autorisation, inscription, audit et exploitation.',
      ),
      cards: [
        {
          title: t('Encrypted chat', 'Chat chiffré'),
          body: t(
            'Read the complete participant key, recovery, device, and threat model.',
            'Lire le modèle complet de clés, récupération, appareils et menaces.',
          ),
          href: '/docs/encrypted-chat',
        },
        {
          title: t('Roles and permissions', 'Rôles et permissions'),
          body: t(
            'Understand delegated server-side authorization.',
            'Comprendre l’autorisation déléguée côté serveur.',
          ),
          href: '/docs/roles-and-permissions',
        },
        {
          title: t('Audit logs', 'Journaux d’audit'),
          body: t(
            'Review security and operational actions.',
            'Examiner les actions de sécurité et opérationnelles.',
          ),
          href: '/docs/audit-logs',
        },
        {
          title: t('Registrations', 'Inscriptions'),
          body: t(
            'Understand protected public onboarding.',
            'Comprendre l’intégration publique protégée.',
          ),
          href: '/docs/registrations',
        },
      ],
      sections: [
        {
          id: 'authentication',
          title: t(
            'Passwords and authentication',
            'Mots de passe et authentification',
          ),
          body: [
            t(
              'New passwords use Argon2id with explicit memory, time, parallelism, and output settings, a unique library-generated salt, and a required server-side pepper kept outside the database. Recognized legacy bcrypt hashes can be verified and upgraded after successful authentication. Password-reset tokens are time-limited, one-time, and stored only as hashes.',
              'Les nouveaux mots de passe utilisent Argon2id avec des paramètres explicites de mémoire, temps, parallélisme et sortie, un sel unique généré par la bibliothèque et un pepper serveur obligatoire hors base. Les empreintes bcrypt reconnues peuvent être vérifiées puis mises à niveau après authentification réussie. Les jetons de réinitialisation sont temporaires, à usage unique et stockés uniquement sous forme d’empreinte.',
            ),
          ],
        },
        {
          id: 'mfa',
          title: t(
            'Multi-factor authentication',
            'Authentification multifacteur',
          ),
          body: [
            t(
              'When enabled for the community and account, sign-in requires a time-based authenticator code after password verification. One-time backup codes are stored as hashes and consumed once. Disabling MFA or regenerating backup codes requires current security confirmation.',
              'Lorsqu’elle est activée pour la communauté et le compte, la connexion exige un code d’authentificateur temporel après vérification du mot de passe. Les codes de secours sont stockés sous forme d’empreinte et consommés une fois. Désactiver la MFA ou régénérer les codes exige une confirmation de sécurité actuelle.',
            ),
          ],
        },
        {
          id: 'sessions',
          title: t('Sessions', 'Sessions'),
          body: [
            t(
              'Sessions use an HttpOnly, SameSite=Lax cookie and secure transport in production. The service stores a hash of the session token, applies both idle and absolute expiration, and invalidates sessions on logout and supported sensitive account changes such as password reset.',
              'Les sessions utilisent un cookie HttpOnly, SameSite=Lax et un transport sécurisé en production. Le service stocke une empreinte du jeton, applique une expiration d’inactivité et absolue, et invalide les sessions lors de la déconnexion et de changements sensibles pris en charge comme la réinitialisation du mot de passe.',
            ),
          ],
        },
        {
          id: 'authorization',
          title: t('Authorization and isolation', 'Autorisation et isolation'),
          body: [
            t(
              'An active membership establishes community scope. Roles collect permissions, while every protected server action validates the required permission and target community. Member and administrative workspaces are separated, private member fields require additional authority, and encrypted-chat content remains participant-scoped.',
              'Une adhésion active établit la communauté. Les rôles regroupent les permissions, tandis que chaque action protégée valide la permission et la communauté cible. Les espaces membre et administratif sont séparés, les champs privés exigent une autorité supplémentaire et le chat reste limité aux participants.',
            ),
          ],
        },
        {
          id: 'registration-and-audit',
          title: t(
            'Registration protection and audit',
            'Protection des inscriptions et audit',
          ),
          body: [
            t(
              'Public registration uses neutral responses, rate limits, optional CAPTCHA verification, protected invitation links, duplicate-safe application handling, cooldown-controlled email notices, and audited decisions. Audit metadata is sanitized to exclude common secret fields and is stored in the application database rather than an immutable external log.',
              'L’inscription publique utilise réponses neutres, limites de fréquence, CAPTCHA facultatif, liens protégés, gestion sûre des doublons, emails soumis à délai et décisions auditées. Les métadonnées d’audit excluent les champs secrets courants et sont stockées dans la base de l’application plutôt que dans un journal externe immuable.',
            ),
          ],
        },
        {
          id: 'encrypted-chat-summary',
          title: t('Encrypted-chat boundary', 'Frontière du chat chiffré'),
          body: [
            t(
              'Chat message and attachment content is encrypted in participant browsers, while the service retains ciphertext and necessary metadata. Private keys and recovery passwords are user-held. This does not remove endpoint, recipient, metadata, key-loss, or recovery risks. The Encrypted chat guide is the authoritative user guide for backup, restore, devices, revocation, attachments, participant changes, and E2EE limitations.',
              'Le contenu des messages et pièces jointes est chiffré dans les navigateurs participants, tandis que le service conserve texte chiffré et métadonnées nécessaires. Clés privées et mots de passe de récupération restent détenus par l’utilisateur. Cela ne supprime pas les risques d’appareil, destinataire, métadonnées, perte de clé ou récupération. Le guide Chat chiffré fait autorité pour sauvegarde, restauration, appareils, révocation, pièces jointes, participants et limites E2EE.',
            ),
          ],
        },
        {
          id: 'operator-responsibilities',
          title: t(
            'Operator responsibilities',
            'Responsabilités de l’opérateur',
          ),
          bullets: [
            t(
              'Protect first-run initialization before public exposure and use strong, unique setup, session, password-pepper, database, email, and encryption secrets.',
              'Protégez l’initialisation avant exposition publique et utilisez des secrets forts et uniques pour configuration, sessions, pepper, base, email et chiffrement.',
            ),
            t(
              'Use HTTPS, a correct public origin, secure cookies, least-privilege roles, current software, and restricted administrative access.',
              'Utilisez HTTPS, une origine correcte, des cookies sécurisés, des rôles minimaux, des logiciels à jour et un accès administratif restreint.',
            ),
            t(
              'Back up the database, uploaded files, and configuration securely, and test restoration. Server backups do not replace each member’s encrypted-chat key backup.',
              'Sauvegardez sûrement base, fichiers et configuration, puis testez la restauration. Les sauvegardes serveur ne remplacent pas la sauvegarde de clés de chaque membre.',
            ),
            t(
              'Review audit and delivery failures, rotate compromised secrets through supported procedures, and never print credentials, cookies, tokens, private keys, or recovery material.',
              'Examinez audit et échecs de livraison, faites tourner les secrets compromis selon les procédures prises en charge et n’imprimez jamais identifiants, cookies, jetons, clés privées ou moyens de récupération.',
            ),
          ],
        },
      ],
    },
  };
}

export const featureDocsPagesEn = platformPages('en');
export const featureDocsPagesFr = platformPages('fr');
