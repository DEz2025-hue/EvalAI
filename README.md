# EvalAI

EvalAI is a professional site-assessment and inspection platform designed for solar and CCTV system installers and inspectors. It provides structured workflows for conducting assessments, capturing evidence, generating reports, and managing client projects.

**Current Focus**: Solar and CCTV installers
**Future Plans**: Expansion to other inspection and assessment industries

## What EvalAI Does

EvalAI helps technicians and engineers conduct thorough site assessments and inspections with:

- **Structured Workflows**: Step-by-step checklists for Solar and CCTV assessments and inspections
- **Evidence Capture**: Upload photos, record voice notes, and document measurements directly in the field
- **AI-Assisted Drafting**: Get AI-powered drafts for findings, recommendations, and reports (always editable and requiring human review)
- **Professional Reports**: Generate versioned PDF and HTML reports from assessment data
- **Cross-Platform**: Web dashboard for office work and mobile app for field operations
- **Team Collaboration**: Manage sites, templates, quotations, and team members
- **Audit Trail**: Full traceability of all changes with versioned snapshots

**Current Industries**: Solar installation and CCTV installation
**Roadmap**: Planned expansion to other inspection and assessment industries

## Key Features

### Assessment Workflows
- **Solar Assessments**: New installations, existing system inspections, annual maintenance checks
- **CCTV Assessments**: New system design, existing system evaluation, insurance reviews
- **Inspections**: General inspections using the same structured workflow

*Note: Currently focused on Solar and CCTV industries with plans to expand to other sectors.*

### Evidence & Documentation
- Photo capture with automatic job and checklist item tagging
- Voice recording with transcription support
- Measurement recording with validation
- Evidence linked to specific checklist items for traceability

### AI Assistance (Optional)
- AI-assisted analysis of photos and site context
- Draft findings and recommendations (always editable)
- Clarification questions to fill information gaps
- Voice transcription for field notes
- **All AI outputs require human review before saving**

### Reporting
- Generate professional PDF reports from assessment data
- HTML preview for quick review
- Versioned snapshots - finalized reports are immutable
- Shareable reports with controlled access

## Technology Stack

EvalAI is built as a modern pnpm monorepo:

- **Frontend**: Next.js (web) + Expo React Native (mobile)
- **Backend**: Supabase (PostgreSQL, Authentication, Row-Level Security, Storage)
- **Deployment**: Vercel
- **AI Provider**: Meta Model API (Wonder, Spark, Voice Transcribe, SAM 3.1) via server-side adapter
- **Language**: TypeScript throughout

## Quick Start

```bash
# Prerequisites: Node >= 18

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your actual values (never commit this file)

# Start development servers
pnpm dev:web     # Web dashboard at http://localhost:3000
pnpm dev:mobile  # Mobile app (Expo)
```

## Project Structure

```
eval-ai/
├── apps/
│   ├── web/          # Next.js web application
│   └── mobile/       # Expo React Native mobile app
├── packages/
│   ├── shared/       # Shared domain logic, calculations, types
│   ├── ai-adapter/   # Server-side Meta AI adapter
│   └── supabase/     # Supabase client and migrations
├── supabase/         # SQL migrations and RLS policies
└── README.md         # This file
```

## Security

EvalAI is built with security-first principles:

- **Server-Only Secrets**: All API keys and sensitive credentials are server-side only (`AI_PROVIDER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) - never exposed to clients
- **Row-Level Security (RLS)**: Database access controlled by RLS policies with deny-by-default approach
- **Private Storage**: Evidence files stored in private Supabase Storage with short-lived signed URLs
- **Authentication**: Secure authentication with workspace-based access control
- **Audit Trail**: All data changes are tracked and auditable

## Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:rls      # Row-Level Security tests
pnpm test:e2e      # End-to-end tests
```

### Database Migrations

```bash
# Apply migrations
pnpm db:push

# Reset database (development only)
pnpm db:reset
```

## AI Usage

EvalAI uses Meta's AI models for optional assistance:

- **Wonder**: Complex analysis and assessment review
- **Spark**: Fast clarification and checklist suggestions
- **Voice Transcribe**: Audio transcription for field notes
- **SAM 3.1**: Visual segmentation (prepared but not yet integrated)

**Important**: All AI outputs are:
- Clearly labeled as drafts requiring human review
- Never auto-saved as verified facts
- Used only as suggestions to speed up work
- Always editable before finalizing

## Reports

Reports are generated from versioned snapshots:
- PDF and HTML formats supported
- Snapshots are immutable once finalized
- Later edits never mutate finalized reports
- Full traceability from evidence to report

## Deployment

EvalAI is designed for deployment on Vercel with Supabase as the backend.

## Getting Started with EvalAI

EvalAI currently supports Solar and CCTV installation workflows. Here's how to get started:

### For Solar Installers

1. **Create a New Assessment**
   - Navigate to the dashboard and click "New Assessment"
   - Select "Solar" and provide site details
   - Work through the checklist: site context, roof assessment, electrical review, measurements

2. **Capture Evidence**
   - Upload photos of the site, roof, electrical panels
   - Record voice notes for observations
   - Document measurements (roof area, panel spacing, cable runs)

3. **Generate Report**
   - Review captured evidence and checklist status
   - Optionally request AI assistance for findings and recommendations
   - Generate PDF report for client

### For CCTV Installers

1. **Create a New Assessment**
   - Navigate to the dashboard and click "New Assessment"
   - Select "CCTV" and define coverage areas
   - Work through the checklist: site survey, camera positions, connectivity, storage

2. **Document Design**
   - Record camera locations and viewing angles
   - Document network and power requirements
   - Capture site photos for reference

3. **Generate Quotation**
   - Review checklist and evidence
   - Generate materials list with specifications
   - Create quotation for client approval

### For Inspectors

1. **Start an Inspection**
   - Navigate to "Inspections" and create a new inspection
   - Use the same structured workflow as assessments
   - Focus on compliance and condition verification

2. **Document Findings**
   - Capture evidence of compliance or non-compliance
   - Record measurements and observations
   - Flag issues requiring attention

3. **Report Results**
   - Generate inspection report with findings
   - Provide clear recommendations
   - Track follow-up actions

## License

Proprietary - All rights reserved

## Roadmap

### Current (v1.0)
- ✅ Solar installation assessments and inspections
- ✅ CCTV system design and evaluation
- ✅ Web dashboard and mobile app
- ✅ AI-assisted drafting (optional)
- ✅ Professional PDF and HTML reports
- ✅ Team collaboration features

### Planned (Future Releases)
- 🔄 Expansion to additional industries (HVAC, electrical, plumbing, etc.)
- 🔄 Industry-specific checklist templates
- 🔄 Enhanced AI features for different use cases
- 🔄 Integration with third-party tools and services
- 🔄 Advanced analytics and reporting

*Have suggestions for industries or features? We'd love to hear from you.*

## Support

For questions or issues, please refer to the project documentation or contact the development team.
