import * as THREE from 'three';
import * as S from './nucleo/solar.js';
import { buscarIrradiacao, buscarCEP } from './nucleo/dados.js';
import * as E from './nucleo/eletrico.js';
import * as CAT from './nucleo/catalogo.js';
import * as PJ from './nucleo/projetos.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { lerConta, lerDatasheet } from './nucleo/dados.js';
import './estilo.css';

/* =========================================================================
   SIMULADOR DE MONTAGEM FOTOVOLTAICA v2 · Trinity Solaris Brasil
   Metros. +X leste · +Z sul · -Z norte · +Y zênite. Azimute: 0=N, horário.
   ========================================================================= */
const RAD = Math.PI/180;
const MOD = {L:2.465, W:1.134, T:0.030, Wp:620, kg:34.6};
const MODELOS = {
  '620': {n:'Jinko 620 N', wp:620, l:2465, w:1134, k:34.6},
  '585': {n:'Jinko 585 N', wp:585, l:2278, w:1134, k:32.0},
  '550': {n:'550 W mono', wp:550, l:2279, w:1134, k:28.6},
  '450': {n:'450 W mono', wp:450, l:2094, w:1038, k:24.5},
  '700': {n:'700 W bifac', wp:700, l:2384, w:1303, k:38.5}
};

const P = {
  tipo:'ceramica', aguas:2, comp:12, larg:8, pd:3, incl:18, azi:0,
  ori:'retrato', faces:new Set([0]), gu:0.02, gv:0.02, ou:0.3, ov:0.3, max:40, tilt:22,
  modWp:620, modL:2465, modW:1134, modK:34.6,
  casaX:0, casaZ:0,
  maxFace:{},
  inversor:'auto', moduloId:'jinko-620n', tMin:5, tMaxAmb:32,
  perdas:{sujeira:3, mismatch:2, cabeamento:1.5, reflexao:2.5, degradacao:0.5, indisponibilidade:0.5},
  beiral:0.5, beiralH:0.2, terreno:'grama', murH:0.4, murW:0.15,
  fix:'auto',
  lat:-23.32, lon:-46.58, tz:-3, dia:172, hora:12, hsp:4.6,
  verSombra:true, verRota:true, verNorte:true, verFix:true,
  mapa:false, mapaZ:20, mapaFonte:'esri', mapaT:6,
  hspMes:null, fonteHsp:null
};
function aplicarModulo(){
  MOD.L = P.modL/1000; MOD.W = P.modW/1000; MOD.Wp = P.modWp; MOD.kg = P.modK;
}
const PASSO = 0.05;              // deslocamento por toque nas setas
const oriFileira = {};           // "face:fileira" -> 'retrato' | 'paisagem'
const ajusteFileira = {};        // "face:fileira" -> {du, dv}
const fileirasFora = new Set();  // "face:fileira" removida inteira
const removidos  = new Set();    // "face:fileira:coluna"
let OBS = [], obsSel = -1, proxId = 1;

const TIPOS = {
  ceramica:    {n:'Telha cerâmica', fix:'gancho'},
  fibrocimento:{n:'Fibrocimento',   fix:'prisioneiro'},
  metalico:    {n:'Metálico',       fix:'minitrilho'},
  laje:        {n:'Laje',           fix:'triangulo'},
  solo:        {n:'Solo',           fix:'triangulo'}
};
const FIXES = {
  gancho:      'Gancho de aço inox para telha cerâmica — apoia na ripa, sem furar a telha.',
  prisioneiro: 'Parafuso prisioneiro com vedação EPDM — fixa na crista da onda.',
  minitrilho:  'Mini-trilho sobre a costela do telhado metálico.',
  triangulo:   'Triângulo com perfil reforçado — inclinação artificial sobre plano.'
};
const CAPITAIS = {AC:[-9.97,-67.81],AL:[-9.65,-35.71],AP:[0.03,-51.07],AM:[-3.12,-60.02],
  BA:[-12.97,-38.50],CE:[-3.73,-38.52],DF:[-15.78,-47.93],ES:[-20.32,-40.34],GO:[-16.68,-49.25],
  MA:[-2.53,-44.30],MT:[-15.60,-56.10],MS:[-20.44,-54.65],MG:[-19.92,-43.94],PA:[-1.46,-48.50],
  PB:[-7.12,-34.86],PR:[-25.43,-49.27],PE:[-8.05,-34.88],PI:[-5.09,-42.80],RJ:[-22.91,-43.20],
  RN:[-5.79,-35.21],RS:[-30.03,-51.23],RO:[-8.76,-63.90],RR:[2.82,-60.67],SC:[-27.59,-48.55],
  SP:[-23.55,-46.63],SE:[-10.91,-37.07],TO:[-10.18,-48.33]};

/* ===================== sol ===================== */
/* matemática solar vive em nucleo/solar.js — aqui só os atalhos com o estado P */
const solar = S.solar, vetorSol = S.vetorSol, normalPlano = S.normalPlano, AM_KY = S.AM_KY;

/* irradiação diária no plano (céu claro, Hottel simplificado) — kWh/m²·dia */
const irradDia = (dia,tilt,azi)=> S.irradDiaPlano(P.lat,P.lon,P.tz,dia,tilt,azi);

const cacheHSP = {}, cacheDia = {};
const DIAS_MES=[31,28,31,30,31,30,31,31,30,31,30,31];
const DIA_REP=[15,45,74,105,135,166,196,227,258,288,319,349];
const NOME_MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function irradDiaC(dia,tilt,azi){
  const k=`${P.lat.toFixed(2)}|${dia}|${tilt.toFixed(1)}|${azi.toFixed(1)}`;
  if(cacheDia[k]!==undefined) return cacheDia[k];
  return cacheDia[k]=irradDia(dia,tilt,azi);
}
function hspPlano(tilt, azi){
  const k = `${P.lat.toFixed(2)}|${tilt.toFixed(1)}|${azi.toFixed(1)}`;
  if(cacheHSP[k] !== undefined) return cacheHSP[k];
  return cacheHSP[k] = S.hspAnual(P.lat, P.lon, P.tz, tilt, azi);
}
function fatorPlano(tilt, azi){
  const ideal = hspPlano(Math.abs(P.lat), P.lat < 0 ? 0 : 180);
  return ideal > 0 ? hspPlano(tilt, azi)/ideal : 0;
}

/* ===================== cena ===================== */
const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.1, 1200);
const hemi = new THREE.HemisphereLight(0xcfe0f2, 0x2b3038, 0.6); scene.add(hemi);
const sol = new THREE.DirectionalLight(0xffffff, 1.6);
sol.castShadow = true; sol.shadow.mapSize.set(2048,2048);
sol.shadow.camera.near = 1; sol.shadow.bias = -0.0006;
scene.add(sol); scene.add(sol.target);

const matChao = new THREE.MeshStandardMaterial({roughness:1});
const chao = new THREE.Mesh(new THREE.CircleGeometry(260,64), matChao);
function aplicarTerreno(){
  const t = TEX[P.terreno].clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90,90); t.anisotropy = 8;
  if(matChao.map) matChao.map.dispose();
  matChao.map = t; matChao.color.set(0xffffff); matChao.needsUpdate = true;
}
chao.rotation.x = -Math.PI/2; chao.position.y = -0.01; chao.receiveShadow = true; scene.add(chao);
const grade = new THREE.GridHelper(260, 130, 0x2a333f, 0x1e252e);
scene.add(grade);

const gCasa    = new THREE.Group(); scene.add(gCasa);
const gModulos = new THREE.Group(); gCasa.add(gModulos);
const gFix     = new THREE.Group(); gCasa.add(gFix);
const gObs     = new THREE.Group(); scene.add(gObs);
const gAux     = new THREE.Group(); scene.add(gAux);

/* ===================== texturas e materiais ===================== */
function tex(w,h,pintar,rx,ry){
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  pintar(cv.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(cv);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx||1,ry||1); t.anisotropy=8;
  return t;
}
const TEX = {
  ceramica: tex(128,128,(c,w,h)=>{ c.fillStyle='#8d4325'; c.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=16){ for(let x=0;x<w;x+=16){
      const g=c.createLinearGradient(x,0,x+16,0);
      g.addColorStop(0,'#7a3a20'); g.addColorStop(.4,'#c06136'); g.addColorStop(1,'#8a4326');
      c.fillStyle=g; c.fillRect(x,y+1,15,14); }
      c.fillStyle='rgba(0,0,0,.28)'; c.fillRect(0,y,w,2); } }),
  fibrocimento: tex(128,128,(c,w,h)=>{ c.fillStyle='#9aa0a6'; c.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=12){ const g=c.createLinearGradient(x,0,x+12,0);
      g.addColorStop(0,'#7f858b'); g.addColorStop(.5,'#b3b9bf'); g.addColorStop(1,'#7f858b');
      c.fillStyle=g; c.fillRect(x,0,12,h); } }),
  metalico: tex(128,128,(c,w,h)=>{ c.fillStyle='#8f99a6'; c.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=24){ c.fillStyle='#aeb8c4'; c.fillRect(x,0,10,h);
      c.fillStyle='rgba(0,0,0,.22)'; c.fillRect(x+10,0,3,h); } }),
  laje: tex(128,128,(c,w,h)=>{ c.fillStyle='#9d9f9e'; c.fillRect(0,0,w,h);
    for(let i=0;i<2600;i++){ c.fillStyle=`rgba(0,0,0,${Math.random()*.09})`;
      c.fillRect(Math.random()*w,Math.random()*h,2,2); } }),
  solo: tex(128,128,(c,w,h)=>{ c.fillStyle='#5f6a50'; c.fillRect(0,0,w,h);
    for(let i=0;i<2200;i++){ c.fillStyle=`rgba(${120+Math.random()*60|0},${140+Math.random()*50|0},80,.5)`;
      c.fillRect(Math.random()*w,Math.random()*h,3,3); } }),
  grama: tex(128,128,(c,w,h)=>{ c.fillStyle='#3f5c33'; c.fillRect(0,0,w,h);
    for(let i=0;i<4000;i++){ c.fillStyle=`rgba(${60+Math.random()*70|0},${100+Math.random()*70|0},${45+Math.random()*40|0},.7)`;
      c.fillRect(Math.random()*w,Math.random()*h,2,3); } }),
  terra: tex(128,128,(c,w,h)=>{ c.fillStyle='#7a5c42'; c.fillRect(0,0,w,h);
    for(let i=0;i<3500;i++){ c.fillStyle=`rgba(${90+Math.random()*80|0},${65+Math.random()*55|0},${40+Math.random()*35|0},.65)`;
      c.fillRect(Math.random()*w,Math.random()*h,3,3); } }),
  asfalto: tex(128,128,(c,w,h)=>{ c.fillStyle='#3a3d41'; c.fillRect(0,0,w,h);
    for(let i=0;i<5000;i++){ c.fillStyle=`rgba(${70+Math.random()*70|0},${72+Math.random()*70|0},${78+Math.random()*70|0},.35)`;
      c.fillRect(Math.random()*w,Math.random()*h,2,2); } }),
  concreto: tex(128,128,(c,w,h)=>{ c.fillStyle='#9a9c9b'; c.fillRect(0,0,w,h);
    for(let i=0;i<2500;i++){ c.fillStyle=`rgba(0,0,0,${Math.random()*.08})`;
      c.fillRect(Math.random()*w,Math.random()*h,3,3); }
    c.strokeStyle='rgba(0,0,0,.18)'; c.lineWidth=2;
    c.beginPath(); c.moveTo(0,64); c.lineTo(w,64); c.moveTo(64,0); c.lineTo(64,h); c.stroke(); }),
  brita: tex(128,128,(c,w,h)=>{ c.fillStyle='#6e6f70'; c.fillRect(0,0,w,h);
    for(let i=0;i<1800;i++){ const g=120+Math.random()*90|0;
      c.fillStyle=`rgb(${g},${g-4},${g-8})`;
      c.beginPath(); c.arc(Math.random()*w,Math.random()*h,1.5+Math.random()*2.5,0,7); c.fill(); } }),
  predio: tex(128,256,(c,w,h)=>{ c.fillStyle='#5d666f'; c.fillRect(0,0,w,h);
    for(let y=8;y<h-8;y+=22) for(let x=8;x<w-8;x+=22){
      c.fillStyle = Math.random()<.75 ? '#8fa6bd' : '#3d454d';
      c.fillRect(x,y,13,13); } })
};
function texModulo(retrato){
  const W=retrato?512:256, H=retrato?256:512, cols=retrato?26:6, rows=retrato?6:26;
  return tex(W,H,(c)=>{
    c.fillStyle='#0d1a2e'; c.fillRect(0,0,W,H);
    const cw=W/cols, ch=H/rows;
    for(let i=0;i<cols;i++) for(let j=0;j<rows;j++){
      const g=c.createLinearGradient(i*cw,j*ch,(i+1)*cw,(j+1)*ch);
      g.addColorStop(0,'#16294a'); g.addColorStop(.55,'#101f3a'); g.addColorStop(1,'#1b3358');
      c.fillStyle=g; c.fillRect(i*cw+1.5,j*ch+1.5,cw-3,ch-3);
    }
    c.strokeStyle='rgba(190,205,225,.32)'; c.lineWidth=1.2;
    if(retrato){ for(let j=0;j<rows;j++) for(let k=1;k<=2;k++){
      const y=j*ch+ch*k/3; c.beginPath(); c.moveTo(0,y); c.lineTo(W,y); c.stroke(); } }
    else { for(let i=0;i<cols;i++) for(let k=1;k<=2;k++){
      const x=i*cw+cw*k/3; c.beginPath(); c.moveTo(x,0); c.lineTo(x,H); c.stroke(); } }
  });
}
const TEXMOD = {retrato: texModulo(true), paisagem: texModulo(false)};
const matVidroR = new THREE.MeshStandardMaterial({map:TEXMOD.retrato, metalness:.42, roughness:.16});
const matVidroP = new THREE.MeshStandardMaterial({map:TEXMOD.paisagem, metalness:.42, roughness:.16});
const matParede = new THREE.MeshStandardMaterial({color:0xd6d2c8, roughness:.92});
const matMold   = new THREE.MeshStandardMaterial({color:0xb9c1cb, metalness:.65, roughness:.3});
const matSel    = new THREE.MeshStandardMaterial({color:0xe8a200, metalness:.5, roughness:.35,
                    emissive:0x6a4a00});
const matAlu    = new THREE.MeshStandardMaterial({color:0xc6ced8, metalness:.55, roughness:.34});
const matAco    = new THREE.MeshStandardMaterial({color:0xe2e7ec, metalness:.8, roughness:.25});
const matEPDM   = new THREE.MeshStandardMaterial({color:0x22262b, roughness:.9});
const matCaixa  = new THREE.MeshStandardMaterial({color:0x2f6fa8, roughness:.55});
const matTronco = new THREE.MeshStandardMaterial({color:0x5b4433, roughness:.95});
const matFolha  = new THREE.MeshStandardMaterial({color:0x3f7a3a, roughness:.95, flatShading:true});
const matPredio = new THREE.MeshStandardMaterial({map:TEX.predio.clone(), roughness:.8});

const FONTES = {
  esri: {
    nome:'Esri World Imagery',
    zmax:21,
    credito:'Imagem: Esri, Maxar, Earthstar Geographics',
    url:(z,x,y)=>`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery`+
                 `/MapServer/tile/${z}/${y}/${x}`
  },
  google: {
    nome:'Google (via Esri Clarity)',
    zmax:21,
    credito:'Imagem: Esri Clarity, Maxar',
    url:(z,x,y)=>`https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery`+
                 `/MapServer/tile/${z}/${y}/${x}`
  },
  osm: {
    nome:'OpenStreetMap (mapa de ruas)',
    zmax:19,
    credito:'© OpenStreetMap contributors',
    url:(z,x,y)=>`https://tile.openstreetmap.org/${z}/${x}/${y}.png`
  }
};

/* ---------- conversão entre o referencial da casa e o mundo ---------- */
const EIXO_Y = new THREE.Vector3(0,1,0);
const paraMundo = v => v.clone().applyAxisAngle(EIXO_Y, gCasa.rotation.y).add(gCasa.position);
const paraCasa  = v => v.clone().sub(gCasa.position).applyAxisAngle(EIXO_Y, -gCasa.rotation.y);

/* ===================== imagem de satélite ===================== */
let planoMapa=null;
function tileXY(lat,lon,z){
  const n=Math.pow(2,z), lr=lat*RAD;
  return {x:(lon+180)/360*n,
          y:(1-Math.log(Math.tan(lr)+1/Math.cos(lr))/Math.PI)/2*n};
}
function limparMapa(){
  if(planoMapa){
    scene.remove(planoMapa);
    planoMapa.geometry.dispose();
    if(planoMapa.material.map) planoMapa.material.map.dispose();
    planoMapa.material.dispose();
    planoMapa=null;
  }
  if(typeof aplicarTerreno==='function' && !P.mapa) aplicarTerreno();
  if(typeof grade!=='undefined') grade.visible=true;
  gid('credito').classList.remove('on');
}
async function carregarMapa(){
  limparMapa();
  if(!P.mapa) return;
  const nota=gid('notaMapa');
  nota.innerHTML='Baixando imagem aérea…';
  const F=FONTES[P.mapaFonte]||FONTES.esri;
  const z=Math.min(P.mapaZ, F.zmax), T=P.mapaT, S=256;
  const c=tileXY(P.lat,P.lon,z);
  const x0=Math.floor(c.x)-T/2, y0=Math.floor(c.y)-T/2;
  const cv=document.createElement('canvas'); cv.width=cv.height=S*T;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#2b3138'; ctx.fillRect(0,0,S*T,S*T);
  const jobs=[];
  for(let i=0;i<T;i++) for(let j=0;j<T;j++){
    jobs.push(new Promise(res=>{
      const im=new Image(); im.crossOrigin='anonymous';
      im.onload=()=>{ ctx.drawImage(im,i*S,j*S,S,S); res(true); };
      im.onerror=()=>res(false);
      im.src=F.url(z, x0+i, y0+j);
    }));
  }
  const ok=(await Promise.all(jobs)).filter(Boolean).length;
  if(!ok){
    nota.innerHTML='<span class="al">Não consegui baixar as imagens.</span> '+
      'Em pré-visualização o navegador costuma bloquear; publicado na Vercel funciona.';
    P.mapa=false; sincronizar(); return;
  }
  const mpp=156543.03392*Math.cos(P.lat*RAD)/Math.pow(2,z);
  const lado=S*T*mpp;
  const dx=(c.x-(x0+T/2))*S*mpp;      // quanto o ponto está a leste do centro do mosaico
  const dy=(c.y-(y0+T/2))*S*mpp;      // quanto está ao sul
  const tex=new THREE.CanvasTexture(cv);
  tex.anisotropy=16;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.magFilter=THREE.LinearFilter;
  tex.generateMipmaps=true;
  planoMapa=new THREE.Mesh(new THREE.PlaneGeometry(lado,lado),
    new THREE.MeshStandardMaterial({map:tex, roughness:1}));
  planoMapa.rotation.x=-Math.PI/2;    // topo da imagem aponta para o norte (-Z)
  planoMapa.position.set(-dx, 0.006, -dy);
  planoMapa.receiveShadow=true;
  scene.add(planoMapa);
  /* o piso procedural sairia por baixo do mapa — some com ele */
  if(matChao.map){ matChao.map.dispose(); matChao.map=null; }
  matChao.color.set(0x232a31); matChao.needsUpdate=true;
  grade.visible=false;
  enquadrar();
  const cred=gid('credito');
  cred.textContent=F.credito;
  cred.classList.add('on');
  nota.innerHTML=`<b>${F.nome}</b> · zoom ${z} · <b>${br(mpp*100,0)} cm/pixel</b><br>`+
    `Cobertura de ${br(lado,0)} m de lado (${T}×${T} tiles). `+
    (z<P.mapaZ ? `<span class="al">Esta fonte vai até o zoom ${F.zmax}.</span> ` : '')+
    `${ok<T*T?'<span class="al">'+(T*T-ok)+' tiles falharam — provavelmente sem cobertura neste zoom.</span>':''}`;
}

