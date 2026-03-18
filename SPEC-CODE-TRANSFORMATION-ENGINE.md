# Loki Mode: Enterprise Code Transformation Engine
# Architecture Specification v1.0
# February 2026

---

## EXECUTIVE SUMMARY

Enterprise code transformation (legacy modernization, framework migrations, codebase refactoring at scale) is the hottest vertical in AI development tooling right now. Cursor published a formal whitepaper. Anthropic published a long-running agent harness guide. OpenAI coined "Harness Engineering" as a methodology. Proliferate launched an open-source cloud harness for parallel agent runs. Google announced Antigravity with manager view for multi-agent orchestration.

Loki Mode already has 80% of the architecture needed. Our RARV cycle, completion council, 41 agent types, and conductor pattern map directly to what these players are building. What we lack is the migration-specific workflow, the enterprise packaging around it, and the knowledge persistence layer that bridges context windows.

This spec defines how to add a `loki migrate` command that provides an end-to-end enterprise code transformation pipeline, built on top of our existing architecture, not beside it.

---

## COMPETITIVE LANDSCAPE (HONEST ASSESSMENT)

### What each player offers and where we stand

**Cursor's Migration Workflow (from their whitepaper):**
Three phases: Understand > Guardrail > Migrate & Verify.
Uses: Ask Mode (read-only exploration), Agent Mode (documentation + test gen), Plan Mode (migration planning), Subagents (parallel execution), Hooks (deterministic test gates after every change).
Case studies: Salesforce (76 repos, 80% coverage in 4 engineer-days/module vs 26 manual), Box (80% faster migration to React Strict DOM).
Weakness: Manual, human-driven workflow. Each phase requires the engineer to switch modes, craft prompts, manage context. No orchestration layer.

**Loki Mode advantage:** We automate the orchestration. Cursor requires a human to drive each phase. We can run the entire pipeline autonomously with the conductor managing agent handoffs.

**Anthropic's Long-Running Agent Harness:**
Two-part solution: initializer agent (sets up environment, feature list, init.sh) + coding agent (incremental progress per context window, git commits, progress file).
Key insight: `claude-progress.txt` + git history bridges context windows. Feature list as JSON (not markdown) prevents agents from deleting/editing requirements.
Failure modes addressed: one-shotting, premature victory declaration, undocumented state, untested features.
Weakness: Single-agent, single-task. No multi-agent orchestration. No council review. No parallel execution.

**Loki Mode advantage:** Our RARV cycle already addresses their failure modes systematically. Our completion council prevents premature victory. Our checkpoint system already bridges context windows better than a text file.

**OpenAI's Harness Engineering:**
Three pillars: embedded documentation (agents ingest internal APIs, architectural diagrams, past PRs), chained prompts (sequenced contexts), feedback loops (learn from code reviews and test failures).
Rigid architectural model per business domain with mechanically enforced invariants via custom linters. Repository as single source of truth ("if it's not in the repo, it doesn't exist to the agent").
AGENTS.md as table of contents (not encyclopedia) pointing to structured docs/ directory.
Weakness: Requires the codebase to already be well-organized for agents. Doesn't help with legacy codebases that lack this structure.

**Loki Mode advantage:** Our Understand phase can CREATE this structure for legacy codebases, not just consume it. We generate the documentation, the architectural maps, the feature lists. Then our agents use them.

**Proliferate:**
Open-source cloud harness for coding agents with: isolated sandboxes (Docker-based), trigger system (Sentry, GitHub, Linear, Slack, webhooks, cron), live preview URLs per session, multiplayer (teammates can take over sessions), multi-client (web, CLI, Slack).
Weakness: No migration-specific workflow. No quality gates. No multi-agent orchestration. It's infrastructure, not intelligence.

**Loki Mode advantage:** We have the intelligence layer (RARV, council, 41 agents). What Proliferate provides is the session infrastructure we could eventually adopt for cloud execution.

**Google Antigravity:**
Manager view for spawning/orchestrating multiple agents in parallel. Verifiable artifacts (structured records of plans, code changes, test results). Powered by Gemini 3.
Weakness: Not yet broadly available. Architecture details are thin.

**Loki Mode advantage:** Our conductor pattern IS the manager view. Our dashboard already shows parallel agent execution.

