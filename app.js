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

// DB_DOC is set per-user after login
let DB_DOC = null;

// ─── APP STATE ────────────────────────────────────────────────────────────────
let db          = { words:[], sessions:{}, correct:0, total:0, articles:[] };
let reviewQueue = [], currentCard = null, answered = false, saveTimer = null;
let _wf         = 'all'; // word-list filter
let lastSaveAt  = 0;     // timestamp of last local save — blocks snapshot overwrite
let currentUserId  = null;   // set on login — used for per-user localStorage key
let listenersReady = false;  // guard: only register DOM listeners once

// ─── DICTIONARY LOOKUP ────────────────────────────────────────────────────────
let dictData = null;
let dictLoading = false;

async function loadDict(){
  if(dictData || dictLoading) return;
  dictLoading = true;
  try{
    const res = await fetch('./cvdict.json');
    if(!res.ok) throw new Error('fetch failed');
    dictData = await res.json();
    console.log('Dictionary loaded:', Object.keys(dictData).length, 'entries');
  } catch(e){
    console.warn('Dictionary not available:', e.message);
    dictData = {};
  }
  dictLoading = false;
}

function lookupDict(zh){
  const el = $('dict-result');
  if(!el) return;
  if(!zh.trim()){ el.innerHTML=''; return; }

  if(!dictData){
    el.innerHTML='<span class="dict-searching">Đang tải từ điển...</span>';
    loadDict().then(()=>lookupDict($('inp-zh').value));
    return;
  }

  const found = dictData[zh];
  if(found){
    el.innerHTML=`<div class="dict-chip" id="dict-chip" title="Nhấn để điền vào ô nghĩa">
      <span>${zh}</span>
      <span class="dict-arrow">→</span>
      <span class="dict-vi">${found}</span>
      <span class="dict-apply">↙ Dùng</span>
    </div>`;
    $('dict-chip').addEventListener('click', ()=>{
      $('inp-vi').value = found;
      $('inp-vi').focus();
      el.innerHTML='<span style="font-size:12px;color:var(--green)">✓ Đã điền nghĩa!</span>';
      setTimeout(()=>el.innerHTML='', 1500);
    });
  } else {
    const chars = [...zh];
    if(chars.length > 1){
      const charResults = chars.map(c => dictData[c] ? `${c}: ${dictData[c].split(';')[0]}` : null).filter(Boolean);
      if(charResults.length){
        el.innerHTML=`<div class="dict-notfound">Không tìm thấy cụm từ. Từng chữ: <em>${charResults.join(' | ')}</em></div>`;
      } else {
        el.innerHTML='<span class="dict-notfound">Không tìm thấy trong từ điển</span>';
      }
    } else {
      el.innerHTML='<span class="dict-notfound">Không tìm thấy trong từ điển</span>';
    }
  }
}

// ─── SYNC UI ─────────────────────────────────────────────────────────────────
const syncBar  = document.getElementById('sync-bar');
const syncPill = document.getElementById('sync-pill');
const sdot     = document.getElementById('sdot');
const stext    = document.getElementById('stext');

function setSyncing(){ syncBar.className='syncing'; sdot.className='sdot spin'; stext.textContent='Đang đồng bộ...'; syncPill.className='show'; }
function setSynced(){  syncBar.className='synced';  sdot.className='sdot green'; stext.textContent='Đã đồng bộ ✓'; setTimeout(()=>{ syncPill.className=''; syncBar.className=''; }, 2000); }
function setSyncErr(){ sdot.className='sdot'; sdot.style.background='var(--red)'; stext.textContent='Lỗi kết nối ⚠'; syncPill.className='show'; }

// ─── SAVE ────────────────────────────────────────────────────────────────────
function save(){
  const lsKey = 'hanzi_bk_' + (currentUserId || 'anon');
  try{ localStorage.setItem(lsKey, JSON.stringify(db)); }catch(e){}
  lastSaveAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    setSyncing();
    try{
      const snapshot = JSON.parse(JSON.stringify(db));
      await setDoc(DB_DOC, snapshot);
      setSynced();
    } catch(e){
      console.error('Save error:', e);
      setSyncErr();
      toast('⚠️ Lỗi đồng bộ. Kiểm tra kết nối mạng.');
    }
    saveTimer = null;
  }, 600);
}

