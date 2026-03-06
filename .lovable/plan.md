

# Alterar badge Amazon para fundo preto

Modificar `src/components/marketplaces/PlatformBadge.tsx`: trocar o `bg` da Amazon de `#FF9900` para preto e o `text` para branco.

```
amazon: { bg: 'bg-[#232F3E]', text: 'text-white', label: 'Amazon' }
```

Também atualizar as referências em `ConfigTab.tsx` onde o badge Amazon é descrito nos comentários/inline styles, se houver.

