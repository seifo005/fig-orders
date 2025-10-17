(() => {
  const STORAGE_KEY = 'figPreordersV5_Orders';
  const VARS_KEY = 'figVarietiesV5';
  const STATUS_OPTIONS = ['pending','confirmed','shipped','delivered','cancelled'];

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (Number(n||0)).toLocaleString('ar-DZ') + ' دج';
  const esc = (s) => String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

  function safeGet(key, fallback){ try{ const v=localStorage.getItem(key); return v? JSON.parse(v): fallback; }catch(e){ return fallback; } }
  function safeSet(key,val){ try{ localStorage.setItem(key, JSON.stringify(val)); return true; } catch(e){ $('#storageWarning')?.classList.remove('hidden'); return false; } }

  // ===== الأصناف =====
  let varieties = [];
  let varietiesHandle = null;

  async function linkVarietiesJson(){
    if(!window.showOpenFilePicker){ alert('ربط الملف متاح على Chrome/Edge. على المتصفحات الأخرى سيُحفظ محليًا فقط.'); return; }
    try{
      const [handle] = await window.showOpenFilePicker({ types:[{description:'JSON', accept:{'application/json':['.json']}}] });
      const perm = await handle.requestPermission({mode:'readwrite'});
      if(perm !== 'granted'){ alert('لم تُمنَح صلاحية الكتابة على varieties.json'); return; }
      varietiesHandle = handle;
      await loadVarietiesFromFile();
      alert('تم ربط varieties.json وسيُحفَظ داخله مباشرة.');
    }catch(e){ console.error(e); }
  }
  async function loadVarietiesFromFile(){
    if(!varietiesHandle) return;
    const f = await varietiesHandle.getFile();
    const text = await f.text();
    try{
      const parsed = JSON.parse(text);
      if(Array.isArray(parsed)){
        varieties = parsed.map(v => typeof v==='string'? {name:v, price:0} : v);
        safeSet(VARS_KEY, varieties);
      }
    }catch(e){ /* ignore */ }
    populateVarietySelect(); renderVarietiesEditor();
  }
  async function saveVarietiesToFile(){
    if(!varietiesHandle) return false;
    const writable = await varietiesHandle.createWritable();
    await writable.write(new Blob([JSON.stringify(varieties, null, 2)], {type:'application/json'}));
    await writable.close(); return true;
  }
  async function loadVarieties(){
    try{
      const res = await fetch('varieties.json', {cache:'no-store'});
      if(res.ok){ varieties = await res.json(); }
      else { varieties = safeGet(VARS_KEY, []); }
    }catch{ varieties = safeGet(VARS_KEY, []); }
    if(!Array.isArray(varieties)) varieties=[];
    varieties = varieties.map(v => typeof v==='string' ? ({name:v, price:0}) : v);
    if(varieties.length===0){ varieties = [{name:'العبيد',price:0},{name:'العامري',price:0}]; }
    safeSet(VARS_KEY, varieties);
    populateVarietySelect(); renderVarietiesEditor();
  }
  function populateVarietySelect(){
    const sel = $('varietySelect');
    sel.innerHTML = varieties.map(v=>`<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('');
    if(varieties[0]) $('itemPrice').value = varieties[0].price || 0;
  }
  function renderVarietiesEditor(){
    const body = $('varietiesBody'); if(!body) return; body.innerHTML='';
    varieties.forEach((v, idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input data-vname="${idx}" value="${esc(v.name)}"></td>
        <td><input data-vprice="${idx}" type="number" min="0" step="1" value="${v.price||0}"></td>
        <td><button class="btn" data-vdel="${idx}">حذف</button></td>`;
      body.appendChild(tr);
    });
  }
  $('addVariety')?.addEventListener('click', ()=>{
    varieties.push({name:'صنف جديد', price:0});
    renderVarietiesEditor(); populateVarietySelect();
  });
  $('saveVarieties')?.addEventListener('click', async ()=>{
    const names = document.querySelectorAll('[data-vname]');
    const next = [];
    names.forEach((el)=>{
      const idx = Number(el.getAttribute('data-vname'));
      const name = el.value.trim();
      const price = Number(document.querySelector(`[data-vprice="${idx}"]`).value || 0);
      if(name) next.push({name, price});
    });
    varieties = next; safeSet(VARS_KEY, varieties);
    populateVarietySelect(); renderVarietiesEditor();
    let ok = true;
    if(varietiesHandle){ try{ ok = await saveVarietiesToFile(); }catch(e){ ok=false; } }
    alert(ok ? 'تم حفظ الأصناف' : 'تم حفظ الأصناف محليًا فقط (اربط varieties.json للحفظ داخل الملف).');
  });
  $('varietiesBody')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-vdel]'); if(!btn) return;
    const idx = Number(btn.getAttribute('data-vdel'));
    varieties.splice(idx,1); renderVarietiesEditor(); populateVarietySelect();
  });

  // ===== الطلبات =====
  let orders = safeGet(STORAGE_KEY, []);
  let ordersHandle = null;
  let editingId = null; // وضع التحرير

  async function linkOrdersJson(){
    if(!window.showOpenFilePicker){ alert('هذه الميزة مدعومة على Chrome/Edge. استخدم التصدير/الاستيراد للمتصفحات الأخرى.'); return; }
    try{
      const [handle] = await window.showOpenFilePicker({ types:[{description:'JSON', accept:{'application/json':['.json']}}] });
      const perm = await handle.requestPermission({mode:'readwrite'});
      if(perm !== 'granted'){ alert('لم تُمنَح صلاحية الكتابة على orders.json'); return; }
      ordersHandle = handle;
      await loadOrdersFromFile();
      alert('تم ربط orders.json وسيُحفَظ داخله مباشرة.');
    }catch(e){ console.error(e); }
  }
  async function loadOrdersFromFile(){
    if(!ordersHandle) return;
    const f = await ordersHandle.getFile();
    const text = await f.text();
    try{ const parsed = JSON.parse(text); if(Array.isArray(parsed)) orders = parsed; }catch(e){ /* ignore */ }
    renderAll();
  }
  async function saveOrdersToFile(){
    if(!ordersHandle) return false;
    const writable = await ordersHandle.createWritable();
    await writable.write(new Blob([JSON.stringify(orders, null, 2)], {type:'application/json'}));
    await writable.close(); return true;
  }
  async function commitOrders(){
    let ok = true;
    if(ordersHandle){ try{ ok = await saveOrdersToFile(); }catch(e){ ok=false; } }
    if(!ok) safeSet(STORAGE_KEY, orders); else safeSet(STORAGE_KEY, orders);
  }

  // ===== عناصر الطلب في النموذج =====
  let draftItems = [];
  function addDraftItem(){
    const variety = $('varietySelect').value;
    const qty = Number($('itemQty').value || 1);
    const price = Number($('itemPrice').value || 0);
    if(!variety || qty<=0){ alert('اختر صنفًا وأدخل كمية صحيحة'); return; }
    draftItems.push({ variety, quantity: qty, unitPrice: price, total: qty*price });
    renderDraftItems();
  }
  function renderDraftItems(){
    const body = $('itemsBody'); body.innerHTML='';
    let sum=0;
    draftItems.forEach((it,i)=>{
      sum += it.total||0;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${esc(it.variety)}</td><td>${it.quantity}</td><td>${fmt(it.unitPrice)}</td><td><b>${fmt(it.total)}</b></td><td><button class="btn" data-del-item="${i}">حذف</button></td>`;
      body.appendChild(tr);
    });
    $('itemsTotal').textContent = fmt(sum);
  }
  function resetDraft(){ draftItems=[]; renderDraftItems(); }

  // ===== حفظ/تعديل الطلب =====
  async function submitOrder(e){
    e.preventDefault();
    const customerName = $('customerName').value.trim();
    const phone = $('phone').value.trim().replace(/\D+/g,'');
    $('phone').value = phone;
    if(!/^\d+$/.test(phone)){ alert('الهاتف يجب أن يحتوي على أرقام فقط'); return; }
    if(!customerName || !phone){ alert('أكمل الاسم والهاتف'); return; }
    if(draftItems.length===0){ alert('أضف عنصرًا واحدًا على الأقل'); return; }

    if(editingId){ // تحديث فقط
      const idx = orders.findIndex(x=> x.id === editingId);
      if(idx > -1){
        orders[idx] = {
          ...orders[idx],
          updatedAt: new Date().toISOString(),
          customerName,
          phone,
          city: $('city').value.trim(),
          address: $('address').value.trim(),
          items: draftItems.slice(),
          status: $('status').value,
          deliveryMethod: $('deliveryMethod').value,
          depositDZD: Number($('depositDZD').value||0),
          notes: $('notes').value.trim(),
          total: draftItems.reduce((s,it)=> s + (it.total||0), 0)
        };
        await commitOrders();
      }
    } else { // إنشاء جديد
      const order = {
        id: uid(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        customerName,
        phone,
        city: $('city').value.trim(),
        address: $('address').value.trim(),
        items: draftItems.slice(),
        status: $('status').value,
        deliveryMethod: $('deliveryMethod').value,
        depositDZD: Number($('depositDZD').value||0),
        notes: $('notes').value.trim(),
        total: draftItems.reduce((s,it)=> s + (it.total||0), 0)
      };
      orders = [order, ...orders];
      await commitOrders();
    }

    exitEditMode();
    renderAll(); showTab('list');
  }

  function enterEditMode(order){
    editingId = order.id;
    $('customerName').value = order.customerName;
    $('phone').value = order.phone;
    $('city').value = order.city||'';
    $('address').value = order.address||'';
    $('status').value = order.status;
    $('deliveryMethod').value = order.deliveryMethod;
    $('depositDZD').value = order.depositDZD||0;
    $('notes').value = order.notes||'';
    draftItems = (order.items||[]).map(i=>({...i}));
    renderDraftItems();
    const badge = $('editBadge'); if(badge) badge.style.display = 'inline-block';
    const submitBtn = document.querySelector('#orderForm button[type="submit"]'); if(submitBtn) submitBtn.textContent = 'تحديث الحجز';
  }
  function exitEditMode(){
    editingId = null;
    $('orderForm').reset(); resetDraft(); populateVarietySelect();
    const badge = $('editBadge'); if(badge) badge.style.display = 'none';
    const submitBtn = document.querySelector('#orderForm button[type="submit"]'); if(submitBtn) submitBtn.textContent = 'حفظ الحجز';
  }

  // ===== قائمة الطلبات + التصدير للمحدد =====
  function renderList(){
    const tbody = $('ordersBody'); tbody.innerHTML='';
    const q = ($('filter-q').value||'').toLowerCase().trim();
    const st = $('filter-status').value;
    const filtered = orders.filter(o=>{
      const hay = `${o.customerName} ${o.phone} ${o.city} ${o.address} ${(o.items||[]).map(i=>i.variety).join(' ')} ${o.notes||''}`.toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(st!=='all' && o.status!==st) return false;
      return true;
    });
    filtered.forEach(o=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" data-id="${o.id}"></td>
        <td>${new Date(o.createdAt).toLocaleString('ar-DZ')}</td>
        <td>${esc(o.customerName)}</td>
        <td>${esc(o.phone)}</td>
        <td>${(o.items||[]).map(i=>`<span class="badge">${esc(i.variety)} ×${i.quantity}</span>`).join(' ')}</td>
        <td><b>${fmt(o.total)}</b></td>
        <td>
          <select data-status="${o.id}">
            ${STATUS_OPTIONS.map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
          </select>
        </td>
        <td>${esc(o.city||'')}</td>
        <td title="${esc(o.notes||'')}">${esc(o.notes||'')}</td>
        <td><button class="btn" data-edit="${o.id}">تعديل</button> <button class="btn" data-del="${o.id}">حذف</button></td>`;
      tbody.appendChild(tr);
    });

    // row actions
    tbody.querySelectorAll('button[data-del]').forEach(btn=> btn.addEventListener('click', async ()=>{
      if(!confirm('حذف هذا الحجز نهائيًا؟')) return;
      orders = orders.filter(o=>o.id!==btn.dataset.del);
      await commitOrders(); renderAll();
    }));
    tbody.querySelectorAll('button[data-edit]').forEach(btn=> btn.addEventListener('click', ()=>{
      const o = orders.find(x=>x.id===btn.dataset.edit); if(!o) return;
      showTab('new'); enterEditMode(o);
    }));
    tbody.querySelectorAll('select[data-status]').forEach(sel=> sel.addEventListener('change', async ()=>{
      const o=orders.find(x=>x.id===sel.dataset.status); if(!o) return;
      o.status = sel.value; o.updatedAt = new Date().toISOString();
      await commitOrders(); renderAll();
    }));
  }

  // Export selected — compute on click from DOM (robust even بعد إعادة الرسم)
  $('btn-export-selected')?.addEventListener('click', ()=>{
    const checks = Array.from(document.querySelectorAll('#ordersBody input[type="checkbox"][data-id]:checked'));
    if(checks.length===0){ alert('اختر عنصرًا واحدًا على الأقل من الجدول.'); return; }
    const ids = new Set(checks.map(ch=> ch.getAttribute('data-id')));
    const sel = orders.filter(o=> ids.has(o.id));
    downloadJSON(`fig-preorders-selection-${Date.now()}.json`, sel);
  });

  // KPIs + Charts
  let chartVariety, chartDay, chartStatus;
  function renderKPIs(){
    const totalOrders = orders.length;
    const itemsCount = orders.reduce((s,o)=> s + (o.items? o.items.length : 0), 0);
    const qtyTotal = orders.reduce((s,o)=> s + (o.items||[]).reduce((x,i)=> x + Number(i.quantity||0), 0), 0);
    const amount = orders.reduce((s,o)=> s + Number(o.total||0), 0);
    $('#kpi-orders').textContent = totalOrders;
    $('#kpi-items').textContent = itemsCount;
    $('#kpi-qty').textContent = qtyTotal;
    $('#kpi-amount').textContent = fmt(amount);
  }
  function renderCharts(){
    renderKPIs();
    if(!window.Chart){ $('#chartsWarning')?.classList.remove('hidden'); return; }
    const mapV = new Map();
    orders.forEach(o=>(o.items||[]).forEach(it=> mapV.set(it.variety, (mapV.get(it.variety)||0) + Number(it.quantity||0)) ));
    const labelsV = Array.from(mapV.keys()), dataV = Array.from(mapV.values());
    if(chartVariety) chartVariety.destroy();
    chartVariety = new Chart($('#chartByVariety'), { type:'bar', data:{labels:labelsV, datasets:[{label:'الكمية', data:dataV}]}, options:{responsive:true, maintainAspectRatio:false} });
    const mapD = new Map();
    orders.forEach(o=>{ const d=new Date(o.createdAt); const key=new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(); mapD.set(key,(mapD.get(key)||0)+1); });
    const entriesD = Array.from(mapD.entries()).sort((a,b)=> new Date(a[0]) - new Date(b[0]));
    const labelsD = entriesD.map(([k])=> new Date(k).toLocaleDateString('ar-DZ')), dataD = entriesD.map(([_,v])=> v);
    if(chartDay) chartDay.destroy();
    chartDay = new Chart($('#chartByDay'), { type:'line', data:{labels:labelsD, datasets:[{label:'عدد الطلبات', data:dataD, tension:.3}]}, options:{responsive:true, maintainAspectRatio:false} });
    const counts = STATUS_OPTIONS.map(s=> orders.filter(o=>o.status===s).length);
    const labelsS = ['قيد الانتظار','مؤكد','مُرسَل','تمّ التسليم','ملغي'];
    if(chartStatus) chartStatus.destroy();
    chartStatus = new Chart($('#chartStatuses'), { type:'pie', data:{labels:labelsS, datasets:[{data:counts}]}, options:{responsive:true, maintainAspectRatio:false} });
  }

  // Tabs & events
  const tabs=['dashboard','new','list','settings'];
  document.querySelectorAll('[data-tab]').forEach(btn=> btn.addEventListener('click', ()=> showTab(btn.dataset.tab)));
  function showTab(id){
    tabs.forEach(t=>{ const sec=$('tab-'+t); if(!sec) return; (t===id)? sec.classList.remove('hidden') : sec.classList.add('hidden'); });
    if(id==='list') renderList();
    if(id==='dashboard') renderCharts();
    if(id==='settings') renderVarietiesEditor();
  }

  document.addEventListener('change', (e)=>{
    if(e.target && e.target.id==='varietySelect'){
      const v = varieties.find(x=>x.name===e.target.value);
      if(v) $('itemPrice').value = v.price||0;
    }
  });
  $('phone').addEventListener('input', (e)=>{ e.target.value = e.target.value.replace(/\D+/g,''); });
  $('addItem').addEventListener('click', addDraftItem);
  $('itemsTable').addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-del-item]'); if(!btn) return;
    const idx = Number(btn.getAttribute('data-del-item')); draftItems.splice(idx,1); renderDraftItems();
  });
  $('orderForm').addEventListener('submit', submitOrder);
  $('resetForm').addEventListener('click', ()=>{ exitEditMode(); });
  $('btn-link-orders-json')?.addEventListener('click', linkOrdersJson);
  $('btn-link-varieties-json')?.addEventListener('click', linkVarietiesJson);
  $('filter-q').addEventListener('input', renderList);
  $('filter-status').addEventListener('input', renderList);
  $('btn-export-all').addEventListener('click', ()=> downloadJSON(`fig-preorders-${new Date().toISOString().slice(0,10)}.json`, orders));
  $('btn-import').addEventListener('click', ()=> $('fileImport').click());
  $('fileImport').addEventListener('change', (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader(); reader.onload = async ()=>{
      try{ const data = JSON.parse(String(reader.result)); if(!Array.isArray(data)) throw new Error('صيغة غير صحيحة'); orders = data; await commitOrders(); renderAll(); alert('تم الاستيراد'); }catch(err){ alert('فشل الاستيراد: '+err.message); }
    }; reader.readAsText(file);
  });

  const uid = () => (crypto && crypto.randomUUID)? crypto.randomUUID(): 'id_'+Date.now()+'_'+Math.random().toString(16).slice(2);
  const statusLabel = (v) => ({ pending:'قيد الانتظار', confirmed:'مؤكد', shipped:'مُرسَل', delivered:'تمّ التسليم', cancelled:'ملغي' }[v]||v);
  function downloadJSON(filename, data){
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function renderAll(){ renderList(); renderCharts(); }

  // init
  loadVarieties().then(()=>{
    fetch('orders.json', {cache:'no-store'}).then(r=> r.ok ? r.json() : Promise.reject()).then(arr=>{
      if(Array.isArray(arr)) orders = arr;
      renderAll(); showTab('new');
    }).catch(()=>{
      orders = safeGet(STORAGE_KEY, []);
      renderAll(); showTab('new');
    });
  });
})();