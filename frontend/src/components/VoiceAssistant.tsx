import React, { useState } from 'react';

interface VoiceAssistantProps {
  onRouteTriggered: (target: string) => void;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ onRouteTriggered }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [textTranscript, setTextTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  let recognitionController: any = null;
  if (SpeechRecognition) {
    recognitionController = new SpeechRecognition();
    recognitionController.continuous = false;
    recognitionController.lang = 'en-US';
  }

  const initiateVoiceCapture = () => {
    if (!recognitionController) {
      setErrorMessage('Speech recognition is not supported on this browser.');
      return;
    }
    setIsRecording(true);
    setErrorMessage('');
    recognitionController.start();
  };

  if (recognitionController) {
    recognitionController.onresult = (event: any) => {
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

    recognitionController.onerror = (event: any) => {
      setErrorMessage(`Speech recognition error: ${event.error}`);
      setIsRecording(false);
    };

    recognitionController.onend = () => {
      setIsRecording(false);
    };
  }

  const synthesizeSpeechOutput = (outputMessage: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const speechUnit = new SpeechSynthesisUtterance(outputMessage);
      speechUnit.rate = 1.0;
      window.speechSynthesis.speak(speechUnit);
    }
  };

  return (
    <div className="p-6 bg-slate-800/40 border border-slate-800/80 rounded-xl shadow-2xl backdrop-blur-md text-slate-100" role="region" aria-label="Voice Navigation Assistant">
      <h3 className="text-xl font-bold text-white mb-2">Multilingual Voice Navigation</h3>
      <p className="text-xs text-slate-400 mb-4">Click below and speak: e.g. "Take me to Zone A" or "Show me nearest exit"</p>
      
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={isRecording ? () => recognitionController?.stop() : initiateVoiceCapture}
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

      {textTranscript && <p className="mt-4 text-sm text-slate-300" role="status">Spoken Command: "{textTranscript}"</p>}
      {errorMessage && <p className="mt-4 text-sm text-rose-400" role="alert">{errorMessage}</p>}
    </div>
  );
};
