import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Trash2, Eye, EyeOff, Copy, AlertTriangle, Gamepad2, Smartphone, Tv, ShoppingCart, Moon, Shield, Brain, Sparkles, ScanEye, RefreshCw } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Screenshot, User } from '../types';
import { getContentCategoryDisplay, getDistractionBadge } from '../constants';

// Alert badge configurations
const alertBadgeConfig: Record<string, { bg: string; icon: React.ElementType; label: string }> = {
  gaming: { bg: 'bg-purple-600', icon: Gamepad2, label: 'Gaming' },
  social_media: { bg: 'bg-blue-500', icon: Smartphone, label: 'Social Media' },
  entertainment: { bg: 'bg-orange-500', icon: Tv, label: 'Entertainment' },
  shopping: { bg: 'bg-pink-500', icon: ShoppingCart, label: 'Shopping' },
};

// Get alert badge for non-work categories
const getAlertBadge = (category: string | undefined, hasAlert: boolean) => {
  if (!category || !alertBadgeConfig[category]) return null;
  return alertBadgeConfig[category];
};

interface ScreenshotGridProps {
  screenshots: Screenshot[];
  users: User[];
  isAdmin: boolean;
  selectedScreenshots: string[];
  onScreenshotSelect: (id: string) => void;
  onScreenshotClick: (screenshot: Screenshot) => void;
  onDeleteScreenshot: (id: string) => void;
  onEstimateDeduction?: (id: string) => Promise<number>;
  onReanalyzeScreenshot?: (id: string) => void;
}

