"""Read-only PDF copies from the caller's freshly authorized saved contract."""
from copy import deepcopy
from io import BytesIO
import re
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from lib.contract_template_pdf import render_contract_template

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
AUTH = re.compile(r'Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')

class SourceChanged(ValueError):
    pass

def primary(payload):
    if payload.get('format') == 'aqari-cloud-state-v1':
        return payload.get('snapshot', {}).get('values', {}).get('aqari_v30', {})
    if payload.get('schema') == 'aqari-local-snapshot-v1':
        return payload.get('values', {}).get('aqari_v30', {})
    return payload

def prepare_print(data, auth, *, read, render=render_contract_template):
    if not isinstance(data, dict) or set(data) != {'workspaceId','contractRef','count','mode','expectedRevision'}:
        raise ValueError('INVALID_REQUEST')
    if (not isinstance(data['workspaceId'], str) or not UUID.fullmatch(data['workspaceId'])
            or not isinstance(data['contractRef'], str) or not 1 <= len(data['contractRef']) <= 200
            or any(ord(c) < 32 for c in data['contractRef'])
            or type(data['count']) is not int or data['count'] not in (1,2)
            or data['mode'] not in ('draft','official')
            or type(data['expectedRevision']) is not int or data['expectedRevision'] < 0):
        raise ValueError('INVALID_REQUEST')
    if not isinstance(auth, str) or len(auth) > 8192 or not AUTH.fullmatch(auth):
        raise PermissionError('AUTH_REQUIRED')
    workspace = data['workspaceId']
    user = read('/auth/v1/user', auth)
    uid = user.get('id') if isinstance(user, dict) else None
    if not isinstance(uid, str) or not UUID.fullmatch(uid):
        raise PermissionError('AUTH_REQUIRED')

    def saved():
        context = read('/rest/v1/rpc/aqari_rental_templates', auth,
                       {'p_workspace_id':workspace,'p_action':'context','p_data':{}})
        if (not isinstance(context, dict) or context.get('workspace_id') != workspace
                or context.get('user_id') != uid or context.get('can_publish') is not True):
            raise PermissionError('ACCESS_DENIED')
        state = read('/rest/v1/rpc/aqari_read_state_v267', auth, {'p_workspace_id':workspace})
        if not isinstance(state, dict) or state.get('workspace_id') != workspace or not isinstance(state.get('payload'), dict):
            raise PermissionError('ACCESS_DENIED')
        if state.get('revision') != data['expectedRevision']:
            raise SourceChanged('CONTRACT_SOURCE_CHANGED')
        records = primary(state['payload']).get('contractsV202', [])
        matches = [c for c in records if isinstance(c, dict) and str(c.get('id')) == data['contractRef']]
        if len(matches) != 1 or matches[0].get('source') != 'v267-cloud':
            raise PermissionError('CONTRACT_NOT_FOUND')
        contract = matches[0]
        if data['mode'] == 'official' and contract.get('status') not in ('approved','signing','signed'):
            raise PermissionError('CONTRACT_NOT_APPROVED')
        return deepcopy(contract)

    contract = saved()
    profile = contract.get('tenantProfile') or {}
    fields = [('رقم العقد',contract.get('contract_no')),('العقار',contract.get('property')),
              ('رقم الوحدة',contract.get('unit')),('الدور',contract.get('floor')),
              ('الاسم بالعربي',profile.get('nameAr') or contract.get('tenant')),
              ('الاسم بالإنجليزي',profile.get('nameEn')),('الرقم المدني',profile.get('civilId')),
              ('رقم الجواز',profile.get('passportNo')),('الجنسية',profile.get('nationality')),
              ('الهاتف',profile.get('phone')),('البريد الإلكتروني',profile.get('email')),
              ('تاريخ التحرير',contract.get('writtenOn')),('بداية العقد',contract.get('start_date')),
              ('نهاية العقد',contract.get('end_date')),('الإيجار الأصلي',contract.get('contractRent') if contract.get('contractRent') is not None else contract.get('rent')),
              ('التأمين',contract.get('deposit')),('العربون',contract.get('advance')),
              ('رسوم النظافة',contract.get('cleaningFee')),('بداية الاستحقاق',(contract.get('rentEntitlement') or {}).get('startDate')),
              ('حالة استلام العقد',contract.get('contractReceived')),('تاريخ استلام العقد',contract.get('receivedAt')),
              ('تاريخ استلام التأمين',contract.get('depositReceivedOn')),('المحاسب المسؤول',contract.get('accountant')),
              ('الشهر المجاني',contract.get('freeMonthPeriod') if contract.get('freeMonthApproved') else 'لا')]
    details = '\n'.join(f'{label}: {value if value not in (None, "") else "غير مدون"}' for label,value in fields)
    template = contract.get('contractTemplate')
    if not isinstance(template, dict):
        raise ValueError('SAVED_TEMPLATE_REQUIRED')
    template = {k:deepcopy(template[k]) for k in ('id','family_id','kind','kind_label','title','fields','clauses','presentation') if k in template}
    writer = PdfWriter()
    def append(template, values=None):
        if values is None: values={}
        pdf = render(template, values)
        if not isinstance(pdf, bytes) or not pdf.startswith(b'%PDF-') or len(pdf) > 10*1024*1024:
            raise ValueError('INVALID_RENDERED_PDF')
        reader = PdfReader(BytesIO(pdf))
        if not reader.pages:
            raise ValueError('INVALID_RENDERED_PDF')
        for page in reader.pages:
            writer.add_page(page)
        if len(writer.pages) > 100:
            raise ValueError('PDF_TOO_LARGE')
    for number in range(1,data['count']+1):
        role = 'نسخة المستأجر' if number == 1 else 'نسخة المالك'
        notice = 'مسودة للمراجعة — غير صالحة للتوقيع / DRAFT — NOT FOR SIGNATURE' if data['mode']=='draft' else 'نسخة للطباعة من العقد المعتمد — لا تثبت وجود توقيع أو سداد'
        title = f'{role} — {contract.get("contract_no", "")} — {number}/{data["count"]}'
        append({'kind':'contract_print','title':title,'fields':[],
                'clauses':[{'title':notice,'text':details}]})
        append(template,contract.get('templateFieldValues') or {})
        append({'kind':'contract_annex','title':f'ملحق {title}','fields':[],
                'clauses':[{'title':notice,'text':details}]})
    if saved() != contract:
        raise SourceChanged('CONTRACT_SOURCE_CHANGED')
    if data['mode'] == 'draft':
        for page in writer.pages:
            overlay=BytesIO()
            width,height=float(page.mediabox.width),float(page.mediabox.height)
            stamp=canvas.Canvas(overlay,pagesize=(width,height))
            stamp.setFillColorRGB(.65,.1,.1);stamp.setFillAlpha(.22)
            stamp.translate(width/2,height/2);stamp.rotate(45)
            stamp.setFont('Helvetica-Bold',22)
            stamp.drawCentredString(0,0,'DRAFT - NOT FOR SIGNATURE')
            stamp.save()
            page.merge_page(PdfReader(BytesIO(overlay.getvalue())).pages[0])
    stream=BytesIO();writer.write(stream);pdf=stream.getvalue()
    if len(pdf)>10*1024*1024:
        raise ValueError('PDF_TOO_LARGE')
    return pdf, len(writer.pages)
