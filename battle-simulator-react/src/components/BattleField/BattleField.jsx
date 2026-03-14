import React, { useEffect, useState } from 'react';
import { useBattleStore } from '../../store/battleStore';
import { resolveRound } from '../../services/battleEngine';
import ArmyDisplay from './ArmyDisplay';
import CombatLog from './CombatLog';
import StrategyPanel from '../Controls/StrategyPanel';
import RoundControls from '../Controls/RoundControls';
import styles from './BattleField.module.css';

const BattleField = () => {
  const {
    armyA,
    armyB,
    currentRound,
    isRunning,
    isPaused,
    speed,
    startBattle,
    pauseBattle,
    nextRound,
    addLogEntry,
  } = useBattleStore();

  useEffect(() => {
    if (!isRunning || isPaused || !armyA || !armyB) return;

    const interval = setTimeout(() => {
      // Check if battle is over
      if (armyA.isDefeated() || armyB.isDefeated()) {
        return;
      }

      // Resolve one round
      const result = resolveRound(armyA, armyB);
      addLogEntry(result);
      nextRound();
    }, 2000 / speed); // Adjust speed

    return () => clearTimeout(interval);
  }, [isRunning, isPaused, armyA, armyB, currentRound, speed]);

  return (
    <div className={styles.battleContainer}>
      <div className={styles.header}>
        <h1>⚔️ Battle Simulator</h1>
        <p>Round {currentRound}</p>
      </div>

      <div className={styles.mainGrid}>
        {/* Left Army */}
        <div className={styles.armySection}>
          {armyA && <ArmyDisplay army={armyA} position="left" />}
        </div>

        {/* Center Controls */}
        <div className={styles.controlsSection}>
          <StrategyPanel />
          <RoundControls />
        </div>

        {/* Right Army */}
        <div className={styles.armySection}>
          {armyB && <ArmyDisplay army={armyB} position="right" />}
        </div>
      </div>

      {/* Combat Log */}
      <CombatLog />
    </div>
  );
};

export default BattleField;