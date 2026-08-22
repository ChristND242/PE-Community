'use client';

import { Camera, Check, ImagePlus, Link as LinkIcon, Trash2, UserRound, X } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../components/app-select';
import { HelpTooltip } from '../../../components/help-tooltip';
import { EmailChangePanel, PasswordChangePanel, ProfileAccountTabs, ProfileTabPanel, type ProfileAccountTab } from '../../../components/profile-account-security';
import { ProfilePhoto } from '../../../components/profile-photo';
import { ProfileSocialLinks } from '../../../components/profile-social-links';
import { AppShell } from '../../../components/shell';
import { TwoFactorCard } from '../../../components/two-factor-card';
import { Button, Card, LoadingButton, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, apiUrl } from '../../../lib/api';
import { DicebearStyleName, dicebearAvatarOptions } from '../../../lib/avatar';
import { useI18n } from '../../../lib/i18n';
import type { ProfileLinkDto } from '../../../lib/profile-links';

type ProfileResponse = {
  id: string;
  user: { name: string; email: string };
  role: { key: string };
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
    socialLinks?: Record<string, string>;
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

export default function ProfilePage() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftPhotoRef = useRef('');
  const [activeTab, setActiveTab] = useState<ProfileAccountTab>('basic');
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [photoValidation, setPhotoValidation] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [draftPhotoUrl, setDraftPhotoUrl] = useState('');
  const [draftPhotoFile, setDraftPhotoFile] = useState<File | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropPosition, setCropPosition] = useState('50% 50%');

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
      if (draftPhotoRef.current) URL.revokeObjectURL(draftPhotoRef.current);
      draftPhotoRef.current = '';
      setDraftPhotoUrl('');
      setDraftPhotoFile(null);
      setPhotoValidation('');
    } catch {
      setError(t.dashboard.profileLoadFailed);
    }
  }

  useEffect(() => {
    load();
  }, [t.dashboard.profileLoadFailed]);

  useEffect(() => {
    return () => {
      if (draftPhotoRef.current) URL.revokeObjectURL(draftPhotoRef.current);
    };
  }, []);

  async function save() {
    if (saving) return;
    setValidation('');
    if (!form.name.trim()) {
      setValidation(t.dashboard.nameRequired);
      return;
    }
    setSaving(true);
    try {
      const updated = await apiFetch<ProfileResponse>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          title: form.title,
          avatarUrl: form.avatarUrl,
          sex: form.sex,
          dicebearStyle: form.dicebearStyle,
          dicebearSeed: form.dicebearSeed,
          bio: form.bio,
          birthdate: form.birthdate,
          passportExpiresAt: form.passportExpiresAt,
          location: form.location,
          interests: form.interests,
          skills: form.skills,
        }),
      });
      setProfile(updated);
      toast.success(t.dashboard.profileSaved);
    } catch {
      toast.error(t.dashboard.profileSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function choosePhoto() {
    setPhotoValidation('');
    fileInputRef.current?.click();
  }

  function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!allowedPhotoTypes.includes(file.type)) {
      setPhotoValidation(t.dashboard.invalidImageType);
      event.target.value = '';
      return;
    }
    if (file.size > maxPhotoSize) {
      setPhotoValidation(t.dashboard.imageTooLarge);
      event.target.value = '';
      return;
    }
    if (draftPhotoRef.current) URL.revokeObjectURL(draftPhotoRef.current);
    const objectUrl = URL.createObjectURL(file);
    draftPhotoRef.current = objectUrl;
    setDraftPhotoUrl(objectUrl);
    setDraftPhotoFile(file);
    setCropScale(1);
    setCropPosition('50% 50%');
    setPhotoValidation('');
    event.target.value = '';
  }

  function cancelPhoto() {
    if (draftPhotoRef.current) URL.revokeObjectURL(draftPhotoRef.current);
    draftPhotoRef.current = '';
    setDraftPhotoUrl('');
    setDraftPhotoFile(null);
    setCropScale(1);
    setCropPosition('50% 50%');
  }

  async function savePhoto() {
    if (!draftPhotoFile || savingPhoto) return;
    setSavingPhoto(true);
    setPhotoValidation('');
    try {
      const cropped = await cropImageToBlob(draftPhotoUrl, cropScale, cropPosition);
      const body = new FormData();
      body.append('file', new File([cropped], 'avatar.jpg', { type: 'image/jpeg' }));
      const response = await fetch(apiUrl('/me/profile/avatar'), { method: 'POST', credentials: 'include', body });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as { avatarUrl: string };
      updateField('avatarUrl', result.avatarUrl);
      setProfile((current) => current ? { ...current, profile: { ...(current.profile ?? {}), avatarUrl: result.avatarUrl } } : current);
      toast.success(t.dashboard.photoUploaded);
      cancelPhoto();
    } catch {
      setPhotoValidation(t.dashboard.uploadFailed);
      toast.error(t.dashboard.uploadFailed);
    } finally {
      setSavingPhoto(false);
    }
  }

  async function removePhoto() {
    if (savingPhoto) return;
    if (draftPhotoRef.current) URL.revokeObjectURL(draftPhotoRef.current);
    draftPhotoRef.current = '';
    setDraftPhotoUrl('');
    setDraftPhotoFile(null);
    setSavingPhoto(true);
    try {
      const updated = await apiFetch<ProfileResponse>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          title: form.title,
          avatarUrl: '',
          sex: form.sex,
          dicebearStyle: form.dicebearStyle,
          dicebearSeed: form.dicebearSeed,
          bio: form.bio,
          birthdate: form.birthdate,
          passportExpiresAt: form.passportExpiresAt,
          location: form.location,
          interests: form.interests,
          skills: form.skills,
        }),
      });
      setProfile(updated);
      updateField('avatarUrl', '');
      toast.success(t.dashboard.photoRemoved);
      setPhotoValidation('');
    } catch {
      toast.error(t.dashboard.profileSaveFailed);
    } finally {
      setSavingPhoto(false);
    }
  }

  const displayPhoto = form.avatarUrl;
  const dicebearSeed = form.dicebearSeed || profile?.id || '';
  const completion = profile ? profileCompletion({ ...profile, user: { ...profile.user, name: form.name }, profile: { ...profile.profile, title: form.title, avatarUrl: form.avatarUrl, dicebearStyle: form.dicebearStyle, dicebearSeed, bio: form.bio, birthdate: form.birthdate, passportExpiresAt: form.passportExpiresAt, location: form.location, interests: splitList(form.interests), skills: splitList(form.skills), socialLinks: profile.profileLinks?.length ? { links: 'configured' } : {} } }) : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.dashboard.profileTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.dashboard.profileSubtitle}</p>
          </div>
          {profile?.user.email && <p className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/55">{t.dashboard.accountEmail}: {profile.user.email}</p>}
        </header>

        <ProfileAccountTabs activeTab={activeTab} idPrefix="member-profile" onChange={setActiveTab} />
        <ProfileTabPanel active={activeTab === 'basic'} id="member-profile-basic-panel" labelledBy="member-profile-basic-tab">
          {error ? (
            <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
          ) : !profile ? (
            <TableSkeleton rows={7} columns={2} />
          ) : (
            <Card className="rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))]">
            <div className="grid gap-8 xl:grid-cols-[18rem_1fr]">
              <aside className="space-y-5">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                    <span>{t.dashboard.profilePicture}</span>
                    <HelpTooltip content={t.dashboard.profilePictureHelp} />
                  </h2>
                </div>
                <div className="grid justify-start gap-4">
                  <ProfilePhoto name={form.name} avatarUrl={displayPhoto} dicebearStyle={form.dicebearStyle} dicebearSeed={dicebearSeed} size="frame" alt={t.dashboard.profilePicture} />
                  <input ref={fileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelected} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={choosePhoto} disabled={savingPhoto} className="gap-2">
                      <ImagePlus size={16} />
                      {displayPhoto ? t.dashboard.replacePhoto : t.dashboard.uploadPhoto}
                    </Button>
                    {displayPhoto && (
                      <LoadingButton type="button" loading={savingPhoto} loadingLabel={t.dashboard.savingPhoto} onClick={removePhoto} className="gap-2 bg-white/10 text-white hover:bg-white/15">
                        <Trash2 size={16} />
                        {t.dashboard.removePhoto}
                      </LoadingButton>
                    )}
                  </div>
                  <p className="max-w-[18rem] text-xs leading-5 text-white/45">{t.dashboard.photoRequirements}</p>
                  {photoValidation && <p className="max-w-[18rem] rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs leading-5 text-rose-100">{photoValidation}</p>}
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">{t.dashboard.generatedAvatar}</p>
                  <p className="mt-2 text-xs leading-5 text-white/45">{t.dashboard.generatedAvatarHelp}</p>
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
                  <Button type="button" onClick={() => updateField('dicebearSeed', `avatar-${crypto.randomUUID()}`)} className="mt-3 w-full bg-white/10 text-white hover:bg-white/15">{t.dashboard.generateNewAvatar}</Button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{t.dashboard.profileCompletion}</p>
                    <span className="text-sm font-semibold text-accent">{completion}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-gradient-to-r from-accent to-cyan-300" style={{ width: `${completion}%` }} />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-white/45">{t.dashboard.profileCompletionPrompt}</p>
                </div>
              </aside>

              <div className="space-y-6">
                <ProfileSection title={t.dashboard.identity} description={t.dashboard.identityDescription} icon={<UserRound size={18} />}>
                  <Field label={t.dashboard.fullName} helper={t.dashboard.fullNameHelp} value={form.name} onChange={(value) => updateField('name', value)} error={validation} />
                  <Field label={t.dashboard.titleLabel} helper={t.dashboard.titleHelp} value={form.title} onChange={(value) => updateField('title', value)} />
                  <SelectField label={t.dashboard.sexLabel} value={form.sex} placeholder={t.dashboard.selectSex} options={[{ value: 'M', label: t.dashboard.sexMale }, { value: 'F', label: t.dashboard.sexFemale }]} onChange={(value) => updateField('sex', value)} />
                  <Field label={t.dashboard.avatarUrl} helper={t.dashboard.avatarUrlHelp} value={form.avatarUrl} onChange={(value) => {
                    updateField('avatarUrl', value);
                  }} />
                  <Field type="date" label={t.dashboard.birthdate} helper={t.dashboard.birthdatePrivacyHelp} value={form.birthdate} onChange={(value) => updateField('birthdate', value)} />
                  <Field type="date" label={t.dashboard.passportExpirationDate} helper={t.dashboard.passportExpirationHelp} value={form.passportExpiresAt} onChange={(value) => updateField('passportExpiresAt', value)} />
                </ProfileSection>

                <ProfileSection title={t.dashboard.profileDetails} description={t.dashboard.profileDetailsDescription} icon={<Camera size={18} />}>
                  <Field label={t.common.location} helper={t.dashboard.locationHelp} value={form.location} onChange={(value) => updateField('location', value)} />
                  <Field label={t.dashboard.interests} helper={t.dashboard.listFieldHelp} value={form.interests} onChange={(value) => updateField('interests', value)} />
                  <Field label={t.dashboard.skills} helper={t.dashboard.listFieldHelp} value={form.skills} onChange={(value) => updateField('skills', value)} />
                  <label className="md:col-span-2">
                    <LabelWithHelp label={t.dashboard.bio} help={t.dashboard.bioHelp} />
                    <textarea value={form.bio} onChange={(event) => updateField('bio', event.target.value)} rows={5} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-accent/60" />
                  </label>
                </ProfileSection>

                <ProfileSection title={t.dashboard.socialLinks} description={t.dashboard.socialLinksDescription} icon={<LinkIcon size={18} />}>
                  <ProfileSocialLinks endpoint="/me/profile/links" initialLinks={profile.profileLinks ?? []} onChange={(profileLinks) => setProfile((current) => current ? { ...current, profileLinks } : current)} />
                </ProfileSection>

                <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-white/45">{t.dashboard.profileSaveDescription}</p>
                  <LoadingButton loading={saving} loadingLabel={t.dashboard.savingProfile} disabled={saving} onClick={save} className="min-w-36">
                    {t.dashboard.saveProfile}
                  </LoadingButton>
                </div>
              </div>
            </div>
            </Card>
          )}

          <CropDialog
            open={Boolean(draftPhotoUrl)}
            imageUrl={draftPhotoUrl}
            scale={cropScale}
            position={cropPosition}
            onScaleChange={setCropScale}
            onPositionChange={setCropPosition}
            onChooseAnother={choosePhoto}
            onConfirm={savePhoto}
            onCancel={cancelPhoto}
            uploading={savingPhoto}
            t={t.dashboard}
          />
        </ProfileTabPanel>
        <ProfileTabPanel active={activeTab === 'email'} id="member-profile-email-panel" labelledBy="member-profile-email-tab">
          <EmailChangePanel />
        </ProfileTabPanel>
        <ProfileTabPanel active={activeTab === 'password'} id="member-profile-password-panel" labelledBy="member-profile-password-tab">
          <PasswordChangePanel />
        </ProfileTabPanel>
        <ProfileTabPanel active={activeTab === 'two-factor'} id="member-profile-two-factor-panel" labelledBy="member-profile-two-factor-tab">
          <TwoFactorCard />
        </ProfileTabPanel>
      </div>
    </AppShell>
  );
}

