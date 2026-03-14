import React, { useEffect, useMemo, useRef, useState } from "react";

const UNIT_TYPES = ["swordsman", "spearman", "archer", "cavalry"];
const LANE_ORDER = ["left", "center", "right"];

const UNIT_STATS = {
  swordsman: {
    attack: 5.2,
    hp: 24,
    defense: 2.4,
    cap: 4,
    laneBias: { left: 1, center: 1.15, right: 1 },
  },
  spearman: {
    attack: 4.8,
    hp: 22,
    defense: 3.4,
    cap: 3,
    laneBias: { left: 1, center: 1.2, right: 1 },
  },
  archer: {
    attack: 5.8,
    hp: 15,
    defense: 1.2,
    cap: 1,
    laneBias: { left: 0.9, center: 1.35, right: 0.9 },
  },
  cavalry: {
    attack: 8.6,
    hp: 30,
    defense: 4.4,
    cap: 2,
    laneBias: { left: 1.2, center: 0.9, right: 1.2 },
  },
};

const TYPE_LABEL = {
  swordsman: "Swordsman",
  spearman: "Spearman",
  archer: "Archer",
  cavalry: "Cavalry",
};

const TYPE_COLOR = {
  swordsman: "from-slate-700 to-slate-500",
  spearman: "from-emerald-700 to-emerald-500",
  archer: "from-amber-700 to-amber-500",
  cavalry: "from-indigo-700 to-indigo-500",
};

const TYPE_RING = {
  swordsman: "ring-slate-400/40",
  spearman: "ring-emerald-400/40",
  archer: "ring-amber-400/40",
  cavalry: "ring-indigo-400/40",
};

const BONUS = {
  swordsman: { spearman: 1.35, cavalry: 1.08, archer: 1.18, swordsman: 1.0 },
  spearman: { cavalry: 1.72, swordsman: 1.0, archer: 1.08, spearman: 1.0 },
  archer: { swordsman: 1.38, spearman: 1.12, cavalry: 1.62, archer: 1.0 },
  cavalry: { archer: 1.58, swordsman: 1.22, spearman: 0.95, cavalry: 1.0 },
};

const TARGET_WEIGHTS = {
  swordsman: { swordsman: 1.0, spearman: 1.0, archer: 0.3, cavalry: 0.92 },
  spearman: { swordsman: 1.0, spearman: 1.0, archer: 0.35, cavalry: 1.1 },
  archer: { swordsman: 1.12, spearman: 1.0, archer: 0.45, cavalry: 0.82 },
  cavalry: { swordsman: 1.0, spearman: 0.98, archer: 0.2, cavalry: 1.0 },
};

const CAP = {
  swordsman: 4,
  spearman: 3,
  archer: 1,
  cavalry: 2,
};

const DEFAULT_COUNTS = {
  armyA: { swordsman: 18, spearman: 14, archer: 10, cavalry: 6 },
  armyB: { swordsman: 18, spearman: 14, archer: 10, cavalry: 6 },
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rnd = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

let UID = 1;

function createUnit(army, type, laneHint = null) {
  const s = UNIT_STATS[type];
  const atk = s.attack * rnd(0.9, 1.1);
  const def = s.defense * rnd(0.9, 1.1);
  const hp = s.hp * rnd(0.93, 1.07);
  return {
    id: UID++,
    army,
    type,
    lane: laneHint || chooseDisplayLane(type, UID),
    maxHp: hp,
    hp,
    attack: atk,
    defense: def,
    morale: 100,
    stamina: 100,
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    status: "alive", // alive | fleeing | dead
    returnIn: 0,
  };
}

function createArmy(name, counts) {
  const units = [];
  UNIT_TYPES.forEach((t) => {
    for (let i = 0; i < (counts[t] || 0); i++) units.push(createUnit(name, t));
  });
  return {
    name,
    units,
    strategy: { hold: 0, defend: new Set(), pendingFlee: [] },
    initialTotal: Math.max(1, units.length),
  };
}

function cloneArmy(army) {
  return {
    ...army,
    units: army.units.map((u) => ({ ...u })),
    strategy: {
      hold: army.strategy.hold,
      defend: new Set(Array.from(army.strategy.defend)),
      pendingFlee: army.strategy.pendingFlee.map((x) => ({ ...x })),
    },
  };
}

function chooseDisplayLane(type, id) {
  if (type === "archer") return "center";
  if (type === "cavalry") return id % 2 === 0 ? "left" : "right";
  if (type === "spearman") return id % 3 === 0 ? "left" : "center";
  return ["left", "center", "right"][id % 3];
}

function unitShort(u) {
  return `${u.type.slice(0, 3)}#${u.id}`;
}

function aliveUnits(army) {
  return army.units.filter((u) => u.status === "alive" && u.hp > 0);
}

function byStatus(army, status) {
  return army.units.filter((u) => u.status === status);
}

function countByType(army, status = "alive") {
  const out = Object.fromEntries(UNIT_TYPES.map((t) => [t, 0]));
  army.units.forEach((u) => {
    if (
      status === "all" ||
      u.status === status ||
      (status === "alive" && u.status === "alive" && u.hp > 0)
    )
      out[u.type] += 1;
  });
  return out;
}

function totalHp(army) {
  return sum(aliveUnits(army).map((u) => u.hp));
}

function totalMorale(army) {
  const units = aliveUnits(army);
  if (!units.length) return 0;
  return sum(units.map((u) => u.morale)) / units.length;
}

function totalStamina(army) {
  const units = aliveUnits(army);
  if (!units.length) return 0;
  return sum(units.map((u) => u.stamina)) / units.length;
}

function meleeCount(army) {
  const c = countByType(army);
  return c.swordsman + c.spearman + c.cavalry;
}

function archerCount(army) {
  return countByType(army).archer;
}

function moraleFactor(morale) {
  return 0.58 + 0.42 * clamp(morale / 100, 0, 1);
}

function staminaFactor(stamina) {
  return 0.44 + 0.56 * clamp(stamina / 100, 0, 1);
}

function laneWeight(attackerLane, targetLane, targetType) {
  const a = LANE_ORDER.indexOf(attackerLane);
  const t = LANE_ORDER.indexOf(targetLane);
  const dist = Math.abs(a - t);
  let w = dist === 0 ? 1.0 : dist === 1 ? 0.78 : 0.58;
  w *= UNIT_STATS[targetType].laneBias[targetLane] || 1;
  return w;
}

function frontlinePriority(units) {
  const melee = units.filter((u) => u.type !== "archer");
  const archers = units.filter((u) => u.type === "archer");
  melee.sort(
    (a, b) =>
      a.hp / a.maxHp - b.hp / b.maxHp || a.morale - b.morale || a.id - b.id,
  );
  archers.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id);
  return [...melee, ...archers];
}

