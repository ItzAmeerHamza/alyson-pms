import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/auth-provider";
import { 
  Settings as SettingsIcon, 
  Camera, 
  Clock, 
  Shield, 
  Bell, 
  Database,
  Monitor,
  Save,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AppSettings {
  screenshot_interval: number;
  blur_screenshots: boolean;
  idle_threshold: number;
  track_urls: boolean;
  track_applications: boolean;
  notification_frequency: number;
  auto_start_tracking: boolean;
  require_task_selection: boolean;
  max_idle_time: number;
  screenshot_quality: number;
  working_hours_start: string;
  working_hours_end: string;
  timezone: string;
  company_name: string;
  admin_email: string;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    screenshot_interval: 300, // 5 minutes
    blur_screenshots: false,
    idle_threshold: 300, // 5 minutes
    track_urls: true,
    track_applications: true,
    notification_frequency: 3600, // 1 hour
    auto_start_tracking: false,
    require_task_selection: true,
    max_idle_time: 900, // 15 minutes
    screenshot_quality: 80,
    working_hours_start: "09:00",
    working_hours_end: "17:00",
    timezone: "UTC",
    company_name: "Your Company",
    admin_email: "admin@company.com"
  });

  const { userDetails } = useAuth();
  const { toast } = useToast();
  const isAdmin = userDetails?.role === 'admin';
  const appSettingsDbEnabled = import.meta.env.VITE_APP_SETTINGS_DB_ENABLED === '1';

  useEffect(() => {
    loadSettings();
  }, []);

  const isMissingSettingsTable = (error: any) => {
    if (!error) return false;
    const message = `${error.message || ''}`.toLowerCase();
    return message.includes('app_settings') && (message.includes('does not exist') || message.includes('schema cache'));
  };

  const loadSettings = async () => {
    try {
      setLoading(true);

      if (!appSettingsDbEnabled || localStorage.getItem('app_settings_db_disabled') === '1') {
        const savedSettings = localStorage.getItem('app_settings');
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings);
          setSettings({
            screenshot_interval: parsedSettings.screenshot_interval || 300,
            blur_screenshots: parsedSettings.blur_screenshots || false,
            idle_threshold: parsedSettings.idle_threshold || 300,
            track_urls: parsedSettings.track_urls ?? true,
            track_applications: parsedSettings.track_applications ?? true,
            notification_frequency: parsedSettings.notification_frequency || 3600,
            auto_start_tracking: parsedSettings.auto_start_tracking || false,
            require_task_selection: parsedSettings.require_task_selection ?? true,
            max_idle_time: parsedSettings.max_idle_time || 900,
            screenshot_quality: parsedSettings.screenshot_quality || 80,
            working_hours_start: parsedSettings.working_hours_start || "09:00",
            working_hours_end: parsedSettings.working_hours_end || "17:00",
            timezone: parsedSettings.timezone || "UTC",
            company_name: parsedSettings.company_name || "Your Company",
            admin_email: parsedSettings.admin_email || "admin@company.com"
          });
        }
        return;
      }
      
      // Load settings from Supabase app_settings table
      const { data, error } = await (supabase
        .from('app_settings' as any)
        .select('value')
        .eq('key', 'global')
        .single()) as any;
      
      if (error) {
        if (isMissingSettingsTable(error)) {
          localStorage.setItem('app_settings_db_disabled', '1');
        }
        // If table doesn't exist yet or no data, try localStorage as fallback
        console.warn('Could not load settings from database, trying localStorage fallback:', error.message);
        const savedSettings = localStorage.getItem('app_settings');
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings);
          setSettings({
            screenshot_interval: parsedSettings.screenshot_interval || 300,
            blur_screenshots: parsedSettings.blur_screenshots || false,
            idle_threshold: parsedSettings.idle_threshold || 300,
            track_urls: parsedSettings.track_urls ?? true,
            track_applications: parsedSettings.track_applications ?? true,
            notification_frequency: parsedSettings.notification_frequency || 3600,
            auto_start_tracking: parsedSettings.auto_start_tracking || false,
            require_task_selection: parsedSettings.require_task_selection ?? true,
            max_idle_time: parsedSettings.max_idle_time || 900,
            screenshot_quality: parsedSettings.screenshot_quality || 80,
            working_hours_start: parsedSettings.working_hours_start || "09:00",
            working_hours_end: parsedSettings.working_hours_end || "17:00",
            timezone: parsedSettings.timezone || "UTC",
            company_name: parsedSettings.company_name || "Your Company",
            admin_email: parsedSettings.admin_email || "admin@company.com"
          });
        }
        return;
      }

      if (data?.value) {
        const dbSettings = data.value as Record<string, any>;
        setSettings({
          screenshot_interval: dbSettings.screenshot_interval || 300,
          blur_screenshots: dbSettings.blur_screenshots || false,
          idle_threshold: dbSettings.idle_threshold || 300,
          track_urls: dbSettings.track_urls ?? true,
          track_applications: dbSettings.track_applications ?? true,
          notification_frequency: dbSettings.notification_frequency || 3600,
          auto_start_tracking: dbSettings.auto_start_tracking || false,
          require_task_selection: dbSettings.require_task_selection ?? true,
          max_idle_time: dbSettings.max_idle_time || 900,
          screenshot_quality: dbSettings.screenshot_quality || 80,
          working_hours_start: dbSettings.working_hours_start || "09:00",
          working_hours_end: dbSettings.working_hours_end || "17:00",
          timezone: dbSettings.timezone || "UTC",
          company_name: dbSettings.company_name || "Your Company",
          admin_email: dbSettings.admin_email || "admin@company.com"
        });
      }

    } catch (error: any) {
      console.error('Error loading settings:', error);
      toast({
        title: "Error loading settings",
        description: "Using default settings. " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!isAdmin) {
      toast({
        title: "Access denied",
        description: "Only administrators can modify settings.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      if (!appSettingsDbEnabled || localStorage.getItem('app_settings_db_disabled') === '1') {
        localStorage.setItem('app_settings', JSON.stringify({
          ...settings,
          updated_at: new Date().toISOString()
        }));
        toast({
          title: "Settings saved locally",
          description: "Database settings table is unavailable. Saved to this browser.",
        });
        return;
      }

      // Save settings to Supabase app_settings table
      const { error } = await (supabase
        .from('app_settings' as any)
        .upsert({
          key: 'global',
          value: settings as any,
          description: 'Global application settings for time tracking configuration',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        }) as any);

      if (error) {
        if (isMissingSettingsTable(error)) {
          localStorage.setItem('app_settings_db_disabled', '1');
        }
        // Fallback to localStorage if database fails
        console.warn('Could not save to database, saving to localStorage:', error.message);
        localStorage.setItem('app_settings', JSON.stringify({
          ...settings,
          updated_at: new Date().toISOString()
        }));
        
        toast({
          title: "Settings saved locally",
          description: "Settings saved to local storage. Database sync will retry later.",
        });
        return;
      }

      // Also update localStorage as backup
      localStorage.setItem('app_settings', JSON.stringify({
        ...settings,
        updated_at: new Date().toISOString()
      }));

      toast({
        title: "Settings saved",
        description: "Application settings have been updated successfully.",
      });

    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings({
      screenshot_interval: 300,
      blur_screenshots: false,
      idle_threshold: 300,
      track_urls: true,
      track_applications: true,
      notification_frequency: 3600,
      auto_start_tracking: false,
      require_task_selection: true,
      max_idle_time: 900,
      screenshot_quality: 80,
      working_hours_start: "09:00",
      working_hours_end: "17:00",
      timezone: "UTC",
      company_name: "Your Company",
      admin_email: "admin@company.com"
    });

    toast({
      title: "Settings reset",
      description: "All settings have been reset to default values.",
    });
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Settings" subtitle="System configuration" />
        <div className="text-center py-8">Loading settings...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Settings" subtitle="System configuration" />
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
              <p className="text-muted-foreground">
                Only administrators can access system settings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="System configuration and preferences" />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={resetToDefaults}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        <Button onClick={saveSettings} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <Tabs defaultValue="tracking" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        {/* Tracking Settings */}
        <TabsContent value="tracking" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Time Tracking Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="idle-threshold">Idle Threshold</Label>
                  <Select 
                    value={settings.idle_threshold.toString()} 
                    onValueChange={(value) => setSettings({...settings, idle_threshold: parseInt(value)})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="180">3 minutes</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                      <SelectItem value="600">10 minutes</SelectItem>
                      <SelectItem value="900">15 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Time before user is considered idle
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-idle">Max Idle Time</Label>
                  <Select 
                    value={settings.max_idle_time.toString()} 
                    onValueChange={(value) => setSettings({...settings, max_idle_time: parseInt(value)})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="600">10 minutes</SelectItem>
                      <SelectItem value="900">15 minutes</SelectItem>
                      <SelectItem value="1800">30 minutes</SelectItem>
                      <SelectItem value="3600">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Maximum idle time before auto-pause
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Track Applications</Label>
                    <p className="text-sm text-muted-foreground">
                      Monitor which applications users are using
                    </p>
                  </div>
                  <Switch
                    checked={settings.track_applications}
                    onCheckedChange={(checked) => setSettings({...settings, track_applications: checked})}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Track URLs</Label>
                    <p className="text-sm text-muted-foreground">
                      Monitor browser URLs and website activity
                    </p>
                  </div>
                  <Switch
                    checked={settings.track_urls}
                    onCheckedChange={(checked) => setSettings({...settings, track_urls: checked})}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-start Tracking</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically start tracking when desktop app opens
                    </p>
                  </div>
                  <Switch
                    checked={settings.auto_start_tracking}
                    onCheckedChange={(checked) => setSettings({...settings, auto_start_tracking: checked})}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Task Selection</Label>
                    <p className="text-sm text-muted-foreground">
                      Force users to select a task before starting tracking
                    </p>
                  </div>
                  <Switch
                    checked={settings.require_task_selection}
                    onCheckedChange={(checked) => setSettings({...settings, require_task_selection: checked})}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Screenshot Settings */}
        <TabsContent value="screenshots" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Screenshot Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="screenshot-interval">Screenshot Interval</Label>
                  <Select 
                    value={settings.screenshot_interval.toString()} 
                    onValueChange={(value) => setSettings({...settings, screenshot_interval: parseInt(value)})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">1 minute</SelectItem>
                      <SelectItem value="180">3 minutes</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                      <SelectItem value="600">10 minutes</SelectItem>
                      <SelectItem value="900">15 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    How often to capture screenshots
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="screenshot-quality">Screenshot Quality</Label>
                  <Select 
                    value={settings.screenshot_quality.toString()} 
                    onValueChange={(value) => setSettings({...settings, screenshot_quality: parseInt(value)})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">Low (60%)</SelectItem>
                      <SelectItem value="80">Medium (80%)</SelectItem>
                      <SelectItem value="90">High (90%)</SelectItem>
                      <SelectItem value="100">Maximum (100%)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Image quality vs file size balance
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Blur Screenshots</Label>
                  <p className="text-sm text-muted-foreground">
                    Apply blur effect to screenshots for privacy
                  </p>
                </div>
                <Switch
                  checked={settings.blur_screenshots}
                  onCheckedChange={(checked) => setSettings({...settings, blur_screenshots: checked})}
                />
              </div>

              {settings.blur_screenshots && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-800">Privacy Mode Enabled</h4>
                      <p className="text-sm text-yellow-700">
                        Screenshots will be blurred to protect sensitive information. This may reduce the effectiveness of activity monitoring.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="notification-frequency">Notification Frequency</Label>
                <Select 
                  value={settings.notification_frequency.toString()} 
                  onValueChange={(value) => setSettings({...settings, notification_frequency: parseInt(value)})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1800">30 minutes</SelectItem>
                    <SelectItem value="3600">1 hour</SelectItem>
                    <SelectItem value="7200">2 hours</SelectItem>
                    <SelectItem value="14400">4 hours</SelectItem>
                    <SelectItem value="0">Disabled</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  How often to check for and send notifications
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                General Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name</Label>
                  <Input
                    id="company-name"
                    value={settings.company_name}
                    onChange={(e) => setSettings({...settings, company_name: e.target.value})}
                    placeholder="Your Company Name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-email">Admin Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={settings.admin_email}
                    onChange={(e) => setSettings({...settings, admin_email: e.target.value})}
                    placeholder="admin@company.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="working-hours-start">Working Hours Start</Label>
                  <Input
                    id="working-hours-start"
                    type="time"
                    value={settings.working_hours_start}
                    onChange={(e) => setSettings({...settings, working_hours_start: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="working-hours-end">Working Hours End</Label>
                  <Input
                    id="working-hours-end"
                    type="time"
                    value={settings.working_hours_end}
                    onChange={(e) => setSettings({...settings, working_hours_end: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select 
                    value={settings.timezone} 
                    onValueChange={(value) => setSettings({...settings, timezone: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Europe/Paris">Paris</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-sm font-medium">Current Settings</Label>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>Screenshot Interval: {formatTime(settings.screenshot_interval)}</p>
                    <p>Idle Threshold: {formatTime(settings.idle_threshold)}</p>
                    <p>Max Idle Time: {formatTime(settings.max_idle_time)}</p>
                    <p>Screenshot Quality: {settings.screenshot_quality}%</p>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Feature Status</Label>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>URL Tracking: {settings.track_urls ? 'Enabled' : 'Disabled'}</p>
                    <p>App Tracking: {settings.track_applications ? 'Enabled' : 'Disabled'}</p>
                    <p>Screenshot Blur: {settings.blur_screenshots ? 'Enabled' : 'Disabled'}</p>
                    <p>Auto-start: {settings.auto_start_tracking ? 'Enabled' : 'Disabled'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
