// ============================================================================
// CareLoop AI - Landing Page
// ============================================================================

import { motion } from "framer-motion";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import {
  Heart, ArrowRight, Shield, Users, Activity, MapPin,
  FileText, Bell, CheckCircle2, Star, ChevronRight, Globe,
  Stethoscope, Brain, QrCode, Clock, Zap, Building2,
  TrendingUp, BarChart3
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
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <Heart className="h-5 w-5 text-primary-foreground" fill="currentColor" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground tracking-tight">CareLoop</span>
              <span className="text-lg font-bold text-primary tracking-tight ml-0.5">AI</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              <Globe className="h-3.5 w-3.5" />
              <button onClick={() => setLanguage('en')} className="hover:text-primary transition-colors">EN</button>
              <span className="text-border">|</span>
              <button onClick={() => setLanguage('ta')} className="hover:text-primary transition-colors">தமிழ்</button>
              <span className="text-border">|</span>
              <button onClick={() => setLanguage('hi')} className="hover:text-primary transition-colors">हिन्दी</button>
            </div>
            <Link to="/auth">
              <Button size="sm" className="gap-1.5">
                Get Started <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-emerald-50/30" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative">
          <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center">
            <Badge variant="outline" className="mb-4 gap-1.5 text-xs">
              <Zap className="h-3 w-3 text-primary" />
              Smart India Hackathon 2026 • SIH26133
            </Badge>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight leading-tight">
              No Patient Lost in the{' '}
              <span className="text-primary">Referral Loop</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              CareLoop AI is an AI-assisted rural healthcare platform that ensures every
              patient completes their referral journey — from initial triage to follow-up closure.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link to="/auth">
                <Button size="lg" className="gap-2 h-12 px-8 text-base">
                  Start as Patient
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

          {/* Stats strip */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto"
          >
            {[
              { value: "8-Step", label: "Referral Closure Engine" },
              { value: "5", label: "Role-Based Experiences" },
              { value: "82.5%", label: "Closure Rate" },
              { value: "3", label: "Languages Supported" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-primary">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Core Concept - Referral Closure Engine */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeIn} className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-xs">Signature Feature</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              The Referral Closure Engine
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
              Every referral is tracked through 8 stages with unique IDs, QR codes,
              and AI-powered predictions to ensure zero patient loss.
            </p>
          </motion.div>

          {/* Timeline visualization */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto"
          >
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-primary/20" />
              {[
                { step: "1", label: "Referral Created", icon: FileText, color: "bg-primary/10 text-primary" },
                { step: "2", label: "Hospital Accepted", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
                { step: "3", label: "Appointment Scheduled", icon: Clock, color: "bg-blue-50 text-blue-600" },
                { step: "4", label: "Patient Arrived", icon: MapPin, color: "bg-violet-50 text-violet-600" },
                { step: "5", label: "Specialist Consultation", icon: Stethoscope, color: "bg-amber-50 text-amber-600" },
                { step: "6", label: "Treatment", icon: Shield, color: "bg-pink-50 text-pink-600" },
                { step: "7", label: "Follow-up", icon: Bell, color: "bg-cyan-50 text-cyan-600" },
                { step: "8", label: "Referral Closed ✓", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={idx} className="relative flex items-center gap-4 mb-4">
                    <div className={`relative z-10 h-12 w-12 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-border p-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          Step {item.step}
                        </span>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Role-Based Experiences */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeIn} className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-xs">For Everyone</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Five Role-Based Experiences
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Tailored dashboards for every stakeholder in the healthcare ecosystem
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
              { icon: Users, title: "Patient", desc: "Smart home dashboard, AI triage, facility finder, health card, referral tracking", color: "bg-primary/10 text-primary" },
              { icon: Activity, title: "Health Worker", desc: "Patient management, AI triage, referral creation, offline data capture, follow-up monitoring", color: "bg-emerald-50 text-emerald-600" },
              { icon: Stethoscope, title: "Doctor", desc: "Appointment queue, patient profiles, medical timeline, consultations, prescriptions", color: "bg-blue-50 text-blue-600" },
              { icon: Building2, title: "Hospital Admin", desc: "Referral inbox, QR scanning, department management, medicine stock, analytics", color: "bg-violet-50 text-violet-600" },
              { icon: BarChart3, title: "Government Admin", desc: "District command center, KPIs, referral funnel, village access map, AI insights", color: "bg-amber-50 text-amber-600" },
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

      {/* AI Features */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeIn} className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-xs gap-1">
              <Brain className="h-3 w-3" /> AI-Powered
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Intelligent Healthcare Decisions
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
              AI-assisted clinical decision support — clearly labeled, explainable,
              and always requiring professional review.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Brain, title: "Symptom Risk Classification", desc: "AI-powered triage with Low/Medium/High/Emergency risk levels and explainable reasoning", badge: "XGBoost/RF" },
              { icon: TrendingUp, title: "Referral Prediction", desc: "Predicts completion probability based on distance, travel time, history, and appointment factors", badge: "Predictive" },
              { icon: MapPin, title: "Access Score Engine", desc: "Calculates Rural Healthcare Access Score from distance, capacity, specialists, diagnostics, and more", badge: "Scoring" },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card key={idx} className="border-blue-100 bg-gradient-to-br from-blue-50/30 to-transparent">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="h-5 w-5 text-blue-600" />
                      <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                      <Badge variant="outline" className="text-[10px] ml-auto">{feature.badge}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-6">
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="p-4 flex items-start gap-3">
                <Brain className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 leading-relaxed">
                  <span className="font-semibold">Clinical Decision Support Only:</span> All AI outputs in CareLoop AI are
                  assistive tools requiring healthcare professional review. They are never
                  autonomous medical diagnoses.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Demo Journey */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeIn} className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-xs">End-to-End Demo</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Complete Patient Journey
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              From rural patient to referral closure — a fully functional demo
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { step: "1", title: "Patient Symptoms", desc: "Voice input → AI triage → Risk assessment" },
              { step: "2", title: "Facility & Doctor", desc: "CareMatch score → Book appointment → Consultation" },
              { step: "3", title: "Referral Flow", desc: "QR referral → Hospital accepts → Patient arrives" },
              { step: "4", title: "Closure & Analytics", desc: "Follow-up → AI prediction → Closed → Dashboard updated" },
            ].map((item) => (
              <Card key={item.step} className="relative overflow-hidden">
                <div className="absolute top-0 left-0 h-1 w-full bg-primary" />
                <CardContent className="p-4">
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Step {item.step}
                  </span>
                  <h4 className="text-sm font-semibold text-foreground mt-2">{item.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.div {...fadeIn}>
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Heart className="h-8 w-8 text-primary" fill="currentColor" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Ready to Experience CareLoop AI?
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-lg mx-auto">
              Try the complete demo journey with realistic synthetic data.
              No real patient data is used in this demonstration.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link to="/auth">
                <Button size="lg" className="gap-2 h-12 px-8">
                  Launch CareLoop AI <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Heart className="h-3.5 w-3.5 text-primary-foreground" fill="currentColor" />
            </div>
            <span className="text-sm font-bold text-foreground">CareLoop AI</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Smart India Hackathon 2026 • Problem Statement SIH26133
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            AI-assisted rural healthcare access, referral closure & follow-up platform
          </p>
        </div>
      </footer>
    </div>
  );
}


