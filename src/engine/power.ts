/** Sortable key for a non-negative power, < 2^53: digit count × 1e9 + leading 9 digits. */
export function powerKey(p: bigint): number {
  if (p <= 0n) return 0;
  const str = p.toString();
  return str.length * 1000000000 + Number(str.slice(0, 9).padEnd(9, '0'));
}

export const mulRatio = (v: bigint, num: number, den: number): bigint => (v * BigInt(num)) / BigInt(den);
