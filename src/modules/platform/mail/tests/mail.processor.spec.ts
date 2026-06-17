import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MailProcessor } from '../queue/mail.processor';
import { MailJob } from '../queue/mail-queue.types';
import { MailService } from '../mail.service';
import { RedisService } from '../../../shared/redis/redis.service';

describe('MailProcessor', () => {
  const mail = { sendOtpEmail: jest.fn<Promise<void>, [string, string]>() };
  const redis = {
    acquireLock: jest.fn<Promise<string | null>, [string, number]>(),
    del: jest.fn<Promise<number>, [string]>(),
  };

  let processor: MailProcessor;

  const job = (data: MailJob) => ({ data }) as Job<MailJob>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mail.sendOtpEmail.mockResolvedValue(undefined);
    redis.acquireLock.mockResolvedValue('token');
    redis.del.mockResolvedValue(1);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MailProcessor,
        { provide: MailService, useValue: mail },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    processor = moduleRef.get(MailProcessor);
  });

  it('claims the dedup key then sends the OTP mail', async () => {
    await processor.process(job({ template: 'otp', to: 'a@b.c', otp: '123' }));
    expect(redis.acquireLock).toHaveBeenCalledWith(
      'mail:sent:otp:a@b.c:123',
      900,
    );
    expect(mail.sendOtpEmail).toHaveBeenCalledWith('a@b.c', '123');
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('skips when the dedup key is already claimed', async () => {
    redis.acquireLock.mockResolvedValue(null);
    await processor.process(job({ template: 'otp', to: 'a@b.c', otp: '123' }));
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('releases the dedup claim when the send throws', async () => {
    mail.sendOtpEmail.mockRejectedValue(new Error('smtp down'));
    await expect(
      processor.process(job({ template: 'otp', to: 'a@b.c', otp: '123' })),
    ).rejects.toThrow('smtp down');
    expect(redis.del).toHaveBeenCalledWith('mail:sent:otp:a@b.c:123');
  });
});
