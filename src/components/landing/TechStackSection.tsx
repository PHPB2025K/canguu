const techs = [
  { name: "Claude AI", label: "Motor de IA" },
  { name: "Supabase", label: "Banco de dados realtime" },
  { name: "Evolution API", label: "WhatsApp Business" },
  { name: "React", label: "Interface moderna" },
  { name: "N8N", label: "Automação de workflows" },
];

export default function TechStackSection() {
  return (
    <section className="py-24 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-['Plus_Jakarta_Sans'] font-bold text-[32px] text-foreground text-center max-md:text-2xl">
          Construído com tecnologia de ponta
        </h2>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          {techs.map((t) => (
            <span key={t.name} className="bg-card border rounded-full px-5 py-2 flex items-center gap-2">
              <span className="font-['DM_Sans'] font-semibold text-sm text-foreground">{t.name}</span>
              <span className="font-['DM_Sans'] text-[13px] text-muted-foreground">— {t.label}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
