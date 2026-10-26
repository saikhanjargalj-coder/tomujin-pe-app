/* ---------- PE class attendance, kept in the school's "LS Learning Data" Google Sheet ----------
   The sheet stays the one record: the page reads the "PE n" tabs and writes И / Х / Т / Ч into the cell for
   that student and day through a small script installed in the sheet (tools/sheet/attendance.gs).
   Only the owner reads and writes the class lists: the script checks the sign-in with Google on every call.
   The script address lives in private/peatt (owner-only). When the owner switches on "tell in advance"
   (away.js), the address is also put in config/absence so signed-in students can mark their own coming lesson. */
var PATT={url:'',sheet:'',loaded:false,sum:null,sumAt:0,sumBusy:false,data:{},key:'',date:'',view:'day',busy:{},bulk:false,msg:null,loading:false,err:''};
var PACODE=[['И','Ирсэн','ok'],['Х','Хоцорсон','g'],['Т','Тасалсан','o'],['Ч','Чөлөөтэй','t'],['Ө','Өвчтэй','t']];
var PAERR={'no-url':'Sheet-тэй холбоогүй байна. Доорх "Тохиргоо" хэсэгт холбоосоо оруулна уу.','not-allowed':'Энэ акаунтаар Sheet-ийг ашиглах эрхгүй.','bad-token':'Нэвтрэлт хүчингүй боллоо. Гараад дахин нэвтэрнэ үү.','no-date-column':'Sheet-д энэ өдрийн багана алга (толгойн огноо буруу байж магадгүй).','no-tab':'Sheet-д ийм хуудас алга.','bad-header':'Sheet-ийн толгой мөр (3-р мөр) өөрчлөгдсөн байна.','bad-code':'Зөвшөөрөгдөөгүй тэмдэг.'};
function paErr(e){var c=String((e&&e.message)||e||'');var k=c.split(':')[0];if(k==='no-student')return 'Sheet-д энэ сурагч олдсонгүй (мөр устсан эсвэл ID өөрчлөгдсөн).';return PAERR[k]||('Sheet-тэй холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.'+(c&&c.length<60?' ('+c+')':''))}
function paCall(q){
  if(window.TPE&&TPE.sheet)return TPE.sheet(q);   // preview: made-up class lists
  if(!PATT.url)return Promise.reject(new Error('no-url'));
  return sheetPost(PATT.url,q);
}
/* one call to the sheet script with the person's sign-in token (the script checks it with Google) */
function sheetPost(url,q){
  return TPE.idToken().then(function(t){
    var ctl=window.AbortController?new AbortController():null,to=setTimeout(function(){if(ctl)ctl.abort()},45000);
    return fetch(url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},q,{idToken:t})),signal:ctl?ctl.signal:undefined})
      .then(function(r){clearTimeout(to);return r.json()},function(e){clearTimeout(to);throw e})
      .then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'bad-answer');return j})});
}
function paKeep(k,v){try{if(v==null)localStorage.removeItem('tpe-patt-'+k);else localStorage.setItem('tpe-patt-'+k,v)}catch(e){}}
function paGet(k){try{return localStorage.getItem('tpe-patt-'+k)||''}catch(e){return ''}}
function paStart(){
  if(MYROLE!=='admin'||!db)return;
  unsubs.push(db.doc('private/peatt').onSnapshot(function(d){var x=d.exists?d.data():{};var was=PATT.url;PATT.url=x.url||'';PATT.sheet=x.sheet||'';PATT.loaded=true;if(PATT.url!==was){PATT.sum=null;PATT.data={}}paRefresh()},function(){PATT.loaded=true}));
}
/* Summary of every PE class (one call): class list for the picker and the teacher home. */
function paLoadSum(force){
  if(PATT.sumBusy||(PATT.sum&&!force&&Date.now()-PATT.sumAt<120000))return;
  PATT.sumBusy=true;PATT.err='';
  paCall({action:'summary'}).then(function(j){PATT.sum=j;PATT.sumAt=Date.now();PATT.sumBusy=false;
      var keys=paKeys();if(keys.indexOf(PATT.key)<0){var want=paGet('key');PATT.key=keys.indexOf(want)>=0?want:(keys[0]||'')}
      paRefresh();if(PATT.key&&!$('v-patt').hidden&&!PATT.data[paTab()])paLoadTab(paTab())},
    function(e){PATT.sumBusy=false;PATT.err=paErr(e);paRefresh()});
}
function paRefresh(){if(!$('v-patt').hidden)renderPatt();if(!$('v-coach').hidden&&typeof renderCoach==='function')renderCoach()}
function paKeys(){return ((PATT.sum&&PATT.sum.classes)||[]).map(function(c){return c.tab+'|'+c.cls})}
function paCls(key){key=key||PATT.key;return ((PATT.sum&&PATT.sum.classes)||[]).filter(function(c){return c.tab+'|'+c.cls===key})[0]||null}
function paTab(key){return String(key||PATT.key).split('|')[0]}
/* "12B" stays; a grade-only class on its own tab (PE 6 → 6) shows as 6A like the school system; other grades as "5-р анги". */
function paLabel(c){if(!c)return '';var g=String(c.cls),t=String(c.tab||'').replace(/\D/g,'');return /^\d+$/.test(g)?(g===t?g+'A':g+'-р анги ('+c.tab+')'):g}
function paOpen(key,date){PATT.key=key;paKeep('key',key);PATT.bulk=false;PATT.msg=null;if(date)PATT.date=date;if(!PATT.data[paTab(key)])paLoadTab(paTab(key),!!date);else{paPickDate(PATT.data[paTab(key)]);renderPatt()}}
function paPickDate(j){var td=ymd(new Date()),ds=j.dates||[];if(ds.indexOf(PATT.date)<0){var past=ds.filter(function(d){return d<=td});PATT.date=past.length?past[past.length-1]:(ds[0]||td)}}
function paLoadTab(tab,keepDate){
  PATT.loading=true;PATT.err='';PATT.bulk=false;renderPatt();
  paCall({action:'read',tab:tab}).then(function(j){PATT.data[tab]=j;PATT.loading=false;if(!keepDate)PATT.date='';paPickDate(j);renderPatt()},
    function(e){PATT.loading=false;PATT.err=paErr(e);renderPatt()});
}
function paIn(x){var c=paCls();return !!c&&(x.cls||x.grade||'?')===c.cls}
/* names the way the school system writes them: initial of the family name, then the given name (Б. Агар) */
function paName(x){return (x.last?x.last.charAt(0)+'. ':'')+x.first}
function paMD(iso){var d=new Date(iso+'T00:00:00Z');return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' ('+['Ня','Да','Мя','Лх','Пү','Ба','Бя'][d.getUTCDay()]+')'}
function paTot(x){var r={p:0,a:0,e:0,s:0};Object.keys(x.m||{}).forEach(function(d){var v=x.m[d];if(v==='И'||v==='Х')r.p++;else if(v==='Т')r.a++;else if(v==='Ч')r.e++;else if(v==='Ө')r.s++});r.h=r.p*2;return r}
function paWeek(sum,day){var w=sum&&sum.weeks||{},best='';Object.keys(w).forEach(function(d){if(d<=day&&d>best)best=d});var m=/^P(\d+)W(\d+)$/.exec(best?w[best]:'');return m?m[1]+'-р улирал, '+m[2]+'-р долоо хоног':''}
function paWrite(list,done){
  var tab=paTab(),j=PATT.data[tab],date=PATT.date,old={};
  list.forEach(function(w){var x=j.students.filter(function(s){return s.id===w.id})[0];if(x){old[w.id]=x.m[date]||'';if(w.code)x.m[date]=w.code;else delete x.m[date];PATT.busy[w.id]=1}});
  PATT.msg={t:'Sheet рүү бичиж байна…'};renderPatt();
  paCall({action:'mark',tab:tab,date:date,marks:list}).then(function(){list.forEach(function(w){delete PATT.busy[w.id]});PATT.sumAt=0;setTimeout(function(){paLoadSum(true)},400);PATT.msg={t:'✓ Sheet-д хадгалагдлаа ('+list.length+' сурагч, '+paMD(date)+').'};renderPatt();if(done)done()},
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
    h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',id:'pa-save',text:'Хадгалах',onclick:function(){var a=u.value.trim(),b=s.value.trim();
      if(a&&!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(a)){st.className='status err';st.textContent='Холбоос https://script.google.com/macros/s/…/exec хэлбэртэй байна.';return}
      if(b&&!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(b)){st.className='status err';st.textContent='Sheet-ийн холбоос https://docs.google.com/spreadsheets/… хэлбэртэй байна.';return}
      db.doc('private/peatt').set({url:a,sheet:b,at:Date.now()}).then(function(){st.className='status';st.textContent='Хадгалагдлаа.';PATT.sum=null;PATT.data={}},function(){st.className='status err';st.textContent='Хадгалж чадсангүй.'})}}),st])]);
}
/* Links to the school's own system (admin.tomujin.edu.mn). Only links for now: reading or writing its data
   needs an access key from the people who run it. Class pages there are /t/class/<class>-pe, e.g. 12a-pe. */
