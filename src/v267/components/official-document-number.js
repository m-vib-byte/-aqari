// Existing reservations remain valid on retries; typed numbers bind the kind.
export function validOfficialDocumentNumber(value,kind){
 if(typeof value!=='string'||typeof kind!=='string'||!/^[a-z][a-z_]{1,63}$/.test(kind))return false;
 if(/^AQ-\d{8}-\d{8,}$/.test(value))return true;
 const match=/^AQ-([A-Z][A-Z_]{1,63})-\d{8}-(\d{8,})$/.exec(value);
 return !!match&&match[1]===kind.toUpperCase()&&/[1-9]/.test(match[2]);
}
