import { HttpException, HttpStatus, Inject, Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto';
import Redis from 'ioredis';

export const PASSKEY_REDIS = Symbol('PASSKEY_REDIS');
export const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60;

type RedisClient = Pick<Redis, 'set' | 'eval' | 'quit' | 'disconnect'>;

export type RegistrationAttempt = {
  ceremony: 'registration';
  challenge: string;
  userId: string;
  sessionId: string;
  webauthnUserId: string;
};

type AuthenticationAttempt = {
  ceremony: 'authentication';
  challenge: string;
};

export type StepUpAttempt = {
  ceremony: 'step-up';
  challenge: string;
  userId: string;
  sessionId: string;
};

const consumeScript = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`;

const rateLimitScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

export class PasskeyRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many passkey requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class AuthenticationRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many authentication requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class PasskeyChallengeService implements OnModuleDestroy {
  private readonly logger = new Logger(PasskeyChallengeService.name);

  constructor(@Inject(PASSKEY_REDIS) private readonly redis: RedisClient) {}

  async createRegistrationAttempt(attempt: Omit<RegistrationAttempt, 'ceremony'>) {
    const attemptId = randomUUID();
    const result = await this.redisCall(() => this.redis.set(
      this.challengeKey(attemptId),
      JSON.stringify({ ...attempt, ceremony: 'registration' satisfies RegistrationAttempt['ceremony'] }),
      'EX',
      PASSKEY_CHALLENGE_TTL_SECONDS,
      'NX',
    ));
    if (result !== 'OK') throw new ServiceUnavailableException('Passkey setup is temporarily unavailable.');
    return attemptId;
  }

  async consumeRegistrationAttempt(attemptId: string, userId: string, sessionId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return null;
    const raw = await this.redisCall(() => this.redis.eval(consumeScript, 1, this.challengeKey(attemptId)));
    if (typeof raw !== 'string') return null;
    try {
      const attempt = JSON.parse(raw) as RegistrationAttempt;
      if (attempt.ceremony !== 'registration' || attempt.userId !== userId || attempt.sessionId !== sessionId) return null;
      return attempt;
    } catch {
      return null;
    }
  }

  async createAuthenticationAttempt(challenge: string) {
    const attemptId = randomUUID();
    const result = await this.redisCall(() => this.redis.set(
      this.authenticationChallengeKey(attemptId),
      JSON.stringify({ ceremony: 'authentication', challenge } satisfies AuthenticationAttempt),
      'EX',
      PASSKEY_CHALLENGE_TTL_SECONDS,
      'NX',
    ));
    if (result !== 'OK') throw new ServiceUnavailableException('Passkey protection is temporarily unavailable.');
    return attemptId;
  }

  async consumeAuthenticationAttempt(attemptId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return null;
    const raw = await this.redisCall(() => this.redis.eval(
      consumeScript,
      1,
      this.authenticationChallengeKey(attemptId),
    ));
    if (typeof raw !== 'string') return null;
    try {
      const attempt = JSON.parse(raw) as AuthenticationAttempt;
      return attempt.ceremony === 'authentication' && typeof attempt.challenge === 'string' ? attempt : null;
    } catch {
      return null;
    }
  }

  async createStepUpAttempt(attempt: Omit<StepUpAttempt, 'ceremony'>) {
    const attemptId = randomUUID();
    const result = await this.redisCall(() => this.redis.set(
      this.stepUpChallengeKey(attemptId),
      JSON.stringify({ ...attempt, ceremony: 'step-up' satisfies StepUpAttempt['ceremony'] }),
      'EX',
      PASSKEY_CHALLENGE_TTL_SECONDS,
      'NX',
    ));
    if (result !== 'OK') throw new ServiceUnavailableException('Identity verification is temporarily unavailable.');
    return attemptId;
  }

  async consumeStepUpAttempt(attemptId: string, userId: string, sessionId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return null;
    const raw = await this.redisCall(() => this.redis.eval(consumeScript, 1, this.stepUpChallengeKey(attemptId)));
    if (typeof raw !== 'string') return null;
    try {
      const attempt = JSON.parse(raw) as StepUpAttempt;
      if (attempt.ceremony !== 'step-up' || attempt.userId !== userId || attempt.sessionId !== sessionId) return null;
      return attempt;
    } catch {
      return null;
    }
  }

  async enforceRateLimit(scope: string, reference: string, limit: number, windowSeconds: number) {
    const { count, ttl } = await this.rateLimit(
      `auth:passkey:rate:${scope}:${this.hashReference(reference)}`,
      windowSeconds,
    );
    if (count > limit) throw new PasskeyRateLimitException(ttl);
  }

  async enforceAuthenticationRateLimit(scope: string, reference: string, limit: number, windowSeconds: number) {
    const { count, ttl } = await this.rateLimit(
      `auth:rate:${scope}:${this.hashReference(reference)}`,
      windowSeconds,
    );
    if (count > limit) throw new AuthenticationRateLimitException(ttl);
  }

  private async rateLimit(key: string, windowSeconds: number) {
    const result = await this.redisCall(() => this.redis.eval(
      rateLimitScript,
      1,
      key,
      String(windowSeconds),
    ));
    const [count, ttl] = Array.isArray(result) ? result.map(Number) : [Number.NaN, windowSeconds];
    if (!Number.isFinite(count)) throw new ServiceUnavailableException('Passkey protection is temporarily unavailable.');
    return { count, ttl: Math.max(1, Number.isFinite(ttl) ? ttl : windowSeconds) };
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }

  private challengeKey(attemptId: string) {
    return `auth:passkey:registration:${this.hashReference(attemptId)}`;
  }

  private authenticationChallengeKey(attemptId: string) {
    return `auth:passkey:authentication:${this.hashReference(attemptId)}`;
  }

  private stepUpChallengeKey(attemptId: string) {
    return `auth:passkey:step-up:${this.hashReference(attemptId)}`;
  }

  private hashReference(value: string) {
    const secret = process.env.JWT_SECRET ?? 'local-development-passkey-key';
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private async redisCall<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      this.logger.error(`Passkey Redis operation failed: ${error instanceof Error ? error.name : 'RedisError'}`);
      throw new ServiceUnavailableException('Passkey protection is temporarily unavailable.');
    }
  }
}
