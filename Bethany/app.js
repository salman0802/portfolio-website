'use strict';
const $ = id => document.getElementById(id);
const native = typeof Android !== 'undefined';
const host = native || new URLSearchParams(location.search).get('host') === '1';
const peers = new Map();
let ctx, micStream, micNode, cameraStream, displayStream, outputStream, cameraVideo;
let started = false, source = 'camera', micOn = false, startedAt = 0, frameTimer;
let audioSources = new Map(), iceServers = [], bitrate = 400, statistics = new Map();
let guestPc, guestChannel, guestId, busyFrame = false, ending = false;
const canvas = $('screenCanvas'), paint = canvas.getContext('2d', {alpha:false});
let renderToken = 0;
const LOG_LIMIT = 60, logs = [];
function log(message) { $('status').textContent = message; logs.unshift(new Date().toLocaleTimeString() + '  ' + message); $('log').textContent = logs.slice(0,LOG_LIMIT).join('\n'); }
function error(e) { log(e && e.message ? e.message : String(e)); }
function show(id, visible) { $(id).hidden = !visible; }
function button(id, action) { $(id).onclick = async () => { $(id).disabled = true; try { await action(); } catch(e) { error(e); } finally { $(id).disabled = false; } }; }
function encode(value) { const bytes = new TextEncoder().encode(JSON.stringify(value)); return 'PM1.' + btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function decode(text, type) {
 text=text.trim(); if(text.includes('#invite=')) text=decodeURIComponent(text.split('#invite=')[1]);
 if(!text.startsWith('PM1.') || text.length>180000) throw Error('Use a complete Pocket Meet connection code.');
 let d; try { const raw=text.slice(4).replace(/-/g,'+').replace(/_/g,'/'); d=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0)))); } catch { throw Error('The connection code is damaged or incomplete.'); }
 if(d.v!==1 || d.type!==type || !/^[a-zA-Z0-9-]{10,60}$/.test(d.id||'') || typeof d.sdp!=='string' || d.sdp.length>120000) throw Error('This is not a valid '+type+' code.');
 return d;
}
function validIce(servers) {
 if(!Array.isArray(servers) || servers.length>2) throw Error('Invalid ICE server configuration.');
 return servers.map(s=> { if(typeof s.urls!=='string' || !/^(stun|stuns|turn|turns):[^\s]{1,250}$/.test(s.urls)) throw Error('Invalid STUN/TURN URL.'); return {urls:s.urls,username:String(s.username||'').slice(0,250),credential:String(s.credential||'').slice(0,500)}; });
}
async function copy(id) { const text=$(id).value; if(!text) throw Error('No code to copy yet.'); if(native) Android.copy(text); else { try { await navigator.clipboard.writeText(text); } catch { $(id).focus();$(id).select(); if(!document.execCommand('copy')) throw Error('Select the code and copy it manually.'); } } log('Copied. Send privately to the other device.'); }
async function gathered(pc) {
 if(pc.iceGatheringState==='complete') return;
 await new Promise(resolve=> { const done=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();}; const check=()=>{if(pc.iceGatheringState==='complete')done();}; const timer=setTimeout(()=>{log('ICE gathering timed out; code contains candidates found so far.');done();},18000);pc.addEventListener('icegatheringstatechange',check); });
}
async function mediaMic() { return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}); }
function newAudioContext() { return new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'}); }
function setMic(on) { micOn=on; if(micStream)micStream.getAudioTracks().forEach(t=>t.enabled=on); $('mic').textContent=on?'Mute microphone':'Unmute microphone'; if(guestChannel?.readyState==='open') guestChannel.send(JSON.stringify({type:'mic',on})); }
function attachIncoming(p, stream) {
 const old=audioSources.get(p.id); if(old){old.node.disconnect();old.gain.disconnect();}
 const node=ctx.createMediaStreamSource(stream),gain=ctx.createGain(); gain.gain.value=p.blocked?0:1; node.connect(gain); audioSources.set(p.id,{node,gain}); rebuildAudio();
}
function rebuildAudio() {
 if(!ctx)return;
 if(micNode)micNode.disconnect();
 for(const input of audioSources.values()) input.gain.disconnect();
 for(const p of peers.values()) {
   if(micNode)micNode.connect(p.compressor);
   for(const [id,input] of audioSources) if(id!==p.id) input.gain.connect(p.compressor);
 }
 for(const input of audioSources.values()) input.gain.connect(ctx.destination);
}
function rows() {
 $('participants').replaceChildren(); let count=0;
 for(const p of peers.values()) {
  if(p.pc.connectionState==='connected') count++;
  const row=document.createElement('div');row.className='person';
  const text=document.createElement('span');text.textContent=p.name+' · '+p.pc.connectionState+(p.blocked?' · muted by host':'');row.append(text);
  const actions=document.createElement('span');
  const mute=document.createElement('button');mute.textContent=p.blocked?'Allow mic':'Mute';mute.onclick=()=>{p.blocked=!p.blocked;const a=audioSources.get(p.id);if(a)a.gain.gain.value=p.blocked?0:1;rows();};actions.append(mute);
  const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>removePeer(p.id);actions.append(remove);row.append(actions);$('participants').append(row);
 }
 $('connected').textContent=count;
 $('stageLabel').textContent=count+' participant'+(count===1?'':'s')+' connected';
}
function removePeer(id) {
 const p=peers.get(id);if(!p)return;peers.delete(id);p.pc.onconnectionstatechange=null;p.pc.close();p.compressor.disconnect();p.mix.stream.getTracks().forEach(t=>t.stop());const a=audioSources.get(id);if(a){a.node.disconnect();a.gain.disconnect();audioSources.delete(id);}statistics.delete(id);rebuildAudio();rows();
}
function renderVideo(video) {
 if(video.readyState<2)return;
 const w=video.videoWidth,h=video.videoHeight;if(!w||!h)return;
 const ratio=Math.min(canvas.width/w,canvas.height/h);paint.fillStyle='#050a12';paint.fillRect(0,0,canvas.width,canvas.height);paint.drawImage(video,(canvas.width-w*ratio)/2,(canvas.height-h*ratio)/2,w*ratio,h*ratio);outputStream?.getVideoTracks()[0]?.requestFrame?.();
}
async function openCamera() {
 const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:360},frameRate:{ideal:15,max:15},facingMode:'user'},audio:false});
 const v=document.createElement('video');v.muted=true;v.playsInline=true;v.srcObject=stream;try{await v.play();}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}return {stream,v};
}
function clearDisplay() { if(displayStream){displayStream.getTracks().forEach(t=>{t.onended=null;t.stop();});displayStream=null;} if(native)Android.stopScreen(); }
async function useCamera() {
 const camera=await openCamera();renderToken++;source='camera';clearDisplay();cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=camera.stream;cameraVideo=camera.v;
 clearInterval(frameTimer);frameTimer=setInterval(()=>renderVideo(cameraVideo),67);$('sourceLabel').textContent='CAMERA · 360p';await tuneAll();log('Camera active. Screen capture stopped.');
}
async function startHost() {
 if(started)return;if(!navigator.mediaDevices?.getUserMedia || !canvas.captureStream)throw Error('Update Android System WebView / Chrome; this device lacks the required media APIs.');
 iceServers=[];if($('stun').value.trim())iceServers.push({urls:$('stun').value.trim()});if($('turn').value.trim())iceServers.push({urls:$('turn').value.trim(),username:$('turnUser').value,credential:$('turnPass').value});iceServers=validIce(iceServers);bitrate=Number($('bitrate').value);
 if(native)Android.startMeeting();
 try { ctx=newAudioContext();await ctx.resume();micStream=await mediaMic();micNode=ctx.createMediaStreamSource(micStream);outputStream=canvas.captureStream(0);await useCamera();$('preview').srcObject=outputStream;await $('preview').play();
 started=true;startedAt=Date.now();setMic(true);show('setup',false);show('meeting',true);show('hostInvites',true);show('camera',true);show('screen',true);log('Host ready. Create one invitation per participant.');
 } catch(e) { await endMeeting(false);throw e; }
}
async function tuneSender(sender,kind) {
 const p=sender.getParameters();if(!p.encodings?.length)return;
 for(const enc of p.encodings){enc.maxBitrate=kind==='video'?bitrate*1000:32000;if(kind==='video'){enc.maxFramerate=source==='camera'?15:5;enc.scaleResolutionDownBy=source==='camera'?2:1;}}
 if(kind==='video')p.degradationPreference=source==='camera'?'maintain-framerate':'maintain-resolution';
 try { await sender.setParameters(p); } catch(e) { log('Bitrate setting rejected: '+e.message+'. Do not assume the cap is active.'); }
}
async function tuneAll(){for(const p of peers.values())for(const s of p.pc.getSenders())if(s.track)await tuneSender(s,s.track.kind);}
async function invite() {
 if(!started)throw Error('Start the host first.');if(peers.size>=50)throw Error('50 pending/connected participants reached. Remove unused invitations.');
 const id=crypto.randomUUID(),name=$('participantName').value.trim()||'Participant '+(peers.size+1);
 const pc=new RTCPeerConnection({iceServers,iceCandidatePoolSize:0});const mix=ctx.createMediaStreamDestination();mix.channelCount=1;
 const compressor=ctx.createDynamicsCompressor();compressor.connect(mix);
 const p={id,name,pc,mix,compressor,blocked:false};peers.set(id,p);rebuildAudio();
 try {
 pc.addTrack(outputStream.getVideoTracks()[0],outputStream);pc.addTrack(mix.stream.getAudioTracks()[0],mix.stream);
 pc.ontrack=e=>{if(e.track.kind==='audio')attachIncoming(p,new MediaStream([e.track]));};
 pc.onconnectionstatechange=()=>{rows();log(name+': '+pc.connectionState+(pc.connectionState==='failed'?' — try same Wi-Fi or supply reachable STUN/TURN, then use a new invitation.':''));};
 p.channel=pc.createDataChannel('room');p.channel.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='name'&&typeof m.name==='string'){p.name=m.name.slice(0,32);rows();}}catch{}};
 await pc.setLocalDescription(await pc.createOffer());await gathered(pc);if(!started || !peers.has(id))return;
 const value=encode({v:1,type:'offer',id,sdp:pc.localDescription.sdp,ice:iceServers,name:$('name').value.trim()||'Host'});
 const base=$('joinUrl').value.trim();if(base){const u=new URL(base);if(u.protocol!=='https:')throw Error('Participant page must use HTTPS.');u.search='';u.hash='invite='+value;$('inviteOutput').value=u.href;}else $('inviteOutput').value=value;
 $('participantName').value='';rows();log('Invitation ready for '+name+'. Waiting for their reply.');
 }catch(e){removePeer(id);throw e;}
}
async function applyAnswer() {
 const d=decode($('answerInput').value,'answer'),p=peers.get(d.id);if(!p)throw Error('Reply belongs to a different or expired invitation.');if(p.pc.signalingState!=='have-local-offer')throw Error('Reply was already applied.');await p.pc.setRemoteDescription({type:'answer',sdp:d.sdp});await tuneAll();$('answerInput').value='';log('Reply accepted. Connecting '+p.name+'…');
}
async function join() {
 if(guestPc)throw Error('Leave before joining again.');const d=decode($('offerInput').value,'offer');const servers=validIce(d.ice||[]);
 if(servers.length && !confirm('This invitation uses external STUN/TURN servers:\n'+servers.map(s=>s.urls).join('\n')+'\n\nContinue?'))return;
 try { ctx=newAudioContext();await ctx.resume();micStream=await mediaMic();setMic(false);guestId=d.id;
 const pc=guestPc=new RTCPeerConnection({iceServers:servers});const remote=new MediaStream();$('remoteVideo').srcObject=remote;$('remoteVideo').muted=false;
 pc.ontrack=e=>{remote.addTrack(e.track);$('remoteVideo').play().catch(()=>log('Tap Enable audio to hear the meeting.'));};
 pc.ondatachannel=e=>{guestChannel=e.channel;guestChannel.onopen=()=>guestChannel.send(JSON.stringify({type:'name',name:$('name').value.trim()||'Participant'}));};
 pc.onconnectionstatechange=()=>{$('connected').textContent=pc.connectionState==='connected'?'1':'0';$('stageLabel').textContent='Host: '+pc.connectionState;log('Connection: '+pc.connectionState+(pc.connectionState==='failed'?' — leave and ask for a fresh invitation; your networks may require a relay.':''));};
 await pc.setRemoteDescription({type:'offer',sdp:d.sdp});pc.addTrack(micStream.getAudioTracks()[0],micStream);await pc.setLocalDescription(await pc.createAnswer());await gathered(pc);
 if(guestPc!==pc)return;for(const sender of pc.getSenders())if(sender.track)await tuneSender(sender,'audio');
 $('answerOutput').value=encode({v:1,type:'answer',id:d.id,sdp:pc.localDescription.sdp});started=true;startedAt=Date.now();show('setup',false);show('meeting',true);show('preview',false);show('remoteVideo',true);show('guestReply',true);$('sourceLabel').textContent='HOST STREAM';log('Reply ready. Send it to the host to complete your connection.');
 }catch(e){await endMeeting(false);throw e;}
}
async function activateScreen(video=null) {
 renderToken++;source='screen';cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;clearInterval(frameTimer);
 if(video)frameTimer=setInterval(()=>renderVideo(video),200);
 paint.fillStyle='#050a12';paint.fillRect(0,0,canvas.width,canvas.height);outputStream?.getVideoTracks()[0]?.requestFrame?.();$('sourceLabel').textContent='SCREEN · 5 fps';await tuneAll();log('Screen capture active. Return here to switch to camera.');
}
async function shareScreen() {
 if(!started || !host)return;
 if(native){Android.requestScreen();log('Approve Android screen capture. Choose the entire screen to show other apps.');return;}
 if(!navigator.mediaDevices.getDisplayMedia)throw Error('Screen capture requires the Android host APK or a supported desktop browser.');
 const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:5,max:5}},audio:false});clearDisplay();displayStream=stream;const video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;await video.play();stream.getVideoTracks()[0].onended=()=>screenStopped();await activateScreen(video);
}
window.nativeScreenStarted=()=>activateScreen().catch(error);
window.nativeScreenError=message=>log(message);
window.nativeScreenStopped=()=>screenStopped();
window.nativeScreenFrame=async data=>{
 if(source!=='screen'||!started||busyFrame)return;busyFrame=true;const token=renderToken;
 try{const img=new Image();img.src='data:image/jpeg;base64,'+data;await img.decode();if(source!=='screen'||token!==renderToken)return;const ratio=Math.min(canvas.width/img.width,canvas.height/img.height);paint.fillStyle='#050a12';paint.fillRect(0,0,canvas.width,canvas.height);paint.drawImage(img,(canvas.width-img.width*ratio)/2,(canvas.height-img.height*ratio)/2,img.width*ratio,img.height*ratio);outputStream.getVideoTracks()[0].requestFrame?.();}catch(e){error(e);}finally{busyFrame=false;}
};
function screenStopped(){if(!started||source!=='screen'||ending)return;renderToken++;clearInterval(frameTimer);paint.fillStyle='#050a12';paint.fillRect(0,0,canvas.width,canvas.height);outputStream?.getVideoTracks()[0]?.requestFrame?.();$('sourceLabel').textContent='SHARING STOPPED';log('Screen sharing stopped. Tap Use camera or Share screen to resume.');}
window.nativeEnd=()=>endMeeting();
async function endMeeting(announce=true) {
 ending=true;started=false;renderToken++;clearInterval(frameTimer);for(const id of [...peers.keys()])removePeer(id);guestPc?.close();guestPc=null;guestChannel=null;clearDisplay();for(const stream of [cameraStream,micStream,outputStream])stream?.getTracks().forEach(t=>t.stop());cameraStream=micStream=outputStream=null;micNode=null;audioSources.clear();if(ctx&&ctx.state!=='closed')await ctx.close();ctx=null;if(native)Android.stopMeeting();$('preview').srcObject=null;$('remoteVideo').srcObject=null;statistics.clear();$('upload').textContent='—';$('connected').textContent='0';$('elapsed').textContent='00:00';$('inviteOutput').value='';$('answerOutput').value='';show('meeting',false);show('hostInvites',false);show('guestReply',false);show('setup',true);ending=false;if(announce)log('Meeting ended. Capture stopped and all connections closed.');
}
async function stats() {
 if(!started)return;const seconds=Math.floor((Date.now()-startedAt)/1000);$('elapsed').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 let sum=0;const entries=host?[...peers.entries()].map(([id,p])=>[id,p.pc]):[['guest',guestPc]];
 for(const [id,pc] of entries){if(!pc || pc.connectionState!=='connected')continue;try{const report=await pc.getStats();let bytes=0,time=0;report.forEach(s=>{if(s.type==='outbound-rtp'&&!s.isRemote){bytes+=s.bytesSent||0;time=Math.max(time,s.timestamp||0);}});const prev=statistics.get(id);if(prev&&time>prev.time)sum+=Math.max(0,(bytes-prev.bytes)*8/(time-prev.time)/1000);statistics.set(id,{bytes,time});}catch{}}
 $('upload').textContent=sum.toFixed(2);
}
show('hostSetup',host);show('guestSetup',!host);$('roleTag').textContent=host?'HOST · PHONE TEST LAB':'PARTICIPANT';if(host){$('headline').innerHTML='Your phone.<br>Your meeting.';$('intro').textContent='Share one video source, bring people together, and measure the limits.';}
if(location.hash.startsWith('#invite=')){try{$('offerInput').value=decodeURIComponent(location.hash.slice(8));history.replaceState(null,'',location.pathname+location.search);}catch{}}
button('start',startHost);button('invite',invite);button('applyAnswer',applyAnswer);button('join',join);button('copyInvite',()=>copy('inviteOutput'));button('copyAnswer',()=>copy('answerOutput'));button('camera',useCamera);button('screen',shareScreen);button('mic',()=>setMic(!micOn));button('leave',()=>endMeeting());button('playAudio',async()=>{await ctx?.resume();if(!host)await $('remoteVideo').play();log('Audio enabled. Use headphones.');});
setInterval(()=>stats().catch(error),2000);
window.addEventListener('beforeunload',()=>{for(const p of peers.values())p.pc.close();guestPc?.close();});
