# AC-06 Evidence: Memory Config Override

**Status**: ✅ **VALIDATED**

## Acceptance Criteria

> Config retención: defaults env + override merchant en `playbookConfig.memory`

## Implementation

AC-06 is implemented and validated through:

### 1. Service Implementation

**File**: [apps/api/src/common/config/memory-config.service.ts](../../apps/api/src/common/config/memory-config.service.ts)

Service provides three methods with merchant override support:
- `getMessageHistoryDays(merchantPlaybookConfig?)` 
- `getMessageHistoryMaxPerConvo(merchantPlaybookConfig?)`
- `getLlmContextLastK(merchantPlaybookConfig?)`

Each method:
1. Reads env default via `ConfigService`
2. Checks if `merchantPlaybookConfig.memory.*` exists
3. Returns override if valid number, otherwise returns default

### 2. Integration in Production Code

**Used in**:
- [apps/api/src/orchestrator/conversation.orchestrator.ts](../../apps/api/src/orchestrator/conversation.orchestrator.ts#L94-L99) — message TTL with merchant override
- [apps/api/src/llm/llm.service.ts](../../apps/api/src/llm/llm.service.ts#L159-L164) — LLM context lastK with merchant override  
- [apps/api/src/workers/retention/message-log-cleanup.service.ts](../../apps/api/src/workers/retention/message-log-cleanup.service.ts#L42-L44) — cleanup cap with default

**Module wiring**:
- `MemoryConfigService` exported from [CommonModule](../../apps/api/src/common/common.module.ts#L17-L19)
- Imported in [LlmModule](../../apps/api/src/llm/llm.module.ts#L15), [OrchestratorModule](../../apps/api/src/orchestrator/orchestrator.module.ts#L27), [RetentionModule](../../apps/api/src/workers/retention/retention.module.ts#L12)

### 3. Test Evidence

**File**: [apps/api/src/common/config/memory-config.service.spec.ts](../../apps/api/src/common/config/memory-config.service.spec.ts)

**Test Results**: ✅ **10/10 tests passing**

```bash
$ pnpm --filter @closy-bot/api test -- memory-config

 PASS  src/common/config/memory-config.service.spec.ts
  MemoryConfigService (AC-06)
    AC-06: Config retención con defaults + override merchant
      ✓ should return default MESSAGE_HISTORY_DAYS when no override
      ✓ should return override MESSAGE_HISTORY_DAYS from playbookConfig
      ✓ should return default MESSAGE_HISTORY_MAX_PER_CONVO when no override
      ✓ should return override MESSAGE_HISTORY_MAX_PER_CONVO from playbookConfig
      ✓ should return default LLM_CONTEXT_LAST_K when no override
      ✓ should return override LLM_CONTEXT_LAST_K from playbookConfig
      ✓ should handle missing memory key in playbookConfig
      ✓ should handle invalid playbookConfig types
      ✓ should ignore invalid override values
      ✓ should support partial overrides

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

### 4. Test Coverage

Tests validate:
- ✅ Default values returned when no override
- ✅ Override values used when `playbookConfig.memory.*` is valid number
- ✅ Graceful handling of missing/invalid config
- ✅ Partial overrides (only some fields overridden)
- ✅ Type safety (invalid types ignored)

## Verification Steps

1. **Run unit tests**:
   ```bash
   pnpm --filter @closy-bot/api test -- memory-config
   ```

2. **Verify integration** (code inspection):
   - Check orchestrator passes `merchant.playbookConfig` to `memoryConfigService.getMessageHistoryDays()`
   - Check LLM service passes `merchantPlaybookConfig` to `buildContextWithMemory()` and to `memoryConfigService.getLlmContextLastK()`
   - Check cleanup service uses `memoryConfigService.getMessageHistoryMaxPerConvo()`

3. **Manual validation** (runtime):
   - Set env: `MESSAGE_HISTORY_DAYS=30`
   - Create merchant with `playbookConfig: { memory: { messageHistoryDays: 60 } }`
   - Send message to that merchant
   - Verify `MessageLog.expiresAt` is 60 days in future (not 30)

## Why No Integration Tests?

`LlmService` has complex dependencies (GroqProvider, PlaybookService, multiple repos) that make integration testing brittle. The unit tests on `MemoryConfigService` provide sufficient coverage because:

1. The service logic is self-contained and deterministic
2. Integration points (orchestrator, LLM, cleanup) are verified by code inspection
3. The override mechanism is simple: read config, check override, return value
4. Runtime validation can be done manually if needed

## Conclusion

**AC-06 is VALIDATED** through:
- ✅ 10/10 unit tests passing
- ✅ Code integrated in 3 production services
- ✅ Module wiring complete
- ✅ Override logic deterministic and testable

No additional E2E or integration tests are needed for this AC.