export const ScreenshotGrid: React.FC<ScreenshotGridProps> = ({
  screenshots,
  users,
  isAdmin,
  selectedScreenshots,
  onScreenshotSelect,
  onScreenshotClick,
  onDeleteScreenshot,
  onEstimateDeduction,
  onReanalyzeScreenshot
}) => {
  const [deductionEstimates, setDeductionEstimates] = React.useState<Record<string, number | null>>({});

  const handleDeleteDialogOpen = async (screenshotId: string) => {
    if (onEstimateDeduction && !deductionEstimates[screenshotId]) {
      setDeductionEstimates(prev => ({ ...prev, [screenshotId]: null }));
      try {
        const seconds = await onEstimateDeduction(screenshotId);
        setDeductionEstimates(prev => ({ ...prev, [screenshotId]: seconds }));
      } catch {
        setDeductionEstimates(prev => ({ ...prev, [screenshotId]: 0 }));
      }
    }
  };

  const formatDeduction = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  };
  // Helper function to determine severity level and styling
  const getScreenshotSeverity = (screenshot: Screenshot) => {
    const consecutiveDups = screenshot.consecutive_duplicate_count || 0;
    const activityPercent = screenshot.activity_percent || 0;
    const isIdle = screenshot.idle_inferred;
    const isDuplicate = screenshot.is_duplicate;

    // High severity: Extended idle or very high duplicates
    if (consecutiveDups >= 20 || (isIdle && activityPercent < 10)) {
      return {
        level: 'high',
        borderColor: 'border-red-500',
        bgColor: 'bg-red-50/80',
        ringColor: 'ring-red-500',
        pulse: true
      };
    }
    
    // Medium severity: Moderate duplicates or idle with low activity
    if (consecutiveDups >= 10 || (isIdle && activityPercent < 30) || (isDuplicate && activityPercent < 20)) {
      return {
        level: 'medium',
        borderColor: 'border-orange-400',
        bgColor: 'bg-orange-50/70',
        ringColor: 'ring-orange-400',
        pulse: false
      };
    }
    
    // Low severity: Few duplicates or low activity
    if (consecutiveDups >= 5 || activityPercent < 30 || isDuplicate) {
      return {
        level: 'low',
        borderColor: 'border-yellow-400',
        bgColor: 'bg-yellow-50/60',
        ringColor: 'ring-yellow-400',
        pulse: false
      };
    }

    // Normal
    return {
      level: 'normal',
      borderColor: 'border-gray-200',
      bgColor: 'bg-white',
      ringColor: 'ring-blue-200',
      pulse: false
    };
  };

  if (screenshots.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <p className="text-muted-foreground">No screenshots found for the selected criteria.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {screenshots.map((screenshot) => {
            const user = users.find(u => u.id === screenshot.user_id);
            const categoryDisplay = getContentCategoryDisplay(screenshot.content_category || 'productive', screenshot.distraction_score || 0);
            const distractionBadge = getDistractionBadge(screenshot.distraction_score || 0);
            const CategoryIcon = categoryDisplay.icon;
            const DistractionIcon = distractionBadge.icon;
            const severity = getScreenshotSeverity(screenshot);

            return (
              <div 
                key={screenshot.id} 
                className={`relative group rounded-lg shadow-sm border-2 hover:shadow-md transition-all duration-200 ${severity.borderColor} ${severity.bgColor} ${severity.pulse ? 'animate-pulse' : ''}`}
                data-testid={`screenshot-thumbnail-${screenshots.indexOf(screenshot)}`} 
                data-activity-percent={screenshot.activity_percent || 0}
              >
                {/* Selection Checkbox */}
                {isAdmin && (
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedScreenshots.includes(screenshot.id)}
                      onChange={() => onScreenshotSelect(screenshot.id)}
                      className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                )}

                {/* Prominent Warning Badge Overlay - Top Left */}
                {isAdmin && severity.level !== 'normal' && (
                  <div className="absolute top-10 left-2 z-10">
                    {screenshot.consecutive_duplicate_count && screenshot.consecutive_duplicate_count >= 5 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`px-2 py-1 rounded-md shadow-lg flex items-center gap-1 text-xs font-bold ${
                              screenshot.consecutive_duplicate_count >= 20 ? 'bg-red-600 text-white' :
                              screenshot.consecutive_duplicate_count >= 10 ? 'bg-orange-500 text-white' :
                              'bg-yellow-500 text-white'
                            }`}>
                              <Copy className="h-3 w-3" />
                              DUP x{screenshot.consecutive_duplicate_count}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-semibold">⚠️ {screenshot.consecutive_duplicate_count} consecutive duplicates</p>
                            <p className="text-xs">Indicates extended idle or no screen changes</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {screenshot.idle_inferred && (!screenshot.consecutive_duplicate_count || screenshot.consecutive_duplicate_count < 5) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="px-2 py-1 rounded-md shadow-lg flex items-center gap-1 text-xs font-bold bg-gray-600 text-white">
                              <Moon className="h-3 w-3" />
                              IDLE
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-semibold">💤 Employee is idle</p>
                            <p className="text-xs">No keyboard/mouse activity detected</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {!screenshot.idle_inferred && !screenshot.consecutive_duplicate_count && (screenshot.activity_percent || 0) < 10 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="px-2 py-1 rounded-md shadow-lg flex items-center gap-1 text-xs font-bold bg-red-600 text-white">
                              <AlertTriangle className="h-3 w-3" />
                              NO ACTIVITY
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-semibold">⚠️ Very low activity detected</p>
                            <p className="text-xs">Activity: {screenshot.activity_percent}%</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}

                {/* Screenshot Image */}
                <div 
                  className="relative cursor-pointer overflow-hidden rounded-t-lg border bg-muted"
                  onClick={() => onScreenshotClick(screenshot)}
                >
                  <img
                    src={screenshot.image_url}
                    alt={`Screenshot ${screenshot.id}`}
                    className="w-full h-auto max-h-[22rem] object-contain transition-transform group-hover:scale-105"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/placeholder-screenshot.png';
                    }}
                  />
                  
                  {/* Activity + AI status + Alert badges overlay */}
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {screenshot.activity_percent || 0}%
                    </Badge>
                    {screenshot.ai_analysis_status && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant={screenshot.ai_analysis_status === 'completed' ? 'default' : 'outline'} 
                              className={`text-[10px] cursor-help ${screenshot.ai_analysis_status === 'completed' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                            >
                              {screenshot.ai_analysis_status === 'completed' ? (
                                <>
                                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                  AI
                                </>
                              ) : screenshot.ai_analysis_status === 'processing' ? (
                                <>
                                  <Brain className="h-2.5 w-2.5 mr-0.5 animate-pulse" />
                                  AI...
                                </>
                              ) : (
                                'Pending'
                              )}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <p className="font-medium">AI Analysis: {screenshot.ai_analysis_status}</p>
                              {screenshot.ai_analysis_status === 'completed' && (
                                <>
                                  <p className="text-muted-foreground mt-1">Analyzed by Hugging Face</p>
                                  {screenshot.ai_confidence && (
                                    <p className="text-muted-foreground">Confidence: {Math.round(screenshot.ai_confidence * 100)}%</p>
                                  )}
                                </>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {/* Vision Validation Badge */}
                    {screenshot.vision_validated_at ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="default" 
                              className="text-[10px] cursor-help bg-green-600 hover:bg-green-700"
                            >
                              <ScanEye className="h-2.5 w-2.5 mr-0.5" />
                              Vision
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <p className="font-medium">👁️ Vision Validated</p>
                              {screenshot.vision_category && (
                                <p className="text-muted-foreground">Category: {screenshot.vision_category}</p>
                              )}
                              {screenshot.vision_confidence && (
                                <p className="text-muted-foreground">Confidence: {Math.round(screenshot.vision_confidence * 100)}%</p>
                              )}
                              {screenshot.vision_detected_content && (
                                <p className="text-muted-foreground mt-1">{screenshot.vision_detected_content.substring(0, 100)}...</p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : screenshot.needs_vision_validation ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="outline" 
                              className="text-[10px] cursor-help border-yellow-500 text-yellow-600"
                            >
                              <ScanEye className="h-2.5 w-2.5 mr-0.5" />
                              Pending
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <p className="font-medium">⏳ Awaiting Vision Validation</p>
                              <p className="text-muted-foreground">
                                {screenshot.duplicate_confidence === 'low' ? 'Priority: High (likely false positive)' :
                                 screenshot.duplicate_confidence === 'medium' ? 'Priority: Medium' :
                                 'Priority: Low'}
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                  </div>
                  
                  {/* Alert/Category badges (bottom-left) */}
                  <div className="absolute bottom-2 left-2 flex gap-1">
                    {/* Non-work category badge */}
                    {(() => {
                      const alertConfig = getAlertBadge(screenshot.category || screenshot.content_category, !!screenshot.alert_id);
                      if (alertConfig) {
                        const AlertIcon = alertConfig.icon;
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={`${alertConfig.bg} text-white p-1.5 rounded-full shadow-lg`}>
                                  <AlertIcon className="h-3 w-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{alertConfig.label} detected</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      }
                      return null;
                    })()}
                    
                    {/* Consecutive duplicates badge */}
                    {(screenshot.consecutive_duplicate_count && screenshot.consecutive_duplicate_count >= 5) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`${screenshot.consecutive_duplicate_count >= 20 ? 'bg-red-500' : screenshot.consecutive_duplicate_count >= 10 ? 'bg-orange-500' : 'bg-gray-500'} text-white px-1.5 py-0.5 rounded-full shadow-lg flex items-center gap-0.5 text-[10px] font-bold`}>
                              <Copy className="h-2.5 w-2.5" />
                              {screenshot.consecutive_duplicate_count}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{screenshot.consecutive_duplicate_count} consecutive duplicates - {screenshot.consecutive_duplicate_count >= 20 ? 'Extended idle' : 'Possible idle'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    
                    {/* Idle badge */}
                    {screenshot.idle_inferred && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-gray-400 text-white p-1.5 rounded-full shadow-lg">
                              <Moon className="h-3 w-3" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Idle detected</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    
                    {/* Privacy concern badge */}
                    {(screenshot.ai_metadata?.privacy_risk_score && screenshot.ai_metadata.privacy_risk_score >= 60) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-red-700 text-white p-1.5 rounded-full shadow-lg">
                              <Shield className="h-3 w-3" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Privacy concern: {screenshot.ai_metadata.privacy_concerns?.join(', ') || 'Sensitive content'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    
                    {/* Alert indicator */}
                    {screenshot.alert_id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-red-600 text-white p-1.5 rounded-full shadow-lg animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Alert triggered - click to view</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  
                  {/* Overlay with info */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Eye className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                {/* Screenshot Details */}
                <div className="p-3 bg-white rounded-b-lg border-t-0 space-y-2">
                  {/* Time and Activity Level */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {format(new Date(screenshot.captured_at), 'HH:mm:ss')}
                    </span>
                    <Badge 
                      variant={
                        (screenshot.activity_percent || 0) >= 70 ? "default" : 
                        (screenshot.activity_percent || 0) >= 30 ? "secondary" : 
                        "outline"
                      }
                      className="text-xs"
                    >
                      {(screenshot.activity_percent || 0) >= 70 ? 'High' : 
                       (screenshot.activity_percent || 0) >= 30 ? 'Medium' : 
                       'Low'} Activity
                    </Badge>
                  </div>

                  {/* Activity Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>Focus: {screenshot.focus_percent || 0}%</div>
                    <div>Clicks: {screenshot.mouse_clicks || 0}</div>
                    <div>Keys: {screenshot.keystrokes || 0}</div>
                    <div>Moves: {screenshot.mouse_movements || 0}</div>
                  </div>

                  {/* User Name */}
                  <div className="text-xs text-gray-500">
                    {user?.full_name || user?.email || 'Unknown User'}
                  </div>

                  {/* Content Category */}
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={`text-xs ${categoryDisplay.color}`}>
                      <CategoryIcon className="h-3 w-3 mr-1" />
                      {categoryDisplay.label}
                    </Badge>
                  </div>

                  {/* Distraction Score */}
                  {(screenshot.distraction_score || 0) >= 30 && (
                    <div className="flex items-center gap-1">
                      <Badge className={`text-xs ${distractionBadge.color}`}>
                        <DistractionIcon className="h-3 w-3 mr-1" />
                        {screenshot.distraction_score}%
                      </Badge>
                    </div>
                  )}

                  {/* Duplicate Badge */}
                  {screenshot.is_duplicate && (
                    <div className="flex items-center gap-1">
                      <Badge variant="destructive" className="text-xs">
                        <Copy className="h-3 w-3 mr-1" />
                        Duplicate
                      </Badge>
                      {screenshot.duplicate_reason && (
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={screenshot.duplicate_reason}>
                          {screenshot.duplicate_reason}
                        </span>
                      )}
                    </div>
                  )}

                  {/* App/URL Info */}
                  {(screenshot.app_name || screenshot.url) && (
                    <div className="text-xs truncate text-muted-foreground">
                      {screenshot.app_name || screenshot.url}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {isAdmin && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    {/* Re-analyze with Vision Button */}
                    {onReanalyzeScreenshot && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReanalyzeScreenshot(screenshot.id);
                              }}
                            >
                              <ScanEye className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Run AI analysis (DeepSeek)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {/* Delete Button */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDialogOpen(screenshot.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Screenshot?</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div className="space-y-3">
                              <p>This will permanently delete the screenshot taken at <strong>{format(new Date(screenshot.captured_at), 'HH:mm:ss')}</strong>.</p>
                              <div className="p-3 bg-muted rounded-md text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Duration:</span>
                                  <span className="font-medium">0h 0m</span>
                                </div>
                              </div>
                              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <p className="text-red-700 font-semibold text-sm">
                                  {deductionEstimates[screenshot.id] === null
                                    ? 'Calculating time deduction...'
                                    : deductionEstimates[screenshot.id] !== undefined
                                    ? `This will deduct ${formatDeduction(deductionEstimates[screenshot.id]!)} from tracked time.`
                                    : 'Time will be deducted from the employee\'s tracked hours.'}
                                </p>
                                <p className="text-red-500 text-xs mt-1">Deleted screenshots and deducted time cannot be recovered.</p>
                              </div>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => onDeleteScreenshot(screenshot.id)}
                          >
                            Delete & Deduct Time
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}; 