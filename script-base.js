'use strict';

marked.setOptions({ breaks:true, gfm:true });

/* ── KaTeX rendering ── */
function renderKatex(src) {
  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    try { return '<div class="katex-block">'+katex.renderToString(tex.trim(),{displayMode:true,throwOnError:false})+'</div>'; }
    catch(e){ return '<div class="katex-block katex-err">'+tex+'</div>'; }
  });
  src = src.replace(/(?<!\$)\$(?!\$)((?:[^$\n]|\\.)+?)\$(?!\$)/g, (_, tex) => {
    try { return katex.renderToString(tex.trim(),{displayMode:false,throwOnError:false}); }
    catch(e){ return '<span class="katex-err">'+tex+'</span>'; }
  });
  return src;
}

/* ── DOM ── */
const editor       = document.getElementById('editor');
const preview      = document.getElementById('preview');
const renderClone  = document.getElementById('render-clone');
const fileInput    = document.getElementById('file-input');
const dlMenu       = document.getElementById('dl-menu');
const openMenu     = document.getElementById('open-menu');
const lsListEl     = document.getElementById('ls-list');
const toast        = document.getElementById('toast');
const charCount    = document.getElementById('char-count');
const wordCount    = document.getElementById('word-count');
const lineCount    = document.getElementById('line-count');
const titleDisp    = document.getElementById('title-display');
const dropOverlay  = document.getElementById('drop-overlay');
const metaTitle    = document.getElementById('meta-title');
const confirmBg    = document.getElementById('confirm-bg');
const confirmCancel= document.getElementById('confirm-cancel');
const confirmOk    = document.getElementById('confirm-ok');

/* ── HELPERS ── */
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function getNowStamp(){
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'.'+p(d.getMonth()+1)+'.'+p(d.getDate())+'.'+p(d.getHours())+'.'+p(d.getMinutes())+'.'+p(d.getSeconds());
}


function stampToLabel(stamp) {
  // '2024.01.23.14.05.30' → '2024/01/23 14:05'
  const p = stamp.split('.');
  if(p.length < 5) return stamp;
  return p[0]+'/'+p[1]+'/'+p[2]+' '+p[3]+':'+p[4];
}
/* ── BASE64 IMAGE MAP ─────────────────────────────────────
   Images pasted or loaded are stored here.
   In the editor text, they appear as  ![alt:N](data:image/png;base64,iVBOR…)
   but the textarea shows a short token   ![alt](img:N)
   On export / save the token is expanded back to full data URI.
   ──────────────────────────────────────────────────────── */
const imgMap = [];   // index → full data URI

const IMG_TOKEN_RE  = /!\[([^\]]*)\]\(img:(\d+)\)/g;
const IMG_B64_RE    = /!\[([^\]]*)\]\((data:[^)]+)\)/g;

function collapseB64(text) {
  // Replace any full data URIs with tokens (handles loaded files)
  return text.replace(IMG_B64_RE, (_, alt, dataUri) => {
    let idx = imgMap.indexOf(dataUri);
    if (idx === -1){ idx = imgMap.length; imgMap.push(dataUri); }
    return `![${alt}](img:${idx})`;
  });
}

function expandTokens(text) {
  return text.replace(IMG_TOKEN_RE, (_, alt, n) => {
    const uri = imgMap[parseInt(n)];
    return uri ? `![${alt}](${uri})` : `![${alt}](img:${n})`;
  });
}

function tokenLabel(alt, n) {
  const uri = imgMap[parseInt(n)] || '';
  const mime = uri.match(/^data:([^;]+)/)?.[1] || 'image';
  const kb   = Math.round(uri.length * 0.75 / 1024);
  const label = alt || mime.split('/')[1] || 'img';
  return `![${label} · ${kb}KB](img:${n})`;
}

/* ── META FIELD click-to-focus ── */
document.querySelectorAll('.meta-field').forEach(f =>
  f.addEventListener('click', () => f.querySelector('.meta-input').focus())
);

