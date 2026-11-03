import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

const API_KEY_HEADER = 'x-api-key';

interface ApiKeyRequest {
  headers: Record<string, string | string[] | undefined>;
  apiClient?: { authenticated: true };
}

/**
 * Checks `X-API-Key` against `API_KEY` in constant time, so timing can't leak
 * the key. Fails closed: if `API_KEY` is not set, every request is rejected.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.configService.get<string>('API_KEY');
    if (!configuredKey) {
      throw new UnauthorizedException(
        'API key authentication is not available',
      );
    }

    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const headerValue = request.headers[API_KEY_HEADER];
    const providedKey = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue;

    if (!providedKey || !this.safeEqual(providedKey, configuredKey)) {
      throw new UnauthorizedException('API key is missing or invalid');
    }

    request.apiClient = { authenticated: true };
    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
      return false;
    }
    return timingSafeEqual(aBuffer, bBuffer);
  }
}
