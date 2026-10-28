/* ---------- "I can't come": a student tells in advance that they will miss a PE lesson ----------
   The student picks one of their own coming lessons (the sheet script lists them, read-only), chooses
   sick or excused and writes the reason. That is a REQUEST, kept in absreq/{uid}_{date} (only the
   student and the owner can read it). Nothing goes into the school's attendance sheet until the owner
   presses "Батлах": then the owner's own sheet call writes Ө (sick) or Ч (excused). Not approved and the
   student did not come: "Бүгд ирсэн болгох" marks them Т (absent).
   The owner switches it on and sets the rules in "Хичээлийн ирц" > settings; config/absence tells the site
   whether it is on and where the script is. */
var ABS={conf:null,loaded:false,me:null,loading:false,err:'',msg:null,ask:null,busy:'',reqs:{},all:[],allLoaded:false,deciding:{}};
var ABSERR={'away-off':'Одоогоор энэ боломж хаалттай байна.','not-in-list':'Таны имэйл биеийн тамирын ангийн жагсаалтад олдсонгүй. Жак багшид хэлээрэй.',
  'not-allowed':'Энэ боломжийг сургуулийн имэйлтэй сурагчид ашиглана.','bad-token':'Нэвтрэлт хүчингүй боллоо. Гараад дахин нэвтэрнэ үү.','no-url':'Одоогоор энэ боломж хаалттай байна.',
  'permission-denied':'Илгээх боломжгүй байна. Энэ өдрийн хүсэлт аль хэдийн шийдэгдсэн байж магадгүй.'};
