import React, { useState, useRef, useCallback, useEffect, memo } from 'react';

interface VoiceAssistantProps {
  onRouteTriggered: (target: string) => void;
}

/** Multilingual voice navigation assistant with speech-to-text and TTS. */
const VoiceAssistantInner: React.FC<VoiceAssistantProps> = ({ onRouteTriggered }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [textTranscript, setTextTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Use ref for the recognition controller to avoid recreation on every render
  const recognitionRef = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null);

  // Initialise SpeechRecognition once on mount
  useEffect(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      const controller = new SpeechRecognitionAPI();
      controller.continuous = false;
      controller.lang = 'en-US';

      controller.onresult = (event: any) => {
        const capturedText = event.results[0][0].transcript.toLowerCase();
        setTextTranscript(capturedText);
        setIsRecording(false);

        if (capturedText.includes('gate') || capturedText.includes('zone') || capturedText.includes('exit')) {
          onRouteTriggered(capturedText);
          synthesizeSpeechOutput('Locating requested area. Refer to highlighted map layout.');
        } else {
          synthesizeSpeechOutput('Request not recognized. Please ask for gate direction or zone.');
        }
      };

      controller.onerror = (event: any) => {
        setErrorMessage(`Speech recognition error: ${event.error}`);
        setIsRecording(false);
      };

      controller.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = controller;
    }

    return () => {
      // Cleanup: abort any active recognition on unmount
      recognitionRef.current?.abort();
    };
  }, [onRouteTriggered]);

  const synthesizeSpeechOutput = useCallback((outputMessage: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const speechUnit = new SpeechSynthesisUtterance(outputMessage);
      speechUnit.rate = 1.0;
      window.speechSynthesis.speak(speechUnit);
    }
  }, []);

  const initiateVoiceCapture = useCallback(() => {
    if (!recognitionRef.current) {
      setErrorMessage('Speech recognition is not supported on this browser.');
      return;
    }
    setIsRecording(true);
    setErrorMessage('');
    recognitionRef.current.start();
  }, []);

  const stopVoiceCapture = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return (
    <div className="p-6 bg-slate-800/40 border border-slate-800/80 rounded-xl shadow-2xl backdrop-blur-md text-slate-100" role="region" aria-label="Voice Navigation Assistant">
      <h3 className="text-xl font-bold text-white mb-2">Multilingual Voice Navigation</h3>
      <p className="text-xs text-slate-400 mb-4">Click below and speak: e.g. &quot;Take me to Zone A&quot; or &quot;Show me nearest exit&quot;</p>
      
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={isRecording ? stopVoiceCapture : initiateVoiceCapture}
          className={`px-6 py-3 rounded-lg font-bold transition-all duration-150 focus:outline-none focus:ring-4 focus:ring-blue-500/50 shadow-md ${
            isRecording ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse' : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          aria-pressed={isRecording}
        >
          {isRecording ? 'Listening...' : 'Activate Voice Assistant'}
        </button>

        {isRecording && (
          <div className="flex items-end justify-center gap-1 h-6" aria-hidden="true">
            <style>{`
              @keyframes soundWave {
                0%, 100% { height: 4px; }
                50% { height: 24px; }
              }
              .wave-bar {
                width: 3px;
                background-color: #f43f5e;
                border-radius: 9999px;
                animation: soundWave 0.8s ease-in-out infinite;
              }
              .bar-1 { animation-delay: 0.1s; }
              .bar-2 { animation-delay: 0.3s; }
              .bar-3 { animation-delay: 0.15s; }
              .bar-4 { animation-delay: 0.4s; }
              .bar-5 { animation-delay: 0.2s; }
            `}</style>
            <div className="wave-bar bar-1"></div>
            <div className="wave-bar bar-2"></div>
            <div className="wave-bar bar-3"></div>
            <div className="wave-bar bar-4"></div>
            <div className="wave-bar bar-5"></div>
          </div>
        )}
      </div>

      {textTranscript && <p className="mt-4 text-sm text-slate-300" role="status">Spoken Command: &quot;{textTranscript}&quot;</p>}
      {errorMessage && <p className="mt-4 text-sm text-rose-400" role="alert">{errorMessage}</p>}
    </div>
  );
};

/** Memoised VoiceAssistant — only re-renders when props change. */
export const VoiceAssistant = memo(VoiceAssistantInner);
