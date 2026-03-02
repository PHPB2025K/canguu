import {
  LayoutDashboard, MessageSquare, Package, FileText,
  Users, AlertTriangle, BarChart3, Settings, LogOut, Bot,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuthStore } from '@/stores/useAuthStore';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: MessageSquare, label: 'Conversas', path: '/conversations' },
  { icon: Package, label: 'Produtos', path: '/products' },
  { icon: FileText, label: 'Políticas/FAQ', path: '/policies' },
  { icon: Users, label: 'Clientes', path: '/customers' },
  { icon: AlertTriangle, label: 'Escalonamentos', path: '/escalations' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
];

const AppSidebar = () => {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <span className="font-bold text-lg text-foreground">Budamix AI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm"
            activeClassName="bg-primary/10 text-primary font-medium"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <Separator className="my-3" />

        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm"
          activeClassName="bg-primary/10 text-primary font-medium"
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Configurações</span>
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-2">
        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-xs text-destructive hover:text-destructive/80 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>
    </div>
  );
};

export default AppSidebar;
