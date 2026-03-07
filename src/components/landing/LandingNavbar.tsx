import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Funcionalidades", href: "#funcionalidades" },
  { label: "Integrações", href: "#integracoes" },
  { label: "Como Funciona", href: "#como-funciona" },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 h-16 px-6 flex items-center justify-between transition-all duration-300 ${
        scrolled ? "bg-white shadow-sm" : "bg-transparent"
      }`}
    >
      <a href="#" className="flex items-center">
        <span className="font-['Plus_Jakarta_Sans'] font-extrabold text-3xl">
          <span className="text-primary">Canggu</span>
          <span className="text-accent">.ai</span>
        </span>
      </a>

      <div className="hidden md:flex items-center gap-8">
        {navLinks.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="font-['DM_Sans'] font-medium text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {l.label}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Link
          to="/login"
          className="bg-primary text-primary-foreground rounded-full px-6 h-10 flex items-center text-sm font-medium hover:shadow-[0_4px_20px_rgba(0,77,77,0.3)] transition-all"
        >
          Acessar Plataforma
        </Link>
        <button
          className="md:hidden text-foreground"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {menuOpen && (
        <div className="absolute top-16 left-0 right-0 bg-white shadow-md md:hidden flex flex-col p-4 gap-3">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="font-['DM_Sans'] font-medium text-sm text-foreground py-2"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