var PAADMIN='https://admin.tomujin.edu.mn';
function paAdminLinks(){
  var c=paLabel(paCls()),a=function(href,t){return h('a',{cls:'btn line small',href:PAADMIN+href,target:'_blank',rel:'noopener',text:t})};
  return h('div',{cls:'crstep',id:'pa-admin'},[h('b',{text:'Сургуулийн систем (admin.tomujin.edu.mn)'}),
    h('div',{cls:'chips'},[a('/t/attendance','QR-ээр ирц ↗'),a('/t/attendance/manual','Гараар ирц ↗')].concat(/^\d+[A-Z]$/.test(c)?[a('/t/class/'+c.toLowerCase()+'-pe',c+' анги ↗')]:[]))]);
}
function paCell(v){var c=PACODE.filter(function(k){return k[0]===v})[0];return h('td',{cls:'pa-c'+(v?' k-'+(c?c[2]:'x'):''),title:c?c[1]:'',text:v||'·'})}
function paMatrix(j,list,view){
  var d0=new Date(PATT.date+'T00:00:00Z'),ds;
  if(view==='week'){var mon=new Date(d0.getTime()-((d0.getUTCDay()+6)%7)*864e5),sun=new Date(mon.getTime()+6*864e5),a=mon.toISOString().slice(0,10),b=sun.toISOString().slice(0,10);ds=j.dates.filter(function(d){return d>=a&&d<=b})}
  else{var ym=PATT.date.slice(0,7),any={};list.forEach(function(x){Object.keys(x.m).forEach(function(d){any[d]=1})});ds=j.dates.filter(function(d){return d.slice(0,7)===ym&&(any[d]||d===PATT.date)})}
  if(!ds.length)return h('p',{cls:'muted',text:'Энэ хугацаанд ирц алга.'});
  return h('div',{cls:'scroll'},[h('table',{cls:'dose pa-mx'},[h('thead',{},[h('tr',{},[h('th',{text:'Сурагч'})].concat(ds.map(function(d){return h('th',{cls:'num'+(d===PATT.date?' on':''),text:paMD(d).replace(' (',' ').replace(')','')})})).concat([h('th',{cls:'num',text:'Ирсэн'})]))]),
    h('tbody',{},list.map(function(x){var p=0,n=0;ds.forEach(function(d){var v=x.m[d];if(v){n++;if(v==='И'||v==='Х')p++}});return h('tr',{},[h('td',{text:paName(x)})].concat(ds.map(function(d){return paCell(x.m[d]||'')})).concat([h('td',{cls:'num',text:n?p+'/'+n:'—'})]))}))])]);
}
function renderPatt(){
  var W=$('pattOut');if(!W)return;W.innerHTML='';
  if(MYROLE!=='admin'){W.appendChild(h('p',{cls:'muted',text:'Энэ хэсэг зөвхөн Жак багшид харагдана.'}));return}
  var preview=!!(window.TPE&&TPE.sheet);
  if(!PATT.loaded&&!preview){W.appendChild(h('p',{cls:'muted',text:'Ачаалж байна…'}));return}
  if(!PATT.url&&!preview){W.appendChild(h('div',{cls:'box'},[h('h3',{text:'Sheet-тэй холбогдоогүй'}),h('p',{style:'margin:0',text:'Хичээлийн ирц сургуулийн "LS Learning Data | TAS 2026-2027" Sheet-ийн PE 6 … PE 12 хуудсанд шууд бичигдэнэ. Нэг удаа холбоход хангалттай.'})]));W.appendChild(paSettings());return}
  if(!PATT.sum&&!PATT.sumBusy&&!PATT.err){paLoadSum();}
  var top=h('div',{cls:'chips',id:'pa-classes'});
  ((PATT.sum&&PATT.sum.classes)||[]).forEach(function(c){var k=c.tab+'|'+c.cls;top.appendChild(h('button',{type:'button',cls:'chip','aria-pressed':String(k===PATT.key),text:paLabel(c),title:c.n+' сурагч',onclick:function(){paOpen(k)}}))});
  top.appendChild(h('button',{type:'button',cls:'btn line small',text:'↻ Дахин унших',disabled:(PATT.loading||PATT.sumBusy)?'':null,onclick:function(){PATT.data={};paLoadSum(true);if(PATT.key)paLoadTab(paTab(),true)}}));
  if(PATT.sheet)top.appendChild(h('a',{cls:'btn line small',href:PATT.sheet,target:'_blank',rel:'noopener',text:'Sheet нээх ↗'}));
  W.appendChild(top);
  if(PATT.err)W.appendChild(h('p',{cls:'status err',role:'status',text:PATT.err}));
  var c=paCls(),j=PATT.data[paTab()];
  if((PATT.sumBusy&&!PATT.sum)||(PATT.loading&&!j)){W.appendChild(h('p',{cls:'muted',role:'status',text:'Sheet-ээс уншиж байна…'}))}
  if(c&&j){
    var td=ymd(new Date()),list=j.students.filter(paIn).sort(function(a,b){return a.first.localeCompare(b.first)}),d=PATT.date,has=j.dates.indexOf(d)>=0,future=d>td;
    W.appendChild(h('div',{cls:'pa-head'},[h('h2',{id:'pa-title',text:paLabel(c)+' · Биеийн тамир'}),
      h('p',{cls:'muted',style:'margin:0',text:[list.length+' сурагч',c.pct!=null?'Ирц '+c.pct+'%':'',c.last?'Сүүлийн хичээл '+paMD(c.last):'',paTab()].filter(Boolean).join(' · ')})]));
    var todo=list.filter(function(x){return !x.m[d]}),asked=function(x){var r=typeof absFor==='function'?absFor(x.email,d):null;return !!r&&r.status!=='ok'};
    var toP=todo.filter(function(x){return !asked(x)}),toA=todo.filter(asked);
    var ds=j.dates,ix=ds.indexOf(d);
    var date=h('input',{type:'date',id:'pa-date',min:ds[0]||null,max:ds[ds.length-1]||null,'aria-label':'Хичээлийн өдөр'});date.value=d;
    date.addEventListener('change',function(){if(date.value){PATT.date=date.value;PATT.bulk=false;PATT.msg=null;renderPatt()}});
    var go=function(step){var i=ds.indexOf(PATT.date);if(i<0){var after=ds.filter(function(x){return x>PATT.date});i=step>0?ds.indexOf(after[0])-1:ds.indexOf(after[0])}var n=ds[i+step];if(n){PATT.date=n;PATT.bulk=false;PATT.msg=null;renderPatt()}};
    var views=h('div',{cls:'chips',role:'group','aria-label':'Харах'});[['day','Өдөр'],['week','7 хоног'],['month','Сар']].forEach(function(v){views.appendChild(h('button',{type:'button',cls:'chip','aria-pressed':String(PATT.view===v[0]),text:v[1],onclick:function(){PATT.view=v[0];PATT.bulk=false;renderPatt()}}))});
    W.appendChild(h('div',{cls:'pa-ctl'},[
      h('button',{type:'button',cls:'btn gold small',id:'pa-bulk',disabled:(future||!has||!todo.length||PATT.view!=='day')?'':null,text:'Бүгд ирсэн болгох ('+todo.length+')',onclick:function(){PATT.bulk=true;renderPatt()}}),
      h('div',{cls:'chips',style:'gap:4px;align-items:center'},[h('button',{type:'button',cls:'btn line small',text:'‹','aria-label':'Өмнөх өдөр',onclick:function(){go(-1)}}),date,h('button',{type:'button',cls:'btn line small',text:'›','aria-label':'Дараагийн өдөр',onclick:function(){go(1)}})]),
      views]));
    if(j.odd&&j.odd.length){var want=j.odd.map(function(o){return o.want?paMD(o.want):''}).filter(Boolean),ys={};j.odd.forEach(function(o){ys[o.iso]=1});
      W.appendChild(h('details',{cls:'crdet',id:'pa-odd',style:'background:var(--gold-soft)'},[h('summary',{text:'⚠ Sheet-ийн толгойд '+j.odd.length+' огноо буруу'+(want.length?': '+want.join(', '):'')}),h('p',{style:'margin:0',text:'Эдгээр баганын 3-р мөрөнд '+Object.keys(ys).sort().map(function(x){return x.replace(/-/g,'/')}).join(', ')+' гэсэн өмнөх оны огноо бичигдсэн тул тэр өдрүүдийн ирцийг сайтаас бичихгүй. Sheet дээр огноог засвал автоматаар ажиллана.'})]))}
    if(PATT.view!=='day'){W.appendChild(h('div',{cls:'box',style:'padding:10px 14px'},[paMatrix(j,list,PATT.view)]))}
    else{
      if(!has)W.appendChild(h('p',{cls:'status err',role:'status',text:'Sheet-д '+paMD(d)+'-ний багана алга (амралтын өдөр эсвэл толгойн огноо буруу). Өөр өдөр сонгоно уу.'}));
      var n={};PACODE.forEach(function(k){n[k[0]]=0});var none=0;list.forEach(function(x){var v=x.m[d];if(v)n[v]=(n[v]||0)+1;else none++});
      var told=list.filter(function(x){return typeof absFor==='function'&&absFor(x.email,d)}).length;
      W.appendChild(h('p',{cls:'muted',style:'margin:0',text:paMD(d)+' · '+PACODE.map(function(k){return k[1]+' '+n[k[0]]}).join(' · ')+' · Тэмдэглээгүй '+none+(told?' · Хүсэлт '+told:'')}));
      if(future&&has)W.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Энэ өдөр хараахан болоогүй. Урьдчилан мэдэгдсэн бол "Чөлөөтэй" эсвэл "Өвчтэй" тэмдэглэж болно.'}));
      if(PATT.bulk&&!future&&has)W.appendChild(h('div',{cls:'box',id:'pa-preview',style:'border:2px solid var(--gold)'},[h('h3',{text:'Sheet-д бичихийн өмнө шалгана уу · '+paLabel(c)+' · '+paMD(d)}),
        h('p',{style:'margin:0',text:'"Ирсэн" (И) болно: '+toP.length+' сурагч.'}),h('p',{cls:'muted',style:'margin:0',text:toP.map(paName).join(', ')}),
        toA.length?h('p',{style:'margin:0',id:'pa-bulk-absent',text:'Хүсэлт өгсөн ч батлагдаагүй → "Тасалсан" (Т): '+toA.length+' сурагч: '+toA.map(paName).join(', ')+'. Ирсэн бол доороос "Ирсэн" дарна уу, шалтгааныг нь хүлээж авбал эхлээд "Батлах" дарна.'}):null,
        h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Аль хэдийн тэмдэглэсэн '+(list.length-todo.length)+' сурагч өөрчлөгдөхгүй.'}),
        h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold',id:'pa-bulk-ok',text:'Батлах ('+todo.length+')',onclick:function(ev){ev.currentTarget.disabled=true;PATT.bulk=false;paWrite(toP.map(function(x){return {id:x.id,code:'И'}}).concat(toA.map(function(x){return {id:x.id,code:'Т'}})))}}),
          h('button',{type:'button',cls:'btn line',text:'Болих',onclick:function(){PATT.bulk=false;renderPatt()}})])]));
      if(PATT.msg)W.appendChild(h('p',{cls:'status'+(PATT.msg.err?' err':''),role:'status',id:'pa-msg',text:PATT.msg.t}));
      var box=h('div',{cls:'box',style:'padding:6px 14px'});
      list.forEach(function(x){var v=x.m[d]||'',busy=!!PATT.busy[x.id],t=paTot(x);
        box.appendChild(h('div',{cls:'crrow pa-row','data-id':x.id},[h('div',{},[h('b',{text:paName(x)}),h('small',{cls:'muted',style:'display:block',text:[x.house,'ID '+x.id,t.h+' цаг',t.a?'Тасалсан '+t.a:'',t.e?'Чөлөөтэй '+t.e:'',t.s?'Өвчтэй '+t.s:''].filter(Boolean).join(' · ')}),(function(){var r=typeof absFor==='function'?absFor(x.email,d):null;return r?h('ul',{cls:'cues pa-told',style:'margin:4px 0 0'},[absReqLine(r,false)]):null})()]),
          h('div',{cls:'chips'},PACODE.map(function(k){var no=!has||(future&&k[0]!=='Ч'&&k[0]!=='Ө');return h('button',{type:'button',cls:'chip','aria-pressed':String(v===k[0]),disabled:(busy||no)?'':null,title:k[1],'aria-label':paName(x)+': '+k[1],onclick:function(){paWrite([{id:x.id,code:v===k[0]?'':k[0]}])}},[h('b',{text:k[0]}),h('span',{cls:'pl',text:' '+k[1]})])}))]))});
      if(!list.length)box.appendChild(h('p',{cls:'muted',text:'Энэ ангид сурагч алга.'}));
      W.appendChild(box);
    }
    W.appendChild(paAdminLinks());
    W.appendChild(h('p',{cls:'muted',style:'font-size:13px',text:'И = Ирсэн, Х = Хоцорсон (ирцэд тооцно), Т = Тасалсан, Ч = Чөлөөтэй, Ө = Өвчтэй. "цаг" нь Sheet-ийн "Ирц /цаг/"-тай адил: (И + Х) × 2. Дахин дарвал тэмдэглэгээ арилна.'}));
  }
  W.appendChild(paSettings());
  if((PATT.url||preview)&&typeof absSettings==='function')W.appendChild(absSettings());
}