// ─── LOAD + REALTIME ─────────────────────────────────────────────────────────
async function init(){
  try{
    const snap = await getDoc(DB_DOC);
    if(snap.exists()){
      const d = snap.data();
      db = { words:d.words||[], sessions:d.sessions||{}, correct:d.correct||0, total:d.total||0, articles:d.articles||[] };
    } else {
      seedWords();
      await setDoc(DB_DOC, JSON.parse(JSON.stringify(db)));
    }
  } catch(e){
    console.error('Firebase load failed:', e);
    const bk = localStorage.getItem('hanzi_bk_' + (currentUserId || 'anon'));
    if(bk){ try{ db = JSON.parse(bk); }catch(ex){ seedWords(); } }
    else { seedWords(); }
    toast('⚠️ Không kết nối Firebase. Dùng dữ liệu cục bộ.');
  }

  document.getElementById('loading').style.display = 'none';
  renderDashboard();
  if(!listenersReady){ setupListeners(); listenersReady = true; }

  onSnapshot(DB_DOC, snap => {
    if(!snap.exists()) return;
    if(Date.now() - lastSaveAt < 5000) return;
    const d = snap.data();
    db = { words:d.words||[], sessions:d.sessions||{}, correct:d.correct||0, total:d.total||0, articles:d.articles||[] };
    try{ localStorage.setItem('hanzi_bk_' + (currentUserId || 'anon'), JSON.stringify(db)); }catch(e){}
    const ap = document.querySelector('.page.active')?.id;
    if(ap === 'dashboard') renderDashboard();
    if(ap === 'wordlist')  renderWordList('');
  }, err => console.warn('Snapshot error:', err));
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
function seedWords(){
  [ {zh:'你好', vi:'xin chào',          exZh:'你好，很高兴认识你。',  exVi:'Xin chào, rất vui được gặp bạn.'},
    {zh:'谢谢', vi:'cảm ơn',            exZh:'谢谢你的帮助！',         exVi:'Cảm ơn sự giúp đỡ của bạn!'},
    {zh:'学习', vi:'học tập',            exZh:'我喜欢学习汉语。',       exVi:'Tôi thích học tiếng Trung.'},
    {zh:'漂亮', vi:'xinh đẹp, đẹp',     exZh:'她很漂亮。',             exVi:'Cô ấy rất xinh đẹp.'},
    {zh:'工作', vi:'làm việc, công việc',exZh:'我的工作很有趣。',       exVi:'Công việc của tôi rất thú vị.'} ]
  .forEach(s => db.words.push({ id:Date.now()+Math.random(), pinyin:getPinyin(s.zh), status:'new', ef:2.5, interval:0, repetitions:0, nextReview:null, lastReview:null, added:Date.now(), ...s }));
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getPinyin(zh){ return window.pinyinPro ? pinyinPro.pinyin(zh,{toneType:'symbol',type:'string',separator:' '}) : ''; }
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), 2400); }
function $(id){ return document.getElementById(id); }

// ─── NAV ─────────────────────────────────────────────────────────────────────
function nav(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  const navEl = document.getElementById(`nav-${page}`);
  if(navEl) navEl.classList.add('active');
  if(page==='upload-article'||page==='read-article'||page==='article-review') document.getElementById('nav-articles').classList.add('active');
  if(page==='dashboard') renderDashboard();
  if(page==='review')    startReview();
  if(page==='wordlist')  renderWordList('');
  if(page==='articles')  renderArticlesList();
}

function navWordlistFilter(f){ _wf=f; nav('wordlist'); }

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────
function setupListeners(){
  // Sidebar nav
  ['dashboard','review','add','wordlist','articles'].forEach(p => { const el=$(`nav-${p}`); if(el) el.addEventListener('click', ()=>nav(p)); });

  // Stat cards → filter word list
  $('card-all').addEventListener('click',     ()=>navWordlistFilter('all'));
  $('card-due').addEventListener('click',     ()=>navWordlistFilter('due'));
  $('card-learned').addEventListener('click', ()=>navWordlistFilter('learned'));
  $('card-mastered').addEventListener('click',()=>navWordlistFilter('mastered'));

  // Due banner → review
  $('due-banner').addEventListener('click', ()=>nav('review'));

  // View all link
  $('view-all-link').addEventListener('click', ()=>nav('wordlist'));

  // Add word form
  $('inp-zh').addEventListener('input', ()=>{ const v=$('inp-zh').value; $('pinyin-preview').textContent = getPinyin(v)||''; lookupDict(v); });
  $('add-word-btn').addEventListener('click', addWord);
  $('inp-vi').addEventListener('keydown', e=>{ if(e.key==='Enter') addWord(); });

  // Article buttons
  $('go-upload-btn').addEventListener('click', ()=>nav('upload-article'));
  $('save-article-btn').addEventListener('click', saveArticle);
  $('cancel-upload-btn').addEventListener('click', ()=>nav('articles'));
  $('back-articles-btn').addEventListener('click', ()=>nav('articles'));

  // Sort buttons
  $('sort-newest-btn').addEventListener('click', ()=>{
    articleSortOrder='newest';
    $('sort-newest-btn').classList.add('active');
    $('sort-oldest-btn').classList.remove('active');
    renderArticlesList();
  });
  $('sort-oldest-btn').addEventListener('click', ()=>{
    articleSortOrder='oldest';
    $('sort-oldest-btn').classList.add('active');
    $('sort-newest-btn').classList.remove('active');
    renderArticlesList();
  });

  // Image URL preview
  $('article-image-inp').addEventListener('input', ()=>{
    const url = $('article-image-inp').value.trim();
    const preview = $('article-image-preview');
    const thumb   = $('article-img-thumb');
    if(url){ preview.style.display='block'; thumb.src=url; }
    else    { preview.style.display='none'; thumb.src=''; }
  });
  $('art-inp-zh').addEventListener('input', ()=>{
    const v=$('art-inp-zh').value.trim();
    $('art-pinyin-preview').textContent = getPinyin(v)||'';
    artLookupDict(v);
  });
  $('art-add-word-btn').addEventListener('click', ()=>{
    const zh=$('art-inp-zh').value.trim(), vi=$('art-inp-vi').value.trim();
    const exZh=$('art-inp-ex-zh').value.trim(), exVi=$('art-inp-ex-vi').value.trim();
    const w = addWordFromArticle(zh, vi, exZh, exVi);
    if(w){
      $('art-inp-zh').value=''; $('art-inp-vi').value='';
      $('art-inp-ex-zh').value=''; $('art-inp-ex-vi').value='';
      $('art-pinyin-preview').textContent='';
      toast(`✓ Đã thêm: ${zh}`);
      const article = db.articles.find(a=>a.id===currentArticleId);
      if(article) renderArticleAddedWords(article);
    }
  });

  $('art-review-back-btn').addEventListener('click', ()=>nav('read-article'));
  $('start-art-review-btn').addEventListener('click', ()=>startArticleReview());

  // Word list search
  $('search-input').addEventListener('input', e=>renderWordList(e.target.value));
}

