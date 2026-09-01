// ============================================================================
// AI Symptom Triage - Patient-facing AI assessment
// ============================================================================

import { useState, useRef, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

import { RiskBadge } from '@/components/shared/RiskBadge';
import { AIDisclaimer } from '@/components/shared/AIDisclaimer';
import { Link } from 'react-router';
import {
  Mic, MicOff, Stethoscope, Loader2, MapPin,
  ChevronRight, Brain, ArrowRight, Sparkles
} from 'lucide-react';

const SYMPTOM_PRESETS = [
  'Chest pain', 'Headache', 'Fever', 'Cough', 'Stomach pain',
  'Shortness of breath', 'Dizziness', 'Joint pain', 'Fatigue', 'Skin rash',
];

interface TriageResult {
  riskLevel: 'low' | 'medium' | 'high' | 'emergency';
  confidence: number;
  reasoning: string[];
  recommendation: string;
  suggestedFacility: string;
  suggestedDepartment: string;
}

const DEMO_RESULTS: Record<string, TriageResult> = {
  chest: {
    riskLevel: 'high',
    confidence: 87,
    reasoning: [
      'Chest pain is a cardinal symptom requiring urgent evaluation',
      'Patient age (62) and history of atrial fibrillation increase risk',
      'Associated hypertension (152/95) noted',
      'Must rule out acute coronary syndrome',
    ],
    recommendation: 'Urgent cardiology evaluation required. Visit the nearest facility with ECG capability immediately.',
    suggestedFacility: 'Madurai District Hospital',
    suggestedDepartment: 'Cardiology',
  },
  headache: {
    riskLevel: 'medium',
    confidence: 72,
    reasoning: [
      'Recurrent headaches warrant investigation',
      'Consider tension headache vs. secondary causes',
      'Patient medications reviewed for side effects',
    ],
    recommendation: 'Schedule a consultation with general medicine. Keep a headache diary for 2 weeks.',
    suggestedFacility: 'Thoor CHC',
    suggestedDepartment: 'General Medicine',
  },
  default: {
    riskLevel: 'low',
    confidence: 65,
    reasoning: [
      'Symptoms described do not suggest an immediate emergency',
      'Routine consultation recommended for proper evaluation',
      'No red-flag symptoms identified',
    ],
    recommendation: 'Schedule a routine appointment for further evaluation.',
    suggestedFacility: 'Kallikudi PHC',
    suggestedDepartment: 'General Medicine',
  },
};

export default function AITriage() {
  const { language } = useApp();
  const [symptoms, setSymptoms] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startRecording = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSymptoms(prev => prev + (prev ? '\n' : '') + '[Voice input not supported in this browser]');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
    let finalTranscript = symptoms;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript && !finalTranscript.endsWith('\n') ? ' ' : '') + event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setSymptoms(finalTranscript + (interim ? ' ' + interim : ''));
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [language, symptoms]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [age, setAge] = useState('62');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  const handleAssess = () => {
    if (!symptoms && selectedSymptoms.length === 0) return;
    setIsAssessing(true);
    setResult(null);

    setTimeout(() => {
      const input = (symptoms + ' ' + selectedSymptoms.join(' ')).toLowerCase();
      if (input.includes('chest')) {
        setResult(DEMO_RESULTS.chest);
      } else if (input.includes('head') || input.includes('migraine')) {
        setResult(DEMO_RESULTS.headache);
      } else {
        setResult(DEMO_RESULTS.default);
      }
      setIsAssessing(false);
    }, 2000);
  };

  const toggleSymptom = (symptom: string) => {
    setSelectedSymptoms(prev =>
      prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          {t('triageTitle', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('triageSubtitle', language)}
        </p>
      </div>

      <AIDisclaimer />

      {/* Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-[1.125rem] w-[1.125rem] text-primary" />
            {language === 'ta' ? 'அறிகுறிகளை உள்ளிடவும்' : language === 'hi' ? 'लक्षण दर्ज करें' : 'Describe Your Symptoms'}
          </CardTitle>
          <CardDescription>
            {language === 'ta' ? 'உங்கள் அறிகுறிகளை விவரிக்கவும் அல்லது குரல் உள்ளீட்டைப் பயன்படுத்தவும்' :
             language === 'hi' ? 'अपने लक्षणों का वर्णन करें या वॉइस इनपुट का उपयोग करें' :
             'Type your symptoms or tap the microphone for voice input'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick symptom tags */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {language === 'ta' ? 'பொதுவான அறிகுறிகள்' : language === 'hi' ? 'सामान्य लक्षण' : 'Common Symptoms'}
            </p>
            <div className="flex flex-wrap gap-2">
              {SYMPTOM_PRESETS.map((symptom) => (
                <Button
                  key={symptom}
                  variant={selectedSymptoms.includes(symptom) ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs rounded-full"
                  onClick={() => toggleSymptom(symptom)}
                >
                  {symptom}
                </Button>
              ))}
            </div>
          </div>

          {/* Text input with voice */}
          <div className="relative">
            <Textarea
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder={t('enterSymptoms', language)}
              className="min-h-[100px] resize-none pr-12"
              disabled={isAssessing}
            />
            <Button
              variant={isRecording ? 'destructive' : 'outline'}
              size="icon"
              className="absolute right-3 bottom-3 h-9 w-9"
              onClick={() => isRecording ? stopRecording() : startRecording()}
              disabled={isAssessing}
            >
              {isRecording ? (
                <div className="relative">
                  <MicOff className="h-4 w-4" />
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full animate-ping" />
                </div>
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm animate-pulse">
              <span className="h-2 w-2 bg-red-500 rounded-full" />
              {t('stopVoiceInput', language)}
            </div>
          )}

          {/* Age input */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-foreground whitespace-nowrap">
              {language === 'ta' ? 'வயது' : language === 'hi' ? 'उम्र' : 'Age'}
            </label>
            <Input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-20"
              disabled={isAssessing}
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleAssess}
            disabled={isAssessing || (!symptoms && selectedSymptoms.length === 0)}
            className="w-full h-11"
          >
            {isAssessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('assessing', language)}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {language === 'ta' ? 'AI மதிப்பீடு செய்' : language === 'hi' ? 'AI मूल्यांकन करें' : 'Run AI Assessment'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isAssessing && (
        <Card className="border-primary/20">
          <CardContent className="flex flex-col items-center py-8 gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Brain className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div className="absolute inset-0 h-16 w-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{t('assessing', language)}</p>
              <p className="text-xs text-muted-foreground mt-1">Analyzing symptoms, vitals, and risk factors...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && !isAssessing && (
        <div className="space-y-4">
          {/* Risk Result */}
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {language === 'ta' ? 'AI மதிப்பீடு முடிவு' : language === 'hi' ? 'AI मूल्यांकन परिणाम' : 'Assessment Result'}
                </CardTitle>
                <RiskBadge level={result.riskLevel} size="lg" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Confidence */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {language === 'ta' ? 'நம்பிக்கை' : language === 'hi' ? 'विश्वास स्तर' : 'Confidence'}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${result.confidence}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-foreground">{result.confidence}%</span>
              </div>

              {/* Reasoning */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">
                  {language === 'ta' ? 'AI காரணம்' : language === 'hi' ? 'AI तर्क' : 'AI Reasoning'}
                </p>
                <ul className="space-y-1.5">
                  {result.reasoning.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendation */}
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-4">
                <p className="text-sm font-semibold text-primary mb-1 flex items-center gap-1.5">
                  <ArrowRight className="h-4 w-4" />
                  {t('recommendation', language)}
                </p>
                <p className="text-sm text-foreground">{result.recommendation}</p>
              </div>

              <AIDisclaimer />
            </CardContent>
          </Card>

          {/* Suggested Facility */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {language === 'ta' ? 'பரிந்துரைக்கப்பட்ட வசதி' : language === 'hi' ? 'सुझाई गई सुविधा' : 'Suggested Facility'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">{result.suggestedFacility}</p>
                  <p className="text-xs text-primary mt-0.5">{result.suggestedDepartment}</p>
                </div>
                <Link to="/patient/facilities">
                  <Button size="sm" className="gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {t('findNearestFacility', language)}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
