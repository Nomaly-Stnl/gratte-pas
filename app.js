/* Gratte pas — journal quotidien de la peau.
   Toutes les données restent dans le téléphone (localStorage). Aucun serveur. */
(() => {
  'use strict';

  const APP_VERSION = '1.1';
  const BUILD = '__BUILD__'; // remplacé automatiquement par GitHub Actions à chaque déploiement
  const K = { entries: 'gp.entries', poem: 'gp.poem', lists: 'gp.lists', meta: 'gp.meta' };

  const DEFAULT_LISTS = {
    zones: ['Mains', 'Cou', 'Plis des coudes', 'Arrière des genoux', 'Jambes', 'Torse', 'Dos'],
    traitements: ['Protopic', 'Crème hydratante', 'Antihistaminique', 'Collyre', 'Cortisone'],
    expositions: ['Cheval', 'Chat', 'Atelier', 'Nouveau produit', 'Maquillage', 'Chaleur / transpiration', 'Sport', 'Stress']
  };

  const POEM_QS = [
    'des démangeaisons à cause de l\'eczéma ?',
    'un sommeil perturbé par l\'eczéma ?',
    'une peau qui saigne ?',
    'une peau qui suinte (liquide clair) ?',
    'une peau crevassée ?',
    'une peau qui pèle ?',
    'une peau sèche ou rugueuse ?'
  ];
  const POEM_OPTS = ['Aucun', '1–2 jours', '3–4 jours', '5–6 jours', 'Tous les jours'];

  const CHEERS = [
    'C\'est noté.', 'Noté, merci !', 'Le chat approuve.', 'Au galop, c\'est enregistré.',
    'Une journée de plus dans le journal.', 'Enregistré. Et… gratte pas !'
  ];

  /* ---------- Stockage ---------- */
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const store = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { toast('Impossible d\'enregistrer : mémoire du téléphone pleine ?'); return false; }
  };

  let entries = load(K.entries, {});
  let poem = load(K.poem, {});
  let lists = Object.assign({}, DEFAULT_LISTS, load(K.lists, {}));
  let meta = load(K.meta, {});
  let persistAsked = false;

  /* ---------- Dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const todayKey = () => keyOf(new Date());
  const chDate = (k) => { const d = dateOf(k); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
  const shortDate = (k) => { const d = dateOf(k); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`; };
  const longDate = (k) => dateOf(k).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const mondayOf = (k) => { const d = dateOf(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return keyOf(d); };
  const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000);


  /* ---------- Photos : IndexedDB (plus de place que localStorage) ---------- */
  let dbP;
  const db = () => (dbP ||= new Promise((res, rej) => {
    const r = indexedDB.open('gratte-pas', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('photos', mode); const st = t.objectStore('photos');
      const out = fn(st);
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
    });
  };
  const photoPut = (p) => tx('readwrite', (st) => st.put(p));
  const photoGet = (id) => tx('readonly', (st) => st.get(id));
  const photoDel = (id) => tx('readwrite', (st) => st.delete(id));
  const photoAll = () => tx('readonly', (st) => st.getAll());
  const photoClear = () => tx('readwrite', (st) => st.clear());

  // Réduit la photo (1280 px max, JPEG) pour ménager la mémoire du téléphone.
  async function shrink(file) {
    let img;
    try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
    const w = img.width; const h = img.height; const k = Math.min(1, 1280 / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.8));
  }
  const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  const dataUrlToBlob = async (u) => (await fetch(u)).blob();

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

  /* ---------- Petits messages ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#saved');
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = 0; }, 2200);
  }

  function confirmBox(text, yesLabel = 'Confirmer') {
    return new Promise((resolve) => {
      $('#dialogText').textContent = text;
      $('#dialogYes').textContent = yesLabel;
      $('#dialog').hidden = false;
      const done = (v) => { $('#dialog').hidden = true; $('#dialogYes').onclick = $('#dialogNo').onclick = null; resolve(v); };
      $('#dialogYes').onclick = () => done(true);
      $('#dialogNo').onclick = () => done(false);
    });
  }

  /* ---------- Navigation ---------- */
  let view = 'today';
  function go(v) {
    view = v;
    $$('.view').forEach((s) => { s.hidden = s.dataset.view !== v; });
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.go === v));
    if (v === 'today') renderToday();
    if (v === 'trend') renderTrend();
    if (v === 'poem') renderPoem();
    if (v === 'data') renderData();
    window.scrollTo(0, 0);
  }
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

  /* =====================================================
     AUJOURD'HUI
     ===================================================== */
  let current = todayKey();
  const entry = () => entries[current];
  const ensure = () => (entries[current] ||= { date: current });

  let saveTimer;
  function save(quiet) {
    const e = entries[current];
    if (e) e.updatedAt = new Date().toISOString();
    if (!store(K.entries, entries)) return;
    if (!persistAsked && navigator.storage?.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }
    if (!quiet) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => toast(CHEERS[Math.floor(Math.random() * CHEERS.length)]), 250);
    }
    updateBanners();
  }

  const levelWord = (v) => v == null ? '' : v === 0 ? 'rien' : v <= 2 ? 'léger' : v <= 4 ? 'modéré' : v <= 6 ? 'marqué' : v <= 8 ? 'fort' : 'très fort';
  const levelColor = (v) => v <= 3 ? 'var(--sage)' : v <= 6 ? '#d0a15f' : '#c0664a';

  // Curseurs 0–10 : un toucher n'importe où sur la piste pose la valeur.
  function setupScale(box) {
    const key = box.dataset.key;
    const track = $('.track', box);
    const valFrom = (x) => {
      const r = track.getBoundingClientRect();
      const inner = r.width - 32;
      return Math.max(0, Math.min(10, Math.round(((x - r.left - 16) / inner) * 10)));
    };
    const set = (v, quiet) => { ensure()[key] = v; paintScale(box, v); save(quiet); };
    let dragging = false;
    track.addEventListener('pointerdown', (ev) => {
      dragging = true;
      track.setPointerCapture(ev.pointerId);
      const v = valFrom(ev.clientX);
      ensure()[key] = v; paintScale(box, v);
    });
    track.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const v = valFrom(ev.clientX);
      if (v !== entry()?.[key]) { ensure()[key] = v; paintScale(box, v); }
    });
    const end = () => { if (dragging) { dragging = false; save(); } };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('keydown', (ev) => {
      const cur = entry()?.[key] ?? 0;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { set(Math.min(10, cur + 1)); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { set(Math.max(0, cur - 1)); ev.preventDefault(); }
    });
  }
  function paintScale(box, v) {
    const track = $('.track', box);
    const out = $('output', box);
    const empty = v == null;
    track.classList.toggle('empty', empty);
    track.setAttribute('aria-valuenow', empty ? '' : v);
    if (empty) { out.textContent = 'touche pour noter'; return; }
    const pct = v / 10;
    $('.fill', box).style.width = `calc((100% - 32px) * ${pct})`;
    $('.fill', box).style.left = '16px';
    $('.fill', box).style.background = levelColor(v);
    $('.thumb', box).style.left = `calc(16px + (100% - 32px) * ${pct})`;
    $('.thumb', box).style.borderColor = levelColor(v);
    out.innerHTML = `<b>${v}</b>${levelWord(v)}`;
  }
  $$('.scale').forEach(setupScale);

  $('#calmDay').addEventListener('click', () => {
    const e = ensure();
    e.visage = 0; e.demangeaison = 0; e.brulure = 0;
    save(true);
    renderToday();
    toast('Belle journée, c\'est noté !');
  });

  // Choix unique (paupières, impact)
  $$('.chips.single').forEach((g) => {
    g.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      const key = g.dataset.key;
      let v = b.dataset.v; if (key === 'impact') v = Number(v);
      const e = ensure();
      e[key] = e[key] === v ? null : v;
      save(); renderToday();
    });
  });
  // Oui / non (yeux, éternuements, sommeil, règles)
  $$('.chips.toggles button').forEach((b) => {
    b.addEventListener('click', () => {
      const e = ensure(); const f = b.dataset.flag;
      e[f] = !e[f]; save(); renderToday();
    });
  });
  // Listes à choix multiples, avec ajout personnel
  function renderMulti(g) {
    const name = g.dataset.list;
    const sel = new Set(entry()?.[name] || []);
    const items = [...new Set([...lists[name], ...sel])];
    g.innerHTML = items.map((it) => `<button class="${sel.has(it) ? 'on' : ''}" data-item="${esc(it)}">${esc(it)}</button>`).join('')
      + '<button class="add" data-add="1">+ Ajouter</button>';
  }
  $$('.chips.multi').forEach((g) => {
    g.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      const name = g.dataset.list;
      if (b.dataset.add) {
        const input = document.createElement('input');
        input.type = 'text'; input.placeholder = 'Nouveau…'; input.className = 'chip-input';
        input.style.cssText = 'min-height:44px;border-radius:999px;border:0;padding:8px 14px;font:15px var(--font);background:var(--sage-l);color:var(--ink);width:160px';
        b.replaceWith(input); input.focus();
        const commit = () => {
          const t = input.value.trim();
          if (t) {
            if (!lists[name].includes(t)) { lists[name].push(t); store(K.lists, lists); }
            const e = ensure(); e[name] = [...new Set([...(e[name] || []), t])]; save();
          }
          renderMulti(g);
        };
        input.addEventListener('keydown', (k) => { if (k.key === 'Enter') input.blur(); });
        input.addEventListener('blur', commit);
        return;
      }
      const it = b.dataset.item;
      const e = ensure();
      const s = new Set(e[name] || []);
      s.has(it) ? s.delete(it) : s.add(it);
      e[name] = [...s];
      save(); renderMulti(g);
    });
  });

  let noteTimer;
  $('#note').addEventListener('input', (ev) => {
    ensure().note = ev.target.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => save(), 600);
  });

  // Photos du jour (facultatives)
  let thumbUrls = [];
  async function renderPhotos() {
    thumbUrls.forEach((u) => URL.revokeObjectURL(u)); thumbUrls = [];
    const ids = entry()?.photos || [];
    const box = $('#photos');
    const items = [];
    for (const id of ids) {
      let p; try { p = await photoGet(id); } catch { p = null; }
      if (!p) continue;
      const u = URL.createObjectURL(p.blob); thumbUrls.push(u);
      items.push(`<button data-photo="${id}" aria-label="Voir la photo"><img src="${u}" alt=""></button>`);
    }
    box.innerHTML = items.join('');
  }
  $('#photoInput').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try {
      const blob = await shrink(f);
      const id = `${current}-${Date.now()}`;
      await photoPut({ id, date: current, blob, createdAt: new Date().toISOString() });
      const e = ensure(); e.photos = [...(e.photos || []), id];
      save(true); renderPhotos(); toast('Photo ajoutée.');
    } catch { toast('Impossible d\'ajouter cette photo.'); }
  });
  let viewing = null; let viewUrl = null;
  $('#photos').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-photo]'); if (!b) return;
    const p = await photoGet(b.dataset.photo); if (!p) return;
    viewing = p; viewUrl = URL.createObjectURL(p.blob);
    $('#viewerImg').src = viewUrl; $('#viewer').hidden = false;
  });
  const closeViewer = () => { $('#viewer').hidden = true; if (viewUrl) URL.revokeObjectURL(viewUrl); viewing = null; };
  $('#vClose').addEventListener('click', closeViewer);
  $('#vSave').addEventListener('click', () => { if (viewing) shareFile(`gratte-pas-${viewing.date}.jpg`, viewing.blob, 'image/jpeg'); });
  $('#vDel').addEventListener('click', async () => {
    if (!viewing) return;
    const v = viewing;
    if (!await confirmBox('Supprimer cette photo ?', 'Supprimer')) return;
    await photoDel(v.id);
    const e = entries[v.date]; if (e) { e.photos = (e.photos || []).filter((x) => x !== v.id); }
    store(K.entries, entries); closeViewer(); renderPhotos();
  });

  $('#prevDay').addEventListener('click', () => { current = addDays(current, -1); renderToday(); });
  $('#nextDay').addEventListener('click', () => { if (current < todayKey()) { current = addDays(current, 1); renderToday(); } });

  function renderToday() {
    const t = todayKey();
    if (current > t) current = t;
    const e = entry() || {};
    $('#dayTitle').textContent = current === t ? 'Aujourd\'hui' : current === addDays(t, -1) ? 'Hier' : longDate(current).split(' ')[0].replace(/^./, (c) => c.toUpperCase());
    $('#dayDate').textContent = longDate(current);
    $('#nextDay').disabled = current >= t;
    $$('.scale').forEach((box) => paintScale(box, e[box.dataset.key] ?? null));
    $$('.chips.single').forEach((g) => {
      const v = e[g.dataset.key];
      $$('button', g).forEach((b) => b.classList.toggle('on', v != null && String(v) === b.dataset.v));
    });
    $$('.chips.toggles button').forEach((b) => b.classList.toggle('on', !!e[b.dataset.flag]));
    $$('.chips.multi').forEach(renderMulti);
    $('#note').value = e.note || '';
    renderPhotos();
    updateBanners();
  }

  function updateBanners() {
    const n = Object.keys(entries).length;
    const t = todayKey();
    let showB = false; let txt = '';
    if (n >= 3) {
      if (!meta.lastBackup) {
        const first = Object.keys(entries).sort()[0];
        if (daysBetween(first, t) >= 7) { showB = true; txt = 'Aucune sauvegarde pour l\'instant.'; }
      } else {
        const ago = daysBetween(meta.lastBackup.slice(0, 10), t);
        if (ago >= 7) { showB = true; txt = `Dernière sauvegarde il y a ${ago} jours.`; }
      }
    }
    $('#bannerBackup').hidden = !showB;
    $('#bannerBackupText').textContent = txt;
    const wd = new Date().getDay(); // 0 = dimanche, 6 = samedi
    const p = poem[mondayOf(t)];
    const done = p && p.q && p.q.every((x) => x != null);
    $('#bannerPoem').hidden = !((wd === 0 || wd === 6) && !done);
  }

  /* =====================================================
     ÉVOLUTION
     ===================================================== */
  let rangeDays = 30;
  $$('#range button').forEach((b) => b.addEventListener('click', () => {
    rangeDays = Number(b.dataset.days);
    $$('#range button').forEach((x) => x.classList.toggle('on', x === b));
    renderTrend();
  }));

  const maxOf = (e) => Math.max(e.visage ?? -1, e.demangeaison ?? -1, e.brulure ?? -1);
  const hasScores = (e) => e && maxOf(e) >= 0;

  function drawChart() {
    const svg = $('#chart');
    const W = svg.clientWidth; const H = svg.clientHeight;
    if (!W || !H) return;
    const t = todayKey();
    const days = []; for (let i = rangeDays - 1; i >= 0; i--) days.push(addDays(t, -i));
    const L = 26; const R = 8; const T = 8; const B = 24;
    const iw = W - L - R; const ih = H - T - B;
    const x = (i) => L + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
    const y = (v) => T + ih - (v / 10) * ih;
    const step = days.length > 1 ? iw / (days.length - 1) : iw;
    let s = '';
    days.forEach((d, i) => {
      const e = entries[d];
      if (hasScores(e) && maxOf(e) >= 5) s += `<rect x="${x(i) - step / 2}" y="${T}" width="${step}" height="${ih}" fill="var(--hard)"/>`;
    });
    [0, 5, 10].forEach((v) => {
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
      s += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
    });
    [['visage', 'var(--c-visage)'], ['demangeaison', 'var(--c-dem)'], ['brulure', 'var(--c-bru)']].forEach(([k, c]) => {
      let path = ''; let pen = false;
      days.forEach((d, i) => {
        const v = entries[d]?.[k];
        if (v == null) { pen = false; return; }
        path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true;
      });
      s += `<path d="${path}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (rangeDays <= 30) days.forEach((d, i) => {
        const v = entries[d]?.[k];
        if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${c}"/>`;
      });
    });
    const lab = [0, Math.floor((days.length - 1) / 2), days.length - 1];
    lab.forEach((i, j) => {
      const anchor = j === 0 ? 'start' : j === 2 ? 'end' : 'middle';
      s += `<text x="${x(i)}" y="${H - 6}" text-anchor="${anchor}" font-size="11" fill="var(--muted)">${shortDate(days[i])}</text>`;
    });
    svg.innerHTML = s;
  }
  const ro = new ResizeObserver(() => { if (view === 'trend') drawChart(); });
  ro.observe($('#chart'));

  function avgMax(fromOffset, n) {
    const t = todayKey(); const vals = [];
    for (let i = fromOffset; i < fromOffset + n; i++) { const e = entries[addDays(t, -i)]; if (hasScores(e)) vals.push(maxOf(e)); }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  function renderTrend() {
    drawChart();
    const t = todayKey();
    const inRange = Object.keys(entries).filter((k) => daysBetween(k, t) < rangeDays && daysBetween(k, t) >= 0 && hasScores(entries[k]));
    const hard = inRange.filter((k) => maxOf(entries[k]) >= 5).length;
    const a = avgMax(0, 7); const b = avgMax(7, 7);
    let trend = '';
    if (a != null && b != null) trend = a < b - 0.5 ? ' ↘' : a > b + 0.5 ? ' ↗' : ' →';
    $('#stats').innerHTML = `
      <div class="stat"><b>${inRange.length}/${rangeDays}</b><span>jours notés</span></div>
      <div class="stat"><b>${hard}</b><span>jours difficiles</span></div>
      <div class="stat"><b>${a == null ? '–' : a.toFixed(1) + trend}</b><span>moyenne 7 jours</span></div>`;
    const list = inRange.sort().reverse();
    $('#dayList').innerHTML = list.length ? list.map((k) => {
      const e = entries[k];
      const dot = (v) => v == null ? '<i style="background:var(--track);color:var(--muted)">–</i>' : `<i style="background:${levelColor(v)}">${v}</i>`;
      const extra = [e.sommeil && 'mal dormi', e.paupieres === 'fort' && 'paupières ++', e.note && 'note', (e.photos || []).length && 'photo'].filter(Boolean).join(' · ');
      return `<li data-day="${k}"><div class="d">${longDate(k)}<small>${esc(extra)}</small></div><div class="dots">${dot(e.visage)}${dot(e.demangeaison)}${dot(e.brulure)}</div></li>`;
    }).join('') : '<li class="empty">Rien encore sur cette période.</li>';
  }
  $('#dayList').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-day]'); if (!li) return;
    current = li.dataset.day; go('today');
  });

  /* =====================================================
     SEMAINE — POEM
     ===================================================== */
  const poemBand = (s) => s <= 2 ? 'peau presque calme' : s <= 7 ? 'eczéma léger' : s <= 16 ? 'eczéma modéré' : s <= 24 ? 'eczéma sévère' : 'eczéma très sévère';
  function renderPoem() {
    const wk = mondayOf(todayKey());
    const p = poem[wk] || { q: Array(7).fill(null) };
    $('#poemWeek').textContent = `Semaine du ${chDate(wk)} au ${chDate(addDays(wk, 6))}`;
    $('#poemQs').innerHTML = POEM_QS.map((q, i) => `
      <div class="poemq"><p>${i + 1}. ${esc(q)}</p>
        <div class="chips" data-q="${i}">${POEM_OPTS.map((o, v) => `<button data-v="${v}" class="${p.q[i] === v ? 'on' : ''}">${o}</button>`).join('')}</div>
      </div>`).join('');
    const complete = p.q.every((x) => x != null);
    const sc = $('#poemScore');
    sc.hidden = !complete;
    if (complete) {
      const s = p.q.reduce((a, b) => a + b, 0);
      sc.innerHTML = `<b>${s}<small style="font-size:18px;color:var(--muted)"> / 28</small></b>${poemBand(s)}`;
    }
    const weeks = Object.keys(poem).filter((k) => poem[k].q.every((x) => x != null)).sort().reverse();
    $('#poemList').innerHTML = weeks.length ? weeks.map((k) => {
      const s = poem[k].q.reduce((a, b) => a + b, 0);
      return `<li><div class="d">Semaine du ${chDate(k)}<small>${poemBand(s)}</small></div><div class="dots"><i style="background:${s <= 7 ? 'var(--sage)' : s <= 16 ? '#d0a15f' : '#c0664a'};width:40px">${s}</i></div></li>`;
    }).join('') : '<li class="empty">Pas encore de bilan.</li>';
  }
  $('#poemQs').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const i = Number(b.closest('[data-q]').dataset.q);
    const wk = mondayOf(todayKey());
    const p = (poem[wk] ||= { q: Array(7).fill(null) });
    p.q[i] = Number(b.dataset.v);
    p.updatedAt = new Date().toISOString();
    store(K.poem, poem);
    renderPoem();
    if (p.q.every((x) => x != null)) toast('Bilan enregistré, merci !');
  });

  /* =====================================================
     DONNÉES
     ===================================================== */
  function renderData() {
    const n = Object.keys(entries).length;
    $('#backupInfo').textContent = `${n} jour${n > 1 ? 's' : ''} noté${n > 1 ? 's' : ''}. Dernière sauvegarde : ${meta.lastBackup ? chDate(meta.lastBackup.slice(0, 10)) : 'jamais'}.`;
    $('#version').textContent = `Gratte pas · version ${APP_VERSION}` + (BUILD.startsWith('__') ? ' (dev)' : ` · ${BUILD}`);
    ['remTime', 'poemTime', 'poemDay'].forEach((id) => { if (meta[id]) $('#' + id).value = meta[id]; });
  }

  // Partager un fichier (Android : WhatsApp, Gmail, Drive…) ou le télécharger.
  async function shareFile(name, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }

  $('#btnBackup').addEventListener('click', async () => {
    let photos = [];
    try { photos = await Promise.all((await photoAll()).map(async (p) => ({ id: p.id, date: p.date, createdAt: p.createdAt, data: await blobToDataUrl(p.blob) }))); } catch {}
    const data = { app: 'gratte-pas', format: 1, exportedAt: new Date().toISOString(), entries, poem, lists, photos };
    const ok = await shareFile(`gratte-pas-sauvegarde-${todayKey()}.json`, JSON.stringify(data, null, 1), 'application/json');
    if (ok) { meta.lastBackup = new Date().toISOString(); store(K.meta, meta); renderData(); updateBanners(); toast('Sauvegarde faite.'); }
  });

  $('#restoreFile').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { data = null; }
    if (!data || data.app !== 'gratte-pas' || typeof data.entries !== 'object') { await confirmBox('Ce fichier n\'est pas une sauvegarde Gratte pas.', 'OK'); return; }
    const n = Object.keys(data.entries).length;
    if (!await confirmBox(`Restaurer ${n} jours ? Les jours déjà présents gardent leur version la plus récente.`, 'Restaurer')) return;
    for (const [k, e] of Object.entries(data.entries)) {
      const mine = entries[k];
      if (!mine || (e.updatedAt || '') > (mine.updatedAt || '')) entries[k] = e;
    }
    for (const [k, p] of Object.entries(data.poem || {})) {
      const mine = poem[k];
      if (!mine || (p.updatedAt || '') > (mine.updatedAt || '')) poem[k] = p;
    }
    for (const [k, arr] of Object.entries(data.lists || {})) lists[k] = [...new Set([...(lists[k] || []), ...arr])];
    for (const p of data.photos || []) {
      try { if (!await photoGet(p.id)) await photoPut({ id: p.id, date: p.date, createdAt: p.createdAt, blob: await dataUrlToBlob(p.data) }); } catch {}
    }
    store(K.entries, entries); store(K.poem, poem); store(K.lists, lists);
    renderData(); toast('Sauvegarde restaurée.');
  });

  // CSV pour Excel (Suisse) : point-virgule, BOM UTF-8 pour les accents, fins de ligne Windows.
  const cell = (v) => {
    if (v == null || v === false) return '';
    if (v === true) return 'oui';
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (rows) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const PAUP = { non: 'non', leger: 'un peu', fort: 'beaucoup' };
  const IMPACT = ['normale', 'un peu gênée', 'très gênée', 'impossible'];

  $('#btnCsv').addEventListener('click', () => {
    const keys = Object.keys(entries).sort();
    if (!keys.length) { toast('Rien à exporter pour l\'instant.'); return; }
    const rows = [['Date', 'Jour', 'Visage (0-10)', 'Démangeaison (0-10)', 'Brûlure (0-10)', 'Note max', 'Jour difficile',
      'Paupières gonflées', 'Yeux rouges / larmes', 'Éternuements', 'Mal dormi', 'Journée', 'Fatigue / stress (0-10)',
      'Règles', 'Autres zones', 'Traitements', 'Contacts et activités', 'Photos', 'Note']];
    keys.forEach((k) => {
      const e = entries[k]; const m = maxOf(e);
      rows.push([chDate(k), dateOf(k).toLocaleDateString('fr-CH', { weekday: 'long' }), e.visage, e.demangeaison, e.brulure,
        m >= 0 ? m : '', m >= 5, PAUP[e.paupieres] || '', e.yeux, e.eternuements, e.sommeil,
        e.impact != null ? IMPACT[e.impact] : '', e.fatigue, e.regles,
        (e.zones || []).join(', '), (e.traitements || []).join(', '), (e.expositions || []).join(', '), (e.photos || []).length || '', e.note || '']);
    });
    shareFile(`gratte-pas-journal-${todayKey()}.csv`, toCsv(rows), 'text/csv');
  });

  $('#btnCsvPoem').addEventListener('click', () => {
    const weeks = Object.keys(poem).filter((k) => poem[k].q.every((x) => x != null)).sort();
    if (!weeks.length) { toast('Pas encore de bilan complet.'); return; }
    const rows = [['Semaine du', 'Au', ...POEM_QS.map((q, i) => `Q${i + 1} ${q.replace(' ?', '')}`), 'Score POEM (0-28)', 'Interprétation']];
    weeks.forEach((k) => {
      const q = poem[k].q; const s = q.reduce((a, b) => a + b, 0);
      rows.push([chDate(k), chDate(addDays(k, 6)), ...q, s, poemBand(s)]);
    });
    shareFile(`gratte-pas-bilans-poem-${todayKey()}.csv`, toCsv(rows), 'text/csv');
  });

  // Rappels dans l'agenda (quotidien pour le journal, hebdomadaire pour le bilan)
  const timeParts = (id, dflt) => { const [h, m] = ($(id).value || dflt).split(':'); return [pad(h), pad(m)]; };
  ['remTime', 'poemTime', 'poemDay'].forEach((id) => $('#' + id).addEventListener('change', () => { meta[id] = $('#' + id).value; store(K.meta, meta); }));
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const REMINDERS = {
    daily: () => ({ time: timeParts('#remTime', '21:00'), start: todayKey(), rrule: 'RRULE:FREQ=DAILY',
      title: 'Gratte pas : 2 minutes pour ma peau', text: 'Ouvrir l\'app Gratte pas et noter la journée.', file: 'gratte-pas-rappel-soir.ics' }),
    weekly: () => {
      const wd = Number($('#poemDay').value);
      const d = new Date(); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
      return { time: timeParts('#poemTime', '20:00'), start: keyOf(d), rrule: `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[wd]}`,
        title: 'Gratte pas : bilan de la semaine', text: 'Ouvrir Gratte pas, onglet Semaine : 7 questions, 1 minute.', file: 'gratte-pas-rappel-semaine.ics' };
    }
  };
  function openGcal(r) {
    const [h, m] = r.time; const d = r.start.replace(/-/g, '');
    const endM = Number(m) + 5; const eh = pad((Number(h) + Math.floor(endM / 60)) % 24); const em = pad(endM % 60);
    const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + `&text=${encodeURIComponent(r.title)}&details=${encodeURIComponent(r.text)}`
      + `&dates=${d}T${h}${m}00/${d}T${eh}${em}00`
      + `&ctz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich')}`
      + `&recur=${encodeURIComponent(r.rrule)}`;
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function downloadIcs(r) {
    const [h, m] = r.time; const d = r.start.replace(/-/g, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gratte pas//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${r.file}-${Date.now()}@gratte-pas`, `DTSTAMP:${stamp}`, `DTSTART:${d}T${h}${m}00`, 'DURATION:PT5M',
      r.rrule, `SUMMARY:${r.title}`, `DESCRIPTION:${r.text}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${r.title}`, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    shareFile(r.file, ics, 'text/calendar');
  }
  $('#btnGcal').addEventListener('click', () => openGcal(REMINDERS.daily()));
  $('#btnIcs').addEventListener('click', () => downloadIcs(REMINDERS.daily()));
  $('#btnGcalPoem').addEventListener('click', () => openGcal(REMINDERS.weekly()));
  $('#btnIcsPoem').addEventListener('click', () => downloadIcs(REMINDERS.weekly()));

  $('#btnWipe').addEventListener('click', async () => {
    if (!await confirmBox('Effacer tout le journal de ce téléphone ? Fais d\'abord une sauvegarde si tu veux pouvoir le récupérer.', 'Tout effacer')) return;
    entries = {}; poem = {}; meta = {}; lists = Object.assign({}, DEFAULT_LISTS);
    [K.entries, K.poem, K.meta, K.lists].forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    try { await photoClear(); } catch {}
    current = todayKey(); renderData(); toast('Tout est effacé.');
  });

  /* ---------- Démarrage ---------- */
  const h = new Date().getHours();
  $('#hello').textContent = `${h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'}, comment va ta peau ?`;
  // Revenir à aujourd'hui quand l'app est rouverte le lendemain
  let openedOn = todayKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = todayKey();
    if (t !== openedOn) {
      if (current === openedOn) current = t;
      openedOn = t;
      if (view === 'today') renderToday();
    }
  });
  renderToday();

  /* ---------- Mises à jour automatiques ----------
     À chaque déploiement, sw.js change (numéro de build) : le téléphone installe
     la nouvelle version, l'app se recharge seule et affiche un bandeau. */
  function showUpdated() {
    let flag = null;
    try { flag = sessionStorage.getItem('gp.updated'); sessionStorage.removeItem('gp.updated'); } catch {}
    if (!flag) return;
    const el = $('#bannerUpdate');
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 5000);
    el.addEventListener('click', () => { el.hidden = true; }, { once: true });
  }
  showUpdated();

  if ('serviceWorker' in navigator) {
    let controlled = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!controlled) { controlled = true; return; } // première installation : pas de rechargement
      if (reloading) return;
      reloading = true;
      const n = $('#note'); if (n && entries[current] && n.value !== (entries[current].note || '')) { entries[current].note = n.value; save(true); }
      try { sessionStorage.setItem('gp.updated', '1'); } catch {}
      location.reload();
    });
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
        const check = () => reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
        setInterval(check, 60 * 60 * 1000);
      } catch {}
    });
  }
})();