function archerProtection(army) {
  const archers = archerCount(army);
  if (!archers) return { incomingMult: 1, attackMult: 1 };
  const melee = meleeCount(army);
  const ratio = melee / archers;
  if (ratio >= 1) return { incomingMult: 1, attackMult: 1 };
  const vulnerability = 1 + (1.45 - 1) * (1 - ratio);
  const attackPenalty = 1 - (1 - 0.84) * (1 - ratio);
  return { incomingMult: vulnerability, attackMult: attackPenalty };
}

function buildSlotPool(units) {
  const slots = [];
  units.forEach((u) => {
    for (let i = 0; i < CAP[u.type]; i++) slots.push(u);
  });
  return slots;
}

function chooseTarget(attacker, defenderArmy, pool) {
  if (!pool.length) return null;
  const defenderHold = defenderArmy.strategy.hold;
  const weights = pool.map((u) => {
    let w = TARGET_WEIGHTS[attacker.type][u.type] || 1;
    if (u.type === "archer" && defenderHold > 0) {
      const visibility = clamp(1 - defenderHold * 0.12, 0.08, 1);
      w *= visibility;
    }
    w *= 1 + (1 - u.hp / u.maxHp) * 0.18;
    w *= 1 + (1 - u.stamina / 100) * 0.1;
    w *= laneWeight(attacker.lane, u.lane, u.type);
    return Math.max(0.02, w);
  });
  const total = sum(weights);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool.splice(i, 1)[0];
  }
  return pool.pop();
}

function engagePlan(attackerArmy, defenderArmy) {
  const attackers = aliveUnits(attackerArmy);
  const defenders = aliveUnits(defenderArmy);
  if (!attackers.length || !defenders.length)
    return {
      events: [],
      meta: {
        engagements: 0,
        slotsA: 0,
        slotsB: 0,
        activeA: 0,
        activeB: 0,
        backupA: attackers.length,
        backupB: defenders.length,
        attackerUse: new Map(),
        defenderUse: new Map(),
      },
    };

  const attackerSlots = buildSlotPool(attackers);
  const defenderSlots = buildSlotPool(frontlinePriority(defenders));
  const engagements = Math.min(attackerSlots.length, defenderSlots.length);
  const attackerUse = new Map();
  const defenderUse = new Map();
  const defenderPool = [...defenderSlots];
  const events = [];

  const shuffledAttackers = [...attackerSlots].sort(() => Math.random() - 0.5);
  for (const attacker of shuffledAttackers.slice(0, engagements)) {
    const target = chooseTarget(attacker, defenderArmy, defenderPool);
    if (!target) break;
    attackerUse.set(attacker.id, (attackerUse.get(attacker.id) || 0) + 1);
    defenderUse.set(target.id, (defenderUse.get(target.id) || 0) + 1);
    events.push({ attackerId: attacker.id, targetId: target.id });
  }

  return {
    events,
    meta: {
      engagements,
      slotsA: attackerSlots.length,
      slotsB: defenderSlots.length,
      activeA: new Set(attackerUse.keys()).size,
      activeB: new Set(defenderUse.keys()).size,
      backupA: Math.max(0, attackers.length - new Set(attackerUse.keys()).size),
      backupB: Math.max(0, defenders.length - new Set(defenderUse.keys()).size),
      attackerUse,
      defenderUse,
    },
  };
}

