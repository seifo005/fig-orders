(function(){
  const STORAGE_KEY = 'figPreordersV1';
  const STATUS_OPTIONS = ['pending','confirmed','shipped','delivered','cancelled'];

  // Tabs
  const tabs = ['dashboard','new','list','settings'];
  const tabButtons = document.querySelectorAll('[data-tab]');
  tabButtons.forEach(btn=>btn.addEventListener('click',()=>showTab(btn.dataset.tab)));
  function showTab(id){
    tabs.forEach(t=>{
      const sec = document.getElementById('tab-'+t);
      if(!sec) return;
      if(t===id){ sec.classList.remove('hidden'); } else { sec.classList.add('hidden'); }
    });
    if(id==='list') renderList();
    if(id==='dashboard') renderCharts();
  }
  showTab('dashboard');

  // Storage helpers
  function load(){
    try{ const raw = localStorage.getItem(STORAGE_KEY); return raw? JSON.parse(raw): []; }catch(e){ return []; }
  }
  function save(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
  function uid(){ try { return crypto.randomUUID(); } catch(_) { return 'id_'+Date.now()+'_'+Math.random().toString(16).slice(2); } }

  // State
  let orders = load();
  let selectedIds = new Set();

  // Form handlers
  const form = document.getElementById('orderForm');
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const o = {
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customerName: get('customerName'),
      phone: get('phone'),
      city: get('city'),
      address: get('address'),
      variety: get('variety'),
      quantity: Number(document.getElementById('quantity').value || 1),
      status: document.getElementById('status').value,
      deliveryMethod: document.getElementById('deliveryMethod').value,
      depositDZD: document.getElementById('depositDZD').value,
      notes: get('notes'),
    };
    if(!o.customerName || !o.phone || !o.variety){ toast('أكمل الاسم والهاتف والصنف'); return; }
    if(o.quantity <= 0){ toast('الكمية يجب أن تكون أكبر من صفر'); return; }
    orders = [o, ...orders];
    save(orders);
    form.reset();
    refreshAll();
    showTab('list');
    toast('تم الحفظ');
  });

  // Filters
  const fQ = document.getElementById('filter-q');
  const fStatus = document.getElementById('filter-status');
  const fVariety = document.getElementById('filter-variety');
  [fQ,fStatus,fVariety].forEach(el=> el.addEventListener('input', renderList));

  // Export / Import
  on('btn-export-all','click', ()=>{
    downloadJSON(`fig-preorders-${new Date().toISOString().slice(0,10)}.json`, orders);
  });
  on('btn-export-selected','click', ()=>{
    const sel = orders.filter(o=>selectedIds.has(o.id));
    if(sel.length===0) return toast('اختر على الأقل عنصرًا واحدًا.');
    downloadJSON(`fig-preorders-selection-${Date.now()}.json`, sel);
  });
  on('btn-import','click', ()=>document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change', (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(String(reader.result));
        if(!Array.isArray(data)) throw new Error('صيغة غير صحيحة');
        orders = data;
        save(orders);
        refreshAll();
        toast('تم الاستيراد بنجاح');
      }catch(err){ toast('فشل الاستيراد: '+err.message); }
    };
    reader.readAsText(file);
  });

  // Yalidine (placeholder)
  // لاحقًا نستبدل هذا بنداء API حقيقي
  // on('btn-send-yalidine','click', ()=> toast('الإرسال لـ Yalidine قريبًا.'));

  // List rendering
  function renderList(){
    const tbody = document.getElementById('ordersBody');
    tbody.innerHTML = '';
    selectedIds = new Set();

    // varieties for filter
    const allVarieties = Array.from(new Set(orders.map(o=>o.variety).filter(Boolean))).sort();
    const currentVarietyOptions = Array.from(fVariety.options).map(o=>o.value);
    if(allVarieties.join('|') !== currentVarietyOptions.filter(v=>v!=='all').join('|')){
      fVariety.innerHTML = '<option value="all">الكل</option>' + allVarieties.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    }

    const q = (fQ.value||'').toLowerCase().trim();
    const st = fStatus.value;
    const varf = fVariety.value;

    const filtered = orders.filter(o=>{
      if(q){
        const hay = `${o.customerName} ${o.phone} ${o.city} ${o.address} ${o.variety} ${o.notes}`.toLowerCase();
        if(!hay.includes(q)) return false;
      }
      if(st!=='all' && o.status!==st) return false;
      if(varf!=='all' && o.variety!==varf) return false;
      return true;
    });

    filtered.forEach(o=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" data-id="${o.id}"></td>
        <td>${fmtDate(o.createdAt)}</td>
        <td>${escapeHtml(o.customerName)}</td>
        <td>${escapeHtml(o.phone)}</td>
        <td>${escapeHtml(o.variety)}</td>
        <td>${o.quantity}</td>
        <td>
          <select data-status="${o.id}">
            ${STATUS_OPTIONS.map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
          </select>
        </td>
        <td>${escapeHtml(o.city||'')}</td>
        <td title="${escapeHtml(o.notes||'')}">${escapeHtml(o.notes||'')}</td>
        <td>
          <button class="btn" data-edit="${o.id}">تعديل</button>
          <button class="btn" data-del="${o.id}">حذف</button>
        </td>`;
      tbody.appendChild(tr);
    });

    // bulk check
    const checkAll = document.getElementById('checkAll');
    checkAll.checked = false;
    checkAll.onchange = (e)=>{
      const checks = tbody.querySelectorAll('input[type="checkbox"][data-id]');
      checks.forEach(ch=>{ ch.checked = e.target.checked; if(e.target.checked){selectedIds.add(ch.dataset.id);} else {selectedIds.delete(ch.dataset.id);} });
    };

    // row events
    tbody.querySelectorAll('input[type="checkbox"][data-id]').forEach(ch=>{
      ch.addEventListener('change', (e)=>{
        if(e.target.checked) selectedIds.add(ch.dataset.id); else selectedIds.delete(ch.dataset.id);
      });
    });

    tbody.querySelectorAll('button[data-del]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(!confirm('حذف هذا الحجز نهائيًا؟')) return;
        orders = orders.filter(o=>o.id!==btn.dataset.del);
        save(orders); refreshAll();
        toast('تم الحذف');
      });
    });

    tbody.querySelectorAll('button[data-edit]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const o = orders.find(x=>x.id===btn.dataset.edit); if(!o) return;
        // fill form and switch to new tab (edit mode)
        showTab('new');
        set('customerName', o.customerName);
        set('phone', o.phone);
        set('city', o.city||'');
        set('address', o.address||'');
        set('variety', o.variety);
        document.getElementById('quantity').value = o.quantity;
        document.getElementById('status').value = o.status;
        document.getElementById('deliveryMethod').value = o.deliveryMethod;
        document.getElementById('depositDZD').value = o.depositDZD||'';
        set('notes', o.notes||'');
        // hijack submit to update instead of create once
        const once = (ev)=>{
          ev.preventDefault();
          const idx = orders.findIndex(x=>x.id===o.id);
          if(idx>-1){
            orders[idx] = {
              ...o,
              updatedAt: new Date().toISOString(),
              customerName: get('customerName'),
              phone: get('phone'),
              city: get('city'),
              address: get('address'),
              variety: get('variety'),
              quantity: Number(document.getElementById('quantity').value || 1),
              status: document.getElementById('status').value,
              deliveryMethod: document.getElementById('deliveryMethod').value,
              depositDZD: document.getElementById('depositDZD').value,
              notes: get('notes'),
            };
            save(orders); refreshAll(); showTab('list'); toast('تم التعديل');
          }
          form.removeEventListener('submit', once);
        };
        form.addEventListener('submit', once);
      });
    });

    tbody.querySelectorAll('select[data-status]').forEach(sel=>{
      sel.addEventListener('change', ()=>{
        const o = orders.find(x=>x.id===sel.dataset.status); if(!o) return;
        o.status = sel.value; o.updatedAt = new Date().toISOString();
        save(orders); refreshAll(); toast('تم تغيير الحالة');
      });
    });
  }

  // KPIs + Charts
  let chartVariety, chartDay, chartStatus;
  function renderKPIs(){
    setText('kpi-total', orders.length);
    setText('kpi-qty', orders.reduce((s,o)=> s + Number(o.quantity||0), 0));
    const cnt = (s)=> orders.filter(o=>o.status===s).length;
    setText('kpi-pending', cnt('pending'));
    setText('kpi-confirmed', cnt('confirmed'));
    setText('kpi-cancelled', cnt('cancelled'));
  }
  function renderCharts(){
    renderKPIs();

    if(!window.Chart){
      const warn = document.getElementById('chartsWarning');
      if(warn) warn.classList.remove('hidden');
      return;
    }

    // by variety
    const mapV = new Map();
    orders.forEach(o=>{ if(!o.variety) return; mapV.set(o.variety, (mapV.get(o.variety)||0) + Number(o.quantity||0)); });
    const labelsV = Array.from(mapV.keys());
    const dataV = Array.from(mapV.values());
    if(chartVariety) chartVariety.destroy();
    chartVariety = new Chart(document.getElementById('chartByVariety'), {
      type: 'bar', data: { labels: labelsV, datasets: [{ label:'الكمية', data: dataV }] }, options:{ responsive:true, maintainAspectRatio:false }
    });

    // by day
    const mapD = new Map();
    orders.forEach(o=>{ const d = new Date(o.createdAt); const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(); mapD.set(key,(mapD.get(key)||0)+1); });
    const entriesD = Array.from(mapD.entries()).sort((a,b)=> new Date(a[0]) - new Date(b[0]));
    const labelsD = entriesD.map(([k])=> new Date(k).toLocaleDateString('ar-DZ'));
    const dataD = entriesD.map(([_,v])=> v);
    if(chartDay) chartDay.destroy();
    chartDay = new Chart(document.getElementById('chartByDay'), {
      type: 'line', data: { labels: labelsD, datasets: [{ label:'عدد الحجوزات', data: dataD, tension: .3 }] }, options:{ responsive:true, maintainAspectRatio:false }
    });

    // statuses
    const counts = STATUS_OPTIONS.map(s=> orders.filter(o=>o.status===s).length);
    const labelsS = STATUS_OPTIONS.map(statusLabel);
    if(chartStatus) chartStatus.destroy();
    chartStatus = new Chart(document.getElementById('chartStatuses'), {
      type: 'pie', data: { labels: labelsS, datasets: [{ data: counts }] }, options:{ responsive:true, maintainAspectRatio:false }
    });
  }

  function refreshAll(){ renderList(); renderCharts(); }

  // Helpers
  function on(id, ev, cb){ document.getElementById(id).addEventListener(ev, cb); }
  function get(id){ return document.getElementById(id).value.trim(); }
  function set(id, v){ document.getElementById(id).value = v; }
  function setText(id, v){ document.getElementById(id).textContent = v; }
  function statusLabel(v){ return ({ pending:'قيد الانتظار', confirmed:'مؤكد', shipped:'مُرسَل', delivered:'تمّ التسليم', cancelled:'ملغي' }[v] || v); }
  function downloadJSON(filename, data){
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s])); }
  function fmtDate(iso){ try { return new Date(iso).toLocaleString('ar-DZ'); } catch(_) { return iso; } }
  function toast(msg){
    const el = document.getElementById('toast');
    if(!el) return alert(msg);
    el.textContent = msg; el.classList.remove('hidden');
    setTimeout(()=> el.classList.add('hidden'), 1800);
  }

  // Initial
  refreshAll();
})();