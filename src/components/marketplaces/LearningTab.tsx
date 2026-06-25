import { useState } from 'react';
import { GraduationCap, Bot, Check, X, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useLearningQueue,
  useApproveCorrection,
  useDiscardCorrection,
  type LearningCorrection,
} from '@/hooks/useMarketplaces';

function sourceLabel(by: string | null): string {
  if (by === 'daily_learning_ia') return 'Análise diária (IA)';
  if (by === 'auditoria_ia_2026_06') return 'Auditoria';
  return by ?? '—';
}

function CorrectionCard({ c }: { c: LearningCorrection }) {
  const [text, setText] = useState(c.recommended_response);
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();
  const approve = useApproveCorrection();
  const discard = useDiscardCorrection();

  const dirty = text.trim() !== c.recommended_response.trim();

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <GraduationCap className="h-3 w-3" /> Aguardando revisão
        </span>
        <span className="text-xs text-muted-foreground">
          {sourceLabel(c.corrected_by)}
          {c.product_sku ? ` · ${c.product_sku}` : ''}
          {c.created_at ? ` · ${formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}` : ''}
        </span>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-0.5">Pergunta do cliente</p>
        <p className="text-sm text-foreground">{c.original_question}</p>
      </div>

      {c.ai_response && (
        <div className="bg-destructive/5 border border-destructive/15 rounded-lg p-3">
          <p className="text-xs font-medium text-destructive mb-0.5 flex items-center gap-1">
            <Bot className="h-3 w-3" /> Resposta da Ana (marcada como inadequada)
          </p>
          <p className="text-sm text-foreground">{c.ai_response}</p>
        </div>
      )}

      <div className="bg-success/5 border border-success/20 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-success">Como a Ana deveria responder (aprendizado)</p>
          {!editing && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Editar
            </Button>
          )}
        </div>
        {editing ? (
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className="bg-white text-sm" />
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={approve.isPending}
          style={{ backgroundColor: '#004D4D', color: 'white' }}
          onClick={() =>
            approve.mutate(
              { id: c.id, recommendedResponse: dirty ? text : undefined },
              { onSuccess: () => toast({ title: '✅ Aprendizado aprovado', description: dirty ? 'Texto editado salvo — a Ana já vai usar.' : 'A Ana já vai usar nas próximas perguntas similares.' }) }
            )
          }
        >
          <Check className="h-4 w-4 mr-1" />
          {dirty ? 'Salvar e aprovar' : 'Aprovar'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={discard.isPending}
          onClick={() => discard.mutate(c.id, { onSuccess: () => toast({ title: 'Descartado', description: 'Não será usado pela Ana.' }) })}
        >
          <X className="h-4 w-4 mr-1" /> Descartar
        </Button>
        {editing && (
          <Button size="sm" variant="ghost" onClick={() => { setText(c.recommended_response); setEditing(false); }}>
            Cancelar edição
          </Button>
        )}
      </div>
    </div>
  );
}

export function LearningTab() {
  const { data: queue, isLoading, isError, refetch } = useLearningQueue();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pb-3">
        <p className="text-sm text-muted-foreground">
          Correções geradas automaticamente (auditoria e análise diária) que aguardam sua aprovação.
          Ao aprovar, a Ana passa a usar como referência nos 3 canais. Você pode editar antes de aprovar.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center py-12 text-center">
            <p className="text-sm text-destructive mb-2">Erro ao carregar a fila de aprendizados</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        )}
        {!isLoading && !isError && (queue?.length ?? 0) === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <GraduationCap className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-base font-medium text-foreground">Nenhum aprendizado pendente 🎉</p>
            <p className="text-sm text-muted-foreground mt-1">Tudo revisado por aqui!</p>
          </div>
        )}
        {!isLoading && !isError && queue && queue.length > 0 && (
          <div className="space-y-3">
            {queue.map((c) => <CorrectionCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}
