import React, { useState } from 'react';
import './App.css';
import ArmyBuilder from './components/ArmySetup/ArmyBuilder';
import BattleField from './components/BattleField/BattleField';
import { useBattleStore } from './store/battleStore';

function App() {
  const [gameState, setGameState] = useState('setup'); // setup or battle
  const { armyA, armyB, initializeBattle } = useBattleStore();

  const handleArmiesCreated = (countsA, countsB) => {
    initializeBattle(countsA, countsB, 'Team Alpha', 'Team Bravo');
    setGameState('battle');
  };

  const handleBackToSetup = () => {
    setGameState('setup');
  };

  return (
    <div className="app">
      {gameState === 'setup' ? (
        <ArmyBuilder onStart={handleArmiesCreated} />
      ) : (
        <>
          <BattleField />
          <button onClick={handleBackToSetup} className="backBtn">
            ← Back to Setup
          </button>
        </>
      )}
    </div>
  );
}

export default App;