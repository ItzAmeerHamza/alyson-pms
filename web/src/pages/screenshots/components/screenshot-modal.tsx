import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { X, ChevronLeft, ChevronRight, Trash2, Maximize2, Minimize2, Copy, ArrowLeftRight, Sparkles } from 'lucide-react';
import { Screenshot, User } from '../types';

/** Vision / DeepSeek multimodal text stored on the row or in metadata */
function getScreenshotAiImageDescription(s: Screenshot): string | null {
  const take = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };

  const fromVisionAnalysis = (): string | null => {
    const va = s.vision_analysis;
    if (!va || typeof va !== 'object') return null;
    const dc = (va as { detected_content?: unknown }).detected_content;
    return take(dc);
  };

  return (
    take(s.ai_description) ??
    take(s.ai_metadata?.image_description) ??
    take(s.vision_detected_content) ??
    take(s.vision_content) ??
    fromVisionAnalysis()
  );
}

interface SessionInfo {
  timeSlot: string;
  employeeName: string;
  indexInSession: number;
  totalInSession: number;
  sessionIndex: number;
  totalSessions: number;
}

interface ScreenshotModalProps {
  screenshot: Screenshot | null;
  screenshots: Screenshot[];
  users: User[];
  isOpen: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onDelete: (id: string) => void;
  onEstimateDeduction?: (id: string) => Promise<number>;
  sessionInfo?: SessionInfo;
  /** Manual DeepSeek analysis for this screenshot (uses model chosen on Screenshots page). */
  onRunAiAnalysis?: (id: string) => void | Promise<void>;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
  screenshot,
  screenshots,
  users,
  isOpen,
  isAdmin,
  onClose,
  onNavigate,
  onDelete,
  onEstimateDeduction,
  sessionInfo,
  onRunAiAnalysis
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showDuplicateComparison, setShowDuplicateComparison] = React.useState(false);
  const [selectedDuplicateIndex, setSelectedDuplicateIndex] = React.useState(0);
  const [deductionSeconds, setDeductionSeconds] = React.useState<number | null>(null);

  const handleDeleteDialogOpen = async () => {
    if (screenshot && onEstimateDeduction) {
      setDeductionSeconds(null);
      try {
        const seconds = await onEstimateDeduction(screenshot.id);
        setDeductionSeconds(seconds);
      } catch {
        setDeductionSeconds(0);
      }
    }
  };

  const formatDeduction = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  };
  
  const currentIndex = screenshot ? screenshots.findIndex(s => s.id === screenshot.id) : -1;
  const user = screenshot ? users.find(u => u.id === screenshot.user_id) : undefined;

  // Find related duplicates by duplicate_group_hash or duplicate_hash
  const relatedDuplicates = useMemo(() => {
    if (!screenshot || !screenshot.is_duplicate) return [];
    
    const groupHash = screenshot.duplicate_group_hash;
    const dupHash = screenshot.duplicate_hash;
    
    if (!groupHash && !dupHash) return [];
    
    // Find all screenshots with the same duplicate_group_hash or duplicate_hash
    const related = screenshots.filter(s => {
      if (s.id === screenshot.id) return false;
      if (groupHash && s.duplicate_group_hash === groupHash) return true;
      if (dupHash && s.duplicate_hash === dupHash) return true;
      return false;
    }).sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    
    return related;
  }, [screenshot, screenshots]);

  // Reset duplicate comparison view when screenshot changes
  React.useEffect(() => {
    setShowDuplicateComparison(false);
    setSelectedDuplicateIndex(0);
  }, [screenshot?.id]);

  // Keyboard navigation and reset fullscreen when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNavigate('next');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, onNavigate, onClose]);

  if (!screenshot) return null;

  const aiImageDescription = getScreenshotAiImageDescription(screenshot);

  return (
    <>
      <Dialog open={isOpen && !isFullscreen} onOpenChange={onClose} data-testid="screenshot-modal">
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Screenshot Details</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {sessionInfo 
                    ? `${sessionInfo.indexInSession + 1} of ${sessionInfo.totalInSession} in ${sessionInfo.timeSlot}`
                    : `${currentIndex + 1} of ${screenshots.length}`
                  }
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsFullscreen(true)}
                  title="Open fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose} data-testid="close-modal-btn">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription>
              View and navigate through screenshot details. Use arrow keys or click to navigate between screenshots.
            </DialogDescription>
            {isAdmin && onRunAiAnalysis && (
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => void onRunAiAnalysis(screenshot.id)}
                >
                  <Sparkles className="h-4 w-4" />
                  Run AI analysis
                </Button>
              </div>
            )}
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              {/* Navigation Buttons */}
              <Button
                variant="outline"
                size="sm"
                className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 bg-white/90 hover:bg-white shadow-lg"
                onClick={() => onNavigate('prev')}
                disabled={screenshots.length <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 bg-white/90 hover:bg-white shadow-lg"
                onClick={() => onNavigate('next')}
                disabled={screenshots.length <= 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              <img
                src={screenshot.image_url}
                alt={`Screenshot ${screenshot.id}`}
                className="w-full h-auto rounded-lg max-h-[60vh] object-contain cursor-pointer"
                onClick={() => setIsFullscreen(true)}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder-screenshot.png';
                }}
              />
            </div>

          {/* Screenshot Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium">Captured:</span>
              <p className="text-muted-foreground">
                {format(new Date(screenshot.captured_at), 'MMM dd, yyyy HH:mm:ss')}
              </p>
            </div>
            <div>
              <span className="font-medium">User:</span>
              <p className="text-muted-foreground">
                {user?.full_name || user?.email || 'Unknown User'}
              </p>
            </div>
            <div>
              <span className="font-medium">Activity:</span>
              <p className="text-muted-foreground">
                {screenshot.activity_percent}%
              </p>
            </div>
            <div>
              <span className="font-medium">Focus:</span>
              <p className="text-muted-foreground">
                {screenshot.focus_percent}%
              </p>
            </div>
            
            {screenshot.app_name && (
              <div>
                <span className="font-medium">Application:</span>
                <p className="text-muted-foreground">
                  {screenshot.app_name}
                </p>
              </div>
            )}
            
            {screenshot.url && (
              <div>
                <span className="font-medium">URL:</span>
                <p className="text-muted-foreground truncate">
                  {screenshot.url}
                </p>
              </div>
            )}
            
            {screenshot.window_title && (
              <div>
                <span className="font-medium">Window:</span>
                <p className="text-muted-foreground truncate">
                  {screenshot.window_title}
                </p>
              </div>
            )}
            
            {screenshot.content_category && (
              <div>
                <span className="font-medium">Category:</span>
                <p className="text-muted-foreground">
                  {screenshot.content_category.replace('_', ' ')}
                </p>
              </div>
            )}
            
            {screenshot.ai_confidence !== undefined && (
              <div>
                <span className="font-medium">AI Confidence:</span>
                <p className="text-muted-foreground">
                  {Math.round(screenshot.ai_confidence)}%
                </p>
              </div>
            )}

            {Array.isArray(screenshot.ai_tags) && screenshot.ai_tags.length > 0 && (
              <div className="col-span-2">
                <span className="font-medium">AI Tags:</span>
                <p className="text-muted-foreground truncate">
                  {screenshot.ai_tags.join(', ')}
                </p>
              </div>
            )}

            {screenshot.distraction_score !== undefined && (
              <div>
                <span className="font-medium">Distraction:</span>
                <p className="text-muted-foreground">
                  {screenshot.distraction_score}%
                </p>
              </div>
            )}
            
            {screenshot.mouse_clicks !== undefined && (
              <div>
                <span className="font-medium">Mouse Clicks:</span>
                <p className="text-muted-foreground">
                  {screenshot.mouse_clicks}
                </p>
              </div>
            )}
            
            {screenshot.keystrokes !== undefined && (
              <div>
                <span className="font-medium">Keystrokes:</span>
                <p className="text-muted-foreground">
                  {screenshot.keystrokes}
                </p>
              </div>
            )}
            
            {screenshot.is_duplicate && (
              <div className="col-span-2">
                <span className="font-medium text-red-600">Duplicate Detected:</span>
                <p className="text-muted-foreground">
                  {screenshot.duplicate_reason || 'Similar screenshot detected'}
                </p>
                {relatedDuplicates.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => setShowDuplicateComparison(!showDuplicateComparison)}
                  >
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    {showDuplicateComparison ? 'Hide Comparison' : `Compare with ${relatedDuplicates.length} similar screenshot${relatedDuplicates.length > 1 ? 's' : ''}`}
                  </Button>
                )}
              </div>
            )}
            
            {screenshot.ai_analysis_status && (
              <div>
                <span className="font-medium">AI Analysis:</span>
                <p className="text-muted-foreground capitalize">
                  {screenshot.ai_analysis_status}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-violet-200/80 bg-violet-50/50 dark:bg-violet-950/25 dark:border-violet-800 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
              <span className="text-sm font-semibold text-foreground">AI image description</span>
              {screenshot.ai_model_used && screenshot.ai_model_used !== 'pattern-based' ? (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {screenshot.ai_model_used}
                </Badge>
              ) : null}
            </div>
            {aiImageDescription ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {aiImageDescription}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic leading-relaxed">
                {screenshot.ai_analysis_status === 'completed'
                  ? 'No vision description is stored for this capture yet. It is added when the analyzer runs multimodal (vision) on the image—for example manual “Run AI analysis”, or when activity/duplicate rules trigger vision. Classifications that are pattern-only do not produce an image description.'
                  : 'Description will appear here after AI analysis finishes.'}
              </p>
            )}
          </div>

          {/* Duplicate Comparison View */}
          {showDuplicateComparison && relatedDuplicates.length > 0 && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Copy className="h-4 w-4 text-orange-600" />
                  Duplicate Comparison
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    {relatedDuplicates.length} similar screenshot{relatedDuplicates.length > 1 ? 's' : ''} found
                  </Badge>
                </h4>
                {relatedDuplicates.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedDuplicateIndex(Math.max(0, selectedDuplicateIndex - 1))}
                      disabled={selectedDuplicateIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {selectedDuplicateIndex + 1} of {relatedDuplicates.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedDuplicateIndex(Math.min(relatedDuplicates.length - 1, selectedDuplicateIndex + 1))}
                      disabled={selectedDuplicateIndex === relatedDuplicates.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Current Screenshot */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-blue-50 px-3 py-2 border-b">
                    <span className="text-sm font-medium text-blue-700">Current Screenshot</span>
                    <p className="text-xs text-blue-600">
                      {format(new Date(screenshot.captured_at), 'HH:mm:ss')}
                    </p>
                  </div>
                  <div className="bg-gray-100">
                    <img
                      src={screenshot.image_url}
                      alt="Current screenshot"
                      className="w-full h-auto max-h-[200px] object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/placeholder-screenshot.png';
                      }}
                    />
                  </div>
                  <div className="p-2 text-xs text-muted-foreground">
                    <p><strong>App:</strong> {screenshot.app_name || 'Unknown'}</p>
                    <p><strong>Activity:</strong> {screenshot.activity_percent}%</p>
                  </div>
                </div>
                
                {/* Related Duplicate Screenshot */}
                {relatedDuplicates[selectedDuplicateIndex] && (() => {
                  const duplicate = relatedDuplicates[selectedDuplicateIndex];
                  const duplicateUser = users.find(u => u.id === duplicate.user_id);
                  return (
                    <div className="border rounded-lg overflow-hidden border-orange-200">
                      <div className="bg-orange-50 px-3 py-2 border-b border-orange-200">
                        <span className="text-sm font-medium text-orange-700">Similar Screenshot</span>
                        <p className="text-xs text-orange-600">
                          {format(new Date(duplicate.captured_at), 'HH:mm:ss')}
                          {duplicate.user_id !== screenshot.user_id && (
                            <span className="ml-2">({duplicateUser?.full_name || duplicateUser?.email || 'Unknown User'})</span>
                          )}
                        </p>
                      </div>
                      <div className="bg-gray-100">
                        <img
                          src={duplicate.image_url}
                          alt="Similar screenshot"
                          className="w-full h-auto max-h-[200px] object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = '/placeholder-screenshot.png';
                          }}
                        />
                      </div>
                      <div className="p-2 text-xs text-muted-foreground">
                        <p><strong>App:</strong> {duplicate.app_name || 'Unknown'}</p>
                        <p><strong>Activity:</strong> {duplicate.activity_percent}%</p>
                        {duplicate.duplicate_reason && (
                          <p className="text-orange-600"><strong>Reason:</strong> {duplicate.duplicate_reason}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Screenshots are compared using perceptual hashing to detect similar content
              </p>
            </div>
          )}
          
          {/* Navigation Instructions */}
          <div className="text-xs text-muted-foreground text-center border-t pt-3">
            Use arrow keys ← → to navigate • Click image for fullscreen • ESC to close
          </div>
          
          {/* Delete Button */}
          {isAdmin && (
            <div className="flex justify-end space-x-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" onClick={handleDeleteDialogOpen}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Screenshot
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Screenshot?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        <p>This will permanently delete the screenshot taken at <strong>{format(new Date(screenshot.captured_at), 'MMM dd, yyyy HH:mm:ss')}</strong>.</p>
                        <div className="p-3 bg-muted rounded-md text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Duration:</span>
                            <span className="font-medium">0h 0m</span>
                          </div>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-red-700 font-semibold text-sm">
                            {deductionSeconds === null
                              ? 'Calculating time deduction...'
                              : `This will deduct ${formatDeduction(deductionSeconds)} from the employee's tracked time.`}
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
                      onClick={() => {
                        onDelete(screenshot.id);
                        onClose();
                      }}
                    >
                      Delete & Deduct Time
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Fullscreen Image Viewer */}
    {isFullscreen && (
      <div 
        className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsFullscreen(false);
          }
        }}
      >
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/50 to-transparent z-10">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold">Screenshot Details</h3>
              <span className="text-sm text-gray-300">
                {sessionInfo 
                  ? `${sessionInfo.indexInSession + 1} of ${sessionInfo.totalInSession} in ${sessionInfo.timeSlot}`
                  : `${currentIndex + 1} of ${screenshots.length}`
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsFullscreen(false)}
                className="text-white hover:bg-white/20"
                title="Exit fullscreen"
              >
                <Minimize2 className="h-4 w-4 mr-2" />
                Exit Fullscreen
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Navigation Arrows */}
        {screenshots.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="lg"
              className="absolute left-4 z-10 h-16 w-16 rounded-full bg-black/50 hover:bg-black/70 text-white"
              onClick={() => onNavigate('prev')}
            >
              <ChevronLeft className="h-10 w-10" />
            </Button>
            
            <Button
              variant="ghost"
              size="lg"
              className="absolute right-4 z-10 h-16 w-16 rounded-full bg-black/50 hover:bg-black/70 text-white"
              onClick={() => onNavigate('next')}
            >
              <ChevronRight className="h-10 w-10" />
            </Button>
          </>
        )}

        {/* Image */}
        <img
          src={screenshot.image_url}
          alt={`Screenshot ${screenshot.id}`}
          className="max-w-[95vw] max-h-[95vh] object-contain"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/placeholder-screenshot.png';
          }}
        />

        {/* Bottom Info Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
          <div className="flex items-center justify-between text-white text-sm">
            <div className="flex items-center gap-6">
              <span>
                <strong>Captured:</strong> {format(new Date(screenshot.captured_at), 'MMM dd, yyyy HH:mm:ss')}
              </span>
              <span>
                <strong>User:</strong> {user?.full_name || user?.email || 'Unknown User'}
              </span>
              <span>
                <strong>Activity:</strong> {screenshot.activity_percent}%
              </span>
              {screenshot.app_name && (
                <span>
                  <strong>App:</strong> {screenshot.app_name}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-300">
              Use ← → arrows to navigate • ESC to exit fullscreen
            </span>
          </div>
        </div>
      </div>
    )}
    </>
  );
}; 