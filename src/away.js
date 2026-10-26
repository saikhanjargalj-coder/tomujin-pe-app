/* ---------- "I can't come": a student tells in advance that they will miss a PE lesson ----------
   The student picks one of their own coming lessons and a reason; the sheet script writes Ө (sick) or
   Ч (excused) into THEIR OWN row of the school's attendance sheet straight away. The script checks
   everything again on its side: verified school email, own row only, an empty cell, a real PE day of
   their class, today only until the cut-off time. The owner switches it on and sets the rules in
   "Хичээлийн ирц" > settings; config/absence tells the site whether it is on and where the script is. */
var ABS={conf:null,loaded:false,me:null,loading:false,err:'',msg:null,ask:null,busy:''};
var ABSERR={'away-off':'Одоогоор энэ боломж хаалттай байна.','not-in-list':'Таны имэйл биеийн тамирын ангийн жагсаалтад олдсонгүй. Жак багшид хэлээрэй.',
  'not-lesson-day':'Энэ өдөр танай ангид биеийн тамирын хичээл байхгүй байна.','already-marked':'Энэ өдрийн ирцийг багш аль хэдийн тэмдэглэсэн байна.',
  'not-yours':'Энэ тэмдэглэгээг багш тавьсан тул өөрчлөх боломжгүй.','not-allowed':'Энэ боломжийг сургуулийн имэйлтэй сурагчид ашиглана.',
  'bad-token':'Нэвтрэлт хүчингүй боллоо. Гараад дахин нэвтэрнэ үү.','no-url':'Одоогоор энэ боломж хаалттай байна.'};
function absErr(e){var c=String((e&&e.message)||e||'').split(':')[0];
  if(c==='too-late')return 'Өнөөдрийн хичээлд мэдэгдэх цаг ('+absCut()+') өнгөрсөн. Жак багшид шууд хэлээрэй.';
  return ABSERR[c]||'Холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.'}
