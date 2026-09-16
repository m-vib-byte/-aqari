"""Pure value helpers for saved property statements; no rendering or persistence side effects."""

def owner_approved_discount(row):
    """Derive the approved discount only from saved contract/current rent values."""
    contract=row.get('contract_rent_kd');current=row.get('current_rent_kd')
    if contract in (None,'') or current in (None,''):return None
    try:contract=float(contract);current=float(current)
    except (TypeError,ValueError):return None
    if contract<0 or current<0:return None
    return round(max(0,contract-current),3)
