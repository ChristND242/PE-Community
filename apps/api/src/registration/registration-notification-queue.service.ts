import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EmailLocale } from '@pe/shared';
import { Queue } from 'bullmq';
import { RegistrationNoticeCategory } from './registration.types';

export type RegistrationNotificationJob = {
  category: RegistrationNoticeCategory;
  communityId: string;
  applicationId?: string;
  recipientEmail: string;
  recipientName: string;
  emailReference: string;
  noticeKey: string;
  locale: EmailLocale;
};

@Injectable()
export class RegistrationNotificationQueueService implements OnModuleDestroy {
  private readonly queue = new Queue('pe-community-notifications', {
    connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
  });

  enqueue(data: RegistrationNotificationJob) {
    return this.queue.add('registration-email', data, {
      jobId: data.noticeKey,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
