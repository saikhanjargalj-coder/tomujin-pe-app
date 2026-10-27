/* ---------- teacher dashboard: every card, row and name opens ----------
   Cards open the detail behind the number; a student opens their full record; a training log entry opens
   all its answers. Only the owner edits (a student's name and class, the answers of a log entry, test
   results through the assessment page) and writes notes. Notes are for teachers only: students never see
   them (firestore.rules: tnotes are read by teachers, written by the owner). */
var TNOTES=[],CXOPEN=null; // CXOPEN: what the side panel shows now, so live updates can redraw it
function cxStart(){
  if(!db||!isStaff())return;
  unsubs.push(db.collection('tnotes').onSnapshot(function(s){TNOTES=s.docs.map(function(d){var x=d.data();x.id=d.id;return x}).sort(function(a,b){return (b.at||0)-(a.at||0)});
    if(!$('v-coach').hidden)renderCoach();cxNotesRefresh()},function(){}));
}
function cxStop(){TNOTES=[];CXOPEN=null}
function cxOwner(){return MYROLE==='admin'}
function cxName(uid,fallback){var u=USERS[uid];return u?(u.name||u.email||fallback||'—'):(fallback||'—')}
function cxId(x){return String(x&&x._p||'').split('/').pop()}
function cxWhen(ms){var d=ubD(ms);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)}
function cxNotesOf(uid,lid){return TNOTES.filter(function(n){return n.uid===uid&&(lid==null||(n.lid||'')===lid)})}
function cxSheet(open,build){CXOPEN=open;openSheet(build)}
function cxRedraw(){if(!CXOPEN||$('sheet').hidden)return;var c=CXOPEN;if(c.k==='student')cxStudent(c.uid,true);else if(c.k==='entry')cxEntry(c.p,true);else if(c.k==='week')cxWeek(true)}
function cxRow(cells,fn,label){return h('tr',{cls:'cxrow',tabindex:'0','aria-label':label||null,onclick:function(e){if(e.target.closest&&e.target.closest('a,button,input,select,textarea'))return;fn()},
  onkeydown:function(e){if((e.key==='Enter'||e.key===' ')&&e.target===e.currentTarget){e.preventDefault();fn()}}},cells)}

