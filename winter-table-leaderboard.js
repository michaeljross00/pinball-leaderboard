import { getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const db = getFirestore(getApp());

let players = [];
let tables = [];
let seasonScores = [];
let season = null;

const formatScore = (value) =>
  Number(value || 0).toLocaleString("en-US");

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function playerName(playerId) {
  return players.find((player) => player.id === playerId)?.name || "Unknown Player";
}

function tableName(tableId) {
  return tables.find((table) => table.id === tableId)?.name || tableId;
}

function playerAppearance(playerId) {
  const player = players.find((item) => item.id === playerId);

  return {
    avatar: player?.avatarEmoji || "👾",
    color: player?.nameColor || player?.accentColor || "#38E8FF"
  };
}

function buildWinterBestScores() {
  const eligibleTableIds = season?.eligibleTableIds || [];
  const bestScores = {};

  for (const score of seasonScores) {
    if (
      score.seasonId !== "winter-2026" ||
      !eligibleTableIds.includes(score.tableId)
    ) {
      continue;
    }

    const key = `${score.tableId}|${score.playerId}`;
    const scoreValue = Number(score.score || 0);

    if (scoreValue > Number(bestScores[key]?.score || 0)) {
      bestScores[key] = score;
    }
  }

  return bestScores;
}

function calculateWinterResults() {
  const eligibleTableIds = season?.eligibleTableIds || [];
  const bestScores = buildWinterBestScores();
  const tableResults = [];
  const playerResults = Object.fromEntries(
    players.map((player) => [
      player.id,
      {
        totalPoints: 0,
        first: 0,
        second: 0,
        third: 0,
        played: 0,
        tables: []
      }
    ])
  );

  for (const tableId of eligibleTableIds) {
    const rankings = players
      .map((player) => ({
        player,
        score: Number(bestScores[`${tableId}|${player.id}`]?.score || 0)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    rankings.forEach((entry, index) => {
      const points = [5, 3, 1][index] || 0;
      const result = playerResults[entry.player.id];

      result.totalPoints += points;
      result.played += 1;

      if (index === 0) result.first += 1;
      if (index === 1) result.second += 1;
      if (index === 2) result.third += 1;

      result.tables.push({
        tableId,
        score: entry.score,
        place: index + 1,
        points
      });
    });

    tableResults.push({
      tableId,
      rankings,
      leader: rankings[0] || null
    });
  }

  return {
    bestScores,
    tableResults,
    playerResults
  };
}

function placeEmoji(place) {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return "";
}

function installStyles() {
  if (document.getElementById("winterTableLeaderboardStyles")) return;

  const style = document.createElement("style");
  style.id = "winterTableLeaderboardStyles";
  style.textContent = `
    .winter-live-section {
      margin-top: 30px;
      padding-top: 26px;
      border-top: 1px solid #33406d88;
    }

    .winter-live-heading {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 12px;
      margin-bottom: 14px;
    }

    .winter-live-heading h3 {
      margin: 0;
      font-size: 1.3rem;
    }

    .winter-live-heading p {
      margin: 4px 0 0;
      color: #aeb7d8;
      font-size: .82rem;
    }

    .winter-table-leaderboards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .winter-leaderboard-card {
      overflow: hidden;
      border: 1px solid #31436f;
      border-radius: 15px;
      background: linear-gradient(145deg, #0d1730, #080f20);
      box-shadow: 0 12px 28px rgba(0, 0, 0, .24);
    }

    .winter-leaderboard-card.has-scores {
      border-color: #38e8ff66;
    }

    .winter-table-header {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 11px;
      align-items: center;
      padding: 14px 15px;
      border-bottom: 1px solid #33406d88;
      background: linear-gradient(135deg, rgba(56, 232, 255, .09), transparent);
    }

    .winter-table-index {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 9px;
      color: #58e9ff;
      background: #142a4a;
      font-size: .8rem;
      font-weight: 900;
    }

    .winter-table-name {
      color: #f7f8ff;
      font-size: 1rem;
      font-weight: 900;
      line-height: 1.25;
    }

    .winter-current-leader {
      padding: 14px 15px 10px;
    }

    .winter-leader-label {
      color: #91a3cc;
      font-size: .67rem;
      font-weight: 900;
      letter-spacing: .11em;
      text-transform: uppercase;
    }

    .winter-leader-name {
      margin-top: 5px;
      font-size: 1.08rem;
      font-weight: 900;
    }

    .winter-leader-score {
      margin-top: 2px;
      color: #fff;
      font-size: 1.45rem;
      font-weight: 900;
    }

    .winter-score-list {
      padding: 0 15px 14px;
    }

    .winter-score-row {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) auto 48px;
      gap: 10px;
      align-items: center;
      padding: 9px 0;
      border-top: 1px solid #26365d88;
    }

    .winter-score-player {
      font-weight: 800;
    }

    .winter-score-value {
      color: #e7efff;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
      text-align: right;
    }

    .winter-score-points {
      color: #ffd84a;
      font-weight: 900;
      text-align: right;
    }

    .winter-no-score {
      color: #7381a5;
      font-style: italic;
      font-weight: 600;
    }

    .winter-empty-table {
      padding: 18px 15px;
      color: #8d9bc0;
      text-align: center;
    }

    .winter-player-details {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #33406d55;
    }

    .winter-player-details summary {
      color: #9eefff;
      cursor: pointer;
      font-size: .78rem;
      font-weight: 800;
      list-style: none;
    }

    .winter-player-details summary::-webkit-details-marker {
      display: none;
    }

    .winter-player-details summary::before {
      content: "＋ ";
    }

    .winter-player-details[open] summary::before {
      content: "− ";
    }

    .winter-player-detail-list {
      display: grid;
      gap: 6px;
      margin-top: 9px;
    }

    .winter-player-detail-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      color: #aebee6;
      font-size: .74rem;
    }

    @media (max-width: 800px) {
      .winter-table-leaderboards {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 500px) {
      .winter-score-row {
        grid-template-columns: 1fr auto;
      }

      .winter-score-points {
        grid-column: 2;
      }
    }
  `;

  document.head.appendChild(style);
}

function renderSeasonStandingDetails(results) {
  const rows = [...document.querySelectorAll("#seasonStandings .season-player")];

  rows.forEach((row) => {
    const displayedName = row
      .querySelector(".season-player-name")
      ?.textContent
      .replace(/^\S+\s+/, "")
      .trim();

    const player = players.find((item) => item.name === displayedName);

    if (!player || row.querySelector(".winter-player-details")) return;

    const playerResult = results.playerResults[player.id];
    const details = document.createElement("details");
    details.className = "winter-player-details";

    const summary = document.createElement("summary");
    summary.textContent = "Show table-by-table Winter results";
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "winter-player-detail-list";

    const byTable = Object.fromEntries(
      playerResult.tables.map((entry) => [entry.tableId, entry])
    );

    for (const tableId of season.eligibleTableIds || []) {
      const entry = byTable[tableId];
      const detailRow = document.createElement("div");
      detailRow.className = "winter-player-detail-row";

      detailRow.innerHTML = entry
        ? `
          <span>${escapeHtml(tableName(tableId))}</span>
          <span>${placeEmoji(entry.place)} ${formatScore(entry.score)}</span>
          <strong>${entry.points} pts</strong>
        `
        : `
          <span>${escapeHtml(tableName(tableId))}</span>
          <span class="winter-no-score">No score</span>
          <strong>0 pts</strong>
        `;

      list.appendChild(detailRow);
    }

    details.appendChild(list);
    row.querySelector("div:nth-child(2)")?.appendChild(details);
  });
}

function renderWinterTableLeaderboards() {
  const seasonBody = document.querySelector("#seasonView .season-body");
  const standingsSection = document.getElementById("seasonStandings")?.closest(".season-section");

  if (!seasonBody || !standingsSection || !season) return;

  document.getElementById("winterLiveTableSection")?.remove();

  const results = calculateWinterResults();
  const section = document.createElement("section");
  section.id = "winterLiveTableSection";
  section.className = "winter-live-section";

  section.innerHTML = `
    <div class="winter-live-heading">
      <div>
        <h3>Winter Table Standings</h3>
        <p>Each player’s highest Winter 2026 score is shown. Players may improve scores throughout the season.</p>
      </div>
    </div>
    <div class="winter-table-leaderboards"></div>
  `;

  const grid = section.querySelector(".winter-table-leaderboards");

  results.tableResults.forEach((result, index) => {
    const card = document.createElement("article");
    card.className = `winter-leaderboard-card ${result.rankings.length ? "has-scores" : ""}`;

    const header = `
      <div class="winter-table-header">
        <span class="winter-table-index">${index + 1}</span>
        <span class="winter-table-name">${escapeHtml(tableName(result.tableId))}</span>
      </div>
    `;

    if (!result.rankings.length) {
      card.innerHTML = `
        ${header}
        <div class="winter-empty-table">No Winter scores submitted yet</div>
        <div class="winter-score-list">
          ${players.map((player) => {
            const appearance = playerAppearance(player.id);
            return `
              <div class="winter-score-row">
                <span class="winter-score-player" style="color:${appearance.color}">
                  ${appearance.avatar} ${escapeHtml(player.name)}
                </span>
                <span class="winter-no-score">No score</span>
                <span class="winter-score-points">0</span>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else {
      const leaderAppearance = playerAppearance(result.leader.player.id);
      const rankingByPlayer = Object.fromEntries(
        result.rankings.map((entry, placeIndex) => [
          entry.player.id,
          {
            ...entry,
            place: placeIndex + 1,
            points: [5, 3, 1][placeIndex] || 0
          }
        ])
      );

      card.innerHTML = `
        ${header}
        <div class="winter-current-leader">
          <div class="winter-leader-label">Current Winter Leader</div>
          <div class="winter-leader-name" style="color:${leaderAppearance.color}">
            ${leaderAppearance.avatar} ${escapeHtml(result.leader.player.name)}
          </div>
          <div class="winter-leader-score">${formatScore(result.leader.score)}</div>
        </div>
        <div class="winter-score-list">
          ${players.map((player) => {
            const appearance = playerAppearance(player.id);
            const entry = rankingByPlayer[player.id];

            return entry
              ? `
                <div class="winter-score-row">
                  <span class="winter-score-player" style="color:${appearance.color}">
                    ${placeEmoji(entry.place)} ${appearance.avatar} ${escapeHtml(player.name)}
                  </span>
                  <span class="winter-score-value">${formatScore(entry.score)}</span>
                  <span class="winter-score-points">${entry.points} pts</span>
                </div>
              `
              : `
                <div class="winter-score-row">
                  <span class="winter-score-player" style="color:${appearance.color}">
                    ${appearance.avatar} ${escapeHtml(player.name)}
                  </span>
                  <span class="winter-no-score">No score</span>
                  <span class="winter-score-points">0 pts</span>
                </div>
              `;
          }).join("")}
        </div>
      `;
    }

    grid.appendChild(card);
  });

  standingsSection.insertAdjacentElement("afterend", section);
  renderSeasonStandingDetails(results);
}

async function loadWinterData() {
  const [playerSnapshot, tableSnapshot, scoreSnapshot, seasonSnapshot] = await Promise.all([
    getDocs(collection(db, "players")),
    getDocs(collection(db, "tables")),
    getDocs(collection(db, "seasonScores")),
    getDocs(collection(db, "seasons"))
  ]);

  players = playerSnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((player) => player.active === true);

  tables = tableSnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }));

  seasonScores = scoreSnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }));

  season = seasonSnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .find((item) => item.id === "winter-2026") || null;
}

async function initializeWinterTableLeaderboard() {
  installStyles();
  await loadWinterData();

  let attempts = 0;

  const renderWhenReady = () => {
    const seasonStandings = document.getElementById("seasonStandings");

    if (seasonStandings && seasonStandings.children.length > 0) {
      renderWinterTableLeaderboards();
      return;
    }

    attempts += 1;

    if (attempts < 40) {
      window.setTimeout(renderWhenReady, 250);
    }
  };

  renderWhenReady();
}

initializeWinterTableLeaderboard().catch((error) => {
  console.error("Winter table leaderboard could not be loaded.", error);
});
