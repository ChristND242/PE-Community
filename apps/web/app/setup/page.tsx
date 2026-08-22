'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronRight, ImagePlus, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppSelect } from '../../components/app-select';
import { AuthBackground } from '../../components/auth-background';
import { AuthHeaderControls } from '../../components/auth-header-controls';
import { ProfilePhoto } from '../../components/profile-photo';
import { Card, LoadingButton } from '../../components/ui';
import { avatarUploadAccept, avatarUploadMaxBytes, avatarUploadMimeTypes, createSetupAvatarSeed } from '../../lib/avatar';
import { cn } from '../../lib/utils';
import { apiUrl } from '../../lib/api';
import { loadPublicInstanceBootstrap } from '../../lib/instance-bootstrap';
import { useI18n } from '../../lib/i18n';

type SetupStatus = {
  initialized: boolean;
  setupRequired: boolean;
};

type SetupFormState = {
  communityName: string;
  communitySlug: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPassword: string;
  confirmPassword: string;
  defaultLanguage: string;
  timezone: string;
};

type SetupField = keyof SetupFormState;
type SetupFieldErrors = Partial<Record<SetupField, string>>;
type SetupStepId = 'community' | 'owner' | 'review';
type OwnerAvatarMode = 'generated' | 'upload';

const setupSteps: ReadonlyArray<{ id: SetupStepId; number: number }> = [
  { id: 'community', number: 1 },
  { id: 'owner', number: 2 },
  { id: 'review', number: 3 },
];

