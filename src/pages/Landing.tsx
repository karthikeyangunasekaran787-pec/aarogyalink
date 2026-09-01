// ============================================================================
// AarogyaLink — Landing Page
// ============================================================================

import { motion } from "framer-motion";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import {
  Heart, ArrowRight, Shield, Users, Activity, MapPin,
  FileText, Bell, CheckCircle2, Globe,
  Stethoscope, Brain, Clock, Building2,
  TrendingUp, BarChart3, QrCode
} from "lucide-react";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.1 } },
};

export default function Landing() {
  const { setLanguage } = useApp();

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navigation ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <Heart className="h-5 w-5 text-primary-foreground" fill="currentColor" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground tracking-tight">Aarogya</span>
              <span className="text-lg font-bold text-primary tracking-tight ml-0">Link</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              <Globe className="h-3.5 w-3.5" />
              <button onClick={() => setLanguage('en')} className="hover:text-primary transition-colors font-medium">EN</button>
              <span className="text-border">|</span>
              <button onClick={() => setLanguage('ta')} className="hover:text-primary transition-colors">தமிழ்</button>
              <span className="text-border">|</span>
              <button onClick={() => setLanguage('hi')} className="hover:text-primary transition-colors">हिन्दी</button>
            </div>
            <Link to="/auth">
              <Button size="sm" className="gap-1.5 h-9 px-4">
                Get Started <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-emerald-50/20" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 relative">
          <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center">

            <h1 className="text-3xl sm:text-5xl lg:text-[3.4rem] font-bold text-foreground tracking-tight leading-[1.15]">
              No Patient Lost in the{" "}
              <span className="text-primary">Referral Loop</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              A rural healthcare platform that connects patients to nearby facilities,
              provides AI-assisted triage, and tracks every referral from first consultation
              through specialist treatment to follow-up closure — so no one falls through
              the cracks.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
              <Link to="/auth">
                <Button size="lg" className="gap-2 h-12 px-8 text-base font-semibold">
                  Enter as Patient
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="outline" className="gap-2 h-12 px-8 text-base">
                  Healthcare Professional
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto"
          >
            {[
              { value: "8-Step", label: "Referral Closure Engine" },
              { value: "5", label: "Role-Based Dashboards" },
              { value: "82.5%", label: "Closure Rate" },
              { value: "3", label: "Languages Supported" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-primary">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1.5">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Referral Closure Engine ─────────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeIn} className="text-center mb-14">
            <Badge variant="outline" className="mb-3 text-xs">Core Feature</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              The Referral Closure Engine
            </h2>
            <p className="text-sm text-muted-foreground mt-2.5 max-w-xl mx-auto leading-relaxed">
              Every referral receives a unique ID and QR code and is tracked through
              eight stages — from the moment it is created until treatment is confirmed
              and the loop is closed. AI-powered predictions flag at-risk referrals before
              patients are lost.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto"
          >
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-primary/15" />
              {[
                { step: "1", label: "Referral Created", desc: "Health worker or doctor initiates the referral", icon: FileText, color: "bg-primary/10 text-primary" },
                { step: "2", label: "Hospital Accepted", desc: "Destination facility confirms receipt", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
                { step: "3", label: "Appointment Scheduled", desc: "Specialist appointment is booked", icon: Clock, color: "bg-blue-50 text-blue-600" },
                { step: "4", label: "Patient Arrived", desc: "QR code scanned at hospital reception", icon: QrCode, color: "bg-violet-50 text-violet-600" },
                { step: "5", label: "Specialist Consultation", desc: "Doctor evaluates the patient", icon: Stethoscope, color: "bg-amber-50 text-amber-600" },
                { step: "6", label: "Treatment", desc: "Prescribed treatment begins", icon: Shield, color: "bg-pink-50 text-pink-600" },
                { step: "7", label: "Follow-up", desc: "Scheduled follow-up appointment", icon: Bell, color: "bg-cyan-50 text-cyan-600" },
                { step: "8", label: "Referral Closed", desc: "Full care cycle completed", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={idx} className="relative flex items-center gap-4 mb-3 last:mb-0">
                    <div className={`relative z-10 h-12 w-12 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-border p-3.5 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                          Step {item.step}
                        </span>
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-0">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Role-Based Dashboards ───────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeIn} className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-xs">For Every Stakeholder</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Five Role-Based Dashboards
            </h2>
            <p className="text-sm text-muted-foreground mt-2.5">
              Purpose-built interfaces for patients, health workers, doctors, hospitals,
              and district administrators.
            </p>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {[
              { icon: Users, title: "Patient", desc: "AI-assisted triage, facility search with CareMatch scores, appointment booking, QR referral tracking, digital health card, and follow-up reminders.", color: "bg-primary/10 text-primary" },
              { icon: Activity, title: "Health Worker", desc: "Patient registration, assisted triage, referral creation with QR generation, referral monitoring, follow-up management, and offline data capture.", color: "bg-emerald-50 text-emerald-600" },
              { icon: Stethoscope, title: "Doctor", desc: "Appointment queue, patient profiles with longitudinal medical history, vitals review, consultation notes, referral creation, and follow-up scheduling.", color: "bg-blue-50 text-blue-600" },
              { icon: Building2, title: "Hospital Admin", desc: "Incoming referral inbox, QR-based patient arrival verification, department and specialist availability, medicine stock, and completion analytics.", color: "bg-violet-50 text-violet-600" },
              { icon: BarChart3, title: "District Admin", desc: "Command center with KPI cards, referral funnel visualization, village healthcare access map, AI-generated operational insights, and downloadable reports.", color: "bg-amber-50 text-amber-600" },
            ].map((role, idx) => {
              const Icon = role.icon;
              return (
                <Card key={idx} className="hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className={`h-11 w-11 rounded-xl ${role.color} flex items-center justify-center mb-3`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {role.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{role.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── AI Features ─────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeIn} className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-xs gap-1">
              <Brain className="h-3 w-3" /> AI-Assisted
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Intelligence That Supports, Not Replaces
            </h2>
            <p className="text-sm text-muted-foreground mt-2.5 max-w-xl mx-auto leading-relaxed">
              Every AI output is clearly labelled as clinical decision support.
              Explainability is built in, and professional review is always required.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Brain, title: "Symptom Risk Classification", desc: "Patients describe symptoms; the system assigns Low, Medium, High, or Emergency risk with confidence scores and reasoning.", badge: "XGBoost / Random Forest" },
              { icon: TrendingUp, title: "Referral Completion Prediction", desc: "Forecasts the likelihood of a patient completing a referral using distance, travel time, appointment delay, and attendance history.", badge: "Predictive Model" },
              { icon: MapPin, title: "Rural Healthcare Access Score", desc: "Combines distance, facility capacity, specialist availability, diagnostics, medicine stock, and wait time into a single per-village score.", badge: "Composite Index" },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card key={idx} className="border-primary/10">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
                    <Badge variant="outline" className="text-[10px] mt-3">{feature.badge}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="mt-6 border-primary/15 bg-primary/[0.02]">
            <CardContent className="p-4 flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Clinical Decision Support Only.</span>{" "}
                All AI outputs in AarogyaLink are assistive tools that require healthcare
                professional review. They are never autonomous medical diagnoses.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Demo Journey ────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeIn} className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-xs">Signature Workflow</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              The Complete Patient Journey
            </h2>
            <p className="text-sm text-muted-foreground mt-2.5 max-w-lg mx-auto">
              From a villager's first symptoms to a fully closed referral — every step
              is tracked, every handoff verified, and every follow-up predicted.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { step: "1", title: "Symptoms & Triage", desc: "Patient enters symptoms via voice or text. AI classifies risk and recommends the nearest appropriate facility." },
              { step: "2", title: "Facility & Appointment", desc: "CareMatch scores rank nearby facilities. Patient books an appointment with an available doctor." },
              { step: "3", title: "Referral & Verification", desc: "A QR-coded referral links patient, source, and destination. Hospital scans the QR to confirm arrival." },
              { step: "4", title: "Closure & Analytics", desc: "Follow-up completes the cycle. AI predicts missed visits. District dashboard updates in real time." },
            ].map((item) => (
              <Card key={item.step} className="relative overflow-hidden">
                <div className="absolute top-0 left-0 h-1 w-full bg-primary" />
                <CardContent className="p-5">
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Phase {item.step}
                  </span>
                  <h4 className="text-sm font-semibold text-foreground mt-2.5">{item.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.div {...fadeIn}>
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Heart className="h-8 w-8 text-primary" fill="currentColor" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Experience AarogyaLink
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-lg mx-auto leading-relaxed">
              Explore the full platform with realistic synthetic data. Sign in as a patient
              to walk through the complete referral journey, or switch roles to see
              dashboards for health workers, doctors, hospital administrators, and
              district officials.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link to="/auth">
                <Button size="lg" className="gap-2 h-12 px-8 font-semibold">
                  Launch Platform <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Heart className="h-3.5 w-3.5 text-primary-foreground" fill="currentColor" />
            </div>
            <span className="text-sm font-bold text-foreground tracking-tight">AarogyaLink</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Smart India Hackathon 2026 · Problem Statement SIH26133
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            AI-assisted rural healthcare access, referral closure, and follow-up platform
          </p>
        </div>
      </footer>
    </div>
  );
}
