# Agent-first roadmap

1. **Single planning agent.** Requirements → read-only pinned GitHub snapshot → cited observations → editable criteria. Implemented behind explicit credentials and source-sharing consent. Next: live acceptance with a dedicated test repo; better changed-file selection, model evaluations and plan history.
2. **Browser capabilities.** Static checks and approved interactive sample checks are validated. Isolated external worker and request broker implemented; Docker launch and fixture interactions validated; an authorized external preview acceptance run remains pending. Authenticated/API-driven journeys and transactions are unsupported. Never use live eBarrel or place real orders without permission.
3. **Structured reports and historical results.** Current local run history, screenshots, reproduction steps and prompts. Next: stable scenario identifiers, comparable runs and defensible regression attribution. A difference between runs is not automatically caused by a commit.
4. **Shared MCP server.** Local authenticated HTTP and stdio validated end-to-end; key-file bridge, connection status and diagnostics implemented. Codex and Claude Desktop configured. Next: activate and verify inside those actual hosts; hosted OAuth/ChatGPT remains separate work. No public plugin listing or hosted connection exists yet.
5. **After-deployment verification.** Deferred. Require authenticated signed deployment events, explicit environment/commit association, preview allowlists, idempotent job scheduling, concurrency budgets, revocation, retention and reviewed reusable plans. Automatic PR posting remains a separate opt-in approval policy.

No billing, organization dashboard, or SaaS administration is needed to learn from the first useful internal reviews.

## Deferred design pass

Aim for the effortlessness of Apple’s product design: fewer decisions, a clear next step, restrained controls and progressive disclosure. Evaluate the entire task, not added decoration or a visual theme. Preserve accessibility and the compact focus treatment. Return to this after the browser capability is stable, with user review.
