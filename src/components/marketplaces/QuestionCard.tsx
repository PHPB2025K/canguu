import { useState } from 'react';
import { Bot, CheckCircle, Circle, Sparkles, User, AlertCircle, MinusCircle, Zap } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { mlAccountLabel } from '@/lib/marketplace-accounts';
import { PlatformBadge } from './PlatformBadge';
import { useAnswerQuestion, useRejectSuggestion, useFeedbackQuestion, useSubmitCorrection, useResolveMLHandoff } from '@/hooks/useMarketplaces';
import { useToast } from '@/hooks/use-toast';
import type { MarketplaceQuestion } from '@/types/database';

const statusConfig: Record<string, { label: string; className: string; icon: typeof Circle }> = {
  unanswered: { label: 'Não respondida', className: 'bg-warning/15 text-warning', icon: Circle },
  pending: { label: 'Atendimento humano', className: 'bg-warning/15 text-warning', icon: User },
  answered: { label: 'Respondida', className: 'bg-success/15 text-success', icon: CheckCircle },
  ai_suggested: { label: 'Sugestão IA', className: 'bg-primary/10 text-primary', icon: Sparkles },
  failed: { label: 'Erro', className: 'bg-destructive/10 text-destructive', icon: AlertCircle },
  skipped: { label: 'Ignorada', className: 'bg-muted text-muted-foreground', icon: MinusCircle },
  already_answered: { label: 'Respondida externamente', className: 'bg-warning/15 text-warning', icon: CheckCircle },
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
  if (answeredBy === 'ai_agent' || answeredBy === 'ai' || answeredBy === 'ai_handoff') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
        <Bot className="h-3 w-3" />
        {answeredBy === 'ai_handoff' ? 'Acolhimento ANA' : 'IA'}
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

// Indica se a resposta já foi analisada (feedback dado à Ana) e qual o veredito.
function AnalysisBadge({ feedback }: { feedback?: string | null }) {
  if (feedback === 'good') {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-success/15 text-success"
        title="Analisada — resposta aprovada"
      >
        <CheckCircle className="h-3 w-3" />
        Analisada
      </span>
    );
  }
  if (feedback === 'bad') {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700"
        title="Analisada — precisa de correção"
      >
        📝 A corrigir
      </span>
    );
  }
  return null;
}

