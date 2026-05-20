// Grouped URL View Component - Display URLs grouped by user, domain, or category
import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, User, Globe, FolderOpen, AlertTriangle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { URLLog } from '../types';
import { extractDomain, categorizeDomain, isSocialMedia, safeFormat } from '../utils';

interface URLGroupedViewProps {
  urlLogs: URLLog[];
  groupBy: 'user' | 'domain' | 'category';
  loading?: boolean;
}

interface GroupedData {
  [key: string]: {
    logs: URLLog[];
    count: number;
    displayName: string;
    metadata?: {
      email?: string;
      hasSocialMedia?: boolean;
      uniqueDomains?: number;
    };
  };
}

export const URLGroupedView: React.FC<URLGroupedViewProps> = ({
  urlLogs,
  groupBy,
  loading = false,
}) => {
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(new Set());

  // Group URLs based on the groupBy parameter
  const groupedData: GroupedData = useMemo(() => {
    const groups: GroupedData = {};

    urlLogs.forEach((log) => {
      let groupKey: string;
      let displayName: string;
      let metadata: { email?: string; hasSocialMedia?: boolean; uniqueDomains?: number } = {};

      switch (groupBy) {
        case 'user':
          groupKey = log.user_id;
          displayName = log.users?.full_name || 'Unknown User';
          metadata.email = log.users?.email;
          break;

        case 'domain':
          groupKey = extractDomain(log.url || '');
          displayName = groupKey;
          break;

        case 'category':
          const domain = extractDomain(log.url || '');
          groupKey = categorizeDomain(domain);
          displayName = groupKey;
          break;

        default:
          groupKey = 'all';
          displayName = 'All URLs';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          logs: [],
          count: 0,
          displayName,
          metadata,
        };
      }

      groups[groupKey].logs.push(log);
      groups[groupKey].count++;
    });

    // Calculate additional metadata for each group
    Object.keys(groups).forEach((key) => {
      const group = groups[key];
      
      // Check for social media in group
      group.metadata!.hasSocialMedia = group.logs.some((log) => {
        const domain = extractDomain(log.url || '');
        return isSocialMedia(domain);
      });

      // Count unique domains (useful for user grouping)
      if (groupBy === 'user') {
        const uniqueDomains = new Set(
          group.logs.map((log) => extractDomain(log.url || ''))
        );
        group.metadata!.uniqueDomains = uniqueDomains.size;
      }
    });

    return groups;
  }, [urlLogs, groupBy]);

  // Sort groups by count (descending)
  const sortedGroupKeys = useMemo(() => {
    return Object.keys(groupedData).sort(
      (a, b) => groupedData[b].count - groupedData[a].count
    );
  }, [groupedData]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    if (openGroups.size === sortedGroupKeys.length) {
      setOpenGroups(new Set());
    } else {
      setOpenGroups(new Set(sortedGroupKeys));
    }
  };

  const getGroupIcon = () => {
    switch (groupBy) {
      case 'user':
        return <User className="h-5 w-5" />;
      case 'domain':
        return <Globe className="h-5 w-5" />;
      case 'category':
        return <FolderOpen className="h-5 w-5" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (sortedGroupKeys.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No URL activity found for the selected criteria.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with expand/collapse all */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {getGroupIcon()}
          <h3 className="text-lg font-semibold">
            Grouped by {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
          </h3>
          <Badge variant="secondary">{sortedGroupKeys.length} groups</Badge>
        </div>
        <button
          onClick={toggleAll}
          className="text-sm text-primary hover:underline"
        >
          {openGroups.size === sortedGroupKeys.length ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {/* Grouped URLs */}
      <div className="space-y-3">
        {sortedGroupKeys.map((groupKey) => {
          const group = groupedData[groupKey];
          const isOpen = openGroups.has(groupKey);

          return (
            <Card key={groupKey} className={group.metadata?.hasSocialMedia ? 'border-red-200' : ''}>
              <Collapsible open={isOpen} onOpenChange={() => toggleGroup(groupKey)}>
                <CollapsibleTrigger className="w-full">
                  <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold truncate">{group.displayName}</span>
                          {group.metadata?.hasSocialMedia && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Social Media Detected
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{group.count} URL{group.count === 1 ? '' : 's'}</span>
                          {group.metadata?.email && (
                            <span className="truncate">{group.metadata.email}</span>
                          )}
                          {group.metadata?.uniqueDomains !== undefined && (
                            <span>{group.metadata.uniqueDomains} unique domain{group.metadata.uniqueDomains === 1 ? '' : 's'}</span>
                          )}
                        </div>
                      </div>

                      <Badge variant="outline" className="ml-auto">
                        {group.count}
                      </Badge>
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 px-4">
                    <div className="space-y-2 pl-8">
                      {group.logs.map((log) => {
                        const domain = extractDomain(log.url || '');
                        const category = categorizeDomain(domain);
                        const socialMedia = isSocialMedia(domain);

                        return (
                          <div
                            key={log.id}
                            className={`p-3 border rounded-lg hover:bg-muted/50 transition-colors ${
                              socialMedia ? 'border-red-300 bg-red-50/50' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  {groupBy !== 'domain' && (
                                    <span className="font-medium text-sm truncate">
                                      {domain}
                                    </span>
                                  )}
                                  {groupBy !== 'category' && (
                                    <Badge
                                      variant={socialMedia ? 'destructive' : 'secondary'}
                                      className="text-xs"
                                    >
                                      {category}
                                    </Badge>
                                  )}
                                  {socialMedia && (
                                    <Badge variant="destructive" className="text-xs">
                                      ⚠️ Social
                                    </Badge>
                                  )}
                                </div>
                                
                                {log.title && (
                                  <p className="text-sm text-muted-foreground mb-1 truncate">
                                    {log.title}
                                  </p>
                                )}
                                
                                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                  {groupBy !== 'user' && log.users?.full_name && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {log.users.full_name}
                                    </span>
                                  )}
                                  <span>{safeFormat(log.timestamp, 'PPp')}</span>
                                  {log.browser && (
                                    <Badge variant="outline" className="text-xs">
                                      {log.browser}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      <div className="text-center text-sm text-muted-foreground pt-4">
        Showing {urlLogs.length} total URL{urlLogs.length === 1 ? '' : 's'} across {sortedGroupKeys.length} group{sortedGroupKeys.length === 1 ? '' : 's'}
      </div>
    </div>
  );
};
