# Spec Requirements: MCE Native SSO Integration

## Initial Description
Shift the application's authentication from a standalone OAuth2 "Login Button" flow to a platform-native SSO flow initiated via the Salesforce Marketing Cloud Engagement App Switcher. This ensures the app operates as a proper AppExchange-ready "Marketing Cloud App."

## Requirements Discussion

### First Round Questions

**Q1: I assume the POST /auth/login endpoint should verify the MCE JWT and then establish a local application session. Is that correct, or do you have another preference?**
**Answer:** The user requested clarification. Research confirms that standard best practice is to verify the JWT once and then issue a secure session (e.g., HTTP-only cookie) to maintain the authenticated state in the browser.

**Q2: Should we automatically provision Tenant and User records in the database if they don't exist upon a valid JWT login?**
**Answer:** The user was unsure and requested research. Research confirms auto-provisioning is safe as long as the JWT signature is verified. This "Just-In-Time" (JIT) provisioning is standard for MCE AppExchange apps.

**Q3: Does the "Web App" component allow us to exchange context directly for a token?**
**Answer:** The user requested research. Research shows that for "Web App" integrations, the JWT provides the identity context, which the backend then uses with its Client ID and Secret to perform a server-to-server OAuth exchange to get access/refresh tokens.

**Q4: For UI cleanup, I assume any direct access to the application URL should redirect to the main page after the handshake. Is that the desired UX?**
**Answer:** Yes. The login page will be removed. The app will be accessed directly from MCE, and the handshake will lead directly to the main "Verifier" page.

**Q5: I assume we should resolve the Tenant Specific Subdomain (TSSD) from the JWT. Is that correct?**
**Answer:** Yes. Research shows the JWT payload contains stack or base URL context needed for TSSD resolution.

**Q6: Are there any specific exclusions for this phase, such as handling Business Unit (MID) switching?**
**Answer:** No BU switching within the app. The user will switch BUs in MCE and re-access the app, triggering a new handshake for the new context.

### Existing Code to Reference
**Similar Features Identified:**
- `apps/api/src/auth/`: Check for existing OAuth2 logic.
- `apps/api/src/database/` and `packages/database/`: Reference current Tenant/User repository implementations.
- `apps/api/src/common/`: Reference encryption utilities for the "Token Wallet."

## Visual Assets
### Files Provided:
No visual assets provided.

### Visual Insights:
- The user specified that the post-handshake destination should be the "Verifier" page from the previous spec, focusing on functional verification.

## Requirements Summary

### Functional Requirements
- **JWT Verification:** Implement a POST endpoint that validates the `jose`-signed JWT from MCE.
- **Context Extraction:** Extract `enterprise_id`, `member_id`, and `user_id` from the JWT.
- **OAuth Handshake:** Use extracted context and application credentials to obtain and store OAuth tokens in the "Token Wallet."
- **Auto-Provisioning:** Create `Tenant` and `User` records in the database if they do not exist.
- **Session Establishment:** Issue a secure session cookie after successful handshake.
- **UI Redirection:** Automatically handle the flow and redirect to the application's main interface.

### Reusability Opportunities
- Reuse existing database repository patterns for Tenant/User management.
- Reuse `jose` for JWT handling (already in tech stack).
- Reuse the encryption logic for secure token storage.

### Scope Boundaries
**In Scope:**
- Backend JWT receiver and verification.
- Backend OAuth handshake and token storage.
- Auto-provisioning of Tenants/Users.
- Removal of the manual login page.
- Redirection to the Verifier page.

**Out of Scope:**
- In-app Business Unit switching logic.
- Support for non-MCE SSO login methods.

### Technical Considerations
- **Security:** Strict signature verification is the primary security gate for auto-provisioning.
- **Performance:** Handshake should be efficient to minimize "loading" time for the user.
- **Environment:** Requires `MCE_JWT_SIGNING_SECRET` to be configured.
