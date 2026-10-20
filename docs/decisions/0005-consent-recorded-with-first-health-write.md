# ADR 0005 — Health-data consent is recorded in the same transaction as the first health-data write
Status: Accepted (2026-10-20, spec 001 technical plan; pending Gate 3)

## Context
GDPR art. 9 requires explicit consent before we process health data. Milestone 0 added
`give_health_data_consent()` and `withdraw_health_data_consent()`, and the onboarding design records consent as soon
as the user taps "I agree". That has three costs:
- the first onboarding screen needs a network connection, although AC 28 says the steps work offline;
- an under-16 user who consented and was then blocked leaves a consent row on the server that must be withdrawn again
  (Gate 2 resolution 7), which can itself fail offline;
- there is a window in which consent exists without any data, or data could be written by another path without it.

## Decision
- The consent decision is held **in memory on the client** when the user taps "I agree". Nothing is sent at that point.
- Every RPC that writes health data (starting with `apply_targets`, later diary and weight writes) takes
  `p_give_consent boolean`. In its transaction it:
  - records consent (`health_data_consent_at = now()`) **before** any health column is written, if consent is missing
    and `p_give_consent` is true;
  - raises `consent_required` and writes nothing, if consent is missing and `p_give_consent` is false.
- `give_health_data_consent()` remains available. `withdraw_health_data_consent()` is unchanged (AC 10).
- If the client's in-memory consent is lost (app killed, sign-out, the under-16 path), it asks again.

## Consequences
+ The whole onboarding flow runs offline until "Let's go"; only one request can fail.
+ Consent and the data it covers are atomic. Data is never stored without consent, and consent is never stored for a
  user who never saved anything.
+ Under-16 users who tap "I agree" and are then blocked leave no consent record. Withdrawal is only needed for rows
  that already held consent.
− The consent timestamp is the time the server received the save, not the time of the tap (usually seconds to
  minutes later). Consent is still given before processing.
− The `health_consent_decided{decision:given}` analytics event can occur without a matching server consent, for
  example when the user abandons onboarding before saving.
− The consent text version is not recorded yet. Add `health_data_consent_version` when the legal copy is final
  (spec OQ 12).