/* ── FRONT MATTER PARSE ── */
function parseFrontMatter(text) {
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) return { front:null, body:text };
  const fields = [];
  m[1].split('\n').forEach(line => {
    const kv = line.replace(/\r$/,'').match(/^([\w][\w\s]*):\s*(.*)$/);
    if (kv) fields.push({ key:kv[1].trim(), val:kv[2].trim() });
  });
  return { front:{ fields }, body:text.slice(m[0].length) };
}

function parseCompatMd(text) {
  const m = text.match(/^#\s+(.+)\r?\n\r?\n(\d{4}-\d{2}-\d{2}[^\n]*)[ \t]*\r?\n\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { title:m[1].trim(), body:m[3] };
}

/* ── FM HEADER ── */
function buildFMHeader(title, date) {
  if (!title) return '';
  let html = '<div class="fm-header"><h1>'+esc(title)+'</h1>';
  if (date) html += '<div class="fm-meta"><span class="fm-meta-key">date</span><span class="fm-meta-val">'+esc(date)+'</span></div>';
  return html+'</div>';
}

/* ── COPY BUTTONS ── */
function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className='copy-btn'; btn.textContent='copy';
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      navigator.clipboard.writeText(code?code.innerText:pre.innerText).then(()=>{
        btn.textContent='copied!'; btn.classList.add('copied');
        setTimeout(()=>{ btn.textContent='copy'; btn.classList.remove('copied'); },1800);
      }).catch(()=>{ btn.textContent='error'; setTimeout(()=>btn.textContent='copy',1500); });
    });
    pre.appendChild(btn);
  });
}

/* ── RENDER ── */
function render() {
  const raw   = editor.value;
  const title = metaTitle.value.trim();
  titleDisp.textContent = title || '\u2014';
  document.title = 'abiemd - ' + (title || 'かんたんmarkdownメモ帳');

  const expanded = expandTokens(raw);
  const withKatex = typeof katex !== 'undefined' ? renderKatex(expanded) : expanded;
  preview.innerHTML = buildFMHeader(title, null) + marked.parse(withKatex);
  addCopyButtons(preview);
  addCheckboxHandlers(preview);

  charCount.textContent = raw.length.toLocaleString();
  wordCount.textContent = raw.trim() ? raw.trim().split(/\s+/).length.toLocaleString() : '0';
  lineCount.textContent = raw.split('\n').length.toLocaleString();

  const sizeDisp = document.getElementById('size-display');
  const sizeBytes = new Blob([expandTokens(raw)]).size;
  const sizeKB = Math.ceil(sizeBytes / 1024);
  sizeDisp.textContent = sizeBytes < 1024 ? sizeBytes + 'B' : sizeKB + 'KB';
  sizeDisp.style.color = sizeBytes > 5 * 1024 * 1024 ? '#c0392b' : '';
}

/* ── INTERACTIVE CHECKBOXES ── */
function addCheckboxHandlers(container) {
  const boxes = container.querySelectorAll('input[type="checkbox"]');
  boxes.forEach((cb, idx) => {
    cb.removeAttribute('disabled');
    cb.addEventListener('change', () => {
      toggleCheckboxInEditor(idx, cb.checked);
    });
  });
}

function toggleCheckboxInEditor(targetIdx, nowChecked) {
  // Find the Nth checkbox item in the raw markdown and toggle it
  const CHECKBOX_RE = /^(\s*[-*+]\s+)\[( |x)\](\s)/gm;
  let count = 0;
  const updated = editor.value.replace(CHECKBOX_RE, (match, prefix, state, after) => {
    if (count++ === targetIdx) {
      return prefix + (nowChecked ? '[x]' : '[ ]') + after;
    }
    return match;
  });
  if (updated !== editor.value) {
    // preserve caret position
    const sel = editor.selectionStart;
    editor.value = updated;
    editor.selectionStart = editor.selectionEnd = sel;
    // trigger re-render without resetting checkboxes again (use direct call, not debounced)
    renderQuiet();
  }
}

