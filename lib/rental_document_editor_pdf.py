"""Opt-in rich rental-document PDF layout; legacy PDFs use their old renderer."""
from io import BytesIO
import re
import arabic_reshaper
from bidi import algorithm as bidi
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from lib.rent_pdf import FONT, FONT_PATH
from lib.rental_document_editor import source_index

_RESHAPER=arabic_reshaper.ArabicReshaper(configuration={'support_ligatures':False,'delete_harakat':False,'support_zwj':False})
_FONTS={('sans',False):(FONT,FONT_PATH),('sans',True):('AqariSansBold',FONT_PATH.with_name('AqariSans-Bold.ttf')),('mono',False):('AqariMono',FONT_PATH.with_name('AqariMono.ttf')),('mono',True):('AqariMonoBold',FONT_PATH.with_name('AqariMono-Bold.ttf'))}
_TOKEN=re.compile(r'\{\{([a-z][a-z0-9_]{1,49})\}\}')


def _font(style):
    name,path=_FONTS[(style.get('font_family','sans'),style.get('bold',False))]
    if name not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(name,str(path)))
    return name


def _visual_runs(atoms,direction='auto'):
    # Non-ligating reshaping preserves source/style correspondence even where
    # bold changes in the middle of an Arabic word. Bidi indices travel with
    # characters, so Latin numbers and Arabic spans keep the correct styles.
    atoms=[atom for atom in atoms if atom[0]!='\u200d' and atom[0] not in '\u2066\u2067\u2068\u2069']
    text=''.join(char for char,_ in atoms)
    text=_RESHAPER.reshape(text)
    if len(text)!=len(atoms):raise ValueError('LAYOUT_TEXT_SHAPING')
    storage=bidi.get_empty_storage()
    level=0 if direction=='ltr' else 1 if direction=='rtl' else bidi.get_base_level(text)
    storage.update(base_level=level,base_dir=('L','R')[level])
    bidi.get_embedding_levels(text,storage,False,False)
    for index,item in enumerate(storage['chars']):item['source_index']=index
    bidi.explicit_embed_and_overrides(storage,False)
    bidi.resolve_weak_types(storage,False)
    bidi.resolve_neutral_types(storage,False)
    bidi.resolve_implicit_levels(storage,False)
    bidi.reorder_resolved_levels(storage,False)
    bidi.apply_mirroring(storage,False)
    runs=[]
    for item in storage['chars']:
        style=atoms[item['source_index']][1]
        key=(_font(style),style['font_pt'],style.get('underline',False))
        if runs and runs[-1][1]==key:runs[-1]=(runs[-1][0]+item['ch'],key)
        else:runs.append((item['ch'],key))
    return runs,level


def _width(atoms,direction):
    return sum(pdfmetrics.stringWidth(text,font,size) for text,(font,size,_) in _visual_runs(atoms,direction)[0])


def _wrap(atoms,width,direction):
    if not atoms:return [[]]
    groups=[];current=[];space=None
    for atom in atoms:
        is_space=atom[0].isspace()
        if current and is_space!=space:groups.append(current);current=[]
        current.append(atom);space=is_space
    if current:groups.append(current)
    lines=[];current=[]
    for group in groups:
        candidate=current+group
        if _width(candidate,direction)<=width:current=candidate;continue
        if current:
            lines.append(current);current=[]
            if all(char.isspace() for char,_ in group):continue
        if _width(group,direction)<=width:current=group;continue
        for atom in group:
            if current and _width(current+[atom],direction)>width:lines.append(current);current=[]
            current.append(atom)
    if current or not lines:lines.append(current)
    return lines


