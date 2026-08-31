import { PrismaClient } from '@prisma/client';
import { ADMIN_PERMISSIONS, ALL_PERMISSIONS, MEMBER_PERMISSIONS } from '@pe/shared';
import { loadPasswordConfig, PasswordService } from '../apps/api/src/security/password.service';
import { ensureCommunityMessageTemplates } from '../apps/api/src/message-templates';

const prisma = new PrismaClient();
const passwords = new PasswordService(loadPasswordConfig());

const seedAutomationNotificationTemplates = [
  {
    key: 'TASK_BOARD_AUTOMATION_DUE_BEFORE',
    name: 'Task due soon',
    description: 'Used for due-soon reminder automation.',
    subjectEn: 'Task reminder: {{taskTitle}}',
    subjectFr: 'Rappel de tâche : {{taskTitle}}',
    inAppTitleEn: 'Task due soon',
    inAppTitleFr: 'Tâche bientôt due',
    inAppBodyEn: '{{taskTitle}} is due on {{taskDueDate}}.',
    inAppBodyFr: '{{taskTitle}} est prévue le {{taskDueDate}}.',
    emailTitleEn: 'Task due soon',
    emailTitleFr: 'Tâche bientôt due',
    emailBodyEn: '{{taskTitle}} is due on {{taskDueDate}}.\nBoard: {{boardName}}\nRule: {{ruleName}}',
    emailBodyFr: '{{taskTitle}} est prévue le {{taskDueDate}}.\nTableau : {{boardName}}\nRègle : {{ruleName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: 'TASK_BOARD_AUTOMATION_OVERDUE',
    name: 'Task overdue',
    description: 'Used for overdue task automation.',
    subjectEn: 'Overdue task: {{taskTitle}}',
    subjectFr: 'Tâche en retard : {{taskTitle}}',
    inAppTitleEn: 'Task overdue',
    inAppTitleFr: 'Tâche en retard',
    inAppBodyEn: '{{taskTitle}} is overdue.',
    inAppBodyFr: '{{taskTitle}} est en retard.',
    emailTitleEn: 'Task overdue',
    emailTitleFr: 'Tâche en retard',
    emailBodyEn: '{{taskTitle}} is overdue.\nBoard: {{boardName}}\nRule: {{ruleName}}',
    emailBodyFr: '{{taskTitle}} est en retard.\nTableau : {{boardName}}\nRègle : {{ruleName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: 'TASK_BOARD_AUTOMATION_TEST',
    name: 'Test automation notification',
    description: 'Used for admin-only automation notification tests.',
    subjectEn: 'Test automation email',
    subjectFr: 'E-mail de test d’automatisation',
    inAppTitleEn: 'Test automation notification',
    inAppTitleFr: 'Notification de test d’automatisation',
    inAppBodyEn: 'This is a test for "{{ruleName}}" on "{{boardName}}".',
    inAppBodyFr: 'Ceci est un test pour « {{ruleName}} » sur « {{boardName}} ».',
    emailTitleEn: 'Test automation notification',
    emailTitleFr: 'Notification de test d’automatisation',
    emailBodyEn: 'This is a test email for "{{ruleName}}" on "{{boardName}}".',
    emailBodyFr: 'Ceci est un e-mail de test pour « {{ruleName}} » sur « {{boardName}} ».',
    buttonLabelEn: 'Open automation',
    buttonLabelFr: 'Ouvrir l’automatisation',
  },
  {
    key: 'TASK_BOARD_AUTOMATION_AUTO_COMPLETE',
    name: 'Task auto-completed',
    description: 'Available for automation that moves a task to Done.',
    subjectEn: 'Task completed: {{taskTitle}}',
    subjectFr: 'Tâche terminée : {{taskTitle}}',
    inAppTitleEn: 'Task completed',
    inAppTitleFr: 'Tâche terminée',
    inAppBodyEn: '{{taskTitle}} was moved to Done by {{ruleName}}.',
    inAppBodyFr: '{{taskTitle}} a été déplacée vers Terminé par {{ruleName}}.',
    emailTitleEn: 'Task completed',
    emailTitleFr: 'Tâche terminée',
    emailBodyEn: '{{taskTitle}} was moved to Done.\nBoard: {{boardName}}\nRule: {{ruleName}}',
    emailBodyFr: '{{taskTitle}} a été déplacée vers Terminé.\nTableau : {{boardName}}\nRègle : {{ruleName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: 'TASK_BOARD_AUTOMATION_FLAG_UNASSIGNED',
    name: 'Unassigned task flagged',
    description: 'Available for automation that flags unassigned tasks.',
    subjectEn: 'Unassigned task: {{taskTitle}}',
    subjectFr: 'Tâche non assignée : {{taskTitle}}',
    inAppTitleEn: 'Unassigned task',
    inAppTitleFr: 'Tâche non assignée',
    inAppBodyEn: '{{taskTitle}} has no assignee.',
    inAppBodyFr: '{{taskTitle}} n’a pas d’assigné.',
    emailTitleEn: 'Unassigned task',
    emailTitleFr: 'Tâche non assignée',
    emailBodyEn: '{{taskTitle}} has no assignee.\nBoard: {{boardName}}\nRule: {{ruleName}}',
    emailBodyFr: '{{taskTitle}} n’a pas d’assigné.\nTableau : {{boardName}}\nRègle : {{ruleName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: 'TASK_BOARD_AUTOMATION_STALE_TASK_FOLLOW_UP',
    name: 'Stale task follow-up',
    description: 'Used when an assigned task has had no recent activity.',
    subjectEn: 'Task follow-up needed: {{taskTitle}}',
    subjectFr: 'Relance nécessaire : {{taskTitle}}',
    inAppTitleEn: 'Task follow-up needed: {{taskTitle}}',
    inAppTitleFr: 'Relance nécessaire : {{taskTitle}}',
    inAppBodyEn: 'No activity for {{inactiveDays}} days.',
    inAppBodyFr: 'Aucune activité depuis {{inactiveDays}} jours.',
    emailTitleEn: 'Task follow-up needed',
    emailTitleFr: 'Relance de tâche nécessaire',
    emailBodyEn: '{{taskTitle}} has had no activity for {{inactiveDays}} days.\nLast activity: {{lastActivityAt}}\nBoard: {{boardName}}',
    emailBodyFr: '{{taskTitle}} est sans activité depuis {{inactiveDays}} jours.\nDernière activité : {{lastActivityAt}}\nTableau : {{boardName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: 'TASK_BOARD_AUTOMATION_CHECKLIST_INCOMPLETE_BEFORE_DUE',
    name: 'Checklist incomplete before due',
    description: 'Used when a task is near its due date with checklist items still open.',
    subjectEn: 'Checklist incomplete: {{taskTitle}}',
    subjectFr: 'Checklist incomplète : {{taskTitle}}',
    inAppTitleEn: 'Checklist incomplete: {{taskTitle}}',
    inAppTitleFr: 'Checklist incomplète : {{taskTitle}}',
    inAppBodyEn: 'Due in {{hoursBeforeDue}} hours with checklist items still open.',
    inAppBodyFr: 'Échéance dans {{hoursBeforeDue}} heures avec des éléments encore ouverts.',
    emailTitleEn: 'Checklist incomplete',
    emailTitleFr: 'Checklist incomplète',
    emailBodyEn: '{{taskTitle}} has {{checklistDoneCount}} of {{checklistTotalCount}} checklist items complete.\nDue: {{taskDueDate}}\nBoard: {{boardName}}',
    emailBodyFr: '{{taskTitle}} a {{checklistDoneCount}} éléments terminés sur {{checklistTotalCount}}.\nÉchéance : {{taskDueDate}}\nTableau : {{boardName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: 'TASK_BOARD_AUTOMATION_OVERDUE_ESCALATION',
    name: 'Overdue task escalation',
    description: 'Used when a task remains overdue beyond its configured grace period.',
    subjectEn: 'Overdue task escalation: {{taskTitle}}',
    subjectFr: 'Escalade de tâche en retard : {{taskTitle}}',
    inAppTitleEn: 'Overdue task escalation: {{taskTitle}}',
    inAppTitleFr: 'Escalade de retard : {{taskTitle}}',
    inAppBodyEn: 'This task is {{daysOverdue}} days overdue.',
    inAppBodyFr: 'Cette tâche a {{daysOverdue}} jours de retard.',
    emailTitleEn: 'Overdue task escalation',
    emailTitleFr: 'Escalade de tâche en retard',
    emailBodyEn: '{{taskTitle}} is {{daysOverdue}} days overdue after a {{graceDays}}-day grace period.\nDue: {{taskDueDate}}\nBoard: {{boardName}}',
    emailBodyFr: '{{taskTitle}} a {{daysOverdue}} jours de retard après une période de grâce de {{graceDays}} jours.\nÉchéance : {{taskDueDate}}\nTableau : {{boardName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
];

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: 'seed-org' },
    update: {},
    create: { id: 'seed-org', name: 'PE Community Management' },
  });

  const community = await prisma.community.upsert({
    where: { slug: 'pe-community' },
    update: {},
    create: {
      id: 'seed-community',
      name: 'PE Community',
      slug: 'pe-community',
      organizationId: organization.id,
    },
  });

  await prisma.communitySettings.upsert({
    where: { communityId: community.id },
    update: {},
    create: {
      communityId: community.id,
      defaultLanguage: 'en',
      timezone: 'UTC',
      registrationApprovalMode: 'portal_registration',
      memberDirectoryVisibility: 'members_only',
      supportContactEmail: null,
      adminInAppAlertsEnabled: true,
      emailDeliveryIssueAlertsEnabled: true,
      registrationReviewAlertsEnabled: true,
      passportExpirationAdminAlertsEnabled: true,
      reminderRunSummaryAlertsEnabled: false,
    },
  });

  await ensureCommunityMessageTemplates(prisma, community.id, community.name);

  for (const template of seedAutomationNotificationTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { communityId_key: { communityId: community.id, key: template.key as never } },
      update: {
        name: template.name,
        description: template.description,
        channelScope: { usedBy: 'AUTOMATION', channels: ['IN_APP', 'EMAIL'] },
      },
      create: {
        communityId: community.id,
        key: template.key as never,
        name: template.name,
        description: template.description,
        channelScope: { usedBy: 'AUTOMATION', channels: ['IN_APP', 'EMAIL'] },
        subjectEn: template.subjectEn,
        subjectFr: template.subjectFr,
        inAppTitleEn: template.inAppTitleEn,
        inAppTitleFr: template.inAppTitleFr,
        inAppBodyEn: template.inAppBodyEn,
        inAppBodyFr: template.inAppBodyFr,
        emailTitleEn: template.emailTitleEn,
        emailTitleFr: template.emailTitleFr,
        emailBodyEn: template.emailBodyEn,
        emailBodyFr: template.emailBodyFr,
        buttonLabelEn: template.buttonLabelEn,
        buttonLabelFr: template.buttonLabelFr,
      },
    });
  }

  const applicantEmails = ['camille.bernard@example.com', 'noah.laurent@example.com'];
  const applicantUsers = await prisma.user.findMany({
    where: { email: { in: applicantEmails } },
    select: { id: true },
  });
  const applicantUserIds = applicantUsers.map((user) => user.id);
  const applicantMemberships = await prisma.membership.findMany({
    where: { communityId: community.id, userId: { in: applicantUserIds } },
    select: { id: true },
  });
  const applicantMembershipIds = applicantMemberships.map((membership) => membership.id);
  const oldEvents = await prisma.event.findMany({ where: { communityId: community.id }, select: { id: true } });
  const oldEventIds = oldEvents.map((event) => event.id);

  await prisma.eventRsvp.deleteMany({ where: { eventId: { in: oldEventIds } } });
  await prisma.event.deleteMany({ where: { communityId: community.id } });
  await prisma.announcement.deleteMany({ where: { communityId: community.id } });
  await prisma.notification.deleteMany({ where: { communityId: community.id } });
  await prisma.auditLog.deleteMany({ where: { communityId: community.id } });
  await prisma.registrationApplication.deleteMany({ where: { communityId: community.id } });
  await prisma.memberProfile.deleteMany({ where: { membershipId: { in: applicantMembershipIds } } });
  await prisma.membership.deleteMany({ where: { id: { in: applicantMembershipIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: applicantUserIds } } });
  await prisma.user.deleteMany({ where: { email: { in: applicantEmails } } });

  const permissionLabels = new Map<string, string>([
    ['members.read', 'View members'],
    ['members.create', 'Create members'],
    ['members.update', 'Manage members'],
    ['members.suspend', 'Suspend members'],
    ['members.delete', 'Delete members'],
    ['members.viewPrivateFields', 'View private member fields'],
    ['registrations.read', 'View registrations'],
    ['registrations.approve', 'Approve registrations'],
    ['registrations.reject', 'Reject registrations'],
    ['announcements.read', 'View announcements'],
    ['announcements.create', 'Create announcements'],
    ['announcements.publish', 'Publish announcements'],
    ['announcements.archive', 'Archive announcements'],
    ['announcements.delete', 'Delete announcements'],
    ['events.read', 'View events'],
    ['events.create', 'Create events'],
    ['events.update', 'Manage events'],
    ['events.delete', 'Delete events'],
    ['events.emailAttendees', 'Email event attendees'],
    ['email.read', 'View email dashboard'],
    ['email.send', 'Send email campaigns'],
    ['email.retry', 'Retry email delivery'],
    ['email.cancel', 'Cancel email campaigns'],
    ['email.export', 'Export email data'],
    ['settings.general.manage', 'Manage general settings'],
    ['settings.security.manage', 'Manage security settings'],
    ['settings.smtp.manage', 'Manage SMTP settings'],
    ['settings.reminders.manage', 'Manage reminder settings'],
    ['settings.templates.manage', 'Manage templates'],
    ['settings.notifications.manage', 'Manage notification settings'],
    ['roles.read', 'View roles'],
    ['roles.manage', 'Manage roles'],
    ['auditLogs.read', 'View audit logs'],
    ['passportExpiration.readAdmin', 'View passport expiration dates'],
    ['passportExpiration.updateAdmin', 'Manage passport expiration dates'],
    ['notifications.admin.read', 'View admin notifications'],
    ['notifications.admin.manage', 'Manage admin notifications'],
    ['chat.view', 'View chat'],
    ['chat.direct.create', 'Create direct chat conversations'],
    ['chat.direct.send', 'Send direct chat messages'],
    ['chat.presence.view', 'View chat presence'],
    ['chat.devices.view', 'View community chat devices'],
    ['chat.devices.revoke', 'Revoke community chat devices'],
    ['chat.deviceLimit.manage', 'Manage chat device limit'],
    ['chat.storage.view', 'View chat media storage'],
    ['chat.storage.manage', 'Manage chat media storage'],
    ['chat.media.delete', 'Delete encrypted chat media'],
    ['systemUpdate.view', 'View system updates'],
    ['systemUpdate.check', 'Check for system updates'],
    ['systemUpdate.execute', 'Install system updates'],
    ['systemUpdate.history', 'View system update history'],
  ]);

  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { label: permissionLabels.get(key) ?? key },
      create: { key, label: permissionLabels.get(key) ?? key },
    });
  }

  const ownerRole = await prisma.role.upsert({
    where: { communityId_key: { communityId: community.id, key: 'owner' } },
    update: { name: 'Owner' },
    create: { communityId: community.id, key: 'owner', name: 'Owner' },
  });

  const memberRole = await prisma.role.upsert({
    where: { communityId_key: { communityId: community.id, key: 'member' } },
    update: { name: 'Member' },
    create: { communityId: community.id, key: 'member', name: 'Member' },
  });

  const adminRole = await prisma.role.upsert({
    where: { communityId_key: { communityId: community.id, key: 'admin' } },
    update: { name: 'Admin' },
    create: { communityId: community.id, key: 'admin', name: 'Admin' },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: { in: [ownerRole.id, adminRole.id, memberRole.id] } } });

  const allPermissions = await prisma.permission.findMany({ where: { key: { in: ALL_PERMISSIONS } } });
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: ownerRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: ownerRole.id, permissionId: permission.id },
    });
  }
  const adminPermissionKeys = new Set<string>(ADMIN_PERMISSIONS);
  const adminPermissions = allPermissions.filter((permission) => adminPermissionKeys.has(permission.key));
  for (const permission of adminPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    });
  }
  const memberPermissionKeys = new Set<string>(MEMBER_PERMISSIONS);
  const memberPermissions = allPermissions.filter((permission) => memberPermissionKeys.has(permission.key));
  for (const permission of memberPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: memberRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: memberRole.id, permissionId: permission.id },
    });
  }

  const passwordHash = await passwords.hash('Password123!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@pecommunity.test' },
    update: { name: 'Amara Diallo', passwordHash, emailVerifiedAt: new Date() },
    create: { email: 'admin@pecommunity.test', name: 'Amara Diallo', passwordHash, emailVerifiedAt: new Date() },
  });
  const member = await prisma.user.upsert({
    where: { email: 'member@pecommunity.test' },
    update: { name: 'Julien Martin', passwordHash, emailVerifiedAt: new Date() },
    create: { email: 'member@pecommunity.test', name: 'Julien Martin', passwordHash, emailVerifiedAt: new Date() },
  });

  for (const entry of [
    { userId: admin.id, roleId: ownerRole.id, title: 'Community owner', location: 'Montreal', interests: ['Operations', 'Onboarding'], skills: ['Community strategy', 'Member support'] },
    { userId: member.id, roleId: memberRole.id, title: 'Active member', location: 'Lyon', interests: ['Events', 'Peer learning'], skills: ['Facilitation', 'Program coordination'] },
  ]) {
    const membership = await prisma.membership.upsert({
      where: { userId_communityId: { userId: entry.userId, communityId: community.id } },
      update: { roleId: entry.roleId, status: 'ACTIVE' },
      create: { userId: entry.userId, communityId: community.id, roleId: entry.roleId, status: 'ACTIVE' },
    });
    await prisma.memberProfile.upsert({
      where: { membershipId: membership.id },
      update: { title: entry.title, location: entry.location, interests: entry.interests, skills: entry.skills, socialLinks: {} },
      create: {
        membershipId: membership.id,
        title: entry.title,
        location: entry.location,
        bio: 'Available for community coordination and events.',
        interests: entry.interests,
        skills: entry.skills,
        socialLinks: {},
      },
    });
  }

  await prisma.registrationApplication.createMany({
    data: [
      { communityId: community.id, name: 'Camille Bernard', email: 'camille.bernard@example.com', normalizedEmail: 'camille.bernard@example.com', note: 'Interested in helping with monthly professional meetups.' },
      { communityId: community.id, name: 'Noah Laurent', email: 'noah.laurent@example.com', normalizedEmail: 'noah.laurent@example.com', note: 'Referred by an existing member and wants access to events.' },
    ],
  });

  const event = await prisma.event.create({
    data: {
      communityId: community.id,
      title: 'June Member Strategy Circle',
      description: 'A focused session for active members to discuss programming, onboarding, and event priorities.',
      startsAt: new Date('2026-06-24T18:00:00.000Z'),
      location: 'Online',
      onlineUrl: 'https://meet.google.com/pe-community-circle',
      capacity: 40,
    },
  });
  await prisma.eventRsvp.upsert({
    where: { eventId_userId: { eventId: event.id, userId: member.id } },
    update: { status: 'GOING' },
    create: { eventId: event.id, userId: member.id, status: 'GOING' },
  });

  const announcement = await prisma.announcement.create({
    data: {
      communityId: community.id,
      title: 'Registration review is open for June',
      body: 'Admins can now review two pending applications and prepare onboarding for approved members.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        communityId: community.id,
        userId: member.id,
        type: 'ANNOUNCEMENT_PUBLISHED',
        title: 'New announcement published',
        body: announcement.title,
        metadata: { announcementId: announcement.id },
        dedupeKey: `ANNOUNCEMENT_PUBLISHED:${announcement.id}:${member.id}`,
      },
      {
        communityId: community.id,
        userId: member.id,
        type: 'EVENT_CREATED',
        title: 'Upcoming event reminder',
        body: `${event.title} is scheduled soon and your RSVP is confirmed.`,
        metadata: { eventId: event.id },
        dedupeKey: `EVENT_CREATED:${event.id}:${member.id}`,
      },
    ],
    skipDuplicates: true,
  });
}

main().finally(async () => prisma.$disconnect());
