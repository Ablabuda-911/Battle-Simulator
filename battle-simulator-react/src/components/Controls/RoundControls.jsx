import React from 'react';
import { useBattleStore } from '../../store/battleStore';
import styles from './RoundControls.module.css';

const RoundControls = () => {
  const { isRunning, isPaused, speed, startBattle, pauseBattle, setSpeed, endBattle } = useBattleStore();

  return (
    <div className={styles.controls}>
      <button
        onClick={startBattle}
        disabled={isRunning}
        className={styles.btn}
      >
        ▶️ START
      </button>

      <button
        onClick={pauseBattle}
        disabled={!isRunning}
        className={styles.btn}
      >
        {isPaused ? '▶️ RESUME' : '⏸️ PAUSE'}
      </button>

      <button
        onClick={endBattle}
        disabled={!isRunning}
        className={styles.btn}
      >
        ⏹️ END
      </button>

      <div className={styles.speedControl}>
        <label>Speed: {speed.toFixed(1)}x</label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.5"
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
};

export default RoundControls;