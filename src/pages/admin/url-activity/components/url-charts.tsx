// URL Charts Component - All visualizations in one place
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import { AlertTriangle, TrendingUp, Users, Chrome, Clock, Target, Activity } from 'lucide-react';
import { URLStats } from '../types';
import { formatDuration } from '../utils';
import { CHART_COLORS, CATEGORY_COLORS } from '../constants';

interface URLChartsProps {
  stats: URLStats;
  loading: boolean;
}

export const URLCharts: React.FC<URLChartsProps> = ({ stats, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted rounded w-32"></div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timeline Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            URL Activity Timeline
          </CardTitle>
          <CardDescription>Hourly URL visits throughout the day with social media highlights</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stats.timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 12 }}
              />
              <YAxis />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-3">
                        <p className="font-medium mb-2">{payload[0].payload.time}</p>
                        {payload.map((entry: any, index: number) => (
                          <p key={index} className="text-sm" style={{ color: entry.color }}>
                            {entry.name}: {entry.value}
                          </p>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="total" 
                stackId="1"
                stroke={CHART_COLORS.primary} 
                fill={CHART_COLORS.primary}
                fillOpacity={0.6}
                name="Total URLs"
              />
              <Area 
                type="monotone" 
                dataKey="work" 
                stackId="2"
                stroke={CHART_COLORS.green} 
                fill={CHART_COLORS.green}
                fillOpacity={0.6}
                name="Work Sites"
              />
              <Area 
                type="monotone" 
                dataKey="socialMedia" 
                stackId="2"
                stroke={CHART_COLORS.red} 
                fill={CHART_COLORS.red}
                fillOpacity={0.6}
                name="Social Media"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Comparison Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Activity Comparison
            </CardTitle>
            <CardDescription>Work vs Social Media breakdown by user</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.userActivity.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="user" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 11 }}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    if (name === 'Work Sites') return [value, 'Work'];
                    if (name === 'Social Media') return [value, 'Social'];
                    if (name === 'Other Sites') return [value, 'Other'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar dataKey="workSites" stackId="a" fill={CHART_COLORS.green} name="Work Sites" />
                <Bar dataKey="socialMediaSites" stackId="a" fill={CHART_COLORS.red} name="Social Media" />
                <Bar dataKey="otherSites" stackId="a" fill={CHART_COLORS.gray} name="Other Sites" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Productivity Score Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Site Category Distribution
            </CardTitle>
            <CardDescription>Time spent across different categories</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, percentage }) => 
                    percentage > 5 ? `${category} (${percentage.toFixed(0)}%)` : ''
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="time"
                >
                  {stats.categoryBreakdown.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={CATEGORY_COLORS[entry.category as keyof typeof CATEGORY_COLORS] || CHART_COLORS.gray} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [formatDuration(value), 'Time Spent']}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Sites with Social Media Highlight */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Websites
            </CardTitle>
            <CardDescription>Most visited sites</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart 
                data={stats.topSites.slice(0, 8)}
                layout="horizontal"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis 
                  dataKey="site" 
                  type="category"
                  width={100}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-background border rounded-lg shadow-lg p-3">
                          <p className="font-medium flex items-center gap-1">
                            {data.isSocialMedia && (
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            )}
                            {data.site}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Visits: {data.visits}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Category: {data.category}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="visits" 
                  fill={CHART_COLORS.primary}
                  radius={[0, 4, 4, 0]}
                >
                  {stats.topSites.slice(0, 8).map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`}
                      fill={entry.isSocialMedia ? CHART_COLORS.red : CHART_COLORS.primary}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Browser Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Chrome className="h-5 w-5" />
              Browser Usage
            </CardTitle>
            <CardDescription>Category breakdown by browser</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.browserBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="browser" 
                  tick={{ fontSize: 11 }}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="categories.work" stackId="a" fill={CHART_COLORS.green} name="Work" />
                <Bar dataKey="categories.socialMedia" stackId="a" fill={CHART_COLORS.red} name="Social" />
                <Bar dataKey="categories.neutral" stackId="a" fill={CHART_COLORS.blue} name="Neutral" />
                <Bar dataKey="categories.distracting" stackId="a" fill={CHART_COLORS.warning} name="Distracting" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Session Duration Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Session Duration
            </CardTitle>
            <CardDescription>Distribution of session lengths</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.sessionDurationDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="range" 
                  tick={{ fontSize: 11 }}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    if (name === 'count') return [value, 'Sessions'];
                    return [value, name];
                  }}
                />
                <Bar 
                  dataKey="count" 
                  fill={CHART_COLORS.purple}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Work vs Distractions Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Productivity Analysis
          </CardTitle>
          <CardDescription>Work sites vs distracting sites comparison</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {stats.socialMediaVsWork.workSites}
              </div>
              <div className="text-sm text-muted-foreground">Work Sites</div>
            </div>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {stats.socialMediaVsWork.neutral}
              </div>
              <div className="text-sm text-muted-foreground">Neutral Sites</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {stats.socialMediaVsWork.distracting}
              </div>
              <div className="text-sm text-muted-foreground">Distracting Sites</div>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {stats.socialMediaVsWork.socialMedia}
              </div>
              <div className="text-sm text-muted-foreground">Social Media</div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <BarChart 
              data={[
                {
                  name: 'Site Distribution',
                  Work: stats.socialMediaVsWork.workSites,
                  Neutral: stats.socialMediaVsWork.neutral,
                  Distracting: stats.socialMediaVsWork.distracting,
                  'Social Media': stats.socialMediaVsWork.socialMedia,
                }
              ]}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" />
              <Tooltip />
              <Legend />
              <Bar dataKey="Work" fill={CHART_COLORS.green} />
              <Bar dataKey="Neutral" fill={CHART_COLORS.blue} />
              <Bar dataKey="Distracting" fill={CHART_COLORS.warning} />
              <Bar dataKey="Social Media" fill={CHART_COLORS.red} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

