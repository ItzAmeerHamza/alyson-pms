import { useState } from 'react';

export function TimeTracker() {
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState('');

  return (
    <div>
      <input
        placeholder="Task label"
        value={label}
        onChange={e => setLabel(e.target.value)}
      />
      <button onClick={() => setRunning(!running)}>
        {running ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}
