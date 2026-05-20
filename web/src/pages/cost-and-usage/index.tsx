import { PageHeader } from '@/components/layout/page-header';
import { CostInsightsPanel } from '@/components/admin/cost-insights-panel';

export default function CostAndUsagePage() {
  return (
    <div className="container py-6 max-w-5xl" data-testid="cost-and-usage-page">
      <PageHeader
        title="Cost & Usage"
        subtitle="Screenshot storage per person, token usage (text vs vision, by model), indicative spend, and DeepSeek account status."
      />
      <div className="mt-6 rounded-xl border bg-card p-4 md:p-6 shadow-sm">
        <CostInsightsPanel enabled />
      </div>
    </div>
  );
}
