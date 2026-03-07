import {
  LayoutDashboard, MessageSquare, Store, Package, FileText,
  Users, AlertTriangle, BarChart3, Settings, LogOut, Bot,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSidebarCounts } from '@/hooks/useSidebarCounts';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', badgeKey: null },
  { icon: MessageSquare, label: 'Conversas', path: '/conversations', badgeKey: 'activeConversations' as const },
  { icon: Store, label: 'Marketplaces', path: '/marketplaces', badgeKey: 'marketplacePending' as const },
  { icon: Package, label: 'Produtos', path: '/products', badgeKey: null },
  { icon: FileText, label: 'Políticas/FAQ', path: '/policies', badgeKey: null },
  { icon: Users, label: 'Clientes', path: '/customers', badgeKey: null },
  { icon: AlertTriangle, label: 'Escalonamentos', path: '/escalations', badgeKey: 'pendingEscalations' as const },
  { icon: BarChart3, label: 'Analytics', path: '/analytics', badgeKey: null },
];

const AppSidebar = () => {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const counts = useSidebarCounts();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <img src="/src/assets/canggu-logo.png" alt="Canggu.ai" className="h-8 w-8 object-contain" />
        <span className="text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800 }}>
          <span className="text-white">Canggu</span>
          <span style={{ color: '#C56A4A' }}>.ai</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const count = item.badgeKey ? counts[item.badgeKey] : 0;
          const badgeColor = item.badgeKey === 'pendingEscalations' || item.badgeKey === 'marketplacePending'
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-white/20 text-white';

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm"
              activeClassName="bg-white/15 text-white font-medium"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {count > 0 && (
                <span className={`h-5 min-w-[1.25rem] px-1 flex items-center justify-center rounded-full text-xs font-bold ${badgeColor}`}>
                  {count}
                </span>
              )}
            </NavLink>
          );
        })}

        <Separator className="my-3 bg-white/10" />

        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm"
          activeClassName="bg-white/15 text-white font-medium"
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Configurações</span>
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 space-y-2">
        <p className="text-xs text-white/50 truncate">{user?.email}</p>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-xs text-red-300 hover:text-red-200 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>
    </div>
  );
};

export default AppSidebar;
