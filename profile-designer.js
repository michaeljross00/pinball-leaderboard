import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const PALETTE = [
  ["Electric Cyan", "#38E8FF"], ["Neon Blue", "#3B82F6"],
  ["Royal Blue", "#6366F1"], ["Plasma Purple", "#9D7DFF"],
  ["Violet", "#A855F7"], ["Neon Pink", "#FF44B7"],
  ["Hot Pink", "#EC4899"], ["Arcade Red", "#FF667D"],
  ["Crimson", "#EF4444"], ["Orange", "#FF9F43"],
  ["Amber", "#F59E0B"], ["Pinball Yellow", "#FFD84A"],
  ["Acid Green", "#A3E635"], ["Arcade Green", "#56F39A"],
  ["Emerald", "#10B981"], ["Teal", "#14B8A6"],
  ["Ice Blue", "#71C4FF"], ["Steel Blue", "#64748B"],
  ["Slate", "#475569"], ["Silver", "#CBD5E1"],
  ["White", "#F8FAFC"]
];

const TEXT_COLORS = [
  ["White", "#FFFFFF"], ["Ice", "#EAF6FF"],
  ["Silver", "#CBD5E1"], ["Light Gray", "#D1D5DB"],
  ["Cyan", "#B9F7FF"], ["Gold", "#FFE9A3"],
  ["Soft Green", "#C7F9D9"], ["Black", "#050505"],
  ["Charcoal", "#1F2937"], ["Navy", "#111827"]
];

const FILL_STRENGTHS = { subtle: 0.08, standard: 0.14, bold: 0.20 };
const BORDER_INTENSITIES = { subtle: 0.45, standard: 0.72, bright: 1 };
const GLOW_LEVELS = { none: 0, soft: 16, medium: 28, strong: 42 };
const STYLES = ["arcade", "neon", "classic", "glass", "retro"];

const DEFAULTS = {
  cardStyle: "arcade", cardColor: "#38E8FF", fillStrength: "subtle",
  borderColor: "#38E8FF", borderIntensity: "standard",
  nameColor: "#38E8FF", textColor: "#FFFFFF", glowLevel: "soft"
};

const style = document.createElement("style");
style.textContent = `
  .pcd-section{margin-top:20px;padding-top:18px;border-top:1px solid #33406d}
  .pcd-heading{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:10px}
  .pcd-heading h3{margin:0}.pcd-help{color:#aeb7d8;font-size:.77rem}
  .pcd-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:8px}
  .pcd-swatch{position:relative;height:46px;border:2px solid transparent;border-radius:10px;cursor:pointer}
  .pcd-swatch.selected{border-color:#fff;box-shadow:0 0 0 2px #38e8ff}
  .pcd-swatch span{position:absolute;inset:auto 2px 2px 2px;padding:2px;border-radius:5px;background:#0009;color:#fff;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pcd-options{display:flex;gap:8px;flex-wrap:wrap}.pcd-option{padding:9px 12px;border:1px solid #33406d;border-radius:9px;background:#090d1c;color:#f7f8ff;font-weight:800;cursor:pointer;text-transform:capitalize}.pcd-option.selected{border-color:#38e8ff;background:#173149;color:#fff}
  .pcd-actions{display:flex;gap:10px;margin-top:20px}.pcd-danger{color:#fff;border:1px solid #ff667d88;background:#441824;padding:10px 13px;border-radius:9px;font-weight:800;cursor:pointer}
  .pcd-warning{display:none;margin-top:10px;padding:10px;border:1px solid #ffd84a88;border-radius:9px;background:#4c3b0d;color:#fff1b5}.pcd-warning.show{display:block}
  .player-card-custom{position:relative;overflow:hidden;transition:box-shadow .2s,border-color .2s,background .2s;color:var(--pcd-text,#fff)!important}
  .player-card-custom .mini-stat,.player-card-custom .muted{color:var(--pcd-text,#fff)!important;opacity:.78}.player-card-custom .stat-meta{color:var(--pcd-name,#38e8ff)!important}.player-card-custom .stat-name{color:var(--pcd-name,#38e8ff)!important}
  .player-card-custom.style-neon{border-width:2px}.player-card-custom.style-classic{border-radius:7px!important;background-image:none!important}.player-card-custom.style-glass{backdrop-filter:blur(12px);border-color:#ffffff99!important}.player-card-custom.style-retro{border-width:4px;border-radius:4px!important;box-shadow:6px 6px 0 #0008!important}.player-card-custom.style-retro .stat-name{letter-spacing:.12em}
  .pcd-trophy-shelf{margin-top:14px;padding:10px 12px;border:1px solid #ffffff22;border-radius:10px;background:#0003}.pcd-trophy-label{display:block;margin-bottom:6px;font-size:.67rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;opacity:.72}.pcd-trophies{font-size:1.25rem;line-height:1.5}
  #profilePanel{max-width:900px}.profile-preview{min-height:300px}
  @media(max-width:600px){.pcd-actions{flex-direction:column}.pcd-heading{align-items:start;flex-direction:column}}
`;
document.head.appendChild(style);

