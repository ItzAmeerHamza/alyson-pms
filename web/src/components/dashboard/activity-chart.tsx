
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Define the type for individual data points in the activity chart
interface ActivityData {
  name: string;
  activity: number;
}

// We'll add an adapter for backward compatibility
interface ActivityChartProps {
  data: ActivityData[] | { hour: string; active: number; idle: number; }[];
  className?: string;
}

export function ActivityChart({ data, className }: ActivityChartProps) {
  // Adapt data if it's in the previous format
  const chartData = data.map(item => {
    if ('hour' in item) {
      // Convert from the old format
      return {
        name: item.hour,
        activity: item.active + item.idle
      };
    }
    return item;
  });

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle>Today's Activity</CardTitle>
        <CardDescription>Hourly activity distribution</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            No activity data available
          </div>
        ) : (
          <div className="h-[200px]">
            <div className="flex h-full items-end">
              {data.map((entry, index) => {
                // Handle both data formats
                const hour = 'hour' in entry ? entry.hour : entry.name;
                const active = 'active' in entry ? entry.active : 0;
                const idle = 'idle' in entry ? entry.idle : 0;
                const activity = 'activity' in entry ? entry.activity : active + idle;
                
                const height = Math.max(activity * 20, 4);
                
                return (
                  <div key={index} className="relative flex-1 group">
                    <div className="absolute -top-6 left-0 right-0 text-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      {hour}
                    </div>
                    <div className="mx-1 flex flex-col h-full justify-end">
                      {activity > 0 && (
                        <>
                          {idle > 0 && (
                            <div 
                              className="w-full bg-yellow-400 dark:bg-yellow-600"
                              style={{ height: `${(idle / activity) * height}px` }}
                            />
                          )}
                          {active > 0 && (
                            <div 
                              className="w-full bg-green-500 dark:bg-green-600"
                              style={{ height: `${(active / activity) * height}px` }}
                            />
                          )}
                          {!('active' in entry) && (
                            <div 
                              className="w-full bg-blue-500 dark:bg-blue-600"
                              style={{ height: `${height}px` }}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
      <div className="px-4 pb-4 flex items-center justify-center space-x-4 text-xs">
        <div className="flex items-center">
          <div className="h-3 w-3 rounded-full bg-green-500 dark:bg-green-600 mr-2"></div>
          <span>Active</span>
        </div>
        <div className="flex items-center">
          <div className="h-3 w-3 rounded-full bg-yellow-400 dark:bg-yellow-600 mr-2"></div>
          <span>Idle</span>
        </div>
      </div>
    </Card>
  );
}
