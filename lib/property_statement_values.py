"""Pure value helpers for saved property statements; no rendering or persistence side effects."""

def _saved_money(value):
    if value in (None,''):return None
    try:value=float(value)
    except (TypeError,ValueError):return None
    if value<0:return None
    return round(value,3)

def owner_approved_discount(row):
    """Derive the approved discount only from saved contract/current rent values."""
    contract=_saved_money(row.get('contract_rent_kd'));current=_saved_money(row.get('current_rent_kd'))
    if contract is None or current is None:return None
    return round(max(0,contract-current),3)

def source_remaining(row):
    """Derive source-register remaining only from saved current rent and saved paid amount."""
    current=_saved_money(row.get('current_rent_kd'));paid=_saved_money(row.get('paid_amount_kd'))
    if current is None or paid is None:return None
    return round(max(0,current-paid),3)

def statement_rent_totals(rows):
    """Return separated contract/discount/current totals only when every saved row is complete."""
    if not isinstance(rows,list) or not rows:return None
    contract_total=current_total=discount_total=0.0
    for row in rows:
        if not isinstance(row,dict):return None
        contract=_saved_money(row.get('contract_rent_kd'));current=_saved_money(row.get('current_rent_kd'))
        if contract is None or current is None:return None
        contract_total+=contract;current_total+=current;discount_total+=max(0,contract-current)
    return {
        'contract_rent_kd':round(contract_total,3),
        'owner_discount_kd':round(discount_total,3),
        'current_rent_kd':round(current_total,3),
    }

def _saved_knet_method(value):
    """Return True/False only when a saved payment method is actually present."""
    if value in (None,''):return None
    compact=''.join(ch for ch in str(value).casefold() if ch.isalnum())
    return compact.startswith('knet') or compact.startswith('كينت')

def statement_source_totals(rows):
    """Aggregate source-only paid/remaining/insurance/KNET values without filling missing evidence.

    Each metric fails closed independently. In particular, a missing payment method makes the
    KNET aggregate unknown, and an insurance reconciliation flag prevents publishing an insurance
    total even when the disputed numeric value is present.
    """
    keys=('paid_amount_kd','remaining_kd','insurance_kd','knet_paid_kd')
    if not isinstance(rows,list) or not rows:return {key:None for key in keys}
    paid_total=remaining_total=insurance_total=knet_total=0.0
    paid_complete=remaining_complete=insurance_complete=knet_complete=True
    for row in rows:
        if not isinstance(row,dict):return {key:None for key in keys}
        paid=_saved_money(row.get('paid_amount_kd'))
        if paid is None:paid_complete=False
        else:paid_total+=paid
        remaining=source_remaining(row)
        if remaining is None:remaining_complete=False
        else:remaining_total+=remaining
        insurance=_saved_money(row.get('insurance_kd'))
        if insurance is None or row.get('insurance_status')=='pending_reconciliation':insurance_complete=False
        else:insurance_total+=insurance
        knet=_saved_knet_method(row.get('payment_method_raw'))
        if knet is None:knet_complete=False
        elif knet:
            if paid is None:knet_complete=False
            else:knet_total+=paid
    return {
        'paid_amount_kd':round(paid_total,3) if paid_complete else None,
        'remaining_kd':round(remaining_total,3) if remaining_complete else None,
        'insurance_kd':round(insurance_total,3) if insurance_complete else None,
        'knet_paid_kd':round(knet_total,3) if knet_complete else None,
    }
