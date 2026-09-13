// Civil dates only: no browser time zone or daylight-saving conversion.
export function leaseEndFromMonths(start, months) {
  if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw Error('أدخل تاريخ بداية صحيحًا.');
  const [year, month, day] = start.split('-').map(Number);
  if (year < 1900 || year > 9998 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) throw Error('أدخل تاريخ بداية صحيحًا.');
  const raw = String(months ?? '').trim();
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 600) throw Error('أدخل مدة صحيحة من شهر إلى ٦٠٠ شهر.');
  const target = new Date(Date.UTC(year, month - 1 + Number(raw), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  // Inclusive end: the day before the next term, capped at month end when the
  // starting day has no counterpart. A term starting on day 1 ends last month.
  target.setUTCDate(day === 1 ? 0 : Math.min(day - 1, lastDay));
  if (target.getUTCFullYear() > 9999) throw Error('تاريخ نهاية العقد خارج النطاق المدعوم.');
  return target.toISOString().slice(0, 10);
}
