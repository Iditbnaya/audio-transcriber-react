# Audio Transcriber React App

A minimal React + TypeScript app for uploading audio files and transcribing them to text using Azure OpenAI Speech-to-Text (gpt-4o-transcribe).

## Features
- Upload an audio file (supports many formats)
- Transcribe audio to text using Azure OpenAI
- Supports multiple languages (including Hebrew)

## Getting Started

1. **Clone the repository:**
   ```sh
   git clone https://github.com/Iditbnaya/audio-transcriber-react.git
   cd audio-transcriber-react
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Configure Azure credentials:**
   - Create a `.env` file in the project root:
     ```env
     REACT_APP_AZURE_SPEECH_ENDPOINT=your-endpoint-here
     REACT_APP_AZURE_SPEECH_KEY=your-key-here
     ```
   - **Do not commit your `.env` file!**
4. **Run the app:**
   ```sh
   npm start
   ```
   The app will open at [http://localhost:3000](http://localhost:3000).

## Security
- Your Azure API key and endpoint should never be committed to the repository.
- The `.env` file is included in `.gitignore` by default.

## License
MIT