/* ---------- cards ---------- */
function cxAttendance(sum){
  var cls=(sum&&sum.classes)||[];
  cxSheet({k:'att'},function(p){
    $('sheetEyebrow').textContent='Хичээлийн ирц';p.appendChild(h('h2',{id:'sheetTitle',text:'Ирцийн хувь ангиар'}));
    p.appendChild(h('p',{cls:'muted',text:'И (ирсэн) + Х (хоцорсон) / тэмдэглэсэн бүх хичээл. Анги дээр дарж тухайн ангийн ирцийг нээнэ.'}));
    if(!cls.length){p.appendChild(h('p',{cls:'muted',text:'Ирцийн мэдээлэл хараахан алга.'}));return}
    p.appendChild(h('div',{cls:'scroll'},[h('table',{cls:'dose'},[h('thead',{},[h('tr',{},['Анги','Сурагч','Ирц','Тасалсан','Өнөөдөр','Сүүлийн хичээл'].map(function(x){return h('th',{text:x})}))]),
      h('tbody',{},cls.map(function(c){var k=c.tab+'|'+c.cls;function go(){closeSheet();paOpen(k);show('patt')}
        return cxRow([h('td',{},[h('button',{type:'button',cls:'exlink',text:paLabel(c),onclick:go})]),h('td',{cls:'num',text:String(c.n||0)}),
          h('td',{cls:'num'},[h('span',{cls:'tag '+(c.pct==null?'':c.pct>=90?'k-ok':c.pct>=75?'k-g':'k-o'),text:c.pct!=null?c.pct+'%':'—'})]),
          h('td',{cls:'num',text:String(c.absent||0)}),h('td',{cls:'num',text:c.today?String(c.today):'—'}),h('td',{cls:'num',text:c.last?paMD(c.last):'—'})],go,paLabel(c))}))])]));
  });
}
function cxWatch(sum){
  var cls=(sum&&sum.classes)||[],L=(sum&&sum.watch)||[];
  cxSheet({k:'watch'},function(p){
    $('sheetEyebrow').textContent='Хичээлийн ирц';p.appendChild(h('h2',{id:'sheetTitle',text:'Анхаарах сурагч ('+L.length+')'}));
    p.appendChild(h('p',{cls:'muted',text:'Сүүлийн 4 долоо хоногт 2 ба түүнээс олон удаа тасалсан. Нэр дээр дарж тухайн ангийн ирцийг нээнэ.'}));
    if(!L.length){p.appendChild(h('p',{cls:'muted',text:'Одоогоор анхаарах сурагч алга.'}));return}
    p.appendChild(h('div',{cls:'scroll'},[h('table',{cls:'dose'},[h('thead',{},[h('tr',{},['Сурагч','Анги','Тасалсан'].map(function(x){return h('th',{text:x})}))]),
      h('tbody',{},L.slice().sort(function(a,b){return b.absent-a.absent}).map(function(x){var c=cls.filter(function(k){return k.tab===x.tab&&k.cls===x.cls})[0]||{cls:x.cls,tab:x.tab};
        function go(){closeSheet();paOpen(x.tab+'|'+x.cls);show('patt')}
        return cxRow([h('td',{},[h('button',{type:'button',cls:'exlink',text:paName(x),onclick:go})]),h('td',{text:paLabel(c)}),h('td',{cls:'num'},[h('span',{cls:'tag k-o',text:x.absent+' удаа'})])],go,paName(x))}))])]));
  });
}
var cxWeekCls='all';
function cxWeek(keep){
  cxSheet({k:'week'},function(p){
    var wk=weekKey(Date.now());
    $('sheetEyebrow').textContent='Бэлтгэлийн тэмдэглэл';p.appendChild(h('h2',{id:'sheetTitle',text:'Энэ долоо хоногийн тэмдэглэл'}));
    var row=h('div',{cls:'chips'});chipRow(row,[['all','Бүх анги']].concat(CLASSES.filter(function(c){return !c.deleted}).map(function(c){return [c.id,c.name]})),cxWeekCls,function(v){cxWeekCls=v;cxWeek(true)});p.appendChild(row);
    var inCls=function(cid){return cxWeekCls==='all'||(cid||'')===cxWeekCls};
    var L=LOADS.filter(function(x){return weekKey(x.at)===wk&&inCls(x.classId)}).sort(function(a,b){return b.at-a.at});
    var who={};L.forEach(function(x){who[x.uid]=1});
    var avg=L.length?(L.reduce(function(a,x){return a+x.rpe},0)/L.length).toFixed(1):'—';
    p.appendChild(h('div',{cls:'big3'},[kpi(String(L.length),'Тэмдэглэл','энэ долоо хоногт',true),kpi(String(Object.keys(who).length),'Бичсэн сурагч',''),kpi(avg,'Дундаж хүндийн оноо',''),
      kpi(String(L.filter(function(x){return x.sore>=4}).length),'Их өвдөлттэй','булчингийн өвдөлт 4–5')]));
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Тэмдэглэлүүд'}),L.length?cxEntryTable(L,true):h('p',{cls:'muted',text:'Энэ долоо хоногт тэмдэглэл алга.'})]));
    var miss=Object.keys(USERS).filter(function(u){var x=USERS[u];return x&&x.email&&inCls(x.classId)&&!who[u]&&x.classId}).sort(function(a,b){return cxName(a).localeCompare(cxName(b))});
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Энэ долоо хоногт бичээгүй ('+miss.length+')'}),
      miss.length?h('div',{cls:'chips'},miss.map(function(u){return h('button',{type:'button',cls:'tag t',text:cxName(u)+' · '+className(USERS[u].classId),onclick:function(){cxStudent(u)}})})):h('p',{cls:'muted',style:'margin:0',text:'Бүгд бичсэн байна.'})]));
  });
}
/* one table for log entries; a row opens the entry */
function cxEntryTable(L,withName){
  return h('div',{cls:'scroll'},[h('table',{cls:'dose'},[h('thead',{},[h('tr',{},(withName?['Огноо','Сурагч','Анги']:['Огноо']).concat(['Оноо','Мин','Ачаалал','Мэдрэмж','Өвдөлт','Нойр','Бодол','Strava','Тэмд.']).map(function(x){return h('th',{text:x})}))]),
    h('tbody',{},L.map(function(x){var n=cxNotesOf(x.uid,cxId(x)).length;function go(){cxEntry(x._p)}
      return cxRow([h('td',{cls:'num'},[h('button',{type:'button',cls:'exlink',text:cxWhen(x.at)+(x.editedAt?' ✎':''),onclick:go})])].concat(withName?[h('td',{text:cxName(x.uid,x.name)}),h('td',{text:className(x.classId)||'—'})]:[]).concat([
        h('td',{cls:'num',text:String(x.rpe)}),h('td',{cls:'num',text:String(x.min)}),h('td',{cls:'num',text:String(x.load)}),h('td',{text:FEELL[x.feel]||'—'}),
        h('td',{text:(x.sore>=4?'⚠ ':'')+(SOREL[x.sore]||'—')}),h('td',{cls:'num',text:sleepTxt(x.sleep)}),h('td',{cls:'muted cxnote',text:x.note||''}),h('td',{},[typeof stvLogLink==='function'?stvLogLink(x):null]),
        h('td',{cls:'num',text:n?'💬 '+n:''})]),go,cxName(x.uid,x.name)+' '+cxWhen(x.at))}))])]);
}

