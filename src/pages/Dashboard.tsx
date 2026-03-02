import { LayoutDashboard } from 'lucide-react';

const Dashboard = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
    <LayoutDashboard className="h-24 w-24 text-muted-foreground/20 mb-4" />
    <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
    <p className="text-muted-foreground mt-1">Em construção...</p>
  </div>
);

export default Dashboard;
