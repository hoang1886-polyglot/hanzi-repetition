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
  if(page!=='hsk-books') hskState={view:'books',bookId:null,unitIndex:null,wordIndex:null};
  if(page==='dashboard')renderDashboard();
  if(page==='review')startReview();
  if(page==='wordlist')renderWordList('');
  if(page==='articles')renderArticlesList();
  if(page==='add'){ buildWordTypeSelector('word-type-selector','_selectedType'); window._selectedType=''; }
  if(page==='hsk-books') hskNav(hskState.view==='books'?'books':hskState.view==='units'?'units':'words', hskState.bookId, hskState.unitIndex, hskState.wordIndex);
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
  initHskNav();
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
let reviewCorrect=0,reviewTotal=0,reviewInitial=0,reviewWrong=[];
function startReview(){
  reviewQueue=db.words.filter(w=>!w.nextReview||w.nextReview<=Date.now()).map(w=>({...w})).sort(()=>Math.random()-0.5);
  reviewCorrect=0;reviewTotal=0;reviewInitial=reviewQueue.length;reviewWrong=[];
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
  reviewTotal++;if(ok)reviewCorrect++;else if(!reviewWrong.find(x=>x.id===currentCard.id))reviewWrong.push(currentCard);
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

// ═══════════════════════════════════════════════════════════════════════════════
// HSK BOOKS MODULE
// ═══════════════════════════════════════════════════════════════════════════════

// ── HSK State ─────────────────────────────────────────────────────────────────
let hskState = {
  view: 'books',   // 'books' | 'units' | 'words' | 'detail'
  bookId: null,
  unitIndex: null,
  wordIndex: null,
};

// ── HSK Data — 500 từ HSK1 phân loại theo chủ đề ────────────────────────────
// Structure: books → units → words
const HSK_BOOKS = [
  {
    id: 'hsk1',
    title: 'HSK 1',
    level: 1,
    icon: '🌱',
    desc: '500 từ cơ bản — phiên bản HSK mới 2021',
    units: [
      {
        title: 'Unit 1: 🗣️ Chào hỏi & Giao tiếp',
        words: [
          { zh:'再见', vi:'Tạm biệt', hanViet:'', zhDef:'', memoryTip:'', exZh:'A: 明天见！', exVi:'A: Hẹn gặp lại ngày mai!' },
          { zh:'谢谢', vi:'Cảm ơn', hanViet:'', zhDef:'', memoryTip:'', exZh:'谢谢你的帮助。', exVi:'Cảm ơn sự giúp đỡ của bạn.' },
          { zh:'不客气', vi:'Không có gì; đừng khách sáo', hanViet:'', zhDef:'', memoryTip:'', exZh:'A: 谢谢你！', exVi:'A: Cảm ơn bạn!' },
          { zh:'对不起', vi:'Xin lỗi', hanViet:'', zhDef:'', memoryTip:'', exZh:'对不起，我迟到了。', exVi:'Xin lỗi, tôi đã đến muộn.' },
          { zh:'没关系', vi:'Không sao đâu', hanViet:'', zhDef:'', memoryTip:'', exZh:'没关系，我没生气。', exVi:'Không sao, tôi không giận đâu.' },
          { zh:'请', vi:'Mời, xin vui lòng', hanViet:'', zhDef:'', memoryTip:'', exZh:'请给我一杯水。', exVi:'Xin hãy cho tôi một cốc nước.' },
          { zh:'吗', vi:'Trợ từ nghi vấn', hanViet:'', zhDef:'', memoryTip:'', exZh:'你喜欢中国菜吗？', exVi:'Bạn có thích món ăn Trung Quốc không?' },
          { zh:'呢', vi:'Thế, nhỉ, ư', hanViet:'', zhDef:'', memoryTip:'', exZh:'我是学生，你呢？', exVi:'Tớ là học sinh, còn cậu thì sao?' },
          { zh:'吧', vi:'Nhé; chứ; nào; thôi', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们去公园玩儿吧。', exVi:'Chúng mình đi công viên chơi nhé.' },
          { zh:'的', vi:'Của (chỉ sở hữu)', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是我的书。', exVi:'Đây là sách của tôi.' },
          { zh:'地', vi:'Mà, một cách', hanViet:'', zhDef:'', memoryTip:'', exZh:'孩子们快乐地唱歌。', exVi:'Mấy đứa nhỏ vui vẻ hát ca.' },
          { zh:'了', vi:'Rồi (biểu thị hành động đã hoàn thành)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我吃了一个苹果。', exVi:'Tôi đã ăn một quả táo.' },
          { zh:'着', vi:'Đang (dùng để chỉ trạng thái tiếp diễn)', hanViet:'', zhDef:'', memoryTip:'', exZh:'他笑着说话。', exVi:'Anh ấy vừa cười vừa nói.' },
          { zh:'过', vi:'Qua; đi qua; vượt qua', hanViet:'', zhDef:'', memoryTip:'', exZh:'我去过中国三次。', exVi:'Tôi đã đến Trung Quốc ba lần.' },
          { zh:'请问', vi:'Xin hỏi', hanViet:'', zhDef:'', memoryTip:'', exZh:'请问您有空吗？', exVi:'Xin hỏi anh có rảnh không ạ?' },
          { zh:'请进', vi:'Mời vào', hanViet:'', zhDef:'', memoryTip:'', exZh:'请进，大家都在等你。', exVi:'Mời vào, mọi người đang chờ bạn.' },
          { zh:'请坐', vi:'Mời ngồi', hanViet:'', zhDef:'', memoryTip:'', exZh:'欢迎光临，请坐。', exVi:'Chào mừng quý khách, mời ngồi.' },
          { zh:'是不是', vi:'Có phải không?', hanViet:'', zhDef:'', memoryTip:'', exZh:'这件事是不是你做的？', exVi:'Việc này có phải cậu làm không?' },
          { zh:'没什么', vi:'Không có gì', hanViet:'', zhDef:'', memoryTip:'', exZh:'没什么好担心的。', exVi:'Không có gì đáng lo lắng cả.' },
          { zh:'没事儿', vi:'Không có chuyện gì, không sao đâu', hanViet:'', zhDef:'', memoryTip:'', exZh:'没事儿，我帮你。', exVi:'Không sao đâu, tôi giúp bạn.' },
          { zh:'行', vi:'Được, ổn', hanViet:'', zhDef:'', memoryTip:'', exZh:'这样做行不行？', exVi:'Làm như thế này được không?' },
          { zh:'对', vi:'Đúng; chính xác', hanViet:'', zhDef:'', memoryTip:'', exZh:'你的答案是对的。', exVi:'Câu trả lời của bạn là đúng.' },
          { zh:'是', vi:'Là', hanViet:'', zhDef:'', memoryTip:'', exZh:'他是我的好朋友。', exVi:'Anh ấy là bạn tốt của tôi.' },
          { zh:'不', vi:'Không', hanViet:'', zhDef:'', memoryTip:'', exZh:'我不喜欢吃辣。', exVi:'Tôi không thích ăn cay.' },
        ]
      },
      {
        title: 'Unit 2: 👤 Đại từ & Từ hỏi',
        words: [
          { zh:'我', vi:'Tôi, mình', hanViet:'', zhDef:'', memoryTip:'', exZh:'我是学生。', exVi:'Tôi là học sinh.' },
          { zh:'你', vi:'Bạn, anh, chị', hanViet:'', zhDef:'', memoryTip:'', exZh:'你喜欢吃什么？', exVi:'Bạn thích ăn gì?' },
          { zh:'您', vi:'Ngài, ông, bà', hanViet:'', zhDef:'', memoryTip:'', exZh:'您喜欢喝茶还是喝咖啡？', exVi:'Ngài thích uống trà hay cà phê?' },
          { zh:'他', vi:'Anh ấy, ông ấy', hanViet:'', zhDef:'', memoryTip:'', exZh:'他是我的朋友。', exVi:'Anh ấy là bạn của tôi.' },
          { zh:'她', vi:'Cô ấy, bà ấy', hanViet:'', zhDef:'', memoryTip:'', exZh:'她喜欢听音乐。', exVi:'Cô ấy thích nghe nhạc.' },
          { zh:'我们', vi:'Chúng tôi, chúng ta', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们是好朋友。', exVi:'Chúng tôi là bạn tốt của nhau.' },
          { zh:'你们', vi:'Các bạn, các anh, các chị', hanViet:'', zhDef:'', memoryTip:'', exZh:'你们要去哪儿？', exVi:'Các bạn muốn đi đâu?' },
          { zh:'他们', vi:'Họ, bọn họ (nam)', hanViet:'', zhDef:'', memoryTip:'', exZh:'他们在学校学习。', exVi:'Họ đang học ở trường.' },
          { zh:'她们', vi:'Họ, bọn họ (nữ)', hanViet:'', zhDef:'', memoryTip:'', exZh:'她们正在看书。', exVi:'Họ đang đọc sách.' },
          { zh:'这', vi:'Này, đây', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是我的书。', exVi:'Đây là sách của tôi.' },
          { zh:'那', vi:'Đó, kia', hanViet:'', zhDef:'', memoryTip:'', exZh:'那是我的书。', exVi:'Đó là sách của tôi.' },
          { zh:'这里', vi:'Ở đây, chỗ này', hanViet:'', zhDef:'', memoryTip:'', exZh:'这里的风景很美。', exVi:'Phong cảnh ở đây rất đẹp.' },
          { zh:'那里', vi:'Ở đó, chỗ đó, nơi đó', hanViet:'', zhDef:'', memoryTip:'', exZh:'我刚从那里回来。', exVi:'Tôi vừa từ chỗ đó trở về.' },
          { zh:'这儿', vi:'Ở đây', hanViet:'', zhDef:'', memoryTip:'', exZh:'你来这儿看看吧。', exVi:'Bạn đến chỗ này xem thử đi.' },
          { zh:'那儿', vi:'Ở đó (phương ngữ bắc kinh)', hanViet:'', zhDef:'', memoryTip:'', exZh:'你要去那儿做什么？', exVi:'Bạn muốn đến đó làm gì?' },
          { zh:'这些', vi:'Những cái này', hanViet:'', zhDef:'', memoryTip:'', exZh:'这些水果很好吃。', exVi:'Những loại trái cây này rất ngon.' },
          { zh:'那些', vi:'Những cái đó', hanViet:'', zhDef:'', memoryTip:'', exZh:'那些书都送给你吧。', exVi:'Những cuốn sách này đều cho cậu.' },
          { zh:'这边', vi:'Bên này, phía này', hanViet:'', zhDef:'', memoryTip:'', exZh:'你坐这边吧。', exVi:'Bạn ngồi bên này đi.' },
          { zh:'那边', vi:'Bên đó', hanViet:'', zhDef:'', memoryTip:'', exZh:'你看到那边的猫了吗？', exVi:'Bạn có thấy con mèo bên đó không?' },
          { zh:'哪', vi:'Nào', hanViet:'', zhDef:'', memoryTip:'', exZh:'你喜欢哪本书？', exVi:'Bạn thích quyển sách nào?' },
          { zh:'哪里', vi:'Ở đâu', hanViet:'', zhDef:'', memoryTip:'', exZh:'你住在哪里？', exVi:'Bạn sống ở đâu?' },
          { zh:'哪儿', vi:'Đâu, chỗ nào (phương ngữ bắc kinh)', hanViet:'', zhDef:'', memoryTip:'', exZh:'那部电影是在哪儿拍的？', exVi:'Bộ phim đó được quay ở đâu vậy?' },
          { zh:'谁', vi:'Ai', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是谁的书？', exVi:'Đây là sách của ai?' },
          { zh:'什么', vi:'Gì, cái gì', hanViet:'', zhDef:'', memoryTip:'', exZh:'你想吃什么？', exVi:'Bạn muốn ăn gì?' },
          { zh:'怎么', vi:'Như thế nào', hanViet:'', zhDef:'', memoryTip:'', exZh:'你怎么来学校的？', exVi:'Bạn đến trường bằng cách nào?' },
          { zh:'哪些', vi:'Những cái nào, người nào', hanViet:'', zhDef:'', memoryTip:'', exZh:'你见过哪些名人？', exVi:'Bạn đã gặp những người nổi tiếng nào?' },
          { zh:'多少', vi:'Bao nhiêu; mấy; mấy mươi', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个多少钱？', exVi:'Cái này bao nhiêu tiền?' },
          { zh:'几', vi:'Mấy; bao nhiêu', hanViet:'', zhDef:'', memoryTip:'', exZh:'你有几个兄弟姐妹？', exVi:'Bạn có mấy anh chị em?' },
          { zh:'别的', vi:'Khác; cái khác', hanViet:'', zhDef:'', memoryTip:'', exZh:'我不要别的，只要那支钢笔。', exVi:'Tôi không cần cái nào khác, chỉ cần cây bút đó.' },
          { zh:'别人', vi:'Người khác; người ta', hanViet:'', zhDef:'', memoryTip:'', exZh:'这本书可能是别人的。', exVi:'Ngoại trừ Tiểu Lệ ra, những người khác đều không muốn đi.' },
          { zh:'有的', vi:'Một số, có cái thì…', hanViet:'', zhDef:'', memoryTip:'', exZh:'有的人喜欢喝咖啡,有的人喜欢喝茶。', exVi:'Có người thích uống cà phê, có người thích uống trà.' },
          { zh:'一些', vi:'Một số, một ít', hanViet:'', zhDef:'', memoryTip:'', exZh:'这里有一些苹果。', exVi:'Ở đây có một vài quả táo.' },
          { zh:'有（一）些', vi:'Một vài, một số', hanViet:'', zhDef:'', memoryTip:'', exZh:'这里有一些书。', exVi:'Ở đây có một vài cuốn sách.' },
        ]
      },
      {
        title: 'Unit 3: 👨‍👩‍👧 Gia đình & Quan hệ',
        words: [
          { zh:'妈妈', vi:'Mẹ, má', hanViet:'', zhDef:'', memoryTip:'', exZh:'我妈妈做饭很好吃。', exVi:'Mẹ tôi nấu ăn rất ngon.' },
          { zh:'爸爸', vi:'Bố; ba', hanViet:'', zhDef:'', memoryTip:'', exZh:'他是我的爸爸。', exVi:'Ông ấy là ba của tôi.' },
          { zh:'哥哥', vi:'Anh trai', hanViet:'', zhDef:'', memoryTip:'', exZh:'我的哥哥比我大五岁。', exVi:'Anh trai tôi lớn hơn tôi năm tuổi.' },
          { zh:'姐姐', vi:'Chị gái', hanViet:'', zhDef:'', memoryTip:'', exZh:'她是我的姐姐。', exVi:'Cô ấy là chị gái tôi.' },
          { zh:'弟弟', vi:'Em trai', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有一个弟弟。', exVi:'Tôi có một người em trai.' },
          { zh:'妹妹', vi:'Em gái', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有一个妹妹。', exVi:'Tôi có một người em gái.' },
          { zh:'儿子', vi:'Con trai', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有一个儿子。', exVi:'Tôi có một cậu con trai.' },
          { zh:'女儿', vi:'Con gái', hanViet:'', zhDef:'', memoryTip:'', exZh:'', exVi:'' },
          { zh:'孩子', vi:'Con; bọn trẻ; trẻ em', hanViet:'', zhDef:'', memoryTip:'', exZh:'孩子们在公园玩儿。', exVi:'Mấy đứa trẻ đang chơi trong công viên.' },
          { zh:'奶奶', vi:'Bà nội', hanViet:'', zhDef:'', memoryTip:'', exZh:'我奶奶今年八十岁。', exVi:'Bà nội tôi năm nay 80 tuổi.' },
          { zh:'爷爷', vi:'Ông nội', hanViet:'', zhDef:'', memoryTip:'', exZh:'我爷爷每天去公园散步。', exVi:'Mỗi ngày ông nội tôi đi dạo trong công viên.' },
          { zh:'家', vi:'Nhà', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家在上海。', exVi:'Nhà tôi ở Thượng Hải.' },
          { zh:'家人', vi:'Người nhà', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家人都喜欢吃中国菜。', exVi:'Cả nhà tôi đều thích ăn đồ ăn Trung Quốc.' },
          { zh:'家里', vi:'Trong nhà', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家里有很多书。', exVi:'Trong nhà tôi có rất nhiều sách.' },
          { zh:'朋友', vi:'Bạn bè', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有很多朋友。', exVi:'Tôi có rất nhiều bạn.' },
          { zh:'同学', vi:'Bạn học', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是我的同学。', exVi:'Đây là bạn học của tôi.' },
          { zh:'男人', vi:'Đàn ông', hanViet:'', zhDef:'', memoryTip:'', exZh:'那个男人在看手机。', exVi:'Người đàn ông đó đang xem điện thoại.' },
          { zh:'女人', vi:'Phụ nữ', hanViet:'', zhDef:'', memoryTip:'', exZh:'女人都喜欢买漂亮的衣服。', exVi:'Phụ nữ đều thích mua quần áo đẹp.' },
          { zh:'男孩儿', vi:'Bé trai', hanViet:'', zhDef:'', memoryTip:'', exZh:'男孩儿在公园里踢足球。', exVi:'Cậu bé đang đá bóng trong công viên.' },
          { zh:'女孩儿', vi:'Bé gái', hanViet:'', zhDef:'', memoryTip:'', exZh:'你家女孩儿几岁了？', exVi:'Con gái nhà bạn mấy tuổi rồi?' },
          { zh:'男朋友', vi:'Bạn trai', hanViet:'', zhDef:'', memoryTip:'', exZh:'她的男朋友很帅。', exVi:'Bạn trai của cô ấy rất đẹp trai.' },
          { zh:'女朋友', vi:'Bạn gái', hanViet:'', zhDef:'', memoryTip:'', exZh:'你有女朋友吗？', exVi:'Cậu có bạn gái chưa?' },
          { zh:'男生', vi:'Nam sinh, học sinh nam', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个班的男生比女生多。', exVi:'Nam sinh trong lớp này nhiều hơn nữ sinh.' },
          { zh:'女生', vi:'Nữ sinh', hanViet:'', zhDef:'', memoryTip:'', exZh:'这些女生喜欢画画。', exVi:'Những nữ sinh này thích vẽ.' },
          { zh:'老人', vi:'Người già', hanViet:'', zhDef:'', memoryTip:'', exZh:'老人喜欢在公园散步。', exVi:'Các cụ già thích đi dạo trong công viên.' },
          { zh:'先生', vi:'Ông, thầy, tiên sinh', hanViet:'', zhDef:'', memoryTip:'', exZh:'这位是李先生。', exVi:'Đây là ông Lý.' },
          { zh:'小姐', vi:'Tiểu thư, cô gái', hanViet:'', zhDef:'', memoryTip:'', exZh:'王小姐是我的同事。', exVi:'Cô Vương là đồng nghiệp của tôi.' },
          { zh:'小孩儿', vi:'Đứa trẻ', hanViet:'', zhDef:'', memoryTip:'', exZh:'小孩儿喜欢玩游戏。', exVi:'Trẻ con thích chơi trò chơi.' },
          { zh:'小朋友', vi:'Bạn nhỏ, trẻ em', hanViet:'', zhDef:'', memoryTip:'', exZh:'小朋友们都喜欢听故事。', exVi:'Các bạn nhỏ đều thích nghe kể chuyện.' },
          { zh:'名字', vi:'Tên gọi', hanViet:'', zhDef:'', memoryTip:'', exZh:'你的名字是什么？', exVi:'Tên của bạn là gì?' },
          { zh:'岁', vi:'Tuổi', hanViet:'', zhDef:'', memoryTip:'', exZh:'她今年二十岁了。', exVi:'Cô ấy năm nay 20 tuổi rồi.' },
          { zh:'人', vi:'Người', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个世界上有很多好人。', exVi:'Trên thế giới này có rất nhiều người tốt.' },
        ]
      },
      {
        title: 'Unit 4: 🔢 Con số & Lượng từ',
        words: [
          { zh:'一', vi:'Một', hanViet:'', zhDef:'', memoryTip:'', exZh:'我只有一个妹妹。', exVi:'Tôi chỉ có một em gái.' },
          { zh:'二', vi:'Số hai', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们班有二十人。', exVi:'Lớp chúng ta có 20 người.' },
          { zh:'三', vi:'Số ba', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有三个好朋友。', exVi:'Tôi có ba người bạn tốt.' },
          { zh:'四', vi:'Số bốn', hanViet:'', zhDef:'', memoryTip:'', exZh:'他家有四口人。', exVi:'Gia đình anh ấy có bốn người.' },
          { zh:'五', vi:'Số năm', hanViet:'', zhDef:'', memoryTip:'', exZh:'她今天买了五个苹果。', exVi:'Hôm nay cô ấy đã mua năm quả táo.' },
          { zh:'六', vi:'Số sáu', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家有六口人。', exVi:'Nhà tôi có sáu người.' },
          { zh:'七', vi:'Số bảy', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有七本书。', exVi:'Tôi có bảy quyển sách.' },
          { zh:'八', vi:'Số tám', hanViet:'', zhDef:'', memoryTip:'', exZh:'他买了八个苹果。', exVi:'Anh ấy đã mua tám quả táo.' },
          { zh:'九', vi:'Số chín', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个班有九个学生。', exVi:'Lớp này có chín học sinh.' },
          { zh:'十', vi:'Số mười', hanViet:'', zhDef:'', memoryTip:'', exZh:'他十岁就会游泳。', exVi:'Anh ấy mười tuổi đã biết bơi.' },
          { zh:'百', vi:'Một trăm; số 100', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有一百块钱。', exVi:'Tôi có một trăm tệ.' },
          { zh:'零', vi:'Số không', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个数字是零。', exVi:'Số này là số không.' },
          { zh:'两', vi:'Hai (chỉ số lượng)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有两个姐姐。', exVi:'Tôi có hai chị gái.' },
          { zh:'半', vi:'Một nửa /  / giữa; trung gian', hanViet:'', zhDef:'', memoryTip:'', exZh:'现在六点半。', exVi:'Bây giờ là 6 giờ rưỡi.' },
          { zh:'一半', vi:'Một nửa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们班一半是男生。', exVi:'Một nửa lớp chúng tôi là nam sinh.' },
          { zh:'次', vi:'Lần; lượt; đợt', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是我第一次来这里。', exVi:'Đây là lần đầu tiên tôi đến đây.' },
          { zh:'本', vi:'Cuốn; tập; vở', hanViet:'', zhDef:'', memoryTip:'', exZh:'你读过这本书了吗？', exVi:'Bạn đã đọc cuốn sách này chưa?' },
          { zh:'杯', vi:'Ly; cốc /  / cúp (giải thưởng)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喝了一杯奶茶。', exVi:'Tôi đã uống 1 ly trà sữa.' },
          { zh:'个', vi:'Cái này', hanViet:'', zhDef:'', memoryTip:'', exZh:'我买了一个新手机。', exVi:'Tôi đã mua một chiếc điện thoại mới.' },
          { zh:'块', vi:'Viên, thỏi, miếng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喜欢吃糖块儿。', exVi:'Tôi thích ăn kẹo viên.' },
          { zh:'页', vi:'Trang (sách, giấy)', hanViet:'', zhDef:'', memoryTip:'', exZh:'请翻到第五页。', exVi:'Vui lòng lật đến trang 5.' },
          { zh:'号', vi:'Số; số thứ tự', hanViet:'', zhDef:'', memoryTip:'', exZh:'你的房间号是多少？', exVi:'Số phòng của bạn là bao nhiêu?' },
        ]
      },
      {
        title: 'Unit 5: ⏰ Thời gian',
        words: [
          { zh:'月', vi:'Tháng /  /  mặt trăng', hanViet:'', zhDef:'', memoryTip:'', exZh:'今年的二月有二十九天。', exVi:'Tháng Hai năm nay có 29 ngày.' },
          { zh:'日', vi:'Ngày, mỗi ngày /  / mặt trời', hanViet:'', zhDef:'', memoryTip:'', exZh:'他的生日在六月。', exVi:'Ngày sinh nhật của anh ấy vào tháng sáu.' },
          { zh:'天', vi:'Ngày /  / trời, bầu trời', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天是星期天。', exVi:'Hôm nay là Chủ nhật.' },
          { zh:'星期', vi:'Tuần', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个星期很忙。', exVi:'Tuần này rất bận.' },
          { zh:'今天', vi:'Hôm nay', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天的天气很好。', exVi:'Thời tiết hôm nay rất đẹp.' },
          { zh:'昨天', vi:'Hôm qua', hanViet:'', zhDef:'', memoryTip:'', exZh:'昨天天气很好，我们去公园了。', exVi:'Hôm qua thời tiết rất đẹp, chúng tôi đã đi công viên.' },
          { zh:'明天', vi:'Ngày mai', hanViet:'', zhDef:'', memoryTip:'', exZh:'明天是星期几？', exVi:'Ngày mai là thứ mấy?' },
          { zh:'上午', vi:'Buổi sáng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我上午有一个会议。', exVi:'Tôi có một cuộc họp vào buổi sáng.' },
          { zh:'下午', vi:'Buổi chiều', hanViet:'', zhDef:'', memoryTip:'', exZh:'我下午三点有个会议。', exVi:'Tôi có một cuộc họp vào lúc 3 giờ chiều.' },
          { zh:'晚上', vi:'Buổi tối', hanViet:'', zhDef:'', memoryTip:'', exZh:'晚上我们一起去看电影吧。', exVi:'Buổi tối chúng ta cùng đi xem phim nhé.' },
          { zh:'早上', vi:'Buổi sáng', hanViet:'', zhDef:'', memoryTip:'', exZh:'早上空气很好。', exVi:'Không khí buổi sáng rất tốt.' },
          { zh:'中午', vi:'Buổi trưa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们中午去吃饭吧。', exVi:'Chúng ta đi ăn trưa nhé.' },
          { zh:'白天', vi:'Ban ngày', hanViet:'', zhDef:'', memoryTip:'', exZh:'早睡吧，你白天还要去上课。', exVi:'Ngủ sớm đi, bạn ban ngày còn phải đi học.' },
          { zh:'小时', vi:'Giờ (đơn vị thời gian)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我等了一个小时。', exVi:'Tôi đã đợi 1 tiếng.' },
          { zh:'时候', vi:'Thời gian, lúc', hanViet:'', zhDef:'', memoryTip:'', exZh:'你什么时候去北京？', exVi:'Khi nào bạn đi Bắc Kinh?' },
          { zh:'时间', vi:'Thời gian', hanViet:'', zhDef:'', memoryTip:'', exZh:'时间过得真快。', exVi:'Thời gian trôi qua thật nhanh.' },
          { zh:'现在', vi:'Bây giờ', hanViet:'', zhDef:'', memoryTip:'', exZh:'我现在就去做。', exVi:'Tôi đi làm bây giờ đây.' },
          { zh:'一会儿', vi:'Một lát, một chút', hanViet:'', zhDef:'', memoryTip:'', exZh:'请等我一会儿。', exVi:'Vui lòng đợi tôi một lát.' },
          { zh:'一下儿', vi:'Một chút, một lát', hanViet:'', zhDef:'', memoryTip:'', exZh:'你等我一下儿。', exVi:'Đợi tôi một chút.' },
          { zh:'半年', vi:'Nửa năm', hanViet:'', zhDef:'', memoryTip:'', exZh:'我来上海学习已经有半年了。', exVi:'Tôi đến Thượng Hải học đã được nửa năm.' },
          { zh:'半天', vi:'Nửa ngày /  / cả buổi; rất lâu', hanViet:'', zhDef:'', memoryTip:'', exZh:'我今天要工作半天。', exVi:'Tôi hôm nay phải đi làm nửa ngày.' },
          { zh:'早', vi:'Sớm', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天你起得很早。', exVi:'Hôm nay bạn dậy rất sớm.' },
          { zh:'晚', vi:'Muộn, trễ', hanViet:'', zhDef:'', memoryTip:'', exZh:'现在太晚了，快睡吧。', exVi:'Bây giờ quá muộn rồi, mau ngủ đi.' },
          { zh:'马上', vi:'Ngay lập tức', hanViet:'', zhDef:'', memoryTip:'', exZh:'我马上回来。', exVi:'Tôi sẽ quay lại ngay lập tức.' },
          { zh:'有时候', vi:'Đôi khi, có lúc', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有时候去图书馆学习。', exVi:'Đôi khi tôi đến thư viện học.' },
          { zh:'常', vi:'Thường; thường xuyên', hanViet:'', zhDef:'', memoryTip:'', exZh:'我常去跑步。', exVi:'Tôi thường xuyên chạy bộ.' },
          { zh:'去年', vi:'Năm ngoái', hanViet:'', zhDef:'', memoryTip:'', exZh:'去年我买了一辆新车。', exVi:'Năm ngoái tôi đã mua một chiếc xe mới.' },
          { zh:'明年', vi:'Năm sau', hanViet:'', zhDef:'', memoryTip:'', exZh:'明年我想去中国。', exVi:'Năm sau tôi muốn đi Trung Quốc.' },
          { zh:'今年', vi:'Năm nay', hanViet:'', zhDef:'', memoryTip:'', exZh:'今年是2025年。', exVi:'Năm nay là năm 2025.' },
          { zh:'后天', vi:'Ngày hôm sau', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们后天去北京。', exVi:'Chúng tôi sẽ đi Bắc Kinh vào ngày kia.' },
          { zh:'前天', vi:'Hôm kia', hanViet:'', zhDef:'', memoryTip:'', exZh:'我前天去了上海。', exVi:'Hôm kia tôi đã đi Thượng Hải.' },
          { zh:'新年', vi:'Năm mới', hanViet:'', zhDef:'', memoryTip:'', exZh:'新年快乐！', exVi:'Năm mới vui vẻ!' },
          { zh:'星期日', vi:'Chủ nhật', hanViet:'', zhDef:'', memoryTip:'', exZh:'星期日我们去公园吧。', exVi:'Chủ nhật chúng ta đi công viên nhé.' },
          { zh:'星期天', vi:'Chủ nhật', hanViet:'', zhDef:'', memoryTip:'', exZh:'星期天我喜欢睡懒觉。', exVi:'Chủ nhật tôi thích ngủ nướng.' },
          { zh:'上次', vi:'Lần trước', hanViet:'', zhDef:'', memoryTip:'', exZh:'上次我们去上海了。', exVi:'Lần trước chúng tôi đã đi Thượng Hải.' },
          { zh:'下次', vi:'Lần sau', hanViet:'', zhDef:'', memoryTip:'', exZh:'下次我们一起去看电影吧。', exVi:'Lần sau chúng ta cùng đi xem phim nhé.' },
          { zh:'日期', vi:'Ngày tháng, thời gian', hanViet:'', zhDef:'', memoryTip:'', exZh:'文件的日期写错了。', exVi:'Ngày tháng trên tài liệu bị sai rồi.' },
        ]
      },
      {
        title: 'Unit 6: 📍 Địa điểm & Hướng đi',
        words: [
          { zh:'北京', vi:'Bắc kinh', hanViet:'', zhDef:'', memoryTip:'', exZh:'北京是中国的首都。', exVi:'Bắc Kinh là thủ đô của Trung Quốc.' },
          { zh:'中国', vi:'Trung quốc', hanViet:'', zhDef:'', memoryTip:'', exZh:'中国是一个美丽的国家。', exVi:'Trung Quốc là một đất nước xinh đẹp.' },
          { zh:'东', vi:'Đông; hướng đông', hanViet:'', zhDef:'', memoryTip:'', exZh:'学校在东边。', exVi:'Trường học ở phía Đông.' },
          { zh:'西', vi:'Phía tây', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家在学校西边。', exVi:'Nhà tôi ở phía tây của trường.' },
          { zh:'南', vi:'Phía nam', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喜欢南方的美食。', exVi:'Tôi thích ẩm thực miền Nam.' },
          { zh:'北', vi:'Bắc, phía bắc', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们一直往北走吧。', exVi:'Chúng ta cứ đi về phía bắc đi.' },
          { zh:'东边', vi:'Phía đông, hướng đông', hanViet:'', zhDef:'', memoryTip:'', exZh:'', exVi:'' },
          { zh:'南边', vi:'Phía nam', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家在学校南边。', exVi:'Nhà tôi ở phía nam của trường.' },
          { zh:'北边', vi:'Phía bắc', hanViet:'', zhDef:'', memoryTip:'', exZh:'北边的天气很冷。', exVi:'Thời tiết của phương bắc rất lạnh.' },
          { zh:'左', vi:'Bên trái', hanViet:'', zhDef:'', memoryTip:'', exZh:'请往左走，那边有商店。', exVi:'Hãy đi về bên trái, bên đó có cửa hàng.' },
          { zh:'右', vi:'Bên phải', hanViet:'', zhDef:'', memoryTip:'', exZh:'商店在银行的右边。', exVi:'Cửa hàng ở bên phải ngân hàng.' },
          { zh:'左边', vi:'Phía bên trái', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家在学校左边。', exVi:'Nhà tôi ở bên trái trường học.' },
          { zh:'右边', vi:'Phía bên phải', hanViet:'', zhDef:'', memoryTip:'', exZh:'', exVi:'' },
          { zh:'地方', vi:'Bản xứ, bản địa', hanViet:'', zhDef:'', memoryTip:'', exZh:'他是这个地方的人。', exVi:'Anh ấy là người bản địa.' },
          { zh:'地点', vi:'Địa điểm; nơi chốn', hanViet:'', zhDef:'', memoryTip:'', exZh:'会议的地点已经确定了。', exVi:'Địa điểm cuộc họp đã được xác định.' },
          { zh:'地上', vi:'Mặt đất; dưới đất', hanViet:'', zhDef:'', memoryTip:'', exZh:'地上有很多树叶。', exVi:'Dưới đất có rất nhiều lá cây.' },
          { zh:'地图', vi:'Bản đồ', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是世界地图。', exVi:'Đây là bản đồ thế giới.' },
          { zh:'国家', vi:'Quốc gia', hanViet:'', zhDef:'', memoryTip:'', exZh:'我爱我的国家。', exVi:'Tôi yêu đất nước của tôi.' },
          { zh:'中间', vi:'Ở giữa, trung gian', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家在学校和公司中间。', exVi:'Nhà tôi nằm giữa trường học và công ty.' },
          { zh:'旁边', vi:'Cạnh, bên cạnh', hanViet:'', zhDef:'', memoryTip:'', exZh:'厨房在客厅的旁边。', exVi:'Nhà bếp ở bên cạnh phòng khách.' },
          { zh:'里', vi:'Trong, bên trong', hanViet:'', zhDef:'', memoryTip:'', exZh:'房间里有很多书。', exVi:'Trong phòng có rất nhiều sách.' },
          { zh:'外', vi:'Bên ngoài', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们去外面吃饭吧。', exVi:'Chúng ta ra ngoài ăn đi.' },
          { zh:'上', vi:'Trên, lên', hanViet:'', zhDef:'', memoryTip:'', exZh:'书在桌子上。', exVi:'Quyển sách ở trên bàn.' },
          { zh:'下', vi:'Dưới, phía dưới, bên dưới', hanViet:'', zhDef:'', memoryTip:'', exZh:'上有父母，下有儿女。', exVi:'Trên có cha mẹ, dưới có con cái.' },
          { zh:'前', vi:'Trước', hanViet:'', zhDef:'', memoryTip:'', exZh:'他12号前会回来。', exVi:'Anh ấy sẽ trở lại trước ngày 12.' },
          { zh:'后', vi:'Sau; phía sau', hanViet:'', zhDef:'', memoryTip:'', exZh:'书店在学校的后边。', exVi:'Hiệu sách ở phía sau trường học.' },
          { zh:'中', vi:'Ở giữa, trung tâm', hanViet:'', zhDef:'', memoryTip:'', exZh:'她站在房间中间。', exVi:'Cô ấy đứng ở giữa phòng.' },
          { zh:'间', vi:'Giữa, ở giữa', hanViet:'', zhDef:'', memoryTip:'', exZh:'他们之间的感情很好。', exVi:'Tình cảm giữa họ rất tốt.' },
          { zh:'里边', vi:'Bên trong', hanViet:'', zhDef:'', memoryTip:'', exZh:'你在里边等我。', exVi:'Bạn đợi tôi ở bên trong nhé.' },
          { zh:'外边', vi:'Bên ngoài', hanViet:'', zhDef:'', memoryTip:'', exZh:'外边有很多漂亮的花。', exVi:'Bên ngoài có rất nhiều hoa đẹp.' },
          { zh:'上边', vi:'Phía trên', hanViet:'', zhDef:'', memoryTip:'', exZh:'笔在书的上边。', exVi:'Cây bút ở phía trên quyển sách.' },
          { zh:'下边', vi:'Bên dưới', hanViet:'', zhDef:'', memoryTip:'', exZh:'桌子下边有一只猫。', exVi:'Dưới bàn có một con mèo.' },
          { zh:'前边', vi:'Phía trước', hanViet:'', zhDef:'', memoryTip:'', exZh:'学校就在前边。', exVi:'Trường học ở ngay phía trước.' },
          { zh:'楼', vi:'Tòa nhà, lầu', hanViet:'', zhDef:'', memoryTip:'', exZh:'他们住在五楼。', exVi:'Họ sống ở tầng năm.' },
          { zh:'楼上', vi:'Tầng trên', hanViet:'', zhDef:'', memoryTip:'', exZh:'我哥哥在楼上睡觉。', exVi:'Anh trai tôi đang ngủ trên tầng.' },
          { zh:'楼下', vi:'Tầng dưới', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在楼下等你。', exVi:'Tôi đang đợi bạn ở tầng dưới.' },
          { zh:'路上', vi:'Trên đường', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在路上，看见了你。', exVi:'Tôi trên đường, nhìn thấy bạn.' },
          { zh:'路口', vi:'Giao lộ, ngã tư', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个路口有很多车。', exVi:'Ngã tư này có rất nhiều xe.' },
          { zh:'马路', vi:'Đường cái, đường lớn', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个马路很长。', exVi:'Con đường này rất dài.' },
          { zh:'门口', vi:'Cổng, cửa ra vào', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在门口等你。', exVi:'Tôi đang đợi bạn ở cửa ra vào.' },
          { zh:'国外', vi:'Nước ngoài', hanViet:'', zhDef:'', memoryTip:'', exZh:'他在国外上大学。', exVi:'Anh ấy học đại học ở nước ngoài.' },
          { zh:'外国', vi:'Nước ngoài', hanViet:'', zhDef:'', memoryTip:'', exZh:'他是外国人。', exVi:'Anh ấy là người nước ngoài.' },
        ]
      },
      {
        title: 'Unit 7: 🚗 Giao thông & Di chuyển',
        words: [
          { zh:'车', vi:'Xe', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们开车去旅行。', exVi:'Chúng tôi lái xe đi du lịch.' },
          { zh:'车票', vi:'Vé xe', hanViet:'', zhDef:'', memoryTip:'', exZh:'快过年了，你买火车票了吗？', exVi:'Tết sắp đến rồi, bạn đã mua vé tàu về nhà chưa?' },
          { zh:'车站', vi:'Trạm xe', hanViet:'', zhDef:'', memoryTip:'', exZh:'车站离这里不远。', exVi:'Trạm xe cách đây không xa.' },
          { zh:'机场', vi:'Sân bay', hanViet:'', zhDef:'', memoryTip:'', exZh:'他去机场接朋友。', exVi:'Anh ấy đến sân bay đón bạn.' },
          { zh:'路', vi:'Con đường, đường phố', hanViet:'', zhDef:'', memoryTip:'', exZh:'这条路很长。', exVi:'Con đường này rất dài.' },
          { zh:'打车', vi:'Bắt xe; gọi xe (taxi)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们打车去机场。', exVi:'Chúng ta bắt xe đến sân bay.' },
          { zh:'开车', vi:'Lái xe', hanViet:'', zhDef:'', memoryTip:'', exZh:'', exVi:'' },
          { zh:'出来', vi:'Ra; ra đây', hanViet:'', zhDef:'', memoryTip:'', exZh:'你出来，我跟你说句话。', exVi:'Anh ra đây tôi nói chuyện với anh.' },
          { zh:'出去', vi:'Ra; ra ngoài', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们一起出去玩儿吧。', exVi:'Chúng ta cùng nhau đi chơi đi.' },
          { zh:'回来', vi:'Trở lại', hanViet:'', zhDef:'', memoryTip:'', exZh:'他晚上七点回来。', exVi:'Anh ấy sẽ quay lại lúc 7 giờ tối.' },
          { zh:'回去', vi:'Về; trở lại; đi về', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们早点回去吧。', exVi:'Chúng ta về sớm một chút đi.' },
          { zh:'进来', vi:'Đi vào (hướng về người nói)', hanViet:'', zhDef:'', memoryTip:'', exZh:'他刚刚进来了。', exVi:'Anh ấy vừa mới vào.' },
          { zh:'进去', vi:'Đi vào (hướng xa người nói)', hanViet:'', zhDef:'', memoryTip:'', exZh:'你先进去，我马上来。', exVi:'Bạn vào trước đi, tôi đến ngay.' },
          { zh:'车上', vi:'Trên xe', hanViet:'', zhDef:'', memoryTip:'', exZh:'她在车上学英语。', exVi:'Cô ấy học tiếng Anh trên xe.' },
          { zh:'走路', vi:'Đi bộ', hanViet:'', zhDef:'', memoryTip:'', exZh:'他每天早上都走路去学校。', exVi:'Mỗi sáng anh ấy đều đi bộ đến trường.' },
          { zh:'出', vi:'Đi; xuất phát', hanViet:'', zhDef:'', memoryTip:'', exZh:'他出去买东西了。', exVi:'Anh ấy ra ngoài mua đồ ăn rồi.' },
          { zh:'飞机', vi:'Máy bay', hanViet:'', zhDef:'', memoryTip:'', exZh:'我第一次坐飞机时特别开心。', exVi:'Lần đầu tiên tôi đi máy bay, tôi rất vui mừng.' },
          { zh:'汽车', vi:'Xe hơi, ô tô', hanViet:'', zhDef:'', memoryTip:'', exZh:'这辆汽车是我爸爸的。', exVi:'Hai chiếc ô tô này là của bố tôi.' },
          { zh:'火车', vi:'Tàu hỏa; xe lửa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我坐火车去北京。', exVi:'Tôi đi Bắc Kinh bằng tàu hỏa.' },
          { zh:'机票', vi:'Vé máy bay', hanViet:'', zhDef:'', memoryTip:'', exZh:'你买机票了吗？', exVi:'Bạn đã mua vé máy bay chưa?' },
          { zh:'来', vi:'Đến, tới', hanViet:'', zhDef:'', memoryTip:'', exZh:'你什么时候来我家?', exVi:'Khi nào bạn đến nhà tôi?' },
          { zh:'来到', vi:'Đến, đi đến', hanViet:'', zhDef:'', memoryTip:'', exZh:'他来到公司了。', exVi:'Anh ấy đến công ty rồi.' },
          { zh:'去', vi:'Đi, rời đi, rời khỏi', hanViet:'', zhDef:'', memoryTip:'', exZh:'他吃完饭就去了。', exVi:'Anh ấy ăn xong rồi đi ngay.' },
          { zh:'回', vi:'Quay lại; quay về', hanViet:'', zhDef:'', memoryTip:'', exZh:'我每天六点回家。', exVi:'Tôi về nhà lúc 6 giờ mỗi ngày.' },
          { zh:'回到', vi:'Về đến; trở về', hanViet:'', zhDef:'', memoryTip:'', exZh:'他回到家了。', exVi:'Anh ấy đã về đến nhà rồi.' },
          { zh:'回家', vi:'Về nhà; đến nhà', hanViet:'', zhDef:'', memoryTip:'', exZh:'朋友们都回家了。', exVi:'Các bạn tôi đều đã về nhà rồi.' },
          { zh:'进', vi:'Vào, tiến vào, đi vào', hanViet:'', zhDef:'', memoryTip:'', exZh:'请进！', exVi:'Xin mời vào!' },
          { zh:'走', vi:'Đi, rời đi', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们一起走吧，太晚了。', exVi:'Chúng ta cùng đi thôi, trễ quá rồi.' },
          { zh:'跑', vi:'Chạy', hanViet:'', zhDef:'', memoryTip:'', exZh:'他每天早上都跑步。', exVi:'Anh ấy chạy bộ mỗi sáng.' },
          { zh:'飞', vi:'Bay', hanViet:'', zhDef:'', memoryTip:'', exZh:'小鸟在天上飞得很快。', exVi:'Con chim nhỏ bay rất nhanh trên trời.' },
          { zh:'上车', vi:'Lên xe', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们快上车吧。', exVi:'Chúng ta mau lên xe đi.' },
          { zh:'下车', vi:'Xuống xe', hanViet:'', zhDef:'', memoryTip:'', exZh:'我要在这一站下车。', exVi:'Tôi muốn xuống xe ở trạm này.' },
          { zh:'起', vi:'Dậy, thức dậy, đứng dậy', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天睡到上午10点才起。', exVi:'Nay ngủ đến 10 giờ mới dậy.' },
          { zh:'起来', vi:'Đứng dậy, ngồi dậy, thức dậy', hanViet:'', zhDef:'', memoryTip:'', exZh:'他站起来了。', exVi:'Anh ấy đứng dậy rồi.' },
        ]
      },
      {
        title: 'Unit 8: 🏠 Nhà cửa & Đồ vật',
        words: [
          { zh:'房子', vi:'Căn nhà; nhà', hanViet:'', zhDef:'', memoryTip:'', exZh:'他们买了一套新房子。', exVi:'Họ đã mua một căn nhà mới.' },
          { zh:'房间', vi:'Căn phòng', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是我的房间。', exVi:'Đây là phòng của tôi.' },
          { zh:'门', vi:'Cửa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我把门关上了。', exVi:'Tôi đã đóng cửa lại.' },
          { zh:'桌子', vi:'Cái bàn', hanViet:'', zhDef:'', memoryTip:'', exZh:'书在桌子上，你看见了吗？', exVi:'Quyển sách ở trên bàn, bạn thấy chưa?' },
          { zh:'床', vi:'Giường', hanViet:'', zhDef:'', memoryTip:'', exZh:'我很累，想躺在床上。', exVi:'Tôi rất mệt, muốn nằm trên giường.' },
          { zh:'电视', vi:'Tivi', hanViet:'', zhDef:'', memoryTip:'', exZh:'爸爸在看电视。', exVi:'Bố đang xem tivi.' },
          { zh:'电脑', vi:'Máy tính', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个电脑非常贵。', exVi:'Máy tính này rất đắt.' },
          { zh:'手机', vi:'Điện thoại di động', hanViet:'', zhDef:'', memoryTip:'', exZh:'我的手机在那里。', exVi:'Điện thoại của tôi ở đằng kia.' },
          { zh:'电话', vi:'Điện thoại', hanViet:'', zhDef:'', memoryTip:'', exZh:'他正在打电话。', exVi:'Anh ấy đang gọi điện thoại.' },
          { zh:'书', vi:'Sách', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喜欢看书。', exVi:'Tôi thích đọc sách.' },
          { zh:'书包', vi:'Cặp sách', hanViet:'', zhDef:'', memoryTip:'', exZh:'我的书包里有苹果。', exVi:'Trong cặp sách của tôi có một quả táo.' },
          { zh:'本子', vi:'Cuốn; tập; vở /  / giấy phép; chứng chỉ', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个歌剧的本子挺有意思的。', exVi:'Bản nhạc kịch này thật thú vị.' },
          { zh:'杯子', vi:'Ly; cốc; tách', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个杯子太小了。', exVi:'Cái ly này quá nhỏ.' },
          { zh:'包', vi:'Bao; gói; bọc; quấn', hanViet:'', zhDef:'', memoryTip:'', exZh:'妈妈在包饺子。', exVi:'Mẹ đang gói sủi cảo.' },
          { zh:'衣服', vi:'Quần áo', hanViet:'', zhDef:'', memoryTip:'', exZh:'这件衣服很漂亮。', exVi:'Bộ quần áo này rất đẹp.' },
          { zh:'东西', vi:'Đồ; vật; đồ ăn; đồ đạc', hanViet:'', zhDef:'', memoryTip:'', exZh:'吃东西的时候不要说话。', exVi:'Không nên nói chuyện khi đang ăn.' },
          { zh:'子（桌子）', vi:'Hậu tố dùng trong danh từ', hanViet:'', zhDef:'', memoryTip:'', exZh:'你的桌子很大，很好看。', exVi:'Cái bàn của bạn rất lớn, rất đẹp.' },
          { zh:'洗手间', vi:'Nhà vệ sinh', hanViet:'', zhDef:'', memoryTip:'', exZh:'请问，洗手间在哪里？', exVi:'Xin hỏi, nhà vệ sinh ở đâu?' },
          { zh:'教学楼', vi:'Tòa nhà giảng đường', hanViet:'', zhDef:'', memoryTip:'', exZh:'教学楼在图书馆东边。', exVi:'Tòa nhà giảng dạy nằm ở phía đông của thư viện.' },
        ]
      },
      {
        title: 'Unit 9: 🍜 Thức ăn & Đồ uống',
        words: [
          { zh:'吃', vi:'Ăn', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喜欢吃苹果。', exVi:'Tôi thích ăn táo.' },
          { zh:'喝', vi:'Uống', hanViet:'', zhDef:'', memoryTip:'', exZh:'我每天早上都喝咖啡。', exVi:'Mỗi sáng tôi đều uống cà phê.' },
          { zh:'饭', vi:'Cơm; bữa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我还没吃晚饭呢。', exVi:'Tôi vẫn chưa ăn cơm tối.' },
          { zh:'米饭', vi:'Cơm', hanViet:'', zhDef:'', memoryTip:'', exZh:'我每天都吃米饭。', exVi:'Ngày nào tôi cũng ăn cơm.' },
          { zh:'包子', vi:'Bánh bao', hanViet:'', zhDef:'', memoryTip:'', exZh:'我今天早上吃了两个包子。', exVi:'Sáng nay tôi đã ăn 2 cái bánh bao.' },
          { zh:'菜', vi:'Món ăn; đồ ăn', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天的菜很好吃。', exVi:'Món ăn của hôm nay rất ngon.' },
          { zh:'水果', vi:'Trái cây', hanViet:'', zhDef:'', memoryTip:'', exZh:'我每天都吃水果。', exVi:'Tôi ăn trái cây mỗi ngày.' },
          { zh:'肉', vi:'Thịt', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喜欢吃鸡肉。', exVi:'Tôi thích ăn thịt gà.' },
          { zh:'茶', vi:'Trà (đồ uống)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喜欢喝茶。', exVi:'Tôi thích uống trà.' },
          { zh:'水', vi:'Nước', hanViet:'', zhDef:'', memoryTip:'', exZh:'我想喝水。', exVi:'Tôi muốn uống nước.' },
          { zh:'牛奶', vi:'Sữa bò', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喜欢喝牛奶。', exVi:'Tôi thích uống sữa.' },
          { zh:'早饭', vi:'Bữa sáng', hanViet:'', zhDef:'', memoryTip:'', exZh:'你今天吃早饭了吗？', exVi:'Hôm nay bạn đã ăn sáng chưa?' },
          { zh:'午饭', vi:'Bữa trưa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们一起去吃午饭吧。', exVi:'Chúng ta cùng đi ăn trưa nhé.' },
          { zh:'晚饭', vi:'Bữa tối', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们一起吃晚饭吧。', exVi:'Chúng ta cùng đi ăn tối nhé.' },
          { zh:'好吃', vi:'Ngon; ngon miệng', hanViet:'', zhDef:'', memoryTip:'', exZh:'这家餐厅的菜非常好吃。', exVi:'Món ăn của nhà hàng này rất ngon.' },
          { zh:'吃饭', vi:'Ăn cơm', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们一起去吃饭吧。', exVi:'Chúng ta cùng nhau đi ăn cơm nhé.' },
          { zh:'尝尝', vi:'Nếm; thử (ăn, uống)', hanViet:'', zhDef:'', memoryTip:'', exZh:'你尝尝这个菜。', exVi:'Bạn hãy nếm thử món ăn này.' },
          { zh:'饿', vi:'Đói; bị đói', hanViet:'', zhDef:'', memoryTip:'', exZh:'我现在很饿。', exVi:'Bây giờ tôi rất đói.' },
          { zh:'渴', vi:'Khát', hanViet:'', zhDef:'', memoryTip:'', exZh:'我口渴了，想喝水。', exVi:'Tôi khát nước rồi, muốn uống nước.' },
          { zh:'面包', vi:'Bánh mì', hanViet:'', zhDef:'', memoryTip:'', exZh:'你想吃面包吗？', exVi:'Bạn có muốn ăn bánh mì không?' },
          { zh:'面条儿', vi:'Mì sợi', hanViet:'', zhDef:'', memoryTip:'', exZh:'这碗面条儿很好吃。', exVi:'Tô mì này rất ngon.' },
          { zh:'鸡蛋', vi:'Trứng gà', hanViet:'', zhDef:'', memoryTip:'', exZh:'我买了一些鸡蛋。', exVi:'Tôi đã mua một vài quả trứng.' },
        ]
      },
      {
        title: 'Unit 10: 🛍️ Mua sắm & Tiền bạc',
        words: [
          { zh:'买', vi:'Mua', hanViet:'', zhDef:'', memoryTip:'', exZh:'我想买一件衣服。', exVi:'Tôi muốn mua một cái áo.' },
          { zh:'钱', vi:'Tiền', hanViet:'', zhDef:'', memoryTip:'', exZh:'我没钱。', exVi:'Tôi không có tiền.' },
          { zh:'贵', vi:'Đắt; mắc', hanViet:'', zhDef:'', memoryTip:'', exZh:'这件衣服太贵了。', exVi:'Bộ quần áo này quá đắt!' },
          { zh:'元', vi:'Đồng (đơn vị tiền tệ)', hanViet:'', zhDef:'', memoryTip:'', exZh:'这本书五十元。', exVi:'Cuốn sách này giá 50 tệ.' },
          { zh:'分', vi:'Điểm số', hanViet:'', zhDef:'', memoryTip:'', exZh:'这次考试我考了100分。', exVi:'Kỳ thi lần này tôi thi được 100 điểm.' },
          { zh:'商店', vi:'Cửa hàng', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个商店很大。', exVi:'Cửa hàng này rất lớn.' },
          { zh:'钱包', vi:'Ví tiền, bóp tiền', hanViet:'', zhDef:'', memoryTip:'', exZh:'我的钱包不见了。', exVi:'Ví tiền của tôi bị mất rồi.' },
          { zh:'商场', vi:'Trung tâm thương mại', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们去商场买衣服吧。', exVi:'Chúng ta đi trung tâm thương mại mua quần áo đi.' },
          { zh:'饭店', vi:'Quán cơm; nhà hàng', hanViet:'', zhDef:'', memoryTip:'', exZh:'这家饭店的菜很好吃。', exVi:'Đồ ăn của nhà hàng này rất ngon.' },
        ]
      },
      {
        title: 'Unit 11: 📚 Học tập & Trường học',
        words: [
          { zh:'学', vi:'Học', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在学汉语。', exVi:'Tôi đang học tiếng Trung.' },
          { zh:'学习', vi:'Học tập', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们应该认真学习。', exVi:'Chúng ta nên học tập chăm chỉ.' },
          { zh:'学校', vi:'Trường học', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们学校很大。', exVi:'Trường của chúng tôi rất lớn.' },
          { zh:'中学', vi:'Trường trung học', hanViet:'', zhDef:'', memoryTip:'', exZh:'他是我中学同学。', exVi:'Anh ấy là bạn học của tôi ở trường trung học.' },
          { zh:'大学', vi:'Đại học', hanViet:'', zhDef:'', memoryTip:'', exZh:'他在北京大学学习。', exVi:'Anh ấy học ở Đại học Bắc Kinh.' },
          { zh:'小学', vi:'Trường tiểu học', hanViet:'', zhDef:'', memoryTip:'', exZh:'我弟弟上小学二年级。', exVi:'Em trai tôi học lớp 2 tiểu học.' },
          { zh:'读', vi:'Đọc; xem', hanViet:'', zhDef:'', memoryTip:'', exZh:'我正在读书。', exVi:'Tôi đang đọc sách.' },
          { zh:'读书', vi:'Học bài', hanViet:'', zhDef:'', memoryTip:'', exZh:'他很努力读书。', exVi:'Anh ấy rất chăm chỉ học bài.' },
          { zh:'写', vi:'Viết', hanViet:'', zhDef:'', memoryTip:'', exZh:'请写下你的名字。', exVi:'Vui lòng viết tên của bạn xuống.' },
          { zh:'考试', vi:'Kỳ thi, bài kiểm tra', hanViet:'', zhDef:'', memoryTip:'', exZh:'', exVi:'' },
          { zh:'班', vi:'Lớp học', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们班有四十五个学生。', exVi:'Lớp của chúng tôi có 45 học sinh.' },
          { zh:'课', vi:'Tiết học, bài học', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天的汉语课很有意思。', exVi:'Bài học tiếng Trung hôm nay rất thú vị.' },
          { zh:'上课', vi:'Lên lớp, đi học', hanViet:'', zhDef:'', memoryTip:'', exZh:'现在是上课时间。', exVi:'Bây giờ là thời gian lên lớp.' },
          { zh:'下课', vi:'Tan học', hanViet:'', zhDef:'', memoryTip:'', exZh:'下课后，我们去喝奶茶吧。', exVi:'Tan học xong, chúng ta đi uống trà sữa nhé.' },
          { zh:'图书馆', vi:'Thư viện', hanViet:'', zhDef:'', memoryTip:'', exZh:'学校里有三个图书馆。', exVi:'Trường có ba thư viện.' },
          { zh:'中文', vi:'Tiếng trung quốc', hanViet:'', zhDef:'', memoryTip:'', exZh:'你的中文很好。', exVi:'Tiếng Trung của bạn rất tốt' },
          { zh:'汉语', vi:'Tiếng hán; hán ngữ', hanViet:'', zhDef:'', memoryTip:'', exZh:'他的汉语说得很好。', exVi:'Anh ấy nói tiếng Trung rất giỏi.' },
          { zh:'知识', vi:'Kiến thức', hanViet:'', zhDef:'', memoryTip:'', exZh:'学习知识很重要。', exVi:'Việc học rất quan trọng.' },
          { zh:'中学生', vi:'Học sinh trung học', hanViet:'', zhDef:'', memoryTip:'', exZh:'他是一个中学生。', exVi:'Cậu ấy là một học sinh trung học.' },
          { zh:'汉字', vi:'Chữ hán', hanViet:'', zhDef:'', memoryTip:'', exZh:'我会写汉字。', exVi:'Tôi biết viết chữ Hán.' },
          { zh:'教', vi:'Dạy, chỉ dạy', hanViet:'', zhDef:'', memoryTip:'', exZh:'她教我们英语。', exVi:'Cô ấy dạy chúng tôi tiếng Anh.' },
          { zh:'考', vi:'Thi, kiểm tra', hanViet:'', zhDef:'', memoryTip:'', exZh:'这次考试很难。', exVi:'Kỳ thi lần này rất khó.' },
          { zh:'年级', vi:'Niên khóa, cấp lớp', hanViet:'', zhDef:'', memoryTip:'', exZh:'你是几年级的学生？', exVi:'Bạn là học sinh lớp mấy?' },
          { zh:'学院', vi:'Học viện', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个学院很大很漂亮。', exVi:'Học viện này rất lớn và đẹp.' },
          { zh:'课文', vi:'Bài khóa (trong sách)', hanViet:'', zhDef:'', memoryTip:'', exZh:'请大家朗读课文。', exVi:'Mọi người vui lòng đọc to bài khóa.' },
          { zh:'明白', vi:'Hiểu rõ', hanViet:'', zhDef:'', memoryTip:'', exZh:'我明白你的意思。', exVi:'Tôi hiểu ý của bạn.' },
          { zh:'记', vi:'Nhớ', hanViet:'', zhDef:'', memoryTip:'', exZh:'我记不住这个汉字。', exVi:'Tôi không nhớ được chữ Hán này.' },
          { zh:'记得', vi:'Ghi nhớ', hanViet:'', zhDef:'', memoryTip:'', exZh:'你还记得他的生日吗？', exVi:'Bạn còn nhớ sinh nhật của anh ấy không?' },
          { zh:'记住', vi:'Nhớ; ghi nhớ', hanViet:'', zhDef:'', memoryTip:'', exZh:'请记住这个电话号码。', exVi:'Hãy nhớ số điện thoại này.' },
          { zh:'放学', vi:'Tan học', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们下午四点半放学。', exVi:'Chúng tôi tan học lúc 4 giờ 30 chiều.' },
          { zh:'上学', vi:'Đi học', hanViet:'', zhDef:'', memoryTip:'', exZh:'孩子们七点上学。', exVi:'Bọn trẻ đi học lúc 7 giờ.' },
          { zh:'放假', vi:'Nghỉ, nghỉ lễ', hanViet:'', zhDef:'', memoryTip:'', exZh:'放假了，我们一起去玩吧。', exVi:'Nghỉ lễ rồi, chúng ta cùng đi chơi nhé.' },
          { zh:'听写', vi:'Nghe viết (chính tả)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们今天有听写考试。', exVi:'Hôm nay chúng tôi có bài kiểm tra chính tả.' },
          { zh:'书店', vi:'Hiệu sách', hanViet:'', zhDef:'', memoryTip:'', exZh:'我喜欢去书店。', exVi:'Tôi thích đi nhà sách.' },
          { zh:'介绍', vi:'Giới thiệu', hanViet:'', zhDef:'', memoryTip:'', exZh:'我来介绍一下我的朋友。', exVi:'Tôi giới thiệu chút về bạn của tôi.' },
        ]
      },
      {
        title: 'Unit 12: 💼 Công việc & Nghề nghiệp',
        words: [
          { zh:'工作', vi:'Công việc', hanViet:'', zhDef:'', memoryTip:'', exZh:'他的工作非常忙。', exVi:'Công việc của anh ấy rất bận.' },
          { zh:'上班', vi:'Đi làm', hanViet:'', zhDef:'', memoryTip:'', exZh:'他每天八点上班。', exVi:'Mỗi ngày anh ấy đi làm lúc 8 giờ.' },
          { zh:'下班', vi:'Tan làm', hanViet:'', zhDef:'', memoryTip:'', exZh:'我今晚八点下班。', exVi:'Tối nay tôi tan làm lúc 8 giờ.' },
          { zh:'医生', vi:'Bác sĩ', hanViet:'', zhDef:'', memoryTip:'', exZh:'我爸爸是一名医生。', exVi:'Bố tôi là một bác sĩ.' },
          { zh:'工人', vi:'Công nhân', hanViet:'', zhDef:'', memoryTip:'', exZh:'工人们每天都努力工作。', exVi:'Những công nhân làm việc chăm chỉ mỗi ngày.' },
          { zh:'开会', vi:'Họp, tổ chức cuộc họp', hanViet:'', zhDef:'', memoryTip:'', exZh:'我下午三点要开会。', exVi:'Tôi có cuộc họp lúc 3 giờ chiều.' },
          { zh:'请假', vi:'Xin nghỉ phép', hanViet:'', zhDef:'', memoryTip:'', exZh:'老师，今天我想请假。', exVi:'Thầy ơi, hôm nay em muốn xin nghỉ.' },
          { zh:'认真', vi:'Chăm chỉ, nghiêm túc', hanViet:'', zhDef:'', memoryTip:'', exZh:'他学习很认真。', exVi:'Anh ấy học rất chăm chỉ.' },
          { zh:'忙', vi:'Bận rộn', hanViet:'', zhDef:'', memoryTip:'', exZh:'他最近很忙。', exVi:'Dạo này anh ấy rất bận.' },
        ]
      },
      {
        title: 'Unit 13: 🏥 Sức khỏe & Cơ thể',
        words: [
          { zh:'身体', vi:'Cơ thể, sức khỏe', hanViet:'', zhDef:'', memoryTip:'', exZh:'你身体好吗？', exVi:'Sức khỏe của bạn có tốt không?' },
          { zh:'生病', vi:'Bị bệnh', hanViet:'', zhDef:'', memoryTip:'', exZh:'他昨天生病了。', exVi:'Hôm qua anh ấy bị bệnh.' },
          { zh:'病', vi:'Bệnh; ốm', hanViet:'', zhDef:'', memoryTip:'', exZh:'我生病了。', exVi:'Tôi bị bệnh rồi.' },
          { zh:'病人', vi:'Bệnh nhân; người bệnh', hanViet:'', zhDef:'', memoryTip:'', exZh:'王医生每天都要看十到二十位病人。', exVi:'Bác sĩ Vương mỗi ngày đều phải khám từ 10 đến 20 bệnh nhân.' },
          { zh:'看病', vi:'Khám bệnh', hanViet:'', zhDef:'', memoryTip:'', exZh:'我今天去医院看病。', exVi:'Hôm nay tôi đi bệnh viện khám bệnh.' },
          { zh:'医院', vi:'Bệnh viện', hanViet:'', zhDef:'', memoryTip:'', exZh:'他生病了，要去医院。', exVi:'Anh ấy bị ốm, cần đến bệnh viện.' },
          { zh:'手', vi:'Tay', hanViet:'', zhDef:'', memoryTip:'', exZh:'请把手洗干净。', exVi:'Hãy rửa tay sạch sẽ.' },
          { zh:'累', vi:'Mệt, mệt mỏi', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天工作很累。', exVi:'Hôm nay công việc rất mệt.' },
          { zh:'休息', vi:'Nghỉ ngơi', hanViet:'', zhDef:'', memoryTip:'', exZh:'我每天都要休息一小时。', exVi:'Tôi phải nghỉ ngơi một giờ mỗi ngày.' },
          { zh:'口', vi:'Miệng, mồm /  / cửa, cổng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我用盐水漱口。', exVi:'Tôi dùng nước muối để súc miệng.' },
        ]
      },
      {
        title: 'Unit 14: 🌤️ Thời tiết & Thiên nhiên',
        words: [
          { zh:'天气', vi:'Thời tiết', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天天气很好。', exVi:'Hôm nay thời tiết rất đẹp.' },
          { zh:'雨', vi:'Mưa', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天下雨了。', exVi:'Hôm nay trời mưa rồi.' },
          { zh:'风', vi:'Gió', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天的风很大，不要出去。', exVi:'Hôm nay gió lớn, đừng ra ngoài.' },
          { zh:'冷', vi:'Lạnh', hanViet:'', zhDef:'', memoryTip:'', exZh:'外面很冷，多穿点衣服。', exVi:'Bên ngoài rất lạnh, mặc thêm áo vào.' },
          { zh:'热', vi:'Nóng', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天的天气很热。', exVi:'Thời tiết của hôm nay rất nóng.' },
          { zh:'下雨', vi:'Mưa rơi', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天会下雨，你带伞了吗？', exVi:'Hôm nay trời sẽ mưa, bạn đã mang ô chưa?' },
          { zh:'山', vi:'Núi', hanViet:'', zhDef:'', memoryTip:'', exZh:'那座山很高。', exVi:'Ngọn núi đó rất cao.' },
          { zh:'树', vi:'Cây, cây cối', hanViet:'', zhDef:'', memoryTip:'', exZh:'这里有一棵大树。', exVi:'Ở đây có một cái cây lớn.' },
          { zh:'花', vi:'Hoa; bông hoa', hanViet:'', zhDef:'', memoryTip:'', exZh:'花园里有很多花。', exVi:'Trong vườn có rất nhiều hoa.' },
        ]
      },
      {
        title: 'Unit 15: ❤️ Cảm xúc & Tính cách',
        words: [
          { zh:'高兴', vi:'Vui mừng; háo hức', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天我很高兴。', exVi:'Hôm nay tôi rất vui.' },
          { zh:'生气', vi:'Giận, tức giận', hanViet:'', zhDef:'', memoryTip:'', exZh:'妈妈生气了。', exVi:'Mẹ giận rồi.' },
          { zh:'喜欢', vi:'Thích', hanViet:'', zhDef:'', memoryTip:'', exZh:'我很喜欢吃中国菜。', exVi:'Tôi rất thích ăn món Trung Quốc.' },
          { zh:'爱', vi:'Yêu; thương; yêu quý', hanViet:'', zhDef:'', memoryTip:'', exZh:'爸爸爱妈妈。', exVi:'Ba yêu mẹ.' },
          { zh:'爱好', vi:'Yêu thích; yêu chuộng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我爱好打篮球。', exVi:'Tôi thích chơi bóng rổ.' },
          { zh:'觉得', vi:'Cảm thấy, cho rằng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我觉得这本书很好看。', exVi:'Tôi cảm thấy cuốn sách này rất hay.' },
          { zh:'漂亮', vi:'Đẹp, xinh đẹp', hanViet:'', zhDef:'', memoryTip:'', exZh:'这件衣服很漂亮。', exVi:'Bộ quần áo này rất đẹp.' },
          { zh:'好看', vi:'Đẹp; hay; thú vị', hanViet:'', zhDef:'', memoryTip:'', exZh:'这本书很好看，我喜欢。', exVi:'Cuốn sách này rất hay, tôi thích.' },
          { zh:'好听', vi:'Hay; dễ nghe; êm tai (âm thanh)', hanViet:'', zhDef:'', memoryTip:'', exZh:'这首歌很好听。', exVi:'Bài hát này rất hay.' },
          { zh:'好玩儿', vi:'Hay; thú vị; thích thú', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个游戏很好玩儿。', exVi:'Trò chơi này rất vui.' },
          { zh:'老', vi:'Già, cũ', hanViet:'', zhDef:'', memoryTip:'', exZh:'这辆车太老了。', exVi:'Chiếc xe này quá cũ rồi.' },
          { zh:'快', vi:'Nhanh, mau', hanViet:'', zhDef:'', memoryTip:'', exZh:'火车快要来了。', exVi:'Tàu hỏa sắp đến rồi.' },
          { zh:'慢', vi:'Chậm', hanViet:'', zhDef:'', memoryTip:'', exZh:'请说慢一点儿。', exVi:'Xin hãy nói chậm một chút.' },
          { zh:'远', vi:'Xa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家离学校很远。', exVi:'Nhà tôi cách trường học rất xa.' },
        ]
      },
      {
        title: 'Unit 16: 🎨 Màu sắc & Mô tả',
        words: [
          { zh:'白', vi:'Trắng, màu trắng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我姐姐的皮肤很白。', exVi:'Da của chị tôi rất trắng.' },
          { zh:'大', vi:'Lớn; to', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个房子很大。', exVi:'Căn nhà này rất lớn.' },
          { zh:'小', vi:'Nhỏ, bé', hanViet:'', zhDef:'', memoryTip:'', exZh:'这只狗很小，很可爱。', exVi:'Con chó này rất nhỏ, rất đáng yêu.' },
          { zh:'高', vi:'Cao', hanViet:'', zhDef:'', memoryTip:'', exZh:'你比我高一点儿。', exVi:'Bạn cao hơn tôi một chút.' },
          { zh:'新', vi:'Mới', hanViet:'', zhDef:'', memoryTip:'', exZh:'我买了一件新衣服。', exVi:'Tôi đã mua một bộ quần áo mới.' },
          { zh:'干净', vi:'Sạch sẽ, gọn gàng', hanViet:'', zhDef:'', memoryTip:'', exZh:'你的房间很干净。', exVi:'Phòng của bạn rất sạch sẽ.' },
          { zh:'重', vi:'Nặng /  / trọng yếu, quan trọng', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个箱子很重。', exVi:'Chiếc hộp này rất nặng.' },
          { zh:'干', vi:'Khô; cạn', hanViet:'', zhDef:'', memoryTip:'', exZh:'这件衣服干了，可以穿了。', exVi:'Quần áo này khô rồi, có thể mặc rồi.' },
          { zh:'男', vi:'Nam, con trai', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们班有很多男同学。', exVi:'Lớp chúng tôi có rất nhiều bạn học sinh nam.' },
          { zh:'女', vi:'Nữ, con gái', hanViet:'', zhDef:'', memoryTip:'', exZh:'我的女儿非常可爱。', exVi:'Con gái tôi rất dễ thương.' },
        ]
      },
      {
        title: 'Unit 17: 🏃 Hoạt động hàng ngày',
        words: [
          { zh:'起床', vi:'Thức dậy (ra khỏi giường)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我每天六点起床。', exVi:'Mỗi ngày tôi thức dậy lúc 6 giờ.' },
          { zh:'睡觉', vi:'Ngủ', hanViet:'', zhDef:'', memoryTip:'', exZh:'孩子们都去睡觉了。', exVi:'Bọn trẻ đều đi ngủ rồi.' },
          { zh:'睡', vi:'Ngủ', hanViet:'', zhDef:'', memoryTip:'', exZh:'他昨天晚上睡得很早。', exVi:'Tối qua anh ấy ngủ rất sớm.' },
          { zh:'穿', vi:'Mặc; đi; mang; đeo', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天我穿了件新衣服。', exVi:'Hôm nay tôi mặc quần áo mới.' },
          { zh:'唱歌', vi:'Hát; ca hát', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家邻居昨天一直不停地唱歌。', exVi:'Ngày hôm qua hàng xóm của tôi ca hát không ngừng.' },
          { zh:'唱', vi:'Hát; ca', hanViet:'', zhDef:'', memoryTip:'', exZh:'她唱太好了，大家都起立鼓掌。', exVi:'Cô ấy hát rất hay, mọi người đều đứng dậy vỗ tay.' },
          { zh:'打球', vi:'Đánh bóng; chơi bóng', hanViet:'', zhDef:'', memoryTip:'', exZh:'他们很喜欢打球。', exVi:'Cậu ấy thích chơi bóng rổ.' },
          { zh:'洗', vi:'Giặt, rửa, tắm', hanViet:'', zhDef:'', memoryTip:'', exZh:'现在我要洗衣服。', exVi:'Bây giờ tôi phải giặt quần áo.' },
          { zh:'上网', vi:'Lên mạng', hanViet:'', zhDef:'', memoryTip:'', exZh:'他喜欢上网买东西。', exVi:'Anh ấy thích mua hàng online.' },
          { zh:'笑', vi:'Cười', hanViet:'', zhDef:'', memoryTip:'', exZh:'她的笑容很美。', exVi:'Nụ cười của cô ấy rất đẹp.' },
          { zh:'玩儿', vi:'Chơi', hanViet:'', zhDef:'', memoryTip:'', exZh:'孩子们喜欢玩儿游戏。', exVi:'Bọn trẻ thích chơi trò chơi.' },
          { zh:'歌', vi:'Hát; ca', hanViet:'', zhDef:'', memoryTip:'', exZh:'这首歌很好听。', exVi:'Bài hát này rất hay.' },
          { zh:'见面', vi:'Gặp mặt', hanViet:'', zhDef:'', memoryTip:'', exZh:'我很高兴和你见面。', exVi:'Tôi rất vui khi gặp bạn.' },
          { zh:'开玩笑', vi:'Đùa, nói đùa', hanViet:'', zhDef:'', memoryTip:'', exZh:'别生气，我只是开玩笑。', exVi:'Đừng giận mà, tôi chỉ đùa thôi.' },
        ]
      },
      {
        title: 'Unit 18: 🔧 Động từ thông dụng',
        words: [
          { zh:'说', vi:'Nói', hanViet:'', zhDef:'', memoryTip:'', exZh:'我会说汉语。', exVi:'Tôi biết nói tiếng Trung.' },
          { zh:'问', vi:'Hỏi', hanViet:'', zhDef:'', memoryTip:'', exZh:'你可以问问老师这个问题。', exVi:'Bạn có thể hỏi giáo viên câu hỏi này.' },
          { zh:'回答', vi:'Trả lời', hanViet:'', zhDef:'', memoryTip:'', exZh:'请回答我的问题。', exVi:'Hãy trả lời câu hỏi của tôi.' },
          { zh:'听', vi:'Nghe', hanViet:'', zhDef:'', memoryTip:'', exZh:'他在听歌。', exVi:'Anh ấy đang nghe nhạc.' },
          { zh:'看', vi:'Nhìn, xem, đọc', hanViet:'', zhDef:'', memoryTip:'', exZh:'这本书我看完了。', exVi:'Tôi đã đọc xong cuốn sách này.' },
          { zh:'找', vi:'Tìm kiếm', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在找我的手机。', exVi:'Tôi đang tìm điện thoại của tôi.' },
          { zh:'拿', vi:'Cầm, nắm, lấy', hanViet:'', zhDef:'', memoryTip:'', exZh:'请帮我拿一下。', exVi:'Làm ơn giúp tôi cầm cái này một chút.' },
          { zh:'给', vi:'Đưa', hanViet:'', zhDef:'', memoryTip:'', exZh:'妈妈给我买了一本书。', exVi:'Mẹ đã mua cho tôi một quyển sách.' },
          { zh:'要（动）', vi:'Muốn, cần', hanViet:'', zhDef:'', memoryTip:'', exZh:'我想要一杯咖啡。', exVi:'Tôi muốn một ly cà phê.' },
          { zh:'用', vi:'Dùng, sử dụng', hanViet:'', zhDef:'', memoryTip:'', exZh:'你可以用我的手机。', exVi:'Bạn có thể dùng điện thoại của tôi.' },
          { zh:'做', vi:'Làm, thực hiện', hanViet:'', zhDef:'', memoryTip:'', exZh:'我妈做中国菜非常好吃。', exVi:'Mẹ tôi làm đồ ăn Trung Quốc rất ngon.' },
          { zh:'打', vi:'Gõ; đánh; đập;...', hanViet:'', zhDef:'', memoryTip:'', exZh:'我弟弟在打篮球。', exVi:'Em trai tôi đang chơi bóng rổ.' },
          { zh:'开', vi:'Mở, bật, lái', hanViet:'', zhDef:'', memoryTip:'', exZh:'他正在学开车。', exVi:'Anh ấy đang học lái xe.' },
          { zh:'关', vi:'Đóng; tắt', hanViet:'', zhDef:'', memoryTip:'', exZh:'睡觉前别忘了关灯。', exVi:'Trước khi ngủ đừng quên tắt đèn.' },
          { zh:'打开', vi:'Mở ra', hanViet:'', zhDef:'', memoryTip:'', exZh:'请你把门打开。', exVi:'Xin bạn hãy mở cửa ra.' },
          { zh:'关上', vi:'Đóng; đóng vào; đóng lại', hanViet:'', zhDef:'', memoryTip:'', exZh:'请关上门，谢谢你！', exVi:'Hãy đóng cửa lại, cảm ơn bạn.' },
          { zh:'准备', vi:'Chuẩn bị', hanViet:'', zhDef:'', memoryTip:'', exZh:'A: 你准备好了吗？', exVi:'A: Bạn chuẩn bị xong chưa?' },
          { zh:'等', vi:'Đợi; chờ; chờ đợi', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在等她的电话。', exVi:'Tôi đang đợi cuộc gọi của cô ấy.' },
          { zh:'坐', vi:'Ngồi', hanViet:'', zhDef:'', memoryTip:'', exZh:'请坐这里，老师马上来。', exVi:'Mời ngồi đây, thầy giáo sẽ đến ngay.' },
          { zh:'站', vi:'Đứng', hanViet:'', zhDef:'', memoryTip:'', exZh:'请站在这儿。', exVi:'Xin hãy đứng ở đây.' },
          { zh:'放', vi:'Đặt; để', hanViet:'', zhDef:'', memoryTip:'', exZh:'请把书放在桌子上。', exVi:'Vui lòng đặt quyển sách lên bàn.' },
          { zh:'叫', vi:'Gọi, kêu', hanViet:'', zhDef:'', memoryTip:'', exZh:'妈妈叫我回家。', exVi:'Mẹ gọi tôi về nhà.' },
          { zh:'送', vi:'Tặng, đưa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我送你一本书。', exVi:'Tôi tặng bạn một quyển sách.' },
          { zh:'想', vi:'Nghĩ, muốn', hanViet:'', zhDef:'', memoryTip:'', exZh:'我想去日本旅游。', exVi:'Tôi muốn đi du lịch Nhật Bản.' },
          { zh:'会', vi:'Sẽ; có; biết', hanViet:'', zhDef:'', memoryTip:'', exZh:'你会做中国菜吗？', exVi:'Bạn biết nấu món Trung Quốc không?' },
          { zh:'能', vi:'Có thể', hanViet:'', zhDef:'', memoryTip:'', exZh:'咱们一定能完成任务。', exVi:'Chúng ta nhất định có thể hoàn thành nhiệm vụ.' },
          { zh:'试', vi:'Thử, thử nghiệm', hanViet:'', zhDef:'', memoryTip:'', exZh:'我可以试一试吗？', exVi:'Tôi có thể thử một chút không?' },
          { zh:'有', vi:'Có, tồn tại', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有一个好朋友。', exVi:'Tôi có một người bạn tốt.' },
          { zh:'没', vi:'Không có, chưa', hanViet:'', zhDef:'', memoryTip:'', exZh:'我今天没时间。', exVi:'Hôm nay tôi không có thời gian (không rảnh).' },
          { zh:'没有', vi:'Không có', hanViet:'', zhDef:'', memoryTip:'', exZh:'我没有钱。', exVi:'Tôi không có tiền.' },
          { zh:'知道', vi:'Biết, hiểu biết', hanViet:'', zhDef:'', memoryTip:'', exZh:'你知道他的名字吗？', exVi:'Bạn có biết tên của anh ấy không?' },
          { zh:'认识', vi:'Quen biết', hanViet:'', zhDef:'', memoryTip:'', exZh:'我认识他。', exVi:'Tôi quen biết anh ấy.' },
          { zh:'住', vi:'Ở, cư trú, sống', hanViet:'', zhDef:'', memoryTip:'', exZh:'你住在哪个城市？', exVi:'Bạn sống ở thành phố nào?' },
          { zh:'说话', vi:'Nói chuyện', hanViet:'', zhDef:'', memoryTip:'', exZh:'请不要大声说话。', exVi:'Vui lòng đừng nói chuyện lớn tiếng.' },
          { zh:'告诉', vi:'Nói; bày tỏ', hanViet:'', zhDef:'', memoryTip:'', exZh:'妈妈告诉我早点回家。', exVi:'Mẹ bảo tôi về nhà sớm.' },
          { zh:'找到', vi:'Tìm thấy', hanViet:'', zhDef:'', memoryTip:'', exZh:'我找到钥匙了。', exVi:'Tôi tìm thấy chìa khóa rồi.' },
          { zh:'看到', vi:'Nhìn thấy', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在街上看到一只小猫。', exVi:'Tôi nhìn thấy một con mèo nhỏ trên đường.' },
          { zh:'看见', vi:'Thấy, trông thấy', hanViet:'', zhDef:'', memoryTip:'', exZh:'我看见一只小鸟在树上唱歌。', exVi:'Tôi nhìn thấy một con chim đang hót trên cây.' },
          { zh:'听到', vi:'Nghe thấy', hanViet:'', zhDef:'', memoryTip:'', exZh:'我听到了你的声音。', exVi:'Tôi đã nghe thấy giọng của bạn.' },
          { zh:'听见', vi:'Nghe được', hanViet:'', zhDef:'', memoryTip:'', exZh:'你听见了吗？', exVi:'Bạn có nghe thấy không?' },
          { zh:'忘', vi:'Quên', hanViet:'', zhDef:'', memoryTip:'', exZh:'我忘了带钱包。', exVi:'Tôi quên mang ví tiền rồi.' },
          { zh:'忘记', vi:'Quên', hanViet:'', zhDef:'', memoryTip:'', exZh:'请不要忘记明天的会议。', exVi:'Xin đừng quên cuộc họp ngày mai.' },
          { zh:'坐下', vi:'Ngồi xuống', hanViet:'', zhDef:'', memoryTip:'', exZh:'咱们坐下谈吧。', exVi:'Chúng ta ngồi xuống nói chuyện.' },
          { zh:'在家', vi:'Ở nhà', hanViet:'', zhDef:'', memoryTip:'', exZh:'周末我一般在家休息。', exVi:'Cuối tuần tôi thường ở nhà nghỉ ngơi.' },
          { zh:'打电话', vi:'Gọi điện thoại', hanViet:'', zhDef:'', memoryTip:'', exZh:'等一下，我要打电话问问。', exVi:'Đợi chút nha, tôi cần gọi điện thoại hỏi thăm.' },
          { zh:'动', vi:'Chuyển động; cử động', hanViet:'', zhDef:'', memoryTip:'', exZh:'她的眼睛动了一下。', exVi:'Mắt của cô ấy nhúc nhích một cái.' },
          { zh:'动作', vi:'Động tác; hành động', hanViet:'', zhDef:'', memoryTip:'', exZh:'舞蹈的动作很优美。', exVi:'Động tác của điệu nhảy rất đẹp.' },
          { zh:'帮', vi:'Giúp đỡ, trợ giúp', hanViet:'', zhDef:'', memoryTip:'', exZh:'他经常帮我做家务。', exVi:'Anh ấy thường giúp tôi làm việc nhà.' },
          { zh:'帮忙', vi:'Giúp, giúp đỡ', hanViet:'', zhDef:'', memoryTip:'', exZh:'你可以来帮忙吗？', exVi:'Bạn có thể lại giúp đỡ không?' },
          { zh:'大学生', vi:'Sinh viên đại học', hanViet:'', zhDef:'', memoryTip:'', exZh:'我是大学生。', exVi:'Tôi là sinh viên đại học.' },
          { zh:'得到', vi:'Đạt được; nhận được', hanViet:'', zhDef:'', memoryTip:'', exZh:'他得到了奖学金。', exVi:'Anh ấy đã nhận được học bổng.' },
          { zh:'第 （第二）', vi:'Thứ tự; thứ hạng', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是第一个问题。', exVi:'Đây là câu hỏi đầu tiên.' },
          { zh:'点', vi:'Nơi; chỗ; điểm', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们去那个点看看。', exVi:'Chúng ta đi đến chỗ đó xem thử.' },
          { zh:'电', vi:'Điện; pin; điện năng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我的手机没电了。', exVi:'Điện thoại tôi hết pin rồi.' },
          { zh:'电影', vi:'Phim ảnh', hanViet:'', zhDef:'', memoryTip:'', exZh:'昨天我们看了一部电影。', exVi:'Hôm qua chúng tôi đã xem một bộ phim.' },
          { zh:'电影院', vi:'Rạp chiếu phim', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们去电影院看电影。', exVi:'Chúng tôi đi rạp chiếu phim để xem phim.' },
          { zh:'干什么', vi:'Làm gì thế; tại sao', hanViet:'', zhDef:'', memoryTip:'', exZh:'你干什么不早说呀?', exVi:'Tại sao bạn không nói sớm?' },
          { zh:'国', vi:'Nước; quốc gia', hanViet:'', zhDef:'', memoryTip:'', exZh:'中国的美食非常有名。', exVi:'Ẩm thực của Trung Quốc rất nổi tiếng.' },
          { zh:'话', vi:'Lời nói; ngôn từ', hanViet:'', zhDef:'', memoryTip:'', exZh:'她的话让我很高兴。', exVi:'Lời của cô ấy làm tôi rất vui.' },
          { zh:'见', vi:'Gặp', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在公园见到朋友。', exVi:'Tôi gặp bạn ở công viên.' },
          { zh:'课本', vi:'Sách giáo khoa', hanViet:'', zhDef:'', memoryTip:'', exZh:'你带课本了吗？', exVi:'Bạn có mang sách giáo khoa không?' },
          { zh:'老师', vi:'Giáo viên, thầy cô', hanViet:'', zhDef:'', memoryTip:'', exZh:'她是我们的汉语老师。', exVi:'Cô ấy là giáo viên tiếng Trung của chúng tôi.' },
          { zh:'毛', vi:'Lông, tóc', hanViet:'', zhDef:'', memoryTip:'', exZh:'小狗的毛很软。', exVi:'Lông của chú chó con rất mềm.' },
          { zh:'门票', vi:'Vé vào cửa', hanViet:'', zhDef:'', memoryTip:'', exZh:'这张门票多少钱？', exVi:'' },
          { zh:'球', vi:'Quả bóng', hanViet:'', zhDef:'', memoryTip:'', exZh:'他喜欢踢足球。', exVi:'Anh ấy thích đá bóng.' },
          { zh:'身上', vi:'Trên người', hanViet:'', zhDef:'', memoryTip:'', exZh:'你身上有钱吗？', exVi:'Bạn có tiền trong người không?' },
          { zh:'生日', vi:'Sinh nhật', hanViet:'', zhDef:'', memoryTip:'', exZh:'你的生日是几月几号？', exVi:'Sinh nhật của bạn là ngày mấy tháng mấy?' },
          { zh:'事', vi:'Việc, sự việc', hanViet:'', zhDef:'', memoryTip:'', exZh:'这是一件重要的事。', exVi:'Đây là một việc quan trọng.' },
          { zh:'外语', vi:'Ngoại ngữ', hanViet:'', zhDef:'', memoryTip:'', exZh:'你会说几种外语？', exVi:'Bạn biết nói mấy thứ tiếng nước ngoài?' },
          { zh:'网上', vi:'Trên mạng', hanViet:'', zhDef:'', memoryTip:'', exZh:'现在很多人喜欢在网上买东西。', exVi:'Hiện nay nhiều người thích mua đồ trên mạng.' },
          { zh:'网友', vi:'Bạn trên mạng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我有很多网友。', exVi:'Tôi có nhiều bạn trên mạng.' },
          { zh:'小学生', vi:'Học sinh tiểu học', hanViet:'', zhDef:'', memoryTip:'', exZh:'她是个聪明的小学生。', exVi:'Cô bé ấy là một học sinh tiểu học thông minh.' },
          { zh:'学生', vi:'Học sinh', hanViet:'', zhDef:'', memoryTip:'', exZh:'她是我的学生。', exVi:'Cô ấy là học sinh của tôi.' },
          { zh:'一点儿', vi:'Một chút, một ít', hanViet:'', zhDef:'', memoryTip:'', exZh:'我想喝一点儿水。', exVi:'Tôi muốn uống một chút nước.' },
          { zh:'字', vi:'Chữ, từ', hanViet:'', zhDef:'', memoryTip:'', exZh:'我不认识这个字。', exVi:'Tôi không biết chữ này.' },
        ]
      },
      {
        title: 'Unit 19: 📝 Tính từ & Phó từ',
        words: [
          { zh:'很', vi:'Rất, nhiều', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天的课文很长， 生词很多。', exVi:'Hôm nay bài khoá rất dài, nên từ mới rất nhiều.' },
          { zh:'非常', vi:'Đặc biệt; rất; vô cùng', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个地方非常漂亮。', exVi:'Nơi này cực kỳ đẹp.' },
          { zh:'太', vi:'Quá, rất', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个菜太好吃了。', exVi:'Món ăn này quá ngon.' },
          { zh:'真', vi:'Thật, rất', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个地方真美。', exVi:'Nơi này thật đẹp!' },
          { zh:'最', vi:'Nhất (chỉ mức độ cao nhất)', hanViet:'', zhDef:'', memoryTip:'', exZh:'你最喜欢吃什么水果？', exVi:'Bạn thích ăn loại trái cây nào nhất?' },
          { zh:'都', vi:'Đều, cả', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们都很忙。', exVi:'Chúng tôi đều rất bận.' },
          { zh:'也', vi:'Cũng', hanViet:'', zhDef:'', memoryTip:'', exZh:'我也喜欢吃苹果。', exVi:'Tôi cũng thích ăn táo.' },
          { zh:'还', vi:'Vẫn; còn; vẫn còn', hanViet:'', zhDef:'', memoryTip:'', exZh:'他有一个哥哥，还有一个妹妹。', exVi:'Cậu ấy có một anh trai, còn có một em gái nữa.' },
          { zh:'就', vi:'Thì, liền, ngay lập tức', hanViet:'', zhDef:'', memoryTip:'', exZh:'他下班后就回家了。', exVi:'Anh ấy tan làm liền về nhà.' },
          { zh:'一起', vi:'Cùng nhau', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们一起去看电影吧。', exVi:'Chúng ta cùng đi xem phim nhé.' },
          { zh:'一块儿', vi:'Cùng nhau', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们一块儿去公园吧。', exVi:'Chúng ta cùng đi công viên nhé.' },
          { zh:'一边', vi:'Một phía, một bên', hanViet:'', zhDef:'', memoryTip:'', exZh:'她一边吃饭，一边看书。', exVi:'Cô ấy vừa ăn vừa đọc sách.' },
          { zh:'再', vi:'Lại, lần nữa', hanViet:'', zhDef:'', memoryTip:'', exZh:'请再说一遍。', exVi:'Xin hãy nói lại một lần nữa.' },
          { zh:'正在', vi:'Đang (chỉ hành động xảy ra trong hiện tại)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我正在写作业。', exVi:'Tôi đang làm bài tập.' },
          { zh:'正', vi:'vừa hay, đúng lúc', hanViet:'', zhDef:'', memoryTip:'', exZh:'我正好要去找你。', exVi:'Tôi vừa hay định đi tìm bạn.' },
          { zh:'多', vi:'Nhiều; rất nhiều', hanViet:'', zhDef:'', memoryTip:'', exZh:'今天的作业不太多。', exVi:'Bài tập hôm nay không nhiều lắm.' },
          { zh:'少', vi:'Ít', hanViet:'', zhDef:'', memoryTip:'', exZh:'这里的人很少。', exVi:'Ở đây rất ít người.' },
          { zh:'好', vi:'Tốt; hay; ổn', hanViet:'', zhDef:'', memoryTip:'', exZh:'你身体好吗？', exVi:'Bạn có khỏe không?' },
          { zh:'坏', vi:'Hư; hư hỏng; xấu', hanViet:'', zhDef:'', memoryTip:'', exZh:'我的手机坏了，不能用。', exVi:'Điện thoại của tôi bị hỏng, không thể dùng.' },
          { zh:'难', vi:'Khó', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个问题很难回答。', exVi:'Câu hỏi này rất khó trả lời.' },
          { zh:'有用', vi:'Hữu ích, có ích', hanViet:'', zhDef:'', memoryTip:'', exZh:'这本书很有用。', exVi:'Cuốn sách này rất hữu ích.' },
          { zh:'有名', vi:'Nổi tiếng', hanViet:'', zhDef:'', memoryTip:'', exZh:'这家餐厅很有名。', exVi:'Nhà hàng này rất nổi tiếng.' },
          { zh:'重要', vi:'Quan trọng', hanViet:'', zhDef:'', memoryTip:'', exZh:'学习汉语对我来说很重要。', exVi:'Học tiếng Trung rất quan trọng đối với tôi.' },
          { zh:'不大', vi:'Không to; không lớn', hanViet:'', zhDef:'', memoryTip:'', exZh:'这个房间不大。', exVi:'Căn phòng này không lớn.' },
          { zh:'不对', vi:'Không đúng', hanViet:'', zhDef:'', memoryTip:'', exZh:'你的答案不对。', exVi:'Đáp án của bạn không đúng.' },
          { zh:'不用', vi:'Không cần; không phải', hanViet:'', zhDef:'', memoryTip:'', exZh:'你不用担心。', exVi:'Bạn không cần phải lo lắng.' },
          { zh:'真的', vi:'Thật sự, thực sự', hanViet:'', zhDef:'', memoryTip:'', exZh:'你真的要去吗？', exVi:'Bạn thật sự muốn đi à?' },
          { zh:'错', vi:'Sai; nhầm; không đúng', hanViet:'', zhDef:'', memoryTip:'', exZh:'你做错了。', exVi:'Bạn làm sai rồi.' },
          { zh:'一样', vi:'Giống nhau', hanViet:'', zhDef:'', memoryTip:'', exZh:'这两件衣服一样。', exVi:'Hai bộ quần áo này giống nhau.' },
          { zh:'差', vi:'Kém; tệ; không đạt', hanViet:'', zhDef:'', memoryTip:'', exZh:'他今天状态很差。', exVi:'Trạng thái của anh hôm nay rất tệ.' },
          { zh:'别', vi:'Đừng; chớ /  / hẳn là; hay là; lẽ nào', hanViet:'', zhDef:'', memoryTip:'', exZh:'在医院，大家别大声说话。', exVi:'Ở bệnh viện, mọi người đừng nói lớn tiếng.' },
          { zh:'还有', vi:'Vẫn; còn; vẫn còn', hanViet:'', zhDef:'', memoryTip:'', exZh:'我家里还有两只猫。', exVi:'Nhà tôi còn có hai con mèo.' },
          { zh:'最好', vi:'Tốt nhất', hanViet:'', zhDef:'', memoryTip:'', exZh:'下雨了，你最好带伞。', exVi:'Trời mưa rồi, tốt nhất bạn nên mang ô.' },
          { zh:'最后', vi:'Cuối cùng', hanViet:'', zhDef:'', memoryTip:'', exZh:'最后一个问题，你听好了。', exVi:'Câu hỏi cuối cùng, bạn nghe kỹ nhé.' },
        ]
      },
      {
        title: 'Unit 20: 🔗 Từ nối & Giới từ',
        words: [
          { zh:'和', vi:'Và; với', hanViet:'', zhDef:'', memoryTip:'', exZh:'我买了一本书和一件衣服。', exVi:'Tôi đã mua 1 cuốn sách và 1 bộ quần áo.' },
          { zh:'跟', vi:'Cùng; với', hanViet:'', zhDef:'', memoryTip:'', exZh:'我跟朋友一起去旅行。', exVi:'Tôi đi du lịch cùng bạn bè.' },
          { zh:'还是', vi:'Vẫn; còn; vẫn còn', hanViet:'', zhDef:'', memoryTip:'', exZh:'你想喝茶还是咖啡？', exVi:'Bạn muốn uống trà hay cà phê?' },
          { zh:'先', vi:'Trước tiên', hanViet:'', zhDef:'', memoryTip:'', exZh:'你先去，我等一下再去。', exVi:'Bạn đi trước đi, tôi sẽ đi sau.' },
          { zh:'从', vi:'Từ; bắt đầu từ', hanViet:'', zhDef:'', memoryTip:'', exZh:'我从家里走到学校。', exVi:'Tôi đi bộ từ nhà đến trường.' },
          { zh:'到', vi:'Đến', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们到达了目的地。', exVi:'Chúng ta đã đến nơi.' },
          { zh:'在', vi:'Ở, tại', hanViet:'', zhDef:'', memoryTip:'', exZh:'我在家看电视。', exVi:'Tôi ở nhà xem tivi.' },
          { zh:'比', vi:'Hơn, so, so với', hanViet:'', zhDef:'', memoryTip:'', exZh:'我哥哥比我高。', exVi:'Anh trai tôi cao hơn tôi.' },
          { zh:'们（朋友们）', vi:'Dùng để chỉ số nhiều (các bạn, các anh...)', hanViet:'', zhDef:'', memoryTip:'', exZh:'我们是好朋友。', exVi:'Chúng tôi là bạn tốt.' },
        ]
      },
    ]
  },
  {
    id: 'hsk2',
    title: 'HSK 2',
    level: 2,
    icon: '🌿',
    desc: 'Đang cập nhật...',
    units: []
  },
  {
    id: 'hsk3',
    title: 'HSK 3',
    level: 3,
    icon: '🌳',
    desc: 'Đang cập nhật...',
    units: []
  }
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function hskGetBook(id) { return HSK_BOOKS.find(b => b.id === id) || null; }

function hskCountAdded(bookId, unitIndex) {
  const book = hskGetBook(bookId);
  if (!book) return 0;
  const words = unitIndex != null ? book.units[unitIndex]?.words || [] : book.units.flatMap(u => u.words);
  return words.filter(w => db.words.some(d => d.zh === w.zh)).length;
}

function hskIsInDict(zh) { return db.words.some(w => w.zh === zh); }

function hskGetSRSInfo(zh) {
  const w = db.words.find(x => x.zh === zh);
  if (!w) return null;
  const sl = { new:'Mới', learning:'Đang học', review:'Ôn tập', mastered:'Thành thạo' };
  const sc = { new:'#A09D96', learning:'#0284C7', review:'#9333EA', mastered:'#177A47' };
  const nextReview = w.nextReview ? new Date(w.nextReview).toLocaleDateString('vi-VN') : 'Ngay bây giờ';
  return { status: sl[w.status] || 'Mới', color: sc[w.status] || '#A09D96', next: nextReview };
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function hskNav(view, bookId = null, unitIndex = null, wordIndex = null) {
  hskState = { view, bookId, unitIndex, wordIndex };
  ['hsk-view-books', 'hsk-view-units', 'hsk-view-words']
    .forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
  const viewEl = $(`hsk-view-${view}`);
  if (viewEl) viewEl.style.display = '';
  hskRenderBreadcrumb();
  if (view === 'books') hskRenderBooks();
  if (view === 'units') hskRenderUnits();
  if (view === 'words') hskRenderWords();
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function hskRenderBreadcrumb() {
  const el = $('hsk-breadcrumb');
  if (!el) return;
  const { view, bookId, unitIndex } = hskState;
  if (view === 'books') { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const book = hskGetBook(bookId);
  const parts = [{ label: '📚 Sách HSK', onclick: () => hskNav('books') }];
  if (book) parts.push({ label: book.title, onclick: () => hskNav('units', bookId) });
  if (unitIndex != null && book) {
    const label = book.units[unitIndex]?.title?.split(':')[0] || `Unit ${unitIndex+1}`;
    const isCurrent = view === 'words';
    parts.push({ label, onclick: () => hskNav('words', bookId, unitIndex), isCurrent });
  } else if (view === 'units') {
    parts[parts.length-1].isCurrent = true;
  } else {
    parts[parts.length-1].isCurrent = true;
  }

  el.innerHTML = parts.map((p, i) => {
    const isLast = i === parts.length - 1;
    const sep = i > 0 ? `<span class="hsk-breadcrumb-sep">›</span>` : '';
    if (isLast || p.isCurrent) {
      return `${sep}<span class="hsk-breadcrumb-current">${p.label}</span>`;
    }
    return `${sep}<span class="hsk-breadcrumb-item" data-bc="${i}">${p.label}</span>`;
  }).join('');
  el.querySelectorAll('[data-bc]').forEach(btn => {
    const i = parseInt(btn.dataset.bc);
    btn.addEventListener('click', parts[i].onclick);
  });
}

// ── Book list ─────────────────────────────────────────────────────────────────
function hskRenderBooks() {
  const grid = $('hsk-books-grid');
  if (!grid) return;
  grid.innerHTML = HSK_BOOKS.map(book => {
    const total = book.units.flatMap(u => u.words).length;
    const added = hskCountAdded(book.id, null);
    const pct = total > 0 ? Math.round(added / total * 100) : 0;
    return `
    <div class="hsk-book-card level-${book.level}" data-book="${book.id}" style="cursor:pointer">
      <span class="hsk-book-icon">${book.icon}</span>
      <div class="hsk-book-name">${book.title}</div>
      <div class="hsk-book-meta">${book.units.length} units · ${total} từ vựng</div>
      <div class="hsk-book-progress-bar">
        <div class="hsk-book-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="hsk-book-progress-text">${added}/${total} từ đã thêm vào từ điển (${pct}%)</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-book]').forEach(card => {
    card.addEventListener('click', () => hskNav('units', card.dataset.book));
  });
}

// ── Unit list ─────────────────────────────────────────────────────────────────
function hskRenderUnits() {
  const book = hskGetBook(hskState.bookId);
  if (!book) return;
  $('hsk-book-title').textContent = `${book.icon} ${book.title}`;
  $('hsk-book-desc').textContent = book.desc;
  const grid = $('hsk-units-grid');
  grid.innerHTML = book.units.map((unit, i) => {
    const total = unit.words.length;
    const added = hskCountAdded(book.id, i);
    const addedBadge = added > 0 ? `<span class="hsk-unit-added-badge">✓ ${added}/${total} từ</span>` : `<span style="font-size:11px;color:var(--text4)">${total} từ</span>`;
    return `
    <div class="hsk-unit-card" data-unit="${i}">
      <div class="hsk-unit-number">${i + 1}</div>
      <div class="hsk-unit-info">
        <div class="hsk-unit-name">${unit.title}</div>
        <div class="hsk-unit-count">${addedBadge}</div>
      </div>
      <span class="hsk-unit-arrow">›</span>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-unit]').forEach(card => {
    card.addEventListener('click', () => hskNav('words', hskState.bookId, parseInt(card.dataset.unit)));
  });
}

// ── Word list ─────────────────────────────────────────────────────────────────
function hskRenderWords() {
  // "words" view is now a single-word reader — jump straight to word 0
  const book = hskGetBook(hskState.bookId);
  const unit = book?.units[hskState.unitIndex];
  if (!unit) return;
  hskState.wordIndex = hskState.wordIndex ?? 0;
  hskRenderWordReader();
}

// ── Single-word reader (replaces old grid + detail views) ─────────────────────
let _hskWriters = [];

function hskRenderWordReader() {
  const book  = hskGetBook(hskState.bookId);
  const unit  = book?.units[hskState.unitIndex];
  const words = unit?.words || [];
  const idx   = hskState.wordIndex ?? 0;
  const word  = words[idx];
  if (!word) return;

  // Clean up old HanziWriter instances
  _hskWriters.forEach(w => { try { w.cancelQuiz(); } catch(e){} });
  _hskWriters = [];

  const inDict     = hskIsInDict(word.zh);
  const isMastered = currentUserId ? db.words.some(w => w.zh === word.zh && w.status === 'mastered') : false;
  const srs        = hskGetSRSInfo(word.zh);
  const chars   = [...word.zh];
  const pinyin  = getPinyin(word.zh);
  const hasPrev = idx > 0;
  const hasNext = idx < words.length - 1;
  const isAdmin = (auth.currentUser?.email === 'hoang1886@gmail.com');

  // Progress dots (max 12 shown)
  const maxDots = Math.min(words.length, 20);
  const dots = Array.from({length: maxDots}, (_, i) => {
    const actual = Math.floor(i * words.length / maxDots);
    const active = actual === idx;
    const done   = hskIsInDict(words[actual]?.zh);
    return `<div class="hsk-dot ${active ? 'active' : done ? 'done' : ''}" data-i="${actual}"></div>`;
  }).join('');

  // Stroke boxes
  const size = chars.length === 1 ? 160 : 110;
  const strokeBoxes = chars.map((c, i) => `
    <div class="hsk-stroke-box">
      <div id="hsk-stroke-${i}" class="hsk-stroke-canvas"></div>
      ${chars.length > 1 ? `<div class="hsk-stroke-char-label">${c}</div>` : ''}
    </div>`).join('');

  // SRS badge
  const srsBadge = srs
    ? `<span class="hsk-srs-badge" style="background:${srs.color}22;color:${srs.color};border-color:${srs.color}44">${srs.status} · ôn ${srs.next}</span>`
    : '';

  // Admin add-word button
  const adminBtn = isAdmin
    ? `<button class="hsk-admin-btn" id="hsk-admin-add-btn">⚙️ Thêm từ mới vào unit</button>`
    : '';

  const reader = $('hsk-word-reader');
  reader.innerHTML = `
    <!-- Top bar: unit name + progress -->
    <div class="hsk-reader-topbar">
      <div class="hsk-reader-unit-name">${unit.title}</div>
      <div class="hsk-reader-counter">${idx + 1} / ${words.length}</div>
    </div>
    <div class="hsk-reader-dots">${dots}</div>

    <!-- Main layout: prev arrow | card | next arrow -->
    <div class="hsk-reader-layout">
      <button class="hsk-arrow-btn hsk-arrow-prev" id="hsk-arr-prev" ${hasPrev ? '' : 'disabled'} title="Từ trước">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>

      <div class="hsk-reader-card">
        <!-- Header: số thứ tự + chữ lớn -->
        <div class="hsk-card-header">
          <div class="hsk-card-index">${idx + 1}</div>
          <div class="hsk-card-zh">${tr(word.zh)}</div>
          <div class="hsk-card-py">${pinyin}</div>
          <div class="hsk-card-vi">${word.vi}</div>
          ${srsBadge}
          <div class="hsk-card-actions">
            ${isMastered
              ? `<button class="hsk-detail-add-btn added" disabled>✓ Đã có trong từ điển</button>`
              : inDict
                ? `<button class="hsk-detail-add-btn added" disabled>✓ Đã có trong từ điển</button>`
                : `<button class="hsk-detail-add-btn" id="hsk-add-btn">＋ Thêm vào từ điển</button>`}
            ${isMastered
              ? `<button class="hsk-memorized-btn done" disabled>✓ Đã thuộc</button>`
              : `<button class="hsk-memorized-btn" id="hsk-memorized-btn">🎓 Thuộc lòng rồi</button>`}
            ${adminBtn}
          </div>
        </div>

        <!-- Body: two-column PREP style -->
        <div class="hsk-card-body">
          <!-- Left col -->
          <div class="hsk-card-left">
            <div class="hsk-card-section-label">ÂM HÁN VIỆT</div>
            <div class="hsk-card-hanviet">${word.hanViet || '—'}</div>

            <div class="hsk-card-section-label" style="margin-top:20px">BÚT THUẬN (STROKE ORDER)</div>
            <div id="hsk-stroke-container">${strokeBoxes}</div>
            <div class="hsk-stroke-controls">
              <button class="hsk-stroke-btn primary" id="hsk-stroke-animate">▶ Animation</button>
              <button class="hsk-stroke-btn" id="hsk-stroke-quiz">✏️ Luyện viết</button>
              <button class="hsk-stroke-btn" id="hsk-stroke-reset">↺ Reset</button>
            </div>
          </div>

          <!-- Right col -->
          <div class="hsk-card-right">
            ${word.zhDef ? `
            <div class="hsk-card-section-label">ĐỊNH NGHĨA TIẾNG TRUNG</div>
            <div class="hsk-card-zhdef">${tr(word.zhDef)}</div>` : ''}

            ${word.memoryTip ? `
            <div class="hsk-card-section-label" style="margin-top:20px">💡 MẸO NHỚ</div>
            <div class="hsk-card-tip">${word.memoryTip.replace(/\n/g,'<br>')}</div>` : ''}

            ${word.exZh ? `
            <div class="hsk-card-section-label" style="margin-top:20px">💬 VÍ DỤ</div>
            <div class="hsk-card-ex">
              <div class="hsk-card-ex-zh">${tr(word.exZh)}</div>
              <div class="hsk-card-ex-py">${getPinyin(word.exZh)}</div>
              <div class="hsk-card-ex-vi">${word.exVi || ''}</div>
            </div>` : ''}
          </div>
        </div>
      </div>

      <button class="hsk-arrow-btn hsk-arrow-next" id="hsk-arr-next" ${hasNext ? '' : 'disabled'} title="Từ tiếp theo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    <!-- Admin: add word form (hidden by default) -->
    ${isAdmin ? `<div id="hsk-admin-form" class="hsk-admin-form" style="display:none">
      <div class="hsk-admin-form-title">⚙️ Thêm từ mới vào "${unit.title}"</div>
      <div class="hsk-admin-grid">
        <div class="hsk-admin-field"><label>Chữ Hán *</label><input id="adm-zh" placeholder="e.g. 学习" style="font-family:'Noto Sans SC',sans-serif"></div>
        <div class="hsk-admin-field"><label>Nghĩa tiếng Việt *</label><input id="adm-vi" placeholder="e.g. học tập"></div>
        <div class="hsk-admin-field"><label>Âm Hán Việt</label><input id="adm-hanviet" placeholder="e.g. học tập"></div>
        <div class="hsk-admin-field"><label>Định nghĩa tiếng Trung</label><input id="adm-zhdef" style="font-family:'Noto Sans SC',sans-serif"></div>
        <div class="hsk-admin-field hsk-admin-full"><label>Mẹo nhớ</label><textarea id="adm-tip" rows="3" placeholder="Giải thích, mẹo nhớ..."></textarea></div>
        <div class="hsk-admin-field"><label>Ví dụ (tiếng Trung)</label><input id="adm-exzh" style="font-family:'Noto Sans SC',sans-serif"></div>
        <div class="hsk-admin-field"><label>Ví dụ (tiếng Việt)</label><input id="adm-exvi"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="hsk-stroke-btn primary" id="adm-save-btn" style="padding:10px 24px">💾 Lưu từ mới</button>
        <button class="hsk-stroke-btn" id="adm-cancel-btn" style="padding:10px 20px">Huỷ</button>
      </div>
    </div>` : ''}
  `;

  // Init HanziWriter
  chars.forEach((c, i) => {
    try {
      const writer = HanziWriter.create(`hsk-stroke-${i}`, c, {
        width: size, height: size, padding: 6,
        strokeColor: '#C8281E', outlineColor: 'rgba(200,200,200,0.5)',
        drawingColor: '#177A47', drawingWidth: 4,
        showCharacter: true, showOutline: true,
        strokeAnimationSpeed: 0.8, delayBetweenStrokes: 280,
      });
      _hskWriters.push(writer);
    } catch(e) {}
  });

  // Stroke controls
  $('hsk-stroke-animate')?.addEventListener('click', () => _hskWriters.forEach(w => w.animateCharacter()));
  $('hsk-stroke-quiz')?.addEventListener('click', () => _hskWriters.forEach(w => w.quiz({ onComplete: () => toast('✓ Viết xong rồi!') })));
  $('hsk-stroke-reset')?.addEventListener('click', () => _hskWriters.forEach(w => { w.cancelQuiz(); w.showCharacter(); }));

  // Add to dict
  $('hsk-add-btn')?.addEventListener('click', () => hskAddWordToDict(word));
  // Mark as memorized
  $('hsk-memorized-btn')?.addEventListener('click', () => hskMarkMemorized(word));

  // Arrow navigation
  $('hsk-arr-prev')?.addEventListener('click', () => {
    if (hasPrev) { hskState.wordIndex = idx - 1; hskRenderWordReader(); scrollToReader(); }
  });
  $('hsk-arr-next')?.addEventListener('click', () => {
    if (hasNext) { hskState.wordIndex = idx + 1; hskRenderWordReader(); scrollToReader(); }
  });

  // Dot navigation
  reader.querySelectorAll('.hsk-dot[data-i]').forEach(dot => {
    dot.addEventListener('click', () => {
      hskState.wordIndex = parseInt(dot.dataset.i);
      hskRenderWordReader(); scrollToReader();
    });
  });

  // Keyboard navigation
  reader._keyHandler && document.removeEventListener('keydown', reader._keyHandler);
  reader._keyHandler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' && hasNext) { hskState.wordIndex = idx + 1; hskRenderWordReader(); scrollToReader(); }
    if (e.key === 'ArrowLeft'  && hasPrev) { hskState.wordIndex = idx - 1; hskRenderWordReader(); scrollToReader(); }
  };
  document.addEventListener('keydown', reader._keyHandler);

  // Admin form
  if (isAdmin) {
    $('hsk-admin-add-btn')?.addEventListener('click', () => {
      const f = $('hsk-admin-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    });
    $('adm-cancel-btn')?.addEventListener('click', () => { $('hsk-admin-form').style.display = 'none'; });
    $('adm-save-btn')?.addEventListener('click', () => hskAdminSaveWord(book, hskState.unitIndex));
  }
}

function scrollToReader() {
  $('hsk-word-reader')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Admin: save new word to book data ────────────────────────────────────────
function hskAdminSaveWord(book, unitIndex) {
  const zh = $('adm-zh')?.value.trim();
  const vi = $('adm-vi')?.value.trim();
  if (!zh || !vi) { toast('⚠️ Vui lòng nhập Chữ Hán và nghĩa!'); return; }
  const newWord = {
    zh, vi,
    hanViet: $('adm-hanviet')?.value.trim() || '',
    zhDef:   $('adm-zhdef')?.value.trim() || '',
    memoryTip: $('adm-tip')?.value.trim() || '',
    exZh:    $('adm-exzh')?.value.trim() || '',
    exVi:    $('adm-exvi')?.value.trim() || '',
  };
  book.units[unitIndex].words.push(newWord);
  // Also save to Firestore under a shared 'hsk_data' document
  hskSaveAdminData(book);
  $('hsk-admin-form').style.display = 'none';
  ['adm-zh','adm-vi','adm-hanviet','adm-zhdef','adm-tip','adm-exzh','adm-exvi'].forEach(id => { const el=$(id); if(el) el.value=''; });
  hskState.wordIndex = book.units[unitIndex].words.length - 1;
  hskRenderWordReader();
  toast(`✓ Đã thêm từ "${zh}" vào unit!`);
}

async function hskSaveAdminData(book) {
  if (!DB_DOC || !currentUserId) return;
  try {
    const { doc: fsDoc, setDoc: fsSetDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const bookDocRef = fsDoc(firestore, 'hsk_books', book.id);
    await fsSetDoc(bookDocRef, { units: book.units }, { merge: true });
    toast('☁️ Đã đồng bộ dữ liệu sách lên Firebase!');
  } catch(e) {
    console.warn('HSK admin save error:', e);
    toast('⚠️ Lưu local thành công, Firebase sync thất bại.');
  }
}



// ── Add word to SRS dict ──────────────────────────────────────────────────────
function hskAddWordToDict(hskWord) {
  if (hskIsInDict(hskWord.zh)) { toast('Từ này đã có trong từ điển rồi!'); return; }
  const book = hskGetBook(hskState.bookId);
  const newWord = {
    id: Date.now() + Math.random(),
    zh: hskWord.zh,
    vi: hskWord.vi,
    pinyin: getPinyin(hskWord.zh),
    zhDef: hskWord.zhDef || '',
    exZh: hskWord.exZh || '',
    exVi: hskWord.exVi || '',
    note: hskWord.memoryTip || '',
    wordType: '',
    wordTypes: [],
    source: `${book?.id || 'hsk'}-unit${hskState.unitIndex + 1}`,
    status: 'new',
    ef: 2.5, interval: 0, repetitions: 0,
    nextReview: null, lastReview: null,
    added: Date.now()
  };
  db.words.push(newWord);
  save();
  toast(`✓ Đã thêm "${hskWord.zh}" vào từ điển!`);
  hskRenderWordReader();
}

// ── Mark word as memorized ───────────────────────────────────────────────────
function hskMarkMemorized(hskWord) {
  const existing = db.words.find(w => w.zh === hskWord.zh);
  if (existing) {
    existing.status = 'mastered';
    existing.repetitions = 99;
    existing.ef = 2.5;
    existing.interval = 36500;
    existing.nextReview = Date.now() + 36500 * 86400000;
    existing.lastReview = Date.now();
  } else {
    const book = hskGetBook(hskState.bookId);
    db.words.push({
      id: Date.now() + Math.random(),
      zh: hskWord.zh, vi: hskWord.vi,
      pinyin: getPinyin(hskWord.zh),
      zhDef: hskWord.zhDef || '', exZh: hskWord.exZh || '', exVi: hskWord.exVi || '',
      note: hskWord.memoryTip || '', wordType: '', wordTypes: [],
      source: `${book?.id || 'hsk'}-unit${hskState.unitIndex + 1}`,
      status: 'mastered', ef: 2.5, interval: 36500, repetitions: 99,
      nextReview: Date.now() + 36500 * 86400000, lastReview: Date.now(),
      added: Date.now(), memorizedDirectly: true,
    });
  }
  save();
  toast(`✓ Đã đánh dấu thuộc lòng!`);
  hskRenderWordReader();
}

// ── Init HSK nav ──────────────────────────────────────────────────────────────
function initHskNav() {
  const navEl = $('nav-hsk-books');
  if (navEl) navEl.addEventListener('click', () => nav('hsk-books'));
}
