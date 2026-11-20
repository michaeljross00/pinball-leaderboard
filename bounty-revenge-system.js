import {
  getApp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const auth = getAuth(getApp());
const db = getFirestore(getApp());

const MONTHLY_CLAIM_LIMIT = 3;
const MONTHLY_TARGET_LIMIT = 4;

const MINIMUM_SCORED_TABLES = 10;
const MINIMUM_RECORDS_HELD = 3;
const MINIMUM_READY_PLAYERS = 3;

let currentUser = null;

let players = [];
let tables = [];
let scores = [];
let bounties = [];
let challengeResults = [];

const formatScore = (value) => {
  return Number(value || 0).toLocaleString("en-US");
};

const currentMonthKey = () => {
  return new Date().toISOString().slice(0, 7);
};

const dateFromValue = (value) => {
  return value?.toDate
    ? value.toDate()
    : new Date(value || 0);
};

const styles = document.createElement("style");

styles.textContent = `
  .personal-mission {
    margin: 16px 0;
    padding: 18px;
    border: 2px solid #eab308;
    border-radius: 16px;
    background:
      linear-gradient(
        135deg,
        rgba(59, 45, 7, 0.18),
        #11162a
      );
    box-shadow:
      0 0 24px rgba(234, 179, 8, 0.15);
  }

  .personal-mission.revenge {
    border-color: #ff667d;
    background:
      linear-gradient(
        135deg,
        rgba(93, 20, 37, 0.20),
        #11162a
      );
    box-shadow:
      0 0 24px rgba(255, 102, 125, 0.13);
  }

  .mission-kicker {
    color: #ffd84a;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .personal-mission.revenge .mission-kicker {
    color: #ff8ca0;
  }

  .mission-title {
    margin: 7px 0;
    font-size: 1.3rem;
    font-weight: 900;
  }

  .mission-meta {
    color: #aeb7d8;
    line-height: 1.5;
  }

  .mission-score {
    margin-top: 8px;
    color: white;
    font-size: 1.45rem;
    font-weight: 900;
  }

  .mission-progress {
    display: grid;
    grid-template-columns:
      repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  .mission-chip {
    padding: 10px;
    color: #cbd5e1;
    border: 1px solid #33406d;
    border-radius: 9px;
    background: #090d1c;
  }

  .mission-chip.ready {
    border-color: rgba(86, 243, 154, 0.55);
    background: rgba(86, 243, 154, 0.08);
  }

  .mission-chip.waiting {
    border-color: rgba(255, 216, 74, 0.38);
  }

  .mission-readiness-summary {
    margin-top: 12px;
    color: #aeb7d8;
    font-size: 0.82rem;
  }

  .fun-highlight-card {
    position: relative;
  }

  .dynamic-trophy {
    display: inline-grid;
    place-items: center;
  }
`;

document.head.appendChild(styles);

function getPlayerName(playerId) {
  return players.find((player) => {
    return player.id === playerId;
  })?.name || "Unknown Player";
}

function getTableName(tableId) {
  return tables.find((table) => {
    return table.id === tableId;
  })?.name || tableId;
}

function getPersonalBestMap() {
  const personalBests = {};

  for (const score of scores) {
    const key =
      `${score.tableId}|${score.playerId}`;

    personalBests[key] = Math.max(
      personalBests[key] || 0,
      Number(score.score)
    );
  }

  return personalBests;
}

function calculateStandings() {
  const personalBests = getPersonalBestMap();

  const wins = Object.fromEntries(
    players.map((player) => {
      return [player.id, 0];
    })
  );

  const leaders = {};

  for (const table of tables) {
    const rankings = players
      .map((player) => {
        return {
          id: player.id,
          score:
            personalBests[
              `${table.id}|${player.id}`
            ] || 0
        };
      })
      .filter((result) => {
        return result.score > 0;
      })
      .sort((a, b) => {
        return b.score - a.score;
      });

    if (
      rankings[0] &&
      rankings[0].score >
        Number(rankings[1]?.score ?? -1)
    ) {
      wins[rankings[0].id] += 1;

      leaders[table.id] = {
        id: rankings[0].id,
        score: rankings[0].score
      };
    }
  }

  return {
    personalBests,
    wins,
    leaders
  };
}

function calculateReadiness() {
  const { wins } = calculateStandings();

  return players.map((player) => {
    const scoredTableCount = new Set(
      scores
        .filter((score) => {
          return score.playerId === player.id;
        })
        .map((score) => {
          return score.tableId;
        })
    ).size;

    const recordCount = wins[player.id] || 0;

    return {
      id: player.id,
      name: player.name,
      tables: scoredTableCount,
      wins: recordCount,
      ready:
        scoredTableCount >= MINIMUM_SCORED_TABLES &&
        recordCount >= MINIMUM_RECORDS_HELD
    };
  });
}

function weightedRandomSelection(weightedItems) {
  const totalWeight = weightedItems.reduce(
    (total, item) => {
      return total + item.weight;
    },
    0
  );

  let randomValue =
    Math.random() * totalWeight;

  for (const item of weightedItems) {
    randomValue -= item.weight;

    if (randomValue <= 0) {
      return item;
    }
  }

  return weightedItems.at(-1);
}

async function reloadData() {
  const [
    playerSnapshot,
    tableSnapshot,
    scoreSnapshot,
    bountySnapshot,
    challengeSnapshot
  ] = await Promise.all([
    getDocs(collection(db, "players")),
    getDocs(collection(db, "tables")),
    getDocs(collection(db, "scores")),
    getDocs(collection(db, "bounties")),
    getDocs(collection(db, "challengeResults"))
  ]);

  players = playerSnapshot.docs
    .map((document) => {
      return {
        id: document.id,
        ...document.data()
      };
    })
    .filter((player) => {
      return player.active === true;
    });

  tables = tableSnapshot.docs
    .map((document) => {
      return {
        id: document.id,
        ...document.data()
      };
    })
    .filter((table) => {
      return table.active === true;
    });

  scores = scoreSnapshot.docs.map((document) => {
    return {
      id: document.id,
      ...document.data()
    };
  });

  bounties = bountySnapshot.docs.map((document) => {
    return {
      id: document.id,
      ...document.data()
    };
  });

  challengeResults =
    challengeSnapshot.docs.map((document) => {
      return {
        id: document.id,
        ...document.data()
      };
    });
}

async function expireOldBounties() {
  if (!currentUser) {
    return;
  }

  const currentMonth = currentMonthKey();

  const expiredBounties = bounties.filter((bounty) => {
    return (
      bounty.hunterId === currentUser.uid &&
      bounty.status === "active" &&
      bounty.monthKey !== currentMonth
    );
  });

  for (const bounty of expiredBounties) {
    await runTransaction(
      db,
      async (transaction) => {
        const bountyReference = doc(
          db,
          "bounties",
          bounty.id
        );

        const snapshot =
          await transaction.get(bountyReference);

        if (
          snapshot.exists() &&
          snapshot.data().status === "active"
        ) {
          transaction.update(
            bountyReference,
            {
              status: "expired",
              expiredAt: serverTimestamp()
            }
          );
        }
      }
    );
  }
}

async function evaluateActiveBountyClaim() {
  if (!currentUser) {
    return false;
  }

  const monthKey = currentMonthKey();

  const activeBounty = bounties.find((bounty) => {
    return (
      bounty.hunterId === currentUser.uid &&
      bounty.monthKey === monthKey &&
      bounty.status === "active"
    );
  });

  if (!activeBounty) {
    return false;
  }

  const { leaders } = calculateStandings();

  const currentLeader =
    leaders[activeBounty.tableId];

  if (
    !currentLeader ||
    currentLeader.id !== currentUser.uid
  ) {
    return false;
  }

  const claimedThisMonth =
    bounties.filter((bounty) => {
      return (
        bounty.hunterId === currentUser.uid &&
        bounty.monthKey === monthKey &&
        bounty.status === "claimed"
      );
    }).length;

  if (
    claimedThisMonth >=
    MONTHLY_CLAIM_LIMIT
  ) {
    return false;
  }

  await runTransaction(
    db,
    async (transaction) => {
      const bountyReference = doc(
        db,
        "bounties",
        activeBounty.id
      );

      const snapshot =
        await transaction.get(bountyReference);

      if (
        snapshot.exists() &&
        snapshot.data().status === "active"
      ) {
        transaction.update(
          bountyReference,
          {
            status: "claimed",
            claimedAt: serverTimestamp(),
            claimedScore:
              currentLeader.score
          }
        );
      }
    }
  );

  return true;
}

async function assignBounty() {
  if (!currentUser) {
    return null;
  }

  const monthKey = currentMonthKey();
  const readiness = calculateReadiness();

  const eligiblePlayers =
    readiness.filter((player) => {
      return player.ready;
    });

  /*
    At least three qualified players are required.

    A player who has not qualified:
    - does not delay the other qualified players
    - does not receive a bounty
    - cannot be targeted until qualified
  */
  if (
    eligiblePlayers.length <
      MINIMUM_READY_PLAYERS ||
    !eligiblePlayers.some((player) => {
      return player.id === currentUser.uid;
    })
  ) {
    return null;
  }

  const claimedThisMonth =
    bounties.filter((bounty) => {
      return (
        bounty.hunterId === currentUser.uid &&
        bounty.monthKey === monthKey &&
        bounty.status === "claimed"
      );
    }).length;

  if (
    claimedThisMonth >=
    MONTHLY_CLAIM_LIMIT
  ) {
    return null;
  }

  const currentActiveBounty =
    bounties.find((bounty) => {
      return (
        bounty.hunterId === currentUser.uid &&
        bounty.monthKey === monthKey &&
        bounty.status === "active"
      );
    });

  if (currentActiveBounty) {
    return null;
  }

  const {
    wins,
    leaders
  } = calculateStandings();

  /*
    Count every bounty assignment received during
    the current month, not merely active bounties.

    This enforces the four-bounty monthly target cap.
  */
  const monthlyIncomingAssignments = {};

  bounties
    .filter((bounty) => {
      return bounty.monthKey === monthKey;
    })
    .forEach((bounty) => {
      monthlyIncomingAssignments[
        bounty.targetPlayerId
      ] =
        (
          monthlyIncomingAssignments[
            bounty.targetPlayerId
          ] || 0
        ) + 1;
    });

  const eligibleIds = new Set(
    eligiblePlayers.map((player) => {
      return player.id;
    })
  );

  const eligibleOpponents =
    players.filter((player) => {
      return (
        eligibleIds.has(player.id) &&
        player.id !== currentUser.uid &&
        (
          monthlyIncomingAssignments[
            player.id
          ] || 0
        ) < MONTHLY_TARGET_LIMIT &&
        Object.values(leaders).some(
          (leader) => {
            return leader.id === player.id;
          }
        )
      );
    });

  if (!eligibleOpponents.length) {
    return null;
  }

  const winTotals =
    eligiblePlayers.map((player) => {
      return wins[player.id] || 0;
    });

  const minimumWins =
    Math.min(...winTotals);

  const maximumWins =
    Math.max(...winTotals);

  const standingsRange =
    Math.max(
      1,
      maximumWins - minimumWins
    );

  /*
    Target weighting:

    A player at the bottom of qualified standings
    receives approximately 1 base weight.

    A runaway leader receives up to approximately
    6 base weight.

    Existing assignments decrease the weight
    gradually but do not exclude that player until
    the monthly target limit of four is reached.
  */
  const weightedOpponents =
    eligibleOpponents.map((player) => {
      const recordDisparity =
        (
          (wins[player.id] || 0) -
          minimumWins
        ) / standingsRange;

      const standingsPressure =
        1 + (5 * recordDisparity);

      const incomingCount =
        monthlyIncomingAssignments[
          player.id
        ] || 0;

      const saturationAdjustment =
        Math.max(
          0.35,
          1 - (0.18 * incomingCount)
        );

      return {
        player,
        weight:
          standingsPressure *
          saturationAdjustment
      };
    });

  const chosenOpponent =
    weightedRandomSelection(
      weightedOpponents
    ).player;

  /*
    Prevent immediate repetition of the hunter's
    previous two bounty tables.
  */
  const recentlyUsedTables = bounties
    .filter((bounty) => {
      return (
        bounty.hunterId === currentUser.uid
      );
    })
    .sort((a, b) => {
      return (
        dateFromValue(b.assignedAt) -
        dateFromValue(a.assignedAt)
      );
    })
    .slice(0, 2)
    .map((bounty) => {
      return bounty.tableId;
    });

  let eligibleTargetTables =
    Object.entries(leaders)
      .filter(([tableId, leader]) => {
        return (
          leader.id === chosenOpponent.id &&
          !recentlyUsedTables.includes(
            tableId
          )
        );
      });

  if (!eligibleTargetTables.length) {
    eligibleTargetTables =
      Object.entries(leaders)
        .filter(([, leader]) => {
          return (
            leader.id ===
            chosenOpponent.id
          );
        });
  }

  if (!eligibleTargetTables.length) {
    return null;
  }

  const chosenTarget =
    eligibleTargetTables[
      Math.floor(
        Math.random() *
        eligibleTargetTables.length
      )
    ];

  const targetTableId =
    chosenTarget[0];

  const bountyId =
    `${monthKey}_${currentUser.uid}_${Date.now()}`;

  await runTransaction(
    db,
    async (transaction) => {
      const existingBountySnapshot =
        await getDocs(
          collection(db, "bounties")
        );

      const alreadyHasActiveBounty =
        existingBountySnapshot.docs.some(
          (document) => {
            const bounty = document.data();

            return (
              bounty.hunterId ===
                currentUser.uid &&
              bounty.monthKey ===
                monthKey &&
              bounty.status ===
                "active"
            );
          }
        );

      if (alreadyHasActiveBounty) {
        return;
      }

      transaction.set(
        doc(db, "bounties", bountyId),
        {
          hunterId: currentUser.uid,
          targetPlayerId:
            chosenOpponent.id,
          tableId: targetTableId,
          monthKey,
          status: "active",
          assignedAt: serverTimestamp()
        }
      );
    }
  );

  return true;
}

function calculateTakeoverEvents() {
  const sortedScores = [...scores].sort(
    (a, b) => {
      return (
        dateFromValue(
          a.submittedAt || a.achievedAt
        ) -
        dateFromValue(
          b.submittedAt || b.achievedAt
        )
      );
    }
  );

  const personalBests = {};
  const tableLeaders = {};
  const events = [];

  for (const score of sortedScores) {
    const key =
      `${score.tableId}|${score.playerId}`;

    if (
      Number(score.score) <=
      Number(personalBests[key] || 0)
    ) {
      continue;
    }

    personalBests[key] =
      Number(score.score);

    const rankings = players
      .map((player) => {
        return {
          id: player.id,
          score:
            personalBests[
              `${score.tableId}|${player.id}`
            ] || 0
        };
      })
      .filter((result) => {
        return result.score > 0;
      })
      .sort((a, b) => {
        return b.score - a.score;
      });

    const newLeader =
      rankings[0] &&
      rankings[0].score >
        Number(rankings[1]?.score ?? -1)
        ? rankings[0].id
        : null;

    const previousLeader =
      tableLeaders[score.tableId] || null;

    if (
      newLeader &&
      newLeader !== previousLeader
    ) {
      events.push({
        tableId: score.tableId,
        from: previousLeader,
        to: newLeader,
        date: dateFromValue(
          score.submittedAt ||
          score.achievedAt
        ),
        score: Number(score.score)
      });

      tableLeaders[score.tableId] =
        newLeader;
    }
  }

  return events;
}

function renderBountyAndRevengeSections() {
  const dashboard =
    document.getElementById(
      "dashboardView"
    );

  const monthlyChallenge =
    document.getElementById(
      "monthlyChallenge"
    );

  if (
    !dashboard ||
    !monthlyChallenge ||
    !currentUser
  ) {
    return;
  }

  document
    .querySelectorAll(
      ".personal-mission"
    )
    .forEach((element) => {
      element.remove();
    });

  const monthKey = currentMonthKey();
  const readiness = calculateReadiness();

  const readyPlayers =
    readiness.filter((player) => {
      return player.ready;
    });

  const currentPlayerReady =
    readyPlayers.some((player) => {
      return player.id === currentUser.uid;
    });

  const claimedThisMonth =
    bounties.filter((bounty) => {
      return (
        bounty.hunterId ===
          currentUser.uid &&
        bounty.monthKey === monthKey &&
        bounty.status === "claimed"
      );
    }).length;

  const activeBounty =
    bounties.find((bounty) => {
      return (
        bounty.hunterId ===
          currentUser.uid &&
        bounty.monthKey === monthKey &&
        bounty.status === "active"
      );
    });

  const bountySection =
    document.createElement("section");

  bountySection.className =
    "personal-mission";

  if (
    readyPlayers.length <
      MINIMUM_READY_PLAYERS ||
    !currentPlayerReady
  ) {
    bountySection.innerHTML = `
      <div class="mission-kicker">
        💵 System Bounties · Preseason
      </div>

      <div class="mission-title">
        Bounties unlock when at least
        ${MINIMUM_READY_PLAYERS} players are competition-ready
      </div>

      <div class="mission-progress">
        ${readiness
          .map((player) => {
            return `
              <div class="mission-chip ${
                player.ready
                  ? "ready"
                  : "waiting"
              }">
                ${player.name}:
                ${player.tables}/${MINIMUM_SCORED_TABLES}
                tables ·
                ${player.wins}/${MINIMUM_RECORDS_HELD}
                records
                ${player.ready ? "✅" : "⏳"}
              </div>
            `;
          })
          .join("")}
      </div>

      <div class="mission-readiness-summary">
        ${readyPlayers.length}/${MINIMUM_READY_PLAYERS}
        required players are currently ready.
        Non-qualified players do not delay qualified players
        after the three-player threshold is reached.
      </div>
    `;
  } else if (
    claimedThisMonth >=
    MONTHLY_CLAIM_LIMIT
  ) {
    bountySection.innerHTML = `
      <div class="mission-kicker">
        💵 Bounty Hunter
      </div>

      <div class="mission-title">
        Monthly bounty limit reached
      </div>

      <div class="mission-score">
        ${claimedThisMonth}/${MONTHLY_CLAIM_LIMIT}
        bounties claimed
      </div>

      <div class="mission-meta">
        A new assignment arrives next month.
      </div>
    `;
  } else if (activeBounty) {
    const { leaders } =
      calculateStandings();

    const currentTarget =
      leaders[activeBounty.tableId];

    bountySection.innerHTML = `
      <div class="mission-kicker">
        💵 Active System Bounty
      </div>

      <div class="mission-title">
        Take
        ${getPlayerName(
          activeBounty.targetPlayerId
        )}'s record on
        ${getTableName(
          activeBounty.tableId
        )}
      </div>

      <div class="mission-score">
        Current target:
        ${formatScore(
          currentTarget?.score || 0
        )}
      </div>

      <div class="mission-meta">
        Moving target. The hunter must actually
        take first place on this table.
        ${claimedThisMonth}/${MONTHLY_CLAIM_LIMIT}
        claimed this month.
      </div>
    `;
  } else {
    bountySection.innerHTML = `
      <div class="mission-kicker">
        💵 System Bounty
      </div>

      <div class="mission-title">
        Preparing the next assignment…
      </div>
    `;
  }

  monthlyChallenge.insertAdjacentElement(
    "afterend",
    bountySection
  );

  /*
    Personalized Revenge Challenges
  */
  const takeoverEvents =
    calculateTakeoverEvents();

  const mostRecentLossByTable = {};

  for (
    const event of takeoverEvents.filter(
      (item) => {
        return (
          item.from ===
          currentUser.uid
        );
      }
    )
  ) {
    mostRecentLossByTable[
      event.tableId
    ] = event;
  }

  const eligibleRevengeChallenges =
    Object.values(
      mostRecentLossByTable
    ).filter((loss) => {
      const stillWithinSevenDays =
        Date.now() - loss.date.getTime() <
        7 * 24 * 60 * 60 * 1000;

      const alreadyRetaken =
        takeoverEvents.some((event) => {
          return (
            event.tableId ===
              loss.tableId &&
            event.to ===
              currentUser.uid &&
            event.date > loss.date
          );
        });

      return (
        stillWithinSevenDays &&
        !alreadyRetaken
      );
    });

  let insertionReference =
    bountySection;

  for (
    const revenge of
    eligibleRevengeChallenges
  ) {
    const millisecondsRemaining =
      (
        7 *
        24 *
        60 *
        60 *
        1000
      ) -
      (
        Date.now() -
        revenge.date.getTime()
      );

    const daysRemaining =
      Math.max(
        0,
        Math.ceil(
          millisecondsRemaining /
          (
            24 *
            60 *
            60 *
            1000
          )
        )
      );

    const revengeSection =
      document.createElement("section");

    revengeSection.className =
      "personal-mission revenge";

    revengeSection.innerHTML = `
      <div class="mission-kicker">
        🛡️ Revenge Challenge · Only visible to you
      </div>

      <div class="mission-title">
        Retake
        ${getTableName(
          revenge.tableId
        )}
        from
        ${getPlayerName(
          revenge.to
        )}
      </div>

      <div class="mission-score">
        Target:
        ${formatScore(
          revenge.score
        )}
      </div>

      <div class="mission-meta">
        ${daysRemaining}
        day${daysRemaining === 1 ? "" : "s"}
        remaining to earn a Record Defense shield.
      </div>
    `;

    insertionReference.insertAdjacentElement(
      "afterend",
      revengeSection
    );

    insertionReference =
      revengeSection;
  }
}

