

# Aplicar screenshots reais na Landing Page

## Alterações

### 1. Copiar assets
- `user-uploads://budamix-ai-buddy.lovable.app_dashboard.png` → `src/assets/screenshot-dashboard.png`
- `user-uploads://budamix-ai-buddy.lovable.app_dashboard_1.png` → `src/assets/screenshot-marketplaces.png`

### 2. `src/components/landing/HeroSection.tsx`
- Importar `screenshotDashboard from "@/assets/screenshot-dashboard.png"`
- Substituir o `<div>` placeholder (bg-muted com texto "Dashboard Canggu.ai") por `<img src={screenshotDashboard} alt="Dashboard Canggu.ai" className="w-full" />`
- Manter barra do browser, sombras e perspectiva 3D intactas

### 3. `src/components/landing/ScreenshotSection.tsx`
- Importar `screenshotMarketplaces from "@/assets/screenshot-marketplaces.png"`
- Substituir o `<div>` placeholder por `<img src={screenshotMarketplaces} alt="Marketplaces Canggu.ai" className="w-full" />`
- Manter barra do browser e animações intactas

Nenhuma outra seção será alterada.

