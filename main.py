# strategy_game_tactics_v5.py
# Per-unit realism: individual warriors, personal attack/defense rolls, morale, stamina,
# slot-based engagement caps, archer hit chance, routing, and improved battlefield display.

import random
import math
from dataclasses import dataclass, field
from collections import defaultdict
from itertools import count

random.seed()

# -------------------------
# Tunables / feature flags
# -------------------------
ENABLE_FRONTLINE_BLOCKING = True   # implemented through engagement slot limits + frontline-priority target pools
ENABLE_SATURATION = True
ENABLE_MORALE = True
ENABLE_STAMINA = True

# Engagement scale controls saturation (larger -> less saturation)
ENGAGEMENT_SCALE = 50000.0  # tune: 8k = heavy saturation, 50k = mild saturation

# Morale tuning
MORALE_SENSITIVITY = 0.20    # morale loss from army-wide casualties
MORALE_MIN = 0.20
MORALE_MAX = 1.50
MORALE_KILL_BOOST = 0.03
MORALE_DAMAGE_PENALTY = 0.15  # morale loss from damage taken as fraction of max HP
MORALE_STAMINA_LINK = 0.045    # low stamina slowly drags morale down

ROUTE_THRESHOLD = 0.50      # below this morale, some routing begins
ROUTE_SEVERITY = 0.12       # fraction of army that may attempt to route when morale low
ROUTE_LOSS_FRAC = 0.50      # of routed, this fraction is lost immediately, rest flee and return later

# Stamina tuning
STAMINA_MAX = 100.0
STAMINA_MIN = 0.0
STAMINA_ROUND_BASE_LOSS = 1.0
STAMINA_ATTACK_SLOT_COST = {
    "swordsman": 2.0,
    "spearman": 1.8,
    "archer": 1.4,
    "cavalry": 2.6,
}
STAMINA_DEFENSE_STANCE_COST = 0.9
STAMINA_HOLD_COST_PER_INTENSITY = 0.22
STAMINA_DMG_TAKEN_FACTOR = 0.12
STAMINA_RECOVERY_BACKUP = 2.5
STAMINA_RECOVERY_ACTIVE = 0.6
STAMINA_FLEE_RETURN_BONUS = 14.0

# Per-unit stat randomization at spawn and per-round roll jitter
SPAWN_VARIATION = 0.10      # unit spawns near base stats (+/-10%)
ROUND_VARIATION = 0.12      # each attack/defense roll near that unit's personal stat (+/-12%)
SLOT_ATTACK_VARIATION = 0.08

# Base constants
UNIT_TYPES = ["swordsman", "spearman", "archer", "cavalry"]
UNIT_STATS = {
    "swordsman": {"attack": 5.0, "hp": 22.0, "defense": 2.0},
    "spearman" : {"attack": 4.5, "hp": 20.0, "defense": 3.0},
    "archer"   : {"attack": 6.0, "hp": 14.0, "defense": 1.0},
    "cavalry"  : {"attack": 8.0, "hp": 28.0, "defense": 4.0},
}

# Base bonus multipliers (attacker -> defender)
BONUS = defaultdict(lambda: defaultdict(lambda: 1.0))
BONUS["swordsman"]["spearman"] = 1.35
BONUS["spearman"]["cavalry"]   = 1.75
BONUS["archer"]["swordsman"]   = 1.45
BONUS["cavalry"]["archer"]     = 1.60
BONUS["cavalry"]["swordsman"]  = 1.25

# Each unit type can engage this many enemies at once.
# This is the core engagement slot system.
UNIT_ENGAGEMENT_CAP = {
    "swordsman": 4,
    "spearman": 3,
    "cavalry": 2,
    "archer": 1,
}

# Base archery
ARCHER_BASE_HIT_CHANCE = 0.75
ARCHER_HIT_MORALE_WEIGHT = 0.06
ARCHER_HIT_STAMINA_WEIGHT = 0.08
ARCHER_MIN_HIT = 0.45
ARCHER_MAX_HIT = 0.95

# Target preference weights (attacker -> defender)
TARGET_WEIGHTS = {
    "swordsman": {"swordsman": 1.00, "spearman": 0.95, "archer": 0.10, "cavalry": 0.90},
    "spearman" : {"swordsman": 1.00, "spearman": 0.95, "archer": 0.15, "cavalry": 1.00},
    "archer"   : {"swordsman": 1.00, "spearman": 0.90, "archer": 0.50, "cavalry": 0.85},
    "cavalry"  : {"swordsman": 1.00, "spearman": 0.95, "archer": 0.20, "cavalry": 1.00},
}

# Strategy effects
HOLD_ARCHER_PROTECTION_PER_INTENSITY = 0.13
HOLD_MIN_ARCHER_VISIBILITY = 0.05   # at max hold archers nearly invisible
DEFENSE_INCOMING_REDUCTION = 0.30
DEFENSE_OUTGOING_REDUCTION = 0.15
FLEE_BASE_LOSS_MIN = 0.05
FLEE_BASE_LOSS_MAX = 0.20
ARCHER_VULNARY_MAX = 1.5
ARCHER_ATTACK_PENALTY_MAX = 0.85

UNIT_UID = count(1)

# -------------------------
# Utilities & display
# -------------------------

def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def sanitize_army_input(string_counts):
    out = {}
    for k, v in string_counts.items():
        try:
            n = int(v)
            if n < 0:
                n = 0
        except Exception:
            n = 0
        out[k] = n
    return out


def bar(value, maximum, length=20):
    if maximum <= 0:
        return "[" + " " * length + "]"
    filled = int(round((value / maximum) * length))
    filled = max(0, min(length, filled))
    return "[" + "#" * filled + "-" * (length - filled) + "]"