/* ===================== telhado ===================== */
let FACES = [], INFO = {};
function montarTelhado(){
  gCasa.remove(gModulos); gCasa.remove(gFix);
  while(gCasa.children.length){
    const o = gCasa.children.pop();
    o.traverse(x=>{ if(x.geometry) x.geometry.dispose(); });
  }
  gCasa.add(gModulos); gCasa.add(gFix);
  FACES = [];

  const Lp=P.comp, Wp=P.larg, t=P.incl*RAD;
  const b = (P.tipo==='solo') ? 0 : P.beiral, eb = P.beiralH;
  const plano = (P.tipo==='laje' || P.tipo==='solo');
  const hPar = (P.tipo==='solo') ? 0 : P.pd;      // topo da parede
  /* cobertura avança o beiral: cresce em planta e desce na altura do beiral */
  const L = Lp + 2*b, W = Wp + 2*b;
  const hP = plano ? (hPar + eb) : (hPar - b*Math.tan(t));
  const matTelha = new THREE.MeshStandardMaterial({map:TEX[P.tipo].clone(), roughness:.85});
  matTelha.map.wrapS = matTelha.map.wrapT = THREE.RepeatWrapping;

  function faceMesh(vs, ru, rv){
    const g = new THREE.BufferGeometry(), pos=[], uv=[], idx=[];
    vs.forEach(p=>pos.push(p.x,p.y,p.z));
    (vs.length===3 ? [[0,0],[ru,0],[ru/2,rv]] : [[0,0],[ru,0],[ru,rv],[0,rv]])
      .forEach(a=>uv.push(a[0],a[1]));
    if(vs.length===3) idx.push(0,1,2); else idx.push(0,1,2,0,2,3);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, matTelha);
    m.castShadow = m.receiveShadow = true; gCasa.add(m);
  }
  const N = (a)=> (a%360+360)%360;

  if(plano){
    const y=hP;
    const vs=[new THREE.Vector3(-L/2,y,W/2), new THREE.Vector3(L/2,y,W/2),
              new THREE.Vector3(L/2,y,-W/2), new THREE.Vector3(-L/2,y,-W/2)];
    faceMesh(vs, L/1.2, W/1.2);
    const mh = (P.tipo==='laje') ? P.murH : 0;
    const mw = P.murW;
    if(mh > 0.01) platibanda(L, W, y, mh, mw);
    const rec = (mh > 0.01) ? mw : 0;
    const Lu = Math.max(0.5, L - 2*rec), Wu = Math.max(0.5, W - 2*rec);
    FACES.push({nome:'Plano', plano:true,
      origem:new THREE.Vector3(-Lu/2, y, Wu/2),
      u:new THREE.Vector3(1,0,0), v:new THREE.Vector3(0,0,-1),
      poly:[[0,0],[Lu,0],[Lu,Wu],[0,Wu]], normal:new THREE.Vector3(0,1,0),
      largura:Lu, altura:Wu, tilt:P.tilt, azi:N(P.azi)});
    if(P.tipo==='laje'){
      paredes(Lp,Wp,hPar);
      const laje=new THREE.Mesh(new THREE.BoxGeometry(L,eb,W), matTelha);
      laje.position.y=hPar+eb/2; laje.castShadow=laje.receiveShadow=true; gCasa.add(laje);
    }
  } else if(P.aguas===1){
    const hi=hP+W*Math.tan(t), S=W/Math.cos(t);
    const vs=[new THREE.Vector3(-L/2,hP,W/2), new THREE.Vector3(L/2,hP,W/2),
              new THREE.Vector3(L/2,hi,-W/2), new THREE.Vector3(-L/2,hi,-W/2)];
    faceMesh(vs, L/.5, S/.5);
    FACES.push({nome:'Água única', origem:vs[0], u:new THREE.Vector3(1,0,0),
      v:new THREE.Vector3(0,Math.sin(t),-Math.cos(t)), poly:[[0,0],[L,0],[L,S],[0,S]],
      normal:new THREE.Vector3(0,Math.cos(t),Math.sin(t)).normalize(),
      largura:L, altura:S, tilt:P.incl, azi:N(P.azi)});
    paredes(Lp,Wp,hPar,hPar+Wp*Math.tan(t));
    testeira(L,W,hP,eb,[[0,1]]);
  } else if(P.aguas===2){
    const hR=hP+(W/2)*Math.tan(t), S=(W/2)/Math.cos(t);
    const a=[new THREE.Vector3(-L/2,hP,W/2), new THREE.Vector3(L/2,hP,W/2),
             new THREE.Vector3(L/2,hR,0), new THREE.Vector3(-L/2,hR,0)];
    const b=[new THREE.Vector3(L/2,hP,-W/2), new THREE.Vector3(-L/2,hP,-W/2),
             new THREE.Vector3(-L/2,hR,0), new THREE.Vector3(L/2,hR,0)];
    faceMesh(a,L/.5,S/.5); faceMesh(b,L/.5,S/.5);
    FACES.push({nome:'Água 1', origem:a[0], u:new THREE.Vector3(1,0,0),
      v:new THREE.Vector3(0,Math.sin(t),-Math.cos(t)), poly:[[0,0],[L,0],[L,S],[0,S]],
      normal:new THREE.Vector3(0,Math.cos(t),Math.sin(t)).normalize(),
      largura:L, altura:S, tilt:P.incl, azi:N(P.azi)});
    FACES.push({nome:'Água 2', origem:b[0], u:new THREE.Vector3(-1,0,0),
      v:new THREE.Vector3(0,Math.sin(t),Math.cos(t)), poly:[[0,0],[L,0],[L,S],[0,S]],
      normal:new THREE.Vector3(0,Math.cos(t),-Math.sin(t)).normalize(),
      largura:L, altura:S, tilt:P.incl, azi:N(P.azi+180)});
    paredes(Lp,Wp,hPar,hPar+(Wp/2)*Math.tan(t),true);
    testeira(L,W,hP,eb,[[0,1],[0,-1]]);
  } else {
    const hR=hP+(W/2)*Math.tan(t), S=(W/2)/Math.cos(t);
    const rl=Math.max(0,L-W), rx=rl/2;
    const a=[new THREE.Vector3(-L/2,hP,W/2), new THREE.Vector3(L/2,hP,W/2),
             new THREE.Vector3(rx,hR,0), new THREE.Vector3(-rx,hR,0)];
    const b=[new THREE.Vector3(L/2,hP,-W/2), new THREE.Vector3(-L/2,hP,-W/2),
             new THREE.Vector3(-rx,hR,0), new THREE.Vector3(rx,hR,0)];
    const c=[new THREE.Vector3(L/2,hP,W/2), new THREE.Vector3(L/2,hP,-W/2), new THREE.Vector3(rx,hR,0)];
    const d=[new THREE.Vector3(-L/2,hP,-W/2), new THREE.Vector3(-L/2,hP,W/2), new THREE.Vector3(-rx,hR,0)];
    [a,b].forEach(v=>faceMesh(v,L/.5,S/.5)); [c,d].forEach(v=>faceMesh(v,W/.5,S/.5));
    const trap=[[0,0],[L,0],[(L+rl)/2,S],[(L-rl)/2,S]];
    FACES.push({nome:'Água 1', origem:a[0], u:new THREE.Vector3(1,0,0),
      v:new THREE.Vector3(0,Math.sin(t),-Math.cos(t)), poly:trap,
      normal:new THREE.Vector3(0,Math.cos(t),Math.sin(t)).normalize(),
      largura:L, altura:S, tilt:P.incl, azi:N(P.azi)});
    FACES.push({nome:'Água 2', origem:b[0], u:new THREE.Vector3(-1,0,0),
      v:new THREE.Vector3(0,Math.sin(t),Math.cos(t)), poly:trap,
      normal:new THREE.Vector3(0,Math.cos(t),-Math.sin(t)).normalize(),
      largura:L, altura:S, tilt:P.incl, azi:N(P.azi+180)});
    FACES.push({nome:'Tacaniça L', origem:c[0], u:new THREE.Vector3(0,0,-1),
      v:new THREE.Vector3(-Math.cos(t),Math.sin(t),0), poly:[[0,0],[W,0],[W/2,S]],
      normal:new THREE.Vector3(Math.sin(t),Math.cos(t),0).normalize(),
      largura:W, altura:S, tilt:P.incl, azi:N(P.azi+90)});
    FACES.push({nome:'Tacaniça O', origem:d[0], u:new THREE.Vector3(0,0,1),
      v:new THREE.Vector3(Math.cos(t),Math.sin(t),0), poly:[[0,0],[W,0],[W/2,S]],
      normal:new THREE.Vector3(-Math.sin(t),Math.cos(t),0).normalize(),
      largura:W, altura:S, tilt:P.incl, azi:N(P.azi-90)});
    paredes(Lp,Wp,hPar);
    testeira(L,W,hP,eb,[[0,1],[0,-1],[1,0],[-1,0]]);
  }
  INFO = {L,W,t,plano,hP};
  facesDeObstaculos();
}

/* topo de caixas d'água e prédios vira superfície montável */
function facesDeObstaculos(){
  const rot = gCasa.rotation.y;
  OBS.forEach((o, i)=>{
    if(!['cxQuadrada','cxRedonda','predio'].includes(o.tipo)) return;
    const noTelhado = OBSTIPOS[o.tipo].telhado;
    /* posição e rotação expressas no referencial da casa */
    let cx = o.x, cz = o.z, ang = o.r*RAD;
    if(!noTelhado){
      const l = paraCasa(new THREE.Vector3(o.x, 0, o.z));
      cx = l.x; cz = l.z;
      ang = o.r*RAD - rot;
    }
    const topo = (noTelhado ? alturaTelhadoEm(o.x,o.z) : 0) + o.h;
    const red = (o.tipo==='cxRedonda');
    const LU = red ? o.l/Math.SQRT2 : o.l;
    const LV = red ? o.l/Math.SQRT2 : o.p;
    const u = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
    const v = new THREE.Vector3(-Math.sin(ang), 0, -Math.cos(ang));
    const centro = new THREE.Vector3(cx, topo, cz);
    const origem = centro.clone()
      .add(u.clone().multiplyScalar(-LU/2))
      .add(v.clone().multiplyScalar(-LV/2));
    FACES.push({nome:`Topo ${i+1}`, plano:true, origem, u, v,
      poly:[[0,0],[LU,0],[LU,LV],[0,LV]], normal:new THREE.Vector3(0,1,0),
      largura:LU, altura:LV, tilt:P.tilt, azi:((P.azi%360)+360)%360, obst:true});
  });
}
function platibanda(L,W,y,h,w){
  const mat=new THREE.MeshStandardMaterial({color:0xe4e0d6, roughness:.92});
  for(const [x,z,lx,lz] of [
      [0,(W-w)/2,L,w], [0,-(W-w)/2,L,w],
      [(L-w)/2,0,w,W-2*w], [-(L-w)/2,0,w,W-2*w]]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(lx,h,lz), mat);
    m.position.set(x, y+h/2, z);
    m.castShadow=m.receiveShadow=true; gCasa.add(m);
  }
}
function testeira(L,W,y,eb,lados){
  const mat=new THREE.MeshStandardMaterial({color:0xe9e4d8, roughness:.9});
  for(const [sx,sz] of lados){
    const comp = sz ? L : W;
    const m=new THREE.Mesh(new THREE.BoxGeometry(sz?comp:0.04, eb, sz?0.04:comp), mat);
    m.position.set(sx*(L/2), y-eb/2, sz*(W/2));
    m.castShadow=m.receiveShadow=true; gCasa.add(m);
  }
}
function paredes(L,W,h,hTopo,empena){
  if(h<=0.05) return;
  const p=new THREE.Mesh(new THREE.BoxGeometry(L,h,W), matParede);
  p.position.y=h/2; p.castShadow=p.receiveShadow=true; gCasa.add(p);
  if(empena && hTopo){
    for(const s of [-1,1]){
      const sh=new THREE.Shape();
      sh.moveTo(-W/2,0); sh.lineTo(W/2,0); sh.lineTo(0,hTopo-h); sh.closePath();
      const m=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:.02,bevelEnabled:false}), matParede);
      m.rotation.y=Math.PI/2; m.position.set(s*L/2,h,0);
      m.castShadow=m.receiveShadow=true; gCasa.add(m);
    }
  }
}
function alturaTelhadoEm(x,z){
  const {W,t,plano,hP}=INFO;
  if(plano) return hP;
  if(P.aguas===1) return hP + (W/2 - z)*Math.tan(t);
  return hP + (W/2 - Math.min(W/2, Math.abs(z)))*Math.tan(t);
}

/* ===================== obstáculos ===================== */
const OBSTIPOS = {
  cxRedonda:{n:"Caixa d'água redonda", telhado:true},
  cxQuadrada:{n:"Caixa d'água retangular", telhado:true},
  casa:{n:'Casa vizinha', telhado:false},
  predio:{n:'Prédio', telhado:false},
  arvore:{n:'Árvore', telhado:false}
};
function novoObstaculo(tipo){
  const t = OBSTIPOS[tipo];
  OBS.push({id:proxId++, tipo,
    x: t.telhado ? P.comp/3 : P.comp/2 + 8,
    z: t.telhado ? -P.larg/4 : -P.larg/2 - 6,
    l: tipo==='predio'?8: tipo==='casa'?9: tipo==='arvore'?4:1.2,
    p: tipo==='predio'?8: tipo==='casa'?7: tipo==='arvore'?4:1.2,
    h: tipo==='predio'?18: tipo==='casa'?6: tipo==='arvore'?7:1.8,
    r: 0});
  obsSel = OBS.length-1;
  reconstruir(); listarObstaculos(); sincronizar();
}
function montarObstaculos(){
  while(gObs.children.length){
    const o=gObs.children.pop();
    o.traverse(x=>{ if(x.geometry) x.geometry.dispose(); });
  }
  for(const o of OBS){
    const g = new THREE.Group();
    const noTelhado = OBSTIPOS[o.tipo].telhado;
    if(o.tipo==='cxRedonda'){
      const m=new THREE.Mesh(new THREE.CylinderGeometry(o.l/2,o.l/2,o.h,20), matCaixa);
      m.position.y=o.h/2; g.add(m);
    } else if(o.tipo==='cxQuadrada'){
      const m=new THREE.Mesh(new THREE.BoxGeometry(o.l,o.h,o.p), matCaixa);
      m.position.y=o.h/2; g.add(m);
    } else if(o.tipo==='predio'){
      const m=new THREE.Mesh(new THREE.BoxGeometry(o.l,o.h,o.p), matPredio);
      m.material.map.repeat.set(Math.max(1,o.l/3), Math.max(1,o.h/3));
      m.position.y=o.h/2; g.add(m);
    } else if(o.tipo==='casa'){
      const hp=o.h*0.62;
      const c=new THREE.Mesh(new THREE.BoxGeometry(o.l,hp,o.p), matParede);
      c.position.y=hp/2; g.add(c);
      const sh=new THREE.Shape();
      sh.moveTo(-o.p/2,0); sh.lineTo(o.p/2,0); sh.lineTo(0,o.h-hp); sh.closePath();
      const tel=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:o.l,bevelEnabled:false}),
        new THREE.MeshStandardMaterial({color:0x8d4325, roughness:.9}));
      tel.rotation.y=Math.PI/2; tel.position.set(o.l/2,hp,0); g.add(tel);
    } else if(o.tipo==='arvore'){
      const tr=new THREE.Mesh(new THREE.CylinderGeometry(o.l*0.07,o.l*0.1,o.h*0.45,8), matTronco);
      tr.position.y=o.h*0.225; g.add(tr);
      for(const [dy,esc] of [[0.55,1],[0.75,0.78],[0.9,0.5]]){
        const f=new THREE.Mesh(new THREE.IcosahedronGeometry(o.l/2*esc,0), matFolha);
        f.position.y=o.h*dy; g.add(f);
      }
    }
    g.traverse(m=>{ if(m.isMesh){ m.castShadow=true; m.receiveShadow=true; } });

    const base = noTelhado ? alturaTelhadoEm(o.x,o.z) : 0;
    const v = new THREE.Vector3(o.x, base, o.z);
    if(noTelhado) v.copy(paraMundo(v)).setY(base + gCasa.position.y);
    g.position.copy(v);
    g.rotation.y = o.r*RAD + (noTelhado ? gCasa.rotation.y : 0);
    g.userData.obs = o.id;
    gObs.add(g);
  }
}

/* ===================== módulos ===================== */
function dentro(poly,x,y){
  let d=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,yi]=poly[i], [xj,yj]=poly[j];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) d=!d;
  }
  return d;
}
let CONT = {mod:0, porFace:[], trilho:0, fix:0, triangulos:0, centros:[], normais:[],
            eixos:[], meio:[], faceDe:[], sombreados:0, incid:0, passoMin:0, fileiras:0};
let PERDAS = {valido:false, total:0, porFace:[], porFaceMes:null, porModulo:[], horas:0};
let malhasModulo = [];

