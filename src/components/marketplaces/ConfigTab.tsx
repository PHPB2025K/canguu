import { useState } from 'react';
import { Sparkles, AlertTriangle, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './PlatformBadge';
import { useToast } from '@/hooks/use-toast';
import { useMarketplaceTokenStatus, usePlatformAnsweredCount, usePlatformAvgResponseTime } from '@/hooks/useMarketplaceTokens';
import type { MarketplaceTokenStatus } from '@/types/database';

interface PlatformConfig {
  name: string;
  platform: string;
  oauthEnabled: boolean;
  fields: { label: string; key: string; type?: string }[];
}

const PLATFORMS: PlatformConfig[] = [
  {
    name: 'Mercado Livre',
    platform: 'mercado_livre',
    oauthEnabled: true,
    fields: [
      { label: 'Seller ID', key: 'seller_id' },
      { label: 'App ID', key: 'app_id' },
      { label: 'Access Token', key: 'access_token', type: 'password' },
    ],
  },
  {
    name: 'Shopee',
    platform: 'shopee',
    oauthEnabled: false,
    fields: [
      { label: 'Seller ID', key: 'seller_id' },
      { label: 'App ID', key: 'app_id' },
    ],
  },
  {
    name: 'Amazon',
    platform: 'amazon',
    oauthEnabled: false,
    fields: [
      { label: 'Seller ID', key: 'seller_id' },
      { label: 'App ID', key: 'app_id' },
    ],
  },
];

function getStatusDisplay(connectionStatus: string) {
  switch (connectionStatus) {
    case 'connected':
      return { label: 'Conectado', statusColor: 'bg-success/15 text-success', dotColor: 'bg-success' };
    case 'expired':
      return { label: 'Token expirado', statusColor: 'bg-destructive/15 text-destructive', dotColor: 'bg-destructive' };
    default:
      return { label: 'Desconectado', statusColor: 'bg-muted text-muted-foreground', dotColor: 'bg-muted-foreground' };
  }
}

function PlatformCardConnected({
  config,
  token,
}: {
  config: PlatformConfig;
  token: MarketplaceTokenStatus;
}) {
  const { toast } = useToast();
  const { data: answeredCount } = usePlatformAnsweredCount(config.platform);
  const { data: avgTime } = usePlatformAvgResponseTime(config.platform);
  const statusDisplay = getStatusDisplay(token.connection_status);

  const handleDisconnect = () => {
    toast({ title: 'Funcionalidade de desconexão será implementada em breve.' });
  };

  const handleReconnect = () => {
    toast({ title: 'Funcionalidade de reconexão será implementada em breve.' });
  };

  const handleRenew = () => {
    toast({ title: 'Renovação de token será implementada em breve.' });
  };

  return (
    <Card className="border-border rounded-xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{config.name}</h3>
            <PlatformBadge platform={config.platform} />
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusDisplay.statusColor}`}>
            <span className={`h-2 w-2 rounded-full ${statusDisplay.dotColor}`} />
            {statusDisplay.label}
          </span>
        </div>

        <div className="space-y-3">
          {config.fields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              {f.type === 'password' ? (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-md border border-border bg-muted/50">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground tracking-widest">••••••••••••</span>
                </div>
              ) : (
                <Input
                  value={
                    f.key === 'seller_id' ? (token.seller_id ?? '') :
                    f.key === 'app_id' ? (token.app_id ?? '') : ''
                  }
                  readOnly
                  className="mt-1 bg-muted/50"
                />
              )}
            </div>
          ))}
        </div>

        {token.connection_status === 'expired' ? (
          <Button className="w-full bg-warning text-warning-foreground hover:bg-warning/90" onClick={handleRenew}>
            Renovar Token
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleReconnect}>
              Reconectar
            </Button>
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDisconnect}>
              Desconectar
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Perguntas respondidas: {answeredCount ?? 0} | Tempo médio: {avgTime != null ? `${avgTime}min` : '—'}
        </p>
      </CardContent>
    </Card>
  );
}

function PlatformCardDisconnected({ config }: { config: PlatformConfig }) {
  const { toast } = useToast();
  const { data: answeredCount } = usePlatformAnsweredCount(config.platform);

  const handleConnect = () => {
    if (config.oauthEnabled) {
      toast({
        title: 'OAuth em configuração',
        description: 'A URL de autorização do Mercado Livre será configurada via Edge Function em breve.',
      });
    }
  };

  return (
    <Card className="border-border rounded-xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{config.name}</h3>
            <PlatformBadge platform={config.platform} />
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
            Desconectado
          </span>
        </div>

        <div className="space-y-3">
          {config.fields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                placeholder={f.type === 'password' ? '••••••••••••' : `Conecte para exibir`}
                disabled
                className="opacity-60 mt-1"
              />
            </div>
          ))}
        </div>

        {config.oauthEnabled ? (
          <Button className="w-full" onClick={handleConnect}>
            Conectar {config.name}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block w-full">
                <Button className="w-full" disabled>
                  Conectar {config.name}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Integração em breve</TooltipContent>
          </Tooltip>
        )}

        <p className="text-xs text-muted-foreground">
          Perguntas respondidas: {answeredCount ?? 0} | Tempo médio: —
        </p>
      </CardContent>
    </Card>
  );
}

function PlatformCardSkeleton() {
  return (
    <Card className="border-border rounded-xl">
      <CardContent className="p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
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

  const getTokenForPlatform = (platform: string) =>
    tokens?.find((t) => t.platform === platform);

  return (
    <div className="space-y-6 h-full overflow-y-auto">
      {/* Platform cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading
          ? PLATFORMS.map((p) => <PlatformCardSkeleton key={p.platform} />)
          : PLATFORMS.map((config) => {
              const token = getTokenForPlatform(config.platform);
              return token && token.connection_status !== 'disconnected' ? (
                <PlatformCardConnected key={config.platform} config={config} token={token} />
              ) : (
                <PlatformCardDisconnected key={config.platform} config={config} />
              );
            })}
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
