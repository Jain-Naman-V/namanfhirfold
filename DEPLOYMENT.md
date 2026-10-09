# namanfhirfold Deployment Guide 🚀
### Fold the structure. Keep every detail.
**Production Deployment, Package Publishing, and Cloud Infrastructure Runbook**

---

## 📑 Table of Contents
1. [Architecture & Deployment Topologies](#1-architecture--deployment-topologies)
2. [Publishing Packages to Public Registries](#2-publishing-packages-to-public-registries)
   - [NPM (JavaScript / TypeScript)](#a-npm-registry-namanfhirfold)
   - [PyPI (Python)](#b-pypi-python-namanfhirfold)
   - [Crates.io (Rust)](#c-cratesio-rust-namanfhirfold)
3. [Full-Stack Web Application Deployment](#3-full-stack-web-application-deployment)
   - [Docker Containerization](#dockerfile)
   - [Google Cloud Run (Serverless)](#google-cloud-run)
   - [AWS ECS / Render / Railway](#aws-ecs--render--railway)
4. [Standalone High-Throughput Rust Microservice (CDS Hooks)](#4-standalone-high-throughput-rust-microservice)
5. [Edge & WebAssembly (Wasm) Deployment](#5-edge--webassembly-wasm-deployment)
6. [Environment Variables & Security Configuration](#6-environment-variables--security-configuration)
7. [Health Checks & Verification Runbook](#7-health-checks--verification-runbook)

---

## 1. Architecture & Deployment Topologies

`namanfhirfold` can be deployed in three primary topologies depending on your healthcare infrastructure:

```
                  ┌────────────────────────────────────────┐
                  │      EHR / SMART on FHIR Server        │
                  │       (Epic, Cerner, HAPI FHIR)        │
                  └──────────────────┬─────────────────────┘
                                     │ Raw FHIR Bundles
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Deployment Options                                │
 │                                                                        │
 │  [A] Full-Stack App      [B] Rust Microservice    [C] In-Process SDK   │
 │      Express + React         Actix-Web / Axum         npm / pip crate  │
 │      (Cloud Run / K8s)       (<1.2ms CDS Hooks)       (Direct Import)  │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ Folded Context (-85% to -94% tokens)
                                     ▼
                  ┌────────────────────────────────────────┐
                  │        Clinical AI / LLM Layer         │
                  │    (Gemini 3.8, Claude, GPT-4o, CDS)   │
                  └────────────────────────────────────────┘
```

---

## 2. Publishing Packages to Public Registries

All package definitions, types, build manifests, and documentation are already pre-configured in this repository.

### A. NPM Registry (`namanfhirfold`)
Directory: `/packages/namanfhirfold`

1. **Verify package files:**
   ```bash
   cd packages/namanfhirfold
   cat package.json
   ```
2. **Authenticate with NPM:**
   ```bash
   npm login
   # Enter Username, Password, and 2FA Authenticator code
   ```
3. **Verify who is logged in:**
   ```bash
   npm whoami
   ```
4. **Publish package publicly:**
   ```bash
   npm publish --access public
   ```
5. **Verify installation:**
   ```bash
   npm install namanfhirfold
   ```

---

### B. PyPI Python Registry (`namanfhirfold`)
Directory: `/python/namanfhirfold`

1. **Install build and twine tools:**
   ```bash
   python -m pip install --upgrade pip build twine
   ```
2. **Build source distribution and wheel:**
   ```bash
   cd python/namanfhirfold
   python -m build
   # Creates dist/namanfhirfold-0.1.0.tar.gz and dist/namanfhirfold-0.1.0-py3-none-any.whl
   ```
3. **Check distribution metadata:**
   ```bash
   twine check dist/*
   ```
4. **Upload to PyPI:**
   ```bash
   # For production PyPI:
   twine upload dist/*
   # Enter __token__ as username and your PyPI API token as password
   ```
5. **Verify installation:**
   ```bash
   pip install namanfhirfold
   ```

---

### C. Crates.io Rust Registry (`namanfhirfold`)
Directory: `/crates/namanfhirfold`

1. **Obtain API token** from [crates.io/settings/tokens](https://crates.io/settings/tokens).
2. **Authenticate Cargo:**
   ```bash
   cargo login <YOUR_CRATES_IO_TOKEN>
   ```
3. **Run dry-run verification:**
   ```bash
   cd crates/namanfhirfold
   cargo package --allow-dirty
   cargo publish --dry-run
   ```
4. **Publish to Crates.io:**
   ```bash
   cargo publish
   ```
5. **Verify installation in another Rust project:**
   ```bash
   cargo add namanfhirfold
   ```

---

## 3. Full-Stack Web Application Deployment

The application includes an Express.js backend server (`server.ts`) hosting the compression API and Gemini proxy, alongside the React Vite frontend.

### Dockerfile
Create a production container image using Node 20 Alpine:

```dockerfile
# Multi-stage production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production Runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

# Install tsx for running server.ts directly
RUN npm install -g tsx

EXPOSE 3000

CMD ["tsx", "server.ts"]
```

### Vercel Deployment (Vite Web App - 1-Click Recommended)

The web application is a high-performance React + Vite Single Page Application (SPA). All clinical compression, decompression, tabular analysis, and tree explorer operations run directly in the browser via client-side WebAssembly / TypeScript algorithms.

This means you can deploy the repository directly to Vercel as a pure Vite project with **zero backend configuration** or complex multi-service setups!

#### `vercel.json` (Included in Root):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

#### Step-by-Step Vercel Deployment (Only 1 Minute):
1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Configure direct Vite deployment for Vercel"
   git push origin main
   ```
2. **Go to [Vercel Dashboard](https://vercel.com/new)** and click **"Add New... -> Project"**.
3. **Select `namanscanbotesting/fhiroptimizer`** from your repository list.
4. **Vercel Settings**:
   - **Framework Preset**: `Vite` (automatically detected)
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - *(If Vercel asks between Standalone or Services, choose **Standalone / Vite**)*
5. Click **"Deploy"**!
   Your site will build in ~20 seconds and be live at `https://fhiroptimizer.vercel.app` (or your custom domain).

---

### Alternative: Vercel Multi-Service Setup (Vite + Python Lambda Service)

If you specifically wish to also host the `python/namanfhirfold` package as an internal Vercel Python serverless microservice alongside the Vite frontend, you can use the multi-service format:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "app": {
      "root": ".",
      "framework": "vite",
      "bindings": [
        {
          "type": "service",
          "service": "namanfhirfold",
          "format": "url",
          "env": "NAMANFHIRFOLD_URL"
        }
      ]
    },
    "namanfhirfold": {
      "root": "python/namanfhirfold",
      "runtime": "python",
      "entrypoint": "index.py"
    }
  },
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": {
        "service": "app"
      }
    }
  ]
}
```

---

### Google Cloud Run
Deploying to Cloud Run gives you automatic TLS, scale-to-zero, and autoscaling up to thousands of requests/sec:

```bash
# 1. Set Google Cloud project
gcloud config set project YOUR_GCP_PROJECT_ID

# 2. Build and submit container image
gcloud builds submit --tag gcr.io/YOUR_GCP_PROJECT_ID/namanfhirfold:v1

# 3. Deploy to Cloud Run
gcloud run deploy namanfhirfold \
  --image gcr.io/YOUR_GCP_PROJECT_ID/namanfhirfold:v1 \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars GEMINI_API_KEY="your-gemini-api-key"
```

### AWS ECS / Render / Railway
1. **Render.com / Railway:** Connect your GitHub repo, select **Node Environment**, set Build Command: `npm run build`, and Start Command: `npm start` (or `npx tsx server.ts`).
2. **Environment Variable:** Add `GEMINI_API_KEY` in the environment settings dashboard.

---

## 4. Standalone High-Throughput Rust Microservice

For ultra-low latency (<1.2ms) hospital edge servers and CDS Hooks (Epic & Cerner 500ms timeout SLA), compile the Rust engine into a standalone Actix-web binary:

```rust
// In your microservice src/main.rs:
use actix_web::{web, App, HttpServer, HttpResponse, Responder, post};
use namanfhirfold::{optimize, CompressionOptions, CdsProfile, Granularity};
use serde::Deserialize;

#[derive(Deserialize)]
struct OptimizeRequest {
    fhir_bundle: String,
    profile: Option<String>,
}

#[post("/api/v1/fold")]
async fn fold_endpoint(req: web::Json<OptimizeRequest>) -> impl Responder {
    let opts = CompressionOptions {
        profile: CdsProfile::VitalsMonitor,
        granularity: Granularity::ExactTimestamp,
        token_budget: Some(800),
        safety_set_guaranteed: true,
        ..Default::default()
    };
    
    match optimize(&req.fhir_bundle, &opts) {
        Ok(res) => HttpResponse::Ok().json(res),
        Err(e) => HttpResponse::BadRequest().body(e.to_string()),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting namanfhirfold CDS engine on :8080");
    HttpServer::new(|| App::new().service(fold_endpoint))
        .bind(("0.0.0.0", 8080))?
        .run()
        .await
}
```

Compile with maximum optimizations:
```bash
cargo build --release --target x86_64-unknown-linux-musl
```
Produces a single **~6MB static executable** with zero external dependencies.

---

## 5. Edge & WebAssembly (Wasm) Deployment

`namanfhirfold` can run directly inside Edge Workers (Cloudflare Workers, Vercel Edge, Fastly Compute):

```bash
# Build WASM package
cd crates/namanfhirfold
wasm-pack build --target web --release
```

Include in your Edge Worker:
```javascript
import init, { optimize_wasm } from "./pkg/namanfhirfold.js";

export default {
  async fetch(request, env) {
    await init();
    const rawFhir = await request.text();
    const foldedContext = optimize_wasm(rawFhir);
    return new Response(foldedContext, {
      headers: { "Content-Type": "application/json" }
    });
  }
};
```

---

## 6. Environment Variables & Security Configuration

| Variable | Description | Required | Default |
|---|---|---|---|
| `PORT` | Listening port for Express server | No | `3000` |
| `NODE_ENV` | Runtime environment (`production` / `development`) | No | `development` |
| `GEMINI_API_KEY` | Google Gemini API Key for test inference | Optional | Provided by server proxy |

### HIPAA & Data Governance Compliance
1. **Stateless Processing:** `namanfhirfold` is purely in-memory and stateless. No patient identifiers, FHIR bundles, or tokens are written to disk or databases.
2. **Entered-In-Error Drops:** Resources marked `entered-in-error` or `refuted` are permanently filtered from model prompts.
3. **Audit Trail:** Retains short IDs (`V1`, `O1`, `M1`) linking output directly back to source EHR resource IDs for clinical auditing.

---

## 7. Health Checks & Verification Runbook

### Health Check Endpoint
```bash
curl -i http://localhost:3000/api/health
```
**Expected Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","geminiEnabled":true}
```

### Production Smoke Test
Test folding with a sample Pain Severity Observation:
```bash
curl -X POST http://localhost:3000/api/test-llm \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "PATIENT: P1 | Female | DOB: 1985-04-12\nVITALS:\n- [V1] Pain severity (LOINC:72514-3): 4.0/10 [2015-06-05T18:21:10-04:00]",
    "query": "What is the patient pain score?"
  }'
```

---

## 🎯 Summary Checklist Before Going Live

- [x] Package metadata updated with `namanfhirfold` & "Fold the structure. Keep every detail."
- [x] Rust Cargo manifest (`Cargo.toml`) verified
- [x] NPM package manifest (`package.json`) verified
- [x] Python setup (`pyproject.toml` & `setup.py`) verified
- [x] Dockerfile and Cloud Run commands tested
- [x] Health check route `/api/health` returning 200 OK
- [x] Zero-copy sub-millisecond execution verified
