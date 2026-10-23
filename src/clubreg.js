/* ---------- Дугуйлангийн бүртгэл: 2-р улирлаас (11/9–4/30) ----------
   1-р шат: суудал авах (бүртгэлийн цагт, эрт сонгосон нь авна, дүүрвэл хүлээлгийн жагсаалт).
   2-р шат: баталгаажуулалт (багш ярилцаж, төлбөр/барьцаагаар баталгаажуулна).
   Суудлын тоо, хугацаа, хүүхэд бүр зөвхөн өөрийн суудлыг серверийн дүрэм (firestore.rules) шалгана. */
var CRCAL={start:'2026-11-09',end:'2027-04-30',
 breaks:[['2026-12-28','2027-01-15','Өвлийн амралт'],['2027-02-08','2027-02-12','Цагаан сарын амралт'],['2027-03-22','2027-03-26','Хаврын амралт']],
 off:{'2026-11-26':'Тусгаар тогтнолын баяр','2027-03-08':'Эмэгтэйчүүдийн баяр'},
 def:{open:Date.parse('2026-10-30T08:30:00+08:00'),p1:Date.parse('2026-10-30T11:00:00+08:00'),close:Date.parse('2026-10-30T13:59:00+08:00'),confirm:'11/2–6',confirmBy:'11/5',final:'11/6'},
 terms:[['2-р улирал','2026-11-09','2026-12-25','11/2–6'],['3-р улирал','2027-01-18','2027-03-19','1/11–15'],['4-р улирал','2027-03-29','2027-04-30','3/15–19']]
};
var CRDAY=['Ня','Да','Мя','Лх','Пү','Ба','Бя'];
var CRCLUBS=[
 {k:'bb',n:'Сагсан бөмбөг',fig:'bb-set-shot',cc:'#f97316',place:'Family Sport Center',time:'06:30–07:50',pay:'fee',
  d:'Дриблинг, дамжуулалт, шидэлт, хамгаалалт, багийн тоглолт. Хурд, авхаалж, хамтран ажиллах чадвар.',
  offers:[{id:'bb',sh:'',days:[1,3],cap:30}]},
 {k:'hb',n:'Гар бөмбөг',badge:'HB',cc:'#0e7490',place:'Naran Sport Center',time:'06:30–07:50',pay:'fee',
  d:'Дамжуулалт, шидэлт, хаалгачийн үндэс, довтолгоо, хамгаалалт, багийн тоглолт.',
  offers:[{id:'hb',sh:'',days:[2,4],cap:30}]},
 {k:'jj',n:'Жиу-жицу',badge:'JJ',cc:'#c2410c',place:'Сургууль · B1 заал (дэвсгэр)',time:'07:00–08:20',pay:'dep',fri:true,
  d:'Аюулгүй унах, газрын байрлал, барилдаан, өөрийгөө хамгаалах. Ижил нас, биеийн жинтэй хүүхдүүдийг хослуулна.',
  offers:[{id:'jj-a',sh:'А',days:[1,3],cap:16},{id:'jj-b',sh:'Б',days:[2,4],cap:16}]},
 {k:'tn',n:'Мини теннис',fig:'tn-forehand',cc:'#15803d',place:'Сургууль · U1 заал',time:'07:00–08:20',pay:'dep',
  d:'Цохиур барих, урд болон ар гарын цохилт, хөлийн хөдөлгөөн, оноотой тоглолт.',
  offers:[{id:'tn-a',sh:'А',days:[1,3],cap:16},{id:'tn-b',sh:'Б',days:[2,4],cap:16}]},
 {k:'fn',n:'Functional strength training',fig:'burpee',cc:'#5c1090',place:'Сургууль · U1 заал',time:'07:00–08:20',pay:'dep',fri:true,
  d:'7 үндсэн хөдөлгөөн, хүч, тэнцвэр, хөдөлгөөний чөлөөт байдал, бие халаалт, сэргэлт.',
  offers:[{id:'fn-a',sh:'А',days:[1,3],cap:20},{id:'fn-b',sh:'Б',days:[2,4],cap:20}]}
];
var CRST={seat:['Суудал авсан','g'],talk:['Ярилцлага','o'],pay:['Төлбөр хүлээгдэж буй','o'],ok:['Баталгаажсан','ok'],cancel:['Цуцлагдсан','x']};
var CRPAY={fee:'Улирал бүр 300,000₮ (2, 3, 4-р улирал)',dep:'Үнэгүй · 300,000₮ барьцаа (нэг удаа)'};
var OFFERS={},REG=null,MYSEAT={},MYWAIT={},WAITQ={},MYABS={},CRLOG={},CRSEATS={},CRREGS={},CRABS=[],crSubs=[],crBusy=false;

/* -- time and calendar (school runs on Ulaanbaatar time, UTC+8) -- */
function ubD(ms){return new Date((ms==null?Date.now():ms)+8*3600e3)}
function ubToday(){var d=ubD();return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate())}
function crTime(ms){var d=ubD(ms);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' ('+CRDAY[d.getUTCDay()]+') '+pad2(d.getUTCHours())+':'+pad2(d.getUTCMinutes())}
function crClock(ms){var d=ubD(ms);return pad2(d.getUTCHours())+':'+pad2(d.getUTCMinutes())}
function ymdD(s){return new Date(s+'T12:00:00Z')}
function crMD(s){var d=ymdD(s);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' ('+CRDAY[d.getUTCDay()]+')'}
function crBreak(s){for(var i=0;i<CRCAL.breaks.length;i++){var b=CRCAL.breaks[i];if(s>=b[0]&&s<=b[1])return b[2]}return CRCAL.off[s]||''}
function crDates(days){var out=[],d=ymdD(CRCAL.start),e=ymdD(CRCAL.end);while(d<=e){var s=d.toISOString().slice(0,10);if(days.indexOf(d.getUTCDay())>=0&&!crBreak(s))out.push(s);d=new Date(d.getTime()+864e5)}return out}
function crDaysTxt(days){return days.map(function(x){return CRDAY[x]}).join(', ')}
function tsMs(x){return x&&typeof x.toMillis==='function'?x.toMillis():typeof x==='number'?x:0}
function crSet(){var s=(SITE&&SITE.clubreg)||{};return Object.assign({},CRCAL.def,s)}
function crCfg(k){var s=(SITE&&SITE.clubreg&&SITE.clubreg.clubs)||{};return s[k]||{}}
function crPhase(){var s=crSet(),t=Date.now();return t<s.open?'before':t<s.p1?'p1':t<s.close?'p2':'closed'}
function crFind(oid){for(var i=0;i<CRCLUBS.length;i++)for(var j=0;j<CRCLUBS[i].offers.length;j++)if(CRCLUBS[i].offers[j].id===oid)return {c:CRCLUBS[i],o:CRCLUBS[i].offers[j]};return null}
function crAllOffers(){var a=[];CRCLUBS.forEach(function(c){c.offers.forEach(function(o){a.push(o.id)})});return a}
function crName(oid){var f=crFind(oid);return f?f.c.n+(f.o.sh?' · '+f.o.sh+' ээлж':''):oid}
function crCap(oid){var f=crFind(oid),o=OFFERS[oid];return o&&typeof o.cap==='number'?o.cap:(f?f.o.cap:0)}
function crN(oid){var o=OFFERS[oid];return o&&typeof o.n==='number'?o.n:0}
function crLeft(oid){return Math.max(0,crCap(oid)-crN(oid))}
function crPicks(){return (REG&&REG.picks)||[]}
function crRank(oid){var q=WAITQ[oid]||[];var i=ME?q.indexOf(ME.uid):-1;return i<0?0:i+1}
function crNext(days){var t=ubToday();var all=crDates(days);for(var i=0;i<all.length;i++)if(all[i]>=t)return all[i];return ''}
function crOverlap(p){if(p.length<2)return false;var a=crFind(p[0]),b=crFind(p[1]);if(!a||!b)return false;return a.o.days.some(function(d){return b.o.days.indexOf(d)>=0})}
function crPic(c){var e=c.fig&&byId(c.fig);if(e){try{return makeVis(e,{phase:.3}).svg}catch(x){}}return h('span',{cls:'badge',text:c.badge||c.n.slice(0,2)})}

