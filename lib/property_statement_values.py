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