### Honest gaps we need to fill

1. **No migration-specific CLI command or workflow** — we have the building blocks but no `loki migrate` that chains them into the Understand > Guardrail > Migrate > Verify pipeline
2. **No characterization test generation** — our test_engineer agent writes tests for new code. It doesn't generate characterization tests that capture what existing legacy code does.
3. **No seam detection** — we don't automatically identify architectural seams (wrappable boundaries, interfaces, config-driven behavior) in legacy codebases
4. **No parallel run comparison** — for critical migrations, running old and new systems side-by-side and comparing outputs is a proven pattern we don't support
5. **No migration plan as first-class artifact** — our PRD is close, but doesn't encode migration constraints, ordering, rollback points, and test gates
6. **No feature list with pass/fail tracking** — Anthropic's JSON feature list pattern with per-feature pass/fail status is simple and powerful, we should adopt it
7. **No strangler fig pattern support** — gradual traffic shifting with feature flags during migration
8. **No multi-repo support** — Salesforce's case study was 76 repos. We currently operate on a single project directory.

### What we already have that's better than all of them

1. **RARV Cycle** — systematic quality loop that none of the competitors have formalized
2. **Completion Council** — multi-model blind review that catches premature victory declarations
3. **41 specialized agents** — not one general-purpose agent doing everything
4. **Conductor pattern** — automated orchestration, not human-driven mode switching
5. **Checkpoint/restore** — git SHA-based state management, more robust than progress.txt
6. **Multi-provider support** — Claude, Codex, Gemini with tier-based routing
7. **Enterprise features** — OIDC/SSO, RBAC, audit trails, OpenTelemetry

---

## ARCHITECTURE

### New Command: `loki migrate`

```
loki migrate <path-to-codebase> [options]

Options:
  --target <language|framework|architecture>   Migration target
  --plan-only                                   Generate plan without executing
  --phase <understand|guardrail|migrate|verify> Run specific phase
  --parallel <N>                                Max parallel agents (default: 4)
  --compliance <healthcare|fintech|government>  Compliance preset
  --dry-run                                     Show what would change
  --resume                                      Resume from last checkpoint
  --multi-repo <glob>                           Multiple repository paths
```

### Phase Architecture

The migration pipeline maps to our existing RARV cycle but with migration-specific agents:

```
RARV Cycle Mapping:
  Reason  → Understand Phase (codebase archaeology, seam detection, documentation)
  Act     → Guardrail Phase (characterization tests, interface extraction)
  Act     → Migrate Phase (plan execution, parallel migration, pattern reuse)
  Reflect → Council review after each phase gate
  Verify  → Verify Phase (test baseline comparison, parallel run diff, rollback check)
```

### New Agents (added to existing 41)

These are MIGRATION-SPECIFIC specializations of existing agent categories, not replacements:

**Engineering Category (additions):**

1. `codebase_archaeologist` — Explores legacy code using grep + semantic search. Identifies data flows, error handling, external dependencies, seams. Generates structured documentation with Mermaid diagrams. Uses read-only access (no modifications).

2. `characterization_tester` — Generates tests that capture WHAT the code currently does, not what it should do. Covers boundary values, failure modes, exact outputs, side effects. Uses the documentation from archaeologist. Runs all tests and iterates until 100% pass against current system.

3. `seam_detector` — Identifies architectural seams: function boundaries that can be wrapped, interfaces with swappable implementations, configuration-driven behavior, feature flags. Outputs a structured `seams.json` with ranked migration entry points.

4. `migration_planner` — Creates a `migration-plan.json` (not markdown) with ordered steps, constraints, test gates, rollback points, and dependency graph. Each step has: description, files affected, tests that must pass, estimated token cost, risk level. Reviewed by completion council before execution.

5. `parallel_runner` — Manages old-system and new-system parallel execution. Feeds same inputs to both, captures outputs, generates diff reports. Supports canary/strangler-fig traffic shifting patterns.

**Review Category (additions):**

6. `migration_reviewer` — Specialized council member that reviews migration changes for: behavioral equivalence (not just test passing), performance regression, API contract preservation, silent behavior changes.

### Data Model