def display_unit_stats():
    print("\n=== Unit base stats ===")
    print(f"{'unit':10} {'atk':>6} {'hp':>6} {'def':>6} {'cap':>5}")
    for ut in UNIT_TYPES:
        s = UNIT_STATS[ut]
        cap = UNIT_ENGAGEMENT_CAP[ut]
        print(f"{ut:10} {s['attack']:6.1f} {s['hp']:6.1f} {s['defense']:6.1f} {cap:5d}")

    print("\n=== Bonus multipliers (attacker -> defender) ===")
    for at in UNIT_TYPES:
        row = []
        for df in UNIT_TYPES:
            m = BONUS[at][df]
            row.append(f"{df[:3]}:{m:.2f}" if m != 1.0 else f"{df[:3]}:1.00")
        print(f"{at:10} " + " ".join(row))

    print("\n=== Target preference weights (attacker -> defender) ===")
    for at in UNIT_TYPES:
        row = []
        for df in UNIT_TYPES:
            row.append(f"{df[:3]}:{TARGET_WEIGHTS[at][df]:.2f}")
        print(f"{at:10} " + " ".join(row))

    print("\n=== Battle tuning ===")
    print(f"engagement_scale: {ENGAGEMENT_SCALE}  frontline_blocking: {ENABLE_FRONTLINE_BLOCKING}  morale: {ENABLE_MORALE}  stamina: {ENABLE_STAMINA}")
    print()


def unit_label(u):
    return f"{u.unit_type}#{u.uid}"


def unit_short(u):
    return f"{u.unit_type[:3]}#{u.uid}"


def unit_display_flank(u):
    # Display-only battlefield layout. Combat is slot-based, not locked to lanes.
    if u.unit_type == "cavalry":
        return "left" if (u.uid % 2 == 0) else "right"
    if u.unit_type == "archer":
        return "center"
    if u.unit_type == "spearman":
        return "center" if (u.uid % 3 != 0) else "left"
    return ["left", "center", "right"][u.uid % 3]


@dataclass
class Strategy:
    hold: int = 0
    defense: set = field(default_factory=set)
    pending_flee: list = field(default_factory=list)
    fleeing: defaultdict = field(default_factory=lambda: defaultdict(int))

    def clear_pending(self):
        self.pending_flee = []

    def copy_for_log(self):
        return {
            "hold": self.hold,
            "defense": set(self.defense),
            "pending_flee": list(self.pending_flee),
            "fleeing": dict(self.fleeing),
        }


@dataclass(eq=False)
class Unit:
    uid: int
    army_name: str
    unit_type: str
    max_hp: float
    hp: float
    personal_attack: float
    personal_defense: float
    morale: float = 1.0
    stamina: float = STAMINA_MAX
    kills: int = 0
    damage_dealt: float = 0.0
    damage_taken: float = 0.0
    status: str = "alive"   # alive, fleeing, dead
    return_in: int = 0

    def is_alive(self):
        return self.status == "alive" and self.hp > 0

    def display_name(self):
        return f"{self.unit_type}#{self.uid}"


class Army:
    def __init__(self, name, counts=None):
        self.name = name
        self.units = []
        self.strategy = Strategy()
        self.initial_counts = {ut: 0 for ut in UNIT_TYPES}
        self.initial_total = 0

        if counts:
            for ut in UNIT_TYPES:
                n = int(counts.get(ut, 0))
                self.initial_counts[ut] = n
                for _ in range(n):
                    self.units.append(self._spawn_unit(ut))

        self.initial_total = max(1, len(self.units))

    def _spawn_unit(self, unit_type):
        base = UNIT_STATS[unit_type]
        atk_mult = random.uniform(1.0 - SPAWN_VARIATION, 1.0 + SPAWN_VARIATION)
        def_mult = random.uniform(1.0 - SPAWN_VARIATION, 1.0 + SPAWN_VARIATION)
        hp_mult = random.uniform(1.0 - SPAWN_VARIATION * 0.35, 1.0 + SPAWN_VARIATION * 0.35)
        return Unit(
            uid=next(UNIT_UID),
            army_name=self.name,
            unit_type=unit_type,
            max_hp=base["hp"] * hp_mult,
            hp=base["hp"] * hp_mult,
            personal_attack=base["attack"] * atk_mult,
            personal_defense=base["defense"] * def_mult,
            morale=1.0,
            stamina=STAMINA_MAX,
        )

    def alive_units(self):
        return [u for u in self.units if u.is_alive()]

    def units_by_status(self, status):
        return [u for u in self.units if u.status == status]

    def counts_by_type(self, status="alive"):
        out = {ut: 0 for ut in UNIT_TYPES}
        for u in self.units:
            if status == "all":
                out[u.unit_type] += 1
            elif status == "alive":
                if u.is_alive():
                    out[u.unit_type] += 1
            else:
                if u.status == status:
                    out[u.unit_type] += 1
        return out

    def hp_by_type(self):
        out = {ut: 0.0 for ut in UNIT_TYPES}
        for u in self.alive_units():
            out[u.unit_type] += u.hp
        return out

    def total_units(self):
        return len(self.alive_units())

    def total_hp(self):
        return sum(u.hp for u in self.alive_units())

    def melee_units(self):
        c = self.counts_by_type()
        return c["swordsman"] + c["spearman"] + c["cavalry"]

    def archer_units(self):
        return self.counts_by_type()["archer"]

    def average_morale(self):
        alive = self.alive_units()
        if not alive:
            return 0.0
        return sum(u.morale for u in alive) / len(alive)

    def average_stamina(self):
        alive = self.alive_units()
        if not alive:
            return 0.0
        return sum(u.stamina for u in alive) / len(alive)

    @property
    def morale(self):
        return self.average_morale()

    @property
    def stamina(self):
        return self.average_stamina()

    def is_defeated(self):
        return self.total_units() == 0

    def __str__(self):
        parts = [f"{ut}:{self.counts_by_type()[ut]}" for ut in UNIT_TYPES]
        return f"{self.name} [{' '.join(parts)}]"


# -------------------------
# Display helpers
# -------------------------

def flank_counts_for_army(army: Army):
    out = {
        "left": {ut: 0 for ut in UNIT_TYPES},
        "center": {ut: 0 for ut in UNIT_TYPES},
        "right": {ut: 0 for ut in UNIT_TYPES},
    }
    for u in army.alive_units():
        out[unit_display_flank(u)][u.unit_type] += 1
    return out


def format_flank_counts(counts):
    return " ".join(f"{ut[:3]}:{counts[ut]}" for ut in UNIT_TYPES)


