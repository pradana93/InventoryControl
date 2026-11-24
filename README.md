# 📦 Inventory Control & Warehouse Management System

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Google Sheets API](https://img.shields.io/badge/Google_Sheets_API-v4-34A853?style=for-the-badge&logo=google-sheets)](https://developers.google.com/sheets/api)
[![Vercel](https://img.shields.io/badge/Vercel-Deploy-000000?style=for-the-badge&logo=vercel)](https://vercel.com/)

A modern, high-performance warehouse inventory control system and inbound processing application built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS**, and **shadcn/ui**, powered by **Google Sheets API** as a real-time headless database.

---

## 🌟 Key Features

### 📊 Real-Time Inventory Control Dashboard (`/`)
- **Executive KPIs**: Real-time overview of Total SKU, Total System Stock, SOH (Stock On Hand), Variance, Inventory Accuracy %, and Empty Rack Slots.
- **Critical Expiry & OOS Alerts**:
  - 🔴 **Expired Lots**: Immediate notification of expired batches with Rack and Quantity information.
  - 🟡 **Expiring Soon**: FEFO proactive tracking for lots expiring in $\le 30$ days.
  - ⚪ **Stock Habis**: Real-time zero-stock SKU identification.
- **Visual Analytics**:
  - 📈 Top 10 SKU by System Quantity (Horizontal Bar Chart).
  - 🍩 Warehouse Zone Distribution (Interactive Doughnut Chart).
- **Interactive Multi-Level Tables**:
  - **SKU Summary View**: Aggregated stock, total assigned racks, earliest expiration date, and worst FEFO status badge.
  - **Lot-Level Detail View**: Granular rack breakdown, FEFO sequence, days to expiry, variance, and picking stock.
  - Client-side multi-column search, sorting, and responsive layout.

### 📥 Inbound Receiving & Rack Allocation (`/inbound`)
- **Pallet & Barcode Identification**: Input pallet code and scan/enter SKU barcodes.
- **Dynamic Rack Assignment**: Up to 6 simultaneous rack allocations per inbound transaction.
- **Real-Time Rack Stock Preview**: Instantly view the current quantity in any selected rack before allocating.
- **Strict Validation**: Automatic validation ensuring the sum of all rack quantities exactly equals the inbound total quantity.
- **Direct Google Sheets Synchronization**: Appends directly to the `Inbound` sheet via Google Service Account authentication.

---

## 🏗️ Architecture & Project Structure

```text
├── legacy-gas/                  # Archived Google Apps Script files (v1)
│   ├── Code.gs
│   ├── Inbound.html
│   └── Index.html
├── public/                      # Static assets & icons
├── src/
│   ├── app/
│   │   ├── api/                 # Serverless Route Handlers (Google Sheets API)
│   │   │   ├── dashboard/       # Aggregated KPIs, alerts, chart data
│   │   │   ├── inbound/         # Inbound transaction submission & validation
│   │   │   ├── rack/            # Rack details, Master Data mapping
│   │   │   └── sku/             # SKU names, grouped stock, rack stock preview
│   │   ├── inbound/             # Inbound form page (/inbound)
│   │   ├── globals.css          # Tailwind CSS v4 styling & theme tokens
│   │   ├── layout.tsx           # Root Layout with shared navigation header
│   │   └── page.tsx             # Main Inventory Control Dashboard (/)
│   ├── components/
│   │   ├── common/              # Shared UI components (NavBar, KPICard, AlertBanner, Charts)
│   │   ├── dashboard/           # Dashboard data tables and metric views
│   │   ├── inbound/             # Inbound form specific sub-components
│   │   └── ui/                  # shadcn/ui primitives (Button, Card, Dialog, Select, Table, etc.)
│   └── lib/
│       ├── google-sheets.ts     # Google Sheets API client & domain business logic
│       └── utils.ts             # Tailwind class merging utility (cn)
├── .env.example                 # Template for required environment variables
├── components.json              # shadcn/ui registry configuration
├── next.config.ts               # Next.js configuration
├── package.json                 # Project dependencies & scripts
└── tsconfig.json                # TypeScript compiler configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or later
- **npm** or **pnpm**
- **Google Cloud Service Account** with Google Sheets API enabled and editor access to your master spreadsheet.

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/pradana93/InventoryControl.git
cd InventoryControl
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your credentials:
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwgg...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID="1lBbcRlfhFplWSiKq-DJGsN3JpSuxhd0OWu0DHNNKXO8"
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Vercel

1. Import your GitHub repository (`pradana93/InventoryControl`) directly in [Vercel](https://vercel.com/).
2. Because the Next.js project is at the repository root, **Vercel will auto-detect Next.js** without any custom root directory configuration.
3. In the **Environment Variables** section, add:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` *(make sure newline `\n` characters are preserved)*
   - `GOOGLE_SHEET_ID`
4. Click **Deploy**. Your dashboard and inbound system will be live in seconds.

---

## 📄 License
Internal Warehouse Management System - PT. Bangor SCM. All rights reserved.