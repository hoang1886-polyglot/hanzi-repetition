import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc,
         setDoc, onSnapshot }                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider,
         signInWithPopup, onAuthStateChanged,
         signOut }                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── FIREBASE INIT ────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCwg68CV50FGXISL-7qEsfUwRnxGCXcLaY",
  authDomain:        "hanzi-storage.firebaseapp.com",
  projectId:         "hanzi-storage",
  storageBucket:     "hanzi-storage.firebasestorage.app",
  messagingSenderId: "500185685871",
  appId:             "1:500185685871:web:a6442e21949c5b10d1529a"
};
const app       = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const auth      = getAuth(app);
const provider  = new GoogleAuthProvider();
let DB_DOC = null;

// ─── WORD TYPES ───────────────────────────────────────────────────────────────
const WORD_TYPES = [
  { key:'名词',   vi:'Danh từ',      color:'#1A4BD8', bg:'#EEF4FF' },
  { key:'动词',   vi:'Động từ',      color:'#C8281E', bg:'#FEE8E6' },
  { key:'形容词', vi:'Tính từ',      color:'#177A47', bg:'#E8F5EE' },
  { key:'代词',   vi:'Đại từ',       color:'#7C3AED', bg:'#F5F3FF' },
  { key:'数词',   vi:'Số từ',        color:'#A0510D', bg:'#FEF3C7' },
  { key:'量词',   vi:'Lượng từ',     color:'#0E7490', bg:'#E0F7FA' },
  { key:'副词',   vi:'Phó từ',       color:'#BE185D', bg:'#FCE7F3' },
  { key:'介词',   vi:'Giới từ',      color:'#065F46', bg:'#D1FAE5' },
  { key:'连词',   vi:'Liên từ',      color:'#92400E', bg:'#FEF9C3' },
  { key:'助词',   vi:'Trợ từ',       color:'#1E40AF', bg:'#DBEAFE' },
  { key:'叹词',   vi:'Thán từ',      color:'#9D174D', bg:'#FCE7F3' },
  { key:'拟声词', vi:'Tượng thanh',  color:'#3D6B00', bg:'#ECFCCB' },
  { key:'语气词', vi:'Ngữ khí từ',   color:'#6B21A8', bg:'#FAF5FF' },
  { key:'词组',   vi:'Cụm từ',       color:'#374151', bg:'#F3F4F6' },
];

const HIGHLIGHT_COLORS = [
  { key:'yellow', label:'Vàng',      bg:'#FEF08A', text:'#713F12', dot:'#EAB308' },
  { key:'green',  label:'Xanh lá',   bg:'#BBF7D0', text:'#14532D', dot:'#16A34A' },
  { key:'blue',   label:'Xanh',      bg:'#BAE6FD', text:'#0C4A6E', dot:'#0284C7' },
  { key:'purple', label:'Tím',       bg:'#E9D5FF', text:'#4C1D95', dot:'#9333EA' },
  { key:'orange', label:'Cam',       bg:'#FED7AA', text:'#7C2D12', dot:'#EA580C' },
];

function getWtInfo(key){ return WORD_TYPES.find(t=>t.key===key)||null; }

// ─── APP STATE ────────────────────────────────────────────────────────────────
let db             = { words:[], sessions:{}, correct:0, total:0, articles:[] };
let reviewQueue    = [], currentCard = null, answered = false, saveTimer = null;
let _wf            = 'all';
let lastSaveAt     = 0;
let currentUserId  = null;
let listenersReady = false;
// word-type state per context (using window so buildWordTypeSelector can reference)
window._selectedType      = '';
window._artSelectedType   = '';
window._popupSelectedType = '';

// ─── DICTIONARY ───────────────────────────────────────────────────────────────
let dictData = null, dictLoading = false;

async function loadDict(){
  if(dictData||dictLoading)return; dictLoading=true;
  try{ const res=await fetch('./cvdict.json'); if(!res.ok)throw new Error(); dictData=await res.json(); }
  catch(e){ dictData={}; }
  dictLoading=false;
}

function lookupDict(zh){
  const el=$('dict-result'); if(!el)return;
  if(!zh.trim()){ el.innerHTML=''; return; }
  if(!dictData){ el.innerHTML='<span class="dict-searching">Đang tải từ điển...</span>'; loadDict().then(()=>lookupDict($('inp-zh').value)); return; }
  const found=dictData[zh];
  if(found){
    el.innerHTML=`<div class="dict-chip" id="dict-chip"><span>${zh}</span><span class="dict-arrow">→</span><span class="dict-vi">${found}</span><span class="dict-apply">↙ Dùng</span></div>`;
    $('dict-chip').addEventListener('click',()=>{ $('inp-vi').value=found; $('inp-vi').focus(); el.innerHTML='<span style="font-size:12px;color:var(--green)">✓ Đã điền nghĩa!</span>'; setTimeout(()=>el.innerHTML='',1500); });
  } else {
    const chars=[...zh];
    if(chars.length>1){ const r=chars.map(c=>dictData[c]?`${c}: ${dictData[c].split(';')[0]}`:null).filter(Boolean); el.innerHTML=r.length?`<div class="dict-notfound">Từng chữ: <em>${r.join(' | ')}</em></div>`:'<span class="dict-notfound">Không tìm thấy</span>'; }
    else el.innerHTML='<span class="dict-notfound">Không tìm thấy trong từ điển</span>';
  }
}

// ─── WORD TYPE SELECTOR ───────────────────────────────────────────────────────
function buildWordTypeSelector(containerId, stateKey, onSelect){
  const container=$(containerId); if(!container)return;
  container.innerHTML=WORD_TYPES.map(t=>`
    <button class="wtype-tag${window[stateKey]===t.key?' active':''}" data-key="${t.key}"
      style="--wt-color:${t.color};--wt-bg:${t.bg}" title="${t.vi}">
      ${t.key} <span class="wtype-vi">${t.vi}</span>
    </button>`).join('');
  container.querySelectorAll('.wtype-tag').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const k=btn.dataset.key;
      if(window[stateKey]===k){ window[stateKey]=''; btn.classList.remove('active'); }
      else{ container.querySelectorAll('.wtype-tag').forEach(b=>b.classList.remove('active')); window[stateKey]=k; btn.classList.add('active'); }
      if(onSelect)onSelect(window[stateKey]);
    });
  });
}

function resetWordTypeSelector(containerId, stateKey){
  window[stateKey]='';
  const c=$(containerId); if(c) c.querySelectorAll('.wtype-tag').forEach(b=>b.classList.remove('active'));
}

// ─── SYNC UI ──────────────────────────────────────────────────────────────────
const syncBar=document.getElementById('sync-bar'),syncPill=document.getElementById('sync-pill'),sdot=document.getElementById('sdot'),stext=document.getElementById('stext');
function setSyncing(){ syncBar.className='syncing'; sdot.className='sdot spin'; stext.textContent='Đang đồng bộ...'; syncPill.className='show'; }
function setSynced(){  syncBar.className='synced';  sdot.className='sdot green'; stext.textContent='Đã đồng bộ ✓'; setTimeout(()=>{ syncPill.className=''; syncBar.className=''; },2000); }
function setSyncErr(){ sdot.className='sdot'; sdot.style.background='var(--red)'; stext.textContent='Lỗi kết nối ⚠'; syncPill.className='show'; }

// ─── SAVE ─────────────────────────────────────────────────────────────────────
function save(){
  try{ localStorage.setItem('hanzi_bk_'+(currentUserId||'anon'),JSON.stringify(db)); }catch(e){}
  lastSaveAt=Date.now(); clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    setSyncing();
    try{ await setDoc(DB_DOC,JSON.parse(JSON.stringify(db))); setSynced(); }
    catch(e){ setSyncErr(); toast('⚠️ Lỗi đồng bộ.'); }
    saveTimer=null;
  },600);
}

// ─── LOAD ─────────────────────────────────────────────────────────────────────
async function init(){
  // Load local backup immediately so UI can show something fast
  const bk=localStorage.getItem('hanzi_bk_'+(currentUserId||'anon'));
  if(bk){ try{ db=JSON.parse(bk); }catch(ex){} }

  try{
    // Race getDoc against a 6-second timeout to prevent infinite loading
    const snap=await Promise.race([
      getDoc(DB_DOC),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('firebase_timeout')),6000))
    ]);
    if(snap.exists()){ const d=snap.data(); db={words:d.words||[],sessions:d.sessions||{},correct:d.correct||0,total:d.total||0,articles:d.articles||[]}; }
    else{ if(!bk) seedWords(); await setDoc(DB_DOC,JSON.parse(JSON.stringify(db))); }
  }catch(e){
    if(e.message==='firebase_timeout'){
      toast('⚠️ Firebase phản hồi chậm. Đang dùng dữ liệu cục bộ.');
    } else {
      if(!bk) seedWords();
      toast('⚠️ Không kết nối Firebase. Dùng dữ liệu cục bộ.');
    }
  }
  document.getElementById('loading').style.display='none';
  renderDashboard();
  if(!listenersReady){ setupListeners(); listenersReady=true; }
  onSnapshot(DB_DOC,snap=>{
    if(!snap.exists())return; if(Date.now()-lastSaveAt<5000)return;
    const d=snap.data(); db={words:d.words||[],sessions:d.sessions||{},correct:d.correct||0,total:d.total||0,articles:d.articles||[]};
    try{ localStorage.setItem('hanzi_bk_'+(currentUserId||'anon'),JSON.stringify(db)); }catch(e){}
    const ap=document.querySelector('.page.active')?.id;
    if(ap==='dashboard')renderDashboard(); if(ap==='wordlist')renderWordList('');
  },err=>console.warn('Snapshot error:',err));
}

