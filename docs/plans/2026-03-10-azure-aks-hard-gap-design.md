# Azure AKS Hard-Gap Design

## Goal

Stop treating Azure SRE roles with explicit AKS requirements as soft-adjacent matches when the resume only shows SRE background plus lab Kubernetes exposure.

## Problem

The current scoring/self-check logic allows `azure` to pass as an adjacent short ramp when the resume contains `sre`. It also folds `AKS` into generic `kubernetes`, which means a role requiring Azure plus hands-on AKS can pass even when the resume has neither Azure experience nor production Kubernetes evidence.

## Decision

1. Add explicit `aks` detection instead of relying only on generic `kubernetes`.
2. Remove the `sre -> azure adjacent_short_ramp` shortcut.
3. Treat `aks` as a mandatory hard gap unless the resume shows explicit `aks` or strong production Kubernetes evidence.
4. Keep consultancy/staff-augmentation concerns out of hard-gap logic. They remain ranking context, not a blocker.

## Scope

- Update shared skill detection and gap classification.
- Add regression coverage for Azure/AKS detection and classification.
- Re-run score/self-check outputs so `agap2` is no longer approved by resume self-check.

## Non-Goals

- No new company-model preference penalties.
- No broad rewrite of scoring weights or ranking strategy.
