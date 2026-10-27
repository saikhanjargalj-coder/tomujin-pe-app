
/* ---------- term progress grade ("Явц") from the teacher's working Google Sheet ----------
   Jack fills the 1–5 levels in his own working sheet ("PE 1-р улирлын Явц"); attendance comes from the school sheet.
   "Sheet-ээс шинэчлэх" (owner only) reads it through the attendance script (tools/sheet/attendance.gs, action
   "yavts") and copies every student's grade to grades/t1_<ID>. Teachers see every class here and on the teacher
   dashboard. A student sees only their own, and only after the owner opens that class ("pub"); the server checks
   both (firestore.rules). The teacher's note on a student is kept apart in gradesStaff and never reaches students. */
var YVTERM='t1',YVTERMN={t1:'1-р улирал',t2:'2-р улирал',t3:'3-р улирал',t4:'4-р улирал'};
var GRADES={},GNOTES={},MYGRADES=[],YV={mode:'yavts',cls:'',busy:false,msg:null};
var YVW={att:25,a:15,r:10,k:15,u:35}; // only when the sheet sent no weights
var YVPARTS=[
  ['att','Ирц','Хичээлдээ ирсэн байдал. Чөлөөтэй, өвчтэй өдөр тооцогдохгүй.'],
  ['a','Идэвх, оролцоо','Хичээл дээр хэр идэвхтэй оролцож, бусдыгаа дэмждэг вэ.'],
  ['r','Бэлэн байдал','Спорт хувцас, дэвсгэртэйгээ, цагтаа ирдэг үү.'],
  ['k','Мэдлэг','Суралцаж, шинэ мэдлэг авч байна уу.'],
  ['u','Хэрэглээ, дадал','Сурсан зүйлээ зөв хийж, амьдралдаа дадал болгож байна уу.']];
var YVLV=['','Эхэлж байна','Хөгжиж байна','Дунд','Сайн','Маш сайн'];
var YVERR={
  'bad-action':'Sheet-ийн скрипт хуучин хувилбартай байна. «Хичээлийн ирц» → «Тохиргоо: Sheet-тэй холбох» хэсгээс «Кодыг хуулах» дараад Apps Script-д байгаа кодыг солино. Дараа нь Deploy → Manage deployments → ✎ → Version: New version → Deploy. Холбоос өөрчлөгдөхгүй.',
  'no-yavts-sheet':'Явцын хүснэгтийн холбоос буруу байна. Google Sheet-ийн холбоосыг бүтнээр нь хуулж оруулна уу.',
  'yavts-open':'Скрипт тэр хүснэгтийг нээж чадсангүй. Холбоос зөв эсэх, хүснэгт таны сургуулийн акаунтад байгаа эсэхийг шалгаарай.',
  'yavts-no-tabs':'Хүснэгтэд «6-р анги» … «12-р анги» нэртэй хуудас олдсонгүй.'};
function yvErr(e){var c=String((e&&e.message)||e||'');if(/^yavts-header:/.test(c))return '«'+c.slice(13)+'» хуудасны 1-р мөрөнд ID эсвэл ЯВЦ багана олдсонгүй.';if(YVERR[c])return YVERR[c];if(e&&e.code==='permission-denied')return 'Хадгалах эрхгүй байна. Дахин нэвтэрч үзнэ үү.';return paErr(e)}

/* ---------- data ---------- */
function yvStart(){
  if(!db||!ME)return;
  if(isStaff()){
    unsubs.push(db.collection('grades').onSnapshot(function(s){GRADES={};s.docs.forEach(function(d){GRADES[d.id]=d.data()});yvRefresh()},function(){}));
    unsubs.push(db.collection('gradesStaff').onSnapshot(function(s){GNOTES={};s.docs.forEach(function(d){GNOTES[d.id]=d.data().note||''});yvRefresh()},function(){}));
  }else if(ME.email&&ME.emailVerified){
    // the server lets a student read only their own grade, and only once the class is opened
    unsubs.push(db.collection('grades').onSnapshot(function(s){MYGRADES=s.docs.map(function(d){return d.data()});renderTests()},function(){},{where:[['email','==',String(ME.email).toLowerCase()],['pub','==',true]]}));
  }
}
function yvStop(){GRADES={};GNOTES={};MYGRADES=[];YV.msg=null;YV.busy=false}
function yvRefresh(){if($('v-tests')&&!$('v-tests').hidden)renderTests();if($('v-coach')&&!$('v-coach').hidden)renderCoach();if(typeof cxRedraw==='function')cxRedraw()}
function yvList(){return Object.keys(GRADES).filter(function(id){return GRADES[id].term===YVTERM}).map(function(id){return Object.assign({id:id},GRADES[id])})}
/* same names as the attendance pages: 12B stays, a grade-only tab (PE 6) shows as 6A like the school system */
function yvKey(g){return g.cls||((g.grade||'?')+'A')}
function yvClasses(){var by={};yvList().forEach(function(g){var k=yvKey(g);(by[k]=by[k]||{k:k,grade:+g.grade||0,list:[]}).list.push(g)});
  return Object.keys(by).map(function(k){var c=by[k];c.list.sort(function(a,b){return (a.last+a.first).localeCompare(b.last+b.first)});return c}).sort(function(a,b){return a.grade-b.grade||a.k.localeCompare(b.k)})}
