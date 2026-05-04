import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { TrackerProvider } from '@/providers/tracker-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { AdminErrorBoundary } from '@/components/admin/admin-error-boundary';
import MainLayout from '@/components/layout/main-layout';

// Lazy load pages for better performance
import LoginPage from '@/pages/auth/login';
import ResetPassword from '@/pages/auth/reset-password';
import ForgotPassword from '@/pages/auth/forgot-password';
import ConfirmPage from '@/pages/auth/confirm';
import DownloadPage from '@/pages/download';
import DashboardPage from '@/pages/dashboard';
import EmployeeDashboard from '@/pages/employee/dashboard';
import EmployeeTimeTracker from '@/pages/employee/time-tracker';
import EmployeeReports from '@/pages/employee/reports';
import ReportsPage from '@/pages/reports';
import TimeReportsPage from '@/pages/time-reports';
import AllEmployeeReport from '@/pages/reports/all-employee-report';
import IndividualEmployeeReport from '@/pages/reports/individual-employee-report';
import AppsUrlsIdle from '@/pages/reports/apps-urls-idle';
import AppActivityPage from '@/pages/app-activity';
import UrlActivityPage from '@/pages/admin/url-activity/index';
import UsersPage from '@/pages/users/users-management';
import UserProfilePage from '@/pages/users/user-profile';
import ProjectsPage from '@/pages/projects';
import ScreenshotsPage from '@/pages/screenshots';
import AppsViewer from '@/pages/screenshots/apps-viewer';
import UrlsViewer from '@/pages/screenshots/urls-viewer';
import SettingsPage from '@/pages/settings';
import CalendarPage from '@/pages/calendar';
// TimeTrackingPage removed - admin doesn't need time tracker
import TimeLogsPage from '@/pages/time-logs';
import EmployeeSettingsPage from '@/pages/employee-settings';
import FinancePage from '@/pages/finance';
import SuspiciousActivityPage from '@/pages/suspicious-activity';
import ActivityMonitorPage from '@/pages/activity-monitor';
import TodaysHistoryPage from '@/pages/todays-history';
import SystemHealthPage from '@/pages/admin/system-health';
import AdminDashboard from '@/pages/admin';
import WarningManagementPage from '@/pages/admin/warning-management';
import BulkReportGeneratorPage from '@/pages/reports/bulk-report-generator';
import EmailReportsPage from '@/pages/admin/email-reports';
import AdminIdleLogsPage from '@/pages/admin/idle-logs';
import VisionMonitoringPage from '@/pages/admin/vision-monitoring';
import AIInsightsPage from '@/pages/ai-insights';
import CostAndUsagePage from '@/pages/cost-and-usage';
import ActivityIssuesPage from '@/pages/activity-issues';
import LiveTrackingTodayPage from '@/pages/test/live-tracking';
import SuperAdminDashboard from '@/pages/super-admin';
import OrganizationsPage from '@/pages/super-admin/organizations';
import OrganizationDetailPage from '@/pages/super-admin/organizations/[id]';
import TeamLeaderDashboard from '@/pages/team-leader/dashboard';
import TeamLeaderEmployeeDetail from '@/pages/team-leader/employee-detail';

// import DebugUrlTracking from '@/components/debug/debug-url-tracking';


// App loading and error handler setup logging disabled for performance

// Catch unhandled JavaScript errors
window.addEventListener('error', (event) => {
  console.error('❌ Global JavaScript Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack
  });
});

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Unhandled Promise Rejection:', {
    reason: event.reason,
    promise: event.promise
  });
});

// Add resource loading error detection
const originalAddEventListener = document.addEventListener;
document.addEventListener = function (type: string, listener: any, options?: any) {
  // Error event listener logging disabled for performance
  return originalAddEventListener.call(this, type, listener, options);
};

// Track script loading
const originalCreateElement = document.createElement;
document.createElement = function (tagName: string) {
  const element = originalCreateElement.call(this, tagName);
  if (tagName.toLowerCase() === 'script') {
    // Script element logging disabled for performance
    const scriptElement = element as HTMLScriptElement;
    scriptElement.addEventListener('load', () => {
      // Script load logging disabled for performance
    });
    scriptElement.addEventListener('error', (event) => {
      console.error('❌ Script failed to load:', {
        src: scriptElement.src,
        event: event
      });
    });
  }
  return element;
};

// Environment check logging disabled for performance

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false, // Disable auto-refetch on window focus to prevent page refreshes when switching apps
    },
    mutations: {
    },
  },
});

