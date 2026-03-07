import { Link } from "react-router-dom";

export default function CTASection() {
  return (
    <section className="py-32 px-6" style={{ background: "linear-gradient(to bottom, hsl(var(--background)), white)" }}>
      <div className="max-w-2xl mx-auto bg-card border rounded-3xl p-12 text-center shadow-[0_16px_60px_rgba(19,37,37,0.10)]">
        <span className="inline-block bg-accent/10 text-accent rounded-full px-4 py-1.5 text-sm font-medium">
          Demonstração disponível
        </span>
        <h2 className="mt-4 font-['Plus_Jakarta_Sans'] font-bold text-4xl text-foreground max-md:text-[28px]">
          Pronto para automatizar seu atendimento?
        </h2>
        <p className="mt-2 font-['DM_Sans'] text-lg text-muted-foreground">
          Acesse a plataforma e veja a Canggu.ai em ação.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center bg-primary text-primary-foreground h-14 px-10 rounded-full text-lg font-medium hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(0,77,77,0.3)] transition-all"
        >
          Acessar Plataforma →
        </Link>
        <p className="mt-3 font-['DM_Sans'] text-[13px] text-muted-foreground">
          Entre com as credenciais de demonstração
        </p>
      </div>
    </section>
  );
}
