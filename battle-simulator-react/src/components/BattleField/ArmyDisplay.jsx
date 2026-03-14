import React from 'react';
import { UNIT_STATS } from '../../services/constants';
import styles from './ArmyDisplay.module.css';

const ArmyDisplay = ({ army, position }) => {
  const formations = {
    left: ['left', 'center', 'right'],
    right: ['right', 'center', 'left'],
  };

  const getUnitsByFlank = () => {
    const flanks = { left: [], center: [], right: [] };
    army.getAliveUnits().forEach(unit => {
      const flank = unit.uid.charCodeAt(0) % 3 === 0 ? 'left' : unit.uid.charCodeAt(0) % 3 === 1 ? 'center' : 'right';
      flanks[flank].push(unit);
    });
    return flanks;
  };

  const flanks = getUnitsByFlank();
  const stats = army.getCountsByType();

  return (
    <div className={`${styles.armyDisplay} ${styles[position]}`}>
      <div className={styles.header}>
        <h2>{army.name}</h2>
        <div className={styles.metrics}>
          <div>Units: {army.getTotalUnits()}</div>
          <div>HP: {Math.floor(army.getTotalHp())}</div>
          <div>Morale: {army.getAverageMorale().toFixed(2)}</div>
          <div>Stamina: {army.getAverageStamina().toFixed(1)}</div>
        </div>
      </div>

      <div className={styles.formation}>
        {['left', 'center', 'right'].map(flank => (
          <div key={flank} className={`${styles.flank} ${styles[flank]}`}>
            <h3>{flank.toUpperCase()}</h3>
            <div className={styles.units}>
              {flanks[flank].map(unit => (
                <UnitIcon key={unit.uid} unit={unit} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.breakdown}>
        {Object.entries(stats).map(([type, count]) => (
          count > 0 && (
            <div key={type} className={styles.unitType}>
              <div 
                className={styles.icon}
                style={{ backgroundColor: UNIT_STATS[type].color }}
              />
              <span>{type}: {count}</span>
            </div>
          )
        ))}
      </div>
    </div>
  );
};

const UnitIcon = ({ unit }) => {
  const stats = UNIT_STATS[unit.unitType];
  const healthPercent = unit.getHealthRatio() * 100;

  return (
    <div
      className="unitIcon"
      title={`${unit.unitType} #${unit.uid}\nHP: ${unit.hp.toFixed(1)}/${unit.maxHp.toFixed(1)}`}
      style={{
        backgroundColor: stats.color,
        opacity: unit.isAlive() ? 1 : 0.3,
      }}
    >
      <div className="healthBar" style={{ width: `${healthPercent}%` }} />
    </div>
  );
};

export default ArmyDisplay;