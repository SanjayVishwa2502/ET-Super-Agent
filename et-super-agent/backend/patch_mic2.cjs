const fs = require('fs');
const path = '../frontend/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const regexFunc = /const toggleListening = \(\) => \{\n[\s\S]*?const textToProcess = overrideText \|\| input;/;

const newFunc = `const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition. Please use Chrome or Edge.");
      return;
    }

    if (isListening || (window as any).currentRecognition) {
      if ((window as any).currentRecognition) {
        (window as any).currentRecognition.stop();
        (window as any).currentRecognition = null;
      }
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    (window as any).currentRecognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      (window as any).currentRecognition = null;
    };
    
    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e);
      if (e.error === 'network') {
        alert("Speech recognition API error (network). Please check your connection.");
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        alert("Microphone access denied. Please allow microphone permissions.");
      }
      setIsListening(false);
      (window as any).currentRecognition = null;
    };

    // Keep existing input if there's any
    let localFinal = input ? input + " " : "";

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          localFinal += t + ' ';
        } else {
          currentTranscript += t;
        }
      }
      
      const combined = (localFinal + currentTranscript).trim();
      setInput(combined);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      // alert("Failed to connect to the speech recognition service.");
      setIsListening(false);
      (window as any).currentRecognition = null;
    }
  };

  // ─── Chat send ─────────────────────────────────────────
  const handleSend = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    
    // Stop recognition if user sends the message manually
    if ((window as any).currentRecognition) {
      (window as any).currentRecognition.stop();
      (window as any).currentRecognition = null;
      setIsListening(false);
    }

    const textToProcess = overrideText || input;`;

if (!regexFunc.test(code)) {
    console.log("Could not find regexFunc");
} else {
    code = code.replace(regexFunc, newFunc);
    fs.writeFileSync(path, code);
    console.log("Patched App.tsx toggleListening to fix mic state and tracking!");
}
