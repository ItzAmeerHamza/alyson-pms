
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { useNavigate } from "react-router-dom";
import { Camera, Clock, Users, Briefcase, Mail } from "lucide-react";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const adminTools = [
    {
      title: "Email Reports",
      description: "Configure automated email reports and notifications",
      icon: Mail,
      path: "/admin/email-reports",
      color: "bg-blue-600"
    },
    {
      title: "Screenshot Monitoring",
      description: "View user screenshots and activity tracking",
      icon: Camera,
      path: "/admin/screenshots",
      color: "bg-blue-500"
    },
    {
      title: "Idle Time Logs",
      description: "Monitor user idle periods and productivity",
      icon: Clock,
      path: "/admin/idle-logs",
      color: "bg-orange-500"
    },
    {
      title: "User Management",
      description: "Manage users and access roles",
      icon: Users,
      path: "/users",
      color: "bg-green-500"
    },
    {
      title: "Project Management",
      description: "Manage projects and tasks",
      icon: Briefcase,
      path: "/projects",
      color: "bg-purple-500"
    }
  ];

  return (
    <div className="container py-6" data-testid="admin-dashboard">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Monitor and manage your team's productivity"
        data-testid="admin-dashboard-header"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6" data-testid="admin-tools-grid">
        {adminTools.map((tool) => {
          const testId = tool.path.replace(/\//g, '-').replace(/^-/, '');
          return (
            <Card key={tool.path} className="hover:shadow-lg transition-shadow cursor-pointer" data-testid={`admin-tool-${testId}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${tool.color} text-white`} data-testid={`${testId}-icon`}>
                    <tool.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg" data-testid={`${testId}-title`}>{tool.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4" data-testid={`${testId}-description`}>{tool.description}</p>
                <Button 
                  onClick={() => navigate(tool.path)}
                  className="w-full"
                  data-testid={`${testId}-button`}
                >
                  Access {tool.title}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