def print_flank_board(army: Army):
    flanks = flank_counts_for_army(army)
    print(f"{army.name:14} | L[{format_flank_counts(flanks['left'])}]  C[{format_flank_counts(flanks['center'])}]  R[{format_flank_counts(flanks['right'])}]")


def display_army_snapshot(army: Army):
    counts = army.counts_by_type()
    hp_by_type = army.hp_by_type()
    alive = army.total_units()
    avg_morale = army.morale
    avg_stamina = army.stamina

    print(f"\n{army.name} --- alive: {alive}, total HP: {int(army.total_hp())}  morale: {avg_morale:.2f}  stamina: {avg_stamina:.1f}")
    status_counts = {
        "alive": len(army.units_by_status("alive")),
        "fleeing": len(army.units_by_status("fleeing")),
        "dead": len(army.units_by_status("dead")),
    }
    print(f" status: alive={status_counts['alive']} fleeing={status_counts['fleeing']} dead={status_counts['dead']}")
    for ut in UNIT_TYPES:
        cnt = counts[ut]
        init = army.initial_counts[ut] or 1
        print(f" {ut:10} {cnt:6d}  HPpool:{int(hp_by_type[ut]):7d}  {bar(cnt, init, length=24)} (init {army.initial_counts[ut]})")
    print_flank_board(army)
    strat = army.strategy
    print(f" Strategy: hold={strat.hold}  defense={','.join(sorted(strat.defense)) or 'none'}  pending_flee={strat.pending_flee or 'none'}  fleeing={dict(strat.fleeing) or 'none'}")
    print()


def print_round_header(round_no, army_a: Army, army_b: Army):
    print(f"\n=== Round {round_no} ===")
    print("--- battlefield layout ---")
    print_flank_board(army_a)
    print_flank_board(army_b)


# -------------------------
# Tactical helpers
# -------------------------

def archer_protection_multiplier(army: Army):
    archers = army.archer_units()
    melee = army.melee_units()
    if archers == 0:
        return 1.0, 1.0
    protection_ratio = melee / archers
    if protection_ratio >= 1.0:
        incoming_mult = 1.0
        attack_mult = 1.0
    else:
        factor = protection_ratio
        incoming_mult = 1.0 + (ARCHER_VULNARY_MAX - 1.0) * (1.0 - factor)
        attack_mult = 1.0 - (1.0 - ARCHER_ATTACK_PENALTY_MAX) * (1.0 - factor)
    return incoming_mult, attack_mult


def unit_stamina_factor(stamina):
    return 0.45 + 0.55 * clamp(stamina / STAMINA_MAX, 0.0, 1.0)


def unit_morale_factor(morale):
    return 0.60 + 0.40 * clamp(morale, MORALE_MIN, MORALE_MAX)


def frontline_priority(units):
    melee = [u for u in units if u.unit_type != "archer"]
    archers = [u for u in units if u.unit_type == "archer"]
    # wounded units sit toward the back in the targeting pool so they are slightly less preferred
    melee.sort(key=lambda u: (u.hp / max(1.0, u.max_hp), u.unit_type, u.uid))
    archers.sort(key=lambda u: (u.hp / max(1.0, u.max_hp), u.uid))
    return melee + archers


def choose_target_from_pool(attacker: Unit, defender_army: Army, defender_pool):
    if not defender_pool:
        return None, None

    defender_hold = defender_army.strategy.hold
    weights = []
    for u in defender_pool:
        w = TARGET_WEIGHTS.get(attacker.unit_type, {}).get(u.unit_type, 1.0)
        if u.unit_type == "archer" and defender_hold > 0:
            visibility = max(HOLD_MIN_ARCHER_VISIBILITY, 1.0 - defender_hold * HOLD_ARCHER_PROTECTION_PER_INTENSITY)
            w *= visibility
        # Slight preference for weaker or more fatigued targets.
        hp_ratio = u.hp / max(1.0, u.max_hp)
        w *= (1.0 + (1.0 - hp_ratio) * 0.18)
        w *= (1.0 + (1.0 - u.stamina / STAMINA_MAX) * 0.10)
        weights.append(max(0.01, w))

    idx = random.choices(range(len(defender_pool)), weights=weights, k=1)[0]
    target = defender_pool.pop(idx)
    return target, idx


def build_slot_pool(units):
    slots = []
    for u in units:
        cap = UNIT_ENGAGEMENT_CAP[u.unit_type]
        for _ in range(cap):
            slots.append(u)
    return slots


def generate_attack_events(attacker_army: Army, defender_army: Army):
    """
    Slot-based engagement model:
      - Each unit contributes a number of engagement slots by type.
      - The battle is limited by min(total attacker slots, total defender slots).
      - A unit can be paired multiple times up to its slot cap.
      - Engagements create per-slot attack events.
    """
    attackers = attacker_army.alive_units()
    defenders = defender_army.alive_units()

    if not attackers or not defenders:
        return [], {
            "slots_a": 0,
            "slots_b": 0,
            "engagements": 0,
            "active_attackers": 0,
            "backup_attackers": len(attackers),
            "active_defenders": 0,
            "backup_defenders": len(defenders),
        }

    attacker_slots = build_slot_pool(attackers)
    defender_slots = build_slot_pool(frontline_priority(defenders))

    total_a = len(attacker_slots)
    total_b = len(defender_slots)
    engagements = min(total_a, total_b)

    if engagements <= 0:
        return [], {
            "slots_a": total_a,
            "slots_b": total_b,
            "engagements": 0,
            "active_attackers": 0,
            "backup_attackers": len(attackers),
            "active_defenders": 0,
            "backup_defenders": len(defenders),
        }

    random.shuffle(attacker_slots)
    # defender slots stay ordered by frontline priority so the line feels like a line.

    attacker_slot_use = defaultdict(int)
    defender_slot_use = defaultdict(int)
    target_pools = list(defender_slots)
    events = []

    for attacker in attacker_slots[:engagements]:
        target, _ = choose_target_from_pool(attacker, defender_army, target_pools)
        if target is None:
            break
        attacker_slot_use[attacker] += 1
        defender_slot_use[target] += 1
        events.append({
            "attacker": attacker,
            "target": target,
            "side": attacker_army.name,
            "enemy": defender_army.name,
        })

    active_attackers = sum(1 for u in attackers if attacker_slot_use.get(u, 0) > 0)
    active_defenders = sum(1 for u in defenders if defender_slot_use.get(u, 0) > 0)

    summary = {
        "slots_a": total_a,
        "slots_b": total_b,
        "engagements": len(events),
        "active_attackers": active_attackers,
        "backup_attackers": max(0, len(attackers) - active_attackers),
        "active_defenders": active_defenders,
        "backup_defenders": max(0, len(defenders) - active_defenders),
        "attacker_slot_use": attacker_slot_use,
        "defender_slot_use": defender_slot_use,
    }
    return events, summary


