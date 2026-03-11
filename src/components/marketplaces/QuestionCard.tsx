import { useState } from 'react';
import { Bot, CheckCircle, Circle, Sparkles, User, AlertCircle, MinusCircle, Zap } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PlatformBadge } from './PlatformBadge';
import { useAnswerQuestion, useRejectSuggestion } from '@/hooks/useMarketplaces';
import { useToast } from '@/hooks/use-toast';
import type { MarketplaceQuestion } from '@/types/database';

const statusConfig: Record<string, { label: string; className: string; icon: typeof Circle }> = {
  unanswered: { label: 'Não respondida', className: 'bg-warning/15 text-warning', icon: Circle },
  answered: { label: 'Respondida', className: 'bg-success/15 text-success', icon: CheckCircle },
  ai_suggested: { label: 'Sugestão IA', className: 'bg-primary/10 text-primary', icon: Sparkles },
  failed: { label: 'Erro', className: 'bg-destructive/10 text-destructive', icon: AlertCircle },
  skipped: { label: 'Ignorada', className: 'bg-muted text-muted-foreground', icon: MinusCircle },
};

function AiResponseTimeBadge({ ms }: { ms: number }) {
  const seconds = Math.round(ms / 100) / 10;
  const colorClass = ms < 5000
    ? 'bg-success/15 text-success'
    : ms < 10000
      ? 'bg-warning/15 text-warning'
      : 'bg-destructive/15 text-destructive';

  return (
    <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium', colorClass)}>
      <Zap className="h-3 w-3" />
      {seconds}s
    </span>
  );
}

function AnsweredByBadge({ answeredBy }: { answeredBy: string }) {
  if (answeredBy === 'ai_agent' || answeredBy === 'ai') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
        <Bot className="h-3 w-3" />
        IA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-success/10 text-success">
      <User className="h-3 w-3" />
      Manual
    </span>
  );
}

export function QuestionCard({ question }: { question: MarketplaceQuestion }) {
  const [expanded, setExpanded] = useState(false);
  const [manualAnswer, setManualAnswer] = useState('');
  const { toast } = useToast();
  const answerMutation = useAnswerQuestion();
  const rejectMutation = useRejectSuggestion();

  const status = statusConfig[question.status] ?? statusConfig.unanswered;
  const StatusIcon = status.icon;
  const displayDate = question.external_created_at ?? question.created_at;
  const relativeTime = displayDate
    ? formatDistanceToNow(new Date(displayDate), { addSuffix: true, locale: ptBR })
    : '';

  const isFailed = question.status === 'failed';

  const handleApprove = () => {
    if (!question.ai_suggested_answer) return;
    answerMutation.mutate(
      { id: question.id, answer_text: question.ai_suggested_answer, answered_by: 'ai_agent' },
      { onSuccess: () => toast({ title: 'Resposta enviada!' }) }
    );
  };

  const handleEdit = () => {
    setManualAnswer(question.ai_suggested_answer ?? '');
  };

  const handleReject = () => {
    rejectMutation.mutate(question.id, {
      onSuccess: () => toast({ title: 'Sugestão descartada', description: 'A pergunta voltou para não respondidas.' }),
    });
  };

  const handleSendManual = () => {
    if (!manualAnswer.trim()) return;
    answerMutation.mutate(
      { id: question.id, answer_text: manualAnswer.trim(), answered_by: 'human' },
      { onSuccess: () => { toast({ title: 'Resposta enviada!' }); setManualAnswer(''); } }
    );
  };

  const statusBadge = (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', status.className)}>
      <StatusIcon className="h-3 w-3" />
      {status.label}
    </span>
  );

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-4 transition-shadow cursor-pointer',
        expanded ? 'shadow-md' : 'hover:shadow-sm',
        isFailed && 'border-l-[3px] border-l-destructive'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <PlatformBadge platform={question.platform} />
          <span className="text-xs text-muted-foreground">{relativeTime}</span>
          {question.ai_response_time_ms != null && (
            <AiResponseTimeBadge ms={question.ai_response_time_ms} />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {question.answered_by && <AnsweredByBadge answeredBy={question.answered_by} />}
          {isFailed && question.error_message ? (
            <Tooltip>
              <TooltipTrigger asChild>{statusBadge}</TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{question.error_message}</TooltipContent>
            </Tooltip>
          ) : (
            statusBadge
          )}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{question.product_name}</p>
        <p className="text-sm text-foreground">{question.question_text}</p>
        <p className="text-xs text-muted-foreground">
          <User className="inline h-3 w-3 mr-1" />
          {question.buyer_nickname}
        </p>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* AI suggestion */}
          {question.status === 'ai_suggested' && question.ai_suggested_answer && (
            <div className="bg-porcelain border border-dashed border-primary rounded-lg p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Sugestão da Giovana</span>
              </div>
              <p className="text-sm text-foreground mb-3">{question.ai_suggested_answer}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleApprove} disabled={answerMutation.isPending}>
                  Aprovar e Enviar
                </Button>
                <Button size="sm" variant="outline" onClick={handleEdit}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={handleReject} disabled={rejectMutation.isPending}>
                  Rejeitar
                </Button>
              </div>
            </div>
          )}

          {/* Answered display */}
          {question.status === 'answered' && question.answer_text && (
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-foreground">{question.answer_text}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Respondida por {question.answered_by === 'ai_agent' ? 'IA' : 'humano'}
                {question.answered_at && ` em ${format(new Date(question.answered_at), 'dd/MM/yyyy HH:mm')}`}
              </p>
            </div>
          )}

          {/* Failed display */}
          {isFailed && question.error_message && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm text-destructive font-medium mb-1">Erro ao processar</p>
              <p className="text-xs text-muted-foreground">{question.error_message}</p>
            </div>
          )}

          {/* Manual answer */}
          {question.status !== 'answered' && (
            <div className="space-y-2">
              <Textarea
                placeholder="Digite sua resposta..."
                value={manualAnswer}
                onChange={(e) => setManualAnswer(e.target.value)}
                rows={2}
              />
              <Button size="sm" onClick={handleSendManual} disabled={!manualAnswer.trim() || answerMutation.isPending}>
                Enviar Resposta
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
