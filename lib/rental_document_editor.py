"""Validate optional editing instructions without rewriting source text."""
import math
import re

ROLES = ('owner', 'tenant', 'receiver', 'accountant')
STYLE_KEYS = ('font_family', 'bold', 'underline', 'direction', 'paragraph_gap_mm', 'clause_before_mm', 'clause_after_mm', 'numbering')
RANGE_STYLE_KEYS = ('font_family', 'font_pt', 'bold', 'underline')
TOKEN = re.compile(r'\{\{[^{}\r\n]*\}\}|\{\([^{}\r\n]*\}\}|\{\{[a-zA-Z0-9_ \t-]*(?:\}|(?=[^a-zA-Z0-9_ \t-]|$))|\{[a-zA-Z0-9_]+\}\}')


def _fail():
    raise ValueError('INVALID_DOCUMENT_EDITOR')


def _object(value, allowed, required=()):
    if not isinstance(value, dict) or set(value)-set(allowed) or not set(required)<=set(value):
        _fail()


def _number(value, lower, upper, integer=False):
    if type(value) not in (int, float) or not math.isfinite(value) or not lower<=value<=upper or integer and not float(value).is_integer():
        _fail()
    return int(value) if float(value).is_integer() else value


def utf16_offset_map(text):
    """Browser Range offsets are UTF-16, including two units for astral text."""
    offsets={0:0};offset=0
    for index,char in enumerate(text):
        if 0xD800<=ord(char)<=0xDFFF:
            _fail()
        offset+=2 if ord(char)>0xFFFF else 1
        offsets[offset]=index+1
    return offsets


def source_index(text, offset):
    offsets=utf16_offset_map(text)
    if offset not in offsets:
        _fail()
    index=offsets[offset]
    if any(match.start()<index<match.end() for match in TOKEN.finditer(text)):
        _fail()
    return index


def _style(value, ranged=False):
    allowed=RANGE_STYLE_KEYS if ranged else STYLE_KEYS
    _object(value,allowed)
    if ranged and not value:
        _fail()
    result={}
    for key in allowed:
        if key not in value:
            continue
        item=value[key]
        if key=='font_family':
            if item not in ('sans','mono'):_fail()
        elif key in ('bold','underline'):
            if type(item) is not bool:_fail()
        elif key=='font_pt':item=_number(item,8,36)
        elif key=='direction':
            if item not in ('auto','rtl','ltr'):_fail()
        elif key=='numbering':
            if item not in ('none','decimal'):_fail()
        else:item=_number(item,0,12 if key=='paragraph_gap_mm' else 20)
        result[key]=item
    return result


def normalize_editor(value, clauses=None):
    keys=('version','style','ranges','page_breaks','trailing_blank_pages','logo','signers')
    _object(value,keys,('version',))
    if type(value['version']) not in (int,float) or value['version']!=1:_fail()
    result={'version':1}
    if 'style' in value:result['style']=_style(value['style'])
    if 'ranges' in value:
        ranges=value['ranges']
        if not isinstance(ranges,list) or len(ranges)>300:_fail()
        normalized=[];seen={}
        for item in ranges:
            _object(item,('clause','part','start','end','style'),('clause','part','start','end','style'))
            clause=_number(item['clause'],0,49,True);part=item['part']
            start=_number(item['start'],0,60000,True);end=_number(item['end'],1,60000,True)
            if part not in ('title','text') or start>=end:_fail()
            if clauses is not None:
                if not isinstance(clauses,(list,tuple)) or clause>=len(clauses) or not isinstance(clauses[clause],dict) or not isinstance(clauses[clause].get(part),str):_fail()
                source_index(clauses[clause][part],start);source_index(clauses[clause][part],end)
            group=seen.setdefault((clause,part),[])
            if any(start<b and end>a for a,b in group):_fail()
            group.append((start,end))
            normalized.append({'clause':clause,'part':part,'start':start,'end':end,'style':_style(item['style'],True)})
        result['ranges']=normalized
    if 'page_breaks' in value:
        breaks=value['page_breaks']
        if not isinstance(breaks,list) or len(breaks)>50:_fail()
        normalized=[];previous=(-1,-1)
        for item in breaks:
            _object(item,('clause','offset'),('clause','offset'))
            clause=_number(item['clause'],0,49,True);offset=_number(item['offset'],0,60000,True)
            if (clause,offset)<=previous:_fail()
            if clauses is not None:
                if not isinstance(clauses,(list,tuple)) or clause>=len(clauses) or not isinstance(clauses[clause],dict) or not isinstance(clauses[clause].get('text'),str):_fail()
                source_index(clauses[clause]['text'],offset)
            normalized.append({'clause':clause,'offset':offset});previous=(clause,offset)
        result['page_breaks']=normalized
    if 'trailing_blank_pages' in value:result['trailing_blank_pages']=_number(value['trailing_blank_pages'],0,10,True)
    if 'logo' in value:
        logo=value['logo'];keys=('x_mm','y_mm','width_mm','height_mm','repeat');_object(logo,keys,keys)
        x=_number(logo['x_mm'],8,190);y=_number(logo['y_mm'],8,281)
        w=_number(logo['width_mm'],12,100);h=_number(logo['height_mm'],8,60)
        if x+w>202+1e-8 or y+h>289+1e-8 or logo['repeat'] not in ('first','all'):_fail()
        result['logo']={'x_mm':x,'y_mm':y,'width_mm':w,'height_mm':h,'repeat':logo['repeat']}
    if 'signers' in value:
        signers=value['signers'];_object(signers,('order','details'),('order','details'))
        order=signers['order'];details=signers['details']
        if not isinstance(order,list) or len(order)>4 or any(role not in ROLES for role in order) or len(set(order))!=len(order):_fail()
        _object(details,ROLES);normalized={}
        for role in ROLES:
            if role not in details:continue
            flags=details[role];_object(flags,('civil_id','nationality'),('civil_id','nationality'))
            if any(type(flags[key]) is not bool for key in ('civil_id','nationality')):_fail()
            normalized[role]={'civil_id':flags['civil_id'],'nationality':flags['nationality']}
        result['signers']={'order':list(order),'details':normalized}
    return result
