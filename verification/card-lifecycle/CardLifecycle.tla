---- MODULE CardLifecycle ----
\* Model of one physical Tapit card: its status, its claim code, the claim
\* challenge a customer holds, and a pending assignment correction.
\* Each action is one Convex mutation, which is one atomic transaction.
\* Code: convex/cards.ts, convex/cardClaims.ts, convex/cardCorrectionRequests.ts,
\* convex/profiles.ts (publish), src/lib/domain/state-machines.ts.
EXTENDS Naturals

CONSTANT MaxVer \* how many claim codes an administrator may issue

VARIABLES
  status,        \* cards.status
  hasProfile,    \* cards.profileId is set
  published,     \* the card's profile is published
  peerLive,      \* another card on the same profile is active or claimable
  hash,          \* cards.claimCodeHash is set
  invalidated,   \* cards.claimCodeInvalidatedAt is set
  claimed,       \* cards.claimCodeClaimedAt is set
  ver,           \* how many codes were issued; names the current code
  chal,          \* the customer's cardClaimChallenges row: none, active, used
  chalVer,       \* the code that challenge was issued against
  correction,    \* cards.correctionRequestedAt is set
  ownerDisabled, \* cards.ownerDisabledAt is set
  claimsOnCode,  \* history: claims committed against the current code
  badClaim       \* history: a claim committed with a stale, invalidated or claimed code

vars == <<status, hasProfile, published, peerLive, hash, invalidated, claimed, ver,
          chal, chalVer, correction, ownerDisabled, claimsOnCode, badClaim>>

Statuses == {"registered", "claimable", "active", "inactive", "replaced", "lost"}
Live(s) == s \in {"claimable", "active"}
PubStatus(p) == IF p THEN "active" ELSE "claimable"

\* claimCodeState in src/lib/domain/state-machines.ts
CodeState ==
  IF invalidated THEN "invalidated"
  ELSE IF claimed THEN "claimed"
  ELSE IF ~hash THEN "missing"
  ELSE "issued"

Init ==
  /\ status = "registered" /\ hasProfile = FALSE /\ published = FALSE
  /\ peerLive \in BOOLEAN
  /\ hash = FALSE /\ invalidated = FALSE /\ claimed = FALSE /\ ver = 0
  /\ chal = "none" /\ chalVer = 0
  /\ correction = FALSE /\ ownerDisabled = FALSE
  /\ claimsOnCode = 0 /\ badClaim = FALSE

\* cards.attach and cards.assign: no check for another live card on the profile.
AdminAttach ==
  /\ status = "registered"
  /\ \E p \in BOOLEAN :
       /\ status' = PubStatus(p) /\ published' = p
  /\ hasProfile' = TRUE
  /\ UNCHANGED <<peerLive, hash, invalidated, claimed, ver, chal, chalVer, correction,
                 ownerDisabled, claimsOnCode, badClaim>>

\* cards.generateClaimCode
GenerateCode ==
  /\ (status = "registered" /\ ~hasProfile) \/ (Live(status) /\ hasProfile)
  /\ ~correction /\ ~claimed /\ ver < MaxVer
  /\ hash' = TRUE /\ invalidated' = FALSE /\ ver' = ver + 1 /\ claimsOnCode' = 0
  /\ UNCHANGED <<status, hasProfile, published, peerLive, claimed, chal, chalVer,
                 correction, ownerDisabled, badClaim>>

\* cards.invalidateClaimCode
InvalidateCode ==
  /\ ~correction
  /\ invalidated' = TRUE
  /\ UNCHANGED <<status, hasProfile, published, peerLive, hash, claimed, ver, chal, chalVer,
                 correction, ownerDisabled, claimsOnCode, badClaim>>

\* cardClaims.verifyCode: the customer types the code and gets a challenge.
VerifyCode ==
  /\ status \in {"registered", "claimable", "active"}
  /\ ~correction /\ CodeState = "issued"
  /\ chal' = "active" /\ chalVer' = ver
  /\ UNCHANGED <<status, hasProfile, published, peerLive, hash, invalidated, claimed, ver,
                 correction, ownerDisabled, claimsOnCode, badClaim>>