/* -- subscriptions -- */
function crSubPublic(){if(!db)return;db.collection('offers').onSnapshot(function(s){var m={};s.docs.forEach(function(d){m[d.id]=d.data()});OFFERS=m;renderClubReg();renderMyClubs()},function(){})}
function crStop(){crSubs.forEach(function(f){try{f()}catch(e){}});crSubs=[];REG=null;MYSEAT={};MYWAIT={};WAITQ={};MYABS={};CRLOG={};CRSEATS={};CRREGS={};CRABS=[]}
function crSubMine(){
  crStop();if(!ME||!db)return;var uid=ME.uid;
  crSubs.push(db.doc('regs/'+uid).onSnapshot(function(d){REG=d.exists?d.data():null;renderClubReg();renderMyClubs()}));
  crAllOffers().forEach(function(oid){
    crSubs.push(db.doc('offers/'+oid+'/seats/'+uid).onSnapshot(function(d){if(d.exists)MYSEAT[oid]=d.data();else delete MYSEAT[oid];renderClubReg();renderMyClubs()}));
    crSubs.push(db.collection('offers/'+oid+'/wait').onSnapshot(function(s){var q=s.docs.map(function(d){return [d.id,tsMs(d.data().at)||9e15]}).sort(function(a,b){return a[1]-b[1]});WAITQ[oid]=q.map(function(x){return x[0]});MYWAIT[oid]=WAITQ[oid].indexOf(uid)>=0;renderClubReg();renderMyClubs();renderCrAdmin()}));
    crSubs.push(db.collection('offers/'+oid+'/seats/'+uid+'/abs').onSnapshot(function(s){MYABS[oid]={};s.docs.forEach(function(d){MYABS[oid][d.id]=d.data()});renderMyClubs()}));
    crSubs.push(db.collection('offers/'+oid+'/log').onSnapshot(function(s){CRLOG[oid]=s.docs.map(function(d){var x=d.data();x.id=d.id;return x}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))});renderMyClubs()}));
    if(MYROLE==='admin'||MYROLE==='teacher')crSubs.push(db.collection('offers/'+oid+'/seats').onSnapshot(function(s){var m={};s.docs.forEach(function(d){m[d.id]=d.data()});CRSEATS[oid]=m;renderCrAdmin()}));
  });
  if(MYROLE==='admin'||MYROLE==='teacher'){
    crSubs.push(db.collection('regs').onSnapshot(function(s){var m={};s.docs.forEach(function(d){m[d.id]=d.data()});CRREGS=m;renderCrAdmin()}));
    crSubs.push(db.group('abs',{},function(s){CRABS=s.docs.map(function(d){var p=String(d.ref).split('/');var x=d.data();return {oid:p[1],uid:p[3],day:p[5],reason:x.reason||''}});renderCrAdmin()}));
  }
}

/* -- student actions -- */
function crErr(e,full){var c=e&&e.code||'';return /permission/.test(c)?(full?'Суудал дөнгөж дүүрчихлээ. Дахин дарж хүлээлгэнд орно уу.':'Одоогоор сонгох боломжгүй байна (хугацаа эсвэл сонгох эрх). Хуудсаа шинэчлээд дахин оролдоно уу.'):/unavailable|network/.test(c)?'Интернэт холболтоо шалгана уу.':'Алдаа гарлаа. Дахин оролдоно уу.'}
function crCanPick(oid){
  var ph=crPhase(),p=crPicks(),f=crFind(oid);
  if(!ME)return [false,'login'];
  if(ph==='before')return [false,'Бүртгэл '+crTime(crSet().open)+'-д нээгдэнэ'];
  if(ph==='closed')return [false,'Бүртгэл хаагдсан'];
  if(p.indexOf(oid)>=0)return [false,'mine'];
  if(p.some(function(x){var g=crFind(x);return g&&g.c.k===f.c.k}))return [false,'Энэ дугуйлангийн нөгөө ээлжийг сонгосон'];
  var max=ph==='p1'?1:2;
  if(p.length>=max)return [false,ph==='p1'?crClock(crSet().p1)+'-аас 2 дахь дугуйлангаа нэмнэ':'2 дугуйлан сонгосон байна'];
  return [true,''];
}
function crPick(oid,st){
  if(crBusy||!ME||!db)return;var full=crLeft(oid)<=0;var uid=ME.uid,p=crPicks();
  if(!confirm(crName(oid)+(full?'\n\nСуудал дүүрсэн тул хүлээлгийн жагсаалтад орох уу?':'\n\nЭнэ дугуйланд суудал авах уу?')))return;
  var ops=full?[{op:'set',path:'offers/'+oid+'/wait/'+uid,data:{at:{__sv:'time'}}}]
    :[{op:'set',path:'offers/'+oid+'/seats/'+uid,data:{at:{__sv:'time'},status:'seat'}},{op:'merge',path:'offers/'+oid,data:{n:{__inc:1}}}];
  ops.push({op:'set',path:'regs/'+uid,data:REG?{picks:p.concat([oid])}:{picks:[oid]}});
  crBusy=true;if(st){st.className='status';st.textContent='Хадгалж байна…'}
  db.batch(ops).then(function(){crBusy=false;if(st)st.textContent=full?'Хүлээлгийн жагсаалтад орлоо.':'Суудал авлаа! "Миний дугуйлан" хэсгээс дэлгэрэнгүйг харна уу.'},
    function(e){crBusy=false;if(st){st.className='status err';st.textContent=crErr(e,!full)}});
}
function crLeave(oid,st){
  if(crBusy||!ME||!db)return;var uid=ME.uid,seat=!!MYSEAT[oid];
  if(!confirm(crName(oid)+'\n\n'+(seat?'Суудлаасаа татгалзах уу? Суудал дараагийн хүүхдэд шилжинэ.':'Хүлээлгийн жагсаалтаас гарах уу?')))return;
  var ops=seat?[{op:'delete',path:'offers/'+oid+'/seats/'+uid},{op:'merge',path:'offers/'+oid,data:{n:{__inc:-1}}}]:[{op:'delete',path:'offers/'+oid+'/wait/'+uid}];
  ops.push({op:'set',path:'regs/'+uid,data:{picks:crPicks().filter(function(x){return x!==oid}),rm:oid}});
  crBusy=true;db.batch(ops).then(function(){crBusy=false},function(e){crBusy=false;if(st){st.className='status err';st.textContent=crErr(e)}});
}

