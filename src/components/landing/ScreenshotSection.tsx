import { Zap, Sparkles, Link as LinkIcon } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const highlights = [
  { icon: Zap, text: "Respostas com IA em < 5 segundos" },
  { icon: Sparkles, text: "Sugestão inteligente com aprovação humana" },
  { icon: LinkIcon, text: "Integrado com 4+ plataformas" },
];

export default function ScreenshotSection() {
  const { ref, inView } = useInView();

  return (
    <section className="py-32 px-6 bg-white" ref={ref}>
      <div className="max-w-7xl mx-auto">
        <h2 className="font-['Plus_Jakarta_Sans'] font-bold text-[40px] text-foreground text-center max-md:text-3xl">
          Veja a plataforma em ação
        </h2>
        <p className="font-['DM_Sans'] text-lg text-muted-foreground text-center mt-4">
          Dashboard completo para gestão de atendimento omnichannel
        </p>

        <div className="mt-12 max-w-5xl mx-auto relative">
          <div className="absolute inset-0 flex items-center justify-center -z-0">
            <div className="w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
          </div>
          <div
            className={`relative z-10 shadow-[0_25px_80px_rgba(19,37,37,0.15)] rounded-xl overflow-hidden transition-all duration-500 ${
              inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
            }`}
          >
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

        <div className="flex gap-8 justify-center mt-12 flex-wrap max-md:flex-col max-md:items-center">
          {highlights.map((h) => (
            <div key={h.text} className="flex items-center gap-2">
              <h.icon size={20} className="text-primary" />
              <span className="font-['DM_Sans'] font-medium text-sm text-foreground">{h.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
