
/* ---------- term progress grade ("Явц") from the teacher's working Google Sheet ----------
   Jack fills the 1–5 levels in his own working sheet ("PE 1-р улирлын Явц"); attendance comes from the school sheet.
   "Sheet-ээс шинэчлэх" (owner only) reads it through the attendance script (tools/sheet/attendance.gs, action
   "yavts") and copies every student's grade to grades/t1_<ID>. Teachers see every class here and on the teacher
   dashboard. A student sees only their own, and only after the owner opens that class ("pub"); the server checks
   both (firestore.rules). The teacher's note on a student is kept apart in gradesStaff and never reaches students.
   With the grade the student also reads (script v4): the teacher's written comment, the baseline test summary,
   one strength and one area to work on, all from the working sheet. */
var YVTERM='t1',YVTERMN={t1:'1-р улирал',t2:'2-р улирал',t3:'3-р улирал',t4:'4-р улирал'};
var GRADES={},GNOTES={},MYGRADES=[],YV={mode:'yavts',cls:'',busy:false,msg:null,info:'',attBusy:{},attErr:{}};
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
function yvStop(){GRADES={};GNOTES={};MYGRADES=[];YV.msg=null;YV.busy=false;YV.info='';YV.attBusy={};YV.attErr={}}
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
function yvTxt(v,n){return String(v==null?'':v).trim().slice(0,n)}
function yvCap(s){s=String(s||'');return s.charAt(0).toUpperCase()+s.slice(1)}
function yvWhen(ms){if(!ms)return '';var d=ubD(ms);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)}

