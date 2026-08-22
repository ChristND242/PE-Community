'use client';

import { ImagePlus, Trash2, UserRound } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../components/app-select';
import { HelpTooltip } from '../../../components/help-tooltip';
import { EmailChangePanel, PasswordChangePanel, ProfileAccountTabs, ProfileTabPanel, type ProfileAccountTab } from '../../../components/profile-account-security';
import { ProfilePhoto } from '../../../components/profile-photo';
import { ProfileSocialLinks } from '../../../components/profile-social-links';
import { TwoFactorCard } from '../../../components/two-factor-card';
import { Button, Card, LoadingButton, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, apiUrl } from '../../../lib/api';
import { DicebearStyleName, dicebearAvatarOptions } from '../../../lib/avatar';
import { useI18n } from '../../../lib/i18n';
import { userRoleLabel } from '../../../lib/user-role';
import type { ProfileLinkDto } from '../../../lib/profile-links';

type ProfileResponse = {
  id: string;
  user: { name: string; email: string };
  role: { key: string; name?: string };
  profileLinks?: ProfileLinkDto[];
  profile?: {
    title?: string | null;
    avatarUrl?: string | null;
    sex?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
    bio?: string | null;
    birthdate?: string | null;
    passportExpiresAt?: string | null;
    location?: string | null;
    interests?: string[];
    skills?: string[];
  } | null;
};

type FormState = {
  name: string;
  title: string;
  avatarUrl: string;
  sex: string;
  dicebearStyle: DicebearStyleName;
  dicebearSeed: string;
  bio: string;
  birthdate: string;
  passportExpiresAt: string;
  location: string;
  interests: string;
  skills: string;
};

const emptyForm: FormState = {
  name: '',
  title: '',
  avatarUrl: '',
  sex: '',
  dicebearStyle: 'notionists',
  dicebearSeed: '',
  bio: '',
  birthdate: '',
  passportExpiresAt: '',
  location: '',
  interests: '',
  skills: '',
};

