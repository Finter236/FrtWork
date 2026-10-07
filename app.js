// app.js — каталог, скачивание и админка через GitHub REST API
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { key: null, salt: null, db: { files: [] }, cat: 'Все', picked: null, confirmInit: false };
const MAX = 50 * 1024 * 1024;
const icons = { pdf: 'file-text', doc: 'file-text', docx: 'file-text', txt: 'file-text', zip: 'archive', rar: 'archive', '7z': 'archive', gz: 'archive',
  mp3: 'music', wav: 'music', flac: 'music', mp4: 'film', mkv: 'film', mov: 'film', webm: 'film', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image' };
const icon = (n) => icons[(n.split('.').pop() || '').toLowerCase()] || 'file';
const fmt = (b) => b < 1024 ? b + ' Б' : b < 1048576 ? (b / 1024).toFixed(1) + ' КБ' : (b / 1048576).toFixed(1) + ' МБ';
const icons$ = () => lucide.createIcons();
const toast = (m, ms = 3500) => { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 3500); };

/* ---------- Блокировка ---------- */
// Сначала читаем базу через GitHub API (всегда свежая, без кэша Pages), запасной путь — файл с сайта
async function fetchDb() {
  const m = location.hostname.match(/^(.+)\.github\.io$/);
  if (m) {
    const repo = location.pathname.split('/')[1] || location.hostname;
    try {
      const r = await fetch(`https://api.github.com/repos/${m[1]}/${repo}/contents/data.json.enc`, { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
      if (r.ok) return r;
    } catch {}
  }
  return fetch('data.json.enc?t=' + Date.now(), { cache: 'no-store' });
}
async function unlock(create) {
  const pw = $('#pw').value; if (!pw) return;
  const btn = $('#lockBtn'), err = $('#lockErr'), nv = $('#newVault');
  const fail = (m) => { err.textContent = m; err.classList.remove('hidden');
    const f = $('#lockForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); };
  btn.disabled = true; btn.textContent = 'Расшифровка…'; err.classList.add('hidden');
  try {
    const r = await fetchDb();
    if (create) {
      if (r.ok) fail('База уже существует. Войдите обычной кнопкой — новая не создаётся.');
      else {
        S.salt = crypto.getRandomValues(new Uint8Array(16));
        S.key = await deriveKey(pw, S.salt); S.db = { files: [] }; S.dirty = true;
        $('#pw').value = ''; enter();
      }
    } else if (r.status === 404) {
      fail('Файл data.json.enc не найден в репозитории. Если база уже создавалась — подождите минуту и повторите.');
      nv.classList.remove('hidden');
    } else if (!r.ok) {
      fail('Не удалось загрузить базу (HTTP ' + r.status + ').');
    } else {
      let res; const buf = new Uint8Array(await r.arrayBuffer());
      try { res = await decryptDb(pw, buf); } catch {
        try { const p = await fetch('data.json.enc?t=' + Date.now(), { cache: 'no-store' }); // запасной источник
          if (p.ok) res = await decryptDb(pw, new Uint8Array(await p.arrayBuffer())); } catch {}
      }
      if (!res) fail(`Не удалось расшифровать (размер базы ${buf.length} Б). Проверьте пароль, раскладку и регистр — глазок справа покажет ввод.`);
      if (res) { Object.assign(S, res); S.dirty = false; $('#pw').value = ''; enter(); }
    }
  } catch (e) { fail('Ошибка сети: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Открыть';
}
$('#lockForm').onsubmit = (e) => { e.preventDefault(); unlock(false); };
$('#newVault').onclick = () => unlock(true);
$('#pat').oninput = (e) => (sessionStorage.pat = e.target.value);

function enter() {
  $('#lock').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#dirty').classList.toggle('hidden', !S.dirty);
  const m = location.hostname.match(/^(.+)\.github\.io$/), repo = location.pathname.split('/')[1];
  if (m) { $('#cOwner').value = localStorage.o || m[1]; $('#cRepo').value = localStorage.r || repo || m[1] + '.github.io'; }
  else { $('#cOwner').value = localStorage.o || ''; $('#cRepo').value = localStorage.r || ''; }
  $('#cBranch').value = localStorage.b || 'main';
  $('#pat').value = sessionStorage.pat || '';
  tab('catalog'); render();
}
$('#lockNow').onclick = () => location.reload(); // ключ живёт только в памяти страницы

function tab(t) {
  $('#catalog').classList.toggle('hidden', t !== 'catalog'); $('#admin').classList.toggle('hidden', t !== 'admin');
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('bg-white/15', b.dataset.tab === t));
}
document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

/* ---------- Каталог ---------- */
function render() {
  const files = S.db.files, q = $('#q').value.toLowerCase();
  const cats = ['Все', ...new Set(files.map((f) => f.cat).filter(Boolean))];
  if (!cats.includes(S.cat)) S.cat = 'Все';
  $('#chips').innerHTML = cats.map((c) => `<button class="chip ${c === S.cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  $('#chips').querySelectorAll('.chip').forEach((b) => (b.onclick = () => { S.cat = b.dataset.c; render(); }));
  const list = files.filter((f) => (S.cat === 'Все' || f.cat === S.cat) && (`${f.name} ${f.desc} ${f.cat}`).toLowerCase().includes(q));
  $('#grid').innerHTML = list.length ? list.map((f, i) => `
    <article class="card glass rise flex flex-col rounded-2xl p-5" style="animation-delay:${Math.min(i, 8) * 40}ms">
      <div class="mb-3 flex items-start gap-3">
        <div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-500/20 text-indigo-200"><i data-lucide="${icon(f.name)}"></i></div>
        <div class="min-w-0"><h3 class="truncate font-semibold" title="${esc(f.name)}">${esc(f.title || f.name)}</h3>
          <p class="text-xs text-white/45">${fmt(f.size)} · ${new Date(f.date).toLocaleDateString('ru-RU')}${f.cat ? ' · ' + esc(f.cat) : ''}</p></div>
      </div>
      <p class="mb-4 flex-1 text-sm text-white/65">${esc(f.desc) || '<span class="text-white/30">Без описания</span>'}</p>
      <button class="btn btn-p dl" data-id="${f.id}"><i data-lucide="download" class="h-4 w-4"></i>Скачать</button>
    </article>`).join('')
    : '<p class="col-span-full py-16 text-center text-white/45">Ничего не найдено. Загрузите файлы во вкладке «Админ».</p>';
  document.querySelectorAll('.dl').forEach((b) => (b.onclick = () => download(b.dataset.id)));
  $('#adminList').innerHTML = files.map((f) => `
    <div class="glass flex items-center gap-3 rounded-xl p-3"><i data-lucide="${icon(f.name)}" class="h-4 w-4 shrink-0"></i>
      <span class="min-w-0 flex-1 truncate">${esc(f.title || f.name)} <span class="text-xs text-white/40">${fmt(f.size)}</span></span>
      <button class="btn btn-g del !py-1.5" data-id="${f.id}"><i data-lucide="trash-2" class="h-4 w-4 text-rose-400"></i></button></div>`).join('')
    || '<p class="text-sm text-white/40">Пока пусто.</p>';
  document.querySelectorAll('.del').forEach((b) => (b.onclick = () => removeFile(b.dataset.id)));
  icons$();
}
$('#q').oninput = render;

/* ---------- Скачивание: fetch -> прогресс -> расшифровка в браузере ---------- */
const dlUi = (name, stage, pct) => {
  $('#dl').classList.remove('hidden'); $('#dl').classList.add('grid');
  $('#dlName').textContent = name; $('#dlStage').textContent = stage;
  $('#dlBar').style.width = pct + '%'; $('#dlPct').textContent = Math.round(pct) + '%';
};
async function download(id) {
  const f = S.db.files.find((x) => x.id === id); if (!f) return;
  try {
    dlUi(f.name, 'Загрузка', 0);
    const r = await fetch('blobs/' + f.blob, { cache: 'no-store' });
    if (!r.ok) throw new Error('Файл не найден (возможно, Pages ещё публикует его)');
    const total = +r.headers.get('content-length') || f.size + 28;
    const rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; dlUi(f.name, 'Загрузка', Math.min(got / total, 1) * 90); }
    const all = new Uint8Array(got); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
    dlUi(f.name, 'Расшифровка', 95);
    const plain = await decryptBytes(S.key, all);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([plain])); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4e4);
    dlUi(f.name, 'Готово', 100); await new Promise((r) => setTimeout(r, 600));
  } catch (e) { toast('Ошибка: ' + e.message, 9000); }
  $('#dl').classList.add('hidden'); $('#dl').classList.remove('grid');
}

/* ---------- GitHub API ---------- */
const cfg = () => { const c = { o: $('#cOwner').value.trim(), r: $('#cRepo').value.trim(), b: $('#cBranch').value.trim() || 'main' };
  localStorage.o = c.o; localStorage.r = c.r; localStorage.b = c.b;
  if (!c.o || !c.r || !$('#pat').value) throw new Error('Укажите владельца, репозиторий и токен'); return c; };
async function gh(path, method = 'GET', body) {
  const c = cfg();
  const r = await fetch(`https://api.github.com/repos/${c.o}/${c.r}/contents/${path}` + (method === 'GET' ? `?ref=${c.b}` : ''), {
    method, headers: { Authorization: 'Bearer ' + $('#pat').value.trim(), Accept: 'application/vnd.github+json' },
    body: body && JSON.stringify({ ...body, branch: c.b }) });
  if (r.status === 404 && method === 'GET') return null;
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'HTTP ' + r.status);
  return r.json();
}
async function saveDb(msg = 'update db') {
  const cur = await gh('data.json.enc');
  if (S.dirty && cur) throw new Error('база уже есть в репозитории — перезагрузите страницу и войдите с её паролем');
  const bytes = await encryptDb(S.key, S.salt, S.db);
  await gh('data.json.enc', 'PUT', { message: msg, content: b64(bytes), sha: cur?.sha });
  S.dirty = false; $('#dirty').classList.add('hidden');
}
$('#saveDb').onclick = async () => { try { await saveDb('init vault'); toast('База создана'); } catch (e) { toast('Ошибка: ' + e.message, 9000); } };

/* ---------- Загрузка / удаление ---------- */
const pick = (f) => { if (!f) return; S.picked = f; $('#dropTxt').textContent = `${f.name} · ${fmt(f.size)}`; if (!$('#fName').value) $('#fName').value = f.name; };
$('#file').onchange = (e) => pick(e.target.files[0]);
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => pick(e.dataTransfer.files[0]));

$('#upBtn').onclick = async () => {
  const f = S.picked, btn = $('#upBtn');
  if (!f) return toast('Выберите файл');
  if (f.size > MAX) return toast('Файл больше 50 МБ — лимит GitHub Contents API');
  btn.disabled = true; $('#upBar').classList.remove('hidden');
  try {
    cfg();
    const enc = await encryptBytes(S.key, new Uint8Array(await f.arrayBuffer()));
    const id = crypto.randomUUID(), blob = id + '.bin';
    await gh('blobs/' + blob, 'PUT', { message: 'add blob', content: b64(enc) });
    S.db.files.unshift({ id, blob, name: f.name, title: $('#fName').value.trim() || f.name, desc: $('#fDesc').value.trim(),
      cat: $('#fCat').value.trim(), size: f.size, date: new Date().toISOString() });
    await saveDb('add file');
    S.picked = null; ['#fName', '#fDesc', '#fCat', '#file'].forEach((s) => ($(s).value = ''));
    $('#dropTxt').textContent = 'Перетащите файл или нажмите для выбора (до 50 МБ)';
    render(); toast('Загружено. Pages опубликует файл через ~1 минуту');
  } catch (e) { toast('Ошибка: ' + e.message, 9000); }
  btn.disabled = false; $('#upBar').classList.add('hidden');
};

async function removeFile(id) {
  const f = S.db.files.find((x) => x.id === id); if (!f) return;
  if (!$('#pat').value) { tab('admin'); $('#pat').focus(); return toast('Вставьте токен во вкладке «Админ»', 6000); }
  if (!confirm(`Удалить «${f.title || f.name}» из репозитория?`)) return;
  try {
    const before = S.db.files;
    S.db.files = before.filter((x) => x.id !== id);
    try { await saveDb('remove file'); } catch (e) { S.db.files = before; throw e; }
    render();
    const cur = await gh('blobs/' + f.blob);
    if (cur) await gh('blobs/' + f.blob, 'DELETE', { message: 'remove blob', sha: cur.sha });
    toast('Удалено');
  } catch (e) { toast('Ошибка удаления: ' + e.message, 9000); }
}

icons$(); // иконки экрана блокировки
$('#eye').onclick = () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; };
