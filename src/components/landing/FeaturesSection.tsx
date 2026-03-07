import { MessageSquare, Store, MessagesSquare, Package, BarChart3, FileText } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const features = [
  { title: "Atendimento WhatsApp com IA", icon: MessageSquare, iconClass: "text-primary bg-primary/10", desc: "A IA responde clientes 24/7 no WhatsApp, tira dúvidas sobre produtos, envia links de compra e escala para humanos quando necessário." },
  { title: "Perguntas de Marketplaces", icon: Store, iconClass: "text-accent bg-accent/10", desc: "Responda perguntas de anúncios no Mercado Livre, Shopee e Amazon de uma única interface. A IA sugere respostas baseadas no seu catálogo." },
  { title: "Chat Omnichannel", icon: MessagesSquare, iconClass: "text-primary bg-primary/10", desc: "Conversas de chat da Shopee, Amazon e ML centralizadas no mesmo painel. Veja tudo, responda de um lugar só." },
  { title: "Gestão de Produtos", icon: Package, iconClass: "text-gold bg-gold/10", desc: "Cadastre e edite produtos com todos os campos. A IA consulta seu catálogo real automaticamente para responder com informações precisas." },
  { title: "Analytics e Relatórios", icon: BarChart3, iconClass: "text-secondary bg-secondary/10", desc: "Métricas de atendimento, sentimento dos clientes, tempo de resposta e custo operacional em dashboards visuais." },
  { title: "Políticas e FAQ Inteligentes", icon: FileText, iconClass: "text-primary bg-primary/10", desc: "Cadastre políticas de troca, entrega e garantia. A IA consulta automaticamente antes de responder, garantindo consistência." },
];

export default function FeaturesSection() {
  const { ref, inView } = useInView(0.1);

  return (
    <section id="funcionalidades" className="py-32 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-['Plus_Jakarta_Sans'] font-bold text-[40px] text-foreground text-center max-md:text-3xl">
          Tudo que você precisa em uma única plataforma
        </h2>
        <p className="font-['DM_Sans'] text-lg text-muted-foreground text-center max-w-xl mx-auto mt-4">
          Gerencie atendimento, produtos e análises sem alternar entre abas
        </p>

        <div ref={ref} className="mt-16 grid grid-cols-3 md:grid-cols-2 max-md:grid-cols-1 gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`bg-card border rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(19,37,37,0.10)] hover:border-primary/20 ${
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
              }`}
              style={{ transitionDelay: inView ? `${i * 100}ms` : "0ms" }}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${f.iconClass}`}>
                <f.icon size={24} />
              </div>
              <h3 className="font-['Plus_Jakarta_Sans'] font-semibold text-lg text-foreground mt-4">{f.title}</h3>
              <p className="font-['DM_Sans'] text-[15px] text-muted-foreground mt-2">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