/* -- public clubs page: registration block -- */
function crBanner(){
  var s=crSet(),ph=crPhase(),p=crPicks();
  var head={before:['Бүртгэл удахгүй нээгдэнэ','Суудал сонголт '+crTime(s.open)+'-д нээгдэж, '+crClock(s.close)+'-д хаагдана. Эрт сонгосон нь суудал авна.'],
    p1:['Бүртгэл нээлттэй · 1-р алхам','Одоо 1 дугуйлан сонгоно. '+crClock(s.p1)+'-аас хойш 2 дахь дугуйлангаа нэмж болно. Хаагдах цаг: '+crClock(s.close)+'.'],
    p2:['Бүртгэл нээлттэй · 2 дахь дугуйлан','2 хүртэл дугуйлан сонгож болно. '+crClock(s.close)+'-д хаагдана.'],
    closed:['Суудал сонголт хаагдсан','Баталгаажуулалт '+s.confirm+'-нд явагдана. Статусаа "Миний дугуйлан" хэсгээс харна уу.']}[ph];
  var bx=h('div',{cls:'box crbanner'+(ph==='p1'||ph==='p2'?' live':'')},[
    h('div',{cls:'chips',style:'justify-content:space-between'},[h('h3',{style:'margin:0',text:head[0]}),ME&&p.length?h('a',{href:'#myclubs','data-go':'myclubs',cls:'btn gold small',text:'Миний дугуйлан ('+p.length+')'}):null]),
    h('p',{style:'margin:0',text:head[1]})]);
  if(!ME)bx.appendChild(h('div',{cls:'chips'},[h('button',{type:'button',cls:'btn gold small',text:'Нэвтрэх / бүртгүүлэх',onclick:function(){openLogin('in')}}),h('small',{cls:'muted',text:'Суудал авахын тулд сургуулийн имэйлээр нэвтэрнэ.'})]));
  return bx;
}
function crOfferRow(c,o){
  var st=h('span',{cls:'status',role:'status'});var mine=crPicks().indexOf(o.id)>=0;var left=crLeft(o.id),cap=crCap(o.id);
  var lab=(o.sh?o.sh+' ээлж · ':'')+crDaysTxt(o.days)+' · '+c.time;
  var seatTxt=OFFERS[o.id]?(left>0?left+'/'+cap+' суудал үлдсэн':'Дүүрсэн · хүлээлгийн жагсаалт'):cap+' суудал';
  var act;var can=crCanPick(o.id);
  if(mine){var ph=crPhase();act=h('div',{cls:'chips'},[h('span',{cls:'tag ok',text:MYSEAT[o.id]?'✓ Таны суудал':'Хүлээлгийн №'+(crRank(o.id)||'…')}),
      (ph==='p1'||ph==='p2')&&(!MYSEAT[o.id]||MYSEAT[o.id].status==='seat')?h('button',{type:'button',cls:'btn line small',text:'Цуцлах',onclick:function(ev){ev.stopPropagation();crLeave(o.id,st)}}):null])}
  else if(can[1]==='login')act=h('button',{type:'button',cls:'btn line small',text:'Нэвтэрч суудал авах',onclick:function(ev){ev.stopPropagation();openLogin('in')}});
  else if(!can[0])act=h('button',{type:'button',cls:'btn line small',disabled:'',text:can[1]});
  else act=h('button',{type:'button',cls:'btn gold small',text:left>0?'Суудал авах':'Хүлээлгэнд орох',onclick:function(ev){ev.stopPropagation();crPick(o.id,st)}});
  var pct=cap?Math.min(100,crN(o.id)/cap*100):0;
  return h('div',{cls:'crrow'},[h('div',{},[h('b',{text:lab}),h('div',{cls:'crbar'},[h('i',{style:'width:'+pct+'%;background:'+(left>0?c.cc:'var(--orange)')})]),h('small',{cls:'muted',text:seatTxt})]),act,st]);
}
function renderClubReg(){
  var W=$('crOut');if(!W)return;W.innerHTML='';
  W.appendChild(crBanner());
  var g=h('div',{cls:'clubgrid'});
  CRCLUBS.forEach(function(c){var cf=crCfg(c.k);var n=crDates(c.offers[0].days).length;
    g.appendChild(h('div',{cls:'club',style:'--cc:'+c.cc+';cursor:default'},[
      h('div',{cls:'pic',role:'button',tabindex:'0',style:'cursor:pointer','aria-label':c.n+' дэлгэрэнгүй',onclick:function(){openCrClub(c.k)},onkeydown:function(e){if(e.key==='Enter'){openCrClub(c.k)}}},[crPic(c)]),
      h('div',{cls:'chips'},[h('span',{cls:'tag',style:'background:transparent;border:1.5px solid '+c.cc,text:c.pay==='fee'?'Төлбөртэй':'Үнэгүй · барьцаатай'}),h('span',{cls:'tag t',text:n+' хичээл'})]),
      h('h3',{text:c.n}),h('p',{cls:'muted',text:c.place+(cf.coach?' · Багш: '+cf.coach:'')}),
      h('div',{cls:'sub',style:'gap:10px'},c.offers.map(function(o){return crOfferRow(c,o)})),
      c.fri?h('small',{cls:'muted',text:'Баасан: сургууль дээр нэмэлт / нөхөх хичээл (заавал биш)'}):null,
      h('button',{type:'button',cls:'btn line small',text:'Дэлгэрэнгүй',onclick:function(){openCrClub(c.k)}})]))});
  W.appendChild(g);
  W.appendChild(crRulesBox());
  if(canEdit)W.appendChild(crAdminBox());
}
function crRulesBox(){
  var s=crSet();
  function det(t,kids){return h('details',{cls:'crdet'},[h('summary',{text:t})].concat(kids))}
  return h('div',{cls:'box'},[h('h3',{text:'Бүртгэл хэрхэн явагдах вэ'}),
    h('ol',{cls:'tl'},[
      h('li',{},[h('b',{text:'10/26, 10/28 · Assembly'}),h('span',{cls:'muted',text:'Дугуйлангуудтай танилцаж, сайт дээр бүртгэл үүсгэнэ.'})]),
      h('li',{},[h('b',{text:'1-р шат · '+crTime(s.open)+' – '+crClock(s.close)+' · Суудал авах'}),h('span',{cls:'muted',text:crClock(s.p1)+' хүртэл 1 дугуйлан, дараа нь 2 дахь дугуйлангаа нэмнэ. Төлбөр төлөхгүй.'})]),
      h('li',{},[h('b',{text:'2-р шат · '+s.confirm+' · Баталгаажуулалт'}),h('span',{cls:'muted',text:'Багш ярилцаж цагийн давхцлыг шийднэ. Төлбөр эсвэл барьцаагаа '+s.confirmBy+' хүртэл төлнө.'})]),
      h('li',{},[h('b',{text:s.final+' · Эцсийн жагсаалт'}),h('span',{cls:'muted',text:'Зөвхөн баталгаажсан хүүхдүүд. Дугуйлан 11/9 (Да)-нд эхэлнэ.'})])]),
    det('Сонголтын дүрэм',[h('ul',{cls:'cues'},['Хүүхэд 2 хүртэл дугуйлан сонгоно. Нэг дугуйлангийн 2 ээлжийг зэрэг сонгохгүй.','Цаг давхцсан ч сонгож болно. Давхцлыг баталгаажуулалтын үеэр багштай ярилцаж шийднэ.','Эрт сонгосон нь суудал авна. Дүүрвэл хүлээлгийн жагсаалтад орж, хэддүгээрт байгаагаа харна.','Сургуулийн дугуйлан А (Да, Лх) эсвэл Б (Мя, Пү) ээлжтэй. Хоёр дугуйлан хослуулбал 7 хоногт 4 өдөр хөдөлнө.'].map(function(x){return h('li',{text:x})}))]),
    det('Төлбөр ба барьцаа',[h('ul',{cls:'cues'},['Сагс, гар бөмбөг: улирал бүр 300,000₮. 2-р улирал (11/2–6), 3-р улирал (1/11–15), 4-р улирал (3/15–19) төлнө.','Жиу-жицу, мини теннис, Functional: үнэгүй, 300,000₮ барьцаа нэг удаа (1 эсвэл 2 дугуйланд ижил).','Барьцааг 4/30-нд ирц 80%-иас дээш бол бүтэн буцааж өгнө.','Шалтгаангүй 3 удаа тасалбал суудлаа алдаж, барьцаа буцаагдахгүй.'].map(function(x){return h('li',{text:x})}))]),
    det('Хуанли ба амралт',[h('ul',{cls:'cues'},['Дугуйлан 11/9 – 4/30. Шалгалтын долоо хоногт ч явна.'].concat(CRCAL.breaks.map(function(b){return b[2]+': '+crMD(b[0])+' – '+crMD(b[1])})).concat(Object.keys(CRCAL.off).map(function(k){return CRCAL.off[k]+': '+crMD(k)})).map(function(x){return h('li',{text:x})}))])]);
}
function openCrClub(k){
  var c=CRCLUBS.filter(function(x){return x.k===k})[0];if(!c)return;var cf=crCfg(k);
  openSheet(function(p){
    $('sheetEyebrow').textContent='Дугуйлан · 2-р улирал (11/9–4/30)';
    p.appendChild(h('h2',{id:'sheetTitle',text:c.n,style:'font-size:30px'}));
    p.appendChild(h('div',{cls:'club',style:'cursor:default;--cc:'+c.cc},[h('div',{cls:'pic',style:'aspect-ratio:16/8'},[crPic(c)])]));
    p.appendChild(h('p',{cls:'lede',text:c.d}));
    if(cf.notice)p.appendChild(h('div',{cls:'box',style:'background:var(--gold-soft);border-color:transparent'},[h('h3',{text:'Мэдэгдэл'}),h('p',{style:'margin:0',text:cf.notice})]));
    p.appendChild(crCoachBox(cf));
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Хаана, хэзээ'}),h('div',{cls:'fgrid'},[crKV('Хаана',c.place),crKV('Цаг',c.time),crKV('Төлбөр',CRPAY[c.pay]),crKV('Нийт хичээл',crDates(c.offers[0].days).length+' (ээлж бүр)')]),
      h('div',{cls:'sub',style:'gap:10px'},c.offers.map(function(o){return crOfferRow(c,o)}))]));
    p.appendChild(crWhatBox(cf));
  });
}
function crKV(k,v){return h('div',{},[h('small',{cls:'muted',text:k}),h('p',{style:'margin:0;font-weight:700',text:v||'—'})])}
function crCoachBox(cf){return h('div',{cls:'box crcoach'},[cf.coachImg?h('img',{src:imgSrc(cf.coachImg),alt:cf.coach||'Багш',loading:'lazy'}):h('span',{cls:'crava',text:(cf.coach||'?').slice(0,1)}),
  h('div',{},[h('small',{cls:'muted',text:'Багш'}),h('h3',{style:'margin:0',text:cf.coach||'Удахгүй зарлана'}),cf.coachBio?h('p',{style:'margin:4px 0 0',text:cf.coachBio}):null])])}
