# 1. Record architecture decisions

- Status: Accepted
- Date: 2026-11-07

## Context

Unfold is intended to be developed by many contributors over time. Reasons behind significant choices are easily lost.

## Decision

We record significant architecture decisions as Architecture Decision Records (ADRs) in `docs/adr/`, numbered sequentially (`NNNN-short-title.md`), using this structure: Status, Date, Context, Decision, Consequences.

A decision is significant if reversing it later would be costly or would affect contributors. ADRs are immutable once accepted. To change a decision, add a new ADR that supersedes the old one and update the old one's status.

## Consequences

- New contributors can learn why things are the way they are.
- Slight overhead for architectural changes.