\* cardClaims.complete
CompleteClaim ==
  /\ chal = "active" /\ chalVer = ver
  /\ status \in {"registered", "claimable", "active"}
  /\ ~correction /\ CodeState = "issued"
  /\ hasProfile \/ ~peerLive \* a first assignment refuses a profile that already has a live card
  /\ \E p \in BOOLEAN :
       /\ IF hasProfile THEN p = published ELSE TRUE
       /\ published' = p /\ status' = PubStatus(p)
  /\ hasProfile' = TRUE /\ claimed' = TRUE /\ chal' = "used"
  /\ claimsOnCode' = claimsOnCode + 1
  /\ badClaim' = (badClaim \/ chalVer # ver \/ invalidated \/ claimed)
  /\ UNCHANGED <<peerLive, hash, invalidated, ver, chalVer, correction, ownerDisabled>>

\* cardCorrectionRequests: a customer finds the card assigned to the wrong profile.
RequestCorrection ==
  /\ chal = "active" /\ chalVer = ver /\ Live(status) /\ ~correction
  /\ hash /\ ~invalidated /\ ~claimed
  /\ correction' = TRUE /\ chal' = "used"
  /\ UNCHANGED <<status, hasProfile, published, peerLive, hash, invalidated, claimed, ver,
                 chalVer, ownerDisabled, claimsOnCode, badClaim>>

\* An administrator resolves the correction onto the requester's profile.
ResolveCorrection ==
  /\ correction /\ Live(status) /\ ~invalidated /\ ~claimed
  /\ \E p \in BOOLEAN : published' = p /\ status' = PubStatus(p)
  /\ peerLive' = FALSE \* the requester's profile must have no other live card
  /\ correction' = FALSE
  /\ UNCHANGED <<hasProfile, hash, invalidated, claimed, ver, chal, chalVer, ownerDisabled,
                 claimsOnCode, badClaim>>

\* cards.reassign: move a live card to another profile, retiring its code.
AdminReassign ==
  /\ Live(status) /\ ~correction
  /\ \E p \in BOOLEAN : published' = p /\ status' = PubStatus(p)
  /\ peerLive' \in BOOLEAN
  /\ hash' = FALSE /\ claimed' = FALSE /\ invalidated' = TRUE
  /\ UNCHANGED <<hasProfile, ver, chal, chalVer, correction, ownerDisabled, claimsOnCode, badClaim>>

\* cards.ownerDisable
OwnerDisable ==
  /\ status = "active" /\ claimed /\ ~invalidated /\ ~correction
  /\ status' = "inactive" /\ ownerDisabled' = TRUE
  /\ UNCHANGED <<hasProfile, published, peerLive, hash, invalidated, claimed, ver, chal, chalVer,
                 correction, claimsOnCode, badClaim>>

\* cards.deactivate
AdminDeactivate ==
  /\ status = "active" /\ ~correction
  /\ status' = "inactive" /\ ownerDisabled' = FALSE
  /\ UNCHANGED <<hasProfile, published, peerLive, hash, invalidated, claimed, ver, chal, chalVer,
                 correction, claimsOnCode, badClaim>>

\* cards.markLost and cards.ownerMarkLost
MarkLost ==
  /\ status # "lost" /\ ~correction
  /\ status' = "lost" /\ ownerDisabled' = FALSE
  /\ UNCHANGED <<hasProfile, published, peerLive, hash, invalidated, claimed, ver, chal, chalVer,
                 correction, claimsOnCode, badClaim>>

\* cards.ownerReactivate: back on, but the old code is retired.
OwnerReactivate ==
  /\ status = "inactive" /\ ownerDisabled /\ ~correction
  /\ status' = PubStatus(published)
  /\ hash' = FALSE /\ invalidated' = TRUE /\ claimed' = FALSE /\ ownerDisabled' = FALSE
  /\ UNCHANGED <<hasProfile, published, peerLive, ver, chal, chalVer, correction,
                 claimsOnCode, badClaim>>

