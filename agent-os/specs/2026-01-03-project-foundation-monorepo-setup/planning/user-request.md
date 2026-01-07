# User Request: Project Foundation & Monorepo Setup

## Goal
Enable project setup and project structure. Initialize and set up so I can start executing test api calls in the next spec.

## Business Rules (API Interactions)
This architecture relies on a "Hybrid" approach:
- **SOAP API:** Used for heavy lifting (Creating DEs, Queries, and retrieving Schema).
- **REST API:** Used for speed and modern features (Pagination, Automations, and Auth).

### 1. Initialization (App Load)
When the user first opens the app, we need to build the "Explorer" tree.
- **Fetch Local Data Extensions**
    - Method: SOAP Retrieve
    - Object: DataExtension
    - Properties: Name, CustomerKey, CategoryID (Folder ID)
    - Filter: Client.ID = [Current_MID]
- **Fetch Shared Data Extensions**
    - Method: SOAP Retrieve
    - Object: DataExtension
    - Filter: Client.ID = [Parent_MID] (Enterprise ID)
    - Note: Query Account object to get ParentID first.
- **Build Folder Structure**
    - Method: SOAP Retrieve
    - Object: DataFolder
    - Filter: ContentType = dataextension

### 2. The "Intelligent Autocomplete" (Context Awareness)
As the user types, fetch schema metadata Just-In-Time.
- **Lazy-Load Schema**
    - Method: SOAP Retrieve
    - Object: DataExtensionField
    - Filter: DataExtension.CustomerKey = [Selected_DE_Key]
    - Properties: Name, FieldType, MaxLength, IsPrimaryKey, IsRequired

### 3. Execution: The "Run" Button
**Scenario A: "Run to Temp" (Scratchpad)**
1. **Generate Session Artifacts:** Generate RunID (UUID). Target DE Name = Spectra_Temp_8f7b
2. **Create Temp Data Extension:**
    - Method: SOAP Create
    - Object: DataExtension
    - Payload: Name: Spectra_Temp_8f7b, Retention: 24 Hours
3. **Create Query Definition:**
    - Method: SOAP Create
    - Object: QueryDefinition
    - Payload: QueryText: SELECT ..., Target: Spectra_Temp_8f7b
4. **Execute Query:**
    - Method: SOAP Perform
    - Object: QueryDefinition
    - Action: Start
5. **Retrieve Results (Page 1):**
    - Method: REST GET
    - Endpoint: `/data/v1/customobjectdata/key/Spectra_Temp_8f7b/rowset`
    - Params: `$page=1`, `$pageSize=50`

**Scenario B: "Run to Target" (Wizard)**
1. **Validate Target Exists (Optional):** SOAP Retrieve DataExtension (Name check)
2. **Create Permanent DE:** SOAP Create (No Retention)
3. **Execute Query:** Same as Scenario A but pointing to Permanent DE.

### 4. Deployment: "Deploy to Automation"
- **Create Query Activity:**
    - Method: SOAP Create
    - Object: QueryDefinition

### 5. Data Viewing (Pagination & Management)
- **Scroll Grid (Fetch Next Page):**
    - Method: REST GET
    - Endpoint: `/data/v1/customobjectdata/key/{DE_Key}/rowset`
    - Params: `$page=2`, `$pageSize=50`
- **Deep Link (Contact Builder):**
    - URL: `https://mc.exacttarget.com/cloud/#app/Email/Datamanagement/DataExtension/...`

## Desired Tech Stack
- **Apps:**
    - `/web`: React + Vite + Monaco
    - `/api`: NestJS + Passport
    - `/worker`: Node.js + BullMQ
- **Packages:**
    - `/database`: Drizzle ORM Schema + Migrations
    - `/shared-types`: DTOs, Zod Schemas, API Interfaces
    - `/eslint-config`: Strict Security Rules

## Frontend Structure
- `src/app/`
- `src/bridge/` (MCE PostMessage Anti-Corruption Layer)
- `src/core/` (Spectra UI Design System)
- `src/features/` (Editor, Sidebar, Wizard)
- `src/services/` (API Layer - TanStack Query)
- `src/store/` (Zustand)
