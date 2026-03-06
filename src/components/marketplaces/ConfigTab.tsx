import { useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PlatformBadge } from './PlatformBadge';
import { useToast } from '@/hooks/use-toast';

interface PlatformCardProps {
  name: string;
  platform: string;
  statusLabel: string;
  statusColor: string;
  dotColor: string;
  fields: { label: string; placeholder: string; type?: string }[];
  buttonLabel: string;
}

function PlatformCard({ name, platform, statusLabel, statusColor, dotColor, fields, buttonLabel }: PlatformCardProps) {
  return (
    <Card className="border-border rounded-xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{name}</h3>
            <PlatformBadge platform={platform} />
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusColor}`}>
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {statusLabel}
          </span>
        </div>

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.label}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    type={f.type ?? 'text'}
                    placeholder={f.placeholder}
                    disabled
                    className="opacity-60 mt-1"
                  />
                </TooltipTrigger>
                <TooltipContent>Integração em breve</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block w-full">
              <Button className="w-full" disabled>{buttonLabel}</Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Configuração em breve</TooltipContent>
        </Tooltip>

        <p className="text-xs text-muted-foreground">
          Perguntas respondidas: 3 | Tempo médio: 8min
        </p>
      </CardContent>
    </Card>
  );
}

export function ConfigTab() {
  const { toast } = useToast();
  const [autoSuggest, setAutoSuggest] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [language, setLanguage] = useState('pt');
  const [maxTime, setMaxTime] = useState('5');
  const [instructions, setInstructions] = useState('');

  return (
    <div className="space-y-6 h-full overflow-y-auto">
      {/* Platform cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PlatformCard
          name="Mercado Livre"
          platform="mercado_livre"
          statusLabel="Conectado"
          statusColor="bg-success/15 text-success"
          dotColor="bg-success"
          fields={[
            { label: 'Seller ID', placeholder: 'MLB12345678' },
            { label: 'App ID', placeholder: '1234567890' },
            { label: 'Access Token', placeholder: '••••••••••••', type: 'password' },
          ]}
          buttonLabel="Conectar Mercado Livre"
        />
        <PlatformCard
          name="Shopee"
          platform="shopee"
          statusLabel="Aguardando aprovação"
          statusColor="bg-warning/15 text-warning"
          dotColor="bg-warning"
          fields={[
            { label: 'Shop ID', placeholder: 'SHOP-87654321' },
            { label: 'Partner ID', placeholder: 'PTN-11223344' },
          ]}
          buttonLabel="Conectar Shopee"
        />
        <PlatformCard
          name="Amazon"
          platform="amazon"
          statusLabel="Em breve"
          statusColor="bg-muted text-muted-foreground"
          dotColor="bg-muted-foreground"
          fields={[
            { label: 'Seller ID', placeholder: 'A3B2C1D4E5F6' },
            { label: 'MWS Auth Token', placeholder: '••••••••••••', type: 'password' },
          ]}
          buttonLabel="Conectar Amazon"
        />
      </div>

      {/* AI Config card */}
      <Card className="border-border rounded-xl">
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Configurações da IA para Marketplaces</h3>
          </div>

          {/* Auto suggest toggle */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Sugerir respostas automaticamente com IA</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                A IA analisará perguntas e chats e sugerirá respostas automaticamente
              </p>
            </div>
            <Switch checked={autoSuggest} onCheckedChange={setAutoSuggest} />
          </div>

          {/* Auto send toggle with warning */}
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

          {/* Language */}
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

          {/* Max time */}
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

          {/* Instructions */}
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