def compute_slot_damage(attacker: Unit, target: Unit, attacker_army: Army, defender_army: Army, attacker_slots_used: int):
    """
    Damage for a single attacker->target slot interaction.
    The unit's total attack is randomized around its personal stat and then split
    across the number of slots it actually used in this round.
    """
    # attack roll for the whole unit this round
    attack_roll = attacker.personal_attack * random.uniform(1.0 - ROUND_VARIATION, 1.0 + ROUND_VARIATION)
    attack_roll *= unit_morale_factor(attacker.morale)
    attack_roll *= unit_stamina_factor(attacker.stamina)

    if ENABLE_SATURATION:
        attack_roll *= 1.0 / (1.0 + attacker_army.total_units() / ENGAGEMENT_SCALE)

    if attacker.unit_type in attacker_army.strategy.defense:
        attack_roll *= (1.0 - DEFENSE_OUTGOING_REDUCTION)

    if attacker.unit_type == "archer":
        _, arch_attack_mult_attacker = archer_protection_multiplier(attacker_army)
        attack_roll *= arch_attack_mult_attacker
        hit_chance = ARCHER_BASE_HIT_CHANCE
        hit_chance += (attacker.morale - 1.0) * ARCHER_HIT_MORALE_WEIGHT
        hit_chance += ((attacker.stamina - 50.0) / 100.0) * ARCHER_HIT_STAMINA_WEIGHT
        hit_chance = clamp(hit_chance, ARCHER_MIN_HIT, ARCHER_MAX_HIT)
        if random.random() > hit_chance:
            return 0.0, False, f"miss ({hit_chance:.0%} hit)"

    # split the unit's round attack across the slots it used
    slots_used = max(1, attacker_slots_used)
    attack_per_slot = attack_roll / slots_used
    attack_per_slot *= random.uniform(1.0 - SLOT_ATTACK_VARIATION, 1.0 + SLOT_ATTACK_VARIATION)
    attack_per_slot *= BONUS[attacker.unit_type][target.unit_type]

    # defender roll / mitigation
    defense_roll = target.personal_defense * random.uniform(1.0 - ROUND_VARIATION, 1.0 + ROUND_VARIATION)
    defense_roll *= unit_morale_factor(target.morale)
    defense_roll *= unit_stamina_factor(target.stamina)
    mitigation = 1.0 / (1.0 + defense_roll * 0.08)

    # defending stance lowers incoming damage
    if target.unit_type in defender_army.strategy.defense:
        mitigation *= (1.0 - DEFENSE_INCOMING_REDUCTION)

    # archers are more fragile if poorly protected
    if target.unit_type == "archer":
        arch_incoming_mult, _ = archer_protection_multiplier(defender_army)
        mitigation *= arch_incoming_mult

    damage = max(0.0, attack_per_slot * mitigation)
    return damage, True, ""


# -------------------------
# Combat resolution
# -------------------------

def resolve_attack_events(events, attacker_army: Army, defender_army: Army, attacker_slot_use, max_log_lines=28):
    """
    Apply all planned attacks. The event order is shuffled so the battle feels simultaneous.
    Kills are assigned to the attacker that lands the finishing hit.
    """
    casualties = {ut: 0 for ut in UNIT_TYPES}
    actual_damage = {ut: 0.0 for ut in UNIT_TYPES}
    combat_log = []

    random.shuffle(events)

    for ev in events:
        attacker = ev["attacker"]
        target = ev["target"]

        if not target.is_alive():
            continue

        slots_used = attacker_slot_use.get(attacker, 1)
        damage, hit, note = compute_slot_damage(attacker, target, attacker_army, defender_army, slots_used)

        pre_hp = target.hp
        pre_stamina_target = target.stamina
        pre_stamina_attacker = attacker.stamina

        if not hit:
            # archers still spend stamina on a shot
            stamina_cost = STAMINA_ATTACK_SLOT_COST[attacker.unit_type]
            stamina_cost += STAMINA_DEFENSE_STANCE_COST if attacker.unit_type in attacker_army.strategy.defense else 0.0
            stamina_cost += attacker_army.strategy.hold * STAMINA_HOLD_COST_PER_INTENSITY
            attacker.stamina = clamp(attacker.stamina - stamina_cost, STAMINA_MIN, STAMINA_MAX)
            attacker.damage_dealt += 0.0
            combat_log.append({
                "attacker": attacker,
                "target": target,
                "damage": 0.0,
                "hit": False,
                "note": note,
                "pre_hp": pre_hp,
                "post_hp": pre_hp,
            })
            continue

        actual = min(damage, target.hp)
        if actual <= 0:
            continue

        target.hp -= actual
        target.damage_taken += actual
        attacker.damage_dealt += actual
        actual_damage[target.unit_type] += actual

        # stamina loss from the attack and the resistance
        stamina_cost = STAMINA_ATTACK_SLOT_COST[attacker.unit_type]
        stamina_cost += STAMINA_DEFENSE_STANCE_COST if attacker.unit_type in attacker_army.strategy.defense else 0.0
        stamina_cost += attacker_army.strategy.hold * STAMINA_HOLD_COST_PER_INTENSITY
        stamina_cost += (actual / max(1.0, target.max_hp)) * 2.5
        attacker.stamina = clamp(attacker.stamina - stamina_cost, STAMINA_MIN, STAMINA_MAX)

        target_stamina_loss = max(0.4, (actual / max(1.0, target.max_hp)) * 15.0)
        target.stamina = clamp(target.stamina - target_stamina_loss, STAMINA_MIN, STAMINA_MAX)

        # morale shock on target
        morale_loss = (actual / max(1.0, target.max_hp)) * MORALE_DAMAGE_PENALTY
        target.morale = clamp(target.morale - morale_loss, MORALE_MIN, MORALE_MAX)

        if target.hp <= 1e-9:
            target.hp = 0.0
            target.status = "dead"
            casualties[target.unit_type] += 1
            attacker.kills += 1
            attacker.morale = clamp(attacker.morale + MORALE_KILL_BOOST, MORALE_MIN, MORALE_MAX)

        combat_log.append({
            "attacker": attacker,
            "target": target,
            "damage": actual,
            "hit": True,
            "note": "",
            "pre_hp": pre_hp,
            "post_hp": target.hp,
            "pre_stamina_attacker": pre_stamina_attacker,
            "post_stamina_attacker": attacker.stamina,
            "pre_stamina_target": pre_stamina_target,
            "post_stamina_target": target.stamina,
        })

    return casualties, actual_damage, combat_log


