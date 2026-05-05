import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const { user, userDetails, loading, error } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  useEffect(() => {
    // Don't redirect while authentication is still loading
    if (loading) {
      return;
    }

    // If there's an auth error or no user, go to login
    if (error || !user) {
      navigate("/login", { replace: true });
      return;
    }

    // If user is authenticated but no user details yet, wait a bit more
    if (user && !userDetails) {
      // Give it a moment for userDetails to load
      setTimeout(() => {
        if (!userDetails) {
          console.log("User details not loaded, redirecting to login");
          navigate("/login", { replace: true });
        }
      }, 2000);
      return;
    }

    // If we have both user and userDetails, redirect based on role
    if (user && userDetails) {
      setIsRedirecting(true);
      
      console.log("Redirecting user with role:", userDetails.role);
      
      if (userDetails.role === 'admin' || userDetails.role === 'manager') {
        navigate("/admin", { replace: true });
      } else {
        navigate("/employee/dashboard", { replace: true });
      }
    }
  }, [user, userDetails, loading, error, navigate]);
  
  // Show loading state
  if (loading || isRedirecting) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-muted/40 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold text-primary mb-6">Alyson Time</h1>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-center mb-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <h2 className="text-2xl font-semibold mb-4">Loading...</h2>
            <p className="mb-6 text-muted-foreground">
              {loading ? "Checking authentication..." : "Redirecting based on your role..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state with manual navigation option
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-muted/40 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold text-primary mb-6">Alyson Time</h1>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold mb-4 text-red-600">Authentication Error</h2>
            <p className="mb-6 text-muted-foreground">{error}</p>
            <div className="flex justify-center gap-4">
              <Button variant="default" onClick={() => navigate("/login")}>
                Go to Login
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Fallback UI (should rarely be shown)
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-muted/40 p-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold text-primary mb-6">Alyson Time</h1>
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4">Welcome to Alyson Time</h2>
          <p className="mb-6">
            Employee time tracking and productivity monitoring platform.
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="default" onClick={() => navigate("/login")}>
              Go to Login
            </Button>
            {userDetails?.role === 'admin' && (
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Go Dashboard
              </Button>
            )}
            {userDetails?.role === 'employee' && (
              <Button variant="outline" onClick={() => navigate("/employee/dashboard")}>
                Employee Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