// ─── SEED ─────────────────────────────────────────────────────────────────────
function seedWords(){
  [{zh:'你好',vi:'xin chào',wordType:'动词',exZh:'你好，很高兴认识你。',exVi:'Xin chào, rất vui được gặp bạn.'},
   {zh:'谢谢',vi:'cảm ơn',wordType:'动词',exZh:'谢谢你的帮助！',exVi:'Cảm ơn sự giúp đỡ của bạn!'},
   {zh:'学习',vi:'học tập',wordType:'动词',exZh:'我喜欢学习汉语。',exVi:'Tôi thích học tiếng Trung.'},
   {zh:'漂亮',vi:'xinh đẹp',wordType:'形容词',exZh:'她很漂亮。',exVi:'Cô ấy rất xinh đẹp.'},
   {zh:'工作',vi:'công việc',wordType:'名词',exZh:'我的工作很有趣。',exVi:'Công việc của tôi rất thú vị.'}]
  .forEach(s=>db.words.push({id:Date.now()+Math.random(),pinyin:getPinyin(s.zh),zhDef:'',status:'new',ef:2.5,interval:0,repetitions:0,nextReview:null,lastReview:null,added:Date.now(),...s}));
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getPinyin(zh){ return window.pinyinPro?pinyinPro.pinyin(zh,{toneType:'symbol',type:'string',separator:' '}):''; }
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2400); }
function $(id){ return document.getElementById(id); }

// ─── NAV ─────────────────────────────────────────────────────────────────────
function nav(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  const navEl=document.getElementById(`nav-${page}`); if(navEl)navEl.classList.add('active');
  if(['upload-article','read-article','article-review'].includes(page))document.getElementById('nav-articles').classList.add('active');
  if(page==='dashboard')renderDashboard();
  if(page==='review')startReview();
  if(page==='wordlist')renderWordList('');
  if(page==='articles')renderArticlesList();
  if(page==='add'){ buildWordTypeSelector('word-type-selector','_selectedType'); window._selectedType=''; }
}
function navWordlistFilter(f){ _wf=f; nav('wordlist'); }

