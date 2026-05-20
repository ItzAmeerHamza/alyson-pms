// Issue List Component with Expandable Cards
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  TrendingDown, 
  Smartphone, 
  Globe, 
  Play, 
  Gamepad2, 
  Clock,
  User,
  Eye,
  Send,
  ExternalLink,
  AlertCircle,
  ImageIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { DetectedIssue, IssueType } from '../types';
import { ISSUE_CATEGORIES, SEVERITY_COLORS } from '../constants';
import { getRecommendation, getActionUrgency } from '../utils/ai-recommendations';
import { ScreenshotModal, ScreenshotForModal } from './screenshot-modal';

interface IssueListProps {
  issues: DetectedIssue[];
  loading?: boolean;
}

// Map issue types to icons
const ISSUE_ICONS: Record<IssueType, React.ElementType> = {
  duplicate_screenshots: Copy,
  low_activity: TrendingDown,
  social_media_app: Smartphone,
  social_media_url: Globe,
  entertainment: Play,
  gaming: Gamepad2,
  excessive_idle: Clock,
};

interface IssueCardProps {
  issue: DetectedIssue;
}

function IssueCard({ issue }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIndex, setModalIndex] = useState(0);
  const navigate = useNavigate();
  
  const category = ISSUE_CATEGORIES[issue.type];
  const severityColors = SEVERITY_COLORS[issue.severity];
  const Icon = ISSUE_ICONS[issue.type];

  // Convert screenshots to modal format
  const modalScreenshots: ScreenshotForModal[] = (issue.screenshots || []).map(s => ({
    id: s.id,
    imageUrl: s.imageUrl,
    capturedAt: s.capturedAt,
    activityPercent: s.activityPercent,
    appName: s.appName,
  }));

  const handleScreenshotClick = (index: number) => {
    setModalIndex(index);
    setModalOpen(true);
  };

  return (
    <Card className={`overflow-hidden transition-all ${category.borderColor} ${expanded ? category.bgColor : 'hover:bg-gray-50'}`}>
      <CardHeader 
        className="cursor-pointer py-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${category.bgColor}`}>
              <Icon className={`h-5 w-5 ${category.color}`} />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {category.label}
                <Badge className={`${severityColors.bg} ${severityColors.text} ${severityColors.border} text-xs`}>
                  {issue.severity}
                </Badge>
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <User className="h-3 w-3" />
                <span className="font-medium">{issue.userName}</span>
                <span className="text-gray-400">•</span>
                <span>{issue.count} instance{issue.count !== 1 ? 's' : ''}</span>
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-muted-foreground">
              <div>Detected</div>
              <div className="font-medium">{format(new Date(issue.detectedAt), 'MMM dd, HH:mm')}</div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0 pb-4 space-y-4">
          {/* Issue Description */}
          <div className={`p-3 rounded-lg ${category.bgColor} border ${category.borderColor}`}>
            <p className={`text-sm ${category.color}`}>
              {issue.details.description}
            </p>
          </div>

          {/* Additional Details */}
          {issue.details.appNames && issue.details.appNames.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Applications Detected:</p>
              <div className="flex flex-wrap gap-1">
                {issue.details.appNames.map((app, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {app}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {issue.details.domains && issue.details.domains.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Websites Visited:</p>
              <div className="flex flex-wrap gap-1">
                {issue.details.domains.map((domain, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    <Globe className="h-3 w-3 mr-1" />
                    {domain}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {issue.details.duration && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Total time: <strong>{Math.round(issue.details.duration / 60)} minutes</strong></span>
            </div>
          )}

          {issue.details.activityPercent !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <span>Average activity: <strong>{Math.round(issue.details.activityPercent)}%</strong></span>
            </div>
          )}

          {/* Screenshot Previews - Clickable for full view */}
          {issue.screenshots && issue.screenshots.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  Proof Screenshots ({issue.screenshots.length})
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-6 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleScreenshotClick(0);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Details
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {issue.screenshots.slice(0, 4).map((shot, idx) => (
                  <div 
                    key={shot.id} 
                    className={`relative border-2 ${category.borderColor} rounded overflow-hidden cursor-pointer group hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleScreenshotClick(idx);
                    }}
                  >
                    <img 
                      src={shot.imageUrl} 
                      alt="Screenshot evidence" 
                      className="w-full h-24 object-cover group-hover:opacity-90 transition-opacity"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <div className="hidden w-full h-24 bg-gray-200 flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-1 flex justify-between">
                      <span>{format(new Date(shot.capturedAt), 'HH:mm')}</span>
                      <span className={`font-medium ${shot.activityPercent < 30 ? 'text-red-300' : 'text-green-300'}`}>
                        {shot.activityPercent}%
                      </span>
                    </div>
                    {issue.type === 'duplicate_screenshots' && (
                      <div className="absolute top-1 right-1 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                        DUP
                      </div>
                    )}
                    {shot.appName && (
                      <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded max-w-[80%] truncate">
                        {shot.appName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Recommendation */}
          {(() => {
            const rec = getRecommendation(issue);
            const urgency = getActionUrgency(issue.severity);
            return (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs font-medium text-purple-700 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    AI Recommendation: {rec.title}
                  </p>
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] ${
                      rec.priority === 'high' ? 'bg-red-100 text-red-700 border-red-200' :
                      rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                      'bg-green-100 text-green-700 border-green-200'
                    }`}
                  >
                    {rec.priority} priority
                  </Badge>
                </div>
                <p className="text-sm text-purple-800 mb-2">{rec.description}</p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-purple-600 font-medium">
                    💡 {rec.action}
                  </p>
                  <span className="text-[10px] text-purple-500">{urgency}</span>
                </div>
              </div>
            );
          })()}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/screenshots?user=${issue.userId}`);
              }}
            >
              <Eye className="h-3 w-3 mr-1" />
              View Screenshots
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/app-activity?user=${issue.userId}`);
              }}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              View Activity
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/admin/warning-management');
              }}
            >
              <Send className="h-3 w-3 mr-1" />
              Send Warning
            </Button>
          </div>
        </CardContent>
      )}

      {/* Screenshot Modal */}
      {modalScreenshots.length > 0 && (
        <ScreenshotModal
          screenshots={modalScreenshots}
          initialIndex={modalIndex}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          userName={issue.userName}
          issueType={category.label}
        />
      )}
    </Card>
  );
}

