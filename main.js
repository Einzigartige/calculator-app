/**
 * main.js (module) — Calculator with:
 *  - History panel (persistent)
 *  - Settings panel (persistent)
 *  - PWA install prompt + service worker registration
 *  - Scientific mode
 *  - Safe expression evaluation (shunting-yard + RPN)
 *
 * Put this file as `main.js` and ensure manifest.json and sw.js exist.
 */

const display = document.getElementById('display');
const buttons = document.querySelectorAll('.btn');
const sciPanel = document.getElementById('sciPanel');
const modeToggle = document.getElementById('modeToggle');
const themeToggle = document.getElementById('themeToggle');
const openSettingsBtn = document.getElementById('openSettings');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettingsBtn = document.getElementById('closeSettings');
const themeSelect = document.getElementById('themeSelect');
const soundToggle = document.getElementById('soundToggle');
const sciDefault = document.getElementById('sciDefault');
const historySizeInput = document.getElementById('historySize');
const historyListEl = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const exportHistoryBtn = document.getElementById('exportHistory');
const importHistoryBtn = document.getElementById('importHistory');
const importFileInput = document.getElementById('importFile');
const installBtn = document.getElementById('installBtn');

const sfx = {
  click: document.getElementById('sfx-click'),
  delete: document.getElementById('sfx-delete'),
  clear: document.getElementById('sfx-clear'),
  equals: document.getElementById('sfx-equals'),
};

// localStorage keys
const LS = {
  settings: 'calc_settings_v1',
  history: 'calc_history_v1',
};

let state = {
  expr: '',
  history: [], // {expr, result, ts}
  settings: {
    theme: 'auto', // auto|dark|light
    sound: true,
    sciDefault: false,
    historySize: 50
  }
};

// ---------- Utilities: sound ----------
function playSound(name){
  if (!state.settings.sound) return;
  const a = sfx[name];
  if (!a) return;
  try { a.currentTime = 0; a.play(); } catch(e) { /* ignore autoplay blocking */ }
}

// ---------- Manage settings ----------
function loadSettings(){
  const raw = localStorage.getItem(LS.settings);
  if (raw) {
    try { Object.assign(state.settings, JSON.parse(raw)); } catch {}
  }
  themeSelect.value = state.settings.theme || 'auto';
  soundToggle.checked = !!state.settings.sound;
  sciDefault.checked = !!state.settings.sciDefault;
  historySizeInput.value = state.settings.historySize || 50;
  applyTheme();
}
function saveSettings(){
  localStorage.setItem(LS.settings, JSON.stringify(state.settings));
  applyTheme();
}

function applyTheme(){
  if (state.settings.theme === 'light') document.body.classList.add('light');
  else if (state.settings.theme === 'dark') document.body.classList.remove('light');
  else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) document.body.classList.remove('light'); else document.body.classList.add('light');
  }
  const metaTheme = document.getElementById('meta-theme-color');
  metaTheme.setAttribute('content', document.body.classList.contains('light') ? '#f5f7fb' : '#11142a');
  themeToggle.textContent = document.body.classList.contains('light') ? '🌞' : '🌙';
}

