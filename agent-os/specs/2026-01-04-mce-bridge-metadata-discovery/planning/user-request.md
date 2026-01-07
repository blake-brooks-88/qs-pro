Goal: 
  Define the specification for a "Bridge" infrastructure in NestJS that abstracts
  all communication with Salesforce Marketing Cloud Engagement, followed by the iterative
  implementation of metadata discovery services.

  Architectural Requirements (The "Bridge"):
   1. Unified MCE Client: Create a service/utility that wraps axios and
      automatically handles:
       - TSSD Resolution: Dynamically construct the base URL
         (https://{{tssd}}.rest...) using the current tenant's subdomain.
       - Auto-Signing: Intercept outgoing requests to inject the Authorization:
         Bearer [token] header by calling AuthService.refreshToken.
       - Error Normalization: Convert MCE’s varied responses (REST JSON errors vs.
         SOAP Faults) into a unified internal error format.
   2. Stateless Design: The Bridge must be stateless, relying on the tenantId and
      userId passed through the NestJS request context or as parameters.

  Functional Requirements (Metadata Iterations):
  Implement these in a "verify-as-you-go" sequence:
   1. Iteration 1 (Folder Hierarchy): Retrieve the Data Extension folder tree
      (DataFolder SOAP object).
   2. Iteration 2 (DE Discovery): Retrieve Data Extensions for the current BU. Must
      include the ability to identify "Shared" (ENT) Data Extensions.
   3. Iteration 3 (Field Schemas): A lazy-loading endpoint to fetch the fields, data
      types, and primary keys for a specific Data Extension (DataExtensionField SOAP
      object).

  Caching Strategy:
   - Integrate the existing Redis container to cache these metadata results (e.g.,
     Folders for 10m, Fields for 30m) to minimize API latency and respect MCE rate
     limits.

  Constraints:
   - Adhere to the project's @ alias imports.
   - Maintain strict TypeScript safety for all MCE response types.
   - Ensure the architecture is compatible with the future "Pass-through API" and
     "BullMQ" streaming requirements.