'use strict';
/* ---------- config & helpers ---------- */
const CFG={base:80,exp:1.35}; // tune the XP curve here: XP to go from level l to l+1
const xpFor=l=>Math.round(CFG.base*Math.pow(l,CFG.exp));
const TIERS=[[1,'Beginner'],[11,'Amateur'],[26,'Disciplined'],[51,'Advanced'],[76,'Elite'],[101,'Master']];
const tier=l=>[...TIERS].reverse().find(t=>l>=t[0])[1];
const lv=t=>{let l=1,r=t;while(r>=xpFor(l)){r-=xpFor(l);l++}return{l,cur:r,need:xpFor(l)}};
const iso=d=>{const o=new Date(d.getTime()-d.getTimezoneOffset()*6e4);return o.toISOString().slice(0,10)};
const today=()=>iso(new Date());
const addD=(s,n)=>{const d=new Date(s+'T00:00');d.setDate(d.getDate()+n);return iso(d)};
const diff=(a,b)=>Math.round((new Date(b+'T00:00')-new Date(a+'T00:00'))/864e5);
const dow=s=>(new Date(s+'T00:00').getDay()+6)%7;
const uid=()=>Math.random().toString(36).slice(2,9);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const CATS=['Body','Mind','Discipline','Recovery','Custom'];
const DIFF={Easy:10,Normal:25,Hard:50,Extreme:100};
const ROUTES=['home','today','week','month','arc','goals','habits','progression','analytics','journal','settings'];
const DEF_HABITS=[['Exercise','Body'],['Study / Work','Mind'],['Reading','Mind'],['Water','Body'],['Sleep','Recovery'],['Meditation','Recovery']];
let S=null,wk=0,mo=0;
const DB={open(){return new Promise((res,rej)=>{const r=indexedDB.open('winterarc',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{this.db=r.result;res()};r.onerror=()=>rej(r.error)})},
get(){return new Promise(r=>{const q=this.db.transaction('kv').objectStore('kv').get('state');q.onsuccess=()=>r(q.result)})},
set(s){return new Promise(r=>{const t=this.db.transaction('kv','readwrite');t.objectStore('kv').put(s,'state');t.oncomplete=r})}};
const save=()=>DB.set(S);
const end=()=>addD(S.p.start,S.p.days-1);
const toast=(m,big)=>{const t=document.createElement('div');t.className='toast'+(big?' big2':'');t.textContent=m;$('#toasts').append(t);setTimeout(()=>t.remove(),2600)};

/* ---------- derived stats (single source of truth) ---------- */
function dayStats(d){
  const t=S.tasks.filter(x=>x.date===d),th=t.filter(x=>x.done),hd=S.habits.filter(h=>h.log[d]),j=S.journal[d];
  const refl=j&&(j.well||j.improve||j.tomorrow)?1:0,gx=S.goals.filter(g=>g.done&&g.doneDate===d).reduce((a,g)=>a+(g.xp||0),0);
  const xp=th.reduce((a,x)=>a+x.xp,0)+hd.reduce((a,h)=>a+h.xp,0)+gx;
  const n=t.length+S.habits.length,pct=n?Math.round((th.length+hd.length)/n*100):0,parts=[];
  if(t.length)parts.push([50,th.length/t.length]);if(S.habits.length)parts.push([30,hd.length/S.habits.length]);parts.push([20,refl]);
  const w=parts.reduce((a,p)=>a+p[0],0),score=Math.round(parts.reduce((a,p)=>a+p[0]*p[1],0)/w*100);
  return{d,tasks:t.length,done:th.length,hdone:hd.length,xp,pct,score,planned:n>0,complete:n>0&&pct>=60};
}
function calc(){
  const t=today(),last=t<end()?t:end(),days=[];
  for(let d=S.p.start;d<=last;d=addD(d,1))days.push(dayStats(d));
  const xp=days.reduce((a,x)=>a+x.xp,0);let cur=0,best=0,run=0;
  days.forEach(x=>{run=x.complete?run+1:0;best=Math.max(best,run)});
  let i=days.length-1;if(i>=0&&days[i].d===t&&!days[i].complete)i--;
  while(i>=0&&days[i].complete){cur++;i--}
  return{days,xp,lvl:lv(xp),cur,best,tasksDone:S.tasks.filter(x=>x.done).length,dayN:Math.max(1,Math.min(S.p.days,diff(S.p.start,t)+1)),t,over:t>end()};
}
const ACH=[
 ['first','FIRST STEP','Complete 1 task',c=>c.tasksDone>=1],['d7','7 DAYS','Reach a 7-day streak',c=>c.best>=7],
 ['t100','100 TASKS','Complete 100 tasks',c=>c.tasksDone>=100],['x1k','1,000 XP','Earn 1,000 XP',c=>c.xp>=1000],
 ['l10','LEVEL 10','Reach level 10',c=>c.lvl.l>=10],['pw','PERFECT WEEK','7 days in a row at 100%',c=>{let r=0;return c.days.some(d=>(r=d.pct===100?r+1:0)>=7)}],
 ['half','HALF WAY','Reach the middle of your Arc',c=>c.dayN>=S.p.days/2],['done','ARC COMPLETE','Reach the final day',c=>c.over||c.dayN>=S.p.days],
 ['d30','30 DAYS','Reach a 30-day streak',c=>c.best>=30],['goal','GOAL MET','Complete a goal',()=>S.goals.some(g=>g.done)]];
function checkAch(c){const n=[];ACH.forEach(a=>{if(!S.ach[a[0]]&&a[3](c)){S.ach[a[0]]=c.t;n.push(a[1])}});return n}
const gprog=g=>g.cur+S.tasks.filter(t=>t.goalId===g.id&&t.done).length;
async function act(fn){
  const b=calc();fn();S.goals.forEach(g=>{if(!g.done&&g.target>0&&gprog(g)>=g.target){g.done=true;g.doneDate=today();toast('GOAL COMPLETE · '+g.name,1)}});
  const c=calc(),a=checkAch(c);await save();
  if(c.xp!==b.xp)toast((c.xp>b.xp?'+':'')+(c.xp-b.xp)+' XP');
  if(c.lvl.l>b.lvl.l)toast(`LEVEL ${b.lvl.l} → ${c.lvl.l}`,1);a.forEach(n=>toast('ACHIEVEMENT · '+n,1));R();
}
function repeats(){ // materialise daily repeating tasks for today
  const t=today();if(t<S.p.start||t>end())return;
  S.tasks.filter(x=>x.repeat==='daily'&&x.date<t).forEach(x=>{const s=x.src||x.id;
    if(!S.tasks.some(y=>(y.src||y.id)===s&&y.date===t))S.tasks.push({...x,id:uid(),src:s,date:t,done:false})});
}

/* ---------- ui primitives ---------- */
const bar=p=>`<div class="bar"><i style="width:${Math.max(0,Math.min(100,p))}%"></i></div>`;
const empty=(m='NOT ENOUGH DATA YET')=>`<p class="empty">${m}</p>`;
const stat=(l,v)=>`<div class="card"><small>${l}</small><b>${v}</b></div>`;
function line(v){if(v.length<2)return empty();const W=600,H=160,m=Math.max(...v,1);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img"><polyline points="${v.map((y,i)=>(i/(v.length-1)*W).toFixed(1)+','+(H-6-y/m*(H-16)).toFixed(1)).join(' ')}" fill="none" stroke="#a8dcff" stroke-width="2"/></svg><small>peak ${m}</small>`}
function bars(it){return it.length?`<div class="bars">${it.map(i=>`<div><b>${i[1]}</b><i style="height:${i[1]/Math.max(...it.map(x=>x[1]),1)*88}%"></i><span>${esc(i[0])}</span></div>`).join('')}</div>`:empty()}
function form(title,fields,ok){
  const h=fields.map(f=>{const v=f.v??'';let i;
    if(f.o)i=`<select name="${f.k}">${f.o.map(o=>{const[a,b]=Array.isArray(o)?o:[o,o];return `<option value="${esc(a)}" ${a==v?'selected':''}>${esc(b)}</option>`}).join('')}</select>`;
    else if(f.t==='area')i=`<textarea name="${f.k}" rows="3">${esc(v)}</textarea>`;
    else i=`<input name="${f.k}" type="${f.t||'text'}" value="${esc(v)}" ${f.r?'required':''}>`;
    return `<label>${f.l}${i}</label>`}).join('');
  const d=$('#dlg');d.innerHTML=`<form method="dialog"><h3>${title}</h3>${h}<div class="btns"><button value="x" class="ghost" formnovalidate>Cancel</button><button class="pri" value="ok">Save</button></div></form>`;
  d.showModal();d.querySelector('form').onsubmit=e=>{if(e.submitter.value==='ok')ok(Object.fromEntries(new FormData(e.target)))};
}
const modal=h=>{const d=$('#dlg');d.innerHTML=`<form method="dialog">${h}<div class="btns"><button class="pri">Close</button></div></form>`;d.showModal()};
function heat(from,to){
  const t=today(),cs=[];for(let i=0;i<dow(from);i++)cs.push('<span></span>');
  for(let d=from;d<=to;d=addD(d,1)){const s=d<=t?dayStats(d):null,p=s?s.pct:0,l=!s||!s.planned?0:p>=90?4:p>=60?3:p>=30?2:1;
    cs.push(`<button class="cell l${l} ${d>t?'fut':''}" data-a="day" data-id="${d}" title="${d} · ${p}%" aria-label="${d}, ${p}% complete"></button>`)}
  return `<div class="heat">${cs.join('')}</div>`;
}
const taskRow=x=>`<li class="row ${x.done?'done':''}"><input type="checkbox" data-a="tt" data-id="${x.id}" ${x.done?'checked':''} aria-label="Complete ${esc(x.name)}"><span>${esc(x.name)}<small>${x.cat} · ${x.xp} XP${x.repeat==='daily'?' · daily':''}${x.milestone?' · milestone':''}</small></span><button class="x" data-a="te" data-id="${x.id}">Edit</button><button class="x" data-a="tp" data-id="${x.id}" title="Move to tomorrow">Postpone</button><button class="x" data-a="td" data-id="${x.id}" aria-label="Delete">✕</button></li>`;
function taskForm(x={}){
  form(x.id?'Edit task':'Add task',[{k:'name',l:'Name',r:1,v:x.name},{k:'desc',l:'Description',t:'area',v:x.desc},{k:'cat',l:'Category',o:CATS,v:x.cat||'Discipline'},{k:'date',l:'Date',t:'date',v:x.date||today(),r:1},
   {k:'diff',l:'Difficulty',o:Object.keys(DIFF).map(k=>[k,`${k} (${DIFF[k]} XP)`]),v:x.diff||'Normal'},{k:'xp',l:'Custom XP (optional)',t:'number',v:x.custom||''},{k:'repeat',l:'Repeat',o:[['','One-time'],['daily','Daily']],v:x.repeat||''},
   {k:'goalId',l:'Linked goal',o:[['','None'],...S.goals.map(g=>[g.id,g.name])],v:x.goalId||''},{k:'milestone',l:'Type',o:[['','Regular'],['1','Milestone']],v:x.milestone?'1':''}],
   f=>act(()=>{const o={name:f.name.trim(),desc:f.desc,cat:f.cat,date:f.date,diff:f.diff,custom:f.xp,xp:+f.xp||DIFF[f.diff],repeat:f.repeat,goalId:f.goalId,milestone:!!f.milestone};
     if(x.id)Object.assign(S.tasks.find(t=>t.id===x.id),o);else S.tasks.push({id:uid(),done:false,...o})}));
}

/* ---------- views ---------- */
const V={
home(c){const l=c.lvl,t=dayStats(c.t),mission=S.tasks.filter(x=>x.date===c.t);
  return `<h1>WINTER ARC</h1><div class="big">DAY ${c.dayN} <span class="mut">/ ${S.p.days}</span></div>
  <div class="card"><b style="font-size:22px;font-weight:300">LEVEL ${l.l} — ${tier(l.l).toUpperCase()}</b><small style="display:block">${l.cur} / ${l.need} XP · ${l.need-l.cur} to next</small>${bar(l.cur/l.need*100)}</div>
  <div class="grid">${stat('Streak','🔥 '+c.cur)}${stat('Arc progress',Math.round(c.dayN/S.p.days*100)+'%')}${stat('Today’s score (app-generated)',t.score)}${stat('XP today',t.xp)}</div>
  <h2>Today’s mission</h2>${mission.length||S.habits.length?CATS.map(k=>{const a=mission.filter(x=>x.cat===k),h=S.habits.filter(x=>x.cat===k);
    return a.length||h.length?`<div class="card"><small>${k}</small><ul>${a.map(taskRow).join('')}${h.map(habRow).join('')}</ul></div>`:''}).join(''):empty('No mission yet. Add a task in Today.')}
  ${c.over?`<p class="card">Your Arc has ended. <a href="#arc" style="color:var(--ice)">View the final report</a></p>`:''}`},
today(c){const d=c.t,s=dayStats(d),j=S.journal[d]||{},ts=S.tasks.filter(x=>x.date===d);
  return `<h1>TODAY</h1><div class="big">${d}</div><p class="mut">Day ${c.dayN} · streak ${c.cur}</p>
  <div class="grid">${stat('Daily score (app-generated)',s.score)}${stat('XP earned',s.xp)}${stat('Tasks',s.done+'/'+s.tasks)}${stat('Habits',s.hdone+'/'+S.habits.length)}</div>
  <div class="btns" style="justify-content:flex-start;margin:14px 0"><button class="pri" data-a="ta">+ Add task</button><button data-a="ha">+ Add habit</button><button data-a="gl">+ Log goal progress</button></div>
  <h2>Tasks</h2>${ts.length?`<ul>${ts.sort((a,b)=>a.done-b.done).map(taskRow).join('')}</ul>`:empty('No tasks planned for today.')}
  <h2>Habits</h2>${S.habits.length?`<ul>${S.habits.map(habRow).join('')}</ul>`:empty('No habits yet.')}
  <h2>Night review</h2><form data-f="review" class="card"><label>What went well?<textarea name="well" rows="2">${esc(j.well)}</textarea></label><label>What could improve?<textarea name="improve" rows="2">${esc(j.improve)}</textarea></label><label>Tomorrow’s priority<input name="tomorrow" value="${esc(j.tomorrow)}"></label>
  <label>Mood (optional)<input name="mood" value="${esc(j.mood)}"></label><label>Energy (1–10)<input name="energy" type="number" min="1" max="10" value="${esc(j.energy)}"></label><button class="pri">Save review</button></form>`},
week(c){const m=addD(c.t,-dow(c.t)+wk*7),ds=[...Array(7)].map((_,i)=>addD(m,i)),st=ds.map(d=>dayStats(d)),tk=S.tasks.filter(x=>x.date>=m&&x.date<=ds[6]);
  const pl=st.filter(x=>x.planned);
  return `<h1>WEEK</h1><div class="btns" style="justify-content:flex-start"><button data-a="wk" data-id="-1">←</button><span class="big" style="font-size:24px">${m} → ${ds[6]}</span><button data-a="wk" data-id="1">→</button></div>
  <div class="grid">${stat('Completion',(tk.length?Math.round(tk.filter(x=>x.done).length/tk.length*100):0)+'%')}${stat('XP',st.reduce((a,x)=>a+x.xp,0))}${stat('Avg score',pl.length?Math.round(pl.reduce((a,x)=>a+x.score,0)/pl.length):'—')}${stat('Streak',c.cur)}</div>
  <h2>Daily scores</h2>${bars(ds.map((d,i)=>[d.slice(5),st[i].score]))}<h2>Weekly objectives</h2><form data-f="wobj" class="card"><textarea name="t" rows="3" style="width:100%">${esc(S.weekObj[m])}</textarea><input type="hidden" name="k" value="${m}"><button class="pri" style="margin-top:8px">Save objectives</button></form>
  <h2>Tasks</h2>${tk.length?`<ul>${tk.map(taskRow).join('')}</ul>`:empty('No tasks this week.')}`},
month(c){const b=new Date(c.t+'T00:00');b.setMonth(b.getMonth()+mo,1);const f=iso(b),n=new Date(b.getFullYear(),b.getMonth()+1,0).getDate(),ds=[...Array(n)].map((_,i)=>addD(f,i)),st=ds.filter(d=>d<=c.t).map(dayStats),tk=S.tasks.filter(x=>x.date.slice(0,7)===f.slice(0,7));
  const key=f.slice(0,7);
  return `<h1>MONTH</h1><div class="btns" style="justify-content:flex-start"><button data-a="mo" data-id="-1">←</button><span class="big" style="font-size:24px">${key}</span><button data-a="mo" data-id="1">→</button></div>
  <div class="grid">${stat('Task completion',(tk.length?Math.round(tk.filter(x=>x.done).length/tk.length*100):0)+'%')}${stat('XP',st.reduce((a,x)=>a+x.xp,0))}${stat('Complete days',st.filter(x=>x.complete).length)}</div>
  <h2>Calendar</h2><div class="cal">${['M','T','W','T','F','S','S'].map(x=>`<small>${x}</small>`).join('')}${'<span></span>'.repeat(dow(f))}${ds.map(d=>{const s=dayStats(d);return `<button data-a="day" data-id="${d}" ${d>c.t?'style="opacity:.4"':''}>${+d.slice(8)}<small style="display:block">${d<=c.t&&s.planned?s.pct+'%':''}</small></button>`}).join('')}</div>
  <h2>Monthly goals</h2><form data-f="mgoal" class="card"><textarea name="t" rows="3" style="width:100%">${esc(S.monthGoals[key])}</textarea><input type="hidden" name="k" value="${key}"><button class="pri" style="margin-top:8px">Save</button></form>
  <h2>Habit consistency</h2>${S.habits.length?S.habits.map(h=>{const p=Math.round(ds.filter(d=>d<=c.t&&h.log[d]).length/Math.max(1,st.length)*100);return `<div>${esc(h.name)} <small>${p}%</small>${bar(p)}</div>`}).join(''):empty('No habits yet.')}`},
arc(c){const e=end();
  return `<h1>ARC</h1><div class="big">${S.p.start} → ${e}</div><p class="mut">${esc(S.p.goal)}${S.p.why?' — '+esc(S.p.why):''}</p>${bar(c.dayN/S.p.days*100)}
  <div class="grid">${stat('Day',c.dayN+'/'+S.p.days)}${stat('Level',c.lvl.l)}${stat('Total XP',c.xp)}${stat('Tasks done',c.tasksDone)}${stat('Best streak',c.best)}${stat('Avg completion',avg(c.days)+'%')}</div>
  <h2>Heatmap</h2>${heat(S.p.start,e)}<h2>Milestones</h2>${[0.25,.5,.75,1].map(f=>{const d=Math.ceil(S.p.days*f);return `<div class="row"><span>Day ${d}<small>${addD(S.p.start,d-1)}</small></span>${c.dayN>=d?'✓':''}</div>`}).join('')}
  ${S.tasks.filter(x=>x.milestone).map(x=>`<div class="row"><span>${esc(x.name)}<small>${x.date}</small></span>${x.done?'✓':''}</div>`).join('')}${c.over?report(c):''}`},
goals(){return `<h1>GOALS</h1><div class="btns" style="justify-content:flex-start;margin:10px 0"><button class="pri" data-a="ga">+ New goal</button></div>${S.goals.length?S.goals.map(g=>{const p=g.target?Math.round(gprog(g)/g.target*100):0;
  return `<div class="card"><b style="font-size:17px">${esc(g.name)}</b> <small>${g.cat} · ${g.done?'Complete':'Active'}${g.deadline?' · due '+g.deadline:''}${g.xp?' · +'+g.xp+' XP':''}</small><p class="mut">${esc(g.desc)}</p>${bar(p)}<small>${gprog(g)} / ${g.target} (${Math.min(100,p)}%)</small>
  <div class="btns" style="justify-content:flex-start"><button data-a="gp" data-id="${g.id}">Log progress</button><button class="x" data-a="gd" data-id="${g.id}">Delete</button></div></div>`}).join(''):empty('No goals yet. Set one with a target and a deadline.')}`},
habits(c){return `<h1>HABITS</h1><div class="btns" style="justify-content:flex-start;margin:10px 0"><button class="pri" data-a="ha">+ New habit</button></div>${S.habits.length?S.habits.map(h=>{const s=hstreak(h,c.t);
  return `<div class="card"><b>${esc(h.name)}</b> <small>${h.cat} · ${h.xp} XP · ${h.freq}</small><div class="row"><small>Current ${s.cur} · Best ${s.best}</small><span></span><button class="x" data-a="hd" data-id="${h.id}">Delete</button></div>${heat(addD(c.t,-55-dow(c.t)),c.t).replace(/data-a="day"/g,'disabled').replace(/class="cell l\d/g,m=>m)}<div class="btns" style="justify-content:flex-start">${habRow(h)}</div></div>`}).join(''):empty('No habits yet.')}`},
progression(c){const l=c.lvl,recs=records(c);
  return `<h1>PROGRESSION</h1><div class="big">LEVEL ${l.l}</div><b style="font-weight:300">${tier(l.l).toUpperCase()}</b>${bar(l.cur/l.need*100)}<small>${l.cur}/${l.need} XP · ${l.need-l.cur} remaining</small>
  <div class="grid" style="margin-top:14px">${stat('Total XP',c.xp)}${stat('Streak',c.cur+' (best '+c.best+')')}${stat('Tasks completed',c.tasksDone)}${stat('Achievements',Object.keys(S.ach).length+'/'+ACH.length)}</div>
  <h2>Progression map</h2><div class="map">${TIERS.slice().reverse().map(([s,n],i,a)=>`<div class="${l.l>=s&&(i===0||l.l<a[i-1][0])?'me':''}">${s}${a[i-1]?'–'+(a[i-1][0]-1):'+'} ${n.toUpperCase()}${l.l>=s&&(i===0||l.l<a[i-1][0])?' ← YOU ARE HERE (level '+l.l+')':''}</div>`).join('')}</div>
  <h2>Personal records</h2><div class="grid">${recs.map(r=>stat(r[0],r[1])).join('')}</div>
  <h2>Achievements</h2><div class="grid">${ACH.map(a=>`<div class="card ${S.ach[a[0]]?'':'lock'}"><b style="font-size:15px">${a[1]}</b><small>${S.ach[a[0]]?'Unlocked '+S.ach[a[0]]:'Locked — '+a[2]}</small></div>`).join('')}</div>`},
analytics(c){const r=localStorage.getItem('wa.range')||'30',ds=r==='arc'?c.days:c.days.slice(-+r),real=c.days.filter(d=>d.planned);
  let run=0;const cum=c.days.map(d=>run+=d.xp);const wks={};c.days.forEach(d=>{const k=addD(d.d,-dow(d.d));(wks[k]=wks[k]||[]).push(d.pct)});
  const cat=CATS.map(k=>{const t=S.tasks.filter(x=>x.cat===k&&x.date<=c.t);return[k,t.length?Math.round(t.filter(x=>x.done).length/t.length*100):0]}).filter((x,i)=>S.tasks.some(t=>t.cat===CATS[i]));
  return `<h1>ANALYTICS</h1><label style="max-width:200px">Range<select data-a="range">${[['7','7 days'],['30','30 days'],['arc','Entire Arc']].map(o=>`<option value="${o[0]}" ${o[0]===r?'selected':''}>${o[1]}</option>`).join('')}</select></label>
  <h2>Daily completion %</h2>${real.length>=2?line(ds.map(d=>d.pct)):empty()}<h2>Cumulative XP</h2>${real.length>=2?line(cum):empty()}
  <h2>Weekly performance (avg %)</h2>${real.length>=2?bars(Object.entries(wks).map(([k,v])=>[k.slice(5),Math.round(v.reduce((a,b)=>a+b,0)/v.length)])):empty()}
  <h2>Category performance (task completion %)</h2>${bars(cat)}<h2>Consistency</h2><div class="grid">${[7,30,S.p.days].map(n=>stat(n===S.p.days?'Arc':n+'d',avg(c.days.slice(-n))+'%')).join('')}</div>
  <h2>Heatmap</h2>${heat(S.p.start,end())}<h2>Insights</h2>${insights(c)}`},
journal(c){const q=(window._q||'').toLowerCase(),ks=Object.keys(S.journal).sort().reverse().filter(k=>!q||JSON.stringify(S.journal[k]).toLowerCase().includes(q)),d=window._jd||c.t,j=S.journal[d]||{};
  return `<h1>JOURNAL</h1><form data-f="journal" class="card"><label>Date<input type="date" name="d" value="${d}" data-a="jdate"></label><label>Morning intention<textarea name="intent" rows="2">${esc(j.intent)}</textarea></label><label>Evening reflection<textarea name="reflect" rows="3">${esc(j.reflect)}</textarea></label><label>Notes<textarea name="notes" rows="3">${esc(j.notes)}</textarea></label>
  <label>Mood<input name="mood" value="${esc(j.mood)}"></label><label>Energy (1–10)<input name="energy" type="number" min="1" max="10" value="${esc(j.energy)}"></label><button class="pri">Save entry</button></form>
  <label>Search<input type="search" data-a="jsearch" value="${esc(window._q)}"></label>${ks.length?ks.map(k=>{const e=S.journal[k];return `<div class="card"><b>${k}</b> <button class="x" data-a="jopen" data-id="${k}">Edit</button><button class="x" data-a="jdel" data-id="${k}">Delete</button><p class="mut">${esc([e.intent,e.reflect,e.notes,e.well].filter(Boolean).join(' · ')).slice(0,220)}</p></div>`}).join(''):empty('No entries yet.')}`},
settings(c){return `<h1>SETTINGS</h1><div class="card"><b>● LOCAL DATA</b><p class="mut">Your data is stored locally on this device.<br>Cloud sync: OFF<br>External server: NONE</p></div>
  <div class="card"><b>Profile</b><p class="mut">${esc(S.p.name)} · Arc ${S.p.start} → ${end()}</p></div>
  <div class="btns" style="justify-content:flex-start"><button class="pri" data-a="exp">Export winter-arc-backup.json</button><label style="margin:0"><input type="file" id="imp" accept=".json" hidden><button data-a="imp">Import backup</button></label><button data-a="reset" style="color:var(--bad)">Reset everything</button></div>`}
};
const avg=d=>{const p=d.filter(x=>x.planned);return p.length?Math.round(p.reduce((a,x)=>a+x.pct,0)/p.length):0};
const habRow=h=>`<li class="row"><input type="checkbox" data-a="hc" data-id="${h.id}" ${h.log[today()]?'checked':''} aria-label="Log ${esc(h.name)}"><span>${esc(h.name)}<small>${h.cat} · ${h.xp} XP</small></span></li>`;
function hstreak(h,t){let cur=0,best=0,r=0;for(let d=S.p.start;d<=t;d=addD(d,1)){r=h.log[d]?r+1:0;best=Math.max(best,r)}
  let d=t;if(!h.log[d])d=addD(d,-1);while(d>=S.p.start&&h.log[d]){cur++;d=addD(d,-1)}return{cur,best}}
function records(c){const p=c.days.filter(d=>d.planned);if(!p.length)return[['Records','Not enough data yet']];
  const mx=k=>p.reduce((a,b)=>b[k]>a[k]?b:a);const wk={};c.days.forEach(d=>{const k=addD(d.d,-dow(d.d));wk[k]=(wk[k]||0)+d.xp});
  const bw=Object.entries(wk).sort((a,b)=>b[1]-a[1])[0],hb=S.habits.map(h=>[h.name,hstreak(h,c.t).best]).sort((a,b)=>b[1]-a[1])[0];
  return[['Longest streak',c.best+' days'],['Highest XP day',mx('xp').xp+' ('+mx('xp').d+')'],['Highest score',mx('score').score],['Most tasks in a day',mx('done').done],['Most productive week',bw[1]+' XP ('+bw[0]+')'],['Most consistent habit',hb?hb[0]+' ('+hb[1]+'d)':'—']]}
function insights(c){const p=c.days.filter(d=>d.planned);if(p.length<3)return empty();
  const b=p.reduce((a,x)=>x.pct>a.pct?x:a),pace=c.xp/c.dayN*S.p.days;
  return `<div class="card"><p>Average completion: ${avg(c.days)}%. Best day: ${b.d} (${b.pct}%). Longest streak: ${c.best} days.</p><p class="mut">Current pace projection: about ${Math.round(pace)} XP by Day ${S.p.days} if today’s average holds. This is a projection from your data, not a guarantee.</p></div>`}
function report(c){const t=S.tasks,r=records(c);return `<h2>Final Arc report</h2><div class="card"><div class="grid">${stat('Duration',S.p.days+' days')}${stat('Level','1 → '+c.lvl.l)}${stat('Total XP',c.xp)}${stat('Tasks',c.tasksDone+'/'+t.length)}${stat('Avg completion',avg(c.days)+'%')}${stat('Best streak',c.best)}${stat('Achievements',Object.keys(S.ach).length)}${stat('Goals done',S.goals.filter(g=>g.done).length+'/'+S.goals.length)}</div>
  ${S.p.weight?`<p class="mut">Starting point: ${esc(S.p.weight)}${S.p.height?' · '+esc(S.p.height):''}. Record an end measurement in your journal to compare.</p>`:''}<h2>Cumulative XP</h2>${line((()=>{let s=0;return c.days.map(d=>s+=d.xp)})())}<h2>Records</h2><div class="grid">${r.map(x=>stat(x[0],x[1])).join('')}</div></div>`}

/* ---------- render, events ---------- */
function R(){
  if(!S)return onboard();repeats();
  const r=ROUTES.includes(location.hash.slice(1))?location.hash.slice(1):'home',c=calc();
  $('#app').innerHTML=`<div class="shell"><nav aria-label="Main"><b>WINTER ARC</b>${ROUTES.map(x=>`<a href="#${x}" class="${x===r?'on':''}" ${x===r?'aria-current="page"':''}>${x.toUpperCase()}</a>`).join('')}<small>LOCAL DATA</small></nav><main id="main">${V[r](c)}</main></div>`;
}
function onboard(step){
  const a=$('#app');
  if(!step){a.innerHTML=`<div class="intro"><h1>WINTER ARC</h1><p class="mut">Build the version of yourself that you keep.</p><div><button class="pri" data-a="start">START YOUR ARC</button></div></div>`;return}
  a.innerHTML=`<form class="ob" data-f="onboard"><h1>CREATE YOUR ARC</h1><label>Name (required)<input name="name" required></label><label>Age<input name="age" type="number"></label><label>Gender<input name="gender"></label>
  <label>Weight<input name="weight"></label><label>Height<input name="height"></label><label>Starting notes<textarea name="notes" rows="2"></textarea></label><label>Start date<input type="date" name="start" value="${today()}" required></label>
  <label>Duration<select name="days">${[30,60,90,120].map(n=>`<option>${n}</option>`).join('')}<option value="c">Custom</option></select></label><label>Custom days<input name="cdays" type="number" min="1" max="1000"></label><label>Main goal<input name="goal"></label><label>Why am I doing this?<textarea name="why" rows="2"></textarea></label>
  <p class="mut">Optional daily targets</p>${DEF_HABITS.map((h,i)=>`<label><input type="checkbox" name="h${i}" style="display:inline;width:auto"> ${h[0]}</label>`).join('')}<label>Custom habits (comma separated)<input name="custom"></label><button class="pri">Confirm and begin Day 1</button></form>`;
}
const cl={
start:()=>onboard(1),
tt:id=>{const x=S.tasks.find(t=>t.id===id);if(!x.done&&x.date>today()){toast('Future tasks unlock on their date.');return R()}act(()=>{x.done=!x.done})},
te:id=>taskForm(S.tasks.find(t=>t.id===id)),ta:()=>taskForm(),
td:id=>confirm('Delete this task?')&&act(()=>{S.tasks=S.tasks.filter(t=>t.id!==id)}),
tp:id=>act(()=>{const x=S.tasks.find(t=>t.id===id);if(!x.done)x.date=addD(x.date,1)}),
hc:id=>act(()=>{const h=S.habits.find(x=>x.id===id),t=today();h.log[t]?delete h.log[t]:h.log[t]=1}),
hd:id=>confirm('Delete habit and its history?')&&act(()=>{S.habits=S.habits.filter(h=>h.id!==id)}),
ha:()=>form('Add habit',[{k:'name',l:'Name',r:1},{k:'cat',l:'Category',o:CATS},{k:'freq',l:'Frequency',o:['Daily']},{k:'xp',l:'XP',t:'number',v:10}],f=>act(()=>S.habits.push({id:uid(),name:f.name,cat:f.cat,freq:f.freq,xp:+f.xp||10,log:{}}))),
ga:()=>form('New goal',[{k:'name',l:'Name',r:1},{k:'desc',l:'Description',t:'area'},{k:'cat',l:'Category',o:CATS},{k:'target',l:'Target (units)',t:'number',r:1,v:10},{k:'deadline',l:'Deadline',t:'date'},{k:'xp',l:'XP reward',t:'number',v:100}],f=>act(()=>S.goals.push({id:uid(),name:f.name,desc:f.desc,cat:f.cat,target:+f.target,cur:0,deadline:f.deadline,xp:+f.xp||0,done:false}))),
gp:id=>form('Log progress',[{k:'n',l:'Amount to add',t:'number',v:1,r:1}],f=>act(()=>{S.goals.find(g=>g.id===id).cur+=+f.n})),
gl:()=>S.goals.filter(g=>!g.done).length?form('Log goal progress',[{k:'id',l:'Goal',o:S.goals.filter(g=>!g.done).map(g=>[g.id,g.name])},{k:'n',l:'Amount',t:'number',v:1}],f=>act(()=>{S.goals.find(g=>g.id===f.id).cur+=+f.n})):toast('Create a goal first.'),
gd:id=>confirm('Delete goal?')&&act(()=>{S.goals=S.goals.filter(g=>g.id!==id)}),
day:d=>{const s=dayStats(d),a=Object.entries(S.ach).filter(e=>e[1]===d).map(e=>ACH.find(x=>x[0]===e[0])[1]);
  modal(`<h3>${d}</h3><p>Completion ${s.pct}% · XP ${s.xp} · Score ${s.score} · Tasks ${s.done}/${s.tasks} · Habits ${s.hdone}/${S.habits.length}</p><ul>${S.tasks.filter(x=>x.date===d).map(x=>`<li class="row">${x.done?'✓':'○'} ${esc(x.name)}</li>`).join('')}</ul>${a.length?'<p>Achievements: '+a.join(', ')+'</p>':''}`)},
wk:n=>{wk+=+n;R()},mo:n=>{mo+=+n;R()},
jopen:d=>{window._jd=d;R()},jdel:d=>confirm('Delete entry?')&&(delete S.journal[d],save().then(R)),
exp:()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({app:'winter-arc-os',v:1,state:S},null,1)],{type:'application/json'}));a.download='winter-arc-backup.json';a.click()},
imp:()=>$('#imp').click(),
reset:()=>{if(prompt('This deletes ALL data on this device. Type RESET to confirm.')==='RESET'){S=null;DB.set(null).then(()=>{location.hash='';R()})}}
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b&&cl[b.dataset.a]&&b.tagName!=='INPUT'||b&&b.type==='checkbox'&&cl[b.dataset.a])cl[b.dataset.a](b.dataset.id)});
document.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.a==='range'){localStorage.setItem('wa.range',t.value);R()}
  if(t.dataset.a==='jdate'){window._jd=t.value;R()}
  if(t.id==='imp'&&t.files[0])t.files[0].text().then(tx=>{try{const o=JSON.parse(tx),s=o.state;if(o.app!=='winter-arc-os'||!s||!s.p||!s.p.start||!Array.isArray(s.tasks)||!Array.isArray(s.habits))throw 0;
    if(confirm(`Import Arc for ${s.p.name}: ${s.p.days} days from ${s.p.start}, ${s.tasks.length} tasks, ${s.habits.length} habits?\nThis overwrites your current data.`)){S=s;save().then(R)}}catch{toast('Invalid backup file.')}})});