// ---------- History ----------
function loadHistory(){
  const raw = localStorage.getItem(LS.history);
  state.history = raw ? JSON.parse(raw) : [];
  renderHistory();
}
function saveHistory(){
  localStorage.setItem(LS.history, JSON.stringify(state.history.slice(0, state.settings.historySize)));
}
function addHistory(expr, result){
  const entry = {expr, result, ts: Date.now()};
  state.history.unshift(entry);
  if (state.history.length > state.settings.historySize) state.history.length = state.settings.historySize;
  saveHistory();
  renderHistory();
}
function clearHistory(){
  state.history = [];
  saveHistory();
  renderHistory();
}
function renderHistory(){
  historyListEl.innerHTML = '';
  if (!state.history.length){
    historyListEl.innerHTML = `<div class="history-empty" style="padding:12px;color:var(--muted)">No history yet</div>`;
    return;
  }
  state.history.forEach((h,i) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <div>
        <div class="expr">${h.expr}</div>
        <div class="meta">${new Date(h.ts).toLocaleString()}</div>
      </div>
      <div style="text-align:right">
        <div class="result">${h.result}</div>
        <div style="margin-top:6px;">
          <button class="reuse" data-i="${i}" title="Reuse">↩</button>
          <button class="del" data-i="${i}" title="Delete">✖</button>
        </div>
      </div>
    `;
    el.querySelector('.reuse').addEventListener('click', (ev)=>{ ev.stopPropagation(); state.expr = h.expr; updateDisplay(state.expr); });
    el.querySelector('.del').addEventListener('click', (ev)=>{ ev.stopPropagation(); state.history.splice(i,1); saveHistory(); renderHistory(); });
    el.addEventListener('click', ()=>{ state.expr = h.expr; updateDisplay(state.expr); });
    historyListEl.appendChild(el);
  });
}

// ---------- Safe evaluation ----------
const FUNCTIONS = new Set(['sin','cos','tan','sqrt','ln','log10']);
const OPERATORS = { '+':{prec:2,assoc:'L'}, '-':{prec:2,assoc:'L'}, '*':{prec:3,assoc:'L'}, '/':{prec:3,assoc:'L'}, '%':{prec:3,assoc:'L'}, '^':{prec:4,assoc:'R'} };

function isDigit(ch){ return /\d/.test(ch); }
function isLetter(ch){ return /[a-zA-Z]/.test(ch); }

function tokenize(input){
  const tokens = [];
  let i=0;
  while(i<input.length){
    const ch=input[i];
    if(/\s/.test(ch)){i++;continue;}
    if(ch==='('||ch===')'){tokens.push(ch);i++;continue;}
    if(ch===','){tokens.push(',');i++;continue;}
    if('+-*/%^'.includes(ch)){
      if(ch==='-' && (tokens.length===0||['(',','].includes(tokens[tokens.length-1])||Object.keys(OPERATORS).includes(tokens[tokens.length-1]))){
        let j=i+1,num='-';
        while(j<input.length && (isDigit(input[j])||input[j]==='.')){num+=input[j];j++;}
        if(num!=='-'){tokens.push(num);i=j;continue;}
      }
      tokens.push(ch);i++;continue;
    }
    if(isDigit(ch)||(ch==='.' && isDigit(input[i+1]))){let j=i,num='';while(j<input.length&&(isDigit(input[j])||input[j]==='.')){num+=input[j];j++;}tokens.push(num);i=j;continue;}
    if(isLetter(ch)){let j=i,name='';while(j<input.length && (isLetter(input[j])||isDigit(input[j]))){name+=input[j];j++;}name=name.toLowerCase();if(name==='pi'){tokens.push('PI');}else if(FUNCTIONS.has(name)){tokens.push(name);}else{throw new Error('Unknown identifier: '+name);}i=j;continue;}
    throw new Error('Unexpected character: '+ch);
  }
  return tokens;
}
function toRPN(tokens){
  const out=[],stack=[];
  tokens.forEach(tok=>{
    if(!isNaN(tok)){out.push({type:'num',value:parseFloat(tok)});return;}
    if(tok==='PI'){out.push({type:'num',value:Math.PI});return;}
    if(FUNCTIONS.has(tok)){stack.push({type:'fn',value:tok});return;}
    if(Object.keys(OPERATORS).includes(tok)){
      while(stack.length){
        const top=stack[stack.length-1];
        if(top.type==='op'){const o1=tok,o2=top.value;if((OPERATORS[o2].prec>OPERATORS[o1].prec)||(OPERATORS[o2].prec===OPERATORS[o1].prec&&OPERATORS[o1].assoc==='L')){out.push(stack.pop());continue;}}
        else if(top.type==='fn'){out.push(stack.pop());continue;}
        break;
      }
      stack.push({type:'op',value:tok});return;
    }
    if(tok==='('){stack.push({type:'paren',value:'('});return;}
    if(tok===')'){while(stack.length && stack[stack.length-1].value!=='('){out.push(stack.pop());}if(!stack.length)throw new Error('Mismatched parentheses');stack.pop();if(stack.length && stack[stack.length-1].type==='fn') out.push(stack.pop());return;}
  });
  while(stack.length){const t=stack.pop();if(t.value==='('||t.value===')') throw new Error('Mismatched parentheses');out.push(t);}
  return out;
}
function evalRPN(rpn){
  const st=[];
  for(const tok of rpn){
    if(tok.type==='num') st.push(tok.value);
    else if(tok.type==='op'){
      const b=st.pop(),a=st.pop();
      if(a===undefined||b===undefined)throw new Error('Invalid expression');
      switch(tok.value){case '+':st.push(a+b);break;case '-':st.push(a-b);break;case '*':st.push(a*b);break;case '/':if(b===0)throw new Error('Division by zero');st.push(a/b);break;case '%':st.push(a%b);break;case '^':st.push(Math.pow(a,b));break;default:throw new Error('Unknown op '+tok.value);}
    } else if(tok.type==='fn'){
      const a=st.pop();
      if(a===undefined)throw new Error('Invalid function argument');
      switch(tok.value){case 'sin':st.push(Math.sin(a));break;case 'cos':st.push(Math.cos(a));break;case 'tan':st.push(Math.tan(a));break;case 'sqrt':if(a<0)throw new Error('Invalid sqrt');st.push(Math.sqrt(a));break;case 'ln':if(a<=0)throw new Error('Invalid ln');st.push(Math.log(a));break;case 'log10':if(a<=0)throw new Error('Invalid log');st.push(Math.log10?Math.log10(a):Math.log(a)/Math.LN10);break;default:throw new Error('Unknown fn '+tok.value);}
    }
  }
  if(st.length!==1)throw new Error('Invalid expression');
  return st[0];
}
function safeEvaluate(inputStr){
  const tokens = tokenize(inputStr);
  const rpn = toRPN(tokens);
  return evalRPN(rpn);
}

// ---------- Display ----------
function updateDisplay(val){ display.value = val===''||val===undefined?'0':String(val); }

let expr = '';
function pushToExpr(s){ expr+=s; updateDisplay(expr); }

// ---------- Button interactions ----------
document.querySelectorAll('.buttons-grid .btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const v=btn.dataset.value, action=btn.dataset.action;
    if(action==='clear'){ playSound('clear'); expr=''; updateDisplay(''); }
    else if(action==='delete'){ playSound('delete'); expr=expr.slice(0,-1); updateDisplay(expr); }
    else if(action==='calculate'){
      playSound('equals');
      try{
        const normalized = expr.replace(/×/g,'*').replace(/÷/g,'/').replace(/%/g,'%').replace(/π/g,'PI');
        const result = safeEvaluate(normalized);
        addHistory(expr,result);
        expr=String(result); updateDisplay(expr);
      } catch(e){ updateDisplay('Error'); expr=''; }
    } else if(v!==undefined){
      if(v==='.') { const parts=expr.split(/[\+\-\*\/\%\^\(\)]/); const last=parts[parts.length-1]; if(last && last.includes('.')) return; }
      if('+-*/%^'.includes(v)){ if(expr==='') return; const last=expr.slice(-1); if('+-*/%^'.includes(last)) return; }
      playSound('click'); pushToExpr(v);
    }
  });
});

// scientific buttons
document.querySelectorAll('.scientific-panel .sci').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const s=btn.dataset.sci;
    if(s==='^'){pushToExpr('^');}
    else if(s==='PI'){pushToExpr('PI');}
    else{pushToExpr(s);}
    playSound('click');
  });
});

// ---------- Keyboard ----------
document.addEventListener('keydown',(e)=>{
  const key=e.key;
  if((/^[0-9]$/).test(key)) { pushToExpr(key); return; }
  if(key==='.') { pushToExpr('.'); return; }
  if(key==='Enter') { document.querySelector('[data-action="calculate"]').click(); return; }
  if(key==='Backspace') { document.querySelector('[data-action="delete"]').click(); return; }
  if(key==='c'||key==='C') { document.querySelector('[data-action="clear"]').click(); return; }
  if(['+','-','*','/','%','^','(',')'].includes(key)) { pushToExpr(key); return; }
  if(key.toLowerCase()==='p'){ pushToExpr('PI'); return; }
});

// ---------- Theme & UI toggles ----------
modeToggle.addEventListener('click', ()=>{
  sciPanel.classList.toggle('hidden');
  state.settings.sciDefault = !sciPanel.classList.contains('hidden');
  saveSettings();
});

themeToggle.addEventListener('click', ()=>{
  const t = state.settings.theme;
  const next = t==='auto'?'dark':(t==='dark'?'light':'auto');
  state.settings.theme = next;
  saveSettings();
});

openSettingsBtn.addEventListener('click', ()=>{ settingsPanel.classList.remove('hidden'); });
closeSettingsBtn.addEventListener('click', ()=>{ settingsPanel.classList.add('hidden'); });
closeHistoryBtn.addEventListener('click', () => { document.querySelector('.side-panel.left').classList.add('hidden'); });

themeSelect.addEventListener('change', e=>{ state.settings.theme = e.target.value; saveSettings(); });
soundToggle.addEventListener('change', e=>{ state.settings.sound = e.target.checked; saveSettings(); });
sciDefault.addEventListener('change', e=>{ state.settings.sciDefault = e.target.checked; saveSettings(); });
historySizeInput.addEventListener('change', e=>{ state.settings.historySize=Math.max(5,Math.min(200,Number(e.target.value)||50)); saveSettings(); saveHistory(); });

clearHistoryBtn.addEventListener('click', ()=>{
  if(!confirm('Clear all history?')) return;
  clearHistory();
});

exportHistoryBtn.addEventListener('click', ()=>{
  const dataStr=JSON.stringify(state.history,null,2);
  const blob=new Blob([dataStr],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='calc-history.json'; a.click(); URL.revokeObjectURL(url);
});

importHistoryBtn.addEventListener('click', ()=> importFileInput.click());
importFileInput.addEventListener('change',(e)=>{
  const f=e.target.files[0]; if(!f) return;
  const reader=new FileReader();
  reader.onload=(ev)=>{
    try{
      const parsed=JSON.parse(ev.target.result);
      if(!Array.isArray(parsed)) throw new Error('Invalid file');
      state.history=parsed.concat(state.history).slice(0,state.settings.historySize);
      saveHistory(); renderHistory();
      alert('History imported');
    } catch(err){ alert('Invalid file'); }
  };
  reader.readAsText(f);
});

// ---------- PWA install prompt ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove('hidden');
});
installBtn.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if(choice.outcome==='accepted') console.log('PWA install accepted');
  else console.log('PWA install dismissed');
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

// ---------- Service worker ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>console.log('SW registered',reg.scope))
    .catch(err=>console.warn('SW registration failed',err));
  });
}

// ---------- Init ----------
function init(){
  loadSettings();
  loadHistory();
  if(state.settings.sciDefault) sciPanel.classList.remove('hidden'); else sciPanel.classList.add('hidden');
  updateDisplay('');
}
init();
