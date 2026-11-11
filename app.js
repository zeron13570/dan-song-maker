import {createRenderer,validateSettings,DEFAULT_SETTINGS} from './renderer.js';
import {makeZip} from './zip.js';

const $=id=>document.getElementById(id);
const ranks=['五級','四級','三級','二級','一級','初段','二段','三段','四段','五段','六段','七段','八段','九段','十段','玄人','名人','超人','達人'];
const rankKo=['5급','4급','3급','2급','1급','초단','2단','3단','4단','5단','6단','7단','8단','9단','10단','현인','명인','초인','달인'];
const nums=['Rank','Difficulty','EasyLevel','NormalLevel','HardLevel','TitleSize','ArtistSize','Scale','Angle','Skew'];
const bools=['CourseUra','Ura','OriginalFont'];
const styleKeys=['TitleSize','ArtistSize','Scale','Angle','Skew','OriginalFont'];
const storageKey='dan-song-maker.custom.v1';
let renderer,presets=[],saved=[],state={...DEFAULT_SETTINGS},selectedId='',tab='all',timer,busy=false,cancelled=false,selectedPreset;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function settings(){return validateSettings({...state});}
function validForm(){return $('editor').checkValidity();}
function safeName(value){return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,90)||'song';}
function saveBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 생성에 실패했습니다.')),'image/png'));
function refreshButtons(){const valid=!!renderer&&validForm()&&!busy;$('download').disabled=!valid;$('batch').disabled=!valid;}
function refreshControls(){
  for(const key of nums)$(key).value=state[key];for(const key of bools)$(key).checked=state[key];
  $('Title').value=state.Title;$('Artist').value=state.Artist;$('FourthLevel').value=state.Ura?state.UraLevel:state.OniLevel;
  $('CourseUra').disabled=state.Difficulty!==4||busy;
  $('fourth-label').replaceChildren(Object.assign(document.createElement('i'),{}),document.createTextNode(state.Ura?'우라':'오니'));
  $('fourth-label').parentElement.classList.toggle('is-ura',state.Ura);refreshButtons();
}
function renderPreview(){
  if(!renderer)return;
  if(!validForm()){refreshButtons();status('입력 범위를 확인해 주세요. 레벨은 1~99입니다.',true);return;}
  try{state=settings();const image=renderer.render(state,1),canvas=$('card');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);$('dimensions').textContent=`${image.width} × ${image.height} px · 출력 ${state.Scale}× · 투명 PNG`;canvas.setAttribute('aria-label',`${rankKo[state.Rank-1]} ${state.Title}, 쉬움 ${state.EasyLevel}, 보통 ${state.NormalLevel}, 어려움 ${state.HardLevel}, ${state.Ura?'우라':'오니'} ${state.Ura?state.UraLevel:state.OniLevel}`);refreshButtons();}
  catch(error){status(error.message,true);$('download').disabled=true;$('batch').disabled=true;}
}
function edited(){selectedId='';$('selection').textContent=`${rankKo[state.Rank-1]} · 사용자 편집`;$('edit-badge').textContent='직접 편집';document.querySelectorAll('.song-button[aria-current=true]').forEach(b=>b.setAttribute('aria-current','false'));clearTimeout(timer);timer=setTimeout(renderPreview,120);refreshButtons();}
function applyPreset(p,preserveStyle=true){
  const style=preserveStyle?Object.fromEntries(styleKeys.map(k=>[k,state[k]])):{};
  state=validateSettings({...DEFAULT_SETTINGS,...p,...style});selectedPreset={...p};selectedId=p.Id;
  refreshControls();renderPreview();$('selection').textContent=`${rankKo[state.Rank-1]} · ${p.Stage?`${p.Stage}곡`:state.Title}`;$('edit-badge').textContent=p.Year===2026?'2026 프리셋':'내 프리셋';status('프리셋을 적용했습니다. 원하는 내용을 바꿔 저장하세요.');renderList();
}
function renderList(){
  const q=$('search').value.trim().toLocaleLowerCase(),source=tab==='all'?presets:saved;
  const matches=source.filter(p=>`${p.Title} ${p.Artist} ${ranks[p.Rank-1]} ${rankKo[p.Rank-1]}`.toLocaleLowerCase().includes(q));
  $('preset-list').replaceChildren();$('saved-count').textContent=saved.length;
  $('results').textContent=q?`${matches.length}곡 검색됨`:tab==='all'?'19개 단위 · 5급부터 달인까지':`${saved.length}개의 내 프리셋`;
  if(!matches.length){const p=document.createElement('p');p.className='empty';p.textContent=tab==='saved'&&!q?'아직 저장한 프리셋이 없습니다.\n곡을 편집한 뒤 내 프리셋에 저장해 보세요.':'일치하는 곡이 없습니다.';$('preset-list').append(p);return;}
  for(let rank=1;rank<=19;rank++){
    const group=matches.filter(p=>p.Rank===rank);if(!group.length)continue;
    const section=document.createElement('section');section.className='rank-group';const h=document.createElement('h3');h.className='rank-title';h.append(document.createTextNode(rankKo[rank-1]));const jp=document.createElement('span');jp.textContent=ranks[rank-1];h.append(jp);section.append(h);
    for(const p of group){const button=document.createElement('button');button.type='button';button.className='song-button';button.setAttribute('aria-current',String(p.Id===selectedId));button.disabled=busy;button.title=p.Artist;
      const number=document.createElement('span');number.className='song-index';number.textContent=p.Stage?String(p.Stage).padStart(2,'0'):'◇';
      const name=document.createElement('span');name.className='song-name';name.textContent=p.Title;const level=document.createElement('span');level.className='song-level';level.textContent=`${p.CourseUra?'裏 ':''}★${p.Level}`;button.append(number,name,level);button.addEventListener('click',()=>applyPreset(p));section.append(button);}
    $('preset-list').append(section);
  }
}
function setBusy(value){busy=value;for(const control of document.querySelectorAll('#editor input,#editor select,#Scale,#search,#reset,#save-custom,#export-settings,#import-settings,#reset-style'))control.disabled=value;$('cancel-batch').hidden=!value;$('progress').hidden=!value;$('CourseUra').disabled=value||state.Difficulty!==4;renderList();refreshButtons();}
async function batchExport(){
  if(!validForm()||!renderer)return;const style=Object.fromEntries(styleKeys.map(k=>[k,settings()[k]]));cancelled=false;setBusy(true);$('progress').value=0;
  try{const files=[];for(const p of presets){if(cancelled)break;status(`PNG 생성 중 · ${files.length+1} / ${presets.length} · ${p.Title}`);await new Promise(resolve=>setTimeout(resolve,0));const image=renderer.render({...p,...style});const blob=await png(image);files.push({name:`${String(p.Rank).padStart(2,'0')}_${ranks[p.Rank-1]}_${p.Stage}_${safeName(p.Title)}.png`,data:new Uint8Array(await blob.arrayBuffer())});image.width=1;image.height=1;$('progress').value=files.length;}
    if(cancelled){status('일괄 저장을 중단했습니다.');return;}saveBlob(makeZip(files),'DanSongMaker_2026_57songs.zip');status('57곡을 ZIP 파일로 저장했습니다.');
  }catch(error){status(error.message,true);}finally{setBusy(false);}
}
for(let i=0;i<19;i++)$('Rank').add(new Option(`${rankKo[i]} · ${ranks[i]}`,i+1));
$('editor').addEventListener('submit',e=>e.preventDefault());
for(const key of nums)$(key).addEventListener('input',()=>{state[key]=Number($(key).value);if(key==='Difficulty'&&state.Difficulty!==4){state.CourseUra=false;$('CourseUra').checked=false;}$('CourseUra').disabled=state.Difficulty!==4;edited();});
for(const key of ['Title','Artist'])$(key).addEventListener('input',()=>{state[key]=$(key).value;edited();});
for(const key of bools)$(key).addEventListener('change',()=>{state[key]=$(key).checked;if(key==='Ura'){refreshControls();}edited();});
$('FourthLevel').addEventListener('input',()=>{state[state.Ura?'UraLevel':'OniLevel']=Number($('FourthLevel').value);edited();});
$('search').addEventListener('input',renderList);
for(const id of ['all','saved'])$(id+'-tab').addEventListener('click',()=>{tab=id;for(const t of ['all','saved'])$(t+'-tab').setAttribute('aria-pressed',String(t===id));renderList();});
document.querySelectorAll('[data-bg]').forEach(button=>button.addEventListener('click',()=>{$('preview').className=`preview ${button.dataset.bg}`;document.querySelectorAll('[data-bg]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
$('download').addEventListener('click',async()=>{if(!validForm()||!renderer)return;try{$('download').disabled=true;const s=settings(),image=renderer.render(s);saveBlob(await png(image),`2026_${ranks[s.Rank-1]}_${safeName(s.Title)}.png`);status(`저장 완료 · ${image.width} × ${image.height} px · 투명 PNG`);}catch(error){status(error.message,true);}finally{refreshButtons();}});
$('batch').addEventListener('click',batchExport);$('cancel-batch').addEventListener('click',()=>{cancelled=true;});
$('save-custom').addEventListener('click',()=>{if(!validForm()){$('editor').reportValidity();return;}try{const s=settings();if(!s.Title.trim())throw new Error('제목을 입력해 주세요.');if(saved.length>=200)throw new Error('내 프리셋은 200개까지 저장할 수 있습니다. 설정을 파일로 내보내 주세요.');const p={...s,Id:`custom-${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(16).slice(2)}`,Year:0,Stage:0};const next=[...saved,p];localStorage.setItem(storageKey,JSON.stringify(next));saved=next;renderList();status('내 프리셋에 저장했습니다. 이 브라우저에서 다시 사용할 수 있습니다.');}catch(error){status(error.message,true);}});
$('export-settings').addEventListener('click',()=>{if(!validForm())return;try{saveBlob(new Blob([JSON.stringify(settings(),null,2)],{type:'application/json'}),`${safeName(state.Title)}.json`);status('설정을 JSON으로 저장했습니다. Windows 프로그램과 함께 사용할 수 있습니다.');}catch(error){status(error.message,true);}});
$('import-settings').addEventListener('click',()=>$('settings-file').click());
$('settings-file').addEventListener('change',async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('설정 파일이 너무 큽니다.');const parsed=JSON.parse(await file.text()),next=validateSettings(parsed);state=next;refreshControls();edited();renderPreview();status('설정을 불러왔습니다.');}catch(error){status(`설정을 불러오지 못했습니다: ${error.message}`,true);}finally{event.target.value='';}});
$('reset').addEventListener('click',()=>{if(selectedPreset)applyPreset(selectedPreset,false);});
$('reset-style').addEventListener('click',()=>{for(const key of styleKeys)state[key]=DEFAULT_SETTINGS[key];refreshControls();edited();});
refreshControls();
try{
  const response=await fetch('./presets.json');if(!response.ok)throw new Error('프리셋 목록을 불러오지 못했습니다.');presets=await response.json();if(presets.length!==57)throw new Error('프리셋 수가 올바르지 않습니다.');presets.forEach(validateSettings);
  try{const parsed=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(parsed)||parsed.length>200)throw new Error();saved=parsed.map(validateSettings);}catch{status('저장된 내 프리셋을 읽지 못했습니다. 기본 프리셋으로 시작합니다.',true);}
  state=validateSettings(presets[56]);selectedPreset=presets[56];selectedId=selectedPreset.Id;refreshControls();renderList();
  renderer=await createRenderer('./assets/');$('loading').hidden=true;renderPreview();status('준비 완료 · 프리셋을 고르거나 곡 정보를 편집해 보세요.');
}catch(error){$('loading').replaceChildren();const message=document.createElement('strong');message.textContent='리소스를 불러오지 못했습니다.';const reason=document.createElement('span');reason.textContent=error.message;const retry=document.createElement('button');retry.textContent='다시 시도';retry.addEventListener('click',()=>location.reload());$('loading').append(message,reason,retry);status(error.message,true);}
