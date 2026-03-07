import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles, CheckCircle } from "lucide-react";

export default function HeroSection() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="pt-28 pb-32 px-6 relative" style={{ background: `radial-gradient(ellipse at center, hsl(var(--primary) / 0.04), hsl(var(--background)))` }}>
      <div className="max-w-3xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 border rounded-full px-4 py-1.5 bg-card">
          <Sparkles size={14} className="text-accent animate-[pulse_2s_ease-in-out_infinite]" />
          <span className="font-['DM_Sans'] font-medium text-[13px] text-muted-foreground">
            Powered by Claude AI — Anthropic
          </span>
        </div>

        {/* H1 */}
        <h1 className="mt-6 font-['Plus_Jakarta_Sans'] font-extrabold text-[56px] leading-[1.1] text-foreground max-md:text-[38px]">
          Seu atendimento em{" "}
          <span className="text-accent">qualquer</span> onda
        </h1>

        {/* Subtitle */}
        <p className="mt-4 font-['DM_Sans'] text-xl text-muted-foreground max-w-2xl mx-auto max-md:text-base">
          A Canggu.ai responde seus clientes no WhatsApp, Mercado Livre, Shopee e Amazon com IA — enquanto você foca no que importa.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex gap-4 justify-center flex-wrap">
          <Link
            to="/login"
            className="bg-primary text-primary-foreground h-12 px-8 rounded-full text-lg font-medium inline-flex items-center hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(0,77,77,0.3)] transition-all"
          >
            Acessar Plataforma →
          </Link>
          <a
            href="#funcionalidades"
            className="border h-12 px-8 rounded-full text-lg font-medium inline-flex items-center hover:bg-muted transition-all"
          >
            Ver Demonstração
          </a>
        </div>

        {/* Credibility */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <CheckCircle size={14} className="text-success" />
          <span className="font-['DM_Sans'] text-[13px] text-muted-foreground">
            Plataforma brasileira para sellers que vendem em múltiplos canais
          </span>
        </div>

        {/* Screenshot mockup */}
        <div
          className={`mt-12 max-w-5xl mx-auto -mb-12 relative z-10 transition-all duration-[600ms] ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[30px]"
          }`}
          style={{ perspective: "1200px" }}
        >
          <div style={{ transform: "rotateX(2deg)" }} className="shadow-[0_20px_60px_rgba(19,37,37,0.12)] rounded-xl overflow-hidden">
            <div className="bg-[#F0F0F0] h-9 rounded-t-xl flex items-center px-3 gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FF5F56]" />
              <span className="w-2 h-2 rounded-full bg-[#FFBD2E]" />
              <span className="w-2 h-2 rounded-full bg-[#27C93F]" />
            </div>
            <div className="bg-muted min-h-[400px] flex items-center justify-center rounded-b-xl">
              <span className="text-muted-foreground font-['DM_Sans']">Dashboard Canggu.ai</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
