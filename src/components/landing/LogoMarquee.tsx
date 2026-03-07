const logos = ["WhatsApp", "Mercado Livre", "Shopee", "Amazon", "Supabase", "Claude AI", "Evolution API", "N8N"];

export default function LogoMarquee() {
  return (
    <section className="bg-white border-t border-b py-12 pt-[72px] overflow-hidden">
      <p className="text-sm uppercase tracking-widest text-muted-foreground text-center mb-8 font-['DM_Sans']">
        Integrado com as plataformas que você já usa
      </p>
      <div
        className="flex items-center"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        }}
      >
        <div className="flex items-center gap-20 animate-[marquee_35s_linear_infinite]">
          {[...logos, ...logos].map((name, i) => (
            <span key={i} className="font-bold text-lg uppercase text-[#AAA] whitespace-nowrap select-none opacity-45">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
