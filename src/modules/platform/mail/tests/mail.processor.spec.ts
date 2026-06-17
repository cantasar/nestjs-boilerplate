import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MailProcessor } from '../queue/mail.processor';
import { MailJob } from '../queue/mail-queue.types';
import { MailService } from '../mail.service';
import { RedisService } from '../../../shared/redis/redis.service';

describe('MailProcessor', () => {
  const mail = { sendOtpEmail: jest.fn<Promise<void>, [string, string]>() };
  const redis = {
    get: jest.fn<Promise<string | null>, [string]>(),
    setWithExpirySeconds: jest.fn<Promise<void>, [string, string, number]>(),
  };

  let processor: MailProcessor;

  const job = (data: MailJob) => ({ data }) as Job<MailJob>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mail.sendOtpEmail.mockResolvedValue(undefined);
    redis.get.mockResolvedValue(null);
    redis.setWithExpirySeconds.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MailProcessor,
        { provide: MailService, useValue: mail },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    processor = moduleRef.get(MailProcessor);
  });

  it('sends the OTP mail and sets the dedup marker', async () => {
    await processor.process(job({ template: 'otp', to: 'a@b.c', otp: '123' }));
    expect(mail.sendOtpEmail).toHaveBeenCalledWith('a@b.c', '123');
    expect(redis.setWithExpirySeconds).toHaveBeenCalledWith(
      'mail:sent:otp:a@b.c:123',
      '1',
      900,
    );
  });

  it('skips when a dedup marker is already present', async () => {
    redis.get.mockResolvedValue('1');
    await processor.process(job({ template: 'otp', to: 'a@b.c', otp: '123' }));
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
    expect(redis.setWithExpirySeconds).not.toHaveBeenCalled();
  });

  it('does not set the dedup marker when the send throws', async () => {
    mail.sendOtpEmail.mockRejectedValue(new Error('smtp down'));
    await expect(
      processor.process(job({ template: 'otp', to: 'a@b.c', otp: '123' })),
    ).rejects.toThrow('smtp down');
    expect(redis.setWithExpirySeconds).not.toHaveBeenCalled();
  });
});
