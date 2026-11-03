import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';

/**
 * Skips the success envelope, so the handler's result is sent as is. Use it
 * for non-JSON bodies, file streams, or custom response shapes.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