def apply_round_morale_shock(army: Army, casualties_by_type):
    if not ENABLE_MORALE:
        return

    losses_total = sum(casualties_by_type.values())
    initial_total = max(1, army.initial_total)
    loss_frac = losses_total / initial_total
    morale_loss = loss_frac * MORALE_SENSITIVITY

    for u in army.alive_units():
        u.morale = clamp(u.morale - morale_loss, MORALE_MIN, MORALE_MAX)
        if ENABLE_STAMINA:
            low_stamina_penalty = max(0.0, (1.0 - (u.stamina / STAMINA_MAX))) * MORALE_STAMINA_LINK
            u.morale = clamp(u.morale - low_stamina_penalty, MORALE_MIN, MORALE_MAX)


def apply_end_of_round_fatigue(army: Army, engaged_units_set, attacker_slot_use, defender_slot_use):
    """
    Stamina drains from fighting, holding, and defending.
    Backup units recover a bit because they were not in the direct grind.
    """
    alive = army.alive_units()
    engaged_lookup = set(engaged_units_set)
    hold_cost = army.strategy.hold * STAMINA_HOLD_COST_PER_INTENSITY

    for u in alive:
        if u in engaged_lookup:
            # base round fatigue + a small cost per engagement slot used
            slots_used = 0
            if u in attacker_slot_use:
                slots_used += attacker_slot_use[u]
            if u in defender_slot_use:
                slots_used += defender_slot_use[u]

            fatigue = STAMINA_ROUND_BASE_LOSS
            fatigue += slots_used * 0.45
            fatigue += hold_cost
            if u.unit_type in army.strategy.defense:
                fatigue += STAMINA_DEFENSE_STANCE_COST
            u.stamina = clamp(u.stamina - fatigue, STAMINA_MIN, STAMINA_MAX)
        else:
            # backup units get a small chance to settle and recover
            recovery = STAMINA_RECOVERY_BACKUP
            u.stamina = clamp(u.stamina + recovery, STAMINA_MIN, STAMINA_MAX)

        # stamina and morale are connected: exhausted units get mentally strained
        if u.stamina < 35.0:
            u.morale = clamp(u.morale - ((35.0 - u.stamina) / 35.0) * 0.03, MORALE_MIN, MORALE_MAX)


def process_pending_flee(army: Army, enemy: Army):
    """
    Remove selected units from the round. Some are lost immediately, others flee and return later.
    """
    log = []
    orders = list(army.strategy.pending_flee)
    army.strategy.clear_pending()

    for (dtype, cnt) in orders:
        available_units = [u for u in army.alive_units() if u.unit_type == dtype]
        attempted = min(cnt, len(available_units))
        if attempted <= 0:
            log.append((dtype, 0, 0))
            continue

        # choose units to flee
        chosen = random.sample(available_units, attempted)

        # enemy pressure makes retreat more dangerous
        enemy_pressure = enemy.total_units() / (attempted + 1)
        base_frac = random.uniform(FLEE_BASE_LOSS_MIN, FLEE_BASE_LOSS_MAX)
        pressure_frac = min(0.5, 0.03 * enemy_pressure)
        lost_frac = min(0.95, base_frac + pressure_frac)
        lost = int(math.floor(attempted * lost_frac + 1e-9))
        lost = min(lost, attempted)
        made_away = attempted - lost

        # apply state changes
        if lost > 0:
            for u in chosen[:lost]:
                u.status = "dead"
                u.hp = 0.0
                u.return_in = 0
                u.stamina = 0.0
                u.morale = MORALE_MIN

        for u in chosen[lost:]:
            u.status = "fleeing"
            u.return_in = 2
            army.strategy.fleeing[dtype] += 1

        log.append((dtype, attempted, lost))

    return log


def return_fled_units(army: Army):
    """
    Fleeing units return after their timer expires.
    They come back tired but not broken.
    """
    returned = defaultdict(int)
    for u in army.units:
        if u.status == "fleeing":
            u.return_in -= 1
            if u.return_in <= 0:
                u.status = "alive"
                u.hp = u.max_hp
                u.stamina = clamp(max(u.stamina, 45.0) + STAMINA_FLEE_RETURN_BONUS, STAMINA_MIN, STAMINA_MAX)
                u.morale = clamp(max(u.morale, MORALE_MIN) + 0.05, MORALE_MIN, MORALE_MAX)
                u.return_in = 0
                returned[u.unit_type] += 1

    new_fleeing = defaultdict(int)
    for u in army.units:
        if u.status == "fleeing":
            new_fleeing[u.unit_type] += 1
    army.strategy.fleeing = new_fleeing
    return dict(returned)


