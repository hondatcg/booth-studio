import {bounds,dimensionGeometry} from './model.mjs';
const views=[{id:'top',name:'平面図（通路が下）',layer:'PLAN',project:([x,y,z])=>[x,z],bw:b=>b.w,bh:b=>b.d},{id:'front',name:'正面図（通路側から）',layer:'FRONT',project:([x,y,z])=>[x,y],bw:b=>b.w,bh:b=>b.h},{id:'side',name:'右側面図',layer:'RIGHT',project:([x,y,z])=>[z,y],bw:b=>b.d,bh:b=>b.h}];
const edgePairs=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
export function partEdges(item,part){
 const b=bounds(item.parts),a=item.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const point=(x,y,z)=>{x=x-b.lo[0]-b.w/2;z=z-b.lo[2]-b.d/2;return [item.x+b.w/2+x*c-z*s,item.y+y-b.lo[1],item.z+b.d/2+x*s+z*c];};
 if(part.shape==='cylinder'){
  const ring=y=>Array.from({length:32},(_,k)=>{const t=k/32*Math.PI*2;return point(part.x+part.w/2+Math.cos(t)*part.w/2,y,part.z+part.d/2+Math.sin(t)*part.d/2);}),lo=ring(part.y),hi=ring(part.y+part.h);
  return lo.flatMap((p,k)=>[[p,lo[(k+1)%32]],[hi[k],hi[(k+1)%32]],...(k%8===0?[[p,hi[k]]]:[])]);
 }
 const vs=[[0,0,0],[1,0,0],[1,0,1],[0,0,1],[0,1,0],[1,1,0],[1,1,1],[0,1,1]].map(([x,y,z])=>point(part.x+x*part.w,part.y+y*part.h,part.z+z*part.d));
 return edgePairs.map(([i,j])=>[vs[i],vs[j]]);
}
export function buildDrawing(state,id){
 const v=views.find(v=>v.id===id),b=state.booth,lines=[],texts=[];
 const line=(a,c,layer='ITEMS')=>{const p=v.project(a),q=v.project(c);if(Math.hypot(p[0]-q[0],p[1]-q[1])>.01)lines.push({a:p,b:q,layer});};
 const wall=(x,z,w,d)=>{const fake={x,z,y:0,angle:0,parts:[{x:0,y:0,z:0,w,d,h:b.h,shape:'box'}]};for(const [p,q] of partEdges(fake,fake.parts[0]))line(p,q,'WALLS');};
 if(b.back)wall(0,b.d,b.w,45);if(b.left)wall(-45,0,45,b.d);if(b.right)wall(b.w,0,45,b.d);
 const base=[[0,0],[v.bw(b),0],[v.bw(b),v.bh(b)],[0,v.bh(b)]];base.forEach((p,n)=>lines.push({a:p,b:base[(n+1)%4],layer:'BOOTH'}));
 state.items.forEach((item,n)=>{
  for(const part of item.parts)for(const [p,q] of partEdges(item,part))line(p,q,'ITEMS');
  const box=bounds(item.parts),p=v.project([item.x+box.w/2,item.y+box.h/2,item.z+box.d/2]);texts.push({p,text:String(n+1),layer:'NUMBERS'});
 });
 const dim=(a,c,offset)=>{
  const horizontal=Math.abs(a[1]-c[1])<.01,p=horizontal?[a[0],a[1]+offset]:[a[0]+offset,a[1]],q=horizontal?[c[0],p[1]]:[p[0],c[1]];
  for(const [x,y] of [[a,p],[c,q],[p,q]])lines.push({a:x,b:y,layer:'DIMENSIONS'});
  const tick=45;for(const end of [p,q])lines.push({a:[end[0]-tick,end[1]-tick],b:[end[0]+tick,end[1]+tick],layer:'DIMENSIONS'});
  texts.push({p:[(p[0]+q[0])/2+(!horizontal?110:0),(p[1]+q[1])/2+(horizontal?100:0)],text:String(Math.round(Math.hypot(a[0]-c[0],a[1]-c[1]))),layer:'DIMENSIONS'});
 };
 const extent=Math.max(v.bw(b),v.bh(b)),offset=Math.max(230,extent*.08);
 dim([0,0],[v.bw(b),0],-offset);dim([v.bw(b),0],[v.bw(b),v.bh(b)],offset);
 if(id==='top')for(const d of state.dimensions||[]){const g=dimensionGeometry(d,state);if(!g)continue;const p=v.project(g.p),q=v.project(g.q);for(const [a,c] of [[g.a,g.p],[g.b,g.q],[g.p,g.q]])line(a,c,'DIMENSIONS');texts.push({p:[(p[0]+q[0])/2,(p[1]+q[1])/2+90],text:String(Math.round(g.value)),layer:'DIMENSIONS'});}
 const pts=lines.flatMap(l=>[l.a,l.b]).concat(texts.map(t=>t.p));
 return {...v,lines,texts,minX:Math.min(...pts.map(p=>p[0]))-120,maxX:Math.max(...pts.map(p=>p[0]))+120,minY:Math.min(...pts.map(p=>p[1]))-120,maxY:Math.max(...pts.map(p=>p[1]))+120};
}
export function makeDxf(state){
 let handle=16;const handleTypes=new Set(['TABLE','LTYPE','LAYER','LINE','TEXT']);const out=[],pair=(code,value)=>{out.push(String(code),String(value));if(code===0&&handleTypes.has(value))out.push('5',(handle++).toString(16).toUpperCase());},layers=['BOOTH','WALLS','ITEMS','DIMENSIONS','NUMBERS','NOTES'];
 const text=s=>String(s).replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));
 const txt=(x,y,value,height=75,layer='NOTES')=>{pair(0,'TEXT');pair(100,'AcDbEntity');pair(8,layer);pair(100,'AcDbText');pair(10,x);pair(20,y);pair(30,0);pair(40,height);pair(1,text(value));pair(7,'STANDARD');};
 pair(0,'SECTION');pair(2,'HEADER');pair(9,'$ACADVER');pair(1,'AC1015');pair(9,'$INSUNITS');pair(70,4);pair(9,'$MEASUREMENT');pair(70,1);pair(9,'$DWGCODEPAGE');pair(3,'ANSI_1252');pair(0,'ENDSEC');
 pair(0,'SECTION');pair(2,'TABLES');pair(0,'TABLE');pair(2,'LTYPE');pair(100,'AcDbSymbolTable');pair(70,1);pair(0,'LTYPE');pair(100,'AcDbSymbolTableRecord');pair(100,'AcDbLinetypeTableRecord');pair(2,'CONTINUOUS');pair(70,0);pair(3,'Solid line');pair(72,65);pair(73,0);pair(40,0);pair(0,'ENDTAB');
 pair(0,'TABLE');pair(2,'LAYER');pair(100,'AcDbSymbolTable');pair(70,layers.length);layers.forEach((name,n)=>{pair(0,'LAYER');pair(100,'AcDbSymbolTableRecord');pair(100,'AcDbLayerTableRecord');pair(2,name);pair(70,0);pair(62,[7,8,7,3,1,7][n]);pair(6,'CONTINUOUS');});pair(0,'ENDTAB');pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'ENTITIES');
 let origin=0,maxHeight=0;
 for(const v of views){const d=buildDrawing(state,v.id),dx=origin-d.minX,dy=-d.minY;
  txt(origin,dy+d.maxY+200,v.name,110);
  for(const l of d.lines){pair(0,'LINE');pair(100,'AcDbEntity');pair(8,l.layer);pair(100,'AcDbLine');pair(10,l.a[0]+dx);pair(20,l.a[1]+dy);pair(30,0);pair(11,l.b[0]+dx);pair(21,l.b[1]+dy);pair(31,0);}
  for(const t of d.texts)txt(t.p[0]+dx,t.p[1]+dy,t.text,70,t.layer);
  origin+=d.maxX-d.minX+1000;maxHeight=Math.max(maxHeight,dy+d.maxY);
 }
 txt(0,-300,'Booth Studio / mm / 配置検討図・全パーツの外形線を表示',100);
 state.items.forEach((i,n)=>{const b=bounds(i.parts);txt(0,-500-n*130,`${n+1}. ${i.name}  W${Math.round(b.w)} x D${Math.round(b.d)} x H${Math.round(b.h)} mm`,85);});
 pair(0,'ENDSEC');pair(0,'EOF');return out.join('\r\n')+'\r\n';
}
function japanese(pdf,text,x,y,width=80,size=3){
 const c=document.createElement('canvas'),ctx=c.getContext('2d');ctx.font='24px sans-serif';c.width=Math.ceil(ctx.measureText(text).width)+8;c.height=36;ctx.font='24px sans-serif';ctx.fillStyle='#263c3e';ctx.fillText(text,4,27);
 const h=size*1.5,w=Math.min(width,c.width/c.height*h);pdf.addImage(c.toDataURL('image/png'),'PNG',x,y-h*.75,w,h);
}
export function makeDrawingPdf(state,{paper='a3',scale='auto'}={}){
 const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:paper,compress:true}),W=pdf.internal.pageSize.getWidth(),H=pdf.internal.pageSize.getHeight(),margin=12,gap=10,cellW=(W-margin*2-gap)/2,cellH=(H-40-gap)/2;
 japanese(pdf,'Booth Studio｜三面図・配置検討図',margin,12,200,5);
 japanese(pdf,'単位：mm ／ 全パーツの外形線を表示。施工仕様・現物寸法は別途確認してください。',margin,20,W-24,2.6);
 const drawings=views.map(v=>buildDrawing(state,v.id)),fit=Math.min(...drawings.map(d=>Math.min((cellW-16)/(d.maxX-d.minX),(cellH-17)/(d.maxY-d.minY))));
 const ratio=scale==='auto'?fit:1/Number(scale);
 if(ratio>fit+.00001)throw Error('指定した縮尺では用紙に収まりません。自動または小さい縮尺を選んでください。');
 drawings.forEach((d,n)=>{
  const left=margin+(n%2)*(cellW+gap),top=28+Math.floor(n/2)*(cellH+gap),dx=left+(cellW-(d.maxX-d.minX)*ratio)/2-d.minX*ratio,dy=top+15+(cellH-17+(d.maxY-d.minY)*ratio)/2+d.minY*ratio;
  pdf.setDrawColor(215,225,220);pdf.setLineWidth(.15);pdf.rect(left,top,cellW,cellH);
  japanese(pdf,d.name,left+4,top+7,cellW-8,3.2);pdf.setFontSize(7);pdf.setTextColor(90);pdf.text(`1:${(1/ratio).toFixed(1)} / mm`,left+cellW-5,top+7,{align:'right'});
  for(const l of d.lines){pdf.setDrawColor(...(l.layer==='DIMENSIONS'?[35,125,105]:l.layer==='WALLS'?[145,157,151]:[47,63,60]));pdf.setLineWidth(l.layer==='BOOTH'?.3:.13);pdf.line(dx+l.a[0]*ratio,dy-l.a[1]*ratio,dx+l.b[0]*ratio,dy-l.b[1]*ratio);}
  pdf.setTextColor(30,90,75);pdf.setFontSize(7);for(const t of d.texts)pdf.text(t.text,dx+t.p[0]*ratio,dy-t.p[1]*ratio,{align:'center'});
 });
 const left=margin+cellW+gap,top=28+cellH+gap;
 japanese(pdf,'配置物一覧｜幅 × 奥行き × 高さ（mm）',left+4,top+7,cellW-8,3.2);
 let y=top+16;const rowHeight=7;let page=1;
 state.items.forEach((i,n)=>{if(y>H-15){pdf.addPage();page++;y=20;japanese(pdf,'配置物一覧（続き）',margin,y,180,4);y+=12;}
  const x=page===1?left+4:margin,b=bounds(i.parts);japanese(pdf,`${n+1}. ${i.name}`,x,y,page===1?cellW*.55:160,2.8);pdf.setFontSize(8);pdf.setTextColor(40,65,58);pdf.text(`${Math.round(b.w)} x ${Math.round(b.d)} x ${Math.round(b.h)}`,page===1?left+cellW-3:W-margin,y,{align:'right'});y+=rowHeight;});
 pdf.setProperties({title:'Booth Studio - Orthographic Drawings',creator:'Booth Studio'});return pdf.output('blob');
}
export function makeDrawingPreview(state){
 const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=1060;const c=canvas.getContext('2d');
 c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#263c3e';c.font='bold 24px sans-serif';c.fillText('Booth Studio｜三面図・配置検討図',35,40);c.font='14px sans-serif';c.fillText('単位：mm ／ 全パーツの外形線を表示',35,65);
 views.forEach((v,n)=>{const d=buildDrawing(state,v.id),left=35+(n%2)*735,top=90+Math.floor(n/2)*470,w=695,h=435,r=Math.min((w-40)/(d.maxX-d.minX),(h-60)/(d.maxY-d.minY)),dx=left+(w-(d.maxX-d.minX)*r)/2-d.minX*r,dy=top+45+(h-60+(d.maxY-d.minY)*r)/2+d.minY*r;
  c.strokeStyle='#d9e2dd';c.lineWidth=1;c.strokeRect(left,top,w,h);c.fillStyle='#263c3e';c.font='bold 18px sans-serif';c.fillText(v.name,left+14,top+25);
  for(const l of d.lines){c.strokeStyle=l.layer==='DIMENSIONS'?'#14776c':l.layer==='WALLS'?'#8c9e95':'#30483f';c.lineWidth=l.layer==='BOOTH'?1.4:.8;c.beginPath();c.moveTo(dx+l.a[0]*r,dy-l.a[1]*r);c.lineTo(dx+l.b[0]*r,dy-l.b[1]*r);c.stroke();}
  c.font='13px sans-serif';c.fillStyle='#14776c';c.textAlign='center';for(const t of d.texts)c.fillText(t.text,dx+t.p[0]*r,dy-t.p[1]*r);c.textAlign='left';
 });
 c.fillStyle='#263c3e';c.font='bold 18px sans-serif';c.fillText('配置物一覧（幅 × 奥行き × 高さ / mm）',785,585);c.font='15px sans-serif';state.items.slice(0,13).forEach((i,n)=>{const b=bounds(i.parts);c.fillText(`${n+1}. ${i.name}`,785,620+n*27,320);c.fillText(`${Math.round(b.w)} × ${Math.round(b.d)} × ${Math.round(b.h)}`,1130,620+n*27);});if(state.items.length>13)c.fillText('ほか '+(state.items.length-13)+' 点（PDFに全件掲載）',785,1000);
 return canvas.toDataURL('image/png');
}