// ─── SM-2 ALGORITHM ──────────────────────────────────────────────────────────
function sm2(w, g){
  let {ef=2.5, interval=0, repetitions=0} = w;
  if(g===0){ repetitions=0; interval=1; }
  else if(g===1){ interval=Math.max(1, Math.round(interval*1.2)); ef=Math.max(1.3,ef-0.15); }
  else if(g===2){ interval=repetitions===0?1:repetitions===1?4:Math.round(interval*ef); repetitions++; ef=Math.max(1.3,ef-0.08); }
  else          { interval=repetitions===0?4:Math.round(interval*ef*1.3);                 repetitions++; ef=Math.max(1.3,ef+0.15); }
  w.ef=ef; w.interval=interval; w.repetitions=repetitions;
  w.nextReview=Date.now()+interval*864e5; w.lastReview=Date.now();
  w.status=repetitions>=3?'mastered':repetitions>=1?'review':'learning';
}
function intLabel(g, w){
  const {ef=2.5,interval=0,repetitions=0}=w;
  if(g===0) return '<10 phút';
  if(g===1) return `${Math.max(1,Math.round(interval*1.2))} ngày`;
  if(g===2) return repetitions===0?'1 ngày':repetitions===1?'4 ngày':`${Math.round(interval*ef)} ngày`;
  return repetitions===0?'4 ngày':`${Math.round(interval*ef*1.3)} ngày`;
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function renderDashboard(){
  const words=db.words, now=Date.now(), today=new Date().toISOString().split('T')[0];
  const due=words.filter(w=>!w.nextReview||w.nextReview<=now);
  $('stat-total').textContent    = words.length;
  $('stat-due').textContent      = due.length;
  $('stat-learned').textContent  = words.filter(w=>w.repetitions>0).length;
  $('stat-mastered').textContent = words.filter(w=>w.status==='mastered').length;
  $('stat-today').textContent    = db.sessions[today]||0;
  $('stat-accuracy').textContent = db.total>0 ? Math.round(db.correct/db.total*100) : '—';

  let streak=0, d=new Date();
  while(true){ const k=d.toISOString().split('T')[0]; if((db.sessions[k]||0)>0){ streak++; d.setDate(d.getDate()-1); } else break; }
  $('stat-streak').textContent = streak;

  const banner=$('due-banner');
  if(due.length){ banner.style.display='block'; $('due-banner-text').textContent=`${due.length} từ cần ôn tập ngay!`; }
  else { banner.style.display='none'; }

  // Heatmap
  const hm=$('heatmap'); hm.innerHTML='';
  const td=new Date();
  for(let w=11;w>=0;w--){
    const col=document.createElement('div'); col.className='heatmap-week';
    for(let dy=0;dy<7;dy++){
      const dt=new Date(td); dt.setDate(dt.getDate()-w*7-dy);
      const k=dt.toISOString().split('T')[0]; const c=db.sessions[k]||0;
      const cell=document.createElement('div');
      cell.className='heatmap-cell'+(c===0?'':c<3?' l1':c<7?' l2':c<15?' l3':' l4');
      cell.title=`${k}: ${c} từ`; col.appendChild(cell);
    }
    hm.appendChild(col);
  }

  // Recent words
  const rw=$('recent-words');
  const recent=[...words].reverse().slice(0,6);
  rw.innerHTML=recent.length
    ? recent.map(w=>`<div class="word-tile"><div class="zh">${w.zh}</div><div class="py">${w.pinyin}</div><div class="vi">${w.vi}</div></div>`).join('')
    : `<div style="color:var(--text3);font-size:14px;grid-column:1/-1">Chưa có từ. <span style="color:var(--red);cursor:pointer" id="add-first-link">Thêm từ đầu tiên!</span></div>`;
  document.getElementById('add-first-link')?.addEventListener('click', ()=>nav('add'));
}

// ─── REVIEW ───────────────────────────────────────────────────────────────────
function startReview(){
  reviewQueue = db.words.filter(w=>!w.nextReview||w.nextReview<=Date.now()).map(w=>({...w})).sort(()=>Math.random()-0.5);
  answered=false;
  renderReviewCard();
}

function renderReviewCard(){
  const rc=$('review-content'), rs=$('review-subtitle');
  if(!reviewQueue.length){
    rs.textContent='';
    rc.innerHTML=`<div class="empty-state"><div class="emoji">🎉</div><h3>Tuyệt vời! Đã hoàn thành!</h3><p>Không có từ cần ôn. Thêm từ mới hoặc quay lại sau!</p></div>`;
    const btn=document.createElement('button'); btn.className='submit-btn'; btn.style.marginTop='20px'; btn.textContent='+ Thêm từ mới'; btn.addEventListener('click',()=>nav('add')); rc.querySelector('.empty-state').appendChild(btn);
    return;
  }
  currentCard=reviewQueue[0];
  const total=db.words.filter(w=>!w.nextReview||w.nextReview<=Date.now()).length;
  rs.textContent=`Còn ${reviewQueue.length} từ cần ôn`;

  rc.innerHTML=`
    <div class="review-progress"><div class="review-progress-fill" style="width:${Math.max(0,(total-reviewQueue.length)/Math.max(total,1)*100)}%"></div></div>
    <div class="review-card">
      <div class="review-vi">NGHĨA TIẾNG VIỆT</div>
      <div class="review-word">${currentCard.vi}</div>
      ${currentCard.exVi?`<div style="font-size:13px;color:var(--text2);margin-top:14px;padding:11px 16px;background:var(--surface2);border-radius:8px;text-align:left;border:1px solid var(--border)"><div style="font-family:'Noto Sans SC',sans-serif;font-size:14px;margin-bottom:4px">${currentCard.exZh||''}</div><div>${currentCard.exVi}</div></div>`:''}
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

  const inp=$('answer-input');
  inp.focus();
  inp.addEventListener('input',  ()=>{ const el=$('live-pinyin'); if(el) el.textContent=getPinyin(inp.value); });
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') checkAnswer(); });
  $('check-btn').addEventListener('click', checkAnswer);
  rc.querySelectorAll('.diff-btn').forEach(btn=>btn.addEventListener('click',()=>gradeCard(parseInt(btn.dataset.grade))));
  answered=false;
}

function checkAnswer(){
  if(answered) return;
  const inp=$('answer-input');
  if(!inp?.value.trim()) return;
  answered=true;
  const ok = inp.value.trim() === currentCard.zh;
  db.total++; if(ok) db.correct++;
  const today=new Date().toISOString().split('T')[0];
  db.sessions[today]=(db.sessions[today]||0)+1;
  save();
  const fb=$('feedback-bar'), ca=$('correct-ans');
  if(ok){ inp.classList.add('correct'); fb.className='feedback-bar correct'; fb.textContent='✓ Chính xác!'; ca.style.display='none'; }
  else  { inp.classList.add('wrong');   fb.className='feedback-bar wrong';   fb.textContent='✗ Sai rồi!';    ca.style.display='block'; ca.textContent=`Đáp án đúng: ${currentCard.zh} (${currentCard.pinyin})`; }
  $('diff-btns').style.display='grid';
  $('check-btn').textContent='Chọn mức độ khó →';
  $('check-btn').disabled=true;
  for(let g=0;g<4;g++){ const el=$(`i${g}`); if(el) el.textContent=intLabel(g,currentCard); }
}

function gradeCard(g){
  const w=db.words.find(x=>x.id===currentCard.id);
  if(w){ sm2(w,g); save(); }
  reviewQueue.shift(); answered=false; renderReviewCard();
}

// ─── ARTICLE REVIEW (isolated — no db stat writes) ───────────────────────────
let artReviewQueue   = [];
let artReviewCard    = null;
let artReviewAnswered= false;
let artReviewCorrect = 0;
let artReviewTotal   = 0;
let artReviewInitial = 0;

function sm2Local(w, g){
  let {ef=2.5, interval=0, repetitions=0} = w;
  if(g===0){ repetitions=0; interval=1; }
  else if(g===1){ interval=Math.max(1,Math.round(interval*1.2)); ef=Math.max(1.3,ef-0.15); }
  else if(g===2){ interval=repetitions===0?1:repetitions===1?4:Math.round(interval*ef); repetitions++; ef=Math.max(1.3,ef-0.08); }
  else          { interval=repetitions===0?4:Math.round(interval*ef*1.3);                repetitions++; ef=Math.max(1.3,ef+0.15); }
  w.ef=ef; w.interval=interval; w.repetitions=repetitions;
  w._localNext = Date.now() + interval*864e5;
}

function startArticleReview(){
  const article = db.articles.find(a=>a.id===currentArticleId);
  if(!article){ toast('Không tìm thấy bài báo!'); return; }
  const ids = article.linkedWords||[];
  if(!ids.length){ toast('Bài báo này chưa có từ nào để luyện tập!'); return; }
  const words = db.words.filter(w=>ids.includes(w.id));
  if(!words.length){ toast('Không tìm thấy từ!'); return; }

  artReviewQueue    = words.map(w=>({...w})).sort(()=>Math.random()-0.5);
  artReviewInitial  = artReviewQueue.length;
  artReviewCorrect  = 0;
  artReviewTotal    = 0;
  artReviewAnswered = false;
  artReviewCard     = null;

  $('art-review-title').textContent = article.title;
  nav('article-review');
  renderArtReviewCard();
}

function renderArtReviewCard(){
  const rc = $('art-review-content');

  if(!artReviewQueue.length){
    const pct = artReviewTotal > 0 ? Math.round(artReviewCorrect/artReviewTotal*100) : 0;
    const grade = pct>=90?'🏆 Xuất sắc!':pct>=70?'🎉 Tốt lắm!':pct>=50?'💪 Cần cố thêm!':'📚 Hãy ôn thêm nhé!';
    rc.innerHTML = `
      <div class="review-card" style="text-align:center">
        <div style="font-size:52px;margin-bottom:16px">${pct>=70?'🎉':'📖'}</div>
        <div style="font-size:22px;font-weight:700;margin-bottom:6px">${grade}</div>
        <div style="font-size:14px;color:var(--text2);margin-bottom:28px">Bạn đã hoàn thành luyện tập từ của bài báo này</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px">
          <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--border)">
            <div style="font-size:28px;font-weight:700;letter-spacing:-0.03em">${artReviewInitial}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Từ đã học</div>
          </div>
          <div style="background:var(--green-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--green-border)">
            <div style="font-size:28px;font-weight:700;letter-spacing:-0.03em;color:var(--green)">${artReviewCorrect}</div>
            <div style="font-size:11px;color:var(--green);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Trả lời đúng</div>
          </div>
          <div style="background:var(--red-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--red-mid)">
            <div style="font-size:28px;font-weight:700;letter-spacing:-0.03em;color:var(--red)">${pct}%</div>
            <div style="font-size:11px;color:var(--red);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Độ chính xác</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="submit-btn" id="art-review-again-btn" style="padding:11px 24px">🔄 Luyện lại</button>
          <button id="art-review-done-btn" style="padding:11px 24px;background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">← Về bài báo</button>
        </div>
      </div>`;
    $('art-review-again-btn').addEventListener('click', startArticleReview);
    $('art-review-done-btn').addEventListener('click', ()=>nav('read-article'));
    return;
  }

  artReviewCard = artReviewQueue[0];
  const done = artReviewInitial - artReviewQueue.length;
  const pct  = Math.max(0, done/artReviewInitial*100);

  rc.innerHTML = `
    <div class="review-progress"><div class="review-progress-fill" style="width:${pct}%"></div></div>
    <div style="font-size:12px;color:var(--text3);text-align:right;margin-bottom:14px;margin-top:-20px">
      ${done}/${artReviewInitial} từ · ${artReviewCorrect} đúng
    </div>
    <div class="review-card">
      <div class="review-vi">NGHĨA TIẾNG VIỆT</div>
      <div class="review-word">${artReviewCard.vi}</div>
      ${artReviewCard.exVi ? `<div style="font-size:13px;color:var(--text2);margin-top:14px;padding:11px 16px;background:var(--surface2);border-radius:8px;text-align:left;border:1px solid var(--border)"><div style="font-family:'Noto Sans SC',sans-serif;font-size:14px;margin-bottom:4px">${artReviewCard.exZh||''}</div><div>${artReviewCard.exVi}</div></div>` : ''}
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

  const inp = $('art-answer-input');
  inp.focus();
  inp.addEventListener('input',  ()=>{ const el=$('art-live-pinyin'); if(el) el.textContent=getPinyin(inp.value); });
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter') artCheckAnswer(); });
  $('art-check-btn').addEventListener('click', artCheckAnswer);
  rc.querySelectorAll('.diff-btn').forEach(btn=>btn.addEventListener('click',()=>artGradeCard(parseInt(btn.dataset.grade))));
  artReviewAnswered = false;
}