document.addEventListener('input',e=>{if(e.target.dataset.a==='jsearch'){window._q=e.target.value;const p=e.target.selectionStart;R();const n=document.querySelector('[data-a=jsearch]');n.focus();n.setSelectionRange(p,p)}});
document.addEventListener('submit',e=>{const f=e.target.dataset.f;if(!f)return;e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
  if(f==='onboard'){const days=o.days==='c'?+o.cdays||30:+o.days,hb=[];DEF_HABITS.forEach((h,i)=>o['h'+i]&&hb.push({id:uid(),name:h[0],cat:h[1],freq:'Daily',xp:10,log:{}}));
    (o.custom||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(n=>hb.push({id:uid(),name:n,cat:'Custom',freq:'Daily',xp:10,log:{}}));
    S={p:{name:o.name.trim(),age:o.age,gender:o.gender,weight:o.weight,height:o.height,notes:o.notes,start:o.start,days,goal:o.goal,why:o.why},tasks:[],habits:hb,goals:[],journal:{},ach:{},weekObj:{},monthGoals:{}};
    location.hash='home';return save().then(R)}
  act(()=>{const d=f==='review'?today():o.d;
    if(f==='review')S.journal[d]={...S.journal[d],well:o.well,improve:o.improve,tomorrow:o.tomorrow,mood:o.mood,energy:o.energy};
    if(f==='journal')S.journal[d]={...S.journal[d],intent:o.intent,reflect:o.reflect,notes:o.notes,mood:o.mood,energy:o.energy};
    if(f==='wobj')S.weekObj[o.k]=o.t;if(f==='mgoal')S.monthGoals[o.k]=o.t});toast('Saved')});
window.addEventListener('hashchange',R);
(async()=>{await DB.open();S=(await DB.get())||null;if(S){S.weekObj=S.weekObj||{};S.monthGoals=S.monthGoals||{}}R();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})})();
