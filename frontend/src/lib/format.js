export function crDisplay(lakh) {
  const n = Number(lakh) || 0;
  const cr = n / 100;
  const s = cr.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  return `₹${s} Cr`;
}

export function lakhShort(lakh) {
  const n = Number(lakh) || 0;
  if (n >= 100) return crDisplay(n);
  return `₹${n} L`;
}

export function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
