// Only the two known, read-only maintenance metric slots use this formatter.
// Persisted records, descriptions and form values never pass through it.
export function formatMaintenanceMetric(source,kind,locale){
 const match=String(source).match(kind==='response'?/^(-?\d+(?:\.\d+)?)\s+دقيقة$/:/^(-?\d+(?:\.\d+)?)\s+د\.ك$/);
 if(!match)return source;
 const value=Number(match[1]);if(!Number.isFinite(value))return source;
 const tag=({ar:'ar-KW',en:'en-KW',hi:'hi-IN',ur:'ur-PK',ml:'ml-IN'})[locale]||'ar-KW';
 return new Intl.NumberFormat(tag,kind==='response'
  ?{style:'unit',unit:'minute',unitDisplay:'short',maximumFractionDigits:1}
  :{style:'currency',currency:'KWD',minimumFractionDigits:3,maximumFractionDigits:3}).format(value);
}
