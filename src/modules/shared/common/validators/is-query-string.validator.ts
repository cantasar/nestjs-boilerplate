import { registerDecorator, type ValidationOptions } from 'class-validator';

// `?key[=val]` followed by `&key[=val]` pairs; bare `?` is also accepted.
const QUERY_STRING_PATTERN = /^\?([\w-]+(=[\w-]*)?(&[\w-]+(=[\w-]*)?)*)?$/;

/**
 * Validate that a property is a URL-style query string starting with `?`
 * (e.g. `?foo=1&bar=2`). Whitespace and unencoded special chars are rejected.
 */
export function IsQueryString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isQueryString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && QUERY_STRING_PATTERN.test(value);
        },
        defaultMessage(): string {
          return '$property must be a URL-style query string (e.g. "?key=value&k2=v2")';
        },
      },
    });
  };
}