function absErr(e){var c=String((e&&(e.code||e.message))||e||'').split(':')[0].replace(/^firestore\//,'');return ABSERR[c]||'Холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.'}
function absOn(){return !!(ABS.conf&&ABS.conf.on&&(ABS.conf.url||(window.TPE&&TPE.sheet)))}
function absCall(q){
  if(window.TPE&&TPE.sheet)return TPE.sheet(q);   // preview: made-up class lists
  if(!absOn())return Promise.reject(new Error('no-url'));
  return sheetPost(ABS.conf.url,q);
}
function absStart(){
  if(!db||!ME)return;
  unsubs.push(db.doc('config/absence').onSnapshot(function(d){ABS.conf=d.exists?d.data():null;ABS.loaded=true;absMenu();absHome();if(!$('v-away').hidden)renderAway()},function(){ABS.loaded=true;absMenu()}));
  if(MYROLE==='student')unsubs.push(db.collection('absreq').onSnapshot(function(s){var m={};s.docs.forEach(function(d){var x=d.data();x.id=d.id;m[x.date]=x});ABS.reqs=m;if(!$('v-away').hidden)renderAway()},function(){},{where:[['uid','==',ME.uid]]}));
  if(MYROLE==='admin')unsubs.push(db.collection('absreq').onSnapshot(function(s){ABS.all=s.docs.map(function(d){var x=d.data();x.id=d.id;return x}).sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0});ABS.allLoaded=true;paRefresh()},function(){},{where:[['date','>=',absAdd(ymd(new Date()),-30)]]}));
}
function absStop(){ABS.conf=null;ABS.loaded=false;ABS.me=null;ABS.err='';ABS.msg=null;ABS.ask=null;ABS.busy='';ABS.reqs={};ABS.all=[];ABS.allLoaded=false;ABS.deciding={};absMenu()}
function absMenu(){[].forEach.call(document.querySelectorAll('nav [data-go=away]'),function(a){a.hidden=!(MYROLE==='student'&&absOn())})}
function absLoad(){
  ABS.loading=true;ABS.err='';renderAway();
  absCall({action:'me'}).then(function(j){ABS.me=j;ABS.loading=false;renderAway()},function(e){ABS.loading=false;ABS.err=absErr(e);renderAway()});
}
var ABSKIND={sick:['Ө','Өвчтэй','🤒'],leave:['Ч','Чөлөөтэй','📝']};
function absDay(iso,today){var d=new Date(iso+'T00:00:00Z'),w=['Ням','Даваа','Мягмар','Лхагва','Пүрэв','Баасан','Бямба'][d.getUTCDay()],t=iso===today?'Өнөөдөр, ':iso===absAdd(today,1)?'Маргааш, ':'';return t+w+', '+(d.getUTCMonth()+1)+'/'+d.getUTCDate()}
function absAdd(iso,n){var d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function absCodeName(v){var c=PACODE.filter(function(k){return k[0]===v})[0];return c?c[1]:v}
function absMs(v){return v&&v.toMillis?v.toMillis():(typeof v==='number'?v:0)}
function absWhen(v){var ms=absMs(v);if(!ms)return '';var d=ubD(ms);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+pad2(d.getUTCHours())+':'+pad2(d.getUTCMinutes())}

/* ---------- student page ---------- */
function absSend(d,kind,reason){
  var me=ABS.me,label=paLabel({cls:me.me.cls,tab:me.me.tab}),name=(MYPROFILE&&MYPROFILE.name)||(ME&&ME.name)||(me.me.last+' '+me.me.first);
  ABS.busy=d.date;ABS.msg=null;renderAway();
  db.batch([{op:'set',path:'absreq/'+ME.uid+'_'+d.date,data:{uid:ME.uid,email:String(ME.email||'').toLowerCase(),name:String(name).slice(0,80),cls:label.slice(0,20),tab:me.me.tab,date:d.date,kind:kind,reason:reason,status:'pending',at:{__sv:'time'}}}])
    .then(function(){ABS.busy='';ABS.ask=null;ABS.msg={t:'✓ Хүсэлт илгээгдлээ. Жак багш батлахаар '+absDay(d.date,me.today)+'-ны ирцэд "'+ABSKIND[kind][1]+'" гэж бичигдэнэ.'};renderAway()},
      function(e){ABS.busy='';ABS.msg={t:absErr(e),err:1};renderAway()});
}
function absCancel(r){
  ABS.busy=r.date;ABS.msg=null;renderAway();
  db.doc('absreq/'+r.id).delete().then(function(){ABS.busy='';ABS.msg={t:'Хүсэлтээ болиулсан.'};delete ABS.reqs[r.date];renderAway()},function(e){ABS.busy='';ABS.msg={t:absErr(e),err:1};renderAway()});
}
function renderAway(){
  var W=$('awayOut');if(!W)return;
  var keep=W.querySelector('#aw-why'),typed=keep?keep.value:null;   // the comment being written survives a redraw
  W.innerHTML='';
  if(MYROLE!=='student'){W.appendChild(h('div',{cls:'box'},[h('p',{style:'margin:0',text:'Энэ хуудсыг сурагчид ашиглана. Сурагчдын хүсэлт багшийн нүүр хуудас болон "Хичээлийн ирц"-д харагдана.'})]));return}
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
    var r=ABS.reqs[d.date],busy=ABS.busy===d.date,asking=ABS.ask&&ABS.ask.date===d.date,lines=[],acts=[],form=null,st='';
    if(r){var kn=(ABSKIND[r.kind]||ABSKIND.sick)[1];
      if(r.status==='ok'){st='ok';lines.push('✓ Багш баталсан: "'+kn+'". Ирцэд "'+kn+'" гэж бичигдсэн.')}
      else if(r.status==='no'){st='no';lines.push('✕ Багш хүсэлтийг батлаагүй. Хичээлдээ ирээгүй бол "Тасалсан" гэж тооцогдоно.')}
      else{st='wait';lines.push('📩 Хүсэлт илгээсэн: "'+kn+'". Багш шалгаж байна.');
        acts.push(h('button',{type:'button',cls:'btn line small','data-act':'undo',disabled:busy?'':null,text:'Хүсэлтээ болиулах',onclick:function(){absCancel(r)}}))}
      lines.push('Таны бичсэн: "'+r.reason+'"');
      if(d.code&&r.status!=='ok')lines.push('Багш тэмдэглэсэн: '+absCodeName(d.code)+'.')}
    else if(d.code){lines.push('Багш тэмдэглэсэн: '+absCodeName(d.code)+'.')}
    else if(!d.open){lines.push('Өнөөдрийн хичээлд мэдэгдэх цаг ('+me.cutoff+') өнгөрсөн. Ирж чадахгүй бол Жак багшид шууд хэлээрэй.')}
    else if(asking){var kk=ABSKIND[ABS.ask.kind];lines.push('"'+kk[1]+'" гэж хүсэлт илгээх үү? Шалтгаанаа бичнэ үү.');
      var ta=h('textarea',{id:'aw-why',rows:'3',maxlength:'300','aria-label':'Шалтгаан','aria-describedby':'aw-hint',placeholder:kk[1]==='Өвчтэй'?'Жишээ нь: халуурч байгаа, эмчид үзүүлнэ':'Жишээ нь: гэр бүлээрээ хөдөө явна, тэмцээнд оролцоно'});
      if(typed!=null)ta.value=typed;
      var hint=h('small',{cls:'muted',id:'aw-hint',text:'Шалтгааныг зөвхөн Жак багш харна.'});
      form=h('div',{style:'display:flex;flex-direction:column;gap:6px'},[ta,hint]);
      acts.push(h('button',{type:'button',cls:'btn gold small','data-act':'yes',disabled:busy?'':null,text:busy?'Илгээж байна…':'Илгээх',onclick:function(){var why=ta.value.trim();
        if(why.length<2){ta.setAttribute('aria-invalid','true');hint.className='status err';hint.textContent='Шалтгаанаа бичнэ үү (2-оос дээш тэмдэгт).';ta.focus();return}
        absSend(d,ABS.ask.kind,why.slice(0,300))}}));
      acts.push(h('button',{type:'button',cls:'btn line small','data-act':'no',disabled:busy?'':null,text:'Болих',onclick:function(){ABS.ask=null;renderAway()}}))}
    else{lines.push('Ирж чадахгүй бол шалтгаанаа сонгоно уу.');
      ['sick','leave'].forEach(function(k){acts.push(h('button',{type:'button',cls:'btn line small','data-act':k,text:ABSKIND[k][2]+' '+ABSKIND[k][1],onclick:function(){ABS.ask={date:d.date,kind:k};ABS.msg=null;renderAway();var t=$('aw-why');if(t)t.focus()}}))})}
    W.appendChild(h('div',{cls:'acard aw-day'+(st?' '+st:''),'data-date':d.date},[h('h3',{style:'margin:0',text:absDay(d.date,today)})].concat(lines.map(function(t){return h('p',{cls:'muted',style:'margin:0',text:t})})).concat([form,acts.length?h('div',{cls:'chips'},acts):null])));
  });
  W.appendChild(h('div',{cls:'box',style:'padding:10px 14px'},[h('ul',{cls:'cues',style:'margin:0'},[
    'Өнөөдрийн хичээлд өглөө '+me.cutoff+' хүртэл хүсэлт илгээж болно. Түүнээс хойш бол Жак багшид шууд хэлээрэй.',
    'Жак багш баталсны дараа л ирцэд "Өвчтэй" эсвэл "Чөлөөтэй" гэж бичигдэнэ.',
    'Багш батлаагүй бөгөөд хичээлдээ ирээгүй бол "Тасалсан" гэж тооцогдоно.'].map(function(t){return h('li',{text:t})}))]));
  W.appendChild(h('div',{},[h('button',{type:'button',cls:'btn line small',text:'↻ Шинэчлэх',disabled:ABS.loading?'':null,onclick:function(){ABS.msg=null;absLoad()}})]));
}
/* home card for students */
function absHome(){var W=$('homeAway');if(!W)return;W.innerHTML='';if(!ME||MYROLE!=='student'||!absOn())return;
  W.appendChild(h('div',{cls:'acard home'},[h('span',{cls:'eyebrow',text:'Биеийн тамирын хичээл'}),h('h3',{style:'margin:0',text:'Хичээлдээ ирж чадахгүй юу?'}),
    h('p',{cls:'muted',style:'margin:0',text:'Өвдсөн эсвэл чөлөө авах бол шалтгаанаа бичээд урьдчилан хүсэлт илгээгээрэй. Багш баталбал ирцэд бичигдэнэ.'}),
    h('div',{},[h('button',{type:'button',cls:'btn gold small',text:'Хүсэлт илгээх',onclick:function(){show('away')}})])]))}

