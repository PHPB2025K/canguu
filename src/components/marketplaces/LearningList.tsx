import { useState } from 'react';
import { GraduationCap, Bot, Check, X, Pencil, Archive, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  useLearnings,
  useApproveCorrection,
  useDiscardCorrection,
  useCurateLearning,
  type Learning,
} from '@/hooks/useMarketplaces';

const CHANNELS = [
  { key: 'mercado_livre', label: 'Marketplace' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
];

function sourceLabel(by: string | null): string {
  if (by === 'daily_learning_ia') return 'Análise diária (IA)';
  if (by?.startsWith('auditoria')) return 'Auditoria';
  if (by === 'admin' || by === 'pedro') return 'Manual';
  return by ?? '—';
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    auto_review: { label: 'Aguardando revisão', cls: 'bg-amber-100 text-amber-700' },
    pending: { label: 'Processando', cls: 'bg-blue-100 text-blue-700' },
    processed: { label: 'Ativo', cls: 'bg-success/15 text-success' },
    dismissed: { label: 'Descartado', cls: 'bg-muted text-muted-foreground' },
    archived: { label: 'Arquivado', cls: 'bg-muted text-muted-foreground' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', s.cls)}>{s.label}</span>;
}

/** Editor de escopo (só no módulo central). Convenção: {all} é canônico para "todos". */
function ScopeEditor({ scope, onChange }: { scope: string[] | null; onChange: (s: string[]) => void }) {
  const isAll = !scope || scope.includes('all');
  const has = (k: string) => isAll || (scope?.includes(k) ?? false);

  const setAll = () => onChange(['all']);
  const toggle = (k: string) => {
    let next: string[];
    if (isAll) next = CHANNELS.map(c => c.key).filter(c => c !== k); // tira um dos "todos"
    else next = has(k) ? scope!.filter(s => s !== k) : [...(scope ?? []), k];
    if (next.length === 0) next = ['all'];
    if (CHANNELS.every(c => next.includes(c.key))) next = ['all']; // 3 canais => {all} canônico
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground">Aplica em:</span>
      <button onClick={setAll} className={cn('px-2 py-0.5 rounded-full text-xs border', isAll ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted')}>Todos</button>
      {CHANNELS.map(c => (
        <button key={c.key} onClick={() => toggle(c.key)} className={cn('px-2 py-0.5 rounded-full text-xs border', !isAll && has(c.key) ? 'bg-primary/15 text-primary border-primary/40' : 'border-border text-muted-foreground hover:bg-muted')}>{c.label}</button>
      ))}
    </div>
  );
}

function ScopeChips({ scope }: { scope: string[] | null }) {
  const items = !scope || scope.includes('all') ? ['Todos os canais'] : scope.map(s => CHANNELS.find(c => c.key === s)?.label ?? s);
  return (
    <span className="inline-flex gap-1 flex-wrap">
      {items.map(i => <span key={i} className="px-1.5 py-0.5 rounded text-[11px] bg-primary/10 text-primary">{i}</span>)}
    </span>
  );
}

function LearningCard({ c, curation }: { c: Learning; curation: boolean }) {
  const [text, setText] = useState(c.recommended_response);
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();
  const approve = useApproveCorrection();
  const discard = useDiscardCorrection();
  const curate = useCurateLearning();
  const dirty = text.trim() !== c.recommended_response.trim();
  const isQueued = c.status === 'auto_review';

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={c.status} />
          <ScopeChips scope={c.scope} />
        </div>
        <span className="text-xs text-muted-foreground">
          {sourceLabel(c.corrected_by)}
          {c.origin_channel ? ` · origem ${c.origin_channel}` : ''}
          {c.category ? ` · ${c.category}` : ''}
          {c.product_sku ? ` · ${c.product_sku}` : ''}
          {c.created_at ? ` · ${formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}` : ''}
        </span>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-0.5">Pergunta</p>
        <p className="text-sm text-foreground">{c.original_question}</p>
      </div>

      {c.ai_response && (
        <div className="bg-destructive/5 border border-destructive/15 rounded-lg p-3">
          <p className="text-xs font-medium text-destructive mb-0.5 flex items-center gap-1"><Bot className="h-3 w-3" /> Resposta da Ana (inadequada)</p>
          <p className="text-sm text-foreground">{c.ai_response}</p>
        </div>
      )}

      <div className="bg-success/5 border border-success/20 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-success">Aprendizado (resposta correta)</p>
          {!editing && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(true)}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>}
        </div>
        {editing
          ? <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className="bg-white text-sm" />
          : <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>}
      </div>

      {curation && <ScopeEditor scope={c.scope} onChange={(s) => curate.mutate({ id: c.id, scope: s }, { onSuccess: () => toast({ title: 'Escopo atualizado' }) })} />}

      <div className="flex items-center gap-2 flex-wrap">
        {isQueued && (
          <Button size="sm" disabled={approve.isPending} style={{ backgroundColor: '#004D4D', color: 'white' }}
            onClick={() => approve.mutate({ id: c.id, recommendedResponse: dirty ? text : undefined }, { onSuccess: () => toast({ title: '✅ Aprovado', description: 'A Ana já vai usar como referência.' }) })}>
            <Check className="h-4 w-4 mr-1" />{dirty ? 'Salvar e aprovar' : 'Aprovar'}
          </Button>
        )}
        {!isQueued && editing && dirty && (
          <Button size="sm" disabled={curate.isPending} style={{ backgroundColor: '#004D4D', color: 'white' }}
            onClick={() => curate.mutate({ id: c.id, recommended_response: text }, { onSuccess: () => { toast({ title: 'Texto atualizado' }); setEditing(false); } })}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> Salvar alteração
          </Button>
        )}
        {isQueued && (
          <Button size="sm" variant="ghost" disabled={discard.isPending}
            onClick={() => discard.mutate(c.id, { onSuccess: () => toast({ title: 'Descartado' }) })}>
            <X className="h-4 w-4 mr-1" /> Descartar
          </Button>
        )}
        {curation && !isQueued && c.status !== 'archived' && (
          <Button size="sm" variant="ghost" disabled={curate.isPending}
            onClick={() => curate.mutate({ id: c.id, status: 'archived' }, { onSuccess: () => toast({ title: 'Arquivado' }) })}>
            <Archive className="h-4 w-4 mr-1" /> Arquivar
          </Button>
        )}
        {editing && <Button size="sm" variant="ghost" onClick={() => { setText(c.recommended_response); setEditing(false); }}>Cancelar</Button>}
      </div>
    </div>
  );
}

export function LearningList({ channel, curation = false, statuses }: { channel?: string; curation?: boolean; statuses?: string[] }) {
  const { data, isLoading, isError, refetch } = useLearnings({ channel, statuses });

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-16 w-full" /></div>)}</div>;
  if (isError) return <div className="flex flex-col items-center py-12 text-center"><p className="text-sm text-destructive mb-2">Erro ao carregar aprendizados</p><Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button></div>;
  if (!data || data.length === 0) return <div className="flex flex-col items-center py-16 text-center"><GraduationCap className="h-12 w-12 text-muted-foreground mb-3" /><p className="text-base font-medium text-foreground">Nenhum aprendizado por aqui</p><p className="text-sm text-muted-foreground mt-1">Tudo em dia neste recorte.</p></div>;

  return <div className="space-y-3">{data.map((c) => <LearningCard key={c.id} c={c} curation={curation} />)}</div>;
}
