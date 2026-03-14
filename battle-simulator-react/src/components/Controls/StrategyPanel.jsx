import React, { useState } from 'react';
import { useBattleStore } from '../../store/battleStore';
import styles from './StrategyPanel.module.css';

const StrategyPanel = () => {
  const { armyA, setArmyStrategy } = useBattleStore();
  const [hold, setHold] = useState(0);
  const [defense, setDefense] = useState(new Set());

  const handleHoldChange = (value) => {
    setHold(value);
    setArmyStrategy('A', { hold: value });
  };

  const toggleDefense = (unitType) => {
    const newDefense = new Set(defense);
    if (newDefense.has(unitType)) {
      newDefense.delete(unitType);
    } else {
      newDefense.add(unitType);
    }
    setDefense(newDefense);
    setArmyStrategy('A', { defense: newDefense });
  };

  if (!armyA) return null;

  return (
    <div className={styles.panel}>
      <h3>Strategy (Team Alpha)</h3>

      <div className={styles.section}>
        <label>Hold Intensity: {hold}</label>
        <input
          type="range"
          min="0"
          max="10"
          value={hold}
          onChange={(e) => handleHoldChange(parseInt(e.target.value))}
        />
        <small>Protects archers, reduces damage</small>
      </div>

      <div className={styles.section}>
        <label>Defense Stance</label>
        {['swordsman', 'spearman', 'archer', 'cavalry'].map(type => (
          <label key={type} className={styles.checkbox}>
            <input
              type="checkbox"
              checked={defense.has(type)}
              onChange={() => toggleDefense(type)}
              disabled={armyA.getCountsByType()[type] === 0}
            />
            {type}
          </label>
        ))}
      </div>
    </div>
  );
};

export default StrategyPanel;