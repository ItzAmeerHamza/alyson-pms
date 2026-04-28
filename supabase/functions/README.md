# Supabase Edge Functions

This directory contains Supabase Edge Functions that run in the Deno runtime.

## TypeScript Setup

### Linter Errors
You may see TypeScript linter errors in VS Code for:
- URL imports (`https://deno.land/...`)
- `Deno` global not found

**These errors are normal and don't affect functionality.** The functions run perfectly in Supabase's Deno runtime.

### Solutions
1. **VS Code Deno Extension**: Install the [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
2. **Local Configuration**: We've added:
   - `deno.d.ts` - Basic Deno types
   - `tsconfig.json` - TypeScript config for Deno
   - `.vscode/settings.json` - VS Code Deno settings

### Development
```bash
# Test function locally
supabase functions serve ai-screenshot-analyzer

# Deploy function
supabase functions deploy ai-screenshot-analyzer
```

## Edge Functions

### **🤖 AI Analysis System (Hugging Face Powered)**
- **ai-session-analyst**: 🆕 **Main AI analyzer** using Qwen2.5-7B-Instruct + Qwen2.5-VL-7B-Instruct
- **ai-insights-worker**: Consolidated 15-minute AI worker (calls comprehensive-employee-analysis)
- **comprehensive-employee-analysis**: AI-powered employee insights using GLM-4.7 (Hugging Face)
- **ai-screenshot-analyzer**: AI-powered screenshot analysis using GLM-4.7 + Qwen2-VL (Hugging Face)
- **ai-analysis**: General text analysis using GLM-4.7 with Mistral-7B fallback

**AI Models Used:**
- **Text Analysis**: GLM-4.7 (THUDM/glm-4-9b-chat), Qwen2.5-7B-Instruct
- **Vision Analysis**: Qwen2-VL-7B-Instruct, Qwen2.5-VL-7B-Instruct
- **Fallback**: Mistral-7B-Instruct-v0.3

**Required Secret**: `HF_API_TOKEN` (Hugging Face API token)

### **📧 Communication & Reports**
- **email-reports**: Automated email reporting system
- **schedule-reports**: Report scheduling and management
- **send-report-email**: Individual report email sending
- **employee-notifications**: Employee notification system

### **💾 Data Processing**
- **screenshot**: Screenshot upload and processing
- **idle-log**: Idle time logging

### **🗑️ Recently Removed (Redundant)**
- ~~schedule-insights-computation~~ (replaced by ai-insights-worker)
- ~~compute-employee-insights~~ (replaced by comprehensive-employee-analysis)
- ~~daily-employee-insights~~ (replaced by ai-insights-worker)
- ~~schedule-ai-analysis~~ (integrated into ai-insights-worker)
- ~~ai-screenshot-scheduler~~ (empty/unused)

**Total Functions: 13 → 8 (38% reduction in complexity)** 