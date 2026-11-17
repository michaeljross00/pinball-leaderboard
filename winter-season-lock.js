import { getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
const auth=getAuth(getApp()),db=getFirestore(getApp());let installed=false;
function install(){if(installed)return;const form=document.getElementById('scoreForm'),type=document.getElementById('scoreType');if(!form||!type)return;installed=true;form.addEventListener('submit',async e=>{if(type.value!=='winter-2026')return;const u=auth.currentUser;if(!u)return;try{await setDoc(doc(db,'seasonLocks','winter-2026'),{lockedAt:serverTimestamp(),lockedBy:u.uid},{merge:false})}catch(err){console.error('Could not create Winter season lock',err)}},true)}onAuthStateChanged(auth,()=>setTimeout(install,100));setTimeout(install,500);
