import { getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const db = getFirestore(getApp());
const fmt = value => Number(value || 0).toLocaleString("en-US");

async function updateNormalizedBattleCards() {
  const [tableSnapshot, playerSnapshot, scoreSnapshot] = await Promise.all([
    getDocs(collection(db, "tables")),
    getDocs(collection(db, "players")),
    getDocs(collection(db, "scores"))
  ]);

  const tables = tableSnapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.active === true);
  const players = playerSnapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active === true);
  const scores = scoreSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const comparisons = [];

  for (const table of tables) {
    const personalBests = players.map(player => {
      const values = scores.filter(s => s.tableId === table.id && s.playerId === player.id).map(s => Number(s.score));
      return { player, score: values.length ? Math.max(...values) : 0 };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    if (personalBests.length < 2 || personalBests[0].score === personalBests[1].score) continue;

    const rawGap = personalBests[0].score - personalBests[1].score;
    const relativeGap = rawGap / personalBests[0].score;
    comparisons.push({ table, leader: personalBests[0], runnerUp: personalBests[1], rawGap, relativeGap });
  }

  if (!comparisons.length) return;
  const closest = [...comparisons].sort((a, b) => a.relativeGap - b.relativeGap)[0];
  const biggest = [...comparisons].sort((a, b) => b.relativeGap - a.relativeGap)[0];

  const cards = [...document.querySelectorAll("#highlights .card")];
  function replace(titleText, result) {
    const card = cards.find(c => c.querySelector(".highlight-title")?.textContent.includes(titleText));
    if (!card) return;
    card.querySelector(".highlight-main").textContent = result.table.name;
    card.querySelector(".highlight-sub").textContent = `${result.leader.player.name} leads ${result.runnerUp.player.name} by ${fmt(result.rawGap)} points`;
    card.title = `Compared across tables using relative gap: ${(result.relativeGap * 100).toFixed(2)}%. Display remains in actual points.`;
  }
  replace("Closest Battle", closest);
  replace("Biggest Beatdown", biggest);
}

const observer = new MutationObserver(() => updateNormalizedBattleCards().catch(console.error));
const highlights = document.getElementById("highlights");
if (highlights) observer.observe(highlights, { childList: true, subtree: true });
updateNormalizedBattleCards().catch(console.error);
