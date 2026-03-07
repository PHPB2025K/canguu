import { useState } from 'react';
import { Sparkles, AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './PlatformBadge';
import { useToast } from '@/hooks/use-toast';
import { useMarketplaceTokenStatus, usePlatformAnsweredCount, usePlatformAvgResponseTime } from '@/hooks/useMarketplaceTokens';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { MarketplaceTokenStatus } from '@/types/database';

const ML_OAUTH_URL = 'https://jpacmloqsfiebvagfomt.supabase.co/functions/v1/ml-oauth?action=authorize';

function PlatformCardSkeleton() {
  return (
    <Card className="border-border rounded-xl">
      <CardContent className="p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

function MercadoLivreCard({ token }: { token?: MarketplaceTokenStatus }) {
  const { toast } = useToast();
  const { data: answeredCount } = usePlatformAnsweredCount('mercado_livre');
  const { data: avgTime } = usePlatformAvgResponseTime('mercado_livre');

  const isConnected = token?.connection_status === 'connected';
  const isExpired = token?.connection_status === 'expired';

  const handleConnect = () => {
    window.open(ML_OAUTH_URL, '_blank');
  };

  const handleDisconnect = () => {
    toast({ title: 'Funcionalidade de desconexão será implementada em breve.' });
  };

  const dotColor = isConnected ? 'bg-success' : isExpired ? 'bg-destructive' : 'bg-muted-foreground';
  const statusLabel = isConnected ? 'Conectado' : isExpired ? 'Token expirado' : 'Não configurado';
  const statusClass = isConnected
    ? 'bg-success/15 text-success'
    : isExpired
      ? 'bg-destructive/15 text-destructive'
      : 'bg-muted text-muted-foreground';

  return (
    <Card className="border-border rounded-xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Mercado Livre</h3>
            <PlatformBadge platform="mercado_livre" />
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusClass}`}>
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {statusLabel}
          </span>
        </div>

        {isConnected && token && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-foreground">{token.seller_nickname}</p>
            <p className="text-xs text-muted-foreground">Seller ID: {token.seller_id}</p>
            {token.token_expires_at && (
              <p className="text-xs text-muted-foreground">
                Token expira {formatDistanceToNow(new Date(token.token_expires_at), { addSuffix: true, locale: ptBR })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Perguntas respondidas: {answeredCount ?? 0} | Tempo médio: {avgTime != null ? `${avgTime}s` : '—'}
            </p>
          </div>
        )}

        {isConnected ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-1.5" onClick={handleConnect}>
              <ExternalLink className="h-3.5 w-3.5" />
              Reconectar
            </Button>
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDisconnect}>
              Desconectar
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={handleConnect}>
            Conectar Mercado Livre
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ShopeeCard() {
  return (
    <Card className="border-border rounded-xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Shopee</h3>
            <PlatformBadge platform="shopee" />
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-warning/15 text-warning">
            <span className="h-2 w-2 rounded-full bg-warning" />
            Aguardando aprovação
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Aguardando aprovação da API da Shopee para habilitar integração.</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block w-full">
              <Button className="w-full" disabled>Conectar Shopee</Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Aguardando aprovação da API</TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

function AmazonCard() {
  return (
    <Card className="border-border rounded-xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Amazon</h3>
            <PlatformBadge platform="amazon" />
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
            Em breve
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Integração com Amazon será disponibilizada em breve.</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block w-full">
              <Button className="w-full" disabled>Conectar Amazon</Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Em breve</TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

export function ConfigTab() {
  const { toast } = useToast();
  const { data: tokens, isLoading } = useMarketplaceTokenStatus();
  const [autoSuggest, setAutoSuggest] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [language, setLanguage] = useState('pt');
  const [maxTime, setMaxTime] = useState('5');
  const [instructions, setInstructions] = useState('');

  const mlToken = tokens?.find((t) => t.platform === 'mercado_livre');

  return (
    <div className="space-y-6 h-full overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          <>
            <PlatformCardSkeleton />
            <PlatformCardSkeleton />
            <PlatformCardSkeleton />
          </>
        ) : (
          <>
            <MercadoLivreCard token={mlToken} />
            <ShopeeCard />
            <AmazonCard />
          </>
        )}
      </div>

      {/* AI Config card — inalterado */}
      <Card className="border-border rounded-xl">
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Configurações da IA para Marketplaces</h3>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Sugerir respostas automaticamente com IA</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                A IA analisará perguntas e chats e sugerirá respostas automaticamente
              </p>
            </div>
            <Switch checked={autoSuggest} onCheckedChange={setAutoSuggest} />
          </div>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-sm font-medium">Enviar respostas automáticas (sem aprovação humana)</Label>
              </div>
              <Switch checked={autoSend} onCheckedChange={setAutoSend} />
            </div>
            <div className="bg-warning/10 border border-warning/30 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning">
                A IA responderá diretamente aos clientes sem revisão humana
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Idioma das respostas</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt">Português</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Tempo máximo para resposta automática</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={maxTime}
                onChange={(e) => setMaxTime(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">minutos</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Instruções adicionais para a IA</Label>
            <Textarea
              rows={3}
              placeholder="Ex: Sempre mencionar frete grátis acima de R$99, sempre confirmar disponibilidade de estoque antes de responder..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <Button onClick={() => toast({ title: 'Configurações salvas!' })}>
            Salvar Configurações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
