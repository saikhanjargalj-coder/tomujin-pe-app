/* ---------- PE class attendance, kept in the school's "LS Learning Data" Google Sheet ----------
   The sheet stays the one record: the page reads the "PE n" tabs and writes И / Х / Т / Ч into the cell for
   that student and day through a small script installed in the sheet (tools/sheet/attendance.gs).
   Only the owner can use it: the script checks the sign-in with Google on every call.
   The script address lives in private/peatt (owner-only), not in the public site settings. */
var PATT={url:'',sheet:'',loaded:false,tabs:null,tab:'',data:{},cls:'all',date:'',busy:{},bulk:false,msg:null,loading:false,err:''};
var PACODE=[['И','Ирсэн','ok'],['Х','Хоцорсон','g'],['Т','Тасалсан','o'],['Ч','Чөлөөтэй','t'],['Ө','Өвчтэй','t']];
var PAERR={'no-url':'Sheet-тэй холбоогүй байна. Доорх "Тохиргоо" хэсэгт холбоосоо оруулна уу.','not-allowed':'Энэ акаунтаар Sheet-ийг ашиглах эрхгүй.','bad-token':'Нэвтрэлт хүчингүй боллоо. Гараад дахин нэвтэрнэ үү.','no-date-column':'Sheet-д энэ өдрийн багана алга (толгойн огноо буруу байж магадгүй).','no-tab':'Sheet-д ийм хуудас алга.','bad-header':'Sheet-ийн толгой мөр (3-р мөр) өөрчлөгдсөн байна.','bad-code':'Зөвшөөрөгдөөгүй тэмдэг.'};
function paErr(e){var c=String((e&&e.message)||e||'');var k=c.split(':')[0];if(k==='no-student')return 'Sheet-д энэ сурагч олдсонгүй (мөр устсан эсвэл ID өөрчлөгдсөн).';return PAERR[k]||('Sheet-тэй холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.'+(c&&c.length<60?' ('+c+')':''))}
function paCall(q){
  if(window.TPE&&TPE.sheet)return TPE.sheet(q);   // preview: made-up class lists
  if(!PATT.url)return Promise.reject(new Error('no-url'));
  return TPE.idToken().then(function(t){
    var ctl=window.AbortController?new AbortController():null,to=setTimeout(function(){if(ctl)ctl.abort()},45000);
    return fetch(PATT.url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},q,{idToken:t})),signal:ctl?ctl.signal:undefined})
      .then(function(r){clearTimeout(to);return r.json()},function(e){clearTimeout(to);throw e})
      .then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'bad-answer');return j})});
}
function paKeep(k,v){try{if(v==null)localStorage.removeItem('tpe-patt-'+k);else localStorage.setItem('tpe-patt-'+k,v)}catch(e){}}
function paGet(k){try{return localStorage.getItem('tpe-patt-'+k)||''}catch(e){return ''}}
function paStart(){
  if(MYROLE!=='admin'||!db)return;
  unsubs.push(db.doc('private/peatt').onSnapshot(function(d){var x=d.exists?d.data():{};PATT.url=x.url||'';PATT.sheet=x.sheet||'';PATT.loaded=true;if(!$('v-patt').hidden)renderPatt()},function(){PATT.loaded=true}));
}
function paLoadTabs(){
  if(PATT.loading)return;PATT.loading=true;PATT.err='';renderPatt();
  paCall({action:'tabs'}).then(function(j){PATT.tabs=j.tabs||[];PATT.loading=false;var want=paGet('tab');PATT.tab=PATT.tabs.indexOf(want)>=0?want:(PATT.tabs[0]||'');if(PATT.tab)paLoadTab(PATT.tab);else renderPatt()},
    function(e){PATT.loading=false;PATT.err=paErr(e);renderPatt()});
}
function paLoadTab(tab,keepDate){
  PATT.tab=tab;paKeep('tab',tab);PATT.loading=true;PATT.err='';PATT.bulk=false;renderPatt();
  paCall({action:'read',tab:tab}).then(function(j){PATT.data[tab]=j;PATT.loading=false;
    var td=ymd(new Date()),ds=j.dates||[];if(!keepDate||ds.indexOf(PATT.date)<0){var past=ds.filter(function(d){return d<=td});PATT.date=past.length?past[past.length-1]:(ds[0]||'')}
    var cl=paClasses(j);if(PATT.cls!=='all'&&cl.indexOf(PATT.cls)<0)PATT.cls='all';renderPatt()},
    function(e){PATT.loading=false;PATT.err=paErr(e);renderPatt()});
}
function paClasses(j){var s={};(j.students||[]).forEach(function(x){var c=x.cls||x.grade;if(c)s[c]=1});return Object.keys(s).sort()}
function paName(x){return x.first+(x.last?' '+x.last.charAt(0)+'.':'')}
function paMD(iso){var d=new Date(iso+'T00:00:00Z');return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' ('+['Ня','Да','Мя','Лх','Пү','Ба','Бя'][d.getUTCDay()]+')'}
function paTot(x){var r={p:0,a:0,e:0,s:0};Object.keys(x.m||{}).forEach(function(d){var v=x.m[d];if(v==='И'||v==='Х')r.p++;else if(v==='Т')r.a++;else if(v==='Ч')r.e++;else if(v==='Ө')r.s++});r.h=r.p*2;return r}
function paWrite(list,done){
  var j=PATT.data[PATT.tab],date=PATT.date,old={};
  list.forEach(function(w){var x=j.students.filter(function(s){return s.id===w.id})[0];if(x){old[w.id]=x.m[date]||'';if(w.code)x.m[date]=w.code;else delete x.m[date];PATT.busy[w.id]=1}});
  PATT.msg={t:'Sheet рүү бичиж байна…'};renderPatt();
  paCall({action:'mark',tab:PATT.tab,date:date,marks:list}).then(function(){list.forEach(function(w){delete PATT.busy[w.id]});PATT.msg={t:'✓ Sheet-д хадгалагдлаа ('+list.length+' сурагч, '+paMD(date)+').'};renderPatt();if(done)done()},
    function(e){list.forEach(function(w){var x=j.students.filter(function(s){return s.id===w.id})[0];if(x){if(old[w.id])x.m[date]=old[w.id];else delete x.m[date]}delete PATT.busy[w.id]});PATT.msg={t:paErr(e)+' Тэмдэглэгээ Sheet-д ороогүй, хуучнаараа үлдлээ.',err:1};renderPatt()});
}
function paSettings(){
  var st=h('p',{cls:'status',role:'status'});
  var u=h('input',{type:'url',id:'pa-url',placeholder:'https://script.google.com/macros/s/…/exec'});u.value=PATT.url;
  var s=h('input',{type:'url',id:'pa-sheet',placeholder:'https://docs.google.com/spreadsheets/d/…'});s.value=PATT.sheet;
  var cp=h('span',{cls:'status',role:'status'});
  return h('details',{cls:'crdet',open:(PATT.url||(window.TPE&&TPE.sheet))?null:''},[h('summary',{text:'Тохиргоо: Sheet-тэй холбох'}),
    h('ol',{cls:'tl'},['Sheet-ээ нээгээд: Extensions → Apps Script.','Доорх "Кодыг хуулах" товч дарж, Apps Script-д тавиад хадгална.','Deploy → New deployment → Web app. Execute as: Me, Who has access: Anyone → Deploy → зөвшөөрнө.','Гарсан Web app холбоосыг доор тавиад хадгална.'].map(function(t){return h('li',{text:t})})),
    h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn line small',text:'Кодыг хуулах',onclick:function(){var t=(typeof PASCRIPT==='string'?PASCRIPT:'');(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){cp.className='status';cp.textContent='Хуулагдлаа ('+t.length+' тэмдэгт).'},function(){cp.className='status err';cp.textContent='Хуулж чадсангүй.'})}}),cp]),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Холбоос зөвхөн танд хадгалагдана. Script нь хүсэлт бүрт таны нэвтрэлтийг Google-ээр шалгадаг тул өөр хүн ашиглаж чадахгүй. Утас, РД, эцэг эхийн мэдээлэл сайт руу ирэхгүй.'}),
    h('label',{cls:'ff',for:'pa-url'},['Web app холбоос (…/exec)',u]),h('label',{cls:'ff',for:'pa-sheet'},['Sheet-ийн холбоос (заавал биш, "Sheet нээх" товчинд)',s]),
    h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',text:'Хадгалах',onclick:function(){var a=u.value.trim(),b=s.value.trim();
      if(a&&!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(a)){st.className='status err';st.textContent='Холбоос https://script.google.com/macros/s/…/exec хэлбэртэй байна.';return}
      if(b&&!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(b)){st.className='status err';st.textContent='Sheet-ийн холбоос https://docs.google.com/spreadsheets/… хэлбэртэй байна.';return}
      db.doc('private/peatt').set({url:a,sheet:b,at:Date.now()}).then(function(){st.className='status';st.textContent='Хадгалагдлаа.';PATT.tabs=null;PATT.data={}},function(){st.className='status err';st.textContent='Хадгалж чадсангүй.'})}}),st])]);
}
function renderPatt(){
  var W=$('pattOut');if(!W)return;W.innerHTML='';
  if(MYROLE!=='admin'){W.appendChild(h('p',{cls:'muted',text:'Энэ хэсэг зөвхөн Жак багшид харагдана.'}));return}
  var preview=!!(window.TPE&&TPE.sheet);
  if(!PATT.loaded&&!preview){W.appendChild(h('p',{cls:'muted',text:'Ачаалж байна…'}));return}
  if(!PATT.url&&!preview){W.appendChild(h('div',{cls:'box'},[h('h3',{text:'Sheet-тэй холбогдоогүй'}),h('p',{style:'margin:0',text:'Хичээлийн ирц сургуулийн "LS Learning Data | TAS 2026-2027" Sheet-ийн PE 6 … PE 12 хуудсанд шууд бичигдэнэ. Нэг удаа холбоход хангалттай.'})]));W.appendChild(paSettings());return}
  if(PATT.tabs===null&&!PATT.loading&&!PATT.err){paLoadTabs();return}
  var top=h('div',{cls:'chips'});
  (PATT.tabs||[]).forEach(function(t){top.appendChild(h('button',{type:'button',cls:'chip','aria-pressed':String(t===PATT.tab),text:t,onclick:function(){PATT.cls='all';paLoadTab(t)}}))});
  top.appendChild(h('button',{type:'button',cls:'btn line small',text:'↻ Sheet-ээс дахин унших',disabled:PATT.loading?'':null,onclick:function(){PATT.tab?paLoadTab(PATT.tab,true):paLoadTabs()}}));
  if(PATT.sheet)top.appendChild(h('a',{cls:'btn line small',href:PATT.sheet,target:'_blank',rel:'noopener',text:'Sheet нээх ↗'}));
  W.appendChild(top);
  if(PATT.err){W.appendChild(h('p',{cls:'status err',role:'status',text:PATT.err}))}
  var j=PATT.data[PATT.tab];
  if(PATT.loading&&!j){W.appendChild(h('p',{cls:'muted',role:'status',text:'Sheet-ээс уншиж байна…'}))}
  if(j){
    var cls=paClasses(j);
    if(cls.length>1){var cr=h('div',{cls:'chips'});[['all','Бүгд']].concat(cls.map(function(c){return [c,c]})).forEach(function(c){cr.appendChild(h('button',{type:'button',cls:'chip','aria-pressed':String(PATT.cls===c[0]),text:c[1],onclick:function(){PATT.cls=c[0];PATT.bulk=false;renderPatt()}}))});W.appendChild(cr)}
    var td=ymd(new Date()),marked={};j.students.forEach(function(x){Object.keys(x.m).forEach(function(d){marked[d]=1})});
    var sel=h('select',{id:'pa-date'},j.dates.map(function(d){return h('option',{value:d,text:paMD(d)+(d===td?' · өнөөдөр':'')+(marked[d]?' · ✓':'')+(d>td?' · болоогүй':'')})}));sel.value=PATT.date;
    sel.addEventListener('change',function(){PATT.date=sel.value;PATT.bulk=false;PATT.msg=null;renderPatt()});
    W.appendChild(h('label',{cls:'ff',for:'pa-date'},['Хичээлийн өдөр',sel]));
    if(j.odd&&j.odd.length){var want=j.odd.map(function(o){return o.want?paMD(o.want):''}).filter(Boolean),ys={};j.odd.forEach(function(o){ys[o.iso]=1});
      W.appendChild(h('div',{cls:'crstep',style:'background:var(--gold-soft)'},[h('b',{text:'Sheet-ийн толгойд '+j.odd.length+' огноо буруу байна'+(want.length?': '+want.join(', '):'')}),h('span',{text:'Эдгээр баганын 3-р мөрөнд '+Object.keys(ys).sort().map(function(x){return x.replace(/-/g,'/')}).join(', ')+' гэсэн өмнөх оны огноо бичигдсэн тул тэр өдрүүдийн ирцийг сайтаас бичихгүй. Sheet дээр огноог засвал автоматаар ажиллана.'})]))}
    var list=j.students.filter(function(x){return PATT.cls==='all'||(x.cls||x.grade)===PATT.cls}).sort(function(a,b){return (a.cls||'').localeCompare(b.cls||'')||a.first.localeCompare(b.first)});
    var d=PATT.date,future=d>td,n={};PACODE.forEach(function(c){n[c[0]]=0});var none=0;list.forEach(function(x){var v=x.m[d];if(v)n[v]=(n[v]||0)+1;else none++});
    W.appendChild(h('p',{cls:'muted',style:'margin:0',text:PACODE.map(function(c){return c[1]+' '+n[c[0]]}).join(' · ')+' · Тэмдэглээгүй '+none+' · Нийт '+list.length}));
    if(future)W.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Энэ өдөр хараахан болоогүй. Урьдчилан мэдэгдсэн бол "Чөлөөтэй" эсвэл "Өвчтэй" тэмдэглэж болно.'}));
    var todo=list.filter(function(x){return !x.m[d]});
    if(!future&&!PATT.bulk)W.appendChild(h('div',{cls:'chips'},[h('button',{type:'button',cls:'btn line small',id:'pa-bulk',disabled:todo.length?null:'',text:'Тэмдэглээгүй бүгдийг "Ирсэн" болгох…',onclick:function(){PATT.bulk=true;renderPatt()}})]));
    if(!future&&PATT.bulk)W.appendChild(h('div',{cls:'box',id:'pa-preview',style:'border:2px solid var(--gold)'},[h('h3',{text:'Sheet-д бичихийн өмнө шалгана уу · '+paMD(d)}),
      h('p',{style:'margin:0',text:'"Ирсэн" (И) болно: '+todo.length+' сурагч'+(PATT.cls!=='all'?' ('+PATT.cls+')':'')+'.'}),h('p',{cls:'muted',style:'margin:0',text:todo.map(paName).join(', ')}),
      h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Аль хэдийн тэмдэглэсэн '+(list.length-todo.length)+' сурагч өөрчлөгдөхгүй.'}),
      h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold',id:'pa-bulk-ok',text:'Батлах ('+todo.length+')',onclick:function(ev){ev.currentTarget.disabled=true;PATT.bulk=false;paWrite(todo.map(function(x){return {id:x.id,code:'И'}}))}}),
        h('button',{type:'button',cls:'btn line',text:'Болих',onclick:function(){PATT.bulk=false;renderPatt()}})])]));
    if(PATT.msg)W.appendChild(h('p',{cls:'status'+(PATT.msg.err?' err':''),role:'status',id:'pa-msg',text:PATT.msg.t}));
    var box=h('div',{cls:'box',style:'padding:6px 14px'});
    list.forEach(function(x){var v=x.m[d]||'',busy=!!PATT.busy[x.id],t=paTot(x);
      box.appendChild(h('div',{cls:'crrow pa-row','data-id':x.id},[h('div',{},[h('b',{text:paName(x)}),h('small',{cls:'muted',style:'display:block',text:[x.cls||x.grade,t.h+' цаг',t.a?'Тасалсан '+t.a:'',t.e?'Чөлөөтэй '+t.e:'',t.s?'Өвчтэй '+t.s:''].filter(Boolean).join(' · ')})]),
        h('div',{cls:'chips'},PACODE.map(function(c){var no=future&&c[0]!=='Ч'&&c[0]!=='Ө';return h('button',{type:'button',cls:'chip','aria-pressed':String(v===c[0]),disabled:(busy||no)?'':null,title:c[1],'aria-label':paName(x)+': '+c[1],onclick:function(){paWrite([{id:x.id,code:v===c[0]?'':c[0]}])}},[h('b',{text:c[0]}),h('span',{cls:'pl',text:' '+c[1]})])}))]))});
    if(!list.length)box.appendChild(h('p',{cls:'muted',text:'Энэ хуудсанд сурагч алга.'}));
    W.appendChild(box);
    W.appendChild(h('p',{cls:'muted',style:'font-size:13px',text:'И = Ирсэн, Х = Хоцорсон (ирцэд тооцно), Т = Тасалсан, Ч = Чөлөөтэй, Ө = Өвчтэй. "цаг" нь Sheet-ийн "Ирц /цаг/"-тай адил: (И + Х) × 2. Дахин дарвал тэмдэглэгээ арилна.'}));
  }
  W.appendChild(paSettings());
}