function artCheckAnswer(){
  if(artReviewAnswered) return;
  const inp = $('art-answer-input');
  if(!inp?.value.trim()) return;
  artReviewAnswered = true;
  artReviewTotal++;
  const ok = inp.value.trim() === artReviewCard.zh;
  if(ok) artReviewCorrect++;
  const fb=$('art-feedback-bar'), ca=$('art-correct-ans');
  if(ok){ inp.classList.add('correct'); fb.className='feedback-bar correct'; fb.textContent='✓ Chính xác!'; ca.style.display='none'; }
  else  { inp.classList.add('wrong');   fb.className='feedback-bar wrong';   fb.textContent='✗ Sai rồi!';   ca.style.display='block'; ca.textContent=`Đáp án đúng: ${artReviewCard.zh} (${artReviewCard.pinyin})`; }
  $('art-diff-btns').style.display='grid';
  $('art-check-btn').textContent='Chọn mức độ khó →';
  $('art-check-btn').disabled=true;
  for(let g=0;g<4;g++){ const el=$(`ai${g}`); if(el) el.textContent=intLabel(g,artReviewCard); }
}

function artGradeCard(g){
  sm2Local(artReviewCard, g);
  artReviewQueue.shift();
  if(g===0 && artReviewQueue.length > 0){
    const slot = Math.min(3, artReviewQueue.length);
    artReviewQueue.splice(slot, 0, {...artReviewCard});
  }
  artReviewAnswered = false;
  renderArtReviewCard();
}

