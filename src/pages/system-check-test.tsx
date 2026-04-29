import React, { useState } from 'react';
import { SystemCheckDialog } from '@/components/system-check-dialog';
import { Button } from '@/components/ui/button';

export function SystemCheckTest() {
  const [showDialog, setShowDialog] = useState(false);
  const [lastResult, setLastResult] = useState<string>('');

  const handleSystemCheckComplete = (allSystemsReady: boolean) => {
    setLastResult(allSystemsReady ? 'All systems ready!' : 'Issues detected');
    setShowDialog(false);
    console.log('🎯 System check completed:', allSystemsReady);
  };

  const openDebugConsole = () => {
    if (window.electron) {
      // Open debug console in desktop app
      console.log('🔬 Opening debug console...');
    } else {
      console.log('🔬 Debug console only available in desktop app');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Alyson PM System Check Test
        </h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">System Check Dialog Test</h2>
          <p className="text-gray-600 mb-4">
            This test demonstrates the comprehensive system check dialog that validates 
            all Alyson PM tracking components before allowing users to start tracking.
          </p>
          
          <div className="space-y-4">
            <Button onClick={() => setShowDialog(true)} className="w-full">
              🔍 Run System Check
            </Button>
            
            {lastResult && (
              <div className={`p-4 rounded-lg ${
                lastResult.includes('ready') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                <strong>Last Result:</strong> {lastResult}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">What This Test Validates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-green-600 mb-2">✅ Critical Tests</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• Database Connection & Operations</li>
                <li>• System Permissions (Screen Recording)</li>
                <li>• Screenshot Capture</li>
                <li>• App Detection</li>
                <li>• Idle Detection</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-blue-600 mb-2">⚠️ Optional Tests</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• URL Detection (browser required)</li>
                <li>• Input Monitoring (enhanced tracking)</li>
                <li>• Accessibility Permissions</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Real Database Testing</h2>
          <p className="text-gray-600 mb-4">
            The system check performs <strong>real database operations</strong> including:
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• Creating test entries in the <code>system_checks</code> table</li>
            <li>• Testing app log functionality with real database inserts</li>
            <li>• Testing URL log functionality with real database inserts</li>
            <li>• Verifying read/write permissions and connectivity</li>
            <li>• Cleanup function to remove test data after validation</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Integration Status</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm">Database table created and types updated</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm">System check functions implemented</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm">IPC handlers added to electron main process</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm">Dialog component with real-time testing</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              <span className="text-sm">Ready for integration into login flow</span>
            </div>
          </div>
        </div>
      </div>

      <SystemCheckDialog 
        isOpen={showDialog}
        onComplete={handleSystemCheckComplete}
        onOpenDebugConsole={openDebugConsole}
      />
    </div>
  );
} 