// ─── LISTENERS ────────────────────────────────────────────────────────────────
function setupListeners(){
  // ── Rich text toolbar ──────────────────────────────────────────────
  const rtEditor=$('article-body-inp');
  const rtToolbar=$('article-rich-toolbar');
  if(rtToolbar&&rtEditor){
    rtToolbar.querySelectorAll('.rtb-btn').forEach(btn=>{
      btn.addEventListener('mousedown',e=>{
        e.preventDefault(); // keep focus in editor
        const cmd=btn.dataset.cmd, val=btn.dataset.val||null;
        document.execCommand(cmd,false,val);
        updateToolbarState();
        rtEditor.focus();
      });
    });
    function updateToolbarState(){
      rtToolbar.querySelectorAll('.rtb-btn').forEach(btn=>{
        const cmd=btn.dataset.cmd;
        if(['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'].includes(cmd)){
          btn.classList.toggle('active',document.queryCommandState(cmd));
        }
      });
    }
    rtEditor.addEventListener('keyup',updateToolbarState);
    rtEditor.addEventListener('mouseup',updateToolbarState);
    rtEditor.addEventListener('selectionchange',updateToolbarState);
    // Support paste: strip non-chinese formatting noise but keep structure
    rtEditor.addEventListener('paste',e=>{
      e.preventDefault();
      const text=e.clipboardData.getData('text/plain');
      document.execCommand('insertHTML',false,text.replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>'));
    });
  }
  // ─────────────────────────────────────────────────────────────────────
  ['dashboard','review','add','wordlist','articles'].forEach(p=>{ const el=$(`nav-${p}`); if(el)el.addEventListener('click',()=>nav(p)); });
  $('card-all').addEventListener('click',()=>navWordlistFilter('all'));
  $('card-due').addEventListener('click',()=>navWordlistFilter('due'));
  $('card-learned').addEventListener('click',()=>navWordlistFilter('learned'));
  $('card-mastered').addEventListener('click',()=>navWordlistFilter('mastered'));
  $('due-banner').addEventListener('click',()=>nav('review'));
  $('view-all-link').addEventListener('click',()=>nav('wordlist'));

  buildWordTypeSelector('word-type-selector','_selectedType');
  $('inp-zh').addEventListener('input',()=>{ const v=$('inp-zh').value; $('pinyin-preview').textContent=getPinyin(v)||''; lookupDict(v); });
  $('add-word-btn').addEventListener('click',addWord);
  $('inp-vi').addEventListener('keydown',e=>{ if(e.key==='Enter')addWord(); });

  $('go-upload-btn').addEventListener('click',()=>nav('upload-article'));
  $('save-article-btn').addEventListener('click',saveArticle);
  $('cancel-upload-btn').addEventListener('click',()=>{ clearUploadForm(); nav('articles'); });
  $('back-articles-btn').addEventListener('click',()=>nav('articles'));
  $('sort-newest-btn').addEventListener('click',()=>{ articleSortOrder='newest'; $('sort-newest-btn').classList.add('active'); $('sort-oldest-btn').classList.remove('active'); renderArticlesList(); });
  $('sort-oldest-btn').addEventListener('click',()=>{ articleSortOrder='oldest'; $('sort-oldest-btn').classList.add('active'); $('sort-newest-btn').classList.remove('active'); renderArticlesList(); });
  $('article-image-inp').addEventListener('input',()=>{
    const url=$('article-image-inp').value.trim(),preview=$('article-image-preview'),thumb=$('article-img-thumb');
    if(url){preview.style.display='block';thumb.src=url;}else{preview.style.display='none';thumb.src='';}
  });
  $('edit-inp-zh').addEventListener('input',()=>{$('edit-pinyin-preview').textContent=getPinyin($('edit-inp-zh').value)||'';});
  $('edit-save-btn').addEventListener('click',saveWordEdit);
  $('edit-cancel-btn').addEventListener('click',()=>$('word-edit-overlay').style.display='none');
  $('edit-close-btn').addEventListener('click',()=>$('word-edit-overlay').style.display='none');
  $('word-edit-overlay').addEventListener('click',e=>{if(e.target===$('word-edit-overlay'))$('word-edit-overlay').style.display='none';});
  buildWordTypeSelector('art-word-type-selector','_artSelectedType');
  $('art-inp-zh').addEventListener('input',()=>{ const v=$('art-inp-zh').value.trim(); $('art-pinyin-preview').textContent=getPinyin(v)||''; artLookupDict(v); });
  $('art-add-word-btn').addEventListener('click',()=>{
    const zh=$('art-inp-zh').value.trim(),vi=$('art-inp-vi').value.trim();
    const exZh=$('art-inp-ex-zh').value.trim(),exVi=$('art-inp-ex-vi').value.trim(),zhDef=$('art-inp-zh-def').value.trim();
    const note=$('art-inp-note')?.value.trim()||'';
    const w=addWordFromArticle(zh,vi,exZh,exVi,zhDef,window._artSelectedType,note);
    if(w){
      ['art-inp-zh','art-inp-vi','art-inp-ex-zh','art-inp-ex-vi','art-inp-zh-def','art-inp-note'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
      $('art-pinyin-preview').textContent='';
      resetWordTypeSelector('art-word-type-selector','_artSelectedType');
      toast(`✓ Đã thêm: ${zh}`);
      const article=db.articles.find(a=>a.id===currentArticleId);
      if(article)renderArticleAddedWords(article);
    }
  });
  $('art-review-back-btn').addEventListener('click',()=>nav('read-article'));
  $('start-art-review-btn').addEventListener('click',()=>startArticleReview());
  $('search-input').addEventListener('input',e=>renderWordList(e.target.value));
}

// ─── SM-2 ─────────────────────────────────────────────────────────────────────
function sm2(w,g){
  let{ef=2.5,interval=0,repetitions=0}=w;
  if(g===0){repetitions=0;interval=1;}
  else if(g===1){interval=Math.max(1,Math.round(interval*1.2));ef=Math.max(1.3,ef-0.15);}
  else if(g===2){interval=repetitions===0?1:repetitions===1?4:Math.round(interval*ef);repetitions++;ef=Math.max(1.3,ef-0.08);}
  else{interval=repetitions===0?4:Math.round(interval*ef*1.3);repetitions++;ef=Math.max(1.3,ef+0.15);}
  w.ef=ef;w.interval=interval;w.repetitions=repetitions;
  w.nextReview=Date.now()+interval*864e5;w.lastReview=Date.now();
  w.status=repetitions>=3?'mastered':repetitions>=1?'review':'learning';
}
function intLabel(g,w){
  const{ef=2.5,interval=0,repetitions=0}=w;
  if(g===0)return'<10 phút';if(g===1)return`${Math.max(1,Math.round(interval*1.2))} ngày`;
  if(g===2)return repetitions===0?'1 ngày':repetitions===1?'4 ngày':`${Math.round(interval*ef)} ngày`;
  return types.map(k=>{
    const t=getWtInfo(k);if(!t)return '';
    return`<span style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;background:${t.bg};color:${t.color};margin-right:3px">${t.key} ${t.vi}</span>`;
  }).join('');
}
// ─── WORD TYPE BADGE HTML ─────────────────────────────────────────────────────
function wordTypeBadgeHtml(wordType, wordTypes){
  const types=wordTypes?.length ? wordTypes : (wordType ? [wordType] : []);
  if(!types.length) return '';
  return types.map(k=>{const t=getWtInfo(k);if(!t)return '';
  return `<div style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600;background:${t.bg};color:${t.color};margin-top:8px;border:1px solid ${t.color}33">
    <span style="font-size:13px">${t.key}</span><span style="opacity:0.7;font-size:11px">${t.vi}</span>
  </div>`;
  }).join('');
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard(){
  const words=db.words,now=Date.now(),today=new Date().toISOString().split('T')[0];
  const due=words.filter(w=>!w.nextReview||w.nextReview<=now);
  $('stat-total').textContent=words.length;$('stat-due').textContent=due.length;
  $('stat-learned').textContent=words.filter(w=>w.repetitions>0).length;
  $('stat-mastered').textContent=words.filter(w=>w.status==='mastered').length;
  $('stat-today').textContent=db.sessions[today]||0;
  $('stat-accuracy').textContent=db.total>0?Math.round(db.correct/db.total*100):'—';
  let streak=0,d=new Date();
  while(true){const k=d.toISOString().split('T')[0];if((db.sessions[k]||0)>0){streak++;d.setDate(d.getDate()-1);}else break;}
  $('stat-streak').textContent=streak;
  const banner=$('due-banner');
  if(due.length){banner.style.display='block';$('due-banner-text').textContent=`${due.length} từ cần ôn tập ngay!`;}
  else banner.style.display='none';
  const hm=$('heatmap');hm.innerHTML='';const td=new Date();
  for(let w=11;w>=0;w--){
    const col=document.createElement('div');col.className='heatmap-week';
    for(let dy=0;dy<7;dy++){
      const dt=new Date(td);dt.setDate(dt.getDate()-w*7-dy);
      const k=dt.toISOString().split('T')[0],c=db.sessions[k]||0;
      const cell=document.createElement('div');
      cell.className='heatmap-cell'+(c===0?'':c<3?' l1':c<7?' l2':c<15?' l3':' l4');
      cell.title=`${k}: ${c} từ`;col.appendChild(cell);
    }
    hm.appendChild(col);
  }
  const rw=$('recent-words');const recent=[...words].reverse().slice(0,6);
  rw.innerHTML=recent.length
    ?recent.map(w=>{
  const wts=(w.wordTypes?.length?w.wordTypes:(w.wordType?[w.wordType]:[]));
  const badges=wts.map(k=>{const i=getWtInfo(k);return i?`<span style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${i.bg};color:${i.color};display:inline-block">${i.key} ${i.vi}</span>`:''}).join('');
  return`<div class="word-tile"><div class="zh">${tr(w.zh)}</div><div class="py">${w.pinyin}</div><div class="vi">${w.vi}</div>${badges?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${badges}</div>`:''}</div>`;
}).join('')
    :`<div style="color:var(--text3);font-size:14px;grid-column:1/-1">Chưa có từ. <span style="color:var(--red);cursor:pointer" id="add-first-link">Thêm từ đầu tiên!</span></div>`;
  document.getElementById('add-first-link')?.addEventListener('click',()=>nav('add'));
}

// ─── REVIEW ───────────────────────────────────────────────────────────────────
let reviewCorrect=0,reviewTotal=0,reviewInitial=0;
function startReview(){
  reviewQueue=db.words.filter(w=>!w.nextReview||w.nextReview<=Date.now()).map(w=>({...w})).sort(()=>Math.random()-0.5);
  reviewCorrect=0;reviewTotal=0;reviewInitial=reviewQueue.length;
  answered=false;renderReviewCard();
}
// ─── REVIEW DICT LOOKUP (double-click any Chinese text) ──────────────────────
function setupReviewDictLookup(container){
  if(!container)return;
  // Remove old tooltip if any
  let tip=document.getElementById('review-dict-tip');
  if(tip)tip.remove();
  tip=document.createElement('div');
  tip.id='review-dict-tip';
  tip.style.cssText=`position:fixed;z-index:9999;background:var(--surface);border:1.5px solid var(--border2);border-radius:10px;padding:10px 14px;box-shadow:0 8px 32px rgba(0,0,0,0.22);min-width:160px;max-width:280px;display:none;pointer-events:none;font-family:'DM Sans',sans-serif;`;
  document.body.appendChild(tip);

  // Hide on click outside
  const hide=()=>{tip.style.display='none';};
  document.addEventListener('click',hide);

  container.addEventListener('dblclick',e=>{
    // Extract Chinese word from selection or the element's text
    const sel=window.getSelection();
    let text=sel?sel.toString().trim():'';
    // If no selection or non-CJK, try getting the word around cursor
    if(!text||!/[\u4e00-\u9fff]/.test(text)){
      // walk up to find a CJK-containing element
      let el=e.target;
      while(el&&el!==container){
        const t=el.textContent||'';
        if(/[\u4e00-\u9fff]/.test(t)){text=t.trim();break;}
        el=el.parentElement;
      }
    }
    // strip non-CJK chars, keep only selected/word
    text=text.replace(/[^\u4e00-\u9fff\u3400-\u4dbf]/g,'');
    if(!text)return;
    sel?.removeAllRanges();
    e.preventDefault();e.stopPropagation();

    const lookup=(dict)=>{
      const found=dict[text];
      let html=`<div style="font-family:'Noto Sans SC',sans-serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:2px">${text}</div>`;
      html+=`<div style="font-size:12px;color:var(--text3);margin-bottom:6px;letter-spacing:0.03em">${getPinyin(text)}</div>`;
      if(found){
        const defs=found.split(';').map(s=>s.trim()).filter(Boolean).slice(0,4);
        html+=defs.map(d=>`<div style="font-size:13px;color:var(--text2);line-height:1.5;padding:1px 0">· ${d}</div>`).join('');
      } else if(text.length>1){
        // char-by-char
        const rows=[...text].map(c=>dict[c]?`<div style="font-size:13px;color:var(--text2);padding:1px 0"><span style="font-family:'Noto Sans SC',sans-serif;font-weight:600">${c}</span> · ${dict[c].split(';')[0].trim()}</div>`:null).filter(Boolean);
        html+=rows.length?rows.join(''):`<div style="font-size:12px;color:var(--text3)">Không tìm thấy</div>`;
      } else {
        html+=`<div style="font-size:12px;color:var(--text3)">Không tìm thấy</div>`;
      }
      tip.innerHTML=html;
      // Position near cursor but keep in viewport
      const vw=window.innerWidth,vh=window.innerHeight;
      let tx=e.clientX+12,ty=e.clientY+12;
      tip.style.display='block';
      const tw=tip.offsetWidth,th=tip.offsetHeight;
      if(tx+tw>vw-8)tx=e.clientX-tw-12;
      if(ty+th>vh-8)ty=e.clientY-th-12;
      tip.style.left=tx+'px';tip.style.top=ty+'px';
      tip.style.pointerEvents='none';
    };

    if(dictData){lookup(dictData);}
    else{
      tip.innerHTML=`<div style="font-size:12px;color:var(--text3)">Đang tải từ điển...</div>`;
      tip.style.display='block';tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY+12)+'px';
      loadDict().then(()=>lookup(dictData));
    }
  });
}

function renderReviewCard(){
  const rc=$('review-content'),rs=$('review-subtitle');
  if(!reviewQueue.length){
    rs.textContent='';
    const pct=reviewTotal>0?Math.round(reviewCorrect/reviewTotal*100):0;
    const grade=pct>=90?'🏆 Xuất sắc!':pct>=70?'🎉 Tốt lắm!':pct>=50?'💪 Cần cố thêm!':'📚 Hãy ôn thêm nhé!';
    rc.innerHTML=`<div class="review-card" style="text-align:center">
      <div style="font-size:52px;margin-bottom:16px">${pct>=70?'🎉':'📖'}</div>
      <div style="font-size:22px;font-weight:700;margin-bottom:6px">${grade}</div>
      <div style="font-size:14px;color:var(--text2);margin-bottom:28px">Bạn đã hoàn thành luyện tập</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px">
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--border)"><div style="font-size:28px;font-weight:700">${reviewInitial}</div><div style="font-size:11px;color:var(--text3);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Từ đã ôn</div></div>
        <div style="background:var(--green-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--green-border)"><div style="font-size:28px;font-weight:700;color:var(--green)">${reviewCorrect}</div><div style="font-size:11px;color:var(--green);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Trả lời đúng</div></div>
        <div style="background:var(--red-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--red-mid)"><div style="font-size:28px;font-weight:700;color:var(--red)">${pct}%</div><div style="font-size:11px;color:var(--red);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Độ chính xác</div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="submit-btn" id="review-again-btn" style="padding:11px 24px">🔄 Luyện lại</button>
        <button id="review-home-btn" style="padding:11px 24px;background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">← Trang chủ</button>
      </div></div>`;
    $('review-again-btn').addEventListener('click',startReview);
    $('review-home-btn').addEventListener('click',()=>nav('home'));
    return;
  }
  currentCard=reviewQueue[0];
  const done=reviewInitial-reviewQueue.length;
  rs.textContent=`${done}/${reviewInitial} từ · ${reviewCorrect} đúng`;
  rc.innerHTML=`
    <div class="review-progress"><div class="review-progress-fill" style="width:${reviewInitial>0?done/reviewInitial*100:0}%"></div></div>
    <div class="review-card">
      <div class="review-vi">NGHĨA TIẾNG VIỆT</div>
      <div class="review-word">${currentCard.vi}</div>
      ${wordTypeBadgeHtml(currentCard.wordType, currentCard.wordTypes)}
      ${currentCard.zhDef?`<div style="font-size:13px;color:var(--text2);margin-top:10px;padding:8px 14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);text-align:left">🀄 <span style="font-family:'Noto Sans SC',sans-serif">${tr(currentCard.zhDef)}</span></div>`:''}
      ${currentCard.exVi?`<div style="font-size:13px;color:var(--text2);margin-top:10px;padding:11px 16px;background:var(--surface2);border-radius:8px;text-align:left;border:1px solid var(--border)"><div style="font-family:'Noto Sans SC',sans-serif;font-size:14px;margin-bottom:4px">${tr(currentCard.exZh||'')}</div><div>${currentCard.exVi}</div></div>`:''}\n      ${currentCard.note?`<div style="margin-top:10px"><button id="hint-toggle-btn" style="padding:5px 14px;background:var(--surface2);border:1.5px dashed var(--border2);border-radius:6px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;font-family:'DM Sans',sans-serif">💡 Xem gợi ý</button><div id="hint-content" style="display:none;margin-top:8px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);font-size:13px;color:var(--text);line-height:1.6;white-space:pre-wrap;text-align:left">${currentCard.note}</div></div>`:''}
      <div class="review-pinyin" id="live-pinyin"></div>
      <input type="text" class="answer-input" id="answer-input" placeholder="Nhập chữ Hán...">
      <div class="feedback-bar" id="feedback-bar"></div>
      <div class="correct-answer" id="correct-ans" style="display:none"></div>
      <button class="check-btn" id="check-btn">Kiểm tra</button>
    </div>
    <div class="diff-btns" id="diff-btns" style="display:none">
      <button class="diff-btn again" data-grade="0"><span class="emoji">❌</span><span class="label">Lại</span><span class="interval" id="i0"></span></button>
      <button class="diff-btn hard"  data-grade="1"><span class="emoji">😐</span><span class="label">Khó</span><span class="interval" id="i1"></span></button>
      <button class="diff-btn good"  data-grade="2"><span class="emoji">🙂</span><span class="label">Được</span><span class="interval" id="i2"></span></button>
      <button class="diff-btn easy"  data-grade="3"><span class="emoji">😎</span><span class="label">Dễ</span><span class="interval" id="i3"></span></button>
    </div>`;
  const inp=$('answer-input');inp.focus();
  inp.addEventListener('input',()=>{const el=$('live-pinyin');if(el)el.textContent=getPinyin(inp.value);});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')checkAnswer();});
  $('check-btn').addEventListener('click',checkAnswer);
  rc.querySelectorAll('.diff-btn').forEach(btn=>btn.addEventListener('click',()=>gradeCard(parseInt(btn.dataset.grade))));
  const hintBtn=$('hint-toggle-btn');
  if(hintBtn){hintBtn.addEventListener('click',()=>{const c=$('hint-content');if(c.style.display==='none'){c.style.display='block';hintBtn.textContent='💡 Ẩn gợi ý';}else{c.style.display='none';hintBtn.textContent='💡 Xem gợi ý';}});}
  setupReviewDictLookup($('review-content'));
  answered=false;
}
function checkAnswer(){
  if(answered)return;const inp=$('answer-input');if(!inp?.value.trim())return;
  answered=true;const ok=inp.value.trim()===currentCard.zh;
  reviewTotal++;if(ok)reviewCorrect++;
  db.total++;if(ok)db.correct++;
  const today=new Date().toISOString().split('T')[0];
  db.sessions[today]=(db.sessions[today]||0)+1;save();
  const fb=$('feedback-bar'),ca=$('correct-ans');
  if(ok){inp.classList.add('correct');fb.className='feedback-bar correct';fb.textContent='✓ Chính xác!';ca.style.display='none';}
  else{inp.classList.add('wrong');fb.className='feedback-bar wrong';fb.textContent='✗ Sai rồi!';ca.style.display='block';ca.textContent=`Đáp án đúng: ${tr(currentCard.zh)} (${currentCard.pinyin})`;}
  $('diff-btns').style.display='grid';$('check-btn').textContent='Chọn mức độ khó →';$('check-btn').disabled=true;
  for(let g=0;g<4;g++){const el=$(`i${g}`);if(el)el.textContent=intLabel(g,currentCard);}
}
function gradeCard(g){
  const w=db.words.find(x=>x.id===currentCard.id);if(w){sm2(w,g);save();}
  reviewQueue.shift();answered=false;renderReviewCard();
}

// ─── ARTICLE REVIEW ───────────────────────────────────────────────────────────
let artReviewQueue=[],artReviewCard=null,artReviewAnswered=false,artReviewCorrect=0,artReviewTotal=0,artReviewInitial=0;
function sm2Local(w,g){
  let{ef=2.5,interval=0,repetitions=0}=w;
  if(g===0){repetitions=0;interval=1;}else if(g===1){interval=Math.max(1,Math.round(interval*1.2));ef=Math.max(1.3,ef-0.15);}
  else if(g===2){interval=repetitions===0?1:repetitions===1?4:Math.round(interval*ef);repetitions++;ef=Math.max(1.3,ef-0.08);}
  else{interval=repetitions===0?4:Math.round(interval*ef*1.3);repetitions++;ef=Math.max(1.3,ef+0.15);}
  w.ef=ef;w.interval=interval;w.repetitions=repetitions;w._localNext=Date.now()+interval*864e5;
}
function startArticleReview(){
  const article=db.articles.find(a=>a.id===currentArticleId);
  if(!article){toast('Không tìm thấy bài báo!');return;}
  const ids=article.linkedWords||[];if(!ids.length){toast('Bài báo này chưa có từ nào!');return;}
  const words=db.words.filter(w=>ids.includes(w.id));if(!words.length){toast('Không tìm thấy từ!');return;}
  artReviewQueue=words.map(w=>({...w})).sort(()=>Math.random()-0.5);
  artReviewInitial=artReviewQueue.length;artReviewCorrect=0;artReviewTotal=0;artReviewAnswered=false;artReviewCard=null;
  $('art-review-title').textContent=article.title;nav('article-review');renderArtReviewCard();
}
function renderArtReviewCard(){
  const rc=$('art-review-content');
  if(!artReviewQueue.length){
    const pct=artReviewTotal>0?Math.round(artReviewCorrect/artReviewTotal*100):0;
    const grade=pct>=90?'🏆 Xuất sắc!':pct>=70?'🎉 Tốt lắm!':pct>=50?'💪 Cần cố thêm!':'📚 Hãy ôn thêm nhé!';
    rc.innerHTML=`<div class="review-card" style="text-align:center">
      <div style="font-size:52px;margin-bottom:16px">${pct>=70?'🎉':'📖'}</div>
      <div style="font-size:22px;font-weight:700;margin-bottom:6px">${grade}</div>
      <div style="font-size:14px;color:var(--text2);margin-bottom:28px">Bạn đã hoàn thành luyện tập</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px">
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--border)"><div style="font-size:28px;font-weight:700">${artReviewInitial}</div><div style="font-size:11px;color:var(--text3);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Từ đã học</div></div>
        <div style="background:var(--green-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--green-border)"><div style="font-size:28px;font-weight:700;color:var(--green)">${artReviewCorrect}</div><div style="font-size:11px;color:var(--green);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Trả lời đúng</div></div>
        <div style="background:var(--red-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--red-mid)"><div style="font-size:28px;font-weight:700;color:var(--red)">${pct}%</div><div style="font-size:11px;color:var(--red);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Độ chính xác</div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="submit-btn" id="art-review-again-btn" style="padding:11px 24px">🔄 Luyện lại</button>
        <button id="art-review-done-btn" style="padding:11px 24px;background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">← Về bài báo</button>
      </div></div>`;
    $('art-review-again-btn').addEventListener('click',startArticleReview);
    $('art-review-done-btn').addEventListener('click',()=>nav('read-article'));return;
  }
  artReviewCard=artReviewQueue[0];
  const done=artReviewInitial-artReviewQueue.length,pct=Math.max(0,done/artReviewInitial*100);
  rc.innerHTML=`
    <div class="review-progress"><div class="review-progress-fill" style="width:${pct}%"></div></div>
    <div style="font-size:12px;color:var(--text3);text-align:right;margin-bottom:14px;margin-top:-20px">${done}/${artReviewInitial} từ · ${artReviewCorrect} đúng</div>
    <div class="review-card">
      <div class="review-vi">NGHĨA TIẾNG VIỆT</div>
      <div class="review-word">${artReviewCard.vi}</div>
      ${wordTypeBadgeHtml(artReviewCard.wordType, artReviewCard.wordTypes)}
      ${artReviewCard.zhDef?`<div style="font-size:13px;color:var(--text2);margin-top:10px;padding:8px 14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);text-align:left">🀄 <span style="font-family:'Noto Sans SC',sans-serif">${tr(artReviewCard.zhDef)}</span></div>`:''}
      ${artReviewCard.exVi?`<div style="font-size:13px;color:var(--text2);margin-top:10px;padding:11px 16px;background:var(--surface2);border-radius:8px;text-align:left;border:1px solid var(--border)"><div style="font-family:'Noto Sans SC',sans-serif;font-size:14px;margin-bottom:4px">${tr(artReviewCard.exZh||'')}</div><div>${artReviewCard.exVi}</div></div>`:''}\n      ${artReviewCard.note?`<div style="margin-top:10px"><button id="art-hint-toggle-btn" style="padding:5px 14px;background:var(--surface2);border:1.5px dashed var(--border2);border-radius:6px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;font-family:'DM Sans',sans-serif">💡 Xem gợi ý</button><div id="art-hint-content" style="display:none;margin-top:8px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);font-size:13px;color:var(--text);line-height:1.6;white-space:pre-wrap;text-align:left">${artReviewCard.note}</div></div>`:''}
      <div class="review-pinyin" id="art-live-pinyin"></div>
      <input type="text" class="answer-input" id="art-answer-input" placeholder="Nhập chữ Hán...">
      <div class="feedback-bar" id="art-feedback-bar"></div>
      <div class="correct-answer" id="art-correct-ans" style="display:none"></div>
      <button class="check-btn" id="art-check-btn">Kiểm tra</button>
    </div>
    <div class="diff-btns" id="art-diff-btns" style="display:none">
      <button class="diff-btn again" data-grade="0"><span class="emoji">❌</span><span class="label">Lại</span><span class="interval" id="ai0"></span></button>
      <button class="diff-btn hard"  data-grade="1"><span class="emoji">😐</span><span class="label">Khó</span><span class="interval" id="ai1"></span></button>
      <button class="diff-btn good"  data-grade="2"><span class="emoji">🙂</span><span class="label">Được</span><span class="interval" id="ai2"></span></button>
      <button class="diff-btn easy"  data-grade="3"><span class="emoji">😎</span><span class="label">Dễ</span><span class="interval" id="ai3"></span></button>
    </div>`;
  const inp=$('art-answer-input');inp.focus();
  inp.addEventListener('input',()=>{const el=$('art-live-pinyin');if(el)el.textContent=getPinyin(inp.value);});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')artCheckAnswer();});
  $('art-check-btn').addEventListener('click',artCheckAnswer);
  rc.querySelectorAll('.diff-btn').forEach(btn=>btn.addEventListener('click',()=>artGradeCard(parseInt(btn.dataset.grade))));
  const artHintBtn=$('art-hint-toggle-btn');
  if(artHintBtn){artHintBtn.addEventListener('click',()=>{const c=$('art-hint-content');if(c.style.display==='none'){c.style.display='block';artHintBtn.textContent='💡 Ẩn gợi ý';}else{c.style.display='none';artHintBtn.textContent='💡 Xem gợi ý';}});}
  setupReviewDictLookup($('art-review-content'));
  artReviewAnswered=false;
}
function artCheckAnswer(){
  if(artReviewAnswered)return;const inp=$('art-answer-input');if(!inp?.value.trim())return;
  artReviewAnswered=true;artReviewTotal++;
  const ok=inp.value.trim()===artReviewCard.zh;if(ok)artReviewCorrect++;
  const fb=$('art-feedback-bar'),ca=$('art-correct-ans');
  if(ok){inp.classList.add('correct');fb.className='feedback-bar correct';fb.textContent='✓ Chính xác!';ca.style.display='none';}
  else{inp.classList.add('wrong');fb.className='feedback-bar wrong';fb.textContent='✗ Sai rồi!';ca.style.display='block';ca.textContent=`Đáp án đúng: ${tr(artReviewCard.zh)} (${artReviewCard.pinyin})`;}
  $('art-diff-btns').style.display='grid';$('art-check-btn').textContent='Chọn mức độ khó →';$('art-check-btn').disabled=true;
  for(let g=0;g<4;g++){const el=$(`ai${g}`);if(el)el.textContent=intLabel(g,artReviewCard);}
}
function artGradeCard(g){
  sm2Local(artReviewCard,g);artReviewQueue.shift();
  if(g===0&&artReviewQueue.length>0){const slot=Math.min(3,artReviewQueue.length);artReviewQueue.splice(slot,0,{...artReviewCard});}
  artReviewAnswered=false;renderArtReviewCard();
}

// ─── ADD WORD ─────────────────────────────────────────────────────────────────
function addWord(){
  const zh=$('inp-zh').value.trim(),vi=$('inp-vi').value.trim();
  if(!zh||!vi){toast('Vui lòng nhập chữ Hán và nghĩa!');return;}
  db.words.push({id:Date.now(),zh,vi,pinyin:getPinyin(zh),
    zhDef:$('inp-zh-def').value.trim(),
    exZh:$('inp-ex-zh').value.trim(),exVi:$('inp-ex-vi').value.trim(),
    note:$('inp-note')?.value.trim()||'',
    wordType:window._selectedType||'',
    status:'new',ef:2.5,interval:0,repetitions:0,nextReview:null,lastReview:null,added:Date.now()});
  save();
  ['inp-zh','inp-vi','inp-zh-def','inp-ex-zh','inp-ex-vi','inp-note'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
  $('pinyin-preview').textContent='';
  resetWordTypeSelector('word-type-selector','_selectedType');
  toast(`✓ Đã thêm: ${zh}`);
}

// ─── WORD LIST ────────────────────────────────────────────────────────────────
function renderWordList(q=''){
  q=q.toLowerCase();const now=Date.now();
  const base=_wf==='due'?db.words.filter(w=>!w.nextReview||w.nextReview<=now)
            :_wf==='learned'?db.words.filter(w=>w.repetitions>0&&w.status!=='mastered')
            :_wf==='mastered'?db.words.filter(w=>w.status==='mastered')
            :db.words;
  const labels={all:'Tất cả từ',due:'Cần ôn tập',learned:'Đã học',mastered:'Thành thạo'};
  $('wordlist-count').textContent=`${db.words.length} từ trong thư viện`;
  $('wordlist-filter-pill').innerHTML=_wf!=='all'?`<div class="filter-pill f${_wf}">${labels[_wf]} <span class="filter-clear" id="clear-filter">✕</span></div>`:'';
  document.getElementById('clear-filter')?.addEventListener('click',()=>{_wf='all';renderWordList($('search-input').value||'');});
  const filtered=base.filter(w=>!q||w.zh.includes(q)||w.vi.toLowerCase().includes(q)||w.pinyin.toLowerCase().includes(q));
  const sl={new:'Mới',learning:'Đang học',review:'Ôn tập',mastered:'Thành thạo'};
  const sb={new:'badge-new',learning:'badge-learning',review:'badge-review',mastered:'badge-mastered'};
  const tbody=$('word-table-body');
  tbody.innerHTML=filtered.length
    ?[...filtered].reverse().map(w=>{
  const wts=(w.wordTypes?.length?w.wordTypes:(w.wordType?[w.wordType]:[]));
  const wtBadges=wts.map(k=>{const i=getWtInfo(k);return i?`<span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${i.bg};color:${i.color};white-space:nowrap;display:inline-block">${i.key} ${i.vi}</span>`:''}).join('');
  const wtHtml=`<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">
  ${wtBadges||'<span style="color:var(--text4);font-size:12px">—</span>'}
  <button class="wt-add-btn" data-id="${w.id}" title="Chỉnh loại từ" style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#ff6b8a,#e8194b);color:#fff;border:none;cursor:pointer;font-size:14px;font-weight:700;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;margin-left:2px;line-height:1">+</button>
</div>`;
      return`<tr>
        <td style="font-family:'Noto Serif SC',serif;font-size:19px;font-weight:600">${tr(w.zh)}</td>
        <td style="color:var(--red);font-weight:500">${w.pinyin}</td>
        <td>${w.vi}</td>
        <td>${wtHtml}</td>
        <td><span class="badge ${sb[w.status]||'badge-new'}">${sl[w.status]||'Mới'}</span></td>
        <td style="color:var(--text2);font-size:13px">${!w.nextReview?'Ngay bây giờ':new Date(w.nextReview).toLocaleDateString('vi-VN')}</td>
        <td>
           <div style="display:flex;gap:6px;align-items:center">
             <button class="edit-btn" data-id="${w.id}" title="Sửa">✏️</button>
             <button class="del-btn" data-id="${w.id}">✕</button>
           </div>
         </td>
                 
      </tr>`;}).join('')
    :'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:28px">Không tìm thấy từ nào.</td></tr>';
  tbody.querySelectorAll('.del-btn').forEach(btn=>btn.addEventListener('click',()=>deleteWord(Number(btn.dataset.id))));
         tbody.querySelectorAll('.edit-btn').forEach(btn=>btn.addEventListener('click',()=>openWordEditor(Number(btn.dataset.id))));
         tbody.querySelectorAll('.wt-add-btn').forEach(btn=>btn.addEventListener('click',e=>{
                  e.stopPropagation();openWordTypeEditor(Number(btn.dataset.id),btn);
}));
}
function deleteWord(id){
  if(!confirm('Xoá từ này?'))return;
  db.words=db.words.filter(w=>w.id!==id);
  save();renderWordList($('search-input')?.value||'');toast('Đã xoá từ.');
}
function openWordEditor(id){
  const word=db.words.find(w=>w.id===id);if(!word)return;
  $('edit-word-id').value=id;
  $('edit-inp-zh').value=word.zh||'';
  $('edit-pinyin-preview').textContent=word.pinyin||'';
  $('edit-inp-vi').value=word.vi||'';
  $('edit-inp-zhdef').value=word.zhDef||'';
  $('edit-inp-exzh').value=word.exZh||'';
  $('edit-inp-exvi').value=word.exVi||'';
  if($('edit-inp-note'))$('edit-inp-note').value=word.note||'';
  window._editSelectedTypes=word.wordTypes?.length?[...word.wordTypes]:(word.wordType?[word.wordType]:[]);
  buildEditTypeSelector();
  $('word-edit-overlay').style.display='flex';
  setTimeout(()=>$('edit-inp-zh').focus(),100);
}
function buildEditTypeSelector(){
  const c=$('edit-word-type-selector');if(!c)return;
  c.innerHTML=WORD_TYPES.map(t=>`<button class="wtype-tag${window._editSelectedTypes.includes(t.key)?' active':''}" data-key="${t.key}" style="--wt-color:${t.color};--wt-bg:${t.bg}">${t.key}<span class="wtype-vi"> ${t.vi}</span></button>`).join('');
  c.querySelectorAll('.wtype-tag').forEach(btn=>btn.addEventListener('click',()=>{
    const k=btn.dataset.key;
    window._editSelectedTypes=window._editSelectedTypes.includes(k)?window._editSelectedTypes.filter(x=>x!==k):[...window._editSelectedTypes,k];
    buildEditTypeSelector();
  }));
}
function saveWordEdit(){
  const id=Number($('edit-word-id').value);
  const zh=$('edit-inp-zh').value.trim(),vi=$('edit-inp-vi').value.trim();
  if(!zh||!vi){toast('Vui lòng nhập chữ Hán và nghĩa!');return;}
  const word=db.words.find(w=>w.id===id);if(!word)return;
  word.zh=zh;word.pinyin=getPinyin(zh);word.vi=vi;
  word.zhDef=$('edit-inp-zhdef').value.trim();
  word.exZh=$('edit-inp-exzh').value.trim();
  word.exVi=$('edit-inp-exvi').value.trim();
  word.note=$('edit-inp-note')?.value.trim()||'';
  word.wordTypes=[...window._editSelectedTypes];
  word.wordType=word.wordTypes[0]||'';
  save();
  $('word-edit-overlay').style.display='none';
  renderWordList($('search-input')?.value||'');
  toast('✓ Đã lưu thay đổi!');
}
function openWordTypeEditor(wordId, anchorEl){
  const word=db.words.find(w=>w.id===wordId);if(!word)return;
  if(!word.wordTypes)word.wordTypes=word.wordType?[word.wordType]:[];
  const popover=$('wt-editor-popover'),tagsEl=$('wt-editor-tags');

  function renderEditorTags(){
    tagsEl.innerHTML=WORD_TYPES.map(t=>{
      const active=word.wordTypes.includes(t.key);
      return`<button class="wtype-tag${active?' active':''}" data-key="${t.key}"
        style="--wt-color:${t.color};--wt-bg:${t.bg};padding:3px 8px;font-size:11px">
        ${t.key}<span class="wtype-vi"> ${t.vi}</span></button>`;
    }).join('');
    tagsEl.querySelectorAll('.wtype-tag').forEach(btn=>btn.addEventListener('click',()=>{
      const k=btn.dataset.key;
      word.wordTypes=word.wordTypes.includes(k)?word.wordTypes.filter(x=>x!==k):[...word.wordTypes,k];
      save();renderEditorTags();
    }));
  }
  renderEditorTags();

  const rect=anchorEl.getBoundingClientRect();
  popover.style.top=(rect.bottom+8)+'px';
  popover.style.left=Math.min(rect.left,window.innerWidth-270)+'px';
  popover.style.display='block';

  $('wt-editor-done').onclick=()=>{
    popover.style.display='none';
    renderWordList($('search-input')?.value||'');
  };
}

