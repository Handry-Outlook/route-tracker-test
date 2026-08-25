const $=(selector,root=document)=>root.querySelector(selector);
const PAGE_TO_TAB={plan:'plan',routes:'saved',weather:'weather'};
let activePage='map';

function forceTab(tabId){
 const target=document.getElementById(`${tabId}-tab`);
 const button=document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
 if(!target||!button)return false;
 document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
 document.querySelectorAll('.tab-btn').forEach(el=>el.classList.remove('active'));
 target.classList.add('active');button.classList.add('active');
 document.getElementById('sidebar')?.classList.add('expanded');
 return true;
}
function activate(name){
 activePage=name;
 document.querySelectorAll('.mobile-page').forEach(el=>el.classList.remove('active'));
 document.querySelectorAll('.app-nav-btn').forEach(el=>el.classList.toggle('active',el.dataset.page===name));
 document.body.classList.toggle('map-focus',name==='map');
 document.body.classList.toggle('utility-page',name==='ride'||name==='friends');
 if(PAGE_TO_TAB[name]){
   forceTab(PAGE_TO_TAB[name]);
   window.handryApp?.openTab?.(PAGE_TO_TAB[name]);
 }
 if(name==='ride'||name==='friends')document.getElementById(`mobile-${name}`)?.classList.add('active');
 requestAnimationFrame(()=>setTimeout(()=>window.handryApp?.getMap?.()?.resize(),60));
}
function ridePage(){return `<section id="mobile-ride" class="mobile-page"><div class="mobile-card"><h2>Record ride</h2><div class="ride-grid"><div><b id="ride-speed">0.0</b><span>km/h</span></div><div><b id="ride-distance">0.00</b><span>km</span></div><div><b id="ride-elevation">0</b><span>m gain</span></div><div><b id="ride-elapsed">00:00:00</b><span>elapsed</span></div><div><b id="ride-total">00:00:00</b><span>total</span></div></div><div class="record-actions"><button id="record-start" class="primary-btn">Start ride</button><button id="record-pause" class="secondary-btn">Pause</button><button id="record-save" class="secondary-btn">Finish & save</button></div><h3>Ride history</h3><div id="ride-history"></div></div></section>`}
function friendsPage(){return `<section id="mobile-friends" class="mobile-page"><div class="mobile-card"><h2>Friends & sharing</h2><p>Keep frequent riding contacts on this device, then share the current route or live tracking link.</p><div class="friend-add"><input id="friend-name" placeholder="Friend name"><input id="friend-contact" placeholder="Email or phone"><button id="friend-add" class="primary-btn">Add</button></div><div id="friend-list"></div><button id="native-share" class="secondary-btn">Share current route</button></div></section>`}
function showAccount(){
 let modal=document.getElementById('account-modal');if(modal)modal.remove();
 modal=document.createElement('div');modal.id='account-modal';modal.className='account-modal';
 const loggedIn=document.getElementById('user-profile')?.style.display!=='none';
 modal.innerHTML=`<div class="account-card"><button class="account-close" aria-label="Close">×</button><h2>Account</h2><div id="account-details">${loggedIn?'<p>You are signed in.</p>':'<p>Sign in to save routes and use live sharing.</p>'}</div><button id="account-action" class="primary-btn">${loggedIn?'Log out':'Login with Google'}</button></div>`;
 document.body.appendChild(modal);modal.querySelector('.account-close').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()};
 modal.querySelector('#account-action').onclick=()=>{(loggedIn?document.getElementById('logout-btn'):document.getElementById('login-btn'))?.click();modal.remove()};
}
function init(){
 if(document.querySelector('.app-navigation'))return;
 const pages=document.createElement('div');pages.id='mobile-pages';pages.innerHTML=ridePage()+friendsPage();document.body.appendChild(pages);
 const nav=document.createElement('nav');nav.className='app-navigation';nav.setAttribute('aria-label','Main navigation');
 nav.innerHTML=`<div class="app-nav-brand"><img src="Handry_outlook_icon_pride (1).png" alt=""><b>Handry</b></div>`+[['map','map','Map'],['plan','edit-3','Plan'],['routes','bookmark','Routes'],['ride','activity','Record'],['weather','cloud-rain','Weather'],['friends','users','Friends'],['account','user','Account']].map(([page,icon,label])=>`<button class="app-nav-btn" data-page="${page}" aria-label="${label}"><i data-feather="${icon}"></i><span>${label}</span></button>`).join('');
 document.body.appendChild(nav);nav.onclick=e=>{const button=e.target.closest('.app-nav-btn');if(!button)return;if(button.dataset.page==='account')showAccount();else activate(button.dataset.page)};
 const helper=document.createElement('button');helper.id='edit-route-fab';helper.className='map-overlay-btn';helper.innerHTML='<i data-feather="map-pin"></i>';helper.title='Tap map to add a shaping waypoint';document.body.appendChild(helper);
 helper.onclick=()=>{const map=window.handryApp?.getMap?.();if(!map)return;helper.classList.add('active');map.once('click',e=>{window.handryApp?.insertWaypoint?.([e.lngLat.lng,e.lngLat.lat]);helper.classList.remove('active')})};
 setupRecorder();setupFriends();window.feather?.replace();activate('map');
}
let rec={active:false,paused:false,start:0,pauseStarted:0,pausedMs:0,distance:0,gain:0,last:null,samples:[]};
const fmt=ms=>new Date(Math.max(0,ms)).toISOString().slice(11,19);
function setupRecorder(){const render=()=>{const rides=JSON.parse(localStorage.getItem('handry_rides')||'[]');$('#ride-history').innerHTML=rides.map(r=>`<div class="history-row"><b>${new Date(r.date).toLocaleDateString()}</b><span>${r.distance.toFixed(2)} km · ${fmt(r.elapsed)} · ${Math.round(r.gain)} m</span></div>`).join('')||'<p class="empty-state">No recorded rides yet.</p>'};render();$('#record-start').onclick=()=>{rec={active:true,paused:false,start:Date.now(),pauseStarted:0,pausedMs:0,distance:0,gain:0,last:null,samples:[]}};$('#record-pause').onclick=()=>{if(!rec.active)return;rec.paused=!rec.paused;if(rec.paused)rec.pauseStarted=Date.now();else rec.pausedMs+=Date.now()-rec.pauseStarted;$('#record-pause').textContent=rec.paused?'Resume':'Pause'};$('#record-save').onclick=()=>{if(!rec.active)return;const elapsed=Date.now()-rec.start-rec.pausedMs,rides=JSON.parse(localStorage.getItem('handry_rides')||'[]');rides.unshift({date:new Date().toISOString(),distance:rec.distance,gain:rec.gain,elapsed,total:Date.now()-rec.start,samples:rec.samples});localStorage.setItem('handry_rides',JSON.stringify(rides.slice(0,50)));rec.active=false;render()};window.addEventListener('handry-position',e=>{const d=e.detail;if(!rec.active||rec.paused)return;if(rec.last){rec.distance+=turf.distance(rec.last.coords,d.coords);if(Number.isFinite(d.elevation)&&Number.isFinite(rec.last.elevation)&&d.elevation>rec.last.elevation)rec.gain+=d.elevation-rec.last.elevation}rec.last=d;rec.samples.push(d);$('#ride-speed').textContent=((d.speed||0)*3.6).toFixed(1);$('#ride-distance').textContent=rec.distance.toFixed(2);$('#ride-elevation').textContent=Math.round(rec.gain)});setInterval(()=>{if(rec.active){$('#ride-elapsed').textContent=fmt(Date.now()-rec.start-rec.pausedMs-(rec.paused?Date.now()-rec.pauseStarted:0));$('#ride-total').textContent=fmt(Date.now()-rec.start)}},1000)}
function setupFriends(){const render=()=>{const friends=JSON.parse(localStorage.getItem('handry_friends')||'[]');$('#friend-list').innerHTML=friends.map((f,i)=>`<div class="history-row"><b>${f.name}</b><span>${f.contact}</span><button data-i="${i}">×</button></div>`).join('')||'<p class="empty-state">No friends added yet.</p>';$('#friend-list').onclick=e=>{if(e.target.dataset.i!==undefined){friends.splice(+e.target.dataset.i,1);localStorage.setItem('handry_friends',JSON.stringify(friends));render()}}};render();$('#friend-add').onclick=()=>{const friends=JSON.parse(localStorage.getItem('handry_friends')||'[]'),name=$('#friend-name').value.trim(),contact=$('#friend-contact').value.trim();if(name){friends.push({name,contact});localStorage.setItem('handry_friends',JSON.stringify(friends));render()}};$('#native-share').onclick=async()=>{const data={title:'Handry Outlook route',text:'Join my cycling route',url:location.href};if(navigator.share)await navigator.share(data);else await navigator.clipboard.writeText(location.href)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
