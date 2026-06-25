import { LearningList } from './LearningList';

/** Recorte da base ÚNICA de aprendizados para o canal Marketplace (escopo marketplace + transversais). */
export function LearningTab() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pb-3">
        <p className="text-sm text-muted-foreground">
          Aprendizados que se aplicam ao Marketplace (específicos + transversais). É um recorte da base
          central — aprovar/editar aqui reflete em todos os lugares. Gestão completa no módulo Aprendizados.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <LearningList channel="mercado_livre" />
      </div>
    </div>
  );
}
