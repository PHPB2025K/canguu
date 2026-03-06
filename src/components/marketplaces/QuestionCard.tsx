import { useState } from 'react';
import { CheckCircle, Circle, Sparkles, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PlatformBadge } from './PlatformBadge';
import { useAnswerQuestion, useRejectSuggestion } from '@/hooks/useMarketplaces';
import { useToast } from '@/hooks/use-toast';
import type { MarketplaceQuestion } from '@/types/database';
import { format } from 'date-fns';

const statusConfig: Record<string, { label: string; className: string; icon: typeof Circle }> = {
  unanswered: { label: 'Não respondida', className: 'bg-warning/15 text-warning', icon: Circle },
  answered: { label: 'Respondida', className: 'bg-success/15 text-success', icon: CheckCircle },
  ai_suggested: { label: 'Sugestão IA', className: 'bg-primary/10 text-primary', icon: Sparkles },
};

export function QuestionCard({ question }: { question: MarketplaceQuestion }) {
  const [expanded, setExpanded] = useState(false);
  const [manualAnswer, setManualAnswer] = useState('');
  const { toast } = useToast();
  const answerMutation = useAnswerQuestion();
  const rejectMutation = useRejectSuggestion();

  const status = statusConfig[question.status] ?? statusConfig.unanswered;
  const StatusIcon = status.icon;
  const relativeTime = question.created_at
    ? formatDistanceToNow(new Date(question.created_at), { addSuffix: true, locale: ptBR })
    : '';

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

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-4 transition-shadow cursor-pointer',
        expanded ? 'shadow-md' : 'hover:shadow-sm'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <PlatformBadge platform={question.platform} />
          <span className="text-xs text-muted-foreground">{relativeTime}</span>
        </div>
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', status.className)}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </span>
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
