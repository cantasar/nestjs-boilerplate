import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Sentry SDK init — MUST run before any other module is imported (see main.ts).
// No DSN (dev/test, or projects not using Sentry) → init is skipped and the SDK
// stays a fully inert no-op. `Sentry.captureException` / spans become harmless
// calls, so callers never need their own enabled-check.
const dsn = process.env.SENTRY_DSN;

// instrument runs before Nest/Zod, so env is raw strings — guard against
// malformed values silently disabling tracing/profiling.
const rate = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
};

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: rate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    profileSessionSampleRate: rate(
      process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE,
      1,
    ),
    // v10 continuous profiling: profile every sampled trace automatically.
    profileLifecycle: 'trace',
    enableLogs: true,
    // Attach userId via Sentry.setUser at the auth layer; never raw IP/headers/body.
    sendDefaultPii: false,
    // Defense-in-depth: even with sendDefaultPii off, scrub request body, cookies
    // and auth headers from every event before it leaves the process, so a
    // captured exception can't carry user-supplied secrets/PII.
    beforeSend: (event) => {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        const headers = event.request.headers as
          | Record<string, unknown>
          | undefined;
        if (headers) {
          delete headers.authorization;
          delete headers.Authorization;
          delete headers.cookie;
          delete headers.Cookie;
        }
      }
      return event;
    },
    // Ship business info/warn/error to Sentry Logs, but drop pino-http's
    // per-request access logs — those flood the Logs quota and usually already
    // live in your infra's log sink. `attributes` spreads the full pino object,
    // so a pino-http entry uniquely carries BOTH `req` and `res`; a business
    // logger.log never does. Match on both (req-alone/res-alone is too broad).
    beforeSendLog: (log) => {
      const a = log.attributes ?? {};
      if ('req' in a && 'res' in a) return null;
      return log;
    },
    integrations: [
      nodeProfilingIntegration(),
      // info covers business events (logger.log); request floods filtered above.
      Sentry.pinoIntegration({ log: { levels: ['info', 'warn', 'error'] } }),
    ],
  });
} else {
  // No DSN configured: Sentry stays disabled. Logged once at startup so the
  // absence of error reporting is intentional and visible, not a silent gap.
  console.info('[instrument] SENTRY_DSN not set — Sentry disabled (no-op).');
}
