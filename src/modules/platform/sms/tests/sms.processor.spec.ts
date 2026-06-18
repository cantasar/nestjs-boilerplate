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
    acquireLock: jest.fn<Promise<string | null>, [string, number]>(),
    del: jest.fn<Promise<number>, [string]>(),
  };
  const config = { get: jest.fn() };

  let processor: SmsProcessor;

  const job = (data: SmsOtpJob) => ({ data }) as Job<SmsOtpJob>;

  beforeEach(async () => {
    jest.clearAllMocks();
    sender.send.mockResolvedValue(undefined);
    redis.acquireLock.mockResolvedValue('token');
    redis.del.mockResolvedValue(1);
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

  it('claims the dedup key, templates the OTP and sends', async () => {
    config.get.mockReturnValue('Code is {otp}!');
    await processor.process(job({ to: '+1555', otp: '123456' }));
    expect(redis.acquireLock).toHaveBeenCalledWith(
      'sms:sent:+1555:123456',
      900,
    );
    expect(sender.send).toHaveBeenCalledWith('+1555', 'Code is 123456!');
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('uses the default template when none configured', async () => {
    await processor.process(job({ to: '+1555', otp: '999' }));
    expect(sender.send).toHaveBeenCalledWith('+1555', 'Your code: 999');
  });

  it('skips when the dedup key is already claimed', async () => {
    redis.acquireLock.mockResolvedValue(null);
    await processor.process(job({ to: '+1555', otp: '123456' }));
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('releases the dedup claim when the send throws', async () => {
    sender.send.mockRejectedValue(new Error('gateway down'));
    await expect(
      processor.process(job({ to: '+1555', otp: '123456' })),
    ).rejects.toThrow('gateway down');
    expect(redis.del).toHaveBeenCalledWith('sms:sent:+1555:123456');
  });
});
