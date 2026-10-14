# Project Profile

Fill the three required fields from inspected evidence before active use. State unknowns honestly. Keep only project facts that are not reliably discoverable from code, manifests, CI, or existing documentation; link to those sources instead of copying them.

## Required

- Goal and scope: {{PROJECT_GOAL_AND_SCOPE}}
- Required verification: {{CHECK_COMMANDS_OR_LINK_TO_CANONICAL_SOURCE}}
- Protected resources and unsafe commands: {{PROTECTED_RESOURCES_OR_NONE_CONFIRMED}}

## Optional project constraints

Delete unused guidance. Add a short bullet only when it changes how an agent should work:

- Authoritative specification or architectural decision; precedence if sources conflict.
- Non-obvious entry point, contract, invariant, or excluded legacy material.
- Command working directory, missing setup step, or resource limit.
- Repository and conversation language when not clear from context.
- Branch, commit, release, dependency approval, or deployment policy differing from the shared defaults.
- Environment or data boundary that cannot be inferred safely.

Do not create an inventory of the stack, directories, or every available command. Keep detailed instructions in their existing source of truth.
