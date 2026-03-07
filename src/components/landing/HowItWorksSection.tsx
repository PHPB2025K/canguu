import { Smartphone, Sparkles, MonitorCheck } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const steps = [
  { num: "01", title: "Cliente envia mensagem", desc: "O cliente faz uma pergunta no WhatsApp, no chat da Shopee, ou em um anúncio do Mercado Livre. A mensagem chega instantaneamente.", icon: Smartphone },
  { num: "02", title: "IA analisa e sugere resposta", desc: "A Canggu.ai consulta seu catálogo de produtos, políticas e FAQ para gerar uma resposta precisa em menos de 5 segundos.", icon: Sparkles },
  { num: "03", title: "Você supervisiona e aprova", desc: "Acompanhe pelo dashboard. Assuma conversas, aprove sugestões da IA, ou deixe ela responder automaticamente.", icon: MonitorCheck },
];

export default function HowItWorksSection() {
  const { ref, inView } = useInView(0.1);

  return (
    <section id="como-funciona" className="py-32 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-['Plus_Jakarta_Sans'] font-bold text-[40px] text-foreground text-center max-md:text-3xl">
          Como a Canggu.ai trabalha para você
        </h2>

        <div ref={ref} className="mt-16 grid grid-cols-3 max-md:grid-cols-1 gap-8 relative">
          {/* Dashed line desktop only */}
          <svg className="absolute top-1/2 left-0 w-full h-0.5 -translate-y-1/2 max-md:hidden" preserveAspectRatio="none">
            <line x1="20%" y1="50%" x2="80%" y2="50%" stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray="6 4" />
          </svg>

          {steps.map((s, i) => (
            <div
              key={s.num}
              className={`bg-card border rounded-2xl p-8 relative overflow-hidden transition-all duration-500 ${
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
              }`}
              style={{ transitionDelay: inView ? `${i * 100}ms` : "0ms" }}
            >
              <span className="absolute top-4 left-6 font-['Plus_Jakarta_Sans'] font-extrabold text-[72px] text-primary/[0.12] leading-none select-none">
                {s.num}
              </span>
              <s.icon size={32} className="absolute top-6 right-6 text-primary" />
              <h3 className="font-['Plus_Jakarta_Sans'] font-semibold text-xl text-foreground mt-8">{s.title}</h3>
              <p className="font-['DM_Sans'] text-[15px] text-muted-foreground mt-2">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
