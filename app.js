const C=window.DAIKO_CONFIG,PLAN=window.DAIKO_PLAN_ID||'daiko-plan-2weeks-2026',LS='daiko-'+PLAN;
const MET=window.DAIKO_METRICS||{posts:17,hl:2};
const db=supabase.createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
let state={completed:{},edits:{},deleted:{},custom:{},order:{},taskSections:{}},ready=false,timer,dragged=null;
const q=s=>document.querySelector(s),plan=q('#plan');

function norm(x){
  x=x&&typeof x==='object'?x:{};
  return{
    completed:x.completed||{},
    edits:x.edits||{},
    deleted:x.deleted||{},
    custom:x.custom||{},
    order:x.order||{},
    taskSections:x.taskSections||{}
  };
}
function local(){try{return norm(JSON.parse(localStorage.getItem(LS)))}catch{return norm({})}}
function saveLocal(){localStorage.setItem(LS,JSON.stringify(state))}
function sync(t,e=''){q('#sync').textContent=t;q('#sync').style.color=e?'#e05040':'#A7A7A7'}
async function cloudSave(){
  saveLocal();
  if(!ready)return;
  sync('Сохранение…');
  let{error}=await db.from('plan_state').upsert({id:PLAN,state,updated_at:new Date().toISOString()},{onConflict:'id'});
  sync(error?'Ошибка синхронизации':'Сохранено',!!error);
}
function save(){saveLocal();clearTimeout(timer);timer=setTimeout(cloudSave,250)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmt(s){s=String(s);let m=s.match(/^(Post\s+\d+)(.*)$/);return m?`<b>${esc(m[1])}</b>${esc(m[2])}`:esc(s)}
function idFor(day,i,t){return t[3]||`${day.id}-${i}-${btoa(unescape(encodeURIComponent(t[0]))).slice(0,10)}`}
function badgeClass(day){if(day.off)return'b-off';if(day.badge==='Старт')return'b-start';if(day.badge==='Пакет 1')return'b-pack';if(day.badge==='Хайлайтс')return'b-hl';if(day.badge==='Финиш')return'b-fin';if((day.badge||'').includes('Пост'))return'b-post';if(day.badge==='Продажи')return'b-pack';if(day.badge==='Запуск')return'b-start';return''}
function noteEl(n){if(!n)return'';return`<div class="inline-note n-${esc(n.type||'wait')}"><span>${esc(n.icon||'')}</span><div>${esc(n.text||'')}</div></div>`}

function dayTasks(day){
  let items=[],ix=0,sectionOrder=[];
  (day.sections||[]).forEach(([name,tasks,note])=>{
    sectionOrder.push({name,note});
    tasks.forEach(t=>{
      let id=idFor(day,ix++,t);
      items.push({id,t,custom:false,originalSection:name});
    });
  });
  (state.custom[day.id]||[]).forEach(t=>items.push({id:t.id,t:[t.text,t.type||'t'],custom:true,originalSection:'__custom__'}));
  let rank=new Map((state.order[day.id]||[]).map((id,i)=>[id,i]));
  items.forEach((x,i)=>x._i=i);
  items.sort((a,b)=>{
    let ar=rank.has(a.id)?rank.get(a.id):100000+a._i;
    let br=rank.has(b.id)?rank.get(b.id):100000+b._i;
    return ar-br;
  });
  items.forEach(x=>x.section=state.taskSections[x.id]||x.originalSection);
  return{items,sectionOrder};
}

function render(){
  plan.innerHTML='';
  let week='';
  DAIKO_DAYS.forEach(day=>{
    if(day.week&&day.week!==week){week=day.week;plan.insertAdjacentHTML('beforeend',`<div class="week">${week}</div>`)}
    let d=document.createElement('section');
    d.className='day'+(day.off?' off':'');
    d.id=day.id;
    d.innerHTML=`<div class="day-head"><div class="date-num">${day.n}</div><div class="day-info"><div class="day-title">${day.title}</div><div class="day-meta">${day.meta}</div></div><span class="badge ${badgeClass(day)}">${day.badge}</span><span class="toggle">▾</span></div><div class="day-body">${day.off?`<div class="offmsg">${esc(day.offMsg||'Отдыхаем. Без задач.')}</div>`:''}</div>`;
    d.querySelector('.day-head').onclick=()=>d.classList.toggle('collapsed');
    let body=d.querySelector('.day-body');
    if(!day.off)renderDayBody(body,day);
    plan.append(d);
  });
  stats();
}

function renderDayBody(body,day){
  let{items,sectionOrder}=dayTasks(day);
  let known=new Set(sectionOrder.map(x=>x.name));
  items.forEach(x=>{if(x.section!=='__custom__'&&!known.has(x.section)){sectionOrder.push({name:x.section,note:null});known.add(x.section)}});

  sectionOrder.forEach(({name,note})=>{
    body.insertAdjacentHTML('beforeend',`<div class="sec">${esc(name)}</div>`);
    let list=createTaskList(day,name);
    body.append(list);
    items.filter(x=>x.section===name).forEach(x=>addTaskEl(list,day,x.t,x.id,x.custom));
    if(note)body.insertAdjacentHTML('beforeend',noteEl(note));
  });

  let customList=createTaskList(day,'__custom__');
  customList.classList.add('custom-task-list');
  body.append(customList);
  items.filter(x=>x.section==='__custom__').forEach(x=>addTaskEl(customList,day,x.t,x.id,x.custom));
  addInlineCreator(body,day);
}

function createTaskList(day,section){
  let list=document.createElement('div');
  list.className='task-list';
  list.dataset.section=section;
  list.addEventListener('dragover',e=>{
    if(!dragged||dragged.dayId!==day.id)return;
    e.preventDefault();
    list.classList.add('drag-over');
  });
  list.addEventListener('dragleave',e=>{if(!list.contains(e.relatedTarget))list.classList.remove('drag-over')});
  list.addEventListener('drop',e=>{
    if(!dragged||dragged.dayId!==day.id)return;
    e.preventDefault();
    list.classList.remove('drag-over');
    let el=document.querySelector(`.task[data-id="${CSS.escape(dragged.id)}"]`);
    if(!el)return;
    let target=e.target.closest('.task');
    if(target&&target!==el&&target.closest('.task-list')===list){
      let r=target.getBoundingClientRect();
      list.insertBefore(el,e.clientY<r.top+r.height/2?target:target.nextSibling);
    }else list.append(el);
    persistDayLayout(day.id,bodyForList(list));
  });
  return list;
}
function bodyForList(list){return list.closest('.day-body')}
function persistDayLayout(dayId,body){
  let ids=[];
  body.querySelectorAll('.task-list').forEach(list=>{
    list.querySelectorAll(':scope > .task').forEach(el=>{
      ids.push(el.dataset.id);
      state.taskSections[el.dataset.id]=list.dataset.section;
    });
  });
  state.order[dayId]=ids;
  save();
  render();
}

function addInlineCreator(body,day){
  let b=document.createElement('button');
  b.className='add';
  b.textContent='+ Добавить задачу';
  b.onclick=()=>{
    let x={id:'custom-'+crypto.randomUUID(),text:'',type:'t'};
    (state.custom[day.id]??=[]).push(x);
    state.taskSections[x.id]='__custom__';
    let order=state.order[day.id]??=[];
    order.push(x.id);
    save();
    render();
    requestAnimationFrame(()=>{
      let el=document.querySelector(`.task[data-id="${CSS.escape(x.id)}"]`);
      if(el)startInlineEdit(el,day,['','t'],x.id,true,'');
    });
  };
  body.append(b);
}

function startInlineEdit(el,day,t,id,custom,text){
  el.draggable=false;
  let textBox=el.querySelector('.task-text');
  let actions=el.querySelector('.actions');
  let tags=textBox.querySelectorAll('.tag');
  let tagHtml=[...tags].map(x=>x.outerHTML).join('');
  textBox.innerHTML=`<div class="inline-editor"><textarea rows="2" placeholder="Введите текст задачи">${esc(text)}</textarea><div class="edit-actions"><button class="cancel-edit">Отмена</button><button class="save-edit">Сохранить</button></div></div>${tagHtml}`;
  actions.classList.add('hidden');
  el.classList.add('editing');
  let ta=textBox.querySelector('textarea');
  ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);
  let cancel=()=>render();
  textBox.querySelector('.cancel-edit').onclick=cancel;
  textBox.querySelector('.save-edit').onclick=()=>{
    let n=ta.value.trim();
    if(custom){let item=(state.custom[day.id]||[]).find(x=>x.id===id);if(item)item.text=n}
    else{if(!n)return;state.edits[id]=n}
    save();render();
  };
  ta.onkeydown=e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();textBox.querySelector('.save-edit').click()}
    if(e.key==='Escape')cancel();
  };
}

