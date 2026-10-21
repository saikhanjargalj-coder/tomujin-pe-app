/* pose math: pure functions */
var RAD=Math.PI/180;
function rawJoints(p){
  var t=p[0]*RAD,hip=[50,0];
  var dv=[Math.sin(t),-Math.cos(t)];
  var sh=[hip[0]+30*dv[0],hip[1]+30*dv[1]];
  var head=[sh[0]+11*dv[0],sh[1]+11*dv[1]];
  if(Math.abs(p[0])>=55)head[1]-=3;
  function seg(a,deg,len){var r=deg*RAD;return [a[0]+len*Math.sin(r),a[1]+len*Math.cos(r)]}
  var kA=seg(hip,p[1],23),fA=seg(kA,p[2],23),kB=seg(hip,p[3],23),fB=seg(kB,p[4],23);
  var eA=seg(sh,p[5],15),hA=seg(eA,p[6],14),eB=seg(sh,p[7],15),hB=seg(eB,p[8],14);
  return [head,sh,eA,hA,eB,hB,hip,kA,fA,kB,fB];
}
var JI={head:0,sh:1,eA:2,hA:3,eB:4,hB:5,hip:6,kA:7,fA:8,kB:9,fB:10};
function shift(J,dx,dy){return J.map(function(q){return [q[0]+dx,q[1]+dy]})}
function solvePoses(ex){
  var out=[];
  ex.ps.forEach(function(p,i){
    var J=rawJoints(p),dy;
    if(ex.gnd==='hip'){dy=97-J[6][1]}
    else{var m=-1e9;for(var k=1;k<11;k++)if(J[k][1]>m)m=J[k][1];dy=100-m}
    J=shift(J,(p[10]||0),dy-(p[9]||0));
    if(i>0&&ex.pin){var a=out[0][JI[ex.pin]],b=J[JI[ex.pin]];J=shift(J,a[0]-b[0],a[1]-b[1])}
    out.push(J);
  });
  return out;
}
if(typeof module!=='undefined')module.exports={rawJoints:rawJoints,solvePoses:solvePoses,JI:JI};