/* ---------- a student ---------- */
function openStudent(u){cxStudent(u&&u.uid?u.uid:u)}
function cxStudent(uid,keep){
  var u=USERS[uid];if(!u)return;
  var sc=keep?$('panel').scrollTop:0;
  cxSheet({k:'student',uid:uid},function(p){
    var c=CLASSES.filter(function(k){return k.id===u.classId})[0];
    $('sheetEyebrow').textContent='Сурагч'+(c?' · '+c.name:'');
    p.appendChild(h('h2',{id:'sheetTitle',text:u.name||u.email}));p.appendChild(h('p',{cls:'muted',style:'margin:0',text:u.email||''}));
    if(cxOwner()){
      var st=h('span',{cls:'status',role:'status'});
      var ed=h('details',{cls:'box cxedit'},[h('summary',{text:'✎ Нэр, анги засах'}),
        h('div',{cls:'fgrid'},[fText('cx-name','Овог нэр',u.name||'',{}),fSelect('cx-class','Анги',[['','— Ангигүй —']].concat(CLASSES.map(function(k){return [k.id,k.name]})),u.classId||'')]),
        h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',text:'Хадгалах',onclick:function(){var nm=val('cx-name');if(!nm){st.className='status err';st.textContent='Нэр хоосон байж болохгүй.';return}
          st.className='status';st.textContent='Хадгалж байна…';
          db.doc('users/'+uid).update({name:nm.slice(0,80),classId:val('cx-class')}).then(function(){st.textContent='Хадгалагдлаа.';USERS[uid]=Object.assign({},USERS[uid],{name:nm.slice(0,80),classId:val('cx-class')});cxStudent(uid,true)},
            function(){st.className='status err';st.textContent='Хадгалж чадсангүй. Дахин оролдоно уу.'})}}),st])]);
      p.appendChild(ed);
    }
    var L=LOADS.filter(function(x){return x.uid===uid}).sort(function(a,b){return b.at-a.at}),wk=weekKey(Date.now());
    var wl=L.filter(function(x){return weekKey(x.at)===wk}).reduce(function(a,x){return a+x.load},0);
    p.appendChild(h('div',{cls:'big3'},[kpi(String(wl),'Энэ 7 хоногийн ачаалал','хүндийн оноо × минут',true),kpi(String(L.length),'Нийт тэмдэглэл',''),
      kpi(L.length?(L.slice(0,5).reduce(function(a,x){return a+x.rpe},0)/Math.min(5,L.length)).toFixed(1):'—','Сүүлийн 5-ын дундаж оноо',L[0]?'Сүүлд: '+ubDay(L[0].at):'')]));
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Ачаалал (8 долоо хоног)'}),weeklyBars(L,8)]));
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Бэлтгэлийн тэмдэглэл ('+L.length+')'}),L.length?cxEntryTable(L.slice(0,40),false):h('p',{cls:'muted',style:'margin:0',text:'Одоогоор тэмдэглэл алга.'}),
      L.length?h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Мөр дээр дарж бүх хариултыг нээнэ.'+(cxOwner()?' Тэндээс засна, тэмдэглэл бичнэ.':'')}):null]));
    if(typeof yvStudentBox==='function')p.appendChild(yvStudentBox(u));
    p.appendChild(cxResultsBox(uid,u));
    var wbs=WBALL.filter(function(x){return x.uid===uid});
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Өөрийн үнэлсэн сайн сайхан байдал'}),wbs.length?h('div',{cls:'scroll'},[h('table',{cls:'dose'},[h('tbody',{},wbs.map(function(x){var s=strand(x.sid);return h('tr',{},[h('td',{text:s?s.n:x.sid}),h('td',{cls:'num',text:'L'+x.level+' '+(WBLV[x.level-1]||[''])[0]}),h('td',{cls:'muted',text:ubDay(x.at)})])}))])]):h('p',{cls:'muted',style:'margin:0',text:'Одоогоор үнэлгээ хийгээгүй.'})]));
    p.appendChild(cxNotesBox(uid,null));
  });
  if(keep)$('panel').scrollTop=sc;
}
function cxResultsBox(uid,u){
  var R={};RESALL.forEach(function(r){if(r.uid===uid)R[r.per]=r});
  var has=Object.keys(R).length;
  var box=h('div',{cls:'box'},[h('h3',{text:'Үнэлгээ (фитнес тест)'})]);
  if(has){box.appendChild(h('div',{cls:'scroll'},[h('table',{cls:'dose'},[h('thead',{},[h('tr',{},[h('th',{text:'Тест'})].concat(PERIODS.map(function(p){return h('th',{text:p[1]})})))]),
    h('tbody',{},TESTS.map(function(t){return h('tr',{},[h('td',{},[h('b',{text:t.n}),h('small',{cls:'muted',text:' '+t.u})])].concat(PERIODS.map(function(p){var r=R[p[0]];var v=r&&r.v?r.v[t.id]:null;return h('td',{cls:'num'},[fmtV(v,t),lvTag(r&&r.lv?r.lv[t.id]:null)])})))}))])]))}
  else box.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Үнэлгээний дүн хараахан ороогүй.'}));
  if(cxOwner())box.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn line small',text:'✎ Үнэлгээ оруулах, засах',onclick:function(){if(u.classId)testCls=u.classId;closeSheet();show('tests')}})]));
  return box;
}

