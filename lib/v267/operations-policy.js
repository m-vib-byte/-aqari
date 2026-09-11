const KWD_SCALE = 1000;
const CHEQUE_TRANSITIONS = Object.freeze({
  scheduled: ['deposited', 'cancelled'],
  deposited: ['cleared', 'returned'],
  returned: ['redeposited', 'settled', 'cancelled'],
  redeposited: ['cleared', 'returned'],
  cleared: [],
  settled: [],
  cancelled: []
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function finite(value, code = 'INVALID_AMOUNT') {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(code, 'القيمة الرقمية غير صالحة.');
  return number;
}
function fils(value) {
  const number = finite(value);
  const scaled = Math.round(number * KWD_SCALE);
  if (Math.abs(number * KWD_SCALE - scaled) > 1e-7) fail('INVALID_PRECISION', 'المبلغ يدعم ثلاث خانات عشرية فقط.');
  return scaled;
}
function kwd(value) {
  return (value / KWD_SCALE).toFixed(3);
}
function dateOnly(value, code = 'INVALID_DATE') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) fail(code, 'التاريخ مطلوب بصيغة YYYY-MM-DD.');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) fail(code, 'التاريخ غير صالح.');
  return date;
}
function addDays(date, count) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + count);
  return copy;
}
function dayKey(date) {
  return date.toISOString().slice(0, 10);
}
function requireId(value, code = 'INVALID_ID') {
  const id = String(value || '').trim();
  if (!id || id.length > 120) fail(code, 'المعرف مطلوب.');
  return id;
}
function normalizePayment(row) {
  const status = String(row?.status || '');
  return {
    id: requireId(row?.id, 'INVALID_PAYMENT_ID'),
    dueDate: dateOnly(row?.dueDate, 'INVALID_DUE_DATE'),
    settledAt: row?.settledAt ? dateOnly(row.settledAt, 'INVALID_SETTLED_DATE') : null,
    dueFils: fils(row?.dueAmount),
    paidFils: fils(row?.paidAmount || 0),
    status
  };
}

export function transitionCheque(cheque, nextState, event = {}) {
  const current = String(cheque?.state || '');
  const next = String(nextState || '');
  if (!CHEQUE_TRANSITIONS[current]?.includes(next)) fail('INVALID_CHEQUE_TRANSITION', 'انتقال حالة الشيك غير مسموح.');
  const amountFils = fils(cheque.amount);
  if (amountFils <= 0) fail('INVALID_CHEQUE_AMOUNT', 'قيمة الشيك يجب أن تكون موجبة.');
  const eventId = requireId(event.id, 'INVALID_EVENT_ID');
  const seen = new Set((cheque.events || []).map(item => item.id));
  if (seen.has(eventId)) return {...cheque, duplicate: true};
  const occurredAt = dateOnly(event.occurredAt, 'INVALID_EVENT_DATE');
  const reference = String(event.reference || '').trim();
  if (['deposited', 'cleared', 'returned', 'redeposited'].includes(next) && reference.length < 3) {
    fail('CHEQUE_REFERENCE_REQUIRED', 'مرجع البنك مطلوب.');
  }
  const returned = next === 'returned';
  const cleared = next === 'cleared';
  return {
    ...cheque,
    state: next,
    renewalFrozen: returned ? true : cleared || next === 'settled' ? false : Boolean(cheque.renewalFrozen),
    debtAdjustment: returned ? kwd(amountFils) : '0.000',
    events: [...(cheque.events || []), {id: eventId, from: current, to: next, occurredAt: dayKey(occurredAt), reference}]
  };
}

