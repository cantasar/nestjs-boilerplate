import { isIP } from 'node:net';
import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Validate that a property is an IPv6 CIDR block (e.g. `2001:db8::/32`).
 *
 * The string is split on `/`; the left half must be a valid IPv6 address (via
 * Node's `net.isIP`) and the right half must be an integer in `[0, 128]`.
 * This sidesteps the fragile mega-regex approach.
 */
export function IsIPv6Cidr(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isIPv6Cidr',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') {
            return false;
          }
          const slashIndex = value.indexOf('/');
          if (slashIndex < 0) {
            return false;
          }
          const address = value.slice(0, slashIndex);
          const prefix = value.slice(slashIndex + 1);
          if (isIP(address) !== 6) {
            return false;
          }
          if (!/^\d+$/.test(prefix)) {
            return false;
          }
          const prefixLength = Number(prefix);
          return prefixLength >= 0 && prefixLength <= 128;
        },
        defaultMessage(): string {
          return '$property must be an IPv6 CIDR block (e.g. "2001:db8::/32")';
        },
      },
    });
  };
}
