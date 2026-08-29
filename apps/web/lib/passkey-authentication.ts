import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  WebAuthnError,
} from '@simplewebauthn/browser';

type PasskeyCapabilityChecks = {
  webAuthn: () => boolean;
  autofill: () => Promise<boolean>;
};

export async function browserSupportsConditionalPasskeyAuthentication(
  checks: PasskeyCapabilityChecks = {
    webAuthn: browserSupportsWebAuthn,
    autofill: browserSupportsWebAuthnAutofill,
  },
) {
  return checks.webAuthn() && await checks.autofill();
}

export function isPasskeyAuthenticationCancellation(error: unknown) {
  if (error instanceof WebAuthnError) {
    if (error.code === 'ERROR_CEREMONY_ABORTED') return true;
    if (error.cause instanceof Error && (error.cause.name === 'NotAllowedError' || error.cause.name === 'AbortError')) return true;
  }
  return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError');
}
