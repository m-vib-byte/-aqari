export const RECORD_LABELS={
 attendance:'حضور / Attendance',absence:'غياب / Absence',late:'تأخير / Late',overtime:'إضافي / Overtime',
 leave_request:'طلب إجازة / Leave request',advance_request:'طلب سلفة / Advance request',
 salary_certificate:'طلب شهادة راتب / Salary certificate',document_update:'تحديث مستند / Document update',
 bonus:'مكافأة / Bonus',deduction:'خصم / Deduction',custody:'عهدة / Custody',task:'مهمة / Task',
 general_request:'طلب عام / General request'
};
export const SELF_SERVICE_KINDS=['leave_request','advance_request','salary_certificate','document_update','general_request'];
export const RECORD_STATES={submitted:'قيد المراجعة / Submitted',approved:'معتمد / Approved',rejected:'مرفوض / Rejected',completed:'مكتمل / Completed',cancelled:'ملغي / Cancelled'};
export const MONTH_STATES={open:'مفتوح / Open',reviewed:'تمت المراجعة / Reviewed',approved:'معتمد / Approved',closed:'مقفل / Closed'};
export const EXPIRY_LABELS={civil_id:'البطاقة المدنية / Civil ID',passport:'الجواز / Passport',work_permit:'إذن العمل / Work permit'};

const decimal=value=>{const n=Number(value??0);if(!Number.isFinite(n)||n<0)throw Error('INVALID_AMOUNT');return Math.round(n*1000)/1000;};
export function payrollTotals(row){
 const additions=['basic','allowances','overtime','reward','loan_payment','housing','indemnity','holidays'].reduce((n,k)=>n+decimal(row[k]),0);
 const deductions=['late','absence','deductions','advance_repayment'].reduce((n,k)=>n+decimal(row[k]),0);
 if(deductions>additions)throw Error('DEDUCTIONS_EXCEED_ADDITIONS');
 return {additions:additions.toFixed(3),deductions:deductions.toFixed(3),net:(additions-deductions).toFixed(3)};
}
export function expiryState(value,today=new Date()){
 if(!value)return 'missing';const date=new Date(value+'T00:00:00Z'),base=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
 const days=Math.floor((date-base)/86400000);return days<0?'expired':days<=60?'soon':'valid';
}
export function validateAllocations(rows,allowed){
 if(!Array.isArray(rows)||!rows.length)throw Error('ALLOCATIONS_REQUIRED');const ids=new Set(),scope=new Set(allowed||[]);let total=0;
 for(const row of rows){if(!scope.has(row.property_id)||ids.has(row.property_id))throw Error('INVALID_ALLOCATION_PROPERTY');ids.add(row.property_id);total+=Number(row.share);}
 if(Math.abs(total-100)>0.001)throw Error('ALLOCATIONS_MUST_TOTAL_100');return rows.map(row=>({property_id:row.property_id,share:Number(row.share).toFixed(2)}));
}
export function csv(rows){
 const keys=['month','employee_name','property_name','state','net','share','allocated_cost'];
 const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
 return '\uFEFF'+[keys.join(','),...(rows||[]).map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n');
}

