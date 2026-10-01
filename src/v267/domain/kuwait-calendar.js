// Financial period defaults follow Kuwait, independent of the device time zone.
export function kuwaitMonth(now = new Date()) {
 const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit'
 }).formatToParts(now);
 return parts.find(part => part.type === 'year').value + '-' +
  parts.find(part => part.type === 'month').value;
}

export function previousKuwaitMonth(now = new Date()) {
 const [year, month] = kuwaitMonth(now).split('-').map(Number);
 return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}