def update_morale_and_maybe_route(army: Army, losses_by_type):
    """
    Morale falls with casualties. If army morale is low, some living units rout.
    Routed units are split between immediate losses and temporary flee.
    """
    if not ENABLE_MORALE:
        return {}

    apply_round_morale_shock(army, losses_by_type)

    routed_log = {}
    if army.morale < ROUTE_THRESHOLD and army.total_units() > 0:
        route_frac = min(1.0, (ROUTE_THRESHOLD - army.morale) / ROUTE_THRESHOLD * ROUTE_SEVERITY)
        route_count = int(round(army.total_units() * route_frac))

        if route_count > 0:
            alive_units = army.alive_units()
            # pick the weakest spirits first
            alive_units.sort(key=lambda u: (u.morale, u.stamina, u.hp / max(1.0, u.max_hp), u.uid))
            selected = alive_units[:route_count]

            lost_now = defaultdict(int)
            fled = defaultdict(int)

            for u in selected:
                if random.random() < ROUTE_LOSS_FRAC:
                    u.status = "dead"
                    u.hp = 0.0
                    u.stamina = 0.0
                    u.morale = MORALE_MIN
                    lost_now[u.unit_type] += 1
                else:
                    u.status = "fleeing"
                    u.return_in = 2
                    u.stamina = clamp(max(u.stamina, 40.0), STAMINA_MIN, STAMINA_MAX)
                    fled[u.unit_type] += 1
                    army.strategy.fleeing[u.unit_type] += 1

            routed_log = {"lost_now": dict(lost_now), "fled": dict(fled)}

    return routed_log


# -------------------------
# Army generation / strategy input
# -------------------------

def make_army_from_counts(name, counts):
    return Army(name, counts)


def get_army_from_user(prompt_name="Player"):
    print(f"\nEnter counts for {prompt_name} army (press Enter to use 0):")
    inputs = {}
    for ut in UNIT_TYPES:
        val = input(f"  {ut} count: ").strip()
        if val == "":
            val = "0"
        inputs[ut] = val
    sanitized = sanitize_army_input(inputs)
    return make_army_from_counts(prompt_name, sanitized)


def ai_randomize(army: Army):
    if random.random() < 0.15:
        army.strategy.hold = max(0, min(10, army.strategy.hold + random.choice([-1, 0, 1])))

    if random.random() < 0.10:
        possible = [ut for ut in UNIT_TYPES if army.counts_by_type()[ut] > 0]
        if possible:
            ut = random.choice(possible)
            if ut in army.strategy.defense and random.random() < 0.5:
                army.strategy.defense.remove(ut)
            else:
                army.strategy.defense.add(ut)

    if random.random() < 0.06:
        ut_options = [ut for ut in UNIT_TYPES if army.counts_by_type()[ut] > 0]
        if ut_options:
            ut = random.choice(ut_options)
            cnt = max(1, int(round(army.counts_by_type()[ut] * random.uniform(0.02, 0.10))))
            army.strategy.pending_flee.append((ut, cnt))


def players_set_strategies(player: Army, enemy: Army, pre=False):
    prompt_intro = "Set strategies before round 1 (optional)." if pre else "Set/change strategies for upcoming round (optional)."
    print("\n" + prompt_intro)
    print("Commands: hold <0-10>, defend <unit>, undefend <unit>, flee <unit> <count>, show, done")
    while True:
        cmd = input("strategy> ").strip().lower()
        if not cmd:
            break

        parts = cmd.split()
        if parts[0] == "done":
            break

        elif parts[0] == "show":
            display_unit_stats()
            display_army_snapshot(player)
            display_army_snapshot(enemy)
            continue

        elif parts[0] == "hold":
            if len(parts) >= 2:
                try:
                    v = int(parts[1])
                    v = max(0, min(10, v))
                    player.strategy.hold = v
                    print(f"Set hold intensity to {v}.")
                except Exception:
                    print("Invalid hold value.")
            else:
                print("Usage: hold <0-10>")
            continue

        elif parts[0] == "defend" and len(parts) >= 2:
            ut = parts[1]
            if ut in UNIT_TYPES:
                if player.counts_by_type()[ut] > 0:
                    player.strategy.defense.add(ut)
                    print(f"{ut} now defending (reduced incoming damage).")
                else:
                    print(f"You have no {ut} units to defend.")
            else:
                print("Unknown unit type.")
            continue

        elif parts[0] == "undefend" and len(parts) >= 2:
            ut = parts[1]
            if ut in player.strategy.defense:
                player.strategy.defense.remove(ut)
                print(f"{ut} removed from defense stance.")
            else:
                print("That unit type wasn't defending.")
            continue

        elif parts[0] == "flee" and len(parts) >= 3:
            ut = parts[1]
            try:
                cnt = int(parts[2])
                if ut not in UNIT_TYPES:
                    print("Unknown unit type.")
                elif cnt <= 0:
                    print("Count must be > 0.")
                elif cnt > player.counts_by_type()[ut]:
                    print(f"You don't have that many living {ut}.")
                else:
                    player.strategy.pending_flee.append((ut, cnt))
                    print(f"Ordered {cnt} {ut} to flee next round.")
            except Exception:
                print("Invalid count.")
            continue

        else:
            print("Unknown command. Allowed: hold, defend, undefend, flee, show, done.")
            continue


# -------------------------
# Battle simulation
# -------------------------

def top_warriors(army: Army, n=10):
    alive = army.alive_units()

    def score(u):
        hp_ratio = u.hp / u.max_hp if u.max_hp > 0 else 0.0
        stamina_ratio = u.stamina / STAMINA_MAX if STAMINA_MAX > 0 else 0.0
        return (u.kills * 100.0) + (u.damage_dealt * 0.5) + (hp_ratio * 25.0) + (u.morale * 10.0) + (stamina_ratio * 8.0)

    alive.sort(key=lambda u: (score(u), u.kills, u.damage_dealt, u.hp, u.morale), reverse=True)
    return alive[:n]


def print_top_warriors(army: Army, n=10):
    top = top_warriors(army, n=n)
    if not top:
        print("No surviving warriors to rank.")
        return

    print(f"\n=== Top {min(n, len(top))} warriors: {army.name} ===")
    print(f"{'#':>2}  {'unit':12} {'kills':>5} {'hp':>11} {'morale':>7} {'stamina':>8} {'damage':>10} {'taken':>10}")
    for i, u in enumerate(top, 1):
        print(
            f"{i:>2}  {u.display_name():12} {u.kills:5d} "
            f"{u.hp:5.0f}/{u.max_hp:<5.0f} {u.morale:7.2f} {u.stamina:8.1f} {u.damage_dealt:10.1f} {u.damage_taken:10.1f}"
        )

    mvp = top[0]
    print(f"\nMVP: {mvp.display_name()} | kills={mvp.kills} | hp={mvp.hp:.0f}/{mvp.max_hp:.0f} | morale={mvp.morale:.2f} | stamina={mvp.stamina:.1f}")


