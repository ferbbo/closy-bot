# Orchestrator Module

This module orchestrates conversation flows and manages bot logic.

## Scope (Bootstrap)

Currently a placeholder. Future implementation will include:

- **Intent Classification** - LLM-powered intent detection
- **Flow Engine** - Conversation state machine
- **Handoff Logic** - Transfer to human agent with context
- **Context Management** - Conversation history and state

## Architecture

```
orchestrator/
├── intent/
│   └── intent.service.ts
├── flow/
│   ├── flow.engine.ts
│   └── flow.registry.ts
├── handoff/
│   └── handoff.service.ts
└── orchestrator.module.ts
```

## LLM Guardrails

From `.github/copilot-instructions.md`:
- LLM is for: intent, natural language, clarifications, summaries
- LLM must NOT invent: stock, prices, policies, delivery times
- All transactional data comes from backend services