// render without full innerHTML reset when only checkbox state changed —
// avoids losing focus / scroll but still syncs counts
function renderQuiet() {
  const raw = editor.value;
  charCount.textContent = raw.length.toLocaleString();
  wordCount.textContent = raw.trim() ? raw.trim().split(/\s+/).length.toLocaleString() : '0';
  lineCount.textContent = raw.split('\n').length.toLocaleString();
  // re-sync checkbox visual states in preview to match editor truth
  const CHECKBOX_RE = /^(\s*[-*+]\s+)\[([ x])\]/gm;
  const states = [];
  let m;
  while ((m = CHECKBOX_RE.exec(raw)) !== null) states.push(m[2] === 'x');
  preview.querySelectorAll('input[type="checkbox"]').forEach((cb, i) => {
    if (i < states.length) cb.checked = states[i];
  });
}

let rt;
editor.addEventListener('input', ()=>{ clearTimeout(rt); rt=setTimeout(render,80); });
metaTitle.addEventListener('input', render);

/* ── PASTE IMAGE ── */
editor.addEventListener('paste', async e => {
  for (const item of (e.clipboardData?.items||[])) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result;
        const idx = imgMap.length;
        imgMap.push(dataUri);
        const kb = Math.round(dataUri.length*0.75/1024);
        const mime = dataUri.match(/^data:([^;]+)/)?.[1]||'image';
        const ext  = mime.split('/')[1]||'img';
        insertAt(`![${ext} · ${kb}KB](img:${idx})`);
        render();
      };
      reader.readAsDataURL(item.getAsFile());
      return;
    }
  }
});

function insertAt(text) {
  const s=editor.selectionStart, e2=editor.selectionEnd;
  editor.value = editor.value.slice(0,s)+text+editor.value.slice(e2);
  editor.selectionStart = editor.selectionEnd = s+text.length;
  editor.dispatchEvent(new Event('input'));
}
editor.addEventListener('keydown', e=>{
  if(e.key==='Tab'){ e.preventDefault(); insertAt('  '); return; }
  const ctrl = e.ctrlKey||e.metaKey;
  if(ctrl && e.key==='b'){
    e.preventDefault();
    wrapSelection('<b>','</b>');
    return;
  }
  if(ctrl && e.key==='i'){
    e.preventDefault();
    wrapSelection('*','*');
    return;
  }
});

function wrapSelection(open, close) {
  const s = editor.selectionStart, en = editor.selectionEnd;
  const val = editor.value;
  const selected = val.slice(s, en);
  if(selected.length > 0){
    const ol = open.length, cl = close.length;
    // トグル判定1: 選択範囲の外側に記号がある場合 (wrap後に全体選択した場合)
    const outerWrapped = val.slice(s - ol, s) === open && val.slice(en, en + cl) === close;
    // トグル判定2: 選択範囲自体が記号で囲まれている場合 (wrap後に全体選択した場合)
    const innerWrapped = selected.startsWith(open) && selected.endsWith(close) && selected.length > ol + cl;
    if(outerWrapped){
      editor.value = val.slice(0, s - ol) + selected + val.slice(en + cl);
      editor.selectionStart = s - ol;
      editor.selectionEnd   = s - ol + selected.length;
    } else if(innerWrapped){
      const inner = selected.slice(ol, selected.length - cl);
      editor.value = val.slice(0, s) + inner + val.slice(en);
      editor.selectionStart = s;
      editor.selectionEnd   = s + inner.length;
    } else {
      const wrapped = open + selected + close;
      editor.value = val.slice(0, s) + wrapped + val.slice(en);
      editor.selectionStart = s;
      editor.selectionEnd   = s + wrapped.length;
    }
  } else {
    // カーソル位置に挿入してカーソルを中に
    const ins = open + close;
    editor.value = val.slice(0, s) + ins + val.slice(s);
    editor.selectionStart = editor.selectionEnd = s + open.length;
  }
  editor.dispatchEvent(new Event('input'));
}

