import { create } from 'zustand';
import { Army } from '../services/battleEngine';

export const useBattleStore = create((set, get) => ({
  // State
  armyA: null,
  armyB: null,
  currentRound: 0,
  isRunning: false,
  isPaused: false,
  speed: 1, // 0.5x to 2x
  battleLog: [],
  selectedUnit: null,

  // Actions
  initializeBattle: (countsA, countsB, nameA = "Army A", nameB = "Army B") =>
    set({
      armyA: new Army(nameA, countsA),
      armyB: new Army(nameB, countsB),
      currentRound: 0,
      battleLog: [],
      isRunning: false,
    }),

  startBattle: () => set({ isRunning: true }),
  pauseBattle: () => set(state => ({ isPaused: !state.isPaused })),
  setSpeed: (speed) => set({ speed: Math.max(0.5, Math.min(2, speed)) }),

  addLogEntry: (entry) =>
    set(state => ({
      battleLog: [...state.battleLog, { round: state.currentRound, ...entry }],
    })),

  nextRound: () =>
    set(state => ({ currentRound: state.currentRound + 1 })),

  endBattle: () =>
    set({ isRunning: false, currentRound: 0 }),

  selectUnit: (unitId) =>
    set({ selectedUnit: unitId }),

  setArmyStrategy: (armyName, strategy) =>
    set(state => {
      const army = armyName === "A" ? state.armyA : state.armyB;
      if (army) {
        army.strategy = { ...army.strategy, ...strategy };
      }
      return state;
    }),
}));