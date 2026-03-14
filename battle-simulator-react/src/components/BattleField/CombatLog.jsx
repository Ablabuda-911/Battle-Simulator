import React from 'react';
import { useBattleStore } from '../../store/battleStore';
import styles from './CombatLog.module.css';

const CombatLog = () => {
  const { battleLog } = useBattleStore();

  return (
    <div className={styles.logContainer}>
      <h3>⚔️ Combat Log</h3>
      <div className={styles.logContent}>
        {battleLog.length === 0 ? (
          <p className={styles.empty}>No combat events yet...</p>
        ) : (
          battleLog.slice(-20).reverse().map((entry, idx) => (
            <div key={idx} className={styles.logEntry}>
              <span className={styles.round}>R{entry.round}</span>
              <span className={styles.event}>
                {entry.events?.length || 0} engagements | 
                {entry.aLosses ? ` 🔴 ${Object.values(entry.aLosses).reduce((a, b) => a + b, 0)} losses` : ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CombatLog;