function addTaskEl(body,day,t,id,custom){
  if(state.deleted[id])return;
  let text=custom?t[0]:(state.edits[id]||t[0]),el=document.createElement('div'),tags=[];
  el.className='task';
  el.dataset.type=t[1]||'t';
  el.dataset.id=id;
  el.draggable=true;
  if(t[1]==='p')tags.push('<span class="tag t-pub">Публикация</span>');
  if(t[1]==='hl')tags.push('<span class="tag t-hl">Хайлайтс</span>');
  (t[4]||[]).forEach(x=>{if(x==='blk')tags.push('<span class="tag t-blk">Блокер</span>');if(x==='hl')tags.push('<span class="tag t-hl">Хайлайтс</span>')});
  if(t[2])tags.push(`<span class="tag t-time">${esc(t[2])}</span>`);
  el.innerHTML=`<div class="chk ${state.completed[id]?'on':''}"></div><div class="task-text ${state.completed[id]?'done':''}">${fmt(text)}${tags.join('')}</div><div class="actions"><button class="drag-handle" title="Переместить задачу вверх/вниз" aria-label="Переместить задачу вверх или вниз">↕</button><button title="Редактировать">✎</button><button title="Удалить">×</button></div>`;
  el.querySelector('.chk').onclick=()=>{state.completed[id]=!state.completed[id];save();render()};
  let handle=el.querySelector('.drag-handle');
  handle.onmousedown=()=>el.classList.add('drag-ready');
  handle.onmouseup=()=>el.classList.remove('drag-ready');
  el.addEventListener('dragstart',e=>{
    if(!el.classList.contains('drag-ready')){e.preventDefault();return}
    dragged={id,dayId:day.id};
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',id);
  });
  el.addEventListener('dragend',()=>{
    dragged=null;
    el.classList.remove('dragging','drag-ready');
    document.querySelectorAll('.task-list.drag-over').forEach(x=>x.classList.remove('drag-over'));
  });
  el.addEventListener('dragover',e=>{
    if(!dragged||dragged.dayId!==day.id||dragged.id===id)return;
    e.preventDefault();
  });
  el.addEventListener('drop',e=>{
    if(!dragged||dragged.dayId!==day.id||dragged.id===id)return;
    e.preventDefault();e.stopPropagation();
    let list=el.closest('.task-list');
    let moving=document.querySelector(`.task[data-id="${CSS.escape(dragged.id)}"]`);
    if(!moving)return;
    let r=el.getBoundingClientRect();
    list.insertBefore(moving,e.clientY<r.top+r.height/2?el:el.nextSibling);
    persistDayLayout(day.id,bodyForList(list));
  });
  let bs=el.querySelectorAll('.actions button');
  bs[1].onclick=()=>startInlineEdit(el,day,t,id,custom,text);
  bs[2].onclick=()=>{
    if(custom)state.custom[day.id]=(state.custom[day.id]||[]).filter(x=>x.id!==id);
    else state.deleted[id]=true;
    delete state.completed[id];delete state.edits[id];delete state.taskSections[id];
    state.order[day.id]=(state.order[day.id]||[]).filter(x=>x!==id);
    save();render();
  };
  body.append(el);
}