**Migration Manifest** (`~/.loki/migrations/<project>/manifest.json`):
```json
{
  "id": "mig_20260223_checkout_service",
  "created_at": "2026-02-23T12:00:00Z",
  "source": {
    "path": "/path/to/legacy/codebase",
    "language": "java",
    "framework": "spring-boot-2.x",
    "commit_sha": "abc123"
  },
  "target": {
    "language": "java",
    "framework": "spring-boot-3.x"
  },
  "phases": {
    "understand": { "status": "completed", "artifacts": ["docs/", "seams.json"] },
    "guardrail": { "status": "completed", "artifacts": ["tests/characterization/"] },
    "migrate": { "status": "in_progress", "current_step": 7, "total_steps": 23 },
    "verify": { "status": "pending" }
  },
  "feature_list": "features.json",
  "migration_plan": "migration-plan.json",
  "checkpoints": ["chk_001", "chk_002", "chk_007"]
}
```

**Feature List** (`features.json`) — Anthropic pattern, adapted:
```json
[
  {
    "id": "feat_001",
    "category": "behavioral",
    "description": "Login endpoint accepts valid credentials and returns JWT",
    "verification_steps": [
      "POST /auth/login with valid user",
      "Verify 200 response with token field",
      "Verify token is valid JWT with correct claims"
    ],
    "passes": false,
    "characterization_test": "tests/characterization/test_login.py::test_valid_login",
    "risk": "high",
    "notes": ""
  }
]
```

**Migration Plan** (`migration-plan.json`):
```json
{
  "version": 1,
  "strategy": "strangler_fig",
  "constraints": [
    "All characterization tests must pass after each step",
    "No changes to public API signatures without explicit approval",
    "Migrate one module at a time"
  ],
  "steps": [
    {
      "id": "step_001",
      "description": "Extract PaymentGateway interface from PaymentProcessor",
      "type": "interface_extraction",
      "files": ["src/payment/PaymentProcessor.java"],
      "tests_required": ["tests/characterization/test_payment_*"],
      "estimated_tokens": 15000,
      "risk": "medium",
      "rollback_point": true,
      "depends_on": [],
      "assigned_agent": null,
      "status": "pending"
    }
  ],
  "rollback_strategy": "git_revert_to_checkpoint",
  "exit_criteria": {
    "all_characterization_tests_pass": true,
    "no_performance_regression_above": "10%",
    "parallel_run_diff_below": "0.1%"
  }
}
```

### Integration with Existing Architecture

**Conductor Integration:**
The conductor already manages agent orchestration. Migration adds a new pipeline type:

```python
# In conductor, register migration pipeline alongside existing session pipeline
PIPELINE_TYPES = {
    "session": SessionPipeline,      # existing
    "migration": MigrationPipeline,  # new
}
```

The MigrationPipeline defines phase gates:
```
Phase Gate 1: understand -> guardrail (requires: docs generated, seams.json exists)
Phase Gate 2: guardrail -> migrate (requires: all characterization tests pass)
Phase Gate 3: migrate step N -> step N+1 (requires: tests pass after step N)
Phase Gate 4: migrate -> verify (requires: all steps completed)
```

Each gate triggers a completion council review. Council must achieve quorum before proceeding.

**RARV Integration:**
Each migration step runs through the RARV cycle independently:
```
For step_001 (Extract PaymentGateway interface):
  Reason: Load step context, seam analysis, interface patterns
  Act:    codebase_archaeologist identifies exact boundaries,
          characterization_tester verifies existing tests,
          migration agent executes the refactor
  Reflect: Council reviews the change
  Verify: Run characterization tests, check no behavioral change
```

**Checkpoint Integration:**
Each migration step with `rollback_point: true` creates a git-tagged checkpoint:
```
git tag loki-migrate/step_001/pre
<execute migration step>
git tag loki-migrate/step_001/post
```

If verification fails, rollback is: `git reset --hard loki-migrate/step_001/pre`

**Dashboard Integration:**
New migration view in dashboard showing:
```
Migration: checkout_service (Spring Boot 2.x -> 3.x)
Phase: Migrate [Step 7/23] ████████░░░ 30%
Features: 47/142 passing
Last checkpoint: step_006 (15 min ago)
Parallel run diff: 0.02%
Council status: Quorum met, all pass
Next: Extract StripeGateway implementation
```