def summarize_events(events, attacker_slot_use, defender_slot_use, limit=28):
    """
    Render readable combat lines without flooding the terminal.
    """
    if not events:
        print("No engagements occurred this round.")
        return

    shown = 0
    for ev in events:
        if shown >= limit:
            break
        attacker = ev["attacker"]
        target = ev["target"]
        if ev.get("hit"):
            hit_text = f"hit {ev['damage']:.1f}"
            hp_text = f"{ev['pre_hp']:.1f}->{ev['post_hp']:.1f}"
            extra = ""
            if target.hp <= 0:
                extra = " | KILL"
            print(f" {shown+1:02d}. {unit_short(attacker):10} -> {unit_short(target):10} | {hit_text:<10} | HP {hp_text:<15}{extra}")
        else:
            print(f" {shown+1:02d}. {unit_short(attacker):10} -> {unit_short(target):10} | MISS {ev.get('note','')}")
        shown += 1

    remaining = len(events) - shown
    if remaining > 0:
        print(f" ... {remaining} more engagements resolved off-screen")


def resolve_round(army_a: Army, army_b: Army):
    """
    One round of simultaneous combat.
    """
    # pending flee happens before the fight
    flee_log_a = process_pending_flee(army_a, army_b)
    flee_log_b = process_pending_flee(army_b, army_a)

    # enemy AI tweaks its own strategy
    ai_randomize(army_b)

    # generate attacks for both sides
    events_a_to_b, meta_a = generate_attack_events(army_a, army_b)
    events_b_to_a, meta_b = generate_attack_events(army_b, army_a)

    def dmg_summary(events):
        out = {ut: 0.0 for ut in UNIT_TYPES}
        for ev in events:
            out[ev["target"].unit_type] += 1.0
        # this is an event-count summary, not raw damage; better for quick reading.
        return " ".join(f"{t[:3]}:{int(out[t])}" for t in UNIT_TYPES)

    print(f"{army_a.name} planned engagements -> {len(events_a_to_b)}  (slots {meta_a['slots_a']} vs {meta_a['slots_b']})")
    print(f"{army_b.name} planned engagements -> {len(events_b_to_a)}  (slots {meta_b['slots_a']} vs {meta_b['slots_b']})")
    print(f"{army_a.name} active attackers: {meta_a['active_attackers']} / backup: {meta_a['backup_attackers']} | active defenders: {meta_a['active_defenders']} / backup: {meta_a['backup_defenders']}")
    print(f"{army_b.name} active attackers: {meta_b['active_attackers']} / backup: {meta_b['backup_attackers']} | active defenders: {meta_b['active_defenders']} / backup: {meta_b['backup_defenders']}")

    # resolve attacks
    casualties_b, actual_dmg_b, log_a_to_b = resolve_attack_events(events_a_to_b, army_a, army_b, meta_a["attacker_slot_use"])
    casualties_a, actual_dmg_a, log_b_to_a = resolve_attack_events(events_b_to_a, army_b, army_a, meta_b["attacker_slot_use"])

    # apply army-wide morale shock from casualties
    apply_round_morale_shock(army_a, casualties_a)
    apply_round_morale_shock(army_b, casualties_b)

    # then routing can happen based on the new army morale
    routed_a = update_morale_and_maybe_route(army_a, casualties_a)
    routed_b = update_morale_and_maybe_route(army_b, casualties_b)

    # endurance and stamina effects after the fighting has been resolved
    engaged_units_a = set(meta_a["attacker_slot_use"].keys()) | set(meta_a["defender_slot_use"].keys())
    engaged_units_b = set(meta_b["attacker_slot_use"].keys()) | set(meta_b["defender_slot_use"].keys())
    apply_end_of_round_fatigue(army_a, engaged_units_a, meta_a["attacker_slot_use"], meta_a["defender_slot_use"])
    apply_end_of_round_fatigue(army_b, engaged_units_b, meta_b["attacker_slot_use"], meta_b["defender_slot_use"])

    # fleeing units return after their away-round ends
    returned_a = return_fled_units(army_a)
    returned_b = return_fled_units(army_b)

    # battlefield display
    print("\n--- combat flow ---")
    print(f"{army_a.name} actions")
    summarize_events(log_a_to_b, meta_a["attacker_slot_use"], meta_a["defender_slot_use"]) 
    print(f"{army_b.name} actions")
    summarize_events(log_b_to_a, meta_b["attacker_slot_use"], meta_b["defender_slot_use"]) 

    return {
        "a_losses": casualties_a,
        "b_losses": casualties_b,
        "a_flee_log": flee_log_a,
        "b_flee_log": flee_log_b,
        "a_returned": returned_a,
        "b_returned": returned_b,
        "a_routed": routed_a,
        "b_routed": routed_b,
        "a_events": log_b_to_a,
        "b_events": log_a_to_b,
        "meta_a": meta_a,
        "meta_b": meta_b,
    }