/* Teacher home, after the school system's teacher page: greeting, four numbers, my classes, who needs attention. */
function paGreet(){var hr=ubD(Date.now()).getUTCHours();return hr<12?'Өглөөний мэнд':hr<18?'Өдрийн мэнд':'Оройн мэнд'}
function paHome(){
  var owner=MYROLE==='admin',sum=owner?PATT.sum:null,td=ymd(new Date()),d=ubD(Date.now());
  if(owner&&(PATT.url||(window.TPE&&TPE.sheet))&&!sum&&!PATT.sumBusy&&!PATT.err)setTimeout(function(){paLoadSum()});
  var who=owner?'Жак багш':((((MYPROFILE&&MYPROFILE.name)||(ME&&ME.name)||'').split(' ')[0]||'Багш')+' багш');
  var day=['Ням','Даваа','Мягмар','Лхагва','Пүрэв','Баасан','Бямба'][d.getUTCDay()]+', '+(d.getUTCMonth()+1)+'-р сарын '+d.getUTCDate();
  var wk=paWeek(sum,td);
  var W=h('div',{cls:'th',id:'teachHome'});
  W.appendChild(h('div',{cls:'th-top'},[h('div',{},[h('h2',{cls:'th-hi',text:paGreet()+', '+who+'.'}),h('p',{cls:'muted',style:'margin:0',text:day+(wk?' · '+wk:'')})]),
    h('div',{cls:'chips'},[owner?h('button',{type:'button',cls:'btn gold small',text:'📋 Ирц бүртгэх',onclick:function(){show('patt')}}):null,h('a',{cls:'btn line small',href:PAADMIN+'/t/schedule',target:'_blank',rel:'noopener',text:'Хуваарь ↗'})])]));
  var cls=(sum&&sum.classes)||[],tot={p:0,m:0,today:0,tc:0};cls.forEach(function(c){tot.p+=c.present;tot.m+=c.marked;tot.today+=c.today||0;if(c.today)tot.tc++});
  var wkLoads=LOADS.filter(function(x){return weekKey(x.at)===weekKey(Date.now())}),who7={};wkLoads.forEach(function(x){who7[x.uid]=1});
  function card(t,v,sub,ic,tone){return h('div',{cls:'tcard'},[h('div',{cls:'tc-h'},[h('span',{text:t}),h('i',{cls:'tc-ic '+tone,'aria-hidden':'true',text:ic})]),h('b',{cls:'tc-v',text:v}),h('small',{cls:'muted',text:sub})])}
  var sheetOk=owner&&!!sum;
  W.appendChild(h('div',{cls:'tcards'},[
    card('Өнөөдрийн ирц',sheetOk?String(tot.today):'—',sheetOk?(tot.today?tot.tc+' ангид тэмдэглэсэн':'Өнөөдөр ирц бүртгээгүй'):(owner?'Sheet-ээс уншиж байна…':'Зөвхөн Жак багшид'),'✓','p'),
    card('Ирцийн хувь',sheetOk&&tot.m?Math.round(tot.p/tot.m*100)+'%':'—','Бүх анги · И + Х','◎','t'),
    card('Анхаарах сурагч',sheetOk?String(sum.watch.length):'—','Сүүлийн 4 долоо хоногт 2+ удаа тасалсан','!','g'),
    card('Бэлтгэлийн тэмдэглэл',String(wkLoads.length),'Энэ 7 хоногт · '+Object.keys(who7).length+' сурагч','✎','o')]));
  if(sheetOk&&cls.length){
    W.appendChild(h('h3',{style:'margin:6px 0 0',text:'Миний ангиуд'}));
    W.appendChild(h('div',{cls:'clsgrid'},cls.map(function(c){var k=c.tab+'|'+c.cls;
      return h('button',{type:'button',cls:'clscard','data-key':k,onclick:function(){paOpen(k);show('patt')}},[h('div',{cls:'cc-h'},[h('b',{text:paLabel(c)}),h('span',{'aria-hidden':'true',text:'›'})]),
        h('span',{cls:'muted',text:'Биеийн тамир · '+c.n+' сурагч'}),
        h('div',{cls:'chips'},[h('span',{cls:'tag',text:'Ирц '+(c.pct!=null?c.pct+'%':'—')}),c.absent?h('span',{cls:'tag',text:'Тасалсан '+c.absent}):null]),
        h('small',{text:c.last?'Сүүлийн хичээл: '+paMD(c.last):'Ирц хараахан алга'})])})));
    var awayBox=typeof absTeachBox==='function'?absTeachBox(sum):null;if(awayBox)W.appendChild(awayBox);
    if(sum.watch.length)W.appendChild(h('div',{cls:'box'},[h('h3',{text:'Анхаарах сурагч'}),h('ul',{cls:'cues'},sum.watch.map(function(x){var c=cls.filter(function(k){return k.tab===x.tab&&k.cls===x.cls})[0];
      return h('li',{},[h('button',{type:'button',cls:'exlink',text:paName(x)+' · '+paLabel(c||{cls:x.cls,tab:x.tab}),onclick:function(){paOpen(x.tab+'|'+x.cls);show('patt')}}),h('span',{cls:'muted',text:' · сүүлийн 4 долоо хоногт '+x.absent+' удаа тасалсан'})])}))]));
  }else if(owner&&!PATT.url&&!(window.TPE&&TPE.sheet))W.appendChild(h('p',{cls:'muted',text:'Ангийн ирцийг харахын тулд "Хичээлийн ирц" хуудсаар Sheet-тэй холбоно уу.'}));
  else if(owner&&PATT.err)W.appendChild(h('p',{cls:'status err',text:PATT.err}));
  return W;
}