export function QuestionCard({ question }: { question: MarketplaceQuestion }) {
  const [expanded, setExpanded] = useState(false);
  const [manualAnswer, setManualAnswer] = useState('');
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const { toast } = useToast();
  const answerMutation = useAnswerQuestion();
  const rejectMutation = useRejectSuggestion();
  const feedbackMutation = useFeedbackQuestion();
  const correctionMutation = useSubmitCorrection();
  const resolutionMutation = useResolveMLHandoff();
  const handoff = question.platform === 'mercado_livre' ? (question.ai_classification as any)?.handoff : null;

  const status = handoff?.resolved_at
    ? { label: 'Tratado internamente', className: 'bg-success/15 text-success', icon: CheckCircle }
    : statusConfig[question.status] ?? statusConfig.unanswered;
  const StatusIcon = status.icon;
  const displayDate = question.external_created_at ?? question.created_at;
  const relativeTime = displayDate
    ? formatDistanceToNow(new Date(displayDate), { addSuffix: true, locale: ptBR })
    : '';

  const isFailed = question.status === 'failed';
  const isAlreadyAnswered = question.status === 'already_answered';
  const isSkipped = question.status === 'skipped';
  const hasErrorMessage = !!question.error_message;
  const hasAiSuggestion = !!question.ai_suggested_answer;

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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={question.platform} />
          {question.platform === 'mercado_livre' && (
            <span className="text-xs font-semibold bg-primary/10 text-primary rounded px-2 py-1">
              {mlAccountLabel(question.seller_id)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{relativeTime}</span>
          {question.ai_response_time_ms != null && (
            <AiResponseTimeBadge ms={question.ai_response_time_ms} />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {question.answered_by && <AnsweredByBadge answeredBy={question.answered_by} />}
          <AnalysisBadge feedback={(question as any).feedback} />
          {(isFailed || isAlreadyAnswered || isSkipped) && hasErrorMessage ? (
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
        <p className="text-sm font-medium text-foreground">
          {question.product_name}
          {question.platform_item_id && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{question.platform_item_id}</span>
          )}
        </p>
        <p className="text-sm text-foreground">{question.question_text}</p>
        <p className="text-xs text-muted-foreground">
          <User className="inline h-3 w-3 mr-1" />
          {question.buyer_nickname}
        </p>
      </div>

      {!expanded && question.answer_text && (
        <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium mb-1">{question.answered_by === 'ai_handoff' ? 'Acolhimento da ANA'
            : ['ai_agent', 'ai'].includes(question.answered_by || '') ? 'Resposta da ANA' : 'Resposta enviada'}</p>
          <p className="whitespace-pre-wrap">{question.answer_text}</p>
          {question.answered_at && <p className="mt-2 text-xs text-muted-foreground">Enviada em {format(new Date(question.answered_at), 'dd/MM/yyyy HH:mm')}</p>}
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          {handoff?.required && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
              <p className="text-sm font-medium">{handoff.resolved_at ? 'Acompanhamento concluído' : 'Acolhimento e acompanhamento humano'}</p>
              <p className="text-sm">
                {handoff.ack_status === 'verified' ? (handoff.resolved_at ? 'Acolhimento confirmado no anúncio. O tratamento interno está concluído.' : 'Acolhimento confirmado no anúncio. A dúvida continua sob responsabilidade da equipe até o registro da resolução.')
                  : handoff.ack_status === 'external_answer' ? 'Foi confirmada uma resposta de outro atendimento no Mercado Livre. Confira se ela resolve a dúvida.'
                  : handoff.ack_status === 'unavailable' ? 'O Mercado Livre não permite mais responder a esta pergunta. Registre o encaminhamento adotado.'
                  : 'O acolhimento ainda não foi confirmado. A ANA continuará tentando; a pendência permanece aberta.'}
              </p>
              {question.answer_text && <p className="rounded bg-background p-3 text-sm">{question.answer_text}</p>}
              <p className="text-xs text-muted-foreground">Motivo interno: {handoff.reason}</p>
              {handoff.resolved_at ? (
                <div className="text-sm"><p>{handoff.resolution_note}</p><p className="text-xs text-muted-foreground">Resolvido em {format(new Date(handoff.resolved_at), 'dd/MM/yyyy HH:mm')}. Registro interno, sem novo envio ao cliente.</p></div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">O ML aceita uma única resposta por pergunta. Confirme a informação e atualize o cadastro ou anúncio quando necessário. O acolhimento orienta uma nova pergunta para consultar a confirmação; casos de pedido seguem por Minhas Compras.</p>
                  <Textarea placeholder="Registre o que foi confirmado, a fonte e a ação tomada pela equipe. Este texto é interno e não será enviado ao cliente." value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} rows={3} maxLength={2000} />
                  <Button size="sm" disabled={resolutionNote.trim().length < 20 || resolutionMutation.isPending || !['verified', 'external_answer', 'unavailable'].includes(handoff.ack_status)} onClick={() => resolutionMutation.mutate({id: question.id, note: resolutionNote.trim()}, {
                    onSuccess: () => {toast({title: 'Resolução interna registrada', description: 'Nenhuma nova resposta foi enviada ao Mercado Livre.'}); setResolutionNote('');},
                    onError: (e) => toast({title: 'Não foi possível registrar', description: e.message, variant: 'destructive'}),
                  })}>Registrar resolução interna</Button>
                </>
              )}
            </div>
          )}
          {/* AI suggestion (pending approval) */}
          {question.status === 'ai_suggested' && hasAiSuggestion && (
            <div className="bg-porcelain border border-dashed border-primary rounded-lg p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Sugestão da Ana</span>
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
          {!handoff?.required && question.status === 'answered' && question.answer_text && (
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-foreground">{question.answer_text}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Respondida por {question.answered_by === 'ai_agent' || question.answered_by === 'ai' ? 'IA' : 'humano'}
                {question.answered_at && ` em ${format(new Date(question.answered_at), 'dd/MM/yyyy HH:mm')}`}
              </p>
            </div>
          )}

          {/* Already answered externally — show explanation + AI suggestion */}
          {isAlreadyAnswered && (
            <div className="space-y-3">
              {hasErrorMessage && (
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-4">
                  <p className="text-sm text-warning font-medium mb-1">Respondida por outro canal</p>
                  <p className="text-xs text-muted-foreground">{question.error_message}</p>
                </div>
              )}
              {hasAiSuggestion && (
                <div className="bg-muted border border-dashed border-primary/30 rounded-lg p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">Resposta que a IA tinha preparado</span>
                  </div>
                  <p className="text-sm text-foreground">{question.ai_suggested_answer}</p>
                </div>
              )}
            </div>
          )}

          {/* Skipped (item inactive) — show explanation + AI suggestion if available */}
          {isSkipped && (
            <div className="space-y-3">
              {hasErrorMessage && (
                <div className="bg-muted border border-border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground font-medium mb-1">Motivo</p>
                  <p className="text-xs text-muted-foreground">{question.error_message}</p>
                </div>
              )}
              {hasAiSuggestion && (
                <div className="bg-muted border border-dashed border-primary/30 rounded-lg p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">Resposta que a IA tinha preparado</span>
                  </div>
                  <p className="text-sm text-foreground">{question.ai_suggested_answer}</p>
                </div>
              )}
            </div>
          )}

          {/* Failed display — show error + AI suggestion if available */}
          {isFailed && (
            <div className="space-y-3">
              {hasErrorMessage && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                  <p className="text-sm text-destructive font-medium mb-1">Erro ao processar</p>
                  <p className="text-xs text-muted-foreground">{question.error_message}</p>
                </div>
              )}
              {hasAiSuggestion && (
                <div className="bg-muted border border-dashed border-primary/30 rounded-lg p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">Resposta que a IA tinha preparado</span>
                  </div>
                  <p className="text-sm text-foreground">{question.ai_suggested_answer}</p>
                </div>
              )}
            </div>
          )}

          {/* ─── Feedback buttons (for answered questions) ─── */}
          {!handoff?.required && (question.status === 'answered' || isAlreadyAnswered) && (question.answer_text || hasAiSuggestion) && (
            <div className="space-y-3">
              {/* Status de análise (feedback já dado à Ana) */}
              {(question as any).feedback === 'good' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
                  <CheckCircle className="h-3 w-3" /> Analisada — resposta aprovada
                </span>
              )}
              {(question as any).feedback === 'bad' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  📝 Analisada — marcada para correção
                </span>
              )}

              {/* Feedback buttons — only if no feedback yet */}
              {!(question as any).feedback && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">A resposta foi boa?</span>
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => {
                      feedbackMutation.mutate({ questionId: question.id, feedback: 'good' });
                      toast({ title: '👍 Resposta aprovada' });
                    }}
                    disabled={feedbackMutation.isPending}
                  >
                    👍
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => setShowCorrectionForm(true)}
                    disabled={feedbackMutation.isPending}
                  >
                    👎
                  </Button>
                </div>
              )}

              {/* Correction form */}
              {showCorrectionForm && (
                <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-amber-800">Como a Ana deveria ter respondido?</p>
                  <Textarea
                    rows={3}
                    placeholder="Escreva a resposta correta que a Ana deveria ter dado..."
                    value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                    className="bg-white text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!correctionText.trim() || correctionMutation.isPending}
                      onClick={() => {
                        correctionMutation.mutate({
                          questionId: question.id,
                          productSku: question.platform_item_id ?? null,
                          originalQuestion: question.question_text,
                          aiResponse: question.answer_text ?? question.ai_suggested_answer ?? null,
                          recommendedResponse: correctionText.trim(),
                        }, {
                          onSuccess: () => {
                            toast({ title: '✅ Correção salva', description: 'A Ana vai aprender com isso na próxima pergunta similar.' });
                            setShowCorrectionForm(false);
                            setCorrectionText('');
                          },
                        });
                      }}
                      style={{ backgroundColor: '#004D4D', color: 'white' }}
                    >
                      {correctionMutation.isPending ? 'Salvando...' : 'Ensinar a Ana'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowCorrectionForm(false); setCorrectionText(''); }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual answer */}
          {!handoff?.required && question.status !== 'answered' && (
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
