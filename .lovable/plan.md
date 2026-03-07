

# Remover nomes de soluções da seção "Construído com tecnologia de ponta"

## Objetivo
Substituir os nomes específicos das ferramentas (Claude AI, Supabase, Evolution API, React, N8N) por tópicos genéricos, preservando a estratégia de negócio.

## Alterações em `src/components/landing/TechStackSection.tsx`

1. **Dados**: Substituir a lista `techs` por apenas os labels genéricos com ícones Lucide para uma interface moderna:
   - `Brain` — Motor de IA
   - `Database` — Banco de dados realtime
   - `MessageCircle` — WhatsApp Business
   - `Monitor` — Interface moderna
   - `Workflow` — Workflows automatizados

2. **Layout**: Trocar os pills simples por cards com ícone + texto, dispostos em grid responsivo (`grid-cols-2 md:grid-cols-5`), com ícone colorido centralizado acima do label. Cada card terá fundo `bg-card`, borda, padding e cantos arredondados.

3. **Estrutura de cada card**:
   - Ícone Lucide (24px) com cor `text-primary`
   - Label genérico em `font-semibold text-sm text-foreground`

Nenhuma outra seção será alterada.