/* ---------- owner: copy from the sheet, open or close a class ---------- */
function yvBatches(ops){var p=Promise.resolve();for(var i=0;i<ops.length;i+=400)(function(part){p=p.then(function(){return db.batch(part)})})(ops.slice(i,i+400));return p}
function yvSync(){
  if(MYROLE!=='admin'||YV.busy||!db)return;
  var preview=!!(window.TPE&&TPE.preview),link=PATT.yavts||(preview?'preview':'');
  if(!PATT.url&&!preview){YV.msg=['err','Эхлээд «Хичээлийн ирц» хуудсаар Sheet-ийн скрипттэй холбоно уу.'];yvRefresh();return}
  if(!link){YV.msg=['err','Доорх «Явцын хүснэгтийн холбоос» хэсэгт хүснэгтийнхээ холбоосыг оруулаад хадгална уу.'];yvRefresh();return}
  YV.busy=true;YV.msg=['','Sheet-ээс уншиж байна…'];yvRefresh();
  var info={n:0,classes:{},noMail:0,noGrade:0,pubCls:{},removed:0,noComment:0,oldScript:false};
  paCall({action:'yavts',sheet:link}).then(function(j){
    var now=Date.now(),seen={},ops=[],term=/^t[1-4]$/.test(j.term)?j.term:YVTERM,w=j.w||{};
    info.oldScript=!(j.v>=4);
    (j.students||[]).forEach(function(s){
      var sid=String(s.id||'').trim().slice(0,20);if(!sid)return;
      var id=term+'_'+sid;if(seen[id])return;seen[id]=1;
      var old=GRADES[id],em=String(s.email||'').toLowerCase();em=/^[^@\s]+@tomujin\.edu\.mn$/.test(em)?em:'';
      var y=typeof s.yavts==='number'&&isFinite(s.yavts)?Math.max(0,Math.min(100,s.yavts)):null;
      var d={term:term,sid:sid,email:em,first:String(s.first||'').slice(0,80),last:String(s.last||'').slice(0,80),cls:String(s.cls||'').slice(0,20),grade:String(s.tab||'').slice(0,4),
        c:s.c||{},pct:typeof s.pct==='number'?s.pct:null,lv:s.lv||{},pts:s.pts||{},w:w,yavts:y,flag:String(s.flag||'').slice(0,200),pub:!!(old&&old.pub),at:now,
        comment:yvTxt(s.comment,1500),base:yvTxt(s.base,300),str:yvTxt(s.str,80),weak:yvTxt(s.weak,80)};
      if(old&&old.pubAt)d.pubAt=old.pubAt;
      ops.push({op:'set',path:'grades/'+id,data:d});
      var note=String(s.note||'').trim().slice(0,2000);
      if(note)ops.push({op:'set',path:'gradesStaff/'+id,data:{note:note,at:now}});
      else if(GNOTES[id]!=null)ops.push({op:'delete',path:'gradesStaff/'+id});
      info.n++;info.classes[yvKey(d)]=1;if(!em)info.noMail++;if(y==null)info.noGrade++;if(d.pub)info.pubCls[yvKey(d)]=1;if(!d.comment)info.noComment++;
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
    if(info.oldScript)t+=' Сэтгэгдэл, гарааны үнэлгээ ирсэнгүй: Sheet-ийн скрипт хуучин хувилбартай. «Хичээлийн ирц» → «Тохиргоо: Sheet-тэй холбох» → «Кодыг хуулах», Apps Script-д солиод Deploy → Manage deployments → ✎ → New version → Deploy.';
    else if(info.noComment)t+=' '+info.noComment+' сурагчийн сэтгэгдэл хоосон.';
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
  var rows=[['ID','Овог','Нэр','Анги','И','Х','Т','Ч','Ө','Ирц %','Идэвх (1–5)','Бэлэн байдал (1–5)','Мэдлэг (1–5)','Хэрэглээ, дадал (1–5)','Ирц оноо','Идэвх оноо','Бэлэн оноо','Мэдлэг оноо','Хэрэглээ оноо','ЯВЦ','Сурагчдад нээлттэй','Имэйл','Сэтгэгдэл','Гарааны үнэлгээ','Давуу тал','Анхаарах тал']];
  (list||yvList()).slice().sort(function(a,b){return (+a.grade||0)-(+b.grade||0)||yvKey(a).localeCompare(yvKey(b))||String(a.sid).localeCompare(String(b.sid))}).forEach(function(g){var c=g.c||{},lv=g.lv||{};
    rows.push([g.sid,g.last,g.first,yvKey(g),c.i||0,c.x||0,c.t||0,c.ch||0,c.o||0,typeof g.pct==='number'?Math.round(g.pct*100):'',lv.a==null?'':lv.a,lv.r==null?'':lv.r,lv.k==null?'':lv.k,lv.u==null?'':lv.u].concat(['att','a','r','k','u'].map(function(k){var p=yvPts(g,k);return p==null?'':Math.round(p*10)/10})).concat([g.yavts==null?'':g.yavts,g.pub?'Тийм':'Үгүй',g.email,g.comment||'',g.base||'',g.str||'',g.weak||'']))});
  downloadCSV('yavts-'+YVTERM+'.csv',rows);
}

/* ---------- one student's grade, part by part ---------- */
function yvBar(frac,tone){return h('div',{cls:'yvbar','aria-hidden':'true'},[h('i',{style:'width:'+Math.max(0,Math.min(100,Math.round((frac||0)*100)))+'%;background:'+(tone||'var(--brand)')})])}
function yvTone(k){return k==='u'?'var(--gold)':k==='att'?'var(--teal)':'var(--brand)'}
function yvPartName(k){var p=YVPARTS.filter(function(x){return x[0]===k})[0];return p?p[1]:k}
/* the value and the line under it for one part */
function yvPartVal(g,k){var c=g.c||{},lv=g.lv||{};
  if(k==='att')return {val:yvPct(g.pct),sub:'Ирсэн '+((c.i||0)+(c.x||0))+(c.x?' (хоцорсон '+c.x+')':'')+' · тасалсан '+(c.t||0)+(c.ch?' · чөлөөтэй '+c.ch:'')+(c.o?' · өвчтэй '+c.o:'')};
  var l=lv[k];return {val:typeof l==='number'?l+'/5':'—',sub:typeof l==='number'?(YVLV[Math.round(l)]||''):''}}
/* pick(k): when given (teachers), every part is a button that opens its detail */
function yvBreakdown(g,pick){
  var w=yvW(g);
  var list=h('div',{cls:'yvparts'});
  YVPARTS.forEach(function(p){var k=p[0],pts=yvPts(g,k),max=w[k],v=yvPartVal(g,k);
    var kids=[h('div',{cls:'yvp-h'},[h('b',{text:p[1]}),h('span',{cls:'yvp-v',text:v.val},[pick?h('span',{cls:'yvp-go','aria-hidden':'true',text:'›'}):null])]),
      h('small',{cls:'muted',text:p[2]}),
      yvBar(pts!=null&&max?pts/max:0,yvTone(k)),
      h('div',{cls:'yvp-f'},[h('small',{cls:'muted',text:v.sub}),h('small',{text:(pts==null?'—':yv1(pts))+' / '+max+' оноо'})])];
    list.appendChild(pick?h('button',{type:'button',cls:'yvpart yvbtn'+(k==='u'?' main':''),'data-part':k,'aria-label':p[1]+': '+v.val+'. Дэлгэрэнгүйг нээх',onclick:function(){pick(k)}},kids)
      :h('div',{cls:'yvpart'+(k==='u'?' main':'')},kids))});
  return list;
}
function yvBig(g,onclick){var kids=[h('b',{text:g.yavts==null?'—':String(Math.round(g.yavts))}),h('span',{text:'/ 100'})];
  return onclick?h('button',{type:'button',cls:'yvbig','aria-label':'ЯВЦ '+(g.yavts==null?'—':Math.round(g.yavts))+' / 100. Хэрхэн бодогдсоныг нээх',onclick:onclick},kids.concat([h('i',{cls:'yvp-go','aria-hidden':'true',text:'›'})])):h('div',{cls:'yvbig'},kids)}

/* ---------- what the student reads besides the points ----------
   The teacher's comment, the baseline tests (the student's own starting point, never a class ranking), one strength and
   one area to work on. Teachers see the very same boxes on a student's grade, so they know what the student sees. */
var YVBASE=[ // the label in the sheet's summary → test, quality, how to read the number
  ['Сунах','Суугаад сунах','Уян хатан чанар','Хөлийн хурууны түвшнээс цааш сунасан зай. Хасах тоо нь хуруундаа хүрэхэд дутсан зай.'],
  ['Миль','1 миль гүйлт','Тэсвэр','Минут:секунд. Бага байх тусам хурдан.'],
  ['Суниалт','1 минутын суниалт','Гарын хүч','1 минутад хийсэн тоо.'],
  ['Харайлт','Байрнаасаа уртын харайлт','Тэсрэлтэт хүч','Сантиметрээр.']];
function yvBaseItems(s){return String(s||'').split('·').map(function(x){x=x.trim();var m=x.match(/^(\S+)\s+(.+)$/);if(!m)return null;
  var d=YVBASE.filter(function(b){return b[0]===m[1]})[0];return d?{val:m[2],d:d}:null}).filter(Boolean)}
function yvHasOwn(g){return !!(g&&(g.comment||g.base||g.str||g.weak))}
function yvOwnBoxes(g,staff){
  var out=[];
  if(g.comment)out.push(h('div',{cls:'box yvcomment'},[h('h3',{text:'Багшийн сэтгэгдэл'}),h('p',{style:'margin:0;white-space:pre-wrap',text:g.comment}),
    staff?h('small',{cls:'muted',text:'Ажлын хүснэгтийн «Сэтгэгдэл (автомат)» баганаас.'}):null]));
  if(g.base||g.str||g.weak){
    var items=yvBaseItems(g.base),kids=[h('h3',{text:staff?'Гарааны үнэлгээ':'Миний гарааны үнэлгээ'}),
      h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Улирлын эхэнд хийсэн сорил. Энэ бол эхлэлийн цэг: дараагийн сорилд өөрийн энэ дүнтэй харьцуулж ахицаа харна.'})];
    if(items.length)kids.push(h('div',{cls:'yvbase'},items.map(function(x){return h('div',{cls:'yvb'},[h('small',{cls:'muted',text:x.d[2]}),h('b',{text:x.val}),h('span',{text:x.d[1]}),h('small',{cls:'muted',text:x.d[3]})])})));
    else if(g.base)kids.push(h('p',{style:'margin:0',text:g.base}));
    if(g.str||g.weak)kids.push(h('div',{cls:'yvsw'},[g.str?h('div',{cls:'yvs'},[h('small',{text:'Давуу тал'}),h('b',{text:yvCap(g.str)})]):null,
      g.weak?h('div',{cls:'yvw'},[h('small',{text:'Цаашид анхаарах'}),h('b',{text:yvCap(g.weak)})]):null]));
    out.push(h('div',{cls:'box yvown'},kids));
  }
  return out;
}

/* the student's own card on the assessment page */
function yvMyCard(g){
  return h('div',{cls:'yvmine'},[h('div',{cls:'box yvcard'},[
    h('div',{cls:'yvtop'},[h('div',{},[h('span',{cls:'eyebrow',text:(YVTERMN[g.term]||g.term)+' · Явцын дүн'}),h('h3',{style:'margin:4px 0 0',text:'Миний улирлын дүн'}),
      h('p',{cls:'muted',style:'margin:4px 0 0;font-size:14px',text:'Ирц, идэвх, бэлэн байдал, мэдлэг, хэрэглээ гэсэн 5 хэсгээс бүрдэнэ.'})]),yvBig(g)]),
    yvBreakdown(g),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'«Хэрэглээ, дадал» хамгийн их жинтэй: сурсан зүйлээ амьдралдаа хэрэгжүүлэх нь хамгийн чухал. Асуух зүйл байвал Жак багштай ярилцаарай.'})])].concat(yvOwnBoxes(g,false)));
}

/* ---------- teachers: everything in a student's grade opens ----------
   The side panel shows one of three views and redraws itself when grades, notes or the sheet change:
   the student's grade (yvDetail), one part of it (yvPart) and how the 100 points add up (yvTotal).
   Levels and the sheet note still come from the working sheet only; the owner changes them there. */
function yvGet(x){if(x&&typeof x==='object')x=x.id;var g=GRADES[x];return g?Object.assign({id:x},g):null}
function yvClassOf(g){var k=yvKey(g);return yvClasses().filter(function(c){return c.k===k})[0]||{k:k,list:[g]}}
function yvSidOf(email){var em=String(email||'').toLowerCase();if(!em)return '';var g=yvList().filter(function(x){return x.email===em})[0];return g?String(g.sid):''}
/* teacher-only notes on the site (tnotes): kept on the student's account when they have one, otherwise on the ID,
   and both are shown, so notes written before a student signed up are not lost */
function yvNoteKey(g){var uid=yvUid(g);return (uid?uid+'|':'')+'sid:'+g.sid}
function yvSiteNotes(g){return typeof cxNotesOf==='function'?cxNotesOf(yvNoteKey(g),null):[]}
/* redraw keeps the scroll position and a note being typed */
function yvSheet(open,keep,build){var sc=keep?$('panel').scrollTop:0,ta=keep&&$('cx-newnote'),draft=ta?ta.value:'',foc=ta&&document.activeElement===ta;
  cxSheet(open,build);if(keep){$('panel').scrollTop=sc;var nt=$('cx-newnote');if(nt&&draft){nt.value=draft;if(foc)nt.focus()}}}
function yvRedraw(c){if(c.v==='detail')yvDetail(c.id,c.back,true);else if(c.v==='part')yvPart(c.id,c.part,true,c.f);else if(c.v==='total')yvTotal(c.id,true)}
function yvGone(p){p.appendChild(h('h2',{id:'sheetTitle',text:'Дүн олдсонгүй'}));p.appendChild(h('p',{cls:'muted',text:'Энэ сурагчийн дүн ажлын хүснэгтээс хасагдсан байна.'}))}
function yvBackBtn(label,fn){return h('div',{cls:'yvback'},[h('button',{type:'button',cls:'btn line small',text:'‹ '+label,onclick:fn})])}
function yvToStudent(g){return yvBackBtn(yvName(g)+' · Явцын дүн',function(){yvDetail(g.id)})}
function yvSheetLink(){return PATT.yavts?h('a',{cls:'btn line small',href:PATT.yavts,target:'_blank',rel:'noopener',text:'Хүснэгт нээх ↗'}):null}
function yvOwnerFix(text){
  if(MYROLE!=='admin')return null;
  return h('div',{cls:'box yvfix'},[h('h3',{text:'Засах'}),h('p',{cls:'muted',style:'margin:0;font-size:13px',text:text}),
    h('div',{cls:'chips',style:'align-items:center'},[yvSheetLink(),h('button',{type:'button',cls:'btn gold small',disabled:YV.busy?'':null,text:YV.busy?'Шинэчилж байна…':'⟳ Sheet-ээс шинэчлэх',onclick:yvSync})]),
    YV.msg?h('p',{cls:'status'+(YV.msg[0]==='err'?' err':''),role:'status',style:'margin:0',text:YV.msg[1]}):null]);
}
/* go to the class on the assessment page */
function yvGoClass(g){var k=yvKey(g);closeSheet();YV.mode='yavts';YV.cls=k;if($('v-tests').hidden)show('tests');else renderTests();
  setTimeout(function(){var b=document.querySelector('#testsOut .clsgrid ~ .box');if(b&&b.scrollIntoView)b.scrollIntoView({block:'start',behavior:'smooth'})},60)}

/* the teacher's view of one student (side panel). back: {label, fn} when opened from somewhere else */
function yvDetail(x,back,keep){
  var g=yvGet(x);
  if(!g){if(keep)yvSheet({k:'yv',v:'detail',id:x&&x.id||x},true,yvGone);return}
  if(!keep)YV.info='';
  yvSheet({k:'yv',v:'detail',id:g.id,back:back},keep,function(p){
    var owner=MYROLE==='admin',uid=yvUid(g),c=yvClassOf(g),ps=yvPub(c.list);
    $('sheetEyebrow').textContent=(YVTERMN[g.term]||g.term)+' · Явц · '+yvKey(g);
    if(back)p.appendChild(yvBackBtn(back.label,back.fn));
    p.appendChild(h('div',{cls:'yvtop'},[h('div',{},[h('h2',{id:'sheetTitle',style:'margin:0',text:yvName(g)}),
      h('p',{cls:'muted',style:'margin:4px 0 0'},['ID '+g.sid+' · ',g.email?h('a',{href:'mailto:'+g.email,text:g.email}):'сургуулийн имэйл олдсонгүй'])]),
      yvBig(g,function(){yvTotal(g.id)})]));
    /* the two tags open a short explanation with what can be done */
    var info=h('div',{cls:'yvinfo',id:'yvInfo',hidden:YV.info?null:''});
    function tag(key,cls,text){return h('button',{type:'button',cls:'tag'+cls,'aria-expanded':String(YV.info===key),'aria-controls':'yvInfo',text:text+' ▾',onclick:function(){YV.info=YV.info===key?'':key;yvDetail(g.id,back,true)}})}
    p.appendChild(h('div',{cls:'chips'},[tag('pub',g.pub?' t':' g',g.pub?'Сурагчид харж байна':'Зөвхөн багшид'),uid?tag('acc','','Сайтад бүртгэлтэй'):tag('acc',' o','Сайтад бүртгүүлээгүй')]));
    if(YV.info==='pub'){var st=h('span',{cls:'status',role:'status'});
      info.appendChild(h('p',{style:'margin:0',text:g.pub?(yvName(g)+' энэ дүнг сайтын «Үнэлгээ» хуудаснаас өөрөө харж байна (зөвхөн өөрийнхийгөө). Багшийн тэмдэглэл харагдахгүй.'):('Сурагчдад хараахан нээгээгүй: зөвхөн багш нар харна. Ангиараа нээхэд '+c.k+'-ийн сурагч бүр зөвхөн өөрийн дүнгээ харна.')}));
      info.appendChild(h('div',{cls:'chips',style:'align-items:center'},[owner&&ps!=='all'?h('button',{type:'button',cls:'btn gold small',text:'👁 '+c.k+' ангид нээх',onclick:function(){yvOpen(c,true,st)}}):null,
        owner&&ps!=='none'?h('button',{type:'button',cls:'btn line small',text:c.k+' ангид хаах',onclick:function(){yvOpen(c,false,st)}}):null,
        h('button',{type:'button',cls:'btn line small',text:c.k+' ангийн жагсаалт ›',onclick:function(){yvGoClass(g)}}),st]))}
    if(YV.info==='acc'){
      if(uid)info.appendChild(h('p',{style:'margin:0',text:'Сайтад '+g.email+' имэйлээр бүртгэлтэй.'+(g.pub?' Өөрийн дүнгээ харж байна.':' Анги нь нээгдсэний дараа өөрийн дүнгээ харна.')}));
      else info.appendChild(h('p',{style:'margin:0',text:g.email?('Сургуулийн имэйл ('+g.email+') сайтад хараахан бүртгүүлээгүй. Бүртгүүлсний дараа анги нь нээлттэй бол өөрийн дүнгээ харна.'):'Ирцийн Sheet-ийн «И-Мэйл» баганад энэ сурагчийн сургуулийн имэйл алга. Тиймээс сайтад өөрийн дүнгээ харахгүй. Имэйлийг нь нэмээд «Sheet-ээс шинэчлэх» дарна.'}));
      if(uid&&typeof cxStudent==='function')info.appendChild(h('div',{cls:'chips'},[h('button',{type:'button',cls:'btn line small',text:'Сурагчийн бүх бүртгэл ›',onclick:function(){cxStudent(uid)}})]))}
    p.appendChild(info);
    p.appendChild(h('p',{cls:'muted yvhint',text:'Хэсэг бүр, ЯВЦ-ын оноо, шошго дээр дарж дэлгэрэнгүйг нээнэ.'}));
    p.appendChild(yvBreakdown(g,function(k){yvPart(g.id,k)}));
    if(g.flag)p.appendChild(h('p',{cls:'status err',style:'margin:0',text:'Анхаарах: '+g.flag}));
    p.appendChild(h('h3',{cls:'yvsee',text:'Сурагчид харагдах хэсэг'}));
    p.appendChild(h('p',{cls:'muted',style:'margin:0;font-size:13px',text:g.pub?(yvName(g)+' дүнтэйгээ хамт доорхыг яг ингэж харж байна.'):('Анги нээгдсэний дараа '+yvName(g)+' дүнтэйгээ хамт доорхыг яг ингэж харна.')}));
    var own=yvOwnBoxes(g,true);
    if(own.length)own.forEach(function(b){p.appendChild(b)});
    else p.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Сэтгэгдэл, гарааны үнэлгээ хараахан ороогүй.'+(owner?' Ажлын хүснэгтийн «Сэтгэгдэл (автомат)», «Гарааны үнэлгээ» баганыг бөглөөд «Sheet-ээс шинэчлэх» дарна.':'')}));
    var note=GNOTES[g.id];
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Багшийн тэмдэглэл (ажлын хүснэгтээс)'}),h('p',{style:'margin:0;white-space:pre-wrap',text:note||'Тэмдэглэл алга.'}),
      h('small',{cls:'muted',text:'Ажлын хүснэгтийн «Багшийн тэмдэглэл» баганаас. Сурагчид хэзээ ч харахгүй.'+(owner?' Засах бол хүснэгтэд засаад «Sheet-ээс шинэчлэх» дарна.':'')}),
      owner&&PATT.yavts?h('div',{cls:'chips'},[h('a',{cls:'btn line small',href:PATT.yavts,target:'_blank',rel:'noopener',text:'✎ Хүснэгтэд засах ↗'})]):null]));
    if(typeof cxNotesBox==='function')p.appendChild(cxNotesBox(yvNoteKey(g),null,'Сайт дээрх тэмдэглэл'));
    if(uid&&typeof cxStudent==='function')p.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn line small',text:'Сурагчийн бүх бүртгэл ›',onclick:function(){cxStudent(uid)}})]));
  });
}