// ─── ADD WORD ─────────────────────────────────────────────────────────────────
function addWord(){
  const zh=$('inp-zh').value.trim(), vi=$('inp-vi').value.trim();
  if(!zh||!vi){ toast('Vui lòng nhập chữ Hán và nghĩa!'); return; }
  db.words.push({ id:Date.now(), zh, vi, pinyin:getPinyin(zh), exZh:$('inp-ex-zh').value.trim(), exVi:$('inp-ex-vi').value.trim(), status:'new', ef:2.5, interval:0, repetitions:0, nextReview:null, lastReview:null, added:Date.now() });
  save();
  ['inp-zh','inp-vi','inp-ex-zh','inp-ex-vi'].forEach(id=>$(id).value='');
  $('pinyin-preview').textContent='';
  toast(`✓ Đã thêm: ${zh}`);
}

// ─── WORD LIST ────────────────────────────────────────────────────────────────
function renderWordList(q=''){
  q=q.toLowerCase();
  const now=Date.now();
  const base = _wf==='due'     ? db.words.filter(w=>!w.nextReview||w.nextReview<=now)
              :_wf==='learned' ? db.words.filter(w=>w.repetitions>0&&w.status!=='mastered')
              :_wf==='mastered'? db.words.filter(w=>w.status==='mastered')
              : db.words;
  const labels={all:'Tất cả từ',due:'Cần ôn tập',learned:'Đã học',mastered:'Thành thạo'};
  $('wordlist-count').textContent=`${db.words.length} từ trong thư viện`;
  $('wordlist-filter-pill').innerHTML=_wf!=='all'
    ? `<div class="filter-pill f${_wf}">${labels[_wf]} <span class="filter-clear" id="clear-filter">✕</span></div>`:'';
  document.getElementById('clear-filter')?.addEventListener('click',()=>{ _wf='all'; renderWordList($('search-input').value||''); });

  const filtered=base.filter(w=>!q||w.zh.includes(q)||w.vi.toLowerCase().includes(q)||w.pinyin.toLowerCase().includes(q));
  const sl={new:'Mới',learning:'Đang học',review:'Ôn tập',mastered:'Thành thạo'};
  const sb={new:'badge-new',learning:'badge-learning',review:'badge-review',mastered:'badge-mastered'};
  const tbody=$('word-table-body');
  tbody.innerHTML=filtered.length
    ? [...filtered].reverse().map(w=>`<tr>
        <td style="font-family:'Noto Serif SC',serif;font-size:19px;font-weight:600">${w.zh}</td>
        <td style="color:var(--red);font-weight:500">${w.pinyin}</td>
        <td>${w.vi}</td>
        <td><span class="badge ${sb[w.status]||'badge-new'}">${sl[w.status]||'Mới'}</span></td>
        <td style="color:var(--text2);font-size:13px">${!w.nextReview?'Ngay bây giờ':new Date(w.nextReview).toLocaleDateString('vi-VN')}</td>
        <td><button class="del-btn" data-id="${w.id}">✕</button></td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:28px">Không tìm thấy từ nào.</td></tr>';

  tbody.querySelectorAll('.del-btn').forEach(btn=>btn.addEventListener('click',()=>deleteWord(Number(btn.dataset.id))));
}

function deleteWord(id){
  if(!confirm('Xoá từ này?')) return;
  db.words=db.words.filter(w=>w.id!==id);
  save(); renderWordList($('search-input')?.value||''); toast('Đã xoá từ.');
}

// ─── ARTICLES ─────────────────────────────────────────────────────────────────
let currentArticleId = null;
let articleSortOrder = 'newest'; // 'newest' | 'oldest'

function renderArticlesList(){
  const container = $('articles-list');
  if(!db.articles || !db.articles.length){
    container.innerHTML = `<div class="empty-state"><div class="emoji">📰</div><h3>Chưa có bài báo nào</h3><p>Upload bài báo tiếng Trung để học từ mới từ ngữ cảnh thực tế!</p></div>`;
    return;
  }
  const sorted = [...db.articles].sort((a,b) => articleSortOrder==='newest' ? b.added-a.added : a.added-b.added);
  container.innerHTML = sorted.map(a => `
    <div class="article-card" data-id="${a.id}">
      ${a.imageUrl ? `<img class="article-card-img" src="${a.imageUrl}" alt="" onerror="this.style.display='none'">` : ''}
      <div style="flex:1;min-width:0">
        <div class="article-card-title">${a.title}</div>
        <div class="article-card-meta">${a.source ? '📰 '+a.source+' · ' : ''}${new Date(a.added).toLocaleDateString('vi-VN')} · ${a.wordCount||0} từ · ${a.addedWords||0} từ đã học</div>
        <div class="article-card-preview">${(a.body||'').slice(0,80)}...</div>
      </div>
      <div class="article-card-actions">
        <button class="article-del-btn" data-del="${a.id}" title="Xoá">✕</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.article-card').forEach(card => {
    card.addEventListener('click', e => {
      if(e.target.closest('[data-del]')) return;
      openArticle(Number(card.dataset.id));
    });
  });
  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if(!confirm('Xoá bài báo này?')) return;
      db.articles = db.articles.filter(a=>a.id!==Number(btn.dataset.del));
      save(); renderArticlesList(); toast('Đã xoá bài báo.');
    });
  });
}

