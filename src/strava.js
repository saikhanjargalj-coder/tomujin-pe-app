/* ---------- Strava ----------
   1. "Миний Strava": every student connects THEIR OWN Strava and sees only THEIR OWN activities (last 30 days).
      Nobody else sees them: not the teacher, not classmates. Strava's rules require this.
      A student can put one of their activities into the training log with one tap; the minutes are filled in
      from Strava, the rest (how hard, how the body feels) the student chooses. Only that log entry reaches the teacher.
      The server part is strava-fn/ (Cloud Functions). Switched on by STRAVA_ON in config.js (see STRAVA.md).
   2. Tomujin PE club on Strava and 3. Coach Jack's training: links and Strava's own embed codes, which only
      the owner sets (site/strava). Anything pasted is checked: only Strava addresses are shown, never raw HTML. */
var STV={link:null,linkLoaded:false,items:null,at:0,loading:false,err:'',msg:null,busy:''};
var STVERR={'not-linked':'Strava холболт салсан байна. Дахин холбоно уу.','busy':'Strava одоо завгүй байна. Хэдэн минутын дараа дахин оролдоно уу.',
  'strava':'Strava-аас мэдээлэл авч чадсангүй. Дараа дахин оролдоно уу.','bad-token':'Нэвтрэлт хүчингүй боллоо. Гараад дахин нэвтэрнэ үү.',
  'not-allowed':'Strava-г сургуулийн имэйлтэй сурагчид холбоно.','off':'Strava холболт одоогоор хаалттай байна.'};
var STVBACK={ok:['✓ Strava холбогдлоо. Таны сүүлийн бэлтгэлүүд доор гарна.',false],denied:['Strava дээр "Зөвшөөрөх" дараагүй тул холбогдсонгүй. Дахин оролдож болно.',true],
  scope:['Strava дээр "бэлтгэлүүдээ харуулах" зөвшөөрлийг чагталгүй орхисон байна. Дахин холбохдоо тэр нүдийг чагтлаарай.',true],
  expired:['Холбох хугацаа дууссан. "Strava-аар холбох" товчийг дахин дарна уу.',true],
  full:['Одоогоор Strava холболтын суудал дүүрсэн байна (Strava-гийн хязгаар). Жак багшид хэлээрэй.',true],fail:['Strava-тай холбогдож чадсангүй. Дахин оролдоно уу.',true]};
var STVSPORT={Run:'Гүйлт',TrailRun:'Уулын гүйлт',VirtualRun:'Гүйлтийн зам',Walk:'Алхалт',Hike:'Явган аялал',Ride:'Дугуй',MountainBikeRide:'Уулын дугуй',GravelRide:'Дугуй (шороон зам)',
  EBikeRide:'Цахилгаан дугуй',VirtualRide:'Суурин дугуй',Swim:'Усанд сэлэлт',WeightTraining:'Хүчний бэлтгэл',Workout:'Дасгал',Crossfit:'Кроссфит',HighIntensityIntervalTraining:'HIIT',
  Yoga:'Иога',Pilates:'Пилатес',Elliptical:'Эллипс',StairStepper:'Шат',Rowing:'Сэлүүр',VirtualRow:'Сэлүүрийн машин',Soccer:'Хөл бөмбөг',Basketball:'Сагсан бөмбөг',Volleyball:'Волейбол',
  Tennis:'Теннис',TableTennis:'Ширээний теннис',Badminton:'Бадминтон',Pickleball:'Пиклбол',Squash:'Сквош',Padel:'Падел',AlpineSki:'Цанаар гулгах',NordicSki:'Цанын гүйлт',BackcountrySki:'Уулын цана',
  Snowboard:'Сноуборд',IceSkate:'Тэшүүр',InlineSkate:'Дугуйт тэшүүр',Skateboard:'Скейтборд',RockClimbing:'Хаданд авирах',Golf:'Гольф',Dance:'Бүжиг',Boxing:'Бокс',MartialArts:'Тулааны урлаг'};