\* cards.reactivate
AdminReactivate ==
  /\ status \in {"inactive", "replaced", "lost"} /\ ~correction
  /\ IF status = "lost" /\ ~hasProfile
       THEN /\ status' = "registered" /\ hash' = FALSE
       ELSE /\ hasProfile /\ status' = PubStatus(published) /\ hash' = hash
  /\ invalidated' = TRUE /\ claimed' = FALSE /\ ownerDisabled' = FALSE
  /\ UNCHANGED <<hasProfile, published, peerLive, ver, chal, chalVer, correction,
                 claimsOnCode, badClaim>>

\* cards.replace: the old card is retired, a new card takes over elsewhere.
Replace ==
  /\ status = "active" /\ hasProfile /\ ~correction
  /\ status' = "replaced"
  /\ UNCHANGED <<hasProfile, published, peerLive, hash, invalidated, claimed, ver, chal, chalVer,
                 correction, ownerDisabled, claimsOnCode, badClaim>>

\* profiles.publish: a claimed card waiting on an unpublished profile goes live.
PublishProfile ==
  /\ hasProfile /\ ~published
  /\ published' = TRUE
  /\ status' = IF status = "claimable" /\ claimed THEN "active" ELSE status
  /\ UNCHANGED <<hasProfile, peerLive, hash, invalidated, claimed, ver, chal, chalVer,
                 correction, ownerDisabled, claimsOnCode, badClaim>>

UnpublishProfile ==
  /\ hasProfile /\ published
  /\ published' = FALSE
  /\ UNCHANGED <<status, hasProfile, peerLive, hash, invalidated, claimed, ver, chal, chalVer,
                 correction, ownerDisabled, claimsOnCode, badClaim>>

\* An administrator attaches or moves another card on or off this card's profile.
PeerChanges ==
  /\ hasProfile
  /\ peerLive' = ~peerLive
  /\ UNCHANGED <<status, hasProfile, published, hash, invalidated, claimed, ver, chal, chalVer,
                 correction, ownerDisabled, claimsOnCode, badClaim>>

Next ==
  \/ AdminAttach \/ GenerateCode \/ InvalidateCode \/ VerifyCode \/ CompleteClaim
  \/ RequestCorrection \/ ResolveCorrection \/ AdminReassign \/ OwnerDisable
  \/ AdminDeactivate \/ MarkLost \/ OwnerReactivate \/ AdminReactivate \/ Replace
  \/ PublishProfile \/ UnpublishProfile \/ PeerChanges

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ status \in Statuses /\ chal \in {"none", "active", "used"}
  /\ ver \in 0..MaxVer /\ chalVer \in 0..MaxVer /\ claimsOnCode \in 0..2
  /\ {hasProfile, published, peerLive, hash, invalidated, claimed, correction,
      ownerDisabled, badClaim} \subseteq BOOLEAN

\* A card with no profile is registered; every other live card has a profile.
StatusMatchesProfile ==
  /\ status = "registered" => ~hasProfile
  /\ Live(status) => hasProfile
\* A claim needs a profile to claim into.
ClaimNeedsProfile == claimed => (hasProfile /\ hash)
\* One claim code gives one claim.
OneClaimPerCode == claimsOnCode <= 1
\* A claim never commits on a code that was replaced, invalidated or already used.
NoClaimOnDeadCode == ~badClaim
\* A pending correction freezes a card that is live.
CorrectionFreezesCard == correction => Live(status)
\* Only a card the customer switched off has the owner-disabled mark.
OwnerDisabledMeansInactive == ownerDisabled => status = "inactive"
\* A claimed card is never left waiting on a profile that is already published.
ClaimedCardGoesLive == (status = "claimable" /\ claimed) => ~published

====