function montarModulos(){
  [gModulos, gFix].forEach(gr=>{
    while(gr.children.length){
      const o=gr.children.pop();
      o.traverse(x=>{ if(x.geometry && x.geometry.dispose) x.geometry.dispose(); });
    }
  });
  malhasModulo = [];
  CONT = {mod:0, porFace:FACES.map(()=>0), trilho:0, fix:0, triangulos:0,
          centros:[], normais:[], eixos:[], meio:[], faceDe:[],
          sombreados:0, incid:0, passoMin:0, fileiras:0};
  PERDAS.valido = false;

  const tilt = P.tilt*RAD;
  const altMin = Math.max(8, 90 - Math.abs(P.lat) - 23.45)*RAD;   // sol de inverno

  for(let fi=0; fi<FACES.length; fi++){
    if(!P.faces.has(fi)) continue;
    const F = FACES[fi];
    /* limite próprio da face; sem limite definido, usa o global */
    const limiteFace = (P.maxFace[fi] !== undefined) ? P.maxFace[fi] : Infinity;
    let nesta = 0;
    let v = P.ov, fileira = 0;

    while(v < F.altura - P.ov && CONT.mod < P.max && nesta < limiteFace){
      const chaveF = `${fi}:${fileira}`;
      const ori = oriFileira[chaveF] || P.ori;
      const retrato = ori==='retrato';
      const mv = retrato ? MOD.L : MOD.W;
      const mu = retrato ? MOD.W : MOD.L;
      const usoV = F.plano ? mv*Math.cos(tilt) : mv;
      if(v + usoV > F.altura - P.ov) break;

      /* passo da fileira: no plano soma a sombra projetada */
      let extra = P.gv;
      if(F.plano){
        const sombra = mv*Math.sin(tilt)/Math.tan(altMin);
        CONT.passoMin = Math.max(CONT.passoMin, sombra);
        extra = Math.max(P.gv, sombra);
      }

      /* o módulo repousa sobre o trilho, que repousa sobre o perfil A */
      const hMod = F.plano
        ? (0.20 + (mv/2)*Math.sin(tilt) + 0.042 + MOD.T/2 + 0.02)
        : 0.055 + 0.038/2 + MOD.T/2 + 0.01;
      const aj = ajusteFileira[chaveF] || {du:0, dv:0};
      const vPos = v + aj.dv;
      const linha = [];
      let u = P.ou + aj.du, coluna = 0;

      if(!fileirasFora.has(chaveF)){
        while(u + mu <= F.largura - P.ou + aj.du && CONT.mod < P.max && nesta < limiteFace){
          const cu = u + mu/2, cv = vPos + usoV/2;
          const ok = [[cu-mu/2,cv-usoV/2],[cu+mu/2,cv-usoV/2],
                      [cu+mu/2,cv+usoV/2],[cu-mu/2,cv+usoV/2]]
                     .every(([a,b])=>dentro(F.poly,a,b));
          const chave = `${chaveF}:${coluna}`;
          if(ok && !removidos.has(chave)){
            criarModulo(F, fi, fileira, coluna, cu, cv, mu, mv, usoV, retrato, tilt, hMod);
            linha.push(cu);
            CONT.mod++; CONT.porFace[fi]++; nesta++;
          }
          u += mu + P.gu; coluna++;
        }
      }
      if(linha.length){
        CONT.fileiras++;
        criarFixacao(F, fi, linha, vPos, usoV, mu, mv, tilt);
      }
      v += usoV + extra; fileira++;
    }
  }
}

function criarModulo(F, fi, fileira, coluna, cu, cv, mu, mv, usoV, retrato, tilt, hMod){
  const pos = F.origem.clone()
    .add(F.u.clone().multiplyScalar(cu))
    .add(F.v.clone().multiplyScalar(cv))
    .add(F.normal.clone().multiplyScalar(hMod));
  const g = new THREE.Group();
  g.position.copy(pos);
  g.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(F.u, F.normal, F.v.clone().negate()));
  if(F.plano) g.rotateX(tilt);

  const mold = new THREE.Mesh(new THREE.BoxGeometry(mu, MOD.T, mv), matMold);
  mold.castShadow = mold.receiveShadow = true;
  mold.userData.mod = {fi, fileira, coluna, face:F.nome};
  g.add(mold);
  const vid = new THREE.Mesh(new THREE.BoxGeometry(mu-0.03, 0.004, mv-0.03),
    retrato ? matVidroR : matVidroP);
  vid.position.y = MOD.T/2 + 0.003; vid.receiveShadow = true;
  vid.userData.mod = mold.userData.mod;
  g.add(vid);
  gModulos.add(g);
  malhasModulo.push(mold);

  const q = gCasa.rotation.y, eixoY = new THREE.Vector3(0,1,0);
  CONT.normais.push(new THREE.Vector3(0,1,0).applyQuaternion(g.quaternion).applyAxisAngle(eixoY, q));
  CONT.centros.push(paraMundo(pos));
  CONT.eixos.push(new THREE.Vector3(0,0,1).applyQuaternion(g.quaternion).applyAxisAngle(eixoY, q));
  CONT.meio.push(mv*0.35);
  CONT.faceDe.push(fi);
}

/* ---- helpers de geometria em coordenadas da face ---- */
function ptF(F,u,v,h){
  return F.origem.clone()
    .add(F.u.clone().multiplyScalar(u))
    .add(F.v.clone().multiplyScalar(v))
    .add(F.normal.clone().multiplyScalar(h));
}
function barra(a,b,larg,esp,mat){
  const d=new THREE.Vector3().subVectors(b,a), L=d.length();
  if(L<1e-4) return null;
  const m=new THREE.Mesh(new THREE.BoxGeometry(larg,esp,L), mat);
  m.position.copy(a).lerp(b,0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), d.clone().normalize());
  m.castShadow=m.receiveShadow=true;
  return m;
}

/* trilhos + estrutura de fixação em 3D */
const SAPATA = {l:0.25, p:0.25, h:0.20};   // sapata de concreto
function criarFixacao(F, fi, colunas, vPos, usoV, mu, mv, tilt){
  const u0 = colunas[0]-mu/2, u1 = colunas[colunas.length-1]+mu/2;
  const comp = u1-u0;
  const usarTriangulo = F.plano && (P.fix==='auto' || P.fix==='triangulo');
  CONT.trilho += 2*comp;

  /* ---------- superfície plana: triângulo de verdade ---------- */
  if(usarTriangulo){
    const clear = SAPATA.h;                     // topo da sapata
    const subida = mv*Math.sin(tilt);           // desnível do módulo
    const vAlto  = vPos + usoV;                 // pé traseiro
    const nTri = Math.max(2, Math.ceil(comp/1.3)+1);

    for(let i=0;i<nTri && P.verFix;i++){
      const uu = u0 + comp*i/(nTri-1);
      /* perfil A — segue exatamente a inclinação do módulo */
      const pA = barra(ptF(F,uu,vPos,clear), ptF(F,uu,vAlto,clear+subida), 0.04,0.04, matAlu);
      if(pA) gFix.add(pA);
      /* montante traseiro B */
      const pB = barra(ptF(F,uu,vAlto,clear), ptF(F,uu,vAlto,clear+subida), 0.04,0.04, matAlu);
      if(pB) gFix.add(pB);
      /* sapatas nos dois pés */
      for(const vv of [vPos, vAlto]){
        const sp=new THREE.Mesh(new THREE.BoxGeometry(SAPATA.l,SAPATA.h,SAPATA.p),
          new THREE.MeshStandardMaterial({color:0x8d9299, roughness:.95}));
        sp.position.copy(ptF(F,uu,vv,SAPATA.h/2));
        sp.castShadow=sp.receiveShadow=true;
        gFix.add(sp);
        const ch=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.012,0.09), matAco);
        ch.position.copy(ptF(F,uu,vv,SAPATA.h+0.006));
        ch.castShadow=true; gFix.add(ch);
      }
      CONT.fix += 2;               // duas sapatas por triângulo
    }
    CONT.triangulos += nTri;
    if(!P.verFix) CONT.fix += nTri*2;

    /* trilhos apoiados sobre os perfis A, a 1/4 e 3/4 da rampa */
    for(const r of [0.25,0.75]){
      const vv = vPos + usoV*r, hh = clear + subida*r + 0.042;
      const t = barra(ptF(F,u0,vv,hh), ptF(F,u1,vv,hh), 0.042,0.038, matAlu);
      if(t) gFix.add(t);
    }
    return;
  }

  /* ---------- telhado inclinado: trilho + peça sob cada ponto ---------- */
  const fix = fixAtual();
  const posV = [vPos + usoV*0.25, vPos + usoV*0.75];
  const nFix = Math.max(2, Math.ceil(comp/1.2)+1);

  for(const pv of posV){
    const t = barra(ptF(F,u0,pv,0.055), ptF(F,u1,pv,0.055), 0.042,0.038, matAlu);
    if(t) gFix.add(t);

    for(let i=0;i<nFix;i++){
      const uu = u0 + comp*i/(nFix-1);
      const g = new THREE.Group();
      g.position.copy(ptF(F,uu,pv,0));
      g.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(F.u, F.normal, F.v.clone().negate()));
      CONT.fix++;
      if(!P.verFix) continue;

      if(fix==='gancho'){
        const p1=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.012,0.16), matAco);
        p1.position.set(0,0.006,0.02); g.add(p1);
        const p2=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.05,0.012), matAco);
        p2.position.set(0,0.03,-0.055); g.add(p2);
        const p3=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.012,0.07), matAco);
        p3.position.set(0,0.05,-0.02); g.add(p3);
      } else if(fix==='prisioneiro'){
        const pino=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.09,8), matAco);
        pino.position.y=0.03; g.add(pino);
        const ved=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.026,0.012,12), matEPDM);
        ved.position.y=0.006; g.add(ved);
        const porca=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.012,6), matAco);
        porca.position.y=0.072; g.add(porca);
      } else if(fix==='minitrilho'){
        const b=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.036,0.09), matAlu);
        b.position.y=0.018; g.add(b);
        const par=new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.005,0.04,8), matAco);
        par.position.y=0.05; g.add(par);
      } else {
        const b=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.04,0.12), matAlu);
        b.position.y=0.02; g.add(b);
      }
      g.traverse(m=>{ if(m.isMesh){ m.castShadow=true; m.receiveShadow=true; } });
      gFix.add(g);
    }
  }
}

/* ===================== auxiliares de cena ===================== */
function montarAux(){
  while(gAux.children.length){
    const o=gAux.children.pop();
    if(o.geometry) o.geometry.dispose();
    if(o.material && o.material.map) o.material.map.dispose();
  }
  const R = Math.max(P.comp,P.larg)*0.75 + 6;
  if(P.verNorte){
    const s=new THREE.Mesh(new THREE.ConeGeometry(0.5,1.6,4),
      new THREE.MeshBasicMaterial({color:0xe0644a}));
    s.position.set(0,0.8,-R); s.rotation.x=-Math.PI/2; gAux.add(s);
    gAux.add(letreiro('N','#e0644a',new THREE.Vector3(0,2.4,-R),2.2));
  }
  if(P.verRota){
    const pts=[];
    for(let h=0;h<=24;h+=0.25){
      const s=solar(P.lat,P.lon,P.tz,P.dia,h);
      if(s.alt<=0) continue;
      pts.push(vetorSol(s.alt,s.azi).multiplyScalar(R*1.3));
    }
    if(pts.length>1) gAux.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color:0xe8a200})));
  }
}
function letreiro(txt,cor,pos,tam){
  const cv=document.createElement('canvas'); cv.width=cv.height=128;
  const c=cv.getContext('2d');
  c.font='700 90px "Barlow Condensed", sans-serif'; c.fillStyle=cor;
  c.textAlign='center'; c.textBaseline='middle'; c.fillText(txt,64,68);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(cv), transparent:true, depthTest:false}));
  sp.position.copy(pos); sp.scale.setScalar(tam);
  return sp;
}
const esferaSol=new THREE.Mesh(new THREE.SphereGeometry(0.9,20,20),
  new THREE.MeshBasicMaterial({color:0xffd27a}));
scene.add(esferaSol);

/* ===================== sombreamento ===================== */
const ray = new THREE.Raycaster();
function calcularSombra(dir, alt){
  if(!CONT.centros.length) return;
  const alvos=[];
  gCasa.traverse(o=>{ if(o.isMesh && o.parent!==gFix) alvos.push(o); });
  gObs.traverse(o=>{ if(o.isMesh) alvos.push(o); });
  if(modeloGLB) modeloGLB.traverse(o=>{ if(o.isMesh) alvos.push(o); });
  let som=0, soma=0;
  for(let i=0;i<CONT.centros.length;i++){
    soma += Math.max(0, CONT.normais[i].dot(dir));
    if(alt<=0){ som++; continue; }
    ray.set(CONT.centros[i].clone().add(dir.clone().multiplyScalar(0.15)), dir);
    ray.far = 300;
    if(ray.intersectObjects(alvos,false).length) som++;
  }
  CONT.sombreados=som; CONT.incid=soma/CONT.centros.length;
}

/* ---------- perdas por sombreamento ao longo do ano ----------
   12 dias representativos, passo horário. Bloqueia só a componente
   direta; a difusa é considerada não obstruída (aproximação de 1ª ordem). */
function calcularPerdasAnuais(){
  const n = CONT.centros.length;
  if(!n){ PERDAS={valido:true,total:0,porFace:FACES.map(()=>0),porModulo:[],horas:0}; return; }
  const alvos=[];
  gCasa.traverse(o=>{ if(o.isMesh && o.parent!==gFix) alvos.push(o); });
  gObs.traverse(o=>{ if(o.isMesh) alvos.push(o); });

  const dt = n<=30 ? 0.5 : 1;
  const ideal=new Array(n).fill(0), real=new Array(n).fill(0);
  const fm = FACES.map(()=>({i:new Array(12).fill(0), r:new Array(12).fill(0)}));
  const r=new THREE.Raycaster(); r.far=500;
  let horas=0;

  for(let m=0;m<12;m++){
    const dia=DIA_REP[m];
    const G0=1367*(1+0.033*Math.cos(2*Math.PI*dia/365));
    for(let h=4;h<=20;h+=dt){
      const s=solar(P.lat,P.lon,P.tz,dia,h);
      if(s.alt<=5) continue;
      horas++;
      const sv=vetorSol(s.alt,s.azi), sa=s.alt*RAD;
      const DNI=G0*Math.pow(0.7,Math.pow(AM_KY(sa),0.678));
      const difH=0.11*DNI*Math.sin(sa);
      for(let i=0;i<n;i++){
        const cosI=Math.max(0, CONT.normais[i].dot(sv));
        const ct=Math.max(0, CONT.normais[i].y);
        const difP=difH*(1+ct)/2;
        const direta=DNI*cosI;
        const fmi = fm[CONT.faceDe[i]];
        ideal[i]+=(direta+difP)*dt;
        if(fmi){ fmi.i[m]+=(direta+difP)*dt; }
        if(direta<=0){ real[i]+=difP*dt; if(fmi) fmi.r[m]+=difP*dt; continue; }
        /* três amostras ao longo do módulo: pega sombra parcial */
        let livres=0;
        for(const f of [-1,0,1]){
          const org=CONT.centros[i].clone()
            .add(CONT.eixos[i].clone().multiplyScalar(f*CONT.meio[i]))
            .add(CONT.normais[i].clone().multiplyScalar(0.03))
            .add(sv.clone().multiplyScalar(0.10));
          r.set(org, sv);
          if(!r.intersectObjects(alvos,false).length) livres++;
        }
        const util=(direta*(livres/3)+difP)*dt;
        real[i]+=util;
        if(fmi) fmi.r[m]+=util;
      }
    }
  }
  const porFace=FACES.map(()=>({i:0,r:0}));
  const porModulo=[];
  let ti=0, tr=0;
  for(let i=0;i<n;i++){
    ti+=ideal[i]; tr+=real[i];
    porModulo.push(ideal[i]>0 ? 1-real[i]/ideal[i] : 0);
    const f=porFace[CONT.faceDe[i]];
    if(f){ f.i+=ideal[i]; f.r+=real[i]; }
  }
  PERDAS={valido:true, horas,
    total: ti>0 ? 1-tr/ti : 0,
    porFace: porFace.map(f=>f.i>0 ? 1-f.r/f.i : 0),
    porFaceMes: fm.map(f=>f.i.map((v,m)=>v>0 ? 1-f.r[m]/v : 0)),
    porModulo};
}

/* ===================== atualização ===================== */
let tSombra=0;
function posicionarSol(agora){
  const s=solar(P.lat,P.lon,P.tz,P.dia,P.hora);
  const dir=vetorSol(s.alt,s.azi);
  const ext=Math.max(P.comp,P.larg,P.pd)+40;
  sol.position.copy(dir.clone().multiplyScalar(ext*1.6));
  sol.target.position.set(0,0,0);
  const SC=ext*0.9;
  sol.shadow.camera.left=-SC; sol.shadow.camera.right=SC;
  sol.shadow.camera.top=SC; sol.shadow.camera.bottom=-SC;
  sol.shadow.camera.far=ext*4;
  sol.shadow.camera.updateProjectionMatrix();
  esferaSol.position.copy(dir.clone().multiplyScalar(ext*1.5));
  esferaSol.visible = s.alt>-2;

  const d=Math.max(0,Math.min(1,(s.alt+3)/22));
  sol.intensity=1.7*d; hemi.intensity=0.28+0.45*d;
  const ceu=new THREE.Color().setHSL(0.58,0.35,0.05+0.42*d);
  if(s.alt<12 && s.alt>-4) ceu.lerp(new THREE.Color(0xe07a3a),(12-s.alt)/26);
  scene.background=ceu; scene.fog=new THREE.Fog(ceu.getHex(), 90, 420);
  sol.color.setHSL(0.09,0.55,Math.min(.95,0.62+0.33*d));

  if(agora-tSombra>200){
    tSombra=agora; calcularSombra(dir,s.alt); atualizarHUD(s);
  }
}
function reconstruir(){
  gCasa.rotation.y = Math.PI - P.azi*RAD;
  gCasa.position.set(P.casaX, 0, P.casaZ);
  montarTelhado(); montarModulos(); montarObstaculos(); montarAux();
  sincronizarFaces(); atualizarResumo(); tSombra=0;
}

