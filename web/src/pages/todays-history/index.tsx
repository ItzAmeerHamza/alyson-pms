import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Coffee, Camera, Monitor, Mouse, Keyboard } from 'lucide-react';

export default function TodaysHistoryPage() {
  return (
    <div className="p-6 space-y-6" data-testid="todays-history-content">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Today's History</h1>
        <p className="text-gray-600">Daily overview and timeline of your activity</p>
      </div>

      {/* Daily Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium" data-testid="daily-active-time">Active Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">6h 45m</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium" data-testid="daily-idle-time">Idle Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1h 15m</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium" data-testid="daily-screenshots-count">Screenshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium" data-testid="daily-apps-used">Apps Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium" data-testid="daily-clicks">Mouse Clicks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,247</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium" data-testid="daily-keystrokes">Keystrokes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8,932</div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
          <CardDescription>Visual timeline of your day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4" data-testid="activity-timeline">
            <div className="flex items-center space-x-4 p-4 bg-green-50 border border-green-200 rounded-lg" data-testid="timeline-segment-active-1">
              <Clock className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <div className="font-medium">9:00 AM - 10:30 AM</div>
                <div className="text-sm text-muted-foreground">Active work session</div>
              </div>
              <Badge className="bg-green-100 text-green-800">Active</Badge>
            </div>
            
            <div className="flex items-center space-x-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg" data-testid="timeline-segment-idle-1">
              <Coffee className="h-5 w-5 text-yellow-600" />
              <div className="flex-1">
                <div className="font-medium">10:30 AM - 10:45 AM</div>
                <div className="text-sm text-muted-foreground">Break time</div>
              </div>
              <Badge className="bg-yellow-100 text-yellow-800">Idle</Badge>
            </div>
            
            <div className="flex items-center space-x-4 p-4 bg-green-50 border border-green-200 rounded-lg" data-testid="timeline-segment-active-2">
              <Clock className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <div className="font-medium">10:45 AM - 12:00 PM</div>
                <div className="text-sm text-muted-foreground">Focused work session</div>
              </div>
              <Badge className="bg-green-100 text-green-800">Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>Detailed log of all events today</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="activity-log-table">
            <div className="flex items-center justify-between p-3 border rounded-lg" data-testid="activity-log-row-1">
              <div className="flex items-center space-x-3">
                <Camera className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="font-medium">Screenshot captured</div>
                  <div className="text-sm text-muted-foreground">2:15 PM</div>
                </div>
              </div>
              <Badge variant="outline">Screenshot</Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-lg" data-testid="activity-log-row-2">
              <div className="flex items-center space-x-3">
                <Monitor className="h-4 w-4 text-green-500" />
                <div>
                  <div className="font-medium">App focus: VS Code</div>
                  <div className="text-sm text-muted-foreground">2:14 PM</div>
                </div>
              </div>
              <Badge variant="outline">App</Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-lg" data-testid="activity-log-row-3">
              <div className="flex items-center space-x-3">
                <Mouse className="h-4 w-4 text-purple-500" />
                <div>
                  <div className="font-medium">High activity period</div>
                  <div className="text-sm text-muted-foreground">2:10 PM - 2:15 PM</div>
                </div>
              </div>
              <Badge variant="outline">Activity</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
