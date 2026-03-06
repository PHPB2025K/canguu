

# Remover escalonamentos de demonstração

## Identificação

Dos 4 escalonamentos no banco, 3 possuem IDs sequenciais claramente de demonstração (`a0000e01-...`):

| ID | Razão | Status |
|---|---|---|
| `a0000e01-...-01` | Atraso na entrega (pedido fictício #BM-2026-0142) | resolved |
| `a0000e01-...-02` | Produto danificado, menção a processo judicial | pending |
| `a0000e01-...-03` | "Teste de escalonamento em andamento — simulação" | in_progress |

O escalonamento `3ad87669-...` parece real (UUID gerado automaticamente, dados de classificação de IA).

## Ação

Executar `DELETE` nos 3 registros de demonstração via insert tool, mantendo o escalonamento real.

