(function(){
  'use strict';

  const DESIGN='V202-rent-operations';
  const PAID_RE=/(مدفوع|تم السداد|مسدد|مقبوض|paid|settled|received)/i;
  const DUE_RE=/(مستحق|متأخر|لم\s*يسدد|غير\s*مدفوع|due|overdue|unpaid)/i;

  function data(){
    try{return typeof db!=='undefined'&&db?db:{}}
    catch(_){return {}}
  }

  function rows(key){
    const value=data()[key];
    return Array.isArray(value)?value:[];
  }

  function esc(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }

  function num(value){
    const arabic='٠١٢٣٤٥٦٧٨٩';
    const normalized=String(value==null?'':value)
      .replace(/[٠-٩]/g,function(d){return arabic.indexOf(d)})
      .replace(/,/g,'')
      .replace(/[^0-9.\-]/g,'');
    const parsed=parseFloat(normalized);
    return Number.isFinite(parsed)?parsed:0;
  }

  function money(value){
    try{return Number(value||0).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'}
    catch(_){return String(value||0)+' د.ك'}
  }

  function currentProperty(){
    try{return String(sessionStorage.getItem('aqari_v201_property')||'').trim()}
    catch(_){return ''}
  }

  function propertyRecord(name){
    return rows('properties').find(function(row){
      return Array.isArray(row)&&String(row[0]||'').trim()===name;
    });
  }

  function same(value,target){
    return String(value==null?'':value).trim()===String(target==null?'':target).trim();
  }

  function tenantRows(property){
    return rows('tenants').filter(function(row){
      return Array.isArray(row)&&row.some(function(cell){return same(cell,property)});
    });
  }

  function tenantName(row,property,index){
    if(!Array.isArray(row))return 'مستأجر '+(index+1);
    const preferred=[row[0],row[1]].find(function(value){
      const text=String(value==null?'':value).trim();
      return text&&text!==property&&!/^\d+(?:\.\d+)?$/.test(text)&&!PAID_RE.test(text)&&!DUE_RE.test(text);
    });
    if(preferred)return String(preferred);
    const fallback=row.find(function(value){
      const text=String(value==null?'':value).trim();
      return text&&text!==property&&!/^\d+(?:\.\d+)?$/.test(text);
    });
    return fallback?String(fallback):'مستأجر '+(index+1);
  }

  function tenantStatus(row){
    const raw=String(row?.[3]||'').trim();
    if(PAID_RE.test(raw))return {key:'paid',label:raw||'مدفوع'};
    if(DUE_RE.test(raw))return {key:'due',label:raw||'مستحق'};
    return {key:'unknown',label:raw||'غير محدد'};
  }

  function monthValue(){
    const now=new Date();
    return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  }

  function monthLabel(value){
    const match=String(value||'').match(/^(\d{4})-(\d{2})$/);
    if(!match)return 'الشهر الحالي';
    try{
      return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(new Date(Number(match[1]),Number(match[2])-1,1));
    }catch(_){return match[2]+'/'+match[1]}
  }

  function statusBadge(status){
    return '<span class="v202-status v202-status-'+esc(status.key)+'">'+esc(status.label)+'</span>';
  }

  function statementModel(property){
    const record=propertyRecord(property)||[];
    const tenants=tenantRows(property);
    const items=tenants.map(function(row,index){
      const status=tenantStatus(row);
      return {
        name:tenantName(row,property,index),
        rent:num(row?.[2]),
        status:status,
        raw:row
      };
    });
    const expected=items.reduce(function(total,item){return total+item.rent},0);
    const paid=items.reduce(function(total,item){return total+(item.status.key==='paid'?item.rent:0)},0);
    const due=Math.max(0,expected-paid);
    const paidCount=items.filter(function(item){return item.status.key==='paid'}).length;
    const dueCount=items.filter(function(item){return item.status.key==='due'}).length;
    return {record:record,items:items,expected:expected,paid:paid,due:due,paidCount:paidCount,dueCount:dueCount};
  }

  function renderStatement(month){
    const body=document.getElementById('v201StatementBody');
    const overlay=document.getElementById('v201RentStatement');
    const property=currentProperty();
    if(!body||!overlay?.classList.contains('on')||!property)return;

    const model=statementModel(property);
    const owner=model.record[1]&&model.record[1]!=='—'?model.record[1]:'غير محدد';
    const units=model.record[2]||model.items.length||'0';
    const label=monthLabel(month||monthValue());
    const table=model.items.length?model.items.map(function(item,index){
      return '<tr><td data-label="#">'+(index+1)+'</td><td data-label="المستأجر"><strong>'+esc(item.name)+'</strong></td><td data-label="الإيجار">'+esc(money(item.rent))+'</td><td data-label="الحالة">'+statusBadge(item.status)+'</td></tr>';
    }).join(''):'<tr><td colspan="4" class="v202-empty">لا توجد بيانات مستأجرين مرتبطة بهذا العقار حتى الآن.</td></tr>';

    body.innerHTML=
      '<div class="v202-statement" data-v202-statement data-property="'+esc(property)+'">'+
        '<div class="v202-statement-brand"><div><strong>عقاري</strong><span>إدارة الأملاك</span></div><em>'+esc(label)+'</em></div>'+ 
        '<div class="v202-statement-head"><div><small>كشف إيجار شهري</small><h2 id="v201StatementTitle">'+esc(property)+'</h2><p>كشف المستأجرين وحالة التحصيل المسجلة في المنصة.</p></div><label>الشهر<input type="month" data-v202-month value="'+esc(month||monthValue())+'"></label></div>'+ 
        '<div class="v202-meta"><div><span>المالك</span><strong>'+esc(owner)+'</strong></div><div><span>عدد الوحدات</span><strong>'+esc(units)+'</strong></div><div><span>المستأجرون المسجلون</span><strong>'+model.items.length+'</strong></div></div>'+ 
        '<div class="v202-totals"><article><span>الإيجار المتوقع</span><strong>'+esc(money(model.expected))+'</strong><small>'+model.items.length+' مستأجر</small></article><article class="is-paid"><span>المسدد المسجل</span><strong>'+esc(money(model.paid))+'</strong><small>'+model.paidCount+' مسدد</small></article><article class="is-due"><span>المتبقي المسجل</span><strong>'+esc(money(model.due))+'</strong><small>'+model.dueCount+' مستحق/متأخر</small></article></div>'+ 
        '<div class="v202-table-wrap"><table class="v202-table"><thead><tr><th>#</th><th>المستأجر</th><th>الإيجار الشهري</th><th>حالة السداد</th></tr></thead><tbody>'+table+'</tbody></table></div>'+ 
        '<div class="v202-statement-foot"><p><strong>تنبيه:</strong> حالة السداد أعلاه مأخوذة من آخر حالة مسجلة للمستأجر في المنصة.</p><span>تاريخ الإصدار: '+esc(new Date().toLocaleDateString('ar-KW'))+'</span></div>'+ 
      '</div>';

    overlay.dataset.v202='ready';
    document.body.classList.add('aq-v202');
  }

  function csvCell(value){
    return '"'+String(value==null?'':value).replace(/"/g,'""')+'"';
  }

  function exportCsv(){
    const property=currentProperty();
    if(!property)return;
    const model=statementModel(property);
    const month=document.querySelector('[data-v202-month]')?.value||monthValue();
    const lines=[['العقار','الشهر','المستأجر','الإيجار الشهري','حالة السداد']];
    model.items.forEach(function(item){lines.push([property,monthLabel(month),item.name,item.rent,item.status.label])});
    const csv='\uFEFF'+lines.map(function(row){return row.map(csvCell).join(',')}).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download='كشف-إيجار-'+property+'-'+month+'.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},0);
  }

  function installToolbar(){
    const toolbar=document.querySelector('#v201RentStatement .v201-statement-toolbar');
    if(!toolbar||toolbar.querySelector('[data-v202-csv]'))return;
    const csv=document.createElement('button');
    csv.type='button';
    csv.setAttribute('data-v202-csv','');
    csv.textContent='تنزيل Excel / CSV';
    const print=toolbar.querySelector('[data-v201-statement-print]');
    if(print)toolbar.insertBefore(csv,print);
    else toolbar.appendChild(csv);
  }

  function enhanceSoon(){
    setTimeout(function(){installToolbar();renderStatement()},40);
  }

  document.addEventListener('click',function(event){
    if(event.target.closest('[data-v201-property-action="statement"]'))enhanceSoon();
    if(event.target.closest('[data-v202-csv]'))exportCsv();
  },true);

  document.addEventListener('change',function(event){
    if(event.target.matches('[data-v202-month]'))renderStatement(event.target.value);
  });

  const observer=new MutationObserver(function(){
    const overlay=document.getElementById('v201RentStatement');
    if(overlay?.classList.contains('on')&&overlay.dataset.v202!=='ready')enhanceSoon();
    if(overlay&&!overlay.classList.contains('on'))delete overlay.dataset.v202;
  });

  function boot(){
    document.body.classList.add('aq-v202');
    let meta=document.querySelector('meta[name="aqari-operations"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-operations';document.head.appendChild(meta)}
    meta.content=DESIGN;
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    installToolbar();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();