/* ===================== seleção por toque ===================== */
let selecionado=null, selMesh=null, matAntigo=null;
function selecionarNoPonto(cx,cy){
  const r=new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1), camera);
  const hits=r.intersectObjects(malhasModulo,false);
  if(!hits.length){ fecharSelecao(); return; }
  const d=hits[0].object.userData.mod;
  if(selMesh && matAntigo) selMesh.material=matAntigo;
  selMesh=hits[0].object; matAntigo=selMesh.material; selMesh.material=matSel;
  selecionado=d;
  $('#selInfo').textContent = rotuloSel(d);
  $('#sel').classList.add('on');
}
function fecharSelecao(){
  if(selMesh && matAntigo) selMesh.material=matAntigo;
  selMesh=null; matAntigo=null; selecionado=null;
  $('#sel').classList.remove('on');
}
const historico = [];
function snapshot(){
  historico.push(JSON.stringify({
    rm:[...removidos], ff:[...fileirasFora],
    ori:{...oriFileira}, aj:JSON.parse(JSON.stringify(ajusteFileira))
  }));
  if(historico.length>80) historico.shift();
  botaoDesfazer();
}
function desfazer(){
  const st=historico.pop(); if(!st) return;
  const d=JSON.parse(st);
  removidos.clear(); d.rm.forEach(k=>removidos.add(k));
  fileirasFora.clear(); d.ff.forEach(k=>fileirasFora.add(k));
  for(const k in oriFileira) delete oriFileira[k];
  Object.assign(oriFileira, d.ori);
  for(const k in ajusteFileira) delete ajusteFileira[k];
  Object.assign(ajusteFileira, d.aj);
  fecharSelecao(); refazer(); botaoDesfazer();
}
function botaoDesfazer(){
  const b=gid('undo');
  if(b){ b.disabled = historico.length===0; b.title = `Desfazer (${historico.length})`; }
}
function refazer(){ montarModulos(); atualizarResumo(); tSombra=0; }
function ajusteDe(){
  const k=`${selecionado.fi}:${selecionado.fileira}`;
  if(!ajusteFileira[k]) ajusteFileira[k]={du:0,dv:0};
  return {k, a:ajusteFileira[k]};
}
function mover(du, dv){
  if(!selecionado) return;
  snapshot();
  const {a}=ajusteDe();
  a.du+=du; a.dv+=dv;
  const s={...selecionado};
  refazer();
  selecionado=s;
  $('#selInfo').textContent = rotuloSel(s);
}
function rotuloSel(d){
  const k=`${d.fi}:${d.fileira}`;
  const a=ajusteFileira[k]||{du:0,dv:0};
  const ori=oriFileira[k]||P.ori;
  return `${d.face} · fileira ${d.fileira+1} · ${ori} · `+
         `desloc ${a.du.toFixed(2)} / ${a.dv.toFixed(2)} m`;
}
$('#nUp').onclick=()=>mover(0, PASSO);
$('#nDn').onclick=()=>mover(0,-PASSO);
$('#nLf').onclick=()=>mover(-PASSO,0);
$('#nRt').onclick=()=>mover(PASSO,0);
$('#btnZerar').onclick=()=>{
  if(!selecionado) return;
  snapshot();
  delete ajusteFileira[`${selecionado.fi}:${selecionado.fileira}`];
  const s={...selecionado}; refazer(); selecionado=s;
  $('#selInfo').textContent = rotuloSel(s);
};
$('#btnRemFil').onclick=()=>{
  if(!selecionado) return;
  snapshot();
  fileirasFora.add(`${selecionado.fi}:${selecionado.fileira}`);
  fecharSelecao(); refazer();
};
$('#btnFechar').onclick = fecharSelecao;
$('#btnGirar').onclick = ()=>{
  if(!selecionado) return;
  snapshot();
  const k=`${selecionado.fi}:${selecionado.fileira}`;
  oriFileira[k] = (oriFileira[k]||P.ori)==='retrato' ? 'paisagem' : 'retrato';
  const s={...selecionado}; refazer(); selecionado=s;
  $('#selInfo').textContent = rotuloSel(s);
};
$('#btnRemover').onclick = ()=>{
  if(!selecionado) return;
  snapshot();
  removidos.add(`${selecionado.fi}:${selecionado.fileira}:${selecionado.coluna}`);
  fecharSelecao(); refazer();
};
$('#restaurar') && ($('#restaurar').onclick = ()=>{
  snapshot();
  removidos.clear(); fileirasFora.clear();
  for(const k in oriFileira) delete oriFileira[k];
  for(const k in ajusteFileira) delete ajusteFileira[k];
  refazer();
});

/* ===================== interface ===================== */
function $(s){ return document.querySelector(s) || STUB; }
/* Elemento fantasma: absorve atribuições quando a peça não existe no HTML.
   Evita que uma parte faltando (deploy parcial) derrube a aplicação inteira. */
const STUB = new Proxy({}, {
  get: (_, k) => (k === 'classList' ? {add(){},remove(){},toggle(){},contains:()=>false}
              : k === 'style' ? {}
              : k === 'dataset' ? {}
              : k === 'value' ? ''
              : k === 'textContent' || k === 'innerHTML' ? ''
              /* consultas devolvem coleção vazia: quem itera não quebra */
              : k === 'querySelectorAll' ? (()=>[])
              : k === 'querySelector' || k === 'closest' ? (()=>null)
              : k === 'getBoundingClientRect' ? (()=>({top:0,left:0,width:0,height:0}))
              : k === 'files' ? []
              : typeof k === 'string' && k.startsWith('on') ? null
              : ()=>{}),
  set: () => true
});
const gid = id => document.getElementById(id) || STUB;
/* liga um handler só se o elemento existir — evita que uma peça faltando derrube tudo */
function liga(id, evento, fn){
  const el = document.getElementById(id);
  if(el) el[evento] = fn;
  return el;
}
const br=(n,d)=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});
const ROSA=['N','NNE','NE','ENE','L','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
const bussola=a=>ROSA[Math.round(((a%360)+360)%360/22.5)%16];
function dataDoDia(n){
  const d=new Date(new Date(2026,0,1).getTime()+(n-1)*864e5);
  return d.getDate()+'/'+['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()];
}
function chips(el,itens,ativo,click){
  el.innerHTML='';
  itens.forEach(([k,txt,cls])=>{
    const b=document.createElement('button');
    b.className='chip'+(cls?' '+cls:'')+(ativo(k)?' on':'');
    b.textContent=txt; b.dataset.k=k; b.onclick=()=>click(k);
    el.appendChild(b);
  });
}

chips($('#tipos'), Object.entries(TIPOS).map(([k,v])=>[k,v.n]), k=>P.tipo===k, k=>{
  P.tipo=k; if(k==='laje'||k==='solo') P.aguas=1;
  P.faces=new Set([0]); removidos.clear();
  sincronizar(); reconstruir(); enquadrar();
});
chips($('#aguas'), [['1','1 água'],['2','2 águas'],['4','4 águas']],
  k=>String(P.aguas)===k, k=>{
    if(P.tipo==='laje'||P.tipo==='solo') return;
    P.aguas=+k; P.faces=new Set([0]); removidos.clear(); sincronizar(); reconstruir();
  });
chips($('#orientPre'), [['0','Norte'],['45','NE'],['315','NO'],['90','Leste'],['270','Oeste']],
  k=>String(P.azi)===k, k=>{ P.azi=+k; $('#azi').value=k; sincronizar(); reconstruir(); });
chips($('#modPre'), CAT.MODULOS.map(m=>[m.id, `${m.fabricante.split(' ')[0]} ${m.wp}`]),
  k=>P.moduloId===k, k=>{
    const c=CAT.acharModulo(k); if(!c) return;
    P.moduloId=k;
    const m={wp:c.wp,l:c.comprimento,w:c.largura,k:c.peso};
    P.modWp=m.wp; P.modL=m.l; P.modW=m.w; P.modK=m.k;
    ['mwp','ml','mw','mk'].forEach((id,i)=>
      document.getElementById(id).value=[m.wp,m.l,m.w,m.k][i]);
    aplicarModulo(); sincronizar(); reconstruir();
  });
chips($('#ori'), [['retrato','Retrato'],['paisagem','Paisagem']],
  k=>P.ori===k, k=>{ P.ori=k; sincronizar(); montarModulos(); atualizarResumo(); tSombra=0; });
chips($('#fix'), [['auto','Automático'],['gancho','Gancho'],['prisioneiro','Prisioneiro'],
  ['minitrilho','Mini-trilho'],['triangulo','Triângulo']],
  k=>P.fix===k, k=>{ P.fix=k; sincronizar(); montarModulos(); atualizarResumo(); });
chips($('#terrenos'), [['grama','Grama'],['terra','Terra'],['asfalto','Asfalto'],
  ['concreto','Concreto'],['brita','Brita']],
  k=>P.terreno===k, k=>{
    P.terreno=k;
    if(P.mapa){ P.mapa=false; limparMapa(); }
    aplicarTerreno(); sincronizar();
  });
chips($('#addObs'), Object.entries(OBSTIPOS).map(([k,v])=>[k,'＋ '+v.n,'add']),
  ()=>false, k=>novoObstaculo(k));
chips($('#locais'), [['-23.32,-46.58','Mairiporã'],['-23.55,-46.63','São Paulo'],
  ['-3.73,-38.53','Fortaleza'],['-30.03,-51.23','Porto Alegre']],
  k=>`${P.lat},${P.lon}`===k, k=>{
    const [a,b]=k.split(',').map(Number);
    P.lat=a; P.lon=b; $('#lat').value=a; $('#lon').value=b;
    for(const j in cacheHSP) delete cacheHSP[j];
    for(const j in cacheDia) delete cacheDia[j];
    sincronizar(); reconstruir(); if(P.mapa) carregarMapa();
  });
chips($('#mapaTgl'), [['on','Mostrar satélite']], ()=>P.mapa, ()=>{
  P.mapa=!P.mapa; sincronizar();
  if(P.mapa) carregarMapa(); else { limparMapa();
    gid('notaMapa').textContent=
      'Carrega a imagem aérea das coordenadas atuais como piso da cena.'; }
});
chips($('#mapaZoom'), [['18','Amplo'],['19','Médio'],['20','Detalhe'],['21','Máximo']],
  k=>String(P.mapaZ)===k, k=>{ P.mapaZ=+k; sincronizar(); if(P.mapa) carregarMapa(); });
chips($('#mapaFonte'), Object.entries(FONTES).map(([k,v])=>[k, v.nome.split(' ')[0]]),
  k=>P.mapaFonte===k, k=>{ P.mapaFonte=k; sincronizar(); if(P.mapa) carregarMapa(); });
gid('btnAmpliarMapa').onclick = ()=>{
  P.mapaT = P.mapaT>=12 ? 6 : P.mapaT+2;
  gid('btnAmpliarMapa').textContent =
    P.mapaT>=12 ? 'Voltar ao normal' : `Ampliar cobertura (${P.mapaT}×${P.mapaT})`;
  if(P.mapa) carregarMapa();
};
chips($('#datas'), [[80,'21/mar'],[172,'21/jun'],[266,'23/set'],[355,'21/dez']].map(([n,t])=>[String(n),t]),
  k=>String(P.dia)===k, k=>{ P.dia=+k; $('#dia').value=k; sincronizar(); montarAux(); tSombra=0; });
chips($('#show'), [['verSombra','Sombra'],['verRota','Trajetória'],['verNorte','Norte'],['verFix','Fixação']],
  k=>P[k], k=>{
    P[k]=!P[k];
    renderer.shadowMap.enabled=P.verSombra;
    scene.traverse(o=>{ if(o.material) o.material.needsUpdate=true; });
    sincronizar(); montarAux();
    if(k==='verFix'){ montarModulos(); atualizarResumo(); }
  });

function sincronizarFaces(){
  chips($('#faces'), FACES.map((f,i)=>[String(i), f.nome]),
    k=>P.faces.has(+k),
    k=>{ const i=+k; P.faces.has(i)?P.faces.delete(i):P.faces.add(i);
         montarModulos(); sincronizarFaces(); atualizarResumo(); tSombra=0; });

  /* limite individual de cada superfície ativa */
  const cx=gid('limiteFaces');
  if(!cx) return;
  const ativas=[...P.faces].filter(i=>FACES[i]).sort((a,b)=>a-b);
  if(!ativas.length){ cx.innerHTML=''; return; }
  cx.innerHTML = ativas.map(i=>{
    const n=CONT.porFace[i]||0;
    const lim=P.maxFace[i];
    const cap=lim===undefined?'livre':lim;
    return `<div class="row" style="margin-top:10px">`+
      `<div class="name">${FACES[i].nome}</div>`+
      `<div class="val"><span class="k">${n}</span> / ${cap}</div></div>`+
      `<input type="range" class="limFace" data-f="${i}" min="0" max="60" step="1" `+
      `value="${lim===undefined?60:lim}">`;
  }).join('');
  cx.querySelectorAll('.limFace').forEach(sl=>{
    sl.addEventListener('input', e=>{
      const i=+e.target.dataset.f, v=+e.target.value;
      if(v>=60) delete P.maxFace[i]; else P.maxFace[i]=v;
      montarModulos(); sincronizarFaces(); atualizarResumo(); tSombra=0;
    });
  });
}
function listarObstaculos(){
  chips($('#listaObs'), OBS.map((o,i)=>[String(i), `${i+1} ${OBSTIPOS[o.tipo].n.split(' ')[0]}`]),
    k=>obsSel===+k, k=>{ obsSel=+k; listarObstaculos(); sincronizar(); });
  $('#editObs').style.display = (obsSel>=0 && OBS[obsSel]) ? 'block' : 'none';
}
$('#delObs').onclick = ()=>{
  if(obsSel<0) return;
  OBS.splice(obsSel,1); obsSel = OBS.length?0:-1;
  reconstruir(); listarObstaculos(); sincronizar();
};

const SL=[['comp','comp'],['larg','larg'],['pd','pd'],['incl','incl'],['azi','azi'],
          ['gu','gu'],['gv','gv'],['ou','ou'],['ov','ov'],['max','max'],['tilt','tilt'],
          ['lat','lat'],['lon','lon'],['dia','dia'],['hsp','hsp'],
          ['mwp','modWp'],['ml','modL'],['mw','modW'],['mk','modK'],
          ['bei','beiral'],['beh','beiralH'],['casax','casaX'],['casaz','casaZ'],
          ['tmin','tMin'],['tmax','tMaxAmb'],['murh','murH'],['murw','murW']];
SL.forEach(([id,key])=>{
  document.getElementById(id).addEventListener('input', e=>{
    P[key]=+e.target.value;
    if(key==='lat'||key==='lon'){
      for(const j in cacheHSP) delete cacheHSP[j];
      for(const j in cacheDia) delete cacheDia[j];
      if(P.mapa) clearTimeout(window._tmapa), window._tmapa=setTimeout(carregarMapa,600);
    }
    aplicarModulo(); sincronizar(); reconstruir();
  });
});
[['psuj','sujeira'],['pmis','mismatch'],['pcab','cabeamento'],['pref','reflexao']]
.forEach(([id,key])=>{
  document.getElementById(id).addEventListener('input', e=>{
    P.perdas[key]=+e.target.value; sincronizar(); atualizarResumo();
  });
});
gid('pdeg').addEventListener('input', e=>{
  const v=+e.target.value;
  P.perdas.degradacao=v/2; P.perdas.indisponibilidade=v/2;
  sincronizar(); atualizarResumo();
});
[['ox','x'],['oz','z'],['ol','l'],['op','p'],['oh','h'],['or','r']].forEach(([id,key])=>{
  document.getElementById(id).addEventListener('input', e=>{
    if(obsSel<0 || !OBS[obsSel]) return;
    OBS[obsSel][key]=+e.target.value;
    reconstruir(); sincronizar();
  });
});
$('#hora').addEventListener('input', e=>{ P.hora=+e.target.value; sincronizar(); });

let editando=false;
function ativarEdicaoNumerica(){
  document.querySelectorAll('input[type=range]').forEach(sl=>{
    const linha = sl.previousElementSibling;
    if(!linha || !linha.classList.contains('row')) return;
    const val = linha.querySelector('.val');
    if(!val) return;
    val.title = 'Toque para digitar';
    val.addEventListener('click', ()=>abrirEditor(val, sl));
  });
}
function abrirEditor(val, sl){
  if(editando) return;
  editando = true;
  const antes = val.textContent;
  const inp = document.createElement('input');
  inp.type='number'; inp.className='valedit';
  inp.step=sl.step; inp.min=sl.min; inp.max=sl.max; inp.value=sl.value;
  val.textContent=''; val.appendChild(inp);
  inp.focus(); inp.select();
  let fechado=false;
  const fim = ok=>{
    if(fechado) return; fechado=true;
    const bruto = String(inp.value).replace(',','.');
    editando=false;
    val.textContent = antes;
    if(ok){
      let v = parseFloat(bruto);
      if(!isNaN(v)){
        v = Math.min(+sl.max, Math.max(+sl.min, v));
        sl.value = v;
        sl.dispatchEvent(new Event('input',{bubbles:true}));
        return;
      }
    }
    sincronizar();
  };
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); fim(true); }
    if(e.key==='Escape'){ e.preventDefault(); fim(false); }
  });
  inp.addEventListener('blur', ()=>fim(true));
}