function yvAvg(list){var xs=list.map(function(g){return g.yavts}).filter(function(v){return typeof v==='number'});return xs.length?Math.round(xs.reduce(function(a,b){return a+b},0)/xs.length):null}
function yvPub(list){var p=list.filter(function(g){return g.pub}).length;return p===0?'none':p===list.length?'all':'some'}
function yvName(g){return ((g.last?g.last.charAt(0)+'. ':'')+(g.first||'')).trim()||('ID '+g.sid)}
function yvW(g){var w=g&&g.w||{};return {att:num0(w.att,YVW.att),a:num0(w.a,YVW.a),r:num0(w.r,YVW.r),k:num0(w.k,YVW.k),u:num0(w.u,YVW.u)}}
function num0(v,d){return typeof v==='number'&&isFinite(v)?v:d}
function yvPts(g,k){var p=g.pts&&g.pts[k];if(typeof p==='number')return p;var w=yvW(g)[k];if(k==='att')return typeof g.pct==='number'?g.pct*w:null;var l=g.lv&&g.lv[k];return typeof l==='number'?l/5*w:null}
function yvPct(v){return typeof v==='number'?Math.round(v*100)+'%':'—'}
function yv1(v){return typeof v==='number'?String(Math.round(v*10)/10):'—'}
function yvHasAccount(g){if(!g.email)return false;return Object.keys(USERS).some(function(u){return String(USERS[u].email||'').toLowerCase()===g.email})}
function yvUid(g){if(!g.email)return '';return Object.keys(USERS).filter(function(u){return String(USERS[u].email||'').toLowerCase()===g.email})[0]||''}
function yvMine(){return MYGRADES.filter(function(g){return g.term===YVTERM})[0]||null}
function yvLastAt(){return yvList().reduce(function(a,g){return Math.max(a,+g.at||0)},0)}
function yvWhen(ms){if(!ms)return '';var d=ubD(ms);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)}

