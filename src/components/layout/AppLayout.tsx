import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/useAuthStore';
import { useIsMobile } from '@/hooks/use-mobile';
import AppSidebar from './AppSidebar';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/conversations': 'Conversas',
  '/marketplaces': 'Marketplaces',
  '/products': 'Produtos',
  '/policies': 'Políticas/FAQ',
  '/customers': 'Clientes',
  '/escalations': 'Escalonamentos',
  '/analytics': 'Analytics',
  '/settings': 'Configurações',
};

const AppLayout = () => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();
  const user = useAuthStore((s) => s.user);

  const basePath = '/' + location.pathname.split('/').filter(Boolean).slice(0, 1).join('/');
  const title = pageTitles[basePath] || 'Budamix AI Agent';
  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  // Dynamic page title
  useEffect(() => {
    document.title = `${title} — Budamix AI Agent`;
  }, [title]);

  // Close mobile sidebar on navigate
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="w-64 shrink-0 border-r border-sidebar-border bg-[hsl(var(--sidebar-background))] fixed inset-y-0 left-0 z-30">
          <AppSidebar />
        </aside>
      )}

      {/* Main area */}
      <div className={isMobile ? 'flex-1 flex flex-col' : 'flex-1 flex flex-col ml-64'}>
        {/* Header */}
        <header className="h-14 shrink-0 border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20 flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0 bg-[hsl(var(--sidebar-background))] border-sidebar-border">
                  <AppSidebar />
                </SheetContent>
              </Sheet>
            )}
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
            </Button>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
