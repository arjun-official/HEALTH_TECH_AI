# 🏥 A Hybrid AI Framework for Health Risk Assessment and Severity-Triggered Emergency Response

## Overview

This project is an AI-powered multi-agent healthcare system that provides intelligent health risk assessment and automated emergency response. It enables users to securely manage family health records, upload medical reports, monitor health vitals, and receive AI-assisted healthcare recommendations. By combining machine learning, natural language processing, and intelligent automation, the system predicts potential health risks, evaluates their severity, and coordinates emergency actions with hospitals and ambulance services.

## Problem Statement

Healthcare emergencies often face delays due to fragmented medical records, manual communication, and the absence of real-time decision support. This project addresses these challenges by providing an integrated AI-driven platform capable of early disease prediction and automated emergency coordination.

## Key Features

* Family health management portal
* AI-powered medical report and prescription analysis
* Health vital monitoring
* Disease prediction using AI
* Severity-based risk assessment (Scale: 1–10)
* AI health assistant for quick medical guidance
* Automatic hospital notification
* Ambulance request automation
* Doctor consultation portal (Telemedicine)
* Secure patient record management
* Future integration with wearable health devices (Smart Rings/Smart Watches)

## System Modules

### 1. User Portal

* Create family groups
* Add family members
* Upload lab reports and prescriptions
* Enter health vitals
* View AI-generated health insights

### 2. AI Agents

* **Medical Report Analysis Agent:** Extracts medical information from uploaded reports.
* **Disease Prediction Agent:** Predicts potential diseases with a confidence score.
* **Risk Assessment Agent:** Assigns a health risk score from 1 to 10.
* **Decision-Making Agent:** Coordinates emergency actions based on risk level.

### 3. Hospital Portal

* Receives emergency alerts
* Accesses patient details
* Supports appointment management and emergency preparation

### 4. Ambulance Portal

* Receives emergency requests
* Dispatches ambulances
* Tracks emergency response

### 5. Doctor Portal

* Online consultation
* Medical recommendations
* Patient monitoring and follow-up

## Workflow

1. User uploads medical reports or enters health vitals.
2. AI extracts and organizes medical information.
3. Disease prediction model analyzes patient data.
4. Risk assessment agent assigns a severity score.
5. Decision-making agent determines the appropriate action.
6. If required, hospitals and ambulance services are automatically notified.
7. Doctors provide consultation through the telemedicine portal.

## Technologies Used

* **Frontend:** React.js / Next.js
* **Backend:** Django / FastAPI
* **Database:** PostgreSQL / Supabase
* **Artificial Intelligence:** Python, Machine Learning, NLP
* **Automation:** n8n
* **Version Control:** Git & GitHub

## Current Frontend Persistence

The VITALYX prototype uses Supabase Auth and reads patient observations, alerts, and upcoming appointments from PostgreSQL. Demonstration routines and the remaining non-patient workflows still use a typed local mock database in `src/db.ts` and browser `localStorage`.

Public **Create account** registers a patient with Supabase Auth. The auth trigger creates the corresponding VITALYX account, patient role, and profile. If email confirmation is enabled in Supabase, the user must confirm their email before signing in. Admin, Doctor, and Emergency accounts must be provisioned through an authorized process; public users cannot choose those roles.

Sign-in and session restoration use Supabase Auth. Apply `database/003_patient_dashboard_rls.sql` after the first two migrations to provision patient records and enable read-only, patient-scoped access for the connected dashboard. Routines, medications, records, staff provisioning, and other workflows remain demo or unconnected. Do not treat this prototype as production-ready; validate RLS with separate patient accounts before loading real health records.

### Enable Google sign-in

1. In Google Cloud Console, create a **Web application** OAuth client. Add the callback URL shown by Supabase under **Authentication → Providers → Google** as an authorized redirect URI.
2. In Supabase, enable the Google provider and enter the OAuth client ID and secret. Keep the client secret in Supabase; never put it in `VITE_*` variables or browser code.
3. Under **Authentication → URL Configuration**, set the production Site URL and allow the app callback origins, including `http://127.0.0.1:5173/**` for local Vite development (and `http://localhost:5173/**` if used).
4. Restart the Vite server and use **Continue with Google** on the sign-in or registration screen.

The app redirects OAuth back to its current origin. The matching origin must be in Supabase's allowed redirect URLs.

## Future Enhancements

* Integration with Smart Rings and Smart Watches
* Real-time health monitoring
* Predictive analytics using continuous health data
* Voice-enabled AI assistant
* Electronic Health Record (EHR) integration

## Expected Outcomes

* Faster emergency response
* Improved patient safety
* Automated healthcare coordination
* Reduced manual intervention
* Better accessibility to healthcare services

## Authors

Developed as a research project on **Hybrid AI in Healthcare**, focusing on intelligent health risk assessment and severity-triggered emergency response using a multi-agent architecture.
