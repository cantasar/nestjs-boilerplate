import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';

/**
 * Opt a handler out of the success envelope. The `ResponseTransformInterceptor`
 * returns its result verbatim — use for non-JSON payloads, file streams, or
 * routes that must produce a bespoke body shape.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
