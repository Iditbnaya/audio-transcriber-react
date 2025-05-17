import React, { useState } from 'react';

// Minimal Main component for audio file upload
const Main: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ speaker: string; text: string }>>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      setTranscript(null);
      setConversation([]);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(selectedFile));
    }
  };

  // Call Azure Speech-to-Text API
  const transcribeAudio = async () => {
    if (!file) return;
    setIsTranscribing(true);
    setTranscript(null);
    setConversation([]);
    setError(null);
    try {
      const endpoint = process.env.REACT_APP_AZURE_SPEECH_ENDPOINT;
      const apiKey = process.env.REACT_APP_AZURE_SPEECH_KEY;
      if (!endpoint || !apiKey) {
        setError('Azure Speech endpoint or key not set.');
        setIsTranscribing(false);
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', 'he'); // Use 'he' for Hebrew, or omit for auto-detect
      // Optionally, request diarization (speaker separation) if supported
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
        throw new Error('API error: ' + errText);
      }
      const data = await response.json();
      // Try to parse conversation if diarization is supported
      if (data.conversation && Array.isArray(data.conversation)) {
        setConversation(data.conversation);
        setTranscript(null);
      } else if (data.text) {
        // Fallback: try to split transcript by speaker if possible
        const lines = data.text.split(/\n|\r/).filter(Boolean);
        const conv = lines.map((line: string) => {
          const match = line.match(/^(Person\\d+|Speaker \\d+)[\s:-]+(.+)$/i);
          if (match) {
            return { speaker: match[1], text: match[2] };
          }
          return { speaker: '', text: line };
        });
        setConversation(conv);
        setTranscript(data.text);
      } else {
        setTranscript('No transcript returned.');
      }
    } catch (err) {
      setError('Failed to transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
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
      {transcript && (
        <div style={{ marginTop: 24, background: '#f9f9f9', padding: 16, borderRadius: 6 }}>
          <strong>Transcript:</strong>
          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{transcript}</div>
        </div>
      )}
      {audioUrl && (
        <div style={{ marginTop: 16 }}>
          <audio controls src={audioUrl} style={{ width: '100%' }} />
        </div>
      )}
      {conversation.length > 0 && (
        <div style={{ marginTop: 24, background: '#f9f9f9', padding: 16, borderRadius: 6 }}>
          <strong>Conversation:</strong>
          <div style={{ marginTop: 8 }}>
            {conversation.map((turn, idx) => (
              <div key={idx} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: '#2a5d9f' }}>{turn.speaker || 'Speaker'}:</span> {turn.text}
              </div>
            ))}
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
