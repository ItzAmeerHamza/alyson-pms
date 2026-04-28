// Memory diagnostics helper for renderer process
const { ipcRenderer } = require('electron');

// Expose memory sample function on window
window.getMemorySample = async () => {
  try {
    const result = await ipcRenderer.invoke('diagnostics:memory-snapshot');
    return result;
  } catch (error) {
    console.error('[MEMORY-DIAGNOSTICS] Failed to get memory sample:', error);
    return { success: false, error: error.message };
  }
};

// React component for Memory HUD (if React is available)
if (typeof React !== 'undefined') {
  const MemoryHUD = () => {
    const [memoryData, setMemoryData] = React.useState(null);
    const [sparklineData, setSparklineData] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(false);

    const fetchMemoryData = async () => {
      setIsLoading(true);
      try {
        const result = await window.getMemorySample();
        if (result.success && result.snapshot) {
          setMemoryData(result.snapshot);
          
          // Update sparkline data (keep last 60 points)
          setSparklineData(prev => {
            const newData = [...prev, result.snapshot.heapUsedMB];
            return newData.slice(-60); // Keep last 60 points
          });
        }
      } catch (error) {
        console.error('[MEMORY-HUD] Failed to fetch memory data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    React.useEffect(() => {
      // Initial fetch
      fetchMemoryData();
      
      // Set up polling every 5 seconds
      const interval = setInterval(fetchMemoryData, 5000);
      
      return () => clearInterval(interval);
    }, []);

    if (!memoryData) {
      return (
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 9999,
          minWidth: '120px'
        }}>
          {isLoading ? 'Loading...' : 'No memory data'}
        </div>
      );
    }

    // Simple sparkline rendering
    const renderSparkline = () => {
      if (sparklineData.length < 2) return null;
      
      const max = Math.max(...sparklineData);
      const min = Math.min(...sparklineData);
      const range = max - min;
      
      const points = sparklineData.map((value, index) => {
        const x = (index / (sparklineData.length - 1)) * 60;
        const y = range > 0 ? 20 - ((value - min) / range) * 20 : 10;
        return `${x},${y}`;
      }).join(' ');
      
      return (
        <svg width="60" height="20" style={{ marginLeft: '8px' }}>
          <polyline
            points={points}
            fill="none"
            stroke="lime"
            strokeWidth="1"
          />
        </svg>
      );
    };

    return (
      <div style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: 9999,
        minWidth: '120px'
      }}>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#ff6b6b' }}>Heap:</span> {memoryData.heapUsedMB}MB
        </div>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#4ecdc4' }}>RSS:</span> {memoryData.rssMB}MB
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#45b7d1' }}>Trend:</span>
          {renderSparkline()}
        </div>
        <div style={{ 
          fontSize: '10px', 
          color: '#888', 
          marginTop: '4px',
          textAlign: 'center',
          cursor: 'pointer'
        }} onClick={fetchMemoryData}>
          {isLoading ? '⏳' : '🔄'}
        </div>
      </div>
    );
  };

  // Make component available globally
  window.MemoryHUD = MemoryHUD;
}

// Export for use in other modules
module.exports = {
  getMemorySample: window.getMemorySample,
  MemoryHUD: window.MemoryHUD
};
