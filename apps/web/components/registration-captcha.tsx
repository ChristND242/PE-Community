'use client';

import { useEffect, useRef, useState } from 'react';

export type PublicRegistrationSecurity = {
  communityId: string;
  captchaRequired: boolean;
  provider: 'DISABLED' | 'CLOUDFLARE_TURNSTILE' | 'GOOGLE_RECAPTCHA' | 'HCAPTCHA';
  variant: 'V2_CHECKBOX' | 'V3_SCORE' | null;
  siteKey: string | null;
  action: string | null;
  requestNoteMaxLength: number;
};

type CaptchaApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string | number;
  execute?: (siteKey: string, options: { action: string }) => Promise<string>;
  remove?: (widgetId: string | number) => void;
  ready?: (callback: () => void) => void;
};

declare global {
  interface Window {
    turnstile?: CaptchaApi;
    grecaptcha?: CaptchaApi;
    hcaptcha?: CaptchaApi;
  }
}

export function RegistrationCaptcha({
  security,
  resetKey,
  onToken,
  onReady,
  loadingLabel,
  errorLabel,
}: {
  security: PublicRegistrationSecurity;
  resetKey: number;
  onToken: (token: string) => void;
  onReady: (ready: boolean) => void;
  loadingLabel: string;
  errorLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [widgetRendered, setWidgetRendered] = useState(false);

  useEffect(() => {
    if (!security.captchaRequired || !security.siteKey || security.provider === 'DISABLED') {
      setStatus('ready');
      setWidgetRendered(true);
      onReady(true);
      return;
    }
    let disposed = false;
    let widgetId: string | number | undefined;
    onReady(false);
    onToken('');
    setStatus('loading');
    setWidgetRendered(false);

    const complete = (token: string) => {
      if (disposed) return;
      onToken(token);
      setStatus('ready');
      onReady(true);
    };
    const fail = () => {
      if (disposed) return;
      onToken('');
      setStatus('error');
      onReady(false);
    };
    const expire = () => {
      if (disposed) return;
      onToken('');
      setStatus('ready');
      onReady(true);
    };
    const render = async () => {
      const container = containerRef.current;
      if (!container || disposed) return;
      container.replaceChildren();
      try {
        if (security.provider === 'CLOUDFLARE_TURNSTILE' && window.turnstile) {
          widgetId = window.turnstile.render(container, {
            sitekey: security.siteKey,
            theme: 'dark',
            action: security.action ?? undefined,
            callback: complete,
            'expired-callback': expire,
            'error-callback': fail,
          });
        } else if (security.provider === 'HCAPTCHA' && window.hcaptcha) {
          widgetId = window.hcaptcha.render(container, {
            sitekey: security.siteKey,
            theme: 'dark',
            callback: complete,
            'expired-callback': expire,
            'error-callback': fail,
          });
        } else if (security.provider === 'GOOGLE_RECAPTCHA' && window.grecaptcha) {
          if (security.variant === 'V3_SCORE' && window.grecaptcha.execute) {
            const execute = async () => complete(await window.grecaptcha!.execute!(security.siteKey!, { action: security.action ?? 'register' }));
            window.grecaptcha.ready ? window.grecaptcha.ready(() => void execute().catch(fail)) : await execute();
          } else {
            widgetId = window.grecaptcha.render(container, {
              sitekey: security.siteKey,
              theme: 'dark',
              callback: complete,
              'expired-callback': expire,
              'error-callback': fail,
            });
          }
        } else {
          fail();
        }
        if (!disposed) setWidgetRendered(true);
      } catch {
        fail();
      }
    };

    const script = ensureProviderScript(security);
    if (script.dataset.loaded === 'true') void render();
    else {
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        void render();
      }, { once: true });
      script.addEventListener('error', fail, { once: true });
    }

    return () => {
      disposed = true;
      const api = providerApi(security.provider);
      if (widgetId !== undefined) api?.remove?.(widgetId);
      onReady(false);
      onToken('');
    };
  }, [security, resetKey, onReady, onToken]);

  const challengeHeight = security.provider === 'CLOUDFLARE_TURNSTILE' ? 'min-h-[65px]' : 'min-h-[78px]';

  return (
    <div className="w-full min-w-0" data-registration-captcha>
      <div className={`relative flex w-full min-w-0 items-center justify-center overflow-hidden ${challengeHeight}`}>
        <div ref={containerRef} className="flex max-w-full items-center justify-center overflow-hidden" />
        {!widgetRendered && status === 'loading' && (
          <div className={`absolute inset-x-0 top-0 mx-auto flex w-full max-w-[300px] items-center justify-center rounded-md bg-white/[0.035] text-xs text-white/45 ${challengeHeight}`} data-captcha-placeholder>
            {loadingLabel}
          </div>
        )}
      </div>
      {status === 'error' && <p className="mt-2 text-center text-xs text-rose-200" role="status" aria-live="polite">{errorLabel}</p>}
    </div>
  );
}

function ensureProviderScript(security: PublicRegistrationSecurity) {
  const id = `registration-captcha-${security.provider}`;
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) return existing;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.defer = true;
  script.src = security.provider === 'CLOUDFLARE_TURNSTILE'
    ? 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    : security.provider === 'HCAPTCHA'
      ? 'https://js.hcaptcha.com/1/api.js?render=explicit'
      : security.variant === 'V3_SCORE'
        ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(security.siteKey ?? '')}`
        : 'https://www.google.com/recaptcha/api.js?render=explicit';
  document.head.appendChild(script);
  return script;
}

function providerApi(provider: PublicRegistrationSecurity['provider']) {
  if (provider === 'CLOUDFLARE_TURNSTILE') return window.turnstile;
  if (provider === 'GOOGLE_RECAPTCHA') return window.grecaptcha;
  if (provider === 'HCAPTCHA') return window.hcaptcha;
  return undefined;
}
