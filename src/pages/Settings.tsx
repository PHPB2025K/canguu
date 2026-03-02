import { useState, useEffect, useCallback } from 'react';
import {
  Bot, Save, MessageSquare, Database, Sparkles, GitBranch,
  LogOut, X, Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAgentConfig, useUpdateAgentConfig, useIntegrationStats } from '@/hooks/useSettings';
import { useAuthStore } from '@/stores/useAuthStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const LLM_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4-20250414', label: 'Claude Haiku 4' },
];

const tabs = [
  { id: 'agent', label: 'Agente IA' },
  { id: 'integrations', label: 'Integrações' },
  { id: 'account', label: 'Conta' },
] as const;

type TabId = (typeof tabs)[number]['id'];

const Settings = () => {
  const { data: config, isLoading } = useAgentConfig();
  const updateConfig = useUpdateAgentConfig();
  const { data: stats } = useIntegrationStats();
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<TabId>('agent');
  const [form, setForm] = useState<Record<string, string>>({});
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Sync form from config
  useEffect(() => {
    if (config) {
      setForm({ ...config });
      try {
        setKeywords(JSON.parse(config.escalation_keywords || '[]'));
      } catch {
        setKeywords([]);
      }
    }
  }, [config]);

  const set = useCallback((key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = () => {
    const updates: Record<string, string> = { ...form };
    updates.escalation_keywords = JSON.stringify(keywords);
    updateConfig.mutate(updates);
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords((prev) => [...prev, kw]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (isLoading) return <LoadingState type="card" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Gerencie o agente IA, integrações e conta" />

      <div className={cn('flex gap-6', isMobile ? 'flex-col' : 'flex-row')}>
        {/* Tab navigation */}
        <nav className={cn(
          'flex shrink-0 gap-1',
          isMobile ? 'flex-row overflow-x-auto border-b border-border pb-2' : 'flex-col w-48',
        )}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium text-left whitespace-nowrap transition-colors',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 space-y-6">
          {activeTab === 'agent' && (
            <AgentTab
              form={form}
              set={set}
              keywords={keywords}
              keywordInput={keywordInput}
              setKeywordInput={setKeywordInput}
              addKeyword={addKeyword}
              removeKeyword={removeKeyword}
            />
          )}
          {activeTab === 'integrations' && (
            <IntegrationsTab stats={stats} modelName={form.model} />
          )}
          {activeTab === 'account' && (
            <AccountTab email={user?.email} onLogout={() => setConfirmLogout(true)} />
          )}
        </div>
      </div>

      {/* Sticky save button for agent tab */}
      {activeTab === 'agent' && (
        <div className="sticky bottom-4 z-10">
          <Button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="w-full"
            size="lg"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateConfig.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Sair da conta"
        description="Tem certeza que deseja sair? Você precisará fazer login novamente."
        confirmLabel="Sair"
        onConfirm={handleSignOut}
        variant="destructive"
      />
    </div>
  );
};

/* ---- Agent Tab ---- */

interface AgentTabProps {
  form: Record<string, string>;
  set: (key: string, value: string) => void;
  keywords: string[];
  keywordInput: string;
  setKeywordInput: (v: string) => void;
  addKeyword: () => void;
  removeKeyword: (kw: string) => void;
}

function AgentTab({ form, set, keywords, keywordInput, setKeywordInput, addKeyword, removeKeyword }: AgentTabProps) {
  const temperature = Number(form.temperature ?? '0.7');

  return (
    <>
      {/* Identidade */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> Identidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent_name">Nome do Agente</Label>
            <Input id="agent_name" placeholder="Ex: Assistente Budamix" value={form.agent_name ?? ''} onChange={(e) => set('agent_name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="system_prompt">System Prompt</Label>
              <span className="text-xs text-muted-foreground">{(form.system_prompt ?? '').length} chars</span>
            </div>
            <Textarea id="system_prompt" rows={8} value={form.system_prompt ?? ''} onChange={(e) => set('system_prompt', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Modelo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modelo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Modelo LLM</Label>
            <Select value={form.model ?? ''} onValueChange={(v) => set('model', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
              <SelectContent>
                {LLM_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Temperatura</Label>
              <span className="text-sm font-medium text-foreground">{temperature.toFixed(1)}</span>
            </div>
            <Slider min={0} max={2} step={0.1} value={[temperature]} onValueChange={([v]) => set('temperature', v.toString())} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_tokens">Max Tokens</Label>
            <Input id="max_tokens" type="number" min={100} max={4096} value={form.max_tokens ?? '500'} onChange={(e) => set('max_tokens', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Mensagens */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagens Automáticas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="greeting_message">Mensagem de Boas-vindas</Label>
            <Textarea id="greeting_message" rows={3} placeholder="Olá! Sou o assistente virtual..." value={form.greeting_message ?? ''} onChange={(e) => set('greeting_message', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="away_message">Mensagem Fora do Horário</Label>
            <Textarea id="away_message" rows={3} placeholder="No momento estamos fora do horário..." value={form.away_message ?? ''} onChange={(e) => set('away_message', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Limites de Resposta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limites de Resposta</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'max_chars_per_chunk', label: 'Máx. caracteres por chunk' },
            { key: 'max_chunks_per_response', label: 'Máx. chunks por resposta' },
            { key: 'max_total_chars', label: 'Máx. caracteres total' },
            { key: 'message_buffer_seconds', label: 'Buffer entre mensagens (s)' },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input id={key} type="number" value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Escalonamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Escalonamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="max_messages_before_escalation">Máx. mensagens sem resolução</Label>
            <Input id="max_messages_before_escalation" type="number" value={form.max_messages_before_escalation ?? ''} onChange={(e) => set('max_messages_before_escalation', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Palavras-chave de escalonamento</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Adicionar palavra-chave..."
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
              />
              <Button variant="outline" size="icon" onClick={addKeyword} type="button"><Plus className="h-4 w-4" /></Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="gap-1">
                    {kw}
                    <button onClick={() => removeKeyword(kw)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ---- Integrations Tab ---- */

function IntegrationsTab({ stats, modelName }: { stats?: { products: number; customers: number; conversations: number }; modelName?: string }) {
  const integrations = [
    {
      icon: MessageSquare,
      iconBg: 'bg-green-500/10',
      iconColor: 'text-green-500',
      title: 'WhatsApp',
      description: 'Integração via Evolution API para envio e recebimento de mensagens',
      badge: <Badge className="bg-green-500/20 text-green-400 border-0">Conectado</Badge>,
    },
    {
      icon: Database,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
      title: 'Supabase',
      description: `Banco de dados principal — ${stats ? `${stats.products} produtos, ${stats.customers} clientes, ${stats.conversations} conversas` : 'Carregando...'}`,
      badge: <Badge className="bg-green-500/20 text-green-400 border-0">Conectado</Badge>,
    },
    {
      icon: Sparkles,
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-500',
      title: 'OpenAI / LLM',
      description: `Motor de IA — modelo: ${modelName || 'não configurado'}`,
      badge: <Badge className="bg-green-500/20 text-green-400 border-0">Configurado</Badge>,
    },
    {
      icon: GitBranch,
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-500',
      title: 'N8N',
      description: 'Workflows de automação — gerenciado via painel N8N',
      badge: <Badge className="bg-yellow-500/20 text-yellow-400 border-0">Externo</Badge>,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {integrations.map((item) => (
        <Card key={item.title} className="transition-all duration-200 hover:border-muted-foreground/30">
          <CardContent className="p-5 flex items-start gap-4">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', item.iconBg)}>
              <item.icon className={cn('h-5 w-5', item.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-foreground">{item.title}</h3>
                {item.badge}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---- Account Tab ---- */

function AccountTab({ email, onLogout }: { email?: string; onLogout: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações da Conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={email ?? ''} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <p className="text-sm text-muted-foreground">Sessão ativa</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ações</CardTitle>
          <CardDescription>Gerencie sua sessão</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Sair da Conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default Settings;
