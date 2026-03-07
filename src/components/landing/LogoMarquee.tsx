// Logo assets — updated 2026-03-07
import whatsappLogo from "@/assets/logos/whatsapp.png";
import mercadolivreLogo from "@/assets/logos/mercadolivre.png";
import shopeeLogo from "@/assets/logos/shopee.png";
import amazonLogo from "@/assets/logos/amazon.png";

const logos = [
  { name: "WhatsApp", src: whatsappLogo },
  { name: "Mercado Livre", src: mercadolivreLogo },
  { name: "Shopee", src: shopeeLogo },
  { name: "Amazon", src: amazonLogo },
];

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
        <div className="flex items-center gap-24 animate-[marquee_35s_linear_infinite]">
          {[...logos, ...logos].map((logo, i) => (
            <img
              key={i}
              src={logo.src}
              alt={logo.name}
              className="h-16 w-auto select-none"
              style={{ filter: "grayscale(100%)", opacity: 0.45 }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
