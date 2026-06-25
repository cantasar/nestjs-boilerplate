/**
 * WebSocket CORS origins for a `@WebSocketGateway`. Closed by default — set
 * `WS_CORS_ORIGINS` (comma-separated) to allow specific origins.
 */
export function wsCorsOrigin(): string[] | boolean {
  const raw = process.env.WS_CORS_ORIGINS?.trim();
  if (!raw) return false;
  return raw.split(',').map((o) => o.trim());
}