/* ---------- owner: copy from the sheet, open or close a class ---------- */
function yvBatches(ops){var p=Promise.resolve();for(var i=0;i<ops.length;i+=400)(function(part){p=p.then(function(){return db.batch(part)})})(ops.slice(i,i+400));return p}
function yvSync(){
  if(MYROLE!=='admin'||YV.busy||!db)return;
  var preview=!!(window.TPE&&TPE.preview),link=PATT.yavts||(preview?'preview':'');
  if(!PATT.url&&!preview){YV.msg=['err','Эхлээд «Хичээлийн ирц» хуудсаар Sheet-ийн скрипттэй холбоно уу.'];yvRefresh();return}
  if(!link){YV.msg=['err','Доорх «Явцын хүснэгтийн холбоос» хэсэгт хүснэгтийнхээ холбоосыг оруулаад хадгална уу.'];yvRefresh();return}
  YV.busy=true;YV.msg=['','Sheet-ээс уншиж байна…'];yvRefresh();
  var info={n:0,classes:{},noMail:0,noGrade:0,pubCls:{},removed:0};
  paCall({action:'yavts',sheet:link}).then(function(j){
    var now=Date.now(),seen={},ops=[],term=/^t[1-4]$/.test(j.term)?j.term:YVTERM,w=j.w||{};
    (j.students||[]).forEach(function(s){
      var sid=String(s.id||'').trim().slice(0,20);if(!sid)return;
      var id=term+'_'+sid;if(seen[id])return;seen[id]=1;
      var old=GRADES[id],em=String(s.email||'').toLowerCase();em=/^[^@\s]+@tomujin\.edu\.mn$/.test(em)?em:'';
      var y=typeof s.yavts==='number'&&isFinite(s.yavts)?Math.max(0,Math.min(100,s.yavts)):null;
      var d={term:term,sid:sid,email:em,first:String(s.first||'').slice(0,80),last:String(s.last||'').slice(0,80),cls:String(s.cls||'').slice(0,20),grade:String(s.tab||'').slice(0,4),
        c:s.c||{},pct:typeof s.pct==='number'?s.pct:null,lv:s.lv||{},pts:s.pts||{},w:w,yavts:y,flag:String(s.flag||'').slice(0,200),pub:!!(old&&old.pub),at:now};
      if(old&&old.pubAt)d.pubAt=old.pubAt;
      ops.push({op:'set',path:'grades/'+id,data:d});
      var note=String(s.note||'').trim().slice(0,2000);
      if(note)ops.push({op:'set',path:'gradesStaff/'+id,data:{note:note,at:now}});
      else if(GNOTES[id]!=null)ops.push({op:'delete',path:'gradesStaff/'+id});
      info.n++;info.classes[yvKey(d)]=1;if(!em)info.noMail++;if(y==null)info.noGrade++;if(d.pub)info.pubCls[yvKey(d)]=1;
    });
    if(!info.n)throw new Error('yavts-no-tabs');
    // students no longer in the sheet leave the site too
    Object.keys(GRADES).forEach(function(id){if(GRADES[id].term===term&&!seen[id]){ops.push({op:'delete',path:'grades/'+id});if(GNOTES[id]!=null)ops.push({op:'delete',path:'gradesStaff/'+id});info.removed++}});
    YV.msg=['','Сайтад хадгалж байна…'];yvRefresh();
    return yvBatches(ops);
  }).then(function(){
    var pc=Object.keys(info.pubCls),t=info.n+' сурагчийн дүн шинэчлэгдлээ ('+Object.keys(info.classes).length+' анги).';
    if(info.removed)t+=' Хүснэгтэд байхгүй болсон '+info.removed+' сурагчийн дүнг хаслаа.';
    if(info.noGrade)t+=' '+info.noGrade+' сурагчийн ЯВЦ хоосон байна.';
    if(info.noMail)t+=' '+info.noMail+' сурагчийн сургуулийн имэйл олдсонгүй: тэд сайтад өөрийн дүнгээ харахгүй.';
    t+=pc.length?' Сурагчдад нээлттэй анги ('+pc.join(', ')+'): шинэ дүн тэдэнд шууд харагдана.':' Одоогоор аль ч ангид сурагчдад нээгдээгүй.';
    YV.busy=false;YV.msg=['',t];yvRefresh();
  }).catch(function(e){YV.busy=false;YV.msg=['err',yvErr(e)];yvRefresh()});
}
function yvOpen(c,on,st){
  if(MYROLE!=='admin'||!db)return;
  var now=Date.now(),ops=c.list.map(function(g){return {op:'merge',path:'grades/'+g.id,data:on?{pub:true,pubAt:now}:{pub:false}}});
  st.className='status';st.textContent='Хадгалж байна…';
  yvBatches(ops).then(function(){st.textContent=on?'Нээгдлээ: '+c.k+'-ийн сурагчид өөрийн дүнг харна.':'Хаагдлаа: сурагчдад харагдахгүй.'},function(e){st.className='status err';st.textContent=yvErr(e)});
}
function yvSaveLink(v,st){
  v=String(v||'').trim();
  if(v&&!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]{20,}/.test(v)){st.className='status err';st.textContent='Холбоос https://docs.google.com/spreadsheets/d/… хэлбэртэй байна.';return}
  db.doc('private/peatt').update({yavts:v}).then(function(){PATT.yavts=v;st.className='status';st.textContent='Хадгалагдлаа.'},function(){st.className='status err';st.textContent='Хадгалж чадсангүй.'});
}
function yvExport(list){
  var rows=[['ID','Овог','Нэр','Анги','И','Х','Т','Ч','Ө','Ирц %','Идэвх (1–5)','Бэлэн байдал (1–5)','Мэдлэг (1–5)','Хэрэглээ, дадал (1–5)','Ирц оноо','Идэвх оноо','Бэлэн оноо','Мэдлэг оноо','Хэрэглээ оноо','ЯВЦ','Сурагчдад нээлттэй','Имэйл']];
  (list||yvList()).slice().sort(function(a,b){return (+a.grade||0)-(+b.grade||0)||yvKey(a).localeCompare(yvKey(b))||String(a.sid).localeCompare(String(b.sid))}).forEach(function(g){var c=g.c||{},lv=g.lv||{};
    rows.push([g.sid,g.last,g.first,yvKey(g),c.i||0,c.x||0,c.t||0,c.ch||0,c.o||0,typeof g.pct==='number'?Math.round(g.pct*100):'',lv.a==null?'':lv.a,lv.r==null?'':lv.r,lv.k==null?'':lv.k,lv.u==null?'':lv.u].concat(['att','a','r','k','u'].map(function(k){var p=yvPts(g,k);return p==null?'':Math.round(p*10)/10})).concat([g.yavts==null?'':g.yavts,g.pub?'Тийм':'Үгүй',g.email]))});
  downloadCSV('yavts-'+YVTERM+'.csv',rows);
}