document.addEventListener('click',e=>{
  const p=$('wt-editor-popover');
  if(p&&p.style.display!=='none'&&!p.contains(e.target)&&!e.target.classList.contains('wt-add-btn')){
    p.style.display='none';renderWordList($('search-input')?.value||'');
  }
});
// ─── ARTICLES ─────────────────────────────────────────────────────────────────
let currentArticleId=null,articleSortOrder='newest',editingArticleId=null;

function renderArticlesList(){
  const container=$('articles-list');
  if(!db.articles||!db.articles.length){
    container.innerHTML=`<div class="empty-state"><div class="emoji">📰</div><h3>Chưa có bài báo nào</h3><p>Upload bài báo tiếng Trung để học từ mới từ ngữ cảnh thực tế!</p></div>`;return;
  }
  const sorted=[...db.articles].sort((a,b)=>articleSortOrder==='newest'?b.added-a.added:a.added-b.added);
  container.innerHTML=sorted.map(a=>`
    <div class="article-card" data-id="${a.id}">
      ${a.imageUrl?`<img class="article-card-img" src="${a.imageUrl}" alt="" onerror="this.style.display='none'">`:'' }
      <div style="flex:1;min-width:0">
        <div class="article-card-title">${a.title}</div>
        <div class="article-card-meta">${a.source?'📰 '+a.source+' · ':''}${new Date(a.added).toLocaleDateString('vi-VN')} · ${a.wordCount||0} ký tự · ${a.addedWords||0} từ đã học</div>
        <div class="article-card-preview">${(a.body||'').replace(/<[^>]*>/g,'').slice(0,80)}...</div>
      </div>
      <div class="article-card-actions">
        <button class="article-edit-btn" data-edit="${a.id}" title="Chỉnh sửa">✏️</button>
        <button class="article-del-btn" data-del="${a.id}" title="Xoá">✕</button>
      </div>
    </div>`).join('');
  container.querySelectorAll('.article-card').forEach(card=>{
    card.addEventListener('click',e=>{if(e.target.closest('[data-del]')||e.target.closest('[data-edit]'))return;openArticle(Number(card.dataset.id));});
  });
  container.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openEditArticle(Number(btn.dataset.edit));}));
  container.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();if(!confirm('Xoá bài báo này?'))return;db.articles=db.articles.filter(a=>a.id!==Number(btn.dataset.del));save();renderArticlesList();toast('Đã xoá bài báo.');}));
}