function calculateFunStatistics() {
  const takeoverEvents =
    calculateTakeoverEvents();

  const claimedBounties = {};
  const defenses = {};
  const volatileTables = {};
  const tripleWins = {};

  bounties
    .filter((bounty) => {
      return bounty.status === "claimed";
    })
    .forEach((bounty) => {
      claimedBounties[
        bounty.hunterId
      ] =
        (
          claimedBounties[
            bounty.hunterId
          ] || 0
        ) + 1;
    });

  takeoverEvents
    .filter((event) => {
      return Boolean(event.from);
    })
    .forEach((event) => {
      volatileTables[
        event.tableId
      ] =
        (
          volatileTables[
            event.tableId
          ] || 0
        ) + 1;
    });

  for (
    let index = 0;
    index < takeoverEvents.length;
    index += 1
  ) {
    const loss = takeoverEvents[index];

    if (!loss.from) {
      continue;
    }

    for (
      let laterIndex = index + 1;
      laterIndex < takeoverEvents.length;
      laterIndex += 1
    ) {
      const possibleRetake =
        takeoverEvents[laterIndex];

      if (
        possibleRetake.tableId !==
        loss.tableId
      ) {
        continue;
      }

      if (
        possibleRetake.to ===
          loss.from &&
        (
          possibleRetake.date -
          loss.date
        ) <=
          7 * 24 * 60 * 60 * 1000
      ) {
        defenses[possibleRetake.to] =
          (
            defenses[
              possibleRetake.to
            ] || 0
          ) + 1;
      }

      break;
    }
  }

  challengeResults
    .filter((result) => {
      return result.type === "triple";
    })
    .forEach((result) => {
      tripleWins[result.winnerId] =
        (
          tripleWins[
            result.winnerId
          ] || 0
        ) + 1;
    });

  const currentRecordEvents = {};

  for (const event of takeoverEvents) {
    currentRecordEvents[
      event.tableId
    ] = event;
  }

  let ironRecord = null;

  for (
    const event of
    Object.values(currentRecordEvents)
  ) {
    if (
      event.to &&
      (
        !ironRecord ||
        event.date < ironRecord.date
      )
    ) {
      ironRecord = event;
    }
  }

  let fastestRevenge = null;

  for (
    let index = 0;
    index < takeoverEvents.length;
    index += 1
  ) {
    const loss = takeoverEvents[index];

    if (!loss.from) {
      continue;
    }

    for (
      let laterIndex = index + 1;
      laterIndex < takeoverEvents.length;
      laterIndex += 1
    ) {
      const retake =
        takeoverEvents[laterIndex];

      if (
        retake.tableId !==
        loss.tableId
      ) {
        continue;
      }

      if (retake.to === loss.from) {
        const milliseconds =
          retake.date - loss.date;

        if (
          milliseconds <=
            7 * 24 * 60 * 60 * 1000 &&
          (
            !fastestRevenge ||
            milliseconds <
              fastestRevenge.milliseconds
          )
        ) {
          fastestRevenge = {
            ...retake,
            milliseconds
          };
        }

        break;
      }
    }
  }

  return {
    claimedBounties,
    defenses,
    volatileTables,
    tripleWins,
    ironRecord,
    fastestRevenge
  };
}

