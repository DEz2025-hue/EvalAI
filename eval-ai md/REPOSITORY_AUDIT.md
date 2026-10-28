# EvalAI Repository Audit

**Status:** Template to complete from the actual repository. Do not
invent findings.

## 1. Audit metadata

-   Date:
-   Repository/branch:
-   Commit:
-   Auditor:
-   Environment:
-   Commands run:

## 2. Repository inventory

Record: - app and package structure; - mobile and web entry points; -
routing and navigation; - framework and versions; - package manager and
lockfile; - backend and database; - authentication; - storage; -
AI/provider integrations; - report generation; - tests and CI; -
deployment and environment configuration.

## 3. Baseline checks

  Check                      Command                        Result    Notes
  -------------------------- ------------------------------ --------- -------
  Install/dependency state   To determine from repository   Not run   
  Lint                       To determine from repository   Not run   
  Type check                 To determine from repository   Not run   
  Unit tests                 To determine from repository   Not run   
  Integration tests          To determine from repository   Not run   
  Build                      To determine from repository   Not run   

## 4. Feature inventory

For each feature, cite the relevant source files, routes, data
structures, and tests: - Authentication and workspaces - Assessment
Mode - Inspection Mode - Solar workflow - CCTV workflow - Checklist
editing and status - Evidence/photo upload - Voice notes and voice
interaction - AI provider adapter and model capability - Measurements
and calculations - Findings and recommendations - Materials lists -
Supplier quotations - Report generation and snapshots - Offline/draft
recovery - Authorization and audit events

## 5. Security review

Check without copying secret values into this document: - client bundles
and public environment variables; - server-only environment
configuration; - tracked `.env` files; - service-role or privileged keys
in client code; - private storage and signed URL handling; -
server/database authorization; - cross-workspace access; - upload
validation; - provider calls from client code; - log and error
redaction; - dependency and deployment risks.

If a secret is found, do not reproduce it. Record the file/location,
exposure type, immediate mitigation, rotation status, and follow-up
action.

## 6. Findings

  ----------------------------------------------------------------------------
  ID          Severity    Finding     Evidence    Recommended   Owner/status
                                                  action        
  ----------- ----------- ----------- ----------- ------------- --------------
  A-001       TBD         To be       TBD         TBD           Open
                          completed                             
                          from audit                            

  ----------------------------------------------------------------------------

## 7. Architecture decisions

For each decision, record: - current implementation; - proposed change,
if any; - evidence and trade-offs; - migration impact; - security
implications; - approval/status.

## 8. Conclusion

Summarize: - what works today; - what is incomplete; - what is unsafe or
fragile; - what can be reused; - the safest next implementation phase; -
known blockers and unverified assumptions.