function stvOn(){return !!(window.TPE&&(TPE.strava||(window.TPE_CONFIG&&TPE_CONFIG.STRAVA_ON&&TPE.configured)))}
function stvBase(){var C=window.TPE_CONFIG||{};return C.STRAVA_URL||('https://asia-east1-'+((C.firebase&&C.firebase.projectId)||'')+'.cloudfunctions.net/strava')}
function stvCall(path,body){
  if(window.TPE&&TPE.strava)return TPE.strava(path,body||{});   // preview: made-up activities
  if(!stvOn())return Promise.reject(new Error('off'));
  return TPE.idToken().then(function(t){return fetch(stvBase()+path,{method:'POST',headers:{'Authorization':'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body||{})})})
    .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.error||'strava');return j})});
}
function stvErr(e){var c=String((e&&e.message)||e||'');return STVERR[c]||'Холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.'}
function stvStart(){
  if(!db||!ME||!stvOn())return;
  unsubs.push(db.doc('users/'+ME.uid+'/strava/link').onSnapshot(function(d){var was=!!(STV.link&&STV.link.on);STV.link=d.exists?d.data():null;STV.linkLoaded=true;
    if(!(STV.link&&STV.link.on)){STV.items=null;STV.at=0}else if(!was){STV.items=null;STV.at=0}
    stvRefreshViews()},function(){STV.linkLoaded=true;stvRefreshViews()}));
}
function stvStop(){STV.link=null;STV.linkLoaded=false;STV.items=null;STV.at=0;STV.loading=false;STV.err='';STV.busy=''}
function stvLinked(){return !!(STV.link&&STV.link.on)}
/* The log page keeps what the student typed when it is redrawn, so it is always kept up to date (no stale picker). */
function stvRefreshViews(){if($('v-strava')&&!$('v-strava').hidden)renderStrava();if(typeof renderLog==='function')renderLog()}
/* Strava is only asked when the student opens a page that shows it. */
function stvOnShow(v){if(v==='strava')renderStrava();else if(v==='log'&&stvLinked()&&STV.items==null)renderLog()}
function stvLoad(force){
  if(!stvLinked()||STV.loading)return;
  STV.loading=true;STV.err='';stvRefreshViews();
  stvCall('/activities',{force:!!force}).then(function(j){STV.items=j.items||[];STV.at=j.at||Date.now();STV.loading=false;stvRefreshViews()},
    function(e){STV.loading=false;STV.err=stvErr(e);stvRefreshViews()});
}
function stvNeedLoad(){if(stvLinked()&&STV.items==null&&!STV.loading&&!STV.err)stvLoad(false)}
function stvConnect(){
  STV.busy='connect';STV.msg=null;renderStrava();
  stvCall('/start',{origin:location.origin}).then(function(j){
    if(j.url&&/^https:\/\/www\.strava\.com\/oauth\/authorize\?/.test(j.url)){location.assign(j.url);return}
    STV.busy='';if(j.linked){STV.msg=STVBACK.ok}renderStrava()},
    function(e){STV.busy='';STV.msg=[stvErr(e),true];renderStrava()});
}
function stvDisconnect(){
  STV.busy='off';renderStrava();
  stvCall('/disconnect',{}).then(function(){STV.busy='';STV.items=null;STV.at=0;STV.msg=['Strava салгагдлаа. Таны Strava-ийн мэдээлэл энэ сайтад үлдээгүй.',false];renderStrava()},
    function(e){STV.busy='';STV.msg=[stvErr(e),true];renderStrava()});
}
/* back from Strava's sign-in page: /?strava=ok#strava */
(function(){try{var q=new URLSearchParams(location.search),r=q.get('strava');if(!r)return;STV.msg=STVBACK[r]||STVBACK.fail;
  q.delete('strava');var s=q.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:'')+(location.hash||'#strava'))}catch(e){}})();

