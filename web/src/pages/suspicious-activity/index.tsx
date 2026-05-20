import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, ArrowRight, Sparkles, Zap, TrendingUp, Shield } from 'lucide-react';

export default function SuspiciousActivityPage() {
  const navigate = useNavigate();

  // Auto-redirect after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/employee-insights', { replace: true });
    }, 8000);

    return () => clearTimeout(timer);
  }, [navigate]);

  const redirectNow = () => {
    navigate('/employee-insights', { replace: true });
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-6">
          <Sparkles className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          🎉 System Upgraded!
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          The suspicious activity detection has been replaced with our new 
          <span className="font-semibold text-blue-600"> AI-Powered Employee Insights</span> system
        </p>
      </div>

      <Card className="mb-8 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-3 text-2xl">
            <Brain className="h-8 w-8 text-blue-600" />
            New Employee Insights System
          </CardTitle>
          <CardDescription className="text-lg">
            Advanced AI analysis with comprehensive employee performance insights
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="text-center p-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-3">
                <Brain className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold mb-2">OpenAI GPT-4o Analysis</h3>
              <p className="text-sm text-gray-600">Advanced AI-powered insights using state-of-the-art language models</p>
            </div>
            <div className="text-center p-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mb-3">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="font-semibold mb-2">Comprehensive Analysis</h3>
              <p className="text-sm text-gray-600">Detailed productivity patterns, focus metrics, and behavioral insights</p>
            </div>
            <div className="text-center p-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-3">
                <Shield className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-semibold mb-2">Automated Reports</h3>
              <p className="text-sm text-gray-600">Daily team insights with management alerts and recommendations</p>
            </div>
          </div>
          
          <div className="text-center">
            <Button 
              onClick={redirectNow}
              size="lg" 
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3"
            >
              <Brain className="mr-2 h-5 w-5" />
              Access Employee Insights Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="text-sm text-gray-500 mt-4">
              ⏱️ Redirecting automatically in 8 seconds...
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h3 className="font-semibold text-yellow-800 mb-2 flex items-center">
          <Zap className="mr-2 h-5 w-5" />
          What's New in Employee Insights?
        </h3>
        <ul className="space-y-2 text-sm text-yellow-700">
          <li>• <strong>AI-Powered Analysis:</strong> OpenAI GPT-4o-mini provides detailed productivity insights</li>
          <li>• <strong>Comprehensive Reports:</strong> Daily team insights with management alerts</li>
          <li>• <strong>Behavioral Patterns:</strong> Advanced detection of work patterns and productivity trends</li>
          <li>• <strong>Automated Processing:</strong> 4,771 screenshots in processing queue with 5x faster analysis</li>
          <li>• <strong>Smart Categorization:</strong> Automatic classification of productive vs. distracting activities</li>
        </ul>
      </div>
    </div>
  );
} 