// Global flag to control debug logging (set to false for production)
const DEBUG_LOGGING = false;

const safeLog = (...args: any[]) => {
  if (DEBUG_LOGGING) {
    console.log(...args);
  }
};

// Optimized Protected route wrapper
const ProtectedRoute = React.memo(({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    safeLog('🚫 No user found, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  safeLog('✅ User authenticated, rendering protected content');
  return <>{children}</>;
});

// Optimized Admin route wrapper
const AdminRoute = React.memo(({ children }: { children: React.ReactNode }) => {
  const { userDetails, loading } = useAuth();

  safeLog('👑 AdminRoute - userDetails:', userDetails, 'loading:', loading);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!userDetails) {
    safeLog('🚫 No user details found, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  if (userDetails.role !== 'admin' && userDetails.role !== 'manager') {
    safeLog('🚫 User is not admin/manager, redirecting to employee dashboard');
    return <Navigate to="/employee" replace />;
  }

  safeLog('✅ Admin user authenticated, rendering admin content');
  return <>{children}</>;
});

// Generic role guard for admin/manager access
const RoleGuard = React.memo(({ roles, children }: { roles: string[]; children: React.ReactNode }) => {
  const { userDetails, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!userDetails) return <Navigate to="/login" replace />;
  if (!userDetails.role || !roles.includes(userDetails.role)) return <Navigate to="/employee" replace />;
  return <>{children}</>;
});

// Super Admin route wrapper - only allows super admins
const SuperAdminRoute = React.memo(({ children }: { children: React.ReactNode }) => {
  const { userDetails, isSuperAdmin, loading } = useAuth();

  safeLog('🔐 SuperAdminRoute - isSuperAdmin:', isSuperAdmin, 'loading:', loading);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!userDetails) {
    safeLog('🚫 No user details found, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin) {
    safeLog('🚫 User is not super admin, redirecting to dashboard');
    return <Navigate to="/dashboard" replace />;
  }

  safeLog('✅ Super admin authenticated, rendering super admin content');
  return <>{children}</>;
});

// Optimized Employee route wrapper
const EmployeeRoute = React.memo(({ children }: { children: React.ReactNode }) => {
  const { userDetails, loading } = useAuth();

  safeLog('👤 EmployeeRoute - userDetails:', userDetails, 'loading:', loading);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!userDetails) {
    safeLog('🚫 No user details found, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // If admin or manager tries to access employee routes, redirect to admin dashboard
  if (userDetails.role === 'admin' || userDetails.role === 'manager') {
    safeLog('🚫 Admin/manager user accessing employee route, redirecting to admin dashboard');
    return <Navigate to="/dashboard" replace />;
  }

  safeLog('✅ Employee user authenticated, rendering employee content');
  return <>{children}</>;
});

// Optimized Layout wrapper for authenticated pages
const AppLayout = React.memo(({ children }: { children: React.ReactNode }) => {
  safeLog('🏗️ AppLayout rendering');
  return (
    <MainLayout>
      {children}
    </MainLayout>
  );
});

// Optimized Safe Navigate component
const SafeNavigate = React.memo(({ to, replace = false }: { to: string; replace?: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();

  safeLog('🧭 SafeNavigate called:', { to, replace, currentPath: location.pathname });

  React.useEffect(() => {
    // Prevent navigation to the same route
    if (location.pathname !== to) {
      safeLog('🧭 Navigating from', location.pathname, 'to', to);
      const timer = setTimeout(() => {
        navigate(to, { replace });
      }, 10); // Small delay to prevent rapid navigation

      return () => clearTimeout(timer);
    } else {
      safeLog('🧭 Already at destination:', to);
    }
  }, [to, replace, navigate, location.pathname]);

  return <div className="flex items-center justify-center min-h-screen">Redirecting...</div>;
});

// Simplified Route Wrapper without excessive logging
const RouteWrapper = React.memo(({ children, routeName }: { children: React.ReactNode; routeName: string }) => {
  safeLog(`🛣️ Rendering route: ${routeName}`);

  React.useEffect(() => {
    safeLog(`📍 Route mounted: ${routeName}`);
    return () => {
      safeLog(`📍 Route unmounted: ${routeName}`);
    };
  }, [routeName]);

  return <>{children}</>;
});

// Combined Admin Layout wrapper to reduce nesting
// Includes AdminErrorBoundary for better error handling on admin pages
const AdminLayoutWrapper = React.memo(({ children, routeName }: { children: React.ReactNode; routeName: string }) => {
  return (
    <ProtectedRoute>
      <AdminRoute>
        <AppLayout>
          <AdminErrorBoundary pageName={routeName}>
            <RouteWrapper routeName={routeName}>
              {children}
            </RouteWrapper>
          </AdminErrorBoundary>
        </AppLayout>
      </AdminRoute>
    </ProtectedRoute>
  );
});

// Combined Employee Layout wrapper
const EmployeeLayoutWrapper = React.memo(({ children, routeName }: { children: React.ReactNode; routeName: string }) => {
  return (
    <ProtectedRoute>
      <EmployeeRoute>
        <AppLayout>
          <RouteWrapper routeName={routeName}>
            {children}
          </RouteWrapper>
        </AppLayout>
      </EmployeeRoute>
    </ProtectedRoute>
  );
});

// Admin or Team Leader route guard (view access for shared pages)
const AdminOrTeamLeaderRoute = React.memo(({ children }: { children: React.ReactNode }) => {
  const { userDetails, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!userDetails) return <Navigate to="/login" replace />;
  if (!['admin', 'manager', 'team_leader'].includes(userDetails.role || '')) {
    return <Navigate to="/employee" replace />;
  }
  return <>{children}</>;
});

// Combined Team Leader Layout wrapper (admin + manager + team_leader access)
const TeamLeaderLayoutWrapper = React.memo(({ children, routeName }: { children: React.ReactNode; routeName: string }) => {
  return (
    <ProtectedRoute>
      <AdminOrTeamLeaderRoute>
        <AppLayout>
          <AdminErrorBoundary pageName={routeName}>
            <RouteWrapper routeName={routeName}>
              {children}
            </RouteWrapper>
          </AdminErrorBoundary>
        </AppLayout>
      </AdminOrTeamLeaderRoute>
    </ProtectedRoute>
  );
});

/** Super admin, organization admin (role admin), or explicit org admin flag */
const CostAndUsageRoute = React.memo(({ children }: { children: React.ReactNode }) => {
  const { userDetails, isSuperAdmin, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }
  if (!userDetails) {
    return <Navigate to="/login" replace />;
  }

  const allowed =
    isSuperAdmin ||
    userDetails.role === 'admin' ||
    userDetails.is_org_admin === true;

  if (!allowed) {
    const fallback =
      userDetails.role === 'admin' || userDetails.role === 'manager' ? '/dashboard' : '/employee';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
});

const CostAndUsageLayoutWrapper = React.memo(
  ({ children, routeName }: { children: React.ReactNode; routeName: string }) => (
    <ProtectedRoute>
      <CostAndUsageRoute>
        <AppLayout>
          <AdminErrorBoundary pageName={routeName}>
            <RouteWrapper routeName={routeName}>{children}</RouteWrapper>
          </AdminErrorBoundary>
        </AppLayout>
      </CostAndUsageRoute>
    </ProtectedRoute>
  ),
);

// Combined Super Admin Layout wrapper
const SuperAdminLayoutWrapper = React.memo(({ children, routeName }: { children: React.ReactNode; routeName: string }) => {
  return (
    <ProtectedRoute>
      <SuperAdminRoute>
        <AppLayout>
          <AdminErrorBoundary pageName={routeName}>
            <RouteWrapper routeName={routeName}>
              {children}
            </RouteWrapper>
          </AdminErrorBoundary>
        </AppLayout>
      </SuperAdminRoute>
    </ProtectedRoute>
  );
});

// Main routes component that will be wrapped by AuthProvider
function AppRoutes() {
  const { user, userDetails, loading } = useAuth();

  safeLog('🛣️ AppRoutes - user:', !!user, 'userDetails:', userDetails, 'loading:', loading);

  // Show loading while auth is being determined
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <Routes>
      {/* Public Download Route - No Authentication Required */}
      <Route path="/download" element={
        <RouteWrapper routeName="download">
          <DownloadPage />
        </RouteWrapper>
      } />

      {/* Login route - redirect if already authenticated */}
      <Route
        path="/login"
        element={
          user && userDetails ? (
            userDetails.role === 'admin' || userDetails.role === 'manager' ? (
              <RouteWrapper routeName="login-redirect-admin">
                <SafeNavigate to="/dashboard" replace />
              </RouteWrapper>
            ) : (
              <RouteWrapper routeName="login-redirect-employee">
                <SafeNavigate to="/employee" replace />
              </RouteWrapper>
            )
          ) : (
            <RouteWrapper routeName="login">
              <LoginPage />
            </RouteWrapper>
          )
        }
      />

      {/* Password Reset Route - Public */}
      <Route
        path="/auth/reset-password"
        element={
          <RouteWrapper routeName="reset-password">
            <ResetPassword />
          </RouteWrapper>
        }
      />

      {/* Forgot Password Route - Public */}
      <Route
        path="/auth/forgot-password"
        element={
          <RouteWrapper routeName="forgot-password">
            <ForgotPassword />
          </RouteWrapper>
        }
      />

      {/* Email Confirmation Route - Public */}
      <Route
        path="/auth/confirm"
        element={
          <RouteWrapper routeName="confirm">
            <ConfirmPage />
          </RouteWrapper>
        }
      />

      {/* Root redirect */}
      <Route
        path="/"
        element={
          user && userDetails ? (
            userDetails.role === 'admin' || userDetails.role === 'manager' ? (
              <RouteWrapper routeName="root-redirect-admin">
                <SafeNavigate to="/dashboard" replace />
              </RouteWrapper>
            ) : (
              <RouteWrapper routeName="root-redirect-employee">
                <SafeNavigate to="/employee" replace />
              </RouteWrapper>
            )
          ) : (
            <RouteWrapper routeName="root-redirect-login">
              <SafeNavigate to="/login" replace />
            </RouteWrapper>
          )
        }
      />

      {/* Super Admin Routes */}
      <Route path="/super-admin" element={
        <SuperAdminLayoutWrapper routeName="super-admin">
          <SuperAdminDashboard />
        </SuperAdminLayoutWrapper>
      } />

      <Route path="/super-admin/organizations" element={
        <SuperAdminLayoutWrapper routeName="super-admin-organizations">
          <OrganizationsPage />
        </SuperAdminLayoutWrapper>
      } />

      <Route path="/super-admin/organizations/:id" element={
        <SuperAdminLayoutWrapper routeName="super-admin-organization-detail">
          <OrganizationDetailPage />
        </SuperAdminLayoutWrapper>
      } />

      {/* Admin Routes - Using optimized wrapper */}
      <Route path="/dashboard" element={
        <AdminLayoutWrapper routeName="dashboard">
          <DashboardPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/reports" element={
        <TeamLeaderLayoutWrapper routeName="reports">
          <ReportsPage />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/reports/time-reports" element={
        <TeamLeaderLayoutWrapper routeName="time-reports">
          <TimeReportsPage />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/reports/all-employee" element={
        <TeamLeaderLayoutWrapper routeName="all-employee">
          <AllEmployeeReport />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/reports/individual-employee" element={
        <TeamLeaderLayoutWrapper routeName="individual-employee">
          <IndividualEmployeeReport />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/reports/apps-urls-idle" element={
        <TeamLeaderLayoutWrapper routeName="apps-urls-idle">
          <AppsUrlsIdle />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/app-activity" element={
        <TeamLeaderLayoutWrapper routeName="app-activity">
          <AppActivityPage />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/users" element={
        <AdminLayoutWrapper routeName="users">
          <UsersPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/users/:userId" element={
        <AdminLayoutWrapper routeName="user-profile">
          <UserProfilePage />
        </AdminLayoutWrapper>
      } />

      <Route path="/projects" element={
        <AdminLayoutWrapper routeName="projects">
          <ProjectsPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/screenshots" element={
        <TeamLeaderLayoutWrapper routeName="screenshots">
          <ScreenshotsPage />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/activity-monitor" element={
        <AdminLayoutWrapper routeName="activity-monitor">
          <ActivityMonitorPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/todays-history" element={
        <AdminLayoutWrapper routeName="todays-history">
          <TodaysHistoryPage />
        </AdminLayoutWrapper>
      } />

      {/* System health route removed - not needed in admin */}

      <Route path="/apps" element={
        <AdminLayoutWrapper routeName="apps">
          <AppsViewer />
        </AdminLayoutWrapper>
      } />

      <Route path="/urls" element={
        <AdminLayoutWrapper routeName="urls">
          <UrlsViewer />
        </AdminLayoutWrapper>
      } />

      <Route path="/settings" element={
        <AdminLayoutWrapper routeName="settings">
          <SettingsPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/calendar" element={
        <TeamLeaderLayoutWrapper routeName="calendar">
          <CalendarPage />
        </TeamLeaderLayoutWrapper>
      } />

      {/* Time tracking route removed - admin doesn't need time tracker */}

      <Route path="/time-logs" element={
        <TeamLeaderLayoutWrapper routeName="time-logs">
          <TimeLogsPage />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/employee-settings" element={
        <AdminLayoutWrapper routeName="employee-settings">
          <EmployeeSettingsPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/finance" element={
        <AdminLayoutWrapper routeName="finance">
          <FinancePage />
        </AdminLayoutWrapper>
      } />

      <Route path="/suspicious-activity" element={
        <AdminLayoutWrapper routeName="suspicious-activity">
          <SuspiciousActivityPage />
        </AdminLayoutWrapper>
      } />

      {/* AI Insights Route */}
      <Route path="/ai-insights" element={
        <TeamLeaderLayoutWrapper routeName="ai-insights">
          <AIInsightsPage />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/cost-and-usage" element={
        <CostAndUsageLayoutWrapper routeName="cost-and-usage">
          <CostAndUsagePage />
        </CostAndUsageLayoutWrapper>
      } />

      {/* Activity Issues Route */}
      <Route path="/activity-issues" element={
        <TeamLeaderLayoutWrapper routeName="activity-issues">
          <ActivityIssuesPage />
        </TeamLeaderLayoutWrapper>
      } />

      {/* Test / Live Tracking (Admin or Manager) */}
      <Route path="/test/live-tracking" element={
        <ProtectedRoute>
          <AppLayout>
            <RouteWrapper routeName="test-live-tracking">
              <RoleGuard roles={["admin", "manager"]}>
                <LiveTrackingTodayPage />
              </RoleGuard>
            </RouteWrapper>
          </AppLayout>
        </ProtectedRoute>
      } />

      {/* Redirect old employee-insights to ai-insights */}
      <Route path="/employee-insights" element={<Navigate to="/ai-insights" replace />} />
      
      {/* Redirect old url-activity to admin/url-activity */}
      <Route path="/url-activity" element={<Navigate to="/admin/url-activity" replace />} />

      <Route path="/admin" element={
        <AdminLayoutWrapper routeName="admin">
          <AdminDashboard />
        </AdminLayoutWrapper>
      } />

      <Route path="/admin/url-activity" element={
        <TeamLeaderLayoutWrapper routeName="admin-url-activity">
          <UrlActivityPage />
        </TeamLeaderLayoutWrapper>
      } />

      <Route path="/admin/screenshots" element={
        <AdminLayoutWrapper routeName="admin-screenshots">
          <ScreenshotsPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/admin/email-reports" element={
        <AdminLayoutWrapper routeName="admin-email-reports">
          <EmailReportsPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/admin/idle-logs" element={
        <AdminLayoutWrapper routeName="admin-idle-logs">
          <AdminIdleLogsPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/admin/vision-monitoring" element={
        <AdminLayoutWrapper routeName="admin-vision-monitoring">
          <VisionMonitoringPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/admin/warning-management" element={
        <AdminLayoutWrapper routeName="admin-warning-management">
          <WarningManagementPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/admin/system-health" element={
        <AdminLayoutWrapper routeName="admin-system-health">
          <SystemHealthPage />
        </AdminLayoutWrapper>
      } />

      <Route path="/reports/bulk-report-generator" element={
        <TeamLeaderLayoutWrapper routeName="reports-bulk-generator">
          <BulkReportGeneratorPage />
        </TeamLeaderLayoutWrapper>
      } />

      {/* Employee Routes - Using optimized wrapper */}
      <Route path="/employee" element={
        <EmployeeLayoutWrapper routeName="employee">
          <EmployeeDashboard />
        </EmployeeLayoutWrapper>
      } />

      <Route path="/employee/time-tracker" element={
        <EmployeeLayoutWrapper routeName="employee-time-tracker">
          <TrackerProvider>
            <EmployeeTimeTracker />
          </TrackerProvider>
        </EmployeeLayoutWrapper>
      } />

      <Route path="/employee/reports" element={
        <EmployeeLayoutWrapper routeName="employee-reports">
          <EmployeeReports />
        </EmployeeLayoutWrapper>
      } />

      {/* Team Leader Routes */}
      <Route path="/team-leader" element={
        <EmployeeLayoutWrapper routeName="team-leader-dashboard">
          <TeamLeaderDashboard />
        </EmployeeLayoutWrapper>
      } />

      <Route path="/team-leader/employee/:userId" element={
        <EmployeeLayoutWrapper routeName="team-leader-employee-detail">
          <TeamLeaderEmployeeDetail />
        </EmployeeLayoutWrapper>
      } />

      {/* Catch all route */}
      <Route path="*" element={<SafeNavigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  safeLog('🎯 App component rendering');

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <TooltipProvider>
              <div className="min-h-screen bg-background w-full">
                <AppRoutes />
                <Toaster />
              </div>
            </TooltipProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
