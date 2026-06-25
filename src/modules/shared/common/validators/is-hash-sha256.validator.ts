import { registerDecorator, type ValidationOptions } from 'class-validator';

const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;

/** Validate that a property is a 64-character hexadecimal SHA-256 hash. */
export function IsHashSha256(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isHashSha256',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && SHA256_PATTERN.test(value);
        },
        defaultMessage(): string {
          return '$property must be a 64-character hexadecimal SHA-256 hash';
        },
      },
    });
  };
}