function saveArticle(){
  const title=$('article-title-inp').value.trim(),body=$('article-body-inp').innerHTML.trim();
  if(!title||!body){toast('Vui lòng nhập tiêu đề và nội dung!');return;}
  if(editingArticleId!==null){
    const article=db.articles.find(a=>a.id===editingArticleId);if(!article){toast('Không tìm thấy!');return;}
    article.title=title;article.source=$('article-source-inp').value.trim();
    article.imageUrl=$('article-image-inp').value.trim();article.body=body;article.wordCount=$('article-body-inp').innerText.length;article.editedAt=Date.now();
    editingArticleId=null;save();clearUploadForm();toast(`✓ Đã cập nhật: ${title}`);nav('articles');
  }else{
    const article={id:Date.now(),title,source:$('article-source-inp').value.trim(),imageUrl:$('article-image-inp').value.trim(),body,wordCount:$('article-body-inp').innerText.length,addedWords:0,added:Date.now()};
    if(!db.articles)db.articles=[];db.articles.push(article);save();clearUploadForm();toast(`✓ Đã lưu: ${title}`);nav('articles');
  }
}
function clearUploadForm(){
  ['article-title-inp','article-source-inp','article-image-inp'].forEach(id=>$(id).value='');$('article-body-inp').innerHTML='';
  $('article-image-preview').style.display='none';$('article-img-thumb').src='';
  $('upload-article-heading').textContent='Upload bài báo';
  $('upload-article-subheading').textContent='Dán nội dung bài báo tiếng Trung vào đây';
  $('save-article-btn').textContent='💾 Lưu bài báo';editingArticleId=null;
}
function openEditArticle(id){
  const article=db.articles.find(a=>a.id===id);if(!article)return;
  editingArticleId=id;
  $('article-title-inp').value=article.title||'';$('article-source-inp').value=article.source||'';
  $('article-image-inp').value=article.imageUrl||'';$('article-body-inp').innerHTML=article.body||'';
  if(article.imageUrl){$('article-image-preview').style.display='block';$('article-img-thumb').src=article.imageUrl;}
  else{$('article-image-preview').style.display='none';$('article-img-thumb').src='';}
  $('upload-article-heading').textContent='Chỉnh sửa bài báo';
  $('upload-article-subheading').textContent='Cập nhật nội dung bài báo';
  $('save-article-btn').textContent='💾 Lưu thay đổi';nav('upload-article');
}

