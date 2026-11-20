import {
  getApp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";

import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const db = getFirestore(getApp());

let updateRunning = false;
let updateCompleted = false;

function formatScore(value) {
  return Number(value || 0).toLocaleString("en-US");
}

async function calculateBattleMetrics() {
  if (updateRunning || updateCompleted) {
    return;
  }

  updateRunning = true;

  try {
    const [
      tableSnapshot,
      playerSnapshot,
      scoreSnapshot
    ] = await Promise.all([
      getDocs(collection(db, "tables")),
      getDocs(collection(db, "players")),
      getDocs(collection(db, "scores"))
    ]);

    const tables = tableSnapshot.docs
      .map((document) => {
        return {
          id: document.id,
          ...document.data()
        };
      })
      .filter((table) => {
        return table.active === true;
      });

    const players = playerSnapshot.docs
      .map((document) => {
        return {
          id: document.id,
          ...document.data()
        };
      })
      .filter((player) => {
        return player.active === true;
      });

    const scores = scoreSnapshot.docs.map((document) => {
      return {
        id: document.id,
        ...document.data()
      };
    });

    const comparisons = [];

    for (const table of tables) {
      const playerBests = players
        .map((player) => {
          const playerScores = scores
            .filter((score) => {
              return (
                score.tableId === table.id &&
                score.playerId === player.id
              );
            })
            .map((score) => {
              return Number(score.score);
            })
            .filter((score) => {
              return Number.isFinite(score) && score > 0;
            });

          return {
            player,
            score:
              playerScores.length > 0
                ? Math.max(...playerScores)
                : 0
          };
        })
        .filter((result) => {
          return result.score > 0;
        })
        .sort((a, b) => {
          return b.score - a.score;
        });

      if (playerBests.length < 2) {
        continue;
      }

      const firstPlace = playerBests[0];
      const secondPlace = playerBests[1];

      if (firstPlace.score === secondPlace.score) {
        continue;
      }

      const pointDifference =
        firstPlace.score - secondPlace.score;

      const relativeDifference =
        pointDifference / firstPlace.score;

      comparisons.push({
        table,
        firstPlace,
        secondPlace,
        pointDifference,
        relativeDifference
      });
    }

    if (comparisons.length === 0) {
      updateCompleted = true;
      return;
    }

    const closestBattle = [...comparisons].sort(
      (a, b) => {
        return (
          a.relativeDifference -
          b.relativeDifference
        );
      }
    )[0];

    const biggestBeatdown = [...comparisons].sort(
      (a, b) => {
        return (
          b.relativeDifference -
          a.relativeDifference
        );
      }
    )[0];

    updateHighlightCard(
      "Closest Battle",
      closestBattle
    );

    updateHighlightCard(
      "Biggest Beatdown",
      biggestBeatdown
    );

    updateCompleted = true;
  } catch (error) {
    console.error(
      "Competition metrics could not be calculated.",
      error
    );
  } finally {
    updateRunning = false;
  }
}

function updateHighlightCard(title, result) {
  const highlightCards = [
    ...document.querySelectorAll(
      "#highlights .card"
    )
  ];

  const matchingCard = highlightCards.find((card) => {
    const titleElement =
      card.querySelector(".highlight-title");

    return titleElement?.textContent.includes(title);
  });

  if (!matchingCard) {
    return;
  }

  const mainElement =
    matchingCard.querySelector(".highlight-main");

  const detailElement =
    matchingCard.querySelector(".highlight-sub");

  if (mainElement) {
    mainElement.textContent = result.table.name;
  }

  if (detailElement) {
    detailElement.textContent =
      `${result.firstPlace.player.name} leads ` +
      `${result.secondPlace.player.name} by ` +
      `${formatScore(result.pointDifference)} points`;
  }

  matchingCard.title =
    `Relative scoring gap: ` +
    `${(result.relativeDifference * 100).toFixed(2)}%. ` +
    `The ranking is normalized across tables, while ` +
    `the visible lead remains in actual points.`;
}

function waitForHighlightCards() {
  const highlights =
    document.getElementById("highlights");

  if (!highlights) {
    return;
  }

  const cardIsReady = () => {
    return [...highlights.querySelectorAll(".card")]
      .some((card) => {
        return card
          .querySelector(".highlight-title")
          ?.textContent.includes("Closest Battle");
      });
  };

  if (cardIsReady()) {
    calculateBattleMetrics();
    return;
  }

  const observer = new MutationObserver(() => {
    if (!cardIsReady()) {
      return;
    }

    observer.disconnect();
    calculateBattleMetrics();
  });

  observer.observe(highlights, {
    childList: true,
    subtree: true
  });

  window.setTimeout(() => {
    observer.disconnect();

    if (!updateCompleted) {
      calculateBattleMetrics();
    }
  }, 10000);
}

waitForHighlightCards();
