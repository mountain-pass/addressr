# Our Software Delivery Principles

Software delivery is more than just writing code and deploying it. It's about creating a product that meets customer
needs, aligns with organisational goals, and is delivered with efficiency and agility. Our software delivery principles
form the cornerstone of our development approach. They guide our everyday decisions, shape our team culture, and drive
our relentless pursuit of excellence. By adhering to these principles, we ensure a cohesive and customer-centric
approach that fosters innovation, collaboration, and continuous improvement. Here are the core principles that define
our software development practice:

## 1. Locality & Simplicity

This principle refers to organising code and systems in a way that developers can work on their part without negatively
impacting others. When things that change together stay together, it promotes efficiency and reduces complexities. It
requires a deep understanding of the codebase, and it encourages teams to write code that's easy to read, test, and
maintain. Locality means that individual components can be understood and changed independently, and Simplicity means
that the overall structure doesn't over-complicate what it's trying to achieve.

## 2. Focus, Flow, and Joy

These principles emphasise the importance of creating an environment where developers can work with minimal
interruptions and maximum focus. It's about creating a culture where work flows smoothly without unnecessary friction,
delays, or obstructions. The joy part comes from the satisfaction and engagement that developers feel when they can
concentrate on their craft and see tangible results quickly. It's about aligning personal and organisational goals to
create a sense of purpose.

## 3. Improvement of Daily Work

This principle emphasises the importance of continuous improvement in daily work processes. The idea is that making
small, daily improvements in efficiency and productivity will lead to significant positive changes over time. This
involves identifying bottlenecks, inefficiencies, and areas for improvement, and then working consistently to make
those areas better. It's about a culture of learning, experimentation, and adaptation.

## 4. Psychological Safety

Psychological safety refers to a team environment where members feel safe to take risks and express their thoughts and
opinions without fear of ridicule or judgment. This creates a space where innovation, creativity, and honest
communication thrive. It fosters trust and collaboration, allowing team members to challenge each other constructively
and work together towards common goals. In such an environment, mistakes are seen as opportunities to learn rather than
something to be punished.

## 5. Customer Focus

This principle emphasises the importance of understanding and prioritising the needs of the customer. By centring the
design, development, and delivery process around what provides real value to the customers, teams can build products
that genuinely solve problems and meet needs. This requires constant communication with the customer, iterative
development, and a willingness to pivot based on customer feedback. It ensures that the product serves its intended
purpose and builds customer loyalty.

## 6. Leverage AI Capabilities

When working with AI systems (LLMs), leverage their reasoning and understanding capabilities rather than falling back to procedural validation. AI can reason about quality, correctness, and compliance far more effectively than keyword matching or pattern detection. Prompt design should encode requirements and quality expectations, making validation the AI's responsibility during generation. Procedural checks should be minimal (schema validation, basic invariants) rather than attempting to verify semantic properties through string matching.

### Deterministic vs Non-deterministic Work

Be explicit about what the system must do deterministically vs what should be delegated to an LLM.

**Deterministic work** is:

- Reliable and repeatable given the same inputs
- Cheap to validate with invariants (exit codes, schema validation, simple state gates)
- Best implemented as regular code

Examples:

- Running `git push` / `npm test` / `npm run build` and capturing full stdout/stderr + exit code
- Checking “working tree clean outside `.claude/`”
- Correlating a CI run to a commit SHA
- Enforcing a retry limit / timeout

**Non-deterministic work** is:

- Open-ended diagnosis, triage, and remediation
- Context-dependent on project conventions, decisions, and intent
- Poorly served by brittle string matching over tool output
- Best handled by an LLM via prompting + a structured output contract

Examples:

- Interpreting a failed `git push` (permissions, branch protections, required checks, auth prompts)
- Deciding the correct fix across code + tests + docs, consistent with existing ADRs/stories
- Choosing the next investigative step when failure output is incomplete

**Rule of thumb**: coder should _execute and record_ deterministic steps (commands, outputs, gates). When a deterministic step fails, code should provide the captured failure output plus relevant context to the LLM to diagnose and propose/implement a fix. After the fix, code reruns the deterministic step and repeats until success or a clear non-recoverable condition.

This keeps the codebase simple: avoid large pattern-based classifiers that attempt to “understand” tool output; use the LLM’s reasoning with clear contracts and minimal invariants.

### Generator-Reviewer Pattern

**Critical**: LLMs suffer from confirmation bias. When asked to evaluate their own outputs, they consistently overstate quality and miss issues. Never ask a generator LLM to validate its own work.

Use separate LLM sessions for generation and review:

1. **Generator LLM**: Produces output based on requirements
   - Receives context and requirements
   - Prompt encodes quality expectations
   - Produces structured output (JSON)
2. **Review LLM**: Separate session evaluates output
   - Receives: requirements + generated output + validation criteria
   - Acts as quality gate: evaluates compliance and quality
   - Produces: score (0-100%) + feedback + pass/fail
   - **Does NOT modify** output - only reviews
3. **Scoring**: 0-74% fail, ≥75% pass
4. **Feedback Loop**: If score <75%, provide feedback to generator for next iteration
5. **Iteration Limit**: Max 5 iterations; always proceed with final plan after limit reached

NOTE: to prevent check box responses to feedback, the evaluation should frame the feedback in a "this would be better if you fixed..." manner.

**Example**:

```typescript
// ❌ WRONG: Confirmation bias
const plan = await llm.generate(prompt);
const quality = await llm.evaluate(plan); // Same LLM overstates quality

// ✅ CORRECT: Independent review
const plan = await generatorLLM.generate(prompt);
const review = await reviewerLLM.evaluate(plan, criteria); // Different session
```

This principle recognizes that AI-assisted work requires different validation strategies than traditional code - we guide through prompts and schemas, validate through independent review LLMs, not post-hoc procedural verification.

These principles, when applied coherently, can help an organisation to develop a culture that's conducive to
innovation, efficiency, and continuous improvement.
