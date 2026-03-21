import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export function createSwaggerBasicAuthMiddleware(
  expectedUser: string,
  expectedPassword: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
      res.status(401).send('Authentication required');
      return;
    }
    let decoded: string;
    try {
      decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    } catch {
      res.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
      res.status(401).send('Invalid credentials');
      return;
    }
    const separatorIndex = decoded.indexOf(':');
    const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
    const password =
      separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';
    if (
      !safeEqualsUtf8(user, expectedUser) ||
      !safeEqualsUtf8(password, expectedPassword)
    ) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
      res.status(401).send('Invalid credentials');
      return;
    }
    next();
  };
}

function safeEqualsUtf8(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