function ProfileSection({ title, description, icon, children }: { title: string; description: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-white/10 bg-white/[0.045] p-2 text-accent">{icon}</span>
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-white/48">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, value, helper, error, type = 'text', onChange }: { label: string; value: string; helper?: string; error?: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label>
      <LabelWithHelp label={label} help={helper} />
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-accent/60" />
      {error && <span className="mt-1 block text-xs text-rose-200">{error}</span>}
    </label>
  );
}

function SelectField({ label, value, placeholder, options, onChange }: { label: string; value: string; placeholder?: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div>
      <LabelWithHelp label={label} />
      <AppSelect value={value} placeholder={placeholder} options={options} onChange={onChange} dense className="mt-2 w-full min-w-0" />
    </div>
  );
}

function LabelWithHelp({ label, help }: { label: string; help?: string }) {
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-white/75">
      <span>{label}</span>
      {help && <HelpTooltip content={help} />}
    </span>
  );
}

function CropDialog({
  open,
  imageUrl,
  scale,
  position,
  onScaleChange,
  onPositionChange,
  onChooseAnother,
  onConfirm,
  onCancel,
  uploading,
  t,
}: {
  open: boolean;
  imageUrl: string;
  scale: number;
  position: string;
  onScaleChange: (value: number) => void;
  onPositionChange: (value: string) => void;
  onChooseAnother: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  uploading: boolean;
  t: {
    cropPhoto: string;
    cropPreview: string;
    cropPhotoDescription: string;
    previewPosition: string;
    previewScale: string;
    positionCenter: string;
    positionTop: string;
    positionBottom: string;
    positionLeft: string;
    positionRight: string;
    chooseAnotherPhoto: string;
    savePhoto: string;
    savingPhoto: string;
    cancel: string;
  };
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1412] p-5 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{t.cropPhoto}</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">{t.cropPhotoDescription}</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label={t.cancel}>
            <X size={16} />
          </button>
        </div>
        <div className="mt-5 grid justify-center">
          <p className="mb-3 text-center text-xs font-semibold uppercase text-white/35">{t.cropPreview}</p>
          <ProfilePhoto name="" avatarUrl={imageUrl} size="crop" alt={t.cropPreview} imageStyle={{ objectPosition: position, transform: `scale(${scale})` }} />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-medium text-white/70">{t.previewScale}</span>
            <input type="range" min="1" max="1.8" step="0.05" value={scale} onChange={(event) => onScaleChange(Number(event.target.value))} className="mt-3 w-full accent-[#5ed29c]" />
          </label>
          <AppSelect
            value={position}
            label={t.previewPosition}
            options={[
              { value: '50% 50%', label: t.positionCenter },
              { value: '50% 0%', label: t.positionTop },
              { value: '50% 100%', label: t.positionBottom },
              { value: '0% 50%', label: t.positionLeft },
              { value: '100% 50%', label: t.positionRight },
            ]}
            onChange={onPositionChange}
            className="w-full"
          />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" disabled={uploading} className="gap-2 bg-white/10 text-white hover:bg-white/15" onClick={onChooseAnother}>
            <ImagePlus size={16} />
            {t.chooseAnotherPhoto}
          </Button>
          <Button type="button" disabled={uploading} className="gap-2 bg-white/10 text-white hover:bg-white/15" onClick={onCancel}>
            <X size={16} />
            {t.cancel}
          </Button>
          <LoadingButton type="button" loading={uploading} loadingLabel={t.savingPhoto} className="gap-2" onClick={onConfirm}>
            <Check size={16} />
            {t.savePhoto}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function normalizedStyle(value?: string | null): DicebearStyleName {
  return value === 'lorelei-neutral' || value === 'personas' || value === 'notionists' ? value : 'notionists';
}

async function cropImageToBlob(imageUrl: string, scale: number, position: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = reject;
    nextImage.src = imageUrl;
  });
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');

  const fitScale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * scale;
  const width = image.naturalWidth * fitScale;
  const height = image.naturalHeight * fitScale;
  const [xPercent, yPercent] = position.split(' ').map((part) => Number(part.replace('%', '')) / 100);
  const x = (size - width) * (Number.isFinite(xPercent) ? xPercent : 0.5);
  const y = (size - height) * (Number.isFinite(yPercent) ? yPercent : 0.5);
  context.drawImage(image, x, y, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Photo crop failed.')), 'image/jpeg', 0.92);
  });
}

function profileCompletion(profile: ProfileResponse) {
  const fields = [profile.user.name, profile.profile?.title, profile.profile?.avatarUrl || profile.profile?.dicebearSeed, profile.profile?.bio, profile.profile?.location, ...(profile.profile?.interests ?? []), ...(profile.profile?.skills ?? []), ...Object.values(profile.profile?.socialLinks ?? {})];
  return Math.round((fields.filter((value) => typeof value === 'string' && value.trim()).length / Math.max(fields.length, 6)) * 100);
}