function renderArticleBody(article){
  let html=article.body||'';
  // Convert body to traditional if needed
  if(isTraditional&&_openccConverter) html=_openccConverter(html);
  const linkedWords=db.words.filter(w=>(article.linkedWords||[]).includes(w.id));
  linkedWords.sort((a,b)=>b.zh.length-a.zh.length);
  // Highlight using tr(w.zh) so we search for the already-converted form in body
  linkedWords.forEach(w=>{html=applyWordHighlight(html,tr(w.zh));});
  (article.freeHighlights||[]).forEach(h=>{html=applyFreeHighlight(html,h);});
  $('article-reader-body').innerHTML=html;
}

function openArticle(id){
  const article=db.articles.find(a=>a.id===id);if(!article)return;
  currentArticleId=id;
  $('read-article-title').textContent=article.title;
  $('read-article-source').textContent=article.source||'';
  let readerImgEl=$('reader-article-img');
  if(!readerImgEl){
    readerImgEl=document.createElement('img');readerImgEl.id='reader-article-img';
    readerImgEl.style.cssText='width:100%;max-height:220px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--border)';
    $('article-reader-body').parentElement.insertBefore(readerImgEl,$('article-reader-body').parentElement.firstChild.nextSibling);
  }
  if(article.imageUrl){readerImgEl.src=article.imageUrl;readerImgEl.style.display='block';readerImgEl.onerror=()=>readerImgEl.style.display='none';}
  else{readerImgEl.style.display='none';readerImgEl.src='';}
  renderArticleBody(article);
  ['art-inp-zh','art-inp-vi','art-inp-zh-def','art-inp-ex-zh','art-inp-ex-vi']
  .forEach(id => { const el=$(id); if(el) el.value=''; });
  $('art-pinyin-preview').textContent='';
  buildWordTypeSelector('art-word-type-selector','_artSelectedType');window._artSelectedType='';
  renderArticleAddedWords(article);nav('read-article');setupTextSelection();
}