/* ── BUILD MD (export: expand tokens, convert bare URLs) ── */
function buildMd() {
  const title = metaTitle.value.trim();
  const date  = getNowStamp().slice(0,10).replace(/\./g,'-');
  let body = convertBareUrls(expandTokens(editor.value));
  let out = '';
  if (title) out += '# '+title+'\n\n'+date+'\n\n';
  out += body;
  return out;
}

// Bare URL → [url](url) with surrounding spaces
// Skips: already-markdown links, code spans, fenced blocks
function convertBareUrls(text) {
  // matches http(s) URLs NOT already preceded by ]( or [
  const URL_RE = /(?<!\(|\[)(https?:\/\/[^\s<>"')\]]+)/g;
  const lines = text.split('\n');
  let inFence = false;
  return lines.map(line => {
    if (/^```/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    // mask inline code so URLs inside backticks are untouched
    const spans = [];
    const masked = line.replace(/`[^`]+`/g, m => { spans.push(m); return '\x00'.repeat(m.length); });
    const converted = masked.replace(URL_RE, url => ' ['+url+']('+url+') ');
    return converted
      .replace(/\x00+/g, () => spans.shift())
      .replace(/ {2,}/g, ' ')
      .trimEnd();
  }).join('\n');
}

/* ── CLONE PREP (PNG/PDF) ── */
function prepClone() {
  const title = metaTitle.value.trim();
  const date  = getNowStamp().slice(0,10).replace(/\./g,'-');
  const expanded = expandTokens(editor.value);
  const withKatex = typeof katex !== 'undefined' ? renderKatex(expanded) : expanded;
  renderClone.innerHTML = '<div class="md-body" style="padding:52px 60px 60px;font-family:\'Lora\',\'Noto Serif JP\',serif;font-size:15px;line-height:1.9;color:#1e1c1a;background:#faf9f7;width:794px;">'
    +buildFMHeader(title,date)+marked.parse(withKatex)+'</div>';
  Object.assign(renderClone.style,{position:'fixed',left:'-9999px',top:'0',width:'794px',background:'#faf9f7',padding:'0'});
}

/* ── LOAD MD ── */
function isEditorEmpty(){
  return metaTitle.value.trim()==='' && editor.value.trim()==='';
}

function loadParsedMd(mdText) {
  // collapse any base64 URIs in the loaded file
  const collapsed = collapseB64(mdText);
  const { front, body } = parseFrontMatter(collapsed);
  if (front) {
    const tf = front.fields.find(f=>f.key.toLowerCase()==='title');
    metaTitle.value = tf?tf.val:''; editor.value = body;
  } else {
    const compat = parseCompatMd(collapsed);
    if (compat) { metaTitle.value=compat.title; editor.value=compat.body; }
    else {
      const h1 = collapsed.match(/^#\s+(.+)\r?\n/);
      if (h1) { metaTitle.value=h1[1].trim(); editor.value=collapsed.slice(h1[0].length); }
      else    { metaTitle.value=''; editor.value=collapsed; }
    }
  }
  render();
}

/* ── LOGO = New tab ── */
document.getElementById('logo').addEventListener('click', ()=>window.open(location.href,'_blank'));

fileInput.addEventListener('change', ()=>{
  const f=fileInput.files[0]; if(!f) return;
  if(!isEditorEmpty() && f.size > 4.5*1024*1024){ //約5MB以上でLocalStorage/SessionStorageの限界
    showToast('このファイルはサイズが大きいため、左上のアイコンから新しいタブを開き、試してください。');
    fileInput.value=''; return;
  }
  const r=new FileReader();
  r.onload=e=>{
    if(isEditorEmpty()){ loadParsedMd(e.target.result); showToast('読み込みました'); }
    else { if(openMdInNewTab(e.target.result)) showToast('新しいタブで開きました'); }
  };
  r.readAsText(f); fileInput.value='';
});

/* ── OPEN MENU (ローカル / ブラウザ) ── */
const btnOpen = document.getElementById('btn-open');
btnOpen.addEventListener('click', e=>{ e.stopPropagation(); openMenu.classList.toggle('open'); });
document.addEventListener('click', ()=>openMenu.classList.remove('open'));
openMenu.addEventListener('click', e=>e.stopPropagation());

document.getElementById('open-local').addEventListener('click', ()=>{
  openMenu.classList.remove('open');
  fileInput.click();
});

document.getElementById('open-browser').addEventListener('click', ()=>{
  openMenu.classList.remove('open');
  buildLsList();
  document.getElementById('ls-modal-bg').classList.add('open');
});

document.getElementById('ls-modal-bg').addEventListener('click', e=>{
  if(e.target===document.getElementById('ls-modal-bg'))
    document.getElementById('ls-modal-bg').classList.remove('open');
});
document.getElementById('ls-modal-close').addEventListener('click', ()=>{
  document.getElementById('ls-modal-bg').classList.remove('open');
});

function buildLsList() {
  lsListEl.innerHTML = '';
  const keys = [];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && (k.startsWith('abiemd_autosave_') || k.startsWith('abiemd_save_'))) keys.push(k);
  }
  // 自動保存を先頭、手動保存を新しい順
  keys.sort((a,b)=>{
    const aAuto = a.startsWith('abiemd_autosave_');
    const bAuto = b.startsWith('abiemd_autosave_');
    if(aAuto && !bAuto) return -1;
    if(!aAuto && bAuto) return 1;
    return b.localeCompare(a);
  });
  if(keys.length===0){
    lsListEl.innerHTML='<div class="ls-empty">保存されたファイルはありません</div>';
    return;
  }
  keys.forEach(key=>{
    let raw;
    try{ raw=localStorage.getItem(key); }catch(e){ return; }
    if(!raw) return;
    const isAuto = key.startsWith('abiemd_autosave_');
    let label, stamp;
    if(isAuto){
      const sm = raw.match(/^---[\s\S]*?autosave_at:\s*([^\n]+)/);
      stamp = sm ? sm[1].trim() : '';
      const tm = raw.match(/^---[\s\S]*?title:\s*([^\n]+)/);
      const title = tm ? tm[1].trim() : '';
      const timeStr = stamp ? stampToLabel(stamp) : '';
      label = (title ? title+' — ' : '') + (timeStr ? timeStr+' 自動保存' : '自動保存');
    } else {
      stamp = key.replace('abiemd_save_','');
      // フロントマターのtitle、なければ先頭の# 行から取得
      const tm = raw.match(/^---[\s\S]*?title:\s*([^\n]+)/) || raw.match(/^#\s+(.+)/m);
      const title = tm ? tm[1].trim() : '';
      label = (title ? title+' — ' : '') + stampToLabel(stamp);
    }
    const row = document.createElement('div');
    row.className = 'ls-row';
    const btn = document.createElement('button');
    btn.className = 'ls-item';
    btn.innerHTML = '<span class="ls-label">'+esc(label)+'</span>'
      +(isAuto?'<span class="ls-badge">自動</span>':'');
    btn.addEventListener('click', ()=>{
      document.getElementById('ls-modal-bg').classList.remove('open');
      if(isEditorEmpty()){ loadParsedMd(raw); showToast('読み込みました'); }
      else { openMdInNewTab(raw); showToast('新しいタブで開きました'); }
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'ls-del';
    delBtn.title = '削除';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e=>{
      e.stopPropagation();
      localStorage.removeItem(key);
      row.remove();
      if(lsListEl.children.length===0)
        lsListEl.innerHTML='<div class="ls-empty">保存されたファイルはありません</div>';
    });
    row.appendChild(btn);
    row.appendChild(delBtn);
    lsListEl.appendChild(row);
  });
}

/* ── DRAG DROP ── */
let dc=0;
document.addEventListener('dragenter', e=>{ if([...(e.dataTransfer?.items||[])].some(i=>i.kind==='file')){dc++;dropOverlay.classList.add('active');} });
document.addEventListener('dragleave', ()=>{ if(--dc<=0){dc=0;dropOverlay.classList.remove('active');} });
document.addEventListener('dragover',  e=>e.preventDefault());
document.addEventListener('drop', e=>{
  e.preventDefault(); dc=0; dropOverlay.classList.remove('active');
  const files=[...e.dataTransfer.files].filter(f=>f.name.endsWith('.md')||f.type==='text/markdown');
  if(!files.length) return;
  if(!isEditorEmpty() && files[0].size > 4.5*1024*1024){
    showToast('このファイルはサイズが大きいため、左上のアイコンを押すと開ける新しいタブでやり直してください。');
    return;
  }
  const r=new FileReader();
  r.onload=ev=>{
    if(isEditorEmpty()){ loadParsedMd(ev.target.result); showToast('読み込みました'); }
    else { if(openMdInNewTab(ev.target.result)) showToast('新しいタブで開きました'); }
  };
  r.readAsText(files[0]);
});

/* ── NEW TAB ── */
function openMdInNewTab(mdText) {
  const key='abiemd_'+Date.now();
  try {
    sessionStorage.setItem(key, mdText);
  } catch(e) {
    showToast('このファイルはサイズが大きいため、左上のアイコンから新しいタブで開いてください。');
    return false;
  }
  const url=new URL(location.href);
  url.searchParams.set('load',key);
  window.open(url.toString(),'_blank');
  return true;
}
(function(){
  const key=new URLSearchParams(location.search).get('load');
  if(!key) return;
  const md=sessionStorage.getItem(key); sessionStorage.removeItem(key);
  if(!md) return;
  history.replaceState(null,'',location.pathname);
  loadParsedMd(md);
})();

/* ── MOBILE TOOLBAR ── */
document.getElementById('mt-h').addEventListener('click', ()=>{ insertAtLine('#'); });
document.getElementById('mt-li').addEventListener('click', ()=>{ insertAtLine('- '); });

// Insert prefix at the start of the current line
function insertAtLine(prefix) {
  const s = editor.selectionStart;
  const lineStart = editor.value.lastIndexOf('\n', s-1) + 1;
  editor.value = editor.value.slice(0,lineStart) + prefix + editor.value.slice(lineStart);
  editor.selectionStart = editor.selectionEnd = s + prefix.length;
  editor.dispatchEvent(new Event('input'));
  editor.focus();
}

/* ── CLEAR ── */
document.getElementById('btn-clear').addEventListener('click', ()=>{
  confirmBg.classList.add('open');
  setTimeout(()=>confirmCancel.focus(),20);
});
confirmCancel.addEventListener('click', ()=>confirmBg.classList.remove('open'));
confirmOk.addEventListener('click', ()=>{
  confirmBg.classList.remove('open');
  metaTitle.value=''; editor.value=''; imgMap.length=0;
  render();
});
confirmBg.addEventListener('keydown', e=>{
  if(e.key==='Escape'){ confirmBg.classList.remove('open'); return; }
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    e.preventDefault();
    (document.activeElement===confirmCancel?confirmOk:confirmCancel).focus();
  }
});
confirmBg.addEventListener('click', e=>{ if(e.target===confirmBg) confirmBg.classList.remove('open'); });

/* ── DOWNLOAD ── */
const btnDL=document.getElementById('btn-download');
btnDL.addEventListener('click', e=>{ e.stopPropagation(); dlMenu.classList.toggle('open'); });
document.addEventListener('click', ()=>dlMenu.classList.remove('open'));
dlMenu.addEventListener('click', e=>e.stopPropagation());

document.getElementById('dl-md').addEventListener('click', ()=>{
  dlMenu.classList.remove('open');
  dlBlob(new Blob([buildMd()],{type:'text/markdown'}), getFN('md'));
  showToast('.md でダウンロードしました！');
});

document.getElementById('dl-png').addEventListener('click', async ()=>{
  dlMenu.classList.remove('open'); showToast('png画像を準備中...'); await sleep(120);
  try {
    prepClone();
    const canvas = await html2canvas(renderClone,{backgroundColor:'#faf9f7',scale:2,useCORS:true,logging:false});
    // A4高さをキャンバスのpxに換算（幅はprepCloneで794px固定、scale:2で1588px）
    const A4H_PX = Math.round(841.89 * (canvas.width / 595.28));
    const totalH  = canvas.height;
    const pages   = Math.ceil(totalH / A4H_PX);
    const baseName = getFN('png').replace(/\.png$/, '');

    for (let p = 0; p < pages; p++) {
      const srcY = p * A4H_PX;
      const srcH = Math.min(A4H_PX, totalH - srcY);
      const sc   = document.createElement('canvas');
      sc.width   = canvas.width;
      sc.height  = A4H_PX; // 最終ページも同じ高さ（余白は白で埋める）
      const ctx  = sc.getContext('2d');
      ctx.fillStyle = '#faf9f7';
      ctx.fillRect(0, 0, sc.width, sc.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      const suffix = pages > 1 ? '_p' + (p + 1) : '';
      await new Promise(res => {
        sc.toBlob(blob => { dlBlob(blob, baseName + suffix + '.png'); res(); }, 'image/png');
      });
      if (pages > 1) await sleep(80); // ブラウザがまとめてブロックしないよう間隔を空ける
    }
    showToast(pages > 1 ? pages + '枚の .png でダウンロードしました！' : '.png でダウンロードしました！');
  } catch(err){ showToast('エラー: '+err.message); }
});

document.getElementById('dl-pdf').addEventListener('click', async ()=>{
  dlMenu.classList.remove('open'); showToast('PDFを準備中...'); await sleep(120);
  try {
    prepClone(); await sleep(80);
    // scale:1.5 にしてPNG→JPEGへ変更することで容量を大幅削減（目標10MB以下）
    const canvas=await html2canvas(renderClone,{backgroundColor:'#faf9f7',scale:1.5,useCORS:true,logging:false});
    const {jsPDF}=window.jspdf, A4W=595.28, A4H=841.89;
    const pdf=new jsPDF({orientation:'p',unit:'pt',format:'a4'});
    const scale=canvas.width/A4W, imgH=canvas.height/scale;
    let drawn=0, page=0;
    while(drawn<imgH){
      const slicePt=Math.min(A4H,imgH-drawn), srcY=Math.round(drawn*scale), srcH=Math.round(slicePt*scale);
      const sc=document.createElement('canvas'); sc.width=canvas.width; sc.height=srcH;
      const ctx=sc.getContext('2d');
      ctx.fillStyle='#faf9f7'; ctx.fillRect(0,0,sc.width,sc.height);
      ctx.drawImage(canvas,0,srcY,canvas.width,srcH,0,0,canvas.width,srcH);
      if(page>0) pdf.addPage();
      // PNG→JPEG(quality:0.82)に変更。背景白なのでアーティファクトはほぼ目立たない
      pdf.addImage(sc.toDataURL('image/jpeg',0.82),'JPEG',0,0,A4W,slicePt);
      drawn+=A4H; page++;
    }
    pdf.save(getFN('pdf'));
    showToast('.pdf でダウンロードしました！');
  } catch(err){ showToast('エラー: '+err.message); }
});

document.getElementById('dl-print').addEventListener('click', ()=>{
  dlMenu.classList.remove('open');
  // タイトルを一時的にdocument.titleに反映（ブラウザのPDF保存時のデフォルトファイル名になる）
  const prev = document.title;
  const t = metaTitle.value.trim();
  if(t) document.title = t;
  window.print();
  document.title = prev;
});

document.getElementById('dl-lsave').addEventListener('click', ()=>{
  dlMenu.classList.remove('open');
  const fn = getFN('md');
  const key = 'abiemd_save_' + getNowStamp();
  const md = buildMd();
  try {
    localStorage.setItem(key, md);
    showToast('ブラウザに保存しました！');
  } catch(e) {
    if(e.name==='QuotaExceededError' || (e.code && e.code===22))
      showToast('このメモは大きいので、LocalStorage以外の方法を使って下さい。');
    else
      showToast('保存失敗: ' + e.message);
  }
});

/* ── AUTO SAVE (1分おき, タイトルごとに最大1件) ── */
function autoSaveKey(title) {
  // タイトルをキー安全な文字列に変換
  const safe = title ? title.replace(/[^\w\u3000-\u9fff\u30A0-\u30FF\u3041-\u3096]/g,'_').replace(/_+/g,'_').slice(0,40) : '__notitle__';
  return 'abiemd_autosave_' + safe;
}
function autoSave() {
  if(editor.value.trim() === '') return;
  const stamp = getNowStamp();
  const title = metaTitle.value.trim();
  let body = expandTokens(editor.value);
  let out = '---\nautosave_at: '+stamp+'\n';
  if(title) out += 'title: '+title+'\n';
  out += '---\n';
  out += body;
  try {
    localStorage.setItem(autoSaveKey(title), out);
    showToast('自動保存しました！');
  } catch(e) {
    if(e.name==='QuotaExceededError' || (e.code && e.code===22))
      showToast('このメモは大きいので、自動保存はできません。ご注意を。');
    else
      showToast('自動保存失敗: '+e.message);
  }
}
setInterval(autoSave, 60000);

/* ── UTILS ── */
function getFN(ext){
  const t=titleDisp.textContent;
  const base=(t&&t!=='\u2014')?t.replace(/[^\w\u3000-\u9fff\u30A0-\u30FF\u3041-\u3096]/g,'_').replace(/_+/g,'_').slice(0,40):'note';
  return base+'.'+getNowStamp()+'.'+ext;
}
function dlBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
let toastTimer;
function showToast(msg){ toast.textContent=msg; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),2200); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ── RESIZABLE DIVIDER ── */
const divider=document.getElementById('divider'),paneLeft=document.getElementById('pane-left'),paneRight=document.getElementById('pane-right'),mainEl=document.getElementById('main');
let isDragging=false;
const isVert=()=>window.innerWidth<=window.innerHeight;
function startDrag(e){ isDragging=true; divider.classList.add('dragging'); document.body.style.userSelect='none'; document.body.style.cursor=isVert()?'row-resize':'col-resize'; e.preventDefault(); }
function onMove(e){
  if(!isDragging)return;
  const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY, rect=mainEl.getBoundingClientRect();
  if(!isVert()){const tot=rect.width,pos=Math.max(200,Math.min(tot-200,cx-rect.left)),pct=(pos/tot*100).toFixed(2);paneLeft.style.flex='0 0 '+pct+'%';paneRight.style.flex='0 0 '+(100-pct-0.15).toFixed(2)+'%';}
  else{const tot=rect.height,pos=Math.max(120,Math.min(tot-120,cy-rect.top)),pct=(pos/tot*100).toFixed(2);paneLeft.style.flex='0 0 '+pct+'%';paneRight.style.flex='0 0 '+(100-pct-0.15).toFixed(2)+'%';}
}
function endDrag(){ if(!isDragging)return; isDragging=false; divider.classList.remove('dragging'); document.body.style.cursor=''; document.body.style.userSelect=''; }
divider.addEventListener('mousedown',startDrag);
divider.addEventListener('touchstart',startDrag,{passive:false});
document.addEventListener('mousemove',onMove);
document.addEventListener('mouseup',endDrag);
document.addEventListener('touchmove',onMove,{passive:false});
document.addEventListener('touchend',endDrag);

/* ── INIT ── */
render();
