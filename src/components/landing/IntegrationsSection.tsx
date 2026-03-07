import { useInView } from "@/hooks/useInView";

const integrations = [
  { name: "WhatsApp", borderHover: "hover:border-[#25D366]", desc: "Atendimento automatizado 24/7", badge: "Ativo ✓", badgeClass: "bg-success/10 text-success" },
  { name: "Mercado Livre", borderHover: "hover:border-[#FFE600]", desc: "Respostas automáticas a perguntas", badge: "Ativo ✓", badgeClass: "bg-success/10 text-success" },
  { name: "Shopee", borderHover: "hover:border-[#EE4D2D]", desc: "Chat e perguntas com sugestão de IA", badge: "Em breve", badgeClass: "bg-muted text-muted-foreground" },
  { name: "Amazon", borderHover: "hover:border-[#FF9900]", desc: "Perguntas com respostas inteligentes", badge: "Ativo ✓", badgeClass: "bg-success/10 text-success" },
];

export default function IntegrationsSection() {
  const { ref, inView } = useInView(0.1);

  return (
    <section id="integracoes" className="py-32 px-6 bg-white">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-['Plus_Jakarta_Sans'] font-bold text-[40px] text-foreground text-center max-md:text-3xl">
          Conectado onde seus clientes estão
        </h2>

        <div ref={ref} className="mt-12 grid grid-cols-5 md:grid-cols-3 max-md:grid-cols-2 gap-6">
          {integrations.map((ig, i) => (
            <div
              key={ig.name}
              className={`bg-card border rounded-2xl p-6 text-center transition-all duration-300 ${ig.borderHover} ${
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
              }`}
              style={{ transitionDelay: inView ? `${i * 100}ms` : "0ms" }}
            >
              <span className="text-xs font-bold uppercase text-[#AAA] mb-3 block">{ig.name}</span>
              <p className="font-['Plus_Jakarta_Sans'] font-semibold text-[15px] text-foreground">{ig.name}</p>
              <p className="font-['DM_Sans'] text-[13px] text-muted-foreground mt-2">{ig.desc}</p>
              <span className={`inline-block rounded-full px-3 py-1 text-xs mt-3 ${ig.badgeClass}`}>{ig.badge}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