function computeDamage(
  attacker,
  target,
  attackerArmy,
  defenderArmy,
  attackerSlotsUsed,
) {
  let attack = attacker.attack * rnd(0.9, 1.1);
  attack *= moraleFactor(attacker.morale);
  attack *= staminaFactor(attacker.stamina);
  attack *= 1 / (1 + aliveUnits(attackerArmy).length / 24000);
  if (attackerArmy.strategy.defend.has(attacker.type)) attack *= 0.84;
  if (attacker.type === "archer") {
    const { attackMult } = archerProtection(attackerArmy);
    attack *= attackMult;
    let hitChance =
      0.74 +
      (attacker.morale - 100) * 0.00055 +
      ((attacker.stamina - 50) / 100) * 0.08;
    hitChance = clamp(hitChance, 0.44, 0.95);
    if (Math.random() > hitChance)
      return {
        damage: 0,
        hit: false,
        note: `miss (${Math.round(hitChance * 100)}%)`,
      };
  }

  const slots = Math.max(1, attackerSlotsUsed);
  let perSlot = attack / slots;
  perSlot *= rnd(0.93, 1.08);
  perSlot *= BONUS[attacker.type][target.type] || 1;

  let defense = target.defense * rnd(0.9, 1.1);
  defense *= moraleFactor(target.morale);
  defense *= staminaFactor(target.stamina);
  let mitigation = 1 / (1 + defense * 0.08);
  if (defenderArmy.strategy.defend.has(target.type)) mitigation *= 0.76;
  if (target.type === "archer") {
    const { incomingMult } = archerProtection(defenderArmy);
    mitigation *= incomingMult;
  }

  const damage = Math.max(0, perSlot * mitigation);
  return { damage, hit: true, note: "" };
}

function applyPendingFlee(army, enemyArmy, battleLog) {
  const pending = [...army.strategy.pendingFlee];
  army.strategy.pendingFlee = [];
  const out = [];

  for (const req of pending) {
    const pool = aliveUnits(army).filter((u) => u.type === req.type);
    const count = Math.min(req.count, pool.length);
    if (!count) continue;
    const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
    const enemyPressure = enemyArmy.units.length / (count + 1);
    const lostFrac = clamp(rnd(0.06, 0.2) + enemyPressure * 0.03, 0.05, 0.88);
    const lost = Math.min(count, Math.floor(count * lostFrac));
    const escaped = count - lost;

    chosen.slice(0, lost).forEach((u) => {
      u.status = "dead";
      u.hp = 0;
      u.stamina = 0;
      u.morale = 10;
    });
    chosen.slice(lost).forEach((u) => {
      u.status = "fleeing";
      u.returnIn = 2;
      u.stamina = Math.max(u.stamina, 46);
      u.morale = Math.max(u.morale, 28);
    });
    out.push({ type: req.type, attempted: count, lost, escaped });
    battleLog.unshift(
      `${army.name} ordered ${count} ${req.type}(s) to flee: ${lost} lost, ${escaped} escaped.`,
    );
  }
  return out;
}

function returnFledUnits(army) {
  const returned = [];
  army.units.forEach((u) => {
    if (u.status === "fleeing") {
      u.returnIn -= 1;
      if (u.returnIn <= 0) {
        u.status = "alive";
        u.hp = u.maxHp;
        u.stamina = clamp(Math.max(u.stamina, 48) + 14, 0, 100);
        u.morale = clamp(Math.max(u.morale, 38) + 4, 10, 100);
        returned.push(u);
      }
    }
  });
  return returned;
}

function applyRoundMoraleShock(
  army,
  casualtiesThisRound,
  damageTakenThisRound,
) {
  const alive = aliveUnits(army);
  if (!alive.length) return;
  const casualtyFrac = casualtiesThisRound / army.initialTotal;
  const damageFrac =
    damageTakenThisRound /
    Math.max(
      1,
      totalHp({ units: army.units.filter((u) => u.status !== "dead") }),
    );
  const shock = casualtyFrac * 24 + damageFrac * 10;
  alive.forEach((u) => {
    u.morale = clamp(u.morale - shock - (1 - u.stamina / 100) * 3.5, 10, 100);
  });
}

function applyEndOfRoundFatigue(army, engagedIds, attackerUse, defenderUse) {
  const engaged = new Set(engagedIds);
  army.units.forEach((u) => {
    if (u.status !== "alive") return;
    const used = (attackerUse.get(u.id) || 0) + (defenderUse.get(u.id) || 0);
    if (engaged.has(u.id)) {
      let fatigue = 1.0 + used * 0.5;
      fatigue += army.strategy.hold * 0.2;
      if (army.strategy.defend.has(u.type)) fatigue += 0.9;
      u.stamina = clamp(u.stamina - fatigue, 0, 100);
    } else {
      u.stamina = clamp(u.stamina + 2.6, 0, 100);
    }
    if (u.stamina < 35)
      u.morale = clamp(u.morale - ((35 - u.stamina) / 35) * 4.5, 10, 100);
  });
}