function renderArticleAddedWords(article){
  const wordsDiv=$('article-added-words');const ids=article.linkedWords||[];
  if(!ids.length){wordsDiv.textContent='Chưa có từ nào.';return;}
  const words=db.words.filter(w=>ids.includes(w.id));
  wordsDiv.innerHTML=words.map(w=>{
    const wt=w.wordType?getWtInfo(w.wordType):null;
    return`<div class="added-word-row">
      <span class="added-word-zh">${tr(w.zh)}</span>
      <span class="added-word-py">${w.pinyin}</span>
      ${wt?`<span style="padding:1px 7px;border-radius:99px;font-size:10px;font-weight:600;background:${wt.bg};color:${wt.color};flex-shrink:0">${wt.key}</span>`:''}
      <span class="added-word-vi">${w.vi}</span>
    </div>`;}).join('');
}

function addWordFromArticle(zh,vi,exZh='',exVi='',zhDef='',wordType='',note=''){
  if(!zh||!vi){toast('Vui lòng nhập chữ Hán và nghĩa!');return false;}
  const article=db.articles.find(a=>a.id===currentArticleId);
  if(article&&article.linkedWords){
    const already=db.words.find(w=>w.zh===zh&&article.linkedWords.includes(w.id));
    if(already){toast(`"${zh}" đã được thêm rồi`);return false;}
  }
  const newWord={id:Date.now(),zh,vi,pinyin:getPinyin(zh),zhDef,exZh,exVi,note:note||'',wordType:wordType||'',status:'new',ef:2.5,interval:0,repetitions:0,nextReview:null,lastReview:null,added:Date.now()};
  db.words.push(newWord);
  if(article){
    if(!article.linkedWords)article.linkedWords=[];
    article.linkedWords.push(newWord.id);article.addedWords=article.linkedWords.length;
    highlightWord(zh);
  }
  save();return newWord;
}

// ─── HIGHLIGHT HELPERS ────────────────────────────────────────────────────────
function applyWordHighlight(html,zh){
  if(!zh)return html;
  const escaped=zh.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return html.replace(new RegExp(`(?<!<[^>]*)${escaped}(?![^<]*>)`,'g'),match=>`<span class="word-highlight" title="${zh}">${match}</span>`);
}
function applyFreeHighlight(html,h){
  if(!h||!h.text)return html;
  const escaped=h.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const ci=HIGHLIGHT_COLORS.find(c=>c.key===h.color)||HIGHLIGHT_COLORS[0];
  return html.replace(new RegExp(`(?<!<[^>]*)${escaped}(?![^<]*>)`,'g'),match=>`<span class="free-highlight" data-hkey="${encodeURIComponent(h.text)}" style="background:${ci.bg};color:${ci.text};border-radius:3px;padding:0 2px">${match}</span>`);
}
function highlightWord(zh){
  const body=$('article-reader-body');if(!body||!zh)return;
  body.innerHTML=applyWordHighlight(body.innerHTML,tr(zh));
}

// ─── TEXT SELECTION ───────────────────────────────────────────────────────────
function setupTextSelection(){
  const body=$('article-reader-body');
  const choicePopup=$('selection-choice-popup');
  const popup=$('selection-popup');
  const hlPopup=$('highlight-popup');
  if(!body)return;

  const newBody=body.cloneNode(true);body.parentNode.replaceChild(newBody,body);
  const bd=$('article-reader-body');

  let savedText='', savedRect=null;

  document.addEventListener('mouseup',e=>{
    if(choicePopup.contains(e.target)||popup.contains(e.target)||hlPopup.contains(e.target))return;
    const sel=window.getSelection();
    const text=sel?.toString().trim();
    if(!text||!bd.contains(sel?.anchorNode)){
      choicePopup.style.display='none';
      popup.style.display='none';
      hlPopup.style.display='none';
      return;
    }
    savedText=text;
    savedRect=sel.getRangeAt(0).getBoundingClientRect();
    $('choice-selected-text').textContent=`"${text.slice(0,30)}${text.length>30?'…':''}"`;
    positionPopup(choicePopup,savedRect);
    choicePopup.style.display='block';
    popup.style.display='none';
    hlPopup.style.display='none';
  });

  $('choice-cancel-btn').addEventListener('click',()=>{
    choicePopup.style.display='none';
    window.getSelection()?.removeAllRanges();
  });

  $('choice-add-word-btn').addEventListener('click',()=>{
    if(!savedText)return;
    resetWordTypeSelector('popup-word-type-selector','_popupSelectedType');
    buildWordTypeSelector('popup-word-type-selector','_popupSelectedType');       
    choicePopup.style.display='none';
    $('popup-word').textContent=savedText;
    $('popup-pinyin').textContent=getPinyin(savedText);
    $('popup-vi-inp').value='';
    const zhDef=$('popup-zh-def-inp'); if(zhDef)zhDef.value='';
    $('popup-ex-zh-inp').value='';$('popup-ex-vi-inp').value='';
    resetWordTypeSelector('popup-word-type-selector','_popupSelectedType');
    buildWordTypeSelector('popup-word-type-selector','_popupSelectedType');
    if(dictData&&dictData[savedText])$('popup-vi-inp').value=dictData[savedText].split(';')[0].trim();
    else if(!dictData)loadDict().then(()=>{if(dictData&&dictData[savedText])$('popup-vi-inp').value=dictData[savedText].split(';')[0].trim();});
    positionPopup(popup,savedRect);
    popup.style.display='block';
    setTimeout(()=>$('popup-vi-inp').focus(),50);
  });

  $('choice-highlight-btn').addEventListener('click',()=>{
    if(!savedText)return;
    choicePopup.style.display='none';
    $('hlpopup-text').textContent=`"${savedText.slice(0,28)}${savedText.length>28?'…':''}"`;
    hlPopup.dataset.text=savedText;
    positionPopup(hlPopup,savedRect);
    hlPopup.style.display='block';
    window.getSelection()?.removeAllRanges();
  });

  $('highlight-popup').querySelectorAll('.hl-color-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const text=hlPopup.dataset.text;if(!text)return;
      applyAndSaveFreeHighlight(text,btn.dataset.color);
      hlPopup.style.display='none';window.getSelection()?.removeAllRanges();
    });
  });
  $('hlpopup-cancel').addEventListener('click',()=>{hlPopup.style.display='none';window.getSelection()?.removeAllRanges();});
  $('hlpopup-remove').addEventListener('click',()=>{
    const text=hlPopup.dataset.text;if(!text)return;
    removeFreeHighlight(text);hlPopup.style.display='none';window.getSelection()?.removeAllRanges();
  });

  $('popup-cancel-btn').addEventListener('click',()=>{popup.style.display='none';window.getSelection()?.removeAllRanges();});
  $('popup-add-btn').addEventListener('click',()=>{
    const zh=$('popup-word').textContent.trim(),vi=$('popup-vi-inp').value.trim();
    const zhDef=$('popup-zh-def-inp'); 
    const exZh=$('popup-ex-zh-inp').value.trim(),exVi=$('popup-ex-vi-inp').value.trim();
    const note=$('popup-note-inp')?.value.trim()||'';
    const w=addWordFromArticle(zh,vi,exZh,exVi,zhDef?zhDef.value.trim():'',window._popupSelectedType,note);
    if(w){
      toast(`✓ Đã thêm: ${zh}`);popup.style.display='none';window.getSelection()?.removeAllRanges();
      const article=db.articles.find(a=>a.id===currentArticleId);if(article)renderArticleAddedWords(article);
    }else toast('Vui lòng nhập nghĩa!');
  });
  $('popup-vi-inp').addEventListener('keydown',e=>{if(e.key==='Enter'){const d=$('popup-zh-def-inp');d?d.focus():$('popup-ex-zh-inp').focus();}});
  if($('popup-zh-def-inp'))$('popup-zh-def-inp').addEventListener('keydown',e=>{if(e.key==='Enter')$('popup-ex-zh-inp').focus();});
  $('popup-ex-zh-inp').addEventListener('keydown',e=>{if(e.key==='Enter')$('popup-ex-vi-inp').focus();});
  $('popup-ex-vi-inp').addEventListener('keydown',e=>{if(e.key==='Enter')$('popup-add-btn').click();});
}
function positionPopup(el,rect){
  el.style.visibility='hidden';el.style.display='block';
  const pH=el.offsetHeight||220,pW=el.offsetWidth||300,margin=10;
  const spaceAbove=rect.top,spaceBelow=window.innerHeight-rect.bottom;
  let top;
  if(spaceAbove>=pH+margin)top=rect.top+window.scrollY-pH-margin;
  else if(spaceBelow>=pH+margin)top=rect.bottom+window.scrollY+margin;
  else top=spaceAbove>spaceBelow?Math.max(window.scrollY+margin,rect.top+window.scrollY-pH-margin):rect.bottom+window.scrollY+margin;
  el.style.left=Math.min(Math.max(margin,rect.left+window.scrollX),window.innerWidth-pW-margin)+'px';
  el.style.top=top+'px';el.style.visibility='';
}

