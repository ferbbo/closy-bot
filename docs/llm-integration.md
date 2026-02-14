# LLM Integration Documentation

> Documentation for LLM module in Core V1 MVP (PR-03.6)

## Overview

The LLM module provides integration with Large Language Models for generating natural, conversational responses in the chatbot. It uses an **adapter pattern** to allow easy swapping between different LLM providers.

**Current provider:** Groq (llama-3.1-70b-versatile)

**Key features:**
- Composable system prompts (base + industry + merchant + context)
- Universal guardrails against prompt injection
- Feature flag for easy enable/disable
- Graceful fallback to templated responses
- Retry logic with exponential backoff
- Timeout protection

---

## Architecture

```
┌──────────────────────────────────────────┐
│         ConversationOrchestrator         │
│   (decides: LLM or templated flows)      │
└────────────────┬─────────────────────────┘
                 │
                 ▼
         ┌──────────────┐
         │  LlmService  │ (facade)
         └──────┬───────┘
                │
                ├─ buildSystemPrompt() ──► PlaybookPromptBuilder
                │                           └─ base + industry + merchant + context
                │
                └─ generateResponse() ────► LlmProvider (interface)
                                             └─ GroqLlmProvider (implementation)
                                                 └─ groq-sdk
```

### Module structure

```
apps/api/src/llm/
├── llm.module.ts                          # NestJS module
├── llm.service.ts                         # Facade service
├── llm.service.spec.ts
├── interfaces/
│   └── llm-provider.interface.ts          # Provider interface + DTOs
├── providers/
│   ├── groq-llm.provider.ts               # Groq implementation
│   └── groq-llm.provider.spec.ts
└── prompts/
    ├── base-system-prompt.ts              # Universal guardrails
    ├── playbook-prompt-builder.ts         # Prompt composition
    ├── playbook-prompt-builder.spec.ts
    └── industry-defaults/                 # Industry-specific prompts (stubs)
        ├── ropa.ts
        ├── belleza.ts
        └── minimarket.ts
```

---

## Configuration

### Environment variables

```bash
# Enable/disable LLM (defaults to false)
LLM_ENABLED=true

# Provider (currently only 'groq' supported)
LLM_PROVIDER=groq

# Groq API key (get from: https://console.groq.com/keys)
GROQ_API_KEY=gsk_xxxxx

# Model to use (see: https://console.groq.com/docs/models)
LLM_MODEL=llama-3.1-70b-versatile

# Max response time in milliseconds
LLM_TIMEOUT_MS=30000

# Max tokens to generate per response
LLM_MAX_TOKENS=500

# Sampling temperature (0 = deterministic, 2 = creative)
LLM_TEMPERATURE=0.7
```

### Recommended models (Groq)

| Model | Tokens/s | Quality | Use case |
|-------|----------|---------|----------|
| `llama-3.1-70b-versatile` | ~300 | High | **Production (recommended)** |
| `llama-3.1-8b-instant` | ~800 | Medium | High-traffic / cost optimization |
| `mixtral-8x7b-32768` | ~500 | High | Long context needs |

---

## References

- **Groq API docs:** https://console.groq.com/docs
- **Groq SDK (TypeScript):** https://github.com/groq/groq-typescript
- **PR Brief:** `docs/plan/pr-briefs/PR-03.6-llm-adapter-groq-system-prompt.md`
- **Core V1 spec:** `docs/mvp-core-v1.md` §8.5 (IA), §9.2 (Guardrails)