**Knowledge Compounding:**
After successful migration, store the migration plan template:
```
~/.loki/solutions/migration/spring-boot-2-to-3/
  plan_template.json    # Generalized migration plan
  patterns/             # Successful refactoring patterns
  pitfalls.md           # Issues encountered and resolutions
```

Future migrations of the same type load this as context in the Reason step.

### Multi-Repo Support

For enterprise migrations spanning multiple repositories (Salesforce's 76 repo case):

```
loki migrate --multi-repo "./repos/service-*" --target spring-boot-3.x
```

The conductor creates a parent manifest that tracks per-repo progress:
```json
{
  "multi_repo_migration": {
    "total_repos": 76,
    "completed": 23,
    "in_progress": 4,
    "pending": 49,
    "repos": [
      { "path": "repos/service-auth", "status": "completed", "manifest": "..." },
      { "path": "repos/service-payment", "status": "in_progress", "step": "7/23" }
    ]
  }
}
```

Independent repos run in parallel (up to --parallel N). Repos with cross-dependencies are serialized based on dependency graph.

### Parallel Run Engine

For high-stakes migrations (financial, healthcare), running old and new simultaneously:

```python
class ParallelRunner:
    """Feeds identical inputs to old and new systems, compares outputs."""
    
    def __init__(self, old_endpoint, new_endpoint, correlation_id_header="X-Correlation-ID"):
        self.old = old_endpoint
        self.new = new_endpoint
        self.correlation = correlation_id_header
    
    def run_comparison(self, test_cases: list) -> DiffReport:
        """
        For each test case:
        1. Generate correlation ID
        2. Send to old system, capture response
        3. Send to new system, capture response
        4. Compare: status code, headers, body (with configurable tolerance)
        5. Log any differences with full context
        """
        pass
    
    def generate_diff_report(self) -> dict:
        """
        Returns:
        {
            "total_cases": 1000,
            "exact_match": 987,
            "tolerable_diff": 10,   # e.g., timestamp differences
            "behavioral_diff": 3,   # actual logic differences
            "details": [...]
        }
        """
        pass
```

### Token Efficiency

Based on Martin Alderson's research (2.9x token gap between frameworks), the migration planner includes token cost estimates per step, and the overall plan shows projected total cost:

```json
{
  "cost_estimate": {
    "total_tokens": 2450000,
    "estimated_cost_usd": 24.50,
    "by_phase": {
      "understand": 180000,
      "guardrail": 520000,
      "migrate": 1500000,
      "verify": 250000
    },
    "token_efficiency_notes": "Using Express.js (minimal framework) saves ~48K tokens vs Rails per module"
  }
}
```

---

## COUNCIL REVIEW

### Reviewer 1: Enterprise Architect Perspective

**Approve with conditions.**

Strengths: The phase-gate model with council review at each gate directly maps to enterprise change management processes. Multi-repo support addresses real-world scale. Parallel run engine is essential for regulated industries.

Concerns:
1. The seam_detector agent is the riskiest new component. Automatically identifying safe places to introduce interfaces in a legacy codebase requires deep understanding of coupling. If seam detection is wrong, the entire migration plan is built on a bad foundation.
   **Mitigation:** Make seam detection a SUGGESTION, not a decision. Present seams to a human reviewer with confidence scores. Only auto-proceed on high-confidence seams.

2. Multi-repo migrations need a dependency graph BEFORE parallelization. If repo A depends on repo B's API, migrating them in parallel will break.
   **Mitigation:** Add dependency discovery step in Understand phase for multi-repo. Build dependency graph from import analysis, API call tracing, and shared schema detection.

3. The feature list JSON pattern from Anthropic is good, but 200+ features in one file will hit context limits.
   **Mitigation:** Paginate feature list. Each RARV cycle loads only the current step's relevant features, not the entire list.

### Reviewer 2: Developer Experience Perspective

**Approve with conditions.**

Strengths: `loki migrate --plan-only` is excellent for building trust. Teams can review the plan before committing. The resume capability means interrupted migrations don't lose work.

Concerns:
1. The migration plan as JSON is correct (Anthropic proved this), but engineers need to READ it. Add a `loki migrate --show-plan` that renders a human-readable view.
   **Mitigation:** Add formatted plan output in CLI and dashboard. Keep JSON as source of truth, render for humans.

2. Characterization test generation could produce flaky tests (timing-dependent, order-dependent). These create false failures during migration.
   **Mitigation:** characterization_tester should run each test 3 times to check for flakiness before marking as baseline. Flag any test that fails on re-run as "flaky" and exclude from gate requirements (but log it).

3. The strangler fig pattern requires infrastructure (load balancer, feature flags). Not all teams have this.
   **Mitigation:** Support simple "big bang" migration as default, strangler fig as opt-in for teams with the infrastructure. Make it clear in docs which patterns require what infrastructure.

### Reviewer 3: Security and Compliance Perspective

**Approve with conditions.**

Strengths: Phase gates with council review create natural audit points. Parallel run engine provides provable behavioral equivalence. Compliance presets from Rigour integration (from previous competitive analysis) apply here.

Concerns:
1. Migration agents operating on legacy codebases may encounter secrets (hardcoded API keys, passwords in config files). Agents must not log or transmit these.
   **Mitigation:** Run Rigour security scan as first step of Understand phase. Flag any secrets found. Agent prompts must include explicit instruction to never log secret values.

2. For COBOL and similar mainframe migrations, the agents need to handle non-standard encodings (EBCDIC), fixed-width formats, and COPYBOOK definitions.
   **Mitigation:** Add COBOL-specific agent prompts in Phase 1. Include encoding detection in archaeologist agent. Do NOT claim full COBOL support in v1. Start with Java/Python/TypeScript migrations where our agents are strongest.

3. Audit trail must capture every migration decision with reasoning, not just what changed.
   **Mitigation:** Already covered by our activity logger (from previous competitive analysis). Ensure migration decisions (why this seam, why this ordering) are logged with rationale.

### Council Verdict: APPROVED with all mitigations applied

Mitigations incorporated into spec:
1. Seam detection outputs suggestions with confidence scores, not auto-decisions
2. Multi-repo dependency discovery added to Understand phase
3. Feature list paginated per RARV cycle
4. Human-readable plan rendering via `loki migrate --show-plan`
5. Flakiness detection for characterization tests (3x run check)
6. Strangler fig as opt-in, big-bang as default
7. Security scan as first step of Understand phase
8. COBOL as future scope, v1 focuses on Java/Python/TypeScript/Go
9. Decision rationale captured in activity log

---

## WHAT WE DO NOT CLAIM

Being honest about limitations:

1. We do NOT claim to handle COBOL migrations in v1. The Cursor whitepaper covers this, but doing it well requires mainframe-specific tooling we don't have yet.
2. We do NOT claim to replace human review entirely. Phase gates with council review reduce the human burden but don't eliminate it for high-risk changes.
3. We do NOT claim cloud-hosted sandboxed execution like Proliferate. Our execution is local-first. Cloud execution is future scope.
4. We do NOT claim to handle codebases over 1M LOC in a single migration run. Large codebases should be decomposed into service boundaries first.
5. We do NOT claim live preview URLs like Proliferate. Our verification is test-based, not browser-based (though Puppeteer MCP integration is possible).

---

## IMPLEMENTATION PRIORITY

Phase 1 (ship in 1 week):
  - `loki migrate` CLI command with --plan-only
  - codebase_archaeologist agent
  - characterization_tester agent
  - feature list JSON generation
  - migration plan JSON generation
  - Dashboard migration view (read-only)

Phase 2 (ship in 2 weeks):
  - seam_detector agent with confidence scoring
  - migration_planner with step dependency graph
  - Phase gate enforcement in conductor
  - Council review at phase gates
  - `loki migrate --resume` from checkpoint

Phase 3 (ship in 3 weeks):
  - Parallel migration execution (multiple steps simultaneously)
  - migration_reviewer council member
  - Knowledge compounding for migration patterns
  - Multi-repo support
  - Token cost estimation

Phase 4 (ship in 4 weeks):
  - Parallel run engine (old vs new comparison)
  - Strangler fig / canary pattern support
  - Rigour quality gate integration for migrations
  - Compliance audit report generation
  - `loki migrate --export-report` for enterprise reporting