export function allocateCommonCharge({amount, units, basis}) {
  const total = fils(amount);
  if (total <= 0) fail('INVALID_CHARGE_AMOUNT', 'قيمة الفاتورة يجب أن تكون موجبة.');
  if (!['area', 'consumption'].includes(basis)) fail('INVALID_ALLOCATION_BASIS', 'أساس التوزيع غير معتمد.');
  if (!Array.isArray(units) || units.length === 0) fail('UNITS_REQUIRED', 'الوحدات مطلوبة.');
  const rows = units.map(unit => {
    const id = requireId(unit.id, 'INVALID_UNIT_ID');
    const weight = finite(unit[basis], 'INVALID_ALLOCATION_WEIGHT');
    if (weight < 0) fail('INVALID_ALLOCATION_WEIGHT', 'وزن التوزيع لا يمكن أن يكون سالباً.');
    return {id, weight};
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) fail('DUPLICATE_UNIT', 'لا يمكن تكرار الوحدة.');
  const denominator = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!(denominator > 0)) fail('EMPTY_ALLOCATION_WEIGHT', 'مجموع أوزان التوزيع يجب أن يكون موجباً.');
  const provisional = rows.map(row => {
    const exact = total * row.weight / denominator;
    const base = Math.floor(exact);
    return {...row, base, remainder: exact - base};
  });
  let remaining = total - provisional.reduce((sum, row) => sum + row.base, 0);
  provisional.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (let index = 0; index < remaining; index += 1) provisional[index].base += 1;
  return provisional.sort((a, b) => a.id.localeCompare(b.id)).map(row => ({
    unitId: row.id,
    amount: kwd(row.base),
    basis,
    weight: row.weight
  }));
}

export function calculateCommercialCharge(contract, period) {
  const baseFils = fils(contract?.baseRent);
  const camFils = fils(contract?.cam || 0);
  const salesFils = fils(period?.sales || 0);
  const percentage = finite(contract?.salesPercentage || 0, 'INVALID_SALES_PERCENTAGE');
  if (baseFils < 0 || camFils < 0 || salesFils < 0 || percentage < 0 || percentage > 100) {
    fail('INVALID_COMMERCIAL_TERMS', 'شروط العقد التجاري غير صالحة.');
  }
  const leaseStart = dateOnly(contract.startDate, 'INVALID_CONTRACT_START');
  const periodStart = dateOnly(period.startDate, 'INVALID_PERIOD_START');
  const graceDays = Math.trunc(finite(contract.graceDays || 0, 'INVALID_GRACE_DAYS'));
  if (graceDays < 0 || graceDays > 366) fail('INVALID_GRACE_DAYS', 'فترة السماح غير صالحة.');
  const inGrace = periodStart < addDays(leaseStart, graceDays);
  const percentageFils = Math.round(salesFils * percentage / 100);
  const rentFils = inGrace ? 0 : Math.max(baseFils, percentageFils);
  return {
    inGrace,
    baseRent: kwd(baseFils),
    salesRent: kwd(percentageFils),
    cam: kwd(camFils),
    total: kwd(rentFils + camFils)
  };
}

export function buildRentReminderSchedule({balance, year, month, graceDeadline, channels = ['whatsapp', 'email']}) {
  if (fils(balance) <= 0) return [];
  const normalizedChannels = [...new Set(channels.map(String))];
  if (!normalizedChannels.length || normalizedChannels.some(channel => !['whatsapp', 'email'].includes(channel))) {
    fail('INVALID_RENT_CHANNEL', 'قنوات تذكير الإيجار المعتمدة هي الواتساب والبريد.');
  }
  const start = dateOnly(`${year}-${String(month).padStart(2, '0')}-28`, 'INVALID_REMINDER_MONTH');
  const end = dateOnly(graceDeadline, 'INVALID_GRACE_DEADLINE');
  if (end < start) fail('INVALID_GRACE_DEADLINE', 'المهلة تسبق بداية التذكير.');
  const result = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 2)) {
    for (const channel of normalizedChannels) result.push({onDate: dayKey(cursor), channel, balance: kwd(fils(balance))});
  }
  return result;
}

export function calculateTenantYear({year, installments}) {
  const targetYear = Number(year);
  if (!Number.isInteger(targetYear)) fail('INVALID_YEAR', 'السنة غير صالحة.');
  const rows = installments.map(normalizePayment).filter(row => row.dueDate.getUTCFullYear() === targetYear && row.status !== 'cancelled');
  const quarters = [1, 2, 3, 4].map(quarter => {
    const items = rows.filter(row => Math.floor(row.dueDate.getUTCMonth() / 3) + 1 === quarter);
    const eligible = items.length > 0 && items.every(row => row.paidFils >= row.dueFils && row.settledAt && row.settledAt <= row.dueDate);
    return {quarter, eligible, installmentCount: items.length};
  });
  const stars = Math.min(4, quarters.filter(item => item.eligible).length);
  return {year: targetYear, stars, quarters, rating: stars === 4 ? 'ممتاز' : stars >= 2 ? 'جيد' : stars === 1 ? 'منتظم جزئياً' : 'يحتاج متابعة'};
}

