import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const $=s=>document.querySelector(s), canvas=$('#game'), status=$('#status');
const scene=new THREE.Scene();scene.background=new THREE.Color(0x87bde8);scene.fog=new THREE.Fog(0x87bde8,28,66);
const camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.1,100); 
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xd9edff,0x71805a,2.0));
const sun=new THREE.DirectionalLight(0xfff3d7,2.0);sun.position.set(-12,22,10);scene.add(sun);

async function loadTexture(name){
 const b64=await fetch('./textures/'+name+'.png.b64').then(r=>{if(!r.ok)throw Error(name);return r.text()});
 const tex=await new THREE.TextureLoader().loadAsync('data:image/png;base64,'+b64.trim());
 tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;return tex;
}
const [grassTex,dirtTex,stoneTex,logTex,leavesTex,planksTex]=await Promise.all(['grass_block','dirt','stone','oak_log','oak_leaves','oak_planks'].map(loadTexture));
const mat=(map,extra={})=>new THREE.MeshLambertMaterial({map,...extra});
const dirt=mat(dirtTex),stone=mat(stoneTex),grassSide=mat(grassTex),grassTop=new THREE.MeshLambertMaterial({color:0x70b94b}),woodSide=mat(logTex),woodEnd=mat(planksTex),leaves=mat(leavesTex,{alphaTest:.35}),sand=new THREE.MeshLambertMaterial({color:0xd9c789});
const materials={grass:[grassSide,grassSide,grassTop,dirt,grassSide,grassSide],dirt,stone,wood:[woodSide,woodSide,woodEnd,woodEnd,woodSide,woodSide],leaves,sand};
const types=['grass','dirt','stone','wood','leaves','sand'], blockGeo=new THREE.BoxGeometry(1,1,1), blocks=new Map(), meshes=new Map();
const key=(x,y,z)=>x+','+y+','+z;
function put(x,y,z,type){const k=key(x,y,z);if(blocks.has(k))return;blocks.set(k,type);const m=new THREE.Mesh(blockGeo,materials[type]||dirt);m.position.set(x,y,z);m.userData={x,y,z};scene.add(m);meshes.set(k,m)}
function remove(x,y,z){const k=key(x,y,z),m=meshes.get(k);if(!m)return;scene.remove(m);meshes.delete(k);blocks.delete(k)}
function height(x,z){return Math.floor(3+Math.sin(x*.22)*1.4+Math.cos(z*.19)*1.3)}
function tree(x,z){const y=height(x,z);for(let i=1;i<=4;i++)put(x,y+i,z,'wood');for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=2;dy<=5;dy++)if(Math.abs(dx)+Math.abs(dz)+(dy===5?1:0)<5)put(x+dx,y+dy,z+dz,'leaves')}
function generate(){for(let x=-14;x<=14;x++)for(let z=-14;z<=14;z++){const h=height(x,z);for(let y=-3;y<=h;y++)put(x,y,z,y===h?'grass':y>h-3?'dirt':'stone');if((Math.abs(x*13+z*7)%91)===0&&Math.abs(x)+Math.abs(z)>5)tree(x,z)}}
generate();
const player={pos:new THREE.Vector3(0,8,9),vel:new THREE.Vector3(),yaw:0,pitch:0,onGround:false},keys={};
const inventory={grass:32,dirt:32,stone:16,wood:8,leaves:8,sand:8};let selected='grass';
const ray=new THREE.Raycaster();function target(){ray.setFromCamera(new THREE.Vector2(0,0),camera);return ray.intersectObjects([...meshes.values()],false)[0]||null}
function updateHUD(){$('#hotbar').innerHTML=types.map((t,i)=>'<div class="slot '+(t===selected?'active':'')+'" data-type="'+t+'"><div class="swatch '+t+'"></div>'+(i+1)+'</div>').join('');document.querySelectorAll('.slot').forEach(el=>el.onclick=()=>{selected=el.dataset.type;updateHUD()})}
updateHUD();
function mine(){const h=target();if(!h)return;const {x,y,z}=h.object.userData,t=blocks.get(key(x,y,z));remove(x,y,z);inventory[t]=(inventory[t]||0)+1;status.textContent='Quebrou '+t+' · '+inventory[t]}
function place(){const h=target();if(!h||!inventory[selected])return;const n=h.face.normal.clone().transformDirection(h.object.matrixWorld),p=h.object.position.clone().add(n),x=Math.round(p.x),y=Math.round(p.y),z=Math.round(p.z);if(Math.abs(x-player.pos.x)<.8&&Math.abs(z-player.pos.z)<.8&&y>=player.pos.y-1&&y<=player.pos.y+1)return;put(x,y,z,selected);inventory[selected]--;status.textContent='Colocou '+selected}
function solid(x,y,z){return blocks.has(key(Math.round(x),Math.round(y),Math.round(z)))}
function physics(dt){const speed=keys.Shift?6:4.2,f=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw)),r=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw)),move=new THREE.Vector3();if(keys.KeyW||keys.ArrowUp)move.add(f);if(keys.KeyS||keys.ArrowDown)move.sub(f);if(keys.KeyD||keys.ArrowRight)move.add(r);if(keys.KeyA||keys.ArrowLeft)move.sub(r);if(move.lengthSq())move.normalize().multiplyScalar(speed);player.vel.x=move.x;player.vel.z=move.z;player.vel.y-=19*dt;const nx=player.pos.x+player.vel.x*dt,nz=player.pos.z+player.vel.z*dt,ny=player.pos.y+player.vel.y*dt;
if(!solid(nx,player.pos.y-.9,player.pos.z)&&!solid(nx,player.pos.y+.1,player.pos.z))player.pos.x=nx;else player.vel.x=0;
if(!solid(player.pos.x,player.pos.y-.9,nz)&&!solid(player.pos.x,player.pos.y+.1,nz))player.pos.z=nz;else player.vel.z=0;
player.onGround=false;if(player.vel.y<=0&&solid(player.pos.x,ny-.9,player.pos.z)){player.pos.y=Math.floor(ny-.9)+1.9;player.vel.y=0;player.onGround=true}else if(player.vel.y>0&&solid(player.pos.x,ny+.1,player.pos.z))player.vel.y=0;else player.pos.y=ny;
if(player.pos.y< -10){player.pos.set(0,9,9);player.vel.set(0,0,0)}camera.position.copy(player.pos);camera.rotation.order='YXZ';camera.rotation.y=player.yaw;camera.rotation.x=player.pitch}
const clock=new THREE.Clock();function loop(){requestAnimationFrame(loop);physics(Math.min(clock.getDelta(),.04));renderer.render(scene,camera)}loop();
addEventListener('keydown',e=>{keys[e.code]=true;if(/^Digit[1-6]$/.test(e.code)){selected=types[+e.code.slice(-1)-1];updateHUD()}if(e.code==='Space'&&player.onGround)player.vel.y=7.2;if(e.code==='KeyF')mine();if(e.code==='KeyG')place()});addEventListener('keyup',e=>keys[e.code]=false);
canvas.addEventListener('click',()=>{if(document.pointerLockElement!==canvas&&matchMedia('(pointer:fine)').matches)canvas.requestPointerLock?.()});document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){player.yaw-=e.movementX*.002;player.pitch=Math.max(-1.4,Math.min(1.4,player.pitch-e.movementY*.002))}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('mousedown',e=>{if(e.button===0)mine();if(e.button===2)place()});
let look=null;$('#look').addEventListener('pointerdown',e=>{look={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId)});$('#look').addEventListener('pointermove',e=>{if(!look)return;player.yaw-=(e.clientX-look.x)*.006;player.pitch=Math.max(-1.4,Math.min(1.4,player.pitch-(e.clientY-look.y)*.006));look={x:e.clientX,y:e.clientY}});$('#look').addEventListener('pointerup',()=>look=null);
document.querySelectorAll('[data-move]').forEach(b=>{const c={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD'}[b.dataset.move];b.addEventListener('pointerdown',e=>{keys[c]=true;b.setPointerCapture(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,()=>keys[c]=false))});
$('#jump').onclick=()=>{if(player.onGround)player.vel.y=7.2};$('#break').onclick=mine;$('#place').onclick=place;
function save(){const data={blocks:[...blocks.entries()],player:{x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw},inventory,selected},req=indexedDB.open('weblab-worlds',1);req.onupgradeneeded=()=>req.result.createObjectStore('worlds');req.onsuccess=()=>{const tx=req.result.transaction('worlds','readwrite');tx.objectStore('worlds').put(data,'slot-1');tx.oncomplete=()=>status.textContent='Mundo salvo'};req.onerror=()=>status.textContent='Erro ao salvar'}
function load(){const req=indexedDB.open('weblab-worlds',1);req.onupgradeneeded=()=>req.result.createObjectStore('worlds');req.onsuccess=()=>{const q=req.result.transaction('worlds').objectStore('worlds').get('slot-1');q.onsuccess=()=>{if(!q.result)return;for(const m of meshes.values())scene.remove(m);blocks.clear();meshes.clear();q.result.blocks.forEach(([k,t])=>{const [x,y,z]=k.split(',').map(Number);put(x,y,z,t)});Object.assign(inventory,q.result.inventory);player.pos.set(q.result.player.x,q.result.player.y,q.result.player.z);player.yaw=q.result.player.yaw;selected=q.result.selected;updateHUD();status.textContent='Mundo carregado'}}}
$('#start').onclick=()=>{$('#menu').style.display='none';load();if(matchMedia('(pointer:fine)').matches)canvas.requestPointerLock?.()};$('#save').onclick=save;$('#reset').onclick=()=>{if(confirm('Criar mundo novo? O salvamento local será substituído.')){indexedDB.deleteDatabase('weblab-worlds');location.reload()}};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.25))});
status.textContent='Texturas reais carregadas · '+blocks.size+' blocos';
