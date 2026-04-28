import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info, X, CheckCircle, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Warning {
  warning_id: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  display_frequency: string;
  last_shown: string | null;
}

interface WarningPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  trigger?: 'timer_start' | 'login' | 'manual';
}

export function WarningPopup({ isOpen, onClose, onProceed, trigger = 'timer_start' }: WarningPopupProps) {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [currentWarningIndex, setCurrentWarningIndex] = useState(0);
  const [userResponse, setUserResponse] = useState('');
  const [showResponseField, setShowResponseField] = useState(false);
  const [loading, setLoading] = useState(false);
  const { userDetails } = useAuth();

  useEffect(() => {
    if (isOpen && userDetails?.id) {
      fetchActiveWarnings();
    }
  }, [isOpen, userDetails?.id]);

  const fetchActiveWarnings = async () => {
    if (!userDetails?.id) return;

    try {
      const { data, error } = await supabase.rpc('get_active_warnings_for_user', {
        target_user_id: userDetails.id
      });

      if (error) throw error;
      
      if (data && (data as any[]).length > 0) {
        setWarnings(data as unknown as Warning[]);
        setCurrentWarningIndex(0);
      } else {
        // No warnings, proceed directly
        onProceed();
        onClose();
      }
    } catch (error) {
      console.error('Error fetching warnings:', error);
      // If there's an error fetching warnings, don't block the user
      onProceed();
      onClose();
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-6 w-6 text-red-600" />;
      case 'high':
        return <AlertCircle className="h-6 w-6 text-orange-600" />;
      case 'medium':
        return <AlertCircle className="h-6 w-6 text-yellow-600" />;
      case 'low':
        return <Info className="h-6 w-6 text-blue-600" />;
      default:
        return <Info className="h-6 w-6 text-gray-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-500 bg-red-50';
      case 'high':
        return 'border-orange-500 bg-orange-50';
      case 'medium':
        return 'border-yellow-500 bg-yellow-50';
      case 'low':
        return 'border-blue-500 bg-blue-50';
      default:
        return 'border-gray-500 bg-gray-50';
    }
  };

  const getBadgeVariant = (severity: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const logWarningShown = async (warningId: string, action: string, response?: string) => {
    try {
      await supabase.rpc('log_warning_shown', {
        p_warning_message_id: warningId,
        p_user_id: userDetails?.id || '',
        p_action_taken: action,
        p_user_response: response,
        p_context: {
          trigger,
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent
        }
      } as any);
    } catch (error) {
      console.error('Error logging warning:', error);
    }
  };

  const handleAcknowledge = async () => {
    const currentWarning = warnings[currentWarningIndex];
    if (!currentWarning) return;

    setLoading(true);
    
    try {
      await logWarningShown(
        currentWarning.warning_id, 
        'acknowledged', 
        userResponse || undefined
      );
      
      // Move to next warning or proceed
      if (currentWarningIndex < warnings.length - 1) {
        setCurrentWarningIndex(currentWarningIndex + 1);
        setUserResponse('');
        setShowResponseField(false);
      } else {
        // All warnings acknowledged, proceed
        onProceed();
        onClose();
        toast.success('All notifications acknowledged');
      }
    } catch (error) {
      console.error('Error acknowledging warning:', error);
      toast.error('Failed to acknowledge notification');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    const currentWarning = warnings[currentWarningIndex];
    if (!currentWarning) return;

    setLoading(true);
    
    try {
      await supabase.rpc('dismiss_warning', {
        p_warning_log_id: currentWarning.warning_id,
        p_action_taken: 'dismissed',
        p_user_response: userResponse || undefined
      } as any);
      
      // Move to next warning or proceed
      if (currentWarningIndex < warnings.length - 1) {
        setCurrentWarningIndex(currentWarningIndex + 1);
        setUserResponse('');
        setShowResponseField(false);
      } else {
        // All warnings handled, proceed
        onProceed();
        onClose();
      }
    } catch (error) {
      console.error('Error dismissing warning:', error);
      toast.error('Failed to dismiss notification');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    const currentWarning = warnings[currentWarningIndex];
    if (currentWarning) {
      await logWarningShown(currentWarning.warning_id, 'ignored');
    }
    onClose();
  };

  if (warnings.length === 0) {
    return null;
  }

  const currentWarning = warnings[currentWarningIndex];
  if (!currentWarning) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getSeverityIcon(currentWarning.severity)}
              <div>
                <DialogTitle className="text-lg">{currentWarning.title}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={getBadgeVariant(currentWarning.severity)}>
                    {currentWarning.severity.toUpperCase()}
                  </Badge>
                  {warnings.length > 1 && (
                    <Badge variant="outline" className="text-xs">
                      {currentWarningIndex + 1} of {warnings.length}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Warning Message */}
          <div className={cn(
            "p-4 rounded-lg border-2",
            getSeverityColor(currentWarning.severity)
          )}>
            <DialogDescription className="text-sm leading-relaxed text-gray-800">
              {currentWarning.message}
            </DialogDescription>
          </div>

          {/* Response Field Toggle */}
          {!showResponseField && (
            <div className="flex justify-center">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowResponseField(true)}
                className="text-xs"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Add Response (Optional)
              </Button>
            </div>
          )}

          {/* Response Field */}
          {showResponseField && (
            <div className="space-y-2">
              <Label htmlFor="response" className="text-sm font-medium">
                Your Response (Optional)
              </Label>
              <Textarea
                id="response"
                placeholder="Share any feedback, concerns, or acknowledgment..."
                value={userResponse}
                onChange={(e) => setUserResponse(e.target.value)}
                className="min-h-[80px] text-sm"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button 
              onClick={handleAcknowledge}
              disabled={loading}
              className="flex-1"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {loading ? 'Processing...' : 'Acknowledge'}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleDismiss}
              disabled={loading}
              className="flex-1"
            >
              Dismiss
            </Button>
          </div>

          {/* Progress Indicator */}
          {warnings.length > 1 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Notification Progress</span>
                <span>{currentWarningIndex + 1} / {warnings.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentWarningIndex + 1) / warnings.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Helper Text */}
          <div className="text-xs text-muted-foreground text-center border-t pt-3">
            {trigger === 'timer_start' && (
              "Please acknowledge this notification to proceed with starting your timer."
            )}
            {trigger === 'login' && (
              "Welcome! Please review these important notifications."
            )}
            {trigger === 'manual' && (
              "This notification was manually triggered by your administrator."
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 