/* ---------- a log entry ---------- */
function cxFind(p){return LOADS.filter(function(x){return x._p===p})[0]}
function cxEntry(path,keep){
  var x=cxFind(path);if(!x)return;
  var sc=keep?$('panel').scrollTop:0;
  cxSheet({k:'entry',p:path},function(p){
    $('sheetEyebrow').textContent='Бэлтгэлийн тэмдэглэл · '+cxWhen(x.at);
    p.appendChild(h('h2',{id:'sheetTitle'},[h('button',{type:'button',cls:'exlink cxh',text:cxName(x.uid,x.name)+' ›',onclick:function(){cxStudent(x.uid)}})]));
    p.appendChild(h('p',{cls:'muted',style:'margin:0',text:(className(x.classId)||'Ангигүй')+(x.editedAt?' · ✎ Жак багш '+cxWhen(x.editedAt)+'-нд зассан':'')}));
    var a=x.aid&&ASSIGN[x.aid];
    var F=[['Хэр хүнд байсан',RPEL[x.rpe]||String(x.rpe)],['Хөдөлсөн хугацаа',x.min+' мин'+(x.planMin?' (төлөвлөсөн '+x.planMin+')':'')],['Ачаалал',x.load+' = '+x.rpe+' × '+x.min],
      ['Биеийн мэдрэмж',FEELL[x.feel]||'—'],['Булчингийн өвдөлт',SOREL[x.sore]||'—'],['Нойр',sleepTxt(x.sleep)],['Даалгавар',x.aid?(a&&a.title||'Даалгавартай холбоотой'):'—']];
    p.appendChild(h('dl',{cls:'cxdl'},F.map(function(f){return h('div',{},[h('dt',{text:f[0]}),h('dd',{text:f[1]})])})));
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Сурагчийн бодол'}),h('p',{style:'margin:0;white-space:pre-wrap',text:x.note||'—'}),x.strava&&typeof stvView==='function'?stvView(x.strava):null]));
    if(cxOwner())p.appendChild(cxEntryEdit(x));
    p.appendChild(cxNotesBox(x.uid,cxId(x)));
  });
  if(keep)$('panel').scrollTop=sc;
}
function cxEntryEdit(x){
  var st=h('span',{cls:'status',role:'status'}),pick=[['','—']];
  var box=h('details',{cls:'box cxedit'},[h('summary',{text:'✎ Хариултыг засах, устгах'}),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Сурагчийн буруу бичсэнийг засна (жишээ нь 450 минут гэж бичсэн). Засвар сурагчийн тэмдэглэлд ✎ тэмдэгтэй харагдана.'}),
    h('div',{cls:'fgrid'},[fSelect('cx-rpe','Хэр хүнд байсан (1–10)',RPEL.slice(1).map(function(t,i){return [String(i+1),t]}),String(x.rpe)),fText('cx-min','Хөдөлсөн хугацаа (мин)',String(x.min),{type:'number',min:1,max:300}),
      fSelect('cx-feel','Биеийн мэдрэмж',pick.concat(FEELL.slice(1).map(function(t,i){return [String(i+1),t]})),x.feel?String(x.feel):''),fSelect('cx-sore','Булчингийн өвдөлт',pick.concat(SOREL.slice(1).map(function(t,i){return [String(i+1),t]})),x.sore?String(x.sore):'')]),
    fSelect('cx-sleep','Нойр',[['','— Бичээгүй —']].concat([5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,11,11.5,12].map(function(n){return [String(n),n+' цаг']})).concat([['4','5-аас бага'],['13','12-оос их']]),typeof x.sleep==='number'?String(x.sleep):''),
    fText('cx-note','Сурагчийн бодол',x.note||'',{area:1,rows:2}),
    h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',text:'Хадгалах',onclick:save}),h('button',{type:'button',cls:'btn line small danger',text:'🗑 Устгах',onclick:askDel}),st])]);
  function save(){
    var rpe=+val('cx-rpe'),min=Math.round(+val('cx-min'));
    if(!(rpe>=1&&rpe<=10)||!(min>=1&&min<=300)){st.className='status err';st.textContent='Оноо 1–10, хугацаа 1–300 минут байна.';return}
    var d={};Object.keys(x).forEach(function(k){if(k.charAt(0)!=='_')d[k]=x[k]});
    d.rpe=rpe;d.min=min;d.load=rpe*min;var fe=+val('cx-feel'),so=+val('cx-sore');if(fe)d.feel=fe;else delete d.feel;if(so)d.sore=so;else delete d.sore;
    var sl=val('cx-sleep');if(sl)d.sleep=+sl;else delete d.sleep;d.note=$('cx-note').value.trim().slice(0,500);d.editedAt=Date.now();
    st.className='status';st.textContent='Хадгалж байна…';
    db.doc(x._p).set(d).then(function(){Object.assign(x,d);if(d.sleep==null)delete x.sleep;st.textContent='Хадгалагдлаа.';renderCoach();cxEntry(x._p,true)},function(){st.className='status err';st.textContent='Хадгалж чадсангүй. Дахин оролдоно уу.'});
  }
  function askDel(){
    st.className='status err';st.textContent='Энэ тэмдэглэлийг бүрмөсөн устгах уу? ';
    st.appendChild(h('button',{type:'button',cls:'btn small danger-fill',text:'Тийм, устгах',onclick:function(){db.doc(x._p).delete().then(function(){LOADS=LOADS.filter(function(y){return y!==x});var uid=x.uid;renderCoach();cxStudent(uid)},function(){st.textContent='Устгаж чадсангүй.'})}}));
    st.appendChild(document.createTextNode(' '));st.appendChild(h('button',{type:'button',cls:'btn line small',text:'Болих',onclick:function(){st.className='status';st.textContent=''}}));
  }
  return box;
}

/* ---------- notes (teachers read, the owner writes; students never see them) ---------- */
function cxNotesBox(uid,lid){
  var box=h('div',{cls:'box cxnotes'},[h('h3',{text:lid?'Багшийн тэмдэглэл энэ бэлтгэл дээр':'Багшийн тэмдэглэл'}),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Зөвхөн багш нар харна. Сурагч харахгүй.'})]);
  var list=h('div',{cls:'cxlist',id:'cxNotes','data-uid':uid,'data-lid':lid==null?'*':lid});box.appendChild(list);cxNotesFill(list);
  if(cxOwner()){
    var st=h('span',{cls:'status',role:'status'});
    var ta=fText('cx-newnote','Шинэ тэмдэглэл','',{area:1,rows:3,ph:lid?'жишээ: Өвдөгний өвдөлтийг дараагийн хичээл дээр асуух.':'жишээ: Гүйлтэнд ахиц сайн. Хүчний дасгалд техникээ анхаарах.'});
    box.appendChild(ta);
    box.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',text:'Тэмдэглэл нэмэх',onclick:function(){var t=$('cx-newnote').value.trim();if(!t){st.className='status err';st.textContent='Тэмдэглэлээ бичнэ үү.';return}
      st.className='status';st.textContent='Хадгалж байна…';
      db.collection('tnotes').add({uid:uid,lid:lid||'',text:t.slice(0,2000),at:Date.now()}).then(function(){$('cx-newnote').value='';st.textContent='Нэмэгдлээ.'},function(){st.className='status err';st.textContent='Хадгалж чадсангүй. Дахин оролдоно уу.'})}}),st]));
  }
  return box;
}
function cxNotesRefresh(){var L=$('cxNotes');if(L)cxNotesFill(L)}
function cxNotesFill(list){
  var uid=list.getAttribute('data-uid'),lid=list.getAttribute('data-lid');lid=lid==='*'?null:lid;
  var N=cxNotesOf(uid,lid);list.innerHTML='';
  if(!N.length){list.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Тэмдэглэл алга.'}));return}
  N.forEach(function(n){list.appendChild(cxNoteEl(n,lid==null))});
}
function cxNoteEl(n,showEntry){
  var ent=n.lid?LOADS.filter(function(x){return x.uid===n.uid&&cxId(x)===n.lid})[0]:null;
  var el=h('div',{cls:'cxn'},[h('div',{cls:'cxn-h'},[h('b',{text:cxWhen(n.at)}),n.edited?h('small',{cls:'muted',text:'засварласан'}):null,
      showEntry&&n.lid?(ent?h('button',{type:'button',cls:'exlink',style:'font-size:13px',text:ubDay(ent.at)+'-ний бэлтгэл дээр ›',onclick:function(){cxEntry(ent._p)}}):h('small',{cls:'muted',text:'устгагдсан бэлтгэл дээр'})):null]),
    h('p',{cls:'cxn-t',text:n.text})]);
  if(cxOwner()){
    var st=h('span',{cls:'status',role:'status'});
    el.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn line small',text:'✎ Засах',onclick:edit}),h('button',{type:'button',cls:'btn line small danger',text:'🗑',title:'Устгах','aria-label':'Тэмдэглэл устгах',onclick:del}),st]));
    function edit(){var ta=h('textarea',{rows:'3','aria-label':'Тэмдэглэл засах'});ta.value=n.text;el.querySelector('.cxn-t').replaceWith(ta);ta.focus();
      el.querySelector('.editrow').replaceWith(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',text:'Хадгалах',onclick:function(){var t=ta.value.trim();if(!t)return;
        db.doc('tnotes/'+n.id).set({uid:n.uid,lid:n.lid||'',text:t.slice(0,2000),at:n.at,edited:Date.now()}).then(function(){},function(){st.className='status err';st.textContent='Хадгалж чадсангүй.'})}}),
        h('button',{type:'button',cls:'btn line small',text:'Болих',onclick:cxNotesRefresh}),st]))}
    function del(){st.className='status err';st.textContent='Устгах уу? ';st.appendChild(h('button',{type:'button',cls:'btn small danger-fill',text:'Тийм',onclick:function(){db.doc('tnotes/'+n.id).delete().catch(function(){st.textContent='Устгаж чадсангүй.'})}}));
      st.appendChild(document.createTextNode(' '));st.appendChild(h('button',{type:'button',cls:'btn line small',text:'Болих',onclick:function(){st.className='status';st.textContent=''}}))}
  }
  return el;
}