/* ---------- teacher side ---------- */
function absFor(email,date){email=String(email||'').toLowerCase();return ABS.all.filter(function(r){return r.email===email&&r.date===date})[0]||null}
/* Approve: the owner's own sheet call writes Ө/Ч (found by the student's email in the sheet, never by an ID the
   student sent), then the request is marked approved. Reject: only the request changes. */
function absDecide(r,ok,done){
  if(ABS.deciding[r.id])return;ABS.deciding[r.id]=1;paRefresh();
  var finish=function(err){delete ABS.deciding[r.id];if(err)PATT.msg={t:err,err:1};paRefresh();if(done)done(err)};
  if(!ok){db.doc('absreq/'+r.id).update({status:'no',decidedAt:Date.now()}).then(function(){finish()},function(){finish('Хадгалж чадсангүй. Дахин оролдоно уу.')});return}
  var code=r.kind==='leave'?'Ч':'Ө';
  var getTab=PATT.data[r.tab]?Promise.resolve(PATT.data[r.tab]):paCall({action:'read',tab:r.tab}).then(function(j){PATT.data[r.tab]=j;return j});
  getTab.then(function(j){
    var x=j.students.filter(function(s){return s.email===r.email})[0];
    if(!x)throw new Error('Sheet-ийн '+r.tab+' хуудсанд '+r.email+' имэйлтэй сурагч олдсонгүй.');
    if(j.dates.indexOf(r.date)<0)throw new Error('Sheet-д '+paMD(r.date)+'-ний багана алга.');
    return paCall({action:'mark',tab:r.tab,date:r.date,marks:[{id:x.id,code:code,req:true}]}).then(function(){x.m[r.date]=code;PATT.sumAt=0})})
  .then(function(){return db.doc('absreq/'+r.id).update({status:'ok',decidedAt:Date.now()})})
  .then(function(){finish()},function(e){finish(String(e&&e.message||'').indexOf('Sheet')===0?e.message:paErr(e))});
}
function absReqLine(r,withLink){
  var kn=(ABSKIND[r.kind]||ABSKIND.sick)[1],busy=!!ABS.deciding[r.id];
  var info=h('span',{cls:'muted',text:' · '+paMD(r.date)+' · '+kn+' · "'+r.reason+'"'+(absWhen(r.at)?' · илгээсэн '+absWhen(r.at):'')});
  var who=withLink?h('button',{type:'button',cls:'exlink',text:(r.name||r.email)+' · '+r.cls,onclick:function(){paOpen(r.tab+'|'+absKey(r),r.date);show('patt')}}):h('b',{text:'Хүсэлт'});
  var acts=r.status==='pending'?h('span',{cls:'chips',style:'display:inline-flex;gap:6px;margin-left:6px'},[
      h('button',{type:'button',cls:'btn gold small','data-act':'approve',disabled:busy?'':null,text:busy?'…':'✓ Батлах',onclick:function(){absDecide(r,true)}}),
      h('button',{type:'button',cls:'btn line small','data-act':'reject',disabled:busy?'':null,text:'✕ Татгалзах',onclick:function(){absDecide(r,false)}})])
    :h('span',{cls:'tag',text:r.status==='ok'?'✓ Баталсан':'✕ Батлаагүй'});
  return h('li',{cls:'aw-req','data-req':r.id},[who,info,acts]);
}
/* the class key (tab|class) the teacher pages use, from the request's label (11B → 11B, 6A on PE 6 → 6) */
function absKey(r){var c=((PATT.sum&&PATT.sum.classes)||[]).filter(function(k){return k.tab===r.tab&&paLabel(k)===r.cls})[0];return c?c.cls:r.cls}
/* teacher home: requests waiting for a decision */
function absTeachBox(sum){
  var on=(sum&&sum.absconf&&sum.absconf.on)||(ABS.conf&&ABS.conf.on);
  var wait=ABS.all.filter(function(r){return r.status==='pending'});
  if(!wait.length&&!on)return null;
  return h('div',{cls:'box',id:'awayBox'},[h('h3',{text:'Сурагчдын хүсэлт'+(wait.length?' ('+wait.length+' шинэ)':'')}),
    wait.length?h('ul',{cls:'cues'},wait.map(function(r){return absReqLine(r,true)}))
      :h('p',{cls:'muted',style:'margin:0',text:'Шинэ хүсэлт алга.'}),
    h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Батлахад Sheet-д Ө (Өвчтэй) эсвэл Ч (Чөлөөтэй) бичигдэнэ. Батлаагүй сурагч ирээгүй бол "Бүгд ирсэн болгох" Т (Тасалсан) тавина.'})]);
}
/* owner settings: switch on/off, cut-off time, how far ahead */
function absSettings(){
  var cur=(PATT.sum&&PATT.sum.absconf)||ABS.conf||{on:false,cutoff:'08:30',ahead:21};
  var st=h('p',{cls:'status',role:'status',id:'abs-st'});
  var on=h('input',{type:'checkbox',id:'abs-on'});on.checked=!!cur.on;
  var cut=h('input',{type:'time',id:'abs-cut',step:'60'});cut.value=cur.cutoff||'08:30';
  var ah=h('select',{id:'abs-ahead'},[7,14,21,28].map(function(n){return h('option',{value:String(n),text:n+' хоног'})}));ah.value=String(cur.ahead||21);
  return h('details',{cls:'crdet',id:'abs-set'},[h('summary',{text:'Сурагчийн урьдчилсан хүсэлт: '+(cur.on?'нээлттэй · '+cur.cutoff+' · '+cur.ahead+' хоног':'хаалттай')}),
    h('p',{style:'margin:0',text:'Нээлттэй үед сурагч "Миний хэсэг → Ирэхгүй гэж мэдэгдэх"-ээс өөрийн ойрын хичээлийг сонгоод "Өвчтэй" эсвэл "Чөлөөтэй" гэж шалтгаанаа бичиж хүсэлт илгээнэ.'}),
    h('ul',{cls:'cues'},['Хүсэлт Sheet рүү шууд орохгүй. Та "Батлах" дарвал Ө эсвэл Ч бичигдэнэ.','Батлаагүй сурагч ирээгүй бол "Бүгд ирсэн болгох" түүнийг Т (Тасалсан) болгоно.','Сурагчийн бичсэн шалтгааныг зөвхөн та болон тухайн сурагч харна. Sheet рүү орохгүй.','Хичээлийн өдрийг Sheet-ийн сүүлийн 3 долоо хоногийн ирцээс автоматаар олно.'].map(function(t){return h('li',{text:t})})),
    h('label',{cls:'ff',for:'abs-on',style:'flex-direction:row;align-items:center;gap:8px'},[on,'Сурагчид урьдчилан хүсэлт илгээж болно']),
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
