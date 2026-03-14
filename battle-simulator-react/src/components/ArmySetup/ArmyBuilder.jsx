import React, { useState } from 'react';
import { UNIT_TYPES, UNIT_STATS } from '../../services/constants';
import styles from './ArmyBuilder.module.css';

const ArmyBuilder = ({ onStart }) => {
  const [armyA, setArmyA] = useState({
    swordsman: 10,
    spearman: 8,
    archer: 5,
    cavalry: 3,
  });

  const [armyB, setArmyB] = useState({
    swordsman: 10,
    spearman: 8,
    archer: 5,
    cavalry: 3,
  });

  const handleChange = (army, unitType, value) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    if (army === 'a') {
      setArmyA({ ...armyA, [unitType]: numValue });
    } else {
      setArmyB({ ...armyB, [unitType]: numValue });
    }
  };

  const randomizeArmy = (army) => {
    const random = {};
    UNIT_TYPES.forEach(type => {
      random[type] = Math.floor(Math.random() * 15) + 5;
    });
    if (army === 'a') setArmyA(random);
    else setArmyB(random);
  };

  const getTotalUnits = (army) => Object.values(army).reduce((a, b) => a + b, 0);

  return (
    <div className={styles.container}>
      <h1>⚔️ Battle Simulator - Army Setup</h1>
      <p className={styles.subtitle}>Configure your armies and start the battle!</p>

      <div className={styles.gridSetup}>
        <ArmySetupPanel
          army={armyA}
          name="TEAM ALPHA (Red)"
          onChange={(unit, val) => handleChange('a', unit, val)}
          onRandomize={() => randomizeArmy('a')}
        />

        <div className={styles.vsContainer}>
          <div className={styles.vs}>VS</div>
        </div>

        <ArmySetupPanel
          army={armyB}
          name="TEAM BRAVO (Blue)"
          onChange={(unit, val) => handleChange('b', unit, val)}
          onRandomize={() => randomizeArmy('b')}
        />
      </div>

      <div className={styles.summary}>
        <div className={styles.stat}>
          <strong>Team Alpha:</strong> {getTotalUnits(armyA)} units
        </div>
        <div className={styles.stat}>
          <strong>Team Bravo:</strong> {getTotalUnits(armyB)} units
        </div>
      </div>

      <button
        className={styles.startBtn}
        onClick={() => onStart(armyA, armyB)}
        disabled={getTotalUnits(armyA) === 0 || getTotalUnits(armyB) === 0}
      >
        🚀 START BATTLE
      </button>
    </div>
  );
};

const ArmySetupPanel = ({ army, name, onChange, onRandomize }) => {
  const total = Object.values(army).reduce((a, b) => a + b, 0);

  return (
    <div className="armyPanel">
      <h2>{name}</h2>
      <p className="totalUnits">Total: {total} units</p>

      {UNIT_TYPES.map(type => (
        <div key={type} className="unitInput">
          <label>
            <span
              className="unitIcon"
              style={{ backgroundColor: UNIT_STATS[type].color }}
            />
            {type.toUpperCase()}
          </label>
          <input
            type="number"
            min="0"
            value={army[type]}
            onChange={(e) => onChange(type, e.target.value)}
          />
        </div>
      ))}

      <button onClick={onRandomize} className="randomBtn">
        🎲 Randomize
      </button>
    </div>
  );
};

export default ArmyBuilder;