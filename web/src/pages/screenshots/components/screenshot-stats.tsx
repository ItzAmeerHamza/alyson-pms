import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScreenshotStats } from '../types';

interface ScreenshotStatsProps {
  stats: ScreenshotStats;
}

export const ScreenshotStatsComponent: React.FC<ScreenshotStatsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-8 lg:grid-cols-9 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Screenshots</div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.avgActivity}%</div>
            <div className="text-sm text-muted-foreground">Avg Activity</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.activePeriods}</div>
            <div className="text-sm text-muted-foreground">Active Periods</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.idlePeriods}</div>
            <div className="text-sm text-muted-foreground">Idle Periods</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.productiveShots}</div>
            <div className="text-sm text-muted-foreground">Productive</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.distractedShots}</div>
            <div className="text-sm text-muted-foreground">Distracted</div>
          </div>
        </CardContent>
      </Card>

      {/* New: Sessions and AI analysis counts */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-600">{stats.totalSessions}</div>
            <div className="text-sm text-muted-foreground">Total Sessions</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600">{stats.aiCompleted}</div>
            <div className="text-sm text-muted-foreground">AI Completed</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-600">{stats.aiPending}</div>
            <div className="text-sm text-muted-foreground">AI Pending</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-teal-600">
              {stats.totalHoursWorked === 0
                ? '00:00'
                : `${Math.floor(stats.totalHoursWorked / 60)}:${String(stats.totalHoursWorked % 60).padStart(2, '0')}`}
            </div>
            <div className="text-sm text-muted-foreground">Total Hours</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 