function maybeRoute(army, enemyArmy) {
  const alive = aliveUnits(army);
  if (!alive.length) return { lost: {}, fled: {} };
  const avgMorale = totalMorale(army);
  if (avgMorale >= 50) return { lost: {}, fled: {} };

  const routeShare = clamp(((50 - avgMorale) / 50) * 0.14, 0, 0.14);
  const routeCount = Math.max(0, Math.round(alive.length * routeShare));
  if (!routeCount) return { lost: {}, fled: {} };

  const selected = [...alive]
    .sort(
      (a, b) =>
        a.morale - b.morale ||
        a.stamina - b.stamina ||
        a.hp / a.maxHp - b.hp / b.maxHp ||
        a.id - b.id,
    )
    .slice(0, routeCount);
  const lost = {};
  const fled = {};

  selected.forEach((u) => {
    if (Math.random() < 0.52) {
      u.status = "dead";
      u.hp = 0;
      u.morale = 10;
      u.stamina = 0;
      lost[u.type] = (lost[u.type] || 0) + 1;
    } else {
      u.status = "fleeing";
      u.returnIn = 2;
      u.stamina = Math.max(u.stamina, 40);
      fled[u.type] = (fled[u.type] || 0) + 1;
    }
  });
  return { lost, fled };
}

function summarizeLosses(losses) {
  const parts = UNIT_TYPES.map(
    (t) => `${t.slice(0, 3)}:${losses[t] || 0}`,
  ).filter((x) => !x.endsWith(":0"));
  return parts.length ? parts.join(" ") : "none";
}

function unitCardStats(u) {
  return {
    hpPct: clamp(u.hp / u.maxHp, 0, 1),
    moralePct: clamp(u.morale / 100, 0, 1),
    staminaPct: clamp(u.stamina / 100, 0, 1),
  };
}

