import { LearningList } from './LearningList';

/** Recorte da base ÚNICA de aprendizados para o canal Marketplace (escopo marketplace + transversais). */
export function LearningTab() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pb-3">
        <p className="text-sm text-muted-foreground">
          Aprendizados deste canal aguardando sua revisão. Aprovar/editar aqui reflete em todos os lugares.
          O histórico completo (aprovados, arquivados) fica no módulo Aprendizados.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <LearningList channel="mercado_livre" statuses={['auto_review']} />
      </div>
    </div>
  );
}
