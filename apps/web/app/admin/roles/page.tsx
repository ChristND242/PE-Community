'use client';

import { Check, KeyRound, Lock, Minus, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/shell';
import { Card, Spinner, StatusBadge, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { hasPermission, PERMISSIONS, Permission } from '../../../lib/permissions';
import { userRoleLabel } from '../../../lib/user-role';

type RoleKey = 'owner' | 'admin' | 'member';

type RoleSummary = {
  key: RoleKey;
  permissions: Permission[];
  userCount: number;
  system: boolean;
  protected: boolean;
};

type PermissionGroup = {
  key: keyof ReturnType<typeof useI18n>['t']['admin']['permissionGroups'];
  permissions: Permission[];
};

type RolesResponse = {
  roles: RoleSummary[];
  permissionGroups: PermissionGroup[];
  permissions: Permission[];
};
type CurrentUser = {
  role?: string | null;
  permissions?: string[] | null;
};
type DraftPermissions = Record<RoleKey, Permission[]>;

export default function AdminRolesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<RolesResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<DraftPermissions | null>(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  async function load() {
    setError('');
    try {
      setData(await apiFetch<RolesResponse>(`/admin/${COMMUNITY_ID}/roles`));
    } catch {
      setError(t.admin.rolesLoadFailed);
    }
  }

  useEffect(() => { load(); }, [t.admin.rolesLoadFailed]);
  useEffect(() => {
    apiFetch<CurrentUser>('/auth/me').then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);
  useEffect(() => {
    if (!data) {
      setDraftPermissions(null);
      return;
    }
    setDraftPermissions(rolePermissionDraft(data.roles));
    setSaveState('idle');
  }, [data]);

  const rolesByKey = useMemo(() => new Map(data?.roles.map((role) => [role.key, role]) ?? []), [data]);
  const roleOrder: RoleKey[] = ['owner', 'admin', 'member'];
  const originalPermissions = useMemo(() => data ? rolePermissionDraft(data.roles) : null, [data]);
  const canEditPermissions = currentUser?.role === 'owner' && hasPermission(currentUser, PERMISSIONS.rolesManage);
  const dirty = Boolean(originalPermissions && draftPermissions && !permissionsDraftEqual(originalPermissions, draftPermissions));

  function togglePermission(roleKey: RoleKey, permission: Permission) {
    if (!draftPermissions || roleKey === 'owner') return;
    setSaveState('idle');
    setDraftPermissions((current) => {
      if (!current) return current;
      const currentPermissions = new Set(current[roleKey]);
      if (currentPermissions.has(permission)) currentPermissions.delete(permission);
      else currentPermissions.add(permission);
      return { ...current, [roleKey]: Array.from(currentPermissions).sort() as Permission[] };
    });
  }

  function resetDraft() {
    if (!originalPermissions) return;
    setDraftPermissions(cloneDraft(originalPermissions));
    setSaveState('idle');
  }

  async function savePermissions() {
    if (!draftPermissions || !dirty || saveState === 'saving') return;
    setSaveState('saving');
    try {
      const updated = await apiFetch<RolesResponse>(`/admin/${COMMUNITY_ID}/roles/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({
          roles: (['admin', 'member'] as const).map((roleKey) => ({ roleKey, permissionKeys: draftPermissions[roleKey] })),
        }),
      });
      setData(updated);
      setSaveState('success');
    } catch {
      setSaveState('error');
    }
  }

  return (
    <AppShell admin>
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent/90">{t.admin.governance}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.admin.rolesTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.rolesSubtitle}</p>
        </header>

        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        ) : !data ? (
          <TableSkeleton rows={8} columns={4} />
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              {roleOrder.map((roleKey) => {
                const role = rolesByKey.get(roleKey);
                return (
                  <Card key={roleKey} className="rounded-2xl border-white/10 bg-white/[0.035] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-xl border border-accent/20 bg-accent/10 p-2 text-accent"><ShieldCheck size={18} /></span>
                      <StatusBadge tone={role?.protected ? 'warn' : 'neutral'}>{role?.protected ? t.admin.protectedRole : t.admin.systemRole}</StatusBadge>
                    </div>
                    <h2 className="mt-5 text-xl font-semibold text-white">{userRoleLabel(t, roleKey)}</h2>
                    <p className="mt-2 min-h-[4.5rem] text-sm leading-6 text-white/55">{roleDescription(t, roleKey)}</p>
                    <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-white/60">
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{t.admin.usersAssigned(role?.userCount ?? 0)}</span>
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{draftPermissions?.[roleKey]?.length ?? role?.permissions.length ?? 0}</span>
                    </div>
                  </Card>
                );
              })}
            </section>

            <Card className="rounded-2xl border-white/10 bg-white/[0.035] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">{t.admin.ownerProtection}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{t.admin.ownerProtectionDescription}</p>
                </div>
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent"><Lock size={15} />{t.admin.protectedRole}</span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <ProtectionItem text={t.admin.atLeastOneOwner} />
                <ProtectionItem text={t.admin.onlyOwnersManageOwners} />
              </div>
              <p className="mt-5 text-sm leading-6 text-white/45">{t.admin.roleAssignmentReadOnly}</p>
            </Card>

            <Card className="overflow-hidden rounded-2xl border-white/10 bg-white/[0.035] p-0">
              <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl border border-accent/20 bg-accent/10 p-2 text-accent"><KeyRound size={18} /></span>
                  <div>
                    <h2 className="text-lg font-semibold text-white">{t.admin.permissionMatrix}</h2>
                    <p className="mt-1 text-sm leading-6 text-white/50">{t.admin.permissionMatrixDescription}</p>
                    {!canEditPermissions && <p className="mt-2 text-xs text-white/40">{t.admin.onlyOwnersEditPermissions}</p>}
                    {dirty && <p className="mt-2 text-xs font-semibold text-accent">{t.admin.unsavedChanges}</p>}
                    {saveState === 'success' && <p className="mt-2 text-xs font-semibold text-accent">{t.admin.permissionMatrixUpdated}</p>}
                    {saveState === 'error' && <p className="mt-2 text-xs font-semibold text-rose-200">{t.admin.permissionMatrixUpdateFailed}</p>}
                  </div>
                </div>
                {canEditPermissions && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={resetDraft} disabled={!dirty || saveState === 'saving'} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-45">
                      <RotateCcw size={15} />{t.admin.resetPermissionChanges}
                    </button>
                    <button type="button" onClick={savePermissions} disabled={!dirty || saveState === 'saving'} className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/12 px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent/18 disabled:cursor-not-allowed disabled:opacity-45">
                      {saveState === 'saving' ? <Spinner /> : <Save size={15} />}{t.admin.savePermissionChanges}
                    </button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42">
                    <tr>
                      <th className="px-5 py-3">{t.admin.permissionMatrix}</th>
                      {roleOrder.map((roleKey) => <th key={roleKey} className="px-5 py-3 text-center">{userRoleLabel(t, roleKey)}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {data.permissionGroups.map((group) => (
                      <PermissionGroupRows key={group.key} group={group} rolesByKey={rolesByKey} roleOrder={roleOrder} draftPermissions={draftPermissions} canEditPermissions={canEditPermissions} onToggle={togglePermission} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function PermissionGroupRows({ group, rolesByKey, roleOrder, draftPermissions, canEditPermissions, onToggle }: { group: PermissionGroup; rolesByKey: Map<RoleKey, RoleSummary>; roleOrder: RoleKey[]; draftPermissions: DraftPermissions | null; canEditPermissions: boolean; onToggle: (roleKey: RoleKey, permission: Permission) => void }) {
  const { t } = useI18n();
  return (
    <>
      <tr className="bg-black/20">
        <td colSpan={roleOrder.length + 1} className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-accent/80">
          {t.admin.permissionGroups[group.key]}
        </td>
      </tr>
      {group.permissions.map((permission) => (
        <tr key={permission} className="hover:bg-white/[0.025]">
          <td className="px-5 py-4 font-medium text-white">{t.admin.permissionLabels[permission] ?? permission}</td>
          {roleOrder.map((roleKey) => {
            const allowed = draftPermissions?.[roleKey]?.includes(permission) ?? rolesByKey.get(roleKey)?.permissions.includes(permission) ?? false;
            const editable = canEditPermissions && roleKey !== 'owner';
            return (
              <td key={`${roleKey}-${permission}`} className="px-5 py-4 text-center">
                <PermissionIndicator allowed={allowed} owner={roleKey === 'owner'} editable={editable} onToggle={() => onToggle(roleKey, permission)} label={`${userRoleLabel(t, roleKey)}: ${t.admin.permissionLabels[permission] ?? permission}`} />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function PermissionIndicator({ allowed, owner, editable, onToggle, label }: { allowed: boolean; owner: boolean; editable: boolean; onToggle: () => void; label: string }) {
  const { t } = useI18n();
  if (editable) {
    return (
      <label title={allowed ? t.admin.permissionAllowed : t.admin.permissionUnavailable} className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition focus-within:ring-2 focus-within:ring-accent/40 ${allowed ? 'border-accent/30 bg-accent/12 text-accent hover:bg-accent/18' : 'border-white/10 bg-black/20 text-white/35 hover:border-white/20 hover:text-white/55'}`}>
        <input type="checkbox" className="sr-only" checked={allowed} onChange={onToggle} aria-label={label} />
        {allowed ? <Check size={16} /> : <Minus size={16} />}
      </label>
    );
  }
  if (allowed) {
    return <span title={owner ? t.admin.permissionLocked : t.admin.permissionAllowed} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-accent"><Check size={16} /></span>;
  }
  return <span title={t.admin.permissionUnavailable} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/35"><Minus size={16} /></span>;
}

function ProtectionItem({ text }: { text: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72"><Lock size={16} className="text-accent" />{text}</div>;
}

function roleDescription(t: ReturnType<typeof useI18n>['t'], role: RoleKey) {
  if (role === 'owner') return t.admin.ownerRoleDescription;
  if (role === 'admin') return t.admin.adminRoleDescription;
  return t.admin.memberRoleDescription;
}

function rolePermissionDraft(roles: RoleSummary[]): DraftPermissions {
  const draft = { owner: [], admin: [], member: [] } as DraftPermissions;
  roles.forEach((role) => {
    draft[role.key] = [...role.permissions].sort() as Permission[];
  });
  return draft;
}

function cloneDraft(draft: DraftPermissions): DraftPermissions {
  return {
    owner: [...draft.owner],
    admin: [...draft.admin],
    member: [...draft.member],
  };
}

function permissionsDraftEqual(first: DraftPermissions, second: DraftPermissions) {
  return (['owner', 'admin', 'member'] as const).every((roleKey) => {
    const firstPermissions = [...first[roleKey]].sort();
    const secondPermissions = [...second[roleKey]].sort();
    return firstPermissions.length === secondPermissions.length && firstPermissions.every((permission, index) => permission === secondPermissions[index]);
  });
}
