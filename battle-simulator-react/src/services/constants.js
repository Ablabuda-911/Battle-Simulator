export const UNIT_TYPES = ["swordsman", "spearman", "archer", "cavalry"];

export const UNIT_STATS = {
  swordsman: { attack: 5.0, hp: 22.0, defense: 2.0, color: "#c41e3a" },
  spearman: { attack: 4.5, hp: 20.0, defense: 3.0, color: "#ffd700" },
  archer: { attack: 6.0, hp: 14.0, defense: 1.0, color: "#228b22" },
  cavalry: { attack: 8.0, hp: 28.0, defense: 4.0, color: "#4169e1" },
};

export const ENGAGEMENT_CAP = {
  swordsman: 4,
  spearman: 3,
  cavalry: 2,
  archer: 1,
};

// Morale tuning
export const MORALE = {
  SENSITIVITY: 0.20,
  MIN: 0.20,
  MAX: 1.50,
  KILL_BOOST: 0.03,
  DAMAGE_PENALTY: 0.15,
  STAMINA_LINK: 0.045,
};

export const STAMINA = {
  MAX: 100.0,
  MIN: 0.0,
  ROUND_BASE_LOSS: 1.0,
  ATTACK_SLOT_COST: {
    swordsman: 2.0,
    spearman: 1.8,
    archer: 1.4,
    cavalry: 2.6,
  },
};

// Color scheme for UI
export const COLORS = {
  primary: "#1a1a1a",
  secondary: "#2d2d2d",
  accent: "#00d4ff",
  success: "#00ff00",
  danger: "#ff0040",
  warning: "#ffaa00",
};