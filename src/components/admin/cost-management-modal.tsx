import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CostInsightsPanel } from '@/components/admin/cost-insights-panel';

interface CostManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CostManagementModal({ open, onOpenChange }: CostManagementModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cost & usage</DialogTitle>
          <DialogDescription>
            Screenshot storage by user for your organization (from database{' '}
            <code className="text-xs">file_size</code>) and DeepSeek LLM account snapshot plus token totals
            from stored analyses.
          </DialogDescription>
        </DialogHeader>
        <CostInsightsPanel enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