function sincronizar(){
  if(editando) return;
  $('#vComp').textContent=br(P.comp,1)+' m';
  $('#vLarg').textContent=br(P.larg,1)+' m';
  $('#vPd').textContent=br(P.pd,1)+' m';
  $('#vIncl').textContent=P.incl+'°';
  $('#vAzi').textContent=P.azi+'° '+bussola(P.azi);
  $('#vGu').textContent=br(P.gu,2)+' m';
  $('#vGv').textContent=br(P.gv,2)+' m';
  $('#vOu').textContent=br(P.ou,2)+' m';
  $('#vOv').textContent=br(P.ov,2)+' m';
  $('#vMax').textContent=P.max;
  $('#vTilt').textContent=P.tilt+'°';
  $('#vLat').textContent=br(P.lat,2);
  $('#vLon').textContent=br(P.lon,2);
  $('#vDia').textContent=dataDoDia(P.dia);
  $('#vHsp').textContent=br(P.hsp,2);
  gid('vGlbE').textContent=br(glb.escala,2)+'×';
  gid('vGlbR').textContent=glb.rot+'°';
  gid('vGlbY').textContent=br(glb.y,1)+' m';
  $('#vTmin').textContent=P.tMin+' °C';
  $('#vTmax').textContent=P.tMaxAmb+' °C';
  $('#vPsuj').textContent=br(P.perdas.sujeira,1)+' %';
  $('#vPmis').textContent=br(P.perdas.mismatch,1)+' %';
  $('#vPcab').textContent=br(P.perdas.cabeamento,1)+' %';
  $('#vPref').textContent=br(P.perdas.reflexao,1)+' %';
  $('#vPdeg').textContent=br(P.perdas.degradacao+P.perdas.indisponibilidade,1)+' %';
  document.querySelectorAll('#invLista .chip').forEach(c=>
    c.classList.toggle('on', c.dataset.k===P.inversor));
  $('#vCasaX').textContent=br(P.casaX,1)+' m';
  $('#vCasaZ').textContent=br(P.casaZ,1)+' m';
  $('#vMurH').textContent=br(P.murH,2)+' m';
  $('#vMurW').textContent=br(P.murW,2)+' m';
  $('#notaMur').innerHTML = P.tipo==='laje'
    ? (P.murH>0.01
       ? `Murinho de <b>${br(P.murH,2)} m</b> em volta. A área de montagem recua `+
         `${br(P.murW,2)} m de cada lado e a platibanda entra no cálculo de sombra.`
       : 'Altura zero: laje sem platibanda.')
    : 'A platibanda vale para o tipo Laje.';
  $('#vBei').textContent=br(P.beiral,2)+' m';
  $('#vBeh').textContent=br(P.beiralH,2)+' m';
  $('#notaBei').innerHTML = (P.tipo==='laje'||P.tipo==='solo')
    ? `A laje avança <b>${br(P.beiral,2)} m</b> além da alvenaria, com borda de `+
      `${br(P.beiralH,2)} m — a área de montagem acompanha o avanço.`
    : `Cobertura avança <b>${br(P.beiral,2)} m</b> além da parede; o beiral desce `+
      `<b>${br(P.beiral*Math.tan(P.incl*RAD),2)} m</b> em relação ao topo da alvenaria.`;
  document.querySelectorAll('#terrenos .chip').forEach(c=>
    c.classList.toggle('on', c.dataset.k===P.terreno));
  $('#vWp').textContent=P.modWp+' Wp';
  $('#vML').textContent=P.modL+' mm';
  $('#vMW').textContent=P.modW+' mm';
  $('#vMK').textContent=br(P.modK,1)+' kg';
  const areaM=(P.modL/1000)*(P.modW/1000);
  $('#notaMod').innerHTML=
    `Área ${br(areaM,2)} m² · densidade <b>${br(P.modWp/areaM,0)} W/m²</b> · `+
    `carga <b>${br(P.modK/areaM,1)} kg/m²</b>. Mudar o modelo refaz todo o arranjo.`;
  document.querySelectorAll('#modPre .chip').forEach(c=>
    c.classList.toggle('on', c.dataset.k===P.moduloId));
  const o=OBS[obsSel];
  if(o){
    $('#ox').value=o.x; $('#oz').value=o.z; $('#ol').value=o.l;
    $('#op').value=o.p; $('#oh').value=o.h; $('#or').value=o.r;
    $('#vOx').textContent=br(o.x,1)+' m'; $('#vOz').textContent=br(o.z,1)+' m';
    $('#vOl').textContent=br(o.l,1)+' m'; $('#vOp').textContent=br(o.p,1)+' m';
    $('#vOh').textContent=br(o.h,1)+' m'; $('#vOr').textContent=o.r+'°';
  }
  const hh=Math.floor(P.hora), mm=Math.round((P.hora-hh)*60);
  $('#relogio').textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
  $('#gripVal').textContent=(CONT.mod||0)+' mód · '+br((CONT.mod||0)*MOD.Wp/1000,2)+' kWp';
  const mapa={'#tipos':P.tipo,'#aguas':String(P.aguas),'#ori':P.ori,'#fix':P.fix,
    '#orientPre':String(P.azi),'#datas':String(P.dia),'#locais':`${P.lat},${P.lon}`};
  for(const sel in mapa) document.querySelectorAll(sel+' .chip').forEach(c=>
    c.classList.toggle('on', c.dataset.k===mapa[sel]));
  document.querySelectorAll('#show .chip').forEach(c=>c.classList.toggle('on', P[c.dataset.k]));
  document.querySelectorAll('#mapaTgl .chip').forEach(c=>c.classList.toggle('on', P.mapa));
  document.querySelectorAll('#mapaZoom .chip').forEach(c=>
    c.classList.toggle('on', c.dataset.k===String(P.mapaZ)));
  document.querySelectorAll('#mapaFonte .chip').forEach(c=>
    c.classList.toggle('on', c.dataset.k===P.mapaFonte));
  $('#fixNota').textContent=FIXES[fixAtual()];
  $('#notaFileira').innerHTML = CONT.passoMin
    ? `Em plano, o afastamento mínimo para não sombrear ao meio-dia de inverno é `+
      `<b>${br(CONT.passoMin,2)} m</b>${P.gv < CONT.passoMin
        ? ' <span class="al">— o valor atual é menor, o simulador está usando o mínimo.</span>' : '.'}`
    : 'Sobre telhado inclinado as fileiras podem ficar coladas; em plano o mínimo por sombra é aplicado automaticamente.';
}
function fixAtual(){ return P.fix==='auto' ? TIPOS[P.tipo].fix : P.fix; }

function atualizarHUD(s){
  const kWp=CONT.mod*MOD.Wp/1000, som=CONT.sombreados;
  const pct=CONT.mod?Math.round(100*som/CONT.mod):0;
  $('#hud').innerHTML=
    `<span class="kwp">${CONT.mod} MÓDULOS · ${br(kWp,2)} kWp</span><br>`+
    `SOL <b>${br(s.alt,1)}°</b> alt · <b>${br(s.azi,0)}°</b> ${bussola(s.azi)}<br>`+
    `INCIDÊNCIA <b>${br(CONT.incid*100,0)}%</b><br>`+
    (PERDAS.valido ? `PERDA ANUAL POR SOMBRA <b>${br(PERDAS.total*100,1)}%</b><br>` : '')+
    (s.alt<=0 ? `<span class="warn">SOL ABAIXO DO HORIZONTE</span>`
     : som ? `<span class="warn">${som} MÓDULO${som>1?'S':''} SOMBREADO${som>1?'S':''} (${pct}%)</span>`
           : `SEM SOMBRA NOS MÓDULOS`);
}

/* ---------- estado elétrico derivado do arranjo ---------- */
let ELE = {valido:false};
function calcularEletrico(){
  const n = CONT.mod;
  if(!n){ ELE={valido:false}; return ELE; }
  const cat = CAT.acharModulo(P.moduloId);
  const modulo = cat
    ? {voc:cat.voc, vmp:cat.vmp, isc:cat.isc, imp:cat.imp,
       coefVoc:cat.coefVoc, coefP:cat.coefP, noct:cat.noct, wp:cat.wp}
    : E.parametrosModulo(P.modWp);
  const potCC = n*P.modWp;
  const lista = CAT.inversoresPara(potCC, {trifasico: potCC>8000 ? true : null});
  const inv = P.inversor==='auto'
    ? (lista[0] || CAT.INVERSORES[CAT.INVERSORES.length-1])
    : (CAT.acharInversor(P.inversor) || lista[0] || CAT.INVERSORES[0]);
  const tCelMax = E.tempCelula(P.tMaxAmb, 1000, modulo.noct);
  const arranjo = E.montarArranjo(n, modulo, inv, P.tMin, tCelMax);
  ELE = {valido:true, modulo, inversor:inv, arranjo, potCC, tCelMax};
  return ELE;
}

/* fator de desempenho de um mês, com a temperatura ambiente estimada */
function tempAmbienteMes(m){
  /* variação senoidal em torno da média, defasada para o hemisfério sul */
  const media = 25 - Math.abs(P.lat)*0.25;
  const amplitude = 4 + Math.abs(P.lat)*0.12;
  return media + amplitude*Math.cos(2*Math.PI*(m-0)/12);
}
function prDoMes(m){
  if(!ELE.valido) return 0.80;
  const f = E.fatorDesempenho({
    modulo: ELE.modulo, inversor: ELE.inversor, perdas: P.perdas,
    tempAmbiente: tempAmbienteMes(m), irradiancia: 750,
    fdi: ELE.arranjo.viavel ? ELE.arranjo.fdi : 1
  });
  return f.total;
}

/**
 * Geração mensal — FONTE ÚNICA de energia do simulador.
 *
 * O HSP informado (manual ou medido) é sempre irradiação no plano HORIZONTAL.
 * A transposição para o plano de cada água usa a razão entre a irradiação
 * modelada no plano inclinado e a modelada no horizontal, no mesmo dia.
 * Nunca dividir pelo plano ideal aqui: isso trocaria a referência e inflaria
 * o resultado pelo fator ideal/horizontal (~6% em São Paulo).
 *
 * Devolve { meses[12], porFace: [{meses[12], bruta[12]}], total, media }.
 */
function calcularGeracao(){
  const meses = new Array(12).fill(0);
  const brutos = new Array(12).fill(0);
  const porFace = FACES.map(()=>({meses:new Array(12).fill(0), total:0, bruta:0}));

  FACES.forEach((F,i)=>{
    const n = CONT.porFace[i]||0; if(!n) return;
    const tilt = F.plano ? P.tilt : F.tilt;
    const kwp = n*MOD.Wp/1000;
    for(let m=0;m<12;m++){
      const horizontal = Math.max(0.01, irradDiaC(DIA_REP[m], 0, 0));
      const noPlano = irradDiaC(DIA_REP[m], tilt, F.azi);
      const hspMes = P.hspMes ? P.hspMes[m] : P.hsp;
      const bruta = kwp*hspMes*(noPlano/horizontal)*prDoMes(m)*DIAS_MES[m];
      const perda = (PERDAS.valido && PERDAS.porFaceMes && PERDAS.porFaceMes[i])
        ? PERDAS.porFaceMes[i][m] : 0;
      const liquida = bruta*(1-perda);
      meses[m] += liquida; brutos[m] += bruta;
      porFace[i].meses[m] += liquida;
      porFace[i].total += liquida; porFace[i].bruta += bruta;
    }
  });
  const total = meses.reduce((a,b)=>a+b,0);
  return {meses, brutos, porFace, total, media: total/12,
          bruta: brutos.reduce((a,b)=>a+b,0)};
}
const geracaoMensal = () => calcularGeracao().meses;
function desenharGrafico(){
  const meses = calcularGeracao().meses;
  const max = Math.max(...meses, 1);
  const total = meses.reduce((a,b)=>a+b,0);
  const media = total/12;
  $('#grafMes').innerHTML = meses.map((v,m)=>
    `<div class="mes${v>=media?' alto':''}"><span class="m">${NOME_MES[m]}</span>`+
    `<div class="ba"><i style="width:${(v/max*100).toFixed(1)}%"></i></div>`+
    `<span class="kw">${br(v,0)}</span></div>`).join('');
  const iMax = meses.indexOf(Math.max(...meses)), iMin = meses.indexOf(Math.min(...meses));
  $('#notaMes').innerHTML = total>0
    ? `Total anual <b>${br(total,0)} kWh</b> · média <b>${br(media,0)} kWh/mês</b>.<br>`+
      `Melhor mês ${NOME_MES[iMax]} (${br(meses[iMax],0)}), pior ${NOME_MES[iMin]} `+
      `(${br(meses[iMin],0)}) — variação de <b>${br((meses[iMax]/Math.max(1,meses[iMin])-1)*100,0)}%</b>. `+
      (PERDAS.valido ? 'Sombreamento aplicado mês a mês.'
                     : '<span class="al">Sem sombreamento aplicado.</span>')
    : 'Posicione módulos para ver a curva mensal.';
  return {meses, total};
}

function PR_MEDIO(){
  let s=0; for(let m=0;m<12;m++) s+=prDoMes(m);
  return s/12;
}
function atualizarResumo(){
  calcularEletrico();
  atualizarEletrico();
  const kWp=CONT.mod*MOD.Wp/1000;
  $('#rKwp').innerHTML=br(kWp,2)+'<small>kWp</small>';

  const G = calcularGeracao();
  const ger = G.media, gerSem = G.bruta/12;
  const linhasF=[];
  FACES.forEach((F,i)=>{
    const n=CONT.porFace[i]||0;
    if(!n) return;
    const tilt = F.plano ? P.tilt : F.tilt;
    const f = fatorPlano(tilt, F.azi);
    const som = PERDAS.valido ? (PERDAS.porFace[i]||0) : 0;
    linhasF.push(`<tr><td>${F.nome} <span class="k">${br(F.azi,0)}° ${bussola(F.azi)}</span></td>`+
      `<td>${br(f*100,0)}%</td>`+
      `<td>${PERDAS.valido ? '−'+br(som*100,1)+'%' : '—'}</td>`+
      `<td>${br(G.porFace[i].total/12,0)}</td></tr>`);
  });
  $('#tFaces').innerHTML = linhasF.length ? linhasF.join('')
    : '<tr><td colspan="4">Nenhum módulo posicionado</td></tr>';

  $('#notaSombra').innerHTML = PERDAS.valido
    ? `Perda média por sombra: <b>${br(PERDAS.total*100,1)}%</b> `+
      `(${br(gerSem-ger,0)} kWh/mês). Varredura de 12 dias × ${PERDAS.horas} passos, `+
      `3 amostras por módulo. Considera platibanda, caixas, árvores, prédios e as `+
      `próprias fileiras entre si.`
    : (CONT.mod ? '<span class="al">Perdas por sombra não calculadas para o arranjo atual.</span> '+
        'A geração abaixo ainda ignora o entorno — toque no botão.'
      : 'Posicione módulos primeiro.');

  const fIdeal = fatorPlano(Math.abs(P.lat), P.lat<0?0:180);
  $('#rGer').innerHTML=
    `${CONT.mod} módulos de ${P.modWp} W · <b>${br(CONT.mod*MOD.kg,0)} kg</b><br>`+
    `Geração estimada <b>${br(ger,0)} kWh/mês</b> — `+
    (P.hspMes ? `irradiação medida (${P.fonteHsp})` : `HSP ${br(P.hsp,2)} estimado`)+
    `, desempenho ${br(PR_MEDIO()*100,1)}%`+
    (PERDAS.valido && PERDAS.total>0.001
      ? `, já descontando <b>${br(PERDAS.total*100,1)}%</b> de sombra.` : '.')+`<br>`+
    `Inclinação ideal para a latitude: <b>${br(Math.abs(P.lat),0)}°</b> voltada ao `+
    `<b>${P.lat<0?'norte':'sul'}</b> (fator 100%).`;

  const f=fixAtual();
  const nomeFix={gancho:'Gancho para telha',prisioneiro:'Parafuso prisioneiro',
    minitrilho:'Mini-trilho',triangulo:'Triângulo perfil reforçado'}[f];
  const ehTri = fixAtual()==='triangulo';
  const itens=[
    [`Módulo <span class="k">${P.modWp} Wp</span>`, `${P.modL}×${P.modW} mm`, CONT.mod],
    ['Perfil / trilho', br(CONT.trilho,1)+' m','—']
  ];
  if(ehTri){
    itens.push(['Triângulo montado','conjunto A+B',CONT.triangulos]);
    itens.push(['Sapata de concreto','250×250×200 mm',CONT.fix]);
    itens.push(['Chapa de base','150×90 mm',CONT.fix]);
  } else {
    itens.push([nomeFix,'—',CONT.fix]);
  }
  itens.push(['Grampo intermediário','—',Math.max(0,CONT.mod*2-CONT.fileiras*2)]);
  itens.push(['Grampo final','—',CONT.fileiras*4]);
  itens.push(['Fileiras','—',CONT.fileiras]);
  $('#bom').innerHTML=itens.map(l=>`<tr><td>${l[0]}</td><td>${l[1]}</td><td>${l[2]}</td></tr>`).join('');

  desenharGrafico();
  $('#rNota').innerHTML=
    `Área de módulos <b>${br(CONT.mod*MOD.L*MOD.W,1)} m²</b> · `+
    `${TIPOS[P.tipo].n}, ${INFO.plano?'plano':P.aguas+' água(s)'}, azimute ${P.azi}° ${bussola(P.azi)}.<br>`+
    `O fator por água vem de um modelo de céu claro (Hottel) aplicado sobre o HSP que você informar — `+
    `use o valor do CRESESB para o município. Estimativa de anteprojeto: verifique carga de vento `+
    `(NBR 6123) e o manual do fabricante antes de fechar proposta.`;
  sincronizar();
}

/* ===================== CEP ===================== */
gid('cep').addEventListener('keydown', e=>{
  if(e.key==='Enter'){ e.preventDefault(); gid('btnCep').click(); }
});
$('#btnCep').onclick = async ()=>{
  const termo=$('#cep').value.trim();
  const msg=t=>$('#cepMsg').innerHTML=t;
  if(termo.length<4){ msg('Digite rua e número, ou um CEP.'); return; }
  msg('Buscando…');
  try{
    const d = await buscarCEP(termo);
    P.lat=d.lat; P.lon=d.lon;
    $('#lat').value=P.lat; $('#lon').value=P.lon;
    for(const j in cacheHSP) delete cacheHSP[j];
    for(const j in cacheDia) delete cacheDia[j];
    const onde=d.endereco || [d.logradouro,d.bairro].filter(Boolean).join(', ');
    const exato = d.precisao==='coordenada do CEP' || d.precisao==='logradouro';
    msg(`<b>${onde||d.cidade}</b>${onde?' — '+d.cidade:''}/${d.uf}<br>`+
        `lat ${br(P.lat,4)} · lon ${br(P.lon,4)} — precisão: <b>${d.precisao}</b>.`+
        (exato ? '' : ' <span class="al">Confira no satélite e ajuste se precisar.</span>'));
    sincronizar(); reconstruir(); if(P.mapa) carregarMapa();
  }catch(err){
    msg(`Não consegui localizar (${err.message}). Use os presets ou informe `+
        `latitude e longitude na mão — dá para tocar no número e digitar.`);
  }
};

/* ---------- coordenada colada ---------- */
function lerCoordenadas(txt){
  txt=String(txt||'').trim();
  const padroes=[
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,               // .../@-23.54,-46.62,19z
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,           // place/...!3d..!4d..
    /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,       // ?q=lat,lon
    /[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /(-?\d{1,2}[.,]\d{3,})\s*[,;\s]\s*(-?\d{1,3}[.,]\d{3,})/
  ];
  for(const p of padroes){
    const m=txt.match(p);
    if(!m) continue;
    const lat=parseFloat(String(m[1]).replace(',','.'));
    const lon=parseFloat(String(m[2]).replace(',','.'));
    if(isFinite(lat)&&isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180)
      return {lat,lon};
  }
  return null;
}
gid('btnCoord').onclick = ()=>{
  const msg=t=>gid('coordMsg').innerHTML=t;
  const c=lerCoordenadas(gid('coord').value);
  if(!c){ msg('<span class="al">Não reconheci.</span> Cole algo como '+
    '<b>-23.5432, -46.6291</b> ou o link inteiro do Google Maps.'); return; }
  const sl=gid('lat'), sn=gid('lon');
  const lat=Math.min(+sl.max, Math.max(+sl.min, c.lat));
  const lon=Math.min(+sn.max, Math.max(+sn.min, c.lon));
  const cortou = (lat!==c.lat || lon!==c.lon);
  P.lat=lat; P.lon=lon; sl.value=lat; sn.value=lon;
  for(const j in cacheHSP) delete cacheHSP[j];
  for(const j in cacheDia) delete cacheDia[j];
  msg(`Aplicado: <b>${br(P.lat,5)}, ${br(P.lon,5)}</b>.`+
    (cortou?' <span class="al">Fora da faixa do Brasil — ajustei para o limite.</span>':
     ' Ligue o satélite e gire o azimute até bater com a foto.'));
  sincronizar(); reconstruir();
  if(!P.mapa){ P.mapa=true; sincronizar(); }
  carregarMapa();
};
gid('coord').addEventListener('keydown', e=>{
  if(e.key==='Enter'){ e.preventDefault(); gid('btnCoord').click(); }
});

/* ===================== abas / painel ===================== */
document.querySelectorAll('#tabs button').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('#tabs button').forEach(x=>x.classList.remove('on'));
    document.querySelectorAll('.pane').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    gid('p-'+b.dataset.p).classList.add('on');
    $('#panel').classList.add('open');
  };
});
$('#grip').addEventListener('click',()=>$('#panel').classList.toggle('open'));