const languageOptions = ['en', 'fr'] as const;
const timezoneOptions = getTimezoneOptions();
const slugPattern = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SetupPage() {
  const { t, applyCommunityDefaults } = useI18n();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [form, setForm] = useState<SetupFormState>({
    communityName: '',
    communitySlug: '',
    ownerFullName: '',
    ownerEmail: '',
    ownerPassword: '',
    confirmPassword: '',
    defaultLanguage: 'en',
    timezone: 'UTC',
  });
  const [fieldErrors, setFieldErrors] = useState<SetupFieldErrors>({});
  const [slugEdited, setSlugEdited] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [highestCompletedStepIndex, setHighestCompletedStepIndex] = useState(-1);
  const [navigationDirection, setNavigationDirection] = useState<1 | -1>(1);
  const [ownerAvatarMode, setOwnerAvatarMode] = useState<OwnerAvatarMode>('generated');
  const [ownerAvatarSeed, setOwnerAvatarSeed] = useState(() => createSetupAvatarSeed(''));
  const [ownerAvatarFile, setOwnerAvatarFile] = useState<File | null>(null);
  const [ownerAvatarPreviewUrl, setOwnerAvatarPreviewUrl] = useState('');
  const [ownerAvatarError, setOwnerAvatarError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const communityNameRef = useRef<HTMLInputElement>(null);
  const communitySlugRef = useRef<HTMLInputElement>(null);
  const ownerFullNameRef = useRef<HTMLInputElement>(null);
  const ownerEmailRef = useRef<HTMLInputElement>(null);
  const ownerPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const ownerAvatarInputRef = useRef<HTMLInputElement>(null);
  const ownerAvatarPreviewRef = useRef('');
  const errorRef = useRef<HTMLParagraphElement>(null);

  const fieldRefs: Partial<Record<SetupField, React.RefObject<HTMLInputElement | null>>> = {
    communityName: communityNameRef,
    communitySlug: communitySlugRef,
    ownerFullName: ownerFullNameRef,
    ownerEmail: ownerEmailRef,
    ownerPassword: ownerPasswordRef,
    confirmPassword: confirmPasswordRef,
  };

  const resolvedSteps = [
    { ...setupSteps[0], title: t.setup.stepCommunity, description: t.setup.stepCommunityDescription },
    { ...setupSteps[1], title: t.setup.stepOwner, description: t.setup.stepOwnerDescription },
    { ...setupSteps[2], title: t.setup.stepReview, description: t.setup.stepReviewDescription },
  ];

  useEffect(() => {
    loadPublicInstanceBootstrap()
      .then((data) => {
        if (!data) throw new Error('status');
        setStatus(data);
        if (data.initialized || !data.setupRequired) router.replace('/login');
      })
      .catch(() => setError(t.setup.setupStatusFailed));
  }, [router, t.setup.setupStatusFailed]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    return () => {
      if (ownerAvatarPreviewRef.current) URL.revokeObjectURL(ownerAvatarPreviewRef.current);
    };
  }, []);

  function updateField(key: SetupField, value: string) {
    setFieldErrors((current) => {
      const next = { ...current, [key]: undefined };
      if (key === 'communityName' && !slugEdited) next.communitySlug = undefined;
      return next;
    });
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'communityName' && !slugEdited) next.communitySlug = slugify(value);
      if (key === 'communitySlug') {
        next.communitySlug = slugify(value);
        setSlugEdited(true);
      }
      return next;
    });
  }

  function focusField(field?: SetupField) {
    if (!field) return;
    window.requestAnimationFrame(() => fieldRefs[field]?.current?.focus());
  }

  function moveToStep(nextStepIndex: number) {
    setNavigationDirection(nextStepIndex >= activeStepIndex ? 1 : -1);
    setActiveStepIndex(nextStepIndex);
  }

  function clearOwnerAvatarUpload() {
    const previewUrl = ownerAvatarPreviewRef.current;
    ownerAvatarPreviewRef.current = '';
    setOwnerAvatarPreviewUrl('');
    setOwnerAvatarFile(null);
    setOwnerAvatarError('');
    if (ownerAvatarInputRef.current) ownerAvatarInputRef.current.value = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }

  function generateOwnerAvatar() {
    clearOwnerAvatarUpload();
    setOwnerAvatarSeed(createSetupAvatarSeed(form.ownerFullName));
    setOwnerAvatarMode('generated');
  }

  function removeOwnerAvatarUpload() {
    clearOwnerAvatarUpload();
    setOwnerAvatarMode('generated');
  }

  async function handleOwnerAvatarSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!avatarUploadMimeTypes.includes(file.type as (typeof avatarUploadMimeTypes)[number])) {
      setOwnerAvatarError(t.setup.invalidAvatarType);
      return;
    }
    if (file.size > avatarUploadMaxBytes) {
      setOwnerAvatarError(t.setup.avatarTooLarge);
      return;
    }
    if (!await canDecodeImage(file)) {
      setOwnerAvatarError(t.setup.invalidAvatar);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const previousPreviewUrl = ownerAvatarPreviewRef.current;
    ownerAvatarPreviewRef.current = previewUrl;
    setOwnerAvatarPreviewUrl(previewUrl);
    setOwnerAvatarFile(file);
    setOwnerAvatarMode('upload');
    setOwnerAvatarError('');
    if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
  }

  function validateCommunityStep(focusInvalid = true) {
    const nextErrors: SetupFieldErrors = {};
    if (!form.communityName.trim()) nextErrors.communityName = t.setup.requiredField;
    if (!slugPattern.test(form.communitySlug)) nextErrors.communitySlug = t.setup.invalidSlug;
    setFieldErrors((current) => ({ ...current, communityName: undefined, communitySlug: undefined, ...nextErrors }));
    const firstInvalidField: SetupField | undefined = nextErrors.communityName ? 'communityName' : nextErrors.communitySlug ? 'communitySlug' : undefined;
    if (focusInvalid) focusField(firstInvalidField);
    return { valid: !firstInvalidField, firstInvalidField };
  }

  function validateOwnerStep(focusInvalid = true) {
    const nextErrors: SetupFieldErrors = {};
    if (!form.ownerFullName.trim()) nextErrors.ownerFullName = t.setup.requiredField;
    if (!form.ownerEmail.trim()) nextErrors.ownerEmail = t.setup.requiredField;
    else if (!emailPattern.test(form.ownerEmail.trim())) nextErrors.ownerEmail = t.setup.invalidEmail;
    if (!form.ownerPassword) nextErrors.ownerPassword = t.setup.requiredField;
    else if (form.ownerPassword.trim().length < 8) nextErrors.ownerPassword = t.setup.passwordTooShort;
    if (!form.confirmPassword) nextErrors.confirmPassword = t.setup.requiredField;
    else if (form.ownerPassword !== form.confirmPassword) nextErrors.confirmPassword = t.setup.passwordMismatch;
    setFieldErrors((current) => ({
      ...current,
      ownerFullName: undefined,
      ownerEmail: undefined,
      ownerPassword: undefined,
      confirmPassword: undefined,
      ...nextErrors,
    }));
    const firstInvalidField = (['ownerFullName', 'ownerEmail', 'ownerPassword', 'confirmPassword'] as const).find((field) => nextErrors[field]);
    if (focusInvalid) focusField(firstInvalidField);
    return { valid: !firstInvalidField, firstInvalidField };
  }

  function handleContinue() {
    setError('');
    setMessage('');
    const validation = activeStepIndex === 0 ? validateCommunityStep() : validateOwnerStep();
    if (!validation.valid) return;
    setHighestCompletedStepIndex((current) => Math.max(current, activeStepIndex));
    moveToStep(activeStepIndex + 1);
  }

  function handleBack() {
    if (activeStepIndex === 0 || loading) return;
    moveToStep(activeStepIndex - 1);
  }

  function handleStepSelect(stepIndex: number) {
    if (loading || stepIndex === activeStepIndex || stepIndex > highestCompletedStepIndex) return;
    moveToStep(stepIndex);
  }

  async function handleSetupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setMessage('');

    const communityValidation = validateCommunityStep(false);
    if (!communityValidation.valid) {
      moveToStep(0);
      focusField(communityValidation.firstInvalidField);
      return;
    }
    const ownerValidation = validateOwnerStep(false);
    if (!ownerValidation.valid) {
      moveToStep(1);
      focusField(ownerValidation.firstInvalidField);
      return;
    }

    setLoading(true);
    try {
      const setupToken = new URLSearchParams(window.location.search).get('token') ?? undefined;
      const setupBody = new FormData();
      setupBody.append('communityName', form.communityName);
      setupBody.append('communitySlug', form.communitySlug);
      setupBody.append('ownerFullName', form.ownerFullName);
      setupBody.append('ownerEmail', form.ownerEmail);
      setupBody.append('ownerPassword', form.ownerPassword);
      setupBody.append('defaultLanguage', form.defaultLanguage);
      setupBody.append('timezone', form.timezone);
      if (setupToken) setupBody.append('setupToken', setupToken);
      if (ownerAvatarMode === 'upload' && ownerAvatarFile) {
        setupBody.append('ownerAvatar', ownerAvatarFile);
      } else {
        setupBody.append('ownerAvatarStyle', 'notionists');
        setupBody.append('ownerAvatarSeed', ownerAvatarSeed);
      }
      const response = await fetch(apiUrl('/setup'), {
        method: 'POST',
        body: setupBody,
      });
      if (!response.ok) {
        const setupError = await setupErrorMessage(response, t.setup);
        if (setupError === t.setup.emailAlreadyInUse) {
          setFieldErrors((current) => ({ ...current, ownerEmail: setupError }));
          moveToStep(1);
          focusField('ownerEmail');
        } else {
          setError(setupError);
        }
        return;
      }
      applyCommunityDefaults({ defaultLanguage: form.defaultLanguage, timezone: form.timezone });
      setMessage(t.setup.setupComplete);
      router.replace('/login?setup=complete');
    } catch {
      setError(t.setup.setupFailed);
    } finally {
      setLoading(false);
    }
  }

  if (!status && !error) {
    return (
      <SetupFrame brand={t.brand.short} title={t.setup.title}>
        <div className="px-6 py-8 sm:px-8"><p className="text-sm text-white/55">{t.common.loading}</p></div>
      </SetupFrame>
    );
  }

  const activeStep = resolvedSteps[activeStepIndex];

  return (
    <SetupFrame brand={t.brand.short} title={t.setup.title} subtitle={t.setup.subtitle}>
      <form onSubmit={handleSetupSubmit} noValidate aria-busy={loading}>
        <SetupStepperHeader
          steps={resolvedSteps}
          activeStepIndex={activeStepIndex}
          highestCompletedStepIndex={highestCompletedStepIndex}
          disabled={loading}
          progressLabel={t.setup.stepProgress(activeStepIndex + 1, setupSteps.length)}
          navigationLabel={t.setup.setupProgress}
          completedLabel={t.setup.completed}
          onStepSelect={handleStepSelect}
        />

        <div className="min-h-[25rem] px-6 py-7 sm:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeStep.id}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: navigationDirection * 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: navigationDirection * -12 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            >
              {activeStepIndex === 0 && (
                <CommunityStep
                  form={form}
                  errors={fieldErrors}
                  communityNameRef={communityNameRef}
                  communitySlugRef={communitySlugRef}
                  onChange={updateField}
                  t={t}
                />
              )}
              {activeStepIndex === 1 && (
                <OwnerStep
                  form={form}
                  errors={fieldErrors}
                  refs={{ ownerFullNameRef, ownerEmailRef, ownerPasswordRef, confirmPasswordRef }}
                  avatar={{
                    mode: ownerAvatarMode,
                    generatedSeed: ownerAvatarSeed,
                    previewUrl: ownerAvatarPreviewUrl,
                    error: ownerAvatarError,
                    inputRef: ownerAvatarInputRef,
                  }}
                  onChange={updateField}
                  onAvatarSelected={handleOwnerAvatarSelected}
                  onGenerateAvatar={generateOwnerAvatar}
                  onRemoveUploadedAvatar={removeOwnerAvatarUpload}
                  t={t}
                />
              )}
              {activeStepIndex === 2 && (
                <SetupReviewSummary
                  form={form}
                  ownerAvatarMode={ownerAvatarMode}
                  ownerAvatarSeed={ownerAvatarSeed}
                  ownerAvatarPreviewUrl={ownerAvatarPreviewUrl}
                  t={t}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {message && <p className="mt-5 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent" role="status">{message}</p>}
          {error && <p ref={errorRef} tabIndex={-1} className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100 outline-none" role="alert">{error}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-white/[0.08] px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={handleBack}
            disabled={activeStepIndex === 0 || loading}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {t.common.back}
          </button>
          {activeStepIndex < setupSteps.length - 1 ? (
            <button
              type="button"
              onClick={handleContinue}
              className="ml-auto inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-bold text-background transition hover:bg-[#74e4b1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07100d]"
            >
              {t.setup.continue}
            </button>
          ) : (
            <LoadingButton
              type="submit"
              loading={loading}
              loadingLabel={t.setup.initializingCommunity}
              className="ml-auto h-10 rounded-lg px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07100d]"
            >
              {t.setup.initializeCommunity}
            </LoadingButton>
          )}
        </div>
      </form>
    </SetupFrame>
  );
}

function SetupStepperHeader({
  steps,
  activeStepIndex,
  highestCompletedStepIndex,
  disabled,
  progressLabel,
  navigationLabel,
  completedLabel,
  onStepSelect,
}: {
  steps: Array<{ id: SetupStepId; number: number; title: string; description: string }>;
  activeStepIndex: number;
  highestCompletedStepIndex: number;
  disabled: boolean;
  progressLabel: string;
  navigationLabel: string;
  completedLabel: string;
  onStepSelect: (stepIndex: number) => void;
}) {
  return (
    <nav className="border-b border-white/[0.08] bg-white/[0.018] px-6 py-5 sm:px-8" aria-label={navigationLabel}>
      <div className="md:hidden">
        <p className="text-xs font-semibold uppercase text-accent/75">{progressLabel}</p>
        <p className="mt-2 text-sm font-bold text-white">{steps[activeStepIndex].title}</p>
        <p className="mt-1 text-xs text-white/45">{steps[activeStepIndex].description}</p>
        <ol className="mt-4 grid grid-cols-3 gap-2">
          {steps.map((step, index) => {
            const isActive = activeStepIndex === index;
            const isCompleted = index <= highestCompletedStepIndex && !isActive;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onStepSelect(index)}
                  disabled={disabled || (!isActive && !isCompleted)}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`${step.title}${isCompleted ? `, ${completedLabel}` : ''}`}
                  className={cn(
                    'h-2 w-full rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45',
                    isActive || isCompleted ? 'bg-accent' : 'bg-white/10',
                    !isActive && !isCompleted && 'cursor-not-allowed',
                  )}
                >
                  <span className="sr-only">{step.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <ol className="hidden items-center md:flex">
        {steps.map((step, index) => {
          const isActive = activeStepIndex === index;
          const isCompleted = index <= highestCompletedStepIndex && !isActive;
          return (
            <li key={step.id} className={cn('flex min-w-0 items-center', index < steps.length - 1 && 'flex-1')}>
              <button
                type="button"
                onClick={() => onStepSelect(index)}
                disabled={disabled || (!isActive && !isCompleted)}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`${step.title}${isCompleted ? `, ${completedLabel}` : ''}`}
                className={cn(
                  'group flex min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45',
                  !isActive && !isCompleted && 'cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
                    isCompleted && 'bg-accent text-background',
                    isActive && 'bg-accent text-background ring-4 ring-accent/10',
                    !isActive && !isCompleted && 'bg-white/[0.07] text-white/35',
                  )}
                >
                  {isCompleted ? <Check size={17} aria-hidden="true" /> : step.number}
                </span>
                <span className="min-w-0">
                  <span className={cn('block truncate text-sm font-bold', isActive ? 'text-white' : isCompleted ? 'text-white/75' : 'text-white/38')}>{step.title}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', isActive || isCompleted ? 'text-white/43' : 'text-white/25')}>{step.description}</span>
                </span>
              </button>
              {index < steps.length - 1 && <ChevronRight className="mx-auto size-4 shrink-0 text-white/20" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CommunityStep({
  form,
  errors,
  communityNameRef,
  communitySlugRef,
  onChange,
  t,
}: {
  form: SetupFormState;
  errors: SetupFieldErrors;
  communityNameRef: React.RefObject<HTMLInputElement | null>;
  communitySlugRef: React.RefObject<HTMLInputElement | null>;
  onChange: (key: SetupField, value: string) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <section aria-labelledby="setup-community-heading">
      <StepIntroduction id="setup-community-heading" title={t.setup.communityHeading} description={t.setup.communityStepDescription} />
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <Input id="setup-community-name" inputRef={communityNameRef} label={t.setup.communityName} value={form.communityName} error={errors.communityName} onChange={(value) => onChange('communityName', value)} />
        <Input id="setup-community-slug" inputRef={communitySlugRef} label={t.setup.communitySlug} value={form.communitySlug} error={errors.communitySlug} onChange={(value) => onChange('communitySlug', value)} />
        <SelectField label={t.setup.defaultLanguage}>
          <AppSelect
            value={form.defaultLanguage}
            options={languageOptions.map((value) => ({ value, label: value === 'en' ? t.admin.languageEnglish : t.admin.languageFrench }))}
            onChange={(value) => onChange('defaultLanguage', value)}
            ariaLabel={t.setup.defaultLanguage}
            className="mt-2"
          />
        </SelectField>
        <SelectField label={t.setup.timezone}>
          <AppSelect
            value={form.timezone}
            options={timezoneOptions.map((value) => ({ value, label: value }))}
            onChange={(value) => onChange('timezone', value)}
            ariaLabel={t.setup.timezone}
            className="mt-2"
          />
        </SelectField>
      </div>
    </section>
  );
}

function OwnerStep({
  form,
  errors,
  refs,
  avatar,
  onChange,
  onAvatarSelected,
  onGenerateAvatar,
  onRemoveUploadedAvatar,
  t,
}: {
  form: SetupFormState;
  errors: SetupFieldErrors;
  refs: {
    ownerFullNameRef: React.RefObject<HTMLInputElement | null>;
    ownerEmailRef: React.RefObject<HTMLInputElement | null>;
    ownerPasswordRef: React.RefObject<HTMLInputElement | null>;
    confirmPasswordRef: React.RefObject<HTMLInputElement | null>;
  };
  avatar: {
    mode: OwnerAvatarMode;
    generatedSeed: string;
    previewUrl: string;
    error: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
  };
  onChange: (key: SetupField, value: string) => void;
  onAvatarSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerateAvatar: () => void;
  onRemoveUploadedAvatar: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <section aria-labelledby="setup-owner-heading">
      <StepIntroduction id="setup-owner-heading" title={t.setup.ownerHeading} description={t.setup.ownerStepDescription} />
      <OwnerAvatarField
        name={form.ownerFullName}
        mode={avatar.mode}
        generatedSeed={avatar.generatedSeed}
        previewUrl={avatar.previewUrl}
        error={avatar.error}
        inputRef={avatar.inputRef}
        onAvatarSelected={onAvatarSelected}
        onGenerateAvatar={onGenerateAvatar}
        onRemoveUploadedAvatar={onRemoveUploadedAvatar}
        t={t}
      />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Input id="setup-owner-name" inputRef={refs.ownerFullNameRef} label={t.setup.ownerFullName} value={form.ownerFullName} error={errors.ownerFullName} autoComplete="name" onChange={(value) => onChange('ownerFullName', value)} />
        <Input id="setup-owner-email" inputRef={refs.ownerEmailRef} label={t.setup.ownerEmail} type="email" value={form.ownerEmail} error={errors.ownerEmail} autoComplete="email" onChange={(value) => onChange('ownerEmail', value)} />
        <Input id="setup-owner-password" inputRef={refs.ownerPasswordRef} label={t.setup.ownerPassword} type="password" value={form.ownerPassword} error={errors.ownerPassword} autoComplete="new-password" onChange={(value) => onChange('ownerPassword', value)} />
        <Input id="setup-confirm-password" inputRef={refs.confirmPasswordRef} label={t.setup.confirmPassword} type="password" value={form.confirmPassword} error={errors.confirmPassword} autoComplete="new-password" onChange={(value) => onChange('confirmPassword', value)} />
      </div>
    </section>
  );
}

function OwnerAvatarField({
  name,
  mode,
  generatedSeed,
  previewUrl,
  error,
  inputRef,
  onAvatarSelected,
  onGenerateAvatar,
  onRemoveUploadedAvatar,
  t,
}: {
  name: string;
  mode: OwnerAvatarMode;
  generatedSeed: string;
  previewUrl: string;
  error: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerateAvatar: () => void;
  onRemoveUploadedAvatar: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="mt-7 flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center">
      <ProfilePhoto
        name={name || t.setup.ownerAvatar}
        avatarUrl={mode === 'upload' ? previewUrl : undefined}
        dicebearStyle={mode === 'generated' ? 'notionists' : undefined}
        dicebearSeed={mode === 'generated' ? generatedSeed : undefined}
        size="lg"
        alt={t.setup.avatarPreview}
        className="h-20 w-20 rounded-2xl border-white/[0.1] bg-white/[0.04]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{t.setup.ownerAvatar}</p>
        <p className="mt-1 text-xs text-white/45">{mode === 'upload' ? t.setup.customAvatar : t.setup.generatedAvatar}</p>
        <input
          ref={inputRef}
          type="file"
          accept={avatarUploadAccept}
          aria-label={t.setup.uploadImage}
          className="hidden"
          onChange={onAvatarSelected}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGenerateAvatar}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white/65 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <UserRound size={14} aria-hidden="true" />
            {t.setup.generateAvatar}
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-background transition hover:bg-[#74e4b1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <ImagePlus size={14} aria-hidden="true" />
            {mode === 'upload' ? t.setup.changeImage : t.setup.uploadImage}
          </button>
          {mode === 'upload' && (
            <button
              type="button"
              onClick={onRemoveUploadedAvatar}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300/15 px-3 text-xs font-semibold text-rose-100/80 transition hover:border-rose-300/30 hover:bg-rose-300/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/35"
            >
              <X size={14} aria-hidden="true" />
              {t.setup.removeImage}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-rose-200" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function SetupReviewSummary({
  form,
  ownerAvatarMode,
  ownerAvatarSeed,
  ownerAvatarPreviewUrl,
  t,
}: {
  form: SetupFormState;
  ownerAvatarMode: OwnerAvatarMode;
  ownerAvatarSeed: string;
  ownerAvatarPreviewUrl: string;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const languageLabel = form.defaultLanguage === 'fr' ? t.admin.languageFrench : t.admin.languageEnglish;
  return (
    <section aria-labelledby="setup-review-heading">
      <StepIntroduction id="setup-review-heading" title={t.setup.reviewHeading} description={t.setup.reviewStepDescription} />
      <div className="mt-7 flex items-center gap-3 border-y border-white/[0.08] py-4">
        <ProfilePhoto
          name={form.ownerFullName || t.setup.ownerAvatar}
          avatarUrl={ownerAvatarMode === 'upload' ? ownerAvatarPreviewUrl : undefined}
          dicebearStyle={ownerAvatarMode === 'generated' ? 'notionists' : undefined}
          dicebearSeed={ownerAvatarMode === 'generated' ? ownerAvatarSeed : undefined}
          size="md"
          alt={t.setup.avatarPreview}
        />
        <div>
          <p className="text-xs text-white/38">{t.setup.ownerAvatar}</p>
          <p className="mt-1 text-sm font-medium text-white/78">{ownerAvatarMode === 'upload' ? t.setup.customAvatar : t.setup.generatedAvatar}</p>
        </div>
      </div>
      <dl className="divide-y divide-white/[0.08] border-b border-white/[0.08]">
        <ReviewGroup
          title={t.setup.stepCommunity}
          rows={[
            [t.setup.communityName, form.communityName],
            [t.setup.communitySlug, form.communitySlug],
          ]}
        />
        <ReviewGroup
          title={t.setup.regionalDefaults}
          rows={[
            [t.setup.defaultLanguage, languageLabel],
            [t.setup.timezone, form.timezone],
          ]}
        />
        <ReviewGroup
          title={t.setup.stepOwner}
          rows={[
            [t.setup.ownerFullName, form.ownerFullName],
            [t.setup.ownerEmail, form.ownerEmail],
            [t.setup.ownerPassword, t.setup.passwordConfigured],
          ]}
        />
      </dl>
    </section>
  );
}

function ReviewGroup({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="grid gap-4 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-xs font-bold uppercase text-accent/75">{title}</dt>
      <dd className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
            <span className="text-xs text-white/38">{label}</span>
            <span className="break-words text-sm font-medium text-white/78">{value}</span>
          </div>
        ))}
      </dd>
    </div>
  );
}

function StepIntroduction({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div>
      <h2 id={id} className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">{description}</p>
    </div>
  );
}

function SetupFrame({ brand, title, subtitle, children }: { brand: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <AuthBackground contentClassName="px-4 py-8">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center">
        <Card className="w-full overflow-hidden rounded-2xl border-white/[0.08] bg-[#07100d]/95 p-0 shadow-2xl shadow-black/30">
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-6 sm:px-8">
            <div>
              <p className="text-xs font-semibold uppercase text-accent/80">{brand}</p>
              <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">{title}</h1>
              {subtitle && <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">{subtitle}</p>}
            </div>
            <AuthHeaderControls />
          </div>
          {children}
        </Card>
      </div>
    </AuthBackground>
  );
}

function Input({
  id,
  label,
  value,
  onChange,
  inputRef,
  error,
  type = 'text',
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  error?: string;
  type?: string;
  autoComplete?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-white/72">{label}</label>
      <input
        ref={inputRef}
        id={id}
        required
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'mt-2 h-11 w-full rounded-xl border bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:ring-2',
          error ? 'border-rose-300/45 focus:border-rose-300/70 focus:ring-rose-300/15' : 'border-white/[0.08] focus:border-accent/60 focus:ring-accent/15',
        )}
      />
      {error && <p id={errorId} className="mt-1.5 text-xs text-rose-200" role="alert">{error}</p>}
    </div>
  );
}

function SelectField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block min-w-0 text-sm font-medium text-white/72">
      <span>{label}</span>
      {children}
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 63);
}

async function canDecodeImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width > 0 && bitmap.height > 0;
      bitmap.close();
      return valid;
    } catch {
      return false;
    }
  }
  const objectUrl = URL.createObjectURL(file);
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(false);
    };
    image.src = objectUrl;
  });
}

async function setupErrorMessage(response: Response, setup: ReturnType<typeof useI18n>['t']['setup']) {
  if (response.status === 403) return setup.setupTokenRequired;
  const message = await response.json().then((body) => Array.isArray(body?.message) ? body.message[0] : body?.message).catch(() => '');
  if (message === 'Owner email is already in use.') return setup.emailAlreadyInUse;
  if (response.status === 409) return setup.setupAlreadyCompleted;
  return setup.setupFailed;
}

function getTimezoneOptions() {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }).supportedValuesOf;
  const values = supportedValuesOf ? supportedValuesOf('timeZone') : ['Africa/Kinshasa', 'Africa/Lagos', 'Africa/Johannesburg', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Toronto'];
  return ['UTC', ...values.filter((value) => value !== 'UTC').sort((a, b) => a.localeCompare(b))];
}