/* ---------- one student's grade, part by part ---------- */
function yvBar(frac,tone){return h('div',{cls:'yvbar','aria-hidden':'true'},[h('i',{style:'width:'+Math.max(0,Math.min(100,Math.round((frac||0)*100)))+'%;background:'+(tone||'var(--brand)')})])}
function yvBreakdown(g){
  var w=yvW(g),c=g.c||{},lv=g.lv||{};
  var list=h('div',{cls:'yvparts'});
  YVPARTS.forEach(function(p){var k=p[0],pts=yvPts(g,k),max=w[k],val,sub;
    if(k==='att'){val=yvPct(g.pct);sub='Ирсэн '+((c.i||0)+(c.x||0))+(c.x?' (хоцорсон '+c.x+')':'')+' · тасалсан '+(c.t||0)+(c.ch?' · чөлөөтэй '+c.ch:'')+(c.o?' · өвчтэй '+c.o:'')}
    else{var l=lv[k];val=typeof l==='number'?l+'/5':'—';sub=typeof l==='number'?(YVLV[Math.round(l)]||''):''}
    list.appendChild(h('div',{cls:'yvpart'+(k==='u'?' main':'')},[
      h('div',{cls:'yvp-h'},[h('b',{text:p[1]}),h('span',{cls:'yvp-v',text:val})]),
      h('small',{cls:'muted',text:p[2]}),
      yvBar(pts!=null&&max?pts/max:0,k==='u'?'var(--gold)':k==='att'?'var(--teal)':'var(--brand)'),
      h('div',{cls:'yvp-f'},[h('small',{cls:'muted',text:sub}),h('small',{text:(pts==null?'—':yv1(pts))+' / '+max+' оноо'})])]))});
  return list;
}
function yvBig(g){return h('div',{cls:'yvbig'},[h('b',{text:g.yavts==null?'—':String(Math.round(g.yavts))}),h('span',{text:'/ 100'})])}

/* the student's own card on the assessment page */
function yvMyCard(g){
  return h('div',{cls:'box yvcard'},[
    h('div',{cls:'yvtop'},[h('div',{},[h('span',{cls:'eyebrow',text:(YVTERMN[g.term]||g.term)+' · Явцын дүн'}),h('h3',{style:'margin:4px 0 0',text:'Миний улирлын дүн'}),
      h('p',{cls:'muted',style:'margin:4px 0 0;font-size:14px',text:'Ирц, идэвх, бэлэн байдал, мэдлэг, хэрэглээ гэсэн 5 хэсгээс бүрдэнэ.'})]),yvBig(g)]),
    yvBreakdown(g),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'«Хэрэглээ, дадал» хамгийн их жинтэй: сурсан зүйлээ амьдралдаа хэрэгжүүлэх нь хамгийн чухал. Асуух зүйл байвал Жак багштай ярилцаарай.'})]);
}

