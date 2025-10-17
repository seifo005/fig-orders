(() => {
  const STORAGE_KEY = 'figPreordersV3_Orders';
  const VARS_KEY = 'figVarietiesV3';
  const STATUS_OPTIONS = ['pending','confirmed','shipped','delivered','cancelled'];

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (Number(n||0)).toLocaleString('ar-DZ') + ' دج';
  const esc = (s) => String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

  function safeGet(key, fallback){ try{ const v=localStorage.getItem(key); return v? JSON.parse(v): fallback; }catch(e){ return fallback; } }
  function safeSet(key,val){ try{ localStorage.setItem(key, JSON.stringify(val)); return true; } catch(e){ $('#storageWarning')?.classList.remove('hidden'); return false; } }

  let varieties = [];
  async function loadVarieties(){
    try{
      const res = await fetch('varieties.json', {cache:'no-store'});
      if(res.ok){ varieties = await res.json(); safeSet(VARS_KEY, varieties); }
      else { varieties = safeGet(VARS_KEY, []); }
    }catch{ varieties = safeGet(VARS_KEY, []); }
    if(!Array.isArray(varieties)) varieties=[];
    varieties = varieties.map(v => typeof v === 'string' ? ({name:v, price:0}) : v);
    populateVarietySelect();
    renderVarietiesEditor();
  }

  function populateVarietySelect(){
    const sel = $('varietySelect');
    sel.innerHTML = varieties.map(v=>`<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('');
    if(varieties[0]) $('itemPrice').value = varieties[0].price || 0;
  }

  // FS Access API
  let fileHandle = null;
  async function linkOrdersJson(){
    if(!window.showOpenFilePicker){ alert('هذه الميزة مدعومة في Chrome/Edge. استخدم التصدير/الاستيراد في المتصفحات الأخرى.'); return; }
    try{
      const [handle] = await window.showOpenFilePicker({ types:[{ description:'JSON', accept:{'application/json':['.json']} }] });
      const perm = await handle.requestPermission({mode:'readwrite'});
      if(perm !== 'granted'){ alert('لم تُمنَح صلاحية الكتابة.'); return; }
      fileHandle = handle;
      await loadOrdersFromFile();
      alert('تم ربط الملف. سيتم الحفظ داخله.');
    }catch(e){ console.error(e); }
  }
  async function loadOrdersFromFile(){
    if(!fileHandle) return;
    const f = await fileHandle.getFile();
    const text = await f.text();
    let parsed = [];
    try{ parsed = JSON.parse(text); }catch{ parsed = []; }
    if(!Array.isArray(parsed)) parsed = [];
    orders = parsed;
    renderAll();
  }
  async function saveOrdersToFile(){
    if(!fileHandle) return false;
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([JSON.stringify(orders, null, 2)], {type:'application/json'}));
    await writable.close();
    return true;
  }

  let orders = safeGet(STORAGE_KEY, []);
  async function commitOrders(){
    let ok = true;
    if(fileHandle){
      try{ ok = await saveOrdersToFile(); }catch(e){ ok=false; console.error(e); }
    }
    if(!ok) safeSet(STORAGE_KEY, orders);
    else safeSet(STORAGE_KEY, orders);
  }

  // Draft items
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

  async function submitOrder(e){
    e.preventDefault();
    const customerName = $('customerName').value.trim();
    const phone = $('phone').value.trim().replace(/\D+/g,'');
    $('phone').value = phone;
    if(!/^\d+$/.test(phone)){ alert('الهاتف يجب أن يحتوي على أرقام فقط'); return; }
    if(!customerName || !phone){ alert('أكمل الاسم والهاتف'); return; }
    if(draftItems.length===0){ alert('أضف عنصرًا واحدًا على الأقل'); return; }

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
    $('orderForm').reset(); resetDraft(); populateVarietySelect();
    renderAll(); showTab('list');
  }

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

    tbody.querySelectorAll('button[data-del]').forEach(btn=> btn.addEventListener('click', async ()=>{
      if(!confirm('حذف هذا الحجز نهائيًا؟')) return;
      orders = orders.filter(o=>o.id!==btn.dataset.del);
      await commitOrders(); renderAll();
    }));
    tbody.querySelectorAll('button[data-edit]').forEach(btn=> btn.addEventListener('click', ()=>{
      const o = orders.find(x=>x.id===btn.dataset.edit); if(!o) return;
      showTab('new');
      $('customerName').value = o.customerName;
      $('phone').value = o.phone;
      $('city').value = o.city||'';
      $('address').value = o.address||'';
      $('status').value = o.status;
      $('deliveryMethod').value = o.deliveryMethod;
      $('depositDZD').value = o.depositDZD||0;
      $('notes').value = o.notes||'';
      draftItems = (o.items||[]).map(i=>({...i})); renderDraftItems();
      const once = async (ev) => {
        ev.preventDefault();
        if(draftItems.length===0){ alert('أضف عنصرًا واحدًا على الأقل'); return; }
        const idx = orders.findIndex(x=>x.id===o.id);
        if(idx>-1){
          orders[idx] = {
            ...o,
            updatedAt: new Date().toISOString(),
            customerName: $('customerName').value.trim(),
            phone: $('phone').value.trim().replace(/\D+/g,''),
            city: $('city').value.trim(),
            address: $('address').value.trim(),
            items: draftItems.slice(),
            status: $('status').value,
            deliveryMethod: $('deliveryMethod').value,
            depositDZD: Number($('depositDZD').value||0),
            notes: $('notes').value.trim(),
            total: draftItems.reduce((s,it)=> s + (it.total||0), 0)
          };
          await commitOrders(); renderAll(); showTab('list');
        }
        $('orderForm').removeEventListener('submit', once);
      };
      $('orderForm').addEventListener('submit', once);
    }));
    tbody.querySelectorAll('select[data-status]').forEach(sel=> sel.addEventListener('change', async ()=>{
      const o=orders.find(x=>x.id===sel.dataset.status); if(!o) return;
      o.status = sel.value; o.updatedAt = new Date().toISOString();
      await commitOrders(); renderAll();
    }));

    const checkAll = $('checkAll'); checkAll.checked=false;
    checkAll.onchange = (e)=>{
      const checks = tbody.querySelectorAll('input[type="checkbox"][data-id]');
      checks.forEach(ch=> ch.checked = e.target.checked);
    };
  }

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

  function renderVarietiesEditor(){
    const body = $('varietiesBody'); if(!body) return; body.innerHTML='';
    varieties.forEach((v)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(v.name)}</td><td>${v.price||0}</td><td class="muted">عدّل الملف varieties.json</td>`;
      body.appendChild(tr);
    });
  }

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
  $('resetForm').addEventListener('click', resetDraft);
  $('btn-link-orders-json').addEventListener('click', linkOrdersJson);
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

  loadVarieties().then(()=>{
    // Try to fetch orders.json if served via http(s)
    fetch('orders.json', {cache:'no-store'}).then(r=> r.ok ? r.json() : Promise.reject()).then(arr=>{
      if(Array.isArray(arr)) orders = arr;
      renderAll();
      showTab('new');
    }).catch(()=>{
      orders = safeGet(STORAGE_KEY, []);
      renderAll(); showTab('new');
    });
  });
})();