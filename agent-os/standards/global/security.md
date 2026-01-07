# Security Standards

## Prohibited Patterns

### ❌ XSS Vulnerabilities

Never use `dangerouslySetInnerHTML` - it opens the door to cross-site scripting (XSS) attacks.

```typescript
❌ PROHIBITED:
<div dangerouslySetInnerHTML={{ __html: userInput }} />

✅ SAFE ALTERNATIVE:
<div>{userInput}</div>  // React automatically escapes content
```

**For Rich Text/HTML:**
Use a sanitization library like DOMPurify:

```typescript
import DOMPurify from 'dompurify'

✅ SAFE:
const sanitizedHTML = DOMPurify.sanitize(userInput)
<div dangerouslySetInnerHTML={{ __html: sanitizedHTML }} />
```

---

### ❌ Insecure Token Storage

Never store sensitive data (JWTs, session tokens, API keys) in `localStorage` or `sessionStorage`.

```typescript
❌ PROHIBITED:
localStorage.setItem('authToken', token)
localStorage.setItem('apiKey', apiKey)

✅ SAFE ALTERNATIVE:
// Let backend manage tokens via HttpOnly cookies
// Frontend receives cookies automatically, no manual storage needed
```

**Why This Matters:**
- `localStorage` is accessible to all JavaScript (including XSS attacks)
- HttpOnly cookies cannot be accessed by JavaScript
- Backend controls token lifecycle and security

**Current Implementation:**
Tokens will be managed server-side through HttpOnly cookies when the backend is implemented.

---

### ❌ Client-Side Secrets

Never hardcode API keys, secrets, or credentials in frontend code.

```typescript
❌ PROHIBITED:
const API_KEY = 'sk-1234567890abcdef'
const SECRET = 'my-secret-key'

fetch('https://api.example.com', {
  headers: { 'X-API-Key': API_KEY }
})

✅ SAFE ALTERNATIVE:
// Proxy through Backend-for-Frontend (BFF)
fetch('/api/protected-resource')  // BFF adds API key server-side
```

**Why This Matters:**
- Frontend code is public (visible in browser dev tools)
- Source maps expose all variables
- Git history may leak secrets
- API keys can be extracted and abused

**Architecture Pattern:**
```
Frontend → BFF (Backend-for-Frontend) → External API
             ↑ Adds API keys/secrets here
```

---

## Safe Alternatives Summary

| Vulnerability | Prohibited | Safe Alternative |
|---------------|-----------|------------------|
| XSS | `dangerouslySetInnerHTML` | React's automatic escaping or DOMPurify |
| Token Theft | `localStorage.setItem('token', ...)` | HttpOnly cookies (backend-managed) |
| Exposed Secrets | Hardcoded API keys | BFF proxy pattern |

---

## Additional Best Practices

### Input Validation
```typescript
✅ Validate user input before processing:
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_')
}
```

### HTTPS Only
```typescript
✅ Enforce secure connections:
if (window.location.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
  window.location.href = window.location.href.replace('http:', 'https:')
}
```

### Content Security Policy
Configure CSP headers on the server to prevent inline scripts and unauthorized resource loading.

---

## Future Considerations

When backend is implemented:
1. All authentication flows through secure endpoints
2. Tokens managed via HttpOnly cookies with SameSite attribute
3. CSRF protection via tokens or double-submit cookies
4. Rate limiting on sensitive endpoints
5. Input validation on both client and server
