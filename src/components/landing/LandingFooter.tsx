import { Link } from "react-router-dom";
import logo from "@/assets/canggu-logo.png";

export default function LandingFooter() {
  return (
    <footer className="bg-[hsl(var(--foreground))] py-16 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-3 max-md:grid-cols-1 gap-8">
        <div>
          <img src={logo} alt="Canggu.ai" className="h-8" />
          <p className="font-['DM_Sans'] text-sm text-white/50 mt-2">
            Plataforma de atendimento inteligente para e-commerce
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Link to="/login" className="font-['DM_Sans'] text-sm text-white/70 hover:text-white transition-colors">
            Acessar Plataforma
          </Link>
          <a href="#funcionalidades" className="font-['DM_Sans'] text-sm text-white/70 hover:text-white transition-colors">
            Funcionalidades
          </a>
          <a href="#integracoes" className="font-['DM_Sans'] text-sm text-white/70 hover:text-white transition-colors">
            Integrações
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-['DM_Sans'] text-sm text-white/70">contato@canggu.com.br</span>
          <span className="font-['DM_Sans'] text-sm text-white/70">canggu.com.br</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-12">
        <div className="h-px bg-white/10" />
        <p className="text-xs text-white/40 text-center pt-6">
          © 2026 Canggu.ai — Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
