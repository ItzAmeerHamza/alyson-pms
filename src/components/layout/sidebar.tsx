import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import EbdaaTimeLogo from "@/components/ui/timeflow-logo";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { startOfDay, endOfDay } from "date-fns";
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  Camera,
  Settings,
  BarChart3,
  Calendar,
  Activity,
  Shield,
  UserCheck,
  Timer,
  Coffee,
  TrendingUp,
  LogOut,
  Monitor,
  Globe,
  DollarSign,
  AlertTriangle,
  User,
  ChevronRight,
  Home,
  ClipboardList,
  Eye,
  FileText,
  Target,
  PieChart,
  MousePointer,
  Keyboard,
  BookOpen,
  Briefcase,
  MessageSquareWarning,
  Users2,
  Mail,
  Brain,
  Copy,
  Building2,
  HeartPulse,
} from "lucide-react";

// Global flag to control debug logging (set to false for production)
const DEBUG_LOGGING = false;

const safeLog = (...args: any[]) => {
  if (DEBUG_LOGGING) {
    console.log(...args);
  }
};

const Sidebar = () => {
  const location = useLocation();
  const { userDetails, signOut, isSuperAdmin } = useAuth();
  const [duplicateCount, setDuplicateCount] = useState<number>(0);

  // Debug logging (controlled by flag)
  safeLog('🔍 Sidebar Debug:', {
    currentPath: location.pathname,
    userDetails: userDetails,
    userRole: userDetails?.role,
    isSuperAdmin: isSuperAdmin
  });

  // Determine user role
  const userRole = userDetails?.role || 'employee';
  const isAdmin = userRole === 'admin' || userRole === 'manager';
  const isTeamLeader = userRole === 'team_leader';
  const isEmployee = userRole === 'employee' || isTeamLeader;

  // Fetch duplicate screenshot count - only on screenshots page to avoid global performance hit
  const fetchDuplicateCount = useCallback(async () => {
    // Only fetch on screenshots page to avoid slowing down all pages
    if (!isAdmin || !location.pathname.includes('/screenshots')) return;
    
    try {
      const today = new Date();
      const { count, error } = await supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .eq('is_duplicate', true)
        .gte('captured_at', startOfDay(today).toISOString())
        .lte('captured_at', endOfDay(today).toISOString());

      if (error) {
        console.warn('Error fetching duplicate count:', error);
        return;
      }

      setDuplicateCount(count || 0);
    } catch (error) {
      console.warn('Error fetching duplicate count:', error);
    }
  }, [isAdmin, location.pathname]);

  // Fetch duplicate count only on screenshots page and periodically
  useEffect(() => {
    if (isAdmin && location.pathname.includes('/screenshots')) {
      fetchDuplicateCount();
      const interval = setInterval(fetchDuplicateCount, 300000); // Update every 5 minutes (was 1 minute)
      return () => clearInterval(interval);
    }
  }, [isAdmin, location.pathname, fetchDuplicateCount]);

  // Monitoring visibility flag (hidden by default, toggled from Testing screen)
  // const getMonitoringEnabled = (): boolean => {
  //   if (typeof window === 'undefined') return false;
  //   const value = window.localStorage.getItem('tf_monitoring_enabled');
  //   return value === '1' || value === 'true';
  // };
  // const [monitoringEnabled, setMonitoringEnabled] = useState<boolean>(getMonitoringEnabled());

  // useEffect(() => {
  //   const handleStorageChange = () => setMonitoringEnabled(getMonitoringEnabled());
  //   window.addEventListener('storage', handleStorageChange);
  //   // Custom event so same-tab changes also update immediately
  //   window.addEventListener('tf-monitoring-visibility-changed', handleStorageChange as EventListener);
  //   return () => {
  //     window.removeEventListener('storage', handleStorageChange);
  //     window.removeEventListener('tf-monitoring-visibility-changed', handleStorageChange as EventListener);
  //   };
  // }, []);

  // Employee navigation items - better organized
  const employeeNavItems = isEmployee ? [
    {
      title: "WORKSPACE",
      items: [
        {
          title: "Dashboard",
          href: "/employee",
          icon: Home,
          description: "Overview & stats"
        },
        {
          title: "Time Tracker",
          href: "/employee/time-tracker",
          icon: Timer,
          description: "Track your work time"
        }
      ]
    },
    {
      title: "REPORTS",
      items: [
        {
          title: "My Reports",
          href: "/employee/reports",
          icon: FileText,
          description: "View your activity reports"
        }
        // TODO: Add idle time page when implemented
        // {
        //   title: "Idle Time",
        //   href: "/employee/idle-time",
        //   icon: Coffee,
        //   description: "Track idle periods"
        // }
      ]
    }
  ] : [];

  // Team leader navigation items
  const teamLeaderNavItems = isTeamLeader ? [
    {
      title: "TEAM MANAGEMENT",
      items: [
        {
          title: "Team Dashboard",
          href: "/team-leader",
          icon: Users,
          description: "View your team"
        }
      ]
    }
  ] : [];

  // Admin navigation items - improved grouping and organization
  const adminNavItems = isAdmin ? [
    {
      title: "CORE MANAGEMENT",
      items: [
        {
          title: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
          description: "Main overview"
        },
        {
          title: "Users",
          href: "/users",
          icon: Users,
          description: "Manage employees"
        },
        {
          title: "Projects",
          href: "/projects",
          icon: Briefcase,
          description: "Project management"
        }
      ]
    },
    {
      title: "TIME MANAGEMENT",
      items: [
        {
          title: "Time Logs",
          href: "/time-logs",
          icon: ClipboardList,
          description: "Historical time data"
        },
        {
          title: "Calendar",
          href: "/calendar",
          icon: Calendar,
          description: "Schedule overview"
        }
      ]
    },
    {
      title: "ACTIVITY MONITORING",
      items: [
        {
          title: "Screenshots",
          href: "/screenshots",
          icon: Camera,
          description: "Screen captures"
        },
        {
          title: "Activity Issues",
          href: "/activity-issues",
          icon: AlertTriangle,
          description: "AI-detected productivity issues"
        },
        {
          title: "Application Activity",
          href: "/app-activity",
          icon: Monitor,
          description: "Application usage tracking"
        },
        {
          title: "URL Activity",
          href: "/url-activity",
          icon: Globe,
          description: "Website visit tracking"
        }
      ]
    },
    {
      title: "ANALYTICS & INSIGHTS",
      items: [
        {
          title: "AI Insights",
          href: "/ai-insights",
          icon: Brain,
          description: "OpenAI-powered workplace analytics"
        },
        {
          title: "Detailed Reports",
          href: "/reports",
          icon: BarChart3,
          description: "Comprehensive analytics"
        },
        {
          title: "Bulk Report Generator",
          href: "/reports/bulk-report-generator",
          icon: Users2,
          description: "Multi-employee reports"
        },
        {
          title: "All Employee Report",
          href: "/reports/all-employee",
          icon: FileText,
          description: "Daily hours breakdown"
        },
        {
          title: "Individual Report",
          href: "/reports/individual-employee",
          icon: User,
          description: "Detailed employee sessions"
        },
        {
          title: "Time Reports",
          href: "/reports/time-reports",
          icon: Activity,
          description: "Time analysis"
        }
      ]
    },
    {
      title: "TEST",
      items: [
        {
          title: "Live Tracking (Today)",
          href: "/test/live-tracking",
          icon: Eye,
          description: "Monitor an employee live"
        }
      ]
    },
    {
      title: "ADMINISTRATION",
      items: [
        {
          title: "System Health",
          href: "/admin/system-health",
          icon: HeartPulse,
          description: "Monitor all automated services"
        },
        {
          title: "Warning Management",
          href: "/admin/warning-management",
          icon: MessageSquareWarning,
          description: "HR warnings & alerts"
        },
        {
          title: "Email Reports",
          href: "/admin/email-reports",
          icon: Mail,
          description: "Automated notifications"
        },
        {
          title: "Employee Settings",
          href: "/employee-settings",
          icon: UserCheck,
          description: "Employee configuration"
        },
        {
          title: "Finance & Payroll",
          href: "/finance",
          icon: DollarSign,
          description: "Financial management"
        },
        // System Settings - only visible to super admins
        ...(isSuperAdmin ? [{
          title: "System Settings",
          href: "/settings",
          icon: Settings,
          description: "Global configuration"
        }] : []),

      ]
    }
  ] : [];

  // Super admin navigation - only visible to super admins
  const superAdminNavItems = isSuperAdmin ? [
    {
      title: "SUPER ADMIN",
      items: [
        {
          title: "Super Admin Dashboard",
          href: "/super-admin",
          icon: Shield,
          description: "Multi-tenant management"
        },
        {
          title: "Organizations",
          href: "/super-admin/organizations",
          icon: Building2,
          description: "Manage companies"
        }
      ]
    }
  ] : [];

  // Combine navigation items based on role
  const allNavItems = [...employeeNavItems, ...teamLeaderNavItems, ...adminNavItems, ...superAdminNavItems];

  return (
    <div className="w-72 bg-sidebar border-r border-sidebar-border h-screen overflow-y-auto fixed left-0 top-0 z-50">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center mb-3">
          <EbdaaTimeLogo size={36} />
          <div className="ml-3">
            <h1 className="text-xl font-bold text-sidebar-foreground">Alyson PM</h1>
            <p className="text-sm text-primary font-medium">
              {isAdmin ? 'Admin Console' : 'Employee Portal'}
            </p>
          </div>
        </div>
        {userDetails && (
          <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
            <p className="text-sm font-medium text-sidebar-foreground truncate" title={userDetails.full_name || ''}>
              {userDetails.full_name}
            </p>
            <p className="text-xs text-primary capitalize font-medium">
              {userDetails.role}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-4 py-6 space-y-8">
        {allNavItems.map((section) => (
          <div key={section.title}>
            <div className="flex items-center mb-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {section.title}
              </h3>
              <div className="flex-1 h-px bg-border ml-3"></div>
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                const showDuplicateBadge = item.href === '/screenshots' && duplicateCount > 0;

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    className={cn(
                      "group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 relative",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/80 hover:bg-primary/5 hover:text-sidebar-foreground"
                    )}
                  >
                    <div className="relative">
                      <Icon className={cn(
                        "mr-3 h-5 w-5 transition-colors",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-primary"
                      )} />
                      {showDuplicateBadge && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {item.title}
                        {showDuplicateBadge && (
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-4",
                              isActive 
                                ? "bg-orange-400 text-white border-orange-300" 
                                : "bg-orange-100 text-orange-700 border-orange-300"
                            )}
                          >
                            <Copy className="h-2.5 w-2.5 mr-0.5" />
                            {duplicateCount}
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <div className={cn(
                          "text-xs mt-0.5 transition-colors",
                          isActive
                            ? "text-primary/80"
                            : "text-muted-foreground group-hover:text-primary"
                        )}>
                          {item.description}
                        </div>
                      )}
                    </div>
                    {isActive && (
                      <ChevronRight className="h-4 w-4 text-primary ml-2" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout Button */}
        <div className="pt-6 border-t border-border">
          <button
            onClick={signOut}
            className="w-full flex items-center px-3 py-3 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-200 group"
          >
            <LogOut className="mr-3 h-5 w-5 text-red-500 group-hover:text-red-600" />
            <div>
              <div className="font-medium">Sign Out</div>
              <div className="text-xs text-red-500 group-hover:text-red-600">
                End session
              </div>
            </div>
          </button>
        </div>

        {/* Version Display */}
        <div className="pt-4 pb-2">
          <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Version</span>
              <Badge variant="outline" className="text-xs font-mono bg-background">
                v1.0.118
              </Badge>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};

export { Sidebar };