function laneUnits(army) {
  const buckets = {
    left: { swordsman: [], spearman: [], archer: [], cavalry: [] },
    center: { swordsman: [], spearman: [], archer: [], cavalry: [] },
    right: { swordsman: [], spearman: [], archer: [], cavalry: [] },
  };
  army.units.forEach((u) => {
    buckets[u.lane][u.type].push(u);
  });
  LANE_ORDER.forEach((lane) => {
    UNIT_TYPES.forEach((t) => {
      buckets[lane][t].sort(
        (a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id,
      );
    });
  });
  return buckets;
}

function topWarriors(army, n = 8) {
  const alive = aliveUnits(army);
  return [...alive]
    .sort((a, b) => {
      const sa =
        a.kills * 100 +
        a.damageDealt * 0.5 +
        (a.hp / a.maxHp) * 25 +
        a.morale * 0.2 +
        a.stamina * 0.1;
      const sb =
        b.kills * 100 +
        b.damageDealt * 0.5 +
        (b.hp / b.maxHp) * 25 +
        b.morale * 0.2 +
        b.stamina * 0.1;
      return sb - sa;
    })
    .slice(0, n);
}

function simulateRound(armyAIn, armyBIn) {
  const armyA = cloneArmy(armyAIn);
  const armyB = cloneArmy(armyBIn);
  const log = [];

  const fleeA = applyPendingFlee(armyA, armyB, log);
  const fleeB = applyPendingFlee(armyB, armyA, log);

  const planAB = engagePlan(armyA, armyB);
  const planBA = engagePlan(armyB, armyA);

  const events = [
    ...planAB.events.map((e) => ({ ...e, side: "A" })),
    ...planBA.events.map((e) => ({ ...e, side: "B" })),
  ].sort(() => Math.random() - 0.5);

  const casualtiesA = Object.fromEntries(UNIT_TYPES.map((t) => [t, 0]));
  const casualtiesB = Object.fromEntries(UNIT_TYPES.map((t) => [t, 0]));
  let dmgToA = 0;
  let dmgToB = 0;
  const combatLines = [];

  const mapA = new Map(armyA.units.map((u) => [u.id, u]));
  const mapB = new Map(armyB.units.map((u) => [u.id, u]));
  const usedA = planAB.meta.attackerUse;
  const usedB = planBA.meta.attackerUse;
  const defUseA = planBA.meta.defenderUse;
  const defUseB = planAB.meta.defenderUse;

  for (const ev of events) {
    const attacker =
      ev.side === "A" ? mapA.get(ev.attackerId) : mapB.get(ev.attackerId);
    const target =
      ev.side === "A" ? mapB.get(ev.targetId) : mapA.get(ev.targetId);
    if (
      !attacker ||
      !target ||
      attacker.status !== "alive" ||
      target.status !== "alive" ||
      target.hp <= 0
    )
      continue;

    const attackerArmy = ev.side === "A" ? armyA : armyB;
    const defenderArmy = ev.side === "A" ? armyB : armyA;
    const slotsUsed =
      ev.side === "A"
        ? usedA.get(attacker.id) || 1
        : usedB.get(attacker.id) || 1;
    const result = computeDamage(
      attacker,
      target,
      attackerArmy,
      defenderArmy,
      slotsUsed,
    );

    attacker.stamina = clamp(
      attacker.stamina -
        (attackerArmy.strategy.hold * 0.2 +
          (attackerArmy.strategy.defend.has(attacker.type) ? 0.9 : 0) +
          1.6 +
          (result.hit ? 0.6 : 0.2)),
      0,
      100,
    );

    if (!result.hit) {
      combatLines.push(
        `${unitShort(attacker)} -> ${unitShort(target)} MISS ${result.note}`,
      );
      continue;
    }

    const actual = Math.min(result.damage, target.hp);
    if (actual <= 0) continue;

    target.hp -= actual;
    target.damageTaken += actual;
    attacker.damageDealt += actual;

    const targetArmy = ev.side === "A" ? armyB : armyA;
    const attackerArmyRef = ev.side === "A" ? armyA : armyB;

    const lossRatio = actual / Math.max(1, target.maxHp);
    target.stamina = clamp(
      target.stamina - Math.max(0.6, lossRatio * 15),
      0,
      100,
    );
    target.morale = clamp(target.morale - lossRatio * 22, 10, 100);

    if (ev.side === "A") dmgToB += actual;
    else dmgToA += actual;
    combatLines.push(
      `${unitShort(attacker)} -> ${unitShort(target)} hit ${actual.toFixed(1)} HP`,
    );

    if (target.hp <= 0.0001) {
      target.hp = 0;
      target.status = "dead";
      attacker.kills += 1;
      attacker.morale = clamp(attacker.morale + 2.5, 10, 100);
      if (ev.side === "A") casualtiesB[target.type] += 1;
      else casualtiesA[target.type] += 1;
      combatLines[combatLines.length - 1] += " KILL";
    }
  }

  applyRoundMoraleShock(armyA, sum(Object.values(casualtiesA)), dmgToA);
  applyRoundMoraleShock(armyB, sum(Object.values(casualtiesB)), dmgToB);

  const routedA = maybeRoute(armyA, armyB);
  const routedB = maybeRoute(armyB, armyA);

  const engagedA = [...usedA.keys(), ...defUseA.keys()];
  const engagedB = [...usedB.keys(), ...defUseB.keys()];
  applyEndOfRoundFatigue(armyA, engagedA, usedA, defUseA);
  applyEndOfRoundFatigue(armyB, engagedB, usedB, defUseB);

  const returnedA = returnFledUnits(armyA);
  const returnedB = returnFledUnits(armyB);

  const summary = [
    `Round actions: ${armyA.name} ${planAB.events.length} / ${armyB.name} ${planBA.events.length} engagements`,
    `${armyA.name} casualties: ${summarizeLosses(casualtiesA)}`,
    `${armyB.name} casualties: ${summarizeLosses(casualtiesB)}`,
  ];

  if (fleeA.length)
    summary.push(
      `${armyA.name} retreat order: ${fleeA.map((x) => `${x.attempted} ${x.type}`).join(", ")}`,
    );
  if (fleeB.length)
    summary.push(
      `${armyB.name} retreat order: ${fleeB.map((x) => `${x.attempted} ${x.type}`).join(", ")}`,
    );
  if (returnedA.length)
    summary.push(`${armyA.name} returned: ${returnedA.length}`);
  if (returnedB.length)
    summary.push(`${armyB.name} returned: ${returnedB.length}`);
  if (routedA.lost || routedA.fled) summary.push(`${armyA.name} routed`);
  if (routedB.lost || routedB.fled) summary.push(`${armyB.name} routed`);

  return {
    armyA,
    armyB,
    roundSummary: summary,
    battleLines: combatLines.slice(0, 24),
    casualtiesA,
    casualtiesB,
    routedA,
    routedB,
    returnedA: returnedA.length,
    returnedB: returnedB.length,
    metaA: planAB.meta,
    metaB: planBA.meta,
  };
}

function progressBar({ value, max = 100, label, className = "" }) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span>{value.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden border border-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ArmyPanel({ army, highlight = false }) {
  const c = countByType(army);
  const lanes = useMemo(() => laneUnits(army), [army]);
  const avgM = totalMorale(army);
  const avgS = totalStamina(army);
  const total = army.units.length;
  const alive = aliveUnits(army).length;
  const dead = byStatus(army, "dead").length;
  const fleeing = byStatus(army, "fleeing").length;
  const hp = totalHp(army);
  const top = topWarriors(army, 3);

  return (
    <div
      className={`rounded-3xl border ${highlight ? "border-cyan-400/35" : "border-white/10"} bg-slate-950/80 p-4 shadow-2xl shadow-black/30`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{army.name}</div>
          <div className="text-xs text-slate-400">
            {alive}/{total} alive · {dead} dead · {fleeing} fleeing
          </div>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>Total HP</div>
          <div className="text-lg font-semibold text-white">
            {hp.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/5 bg-white/3 p-3">
          {progressBar({ value: avgM, label: "Morale" })}
          <div className="mt-2" />
          {progressBar({ value: avgS, label: "Stamina" })}
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/3 p-3 text-xs text-slate-300 space-y-1">
          <div className="flex justify-between">
            <span>Swords</span>
            <span>{c.swordsman}</span>
          </div>
          <div className="flex justify-between">
            <span>Spears</span>
            <span>{c.spearman}</span>
          </div>
          <div className="flex justify-between">
            <span>Archers</span>
            <span>{c.archer}</span>
          </div>
          <div className="flex justify-between">
            <span>Cavalry</span>
            <span>{c.cavalry}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {LANE_ORDER.map((lane) => (
          <div
            key={lane}
            className="rounded-2xl border border-white/5 bg-slate-900/70 p-3"
          >
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              {lane}
            </div>
            <div className="space-y-1.5 min-h-[92px]">
              {UNIT_TYPES.flatMap((t) => lanes[lane][t])
                .slice(0, 8)
                .map((u) => {
                  const st = unitCardStats(u);
                  return (
                    <div
                      key={u.id}
                      className={`rounded-xl border border-white/5 bg-gradient-to-r ${TYPE_COLOR[u.type]} p-2 ring-1 ${TYPE_RING[u.type]} shadow-sm`}
                    >
                      <div className="flex items-center justify-between gap-2 text-white">
                        <div className="text-xs font-medium">
                          {unitShort(u)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide opacity-80">
                          {u.status}
                        </div>
                      </div>
                      <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-white/90">
                        <div>
                          HP {u.hp.toFixed(0)}/{u.maxHp.toFixed(0)}
                        </div>
                        <div>Mor {u.morale.toFixed(0)}</div>
                        <div>Sta {u.stamina.toFixed(0)}</div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-black/25 overflow-hidden">
                        <div
                          className="h-full bg-white/90"
                          style={{ width: `${st.hpPct * 100}%` }}
                        />
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-black/25 overflow-hidden">
                        <div
                          className="h-full bg-cyan-300/90"
                          style={{ width: `${st.moralePct * 100}%` }}
                        />
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-black/25 overflow-hidden">
                        <div
                          className="h-full bg-emerald-300/90"
                          style={{ width: `${st.staminaPct * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              {!LANE_ORDER.some((lane) =>
                UNIT_TYPES.some((t) => lanes[lane][t].length),
              ) && (
                <div className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-slate-500">
                  No active units
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/5 bg-white/3 p-3">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Top warriors
        </div>
        <div className="mt-2 space-y-2">
          {top.length ? (
            top.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2 text-xs text-slate-200"
              >
                <span>
                  {unitShort(u)} · {TYPE_LABEL[u.type]}
                </span>
                <span>
                  k {u.kills} · dmg {u.damageDealt.toFixed(0)} · hp{" "}
                  {u.hp.toFixed(0)}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-500">
              No surviving warriors yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StrategyPanel({ army, setArmy, enemyName }) {
  const [fleeType, setFleeType] = useState("swordsman");
  const [fleeCount, setFleeCount] = useState(1);

  const totalByType = countByType(army);

  const updateHold = (value) => {
    setArmy((prev) => ({
      ...prev,
      strategy: { ...prev.strategy, hold: value },
    }));
  };

  const toggleDefend = (type) => {
    setArmy((prev) => {
      const next = new Set(prev.strategy.defend);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { ...prev, strategy: { ...prev.strategy, defend: next } };
    });
  };

  const addFlee = () => {
    const available = totalByType[fleeType] || 0;
    const count = clamp(Number(fleeCount) || 0, 1, available || 1);
    if (!available) return;
    setArmy((prev) => ({
      ...prev,
      strategy: {
        ...prev.strategy,
        pendingFlee: [...prev.strategy.pendingFlee, { type: fleeType, count }],
      },
    }));
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-white">Strategy</div>
          <div className="text-xs text-slate-500">
            Applied to {army.name} against {enemyName}
          </div>
        </div>
        <div className="text-xs text-slate-400">
          Hold: <span className="text-white">{army.strategy.hold}</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Hold intensity</span>
          <span>{army.strategy.hold}</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          value={army.strategy.hold}
          onChange={(e) => updateHold(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {UNIT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleDefend(type)}
            className={`rounded-2xl px-3 py-2 text-left text-sm transition border ${army.strategy.defend.has(type) ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            <div className="font-medium">Defend {TYPE_LABEL[type]}</div>
            <div className="text-xs opacity-70">
              Lower damage, higher fatigue
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/5 bg-white/3 p-3">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Retreat order
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <select
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white border border-white/10"
            value={fleeType}
            onChange={(e) => setFleeType(e.target.value)}
          >
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={Math.max(1, totalByType[fleeType] || 1)}
            value={fleeCount}
            onChange={(e) => setFleeCount(Number(e.target.value))}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white border border-white/10"
          />
          <button
            onClick={addFlee}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 border border-white/10"
          >
            Queue
          </button>
        </div>
        <div className="mt-3 space-y-1 text-xs text-slate-400">
          {army.strategy.pendingFlee.length ? (
            army.strategy.pendingFlee.map((x, idx) => (
              <div
                key={idx}
                className="flex justify-between rounded-lg bg-slate-900/70 px-2 py-1"
              >
                <span>
                  {x.count} {x.type}
                </span>
                <span>next round</span>
              </div>
            ))
          ) : (
            <div>No retreat orders queued.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [armyA, setArmyA] = useState(() =>
    createArmy("Blue Legion", DEFAULT_COUNTS.armyA),
  );
  const [armyB, setArmyB] = useState(() =>
    createArmy("Red Host", DEFAULT_COUNTS.armyB),
  );
  const [round, setRound] = useState(0);
  const [running, setRunning] = useState(false);
  const [battleLog, setBattleLog] = useState(["Battle ready."]);
  const [roundDetails, setRoundDetails] = useState(null);
  const [selectedArmy, setSelectedArmy] = useState("A");
  const [winner, setWinner] = useState(null);
  const timerRef = useRef(null);

  const isOver = winner !== null;

  useEffect(() => {
    if (running && !isOver) {
      timerRef.current = setInterval(() => {
        setArmyA((a) => a);
        setArmyB((b) => b);
      }, 400);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, isOver]);

  useEffect(() => {
    if (!running || isOver) return;
    const t = setTimeout(() => {
      stepBattle();
    }, 480);
    return () => clearTimeout(t);
  }, [running, round, isOver]);

  function resetBattle(randomize = false) {
    UID = 1;
    const nextA = randomize
      ? createArmy("Blue Legion", {
          swordsman: Math.floor(rnd(12, 28)),
          spearman: Math.floor(rnd(10, 24)),
          archer: Math.floor(rnd(6, 18)),
          cavalry: Math.floor(rnd(3, 10)),
        })
      : createArmy("Blue Legion", DEFAULT_COUNTS.armyA);
    const nextB = randomize
      ? createArmy("Red Host", {
          swordsman: Math.floor(rnd(12, 28)),
          spearman: Math.floor(rnd(10, 24)),
          archer: Math.floor(rnd(6, 18)),
          cavalry: Math.floor(rnd(3, 10)),
        })
      : createArmy("Red Host", DEFAULT_COUNTS.armyB);
    setArmyA(nextA);
    setArmyB(nextB);
    setRound(0);
    setRunning(false);
    setWinner(null);
    setBattleLog(["Battle reset."]);
    setRoundDetails(null);
  }

  function randomizeStrategies() {
    setArmyA((prev) => {
      const next = cloneArmy(prev);
      next.strategy.hold = Math.floor(rnd(0, 11));
      next.strategy.defend = new Set(pick(UNIT_TYPES));
      return next;
    });
    setArmyB((prev) => {
      const next = cloneArmy(prev);
      next.strategy.hold = Math.floor(rnd(0, 11));
      next.strategy.defend = new Set([pick(UNIT_TYPES)]);
      return next;
    });
  }

  function evaluateWinner(a, b) {
    const aAlive = aliveUnits(a).length;
    const bAlive = aliveUnits(b).length;
    if (aAlive === 0 && bAlive === 0) return "Draw";
    if (aAlive === 0) return b.name;
    if (bAlive === 0) return a.name;
    const aHp = totalHp(a);
    const bHp = totalHp(b);
    if (aAlive !== bAlive) return aAlive > bAlive ? a.name : b.name;
    if (aHp !== bHp) return aHp > bHp ? a.name : b.name;
    return null;
  }

  function stepBattle() {
    if (winner) return;
    const result = simulateRound(armyA, armyB);
    setArmyA(result.armyA);
    setArmyB(result.armyB);
    setRound((r) => r + 1);
    setRoundDetails(result);
    setBattleLog((prev) => {
      const next = [...result.roundSummary, ...result.battleLines, ...prev];
      return next.slice(0, 120);
    });

    const nextWinner = evaluateWinner(result.armyA, result.armyB);
    if (nextWinner) {
      setWinner(nextWinner);
      setRunning(false);
    }
  }

  const selected = selectedArmy === "A" ? armyA : armyB;
  const enemy = selectedArmy === "A" ? armyB : armyA;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#172554,_#020617_55%,_#020617)] text-white">
      <div className="mx-auto max-w-[1700px] p-4 lg:p-6">
        <div className="mb-4 rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-3xl font-black tracking-tight">
                Strategy Game Tactics Visual Simulator
              </div>
              <div className="mt-1 text-sm text-slate-400">
                Per-unit combat, morale, stamina, routing, lane pressure, and a
                visual battlefield.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setRunning((v) => !v)}
                className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
              >
                {running ? "Pause" : "Auto-run"}
              </button>
              <button
                onClick={stepBattle}
                disabled={!!winner}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40"
              >
                Step round
              </button>
              <button
                onClick={() => resetBattle(false)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Reset default
              </button>
              <button
                onClick={() => resetBattle(true)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Random battle
              </button>
              <button
                onClick={randomizeStrategies}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Randomize strategy
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Round
              </div>
              <div className="text-2xl font-bold">{round}</div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Winner
              </div>
              <div className="text-2xl font-bold">{winner || "Undecided"}</div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Blue vs Red
              </div>
              <div className="text-sm text-slate-300">
                {aliveUnits(armyA).length} vs {aliveUnits(armyB).length} alive
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Mode
              </div>
              <div className="text-sm text-slate-300">
                {running ? "Auto resolving" : "Manual stepping"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.7fr_1.05fr]">
          <div className="space-y-4">
            <ArmyPanel army={armyA} highlight={selectedArmy === "A"} />
            <StrategyPanel
              army={armyA}
              setArmy={setArmyA}
              enemyName={armyB.name}
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 shadow-2xl shadow-black/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">
                    Battlefield control
                  </div>
                  <div className="text-xs text-slate-500">
                    View and edit the army currently selected below.
                  </div>
                </div>
                <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-xs">
                  <button
                    onClick={() => setSelectedArmy("A")}
                    className={`rounded-xl px-3 py-1.5 ${selectedArmy === "A" ? "bg-cyan-500 text-slate-950 font-semibold" : "text-slate-300"}`}
                  >
                    Blue
                  </button>
                  <button
                    onClick={() => setSelectedArmy("B")}
                    className={`rounded-xl px-3 py-1.5 ${selectedArmy === "B" ? "bg-cyan-500 text-slate-950 font-semibold" : "text-slate-300"}`}
                  >
                    Red
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-3xl border border-white/5 bg-slate-900/70 p-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {UNIT_TYPES.map((type) => (
                    <ArmyTypeControl
                      key={type}
                      army={selected}
                      setArmy={selectedArmy === "A" ? setArmyA : setArmyB}
                      type={type}
                    />
                  ))}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-xs text-slate-300">
                    <div className="mb-2 font-semibold text-white">
                      Effects now modeled better
                    </div>
                    <ul className="space-y-1 list-disc pl-4 text-slate-400">
                      <li>
                        Archers are harder to hit when protected by melee.
                      </li>
                      <li>
                        Holding the line reduces visibility and increases
                        fatigue.
                      </li>
                      <li>
                        Lane pressure affects target choice, so flank shape
                        matters.
                      </li>
                      <li>
                        Exhaustion and morale both influence later rounds.
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-xs text-slate-300">
                    <div className="mb-2 font-semibold text-white">
                      Round snapshot
                    </div>
                    {roundDetails ? (
                      <div className="space-y-1 text-slate-400">
                        <div>
                          {roundDetails.metaA.engagements} engagements Blue →
                          Red
                        </div>
                        <div>
                          {roundDetails.metaB.engagements} engagements Red →
                          Blue
                        </div>
                        <div>
                          Blue morale {totalMorale(armyA).toFixed(1)} / stamina{" "}
                          {totalStamina(armyA).toFixed(1)}
                        </div>
                        <div>
                          Red morale {totalMorale(armyB).toFixed(1)} / stamina{" "}
                          {totalStamina(armyB).toFixed(1)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-500">
                        No round resolved yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 shadow-2xl shadow-black/30">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">
                    Battle log
                  </div>
                  <div className="text-xs text-slate-500">
                    Newest actions first.
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  {battleLog.length} lines
                </div>
              </div>
              <div className="max-h-[680px] space-y-2 overflow-auto pr-1">
                {battleLog.map((line, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-slate-300"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <ArmyPanel army={armyB} highlight={selectedArmy === "B"} />
            <StrategyPanel
              army={armyB}
              setArmy={setArmyB}
              enemyName={armyA.name}
            />
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-xs text-slate-400 shadow-2xl shadow-black/30">
          <div className="mb-2 text-sm font-semibold text-white">Notes</div>
          <div>
            This version is designed as a visual rewrite of the original
            terminal simulator: cleaner battle resolution, more believable
            morale/fatigue behavior, meaningful targeting lanes, and a UI that
            is easy to inspect round by round.
          </div>
        </div>
      </div>
    </div>
  );
}

function ArmyTypeControl({ army, setArmy, type }) {
  const count = countByType(army)[type] || 0;
  const update = (delta) => {
    setArmy((prev) => {
      const current = countByType(prev);
      const nextCounts = {
        ...current,
        [type]: Math.max(0, current[type] + delta),
      };
      UID = 1;
      const next = createArmy(prev.name, nextCounts);
      next.strategy.hold = prev.strategy.hold;
      next.strategy.defend = new Set(Array.from(prev.strategy.defend));
      next.strategy.pendingFlee = prev.strategy.pendingFlee.map((x) => ({
        ...x,
      }));
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
        {TYPE_LABEL[type]}
      </div>
      <div className="mt-1 text-2xl font-bold text-white">{count}</div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => update(-1)}
          className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800"
        >
          -
        </button>
        <button
          onClick={() => update(1)}
          className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800"
        >
          +
        </button>
      </div>
    </div>
  );
}