/* the teacher's view of one student (side panel) */
function yvDetail(g){
  openSheet(function(p){
    $('sheetEyebrow').textContent=(YVTERMN[g.term]||g.term)+' · Явц · '+yvKey(g);
    p.appendChild(h('div',{cls:'yvtop'},[h('div',{},[h('h2',{id:'sheetTitle',style:'margin:0',text:yvName(g)}),h('p',{cls:'muted',style:'margin:4px 0 0',text:'ID '+g.sid+(g.email?' · '+g.email:' · сургуулийн имэйл олдсонгүй')})]),yvBig(g)]));
    p.appendChild(h('div',{cls:'chips'},[h('span',{cls:'tag'+(g.pub?' t':' g'),text:g.pub?'Сурагчид харж байна':'Зөвхөн багшид'}),yvHasAccount(g)?h('span',{cls:'tag',text:'Сайтад бүртгэлтэй'}):h('span',{cls:'tag o',text:'Сайтад бүртгүүлээгүй'})]));
    p.appendChild(yvBreakdown(g));
    if(g.flag)p.appendChild(h('p',{cls:'status err',style:'margin:0',text:'Анхаарах: '+g.flag}));
    var note=GNOTES[g.id];
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Багшийн тэмдэглэл'}),h('p',{style:'margin:0',text:note||'Тэмдэглэл алга.'}),h('small',{cls:'muted',text:'Ажлын хүснэгтийн «Багшийн тэмдэглэл» баганаас. Сурагчид хэзээ ч харахгүй.'})]));
    var uid=yvUid(g);
    if(uid&&typeof cxStudent==='function')p.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn line small',text:'Сурагчийн бүх бүртгэл ›',onclick:function(){cxStudent(uid)}})]));
  });
}