let app, auth, db, user, player, players = [];
let settings = { ...DEFAULTS };

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
function rgba(hex, alpha) { const c=hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${alpha})`; }
function luminance(hex) {
  const {r,g,b}=hexToRgb(hex); const a=[r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
  return .2126*a[0]+.7152*a[1]+.0722*a[2];
}
function blend(fg, bg="#0B1022", alpha=.14) {
  const f=hexToRgb(fg), b=hexToRgb(bg); const v=n=>Math.round(f[n]*alpha+b[n]*(1-alpha)).toString(16).padStart(2,"0"); return `#${v("r")}${v("g")}${v("b")}`;
}
function contrast(a,b){ const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); }
function normalized(p={}) {
  const legacy=p.accentColor||DEFAULTS.nameColor;
  return {
    cardStyle:p.cardStyle||DEFAULTS.cardStyle, cardColor:p.cardColor||legacy,
    fillStrength:p.fillStrength||DEFAULTS.fillStrength, borderColor:p.borderColor||legacy,
    borderIntensity:p.borderIntensity||DEFAULTS.borderIntensity, nameColor:p.nameColor||legacy,
    textColor:p.textColor||DEFAULTS.textColor, glowLevel:p.glowLevel||DEFAULTS.glowLevel
  };
}
function profileForName(name){return players.find(p=>String(p.name).trim().toLowerCase()===String(name).trim().toLowerCase());}
function applyCard(card,p){
  const x=normalized(p), fill=FILL_STRENGTHS[x.fillStrength], border=BORDER_INTENSITIES[x.borderIntensity], glow=GLOW_LEVELS[x.glowLevel];
  card.classList.add("player-card-custom"); STYLES.forEach(v=>card.classList.toggle(`style-${v}`,v===x.cardStyle));
  card.style.setProperty("--pcd-text",x.textColor);card.style.setProperty("--pcd-name",x.nameColor);
  card.style.color=x.textColor;card.style.borderColor=rgba(x.borderColor,border);
  card.style.background=`linear-gradient(145deg,${rgba(x.cardColor,fill+.05)},${rgba(x.cardColor,fill)}),#11162a`;
  card.style.boxShadow=glow?`0 0 ${glow}px ${rgba(x.borderColor,.42)},0 16px 40px rgba(0,0,0,.35)`:"0 16px 40px rgba(0,0,0,.35)";
  const shelf=card.querySelector('[aria-label="Trophy Case"]'); if(shelf){shelf.classList.add("pcd-trophy-shelf"); if(!shelf.querySelector(".pcd-trophy-label")){const label=document.createElement("span");label.className="pcd-trophy-label";label.textContent="Trophy Case";shelf.prepend(label);} shelf.classList.add("pcd-trophies");}
}
function applyAllCards(){document.querySelectorAll("#standings .card").forEach(card=>{const name=card.querySelector(".stat-name")?.textContent;const p=profileForName(name);if(p)applyCard(card,p);});}
function renderPreview(){
  const preview=document.getElementById("profilePreview"); if(!preview||!player)return;
  preview.innerHTML=`<div class="player-avatar">${player.avatarEmoji||"👾"}</div><div class="award-badges">👑 🥇 🛡️ ❄️</div><div class="stat-name">${player.name}</div><div class="stat-value">42</div><div class="stat-meta">Tables Won · 18.8% of active tables</div><div class="mini-stat">Monthly challenge wins: <strong>3</strong><br>Records gained this month: <strong>5</strong><br>Record-takeover streak: <strong>2</strong></div><div class="pcd-trophy-shelf"><span class="pcd-trophy-label">Trophy Case</span><div class="pcd-trophies">🥇 🥇 🎲 🎰 🛡️ 🛡️ ❄️</div></div>`;
  applyCard(preview,{...player,...settings});
  const background=blend(settings.cardColor,"#11162A",FILL_STRENGTHS[settings.fillStrength]);
  const ratio=contrast(settings.textColor,background), warning=document.getElementById("pcdContrast");
  warning.textContent=`Contrast ratio: ${ratio.toFixed(1)}:1. ${ratio<4.5?"Low contrast. Consider a lighter or darker body-text color.":"Readable contrast."}`;
  warning.classList.toggle("show",ratio<4.5);
}
function optionGroup(title,key,values,help=""){
  const wrap=document.createElement("section");wrap.className="pcd-section";wrap.innerHTML=`<div class="pcd-heading"><h3>${title}</h3><span class="pcd-help">${help}</span></div><div class="pcd-options"></div>`;
  const box=wrap.querySelector(".pcd-options"); values.forEach(v=>{const b=document.createElement("button");b.type="button";b.className=`pcd-option ${settings[key]===v?"selected":""}`;b.textContent=v;b.onclick=()=>{settings[key]=v;renderDesigner();};box.appendChild(b);});return wrap;
}
function swatchGroup(title,key,values,help=""){
  const wrap=document.createElement("section");wrap.className="pcd-section";wrap.innerHTML=`<div class="pcd-heading"><h3>${title}</h3><span class="pcd-help">${help}</span></div><div class="pcd-swatches"></div>`;
  const box=wrap.querySelector(".pcd-swatches"); values.forEach(([name,color])=>{const b=document.createElement("button");b.type="button";b.className=`pcd-swatch ${settings[key]===color?"selected":""}`;b.style.background=color;b.title=name;b.innerHTML=`<span>${name}</span>`;b.onclick=()=>{settings[key]=color;renderDesigner();};box.appendChild(b);});return wrap;
}
function renderDesigner(){
  const panel=document.getElementById("profilePanel"), save=document.getElementById("saveProfileButton"), old=document.getElementById("pcdDesigner"); if(!panel||!save||!player)return; old?.remove();
  const d=document.createElement("div");d.id="pcdDesigner";
  d.append(optionGroup("Card Style","cardStyle",STYLES,"Arcade, Neon, Classic, Glass, or Retro"));
  d.append(swatchGroup("Card Fill","cardColor",PALETTE,"Translucent over the dark dashboard"));
  d.append(optionGroup("Fill Strength","fillStrength",Object.keys(FILL_STRENGTHS),"8%, 14%, or 20%"));
  d.append(swatchGroup("Border Color","borderColor",PALETTE,"Independent from the fill"));
  d.append(optionGroup("Border Intensity","borderIntensity",Object.keys(BORDER_INTENSITIES),"Subtle, Standard, or Bright"));
  d.append(swatchGroup("Player Name Color","nameColor",PALETTE,"Also used for the history-graph line"));
  d.append(swatchGroup("Body Text Color","textColor",TEXT_COLORS,"Includes black, charcoal, and navy"));
  d.append(optionGroup("Card Glow","glowLevel",Object.keys(GLOW_LEVELS),"Glow uses the border color"));
  const warning=document.createElement("div");warning.id="pcdContrast";warning.className="pcd-warning";d.appendChild(warning);
  const actions=document.createElement("div");actions.className="pcd-actions";const reset=document.createElement("button");reset.type="button";reset.className="pcd-danger";reset.textContent="Reset Card to Default";reset.onclick=()=>{settings={...DEFAULTS};renderDesigner();};actions.appendChild(reset);d.appendChild(actions);
  save.parentElement.insertBefore(d,save); renderPreview();
}
async function saveProfile(){
  if(!user)return; const payload={...settings,accentColor:settings.nameColor};
  await updateDoc(doc(db,"players",user.uid),payload); Object.assign(player,payload); players=players.map(p=>p.id===player.id?{...p,...payload}:p); applyAllCards(); renderPreview();
}
async function init(){
  if(!getApps().length)return setTimeout(init,100); app=getApp();auth=getAuth(app);db=getFirestore(app);
  const snap=await getDocs(collection(db,"players"));players=snap.docs.map(d=>({id:d.id,...d.data()}));applyAllCards();
  const observer=new MutationObserver(applyAllCards);const standings=document.getElementById("standings");if(standings)observer.observe(standings,{childList:true,subtree:true});
  onAuthStateChanged(auth,u=>{user=u;player=players.find(p=>p.id===u?.uid)||null;if(player){settings=normalized(player);setTimeout(renderDesigner,0);}});
  document.getElementById("saveProfileButton")?.addEventListener("click",async()=>{try{await saveProfile();const m=document.getElementById("profileMessage");m.textContent="Player card saved.";m.className="status show success";}catch(e){console.error(e);const m=document.getElementById("profileMessage");m.textContent="Player card could not be saved. Publish the updated Firestore rules first.";m.className="status show error";}});
}
init();
