// URL Stats Cards Component
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  Clock, 
  Globe, 
  TrendingUp, 
  User, 
  Chrome,
  AlertTriangle,
  Target,
  TrendingDown
} from 'lucide-react';
import { URLStats } from '../types';
import { formatDuration, getProductivityLevel } from '../utils';

interface URLStatsCardsProps {
  stats: URLStats;
  loading: boolean;
}

export const URLStatsCards: React.FC<URLStatsCardsProps> = ({ stats, loading }) => {
  const productivityLevel = getProductivityLevel(stats.productivityScore);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-muted rounded w-20"></div>
              <div className="h-5 w-5 bg-muted rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
      {/* Total Time */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Time</CardTitle>
          <Clock className="h-5 w-5 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {formatDuration(stats.totalTime)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Time spent browsing
          </p>
        </CardContent>
      </Card>

      {/* Unique Sites */}
      <Card className="border-l-4 border-l-green-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Unique Sites</CardTitle>
          <Globe className="h-5 w-5 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{stats.totalSites}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Different websites
          </p>
        </CardContent>
      </Card>

      {/* Total Visits */}
      <Card className="border-l-4 border-l-purple-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
          <TrendingUp className="h-5 w-5 text-purple-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600">{stats.totalVisits}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Website sessions
          </p>
        </CardContent>
      </Card>

      {/* Active Users */}
      <Card className="border-l-4 border-l-orange-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Users</CardTitle>
          <User className="h-5 w-5 text-orange-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">{stats.activeUsers}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Users with activity
          </p>
        </CardContent>
      </Card>

      {/* Browsers Used */}
      <Card className="border-l-4 border-l-pink-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Browsers Used</CardTitle>
          <Chrome className="h-5 w-5 text-pink-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-pink-600">{stats.browsersUsed}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Different browsers
          </p>
        </CardContent>
      </Card>

      {/* Social Media Alert - NEW */}
      <Card className={`border-l-4 ${
        stats.socialMediaPercentage > 20 
          ? 'border-l-red-500 bg-red-50 dark:bg-red-950/20' 
          : 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
      }`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1">
            <AlertTriangle className={`h-4 w-4 ${
              stats.socialMediaPercentage > 20 ? 'text-red-600' : 'text-yellow-600'
            }`} />
            Social Media
          </CardTitle>
          {stats.socialMediaPercentage > 20 ? (
            <TrendingUp className="h-5 w-5 text-red-600" />
          ) : (
            <TrendingDown className="h-5 w-5 text-yellow-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            stats.socialMediaPercentage > 20 ? 'text-red-600' : 'text-yellow-600'
          }`}>
            {stats.socialMediaVisits}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.socialMediaPercentage.toFixed(1)}% of total visits
          </p>
          {stats.socialMediaPercentage > 20 && (
            <div className="mt-2 text-xs text-red-600 font-medium">
              ⚠️ High social media usage
            </div>
          )}
        </CardContent>
      </Card>

      {/* Productivity Score - NEW */}
      <Card className={`border-l-4 ${
        stats.productivityScore >= 60
          ? 'border-l-green-500 bg-green-50 dark:bg-green-950/20'
          : stats.productivityScore >= 40
          ? 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
          : 'border-l-red-500 bg-red-50 dark:bg-red-950/20'
      }`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Productivity</CardTitle>
          <Target className={`h-5 w-5 ${productivityLevel.color}`} />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${productivityLevel.color}`}>
            {stats.productivityScore}%
          </div>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            {productivityLevel.label}
          </p>
          <Progress 
            value={stats.productivityScore} 
            className="h-2"
          />
          <div className="mt-2 text-xs text-muted-foreground">
            Work sites: {stats.socialMediaVsWork.workSites} | 
            Social: {stats.socialMediaVsWork.socialMedia}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

