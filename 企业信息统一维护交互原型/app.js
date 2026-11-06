const $ = s => document.querySelector(s);
const clone = v => JSON.parse(JSON.stringify(v));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const now = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
const form = $('#enterpriseForm'), panel = $('.main-content');
const sections = [...form.querySelectorAll('.info-card')], supplement = $('.supplementary');
const actions = form.querySelector('.form-actions');
actions.querySelector('[type=submit]').setAttribute('form','enterpriseForm');
panel.append(actions);
const draftButton=document.createElement('button');draftButton.type='button';draftButton.id='saveDraft';draftButton.className='secondary-btn';draftButton.textContent='保存草稿';actions.insertBefore(draftButton,actions.querySelector('[type=submit]'));
for (const file of ['supplement.css','workflow.css']) {
  const link=document.createElement('link');link.rel='stylesheet';link.href='./'+file;document.head.append(link);
}
const fieldElements = [...form.querySelectorAll('input:not([type=file]),select')].filter(e=>!e.closest('.supplementary'));
const capture = () => fieldElements.map(e=>({value:e.value,checked:e.checked}));
const initialFields = capture();
const restore = values => fieldElements.forEach((e,i)=>{e.value=values[i].value;e.checked=values[i].checked;});
const baseCards = [...form.querySelectorAll('[data-image-card]')];
baseCards.forEach(card=>{card.dataset.baseKey=card.querySelector('input[type=file]').id;});
const riskTypes = ['场地视频/照片','租赁合同','在租设备使用证明','工作证明','身份证','企业营业执照','委托授权书'];
const extraTypes = ['租金收据','其他补充资料'];
const createRow = (type,source='other') => ({id:uid(),type,source,note:'',time:'',files:[],returned:false,reason:'',returnSnapshot:''});
function createOrder(kind,id) {
  return {id,kind,rows:[...riskTypes.filter(t=>kind==='企业'||t!=='企业营业执照').map(t=>createRow(t,'risk')),createRow('售前告知书','shipping')],fields:clone(initialFields),baseFiles:{},savedDraft:null,basicSaved:false,stage:'risk',reports:[],messages:[],history:[]};
}
const orders={企业:createOrder('企业','O26110216586671626218'),个人:createOrder('个人','O26110216418281226275')};
let owner='企业',draft=[],draftBase={},baseline='',focusBefore=null,actionKind=null,saving=false,draftLoaded=false,draftConfirmKind=null,draftConfirmLeave=false,draftConfirmFocus=null;
const fileBlobs=new Map();
let database=null;
function openDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open('enterprise-information-prototype',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function visitFiles(value,callback){if(!value||typeof value!=='object')return;if(typeof value.data==='string'&&typeof value.name==='string')callback(value);for(const child of Object.values(value))visitFiles(child,callback);}
async function persistOrders(){if(!database)throw new Error('本地存储不可用');const snapshot=clone(orders),blobs={};visitFiles(snapshot,f=>{if(f.data.startsWith('blob:')){const blob=fileBlobs.get(f.data);if(!blob)throw new Error('附件不可用');blobs[f.data]=blob;}});await new Promise((resolve,reject)=>{const tx=database.transaction('state','readwrite');tx.objectStore('state').put({version:1,orders:snapshot,blobs},'orders');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function loadOrders(){database=await openDatabase();const stored=await new Promise((resolve,reject)=>{const tx=database.transaction('state','readonly'),request=tx.objectStore('state').get('orders');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});if(!stored||stored.version!==1)return;const urls={};for(const [key,blob] of Object.entries(stored.blobs||{})){const url=URL.createObjectURL(blob);urls[key]=url;fileBlobs.set(url,blob);}visitFiles(stored.orders,f=>{if(urls[f.data])f.data=urls[f.data];});for(const kind of ['企业','个人'])if(stored.orders[kind])orders[kind]=stored.orders[kind];}
function persistBackground(){persistOrders().catch(()=>toast('本次变更未能保存到本地，刷新后可能丢失'));}
const order=()=>orders[owner];
const terminal=()=>['shipped','cancelled'].includes(order().stage);
const isCRM=()=>$('#system').value==='CRM 管理系统';
const materialsLocked=()=>order().stage==='cancelled';
const basicLocked=()=>isCRM()||materialsLocked()||['ready','shipped'].includes(order().stage);
const canUseDraft=()=>$('#system').value==='运营后台系统'&&['risk','ops'].includes(order().stage);
const readyRow=r=>r.files.length>0&&!r.returned;
const riskRows=rows=>rows.filter(r=>r.source==='risk');
const riskReady=rows=>riskRows(rows).every(readyRow);
const shippingReady=rows=>rows.some(r=>r.source==='shipping'&&r.files.length>0);
const signature=()=>JSON.stringify({rows:draft,fields:capture(),base:draftBase});
const dirty=()=>signature()!==baseline;
function update(){const changed=dirty(),cached=order().savedDraft;$('#dirtyHint').classList.toggle('hidden',!changed&&!draftLoaded);$('#dirtyHint').classList.toggle('draft-saved',!changed&&draftLoaded);$('#dirtyHint').textContent=changed?'信息已修改，保存后生效':draftLoaded?'草稿未生效，点击【保存】提交':'';$('#draftBanner').classList.toggle('hidden',!cached||!draftLoaded||materialsLocked());$('#draftBannerText').textContent='当前为草稿，保存后生效。编辑线上信息请先删除草稿。';$('#draftTimestamp').classList.toggle('hidden',!draftLoaded||!cached);$('#draftTimestamp').textContent=draftLoaded&&cached?`草稿 ${cached.time.slice(0,16)}`:'';}
function toast(text){const t=$('#toast');t.textContent=text;t.classList.toggle('draft-restored',text==='已恢复草稿');t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),text==='已恢复草稿'?1800:3200);}
function log(text){order().history.unshift({time:now(),text});}
$('#toast').setAttribute('role','status');$('#dirtyHint').setAttribute('aria-live','polite');
panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
$('#discardModal').setAttribute('role','alertdialog');$('#discardModal').setAttribute('aria-label','有未保存的修改');
$('#discardModal h2').textContent='有未保存的修改';
const leaveMessage=document.createElement('p');leaveMessage.textContent='离开前是否将当前内容存为草稿？';$('#discardModal h2').after(leaveMessage);
$('#discardChanges').textContent='不保存离开';$('#discardChanges').className='secondary-btn';
const saveAndLeave=document.createElement('button');saveAndLeave.id='saveDraftAndLeave';saveAndLeave.type='button';saveAndLeave.className='primary-btn';saveAndLeave.textContent='存为草稿并离开';$('#discardChanges').after(saveAndLeave);
$('#previewModal').setAttribute('role','dialog');$('#previewModal').setAttribute('aria-label','附件预览');
$('[data-close]').setAttribute('aria-label','关闭预览');

const launcher=document.createElement('div');launcher.className='launcher';
launcher.innerHTML=`<div class="launcher-title">订单资料维护 <small>交互演示</small></div>
<div class="launch-controls"><label>系统 <select id="system"><option>CRM 管理系统</option><option>运营后台系统</option><option>商家系统</option></select></label><label>订单类型 <select id="owner"><option>企业</option><option>个人</option></select></label><span id="orderNumber"></span></div>
<div class="order-overview"><div><small>订单状态</small><strong id="stageName"></strong></div><div><small>基本信息</small><strong id="basicState"></strong></div><div><small>风控资料</small><strong id="riskState"></strong></div><div><small>售前告知书</small><strong id="shippingState"></strong></div></div>
<div class="launch-actions"><button id="openInfo" class="primary-btn">企业信息</button><button id="openQuick" class="secondary-btn">补充资料</button><button id="openNotice" class="text-button">售前告知书</button><button id="resetDemo" class="secondary-btn" type="button">一键清除信息</button></div>
<div class="workflow-grid"><section class="workflow-card"><h2>流程操作 <small>角色演示</small></h2><label class="role-picker">当前角色 <select id="demoRole"><option value="risk">风控</option><option value="ops">运营</option><option value="merchant">商家</option></select></label><div id="roleActions"></div><div id="flowFeedback" role="status"></div><h3>处理记录</h3><div id="activityList"></div></section><section class="workflow-card group-panel"><h2>补充资料通知群 <small>通知模拟</small></h2><div id="groupMessages"></div></section></div>`;
document.body.prepend(launcher);
const reportHistory=document.createElement('div');reportHistory.id='reportHistory';$('#roleActions').after(reportHistory);
const shade=document.createElement('div');shade.className='info-shade';document.body.insertBefore(shade,$('.app-shell'));
const headerNav=document.createElement('div');headerNav.className='header-nav';headerNav.innerHTML='<button type="button" id="jumpBasic">基本信息</button><button type="button" id="jumpSupplement">补充资料</button>';
$('.page-header').insertBefore(headerNav,$('#closeButton'));
const draftTimestamp=document.createElement('span');draftTimestamp.id='draftTimestamp';draftTimestamp.className='draft-timestamp hidden';$('.page-header h1').after(draftTimestamp);
const draftBanner=document.createElement('div');draftBanner.id='draftBanner';draftBanner.className='draft-banner hidden';draftBanner.innerHTML='<span id="draftBannerText"></span><button type="button" class="secondary-btn" id="dropDraft">删除草稿</button>';form.prepend(draftBanner);
const draftConfirm=document.createElement('div');draftConfirm.id='draftConfirm';draftConfirm.className='modal-backdrop hidden';draftConfirm.innerHTML='<div class="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="draftConfirmTitle"><h2 id="draftConfirmTitle"></h2><p id="draftConfirmMessage"></p><div><button type="button" class="secondary-btn" id="draftConfirmCancel">取消</button><button type="button" class="primary-btn" id="draftConfirmAccept">确认</button></div></div>';document.body.append(draftConfirm);
function applyViewPermissions(){
  fieldElements.forEach(e=>{const locked=basicLocked()||!!e.closest('.readonly-card');if(e.matches('input:not([type=radio]):not([type=checkbox])')){e.readOnly=locked;e.disabled=false;}else e.disabled=locked;});
  form.querySelectorAll('.verify-field button').forEach(e=>{e.disabled=basicLocked();e.classList.toggle('hidden',basicLocked());});
  $('#addType').disabled=materialsLocked();$('#addType').closest('.type-picker').classList.toggle('hidden',materialsLocked());$('#copyHistorySite').disabled=materialsLocked()||owner==='个人';$('#copyHistorySite').classList.toggle('hidden',materialsLocked()||owner==='个人');
  $('#orderSync').classList.toggle('hidden',materialsLocked());$('#syncOrderNumber').disabled=materialsLocked();$('#confirmOrderSync').disabled=materialsLocked()||!$('#syncOrderNumber').value;
  $('#specialCustomerMaterials').disabled=materialsLocked();$('#specialCustomerMaterials').classList.toggle('hidden',materialsLocked());
  draftButton.disabled=!canUseDraft();draftButton.classList.toggle('hidden',!canUseDraft());saveAndLeave.classList.toggle('hidden',!canUseDraft());
  actions.querySelector('[type=submit]').disabled=materialsLocked();actions.querySelector('[type=submit]').classList.toggle('hidden',materialsLocked());$('#cancelButton').textContent=materialsLocked()?'关闭':'取消';
  panel.classList.toggle('read-only',materialsLocked());panel.classList.toggle('basic-read-only',basicLocked());
  renderBase();render();update();
}
function loadDraft(){const cached=order().savedDraft;if(!cached||!canUseDraft())return;draft=clone(cached.rows);draftBase=clone(cached.baseFiles);restore(cached.fields);mergeReturnRequirements();draftLoaded=true;baseline=signature();applyViewPermissions();}
function showDraftConfirm(kind,leave=false){
  if(saving||!canUseDraft())return;
  draftConfirmKind=kind;draftConfirmLeave=leave;draftConfirmFocus=document.activeElement;
  const copy={
    drop:['删除草稿？',dirty()?'删除后将放弃草稿及当前未保存的修改，并恢复线上信息。此操作无法撤销，确认删除？':'删除后将恢复线上信息，草稿无法找回。确认删除？','删除草稿']
  }[kind];
  $('#draftConfirmTitle').textContent=copy[0];$('#draftConfirmMessage').textContent=copy[1];$('#draftConfirmAccept').textContent=copy[2];
  if(leave)$('#discardModal').classList.add('hidden');
  draftConfirm.classList.remove('hidden');panel.inert=true;$('#draftConfirmCancel').focus();
}
function closeDraftConfirm(cancelled=false){
  draftConfirm.classList.add('hidden');
  if(cancelled&&draftConfirmLeave){$('#discardModal').classList.remove('hidden');panel.inert=true;$('#saveDraftAndLeave').focus();}
  else {panel.inert=false;if(draftConfirmFocus?.getClientRects().length)draftConfirmFocus.focus({preventScroll:true});else $('#closeButton').focus({preventScroll:true});}
}
$('#dropDraft').onclick=()=>showDraftConfirm('drop');$('#draftConfirmCancel').onclick=()=>{if(!saving)closeDraftConfirm(true);};
$('#draftConfirmAccept').onclick=async()=>{
  if(saving||!canUseDraft())return;
  const previous=order().savedDraft;order().savedDraft=null;setSaving(true);
  try{await persistOrders();closeDraftConfirm();displaySavedInformation();renderDashboard();toast('草稿已删除，已恢复线上信息');}catch{order().savedDraft=previous;toast('草稿删除失败，请重试');}finally{setSaving(false);if(!order().savedDraft)$('#closeButton').focus({preventScroll:true});}
};
const materialGroups=[{source:'risk',title:'风控资料',description:'风控资料全部上传并保存后，将自动通知风控人员审核并输出报告。'},{source:'shipping',title:'发货资料',description:'发货前请上传并保存售前告知书，未上传将无法发货。'},{source:'other',title:'其他资料',description:'按需补充，支持新增和移除。'}];
supplement.innerHTML=`<div class="supplement-heading"><div class="section-heading"><span></span><h2>补充资料</h2></div></div><div id="supplementBody">${materialGroups.map(g=>`<section class="material-group ${g.source}" aria-labelledby="${g.source}Heading"><header class="material-group-header"><div><h3 id="${g.source}Heading">${g.title}<span id="${g.source}Count" class="group-count"></span></h3><p>${g.description}</p></div>${g.source==='other'?`<label class="type-picker"><select id="addType" aria-label="添加其他资料"><option value="">＋ 添加其他资料</option>${extraTypes.map(t=>`<option>${t}</option>`).join('')}</select></label>`:''}</header><div class="supplement-table" id="${g.source}Table"><table><colgroup><col style="width:20%"><col style="width:23%"><col style="width:17%"><col style="width:${g.source==='other'?'32':'40'}%">${g.source==='other'?'<col style="width:8%">':''}</colgroup><thead><tr><th>资料类型</th><th>说明</th><th>上传时间</th><th>附件</th>${g.source==='other'?'<th>操作</th>':''}</tr></thead><tbody id="${g.source}Rows"></tbody></table></div>${g.source==='other'?'<div id="otherEmpty" class="group-empty-state">暂无其他资料</div>':''}</section>`).join('')}</div><p class="format-note">支持 JPG、PNG、MP4、MOV、WebM、PDF、Word、ZIP、RAR</p>`;

const requirementsPanel=document.createElement('section');requirementsPanel.id='riskRequirements';requirementsPanel.className='risk-requirements hidden';requirementsPanel.tabIndex=-1;requirementsPanel.setAttribute('aria-label','风控补充要求');$('#supplementBody').before(requirementsPanel);
const orderSync=document.createElement('div');orderSync.id='orderSync';orderSync.className='order-sync';orderSync.innerHTML='<label for="syncOrderNumber">选择同步订单号</label><select id="syncOrderNumber"><option value="">请选择同步订单号</option></select><button id="confirmOrderSync" class="secondary-btn" type="button" disabled>确认同步</button>';supplement.querySelector('.supplement-heading').append(orderSync);
const historyButton=document.createElement('button');historyButton.type='button';historyButton.id='copyHistorySite';historyButton.className='secondary-btn';historyButton.textContent='复制历史场地信息';supplement.querySelector('.supplement-heading').append(historyButton);historyButton.onclick=()=>{if(owner==='企业'&&!materialsLocked())openAction('siteHistory');};
const specialCustomerButton=document.createElement('button');specialCustomerButton.type='button';specialCustomerButton.id='specialCustomerMaterials';specialCustomerButton.className='secondary-btn';specialCustomerButton.textContent='特殊客户补充资料';supplement.querySelector('.supplement-heading').append(specialCustomerButton);
function samplePDF(title){const stream=`BT /F1 18 Tf 45 750 Td (${title}) Tj 0 -35 Td /F1 12 Tf (DEMO DOCUMENT - Historical site material) Tj ET`;const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const xref=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return 'data:application/pdf;base64,'+btoa(pdf);}
function sampleSitePhoto(label){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;const c=canvas.getContext('2d');c.fillStyle='#edf4ef';c.fillRect(0,0,640,400);c.fillStyle='#b9ccbf';c.fillRect(65,105,510,200);c.fillStyle='#e1ebe4';c.fillRect(90,130,135,145);c.fillRect(250,130,135,145);c.fillStyle='#6a8571';c.fillRect(410,145,135,160);c.fillStyle='#285c39';c.font='24px sans-serif';c.fillText(label,40,55);c.font='18px sans-serif';c.fillText('历史场地资料 · 演示样例',40,360);return canvas.toDataURL('image/png');}
const siteHistory={};
for(const kind of ['企业','个人'])siteHistory[kind]=['2026-10-26','2026-10-12'].map((date,index)=>{const id=(kind==='企业'?'QY':'GR')+'-HISTORY-'+(index+1),suffix=index?'B':'A';return {id,date,orderNo:'O'+date.replaceAll('-','')+(kind==='企业'?'001':'002'),site:'历史场地 '+suffix,materials:[{type:'场地视频/照片',note:'历史场地 '+suffix,files:[{id:id+'-photo',name:'场地照片_'+suffix+'.png',mime:'image/png',data:sampleSitePhoto('历史场地 '+suffix)}]},{type:'租赁合同',note:'历史租赁合同',files:[{id:id+'-contract',name:'租赁合同_'+suffix+'.pdf',mime:'application/pdf',data:samplePDF('Lease Agreement '+suffix)}]},{type:'租金收据',note:'历史租金收据',files:[{id:id+'-receipt',name:'租金收据_'+suffix+'.pdf',mime:'application/pdf',data:samplePDF('Rent Receipt '+suffix)}]}]};});
function selectedHistory(){return siteHistory[owner].find(h=>h.id===$('#historySource')?.value)||siteHistory[owner][0];}
// Static examples represent saved supplementary materials from other orders of the same customer.
const syncOrderSources={};
for(const kind of ['企业','个人'])syncOrderSources[kind]=siteHistory[kind].map((source,index)=>({...source,materials:[...clone(source.materials),{type:'工作证明',note:'历史订单已保存的工作证明',files:[{id:source.id+'-work',name:'工作证明.pdf',mime:'application/pdf',data:samplePDF('Employment Proof '+(index+1))}]},{type:'其他补充资料',note:'历史订单补充说明',files:[{id:source.id+'-other',name:'补充说明.pdf',mime:'application/pdf',data:samplePDF('Additional Material '+(index+1))}]}]}));
function refreshSyncOrders(){
  const sources=syncOrderSources[owner].filter(s=>s.orderNo!==order().id);
  $('#syncOrderNumber').innerHTML='<option value="">请选择同步订单号</option>'+sources.map(s=>`<option value="${esc(s.id)}">${esc(s.orderNo)}</option>`).join('');
  $('#confirmOrderSync').disabled=true;
}
$('#syncOrderNumber').onchange=()=>{$('#confirmOrderSync').disabled=materialsLocked()||!$('#syncOrderNumber').value;};
$('#confirmOrderSync').onclick=()=>{
  if(materialsLocked()||saving)return;
  const source=syncOrderSources[owner].find(s=>s.id===$('#syncOrderNumber').value&&s.orderNo!==order().id);
  if(!source){toast('请先选择同步订单号');return;}
  const materials=source.materials.filter(m=>m.files?.length);
  if(!materials.length){toast('该订单暂无可同步的补充资料');return;}
  let added=0;
  for(const material of materials){
    let target=draft.find(r=>r.type===material.type);
    if(!target){target=createRow(material.type);draft.push(target);}
    let rowAdded=0;
    for(const file of material.files){
      const historyKey=file.historyKey||source.id+':'+file.id;
      if(target.files.some(f=>f.historyKey===historyKey))continue;
      target.files.push({...clone(file),id:uid(),historyKey,historyOrder:source.orderNo});added++;rowAdded++;
    }
    if(rowAdded&&!target.note)target.note=material.note||'';
  }
  render();update();
  toast(added?`已同步 ${added} 个文件，点击【保存】后生效`:'该订单的资料已同步，无需重复添加');
};
function renderHistoryChoices(){const source=selectedHistory();$('#historyChoices').innerHTML=source.materials.map((m,i)=>`<label class="history-choice"><input type="checkbox" name="historyMaterial" value="${i}" checked><span><strong>${esc(m.type)}</strong><button type="button" data-history-preview="${i}">${esc(m.files[0].name)} · 预览</button></span></label>`).join('');}
const fileKind=f=>/^image\//.test(f.mime)||/\.(jpg|jpeg|png)$/i.test(f.name)?'image':/^video\//.test(f.mime)||/\.(mp4|mov|webm)$/i.test(f.name)?'video':'document';
const documentIcon='<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M8 2h17l11 11v32H8z" fill="#edf5ef" stroke="#6e9379" stroke-width="2"/><path d="M25 2v12h11M14 24h16M14 31h16M14 38h10" fill="none" stroke="#6e9379" stroke-width="2"/></svg>';
function fileTile(f,i){const kind=fileKind(f);const visual=kind==='image'?`<img src="${esc(f.data)}" alt="${esc(f.name)}">`:kind==='video'?`<video src="${esc(f.data)}#t=0.1" preload="metadata" muted playsinline aria-label="${esc(f.name)}封面"></video><span class="video-play" aria-hidden="true">▶</span>`:documentIcon;return `<div class="file-item file-${kind}"><button class="file-preview" type="button" data-preview-file="${i}" title="预览 ${esc(f.name)}" aria-label="预览 ${esc(f.name)}"><span class="file-visual">${visual}</span><span class="file-name">${esc(f.name)}</span></button>${materialsLocked()?'':`<button class="file-delete" type="button" data-delete-file="${i}" aria-label="删除 ${esc(f.name)}">×</button>`}</div>`;}
function uploadTile(type,returned=false){return `<label class="file-item drop-zone upload-tile"><span class="file-visual"><span class="upload-symbol" aria-hidden="true">＋</span></span><span class="file-name">${returned?'补充上传':'上传文件'}</span><input type="file" multiple accept=".jpg,.jpeg,.png,.mp4,.mov,.webm,.pdf,.doc,.docx,.zip,.rar" aria-label="上传${esc(type)}"></label>`;}
function rowStatus(r){if(r.returned)return '需修改';if(!r.files.length)return '待补充';const current=order().rows.find(x=>x.id===r.id);if(JSON.stringify(current?.files)===JSON.stringify(r.files))return '已上传';const cached=order().savedDraft?.rows.find(x=>x.id===r.id);return JSON.stringify(cached?.files)===JSON.stringify(r.files)?'已暂存':'待保存';}
function rowStatusClass(r){return {'已上传':'complete','待补充':'pending','需修改':'returned','已暂存':'draft','待保存':'unsaved'}[rowStatus(r)];}
function renderSummary(){for(const g of materialGroups){const rows=draft.filter(r=>r.source===g.source);$('#'+g.source+'Count').textContent=g.source==='other'?`${rows.length} 项`:`${rows.filter(readyRow).length} / ${rows.length} 项已添加`;}}
function renderRequirements(){
  const groups=new Map();
  for(const r of draft.filter(r=>r.source==='risk'&&r.reason)){
    const key=(r.returnBatchId||'')+':'+r.reason;
    if(!groups.has(key))groups.set(key,{reason:r.reason,time:r.returnTime||'',rows:[]});
    groups.get(key).rows.push(r);
  }
  requirementsPanel.classList.toggle('hidden',!groups.size);
  requirementsPanel.innerHTML=[...groups.values()].sort((a,b)=>b.time.localeCompare(a.time)).map(g=>`<article class="requirement-item"><header><h3>风控补充要求</h3>${g.time?`<time>${esc(g.time)}</time>`:''}</header><p class="requirement-types">涉及资料：${g.rows.map(r=>esc(r.type)).join('、')}</p><p class="requirement-message">${esc(g.reason)}</p></article>`).join('');
}
function render(){const scroll=form.scrollTop;renderSummary();renderRequirements();for(const g of materialGroups){const rows=draft.filter(r=>r.source===g.source);$('#'+g.source+'Rows').innerHTML=rows.map(r=>`<tr data-row="${r.id}" data-source="${r.source}" data-type="${esc(r.type)}"><td><strong>${esc(r.type)}</strong><div class="row-labels"><span class="row-status ${rowStatusClass(r)}">${rowStatus(r)}</span></div></td><td><textarea data-key="note" maxlength="300" placeholder="请输入说明" aria-label="${esc(r.type)}说明" ${materialsLocked()?'disabled':''}>${esc(r.note)}</textarea><small class="counter">${r.note.length}/300</small></td><td><span class="upload-time">${esc(r.time||'—')}</span></td><td>${r.returned?`<button type="button" class="return-hint" data-show-requirements>修改要求：${esc(r.reason)}</button>`:''}<div class="file-list">${r.files.map(fileTile).join('')}${materialsLocked()?'':uploadTile(r.type,r.returned)}</div><p class="row-error" role="alert"></p></td>${g.source==='other'?`<td>${materialsLocked()?'—':'<button type="button" class="remove-row">移除</button>'}</td>`:''}</tr>`).join('');if(g.source==='other'){$('#otherTable').classList.toggle('hidden',!rows.length);$('#otherEmpty').classList.toggle('hidden',!!rows.length);}}form.scrollTop=scroll;}
supplement.addEventListener('click',e=>{if(e.target.closest('[data-show-requirements]')){form.scrollTop+=requirementsPanel.getBoundingClientRect().top-form.getBoundingClientRect().top-16;requirementsPanel.focus({preventScroll:true});}});
function renderBase(){baseCards.forEach(card=>{const f=draftBase[card.dataset.baseKey];card.classList.toggle('is-empty',!f);card.querySelector('.base-thumbnail')?.remove();if(f){const img=document.createElement('img');img.className='base-thumbnail';img.src=f.data;img.alt=f.name;card.prepend(img);}card.querySelector('[data-image-delete]').disabled=basicLocked();card.querySelector('input[type=file]').disabled=basicLocked();card.querySelector('[data-preview]').disabled=!f;});}
function jump(target){if(target==='basic'){form.scrollTo({top:0});}else{const element=target==='notice'?$('#supplementBody tr[data-type="售前告知书"]'):supplement;form.scrollTop+=element.getBoundingClientRect().top-form.getBoundingClientRect().top-16;}}
function mergeReturnRequirements(){for(const current of riskRows(order().rows)){let r=draft.find(x=>x.id===current.id||x.type===current.type);if(!r){draft.push(clone(current));continue;}r.source='risk';if(current.returned){r.returned=true;r.reason=current.reason;r.returnSnapshot=current.returnSnapshot;r.returnBatchId=current.returnBatchId;r.returnTime=current.returnTime;}}}
function markMaterialForRevision(r,reason,batchId,time){r.returnSnapshot=JSON.stringify(r.files.map(f=>({id:f.id})));r.returned=true;r.reason=reason;r.returnBatchId=batchId;r.returnTime=time;}
function hasReturnUpload(r){const oldIds=JSON.parse(r.returnSnapshot||'[]').map(f=>f.id);return r.files.some(f=>!oldIds.includes(f.id));}
function displaySavedInformation(){const o=order();draftLoaded=false;draft=clone(o.rows);draftBase=clone(o.baseFiles);restore(o.fields);baseline=signature();renderBase();render();update();jump('basic');}
function openInfo(target='basic'){
  const o=order();draftLoaded=false;draft=clone(o.rows);draftBase=clone(o.baseFiles);restore(o.fields);
  refreshSyncOrders();
  $('.page-header h1').textContent=owner+'信息';panel.setAttribute('aria-label',owner+'信息');
  sections.forEach(s=>s.classList.remove('hidden'));if(owner==='个人'){sections[2].classList.add('hidden');sections[3].classList.add('hidden');}
  sections[1].querySelector('h2').textContent=owner==='个人'?'个人信息':'经办人信息';
  if(o.savedDraft&&canUseDraft())loadDraft();else{baseline=signature();applyViewPermissions();}document.body.classList.add('info-open');launcher.inert=true;$('#closeButton').focus({preventScroll:true});jump(target);
}
function closeInfo(){draftLoaded=false;panel.inert=false;document.body.classList.remove('info-open');launcher.inert=false;$('#discardModal').classList.add('hidden');draftConfirm.classList.add('hidden');$('#openInfo').focus({preventScroll:true});}
function requestClose(){if(saving)return;if(dirty()&&!materialsLocked()){const allowDraft=canUseDraft();leaveMessage.textContent=allowDraft?'离开前是否将当前内容存为草稿？':'存在未提交的修改，确认放弃并关闭？';saveAndLeave.classList.toggle('hidden',!allowDraft);$('#discardChanges').textContent=allowDraft?'不保存离开':'放弃修改';$('#discardChanges').className=allowDraft?'secondary-btn':'primary-btn';$('#discardModal').classList.remove('hidden');panel.inert=true;$('#continueEdit').focus();}else closeInfo();}
$('#closeButton').onclick=requestClose;$('#cancelButton').onclick=requestClose;
$('#continueEdit').onclick=()=>{if(saving)return;$('#discardModal').classList.add('hidden');panel.inert=false;$('#cancelButton').focus();};$('#discardChanges').onclick=()=>{if(!saving)closeInfo();};saveAndLeave.onclick=()=>saveDraft(true);
$('#openInfo').onclick=()=>openInfo();$('#openQuick').onclick=()=>openInfo('supplement');$('#openNotice').onclick=()=>openInfo('notice');
$('#jumpBasic').onclick=()=>jump('basic');$('#jumpSupplement').onclick=()=>jump('supplement');
$('#owner').onchange=e=>{owner=e.target.value;$('#flowFeedback').textContent='';renderDashboard();};
$('#system').onchange=renderDashboard;
$('#demoRole').onchange=renderDashboard;
$('#resetDemo').onclick=async()=>{
  const kind=owner,previous=orders[kind];
  if(!window.confirm(`确认清除当前${kind}订单的演示数据？\n已保存资料、草稿及流程记录将被清除，并恢复初始示例信息。`))return;
  const button=$('#resetDemo');button.disabled=true;
  orders[kind]=createOrder(kind,previous.id);
  try{await persistOrders();$('#flowFeedback').textContent='';renderDashboard();toast('已重置当前订单，可重新开始');}
  catch{orders[kind]=previous;renderDashboard();toast('清除失败，原有信息已保留，请重试');}
  finally{button.disabled=false;}
};
$('#addType').onchange=e=>{const type=e.target.value;e.target.value='';if(!type||materialsLocked())return;if(draft.some(r=>r.type===type)){toast('该类型已添加，请在现有条目中上传');return;}draft.push(createRow(type));render();update();};
form.addEventListener('input',e=>{const row=e.target.closest('[data-row]');if(row&&e.target.dataset.key==='note'){const r=draft.find(r=>r.id===row.dataset.row);r.note=e.target.value;row.querySelector('.counter').textContent=r.note.length+'/300';}update();});
form.addEventListener('change',update);
function filesChanged(r){render();update();}
function readFile(f){const data=URL.createObjectURL(f);fileBlobs.set(data,f);return {id:uid(),name:f.name,mime:f.type,data};}
function upload(row,files){if(materialsLocked())return;const r=draft.find(r=>r.id===row.dataset.row);if(!r)return;const errors=[];for(const f of files){if(!/\.(jpg|jpeg|png|mp4|mov|webm|pdf|doc|docx|zip|rar)$/i.test(f.name)){errors.push(`${f.name}：格式不支持`);continue;}r.files.push(readFile(f));}filesChanged(r);const error=$(`[data-row="${r.id}"] .row-error`);error.textContent=errors.join('；');}
$('#supplementBody').onchange=e=>{if(e.target.type==='file')upload(e.target.closest('[data-row]'),e.target.files);};
$('#supplementBody').ondragover=e=>{if(e.target.closest('[data-row]'))e.preventDefault();};
$('#supplementBody').ondrop=e=>{const row=e.target.closest('[data-row]');if(row){e.preventDefault();upload(row,e.dataTransfer.files);}};
$('#supplementBody').onclick=e=>{const row=e.target.closest('[data-row]'),button=e.target.closest('button');if(!row||!button)return;const r=draft.find(r=>r.id===row.dataset.row);if(button.hasAttribute('data-preview-file')){preview(r.files[Number(button.dataset.previewFile)]);return;}if(materialsLocked())return;if(button.classList.contains('remove-row')){if(r.source!=='other')return;draft=draft.filter(x=>x.id!==r.id);filesChanged(r);}else if(button.hasAttribute('data-delete-file')){r.files.splice(Number(button.dataset.deleteFile),1);filesChanged(r);}};
function syncBasicFile(key,file){const type=key==='license'?'企业营业执照':'身份证';const r=draft.find(r=>r.type===type);if(!r)return;r.files=r.files.filter(f=>f.baseKey!==key);if(file)r.files.push({...file,baseKey:key});filesChanged(r);}
baseCards.forEach(card=>{const key=card.dataset.baseKey;card.querySelector('input[type=file]').onchange=e=>{const file=e.target.files[0];if(!file||basicLocked())return;if(!/^image\//.test(file.type)){toast('请选择图片文件');return;}draftBase[key]=readFile(file);syncBasicFile(key,draftBase[key]);renderBase();update();};card.querySelector('[data-image-delete]').onclick=()=>{if(basicLocked())return;delete draftBase[key];syncBasicFile(key,null);renderBase();update();};card.querySelector('[data-preview]').onclick=()=>{if(draftBase[key])preview(draftBase[key]);};});
form.querySelector('.verify-field .text-button').onclick=()=>toast('验证码已发送（演示）');
function setSaving(value){
  saving=value;panel.setAttribute('aria-busy',String(value));
  if(value){const active=document.activeElement;if(active?.matches('#saveDraft,button[form=enterpriseForm],#saveDraftAndLeave,#draftConfirmAccept')){setSaving.button=active;setSaving.label=active.textContent;active.textContent=draftConfirmKind==='drop'&&!draftConfirm.classList.contains('hidden')?'删除中…':'保存中…';}}
  else if(setSaving.button){setSaving.button.textContent=setSaving.label;setSaving.button=null;}
  panel.inert=value||!$('#discardModal').classList.contains('hidden')||!draftConfirm.classList.contains('hidden');draftButton.disabled=value||!canUseDraft();actions.querySelector('[type=submit]').disabled=value||materialsLocked();for(const button of document.querySelectorAll('#discardModal button,#draftConfirm button'))button.disabled=value;
}
async function saveDraft(leave=false){
  if(!canUseDraft()||saving)return false;
  const o=order();
  if(!dirty()&&(draftLoaded||!o.savedDraft)){toast(draftLoaded?'草稿无新修改':'暂无修改，无需保存草稿');if(leave)closeInfo();return true;}
  const previous=clone(o.savedDraft);setSaving(true);
  o.savedDraft={rows:clone(draft),fields:capture(),baseFiles:clone(draftBase),time:now()};
  try{await persistOrders();loadDraft();renderDashboard();toast('草稿已保存');if(leave)closeInfo();return true;}
  catch{o.savedDraft=previous;toast(previous?'草稿保存失败，原草稿已保留，请重试':'草稿保存失败，修改内容已保留，请重试');return false;}
  finally{setSaving(false);}
}
draftButton.onclick=()=>saveDraft();
async function saveOfficial(){
  if(materialsLocked()||saving)return false;
  const o=order();
  if(!dirty()&&!draftLoaded&&o.basicSaved){toast('暂无修改，无需保存');return true;}
  const previous=clone(o),previousDraft=clone(draft),wasReady=riskReady(o.rows);setSaving(true);
  const time=now();for(const r of draft){const old=o.rows.find(x=>x.id===r.id);if(r.files.length&&JSON.stringify(old?.files)!==JSON.stringify(r.files))r.time=time;if(!r.files.length)r.time='';if(r.returned&&hasReturnUpload(r))r.returned=false;}
  o.rows=clone(draft);if(!basicLocked()){o.fields=capture();o.baseFiles=clone(draftBase);o.basicSaved=true;}if(draftLoaded)o.savedDraft=null;
  const changed=JSON.stringify(previous.rows)!==JSON.stringify(o.rows)||JSON.stringify(previous.fields)!==JSON.stringify(o.fields)||!previous.basicSaved;
  if(changed)log('销售保存基本信息及补充资料');
  if(!wasReady&&riskReady(o.rows)){o.messages.unshift({kind:'资料通知',time,text:`提示：订单 ${o.id} 客户已完成补充资料，请及时审核`});log('风控资料齐备，已发送群通知');}
  try{await persistOrders();draftLoaded=false;render();baseline=signature();update();renderDashboard();toast('保存成功');return true;}
  catch{orders[owner]=previous;draft=previousDraft;render();update();toast('保存失败，修改内容已保留，请重试');return false;}
  finally{setSaving(false);}
}
form.onsubmit=e=>{e.preventDefault();saveOfficial();};

function preview(f){focusBefore=document.activeElement;const sheet=$('.preview-sheet');sheet.replaceChildren();const title=document.createElement('h2');title.textContent=f.name;sheet.append(title);if(fileKind(f)==='image'){const img=document.createElement('img');img.src=f.data;img.alt=f.name;sheet.append(img);}else if(fileKind(f)==='video'){const video=document.createElement('video');video.src=f.data;video.controls=true;video.playsInline=true;sheet.append(video);}else if(/\.pdf$/i.test(f.name)){const frame=document.createElement('iframe');frame.src=f.data;frame.title=f.name;sheet.append(frame);}else{const p=document.createElement('p');p.textContent='此格式不支持在线预览，请下载查看。';const a=document.createElement('a');a.href=f.data;a.download=f.name;a.textContent='下载文件';sheet.append(p,a);}$('#previewModal').classList.remove('hidden');$('[data-close]').focus();}
$('[data-close]').onclick=()=>{$('.preview-sheet video')?.pause();$('#previewModal').classList.add('hidden');focusBefore?.focus({preventScroll:true});};

const stageNames={risk:'风控处理中',ops:'待运营评审',merchant:'待商家评审',ready:'待发货',shipped:'已发货',cancelled:'已取消'};
function renderDashboard(){const o=order(),rr=riskRows(o.rows);$('#orderNumber').textContent='订单 '+o.id;$('#openInfo').textContent=owner+'信息'+(o.savedDraft&&canUseDraft()?' · 有草稿':'');$('#stageName').textContent=stageNames[o.stage];$('#basicState').textContent=o.basicSaved?'已保存':'待保存';$('#riskState').textContent=rr.filter(readyRow).length+' / '+rr.length;$('#shippingState').textContent=shippingReady(o.rows)?'已上传':'待补充';
  const role=$('#demoRole').value;let content='';
  if(terminal())content='<p>订单已结束，资料与处理记录可继续查看。</p>';
  else if(role==='risk')content=`<p>已输出 ${o.reports.length} 版报告。风控可根据已上传资料及线下沟通结果输出报告。</p><div class="role-buttons"><button id="emitReport" class="primary-btn">${o.reports.length?'重新输出报告':'输出风控报告'}</button><button id="returnMaterials" class="secondary-btn">退回需补充资料</button></div>`;
  else if(role==='ops')content=o.stage==='ops'?'<div class="role-buttons"><button id="approveOps" class="primary-btn">运营评审通过</button><button id="cancelOrder" class="secondary-btn">不通过并取消订单</button></div>':'<p>当前无运营评审待办。</p>';
  else if(o.stage==='merchant')content='<div class="role-buttons"><button id="approveMerchant" class="primary-btn">商家评审通过</button><button id="cancelOrder" class="secondary-btn">不通过并取消订单</button></div>';
  else if(o.stage==='ready')content=`<p>${shippingReady(o.rows)?'售前告知书已上传，可发货。':'售前告知书待补充，暂不可发货。'}</p><div class="role-buttons"><button id="shipOrder" class="primary-btn">发货</button><button id="supplyNotice" class="secondary-btn">查看售前告知书</button></div>`;
  else content='<p>当前无商家评审或发货待办。</p>';
  $('#roleActions').innerHTML=content;
  reportHistory.innerHTML=o.reports.length?`<div class="report-history">${o.reports.slice().reverse().map((report,i)=>`<details ${i===0?'open':''}><summary>风控报告 V${report.version}${i===0?' · 最新':''}</summary><p>${esc(report.conclusion)}</p><small>${esc(report.time)} · 依据当时已保存的 ${riskRows(report.rows).filter(r=>r.files.length).length} 项风控资料</small></details>`).join('')}</div>`:'';
  $('#groupMessages').innerHTML=o.messages.length?o.messages.map(m=>`<article class="group-message"><small>${m.kind==='资料通知'?'补充资料通知':'风控报告通知'}</small><div><p>${esc(m.text)}</p><span>推送日期： ${esc(m.time)}</span></div></article>`).join(''):'<p class="group-empty">暂无通知</p>';
  $('#activityList').innerHTML=o.history.length?o.history.map(h=>`<div class="activity"><time>${esc(h.time)}</time><span>${esc(h.text)}</span></div>`).join(''):'<p>暂无处理记录</p>';
  $('#emitReport')?.addEventListener('click',()=>openAction('report'));$('#returnMaterials')?.addEventListener('click',()=>openAction('return'));
  $('#approveOps')?.addEventListener('click',()=>advance('merchant','运营评审通过'));
  $('#approveMerchant')?.addEventListener('click',()=>advance('ready','商家评审通过'));
  $('#cancelOrder')?.addEventListener('click',()=>openAction('cancel'));
  $('#shipOrder')?.addEventListener('click',()=>{if(!shippingReady(o.rows)){$('#flowFeedback').textContent='售前告知书未上传，无法发货。请补充并保存后重试。';return;}advance('shipped','商家完成发货');});
  $('#supplyNotice')?.addEventListener('click',()=>openInfo('notice'));
}
function advance(stage,text){order().stage=stage;log(text);$('#flowFeedback').textContent='';renderDashboard();persistBackground();toast(text);}
let newRiskTypeDraft=[''];
function availableRiskTypes(){const o=order();return [...new Set([...riskTypes,...extraTypes,...o.rows.filter(r=>r.source==='other').map(r=>r.type)])].filter(t=>(owner==='企业'||t!=='企业营业执照')&&!o.rows.some(r=>r.source==='risk'&&r.type===t));}
function renderNewRiskTypes(){const types=availableRiskTypes(),list=$('#newRiskTypeRows');if(!list)return;list.innerHTML=newRiskTypeDraft.map((value,index)=>`<div class="new-risk-type-row"><select aria-label="第 ${index+1} 项资料类型" data-new-risk-type="${index}"><option value="">请选择资料类型</option>${types.map(t=>`<option value="${esc(t)}" ${value===t?'selected':''} ${value!==t&&newRiskTypeDraft.includes(t)?'disabled':''}>${esc(t)}${value!==t&&newRiskTypeDraft.includes(t)?'（已选择）':''}</option>`).join('')}</select><button type="button" class="remove-risk-type" data-remove-risk-type="${index}" aria-label="删除第 ${index+1} 项资料要求">删除</button></div>`).join('')||`<p class="risk-type-empty">${types.length?'暂无新增条目，请添加资料类型':'所有可选资料类型均已添加，可切换至“要求修改资料”。'}</p>`;$('#addRiskTypeRow').disabled=newRiskTypeDraft.length>=types.length;}
function renderRiskAction(){
  const o=order();newRiskTypeDraft=availableRiskTypes().length?['']:[];
  $('#actionContent').innerHTML=`<div class="risk-action-tabs" role="group" aria-label="操作类型"><button type="button" data-risk-mode="add" aria-pressed="false">新增资料要求</button><button type="button" data-risk-mode="revise" aria-pressed="true">要求修改资料</button></div><section id="riskAddPanel" class="hidden"><p>新增要求将追加到风控资料中，不覆盖已有资料。</p><div class="new-risk-types"><div class="new-risk-type-heading">资料类型 <span class="required-mark">*</span></div><div id="newRiskTypeRows"></div><button type="button" id="addRiskTypeRow" class="add-risk-type">＋ 添加资料类型</button><p class="risk-type-hint">已添加的资料类型不再提供选择。</p></div><label for="newRiskReason">补充要求</label><textarea id="newRiskReason" maxlength="300" placeholder="请输入补充要求"></textarea></section><section id="riskRevisePanel"><p>选择需修改的已上传资料，并逐项填写修改要求。原附件保留。</p><div class="revision-list">${riskRows(o.rows).filter(r=>r.files.length).map(r=>`<div class="revision-choice"><label><input type="checkbox" name="returnType" value="${r.id}"><strong>${esc(r.type)}</strong><small>${r.files.length} 个附件</small></label><div class="revision-detail hidden"><label for="reason-${r.id}">修改要求 <span class="required-mark">*</span></label><textarea id="reason-${r.id}" data-revision-reason="${r.id}" maxlength="300" placeholder="请填写该资料的修改要求">${esc(r.returned?r.reason:'')}</textarea></div></div>`).join('')||'<p class="group-empty-state">暂无已上传的风控资料，可切换至“新增资料要求”。</p>'}</div></section>`;
  renderNewRiskTypes();setRiskActionMode('revise');
}
function setRiskActionMode(mode){$('#actionContent').dataset.riskMode=mode;$('#riskAddPanel').classList.toggle('hidden',mode!=='add');$('#riskRevisePanel').classList.toggle('hidden',mode!=='revise');document.querySelectorAll('[data-risk-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.riskMode===mode)));$('#actionError').textContent='';$('#actionConfirm').textContent=mode==='add'?'确认新增':'确认修改要求';}
function submitRiskAction(){
  const o=order(),time=now(),batchId=uid();
  if($('#actionContent').dataset.riskMode==='add'){
    const types=[...newRiskTypeDraft],reason=$('#newRiskReason').value.trim();
    if(!types.length){$('#actionError').textContent='请选择需要新增的资料类型';return false;}
    if(types.some(t=>!t)){$('#actionError').textContent='请选择每一项资料类型，或删除空白条目';document.querySelector('select[data-new-risk-type="'+types.indexOf('')+'"]')?.focus();return false;}
    if(new Set(types).size!==types.length||types.some(t=>!availableRiskTypes().includes(t))){$('#actionError').textContent='资料类型重复或已添加，请重新选择';return false;}
    for(const type of types){if(o.rows.some(r=>r.source==='risk'&&r.type===type))continue;let r=o.rows.find(r=>r.type===type&&r.source==='other');if(r)r.source='risk';else{o.rows.push(r=createRow(type,'risk'));}r.reason=reason;r.returnBatchId=batchId;r.returnTime=time;
      if(o.savedDraft){const cached=o.savedDraft.rows.find(x=>x.id===r.id||x.type===type);if(cached){cached.source='risk';cached.reason=reason;cached.returnBatchId=batchId;cached.returnTime=time;}else o.savedDraft.rows.push(clone(r));}
    }log('风控新增资料要求：'+types.join('、'));
  }else{
    const ids=[...document.querySelectorAll('input[name=returnType]:checked')].map(e=>e.value),selected=riskRows(o.rows).filter(r=>ids.includes(r.id)&&r.files.length);
    if(!selected.length){$('#actionError').textContent='请选择需要修改的已上传资料';return false;}
    for(const r of selected){const input=$('#reason-'+r.id);if(!input.value.trim()){$('#actionError').textContent='请填写“'+r.type+'”的修改要求';input.focus();return false;}}
    for(const r of selected){markMaterialForRevision(r,$('#reason-'+r.id).value.trim(),batchId,time);const cached=o.savedDraft?.rows.find(x=>x.id===r.id);if(cached){cached.returned=true;cached.reason=r.reason;cached.returnBatchId=batchId;cached.returnTime=time;cached.returnSnapshot=r.returnSnapshot;}}
    log('风控要求修改资料：'+selected.map(r=>r.type).join('、'));
  }return true;
}
const actionModal=document.createElement('div');actionModal.id='actionModal';actionModal.className='modal-backdrop hidden';actionModal.innerHTML='<div class="action-dialog" role="dialog" aria-modal="true" aria-labelledby="actionTitle"><h2 id="actionTitle"></h2><div id="actionContent"></div><p id="actionError" class="row-error" role="alert"></p><div class="action-buttons"><button id="actionCancel" class="secondary-btn">取消</button><button id="actionConfirm" class="primary-btn">确认</button></div></div>';document.body.append(actionModal);
function openAction(kind){actionKind=kind;focusBefore=document.activeElement;$('#actionError').textContent='';const o=order();$('#actionTitle').textContent={report:o.reports.length?'重新输出风控报告':'输出风控报告',return:'退回需补充资料',cancel:'取消订单',siteHistory:'复制历史场地信息'}[kind];
  if(kind==='report')$('#actionContent').innerHTML=`<p>本次输出第 ${o.reports.length+1} 版报告，已上传风控资料 ${riskRows(o.rows).filter(r=>r.files.length).length}/${riskRows(o.rows).length} 项。</p><p>${o.reports.length?'重新输出后，订单将回到商家评审，通过前不可发货。':'输出后，订单进入运营评审。'}</p><label>报告结论<textarea id="reportConclusion" maxlength="300" placeholder="请输入本次风控结论"></textarea></label>`;
  if(kind==='return')renderRiskAction();
  if(kind==='cancel')$('#actionContent').innerHTML='<p>订单取消后停止资料跟进，已上传资料与处理记录保留。</p>';
  if(kind==='siteHistory'){$('#actionContent').innerHTML=`<label>历史订单<select id="historySource">${siteHistory[owner].map(h=>`<option value="${h.id}">${h.date} · ${h.orderNo} · ${h.site}</option>`).join('')}</select></label><p>当前${owner}的历史资料示例。勾选后追加到补充资料，已有文件保留，保存后生效。</p><div id="historyChoices"></div>`;renderHistoryChoices();$('#historySource').onchange=renderHistoryChoices;}
  if(kind!=='return')$('#actionConfirm').textContent=kind==='siteHistory'?'确认复制':'确认';actionModal.classList.toggle('risk-action',kind==='return');actionModal.classList.remove('hidden');launcher.inert=true;panel.inert=document.body.classList.contains('info-open');$('#actionCancel').focus();
}
function closeAction(){actionModal.classList.add('hidden');panel.inert=false;launcher.inert=document.body.classList.contains('info-open');focusBefore?.isConnected&&focusBefore.focus({preventScroll:true});}
$('#actionContent').addEventListener('click',e=>{const button=e.target.closest('[data-history-preview]');if(button){e.preventDefault();preview(selectedHistory().materials[Number(button.dataset.historyPreview)].files[0]);}});
$('#actionCancel').onclick=closeAction;
$('#actionContent').addEventListener('click',e=>{const button=e.target.closest('[data-risk-mode]');if(button)setRiskActionMode(button.dataset.riskMode);});
$('#actionContent').addEventListener('change',e=>{if(e.target.matches('input[name=returnType]')){const detail=e.target.closest('.revision-choice').querySelector('.revision-detail');detail.classList.toggle('hidden',!e.target.checked);detail.querySelector('textarea').required=e.target.checked;}});
$('#actionContent').addEventListener('click',e=>{const remove=e.target.closest('[data-remove-risk-type]');if(remove){const index=Number(remove.dataset.removeRiskType);newRiskTypeDraft.splice(index,1);renderNewRiskTypes();$('#actionError').textContent='';(document.querySelector('[data-new-risk-type="'+Math.min(index,newRiskTypeDraft.length-1)+'"]')||$('#addRiskTypeRow')).focus();return;}if(e.target.closest('#addRiskTypeRow')&&newRiskTypeDraft.length<availableRiskTypes().length){newRiskTypeDraft.push('');renderNewRiskTypes();document.querySelector('[data-new-risk-type="'+(newRiskTypeDraft.length-1)+'"]').focus();$('#actionError').textContent='';}});
$('#actionContent').addEventListener('change',e=>{if(e.target.matches('[data-new-risk-type]')){const index=Number(e.target.dataset.newRiskType);newRiskTypeDraft[index]=e.target.value;renderNewRiskTypes();document.querySelector('[data-new-risk-type="'+index+'"]').focus();$('#actionError').textContent='';}});
$('#actionContent').addEventListener('input',()=>{if(actionKind==='return')$('#actionError').textContent='';});
$('#actionConfirm').onclick=()=>{const o=order();if(actionKind==='siteHistory'){if(materialsLocked())return;const selected=[...document.querySelectorAll('input[name=historyMaterial]:checked')].map(e=>Number(e.value));if(!selected.length){$('#actionError').textContent='请至少选择一项场地资料';return;}const source=selectedHistory();let added=0;for(const i of selected){const material=source.materials[i];let r=draft.find(row=>row.type===material.type);if(!r){r=createRow(material.type);draft.push(r);}for(const file of material.files){const historyKey=source.id+':'+file.id;if(r.files.some(f=>f.historyKey===historyKey))continue;r.files.push({...clone(file),id:uid(),historyKey,historyOrder:source.orderNo});added++;}if(!r.note)r.note=material.note;}closeAction();render();update();jump('supplement');toast(added?`已复制 ${added} 个文件，请保存`:'所选资料已存在，无需重复复制');return;}if(actionKind==='report'){const conclusion=$('#reportConclusion').value.trim();if(!conclusion){$('#actionError').textContent='请填写报告结论';return;}const repeated=o.reports.length>0;o.reports.push({version:o.reports.length+1,time:now(),conclusion,rows:clone(o.rows)});o.stage=repeated?'merchant':'ops';log(`风控输出第 ${o.reports.length} 版报告，订单进入${stageNames[o.stage]}`);o.messages.unshift({kind:'报告通知',time:now(),text:`订单 ${o.id} 已输出第 ${o.reports.length} 版风控报告，请${repeated?'商家':'运营'}评审。`});}
  else if(actionKind==='return'){if(!submitRiskAction())return;}
  else {o.stage='cancelled';log('评审不通过，订单取消');}
  closeAction();$('#flowFeedback').textContent='';renderDashboard();persistBackground();toast('操作成功');};

document.addEventListener('keydown',e=>{const scopes=[$('#previewModal'),$('#discardModal'),draftConfirm,actionModal];const popup=scopes.find(x=>!x.classList.contains('hidden'));if(e.key==='Escape'){if(popup===$('#previewModal'))$('[data-close]').click();else if(popup===$('#discardModal'))$('#continueEdit').click();else if(popup===draftConfirm)$('#draftConfirmCancel').click();else if(popup===actionModal)closeAction();else if(document.body.classList.contains('info-open'))requestClose();}if(e.key==='Tab'){const scope=popup||(document.body.classList.contains('info-open')?panel:null);if(!scope)return;const els=[...scope.querySelectorAll('button,input,select,textarea,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length);if(!els.length)return;if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0].focus();}}});
window.addEventListener('beforeunload',e=>{if(document.body.classList.contains('info-open')&&dirty()){e.preventDefault();e.returnValue='';}});
loadOrders().catch(()=>toast('本地存储不可用，请使用支持本地存储的浏览器')).finally(()=>{renderDashboard();openInfo();});
