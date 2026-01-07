# Spec Requirements: Authentication & Token Wallet

## Initial Description
Authentication & Token Wallet. Implementation of OAuth 2.0 Code Flow, Multi-Org Session Management, and the secure "Token Wallet" for storing encrypted refresh tokens.

## Requirements Discussion

### First Round Questions

**Q1:** For the MCE OAuth 2.0 flow, I assume we are implementing a **Web App** integration (requiring `client_id` and `client_secret`) where the secret is handled exclusively by the NestJS backend. Is that correct?
**Answer:** Yes, this is true. (Note: User requested help understanding the AppExchange automatic setup process).

**Q2:** Regarding "Multi-Org Session Management," I'm thinking we should allow users to authorize multiple Business Units (MIDs). Should the UI provide a global switcher to change the "Active MID" context for the editor, or should it automatically detect the MID from the authorized session?
**Answer:** User believes MCE handles this via context switching (re-auth on BU switch). Research confirms: MCE re-triggers the app's login/logout flow when a user switches BUs in the MC UI.

**Q3:** For the **Token Wallet**, I assume we will store the encrypted refresh tokens in our PostgreSQL database using Drizzle ORM, linked to a `User` or `Tenant` record. Is that the intended storage strategy?
**Answer:** Yes.

**Q4:** You mentioned **AES-256-GCM** for encryption. I assume the encryption key will be managed via a backend environment variable (e.g., `ENCRYPTION_KEY`). Should we also consider a cloud-native key management system (like AWS KMS or HashiCorp Vault) for this phase, or is an ENV variable sufficient for now?
**Answer:** Yes, we should consider/implement this.

**Q5:** When a session expires or a token is revoked, I'm thinking the app should trigger a "Session Expired" modal that directs the user to re-authenticate without losing their current query draft in the Monaco editor. Does that align with your UX expectations?
**Answer:** User suggested using the refresh token to re-authorize quietly for them.

**Q6:** Are there any authentication methods that are explicitly **out of scope** for this phase (e.g., SAML SSO, or LDAP)?
**Answer:** Auth will be handled strictly as an AppExchange app (ISV).

### Existing Code to Reference
No existing code to reuse as the project is just getting started.

**Similar Features Identified:**
- None.

### Follow-up Questions
**Follow-up 1:** Is it too early to implement tests? At the end of this spec, would we in theory be able to test the oauth flow and execute a sample api call?
**Answer:** It is not too early. The goal is to have a testable OAuth flow and a sample API call by the end of this spec.

## Visual Assets

### Files Provided:
No visual assets provided.

## Requirements Summary

### Functional Requirements
- **OAuth 2.0 Code Flow:** Implement the full handshake (Authorize -> Code -> Token) using the MCE "Web App" integration pattern.
- **Dynamic Subdomain (TSSD) Support:** Handle the tenant-specific subdomains provided during the authorization flow.
- **Quiet Re-authentication:** Use refresh tokens to automatically obtain new access tokens without interrupting the user.
- **Token Wallet:** A secure backend service to encrypt/decrypt and store refresh tokens.
- **Multi-Tenant / Multi-MID Awareness:** Logic to handle different MIDs, ensuring tokens are scoped correctly to the active BU.

### Reusability Opportunities
- Use the `Tenant-Aware Repository` pattern established in Phase 1 (Project Foundation).
- Drizzle ORM schemas in `packages/database`.

### Scope Boundaries
**In Scope:**
- OAuth 2.0 Authorization Code Flow for AppExchange apps.
- Encryption service (AES-256-GCM).
- Database schema for storing tokens.
- Backend "Refresh" logic.
- A "Smoke Test" API call to verify authentication.

**Out of Scope:**
- Direct SAML/LDAP integrations.
- UI for managing multiple "Linked Accounts" (handled by MCE's own BU context).

### Technical Considerations
- **AppExchange Deployment:** The app must be ready for multi-tenant usage (same Client ID/Secret across all customers).
- **Environment Management:** Use ENV variables for Encryption Keys for now, with architecture prepared for KMS integration.
- **Drizzle Integration:** Tokens must be linked to the `Tenant` (Account/BU) and `User` entities.