def simulate_battle(army_a: Army, army_b: Army, max_rounds=200, interactive=True):
    log = []
    round_no = 0
    auto_mode = False

    print("\n=== Battle START ===")
    display_army_snapshot(army_a)
    display_army_snapshot(army_b)

    if interactive:
        print("You may set strategies before round 1.")
        players_set_strategies(army_a, army_b, pre=True)

    while round_no < max_rounds and not army_a.is_defeated() and not army_b.is_defeated():
        round_no += 1
        print_round_header(round_no, army_a, army_b)

        if interactive:
            players_set_strategies(army_a, army_b, pre=False)

        round_result = resolve_round(army_a, army_b)

        def casualties_str(c):
            return ", ".join(f"{k} -{v}" for k, v in c.items() if v) or "none"

        print(f"{army_a.name} losses: {casualties_str(round_result['a_losses'])}")
        print(f"{army_b.name} losses: {casualties_str(round_result['b_losses'])}")

        if round_result["a_flee_log"]:
            for dtype, attempted, lost in round_result["a_flee_log"]:
                if attempted > 0:
                    print(f"{army_a.name} attempted to flee {attempted} {dtype}, lost {lost} during retreat.")
        if round_result["b_flee_log"]:
            for dtype, attempted, lost in round_result["b_flee_log"]:
                if attempted > 0:
                    print(f"{army_b.name} attempted to flee {attempted} {dtype}, lost {lost} during retreat.")

        if round_result["a_returned"]:
            print(f"{army_a.name} units returned from flee: {round_result['a_returned']}")
        if round_result["b_returned"]:
            print(f"{army_b.name} units returned from flee: {round_result['b_returned']}")

        if round_result["a_routed"]:
            print(f"{army_a.name} routed event: lost {round_result['a_routed'].get('lost_now', {})}, fled {round_result['a_routed'].get('fled', {})}")
        if round_result["b_routed"]:
            print(f"{army_b.name} routed event: lost {round_result['b_routed'].get('lost_now', {})}, fled {round_result['b_routed'].get('fled', {})}")

        display_army_snapshot(army_a)
        display_army_snapshot(army_b)

        summary = {
            "round": round_no,
            "a_counts": army_a.counts_by_type(),
            "b_counts": army_b.counts_by_type(),
            "a_losses": round_result["a_losses"],
            "b_losses": round_result["b_losses"],
            "a_flee_log": round_result["a_flee_log"],
            "b_flee_log": round_result["b_flee_log"],
            "a_returned": round_result["a_returned"],
            "b_returned": round_result["b_returned"],
            "a_routed": round_result["a_routed"],
            "b_routed": round_result["b_routed"],
            "a_strat": army_a.strategy.copy_for_log(),
            "b_strat": army_b.strategy.copy_for_log(),
        }
        log.append(summary)

        if interactive and not auto_mode:
            print("press Enter to continue, 'a' to auto-run remaining rounds, 'q' to quit early")
            inp = input().strip().lower()
            if inp == "a":
                auto_mode = True
            elif inp == "q":
                print("You quit the battle early.")
                break

    # decide winner
    if army_a.is_defeated() and army_b.is_defeated():
        winner = "draw"
    elif army_a.is_defeated():
        winner = army_b.name
    elif army_b.is_defeated():
        winner = army_a.name
    else:
        if army_a.total_units() > army_b.total_units():
            winner = army_a.name
        elif army_b.total_units() > army_a.total_units():
            winner = army_b.name
        else:
            if army_a.total_hp() > army_b.total_hp():
                winner = army_a.name
            elif army_b.total_hp() > army_a.total_hp():
                winner = army_b.name
            else:
                winner = "draw"

    result = {
        "winner": winner,
        "rounds": round_no,
        "log": log,
        "final_a": army_a.counts_by_type(),
        "final_b": army_b.counts_by_type(),
    }

    print("\n=== Battle result ===")
    print(f"Rounds: {round_no}, Winner: {winner}")
    print(f"{army_a.name} final: " + ", ".join(f"{k}:{v}" for k, v in army_a.counts_by_type().items()))
    print(f"{army_b.name} final: " + ", ".join(f"{k}:{v}" for k, v in army_b.counts_by_type().items()))

    # MVP / top warriors
    if winner == army_a.name:
        print_top_warriors(army_a, n=10)
    elif winner == army_b.name:
        print_top_warriors(army_b, n=10)
    else:
        print("\nDraw: top warriors from both surviving armies.")
        print_top_warriors(army_a, n=10)
        print_top_warriors(army_b, n=10)

    return result


# -------------------------
# UI modes
# -------------------------

def quickBattle():
    print("\nQuick Battle — options:")
    print("1) Enter both armies")
    print("2) Enter player army, random enemy")
    print("3) Random vs Random")
    print("4) Show unit stats & bonuses")
    choice = input("mode: ").strip()

    if choice == "4":
        display_unit_stats()
        return

    if choice == "1":
        a = get_army_from_user("Player")
        b = get_army_from_user("Enemy")

    elif choice == "2":
        a = get_army_from_user("Player")
        total = max(20, a.total_units())
        b_counts = {
            "swordsman": random.randint(0, total // 3),
            "spearman": random.randint(0, total // 3),
            "archer": random.randint(0, total // 3),
            "cavalry": random.randint(0, total // 3),
        }
        b = Army("Enemy (random)", b_counts)
        print(f"Enemy army generated: {b}")

    else:
        total = random.randint(15, 70)
        a_counts = {
            "swordsman": random.randint(0, total // 3),
            "spearman": random.randint(0, total // 3),
            "archer": random.randint(0, total // 3),
            "cavalry": random.randint(0, total // 3),
        }
        b_counts = {
            "swordsman": random.randint(0, total // 3),
            "spearman": random.randint(0, total // 3),
            "archer": random.randint(0, total // 3),
            "cavalry": random.randint(0, total // 3),
        }
        a = Army("Player (random)", a_counts)
        b = Army("Enemy (random)", b_counts)
        print(f"Generated Player: {a}")
        print(f"Generated Enemy : {b}")

    print("\nBattle run mode: (default interactive)")
    print("1) interactive (confirm each round)")
    print("2) auto-run (no prompts)")
    run_mode = input("choose: ").strip()
    interactive = (run_mode != "2")
    simulate_battle(a, b, interactive=interactive)


def sandbox():
    while True:
        print("\nwelcome to sandbox mode, please select the game mode: ")
        print("1. quick battle")
        print("2. show unit stats & bonuses")
        print("3. back to main menu")
        _mode = input("mode: ").strip()
        if _mode == "1":
            quickBattle()
        elif _mode == "2":
            display_unit_stats()
        elif _mode == "3":
            break
        else:
            print("invalid mode, try again")


def start():
    print("welcome to the tactical strategy game, please select game type:")
    print("1. sandbox")
    print("2. quit")
    while True:
        _type = input("type: ").strip()
        if _type == "1":
            sandbox()
            print("\nBack to main menu.")
        elif _type == "2":
            print("Goodbye.")
            break
        else:
            print("invalid type, please try again")


if __name__ == "__main__":
    start()
