import React, { useState } from 'react';

// Minimal Main component for audio file upload
const Main: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ speaker: string; text: string }>>([]);
  const [analysis, setAnalysis] = useState<{
    numSpeakers?: number;
    genders?: Record<string, string>;
    offensive?: boolean;
    violence?: boolean;
    illegal?: boolean;
    details?: string[];
  }>({});

  // Utility: Check if file is a supported audio type (wav, mp3, ogg)
  const isSupportedAudio = (file: File) => {
    const supportedTypes = [
      'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/mp3', 'audio/mpeg',
      'audio/ogg', 'audio/x-ogg', 'audio/opus'
    ];
    return supportedTypes.includes(file.type);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      // Accept any file type (including MP4), as in the original version
      setFile(selectedFile);
      setError(null);
      setTranscript(null);
      setConversation([]);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(selectedFile));
    }
  };

  // Helper: Analyze conversation using Azure OpenAI
  const analyzeConversation = async (text: string) => {
    const endpoint = process.env.REACT_APP_AZURE_ANALYSIS_ENDPOINT || process.env.REACT_APP_AZURE_SPEECH_ENDPOINT;
    const apiKey = process.env.REACT_APP_AZURE_ANALYSIS_KEY || process.env.REACT_APP_AZURE_SPEECH_KEY;
    if (!endpoint || !apiKey) return null;
    const prompt = `Analyze the following conversation transcript. Return a JSON object with these fields:\n- numSpeakers: number of unique speakers\n- genders: map of speaker to gender (if possible, else 'Unknown')\n- offensive: true/false\n- violence: true/false\n- illegal: true/false\n- details: array of strings explaining any flagged content\n\nTranscript:\n${text}`;
    const body = {
      messages: [
        { role: 'system', content: 'You are an expert conversation analyst.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 512,
      temperature: 0.2,
      model: 'gpt-4o'
    };
    const chatEndpoint = process.env.REACT_APP_AZURE_ANALYSIS_ENDPOINT || endpoint.replace(/\/audio\/transcriptions.*/, '/chat/completions?api-version=2025-01-01-preview');
    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    try {
      return content ? JSON.parse(content) : null;
    } catch {
      return null;
    }
  };

  // Call Azure Speech-to-Text API with diarization if requested
  const transcribeAudio = async () => {
    if (!file) return;
    setIsTranscribing(true);
    setTranscript(null);
    setConversation([]);
    setAnalysis({});
    setError(null);
    try {
      // Prefer Azure Speech diarization if region/key are set
      const region = process.env.REACT_APP_AZURE_SPEECH_REGION;
      const speechKey = process.env.REACT_APP_AZURE_SPEECH_KEY;
      if (region && speechKey) {
        const diarizationResult = await azureSpeechDiarization(file);
        if (diarizationResult) {
          // Optionally, run advanced analysis on diarized transcript
          const textForAnalysis = diarizationResult.map((turn: {speaker: string, text: string}) => `${turn.speaker}: ${turn.text}`).join('\n');
          const analysisResult = await analyzeConversation(textForAnalysis);
          setAnalysis(analysisResult || {});
          // Add translation feature
          const translation = await translateTranscript(diarizationResult.map((turn: {text: string}) => turn.text).join(' '));
          setTranscript(prev => prev ? prev + '\n\n[Translation]:\n' + translation : '[Translation]:\n' + translation);
          setIsTranscribing(false);
          return;
        }
      }
      const endpoint = process.env.REACT_APP_AZURE_SPEECH_ENDPOINT;
      const apiKey = process.env.REACT_APP_AZURE_SPEECH_KEY;
      if (!endpoint || !apiKey || !file) {
        setError('Azure Speech endpoint, key, or file not set.');
        setIsTranscribing(false);
        return;
      }
      const formData = new FormData();
      formData.append('file', file as Blob);
      formData.append('language', 'he');
      formData.append('diarization', 'true');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'api-key': apiKey
        },
        body: formData
      });
      if (!response.ok) {
        const errText = await response.text();
        setError('Azure Speech API error: ' + errText);
        setIsTranscribing(false);
        return;
      }
      const data = await response.json();
      // Conversation parsing (as before)
      let conv: Array<{ speaker: string; text: string }> = [];
      if (data.conversation && Array.isArray(data.conversation) && data.conversation.length > 0) {
        conv = data.conversation;
        setConversation(conv);
        setTranscript(null);
      } else if (data.text) {
        const lines = data.text.split(/\n|\r/).filter(Boolean);
        // Improved: Only assign new speaker if label changes, otherwise keep previous
        const speakerPattern = /^(Person\d+|Speaker \d+)[\s:-]+(.+)$/i;
        let lastSpeaker = '';
        conv = lines.map((line: string) => {
          const match = line.match(speakerPattern);
          if (match) {
            lastSpeaker = match[1];
            return { speaker: lastSpeaker, text: match[2] };
          }
          // If no speaker label, attribute to last known speaker
          return { speaker: lastSpeaker || 'Speaker 1', text: line };
        });
        setConversation(conv);
        setTranscript(data.text);
      } else {
        setConversation([]);
        setTranscript('No transcript returned.');
      }
      // --- Conversation Analysis ---
      let analysisResult = null;
      if (conv.length > 0) {
        const textForAnalysis = conv.map(turn => (turn.speaker ? `${turn.speaker}: ${turn.text}` : turn.text)).join('\n');
        analysisResult = await analyzeConversation(textForAnalysis);
      }
      // Fallback to local analysis if advanced model fails
      if (!analysisResult) {
        const speakers = new Set(conv.map(turn => turn.speaker).filter(Boolean));
        const genders: Record<string, string> = {};
        speakers.forEach(s => { genders[s] = 'Unknown'; });
        const offensiveWords = ['badword', 'offensive'];
        const violenceWords = ['kill', 'attack', 'violence'];
        const illegalWords = ['illegal', 'crime', 'drugs'];
        let offensive = false, violence = false, illegal = false;
        let details: string[] = [];
        conv.forEach(turn => {
          const t = turn.text.toLowerCase();
          if (offensiveWords.some(w => t.includes(w))) {
            offensive = true; details.push(`Offensive: ${turn.text}`);
          }
          if (violenceWords.some(w => t.includes(w))) {
            violence = true; details.push(`Violence: ${turn.text}`);
          }
          if (illegalWords.some(w => t.includes(w))) {
            illegal = true; details.push(`Illegal: ${turn.text}`);
          }
        });
        analysisResult = {
          numSpeakers: speakers.size,
          genders,
          offensive,
          violence,
          illegal,
          details
        };
      }
      setAnalysis(analysisResult);
    } catch (err) {
      setError('Failed to transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Azure Speech-to-Text with diarization (true speaker separation)
  const azureSpeechDiarization = async (audioFile: File) => {
    const region = process.env.REACT_APP_AZURE_SPEECH_REGION;
    const key = process.env.REACT_APP_AZURE_SPEECH_KEY;
    if (!region || !key) {
      setError('Azure Speech region or key not set.');
      return null;
    }
    // Get SAS URL for audio file (browser cannot send binary directly to Azure Speech)
    // Instead, use a proxy or upload to blob storage, or use a workaround with a local server.
    // For demo, we use the REST API with audio/wav (16kHz mono PCM) or audio/mp3
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=he-IL&diarizationEnabled=true&format=detailed`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': audioFile.type || 'audio/wav',
        'Accept': 'application/json'
      },
      body: audioFile
    });
    if (!response.ok) {
      setError('Azure Speech diarization failed: ' + (await response.text()));
      return null;
    }
    const data = await response.json();
    // Parse NBest[0].RecognizedPhrases for speaker-labeled segments
    const phrases = data.NBest?.[0]?.RecognizedPhrases || [];
    const conv = phrases.map((p: any) => ({
      speaker: p.Speaker ? `Speaker ${p.Speaker}` : 'Speaker',
      text: p.Display || p.Lexical || ''
    }));
    setConversation(conv);
    setTranscript(conv.map((c: { speaker: string; text: string }) => `${c.speaker}: ${c.text}`).join('\n'));
    return conv;
  };

  // Add translation helper
  const translateTranscript = async (text: string, to: string = 'en') => {
    // Use Azure OpenAI or another translation API
    const endpoint = process.env.REACT_APP_AZURE_ANALYSIS_ENDPOINT || process.env.REACT_APP_AZURE_SPEECH_ENDPOINT;
    const apiKey = process.env.REACT_APP_AZURE_ANALYSIS_KEY || process.env.REACT_APP_AZURE_SPEECH_KEY;
    if (!endpoint || !apiKey) return '';
    const prompt = `Translate the following text to ${to}:\n${text}`;
    const body = {
      messages: [
        { role: 'system', content: 'You are a helpful translator.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1024,
      temperature: 0.2,
      model: 'gpt-4o'
    };
    const chatEndpoint = process.env.REACT_APP_AZURE_ANALYSIS_ENDPOINT || endpoint.replace(/\/audio\/transcriptions.*/, '/chat/completions?api-version=2025-01-01-preview');
    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) return '';
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', padding: 24, border: '1px solid #eee', borderRadius: 8 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Audio File Uploader</h1>
      <input type="file" accept="audio/*" onChange={handleFileChange} />
      {file && (
        <div style={{ marginTop: 16 }}>
          <strong>Selected file:</strong> {file.name}
          <div style={{ marginTop: 16 }}>
            <button onClick={transcribeAudio} disabled={isTranscribing} style={{ padding: '8px 16px', fontSize: 16 }}>
              {isTranscribing ? 'Transcribing...' : 'Create Transcript'}
            </button>
          </div>
        </div>
      )}
      {audioUrl && (
        <div style={{ marginTop: 16 }}>
          <audio controls src={audioUrl} style={{ width: '100%' }} />
        </div>
      )}
      {conversation.length > 0 ? (
        <div style={{ marginTop: 24, background: '#f9f9f9', padding: 16, borderRadius: 6 }}>
          <strong>Conversation:</strong>
          <div style={{ marginTop: 8 }}>
            {conversation.map((turn, idx) => (
              <div key={idx} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: '#2a5d9f' }}>{turn.speaker || `Speaker ${idx+1}`}:</span> {turn.text}
              </div>
            ))}
          </div>
        </div>
      ) : (
        transcript && (
          <div style={{ marginTop: 24, background: '#f9f9f9', padding: 16, borderRadius: 6 }}>
            <strong>Transcript:</strong>
            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{transcript}</div>
          </div>
        )
      )}
      {analysis && (analysis.offensive || analysis.violence || analysis.illegal) && (
        <div style={{ marginTop: 24, background: '#fffbe6', padding: 16, borderRadius: 6, border: '1px solid #ffe58f' }}>
          <strong>Conversation Analysis:</strong>
          <div style={{ marginTop: 8 }}>
            <div>Offensive: {analysis.offensive ? 'Yes' : 'No'}</div>
            <div>Violence: {analysis.violence ? 'Yes' : 'No'}</div>
            <div>Illegal: {analysis.illegal ? 'Yes' : 'No'}</div>
            {analysis.details && analysis.details.length > 0 && (
              <ul style={{ marginTop: 8 }}>
                {analysis.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
      {error && (
        <div style={{ color: 'red', marginTop: 16 }}>{error}</div>
      )}
    </div>
  );
};

export default Main;
