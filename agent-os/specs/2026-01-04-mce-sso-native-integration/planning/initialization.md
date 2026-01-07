# Feature Idea: MCE Native SSO Integration

Shift the application's authentication from a standalone OAuth2 "Login Button" flow to a platform-native SSO flow initiated via the Salesforce Marketing Cloud Engagement App Switcher. This ensures the app operates as a proper AppExchange-ready "Marketing Cloud App."

## Key Requirements
1. **JWT Receiver**: Implement a POST /auth/login endpoint that receives the signed JSON Web Token (JWT) posted by MCE when a user launches the app from the App Switcher.
2. **Signature Verification**: Use jose to verify the JWT using the JWT_SIGNING_SECRET from the Installed Package.
3. **Context Discovery**: Extract user_id, enterprise_id (EID), and member_id (MID) from the JWT payload.
4. **Web App Integration Handshake**: Update the OAuth flow to use a "Web App" API Integration component. Use the provided request context to exchange for an access token.
5. **Tenant-Aware Session**: Use the discovered EID and TSSD to establish a secure session and upsert Tenant/User records.
6. **UI Cleanup**: Remove the standalone login form. The app should only be accessible through MCE.

## Technical Constraints
- Backend: NestJS (Fastify).
- Library: jose for JWT.
- Config: MCE_JWT_SIGNING_SECRET environment variable.
