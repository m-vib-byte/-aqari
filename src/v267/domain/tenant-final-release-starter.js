// Text supplied by the owner in this conversation. Editable draft only;
// it is never a signed acknowledgment, recorded settlement or legal approval.
import {documentFieldCatalog} from './rental-document-cycle.js';
import {defaultTemplatePresentation} from './rental-document-layout.js';
const pairs=[
['الإخلاء والتسليم / Vacation and delivery','أقر وأعترف إقراراً نهائياً وقاطعاً لا رجعة فيه بأنني قمت بإخلاء العين المؤجرة إخلاءً نهائياً كاملاً بتاريخ {{vacate_date}}، وسلمتها إلى مالك العقار بحالتها الراهنة وبكافة مفاتيحها وملحقاتها ومرافقها تسليماً فعلياً وقانونياً.','I hereby acknowledge and irrevocably admit, as a final and conclusive declaration, that I have completely and finally vacated the leased premises on {{vacate_date}} and delivered them to the property owner in their current condition together with all keys, accessories, attachments, and facilities by actual and legal delivery.'],
['حيازة المالك / Owner possession','وأصبحت العين المؤجرة تحت تصرف مالك العقار تصرفاً كاملاً دون أي معارضة أو منازعة مني أو من أي شخص يتبعني أو يشغل العين بواسطتي.','The leased premises have become under the full possession and control of the property owner without any objection, dispute, or claim from me or from any person acting under my authority or occupying the premises through me.'],
['الحقوق المالية / Financial rights','كما أقر وأعترف بأنني استلمت جميع حقوقي المالية – إن وجدت – استلاماً نهائياً.','I further acknowledge and admit that I have received all my financial rights, if any, in full and final settlement.'],
['إبراء الذمة / Release and discharge','وأبرأت ذمة مالك العقار إبراءً عاماً شاملاً ومطلقاً ونهائياً من أي حق أو مطالبة أو دعوى أو تعويض أو التزام ناشئ بصورة مباشرة أو غير مباشرة عن عقد الإيجار أو العين المؤجرة أو مدة إشغالها أو إنهائها أو إخلائها.','I hereby fully, absolutely, comprehensively, and finally release and discharge the property owner from any right, claim, lawsuit, compensation, obligation, or liability arising directly or indirectly from the lease agreement, the leased premises, the period of occupancy, its termination, or the vacation thereof.'],
['المطالبات / Claims','وأقر بأنه لا يحق لي مستقبلاً إقامة أو رفع أو تحريك أي دعوى أو مطالبة قضائية أو إدارية أو تحكيمية أو تقديم أي شكوى ضد مالك العقار تتعلق بالعين المؤجرة أو عقد الإيجار أو أي واقعة سابقة على تاريخ هذا الإقرار.','I acknowledge that I shall have no right in the future to initiate, file, pursue, or maintain any judicial, administrative, or arbitral claim, action, complaint, or proceeding against the property owner relating to the leased premises, the lease agreement, or any matter occurring before the date of this declaration.'],
['الحقوق الأخرى / Other rights','كما أقر بأنه لا توجد لي أو لمن يمثلني أو يخلفني أو يتنازل له عني أي حقوق أو مطالبات مالية أو عينية أو أدبية أو تعويضات حالية أو مستقبلية ضد مالك العقار.','I further acknowledge that neither I, nor any person representing me, succeeding me, or deriving rights through me, has any financial, proprietary, moral, or compensatory rights or claims, whether present or future, against the property owner.'],
['التنازل / Waiver','وأتنازل تنازلاً نهائياً غير قابل للرجوع عنه عن أي ادعاء أو حق من هذا القبيل.','I irrevocably and unconditionally waive any such right or claim.'],
['الاستهلاكات والرسوم / Utilities and fees','وأقر بأن جميع استهلاكات الكهرباء والماء والهاتف والرسوم والالتزامات المترتبة على العين المؤجرة حتى تاريخ الإخلاء قد تمت تسويتها أو أتحمل مسؤوليتها كاملة.','I acknowledge that all electricity, water, telephone charges, fees, and obligations relating to the leased premises up to the date of vacating have been fully settled, or that I shall bear full responsibility for them.'],
['المطالبة بالاستهلاكات / Utility claims','وأتعهد بعدم الرجوع على مالك العقار بأي مطالبة بشأنها.','I undertake not to make any claim whatsoever against the property owner in respect thereof.'],
['التوقيع / Signature','كما أقر بأن توقيعي على هذا الإقرار يعتبر حجة قاطعة ونهائية عليّ.','I further acknowledge that my signature on this declaration shall constitute final and conclusive evidence against me.'],
['المستند / Instrument','ويعتبر هذا الإقرار والمخالصة النهائية سنداً قانونياً كاملاً يجوز الاحتجاج به أمام جميع الجهات القضائية والإدارية والتنفيذية.','This declaration and final release shall constitute a complete legal instrument enforceable and admissible before all judicial, administrative, and enforcement authorities.'],
['الإرادة / Free will','وقد حرر هذا الإقرار بإرادتي الحرة دون أدنى إكراه أو غبن أو تدليس.','This declaration has been executed by my free will, without any coercion, duress, fraud, or misrepresentation.'],
['الأهلية / Capacity','وأنا بكامل أهليتي المعتبرة شرعاً وقانوناً.','I am fully competent and legally qualified to execute this declaration.']
];
const standard=['owner_name','tenant_name','tenant_civil_id','property_name','property_address','unit_no','contract_no','vacate_date','issued_at'];
const fields=standard.map(key=>{const {label,type}=documentFieldCatalog[key];return {key,label,type,required:true};});
fields.push({key:'property_automatic_ref',label:'الرقم الآلي للعقار',type:'text',required:false});
const presentation=defaultTemplatePresentation();presentation.signers.owner={name:false,signature:false,fingerprint:false};
export const tenantFinalReleaseStarter={
 starterId:'starter-tenant-final-release-v1',kind:'tenant_final_release',kind_label:'إقرار إخلاء ومخالصة من المستأجر',title:'مسودة إقرار إخلاء ومخالصة نهائية وإبراء ذمة شامل',fields,presentation,
 clauses:[
  {title:'بيانات الإقرار / Declaration details',text:'السيد مالك العقار / Property Owner: {{owner_name}}\nالعقار / Property: {{property_name}}\nالعنوان / Address: {{property_address}}\nالرقم الآلي / Automatic Reference: {{property_automatic_ref}}\nالوحدة / Unit: {{unit_no}}\nرقم العقد / Contract No.: {{contract_no}}\nتاريخ الإقرار / Declaration Date: {{issued_at}}'},
  ...pairs.map(([title,ar,en])=>({title,text:ar+'\n\n'+en})),
  {title:'المقر (المستأجر) / Declarant (Tenant)',text:'الاسم / Name: {{tenant_name}}\nالرقم المدني / Civil ID No.: {{tenant_civil_id}}'}
 ]
};
