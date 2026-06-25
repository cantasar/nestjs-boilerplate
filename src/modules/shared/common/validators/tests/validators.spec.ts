import { validate } from 'class-validator';
import { IsHashMd5 } from '../is-hash-md5.validator';
import { IsHashSha1 } from '../is-hash-sha1.validator';
import { IsHashSha256 } from '../is-hash-sha256.validator';
import { IsIPv6Cidr } from '../is-ipv6-cidr.validator';
import { IsQueryString } from '../is-query-string.validator';

class Md5Dto {
  @IsHashMd5()
  value!: string;
}
class Sha1Dto {
  @IsHashSha1()
  value!: string;
}
class Sha256Dto {
  @IsHashSha256()
  value!: string;
}
class CidrDto {
  @IsIPv6Cidr()
  value!: string;
}
class QueryStringDto {
  @IsQueryString()
  value!: string;
}

async function failsValidation(instance: object): Promise<boolean> {
  const errors = await validate(instance);
  return errors.length > 0;
}

async function passesValidation(instance: object): Promise<boolean> {
  const errors = await validate(instance);
  return errors.length === 0;
}

describe('IsHashMd5', () => {
  it.each([
    'd41d8cd98f00b204e9800998ecf8427e',
    'ABCDEF1234567890abcdef1234567890',
  ])('accepts %s', async (value) => {
    const dto = new Md5Dto();
    dto.value = value;
    expect(await passesValidation(dto)).toBe(true);
  });
  it.each([
    'short',
    'd41d8cd98f00b204e9800998ecf8427ez', // non-hex
    'd41d8cd98f00b204e9800998ecf8427', // 31 chars
    '',
  ])('rejects %s', async (value) => {
    const dto = new Md5Dto();
    dto.value = value;
    expect(await failsValidation(dto)).toBe(true);
  });
});

describe('IsHashSha1', () => {
  it('accepts a 40-char hex value', async () => {
    const dto = new Sha1Dto();
    dto.value = 'a'.repeat(40);
    expect(await passesValidation(dto)).toBe(true);
  });
  it('rejects 39-char value', async () => {
    const dto = new Sha1Dto();
    dto.value = 'a'.repeat(39);
    expect(await failsValidation(dto)).toBe(true);
  });
});

describe('IsHashSha256', () => {
  it('accepts a 64-char hex value', async () => {
    const dto = new Sha256Dto();
    dto.value = 'F'.repeat(64);
    expect(await passesValidation(dto)).toBe(true);
  });
  it('rejects non-hex char', async () => {
    const dto = new Sha256Dto();
    dto.value = 'g'.repeat(64);
    expect(await failsValidation(dto)).toBe(true);
  });
});

describe('IsIPv6Cidr', () => {
  it.each(['2001:db8::/32', '::1/128', 'fe80::1/64'])(
    'accepts %s',
    async (value) => {
      const dto = new CidrDto();
      dto.value = value;
      expect(await passesValidation(dto)).toBe(true);
    },
  );
  it.each([
    '2001:db8::', // no prefix
    '2001:db8::/129', // prefix > 128
    '192.168.0.0/24', // IPv4 CIDR
    'notanaddress/32',
    '',
  ])('rejects %s', async (value) => {
    const dto = new CidrDto();
    dto.value = value;
    expect(await failsValidation(dto)).toBe(true);
  });
});

describe('IsQueryString', () => {
  it.each(['?', '?a=1', '?a=1&b=2', '?flag', '?a=1&b'])(
    'accepts %s',
    async (value) => {
      const dto = new QueryStringDto();
      dto.value = value;
      expect(await passesValidation(dto)).toBe(true);
    },
  );
  it.each(['a=1', '?a=1 ', '?a=1&', '?=v'])('rejects %s', async (value) => {
    const dto = new QueryStringDto();
    dto.value = value;
    expect(await failsValidation(dto)).toBe(true);
  });
});
