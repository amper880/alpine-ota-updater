/** Minutes until GitHub lifts the rate limit, from the X-RateLimit-Reset header. */
export function rateLimitMinutes(resetHeader: string | null, now = Date.now()): number | undefined {
  const reset = Number(resetHeader);
  if (!resetHeader || !Number.isFinite(reset) || reset <= 0) return undefined;
  return Math.max(1, Math.ceil((reset * 1000 - now) / 60000));
}
