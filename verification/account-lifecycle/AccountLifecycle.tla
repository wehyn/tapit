---- MODULE AccountLifecycle ----
\* Model of one Tapit customer account: sign-up (self-service or prepared by an
\* administrator), the prepared setup link, and deletion. These fields move
\* together but are written by separate mutations, so this model checks that
\* the combinations stay consistent.
\* Code: convex/customers.ts, convex/invitations.ts, convex/authIdentity.ts,
\* convex/preparedSetup.ts, src/lib/domain/state-machines.ts.
\* Each action is one Convex mutation, which is one atomic transaction.
EXTENDS Naturals

VARIABLES
  cstatus,  \* customers.status, or "gone" once the row is physically deleted
  delstat,  \* customers.deletionStatus
  setup,    \* customers.setupState; "none" is null
  req,      \* newest deletionRequests row: none, open (requested), approved
  prepared, \* a prepared_setup invitation row exists for the account
  invLive,  \* a prepared_setup invitation is usable and unexpired
  hasUser   \* customers.userId is set
vars == <<cstatus, delstat, setup, req, prepared, invLive, hasUser>>

Init ==
  \/ \* customers.createSelfServiceAccount
     /\ cstatus = "pending" /\ delstat = "active" /\ setup = "none" /\ req = "none"
     /\ prepared = FALSE /\ invLive = FALSE /\ hasUser = TRUE
  \/ \* customers.createPrepared
     /\ cstatus = "invited" /\ delstat = "active" /\ setup = "waiting" /\ req = "none"
     /\ prepared = TRUE /\ invLive = TRUE /\ hasUser = FALSE

\* customers.completeSelfServiceOnboarding
CompleteOnboarding ==
  /\ cstatus = "pending"
  /\ cstatus' = "active" /\ setup' = "active"
  /\ UNCHANGED <<delstat, req, prepared, invLive, hasUser>>

\* invitations.claim: the customer opens the setup link and signs in.
ClaimSetupLink ==
  /\ cstatus = "invited" /\ delstat = "active" /\ ~hasUser /\ setup = "waiting" /\ invLive
  /\ cstatus' = "active" /\ setup' = "active" /\ hasUser' = TRUE /\ invLive' = FALSE
  /\ UNCHANGED <<delstat, req, prepared>>

\* customers.expirePreparedSetup, run by the scheduler when the link runs out.
ExpireLink ==
  /\ setup = "waiting"
  /\ setup' = "draft" /\ invLive' = FALSE
  /\ UNCHANGED <<cstatus, delstat, req, prepared, hasUser>>

\* invitations.revoke
RevokeLink ==
  /\ cstatus = "invited" /\ delstat = "active" /\ setup = "waiting"
  /\ setup' = "draft" /\ invLive' = FALSE
  /\ UNCHANGED <<cstatus, delstat, req, prepared, hasUser>>

\* invitations.generate and invitations.replace
GenerateLink ==
  /\ cstatus = "invited" /\ delstat = "active" /\ ~hasUser /\ setup \in {"draft", "waiting"}
  /\ setup' = "waiting" /\ invLive' = TRUE
  /\ UNCHANGED <<cstatus, delstat, req, prepared, hasUser>>

\* customers.deletePreparedDraft removes the account row.
DeletePreparedDraft ==
  /\ cstatus = "invited" /\ ~hasUser /\ prepared
  /\ cstatus' = "gone" /\ setup' = "none" /\ invLive' = FALSE
  /\ UNCHANGED <<delstat, req, prepared, hasUser>>

\* customers.deletePendingAccount
DeletePending ==
  /\ cstatus = "pending"
  /\ cstatus' = "deleted" /\ delstat' = "deleted" /\ setup' = "none"
  /\ UNCHANGED <<req, prepared, invLive, hasUser>>

\* customers.requestDeletion
RequestDeletion ==
  /\ cstatus = "active" /\ delstat = "active"
  /\ delstat' = "requested" /\ req' = "open"
  /\ UNCHANGED <<cstatus, setup, prepared, invLive, hasUser>>

\* customers.approveDeletion
ApproveDeletion ==
  /\ req = "open" /\ cstatus = "active"
  /\ req' = "approved" /\ cstatus' = "deleted" /\ delstat' = "deleted"
  /\ setup' = "none" \* only a claimed account reaches approval, so no link is live
  /\ UNCHANGED <<prepared, invLive, hasUser>>

\* authIdentity: a deleted customer signs in again and starts over.
RestartAccount ==
  /\ cstatus = "deleted" /\ delstat = "deleted"
  /\ cstatus' = "pending" /\ delstat' = "active" /\ setup' = "none"
  /\ UNCHANGED <<req, prepared, invLive, hasUser>>

\* The row is gone: nothing more can happen.
Done == cstatus = "gone" /\ UNCHANGED vars

Next ==
  \/ CompleteOnboarding \/ ClaimSetupLink \/ ExpireLink \/ RevokeLink \/ GenerateLink
  \/ DeletePreparedDraft \/ DeletePending \/ RequestDeletion \/ ApproveDeletion
  \/ RestartAccount \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ cstatus \in {"pending", "invited", "active", "deleted", "gone"}
  /\ delstat \in {"active", "requested", "deleted"}
  /\ setup \in {"none", "waiting", "draft", "active"}
  /\ req \in {"none", "open", "approved"}
  /\ {prepared, invLive, hasUser} \subseteq BOOLEAN

\* An account is deleted in one field exactly when it is deleted in the other.
DeletedAgrees == (cstatus = "deleted") <=> (delstat = "deleted")
\* A deletion request is open exactly while the customer is waiting on it.
OpenRequestMeansRequested == (req = "open") <=> (delstat = "requested")
\* Only an active customer can be waiting for a deletion decision.
RequestedNeedsActive == delstat = "requested" => cstatus = "active"
\* An active account has finished setup, and only an active account has.
SetupActiveMatchesAccount == (setup = "active") <=> (cstatus = "active")
\* A usable setup link belongs to an unclaimed prepared account.
LiveLinkNeedsUnclaimedAccount == invLive => (cstatus = "invited" /\ ~hasUser)
\* "Waiting" means exactly that a live link exists; "draft" means none does.
WaitingMeansLiveLink == (setup = "waiting") <=> invLive
\* A pending (self-service) account has no prepared setup.
PendingHasNoSetup == cstatus = "pending" => setup = "none"
\* A prepared account that is not yet claimed is either waiting or a draft.
InvitedHasSetup == cstatus = "invited" => setup \in {"waiting", "draft"}

\* A deleted account carries no prepared setup (fixed: approveDeletion used to leave "draft").
DeletedHasNoSetup == cstatus = "deleted" => setup = "none"
====
