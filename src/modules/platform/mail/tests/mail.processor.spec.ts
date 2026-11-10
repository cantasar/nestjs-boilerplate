import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MailProcessor } from '../queue/mail.processor';
import { MailJob } from '../queue/mail-queue.types';
import { MailService } from '../mail.service';
import { RedisService } from '../../../shared/redis/redis.service';

describe('MailProcessor', () => {
  const mail = {
    sendVerificationEmail: jest.fn<Promise<void>, [string, string]>(),
    sendPasswordResetEmail: jest.fn<Promise<void>, [string, string]>(),
  };
  const redis = {
    acquireLock: jest.fn<Promise<string | null>, [string, number]>(),
    del: jest.fn<Promise<number>, [string]>(),
  };

  let processor: MailProcessor;

  const job = (data: MailJob) => ({ data }) as Job<MailJob>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mail.sendVerificationEmail.mockResolvedValue(undefined);
    mail.sendPasswordResetEmail.mockResolvedValue(undefined);
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

  it('claims the dedup key, then sends the verify-email mail', async () => {
    await processor.process(
      job({ template: 'verify-email', to: 'a@b.c', code: '456' }),
    );
    expect(redis.acquireLock).toHaveBeenCalledWith(
      'mail:sent:verify-email:a@b.c:456',
      900,
    );
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith('a@b.c', '456');
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('routes the password-reset template to sendPasswordResetEmail', async () => {
    await processor.process(
      job({ template: 'password-reset', to: 'a@b.c', code: '789' }),
    );
    expect(redis.acquireLock).toHaveBeenCalledWith(
      'mail:sent:password-reset:a@b.c:789',
      900,
    );
    expect(mail.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.c', '789');
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('keeps the two templates apart in the dedup key', async () => {
    await processor.process(
      job({ template: 'verify-email', to: 'a@b.c', code: '111' }),
    );
    await processor.process(
      job({ template: 'password-reset', to: 'a@b.c', code: '111' }),
    );
    const keys = redis.acquireLock.mock.calls.map(([key]) => key);
    expect(new Set(keys).size).toBe(2);
  });

  it('skips a duplicate job when the dedup key is already claimed', async () => {
    redis.acquireLock.mockResolvedValue(null);
    await processor.process(
      job({ template: 'verify-email', to: 'a@b.c', code: '123' }),
    );
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
  });

  // L19: mail logs never show the recipient address or the code.
  it('logs a skipped duplicate without the address or the code', async () => {
    const logged: string[] = [];
    const capture = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    };
    for (const level of ['log', 'debug', 'verbose', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(capture);
    }
    redis.acquireLock.mockResolvedValue(null);

    await processor.process(
      job({
        template: 'verify-email',
        to: 'private.person@example.com',
        code: '482913',
      }),
    );

    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain('private.person');
      expect(line).not.toContain('482913');
    }
    jest.restoreAllMocks();
  });

  it('logs a failed job without the address or the code', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    processor.onFailed(
      {
        id: '7',
        data: {
          template: 'password-reset',
          to: 'private.person@example.com',
          code: '482913',
        },
        opts: { attempts: 3 },
        attemptsMade: 1,
      } as Job<MailJob>,
      new Error('timeout'),
    );

    const line = String(error.mock.calls[0]?.[0]);
    expect(line).toContain('password-reset');
    expect(line).not.toContain('private.person');
    expect(line).not.toContain('482913');
    error.mockRestore();
  });

  it('releases the dedup claim when the send throws, so BullMQ can retry', async () => {
    mail.sendPasswordResetEmail.mockRejectedValue(new Error('smtp down'));
    await expect(
      processor.process(
        job({ template: 'password-reset', to: 'a@b.c', code: '123' }),
      ),
    ).rejects.toThrow('smtp down');
    expect(redis.del).toHaveBeenCalledWith(
      'mail:sent:password-reset:a@b.c:123',
    );
  });
});
