import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { SmsProcessor } from '../queue/sms.processor';
import { SmsOtpJob } from '../queue/sms-queue.types';
import { SMS_SENDER } from '../interfaces/sms-sender.interface';
import { RedisService } from '../../../shared/redis/redis.service';

describe('SmsProcessor', () => {
  const sender = { send: jest.fn<Promise<void>, [string, string]>() };
  const redis = {
    get: jest.fn<Promise<string | null>, [string]>(),
    setWithExpirySeconds: jest.fn<Promise<void>, [string, string, number]>(),
  };
  const config = { get: jest.fn() };

  let processor: SmsProcessor;

  const job = (data: SmsOtpJob) => ({ data }) as Job<SmsOtpJob>;

  beforeEach(async () => {
    jest.clearAllMocks();
    sender.send.mockResolvedValue(undefined);
    redis.get.mockResolvedValue(null);
    redis.setWithExpirySeconds.mockResolvedValue(undefined);
    config.get.mockReturnValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SmsProcessor,
        { provide: SMS_SENDER, useValue: sender },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    processor = moduleRef.get(SmsProcessor);
  });

  it('templates the OTP and sends, then sets the dedup marker', async () => {
    config.get.mockReturnValue('Code is {otp}!');
    await processor.process(job({ to: '+1555', otp: '123456' }));
    expect(sender.send).toHaveBeenCalledWith('+1555', 'Code is 123456!');
    expect(redis.setWithExpirySeconds).toHaveBeenCalledWith(
      'sms:sent:+1555:123456',
      '1',
      900,
    );
  });

  it('uses the default template when none configured', async () => {
    await processor.process(job({ to: '+1555', otp: '999' }));
    expect(sender.send).toHaveBeenCalledWith('+1555', 'Your code: 999');
  });

  it('skips when a dedup marker is already present', async () => {
    redis.get.mockResolvedValue('1');
    await processor.process(job({ to: '+1555', otp: '123456' }));
    expect(sender.send).not.toHaveBeenCalled();
    expect(redis.setWithExpirySeconds).not.toHaveBeenCalled();
  });

  it('does not set the dedup marker when the send throws', async () => {
    sender.send.mockRejectedValue(new Error('gateway down'));
    await expect(
      processor.process(job({ to: '+1555', otp: '123456' })),
    ).rejects.toThrow('gateway down');
    expect(redis.setWithExpirySeconds).not.toHaveBeenCalled();
  });
});
