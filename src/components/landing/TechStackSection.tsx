import { Brain, Database, MessageCircle, Monitor, Workflow } from "lucide-react";

const techs = [
  { label: "Motor de IA", icon: Brain },
  { label: "Banco de dados realtime", icon: Database },
  { label: "WhatsApp Business", icon: MessageCircle },
  { label: "Interface moderna", icon: Monitor },
  { label: "Workflows automatizados", icon: Workflow },
];

export default function TechStackSection() {
  return (
    <section className="py-24 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-['Plus_Jakarta_Sans'] font-bold text-[32px] text-foreground text-center max-md:text-2xl">
          Construído com tecnologia de ponta
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-10">
          {techs.map((t) => (
            <div
              key={t.label}
              className="bg-card border rounded-xl p-6 flex flex-col items-center gap-3 text-center"
            >
              <t.icon className="text-primary" size={28} />
              <span className="font-['DM_Sans'] font-semibold text-sm text-foreground">
                {t.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