gid('btnSombra').onclick = ()=>{
  const b=gid('btnSombra');
  b.textContent='Calculando…'; b.disabled=true;
  setTimeout(()=>{
    const t0=performance.now();
    calcularPerdasAnuais();
    const ms=Math.round(performance.now()-t0);
    b.textContent='Recalcular perdas por sombra'; b.disabled=false;
    atualizarResumo();
    $('#notaSombra').innerHTML += ` <span style="opacity:.6">(${ms} ms)</span>`;
  }, 60);
};
gid('undo').onclick = desfazer;
const VELS=[0.5,1,2,4,8,16]; let iVel=1;
gid('vel').onclick = ()=>{
  iVel=(iVel+1)%VELS.length;
  gid('vel').textContent=VELS[iVel]+'×';
};
let tocando=false;
$('#play').onclick=()=>{
  tocando=!tocando;
  $('#play').textContent=tocando?'❚❚':'▶';
  $('#play').classList.toggle('on',tocando);
};

/* ===================== câmera ===================== */
const orb={alvo:new THREE.Vector3(0,2,0), raio:34, theta:-0.9, phi:1.05};
function posicionaCamera(){
  orb.phi=Math.max(.08,Math.min(1.55,orb.phi));
  orb.raio=Math.max(4,Math.min(600,orb.raio));
  camera.position.set(
    orb.alvo.x+orb.raio*Math.sin(orb.phi)*Math.cos(orb.theta),
    orb.alvo.y+orb.raio*Math.cos(orb.phi),
    orb.alvo.z+orb.raio*Math.sin(orb.phi)*Math.sin(orb.theta));
  camera.lookAt(orb.alvo);
}
let arr=false,px=0,py=0,pinch=0,mov=0,downX=0,downY=0,panDrag=false,doisDedos=null;
const cv=renderer.domElement;
cv.addEventListener('pointerdown',e=>{
  px=downX=e.clientX; py=downY=e.clientY; mov=0;
  cv.setPointerCapture(e.pointerId);
  if(medindo){ arr=false; return; }
  if(moverCasa){ arrastoCasa=pegarCasa(e.clientX,e.clientY); arr=false;
    cv.style.cursor='grabbing'; return; }
  if(panMode || e.button===2 || e.shiftKey){ arr=false; panDrag=true; return; }
  const pego = pegarObstaculo(e.clientX, e.clientY);
  if(pego){ arrastando=pego; arr=false; cv.style.cursor='grabbing'; return; }
  arr=true;
});
cv.addEventListener('pointerup',e=>{
  cv.style.cursor='';
  if(arrastoCasa){
    arrastoCasa=null; arr=false;
    gid('casax').value=P.casaX;
    gid('casaz').value=P.casaZ;
    reconstruir(); sincronizar();
    return;
  }
  if(panDrag){ panDrag=false; arr=false; return; }
  if(arrastando){
    if(mov<7){ obsSel=arrastando.idx; arrastando=null; listarObstaculos(); sincronizar(); }
    else soltarArrasto();
    arr=false; return;
  }
  arr=false;
  if(mov<7){
    if(medindo) medirNoPonto(e.clientX,e.clientY);
    else selecionarNoPonto(e.clientX,e.clientY);
  }
});
cv.addEventListener('pointermove',e=>{
  mov+=Math.abs(e.clientX-px)+Math.abs(e.clientY-py);
  if(arrastoCasa){ moverCasaPara(e.clientX,e.clientY); px=e.clientX; py=e.clientY; return; }
  if(panDrag){ deslocarCena(-(e.clientX-px), -(e.clientY-py)); px=e.clientX; py=e.clientY; return; }
  if(arrastando){ px=e.clientX; py=e.clientY; moverArrasto(e.clientX,e.clientY); return; }
  if(!arr) return;
  orb.theta-=(e.clientX-px)*0.006; orb.phi-=(e.clientY-py)*0.005;
  px=e.clientX; py=e.clientY; posicionaCamera();
});
cv.addEventListener('wheel',e=>{e.preventDefault(); orb.raio*=1+e.deltaY*0.0012; posicionaCamera();},{passive:false});
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('touchstart',e=>{
  if(e.touches.length===2){
    pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                     e.touches[0].clientY-e.touches[1].clientY); arr=false;
  }
},{passive:true});
cv.addEventListener('touchmove',e=>{
  if(e.touches.length===2){
    const dd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                        e.touches[0].clientY-e.touches[1].clientY);
    const mx=(e.touches[0].clientX+e.touches[1].clientX)/2;
    const my=(e.touches[0].clientY+e.touches[1].clientY)/2;
    if(pinch) orb.raio*=pinch/dd;
    if(doisDedos) deslocarCena(-(mx-doisDedos.x), -(my-doisDedos.y));
    pinch=dd; doisDedos={x:mx,y:my};
    posicionaCamera();
  }
},{passive:true});
cv.addEventListener('touchend',()=>{pinch=0; doisDedos=null;},{passive:true});
function enquadrar(){
  orb.alvo.set(P.casaX, P.pd*0.55+1, P.casaZ);
  orb.raio=Math.max(16,Math.max(P.comp,P.larg,P.pd*1.4)*2.1);
  posicionaCamera();
}

/* ===================== vistas predefinidas ===================== */
const VISTAS = {
  iso:   {theta:-0.90, phi:1.05},
  topo:  {theta:-1.57, phi:0.05},
  norte: {theta:-1.57, phi:1.35},
  sul:   {theta: 1.57, phi:1.35},
  leste: {theta: 0.00, phi:1.35},
  oeste: {theta: 3.14, phi:1.35}
};
function irParaVista(k){
  const v=VISTAS[k]; if(!v) return;
  orb.theta=v.theta; orb.phi=v.phi;
  orb.alvo.set(P.casaX, P.pd*0.5+0.5, P.casaZ);
  orb.raio=Math.max(14, Math.max(P.comp,P.larg,P.pd*1.3)*(k==='topo'?1.5:2.0));
  posicionaCamera();
}
document.querySelectorAll('#viewbar button').forEach(b=>{
  b.onclick=()=>{
    const k=b.dataset.v;
    if(k==='centro'){ enquadrar(); return; }
    if(k==='casa'){
      moverCasa=!moverCasa;
      b.classList.toggle('on', moverCasa);
      if(moverCasa){
        panMode=false; $('#btnMover').classList.remove('on');
        medindo=false; $('#btnMedir').classList.remove('on'); limparMedida();
      }
      return;
    }
    if(k==='mover'){
      panMode=!panMode;
      b.classList.toggle('on', panMode);
      if(panMode && medindo){ medindo=false; $('#btnMedir').classList.remove('on'); limparMedida(); }
      return;
    }
    if(k==='medir'){
      medindo=!medindo;
      b.classList.toggle('on', medindo);
      if(medindo && panMode){ panMode=false; $('#btnMover').classList.remove('on'); }
      if(!medindo) limparMedida();
      else $('#medida').innerHTML='Toque em dois pontos da cena para medir.',
           $('#medida').classList.add('on');
      return;
    }
    document.querySelectorAll('#viewbar button').forEach(x=>{
      if(x.dataset.v!=='medir') x.classList.remove('on');
    });
    b.classList.add('on');
    irParaVista(k);
  };
});

let panMode=false, moverCasa=false, arrastoCasa=null;
function deslocarCena(dx, dy){
  const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
  const dir2=new THREE.Vector3(dir.x,0,dir.z).normalize();
  const lado=new THREE.Vector3().crossVectors(dir2, new THREE.Vector3(0,1,0)).normalize();
  const esc=orb.raio*0.0018;
  orb.alvo.add(lado.multiplyScalar(dx*esc)).add(dir2.multiplyScalar(-dy*esc));
  posicionaCamera();
}

function pegarCasa(cx,cy){
  const r=new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1), camera);
  const alvo=new THREE.Vector3();
  if(!r.ray.intersectPlane(new THREE.Plane(EIXO_Y,0), alvo)) return null;
  return {off:new THREE.Vector3(P.casaX-alvo.x, 0, P.casaZ-alvo.z)};
}
function moverCasaPara(cx,cy){
  const r=new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1), camera);
  const alvo=new THREE.Vector3();
  if(!r.ray.intersectPlane(new THREE.Plane(EIXO_Y,0), alvo)) return;
  P.casaX=+(alvo.x+arrastoCasa.off.x).toFixed(2);
  P.casaZ=+(alvo.z+arrastoCasa.off.z).toFixed(2);
  gCasa.position.set(P.casaX,0,P.casaZ);
}

/* ===================== régua ===================== */
let medindo=false, pontosMed=[];
const gMedida=new THREE.Group(); scene.add(gMedida);
function limparMedida(){
  pontosMed=[];
  while(gMedida.children.length){
    const o=gMedida.children.pop();
    if(o.geometry) o.geometry.dispose();
    if(o.material && o.material.map) o.material.map.dispose();
  }
  $('#medida').classList.remove('on');
}
function alvosCena(){
  const a=[];
  scene.traverse(o=>{ if(o.isMesh && o!==esferaSol && o!==chao) a.push(o); });
  a.push(chao);
  return a;
}
function medirNoPonto(cx,cy){
  const r=new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1), camera);
  const h=r.intersectObjects(alvosCena(), false);
  if(!h.length) return;
  if(pontosMed.length>=2) limparMedida(), $('#medida').classList.add('on');
  pontosMed.push(h[0].point.clone());
  desenharMedida();
}
function desenharMedida(){
  while(gMedida.children.length){
    const o=gMedida.children.pop();
    if(o.geometry) o.geometry.dispose();
  }
  for(const p of pontosMed){
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.09,12,12),
      new THREE.MeshBasicMaterial({color:0x49c6c0}));
    m.position.copy(p); gMedida.add(m);
  }
  $('#medida').classList.add('on');
  if(pontosMed.length<2){
    $('#medida').innerHTML='Primeiro ponto marcado. Toque no segundo.';
    return;
  }
  const [a,b]=pontosMed;
  gMedida.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),
    new THREE.LineBasicMaterial({color:0x49c6c0})));
  const d=a.distanceTo(b);
  const dh=Math.hypot(b.x-a.x, b.z-a.z);
  const dv=Math.abs(b.y-a.y);
  $('#medida').innerHTML =
    `DISTÂNCIA <b>${br(d,2)} m</b><br>`+
    `horizontal <b>${br(dh,2)} m</b> · vertical <b>${br(dv,2)} m</b><br>`+
    `<span style="opacity:.7">toque de novo para nova medida</span>`;
}

/* ===================== arrastar obstáculos ===================== */
let arrastando=null;
function grupoObstaculo(obj){
  let o=obj;
  while(o){ if(o.userData && o.userData.obs!==undefined) return o; o=o.parent; }
  return null;
}
function pegarObstaculo(cx,cy){
  const r=new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1), camera);
  const h=r.intersectObjects(gObs.children, true);
  if(!h.length) return null;
  const g=grupoObstaculo(h[0].object);
  if(!g) return null;
  const idx=OBS.findIndex(o=>o.id===g.userData.obs);
  if(idx<0) return null;
  const plano=new THREE.Plane(new THREE.Vector3(0,1,0), -g.position.y);
  const alvo=new THREE.Vector3();
  if(!r.ray.intersectPlane(plano, alvo)) return null;
  return {g, idx, off:new THREE.Vector3().subVectors(g.position, alvo), y:g.position.y};
}
function moverArrasto(cx,cy){
  const r=new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1), camera);
  const plano=new THREE.Plane(new THREE.Vector3(0,1,0), -arrastando.y);
  const alvo=new THREE.Vector3();
  if(!r.ray.intersectPlane(plano, alvo)) return;
  arrastando.g.position.x = alvo.x + arrastando.off.x;
  arrastando.g.position.z = alvo.z + arrastando.off.z;
}
function soltarArrasto(){
  if(!arrastando) return;
  const o=OBS[arrastando.idx], g=arrastando.g;
  let x=g.position.x, z=g.position.z;
  if(OBSTIPOS[o.tipo].telhado){          // volta ao referencial da casa
    const l=paraCasa(new THREE.Vector3(x,0,z));
    x=l.x; z=l.z;
  }
  o.x=+x.toFixed(2); o.z=+z.toFixed(2);
  obsSel=arrastando.idx;
  arrastando=null;
  reconstruir(); listarObstaculos(); sincronizar();
}

/* ===================== minimizar painel ===================== */
gid('fechar').onclick = e=>{
  e.stopPropagation();
  $('#panel').classList.add('oculto');
  $('#abrir').classList.add('on');
};
gid('abrir').onclick = ()=>{
  $('#panel').classList.remove('oculto');
  $('#panel').classList.add('open');
  $('#abrir').classList.remove('on');
};

/* ===================== projeto: salvar e carregar ===================== */
let projetoAtual = {id:null, nome:'', cliente:'', data:'', nota:''};

/* Checagem de integridade: se src/nucleo/projetos.js não for o módulo certo,
   avisa em bom português em vez de estourar um erro críptico. */
const PJ_OK = typeof PJ.salvarProjeto === 'function'
           && typeof PJ.listarProjetos === 'function';
if(!PJ_OK){
  console.error('Solaris: src/nucleo/projetos.js não exporta as funções esperadas.');
}
function exigirPJ(){
  if(PJ_OK) return true;
  gid('pjMsg').innerHTML =
    '<span class="al">O arquivo src/nucleo/projetos.js não é o correto.</span> '+
    'Ele deve começar com <b>const CHAVE = \'solaris.projetos.v1\'</b>. '+
    'Se começar com <b>const TABELA</b>, esse é o arquivo de API — ele vai em '+
    '<b>api/projetos.js</b>, e os dois foram trocados.';
  return false;
}

/* Estado serializável da simulação. Sets e objetos viram estruturas simples. */
function capturarEstado(){
  return {
    P: {...P, faces:[...P.faces], hspMes:P.hspMes, maxFace:{...P.maxFace},
        perdas:{...P.perdas}},
    OBS: OBS.map(o=>({...o})),
    oriFileira:{...oriFileira},
    ajusteFileira:JSON.parse(JSON.stringify(ajusteFileira)),
    removidos:[...removidos],
    fileirasFora:[...fileirasFora],
    versao:2
  };
}
function aplicarEstado(e){
  if(!e || !e.P) throw new Error('estado vazio');
  Object.keys(e.P).forEach(k=>{
    if(k==='faces') P.faces=new Set(e.P.faces||[0]);
    else if(k==='perdas') P.perdas={...P.perdas, ...e.P.perdas};
    else if(k==='maxFace') P.maxFace={...(e.P.maxFace||{})};
    else P[k]=e.P[k];
  });
  OBS.length=0; (e.OBS||[]).forEach(o=>OBS.push({...o}));
  proxId = OBS.reduce((m,o)=>Math.max(m,o.id||0),0)+1;
  for(const k in oriFileira) delete oriFileira[k];
  Object.assign(oriFileira, e.oriFileira||{});
  for(const k in ajusteFileira) delete ajusteFileira[k];
  Object.assign(ajusteFileira, e.ajusteFileira||{});
  removidos.clear(); (e.removidos||[]).forEach(k=>removidos.add(k));
  fileirasFora.clear(); (e.fileirasFora||[]).forEach(k=>fileirasFora.add(k));
  obsSel = OBS.length?0:-1;

  /* devolve os valores aos controles */
  document.querySelectorAll('input[type=range]').forEach(sl=>{
    const par = PARES[sl.id];
    if(par!==undefined && P[par]!==undefined) sl.value=P[par];
  });
  aplicarModulo();
  if(P.mapa) carregarMapa(); else aplicarTerreno();
  sincronizar(); reconstruir(); listarObstaculos(); enquadrar();
}
const PARES = {comp:'comp',larg:'larg',pd:'pd',incl:'incl',azi:'azi',gu:'gu',gv:'gv',
  ou:'ou',ov:'ov',max:'max',tilt:'tilt',lat:'lat',lon:'lon',dia:'dia',hsp:'hsp',
  mwp:'modWp',ml:'modL',mw:'modW',mk:'modK',bei:'beiral',beh:'beiralH',
  casax:'casaX',casaz:'casaZ',murh:'murH',murw:'murW',tmin:'tMin',tmax:'tMaxAmb'};

function montarProjeto(){
  return {
    id: projetoAtual.id,
    nome: gid('pjNome').value.trim() || 'Sem nome',
    cliente: gid('pjCliente').value.trim(),
    data: gid('pjData').value.trim() || new Date().toISOString().slice(0,10),
    nota: gid('pjNota').value.trim(),
    potencia: +(CONT.mod*MOD.Wp/1000).toFixed(2),
    modulos: CONT.mod,
    estado: capturarEstado()
  };
}

gid('pjSalvar').onclick = async ()=>{
  if(!exigirPJ()) return;
  try{
    const p = PJ.salvarProjeto(montarProjeto());
    projetoAtual = {id:p.id, nome:p.nome};
    gid('pjMsg').innerHTML = `Salvo: <b>${p.nome}</b> · ${p.modulos} módulos · `+
      `${br(p.potencia,2)} kWp.`;
    listarProjetos();
    const r = await PJ.sincronizar(p);
    gid('pjMsg').innerHTML += r.ok
      ? ' <b>Enviado para a nuvem</b> — dá para abrir em outro aparelho.'
      : ` <span style="opacity:.7">Salvo só neste aparelho.</span>`+
        `<br><span class="al">Nuvem: ${r.motivo}</span>`+
        (r.dica ? `<br>${r.dica}` : '')+
        `<br><span style="opacity:.6">Diagnóstico: abra `+
        `<b>/api/projetos?diagnostico=1</b> no navegador.</span>`;
  }catch(err){
    gid('pjMsg').innerHTML = `<span class="al">Não consegui salvar:</span> ${err.message}`;
  }
};

