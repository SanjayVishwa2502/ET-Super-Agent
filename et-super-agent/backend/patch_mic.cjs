const fs = require('fs');
const path = '../frontend/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const regexFunc = /const toggleListening = \(\) => \{\n[\s\S]*?recognition\.start\(\);\n\s*\};/;

const newFunc = `const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition. Please use Chrome or Edge.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e);
      if (e.error === 'network') {
        alert("Speech recognition API error (network). Please check your connection.");
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        alert("Microphone access denied. Please allow microphone permissions.");
      }
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setInput(currentTranscript);
      // NOTE: We do NOT auto-send. The user must manually click Send to verify the words.
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      alert("Failed to connect to the speech recognition service.");
    }
  };`;

if (!regexFunc.test(code)) {
    console.log("Could not find regexFunc");
} else {
    code = code.replace(regexFunc, newFunc);
    fs.writeFileSync(path, code);
    console.log("Patched App.tsx with live STT and manual send!");
}