const maxPhotoSize = 5 * 1024 * 1024;
const allowedPhotoTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function AdminProfileForm() {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileAccountTab>('basic');
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setError('');
    try {
      const data = await apiFetch<ProfileResponse>('/me');
      setProfile(data);
      setForm({
        name: data.user.name ?? '',
        title: data.profile?.title ?? '',
        avatarUrl: data.profile?.avatarUrl ?? '',
        sex: data.profile?.sex ?? '',
        dicebearStyle: normalizedStyle(data.profile?.dicebearStyle),
        dicebearSeed: data.profile?.dicebearSeed ?? data.id,
        bio: data.profile?.bio ?? '',
        birthdate: dateInputValue(data.profile?.birthdate),
        passportExpiresAt: dateInputValue(data.profile?.passportExpiresAt),
        location: data.profile?.location ?? '',
        interests: (data.profile?.interests ?? []).join(', '),
        skills: (data.profile?.skills ?? []).join(', '),
      });
    } catch {
      setError(t.admin.adminProfileLoadFailed);
    }
  }

  useEffect(() => { load(); }, [t.admin.adminProfileLoadFailed]);

  async function save() {
    if (saving) return;
    setValidation('');
    setSaving(true);
    if (!form.name.trim()) {
      setValidation(t.dashboard.nameRequired);
      setSaving(false);
      return;
    }
    try {
      const updated = await apiFetch<ProfileResponse>('/me/profile', { method: 'PATCH', body: JSON.stringify(profilePayload()) });
      setProfile(updated);
      toast.success(t.admin.adminProfileSaved);
    } catch {
      toast.error(t.admin.adminProfileSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;
    if (!allowedPhotoTypes.includes(file.type)) {
      toast.error(t.dashboard.invalidImageType);
      return;
    }
    if (file.size > maxPhotoSize) {
      toast.error(t.dashboard.imageTooLarge);
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(apiUrl('/me/profile/avatar'), { method: 'POST', credentials: 'include', body });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as { avatarUrl: string };
      setForm((current) => ({ ...current, avatarUrl: result.avatarUrl }));
      setProfile((current) => current ? { ...current, profile: { ...(current.profile ?? {}), avatarUrl: result.avatarUrl } } : current);
      toast.success(t.dashboard.photoUploaded);
    } catch {
      toast.error(t.dashboard.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    if (uploading) return;
    setUploading(true);
    try {
      const nextForm = { ...form, avatarUrl: '' };
      const updated = await apiFetch<ProfileResponse>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(profilePayload(nextForm)),
      });
      setProfile(updated);
      setForm(nextForm);
      toast.success(t.dashboard.photoRemoved);
    } catch {
      toast.error(t.dashboard.profileSaveFailed);
    } finally {
      setUploading(false);
    }
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function profilePayload(nextForm = form) {
    return {
      name: nextForm.name,
      title: nextForm.title,
      avatarUrl: nextForm.avatarUrl,
      sex: nextForm.sex,
      dicebearStyle: nextForm.dicebearStyle,
      dicebearSeed: nextForm.dicebearSeed,
      bio: nextForm.bio,
      birthdate: nextForm.birthdate,
      passportExpiresAt: nextForm.passportExpiresAt,
      location: nextForm.location,
      interests: nextForm.interests,
      skills: nextForm.skills,
    };
  }

  const dicebearSeed = form.dicebearSeed || profile?.id || '';

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <ProfileAccountTabs activeTab={activeTab} idPrefix="admin-profile" onChange={setActiveTab} />
      <ProfileTabPanel active={activeTab === 'basic'} id="admin-profile-basic-panel" labelledBy="admin-profile-basic-tab">
        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        ) : !profile ? (
          <TableSkeleton rows={6} columns={2} />
        ) : (
          <Card className="max-w-full overflow-hidden rounded-[1.35rem] border-white/[0.075] bg-white/[0.035] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
          <div className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-w-0 rounded-[1.25rem] border border-white/[0.07] bg-black/[0.16] p-4">
              <ProfilePhoto name={form.name} avatarUrl={form.avatarUrl} dicebearStyle={form.dicebearStyle} dicebearSeed={dicebearSeed} size="xl" className="mx-auto rounded-[1.5rem] border-white/[0.08] bg-white/[0.05] text-emerald-300" />
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload} />
              <Button disabled={uploading} onClick={() => inputRef.current?.click()} className="mt-4 h-10 w-full gap-2 text-sm"><ImagePlus size={16} />{form.avatarUrl ? t.dashboard.replacePhoto : t.dashboard.uploadPhoto}</Button>
              {form.avatarUrl && (
                <LoadingButton type="button" loading={uploading} loadingLabel={t.dashboard.savingPhoto} onClick={removePhoto} className="mt-2 h-10 w-full gap-2 bg-white/10 text-white hover:bg-white/15">
                  <Trash2 size={16} />
                  {t.dashboard.removePhoto}
                </LoadingButton>
              )}
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <p className="text-sm font-semibold text-white">{t.dashboard.generatedAvatar}</p>
                <p className="mt-2 text-xs leading-5 text-white/42">{t.dashboard.generatedAvatarHelp}</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {dicebearAvatarOptions.map((option) => (
                    <button
                      key={option.style}
                      type="button"
                      onClick={() => updateField('dicebearStyle', option.style)}
                      className={`rounded-xl border p-2 transition ${form.dicebearStyle === option.style ? 'border-accent/55 bg-accent/10' : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.06]'}`}
                      aria-pressed={form.dicebearStyle === option.style}
                    >
                      <ProfilePhoto name={form.name} dicebearStyle={option.style} dicebearSeed={dicebearSeed} size="md" className="mx-auto" />
                      <span className="mt-2 block truncate text-[11px] font-medium text-white/65">{option.label}</span>
                    </button>
                  ))}
                </div>
                <Button type="button" onClick={() => updateField('dicebearSeed', `avatar-${crypto.randomUUID()}`)} className="mt-3 h-10 w-full bg-white/10 text-sm text-white hover:bg-white/15">{t.dashboard.generateNewAvatar}</Button>
              </div>
              <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                <p className="truncate text-sm font-semibold text-white">{form.name || profile.user.email}</p>
                <p className="truncate text-xs text-white/45">{profile.user.email}</p>
                <span className="inline-flex rounded-full border border-emerald-300/[0.16] bg-emerald-400/[0.10] px-2.5 py-1 text-xs font-medium text-emerald-200/80">{userRoleLabel(t, profile.role.key)}</span>
              </div>
            </div>
            <div className="min-w-0 space-y-4">
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-black/[0.18] px-4 py-3">
                <UserRound size={18} className="shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{profile.user.email}</p>
                  <p className="text-xs text-white/45">{t.admin.adminAccountInfo}</p>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <Field label={t.dashboard.fullName} helper={t.dashboard.fullNameHelp} value={form.name} error={validation} onChange={(value) => updateField('name', value)} />
                <Field label={t.dashboard.titleLabel} helper={t.dashboard.titleHelp} value={form.title} onChange={(value) => updateField('title', value)} />
                <SelectField label={t.dashboard.sexLabel} value={form.sex} placeholder={t.dashboard.selectSex} options={[{ value: 'M', label: t.dashboard.sexMale }, { value: 'F', label: t.dashboard.sexFemale }]} onChange={(value) => updateField('sex', value)} />
                <Field label={t.common.location} helper={t.dashboard.locationHelp} value={form.location} onChange={(value) => updateField('location', value)} />
                <Field label={t.dashboard.avatarUrl} helper={t.dashboard.avatarUrlHelp} value={form.avatarUrl} onChange={(value) => updateField('avatarUrl', value)} />
                <Field type="date" label={t.dashboard.birthdate} helper={t.dashboard.birthdatePrivacyHelp} value={form.birthdate} onChange={(value) => updateField('birthdate', value)} />
                <Field type="date" label={t.dashboard.passportExpirationDate} helper={t.dashboard.passportExpirationHelp} value={form.passportExpiresAt} onChange={(value) => updateField('passportExpiresAt', value)} />
                <Field label={t.dashboard.interests} helper={t.dashboard.listFieldHelp} value={form.interests} onChange={(value) => updateField('interests', value)} />
                <Field label={t.dashboard.skills} helper={t.dashboard.listFieldHelp} value={form.skills} onChange={(value) => updateField('skills', value)} />
                <label className="block min-w-0 md:col-span-2">
                  <LabelWithHelp label={t.dashboard.bio} help={t.dashboard.bioHelp} />
                  <textarea value={form.bio} onChange={(event) => updateField('bio', event.target.value)} rows={4} className="mt-2 w-full max-w-full resize-y rounded-xl border border-white/[0.08] bg-[#050907] px-3 py-2.5 text-sm leading-6 text-white outline-none transition placeholder:text-white/28 focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/[0.12]" />
                </label>
                <ProfileSocialLinks endpoint="/me/profile/links" initialLinks={profile.profileLinks ?? []} onChange={(profileLinks) => setProfile((current) => current ? { ...current, profileLinks } : current)} />
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
                <LoadingButton loading={saving} loadingLabel={t.admin.savingAdminProfile} onClick={save}>{t.admin.saveAdminProfile}</LoadingButton>
              </div>
            </div>
          </div>
          </Card>
        )}
      </ProfileTabPanel>
      <ProfileTabPanel active={activeTab === 'email'} id="admin-profile-email-panel" labelledBy="admin-profile-email-tab">
        <EmailChangePanel />
      </ProfileTabPanel>
      <ProfileTabPanel active={activeTab === 'password'} id="admin-profile-password-panel" labelledBy="admin-profile-password-tab">
        <PasswordChangePanel />
      </ProfileTabPanel>
      <ProfileTabPanel active={activeTab === 'two-factor'} id="admin-profile-two-factor-panel" labelledBy="admin-profile-two-factor-tab">
        <TwoFactorCard />
      </ProfileTabPanel>
    </div>
  );
}

function SelectField({ label, value, placeholder, options, onChange }: { label: string; value: string; placeholder?: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div className="block min-w-0">
      <LabelWithHelp label={label} />
      <AppSelect value={value} placeholder={placeholder} options={options} onChange={onChange} dense className="mt-2 w-full min-w-0" />
    </div>
  );
}

function Field({ label, value, helper, error, type = 'text', onChange }: { label: string; value: string; helper?: string; error?: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block min-w-0">
      <LabelWithHelp label={label} help={helper} />
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full max-w-full rounded-xl border border-white/[0.08] bg-[#050907] px-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/[0.12]" />
      {error && <span className="mt-1 block text-xs text-rose-200">{error}</span>}
    </label>
  );
}

function LabelWithHelp({ label, help }: { label: string; help?: string }) {
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-white/72">
      <span>{label}</span>
      {help && <HelpTooltip content={help} />}
    </span>
  );
}

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function normalizedStyle(value?: string | null): DicebearStyleName {
  return value === 'lorelei-neutral' || value === 'personas' || value === 'notionists' ? value : 'notionists';
}
