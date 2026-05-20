// URL Session Card Component - Expandable session view with social media warnings
import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ChevronDown, 
  ChevronUp, 
  User, 
  Clock, 
  Globe,
  AlertTriangle,
  Target,
  Activity
} from 'lucide-react';
import { URLSession } from '../types';
import { formatDuration, safeFormat, extractDomain, getProductivityLevel } from '../utils';
import { CATEGORY_COLORS } from '../constants';

interface URLSessionCardProps {
  session: URLSession;
  isExpanded: boolean;
  onToggle: () => void;
}

export const URLSessionCard: React.FC<URLSessionCardProps> = ({
  session,
  isExpanded,
  onToggle,
}) => {
  const productivityLevel = getProductivityLevel(session.productivityScore);
  const hasSocialMediaWarning = session.hasSocialMedia && session.socialMediaUrls.length > 2;

  return (
    <Card className={`${hasSocialMediaWarning ? 'border-red-300 dark:border-red-800' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {/* User Info */}
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{session.userName}</span>
            </div>

            {/* Time Slot */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{session.timeSlot}</span>
            </div>

            {/* Sites Count */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span>{session.urls.length} visits ({session.uniqueDomains} sites)</span>
            </div>

            {/* Duration */}
            <div className="text-sm text-muted-foreground">
              {formatDuration(session.totalDuration)}
            </div>
          </div>

          {/* Toggle Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Session Summary Row */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {/* Social Media Warning */}
          {session.hasSocialMedia && (
            <Badge 
              variant="destructive" 
              className="flex items-center gap-1"
            >
              <AlertTriangle className="h-3 w-3" />
              {session.socialMediaUrls.length} Social Media {session.socialMediaUrls.length === 1 ? 'Site' : 'Sites'}
            </Badge>
          )}

          {/* Productivity Score */}
          <div className="flex items-center gap-2">
            <Target className={`h-4 w-4 ${productivityLevel.color}`} />
            <span className={`text-sm font-medium ${productivityLevel.color}`}>
              Productivity: {session.productivityScore}%
            </span>
          </div>

          {/* Category Badges */}
          {session.categoryBreakdown.slice(0, 3).map((cat) => (
            <Badge 
              key={cat.category} 
              variant="secondary"
              style={{ 
                backgroundColor: `${CATEGORY_COLORS[cat.category as keyof typeof CATEGORY_COLORS]}20`,
                color: CATEGORY_COLORS[cat.category as keyof typeof CATEGORY_COLORS]
              }}
            >
              {cat.category} ({cat.count})
            </Badge>
          ))}
        </div>
      </CardHeader>

      {/* Expanded Content */}
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="border-t pt-4 space-y-4">
            {/* Productivity Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Session Productivity</span>
                <span className={`font-medium ${productivityLevel.color}`}>
                  {productivityLevel.label}
                </span>
              </div>
              <Progress value={session.productivityScore} className="h-2" />
            </div>

            {/* Category Breakdown */}
            <div>
              <h4 className="text-sm font-medium mb-2">Categories</h4>
              <div className="flex flex-wrap gap-2">
                {session.categoryBreakdown.map((cat) => (
                  <div
                    key={cat.category}
                    className="flex items-center gap-2 px-3 py-1 rounded-md text-sm"
                    style={{ 
                      backgroundColor: `${CATEGORY_COLORS[cat.category as keyof typeof CATEGORY_COLORS]}20`,
                    }}
                  >
                    <span className="font-medium" style={{ 
                      color: CATEGORY_COLORS[cat.category as keyof typeof CATEGORY_COLORS]
                    }}>
                      {cat.category}
                    </span>
                    <span className="text-muted-foreground">
                      {cat.count} ({formatDuration(cat.duration)})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Social Media URLs (if any) - Highlighted */}
            {session.socialMediaUrls.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <h4 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Social Media Activity ({session.socialMediaUrls.length})
                </h4>
                <div className="space-y-2">
                  {session.socialMediaUrls.map((url) => (
                    <div key={url.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium text-red-700 dark:text-red-300">
                          {extractDomain(url.url || url.site_url || '')}
                        </div>
                        {url.title && (
                          <div className="text-xs text-muted-foreground truncate max-w-md">
                            {url.title}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {safeFormat(url.started_at || url.timestamp, 'HH:mm:ss')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All URLs List */}
            <div>
              <h4 className="text-sm font-medium mb-2">All URLs ({session.urls.length})</h4>
              <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
                {session.urls.map((url) => {
                  const domain = extractDomain(url.url || url.site_url || '');
                  const isSocialMedia = session.socialMediaUrls.some(sm => sm.id === url.id);

                  return (
                    <div 
                      key={url.id} 
                      className={`flex items-center justify-between p-2 rounded text-sm hover:bg-muted/50 ${
                        isSocialMedia ? 'bg-red-50 dark:bg-red-950/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isSocialMedia && (
                          <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{domain}</div>
                          {url.title && (
                            <div className="text-xs text-muted-foreground truncate">
                              {url.title}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {url.browser && (
                          <span className="px-2 py-0.5 bg-muted rounded">
                            {url.browser}
                          </span>
                        )}
                        <span>{safeFormat(url.started_at || url.timestamp, 'HH:mm')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

interface URLSessionsViewProps {
  sessions: URLSession[];
  loading: boolean;
}

export const URLSessionsView: React.FC<URLSessionsViewProps> = ({ sessions, loading }) => {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSessions(new Set(sessions.map(s => s.sessionId)));
  };

  const collapseAll = () => {
    setExpandedSessions(new Set());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No sessions found for the selected criteria.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} found
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-3">
        {sessions.map((session) => (
          <URLSessionCard
            key={session.sessionId}
            session={session}
            isExpanded={expandedSessions.has(session.sessionId)}
            onToggle={() => toggleSession(session.sessionId)}
          />
        ))}
      </div>
    </div>
  );
};

