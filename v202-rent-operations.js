(function(){
  'use strict';

  const DESIGN='V202-dhahawi-ledger';
  const PAID_RE=/(مدفوع|تم السداد|مسدد|مقبوض|paid|settled|received)/i;
  const DUE_RE=/(مستحق|متأخر|لم\s*يسدد|غير\s*مدفوع|due|overdue|unpaid)/i;

  function data(){try{return typeof db!=='undefined'&&db?db:{}}catch(_){return {}}}
  function rows(key){const value=data()[key];return Array.isArray(value)?value:[]}
  function esc(value){return String(value==null?'':value).replace(/[&<>'"]/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]})}
  function num(value){
    const arabic='٠١٢٣٤٥٦٧٨٩';
    const normalized=String(value==null?'':value).replace(/[٠-٩]/g,function(d){return arabic.indexOf(d)}).replace(/,/g,'').replace(/[^0-9.\-]/g,'');
    const parsed=parseFloat(normalized);return Number.isFinite(parsed)?parsed:0;
  }
  function money(value){const n=Number(value||0);return Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:3}):'0'}
  function currentProperty(){try{return String(sessionStorage.getItem('aqari_v201_property')||'').trim()}catch(_){return ''}}
  function propertyRecord(name){return rows('properties').find(function(row){return Array.isArray(row)&&String(row[0]||'').trim()===name})||[]}
  function same(value,target){return String(value==null?'':value).trim()===String(target==null?'':target).trim()}
  function tenantRows(property){return rows('tenants').filter(function(row){return Array.isArray(row)&&row.some(function(cell){return same(cell,property)})})}

  function tenantName(row,property,index){
    const preferred=[row?.[0],row?.[1]].find(function(value){
      const text=String(value==null?'':value).trim();
      return text&&text!==property&&!/^\d+(?:\.\d+)?$/.test(text)&&!PAID_RE.test(text)&&!DUE_RE.test(text);
    });
    if(preferred)return String(preferred);
    return 'مستأجر '+(index+1);
  }

  function status(row){
    const raw=String(row?.[3]||'').trim();
    if(PAID_RE.test(raw))return {key:'paid',label:raw||'مدفوع'};
    if(DUE_RE.test(raw))return {key:'due',label:raw||'مستحق'};
    return {key:'unknown',label:raw||'غير محدد'};
  }

  function monthValue(){const now=new Date();return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')}
  function monthShort(value){const m=String(value||'').match(/^(\d{4})-(\d{2})$/);return m?m[2]+'/'+m[1]:''}

  function collectionFor(property,item){
    const name=String(item.name||'').trim();
    const candidates=rows('collections').filter(function(row){
      if(!Array.isArray(row))return false;
      const text=row.map(function(v){return String(v==null?'':v)}).join(' | ');
      return text.includes(property)||(name&&text.includes(name));
    });
    return candidates.length?candidates[candidates.length-1]:[];
  }

  function statementModel(property){
    const record=propertyRecord(property);
    const tenants=tenantRows(property);
    const items=tenants.map(function(row,index){
      const item={
        unit:String(row?.[4]||row?.[5]||index+1),
        name:tenantName(row,property,index),
        contractNo:String(row?.[6]||row?.[7]||''),
        contractRent:num(row?.[2]),
        insurance:num(row?.[8]||0),
        advance:num(row?.[9]||0),
        cleaning:num(row?.[10]||0),
        currentRent:num(row?.[2]),
        paymentDate:'',paymentMethod:'',knetNo:'',voucherNo:'',receiptContract:'',accountant:'',
        status:status(row),raw:row
      };
      const c=collectionFor(property,item);
      if(c.length){
        item.currentRent=num(c?.[2])||item.currentRent;
        item.paymentDate=String(c?.[4]||c?.[1]||'');
        item.paymentMethod=String(c?.[5]||c?.[6]||'');
        item.knetNo=String(c?.[7]||'');
        item.voucherNo=String(c?.[8]||'');
        item.accountant=String(c?.[9]||'');
      }
      if(item.status.key!=='paid'&&!item.paymentDate)item.currentRent=num(row?.[2]);
      return item;
    });
    const totalRent=items.reduce(function(t,i){return t+i.currentRent},0);
    const totalInsurance=items.reduce(function(t,i){return t+i.insurance},0);
    const totalAdvance=items.reduce(function(t,i){return t+i.advance},0);
    const totalCleaning=items.reduce(function(t,i){return t+i.cleaning},0);
    return {record:record,items:items,totalRent:totalRent,totalInsurance:totalInsurance,totalAdvance:totalAdvance,totalCleaning:totalCleaning};
  }

  function cell(value,cls){return '<td'+(cls?' class="'+cls+'"':'')+'>'+esc(value==null?'':value)+'</td>'}
  function bilingual(ar,en){return '<span class="v202-bi"><b>'+esc(ar)+'</b><small>'+esc(en)+'</small></span>'}

  function renderStatement(month){
    const body=document.getElementById('v201StatementBody');
    const overlay=document.getElementById('v201RentStatement');
    const property=currentProperty();
    if(!body||!overlay?.classList.contains('on')||!property)return;

    const model=statementModel(property);
    const period=month||monthValue();
    const propertyUpper=property.toUpperCase();
    const bodyRows=model.items.length?model.items.map(function(item,index){
      return '<tr class="v202-ledger-row">'+
        cell(item.unit||index+1,'v202-unit')+
        cell(item.name,'v202-name')+
        cell(item.contractNo,'')+
        cell(item.contractRent?money(item.contractRent):'','v202-num')+
        cell(item.insurance?money(item.insurance):'','v202-num')+
        cell(item.advance?money(item.advance):'','v202-num')+
        cell(item.cleaning?money(item.cleaning):'','v202-num')+
        cell(item.currentRent?money(item.currentRent):'','v202-num')+
        cell(item.paymentDate,'')+
        cell(item.paymentMethod,'')+
        cell(item.knetNo,'')+
        cell(item.voucherNo,'')+
        cell(item.receiptContract,'')+
        cell(item.accountant,'')+
      '</tr>';
    }).join(''):'<tr><td colspan="14" class="v202-empty">لا توجد بيانات مستأجرين مرتبطة بهذا العقار.</td></tr>';

    const filler=Math.max(0,14-model.items.length);
    const fillerRows=Array.from({length:filler}).map(function(){return '<tr class="v202-ledger-row v202-filler">'+Array.from({length:14}).map(function(){return '<td>&nbsp;</td>'}).join('')+'</tr>'}).join('');

    body.innerHTML=
      '<section class="v202-paper" data-v202-statement data-property="'+esc(property)+'">'+
        '<header class="v202-letterhead">'+
          '<div class="v202-contact v202-contact-left"><strong>'+esc(propertyUpper)+'</strong><span>Tel: 50721277 / Tel: 51119040</span><span>Tel: 55521007 / Tel: 25640025</span></div>'+ 
          '<div class="v202-tower-mark"><span class="v202-building">▥</span><b>'+esc(property)+'</b><small>TOWER</small></div>'+ 
          '<div class="v202-contact v202-contact-right"><strong>'+esc(property)+'</strong><span>dhahawi.kw.com</span><span>dhahawitower@gmail.com</span></div>'+ 
        '</header>'+ 
        '<div class="v202-period-row"><div></div><label>الشهر / MONTH <input type="month" data-v202-month value="'+esc(period)+'"></label><strong>'+esc(monthShort(period))+'</strong></div>'+ 
        '<div class="v202-ledger-wrap"><table class="v202-ledger"><thead><tr>'+ 
          '<th>'+bilingual('رقم الوحدة','FLAT NO.')+'</th>'+ 
          '<th>'+bilingual('اسم المستأجر','NAME OF THE TENANT')+'</th>'+ 
          '<th>'+bilingual('رقم العقد','CONTRACT NO')+'</th>'+ 
          '<th>'+bilingual('عقد إيجار','RENT CONTRACT')+'</th>'+ 
          '<th>'+bilingual('تأمين','INSURANCE')+'</th>'+ 
          '<th>'+bilingual('عربون','ADVANCE')+'</th>'+ 
          '<th>'+bilingual('رسوم النظافة','CLEANING FEES')+'</th>'+ 
          '<th>'+bilingual('الإيجار الحالي','CURRENT RENT')+'</th>'+ 
          '<th>'+bilingual('تاريخ الدفع','PAYMENT DATE')+'</th>'+ 
          '<th>'+bilingual('طريقة الدفع','PAYMENT METHOD')+'</th>'+ 
          '<th>'+bilingual('رقم عملية كي نت','KNET OPERATION NUMBER')+'</th>'+ 
          '<th>'+bilingual('رقم الوصل','VOUCHER NO')+'</th>'+ 
          '<th>'+bilingual('استلام العقد','RECEIPT CONTRACT')+'</th>'+ 
          '<th>'+bilingual('المحاسب','ACCOUNTANT')+'</th>'+ 
        '</tr></thead><tbody>'+bodyRows+fillerRows+
        '<tr class="v202-total"><td colspan="3">الإجمالي / TOTAL</td><td>'+money(model.items.reduce(function(t,i){return t+i.contractRent},0))+'</td><td>'+money(model.totalInsurance)+'</td><td>'+money(model.totalAdvance)+'</td><td>'+money(model.totalCleaning)+'</td><td>'+money(model.totalRent)+'</td><td colspan="6"></td></tr>'+ 
        '</tbody></table></div>'+ 
        '<footer class="v202-paper-footer"><div class="v202-social">◉ &nbsp; f &nbsp; ● &nbsp; @'+esc(property.replace(/\s+/g,'').toUpperCase())+'</div><div>Salmiy'a - Block (10) - Street Essa Al Qutami - Bldg. (28)</div></footer>'+ 
      '</section>';

    overlay.dataset.v202='ready';
    document.body.classList.add('aq-v202');
  }

  function csvCell(value){return '"'+String(value==null?'':value).replace(/"/g,'""')+'"'}
  function exportCsv(){
    const property=currentProperty();if(!property)return;
    const model=statementModel(property);const month=document.querySelector('[data-v202-month]')?.value||monthValue();
    const lines=[['رقم الوحدة','اسم المستأجر','رقم العقد','عقد إيجار','تأمين','عربون','رسوم النظافة','الإيجار الحالي','تاريخ الدفع','طريقة الدفع','رقم عملية كي نت','رقم الوصل','استلام العقد','المحاسب']];
    model.items.forEach(function(i){lines.push([i.unit,i.name,i.contractNo,i.contractRent,i.insurance,i.advance,i.cleaning,i.currentRent,i.paymentDate,i.paymentMethod,i.knetNo,i.voucherNo,i.receiptContract,i.accountant])});
    const csv='\uFEFF'+lines.map(function(row){return row.map(csvCell).join(',')}).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='كشف-إيجار-'+property+'-'+month+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},0);
  }

  function installToolbar(){
    const toolbar=document.querySelector('#v201RentStatement .v201-statement-toolbar');if(!toolbar||toolbar.querySelector('[data-v202-csv]'))return;
    const csv=document.createElement('button');csv.type='button';csv.setAttribute('data-v202-csv','');csv.textContent='تنزيل Excel / CSV';
    const print=toolbar.querySelector('[data-v201-statement-print]');if(print)toolbar.insertBefore(csv,print);else toolbar.appendChild(csv);
  }

  function enhanceSoon(){setTimeout(function(){installToolbar();renderStatement()},40)}
  document.addEventListener('click',function(event){if(event.target.closest('[data-v201-property-action="statement"]'))enhanceSoon();if(event.target.closest('[data-v202-csv]'))exportCsv()},true);
  document.addEventListener('change',function(event){if(event.target.matches('[data-v202-month]'))renderStatement(event.target.value)});

  const observer=new MutationObserver(function(){const overlay=document.getElementById('v201RentStatement');if(overlay?.classList.contains('on')&&overlay.dataset.v202!=='ready')enhanceSoon();if(overlay&&!overlay.classList.contains('on'))delete overlay.dataset.v202});
  function boot(){document.body.classList.add('aq-v202');let meta=document.querySelector('meta[name="aqari-operations"]');if(!meta){meta=document.createElement('meta');meta.name='aqari-operations';document.head.appendChild(meta)}meta.content=DESIGN;observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});installToolbar()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();