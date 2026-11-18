/** Идентификатор в стиле ULID: время + случайная часть, сортируется по времени создания. */
const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function ulid(now = Date.now()): string {
  let t = '', n = now;
  for (let i = 0; i < 10; i++) { t = A[n % 32] + t; n = Math.floor(n / 32); }
  const r = new Uint8Array(16);
  crypto.getRandomValues(r);
  return t + Array.from(r, (b) => A[b % 32]).join('');
}
