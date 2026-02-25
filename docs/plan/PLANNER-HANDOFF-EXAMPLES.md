# Planner Handoff Examples

> Ejemplos de handoff del Planner al Builder en diferentes modos de trabajo.

## Modo Normal (default)

**Request del usuario:**
```
Planner: prepara PR-18 para OAuth Google
```

**Handoff al Builder:**
```yaml
branch_name: PR-18-oauth-google
base_branch: dev
issue_id: #123
brief_path: docs/plan/pr-briefs/PR-18-oauth-google.md
mode: normal
```

**Instrucciones al Builder:**
```
Implementa PR-18. 
Brief: docs/plan/pr-briefs/PR-18-oauth-google.md (status: APPROVED)
Branch: PR-18-oauth-google
Issue: #123
```

**Nota:** El Builder trabaja en el repo principal, switcheando a la rama `PR-18-oauth-google`.

---

## Modo Paralelo (worktree)

**Request del usuario:**
```
Planner: prepara PR-19 para payment webhooks
parallel_pr: true
```

**Handoff al Builder:**
```yaml
branch_name: PR-19-payment-webhooks
base_branch: dev
issue_id: #124
brief_path: docs/plan/pr-briefs/PR-19-payment-webhooks.md
worktree_path: /Users/ferbbo/Documents/dev/sp/closy-bot-pr-19-payment-webhooks
mode: parallel_pr
```

**Instrucciones al Builder:**
```
Implementa PR-19.
Brief: docs/plan/pr-briefs/PR-19-payment-webhooks.md (status: APPROVED)
Branch: PR-19-payment-webhooks
Issue: #124
Worktree: /Users/ferbbo/Documents/dev/sp/closy-bot-pr-19-payment-webhooks

⚠️ IMPORTANTE: Trabaja en el worktree path, NO en el repo principal.
Tu workspace de trabajo es: /Users/ferbbo/Documents/dev/sp/closy-bot-pr-19-payment-webhooks
```

**Nota:** El Builder trabaja en el worktree (carpeta hermana), dejando el repo principal libre para otros PRs.

---

## Workflow de Cleanup

**Request del usuario:**
```
Planner: cleanup worktree de PR-19, ya lo mergeé a dev
```

**Verificaciones del Planner:**
1. Listar worktrees: `git worktree list`
2. Verificar estado en worktree:
   ```bash
   cd /Users/ferbbo/Documents/dev/sp/closy-bot-pr-19-payment-webhooks
   git status  # debe estar limpio
   ```
3. Preguntar confirmación: "¿Confirmás que PR-19 ya fue mergeado a dev?"

**Si todo OK:**
```bash
git worktree remove /Users/ferbbo/Documents/dev/sp/closy-bot-pr-19-payment-webhooks
git worktree prune
```

**Output del Planner:**
```
✅ removed: /Users/ferbbo/Documents/dev/sp/closy-bot-pr-19-payment-webhooks
   Branch PR-19-payment-webhooks permanece en remoto hasta que se elimine.
```

**Si hay problemas:**
```
⏭️ skipped: /Users/ferbbo/Documents/dev/sp/closy-bot-pr-19-payment-webhooks
   Motivo: Uncommitted changes found
   Acción: Commitea o descarta cambios antes de cleanup.
```

---

## Comparación rápida

| Aspecto | Modo Normal | Modo Paralelo |
|---------|-------------|---------------|
| Workspace | Repo principal (`dev` → switch a rama feature) | Worktree hermano (carpeta separada) |
| Branch creation | `git checkout -b PR-XX-slug` | `git worktree add ../path PR-XX-slug` |
| Handoff field | `mode: normal` | `mode: parallel_pr` + `worktree_path` |
| Cleanup | `git branch -d` (local branch) | `git worktree remove` + `prune` |
| Uso recomendado | 1 PR a la vez | 2+ PRs en paralelo |

---

## Setup con Worktree Existente (Dev)

Si ya tienes un worktree para `dev` (para mantener `main` separado):

```
/path/to/closy-bot/              ← repo principal (main)
/path/to/closy-bot-dev/          ← worktree existente (dev) - tu workspace principal
```

### Trabajando desde `/path/to/closy-bot-dev/`:

Los worktrees paralelos se nombran **basándose en tu directorio actual**:

```bash
CURRENT_DIR=$(basename "$PWD")  # → "closy-bot-dev"
WORKTREE_PATH="../${CURRENT_DIR}-pr-18-oauth"  # → "../closy-bot-dev-pr-18-oauth"
```

**Resultado:**
```
/path/to/closy-bot/                    ← main (sin tocar)
/path/to/closy-bot-dev/                ← dev (workspace activo) ← trabajás desde aquí
/path/to/closy-bot-dev-pr-18-oauth/    ← nuevo worktree PR-18
/path/to/closy-bot-dev-pr-19-payment/  ← nuevo worktree PR-19
```

✅ **Ventaja:** Los worktrees paralelos quedan agrupados como hermanos de tu workspace de dev.

---

## Comandos Git de referencia

### Crear worktree:
```bash
# Basarse en el directorio de trabajo actual
CURRENT_DIR=$(basename "$PWD")
WORKTREE_PATH="../${CURRENT_DIR}-pr-XX-slug"

# Crear worktree desde la rama deseada
git worktree add "$WORKTREE_PATH" PR-XX-slug
```

### Listar worktrees:
```bash
git worktree list
```

### Remover worktree:
```bash
git worktree remove /path/to/worktree
git worktree prune
```

### Verificar estado de worktree:
```bash
cd /path/to/worktree
git status
git branch
```
