

# Remover card "Perguntas ML Hoje" do Dashboard

## Alterações

### 1. `src/pages/Dashboard.tsx`
- Remover import de `useMLQuestionsToday` e `Store`
- Remover chamada `const mlQuestions = useMLQuestionsToday()`
- Remover o `<KPICard>` "Perguntas ML Hoje" do grid (linhas ~91-98)
- Manter todos os demais cards intactos

### 2. `src/hooks/useDashboardData.ts`
- Remover a função `useMLQuestionsToday` (única referência é no Dashboard)