function absOn(){return !!(ABS.conf&&ABS.conf.on&&(ABS.conf.url||(window.TPE&&TPE.sheet)))}
function absCut(){return (ABS.me&&ABS.me.cutoff)||(ABS.conf&&ABS.conf.cutoff)||'08:30'}
function absAhead(){return (ABS.me&&ABS.me.ahead)||(ABS.conf&&ABS.conf.ahead)||21}
function absCall(q){
  if(window.TPE&&TPE.sheet)return TPE.sheet(q);   // preview: made-up class lists
  if(!absOn())return Promise.reject(new Error('no-url'));
  return sheetPost(ABS.conf.url,q);
}
function absStart(){
  if(!db||!ME)return;
  unsubs.push(db.doc('config/absence').onSnapshot(function(d){ABS.conf=d.exists?d.data():null;ABS.loaded=true;absMenu();absHome();if(!$('v-away').hidden)renderAway()},function(){ABS.loaded=true;absMenu()}));
}
function absStop(){ABS.conf=null;ABS.loaded=false;ABS.me=null;ABS.err='';ABS.msg=null;ABS.ask=null;ABS.busy='';absMenu()}
function absMenu(){[].forEach.call(document.querySelectorAll('nav [data-go=away]'),function(a){a.hidden=!(MYROLE==='student'&&absOn())})}
function absLoad(){
  ABS.loading=true;ABS.err='';renderAway();
  absCall({action:'me'}).then(function(j){ABS.me=j;ABS.loading=false;renderAway()},function(e){ABS.loading=false;ABS.err=absErr(e);renderAway()});
}
var ABSKIND={sick:['Ө','Өвчтэй','🤒'],leave:['Ч','Чөлөөтэй','📝']};
function absDay(iso,today){var d=new Date(iso+'T00:00:00Z'),w=['Ням','Даваа','Мягмар','Лхагва','Пүрэв','Баасан','Бямба'][d.getUTCDay()],t=iso===today?'Өнөөдөр, ':iso===absAdd(today,1)?'Маргааш, ':'';return t+w+', '+(d.getUTCMonth()+1)+'/'+d.getUTCDate()}
function absAdd(iso,n){var d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function absCodeName(v){var c=PACODE.filter(function(k){return k[0]===v})[0];return c?c[1]:v}
function absSend(q,okText){
  ABS.busy=q.date;ABS.msg=null;renderAway();
  absCall(q).then(function(){ABS.busy='';ABS.ask=null;ABS.msg={t:okText};
      var d=(ABS.me&&ABS.me.days||[]).filter(function(x){return x.date===q.date})[0];
      if(d){d.code=q.action==='away'?ABSKIND[q.kind][0]:'';d.mine=q.action==='away'}
      renderAway();setTimeout(function(){absCall({action:'me'}).then(function(j){ABS.me=j;renderAway()},function(){})},600)},
    function(e){ABS.busy='';ABS.ask=null;ABS.msg={t:absErr(e),err:1};renderAway();absCall({action:'me'}).then(function(j){ABS.me=j;renderAway()},function(){})});
}
function renderAway(){
  var W=$('awayOut');if(!W)return;W.innerHTML='';
  if(MYROLE!=='student'){W.appendChild(h('div',{cls:'box'},[h('p',{style:'margin:0',text:'Энэ хуудсыг сурагчид ашиглана. Сурагчдын урьдчилан мэдэгдсэн өдрүүд "Хичээлийн ирц" болон багшийн нүүр хуудсанд харагдана.'})]));return}
  if(!ABS.loaded){W.appendChild(h('p',{cls:'muted',text:'Ачаалж байна…'}));return}
  if(!absOn()){W.appendChild(h('div',{cls:'box'},[h('p',{style:'margin:0',text:'Одоогоор энэ боломж хаалттай байна. Хичээлдээ ирж чадахгүй бол Жак багшид шууд хэлээрэй.'})]));return}
  if(!ABS.me&&!ABS.loading&&!ABS.err){absLoad();return}
  if(ABS.loading&&!ABS.me){W.appendChild(h('p',{cls:'muted',role:'status',text:'Таны хичээлийн өдрүүдийг шалгаж байна…'}));return}
  if(ABS.err&&!ABS.me){W.appendChild(h('p',{cls:'status err',role:'status',text:ABS.err}));W.appendChild(h('div',{},[h('button',{type:'button',cls:'btn line small',text:'Дахин оролдох',onclick:absLoad})]));return}
  var me=ABS.me,today=me.today,label=paLabel({cls:me.me.cls,tab:me.me.tab});
  W.appendChild(h('p',{cls:'muted',style:'margin:0',text:me.me.first+' · '+label+' анги · Ойрын '+me.ahead+' хоногийн биеийн тамирын хичээл'}));
  if(ABS.msg)W.appendChild(h('p',{cls:'status'+(ABS.msg.err?' err':''),role:'status',id:'aw-msg',text:ABS.msg.t}));
  var days=me.days||[];
  if(!days.length)W.appendChild(h('div',{cls:'box'},[h('p',{style:'margin:0',text:'Ойрын '+me.ahead+' хоногт танай ангийн хичээл олдсонгүй.'})]));
  days.forEach(function(d){
    var busy=ABS.busy===d.date,asking=ABS.ask&&ABS.ask.date===d.date,line,acts=[];
    if(d.mine){var k=d.code==='Ө'?'sick':'leave';line='✓ "'+ABSKIND[k][1]+'" гэж мэдэгдсэн. Жак багшийн ирцэд бичигдлээ.';
      if(d.open){acts.push(h('button',{type:'button',cls:'btn line small','data-act':'undo',disabled:busy?'':null,text:'Болиулах',onclick:function(){absSend({action:'unaway',date:d.date},'Болиулсан. '+absDay(d.date,today)+'-ны хичээлд ирнэ гэж тооцогдоно.')}}));
        acts.push(h('button',{type:'button',cls:'btn line small','data-act':'swap',disabled:busy?'':null,text:k==='sick'?'Чөлөөтэй болгох':'Өвчтэй болгох',onclick:function(){absSend({action:'away',date:d.date,kind:k==='sick'?'leave':'sick'},'Шалтгааныг өөрчиллөө.')}}))}
      else line+=' Одоо өөрчлөх бол Жак багшид хэлээрэй.'}
    else if(d.code){line='Багш тэмдэглэсэн: '+absCodeName(d.code)+'.'}
    else if(!d.open){line='Өнөөдрийн хичээлд мэдэгдэх цаг ('+me.cutoff+') өнгөрсөн. Ирж чадахгүй бол Жак багшид шууд хэлээрэй.'}
    else if(asking){var kk=ABSKIND[ABS.ask.kind];line='"'+kk[1]+'" гэж мэдэгдэх үү?';
      acts.push(h('button',{type:'button',cls:'btn gold small','data-act':'yes',disabled:busy?'':null,text:busy?'Илгээж байна…':'Тийм, илгээх',onclick:function(){absSend({action:'away',date:d.date,kind:ABS.ask.kind},'✓ Илгээгдлээ. '+absDay(d.date,today)+'-ны хичээлд "'+kk[1]+'" гэж бичигдлээ.')}}));
      acts.push(h('button',{type:'button',cls:'btn line small','data-act':'no',disabled:busy?'':null,text:'Болих',onclick:function(){ABS.ask=null;renderAway()}}))}
    else{line='Ирж чадахгүй бол шалтгаанаа сонгоно уу.';
      ['sick','leave'].forEach(function(k){acts.push(h('button',{type:'button',cls:'btn line small','data-act':k,text:ABSKIND[k][2]+' '+ABSKIND[k][1],onclick:function(){ABS.ask={date:d.date,kind:k};ABS.msg=null;renderAway()}}))})}
    W.appendChild(h('div',{cls:'acard aw-day'+(d.mine?' mine':''),'data-date':d.date},[h('h3',{style:'margin:0',text:absDay(d.date,today)}),h('p',{cls:'muted',style:'margin:0',text:line}),acts.length?h('div',{cls:'chips'},acts):null]));
  });
  W.appendChild(h('div',{cls:'box',style:'padding:10px 14px'},[h('ul',{cls:'cues',style:'margin:0'},[
    'Өнөөдрийн хичээлд өглөө '+me.cutoff+' хүртэл мэдэгдэж болно. Түүнээс хойш бол Жак багшид шууд хэлээрэй.',
    'Зөвхөн өөрийнхөө ирцийг мэдэгднэ. Багш тэмдэглэсэн өдрийг өөрчлөх боломжгүй.',
    'Бодлоо өөрчилбөл "Болиулах" дарна. Багш шаардлагатай бол ирцийг засна.'].map(function(t){return h('li',{text:t})}))]));
  W.appendChild(h('div',{},[h('button',{type:'button',cls:'btn line small',text:'↻ Шинэчлэх',disabled:ABS.loading?'':null,onclick:function(){ABS.msg=null;absLoad()}})]));
}
/* home card for students */
function absHome(){var W=$('homeAway');if(!W)return;W.innerHTML='';if(!ME||MYROLE!=='student'||!absOn())return;
  W.appendChild(h('div',{cls:'acard home'},[h('span',{cls:'eyebrow',text:'Биеийн тамирын хичээл'}),h('h3',{style:'margin:0',text:'Хичээлдээ ирж чадахгүй юу?'}),
    h('p',{cls:'muted',style:'margin:0',text:'Өвдсөн эсвэл чөлөө авсан бол урьдчилан мэдэгдээрэй. Багшийн ирцэд шууд бичигдэнэ.'}),
    h('div',{},[h('button',{type:'button',cls:'btn gold small',text:'Урьдчилан мэдэгдэх',onclick:function(){show('away')}})])]))}

/* ---------- teacher side ---------- */
/* teacher home: coming lessons students said they will miss */
function absTeachBox(sum){
  var list=(sum&&sum.away)||[];if(!list.length&&!(sum&&sum.absconf&&sum.absconf.on))return null;
  var cls=(sum&&sum.classes)||[],td=ymd(new Date());
  return h('div',{cls:'box',id:'awayBox'},[h('h3',{text:'Урьдчилан мэдэгдсэн'+(list.length?' ('+list.length+')':'')}),
    list.length?h('ul',{cls:'cues'},list.map(function(x){var c=cls.filter(function(k){return k.tab===x.tab&&k.cls===x.cls})[0]||{cls:x.cls,tab:x.tab};
      return h('li',{},[h('button',{type:'button',cls:'exlink',text:paName(x)+' · '+paLabel(c),onclick:function(){paOpen(x.tab+'|'+x.cls,x.date);show('patt')}}),
        h('span',{cls:'muted',text:' · '+(x.date===td?'өнөөдөр ':'')+paMD(x.date)+' · '+absCodeName(x.code)})])}))
      :h('p',{cls:'muted',style:'margin:0',text:'Одоогоор урьдчилан мэдэгдсэн сурагч алга.'})]);
}
/* owner settings: switch on/off, cut-off time, how far ahead */
function absSettings(){
  var cur=(PATT.sum&&PATT.sum.absconf)||ABS.conf||{on:false,cutoff:'08:30',ahead:21};
  var st=h('p',{cls:'status',role:'status',id:'abs-st'});
  var on=h('input',{type:'checkbox',id:'abs-on'});on.checked=!!cur.on;
  var cut=h('input',{type:'time',id:'abs-cut',step:'60'});cut.value=cur.cutoff||'08:30';
  var ah=h('select',{id:'abs-ahead'},[7,14,21,28].map(function(n){return h('option',{value:String(n),text:n+' хоног'})}));ah.value=String(cur.ahead||21);
  return h('details',{cls:'crdet',id:'abs-set'},[h('summary',{text:'Сурагч урьдчилан мэдэгдэх: '+(cur.on?'нээлттэй · '+cur.cutoff+' · '+cur.ahead+' хоног':'хаалттай')}),
    h('p',{style:'margin:0',text:'Нээлттэй үед сурагч "Миний хэсэг → Ирэхгүй гэж мэдэгдэх"-ээс өөрийн ойрын хичээлийг сонгоод "Өвчтэй" (Ө) эсвэл "Чөлөөтэй" (Ч) гэж мэдэгдэнэ. Sheet-д шууд бичигдэж, нүдэнд "Tomujin PE: сурагч сайтаар урьдчилан мэдэгдсэн" тэмдэглэл үлдэнэ.'}),
    h('ul',{cls:'cues'},['Сурагч зөвхөн өөрийн мөр, хоосон нүдэнд бичнэ. Таны тавьсан тэмдэглэгээг өөрчилж чадахгүй.','Хичээлийн өдрийг Sheet-ийн сүүлийн 3 долоо хоногийн ирцээс автоматаар олно.','Та ирцийг өөрчилбөл сурагчийн тэмдэглэл арилж, таны тэмдэглэгээ болно.','Нээхэд Script-ийн холбоос нэвтэрсэн сурагчдад харагдана. Script нь сурагчид зөвхөн өөрийнх нь мэдээллийг өгнө.'].map(function(t){return h('li',{text:t})})),
    h('label',{cls:'ff',for:'abs-on',style:'flex-direction:row;align-items:center;gap:8px'},[on,'Сурагчид урьдчилан мэдэгдэж болно']),
    h('label',{cls:'ff',for:'abs-cut'},['Өнөөдрийн хичээлд хэдэн цаг хүртэл',cut]),
    h('label',{cls:'ff',for:'abs-ahead'},['Хэдэн хоногийн өмнөөс',ah]),
    h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',id:'abs-save',text:'Хадгалах',onclick:function(ev){
      var set={on:!!on.checked,cutoff:cut.value,ahead:+ah.value},btn=ev.currentTarget;
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(set.cutoff)){st.className='status err';st.textContent='Цагийг 08:30 гэх мэтээр оруулна уу.';return}
      btn.disabled=true;st.className='status';st.textContent='Хадгалж байна…';
      paCall({action:'absconf',set:set}).then(function(j){
        return db.doc('config/absence').set({on:j.absconf.on,url:PATT.url||'preview',cutoff:j.absconf.cutoff,ahead:j.absconf.ahead,at:Date.now()}).then(function(){
          if(PATT.sum)PATT.sum.absconf=j.absconf;btn.disabled=false;st.className='status';st.textContent='✓ Хадгалагдлаа: '+(j.absconf.on?'нээлттэй':'хаалттай')+'.'})})
      .catch(function(e){btn.disabled=false;st.className='status err';st.textContent='Хадгалж чадсангүй. '+paErr(e)})}}),st])]);
}
