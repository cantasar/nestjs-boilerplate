import { registerDecorator, type ValidationOptions } from 'class-validator';

const MD5_PATTERN = /^[a-fA-F0-9]{32}$/;

/**
 * Validate that a property is a 32-character hexadecimal MD5 hash.
 * class-validator ships @IsHash but accepts a string algo argument which is
 * verbose at call sites; these single-algo decorators read cleaner on DTOs.
 */
export function IsHashMd5(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isHashMd5',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && MD5_PATTERN.test(value);
        },
        defaultMessage(): string {
          return '$property must be a 32-character hexadecimal MD5 hash';
        },
      },
    });
  };
}