function stats(){
  let all=[...document.querySelectorAll('.task')],done=all.filter(x=>x.querySelector('.chk.on')).length,posts=all.filter(x=>x.dataset.type==='p'&&x.querySelector('.chk.on')).length,hl=all.filter(x=>x.dataset.type==='hl'&&x.querySelector('.chk.on')).length,p=all.length?Math.round(done/all.length*100):0;
  q('#pct').textContent=p+'%';q('#fill').style.width=p+'%';q('#tasksStat').textContent=`${done}/${all.length}`;
  let ps=q('#postPill'),hs=q('#hlPill');
  if(MET.posts){q('#postsStat').textContent=`${posts}/${MET.posts}`;ps.style.display=''}else ps.style.display='none';
  if(MET.hl){q('#hlStat').textContent=`${hl}/${MET.hl}`;hs.style.display=''}else hs.style.display='none';
}
async function loadCloud(){
  sync('Загрузка данных…');
  let{data,error}=await db.from('plan_state').select('state').eq('id',PLAN).maybeSingle();
  if(error){sync('Ошибка загрузки',1);return}
  if(data?.state)state=norm(data.state);else{state=local();await db.from('plan_state').upsert({id:PLAN,state},{onConflict:'id'})}
  saveLocal();ready=true;sync('Синхронизация включена');render();
}
async function login(){q('#authErr').textContent='';let{error}=await db.auth.signInWithPassword({email:q('#email').value.trim(),password:q('#password').value});if(error)q('#authErr').textContent=error.message}
q('#login').onclick=login;
q('#password').onkeydown=e=>{if(e.key==='Enter')login()};
q('#logout').onclick=()=>db.auth.signOut();
db.auth.onAuthStateChange((_,s)=>{if(s){q('#auth').classList.add('hidden');state=local();render();loadCloud()}else{ready=false;q('#auth').classList.remove('hidden');sync('Требуется вход')}});
(async()=>{let{data:{session}}=await db.auth.getSession();if(session){q('#auth').classList.add('hidden');state=local();render();loadCloud()}else sync('Требуется вход')})();