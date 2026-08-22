import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import Redis from 'ioredis';

const reserveEmailChangeScript = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return {0, redis.call('TTL', KEYS[1]), 1}
end
local userDaily = tonumber(redis.call('GET', KEYS[2]) or '0')
if userDaily >= tonumber(ARGV[2]) then
  return {0, redis.call('TTL', KEYS[2]), 2}
end
local ipDaily = tonumber(redis.call('GET', KEYS[3]) or '0')
if ipDaily >= tonumber(ARGV[3]) then
  return {0, redis.call('TTL', KEYS[3]), 3}
end
redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
userDaily = redis.call('INCR', KEYS[2])
if userDaily == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
ipDaily = redis.call('INCR', KEYS[3])
if ipDaily == 1 then redis.call('EXPIRE', KEYS[3], 86400) end
return {1, tonumber(ARGV[1]), 0}
`;

export const EMAIL_CHANGE_COOLDOWN_SECONDS = 5 * 60;
export const EMAIL_CHANGE_DAILY_USER_LIMIT = 5;
export const EMAIL_CHANGE_DAILY_IP_LIMIT = 20;

export class EmailChangeRateLimitException extends HttpException {
  constructor(
    readonly retryAfterSeconds: number,
    readonly reason: 'COOLDOWN' | 'USER_DAILY_LIMIT' | 'IP_DAILY_LIMIT',
  ) {
    super(
      { code: 'EMAIL_CHANGE_RATE_LIMITED', message: 'Please wait before requesting another verification email.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class EmailChangeRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailChangeRateLimitService.name);
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
  });

  async reserve(userId: string, ipAddress: string) {
    const userReference = this.hashReference(userId);
    const ipReference = this.hashReference(ipAddress);
    const keys = [
      `account:email-change:cooldown:${userReference}`,
      `account:email-change:daily:user:${userReference}`,
      `account:email-change:daily:ip:${ipReference}`,
    ];
    try {
      const [allowed, ttl, reason] = await this.redis.eval(
        reserveEmailChangeScript,
        3,
        ...keys,
        String(EMAIL_CHANGE_COOLDOWN_SECONDS),
        String(EMAIL_CHANGE_DAILY_USER_LIMIT),
        String(EMAIL_CHANGE_DAILY_IP_LIMIT),
      ) as [number, number, number];
      if (Number(allowed) === 1) return;
      throw new EmailChangeRateLimitException(
        Math.max(1, Number(ttl)),
        Number(reason) === 1 ? 'COOLDOWN' : Number(reason) === 2 ? 'USER_DAILY_LIMIT' : 'IP_DAILY_LIMIT',
      );
    } catch (error) {
      if (error instanceof EmailChangeRateLimitException) throw error;
      this.logger.error(`Email change limiter unavailable: ${safeErrorName(error)}`);
      throw new ServiceUnavailableException('Email change protection is temporarily unavailable.');
    }
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }

  private hashReference(value: string) {
    const secret = process.env.JWT_SECRET ?? 'local-development-email-change-key';
    return createHmac('sha256', secret).update(value).digest('hex');
  }
}

function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : 'RedisError';
}
