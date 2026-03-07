// Logo assets — updated 2026-03-07
import whatsappLogo from "@/assets/logos/whatsapp.png";
import mercadolivreLogo from "@/assets/logos/mercadolivre.png";
import shopeeLogo from "@/assets/logos/shopee.png";
import amazonLogo from "@/assets/logos/amazon.png";

const logos = [
  { name: "WhatsApp", src: whatsappLogo, heightPx: 120 },
  { name: "Mercado Livre", src: mercadolivreLogo, heightPx: 120 },
  { name: "Shopee", src: shopeeLogo, heightPx: 120 },
  { name: "Amazon", src: amazonLogo, heightPx: 72 },
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
        <div className="flex min-w-max animate-[marquee_35s_linear_infinite]">
          {[0, 1, 2, 3].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center gap-24 px-12">
              {logos.map((logo) => (
                <img
                  key={logo.name}
                  src={logo.src}
                  alt={logo.name}
                  className="w-auto shrink-0 select-none object-contain max-md:scale-125"
                  style={{ height: `${logo.heightPx}px`, filter: "grayscale(100%)", opacity: 0.6 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