function highestEntry(values) {
  return Object.entries(values)
    .sort((a, b) => {
      return b[1] - a[1];
    })[0] || null;
}

function renderFunHighlightsAndTrophies() {
  const highlightContainer =
    document.getElementById(
      "highlights"
    );

  const standingsContainer =
    document.getElementById(
      "standings"
    );

  if (
    !highlightContainer ||
    !standingsContainer
  ) {
    return false;
  }

  const {
    claimedBounties,
    defenses,
    volatileTables,
    tripleWins,
    ironRecord,
    fastestRevenge
  } = calculateFunStatistics();

  /*
    Emoji changes to existing Dashboard content.
  */
  document
    .querySelectorAll(
      "#highlights .highlight-title"
    )
    .forEach((element) => {
      if (
        element.textContent.includes(
          "Most Improved"
        )
      ) {
        element.textContent =
          element.textContent.replace(
            "🎯",
            "📈"
          );
      }
    });

  document
    .querySelectorAll(
      '#standings ' +
      '[aria-label="Trophy Case"] ' +
      'span[title="Monthly Challenge Champion"]'
    )
    .forEach((element) => {
      element.textContent = "🗓️";
    });

  document
    .querySelectorAll(
      '#standings ' +
      '.award-badges ' +
      'span[title="Previous Monthly Champion"]'
    )
    .forEach((element) => {
      element.textContent = "🗓️";
    });

  /*
    Add the six new Competition Highlight cards once.
  */
  if (
    !highlightContainer.querySelector(
      '[data-consolidated-highlight="true"]'
    )
  ) {
    const bountyLeader =
      highestEntry(claimedBounties);

    const defenderLeader =
      highestEntry(defenses);

    const volatileLeader =
      highestEntry(volatileTables);

    const tripleLeader =
      highestEntry(tripleWins);

    const cards = [
      [
        "💵 Bounty Hunter",
        bountyLeader
          ? `${getPlayerName(
              bountyLeader[0]
            )} · ${bountyLeader[1]} claimed`
          : "No bounties claimed",
        "Most completed system bounties"
      ],
      [
        "🛡️ Best Defender",
        defenderLeader
          ? `${getPlayerName(
              defenderLeader[0]
            )} · ${defenderLeader[1]} defenses`
          : "No defenses yet",
        "Records retaken within seven days"
      ],
      [
        "🎢 Most Volatile Record",
        volatileLeader
          ? `${getTableName(
              volatileLeader[0]
            )} · ${volatileLeader[1]} takeovers`
          : "No record changes yet",
        "Table with the most leadership changes"
      ],
      [
        "🏰 Iron Record",
        ironRecord
          ? `${getPlayerName(
              ironRecord.to
            )} · ${getTableName(
              ironRecord.tableId
            )}`
          : "Not available",
        ironRecord
          ? `Held for ${Math.max(
              0,
              Math.floor(
                (
                  Date.now() -
                  ironRecord.date.getTime()
                ) /
                (
                  24 *
                  60 *
                  60 *
                  1000
                )
              )
            )} days`
          : "Longest-held active record"
      ],
      [
        "⚡ Fastest Revenge",
        fastestRevenge
          ? `${getPlayerName(
              fastestRevenge.to
            )} · ${getTableName(
              fastestRevenge.tableId
            )}`
          : "No revenge yet",
        fastestRevenge
          ? `Retaken in ${(
              fastestRevenge.milliseconds /
              (
                60 *
                60 *
                1000
              )
            ).toFixed(1)} hours`
          : "Fastest retake within seven days"
      ],
      [
        "🎰 Triple Specialist",
        tripleLeader
          ? `${getPlayerName(
              tripleLeader[0]
            )} · ${tripleLeader[1]} wins`
          : "No Triple champion yet",
        "Most Weekend Triple victories"
      ]
    ];

    for (
      const [
        title,
        main,
        description
      ] of cards
    ) {
      const card =
        document.createElement("article");

      card.className =
        "card fun-highlight-card";

      card.dataset.consolidatedHighlight =
        "true";

      card.innerHTML = `
        <div class="highlight-title">
          ${title}
        </div>

        <div class="highlight-main">
          ${main}
        </div>

        <div class="highlight-sub">
          ${description}
        </div>
      `;

      highlightContainer.appendChild(card);
    }
  }

  /*
    Add bounty trophies and replace perfect
    Survivor trophies.
  */
  document
    .querySelectorAll(
      "#standings .card"
    )
    .forEach((card) => {
      const displayedName =
        card
          .querySelector(".stat-name")
          ?.textContent
          .trim();

      const player = players.find(
        (item) => {
          return item.name === displayedName;
        }
      );

      const trophyShelf =
        card.querySelector(
          '[aria-label="Trophy Case"]'
        );

      if (!player || !trophyShelf) {
        return;
      }

      /*
        Add only missing bounty trophies.
      */
      const desiredBountyTrophies =
        claimedBounties[
          player.id
        ] || 0;

      const existingBountyTrophies =
        trophyShelf.querySelectorAll(
          '[data-bounty-trophy="true"]'
        ).length;

      for (
        let index =
          existingBountyTrophies;
        index <
          desiredBountyTrophies;
        index += 1
      ) {
        const trophy =
          document.createElement("span");

        trophy.dataset.bountyTrophy =
          "true";

        trophy.className =
          "dynamic-trophy";

        trophy.title =
          "System Bounty Claimed";

        trophy.textContent = "💵";

        trophyShelf.appendChild(trophy);
      }

      /*
        A Survivor champion gets 💎 instead
        of ☠️ when the winner received no strike.
      */
      const survivorWins =
        challengeResults.filter(
          (result) => {
            return (
              result.type === "survivor" &&
              result.winnerId === player.id
            );
          }
        );

      const perfectSurvivorCount =
        survivorWins.filter((result) => {
          return !(
            result.rounds || []
          ).some((round) => {
            return (
              round.strikeTo ===
              player.id
            );
          });
        }).length;

      const standardSurvivorTrophies = [
        ...trophyShelf.querySelectorAll(
          'span[title="Survivor Champion"]'
        )
      ];

      for (
        let index = 0;
        index <
          Math.min(
            perfectSurvivorCount,
            standardSurvivorTrophies.length
          );
        index += 1
      ) {
        standardSurvivorTrophies[
          index
        ].textContent = "💎";

        standardSurvivorTrophies[
          index
        ].title =
          "Perfect Survivor Champion: won without a strike";
      }
    });

  return true;
}

function renderExtrasWhenDashboardIsReady(
  attempt = 0
) {
  const rendered =
    renderFunHighlightsAndTrophies();

  if (rendered || attempt >= 30) {
    return;
  }

  window.setTimeout(() => {
    renderExtrasWhenDashboardIsReady(
      attempt + 1
    );
  }, 250);
}

async function initializeBountySystem() {
  await reloadData();

  if (!currentUser) {
    return;
  }

  await expireOldBounties();
  await reloadData();

  const bountyWasClaimed =
    await evaluateActiveBountyClaim();

  if (bountyWasClaimed) {
    await reloadData();
  }

  await assignBounty();
  await reloadData();

  renderBountyAndRevengeSections();

  /*
    No MutationObserver is used here.

    The function simply waits until the main Dashboard
    has rendered, applies the enhancements once, and stops.
  */
  renderExtrasWhenDashboardIsReady();
}

onAuthStateChanged(
  auth,
  (authenticatedUser) => {
    currentUser =
      authenticatedUser;

    if (authenticatedUser) {
      initializeBountySystem()
        .catch((error) => {
          console.error(
            "Bounty system could not initialize.",
            error
          );
        });
    }
  }
);