/* ---------- formatting ---------- */
function stvSport(s){return STVSPORT[s]||s||'Бэлтгэл'}
function stvMin(x){return Math.max(1,Math.round((x.mv||x.el||0)/60))}
function stvKm(m){return m>=100?(m/1000).toFixed(m>=10000?1:2).replace(/\.?0+$/,'')+' км':''}
function stvPace(x){if(!(x.d>=500)||!/Run|Walk|Hike/.test(x.sp))return '';var s=x.mv/(x.d/1000);if(!isFinite(s)||s<=0)return '';return Math.floor(s/60)+':'+('0'+Math.round(s%60)).slice(-2)+' /км'}
function stvUrl(id){return 'https://www.strava.com/activities/'+id}
/* A log entry keeps only a link to the student's own activity, in one fixed form. */
function stvNorm(u){u=String(u||'').trim();if(!u)return '';var m=/^https?:\/\/(?:www\.)?strava\.com\/activities\/(\d{1,20})(?:[/?#].*)?$/i.exec(u);if(m)return stvUrl(m[1]);
  m=/^https?:\/\/strava\.app\.link\/([A-Za-z0-9_-]{1,40})\/?$/i.exec(u);if(m)return 'https://strava.app.link/'+m[1];return null}
function stvLogged(id){var u=stvUrl(id);return MYLOADS.some(function(x){return x.strava===u})}
function stvView(u,txt){return h('a',{cls:'stvlink',href:u,target:'_blank',rel:'noopener',text:txt||'Strava-д харах ↗'})}
function stvLogLink(x){return x&&x.strava?stvView(x.strava,'↗'):null}

/* pick an activity for the training log */
var LOGSTV=null; // {id,n,sp,min,t}
function stvToLog(x){LOGSTV={id:x.id,n:x.n,sp:x.sp,min:stvMin(x),t:x.t};LOGMSG=null;var e=$('lf-min');if(e)e.value='';renderLog();show('log');
  setTimeout(function(){var e=$('lf-min');if(e&&!e.value)e.value=String(LOGSTV?LOGSTV.min:'');var r=$('lf-rpe');if(r)r.focus()},0)}

function stvActRow(x,compact){
  var bits=[stvKm(x.d),stvPace(x),x.hr?'♥ '+x.hr:''].filter(Boolean);
  var done=stvLogged(x.id);
  return h('div',{cls:'stvact'},[
    h('div',{cls:'stvwhen'},[h('b',{text:ubDay(x.t)}),h('small',{text:ubWeekday(x.t)})]),
    h('div',{cls:'stvmain'},[h('span',{cls:'stvsport',text:stvSport(x.sp)}),h('b',{cls:'stvname',text:x.n||stvSport(x.sp)}),
      h('span',{cls:'stvnums'},[h('b',{text:stvMin(x)+' мин'})].concat(bits.map(function(t){return h('span',{text:t})}))),
      compact?null:stvView(stvUrl(x.id))]),
    h('div',{cls:'stvdo'},[done?h('span',{cls:'tag k-ok',text:'✓ Тэмдэглэлд орсон'}):h('button',{type:'button',cls:'btn gold small',text:'Тэмдэглэлд оруулах',onclick:function(){stvToLog(x)}})])]);
}
function ubWeekday(ms){return ['Ням','Даваа','Мягмар','Лхагва','Пүрэв','Баасан','Бямба'][ubD(ms).getUTCDay()]}

/* ---------- the page ---------- */
function renderStrava(){
  var W=$('stravaOut');if(!W)return;W.innerHTML='';
  W.appendChild(stvMine());
  var S=(SITE&&SITE.strava)||{};
  var club=stvClubBox(S),coach=stvCoachBox(S);
  if(club)W.appendChild(club);if(coach)W.appendChild(coach);
  if(canEdit&&editMode)W.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold small',text:'✎ Клуб ба багшийн Strava-г засах',onclick:stvEditor})]));
  stvScript();
}
function stvMsgEl(){if(!STV.msg)return null;return h('p',{cls:'status'+(STV.msg[1]?' err':''),role:'status',text:STV.msg[0]})}
function stvMine(){
  var box=h('div',{cls:'box stvbox'},[h('h3',{text:'Миний Strava'})]);
  if(!stvOn()){box.appendChild(h('p',{cls:'muted',text:'Strava холболт удахгүй нээгдэнэ. Нээгдмэгц энд өөрийн Strava-гаа холбож, гүйлт, дугуй, бэлтгэлүүдээ харна.'}));
    if(canEdit)box.appendChild(h('p',{cls:'muted',style:'font-size:13px',text:'Админ: асаах заавар GitHub дээрх STRAVA.md файлд байна (Strava API апп, Firebase Blaze, 2 secret, config.js-д STRAVA_ON: true).'}));return box}
  if(!ME||!AUTHED){box.appendChild(h('p',{cls:'muted',text:'Сургуулийн имэйлээрээ нэвтэрч орсны дараа өөрийн Strava-гаа холбоно.'}));return box}
  var m=stvMsgEl();
  if(!STV.linkLoaded){box.appendChild(h('p',{cls:'muted',role:'status',text:'Ачаалж байна…'}));return box}
  if(!stvLinked()){
    if(m)box.appendChild(m);
    box.appendChild(h('p',{text:'Strava-гаа холбовол сүүлийн 30 хоногийн гүйлт, дугуй, бэлтгэлүүд чинь энд гарна. Аль нэгийг нь нэг товчоор бэлтгэлийн тэмдэглэлдээ оруулж болно.'}));
    box.appendChild(h('ul',{cls:'stvrules'},[
      h('li',{text:'Зөвхөн чи өөрөө харна. Багш, ангийнхан чинь таны Strava-г харахгүй. Багш зөвхөн чиний тэмдэглэлд оруулсан бэлтгэлийг харна.'}),
      h('li',{text:'Газрын зураг, байршил энд хэзээ ч гарахгүй, хадгалагдахгүй.'}),
      h('li',{text:'Хүссэн үедээ "Салгах" дарж холболтоо устгана.'}),
      h('li',{text:'Strava 13-аас дээш насныханд зориулагдсан. Strava дээрээ "Privacy zone" тохируулж, гэрийнхээ байршлыг нуугаарай.'})]));
    box.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn stvbtn',text:STV.busy==='connect'?'Strava руу шилжиж байна…':'Strava-аар холбох',disabled:STV.busy?'':null,onclick:stvConnect})]));
    box.appendChild(h('p',{cls:'stvpow',text:'Powered by Strava'}));
    return box;
  }
  stvNeedLoad();
  box.appendChild(h('div',{cls:'stvhead'},[h('span',{cls:'tag k-ok',text:'✓ Strava холбогдсон'}),
    h('button',{type:'button',cls:'btn line small',text:STV.loading?'Шинэчилж байна…':'↻ Шинэчлэх',disabled:STV.loading?'':null,onclick:function(){stvLoad(true)}}),
    h('button',{type:'button',cls:'btn line small',text:STV.busy==='off'?'Салгаж байна…':'Салгах',disabled:STV.busy?'':null,onclick:function(){stvAskOff(box)}})]));
  if(m)box.appendChild(m);
  if(STV.err)box.appendChild(h('p',{cls:'status err',role:'status',text:STV.err}));
  if(STV.items==null){box.appendChild(h('p',{cls:'muted',role:'status',text:STV.loading?'Strava-аас таны бэлтгэлүүдийг авч байна…':''}));return box}
  var L=STV.items,wk=weekKey(Date.now()),thisWk=L.filter(function(x){return weekKey(x.t)===wk});
  box.appendChild(h('div',{cls:'big3'},[kpi(String(thisWk.reduce(function(a,x){return a+stvMin(x)},0)),'Энэ долоо хоногт хөдөлсөн минут','Strava-аас',true),
    kpi(String(thisWk.length),'Энэ долоо хоногийн бэлтгэл',''),kpi((thisWk.reduce(function(a,x){return a+x.d},0)/1000).toFixed(1),'Энэ долоо хоногийн км','гүйлт, алхалт, дугуй')]));
  if(!L.length)box.appendChild(h('p',{cls:'muted',text:'Сүүлийн 30 хоногт Strava дээр бэлтгэл алга. Дараагийн гүйлт, бэлтгэлээ Strava-аар бичээд энд буцаж ирээрэй.'}));
  else box.appendChild(h('div',{cls:'stvlist'},L.map(function(x){return stvActRow(x,false)})));
  box.appendChild(h('p',{cls:'stvpow',text:'Powered by Strava · Сүүлийн 30 хоног · Зөвхөн танд харагдана'}));
  return box;
}
function stvAskOff(box){
  var st=h('p',{cls:'status err',role:'status'},['Strava-г салгах уу? Тэмдэглэлд оруулсан бэлтгэлүүд чинь хэвээр үлдэнэ. ',
    h('button',{type:'button',cls:'btn small danger-fill',text:'Тийм, салгах',onclick:stvDisconnect}),' ',h('button',{type:'button',cls:'btn line small',text:'Болих',onclick:function(){st.remove()}})]);
  var old=box.querySelector('.stvask');if(old)old.remove();st.classList.add('stvask');box.insertBefore(st,box.children[2]||null);
}
/* compact picker on the training log page */
function stvLogBox(){
  if(!stvOn()||!ME||!stvLinked())return null;
  if($('v-log')&&!$('v-log').hidden)stvNeedLoad();
  var box=h('div',{cls:'box stvbox'},[h('h3',{text:'Strava-аас оруулах'})]);
  if(STV.err){box.appendChild(h('p',{cls:'status err',text:STV.err}));return box}
  if(STV.items==null){box.appendChild(h('p',{cls:'muted',role:'status',text:STV.loading?'Strava-аас ачаалж байна…':''}));return box}
  var wk=Date.now()-7*864e5,L=STV.items.filter(function(x){return x.t>=wk&&!stvLogged(x.id)}).slice(0,3);
  if(!L.length){box.appendChild(h('p',{cls:'muted',style:'margin:0',text:'Сүүлийн 7 хоногийн Strava бэлтгэлүүд чинь бүгд тэмдэглэлд орсон байна.'}));return box}
  box.appendChild(h('p',{cls:'muted',style:'margin:0;font-size:13px',text:'Сүүлийн 7 хоног, тэмдэглэлд ороогүй. Сонговол минут нь бөглөгдөнө, бусдыг нь өөрөө сонгоно.'}));
  box.appendChild(h('div',{cls:'stvlist'},L.map(function(x){return stvActRow(x,true)})));
  box.appendChild(h('button',{type:'button',cls:'exlink',style:'align-self:flex-start',text:'Бүх Strava бэлтгэл →',onclick:function(){show('strava')}}));
  return box;
}

/* ---------- club and coach (owner sets them; everything pasted is checked) ---------- */
/* Strava's embed codes come in three shapes: an <iframe> (profile card, club feed), a placeholder <div>
   with strava-embeds.com/embed.js (activities, routes), or a plain link. Only Strava addresses get through. */
function stvEmbed(code){
  var s=String(code||'').trim();if(!s)return null;
  var ph=/data-embed-type\s*=\s*["'](activity|route)["']/i.exec(s),pid=/data-embed-id\s*=\s*["'](\d{1,20})["']/i.exec(s);
  if(ph&&pid){var tk=/data-token\s*=\s*["']([A-Za-z0-9_-]{1,80})["']/i.exec(s),sty=/data-style\s*=\s*["']([a-z_-]{1,20})["']/i.exec(s);
    return {k:'ph',type:ph[1].toLowerCase(),id:pid[1],token:tk?tk[1]:'',style:sty?sty[1]:'standard'}}
  var fm=/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(s);
  if(fm){var src=fm[1].replace(/&amp;/g,'&'),u;try{u=new URL(src)}catch(e){return null}
    var hm=/\sheight\s*=\s*["']?(\d{2,4})/i.exec(s);var ht=hm?Math.min(900,Math.max(120,+hm[1])):454;
    if(u.protocol==='https:'&&(/^(www\.)?strava\.com$/.test(u.hostname)&&/^\/(athletes|clubs)\//.test(u.pathname)||u.hostname==='strava-embeds.com'))return {k:'frame',src:u.href,h:ht};
    return null}
  var a=/^https:\/\/(?:www\.)?strava\.com\/activities\/(\d{1,20})(?:[/?#].*)?$/i.exec(s);if(a)return {k:'ph',type:'activity',id:a[1],token:'',style:'standard'};
  var r=/^https:\/\/(?:www\.)?strava\.com\/routes\/(\d{1,20})(?:[/?#].*)?$/i.exec(s);if(r)return {k:'ph',type:'route',id:r[1],token:'',style:'standard'};
  if(/^https:\/\/(?:www\.)?strava\.com\/(clubs|athletes)\/[A-Za-z0-9_-]{1,60}\/?$/i.test(s)||/^https:\/\/strava\.app\.link\/[A-Za-z0-9_-]{1,40}\/?$/i.test(s))return {k:'link',href:s};
  return null;
}
function stvEmbedEl(e,title){
  if(!e)return null;
  if(e.k==='frame')return h('iframe',{cls:'stvframe',src:e.src,title:title||'Strava',loading:'lazy',height:String(e.h),style:'height:'+e.h+'px',referrerpolicy:'strict-origin-when-cross-origin',
    sandbox:'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'});
  if(e.k==='ph')return h('div',{cls:'stvph'},[h('div',{cls:'strava-embed-placeholder','data-embed-type':e.type,'data-embed-id':e.id,'data-style':e.style||'standard','data-from-embed':'false','data-token':e.token||null}),
    stvView('https://www.strava.com/'+(e.type==='route'?'routes/':'activities/')+e.id)]);
  if(e.k==='link')return stvView(e.href,'Strava дээр нээх ↗');
  return null;
}
/* Strava's embed script turns placeholders into players. Run it again whenever new ones appear. */
function stvScript(){
  if(!document.querySelector('.strava-embed-placeholder'))return;
  var old=document.getElementById('stvjs');if(old)old.remove();
  var s=document.createElement('script');s.id='stvjs';s.src='https://strava-embeds.com/embed.js';s.async=true;document.body.appendChild(s);
}
function stvClubUrl(u){return /^https:\/\/(?:www\.)?strava\.com\/clubs\/[A-Za-z0-9_-]{1,60}\/?$/i.test(String(u||'').trim())?String(u).trim():''}
function stvClubBox(S){
  var c=S.club||{},url=stvClubUrl(c.url),em=stvEmbed(c.embed);
  if(!url&&!em)return null;
  return h('div',{cls:'box stvbox'},[h('h3',{text:(c.name||'Tomujin PE')+' · Strava клуб'}),
    h('p',{text:c.text||'Сургуулийнхаа Strava клубт нэгдэж, хамтдаа хөдөлцгөөе. Клубын сорилт (challenge), долоо хоногийн жагсаалт Strava дотор явагдана.'}),
    url?h('div',{cls:'editrow'},[h('a',{cls:'btn stvbtn',href:url,target:'_blank',rel:'noopener',text:'Клубт нэгдэх ↗'})]):null,
    em?stvEmbedEl(em,c.name||'Strava клуб'):null,
    h('p',{cls:'muted',style:'font-size:13px',text:'Клубын жагсаалтад зөвхөн "Everyone" гэж нээлттэй тавьсан бэлтгэл харагдана. Нээлттэй тавихын өмнө газрын зургаа нууцлах (Privacy zone) тохиргоогоо заавал хийгээрэй.'})]);
}
function stvCoachBox(S){
  var c=S.coach||{},prof=stvEmbed(c.profile),acts=lines(c.acts||'').map(stvEmbed).filter(function(e){return e&&e.k==='ph'}).slice(0,6);
  if(!prof&&!acts.length)return null;
  return h('div',{cls:'box stvbox'},[h('h3',{text:c.title||'Жак багшийн бэлтгэл'}),
    h('p',{text:c.text||'Багш маань ч өдөр бүр хөдөлдөг. Миний сүүлийн бэлтгэлүүд Strava-аас.'}),
    prof?stvEmbedEl(prof,'Жак багшийн Strava'):null,
    acts.length?h('div',{cls:'stvgrid'},acts.map(function(e){return stvEmbedEl(e,'Жак багшийн бэлтгэл')})):null]);
}
function stvEditor(){
  var S=(SITE&&SITE.strava)||{},c=S.club||{},k=S.coach||{};
  openSheet(function(p){
    $('sheetEyebrow').textContent='Strava';p.appendChild(h('h2',{id:'sheetTitle',text:'Клуб ба багшийн Strava'}));
    var st=h('p',{cls:'status',role:'status'});
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Tomujin PE Strava клуб'}),
      fText('sv-cname','Клубын нэр',c.name||'',{ph:'Tomujin PE'}),
      fText('sv-curl','Клубын холбоос','',{ph:'https://www.strava.com/clubs/…',help:'Strava → Groups → Clubs → өөрийн клуб → хаягийн мөрийг хуулна.'}),
      fText('sv-ctext','Тайлбар',c.text||'',{area:1,rows:2}),
      fText('sv-cemb','Клубын embed код (заавал биш)','',{area:1,rows:3,help:'strava.com дээр клубын хуудас → Share Club Activities → кодыг хуулж буулгана.'})]));
    p.appendChild(h('div',{cls:'box'},[h('h3',{text:'Багшийн Strava'}),
      fText('sv-ktitle','Гарчиг',k.title||'',{ph:'Жак багшийн бэлтгэл'}),
      fText('sv-ktext','Тайлбар',k.text||'',{area:1,rows:2}),
      fText('sv-kprof','Профайлын embed код','',{area:1,rows:3,help:'strava.com → профайл → Share your Activities → кодыг хуулна. Зөвхөн "Everyone" бэлтгэл харагдана.'}),
      fText('sv-kacts','Бэлтгэлийн холбоос эсвэл embed код (мөр бүрт нэг, 6 хүртэл)','',{area:1,rows:4,help:'strava.com → бэлтгэл → Share → Embed. Бэлтгэл болон профайл тань "Everyone" байх ёстой.'})]));
    $('sv-curl').value=c.url||'';$('sv-cemb').value=c.embed||'';$('sv-kprof').value=k.profile||'';$('sv-kacts').value=k.acts||'';
    p.appendChild(h('div',{cls:'editrow'},[h('button',{type:'button',cls:'btn gold',text:'Хадгалах',onclick:function(){
      var cu=val('sv-curl'),ce=$('sv-cemb').value.trim(),kp=$('sv-kprof').value.trim(),ka=$('sv-kacts').value.trim(),bad=[];
      if(cu&&!stvClubUrl(cu))bad.push('клубын холбоос (https://www.strava.com/clubs/… хэлбэртэй байна)');
      if(ce&&!stvEmbed(ce))bad.push('клубын embed код');if(kp&&!stvEmbed(kp))bad.push('профайлын embed код');
      lines(ka).forEach(function(x,i){var e=stvEmbed(x);if(!e||e.k!=='ph')bad.push((i+1)+'-р мөрийн бэлтгэлийн холбоос')});
      if(bad.length){st.className='status err';st.textContent='Strava-гийн биш эсвэл буруу: '+bad.join(', ')+'.';return}
      saveSite('strava',{club:{name:val('sv-cname'),url:cu,text:$('sv-ctext').value.trim(),embed:ce},coach:{title:val('sv-ktitle'),text:$('sv-ktext').value.trim(),profile:kp,acts:ka}},st).then(function(){renderStrava()},function(){})}}),st]));
  });
}