// Group issues by type for organized display
function groupIssuesByType(issues: DetectedIssue[]): Record<IssueType, DetectedIssue[]> {
  const grouped: Record<IssueType, DetectedIssue[]> = {
    duplicate_screenshots: [],
    low_activity: [],
    social_media_app: [],
    social_media_url: [],
    entertainment: [],
    gaming: [],
    excessive_idle: [],
  };

  issues.forEach(issue => {
    grouped[issue.type].push(issue);
  });

  return grouped;
}

export function IssueList({ issues, loading }: IssueListProps) {
  const [groupByType, setGroupByType] = useState(false);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading issues...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (issues.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-green-900 mb-2">No Issues Detected</h3>
            <p className="text-green-700 text-sm">
              All employees are showing good productivity patterns. No concerning activity detected.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedIssues = groupByType ? groupIssuesByType(issues) : null;

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {issues.length} issue{issues.length !== 1 ? 's' : ''} detected
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant={groupByType ? 'default' : 'outline'}
            size="sm"
            onClick={() => setGroupByType(true)}
          >
            Group by Type
          </Button>
          <Button
            variant={!groupByType ? 'default' : 'outline'}
            size="sm"
            onClick={() => setGroupByType(false)}
          >
            All Issues
          </Button>
        </div>
      </div>

      {/* Grouped View */}
      {groupByType && groupedIssues && (
        <div className="space-y-6">
          {(Object.entries(groupedIssues) as [IssueType, DetectedIssue[]][])
            .filter(([, typeIssues]) => typeIssues.length > 0)
            .map(([type, typeIssues]) => {
              const category = ISSUE_CATEGORIES[type];
              const TypeIcon = ISSUE_ICONS[type];
              
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`p-1.5 rounded ${category.bgColor}`}>
                      <TypeIcon className={`h-4 w-4 ${category.color}`} />
                    </div>
                    <h3 className={`font-semibold ${category.color}`}>
                      {category.label}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {typeIssues.length}
                    </Badge>
                  </div>
                  <div className="space-y-2 pl-8">
                    {typeIssues.map(issue => (
                      <IssueCard key={issue.id} issue={issue} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Flat View */}
      {!groupByType && (
        <div className="space-y-2">
          {issues.map(issue => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}