export function evaluateClearance(input) {
  const balances = ['rentBalance', 'damageBalance', 'utilityBalance', 'legalBalance', 'depositBalance']
    .map(key => ({key, value: fils(input?.[key] || 0)}));
  const open = balances.filter(item => item.value !== 0);
  const keysReturned = input?.keysReturned === true;
  const inspectionCompleted = input?.inspectionCompleted === true;
  const exception = input?.exception;
  const exceptionValid = exception && requireId(exception.approvedBy, 'INVALID_EXCEPTION_APPROVER') &&
    String(exception.reason || '').trim().length >= 10 && dateOnly(exception.approvedAt, 'INVALID_EXCEPTION_DATE');
  const canIssue = open.length === 0 && keysReturned && inspectionCompleted || Boolean(exceptionValid);
  return {
    canIssue,
    open: open.map(item => ({kind: item.key, amount: kwd(item.value)})),
    blockedBy: [
      ...(!keysReturned ? ['keys'] : []),
      ...(!inspectionCompleted ? ['inspection'] : []),
      ...(open.length ? ['balances'] : [])
    ],
    exceptionUsed: Boolean(exceptionValid)
  };
}

export function validatePettyCashTransaction({fundBalance, ceiling, amount, kind, invoiceId, approvedBy}) {
  const balanceFils = fils(fundBalance);
  const ceilingFils = fils(ceiling);
  const amountFils = fils(amount);
  if (!['fund', 'spend', 'settle'].includes(kind)) fail('INVALID_PETTY_CASH_KIND', 'نوع حركة العهدة غير صالح.');
  if (amountFils <= 0 || ceilingFils <= 0) fail('INVALID_PETTY_CASH_AMOUNT', 'المبلغ والسقف يجب أن يكونا موجبين.');
  if (kind === 'spend' && (!invoiceId || !approvedBy)) fail('PETTY_CASH_APPROVAL_REQUIRED', 'الفاتورة والاعتماد مطلوبان قبل الصرف.');
  const next = kind === 'fund' ? balanceFils + amountFils : balanceFils - amountFils;
  if (next < 0) fail('PETTY_CASH_INSUFFICIENT', 'رصيد العهدة غير كافٍ.');
  if (next > ceilingFils) fail('PETTY_CASH_CEILING', 'تتجاوز الحركة سقف العهدة.');
  return {before: kwd(balanceFils), amount: kwd(amountFils), after: kwd(next), kind};
}

export function assertWorkOrderInvoice({workOrder, invoice}) {
  if (workOrder?.status !== 'completed') fail('WORK_ORDER_NOT_COMPLETED', 'لا تعتمد الفاتورة قبل اكتمال أمر الشغل.');
  if (!workOrder?.approvedBy) fail('WORK_ORDER_NOT_APPROVED', 'اعتماد الإدارة مطلوب.');
  if (requireId(invoice?.vendorId, 'INVALID_VENDOR') !== requireId(workOrder.vendorId, 'INVALID_VENDOR')) {
    fail('VENDOR_MISMATCH', 'مورد الفاتورة لا يطابق أمر الشغل.');
  }
  const invoiceFils = fils(invoice.amount);
  const approvedFils = fils(workOrder.approvedAmount);
  if (invoiceFils <= 0 || invoiceFils > approvedFils) fail('INVOICE_AMOUNT_EXCEEDS_ORDER', 'الفاتورة تتجاوز قيمة أمر الشغل المعتمدة.');
  return {expenseKey: `work-order:${requireId(workOrder.id)}:invoice:${requireId(invoice.id)}`, amount: kwd(invoiceFils)};
}

export function buildIntegrationEvent({id, type, aggregateId, payload, occurredAt}) {
  const safePayload = structuredClone(payload || {});
  for (const key of ['password', 'secret', 'token', 'civilId', 'civil_id']) {
    if (key in safePayload) delete safePayload[key];
  }
  return {
    id: requireId(id, 'INVALID_EVENT_ID'),
    type: requireId(type, 'INVALID_EVENT_TYPE'),
    aggregateId: requireId(aggregateId, 'INVALID_AGGREGATE_ID'),
    occurredAt: dateOnly(occurredAt, 'INVALID_EVENT_DATE').toISOString(),
    payload: safePayload,
    idempotencyKey: `${type}:${id}`,
    schemaVersion: 1
  };
}
