import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import Redis from 'ioredis';

const incrementWithExpiryScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

const reserveNoticeScript = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return {0, redis.call('TTL', KEYS[1]), 1}
end
local daily = tonumber(redis.call('GET', KEYS[2]) or '0')
if daily >= tonumber(ARGV[2]) then
  return {0, redis.call('TTL', KEYS[2]), 2}
end
redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
daily = redis.call('INCR', KEYS[2])
if daily == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
return {1, redis.call('TTL', KEYS[1]), 0}
`;

export type RegistrationLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  firstBlocked?: boolean;
  reason?: 'COMMUNITY_EMAIL_COOLDOWN' | 'GLOBAL_EMAIL_DAILY_LIMIT';
};

@Injectable()
export class RegistrationRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RegistrationRateLimitService.name);
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
  });

  hashReference(value: string) {
    const secret = process.env.REGISTRATION_KEY_HASH_SECRET ?? process.env.JWT_SECRET ?? 'local-development-registration-key';
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  async consumeIp(communityId: string, ipAddress: string, limit: number, windowMinutes: number): Promise<RegistrationLimitResult> {
    const ipHash = this.hashReference(ipAddress);
    const key = `registration:attempt:ip:${communityId}:${ipHash}`;
    try {
      const [count, ttl] = await this.redis.eval(
        incrementWithExpiryScript,
        1,
        key,
        String(windowMinutes * 60),
      ) as [number, number];
      return {
        allowed: Number(count) <= limit,
        retryAfterSeconds: Math.max(1, Number(ttl)),
        firstBlocked: Number(count) === limit + 1,
      };
    } catch (error) {
      this.logger.error(`Registration IP limiter unavailable: ${safeErrorName(error)}`);
      throw new ServiceUnavailableException('Registration protection is temporarily unavailable.');
    }
  }

  async reserveNotice(
    communityId: string,
    normalizedEmail: string,
    cooldownHours: number,
    dailyLimit: number,
  ): Promise<RegistrationLimitResult> {
    const emailHash = this.hashReference(normalizedEmail);
    const cooldownKey = `registration:notice:community-email:${communityId}:${emailHash}`;
    const dailyKey = `registration:notice:global-email:${emailHash}`;
    try {
      const [allowed, ttl, reason] = await this.redis.eval(
        reserveNoticeScript,
        2,
        cooldownKey,
        dailyKey,
        String(cooldownHours * 60 * 60),
        String(dailyLimit),
      ) as [number, number, number];
      return {
        allowed: Number(allowed) === 1,
        retryAfterSeconds: Math.max(1, Number(ttl)),
        reason: Number(reason) === 1
          ? 'COMMUNITY_EMAIL_COOLDOWN'
          : Number(reason) === 2
            ? 'GLOBAL_EMAIL_DAILY_LIMIT'
            : undefined,
      };
    } catch (error) {
      this.logger.error(`Registration notification limiter unavailable: ${safeErrorName(error)}`);
      throw new ServiceUnavailableException('Registration protection is temporarily unavailable.');
    }
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : 'RedisError';
}