/* one part of the grade: what it measures, the 1–5 scale with the class spread, the class list, how to change it */
function yvPart(id,k,keep,f){
  var g=yvGet(id);if(!g){if(keep)yvSheet({k:'yv',v:'part',id:id,part:k},true,yvGone);return}
  if(!keep)f=0;
  yvSheet({k:'yv',v:'part',id:id,part:k,f:f||0},keep,function(p){
    var P=YVPARTS.filter(function(x){return x[0]===k})[0],w=yvW(g),max=w[k],pts=yvPts(g,k),v=yvPartVal(g,k),c=yvClassOf(g);
    $('sheetEyebrow').textContent=(YVTERMN[g.term]||g.term)+' · Явц · '+yvKey(g);
    p.appendChild(yvToStudent(g));
    p.appendChild(h('h2',{id:'sheetTitle',style:'margin:0',text:P[1]}));
    p.appendChild(h('p',{cls:'muted',style:'margin:0',text:yvName(g)+' · '+yvKey(g)+' · ID '+g.sid}));
    /* the other parts, one tap away */
    p.appendChild(h('div',{cls:'chips',role:'group','aria-label':'Хэсэг солих'},YVPARTS.map(function(q){return h('button',{type:'button',cls:'chip','aria-pressed':String(q[0]===k),text:q[1],onclick:function(){yvPart(id,q[0])}})})));
    p.appendChild(h('div',{cls:'yvpart'+(k==='u'?' main':'')},[h('div',{cls:'yvp-h'},[h('b',{text:v.sub||P[1]}),h('span',{cls:'yvp-v',text:v.val})]),
      h('small',{cls:'muted',text:P[2]}),yvBar(pts!=null&&max?pts/max:0,yvTone(k)),
      h('div',{cls:'yvp-f'},[h('small',{cls:'muted',text:'Жин '+max+' оноо'}),h('small',{text:(pts==null?'—':yv1(pts))+' / '+max+' оноо'})])]));
    if(k==='att')yvPartAtt(p,g,c,w,pts);else yvPartLevel(p,g,c,k,w,pts,f||0);
    var fx=yvOwnerFix(k==='att'?'Ирцийн тоо ажлын хүснэгтээс ирдэг (тэр нь сургуулийн ирцийн Sheet-ээс тоологдоно). Ирцийг «Хичээлийн ирц» хуудсаас засаад, ажлын хүснэгт шинэчлэгдсэний дараа «Sheet-ээс шинэчлэх» дарна.':'Түвшин (1–5) ажлын хүснэгтээс ирдэг. Хүснэгтэд засаад «Sheet-ээс шинэчлэх» дарахад энд шууд солигдоно.');
    if(fx)p.appendChild(fx);
  });
}
function yvPartLevel(p,g,c,k,w,pts,f){
  var max=w[k],l=(g.lv||{})[k],mine=typeof l==='number'?Math.round(l):0,cnt=[0,0,0,0,0,0];
  c.list.forEach(function(x){var v=(x.lv||{})[k];if(typeof v==='number'){var r=Math.max(1,Math.min(5,Math.round(v)));cnt[r]++}});
  if(typeof l==='number'){var calc=l/5*max;p.appendChild(h('p',{style:'margin:0',text:'Оноо: '+l+' ÷ 5 × '+max+' = '+yv1(typeof pts==='number'?pts:calc)+' оноо'}))}
  var most=Math.max.apply(null,cnt.slice(1))||1;
  p.appendChild(h('div',{cls:'box'},[h('h3',{text:'1–5 түвшин · '+c.k+' ангид'}),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Түвшин дээр дарж тэр түвшний сурагчдыг доор харна. Хүрээтэй мөр нь '+yvName(g)+'-ийн түвшин. Сурагчийн нэр дээр дарвал түүний энэ хэсгийг нээнэ.'}),
    h('div',{cls:'yvscale'},[5,4,3,2,1].map(function(n){return h('button',{type:'button',cls:'yvlv'+(n===mine?' on':''),'aria-pressed':String(f===n),'data-lv':String(n),
      'aria-label':n+'-р түвшин, '+YVLV[n]+', '+cnt[n]+' сурагч',onclick:function(){yvPart(g.id,k,true,f===n?0:n)}},[
      h('b',{cls:'n',text:String(n)}),h('span',{text:YVLV[n]}),h('small',{cls:'muted',text:yv1(n/5*max)+' оноо'}),yvBar(cnt[n]/most,yvTone(k)),h('small',{cls:'num',text:String(cnt[n])})])}))]));
  var L=c.list.filter(function(x){if(!f)return true;var v=(x.lv||{})[k];return typeof v==='number'&&Math.round(v)===f})
    .sort(function(a,b){var va=(a.lv||{})[k],vb=(b.lv||{})[k];return (typeof vb==='number'?vb:-1)-(typeof va==='number'?va:-1)||yvName(a).localeCompare(yvName(b))});
  p.appendChild(h('div',{cls:'box'},[h('div',{cls:'cxhead'},[h('h3',{style:'margin:0',text:c.k+' · '+yvPartName(k)+(f?' · '+f+'-р түвшин':'')}),
      f?h('button',{type:'button',cls:'btn line small',text:'Бүгдийг харуулах',onclick:function(){yvPart(g.id,k,true,0)}}):null]),
    L.length?yvMates(L,g,function(x){var v=(x.lv||{})[k];return [typeof v==='number'?v+'/5':'—',typeof v==='number'?(YVLV[Math.round(v)]||''):'',yv1(yvPts(x,k))]},['Түвшин','','Оноо'],k)
      :h('p',{cls:'muted',style:'margin:0',text:'Энэ түвшинд сурагч алга.'})]));
}
/* classmates for one part; a row opens that student's grade */
function yvMates(L,g,cells,head,k){
  return h('div',{cls:'scroll'},[h('table',{cls:'dose yvmates'},[h('thead',{},[h('tr',{},['Сурагч'].concat(head).map(function(x){return h('th',{text:x})}))]),
    h('tbody',{},L.map(function(x){var r=cxRow([h('td',{},[h('button',{type:'button',cls:'exlink',text:yvName(x),onclick:function(){yvPart(x.id,k)}})])].concat(cells(x).map(function(t,i){return h('td',{cls:i===1?'muted':'num',text:t})})),function(){yvPart(x.id,k)},yvName(x));
      if(x.id===g.id)r.className+=' me';return r}))])]);
}
/* attendance: the counts behind the %, every lesson from the school sheet (owner), the class */
function yvPartAtt(p,g,c,w,pts){
  var n=g.c||{},att=(n.i||0)+(n.x||0),den=att+(n.t||0);
  p.appendChild(h('div',{cls:'chips'},PACODE.map(function(k,i){var v=n[['i','x','t','ch','o'][i]]||0;return h('span',{cls:'tag k-'+k[2],text:k[0]+' '+k[1]+' '+v})})));
  if(den&&typeof g.pct==='number'&&Math.abs(att/den-g.pct)<0.006)p.appendChild(h('p',{style:'margin:0',text:'Ирц % = (И + Х) ÷ (И + Х + Т) = '+att+' ÷ '+den+' = '+yvPct(g.pct)+'. Чөлөөтэй, өвчтэй өдөр тооцогдохгүй. Оноо: '+yvPct(g.pct)+' × '+w.att+' = '+yv1(pts)+' оноо.'}));
  else p.appendChild(h('p',{style:'margin:0',text:'Ирц '+yvPct(g.pct)+' → '+yv1(pts)+' / '+w.att+' оноо. Чөлөөтэй, өвчтэй өдөр тооцогдохгүй.'}));
  var box=h('div',{cls:'box'},[h('h3',{text:'Хичээл бүрээр'})]);
  if(MYROLE==='admin'&&(PATT.url||(window.TPE&&TPE.sheet))){
    var tab='PE '+String(g.grade||'').replace(/\D/g,''),j=PATT.data[tab],x=j&&(j.students||[]).filter(function(s){return String(s.id)===String(g.sid)})[0];
    if(!j&&!YV.attErr[tab])yvLoadAtt(tab);
    if(YV.attErr[tab])box.appendChild(h('p',{cls:'status err',role:'status',style:'margin:0',text:YV.attErr[tab]}));
    else if(!j)box.appendChild(h('p',{cls:'muted',role:'status',style:'margin:0',text:'Сургуулийн ирцийн Sheet-ээс уншиж байна…'}));
    else if(!x)box.appendChild(h('p',{cls:'muted',style:'margin:0',text:tab+' хуудсанд ID '+g.sid+' олдсонгүй.'}));
    else{var key=tab+'|'+(x.cls||x.grade||'?'),ds=Object.keys(x.m||{}).sort().reverse();
      box.appendChild(h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Сургуулийн ирцийн Sheet-ээс одоогийн байдлаар ('+ds.length+' хичээл). Өдөр дээр дарж тэр өдрийн ангийн ирцийг нээнэ.'+(g.at?' Явцын оноо '+yvWhen(g.at)+'-ны тоогоор бодогдсон.':'')}));
      box.appendChild(ds.length?h('div',{cls:'yvdays'},ds.map(function(d){var code=x.m[d],k=PACODE.filter(function(q){return q[0]===code})[0];
        return h('button',{type:'button',cls:'tag yvday k-'+(k?k[2]:'x'),'data-date':d,title:k?k[1]:code,'aria-label':paMD(d)+': '+(k?k[1]:code),text:paMD(d)+' · '+code,onclick:function(){closeSheet();paOpen(key,d);show('patt')}})})):h('p',{cls:'muted',style:'margin:0',text:'Тэмдэглэсэн хичээл алга.'}));
      box.appendChild(h('div',{cls:'chips'},[h('button',{type:'button',cls:'btn line small',text:'Ангийн ирц нээх ›',onclick:function(){closeSheet();paOpen(key);show('patt')}}),
        h('button',{type:'button',cls:'btn line small',text:'↻ Дахин унших',onclick:function(){delete PATT.data[tab];delete YV.attErr[tab];yvLoadAtt(tab);yvPart(g.id,'att',true)}})]))}
  }else box.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Өдөр бүрийн ирцийг Жак багш «Хичээлийн ирц» хуудсаас харна.'}));
  p.appendChild(box);
  var L=c.list.slice().sort(function(a,b){return (typeof b.pct==='number'?b.pct:-1)-(typeof a.pct==='number'?a.pct:-1)||yvName(a).localeCompare(yvName(b))});
  var ps=c.list.map(function(x){return x.pct}).filter(function(v){return typeof v==='number'});
  p.appendChild(h('div',{cls:'box'},[h('h3',{text:c.k+' · Ирц'+(ps.length?' · дундаж '+yvPct(ps.reduce(function(a,b){return a+b},0)/ps.length):'')}),
    yvMates(L,g,function(x){var m=x.c||{};return [yvPct(x.pct),m.t?'тасалсан '+m.t:'',yv1(yvPts(x,'att'))]},['Ирц','','Оноо'],'att')]));
}
function yvLoadAtt(tab){
  if(YV.attBusy[tab])return;YV.attBusy[tab]=1;
  paCall({action:'read',tab:tab}).then(function(j){PATT.data[tab]=j;delete YV.attBusy[tab];if(CXOPEN&&CXOPEN.k==='yv')cxRedraw()},
    function(e){delete YV.attBusy[tab];YV.attErr[tab]=paErr(e);if(CXOPEN&&CXOPEN.k==='yv')cxRedraw()});
}

/* how the 100 points add up */
function yvTotal(id,keep){
  var g=yvGet(id);if(!g){if(keep)yvSheet({k:'yv',v:'total',id:id},true,yvGone);return}
  yvSheet({k:'yv',v:'total',id:id},keep,function(p){
    var w=yvW(g),c=yvClassOf(g),sum=0,any=false,a=yvAvg(c.list);
    $('sheetEyebrow').textContent=(YVTERMN[g.term]||g.term)+' · Явц · '+yvKey(g);
    p.appendChild(yvToStudent(g));
    p.appendChild(h('div',{cls:'yvtop'},[h('div',{},[h('h2',{id:'sheetTitle',style:'margin:0',text:'ЯВЦ хэрхэн бодогдсон'}),h('p',{cls:'muted',style:'margin:4px 0 0',text:yvName(g)+' · '+yvKey(g)+' · ID '+g.sid})]),yvBig(g)]));
    var rows=YVPARTS.map(function(q){var k=q[0],pts=yvPts(g,k);if(typeof pts==='number'){sum+=pts;any=true}
      return cxRow([h('td',{},[h('button',{type:'button',cls:'exlink',text:q[1],onclick:function(){yvPart(g.id,k)}})]),h('td',{cls:'num',text:yvPartVal(g,k).val}),h('td',{cls:'num',text:String(w[k])}),h('td',{cls:'num',text:yv1(pts)})],function(){yvPart(g.id,k)},q[1])});
    p.appendChild(h('div',{cls:'box'},[h('div',{cls:'scroll'},[h('table',{cls:'dose yvtot'},[h('thead',{},[h('tr',{},['Хэсэг','Үнэлгээ','Жин','Оноо'].map(function(x){return h('th',{text:x})}))]),h('tbody',{},rows),
      h('tfoot',{},[h('tr',{},[h('th',{text:'Нийт'}),h('td',{}),h('td',{cls:'num',text:String(w.att+w.a+w.r+w.k+w.u)}),h('td',{cls:'num yvy',text:any?yv1(sum):'—'})])])])]),
      h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Мөр дээр дарж тухайн хэсгийг нээнэ. Ирцийн оноо = ирц % × жин, бусад = түвшин ÷ 5 × жин. Жинг ажлын хүснэгтийн «Тохиргоо» хуудаснаас өөрчилнө.'}),
      any&&g.yavts!=null&&Math.abs(sum-g.yavts)>=0.6?h('p',{cls:'status err',style:'margin:0',text:'Анхаар: ажлын хүснэгтийн ЯВЦ ('+yv1(g.yavts)+') онооны нийлбэрээс ('+yv1(sum)+') өөр байна. Хүснэгтийн томьёог шалгаарай.'}):null]));
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:c.k+' анги'}),h('p',{style:'margin:0',text:c.list.length+' сурагч · дундаж ЯВЦ '+(a==null?'—':a)}),
      h('div',{cls:'chips'},[h('button',{type:'button',cls:'btn line small',text:c.k+' ангийн жагсаалт ›',onclick:function(){yvGoClass(g)}})])]));
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
      h('td',{},[g.flag?h('span',{cls:'tag o',title:g.flag,text:'!'}):null,(GNOTES[g.id]||yvSiteNotes(g).length)?h('span',{cls:'tag',title:'Багшийн тэмдэглэлтэй',text:'💬'}):null,g.email?null:h('span',{cls:'tag g',title:'Сургуулийн имэйл олдсонгүй',text:'@?'})])]);
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
  var uid=u&&u.uid||yvUid(g),back={label:cxName(uid,yvName(g)),fn:function(){cxStudent(uid)}};
  box.appendChild(h('div',{cls:'yvtop'},[h('p',{cls:'muted',style:'margin:0',text:'ID '+g.sid+' · '+yvKey(g)+' · '+(g.pub?'сурагч харж байна':'зөвхөн багшид')}),yvBig(g,function(){yvTotal(g.id)})]));
  box.appendChild(yvBreakdown(g,function(k){yvPart(g.id,k)}));
  if(g.comment)box.appendChild(h('p',{style:'margin:0',text:'Сурагчид харагдах сэтгэгдэл: '+g.comment}));
  if(GNOTES[g.id])box.appendChild(h('p',{style:'margin:0',text:'💬 '+GNOTES[g.id]}));
  box.appendChild(h('div',{cls:'chips'},[h('button',{type:'button',cls:'btn line small',text:'Явцын дэлгэрэнгүй ›',onclick:function(){yvDetail(g.id,back)}})]));
  return box;
}
