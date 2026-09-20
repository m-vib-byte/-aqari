"""Resolve rental preview fields from authenticated, workspace-scoped records only."""
from lib.rent_pdf import primary

LINKED_FIELDS = set('tenant_nationality_en floor tenant_passport contract_start_date contract_end_date owner_representative_name tenant_name tenant_name_en tenant_civil_id civil_id tenant_nationality nationality tenant_passport_no tenant_phone tenant_email owner_name owner_name_en owner_civil_id owner_nationality representative_name representative_civil_id representative_nationality power_of_attorney_no power_of_attorney_year property_name property_address property_area property_block property_street property_building_no property_automatic_no unit_no unit_automatic_no floor_no contract_no start_date end_date contract_date monthly_rent deposit_amount advance_amount cleaning_fee accountant_name receipt_no receipt_date rent_period amount payment_method payment_reference receiver_name'.split())


def obj(value):
    return value if isinstance(value, dict) else {}


def first(*items):
    return next((str(x).strip() for x in items if isinstance(x, (str, int, float)) and not isinstance(x, bool) and str(x).strip()), '')


def text(value):
    return '' if value is None else str(value).strip()


def unit_key(value):
    return text(value).translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))


def exactly(rows, message):
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise ValueError(message)
    return rows[0]


def resolve_document_values(payload, selection, lease, tenant, property_row, unit, master, payment=None):
    data = primary(payload)
    contract = exactly([c for c in data.get('contractsV202', []) if isinstance(c, dict) and text(c.get('id')) == text(selection['contractId'])], 'CONTRACT_NOT_FOUND')
    if (text(lease.get('external_ref')) != text(contract.get('id'))
            or text(lease.get('contract_no')) != text(contract.get('contract_no'))
            or lease.get('tenant_id') != tenant.get('id') or lease.get('unit_id') != unit.get('id')
            or unit.get('property_id') != property_row.get('id')
            or first(contract.get('propertyId'), contract.get('property_id'), contract.get('property_ref')) and first(contract.get('propertyId'), contract.get('property_id'), contract.get('property_ref')) != text(property_row.get('id'))
            or first(contract.get('unitId'), contract.get('unit_id')) and first(contract.get('unitId'), contract.get('unit_id')) != text(unit.get('id'))):
        raise ValueError('DOCUMENT_LINK_MISMATCH')
    if contract.get('status') == 'cancelled' or lease.get('status') == 'cancelled':
        raise ValueError('INACTIVE_CONTRACT')
    tenant_ref = first(contract.get('tenantId'), contract.get('tenant_id'), contract.get('tenant_ref'))
    if not tenant_ref or text(tenant_ref) not in {text(tenant.get('external_ref')), text(tenant.get('id'))}:
        raise ValueError('TENANT_LINK_MISMATCH')
    if selection.get('tenantId') is not None and text(selection['tenantId']) not in {text(tenant_ref), text(tenant.get('id'))}:
        raise ValueError('TENANT_LINK_MISMATCH')
    profiles = [p for p in data.get('tenantProfilesV267', []) if isinstance(p, dict) and text(p.get('id')) == text(tenant_ref)]
    if len(profiles) > 1:
        raise ValueError('AMBIGUOUS_TENANT')
    profile = profiles[0] if profiles else obj(tenant.get('profile'))
    if not isinstance(profile, dict):
        raise ValueError('INVALID_TENANT')
    if profile.get('civilId') and tenant.get('civil_id') and text(profile['civilId']) != text(tenant['civil_id']):
        raise ValueError('TENANT_LINK_MISMATCH')
    p = {**obj(property_row.get('metadata')), **property_row}
    p.update({k:v for k,v in obj(master.get('property')).items() if v is not None and v != '' and v != []})
    u = {**unit, **obj(master.get('unit'))}
    if p.get('id') != property_row['id'] or u.get('id') != unit['id'] or u.get('propertyId', unit['property_id']) != property_row['id']:
        raise ValueError('DOCUMENT_LINK_MISMATCH')
    owners = p.get('owners', [])
    owner = owners[0] if isinstance(owners, list) and len(owners) == 1 and isinstance(owners[0], dict) else {}
    owner_id = first(contract.get('ownerId'), contract.get('owner_id'), p.get('ownerId'), p.get('owner_id'))
    if owner_id:
        owner = exactly([o for o in owners if isinstance(o, dict) and owner_id in {text(o.get('id')), text(o.get('external_ref')), text(o.get('externalRef'))}], 'OWNER_LINK_MISMATCH')
    elif not owners:
        owner = obj(p.get('owner'))
    representative = obj(contract.get('representative') or p.get('representative') or p.get('agent'))
    values = {
        'tenant_name': first(profile.get('nameAr'), profile.get('name_ar'), tenant.get('full_name')),
        'tenant_name_en': first(profile.get('nameEn'), profile.get('name_en')),
        'tenant_civil_id': first(profile.get('civilId'), profile.get('civil_id'), tenant.get('civil_id')),
        'tenant_nationality': first(profile.get('nationality')),
        'tenant_nationality_en': first(profile.get('nationalityEn'), profile.get('nationality_en')),
        'tenant_passport_no': first(profile.get('passportNo'), profile.get('passport_no')),
        'tenant_phone': first(profile.get('phone'), tenant.get('phone')),
        'tenant_email': first(profile.get('email'), tenant.get('email')),
        'owner_name': first(owner.get('nameAr'), owner.get('name'), p.get('owner_name') if len(owners)<2 else '', p.get('ownerName') if len(owners)<2 else '', p.get('source_owner') if len(owners)<2 else '', contract.get('owner_name') if len(owners)<2 else ''),
        'owner_name_en': first(owner.get('nameEn'), owner.get('name_en')),
        'owner_civil_id': first(owner.get('civilId'), owner.get('civil_id')),
        'owner_nationality': first(owner.get('nationality')),
        'representative_name': first(representative.get('nameAr'), representative.get('name'), contract.get('representative_name')),
        'representative_civil_id': first(representative.get('civilId'), representative.get('civil_id')),
        'representative_nationality': first(representative.get('nationality')),
        'power_of_attorney_no': first(representative.get('powerOfAttorneyNo'), representative.get('power_of_attorney_no')),
        'power_of_attorney_year': first(representative.get('powerOfAttorneyYear'), representative.get('power_of_attorney_year')),
        'property_name': first(p.get('name'), property_row.get('name')),
        'property_address': first(p.get('address'), p.get('location'), p.get('source_address'), contract.get('propertyAddress')),
        'property_area': first(p.get('area'), p.get('region')),
        'property_block': first(p.get('block')),
        'property_street': first(p.get('street')),
        'property_building_no': first(p.get('buildingNo'), p.get('building_no')),
        'property_automatic_no': first(p.get('propertyAutomaticRef'), p.get('automaticRef'), p.get('automatic_ref')),
        'unit_no': first(u.get('unit_no'), u.get('unitNo'), contract.get('unit')),
        'unit_automatic_no': first(u.get('automaticRef'), u.get('automatic_ref'), obj(u.get('metadata')).get('automaticRef'), contract.get('automaticUnitRef')),
        'floor_no': first(u.get('floor'), obj(u.get('metadata')).get('floor'), contract.get('floor')),
        'contract_no': contract.get('contract_no'),
        'start_date': first(contract.get('start_date'), contract.get('startDate'), lease.get('start_date')),
        'end_date': first(contract.get('end_date'), contract.get('endDate'), lease.get('end_date')),
        'contract_date': first(contract.get('writtenOn'), contract.get('contract_date')),
        'monthly_rent': first(contract.get('contractRent'), contract.get('monthly_rent'), contract.get('rent'), lease.get('monthly_rent')),
        'deposit_amount': first(contract.get('deposit')),
        'advance_amount': first(contract.get('advance')),
        'cleaning_fee': first(contract.get('cleaningFee')),
        'accountant_name': first(contract.get('accountant')),
    }
    values['civil_id'] = values['tenant_civil_id']
    values['nationality'] = values['tenant_nationality']
    values['floor'] = values['floor_no']
    values['tenant_passport'] = values['tenant_passport_no']
    values['contract_start_date'] = values['start_date']
    values['contract_end_date'] = values['end_date']
    values['owner_representative_name'] = values['representative_name']
    if selection.get('receiptId'):
        if not isinstance(payment, dict) or payment.get('lease_id') != lease.get('id') or payment.get('status') not in {'paid', 'partial', 'مدفوع', 'جزئي'}:
            raise ValueError('RECEIPT_CONTRACT_MISMATCH')
        stored_rows = [r for r in data.get('rentReceiptsV267', []) if isinstance(r, dict) and text(r.get('id')) == text(selection['receiptId'])]
        if len(stored_rows) > 1:
            raise ValueError('AMBIGUOUS_PAYMENT')
        stored = stored_rows[0] if stored_rows else {}
        ledger = [r for r in data.get('rentLedgerV202', []) if isinstance(r, dict) and text(r.get('receiptNo')) == text(selection['receiptId'])]
        if len(ledger) > 1:
            raise ValueError('AMBIGUOUS_PAYMENT')
        record = ledger[0] if ledger else obj(payment.get('record'))
        snapshot = obj(payment.get('receipt'))
        for ref in [(stored.get('contract') or {}).get('id'), record.get('contractId'), stored.get('contractId'), (snapshot.get('contract') or {}).get('id')]:
            if ref is not None and text(ref) not in {text(contract.get('id')), text(lease.get('id'))}:
                raise ValueError('RECEIPT_CONTRACT_MISMATCH')
        row = stored.get('record') or snapshot.get('record') or []
        cell = lambda i: row[i] if len(row) > i else ''
        for status in [payment.get('status'), record.get('status'), stored.get('status'), cell(3)]:
            if status is not None and status != '' and status not in {'paid', 'partial', 'مدفوع', 'جزئي'}:
                raise ValueError('UNCONFIRMED_RECEIPT')
        amounts = [first(amount) for amount in [record.get('paid'), payment.get('amount'), cell(2)] if first(amount)]
        from decimal import Decimal, InvalidOperation
        try:
            parsed = [Decimal(amount) for amount in amounts]
            if not parsed or any(not amount.is_finite() or amount <= 0 or amount != parsed[0] for amount in parsed):
                raise ValueError('RECEIPT_AMOUNT_MISMATCH')
        except InvalidOperation as exc:
            raise ValueError('RECEIPT_AMOUNT_MISMATCH') from exc
        values.update(receipt_no=first(stored.get('id'), payment.get('reference'), record.get('receiptNo')),
                      receipt_date=first(record.get('paidAt'), payment.get('paid_at'), cell(5)),
                      rent_period=first(record.get('period'), text(payment.get('period'))[:7], cell(8)),
                      amount=first(record.get('paid'), payment.get('amount'), cell(2)),
                      payment_method=first(record.get('method'), payment.get('payment_method'), cell(9)),
                      payment_reference=first(record.get('transactionNo'), stored.get('transactionNo'), snapshot.get('transactionNo'), record.get('paymentReference'), stored.get('paymentReference')),
                      receiver_name=first(stored.get('receiverName'), record.get('receiverName')), accountant_name=first(stored.get('accountant'), record.get('accountant'), snapshot.get('accountant'), values.get('accountant_name')))
    return values
