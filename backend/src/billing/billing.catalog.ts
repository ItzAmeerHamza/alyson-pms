/** Autumn feature ids. Create these on the free cloud plan before enforcement matters. */
export const BILLING_FEATURES = {
  teamReports: 'team_reports',
  leave: 'leave',
  pacing: 'pacing',
  projects: 'projects',
  screenshotAi: 'screenshot_ai',
  seats: 'seats',
} as const;

export const BILLING_FEATURE_IDS = Object.values(BILLING_FEATURES);

export const BILLING_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyAmount: 49,
    includedSeats: 10,
    extraSeatAmount: 4,
  },
  {
    id: 'business',
    name: 'Business',
    monthlyAmount: 199,
    includedSeats: 50,
    extraSeatAmount: 3,
  },
  {
    id: 'growth',
    name: 'Growth',
    monthlyAmount: 399,
    includedSeats: 100,
    extraSeatAmount: 2.5,
  },
] as const;

export const BILLING_PLAN_IDS = BILLING_PLANS.map((plan) => plan.id);

export function workspaceCustomerId(workspaceId: string): string {
  return `workspace_${workspaceId}`;
}