function saveArticle(){
  const title = $('article-title-inp').value.trim();
  const body  = $('article-body-inp').value.trim();
  if(!title || !body){ toast('Vui lòng nhập tiêu đề và nội dung!'); return; }
  const article = {
    id: Date.now(), title,
    source: $('article-source-inp').value.trim(),
    imageUrl: $('article-image-inp').value.trim(),
    body, wordCount: body.length,
    addedWords: 0, added: Date.now()
  };
  if(!db.articles) db.articles = [];
  db.articles.push(article);
  save();
  $('article-title-inp').value='';
  $('article-source-inp').value='';
  $('article-image-inp').value='';
  $('article-body-inp').value='';
  toast(`✓ Đã lưu: ${title}`);
  nav('articles');
}

function openArticle(id){
  const article = db.articles.find(a=>a.id===id);
  if(!article) return;
  currentArticleId = id;
  $('read-article-title').textContent = article.title;
  $('read-article-source').textContent = article.source || '';

  let readerImgEl = $('reader-article-img');
  if(!readerImgEl){
    readerImgEl = document.createElement('img');
    readerImgEl.id = 'reader-article-img';
    readerImgEl.style.cssText = 'width:100%;max-height:220px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--border)';
    $('article-reader-body').parentElement.insertBefore(readerImgEl, $('article-reader-body').parentElement.firstChild.nextSibling);
  }
  if(article.imageUrl){ readerImgEl.src=article.imageUrl; readerImgEl.style.display='block'; readerImgEl.onerror=()=>readerImgEl.style.display='none'; }
  else { readerImgEl.style.display='none'; readerImgEl.src=''; }

  let html = article.body.replace(/\n/g,'<br>');
  const linkedWords = db.words.filter(w=>(article.linkedWords||[]).includes(w.id));
  linkedWords.sort((a,b)=>b.zh.length - a.zh.length);
  linkedWords.forEach(w=>{ html = applyHighlightToHtml(html, w.zh); });
  $('article-reader-body').innerHTML = html;

  $('art-inp-zh').value=''; $('art-inp-vi').value='';
  $('art-inp-ex-zh').value=''; $('art-inp-ex-vi').value='';
  $('art-pinyin-preview').textContent='';
  renderArticleAddedWords(article);
  nav('read-article');
  setupTextSelection();
}

