import { useInView } from "@/hooks/useInView";
import { useEffect, useRef, useState } from "react";

function useCounter(target: number, inView: boolean, duration = 1500) {
  const [value, setValue] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(parseFloat((eased * target).toFixed(1)));
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [inView, target, duration]);

  return value;
}

const metrics = [
  { target: 5, prefix: "< ", suffix: "s", label: "Tempo médio de resposta" },
  { target: 24, prefix: "", suffix: "/7", label: "Disponibilidade" },
  { target: 4, prefix: "", suffix: "+", label: "Plataformas integradas" },
  { target: 99.9, prefix: "", suffix: "%", label: "Uptime da infraestrutura" },
];

export default function MetricsSection() {
  const { ref, inView } = useInView(0.2);

  return (
    <section className="py-24 px-6 bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--foreground))]" ref={ref}>
      <div className="max-w-7xl mx-auto grid grid-cols-4 max-md:grid-cols-2 gap-8 text-center">
        {metrics.map((m, i) => (
          <MetricItem key={m.label} metric={m} inView={inView} index={i} total={metrics.length} />
        ))}
      </div>
    </section>
  );
}

function MetricItem({ metric, inView, index, total }: { metric: typeof metrics[0]; inView: boolean; index: number; total: number }) {
  const count = useCounter(metric.target, inView);
  const display = metric.target % 1 === 0 ? Math.round(count) : count;

  return (
    <div className="flex items-center justify-center gap-8">
      <div>
        <p className="font-['Plus_Jakarta_Sans'] font-extrabold text-5xl text-white max-md:text-3xl">
          {metric.prefix}{display}{metric.suffix}
        </p>
        <p className="font-['DM_Sans'] text-sm text-white/70 mt-1">{metric.label}</p>
      </div>
      {index < total - 1 && (
        <div className="w-px h-16 bg-white/15 max-md:hidden ml-8" />
      )}
    </div>
  );
}