gid('pjNovo').onclick = ()=>{
  projetoAtual={id:null,nome:'',cliente:'',data:'',nota:''};
  ['pjNome','pjCliente','pjNota'].forEach(id=>{ gid(id).value=''; });
  gid('pjData').value=new Date().toISOString().slice(0,10);
  gid('pjMsg').textContent='Novo projeto. A simulação atual foi mantida — ajuste e salve.';
};

function listarProjetos(){
  if(!PJ_OK){ exigirPJ(); return; }
  const lista = PJ.listarProjetos();
  const cx = gid('pjLista');
  if(!lista.length){ cx.innerHTML='<div class="note">Nenhum projeto salvo ainda.</div>'; return; }
  cx.innerHTML = `<table><thead><tr><th>Projeto</th><th>kWp</th><th></th></tr></thead><tbody>`+
    lista.map(p=>`<tr><td><span class="k">${p.nome}</span>`+
      (p.cliente?`<br><span style="opacity:.6">${p.cliente}</span>`:'')+
      `<br><span style="opacity:.5;font-size:10px">${String(p.atualizadoEm||'').slice(0,10)}</span></td>`+
      `<td>${br(p.potencia||0,2)}</td>`+
      `<td><button class="chip" data-abrir="${p.id}">abrir</button> `+
      `<button class="chip del" data-apagar="${p.id}">✕</button></td></tr>`).join('')+
    `</tbody></table>`;
  cx.querySelectorAll('[data-abrir]').forEach(b=>b.onclick=()=>{
    try{
      const p = PJ.carregarProjeto(b.dataset.abrir);
      aplicarEstado(p.estado);
      projetoAtual={id:p.id, nome:p.nome};
      gid('pjNome').value=p.nome||''; gid('pjCliente').value=p.cliente||'';
      gid('pjData').value=p.data||''; gid('pjNota').value=p.nota||'';
      gid('pjMsg').innerHTML=`Carregado: <b>${p.nome}</b>.`;
    }catch(err){ gid('pjMsg').innerHTML=`<span class="al">${err.message}</span>`; }
  });
  cx.querySelectorAll('[data-apagar]').forEach(b=>b.onclick=()=>{
    PJ.apagarProjeto(b.dataset.apagar); listarProjetos();
    gid('pjMsg').textContent='Projeto removido.';
  });
}

gid('pjNuvem').onclick = async ()=>{
  const b=gid('pjNuvem'), cx=gid('pjListaNuvem');
  b.disabled=true; b.textContent='Buscando…';
  try{
    const lista = await PJ.listarNuvem();
    if(!lista.length){
      cx.innerHTML='<div class="note">Nenhum projeto na nuvem ainda. '+
        'Salve um projeto para enviá-lo.</div>';
    } else {
      cx.innerHTML=`<table><thead><tr><th>Projeto</th><th>kWp</th><th></th></tr></thead><tbody>`+
        lista.map(p=>`<tr><td><span class="k">${p.nome||p.id}</span>`+
          (p.cliente?`<br><span style="opacity:.6">${p.cliente}</span>`:'')+
          `<br><span style="opacity:.5;font-size:10px">`+
          `${String(p.atualizadoEm||'').slice(0,10)}</span></td>`+
          `<td>${br(p.potencia||0,2)}</td>`+
          `<td><button class="chip" data-nuvem="${p.id}">abrir</button></td></tr>`).join('')+
        `</tbody></table>`;
      cx.querySelectorAll('[data-nuvem]').forEach(bt=>bt.onclick=async ()=>{
        bt.textContent='…';
        try{
          const p = await PJ.baixarNuvem(bt.dataset.nuvem);
          aplicarEstado(p.estado);
          PJ.salvarProjeto(p);
          projetoAtual={id:p.id, nome:p.nome};
          gid('pjNome').value=p.nome||''; gid('pjCliente').value=p.cliente||'';
          gid('pjData').value=(p.data||'').slice(0,10); gid('pjNota').value=p.nota||'';
          listarProjetos();
          gid('pjMsg').innerHTML=`Baixado da nuvem: <b>${p.nome}</b>.`;
        }catch(e){
          gid('pjMsg').innerHTML=`<span class="al">${e.message}</span>`;
        }
        bt.textContent='abrir';
      });
    }
  }catch(err){
    cx.innerHTML=`<div class="note"><span class="al">${err.message}</span><br>`+
      `Se a nuvem ainda não está configurada, defina <b>SUPABASE_URL</b> e `+
      `<b>SUPABASE_KEY</b> nas variáveis de ambiente da Vercel.</div>`;
  }
  b.disabled=false; b.textContent='Buscar projetos da nuvem';
};

gid('pjExportar').onclick = ()=>{
  if(!exigirPJ()) return;
  const p = montarProjeto();
  if(!p.id) p.id = 'projeto-'+Date.now().toString(36);
  PJ.exportarArquivo(p);
  gid('pjMsg').textContent='Arquivo gerado. Guarde junto da proposta do cliente.';
};
gid('pjImportar').onclick = ()=>{ if(exigirPJ()) gid('pjArquivo').click(); };
gid('pjArquivo').onchange = async e=>{
  const f=e.target.files && e.target.files[0]; if(!f) return;
  try{
    const p = await PJ.importarArquivo(f);
    aplicarEstado(p.estado);
    PJ.salvarProjeto(p);
    projetoAtual={id:p.id, nome:p.nome};
    gid('pjNome').value=p.nome||''; gid('pjCliente').value=p.cliente||'';
    gid('pjData').value=p.data||''; gid('pjNota').value=p.nota||'';
    listarProjetos();
    gid('pjMsg').innerHTML=`Importado: <b>${p.nome}</b>.`;
  }catch(err){ gid('pjMsg').innerHTML=`<span class="al">${err.message}</span>`; }
  e.target.value='';
};

/* ===================== modelo 3D importado ===================== */
let modeloGLB=null;
const glb={escala:1, rot:0, y:0};
gid('btnGlb').onclick = ()=> gid('arqGlb').click();
gid('arqGlb').onchange = e=>{
  const f=e.target.files && e.target.files[0]; if(!f) return;
  const nota=gid('notaGlb');
  if(!/\.(glb|gltf)$/i.test(f.name)){
    nota.innerHTML=`<span class="al">"${f.name}" não é GLB nem glTF.</span> `+
      `Formatos CAD (STEP, IFC, SKP, DWG) precisam ser convertidos antes — `+
      `o Blender e o FreeCAD fazem isso de graça.`;
    e.target.value=''; return;
  }
  nota.textContent='Carregando modelo…';
  const url=URL.createObjectURL(f);
  new GLTFLoader().load(url, g=>{
    if(modeloGLB) scene.remove(modeloGLB);
    modeloGLB=g.scene;
    modeloGLB.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    /* normaliza: apoia a base no chão e ajusta a escala para ~10 m */
    const cx=new THREE.Box3().setFromObject(modeloGLB);
    const tam=cx.getSize(new THREE.Vector3());
    const maior=Math.max(tam.x, tam.z) || 1;
    glb.escala = +(12/maior).toFixed(2);
    glb.y = -cx.min.y*glb.escala;
    scene.add(modeloGLB);
    posicionarGLB();
    gid('ctrlGlb').style.display='block';
    gid('glbE').value=glb.escala; gid('glbY').value=glb.y;
    nota.innerHTML=`Modelo carregado · ${br(tam.x,1)} × ${br(tam.z,1)} × ${br(tam.y,1)} `+
      `unidades originais. Escala ajustada para ~12 m — corrija abaixo se souber a medida real.`;
    sincronizar(); tSombra=0;
    URL.revokeObjectURL(url);
  }, undefined, err=>{
    nota.innerHTML=`<span class="al">Não consegui carregar.</span> `+
      `Use GLB ou glTF. Formatos CAD como STEP, IFC ou SKP precisam ser convertidos antes.`;
    URL.revokeObjectURL(url);
  });
  e.target.value='';
};
function posicionarGLB(){
  if(!modeloGLB) return;
  modeloGLB.scale.setScalar(glb.escala);
  modeloGLB.rotation.y = glb.rot*RAD;
  modeloGLB.position.set(P.casaX, glb.y, P.casaZ);
}
[['glbE','escala'],['glbR','rot'],['glbY','y']].forEach(([id,k])=>{
  gid(id).addEventListener('input', e=>{
    glb[k]=+e.target.value; posicionarGLB(); sincronizar(); tSombra=0;
  });
});
gid('glbRemover').onclick = ()=>{
  if(modeloGLB){ scene.remove(modeloGLB); modeloGLB=null; }
  gid('ctrlGlb').style.display='none';
  gid('notaGlb').textContent='Modelo removido.';
  tSombra=0;
};

/* ===================== conta de energia ===================== */
let CONTA=null;
liga('btnConta','onclick', ()=>{ const a=gid('arqConta'); if(a) a.click(); });
liga('arqConta','onchange', async e=>{
  const f=e.target.files && e.target.files[0];
  if(!f) return;
  const out=gid('saidaConta');
  const b=gid('btnConta');
  b.disabled=true; b.textContent='Lendo…';
  out.innerHTML='<div class="note">Enviando a conta para leitura…</div>';
  try{
    const d=await lerConta(f);
    CONTA=d;
    mostrarConta(d);
  }catch(err){
    out.innerHTML=`<div class="cartao alto"><h4>Não consegui ler</h4><p>${err.message}. `+
      `Verifique se a ANTHROPIC_API_KEY está configurada na Vercel e se a foto está legível.</p></div>`;
  }
  b.disabled=false; b.textContent='Enviar outra conta';
  e.target.value='';
});

function mostrarConta(d){
  const media = Number(d.media_kwh || d.consumo_mes_kwh || 0);
  const hsp = P.hspMes ? P.hspMes.reduce((a,b)=>a+b,0)/12 : P.hsp;
  const dim = CAT.dimensionarPorConsumo(media, hsp, P.modWp, PR_MEDIO());
  const trif = d.tipo_ligacao==='trifasica';
  const opcoes = CAT.inversoresPara(dim.potenciaKwp*1000, {trifasico: trif ? true : null}).slice(0,3);

  let h=`<div class="cartao"><span class="tag">${(d.confianca||'').toUpperCase()}</span>`+
    `<h4>${d.titular||'Conta lida'}</h4><p>`+
    `${d.endereco||'—'}${d.bairro?', '+d.bairro:''}<br>`+
    `${d.cidade||''}${d.uf?'/'+d.uf:''} · ${d.distribuidora||'distribuidora não identificada'}<br>`+
    `Ligação ${d.tipo_ligacao||'—'} · classe ${d.classe||'—'}`+
    (d.unidade_consumidora?` · UC ${d.unidade_consumidora}`:'')+`</p></div>`;

  h+=`<div class="cartao"><h4>Consumo</h4><p>`+
    `Mês faturado <b>${br(d.consumo_mes_kwh||0,0)} kWh</b>`+
    (d.valor_total_rs?` · R$ ${br(d.valor_total_rs,2)}`:'')+`<br>`+
    `Média do histórico <b>${br(media,0)} kWh/mês</b>`+
    (d.tarifa_kwh_rs?` · tarifa R$ ${br(d.tarifa_kwh_rs,2)}/kWh`:'')+
    (d.ja_tem_geracao?'<br><span class="al">A conta já indica geração própria.</span>':'')+
    `</p></div>`;

  if(Array.isArray(d.historico_kwh) && d.historico_kwh.length){
    const max=Math.max(...d.historico_kwh.map(x=>+x.kwh||0),1);
    h+=`<div class="lbl">Histórico</div>`+d.historico_kwh.map(x=>
      `<div class="mes"><span class="m">${String(x.mes||'').slice(0,5)}</span>`+
      `<div class="ba"><i style="width:${((+x.kwh||0)/max*100).toFixed(0)}%"></i></div>`+
      `<span class="kw">${br(+x.kwh||0,0)}</span></div>`).join('');
  }

  h+=`<div class="cartao medio"><h4>Sistema sugerido</h4><p>`+
    `<b>${dim.modulos} módulos</b> de ${P.modWp} W = <b>${br(dim.potenciaKwp,2)} kWp</b><br>`+
    `Geração estimada ${br(dim.geracaoEstimada,0)} kWh/mês contra ${br(media,0)} de consumo `+
    `(HSP ${br(hsp,2)}, desempenho ${br(PR_MEDIO()*100,0)}%).</p></div>`;

  if(opcoes.length){
    h+=`<div class="lbl">Inversores compatíveis</div><table><thead><tr>`+
       `<th>Modelo</th><th>kW</th><th>FDI</th></tr></thead><tbody>`+
       opcoes.map(i=>`<tr><td>${i.nome} <span class="k">${i.fases===3?'3F':'1F'}</span></td>`+
       `<td>${br(i.ca/1000,1)}</td><td>${br(i.fdi*100,0)}%</td></tr>`).join('')+
       `</tbody></table>`;
  }

  h+=`<div class="acts"><button class="btn pri" id="aplicarConta">Aplicar ao projeto</button></div>`;
  gid('saidaConta').innerHTML=h;

  gid('aplicarConta').onclick = ()=>{
    P.max=Math.max(1, Math.min(150, dim.modulos));
    gid('max').value=P.max;
    if(opcoes.length){ P.inversor=opcoes[0].id; }
    const alvo=[d.endereco,d.bairro,d.cidade,d.uf].filter(Boolean).join(', ');
    if(alvo){ gid('cep').value=alvo;
      gid('btnCep').click(); }
    sincronizar(); reconstruir();
    gid('saidaConta').insertAdjacentHTML('afterbegin',
      `<div class="cartao"><p>Aplicado: limite de <b>${P.max} módulos</b>`+
      (opcoes.length?` e inversor <b>${opcoes[0].nome}</b>`:'')+
      `. Buscando o endereço no mapa…</p></div>`);
  };
}

/* ===================== importar datasheet ===================== */
function abrirDatasheet(){ const a=gid('arqDatasheet'); if(a && a.click) a.click(); }
gid('btnDatasheet').onclick = abrirDatasheet;
gid('btnDatasheetMod').onclick = abrirDatasheet;

gid('arqDatasheet').onchange = async e=>{
  const f=e.target.files && e.target.files[0];
  if(!f) return;
  const out=gid('saidaDatasheet');
  out.innerHTML='<div class="note">Lendo o datasheet… PDFs longos levam alguns segundos.</div>';
  gid('panel').classList.add('open');
  try{
    const eq=await lerDatasheet(f);
    mostrarDatasheet(eq);
  }catch(err){
    out.innerHTML=`<div class="cartao alto"><h4>Não consegui ler</h4><p>${err.message}. `+
      `Se for um PDF de catálogo com muitos modelos, tente recortar a página de `+
      `especificações técnicas e enviar como imagem.</p></div>`;
  }
  e.target.value='';
};

function mostrarDatasheet(eq){
  const inv = eq.categoria==='inversor';
  const linhas = inv ? [
    ['Potência CA', br(eq.ca/1000,2)+' kW'],
    ['Potência CC máx', eq.ccMax?br(eq.ccMax/1000,2)+' kW':'—'],
    ['Fases', eq.fases===3?'trifásico':'monofásico'],
    ['MPPT', `${eq.mppt||'?'} (${(eq.mppt||0)*(eq.stringsPorMppt||1)} entradas)`],
    ['Tensão CC máx', eq.vMax?eq.vMax+' V':'—'],
    ['Faixa MPPT', (eq.vMin||'?')+' – '+(eq.vMax||'?')+' V'],
    ['Corrente por MPPT', eq.iMaxMppt?eq.iMaxMppt+' A':'—'],
    ['Eficiência', eq.eficiencia?br(eq.eficiencia*100,1)+'%':'—']
  ] : [
    ['Potência', eq.wp+' Wp'],
    ['Dimensões', `${eq.comprimento} × ${eq.largura} mm`],
    ['Peso', eq.peso?br(eq.peso,1)+' kg':'—'],
    ['Voc / Vmp', `${eq.voc} / ${eq.vmp} V`],
    ['Isc / Imp', `${eq.isc} / ${eq.imp} A`],
    ['Coef. Voc', eq.coefVoc+' %/°C'],
    ['Coef. potência', eq.coefP+' %/°C'],
    ['NOCT', eq.noct?eq.noct+' °C':'—']
  ];

  let h=`<div class="cartao"><span class="tag">${(eq.confianca||'').toUpperCase()}</span>`+
    `<h4>${eq.fabricante||''} ${eq.nome||eq.linha||''}</h4>`+
    `<p>Identificado como <b>${inv?'inversor':'módulo'}</b>.</p></div>`+
    `<table><tbody>`+linhas.map(l=>
      `<tr><td>${l[0]}</td><td colspan="2">${l[1]}</td></tr>`).join('')+`</tbody></table>`;

  (eq.avisos||[]).forEach(a=>{ h+=`<div class="cartao medio"><p>${a}</p></div>`; });
  if(eq.observacoes) h+=`<div class="cartao"><h4>Observações</h4><p>${eq.observacoes}</p></div>`;

  const faltando = inv && (!eq.vMax || !eq.vMin || !eq.iMaxMppt);
  h+=`<div class="acts">`+
     `<button class="btn ${faltando?'':'pri'}" id="salvarEq">Adicionar ao catálogo</button>`+
     `<button class="btn" id="verJson">Ver JSON</button></div>`;
  if(faltando) h+=`<div class="note"><span class="al">Faltam dados de tensão ou corrente.</span> `+
     `Dá para salvar, mas a validação de string não vai funcionar direito.</div>`;

  gid('saidaDatasheet').innerHTML=h;

  gid('salvarEq').onclick=()=>{
    CAT.salvarEquipamento(eq);
    if(inv){ P.inversor=eq.id; }
    else {
      P.moduloId=eq.id;
      P.modWp=eq.wp; P.modL=eq.comprimento; P.modW=eq.largura; P.modK=eq.peso||30;
      ['mwp','ml','mw','mk'].forEach((id,i)=>{
        const el=gid(id); if(el) el.value=[eq.wp,eq.comprimento,eq.largura,eq.peso||30][i];
      });
      aplicarModulo();
    }
    gid('saidaDatasheet').innerHTML=
      `<div class="cartao"><h4>Adicionado</h4><p><b>${eq.fabricante} ${eq.nome||eq.linha}</b> `+
      `entrou no catálogo e já está selecionado. Ele fica salvo neste navegador — `+
      `use “Ver JSON” para levar ao catálogo do repositório.</p></div>`;
    sincronizar(); reconstruir();
  };

  gid('verJson').onclick=()=>{
    const limpo={...eq}; delete limpo.avisos; delete limpo.confianca;
    delete limpo.observacoes; delete limpo.categoria;
    const txt=JSON.stringify(limpo,null,2);
    gid('saidaDatasheet').insertAdjacentHTML('beforeend',
      `<div class="lbl">Para o catálogo</div>`+
      `<div class="note" style="white-space:pre-wrap;font-family:'IBM Plex Mono',monospace;`+
      `font-size:10.5px;max-height:220px;overflow:auto;border:1px solid var(--line);`+
      `padding:10px">${txt.replace(/[<>]/g,'')}</div>`+
      `<div class="note">Cole este bloco em <b>src/nucleo/catalogo.js</b>, na lista `+
      `${inv?'INVERSORES':'MODULOS'}, para virar catálogo oficial de todos os projetos.</div>`);
  };
}