function renderArticleAddedWords(article){
  const wordsDiv = $('article-added-words');
  const ids = article.linkedWords||[];
  if(!ids.length){ wordsDiv.textContent='Chưa có từ nào.'; return; }
  const words = db.words.filter(w=>ids.includes(w.id));
  wordsDiv.innerHTML = words.map(w=>`
    <div class="added-word-row">
      <span class="added-word-zh">${w.zh}</span>
      <span class="added-word-py">${w.pinyin}</span>
      <span class="added-word-vi">${w.vi}</span>
    </div>
  `).join('');
}

function addWordFromArticle(zh, vi, exZh='', exVi=''){
  if(!zh||!vi){ toast('Vui lòng nhập chữ Hán và nghĩa!'); return false; }
  const article = db.articles.find(a=>a.id===currentArticleId);
  if(article && article.linkedWords){
    const alreadyAdded = db.words.find(w=>w.zh===zh && article.linkedWords.includes(w.id));
    if(alreadyAdded){ toast(`"${zh}" đã được thêm rồi`); return false; }
  }
  const newWord = { id:Date.now(), zh, vi, pinyin:getPinyin(zh), exZh, exVi, status:'new', ef:2.5, interval:0, repetitions:0, nextReview:null, lastReview:null, added:Date.now() };
  db.words.push(newWord);
  if(article){
    if(!article.linkedWords) article.linkedWords=[];
    article.linkedWords.push(newWord.id);
    article.addedWords = article.linkedWords.length;
    highlightWord(zh);
  }
  save();
  return newWord;
}

function applyHighlightToHtml(html, zh){
  if(!zh) return html;
  const escaped = zh.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return html.replace(new RegExp(`(?<!<[^>]*)${escaped}(?![^<]*>)`, 'g'), match => {
    return `<span class="word-highlight" title="${zh}">${match}</span>`;
  });
}

function highlightWord(zh){
  const body = $('article-reader-body');
  if(!body || !zh) return;
  body.innerHTML = applyHighlightToHtml(body.innerHTML, zh);
}

