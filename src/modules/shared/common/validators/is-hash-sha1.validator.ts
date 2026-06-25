import { registerDecorator, type ValidationOptions } from 'class-validator';

const SHA1_PATTERN = /^[a-fA-F0-9]{40}$/;

/** Validate that a property is a 40-character hexadecimal SHA-1 hash. */
export function IsHashSha1(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isHashSha1',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && SHA1_PATTERN.test(value);
        },
        defaultMessage(): string {
          return '$property must be a 40-character hexadecimal SHA-1 hash';
        },
      },
    });
  };
}
