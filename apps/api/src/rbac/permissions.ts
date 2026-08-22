export const PERMISSIONS = {
  membersRead: 'members.read',
  membersCreate: 'members.create',
  membersUpdate: 'members.update',
  membersSuspend: 'members.suspend',
  membersDelete: 'members.delete',
  membersViewPrivateFields: 'members.viewPrivateFields',
  registrationsRead: 'registrations.read',
  registrationsApprove: 'registrations.approve',
  registrationsReject: 'registrations.reject',
  announcementsRead: 'announcements.read',
  announcementsCreate: 'announcements.create',
  announcementsPublish: 'announcements.publish',
  announcementsArchive: 'announcements.archive',
  announcementsDelete: 'announcements.delete',
  eventsRead: 'events.read',
  eventsCreate: 'events.create',
  eventsUpdate: 'events.update',
  eventsDelete: 'events.delete',
  eventsEmailAttendees: 'events.emailAttendees',
  emailRead: 'email.read',
  emailSend: 'email.send',
  emailRetry: 'email.retry',
  emailCancel: 'email.cancel',
  emailExport: 'email.export',
  settingsGeneralManage: 'settings.general.manage',
  settingsSecurityManage: 'settings.security.manage',
  settingsSmtpManage: 'settings.smtp.manage',
  settingsRemindersManage: 'settings.reminders.manage',
  settingsTemplatesManage: 'settings.templates.manage',
  settingsNotificationsManage: 'settings.notifications.manage',
  rolesRead: 'roles.read',
  rolesManage: 'roles.manage',
  auditLogsRead: 'auditLogs.read',
  passportExpirationReadAdmin: 'passportExpiration.readAdmin',
  passportExpirationUpdateAdmin: 'passportExpiration.updateAdmin',
  notificationsAdminRead: 'notifications.admin.read',
  notificationsAdminManage: 'notifications.admin.manage',
  chatView: 'chat.view',
  chatDirectCreate: 'chat.direct.create',
  chatDirectSend: 'chat.direct.send',
  chatPresenceView: 'chat.presence.view',
  chatDevicesView: 'chat.devices.view',
  chatDevicesRevoke: 'chat.devices.revoke',
  chatDeviceLimitManage: 'chat.deviceLimit.manage',
  chatStorageView: 'chat.storage.view',
  chatStorageManage: 'chat.storage.manage',
  chatMediaDelete: 'chat.media.delete',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type SystemRole = 'owner' | 'admin' | 'member';

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLE_HIERARCHY: Record<SystemRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export const ADMIN_PERMISSIONS = [
  PERMISSIONS.membersRead,
  PERMISSIONS.membersCreate,
  PERMISSIONS.membersUpdate,
  PERMISSIONS.membersSuspend,
  PERMISSIONS.membersViewPrivateFields,
  PERMISSIONS.registrationsRead,
  PERMISSIONS.registrationsApprove,
  PERMISSIONS.registrationsReject,
  PERMISSIONS.announcementsRead,
  PERMISSIONS.announcementsCreate,
  PERMISSIONS.announcementsPublish,
  PERMISSIONS.announcementsArchive,
  PERMISSIONS.announcementsDelete,
  PERMISSIONS.eventsRead,
  PERMISSIONS.eventsCreate,
  PERMISSIONS.eventsUpdate,
  PERMISSIONS.eventsDelete,
  PERMISSIONS.eventsEmailAttendees,
  PERMISSIONS.emailRead,
  PERMISSIONS.emailSend,
  PERMISSIONS.emailRetry,
  PERMISSIONS.emailCancel,
  PERMISSIONS.emailExport,
  PERMISSIONS.settingsGeneralManage,
  PERMISSIONS.settingsRemindersManage,
  PERMISSIONS.settingsTemplatesManage,
  PERMISSIONS.settingsNotificationsManage,
  PERMISSIONS.auditLogsRead,
  PERMISSIONS.passportExpirationReadAdmin,
  PERMISSIONS.passportExpirationUpdateAdmin,
  PERMISSIONS.notificationsAdminRead,
  PERMISSIONS.notificationsAdminManage,
  PERMISSIONS.chatView,
  PERMISSIONS.chatDirectCreate,
  PERMISSIONS.chatDirectSend,
  PERMISSIONS.chatPresenceView,
  PERMISSIONS.chatDevicesView,
  PERMISSIONS.chatDevicesRevoke,
  PERMISSIONS.chatStorageView,
  PERMISSIONS.rolesRead,
] as const satisfies readonly Permission[];

export const MEMBER_PERMISSIONS = [
  PERMISSIONS.chatView,
  PERMISSIONS.chatDirectCreate,
  PERMISSIONS.chatDirectSend,
  PERMISSIONS.chatPresenceView,
] as const satisfies readonly Permission[];

export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  member: MEMBER_PERMISSIONS,
};

export const PERMISSION_GROUPS = [
  { key: 'members', permissions: [PERMISSIONS.membersRead, PERMISSIONS.membersCreate, PERMISSIONS.membersUpdate, PERMISSIONS.membersSuspend, PERMISSIONS.membersDelete] },
  { key: 'registrations', permissions: [PERMISSIONS.registrationsRead, PERMISSIONS.registrationsApprove, PERMISSIONS.registrationsReject] },
  { key: 'announcements', permissions: [PERMISSIONS.announcementsRead, PERMISSIONS.announcementsCreate, PERMISSIONS.announcementsPublish, PERMISSIONS.announcementsArchive, PERMISSIONS.announcementsDelete] },
  { key: 'events', permissions: [PERMISSIONS.eventsRead, PERMISSIONS.eventsCreate, PERMISSIONS.eventsUpdate, PERMISSIONS.eventsDelete, PERMISSIONS.eventsEmailAttendees] },
  { key: 'email', permissions: [PERMISSIONS.emailRead, PERMISSIONS.emailSend, PERMISSIONS.emailRetry, PERMISSIONS.emailCancel, PERMISSIONS.emailExport] },
  { key: 'settings', permissions: [PERMISSIONS.settingsGeneralManage, PERMISSIONS.settingsSecurityManage, PERMISSIONS.settingsSmtpManage, PERMISSIONS.settingsRemindersManage, PERMISSIONS.settingsTemplatesManage, PERMISSIONS.settingsNotificationsManage] },
  { key: 'roles', permissions: [PERMISSIONS.rolesRead, PERMISSIONS.rolesManage] },
  { key: 'auditLogs', permissions: [PERMISSIONS.auditLogsRead] },
  { key: 'privateFields', permissions: [PERMISSIONS.membersViewPrivateFields, PERMISSIONS.passportExpirationReadAdmin, PERMISSIONS.passportExpirationUpdateAdmin] },
  { key: 'adminNotifications', permissions: [PERMISSIONS.notificationsAdminRead, PERMISSIONS.notificationsAdminManage] },
  { key: 'chat', permissions: [PERMISSIONS.chatView, PERMISSIONS.chatDirectCreate, PERMISSIONS.chatDirectSend, PERMISSIONS.chatPresenceView, PERMISSIONS.chatDevicesView, PERMISSIONS.chatDevicesRevoke, PERMISSIONS.chatDeviceLimitManage, PERMISSIONS.chatStorageView, PERMISSIONS.chatStorageManage, PERMISSIONS.chatMediaDelete] },
] as const;

export function normalizeSystemRole(role?: string | null): SystemRole {
  return role === 'owner' || role === 'admin' || role === 'member' ? role : 'member';
}

export function getSystemRolePermissions(role?: string | null): Permission[] {
  return [...SYSTEM_ROLE_PERMISSIONS[normalizeSystemRole(role)]];
}