function setupTextSelection(){
  const body = $('article-reader-body');
  const popup = $('selection-popup');
  if(!body) return;

  document.addEventListener('mouseup', e => {
    if(popup.contains(e.target)) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if(!text || !body.contains(sel?.anchorNode)){
      popup.style.display='none'; return;
    }
    if(text.length < 1 || text.length > 10){ popup.style.display='none'; return; }
    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    $('popup-word').textContent = text;
    $('popup-pinyin').textContent = getPinyin(text);
    $('popup-vi-inp').value = '';
    $('popup-ex-zh-inp').value = '';
    $('popup-ex-vi-inp').value = '';
    if(dictData && dictData[text]){
      $('popup-vi-inp').value = dictData[text].split(';')[0].trim();
    } else if(!dictData){
      loadDict().then(()=>{ if(dictData && dictData[text]) $('popup-vi-inp').value = dictData[text].split(';')[0].trim(); });
    }
    popup.style.display = 'block';
    const popupH = popup.offsetHeight || 200;
    const popupW = popup.offsetWidth  || 280;
    const margin  = 10;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    let top;
    if(spaceAbove >= popupH + margin){
      top = rect.top + window.scrollY - popupH - margin;
    } else if(spaceBelow >= popupH + margin){
      top = rect.bottom + window.scrollY + margin;
    } else {
      top = spaceAbove > spaceBelow
        ? Math.max(window.scrollY + margin, rect.top + window.scrollY - popupH - margin)
        : rect.bottom + window.scrollY + margin;
    }
    const left = Math.min(
      Math.max(margin, rect.left + window.scrollX),
      window.innerWidth - popupW - margin
    );
    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
    setTimeout(()=>$('popup-vi-inp').focus(), 50);
  });

  $('popup-cancel-btn').addEventListener('click', ()=>{ popup.style.display='none'; window.getSelection()?.removeAllRanges(); });

  $('popup-add-btn').addEventListener('click', ()=>{
    const zh = $('popup-word').textContent.trim();
    const vi = $('popup-vi-inp').value.trim();
    const exZh = $('popup-ex-zh-inp').value.trim();
    const exVi = $('popup-ex-vi-inp').value.trim();
    const w = addWordFromArticle(zh, vi, exZh, exVi);
    if(w){
      toast(`✓ Đã thêm: ${zh}`);
      popup.style.display='none';
      window.getSelection()?.removeAllRanges();
      const article = db.articles.find(a=>a.id===currentArticleId);
      if(article) renderArticleAddedWords(article);
    } else {
      toast('Vui lòng nhập nghĩa!');
    }
  });

  $('popup-vi-inp').addEventListener('keydown', e=>{ if(e.key==='Enter') $('popup-ex-zh-inp').focus(); });
  $('popup-ex-zh-inp').addEventListener('keydown', e=>{ if(e.key==='Enter') $('popup-ex-vi-inp').focus(); });
  $('popup-ex-vi-inp').addEventListener('keydown', e=>{ if(e.key==='Enter') $('popup-add-btn').click(); });
}

function artLookupDict(zh){
  const viInp = $('art-inp-vi');
  if(!zh){ viInp.style.borderColor=''; viInp.placeholder='e.g. kinh tế'; return; }
  if(!dictData){
    loadDict().then(()=>artLookupDict($('art-inp-zh').value.trim()));
    return;
  }
  const found = dictData[zh];
  if(found){
    if(!viInp.value.trim()){
      viInp.value = found.split(';')[0].trim();
      viInp.style.borderColor = 'var(--green)';
      viInp.style.boxShadow = '0 0 0 3px rgba(23,122,71,0.12)';
      setTimeout(()=>{ viInp.style.borderColor=''; viInp.style.boxShadow=''; }, 1800);
    }
  } else if(zh.length > 1){
    const firstChar = dictData[[...zh][0]];
    if(firstChar){ viInp.placeholder = '→ ' + firstChar.split(';')[0].trim() + '...'; }
  }
}

// ─── DARK MODE ───────────────────────────────────────────────────────────────
function initDarkMode(){
  if(localStorage.getItem('hanzi_dark')==='1') document.body.classList.add('dark');
  $('dark-toggle').addEventListener('click', ()=>{
    document.body.classList.toggle('dark');
    localStorage.setItem('hanzi_dark', document.body.classList.contains('dark') ? '1' : '0');
  });
}

// ─── MOBILE MENU ─────────────────────────────────────────────────────────────
function initMobileMenu(){
  const btn = $('menu-btn'), sidebar = $('sidebar'), overlay = $('sidebar-overlay');
  btn.addEventListener('click', ()=>{ sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
  overlay.addEventListener('click', ()=>{ sidebar.classList.remove('open'); overlay.classList.remove('open'); });
  sidebar.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click', ()=>{ sidebar.classList.remove('open'); overlay.classList.remove('open'); });
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
document.getElementById('google-signin-btn').addEventListener('click', async () => {
  const errEl = document.getElementById('login-err');
  if(errEl) errEl.textContent = '';
  try {
    await signInWithPopup(auth, provider);
  } catch(e) {
    console.error('Sign-in error:', e);
    if(errEl) errEl.textContent = 'Đăng nhập thất bại: ' + (e.message || e.code || 'Lỗi không xác định');
  }
});

document.getElementById('signout-btn').addEventListener('click', async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async user => {
  const loginScreen   = document.getElementById('login-screen');
  const loadingScreen = document.getElementById('loading');
  const userRow       = document.getElementById('user-row');
  if (user) {
    loginScreen.style.display = 'none';
    document.getElementById('user-name').textContent  = user.displayName || 'Người dùng';
    document.getElementById('user-email').textContent = user.email || '';
    const wrap = document.getElementById('user-avatar-wrap');
    if(user.photoURL){
      wrap.innerHTML = `<img class="user-avatar" src="${user.photoURL}" referrerpolicy="no-referrer">`;
    } else {
      wrap.innerHTML = `<div class="user-avatar-fallback">${(user.displayName||'?')[0].toUpperCase()}</div>`;
    }
    if(userRow) userRow.style.display = 'flex';
    currentUserId = user.uid;
    DB_DOC = doc(firestore, 'users', user.uid, 'data', 'main');
    db = { words:[], sessions:{}, correct:0, total:0, articles:[] };
    await init();
  } else {
    currentUserId = null;
    DB_DOC = null;
    db = { words:[], sessions:{}, correct:0, total:0, articles:[] };
    if(loadingScreen) loadingScreen.style.display = 'none';
    if(userRow) userRow.style.display = 'none';
    loginScreen.style.display = 'flex';
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
loadDict();
initDarkMode();
initMobileMenu();