/* ---------- assessment page: tabs for staff, own card for students ---------- */
function yvTestsTop(W){
  if(!isStaff()){var g=yvMine();if(g)W.appendChild(yvMyCard(g));return false}
  W.appendChild(h('div',{cls:'chips'},[['yavts','Улирлын дүн (Явц)'],['tests','Биеийн чадварын тест']].map(function(m){return h('button',{type:'button',cls:'chip','aria-pressed':String(YV.mode===m[0]),text:m[1],onclick:function(){YV.mode=m[0];renderTests()}})})));
  if(YV.mode!=='yavts')return false;
  yvStaffView(W);return true;
}
function yvSearchBox(onPick){
  var out=h('div',{cls:'yvfound'}),q=h('input',{type:'search',placeholder:'ID эсвэл нэрээр хайх…','aria-label':'Сурагч хайх (ID эсвэл нэр)',cls:'yvq'});
  q.addEventListener('input',function(){out.innerHTML='';var v=q.value.trim().toLowerCase();if(!v)return;
    var hits=yvList().filter(function(g){return String(g.sid).indexOf(v)>=0||(g.first+' '+g.last).toLowerCase().indexOf(v)>=0}).slice(0,12);
    if(!hits.length){out.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Олдсонгүй.'}));return}
    out.appendChild(yvTable(hits,true))});
  return h('div',{cls:'yvsearch'},[q,out]);
}
function yvTable(list,showCls){
  var head=['ID','Сурагч'].concat(showCls?['Анги']:[]).concat(['Ирц','Идэвх','Бэлэн','Мэдлэг','Хэрэглээ','ЯВЦ','']);
  return h('div',{cls:'scroll'},[h('table',{cls:'dose yvtbl'},[h('thead',{},[h('tr',{},head.map(function(x){return h('th',{text:x})}))]),h('tbody',{},list.map(function(g){var lv=g.lv||{};
    var cells=[h('td',{cls:'num',text:g.sid}),h('td',{},[h('button',{type:'button',cls:'exlink',text:yvName(g),onclick:function(){yvDetail(g)}})])];
    if(showCls)cells.push(h('td',{text:yvKey(g)}));
    cells=cells.concat([h('td',{cls:'num',text:yvPct(g.pct)}),h('td',{cls:'num',text:lv.a==null?'—':String(lv.a)}),h('td',{cls:'num',text:lv.r==null?'—':String(lv.r)}),h('td',{cls:'num',text:lv.k==null?'—':String(lv.k)}),h('td',{cls:'num',text:lv.u==null?'—':String(lv.u)}),
      h('td',{cls:'num yvy',text:g.yavts==null?'—':String(Math.round(g.yavts))}),
      h('td',{},[g.flag?h('span',{cls:'tag o',title:g.flag,text:'!'}):null,GNOTES[g.id]?h('span',{cls:'tag',title:'Багшийн тэмдэглэлтэй',text:'💬'}):null,g.email?null:h('span',{cls:'tag g',title:'Сургуулийн имэйл олдсонгүй',text:'@?'})])]);
    return cxRow(cells,function(){yvDetail(g)},yvName(g))}))])]);
}
function yvStaffView(W){
  var owner=MYROLE==='admin',cls=yvClasses(),last=yvLastAt();
  var tools=[];
  if(owner)tools.push(h('button',{type:'button',cls:'btn gold small',disabled:YV.busy?'':null,text:YV.busy?'Шинэчилж байна…':'⟳ Sheet-ээс шинэчлэх',onclick:yvSync}));
  if(PATT.yavts)tools.push(h('a',{cls:'btn line small',href:PATT.yavts,target:'_blank',rel:'noopener',text:'Хүснэгт нээх ↗'}));
  if(cls.length)tools.push(h('button',{type:'button',cls:'btn line small',text:'⬇ Excel',onclick:function(){yvExport()}}));
  W.appendChild(h('div',{cls:'chips',style:'align-items:center'},tools.concat([last?h('span',{cls:'muted',style:'font-size:13px',text:'Сүүлд шинэчилсэн: '+yvWhen(last)}):null])));
  if(YV.msg)W.appendChild(h('p',{cls:'status'+(YV.msg[0]==='err'?' err':''),role:'status',style:'margin:0',text:YV.msg[1]}));
  if(owner){var lst=h('span',{cls:'status',role:'status'}),inp=h('input',{type:'url',id:'yv-link',value:PATT.yavts||'',placeholder:'https://docs.google.com/spreadsheets/d/…'});
    W.appendChild(h('details',{cls:'crdet',open:(PATT.yavts||(window.TPE&&TPE.preview))?null:''},[h('summary',{text:'Тохиргоо: Явцын хүснэгтийн холбоос'}),
      h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'«PE 1-р улирлын Явц» ажлын хүснэгтийнхээ холбоосыг тавина. Скрипт зөвхөн уншина, юу ч бичихгүй. Холбоос зөвхөн танд хадгалагдана.'}),
      h('label',{cls:'ff',for:'yv-link'},['Хүснэгтийн холбоос',inp]),
      h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',text:'Хадгалах',onclick:function(){yvSaveLink(inp.value,lst)}}),lst])]))}
  if(!cls.length){W.appendChild(h('p',{cls:'muted',text:owner?'Явцын дүн сайтад хараахан ороогүй байна. «Sheet-ээс шинэчлэх» дарна уу.':'Явцын дүн хараахан ороогүй байна. Жак багш оруулсны дараа энд харагдана.'}));return}
  W.appendChild(yvSearchBox());
  if(!cls.some(function(c){return c.k===YV.cls}))YV.cls=cls[0].k;
  W.appendChild(h('div',{cls:'clsgrid'},cls.map(function(c){var ps=yvPub(c.list),a=yvAvg(c.list);
    return h('button',{type:'button',cls:'clscard','aria-pressed':String(c.k===YV.cls),onclick:function(){YV.cls=c.k;renderTests()}},[h('div',{cls:'cc-h'},[h('b',{text:c.k}),h('span',{'aria-hidden':'true',text:'›'})]),
      h('span',{cls:'muted',text:c.list.length+' сурагч · дундаж '+(a==null?'—':a)}),
      h('div',{cls:'chips'},[h('span',{cls:'tag'+(ps==='all'?' t':ps==='some'?' g':''),text:ps==='all'?'Сурагчдад нээлттэй':ps==='some'?'Хэсэгчлэн нээлттэй':'Зөвхөн багшид'})])])})));
  var c=cls.filter(function(x){return x.k===YV.cls})[0],ps=yvPub(c.list),st=h('span',{cls:'status',role:'status'});
  var head=h('div',{cls:'cxhead'},[h('div',{},[h('h3',{style:'margin:0',text:c.k+' · '+(YVTERMN[YVTERM])}),h('p',{cls:'muted',style:'margin:2px 0 0;font-size:13px',text:c.list.length+' сурагч · дундаж ЯВЦ '+(yvAvg(c.list)==null?'—':yvAvg(c.list))+' · '+(ps==='all'?'сурагчид өөрийн дүнгээ харж байна':ps==='some'?'зарим сурагчид нээлттэй':'сурагчдад хараахан нээгээгүй')})]),
    owner?h('div',{cls:'chips'},[ps!=='all'?h('button',{type:'button',cls:'btn gold small',text:'👁 Сурагчдад нээх',onclick:function(){yvOpen(c,true,st)}}):null,ps!=='none'?h('button',{type:'button',cls:'btn line small',text:'Хаах',onclick:function(){yvOpen(c,false,st)}}):null,
      h('button',{type:'button',cls:'btn line small',text:'⬇ Excel',onclick:function(){yvExport(c.list)}}),st]):null]);
  W.appendChild(h('div',{cls:'box'},[head,yvTable(c.list,false),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Идэвх, Бэлэн, Мэдлэг, Хэрэглээ = багшийн өгсөн 1–5 түвшин. Нэр дээр дарж задаргааг нээнэ. ! = анхаарах, 💬 = багшийн тэмдэглэл, @? = сургуулийн имэйл олдсонгүй (сайтад өөрийн дүнгээ харахгүй).'+(owner?' Дүнг засах бол ажлын хүснэгтэд засаад «Sheet-ээс шинэчлэх» дарна.':'')})]));
  var w=yvW(c.list[0]);
  W.appendChild(h('p',{cls:'muted',style:'font-size:13px',text:'Жин: Ирц '+w.att+' · Идэвх, оролцоо '+w.a+' · Бэлэн байдал '+w.r+' · Мэдлэг '+w.k+' · Хэрэглээ, дадал '+w.u+' (нийт 100). Жинг ажлын хүснэгтийн «Тохиргоо» хуудаснаас өөрчилнө.'}));
}

/* ---------- teacher dashboard: one box with every class ---------- */
function yvCoachBox(){
  var cls=yvClasses(),owner=MYROLE==='admin';
  var box=h('div',{cls:'box'},[h('div',{cls:'cxhead'},[h('h3',{style:'margin:0',text:(YVTERMN[YVTERM])+' · Явцын дүн'}),h('button',{type:'button',cls:'btn line small',text:'Бүгдийг харах ›',onclick:function(){YV.mode='yavts';show('tests')}})])]);
  if(!cls.length){box.appendChild(h('p',{cls:'muted',style:'margin:0',text:owner?'Дүн хараахан ороогүй. «Үнэлгээ» хуудаснаас «Sheet-ээс шинэчлэх» дарна уу.':'Дүн хараахан ороогүй байна.'}));return box}
  box.appendChild(yvSearchBox());
  box.appendChild(h('div',{cls:'clsgrid'},cls.map(function(c){var ps=yvPub(c.list),a=yvAvg(c.list);
    return h('button',{type:'button',cls:'clscard',onclick:function(){YV.cls=c.k;YV.mode='yavts';show('tests')}},[h('div',{cls:'cc-h'},[h('b',{text:c.k}),h('span',{'aria-hidden':'true',text:'›'})]),
      h('span',{cls:'muted',text:c.list.length+' сурагч'}),
      h('div',{cls:'chips'},[h('span',{cls:'tag',text:'Дундаж '+(a==null?'—':a)}),h('span',{cls:'tag'+(ps==='all'?' t':ps==='some'?' g':''),text:ps==='all'?'Нээлттэй':ps==='some'?'Хэсэгчлэн':'Хаалттай'})])])})));
  return box;
}

/* ---------- a student's record on the teacher dashboard ---------- */
function yvStudentBox(u){
  var em=String(u&&u.email||'').toLowerCase(),g=yvList().filter(function(x){return x.email&&x.email===em})[0];
  var box=h('div',{cls:'box'},[h('h3',{text:(YVTERMN[YVTERM])+' · Явцын дүн'})]);
  if(!g){box.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Энэ сурагчийн Явцын дүн хараахан ороогүй (эсвэл хүснэгтэд өөр имэйлтэй байна).'}));return box}
  box.appendChild(h('div',{cls:'yvtop'},[h('p',{cls:'muted',style:'margin:0',text:'ID '+g.sid+' · '+yvKey(g)+' · '+(g.pub?'сурагч харж байна':'зөвхөн багшид')}),yvBig(g)]));
  box.appendChild(yvBreakdown(g));
  if(GNOTES[g.id])box.appendChild(h('p',{style:'margin:0',text:'💬 '+GNOTES[g.id]}));
  return box;
}