def _source_atoms(raw,field_values,ranges,base,start=0,end=None):
    """Resolve fields once, retaining source offsets for formatting only."""
    end=len(raw) if end is None else end
    atoms=[];offset=len(raw[:start].encode('utf-16-le'))//2;index=start
    ordered=sorted(ranges,key=lambda item:item['start']);range_index=0
    while index<end:
        match=_TOKEN.match(raw,index)
        while range_index<len(ordered) and ordered[range_index]['end']<=offset:range_index+=1
        selected=ordered[range_index] if range_index<len(ordered) and ordered[range_index]['start']<=offset else None
        style={**base,**selected['style']} if selected else base
        if match:
            if start<=index<end:atoms.extend((char,style) for char in field_values[match.group(1)])
            token=match.group();offset+=len(token);index=match.end()
        else:
            char=raw[index]
            if start<=index<end:atoms.append((char,style))
            offset+=2 if ord(char)>0xFFFF else 1;index+=1
    return atoms


def render_editor_pdf(template,resolved,logo):
    from lib.contract_template_pdf import localized,PARTS
    presentation=resolved['presentation'];editor=presentation['editor'];language=presentation['language']
    typography=presentation.get('typography',{'font_pt':12,'line_height':1.85,'alignment':'start','margin_mm':18})
    settings=editor.get('style',{})
    base={'font_family':settings.get('font_family','sans'),'font_pt':typography['font_pt'],'bold':settings.get('bold',False),'underline':settings.get('underline',False)}
    direction=settings.get('direction','auto');margin=typography['margin_mm']*mm
    width,height=A4;content_width=width-2*margin;bottom=height-margin
    logo_box=editor.get('logo',{'x_mm':90,'y_mm':10,'width_mm':30,'height_mm':24,'repeat':'first'})
    placements=presentation['placements'];pages={1:[]};reserved={}
    def logo_on(page):return logo is not None and (page==1 or logo_box['repeat']=='all')
    for index,a in enumerate(placements):
        pages.setdefault(a['page'],[])
        reserved.setdefault(a['page'],[]).append((a['y_mm']*mm-2,(a['y_mm']+a['height_mm'])*mm+2))
        for b in placements[index+1:]:
            if a['page']==b['page'] and a['x_mm']<b['x_mm']+b['width_mm'] and b['x_mm']<a['x_mm']+a['width_mm'] and a['y_mm']<b['y_mm']+b['height_mm'] and b['y_mm']<a['y_mm']+a['height_mm']:raise ValueError('LAYOUT_FIELDS_OVERLAP')
        if logo_on(a['page']) and a['x_mm']<logo_box['x_mm']+logo_box['width_mm'] and logo_box['x_mm']<a['x_mm']+a['width_mm'] and a['y_mm']<logo_box['y_mm']+logo_box['height_mm'] and logo_box['y_mm']<a['y_mm']+a['height_mm']:raise ValueError('LAYOUT_LOGO_OVERLAP')
    page=1;y=margin
    def next_page():
        nonlocal page,y
        page+=1;y=margin
        if page>50:raise ValueError('DOCUMENT_PAGE_LIMIT')
        pages.setdefault(page,[])
    def manual_break():
        nonlocal y
        # Adjacent end-of-clause/start-of-clause breaks denote one boundary.
        # They must not manufacture an extra empty page between source blocks.
        if pages[page]:next_page()
        else:y=margin
    def available(block_height):
        nonlocal y
        while True:
            bands=list(reserved.get(page,[]))
            if logo_on(page):bands.append((logo_box['y_mm']*mm-2,(logo_box['y_mm']+logo_box['height_mm'])*mm+3*mm))
            conflict=next((band for band in sorted(bands) if y<band[1] and y+block_height>band[0]),None)
            if conflict:y=conflict[1]+2*mm;continue
            if y+block_height>bottom:next_page();continue
            return
    def add_atoms(atoms,alignment=None,gap=0,leading=None,color='#2f2924'):
        nonlocal y
        paragraphs=[];current=[]
        for atom in atoms:
            if atom[0]=='\n':paragraphs.append(current);current=[]
            elif atom[0]!='\r':current.append(atom)
        paragraphs.append(current)
        for p_index,paragraph in enumerate(paragraphs):
            # Bidi direction belongs to the paragraph, not to each wrapped line.
            paragraph_direction=direction
            if direction=='auto':paragraph_direction='rtl' if bidi.get_base_level(''.join(char for char,_ in paragraph)) else 'ltr'
            lines=_wrap(paragraph,content_width,paragraph_direction)
            for index,line in enumerate(lines):
                runs,level=_visual_runs(line,paragraph_direction)
                font=max((key[1] for _,key in runs),default=base['font_pt'])
                line_height=leading or font*typography['line_height']
                available(line_height)
                align=alignment or typography['alignment']
                if align=='start' or align=='justify' and index==len(lines)-1:align='right' if level else 'left'
                if align=='end':align='left' if level else 'right'
                pages[page].append(('text',runs,margin,y+font,content_width,align,color))
                y+=line_height
            if p_index<len(paragraphs)-1 and not paragraph:y+=settings.get('paragraph_gap_mm',0)*mm
        y+=gap
    def plain(text,style=None,**kwargs):add_atoms([(char,style or base) for char in text],**kwargs)
    plain(resolved['title'],{**base,'font_pt':18,'bold':True},alignment='center',leading=27,gap=4*mm,color='#4b321f')
    meta=resolved['kind_label']+(' - '+localized('draft',language) if not resolved['bound'] else '')
    if meta.strip():plain(meta,{**base,'font_pt':9,'bold':False,'underline':False},alignment='center',leading=15,gap=5*mm,color='#765b43')
    fields={item['key']:item['value'] for item in resolved['fields']}
    ranges=editor.get('ranges',[]);breaks=editor.get('page_breaks',[])
    for clause_index,clause in enumerate(template['clauses']):
        offsets=[item['offset'] for item in breaks if item['clause']==clause_index]
        if offsets and offsets[0]==0:manual_break();offsets=offsets[1:]
        y+=settings.get('clause_before_mm',0)*mm
        title_base={**base,'font_pt':max(12,base['font_pt']),'bold':True}
        title_atoms=_source_atoms(clause['title'],fields,[r for r in ranges if r['clause']==clause_index and r['part']=='title'],title_base)
        if settings.get('numbering')=='decimal':title_atoms=[(char,title_base) for char in str(clause_index+1)+'. ']+title_atoms
        add_atoms(title_atoms,gap=2*mm,color='#56391f')
        boundaries=[source_index(clause['text'],offset) for offset in offsets]+[len(clause['text'])]
        start=0
        for index,end in enumerate(boundaries):
            body=_source_atoms(clause['text'],fields,[r for r in ranges if r['clause']==clause_index and r['part']=='text'],base,start,end)
            if body:add_atoms(body)
            if index<len(boundaries)-1:manual_break()
            start=end
        y+=settings.get('clause_after_mm',4)*mm
    placed_keys={item['field_key'] for item in placements}
    for signer in resolved['signatures']:
        role=signer['role'];flags=presentation['signers'].get(role,{})
        parts=[part for part in ('name','civil_id','nationality','signature','fingerprint') if (signer.get('showCivilId') if part=='civil_id' else signer.get('showNationality') if part=='nationality' else flags.get(part)) and role+'_'+part not in placed_keys]
        if not parts:continue
        # An entire signature block stays together; no signature is invented.
        available((8+len(parts)*11)*mm)
        label_role=({'owner':'employer','tenant':'employee'}.get(role,role) if resolved.get('kind')=='employment_contract' else 'representative' if role=='owner' and signer['label']=='وكيل المالك المفوض' else role)
        plain(localized(label_role,language),{**base,'font_pt':11,'bold':True},leading=18,gap=2*mm,color='#56391f')
        for part in parts:
            value=signer.get('name' if part=='name' else 'civilId' if part=='civil_id' else 'nationality','') if part in ('name','civil_id','nationality') else ''
            plain(localized(part,language)+': '+(value or '........................................'),{**base,'font_pt':10,'bold':False,'underline':False},leading=18,gap=4*mm)
    specs={item['key']:item for item in template['fields']};signers={item['role']:item for item in resolved['signatures']}
    for item in placements:
        key=item['field_key'];lang=item['language'];font=item['font_pt'];style={**base,'font_pt':font}
        x,top,w,h=(item[k]*mm for k in ['x_mm','y_mm','width_mm','height_mm'])
        match=re.fullmatch(r'(owner|tenant|receiver|accountant)_(name|civil_id|nationality|signature|fingerprint)',key)
        if match and key not in specs:
            role,part=match.groups();signer=signers.get(role,{})
            label_role=({'owner':'employer','tenant':'employee'}.get(role,role) if resolved.get('kind')=='employment_contract' else 'representative' if role=='owner' and signer.get('label')=='وكيل المالك المفوض' else role)
            value=signer.get('name' if part=='name' else 'civilId' if part=='civil_id' else 'nationality','') if part in ('name','civil_id','nationality') else ''
            content=localized(label_role,lang)+' - '+localized(part,lang)+(': '+value if part in ('name','civil_id','nationality') else '')
        else:content=fields[key]
        place_direction='ltr' if lang=='en' else 'rtl';lines=[]
        for paragraph in content.split('\n'):lines.extend(_wrap([(char,style) for char in paragraph],w-4*mm,place_direction))
        leading=font*1.35
        if len(lines)*leading+3*mm>h:raise ValueError('LAYOUT_FIELD_OVERFLOW:'+item['id'])
        pages[item['page']].append(('rect',x,top,w,h))
        for index,line in enumerate(lines):pages[item['page']].append(('text',_visual_runs(line,place_direction)[0],x+2*mm,top+1.5*mm+font+index*leading,w-4*mm,'left' if lang=='en' else 'right','#2f2924'))
    count=max(pages)+editor.get('trailing_blank_pages',0)
    if count>50:raise ValueError('DOCUMENT_PAGE_LIMIT')
    output=BytesIO();pdf=canvas.Canvas(output,pagesize=A4,invariant=True,pageCompression=1)
    pdf.setTitle(resolved['title']);pdf.setAuthor('AQARI')
    for page_number in range(1,count+1):
        if logo_on(page_number):
            box=logo_box
            pdf.drawImage(ImageReader(BytesIO(logo)),box['x_mm']*mm,height-(box['y_mm']+box['height_mm'])*mm,width=box['width_mm']*mm,height=box['height_mm']*mm,preserveAspectRatio=True,anchor='c',mask='auto')
        for item in pages.get(page_number,[]):
            if item[0]=='rect':
                _,x,top,w,h=item;pdf.setStrokeColor(colors.HexColor('#cbb99f'));pdf.setLineWidth(.45);pdf.rect(x,height-top-h,w,h,stroke=1,fill=0);continue
            _,runs,x,top,w,alignment,color=item
            measured=sum(pdfmetrics.stringWidth(text,font,size) for text,(font,size,_) in runs)
            spaces=sum(text.count(' ') for text,_ in runs)
            extra=max(0,(w-measured)/spaces) if alignment=='justify' and spaces else 0
            cursor=x+w-measured if alignment=='right' else x+(w-measured)/2 if alignment=='center' else x
            pdf.setFillColor(colors.HexColor(color));pdf.setStrokeColor(colors.HexColor(color))
            for text,(font,size,underline) in runs:
                pdf.setFont(font,size)
                run_width=pdfmetrics.stringWidth(text,font,size)+text.count(' ')*extra
                if extra:
                    obj=pdf.beginText(cursor,height-top);obj.setFont(font,size);obj.setWordSpace(extra);obj.textOut(text);pdf.drawText(obj)
                else:pdf.drawString(cursor,height-top,text)
                if underline:
                    pdf.setLineWidth(max(.45,size/20));pdf.line(cursor,height-top-2,cursor+run_width,height-top-2)
                cursor+=run_width
        pdf.setFillColor(colors.HexColor('#765b43'));pdf.setFont(FONT,8)
        footer=localized('page',language)+' '+str(page_number)+' / '+str(count)+' - A4'
        from lib.contract_template_pdf import _visual
        pdf.drawCentredString(width/2,5*mm,_visual(footer));pdf.showPage()
    pdf.save();return output.getvalue()