function applyAndSaveFreeHighlight(text,color){
  const article=db.articles.find(a=>a.id===currentArticleId);if(!article)return;
  if(!article.freeHighlights)article.freeHighlights=[];
  article.freeHighlights=article.freeHighlights.filter(h=>h.text!==text);
  article.freeHighlights.push({text,color});save();
  const bd=$('article-reader-body');
  bd.innerHTML=applyFreeHighlight(bd.innerHTML,{text,color});
}

function removeFreeHighlight(text){
  const article=db.articles.find(a=>a.id===currentArticleId);if(!article)return;
  article.freeHighlights=(article.freeHighlights||[]).filter(h=>h.text!==text);
  save();openArticle(currentArticleId);
}

function artLookupDict(zh){
  const viInp=$('art-inp-vi');if(!zh){viInp.style.borderColor='';viInp.placeholder='e.g. kinh tế';return;}
  if(!dictData){loadDict().then(()=>artLookupDict($('art-inp-zh').value.trim()));return;}
  const found=dictData[zh];
  if(found){if(!viInp.value.trim()){viInp.value=found.split(';')[0].trim();viInp.style.borderColor='var(--green)';viInp.style.boxShadow='0 0 0 3px rgba(23,122,71,0.12)';setTimeout(()=>{viInp.style.borderColor='';viInp.style.boxShadow='';},1800);}}
  else if(zh.length>1){const fc=dictData[[...zh][0]];if(fc)viInp.placeholder='→ '+fc.split(';')[0].trim()+'...';}
}

// ─── DARK MODE ────────────────────────────────────────────────────────────────
function initDarkMode(){
  if(localStorage.getItem('hanzi_dark')==='1')document.body.classList.add('dark');
  $('dark-toggle').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('hanzi_dark',document.body.classList.contains('dark')?'1':'0');});
}

// ─── TRADITIONAL CHINESE TOGGLE ───────────────────────────────────────────────
let isTraditional=false;
let _openccConverter=null;

async function getConverter(){
  if(_openccConverter)return _openccConverter;
  _openccConverter=OpenCC.Converter({from:'cn',to:'twp'});
  return _openccConverter;
}

// tr(text) → converts to traditional if toggle is on, else returns as-is
async function trAsync(text){
  if(!text||!isTraditional)return text;
  const conv=await getConverter();
  return conv(text);
}

// Synchronous version using cached converter (call after converter is warmed up)
function tr(text){
  if(!text||!isTraditional||!_openccConverter)return text;
  return _openccConverter(text);
}

async function initTradToggle(){
  isTraditional=localStorage.getItem('hanzi_trad')==='1';
  const btn=$('trad-toggle');
  if(isTraditional){document.body.classList.add('trad');await getConverter();}
  btn.addEventListener('click',async()=>{
    isTraditional=!isTraditional;
    localStorage.setItem('hanzi_trad',isTraditional?'1':'0');
    document.body.classList.toggle('trad',isTraditional);
    if(isTraditional)await getConverter();
    const ap=document.querySelector('.page.active')?.id;
    if(ap==='wordlist')renderWordList($('search-input')?.value||'');
    if(ap==='dashboard')renderDashboard();
    if(ap==='review'&&currentCard)renderReviewCard();
    if(ap==='article-review')renderArtReviewCard();
    if(ap==='read-article'||ap==='articles'||ap==='upload-article'){
      if(ap==='read-article'&&currentArticleId){
        const article=db.articles.find(a=>a.id===currentArticleId);
        if(article){renderArticleBody(article);renderArticleAddedWords(article);}
      } else if(ap==='articles'){
        renderArticlesList();
      }
    }
  });
}

function initMobileMenu(){
  const btn=$('menu-btn'),sidebar=$('sidebar'),overlay=$('sidebar-overlay');
  btn.addEventListener('click',()=>{sidebar.classList.toggle('open');overlay.classList.toggle('open');});
  overlay.addEventListener('click',()=>{sidebar.classList.remove('open');overlay.classList.remove('open');});
  sidebar.querySelectorAll('.nav-item').forEach(item=>item.addEventListener('click',()=>{sidebar.classList.remove('open');overlay.classList.remove('open');}));
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
document.getElementById('google-signin-btn').addEventListener('click',async()=>{
  const errEl=document.getElementById('login-err');if(errEl)errEl.textContent='';
  try{await signInWithPopup(auth,provider);}
  catch(e){if(errEl)errEl.textContent='Đăng nhập thất bại: '+(e.message||e.code||'Lỗi không xác định');}
});
document.getElementById('signout-btn').addEventListener('click',async()=>{await signOut(auth);});
onAuthStateChanged(auth,async user=>{
  const loginScreen=document.getElementById('login-screen'),loadingScreen=document.getElementById('loading'),userRow=document.getElementById('user-row');
  if(user){
    loginScreen.style.display='none';
    document.getElementById('user-name').textContent=user.displayName||'Người dùng';
    document.getElementById('user-email').textContent=user.email||'';
    const wrap=document.getElementById('user-avatar-wrap');
    if(user.photoURL)wrap.innerHTML=`<img class="user-avatar" src="${user.photoURL}" referrerpolicy="no-referrer">`;
    else wrap.innerHTML=`<div class="user-avatar-fallback">${(user.displayName||'?')[0].toUpperCase()}</div>`;
    if(userRow)userRow.style.display='flex';
    currentUserId=user.uid;DB_DOC=doc(firestore,'users',user.uid,'data','main');
    db={words:[],sessions:{},correct:0,total:0,articles:[]};await init();
  }else{
    currentUserId=null;DB_DOC=null;db={words:[],sessions:{},correct:0,total:0,articles:[]};
    if(loadingScreen)loadingScreen.style.display='none';
    if(userRow)userRow.style.display='none';
    loginScreen.style.display='flex';
  }
});

loadDict();initDarkMode();initTradToggle();initMobileMenu();

// ─── SAFETY TIMEOUT ───────────────────────────────────────────────────────────
// Nếu Firebase không phản hồi sau 8 giây, ẩn loading và hiện màn hình đăng nhập
setTimeout(()=>{
  const loading=document.getElementById('loading');
  const loginScreen=document.getElementById('login-screen');
  if(loading&&loading.style.display!=='none'){
    loading.style.display='none';
    // Only show login if user is NOT logged in
    // If logged in, init() will complete via timeout and render the app
    if(!currentUserId&&loginScreen) loginScreen.style.display='flex';
    console.warn('Firebase safety timeout fired');
  }
},8000);