/* ===================== painel elétrico ===================== */
function atualizarEletrico(){
  const cx=gid('invLista');
  if(!cx) return;

  chips(cx, [['auto','Automático'], ...CAT.INVERSORES.map(i=>[i.id, i.nome])],
    k=>P.inversor===k, k=>{ P.inversor=k; atualizarResumo(); });

  const nota=gid('notaInv');
  const cxs=gid('strings');
  if(!ELE.valido){
    nota.textContent='Posicione módulos para dimensionar.';
    cxs.innerHTML=''; return;
  }
  const i=ELE.inversor, a=ELE.arranjo;
  nota.innerHTML=
    `<b>${i.nome}</b> · ${br(i.ca/1000,2)} kW ${i.fases===3?'trifásico':'monofásico'} · `+
    `${i.mppt} MPPT (${i.mppt*i.stringsPorMppt} entradas) · eficiência ${br(i.eficiencia*100,1)}%<br>`+
    `MPPT de ${i.vMin} a ${i.vMax} V · máximo ${i.iMaxMppt} A por entrada.`;

  if(!a.viavel){
    cxs.innerHTML=`<div class="cartao alto"><h4>Arranjo inviável</h4><p>${a.motivo}</p></div>`;
    return;
  }
  const cor = (a.fdi>1.35||a.fdi<0.85) ? 'medio' : '';
  let h=`<div class="cartao ${cor}"><span class="tag">FDI ${br(a.fdi*100,0)}%</span>`+
    `<h4>${a.strings} string${a.strings>1?'s':''} de ${a.comprimentos.join(' + ')} módulos</h4>`+
    `<p>${br(a.potCC/1000,2)} kWp em CC para ${br(i.ca/1000,2)} kW em CA · `+
    `${a.entradasUsadas} de ${a.entradasTotais} entradas · corrente ${a.correnteTotal} A.</p></div>`;
  const v=a.validacao;
  h+=`<table><thead><tr><th>Verificação</th><th>Valor</th><th>Limite</th></tr></thead><tbody>`+
     `<tr><td>Voc a ${P.tMin} °C</td><td>${br(v.vocFrio,0)} V</td>`+
     `<td>${i.vMax} V (${br(v.vocFrio/i.vMax*100,0)}%)</td></tr>`+
     `<tr><td>Vmp a ${br(ELE.tCelMax,0)} °C</td><td>${br(v.vmpQuente,0)} V</td>`+
     `<td>mín ${i.vMin} V</td></tr>`+
     `<tr><td>Corrente por string</td><td>${br(ELE.modulo.imp,1)} A</td>`+
     `<td>máx ${i.iMaxMppt} A</td></tr></tbody></table>`;
  (a.avisos||[]).forEach(x=>{ h+=`<div class="cartao medio"><p>${x}</p></div>`; });
  cxs.innerHTML=h;

  const pr=PR_MEDIO();
  const fv=E.fatorDesempenho({modulo:ELE.modulo, inversor:i, perdas:P.perdas,
    tempAmbiente:tempAmbienteMes(1), irradiancia:750, fdi:a.fdi});
  const soma=Object.values(P.perdas).reduce((x,y)=>x+y,0);
  gid('notaPR').innerHTML=
    `Desempenho médio anual <b>${br(pr*100,1)}%</b>.<br>`+
    `Perdas somadas ${br(soma,1)}% · inversor ${br(i.eficiencia*100,1)}% · `+
    `no mês mais quente a célula chega a <b>${br(fv.tempCelula,0)} °C</b>, `+
    `custando ${br((1-fv.fatorTemp)*100,1)}% de potência.`+
    (fv.cortePico>0.001?`<br><span class="al">Corte por sobrecarga: ${br(fv.cortePico*100,1)}%.</span>`:'');
}

/* ===================== análise por IA ===================== */
function coletarProjeto(){
  const g = geracaoMensal();
  const faces = [];
  FACES.forEach((F,i)=>{
    const n=CONT.porFace[i]||0; if(!n) return;
    const tilt = F.plano ? P.tilt : F.tilt;
    faces.push({
      nome:F.nome, plano:!!F.plano, azimute_graus:Math.round(F.azi),
      inclinacao_graus:Math.round(tilt), modulos:n,
      area_util_m:[+F.largura.toFixed(2), +F.altura.toFixed(2)],
      fator_orientacao_pct:Math.round(fatorPlano(tilt,F.azi)*100),
      perda_sombra_pct: PERDAS.valido ? +((PERDAS.porFace[i]||0)*100).toFixed(1) : null
    });
  });
  return {
    local:{latitude:P.lat, longitude:P.lon, hsp_referencia:P.hsp},
    superficie:{tipo:TIPOS[P.tipo].n, aguas:INFO.plano?0:P.aguas,
      comprimento_m:P.comp, largura_m:P.larg, pe_direito_m:P.pd,
      inclinacao_telhado_graus:P.incl, azimute_agua1_graus:P.azi,
      beiral_m:P.beiral, platibanda_altura_m:P.tipo==='laje'?P.murH:0},
    modulo:{potencia_wp:P.modWp, comprimento_mm:P.modL, largura_mm:P.modW,
      peso_kg:P.modK, orientacao_padrao:P.ori},
    arranjo:{total_modulos:CONT.mod, potencia_kwp:+(CONT.mod*MOD.Wp/1000).toFixed(2),
      fileiras:CONT.fileiras, inclinacao_triangulo_graus:P.tilt,
      espacamento_lateral_m:P.gu, espacamento_fileiras_m:P.gv,
      recuo_lateral_m:P.ou, recuo_beiral_m:P.ov,
      afastamento_minimo_sombra_m: CONT.passoMin ? +CONT.passoMin.toFixed(2) : null,
      fixacao:FIXES[fixAtual()]},
    faces,
    obstaculos: OBS.map(o=>({tipo:OBSTIPOS[o.tipo].n, sobre_telhado:OBSTIPOS[o.tipo].telhado,
      x_m:o.x, z_m:o.z, largura_m:o.l, profundidade_m:o.p, altura_m:o.h})),
    eletrico: ELE.valido ? {
      inversor: ELE.inversor.nome, potencia_ca_w: ELE.inversor.ca,
      fases: ELE.inversor.fases, mppt: ELE.inversor.mppt,
      arranjo_viavel: ELE.arranjo.viavel,
      strings: ELE.arranjo.viavel ? ELE.arranjo.comprimentos : null,
      fdi_pct: ELE.arranjo.viavel ? Math.round(ELE.arranjo.fdi*100) : null,
      voc_frio_v: ELE.arranjo.viavel ? Math.round(ELE.arranjo.validacao.vocFrio) : null,
      limite_voc_v: ELE.inversor.vMax,
      vmp_quente_v: ELE.arranjo.viavel ? Math.round(ELE.arranjo.validacao.vmpQuente) : null,
      limite_mppt_min_v: ELE.inversor.vMin,
      avisos: ELE.arranjo.avisos || [],
      pr_medio_pct: +(PR_MEDIO()*100).toFixed(1),
      perdas_pct: P.perdas
    } : null,
    perdas:{sombreamento_anual_pct: PERDAS.valido ? +(PERDAS.total*100).toFixed(1) : null,
      calculado: PERDAS.valido},
    geracao:{mensal_kwh:g.map(v=>Math.round(v)),
      anual_kwh:Math.round(g.reduce((a,b)=>a+b,0))}
  };
}

async function chamarIA(prompt){
  const body={model:'claude-sonnet-4-6', max_tokens:1000,
    messages:[{role:'user', content:prompt}]};
  let ultimoErro='';
  for(const url of ['/api/analyze','https://api.anthropic.com/v1/messages']){
    try{
      const r=await fetch(url,{method:'POST',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      if(!r.ok){ ultimoErro='HTTP '+r.status; continue; }
      const d=await r.json();
      const txt=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
      if(txt) return txt;
      ultimoErro='resposta vazia';
    }catch(err){ ultimoErro=err.message; }
  }
  throw new Error(ultimoErro||'sem resposta');
}

function montarPrompt(pergunta){
  const dados=JSON.stringify(coletarProjeto(),null,1);
  return `Você é engenheiro projetista de sistemas fotovoltaicos no Brasil, com experiência em `+
`dimensionamento, sombreamento e normas ABNT. Analise criticamente o projeto abaixo, que veio `+
`de um simulador 3D. Convenções: azimute 0°=Norte, 180°=Sul, sentido horário; hemisfério sul, `+
`portanto o ideal é face norte com inclinação próxima à latitude. O "fator_orientacao_pct" é `+
`relativo ao plano ideal. Perdas de sombra são geométricas (não consideram diodos de bypass).

`+(pergunta ? `Pergunta específica do usuário: "${pergunta}"\n\n` : '')+
`Seja específico e quantitativo. Aponte o que está errado ou subaproveitado, e proponha `+
`mudanças concretas de inclinação, azimute, espaçamento, orientação dos módulos, remoção de `+
`obstáculo ou realocação de fileiras. Não elogie sem motivo. Se algo estiver bem resolvido, `+
`diga em uma linha e siga.

Responda SOMENTE com JSON válido, sem markdown, sem crases, neste formato:
{"diagnostico":"2 a 3 frases sobre o estado geral",
 "notas":[{"titulo":"curto","texto":"analise com numeros","impacto":"alto|medio|baixo"}],
 "acoes":["acao objetiva 1","acao objetiva 2"],
 "riscos":["risco ou verificacao pendente"]}
Máximo 5 notas, 5 ações, 4 riscos.

PROJETO:
${dados}`;
}

function renderIA(txt){
  let d;
  try{
    d=JSON.parse(txt.replace(/```json|```/g,'').trim());
  }catch(e){
    $('#saidaIA').innerHTML=`<div class="cartao"><h4>Resposta</h4><p>${
      txt.replace(/[<>]/g,'')}</p></div>`;
    return;
  }
  let h='';
  if(d.diagnostico) h+=`<div class="cartao"><h4>Diagnóstico</h4><p>${d.diagnostico}</p></div>`;
  (d.notas||[]).forEach(n=>{
    h+=`<div class="cartao ${n.impacto||''}"><span class="tag">${(n.impacto||'').toUpperCase()}</span>`+
       `<h4>${n.titulo||''}</h4><p>${n.texto||''}</p></div>`;
  });
  if((d.acoes||[]).length)
    h+=`<div class="lbl">O que fazer</div><ul class="lista">`+
       d.acoes.map(a=>`<li>${a}</li>`).join('')+`</ul>`;
  if((d.riscos||[]).length)
    h+=`<div class="lbl">Verificar</div><ul class="lista">`+
       d.riscos.map(a=>`<li>${a}</li>`).join('')+`</ul>`;
  $('#saidaIA').innerHTML=h;
}

gid('btnIA').onclick = async ()=>{
  const b=gid('btnIA');
  if(!CONT.mod){ $('#saidaIA').innerHTML='<div class="cartao"><p>Posicione módulos antes de analisar.</p></div>'; return; }
  b.disabled=true; b.textContent='Analisando…';
  $('#saidaIA').innerHTML='<div class="note">Enviando o resumo técnico da simulação…</div>';
  try{
    const txt=await chamarIA(montarPrompt(gid('perguntaIA').value.trim()));
    renderIA(txt);
  }catch(err){
    $('#saidaIA').innerHTML=
      `<div class="cartao alto"><h4>Não consegui chamar a IA</h4><p>${err.message}. `+
      `Dentro do Claude a chamada funciona direto; publicado na Vercel você precisa do seu `+
      `proxy em <b>/api/analyze</b> com a chave da API — o mesmo padrão que você já usa nos `+
      `outros projetos. O código já tenta esse endereço primeiro.</p></div>`;
  }
  b.disabled=false; b.textContent='Analisar projeto';
};

/* ===================== irradiação medida ===================== */
gid('btnIrrad').onclick = async ()=>{
  const b=gid('btnIrrad'), nota=gid('notaIrrad');
  b.disabled=true; b.textContent='Consultando…';
  try{
    const d=await buscarIrradiacao(P.lat.toFixed(4), P.lon.toFixed(4));
    P.hspMes=d.mensal; P.fonteHsp=d.fonte;
    P.hsp=d.media; gid('hsp').value=d.media;
    nota.innerHTML=`<b>${d.fonte}</b><br>Média anual <b>${br(d.media,2)} kWh/m²/dia</b> · `+
      `mínimo ${br(Math.min(...d.mensal),2)} · máximo ${br(Math.max(...d.mensal),2)}.<br>`+
      `A geração mensal passou a usar a irradiação horizontal medida, transposta para o `+
      `plano de cada água pelo modelo. <span id="limparIrrad" style="color:var(--amber);`+
      `cursor:pointer;text-decoration:underline">voltar ao HSP manual</span>`;
    gid('limparIrrad').onclick=()=>{
      P.hspMes=null; P.fonteHsp=null;
      nota.textContent='Voltou ao HSP manual.'; atualizarResumo();
    };
    atualizarResumo();
  }catch(err){
    nota.innerHTML=`<span class="al">Não consegui buscar (${err.message}).</span> `+
      `Em desenvolvimento local rode <b>vercel dev</b>; publicado funciona direto. `+
      `Use o HSP manual do CRESESB enquanto isso.`;
  }
  b.disabled=false; b.textContent='Buscar irradiação real';
};

/* ===================== exportar ===================== */
function baixar(blob,nome){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=nome; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
$('#png').onclick=()=>{
  renderer.render(scene,camera);
  renderer.domElement.toBlob(b=>baixar(b,'solaris-studio-simulacao.png'),'image/png');
};
$('#txt').onclick=()=>{
  const s=solar(P.lat,P.lon,P.tz,P.dia,P.hora);
  const kWp=CONT.mod*MOD.Wp/1000;
  let porFace='';
  FACES.forEach((F,i)=>{
    const n=CONT.porFace[i]||0; if(!n) return;
    const f=fatorPlano(F.plano?P.tilt:F.tilt, F.azi);
    porFace += `  ${F.nome.padEnd(14)} ${String(n).padStart(3)} mód  `+
               `azi ${br(F.azi,0)}°  fator ${br(f*100,0)}%\n`;
  });
  baixar(new Blob([
`SOLARIS STUDIO — Trinity Solaris Brasil\nSimulação de montagem fotovoltaica
------------------------------------------------
Superfície ......... ${TIPOS[P.tipo].n}
Configuração ....... ${INFO.plano?'plano':P.aguas+' água(s)'}
Dimensões .......... ${br(P.comp,1)} x ${br(P.larg,1)} m · pé-direito ${br(P.pd,1)} m
Inclinação ......... ${P.incl}° (módulos em plano: ${P.tilt}°)
Azimute ............ ${P.azi}° ${bussola(P.azi)}
Local .............. lat ${br(P.lat,2)} / lon ${br(P.lon,2)} · HSP ${br(P.hsp,2)}

Módulos ............ ${CONT.mod} x Jinko Tiger Neo 620 Wp
Potência ........... ${br(kWp,2)} kWp
Área ............... ${br(CONT.mod*MOD.L*MOD.W,1)} m²
Fixação ............ ${FIXES[fixAtual()]}
Pontos de fixação .. ${CONT.fix}
Trilho ............. ${br(CONT.trilho,1)} m

Distribuição por água
${porFace}
Obstáculos ......... ${OBS.length ? OBS.map(o=>OBSTIPOS[o.tipo].n).join(', ') : 'nenhum'}

Condição solar em ${dataDoDia(P.dia)} às ${$('#relogio').textContent}
Altura ${br(s.alt,1)}° · azimute ${br(s.azi,0)}° ${bussola(s.azi)}
Perda anual por sombra: ${PERDAS.valido ? br(PERDAS.total*100,1)+'%' : 'nao calculada'}
Incidência no plano: ${br(CONT.incid*100,0)}%
Módulos sombreados: ${CONT.sombreados} de ${CONT.mod}

Estimativa de anteprojeto. Verificar NBR 6123, capacidade estrutural
e manual do fabricante antes da proposta comercial.`],{type:'text/plain'}),'solaris-studio-simulacao.txt');
};

/* ===================== loop ===================== */
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

/* ---------------------------------------------------------------------------
   O laço de desenho começa ANTES da configuração inicial e é protegido.
   Assim, se qualquer etapa de inicialização falhar, a cena continua na tela
   e o erro aparece como aviso — nunca mais tela preta.
   --------------------------------------------------------------------------- */
let ult = 0, falhas = 0;
(function anima(ts){
  requestAnimationFrame(anima);
  try{
    if(tocando){
      P.hora += (ts-ult)*0.0009*VELS[iVel];
      if(P.hora>20) P.hora=4;
      $('#hora').value=P.hora; sincronizar();
    }
    ult=ts;
    posicionarSol(ts);
  }catch(e){
    if(++falhas===1) console.error('Solaris: falha no quadro', e);
  }
  renderer.render(scene, camera);
})(0);

/* ---- configuração inicial, etapa por etapa ---- */
function etapa(nome, fn){
  try{ fn(); }
  catch(e){
    console.error(`Solaris: falha em "${nome}"`, e);
    avisarFalha(nome, e);
  }
}
function avisarFalha(nome, e){
  const hud = document.getElementById('hud');
  if(!hud) return;
  hud.innerHTML += `<br><span style="color:#e0644a">Falha em ${nome}: `+
    `${String(e.message||e).slice(0,70)}</span>`;
}

etapa('módulo e terreno', ()=>{ aplicarModulo(); aplicarTerreno(); });
etapa('controles',        ()=>{ botaoDesfazer(); ativarEdicaoNumerica(); });
etapa('painel',           ()=> sincronizar());
etapa('cena',             ()=> reconstruir());
etapa('obstáculo padrão', ()=> novoObstaculo('cxQuadrada'));
etapa('enquadramento',    ()=>{ enquadrar(); listarObstaculos(); });
etapa('projetos',         ()=>{
  gid('pjData').value = new Date().toISOString().slice(0,10);
  listarProjetos();
});
