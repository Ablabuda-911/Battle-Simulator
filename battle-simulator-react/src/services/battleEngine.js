import { UNIT_TYPES, UNIT_STATS, ENGAGEMENT_CAP, MORALE, STAMINA } from './constants';

export class Unit {
  constructor(uid, armyName, unitType, maxHp, hp, personalAttack, personalDefense) {
    this.uid = uid;
    this.armyName = armyName;
    this.unitType = unitType;
    this.maxHp = maxHp;
    this.hp = hp;
    this.personalAttack = personalAttack;
    this.personalDefense = personalDefense;
    this.morale = 1.0;
    this.stamina = STAMINA.MAX;
    this.kills = 0;
    this.damageDealt = 0.0;
    this.damageTaken = 0.0;
    this.status = "alive"; // alive, fleeing, dead
    this.returnIn = 0;
  }

  isAlive() {
    return this.status === "alive" && this.hp > 0;
  }

  getHealthRatio() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }
}

export class Army {
  constructor(name, counts = {}) {
    this.name = name;
    this.units = [];
    this.strategy = {
      hold: 0,
      defense: new Set(),
      pendingFlee: [],
      fleeing: {},
    };
    this.initialCounts = {};
    this.initialTotal = 0;

    // Spawn units
    for (const unitType of UNIT_TYPES) {
      const count = counts[unitType] || 0;
      this.initialCounts[unitType] = count;
      for (let i = 0; i < count; i++) {
        this.units.push(this._spawnUnit(unitType));
      }
    }
    this.initialTotal = Math.max(1, this.units.length);
  }

  _spawnUnit(unitType) {
    const base = UNIT_STATS[unitType];
    const SPAWN_VARIATION = 0.10;
    
    const atkMult = 1 + (Math.random() - 0.5) * 2 * SPAWN_VARIATION;
    const defMult = 1 + (Math.random() - 0.5) * 2 * SPAWN_VARIATION;
    const hpMult = 1 + (Math.random() - 0.5) * 2 * SPAWN_VARIATION * 0.35;

    const uid = Math.random().toString(36).substr(2, 9);
    return new Unit(
      uid,
      this.name,
      unitType,
      base.hp * hpMult,
      base.hp * hpMult,
      base.attack * atkMult,
      base.defense * defMult
    );
  }

  getAliveUnits() {
    return this.units.filter(u => u.isAlive());
  }

  getCountsByType() {
    const counts = {};
    for (const type of UNIT_TYPES) {
      counts[type] = this.getAliveUnits().filter(u => u.unitType === type).length;
    }
    return counts;
  }

  getTotalUnits() {
    return this.getAliveUnits().length;
  }

  getTotalHp() {
    return this.getAliveUnits().reduce((sum, u) => sum + u.hp, 0);
  }

  getAverageMorale() {
    const alive = this.getAliveUnits();
    if (!alive.length) return 0;
    return alive.reduce((sum, u) => sum + u.morale, 0) / alive.length;
  }

  getAverageStamina() {
    const alive = this.getAliveUnits();
    if (!alive.length) return 0;
    return alive.reduce((sum, u) => sum + u.stamina, 0) / alive.length;
  }

  isDefeated() {
    return this.getTotalUnits() === 0;
  }
}

// Combat calculation function (simplified version)
export function computeSlotDamage(attacker, target, attackerArmy, defenderArmy) {
  const ROUND_VARIATION = 0.12;
  
  let attackRoll = attacker.personalAttack * (1 + (Math.random() - 0.5) * 2 * ROUND_VARIATION);
  
  // Apply morale and stamina factors
  attackRoll *= (0.60 + 0.40 * Math.min(1.5, Math.max(0.2, attacker.morale)));
  attackRoll *= (0.45 + 0.55 * Math.min(1, Math.max(0, attacker.stamina / STAMINA.MAX)));

  // Defense
  let defenseRoll = target.personalDefense * (1 + (Math.random() - 0.5) * 2 * ROUND_VARIATION);
  defenseRoll *= (0.60 + 0.40 * Math.min(1.5, Math.max(0.2, target.morale)));
  
  const mitigation = 1.0 / (1.0 + defenseRoll * 0.08);
  const damage = Math.max(0, attackRoll * mitigation);

  return damage;
}

export function resolveRound(armyA, armyB) {
  const results = {
    aLosses: {},
    bLosses: {},
    events: [],
  };

  // Simplified round resolution
  const aUnits = armyA.getAliveUnits();
  const bUnits = armyB.getAliveUnits();

  if (!aUnits.length || !bUnits.length) return results;

  // Attacker A -> B
  for (const attacker of aUnits.slice(0, Math.min(aUnits.length, 5))) {
    const target = bUnits[Math.floor(Math.random() * bUnits.length)];
    const damage = computeSlotDamage(attacker, target, armyA, armyB);
    
    target.hp -= damage;
    attacker.damageDealt += damage;
    target.damageTaken += damage;

    if (target.hp <= 0) {
      target.status = "dead";
      attacker.kills += 1;
    }

    results.events.push({
      attacker: attacker.uid,
      target: target.uid,
      damage,
      hit: damage > 0,
    });
  }

  return results;
}