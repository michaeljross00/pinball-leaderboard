function updateEmojiUses(){
  document.querySelectorAll('#highlights .highlight-title').forEach(el=>{
    if(el.textContent.includes('Most Improved')) el.textContent=el.textContent.replace('🎯','📈');
  });
  document.querySelectorAll('#standings [aria-label="Trophy Case"] span[title="Monthly Challenge Champion"]').forEach(el=>el.textContent='🗓️');
  document.querySelectorAll('#standings .award-badges span[title="Previous Monthly Champion"]').forEach(el=>el.textContent='🗓️');
}
const root=document.getElementById('dashboardView'); if(root)new MutationObserver(updateEmojiUses).observe(root,{childList:true,subtree:true}); updateEmojiUses();