function crWhatBox(cf){
  var what=cf.what&&cf.what.length?cf.what:null,lv=cf.levels&&cf.levels.length?cf.levels:null;
  return h('div',{cls:'two'},[h('div',{cls:'box'},[h('h3',{text:'Юу орох вэ'}),what?h('ul',{cls:'cues'},what.map(function(x){return h('li',{text:x})})):h('p',{cls:'muted',style:'margin:0',text:'Багш удахгүй оруулна.'})]),
    h('div',{cls:'box'},[h('h3',{text:'Түвшин'}),lv?h('ol',{cls:'cues'},lv.map(function(x){return h('li',{text:x})})):h('p',{cls:'muted',style:'margin:0',text:'Багш удахгүй оруулна.'})])]);
}

/* -- "Миний дугуйлан": the student's own clubs -- */
function renderMyClubs(){
  var W=$('myClubsOut');if(!W)return;W.innerHTML='';
  if(!ME){W.appendChild(h('div',{cls:'gate'},[h('h2',{text:'Нэвтэрнэ үү'}),h('p',{cls:'lede',text:'Өөрийн дугуйлангийн мэдээллийг харахын тулд сургуулийн имэйлээр нэвтэрнэ.'}),h('button',{type:'button',cls:'btn gold',text:'Нэвтрэх',onclick:function(){openLogin('in')}})]));return}
  var p=crPicks();
  if(!p.length){W.appendChild(h('div',{cls:'gate'},[h('h2',{text:'Одоогоор дугуйлан сонгоогүй байна'}),h('p',{cls:'lede',text:crPhase()==='before'?'Суудал сонголт '+crTime(crSet().open)+'-д нээгдэнэ. Дугуйлангуудтай танилцаад аль хоёрыг сонгохоо эцэг эхтэйгээ ярилцаарай.':crPhase()==='closed'?'Суудал сонголт хаагдсан. Асуух зүйл байвал Coach Jack-д хандаарай.':'Бүртгэл нээлттэй байна. Дугуйлангаа сонгоорой.'}),
    h('a',{href:'#clubs','data-go':'clubs',cls:'btn gold',text:'Дугуйлангууд руу очих',onclick:function(e){e.preventDefault();show('clubs')}})]));return}
  if(crOverlap(p))W.appendChild(h('div',{cls:'box',style:'background:var(--orange-soft);border-color:transparent'},[h('h3',{text:'Хоёр дугуйлангийн өдөр давхцаж байна'}),h('p',{style:'margin:0',text:'Баталгаажуулалтын үеэр ('+crSet().confirm+') багш тантай ярилцаж, ээлж солих эсвэл нэгийг сонгоно.'})]));
  p.forEach(function(oid){var f=crFind(oid);if(f)W.appendChild(crMyCard(oid,f.c,f.o))});
}
function crNextStep(oid,c){
  var s=crSet(),seat=MYSEAT[oid];
  if(!seat)return ['Хүлээлгийн жагсаалт · №'+(crRank(oid)||'…'),'o','Суудал чөлөөлөгдвөл багш тантай холбогдож, суудал санал болгоно. Энэ хуудсаа шалгаж байгаарай.'];
  var pay=c.pay==='fee'?'2-р улирлын төлбөр 300,000₮':'300,000₮ барьцаа';
  return {seat:['Суудал авсан · баталгаажаагүй','g','Эцэг эхтэйгээ нөхцөлийг уншаарай. '+s.confirm+'-нд багш ярилцаж, '+pay+'-г '+s.confirmBy+' хүртэл төлснөөр баталгаажна.'],
    talk:['Ярилцлага','o','Цагийн давхцлаа шийдэхээр Coach Jack-тай уулзана.'],
    pay:['Төлбөр хүлээгдэж буй','o',pay+'-г '+s.confirmBy+' хүртэл төлнө. Төлөөгүй бол суудал хүлээлгийн дараагийн хүүхдэд шилжинэ.'],
    ok:['Баталгаажсан','ok','Та эцсийн жагсаалтад орсон. Дугуйлан 11/9-нөөс эхэлнэ.'],
    cancel:['Цуцлагдсан','x','Энэ суудал цуцлагдсан. Асуух зүйл байвал Coach Jack-д хандаарай.']}[seat.status||'seat'];
}
function crMyCard(oid,c,o){
  var cf=crCfg(c.k),seat=MYSEAT[oid],ns=crNextStep(oid,c);
  var card=h('div',{cls:'box crmine',style:'--cc:'+c.cc},[
    h('div',{cls:'crhead'},[h('div',{cls:'pic'},[crPic(c)]),h('div',{},[h('small',{cls:'muted',text:o.sh?o.sh+' ээлж':'Дугуйлан'}),h('h2',{style:'margin:0',text:c.n}),h('span',{cls:'tag '+ns[1],text:ns[0]})])]),
    h('div',{cls:'crstep'},[h('b',{text:'Дараагийн алхам'}),h('p',{style:'margin:0',text:ns[2]})])]);
  if(cf.notice)card.appendChild(h('div',{cls:'crstep',style:'background:var(--gold-soft)'},[h('b',{text:'Мэдэгдэл'}),h('p',{style:'margin:0',text:cf.notice})]));
  var nx=crNext(o.days),all=crDates(o.days),td=ubToday();
  var nTxt=nx?crMD(nx)+' · '+c.time+(nx===td?' · Өнөөдөр':' · '+Math.round((ymdD(nx)-ymdD(td))/864e5)+' хоногийн дараа'):'Улирал дууссан';
  card.appendChild(h('div',{cls:'fgrid'},[crKV('Дараагийн хичээл',nTxt),crKV('Хаана',c.place),crKV('Өдөр, цаг',crDaysTxt(o.days)+' · '+c.time),crKV('Нийт хичээл',all.length+' (11/9–4/30)')]));
  card.appendChild(crCoachBox(cf));
  card.appendChild(crWhatBox(cf));
  if(cf.plan)card.appendChild(h('div',{cls:'box'},[h('h3',{text:'Юу хийгдэх вэ (төлөвлөгөө)'}),h('p',{style:'margin:0;white-space:pre-line',text:cf.plan})]));
  var log=CRLOG[oid]||[];
  card.appendChild(h('div',{cls:'box'},[h('h3',{text:'Юу хийсэн бэ'}),log.length?h('ol',{cls:'tl'},log.slice(0,30).map(function(x){return h('li',{},[h('b',{text:crMD(x.date)}),h('div',{text:x.did||''}),x.note?h('div',{cls:'muted',text:'Багш: '+x.note}):null,x.link?h('div',{},[h('a',{href:x.link,target:'_blank',rel:'noopener',text:'Зураг / бичлэг ↗'})]):null])})):h('p',{cls:'muted',style:'margin:0',text:'Хичээл эхэлмэгц багш хичээл бүрийн дараа энд тэмдэглэнэ.'})]));
  if(seat)card.appendChild(crAttBox(oid,c,o,seat));
  if(seat)card.appendChild(crPayBox(c,seat));
  if(seat&&seat.status!=='cancel')card.appendChild(crAbsBox(oid,o));
  card.appendChild(h('details',{cls:'crdet'},[h('summary',{text:'Хуанли: бүх хичээлийн өдөр ('+all.length+')'}),crCalendar(o.days,seat)]));
  var ph=crPhase();if((ph==='p1'||ph==='p2')&&(!seat||seat.status==='seat')){var st=h('span',{cls:'status',role:'status'});card.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn line small',text:seat?'Суудлаасаа татгалзах':'Хүлээлгээс гарах',onclick:function(){crLeave(oid,st)}}),st]))}
  return card;
}
function crAttStats(o,seat){var att=(seat&&seat.att)||{},td=ubToday();var past=crDates(o.days).filter(function(d){return d<=td});var r={p:0,a:0,e:0,held:0};past.forEach(function(d){var v=att[d];if(v){r.held++;r[v]=(r[v]||0)+1}});r.pct=r.held?Math.round(r.p/r.held*100):null;return r}
function crAttBox(oid,c,o,seat){var r=crAttStats(o,seat);
  return h('div',{cls:'box'},[h('h3',{text:'Миний ирц'}),r.held?h('div',{cls:'fgrid'},[crKV('Ирсэн',r.p+' / '+r.held),crKV('Ирц',r.pct+'%'),crKV('Шалтгаантай',String(r.e)),crKV('Шалтгаангүй тасалсан',r.a+' / 3')]):h('p',{cls:'muted',style:'margin:0',text:'Хичээл эхэлмэгц ирц энд харагдана.'}),
    r.held&&c.pay==='dep'?h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Барьцаа буцаан авах нөхцөл: улирлын эцэст ирц 80%-иас дээш.'}):null,
    r.a>=2?h('p',{style:'margin:0;color:var(--orange);font-weight:700',text:'Анхаар: шалтгаангүй 3 удаа тасалбал суудлаа алдана.'}):null]);
}
function crPayBox(c,seat){var pd=seat.paid||{};
  var rows=c.pay==='fee'?CRCAL.terms.map(function(t,i){var key='t'+(i+2);return h('li',{},[h('b',{text:t[0]+' · '+crMD(t[1]).split(' ')[0]+'–'+crMD(t[2]).split(' ')[0]}),h('span',{cls:pd[key]?'':'muted',text:pd[key]?'✓ Төлсөн':'300,000₮ · төлөх хугацаа '+t[3]})])})
    :[h('li',{},[h('b',{text:'Барьцаа 300,000₮'}),h('span',{cls:pd.dep?'':'muted',text:pd.dep?'✓ Төлсөн. 4/30-нд ирц 80%-иас дээш бол буцаана.':'Төлөх хугацаа '+crSet().confirmBy+' хүртэл'})])];
  return h('div',{cls:'box'},[h('h3',{text:c.pay==='fee'?'Төлбөр':'Барьцаа'}),h('ol',{cls:'tl'},rows)])}
function crAbsBox(oid,o){
  var td=ubToday(),up=crDates(o.days).filter(function(d){return d>=td}).slice(0,12),mine=MYABS[oid]||{};
  var sel=h('select',{id:'abs-'+oid},up.map(function(d){return h('option',{value:d,text:crMD(d)+(mine[d]?' · мэдэгдсэн':'')})}));
  var why=h('input',{type:'text',id:'absr-'+oid,placeholder:'Шалтгаан (өвчтэй, тэмцээн, гэр бүлийн…)'});var st=h('span',{cls:'status',role:'status'});
  var sent=Object.keys(mine).sort();
  return h('details',{cls:'crdet'},[h('summary',{text:'Ирж чадахгүй бол урьдчилан мэдэгдэх'}),
    up.length?h('div',{cls:'fgrid',style:'align-items:end'},[h('label',{cls:'ff',for:'abs-'+oid},['Аль хичээл',sel]),h('label',{cls:'ff',for:'absr-'+oid},['Шалтгаан',why]),
      h('div',{},[h('button',{type:'button',cls:'btn gold small',text:'Мэдэгдэх',onclick:function(){var d=sel.value,r=why.value.trim();if(!r){st.className='status err';st.textContent='Шалтгаанаа бичнэ үү.';return}
        db.batch([{op:'set',path:'offers/'+oid+'/seats/'+ME.uid+'/abs/'+d,data:{reason:r.slice(0,300),at:{__sv:'time'}}}]).then(function(){st.className='status';st.textContent='Багшид мэдэгдлээ. Шалтгаантай тасалсанд тооцогдоно.';why.value=''},function(){st.className='status err';st.textContent='Илгээж чадсангүй. Энэ өдрийн мэдэгдэл аль хэдийн илгээгдсэн байж магадгүй.'})}})])]):h('p',{cls:'muted',text:'Үлдсэн хичээл алга.'}),st,
    sent.length?h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Мэдэгдсэн: '+sent.map(crMD).join(', ')}):null]);
}
function crCalendar(days,seat){
  var att=(seat&&seat.att)||{},td=ubToday(),by={};
  var d=ymdD(CRCAL.start),e=ymdD(CRCAL.end);while(d<=e){var s=d.toISOString().slice(0,10);if(days.indexOf(d.getUTCDay())>=0){var m=s.slice(0,7);(by[m]=by[m]||[]).push(s)}d=new Date(d.getTime()+864e5)}
  var MN=['','1-р сар','2-р сар','3-р сар','4-р сар','5-р сар','6-р сар','7-р сар','8-р сар','9-р сар','10-р сар','11-р сар','12-р сар'];
  return h('div',{cls:'crcal'},Object.keys(by).map(function(m){return h('div',{},[h('b',{text:m.slice(0,4)+' · '+MN[+m.slice(5)]}),h('div',{cls:'chips'},by[m].map(function(s){var br=crBreak(s),v=att[s];
    return h('span',{cls:'tag'+(br?' x':v==='p'?' ok':v==='a'?' o':v==='e'?' g':s===td?' t':''),title:br||'',text:+s.slice(8)+(br?' · амралт':v==='p'?' ✓':v==='a'?' ✗':v==='e'?' ш':'')})}))])}));
}

/* -- owner tools: times, seat counters, club info, lists, attendance, session notes -- */
function crAdminBox(){
  return h('div',{cls:'box',style:'border:2px dashed var(--gold)'},[h('h3',{text:'Удирдлага (зөвхөн танд харагдана)'}),
    h('div',{cls:'chips'},[
      h('button',{type:'button',cls:'btn gold small',text:'⚙ Бүртгэлийн цаг, суудлын тоо',onclick:crAdminSetup}),
      h('button',{type:'button',cls:'btn line small',text:'✎ Дугуйлангийн мэдээлэл, багш',onclick:function(){crAdminClub(CRCLUBS[0].k)}}),
      h('button',{type:'button',cls:'btn line small',text:'👥 Жагсаалт, баталгаажуулалт',onclick:function(){crAdminList(crAllOffers()[0])}}),
      h('button',{type:'button',cls:'btn line small',text:'✓ Ирц бүртгэх',onclick:function(){crAdminAtt(crAllOffers()[0],'')}}),
      h('button',{type:'button',cls:'btn line small',text:'📝 Хичээлийн тэмдэглэл',onclick:function(){crAdminLog(crAllOffers()[0])}}),
      h('button',{type:'button',cls:'btn line small',text:'⬇ CSV татах',onclick:crCSV})]),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:Object.keys(OFFERS).length?'Суудлын тоолуур идэвхтэй ('+Object.keys(OFFERS).length+' ээлж).':'Анхаар: суудлын тоолуур үүсгээгүй байна. "⚙ Бүртгэлийн цаг, суудлын тоо" дээр дарж хадгална уу. Үүнгүйгээр хүүхдүүд суудал авч чадахгүй.'})]);
}
function crDT(ms){var d=ubD(ms);return d.toISOString().slice(0,16)}
function crParseDT(v){return Date.parse(v+':00+08:00')}
function crAdminSetup(){
  var s=crSet();
  openSheet(function(p){
    $('sheetEyebrow').textContent='Удирдлага';p.appendChild(h('h2',{id:'sheetTitle',text:'Бүртгэлийн цаг, суудлын тоо'}));
    p.appendChild(h('p',{cls:'muted',text:'Цагийг Улаанбаатарын цагаар оруулна. Сервер энэ цагийн гадуур суудал авахыг зөвшөөрөхгүй.'}));
    var f=h('div',{cls:'fgrid'},[fText('cr-open','Нээгдэх',crDT(s.open),{type:'datetime-local'}),fText('cr-p1','2 дахь дугуйлан нээгдэх',crDT(s.p1),{type:'datetime-local'}),fText('cr-close','Хаагдах',crDT(s.close),{type:'datetime-local'}),
      fText('cr-conf','Баталгаажуулалт',s.confirm),fText('cr-confby','Төлөх эцсийн хугацаа',s.confirmBy),fText('cr-final','Эцсийн жагсаалт',s.final)]);
    p.appendChild(f);
    var caps=h('div',{cls:'fgrid'},crAllOffers().map(function(oid){return fText('cap-'+oid,crName(oid)+(OFFERS[oid]?' (одоо '+crN(oid)+' суудал авсан)':''),crCap(oid),{type:'number',min:0,max:60})}));
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Суудлын тоо'}),caps]));
    var st=h('span',{cls:'status',role:'status'});
    p.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold',text:'Хадгалах',onclick:function(){
      var o=crParseDT(val('cr-open')),p1=crParseDT(val('cr-p1')),c=crParseDT(val('cr-close'));
      if(!(o<=p1&&p1<=c)){st.className='status err';st.textContent='Нээгдэх ≤ 2 дахь дугуйлан ≤ хаагдах дарааллаар оруулна уу.';return}
      var ops=[{op:'merge',path:'site/clubreg',data:{open:o,p1:p1,close:c,confirm:val('cr-conf'),confirmBy:val('cr-confby'),final:val('cr-final'),updatedAt:new Date().toISOString()}}];
      crAllOffers().forEach(function(oid){var cap=Math.max(0,parseInt(val('cap-'+oid),10)||0);ops.push(OFFERS[oid]?{op:'merge',path:'offers/'+oid,data:{cap:cap}}:{op:'set',path:'offers/'+oid,data:{n:0,cap:cap}})});
      st.className='status';st.textContent='Хадгалж байна…';
      db.batch(ops).then(function(){st.textContent='Хадгалагдлаа.'},function(){st.className='status err';st.textContent='Хадгалж чадсангүй.'})}}),st]));
  });
}
function crAdminClub(k){
  var c=CRCLUBS.filter(function(x){return x.k===k})[0],cf=crCfg(k);
  openSheet(function(p){
    $('sheetEyebrow').textContent='Удирдлага · дугуйлангийн мэдээлэл';p.appendChild(h('h2',{id:'sheetTitle',text:c.n}));
    p.appendChild(h('div',{cls:'chips'},CRCLUBS.map(function(x){return h('button',{type:'button',cls:'chip','aria-pressed':String(x.k===k),text:x.n,onclick:function(){crAdminClub(x.k)}})})));
    p.appendChild(h('div',{cls:'fgrid'},[fText('cc-coach','Багшийн нэр',cf.coach),fText('cc-img','Багшийн зураг (линк)',cf.coachImg,{ph:'https://… Google Drive линк'})]));
    p.appendChild(fText('cc-bio','Багшийн танилцуулга',cf.coachBio,{area:1,rows:3}));
    p.appendChild(fText('cc-what','Юу орох вэ (мөр бүрт нэг)',(cf.what||[]).join('\n'),{area:1,rows:5}));
    p.appendChild(fText('cc-lv','Түвшин (мөр бүрт нэг)',(cf.levels||[]).join('\n'),{area:1,rows:4,help:'Жишээ: Эхлэн: бөмбөгтэй танилцах, үндсэн шидэлт'}));
    p.appendChild(fText('cc-plan','Юу хийгдэх вэ: 7 хоногийн төлөвлөгөө',cf.plan,{area:1,rows:6}));
    p.appendChild(fText('cc-note','Мэдэгдэл (хичээл цуцлагдсан, цаг өөрчлөгдсөн…)',cf.notice,{area:1,rows:2,help:'Хоосон орхивол мэдэгдэл харагдахгүй.'}));
    var st=h('span',{cls:'status',role:'status'});
    p.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold',text:'Хадгалах',onclick:function(){
      var d={coach:val('cc-coach'),coachImg:val('cc-img'),coachBio:val('cc-bio'),what:lines(val('cc-what')),levels:lines(val('cc-lv')),plan:val('cc-plan'),notice:val('cc-note')};var cl={};cl[k]=d;
      st.className='status';st.textContent='Хадгалж байна…';
      db.batch([{op:'merge',path:'site/clubreg',data:{clubs:cl,updatedAt:new Date().toISOString()}}]).then(function(){st.textContent='Хадгалагдлаа.'},function(){st.className='status err';st.textContent='Хадгалж чадсангүй.'})}}),st]));
  });
}
function crUname(uid){var u=USERS[uid];return u?(u.name||u.email):uid.slice(0,6)}
function crUclass(uid){var u=USERS[uid];return u?className(u.classId)||'':''}
function crOfferTabs(cur,fn){return h('div',{cls:'chips'},crAllOffers().map(function(oid){return h('button',{type:'button',cls:'chip','aria-pressed':String(oid===cur),text:crName(oid)+' ('+crN(oid)+'/'+crCap(oid)+')',onclick:function(){fn(oid)}})}))}
var crAdminOpen=null;
function renderCrAdmin(){if(crAdminOpen&&!$('sheet').hidden)crAdminOpen()}
function crAdminList(oid){
  crAdminOpen=function(){crAdminList(oid)};
  var f=crFind(oid);var seats=CRSEATS[oid]||{};var ids=Object.keys(seats).sort(function(a,b){return tsMs(seats[a].at)-tsMs(seats[b].at)});
  openSheet(function(p){
    $('sheetEyebrow').textContent='Удирдлага · жагсаалт';p.appendChild(h('h2',{id:'sheetTitle',text:crName(oid)}));
    p.appendChild(crOfferTabs(oid,crAdminList));
    var cnt={};ids.forEach(function(u){var s=seats[u].status||'seat';cnt[s]=(cnt[s]||0)+1});
    p.appendChild(h('p',{cls:'muted',text:'Суудал: '+ids.length+'/'+crCap(oid)+' · '+Object.keys(CRST).filter(function(k){return cnt[k]}).map(function(k){return CRST[k][0]+' '+cnt[k]}).join(' · ')}));
    var tb=h('table',{cls:'crtable'},[h('thead',{},[h('tr',{},['#','Нэр','Анги','Авсан цаг','Бусад сонголт','Статус',f.c.pay==='fee'?'Төлбөр':'Барьцаа',''].map(function(x){return h('th',{text:x})}))])]);
    var body=h('tbody');
    ids.forEach(function(uid,i){var s=seats[uid],st=h('span',{cls:'status'});var other=((CRREGS[uid]||{}).picks||[]).filter(function(x){return x!==oid});var ov=other.length&&crOverlap([oid,other[0]]);
      var sel=h('select',{'aria-label':'Статус'},Object.keys(CRST).map(function(k){return h('option',{value:k,text:CRST[k][0]})}));sel.value=s.status||'seat';
      sel.addEventListener('change',function(){db.batch([{op:'merge',path:'offers/'+oid+'/seats/'+uid,data:{status:sel.value}}]).catch(function(){st.textContent='Алдаа'})});
      var pd=s.paid||{};var payEl=f.c.pay==='fee'?h('div',{cls:'chips'},CRCAL.terms.map(function(t,j){var key='t'+(j+2);var cb=h('input',{type:'checkbox'});cb.checked=!!pd[key];cb.addEventListener('change',function(){var x={};x[key]=cb.checked;db.batch([{op:'merge',path:'offers/'+oid+'/seats/'+uid,data:{paid:x}}]).catch(function(){})});return h('label',{cls:'ck'},[cb,' '+(j+2)])}))
        :(function(){var cb=h('input',{type:'checkbox'});cb.checked=!!pd.dep;cb.addEventListener('change',function(){db.batch([{op:'merge',path:'offers/'+oid+'/seats/'+uid,data:{paid:{dep:cb.checked}}}]).catch(function(){})});return h('label',{cls:'ck'},[cb,' Төлсөн'])})();
      body.appendChild(h('tr',{},[h('td',{text:String(i+1)}),h('td',{text:crUname(uid)}),h('td',{text:crUclass(uid)}),h('td',{text:tsMs(s.at)?crTime(tsMs(s.at)):''}),
        h('td',{},[other.length?h('span',{cls:'tag'+(ov?' o':''),text:crName(other[0])+(ov?' · давхцал':'')}):h('span',{cls:'muted',text:'—'})]),h('td',{},[sel]),h('td',{},[payEl]),
        h('td',{},[h('button',{type:'button',cls:'btn line small danger',text:'Хасах',onclick:function(){if(!confirm(crUname(uid)+'-г '+crName(oid)+'-аас хасах уу? Суудал нэгээр нэмэгдэнэ.'))return;
          db.batch([{op:'delete',path:'offers/'+oid+'/seats/'+uid},{op:'merge',path:'offers/'+oid,data:{n:{__inc:-1}}},{op:'set',path:'regs/'+uid,data:{picks:((CRREGS[uid]||{}).picks||[]).filter(function(x){return x!==oid}),rm:oid}}]).catch(function(){st.textContent='Алдаа'})}}),st])]))});
    tb.appendChild(body);p.appendChild(h('div',{style:'overflow-x:auto'},[tb]));
    if(!ids.length)p.appendChild(h('p',{cls:'muted',text:'Одоогоор суудал авсан хүүхэд алга.'}));
    var q=WAITQ[oid]||[];
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Хүлээлгийн жагсаалт ('+q.length+')'}),q.length?h('ol',{cls:'tl'},q.map(function(uid){return h('li',{},[h('b',{text:crUname(uid)+(crUclass(uid)?' · '+crUclass(uid):'')}),
      h('button',{type:'button',cls:'btn gold small',text:'Суудал өгөх',onclick:function(){if(!confirm((crLeft(oid)<=0?'Анхаар: суудал дүүрсэн байна ('+crN(oid)+'/'+crCap(oid)+'). Нэмэлт суудал болгож өгөх үү?\n\n':'')+crUname(uid)+'-д суудал өгөх үү? Статус нь "Төлбөр хүлээгдэж буй" болно.'))return;
        db.batch([{op:'set',path:'offers/'+oid+'/seats/'+uid,data:{at:{__sv:'time'},status:'pay'}},{op:'merge',path:'offers/'+oid,data:{n:{__inc:1}}},{op:'delete',path:'offers/'+oid+'/wait/'+uid}]).catch(function(){alert('Хадгалж чадсангүй.')})}})])})):h('p',{cls:'muted',style:'margin:0',text:'Хүлээлгийн жагсаалт хоосон.'})]));
  });
}
function crAdminAtt(oid,day){
  crAdminOpen=function(){crAdminAtt(oid,day)};
  var f=crFind(oid),all=crDates(f.o.days),td=ubToday();if(!day){day=all.filter(function(d){return d<=td}).pop()||all[0]}
  var seats=CRSEATS[oid]||{};var ids=Object.keys(seats).filter(function(u){return seats[u].status!=='cancel'}).sort(function(a,b){return crUname(a).localeCompare(crUname(b))});
  openSheet(function(p){
    $('sheetEyebrow').textContent='Удирдлага · ирц';p.appendChild(h('h2',{id:'sheetTitle',text:crName(oid)}));
    p.appendChild(crOfferTabs(oid,function(x){crAdminAtt(x,'')}));
    var sel=h('select',{id:'att-day'},all.map(function(d){return h('option',{value:d,text:crMD(d)+(d===td?' · өнөөдөр':'')})}));sel.value=day;sel.addEventListener('change',function(){crAdminAtt(oid,sel.value)});
    p.appendChild(h('label',{cls:'ff',for:'att-day'},['Хичээлийн өдөр',sel]));
    var abs={};CRABS.forEach(function(a){if(a.oid===oid&&a.day===day)abs[a.uid]=a.reason});
    var n={p:0,a:0,e:0};ids.forEach(function(u){var v=(seats[u].att||{})[day];if(v)n[v]++});
    p.appendChild(h('p',{cls:'muted',text:'Ирсэн '+n.p+' · Шалтгаантай '+n.e+' · Тасалсан '+n.a+' · Бүртгээгүй '+(ids.length-n.p-n.e-n.a)}));
    p.appendChild(h('div',{cls:'chips'},[h('button',{type:'button',cls:'btn line small',text:'Бүгдийг "Ирсэн" болгох',onclick:function(){db.batch(ids.filter(function(u){return !(seats[u].att||{})[day]}).map(function(u){var a={};a[day]=abs[u]?'e':'p';return {op:'merge',path:'offers/'+oid+'/seats/'+u,data:{att:a}}})).catch(function(){})}})]));
    ids.forEach(function(uid){var v=(seats[uid].att||{})[day]||'';
      function b(code,lab){return h('button',{type:'button',cls:'chip','aria-pressed':String(v===code),text:lab,onclick:function(){var a={};a[day]=v===code?null:code;db.batch([{op:'merge',path:'offers/'+oid+'/seats/'+uid,data:{att:a}}]).catch(function(){})}})}
      p.appendChild(h('div',{cls:'crrow'},[h('div',{},[h('b',{text:crUname(uid)}),h('small',{cls:'muted',text:crUclass(uid)+(abs[uid]?' · Мэдэгдсэн: '+abs[uid]:'')})]),h('div',{cls:'chips'},[b('p','✓ Ирсэн'),b('e','Шалтгаантай'),b('a','✗ Тасалсан')])]))});
    if(!ids.length)p.appendChild(h('p',{cls:'muted',text:'Энэ ээлжид суудал авсан хүүхэд алга.'}));
  });
}
function crAdminLog(oid){
  crAdminOpen=null;var f=crFind(oid),all=crDates(f.o.days),td=ubToday();
  openSheet(function(p){
    $('sheetEyebrow').textContent='Удирдлага · хичээлийн тэмдэглэл';p.appendChild(h('h2',{id:'sheetTitle',text:crName(oid)}));
    p.appendChild(crOfferTabs(oid,crAdminLog));
    var sel=fSelect('lg-day','Өдөр',all.map(function(d){return [d,crMD(d)]}),all.filter(function(d){return d<=td}).pop()||all[0]);
    p.appendChild(h('div',{cls:'fgrid'},[sel,fText('lg-link','Зураг / бичлэгийн линк',''),]));
    p.appendChild(fText('lg-did','Юу хийсэн бэ','',{area:1,rows:3}));
    p.appendChild(fText('lg-note','Багшийн тэмдэглэл (заавал биш)','',{area:1,rows:2}));
    var st=h('span',{cls:'status',role:'status'});
    p.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold',text:'Нэмэх',onclick:function(){var did=val('lg-did');if(!did){st.className='status err';st.textContent='"Юу хийсэн бэ"-г бичнэ үү.';return}var lk=val('lg-link');if(lk&&!/^https:\/\//.test(lk)){st.className='status err';st.textContent='Линк https:// -ээр эхэлнэ.';return}
      var d=val('lg-day');db.batch([{op:'set',path:'offers/'+oid+'/log/'+d,data:{date:d,did:did,note:val('lg-note'),link:lk,at:Date.now()}}]).then(function(){st.className='status';st.textContent='Нэмэгдлээ. Хүүхдүүдийн "Миний дугуйлан" хэсэгт харагдана.';$('lg-did').value='';$('lg-note').value='';$('lg-link').value=''},function(){st.className='status err';st.textContent='Хадгалж чадсангүй.'})}}),st]));
    var log=CRLOG[oid]||[];
    if(log.length)p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Өмнөх тэмдэглэл'}),h('ol',{cls:'tl'},log.map(function(x){return h('li',{},[h('b',{text:crMD(x.date)}),h('span',{text:x.did}),h('button',{type:'button',cls:'btn line small danger',text:'Устгах',onclick:function(){if(confirm('Устгах уу?'))db.doc('offers/'+oid+'/log/'+x.id).delete().catch(function(){})}})])}))]));
  });
}
function crCSV(){
  var rows=[['Дугуйлан','Ээлж','Нэр','Имэйл','Анги','Статус','Төлбөр/барьцаа','Авсан цаг','Бусад сонголт']];
  crAllOffers().forEach(function(oid){var f=crFind(oid),seats=CRSEATS[oid]||{};Object.keys(seats).forEach(function(uid){var s=seats[uid],u=USERS[uid]||{},pd=s.paid||{};
    rows.push([f.c.n,f.o.sh,u.name||'',u.email||'',className(u.classId)||'',(CRST[s.status||'seat']||[''])[0],Object.keys(pd).filter(function(k){return pd[k]}).join(' '),tsMs(s.at)?crTime(tsMs(s.at)):'',((CRREGS[uid]||{}).picks||[]).filter(function(x){return x!==oid}).map(crName).join('; ')])});
    (WAITQ[oid]||[]).forEach(function(uid,i){var u=USERS[uid]||{};rows.push([f.c.n,f.o.sh,u.name||'',u.email||'',className(u.classId)||'','Хүлээлэг №'+(i+1),'','',''])})});
  var csv='﻿'+rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}).join(',')}).join('\n');
  var b=new Blob([csv],{type:'text/csv;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='dugui-lan-'+ubToday()+'.csv';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);
}
