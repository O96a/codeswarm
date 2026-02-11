# Mehaisi Architecture 🐝

Mehaisi is built on the **SONA** (Self-Optimizing Network of Agents) architecture. This document outlines the core components and their interactions.

## Core Components

### 1. Orchestrator (`orchestrator.js`)
The central brain of the system. it manages the lifecycle of a session, coordinates agents, and ensures safety constraints are met.

### 2. Intelligent Router (`model-resolver.js` & `coordination-hub.js`)
Responsible for selecting the best agent for a given task. It uses:
- **Capability Matching**: Direct mapping of agent abilities to task requirements.
- **Semantic Search**: Uses vector embeddings to find similar past tasks.
- **Success History**: Ranks agents based on their historical performance.

### 3. Coordination Hub (`coordination-hub.js`)
A real-time communication layer where agents share findings, open issues, and collaborate.

### 4. Vector Memory (`ruvector-memory.js`)
Persistent storage for agent findings and task outcomes, enabling semantic search and long-term learning.

### 5. SONA Learning Engine
Analyzes session outcomes to optimize routing weights and discover new agent capabilities.

## Data Flow

1. **Task Input**: User provides a goal or task.
2. **Recommendation**: Router identifies the best agent(s).
3. **Execution**: Selected agents run (potentially in parallel).
4. **Coordination**: Agents share data through the Hub.
5. **Validation**: Changes are verified via tests and Git status.
6. **Learning**: Outcome is captured and used to improve future decisions.

## Agent Types

- **Investigators**: Read-only agents that analyze the codebase.
- **Fixers**: Agents that modify code to resolve identified issues.
- **Builders**: Agents that add new functionality or documentation.
- **QA**: Agents that validate the system's state.

## Safety & Security

Mehaisi implements multiple layers of safety:
- **Git Sandboxing**: All changes happen in branches.
- **Manual Approval**: Critical changes require human confirmation.
- **Rate Limiting**: Prevents API abuse and runaway costs.
- **Credential Masking**: Ensures secrets are never logged or stored insecurely.
