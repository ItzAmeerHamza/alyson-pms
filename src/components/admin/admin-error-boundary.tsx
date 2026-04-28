import React from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AdminErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface AdminErrorBoundaryProps {
  children: React.ReactNode;
  pageName?: string;
}

/**
 * AdminErrorBoundary - Specialized error boundary for admin pages
 * Provides user-friendly error messages with recovery options
 */
export class AdminErrorBoundary extends React.Component<AdminErrorBoundaryProps, AdminErrorBoundaryState> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AdminErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[AdminErrorBoundary] Error in ${this.props.pageName || 'admin page'}:`, error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  getErrorCategory(): { title: string; description: string; suggestion: string } {
    const errorMessage = this.state.error?.message?.toLowerCase() || '';
    
    // Network/API errors
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('api')) {
      return {
        title: 'Connection Error',
        description: 'Unable to communicate with the server.',
        suggestion: 'Please check your internet connection and try again.'
      };
    }
    
    // Database/Supabase errors
    if (errorMessage.includes('supabase') || errorMessage.includes('database') || errorMessage.includes('query')) {
      return {
        title: 'Data Error',
        description: 'There was a problem loading data from the database.',
        suggestion: 'Try refreshing the page. If the issue persists, contact support.'
      };
    }
    
    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('unauthorized') || errorMessage.includes('access')) {
      return {
        title: 'Access Denied',
        description: 'You do not have permission to access this resource.',
        suggestion: 'Please contact your administrator if you believe this is an error.'
      };
    }
    
    // Generic error
    return {
      title: 'Something went wrong',
      description: 'An unexpected error occurred while loading this page.',
      suggestion: 'Try refreshing the page or go back to the dashboard.'
    };
  }

  render() {
    if (this.state.hasError) {
      const { title, description, suggestion } = this.getErrorCategory();
      const isDev = import.meta.env.MODE === 'development';

      return (
        <div className="flex items-center justify-center p-8">
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-destructive/10 rounded-full w-fit">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-xl">{title}</CardTitle>
              <CardDescription className="text-base">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  {suggestion}
                </AlertDescription>
              </Alert>

              {/* Debug info for development */}
              {isDev && this.state.error && (
                <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md overflow-auto max-h-40">
                  <div className="flex items-center gap-2 mb-2 font-semibold">
                    <Bug className="h-4 w-4" />
                    Development Error Details
                  </div>
                  <pre className="whitespace-pre-wrap">{this.state.error.toString()}</pre>
                  {this.state.errorInfo && (
                    <pre className="mt-2 text-xs opacity-70">{this.state.errorInfo.componentStack}</pre>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={this.handleRetry} className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.location.href = '/dashboard'}
                  className="flex-1"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AdminErrorBoundary;

