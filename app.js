/**
 * app.js - Robust Frontend Logic for Gemini Live Bilingual Translator
 * Version: 2.2.0 (Production Hardened)
 * 
 * Major Fixes & Enhancements:
 * 1. Differential Save Protocol (lastSavedIndex tracking prevents duplicate doc entries)
 * 2. In-place DOM Card Rendering (preserves scroll, eliminates lag on large feeds)
 * 3. Sequential FIFO Translation Queue (guarantees temporal ordering, eliminates race conditions)
 * 4. Automatic 10-minute Gemini Live Session Resumption (continuous meetings)
 * 5. Biquad Anti-Aliasing Lowpass Filter (7.5kHz cutoff for 16kHz speech recognition)
 * 6. GAS Secret Token Authentication support
 */

// ==========================================
// 1. Config Manager (localStorage)
// ==========================================
class ConfigManager {
  static STORAGE_KEYS = {
    API_KEY: 'glt_gemini_api_key',
    GAS_URL: 'glt_gas_web_app_url',
    GAS_TOKEN: 'glt_gas_token',
    DIRECTION: 'glt_translation_direction',
    AUTO_SAVE: 'glt_auto_save_enabled',
    DOC_MODE: 'glt_doc_mode',
    LAST_DOC_ID: 'glt_last_doc_id',
    ENGINE_MODE: 'glt_engine_mode',
    LIVE_MODEL: 'glt_live_model'
  };

  static get(key, defaultValue = '') {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : defaultValue;
    } catch (e) {
      console.warn('LocalStorage access failed:', e);
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage write failed:', e);
    }
  }
}

// ==========================================
// 2. Audio Capture Service (Anti-Aliased 16kHz PCM)
// ==========================================
class AudioCaptureService {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.filterNode = null;
    this.analyserNode = null;
    this.processorNode = null;
    this.isRecording = false;
    this.isPaused = false;
    this.onChunkCallback = null;
    this.onVolumeCallback = null;
  }

  ensureContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('お使いのブラウザは Web Audio API に対応していません。');
      }
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === 'suspended') {
      return this.audioContext.resume();
    }
    return Promise.resolve();
  }

  async start(onChunk, onVolume) {
    if (this.isRecording) return;
    this.onChunkCallback = onChunk;
    this.onVolumeCallback = onVolume;

    await this.ensureContext();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('マイクアクセスAPIが利用できません。HTTPS または http://localhost 上でアクセスしてください。');
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('マイクへのアクセスが拒否されました。ブラウザの鍵アイコンからマイクの許可を設定してください。');
      } else if (err.name === 'NotFoundError') {
        throw new Error('利用可能なマイク機器が見つかりませんでした。');
      } else {
        throw new Error(`マイクの取得に失敗しました: ${err.message}`);
      }
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Biquad Anti-Aliasing Lowpass Filter (7.5kHz cutoff for 16kHz target)
    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 7500;
    this.sourceNode.connect(this.filterNode);

    // Analyser for volume metering
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.filterNode.connect(this.analyserNode);

    // Processor (buffer: 2048 samples = ~128ms chunks)
    const bufferSize = 2048;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    const inputSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = 16000;

    this.processorNode.onaudioprocess = (e) => {
      // Mute output to prevent speaker feedback
      const outputBuffer = e.outputBuffer.getChannelData(0);
      outputBuffer.fill(0);

      if (!this.isRecording || this.isPaused) return;

      const inputBuffer = e.inputBuffer.getChannelData(0);

      if (this.onVolumeCallback && this.analyserNode) {
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / inputBuffer.length);
        this.onVolumeCallback(rms);
      }

      const downsampled = this._downsampleBuffer(inputBuffer, inputSampleRate, targetSampleRate);
      const base64Chunk = this._int16ToBase64(downsampled);

      if (this.onChunkCallback && base64Chunk) {
        this.onChunkCallback(base64Chunk);
      }
    };

    this.filterNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.isRecording = true;
    this.isPaused = false;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  stop() {
    this.isRecording = false;
    this.isPaused = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.filterNode) {
      this.filterNode.disconnect();
      this.filterNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  _downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      const output = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return output;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      const avg = count > 0 ? accum / count : 0;
      const s = Math.max(-1, Math.min(1, avg));
      result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  _int16ToBase64(int16Array) {
    const uint8 = new Uint8Array(int16Array.buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const chunk = uint8.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }
}

// ==========================================
// 3. Web Speech API Service (Native Fallback)
// ==========================================
class WebSpeechService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.onInterimCallback = null;
    this.onFinalCallback = null;
    this.onErrorCallback = null;
    this.direction = 'auto';
  }

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  start(direction, onInterim, onFinal, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('ブラウザの音声認識 (Web Speech API) が利用できません。');
    }

    this.direction = direction;
    this.onInterimCallback = onInterim;
    this.onFinalCallback = onFinal;
    this.onErrorCallback = onError;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    if (this.direction === 'en-to-ja') {
      this.recognition.lang = 'en-US';
    } else {
      this.recognition.lang = 'ja-JP';
    }

    this.recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          const finalTranscript = item[0].transcript.trim();
          if (finalTranscript.length > 0 && this.onFinalCallback) {
            this.onFinalCallback(finalTranscript, this.recognition.lang.startsWith('ja') ? 'ja' : 'en');
          }
        } else {
          interim += item[0].transcript;
        }
      }
      if (interim && this.onInterimCallback) {
        this.onInterimCallback(interim);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('[WebSpeech] Error:', event.error);
      if (event.error === 'not-allowed') {
        if (this.onErrorCallback) this.onErrorCallback(new Error('マイクの使用が許可されていません。'));
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {}
      }
    };

    this.recognition.start();
    this.isListening = true;
  }

  stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
  }
}

// ==========================================
// 4. Gemini Live WebSocket Client (with Session Resumption)
// ==========================================
class GeminiLiveClient {
  static WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  // Gemini Live continuous session limit is 10 min; reconnect at 9m30s
  static SESSION_RECONNECT_INTERVAL = 570000;

  constructor() {
    this.ws = null;
    this.apiKey = null;
    this.direction = 'auto';
    this.modelName = 'models/gemini-3.5-transcribe-live';
    this.isConnected = false;
    this.isSetupComplete = false;
    this.chunkQueue = [];

    this._connectResolve = null;
    this._connectReject = null;
    this._connectTimeout = null;
    this._sessionTimer = null;

    // Callbacks
    this.onInterimCallback = null;
    this.onFinalCallback = null;
    this.onStatusChangeCallback = null;
    this.onErrorCallback = null;
    this.onDisconnectCallback = null;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[GeminiLive] ${message}`);
    }
  }

  connect(apiKey, direction, modelName) {
    return new Promise((resolve, reject) => {
      this.apiKey = apiKey;
      this.direction = direction;
      this.modelName = modelName || 'models/gemini-3.5-transcribe-live';
      this.isSetupComplete = false;
      this.isConnected = false;
      this.chunkQueue = [];

      this._connectResolve = resolve;
      this._connectReject = reject;

      if (!apiKey) {
        return reject(new Error('Gemini API キーが未設定です。'));
      }

      const url = `${GeminiLiveClient.WS_URL}?key=${encodeURIComponent(this.apiKey)}`;
      this.log('info', `WebSocket接続開始: ${this.modelName}`);

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        this.log('error', `WebSocket作成失敗: ${err.message}`);
        return reject(new Error(`WebSocket初期化エラー: ${err.message}`));
      }

      this._connectTimeout = setTimeout(() => {
        if (!this.isSetupComplete) {
          const timeoutErr = new Error('Gemini Live API への接続がタイムアウトしました。');
          this.log('warn', '接続タイムアウト (10秒)');
          this.disconnect();
          reject(timeoutErr);
        }
      }, 10000);

      this.ws.onopen = () => {
        this.log('info', 'WebSocket接続オープン。Setup送信中...');
        this._sendSetupMessage();
      };

      this.ws.onmessage = async (event) => {
        let raw = event.data;
        if (event.data instanceof Blob) {
          raw = await event.data.text();
        }
        this._handleServerMessage(raw);
      };

      this.ws.onerror = (event) => {
        this.log('error', 'WebSocketエラーが発生しました。');
        this._cleanupTimeout();
        if (this._connectReject) {
          this._connectReject(new Error('Gemini Live API への接続に失敗しました。'));
          this._connectReject = null;
        }
      };

      this.ws.onclose = (event) => {
        this.log('warn', `WebSocket切断: Code ${event.code}`);
        this._cleanupTimeout();
        this._clearSessionTimer();

        const wasConnected = this.isConnected && this.isSetupComplete;
        this.isConnected = false;
        this.isSetupComplete = false;

        if (this._connectReject) {
          let errorMsg = `接続が切断されました (Code: ${event.code})`;
          if (event.code === 1006) {
            errorMsg = `Gemini Live APIに接続できませんでした (Code: 1006)。APIキーまたはモデル権限を確認してください。`;
          } else if (event.code === 1007 || event.code === 1008) {
            errorMsg = `認証またはリクエスト形式エラーです (Code: ${event.code})`;
          }
          this._connectReject(new Error(errorMsg));
          this._connectReject = null;
        } else if (wasConnected && this.onDisconnectCallback) {
          this.onDisconnectCallback(event.code, event.reason);
        }
      };
    });
  }

  _cleanupTimeout() {
    if (this._connectTimeout) {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
    }
  }

  _clearSessionTimer() {
    if (this._sessionTimer) {
      clearTimeout(this._sessionTimer);
      this._sessionTimer = null;
    }
  }

  _startSessionResumptionTimer() {
    this._clearSessionTimer();
    this._sessionTimer = setTimeout(async () => {
      this.log('info', 'Gemini Live 10分セッション制限に伴う自動シームレス再接続を実行します...');
      try {
        await this._seamlessReconnect();
        this.log('success', 'シームレス再接続完了。セッションが更新されました。');
      } catch (err) {
        this.log('warn', `セッション更新失敗: ${err.message}`);
      }
    }, GeminiLiveClient.SESSION_RECONNECT_INTERVAL);
  }

  async _seamlessReconnect() {
    if (!this.isConnected || !this.ws) return;
    try {
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      this.ws.close();
    } catch (e) {}

    await this.connect(this.apiKey, this.direction, this.modelName);
  }

  disconnect() {
    this._cleanupTimeout();
    this._clearSessionTimer();
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        } catch (e) {}
      }
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isSetupComplete = false;
    this.chunkQueue = [];
  }

  sendAudioChunk(base64Pcm) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!this.isSetupComplete) {
      this.chunkQueue.push(base64Pcm);
      return;
    }

    while (this.chunkQueue.length > 0) {
      const qChunk = this.chunkQueue.shift();
      this._dispatchChunk(qChunk);
    }

    this._dispatchChunk(base64Pcm);
  }

  _dispatchChunk(base64Data) {
    const payload = {
      realtimeInput: {
        audio: {
          data: base64Data,
          mimeType: 'audio/pcm;rate=16000'
        }
      }
    };
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to send audio chunk:', e);
    }
  }

  _sendSetupMessage() {
    let languageCodes = [];
    if (this.direction === 'ja-to-en') {
      languageCodes = ['ja-JP'];
    } else if (this.direction === 'en-to-ja') {
      languageCodes = ['en-US'];
    } else {
      languageCodes = [];
    }

    const setupPayload = {
      setup: {
        model: this.modelName,
        generationConfig: {
          responseModalities: ['TEXT']
        },
        inputAudioTranscription: {
          languageCodes: languageCodes
        }
      }
    };

    this.log('info', `Setup送信: ${JSON.stringify(setupPayload)}`);
    this.ws.send(JSON.stringify(setupPayload));
  }

  _handleServerMessage(rawMessage) {
    try {
      const data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

      if (data.setupComplete) {
        this.log('success', 'SetupComplete 受信。音声認識ストリーム準備完了。');
        this.isConnected = true;
        this.isSetupComplete = true;
        this._cleanupTimeout();
        this._startSessionResumptionTimer();

        if (this._connectResolve) {
          this._connectResolve();
          this._connectResolve = null;
          this._connectReject = null;
        }

        while (this.chunkQueue.length > 0) {
          const qChunk = this.chunkQueue.shift();
          this._dispatchChunk(qChunk);
        }
        return;
      }

      if (data.serverContent) {
        const sc = data.serverContent;

        if (sc.interimInputTranscription && sc.interimInputTranscription.text) {
          if (this.onInterimCallback) {
            this.onInterimCallback(sc.interimInputTranscription.text);
          }
        }

        if (sc.inputTranscription && sc.inputTranscription.text) {
          const finalText = sc.inputTranscription.text.trim();
          const langCode = sc.inputTranscription.languageCode || null;
          this.log('info', `確定音声認識: "${finalText}"`);
          if (finalText.length > 0 && this.onFinalCallback) {
            this.onFinalCallback(finalText, langCode);
          }
        }
      }
    } catch (e) {
      console.warn('Server message parse error:', e);
    }
  }
}

// ==========================================
// 5. Translation Service & 3-Layer Resilient Queue
// ==========================================
class TranslationService {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[Translation] ${message}`);
    }
  }

  enqueue(text, direction, apiKey, gasUrl, gasToken, recordId, onComplete) {
    this.queue.push({ text, direction, apiKey, gasUrl, gasToken, recordId, onComplete });
    this._processNext();
  }

  async _processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const job = this.queue.shift();
    try {
      const result = await this._executeTranslation(job);
      if (job.onComplete) {
        job.onComplete(job.recordId, result);
      }
    } catch (err) {
      this.log('error', `翻訳ジョブ致命的エラー: ${err.message}`);
      if (job.onComplete) {
        job.onComplete(job.recordId, { translated: '(翻訳失敗)', speakerLang: 'auto' });
      }
    } finally {
      this.isProcessing = false;
      this._processNext();
    }
  }

  async _executeTranslation({ text, direction, apiKey, gasUrl, gasToken }) {
    if (!text || text.trim() === '') return { translated: '', speakerLang: 'ja' };

    let srcLang = 'ja';
    let targetLang = 'en';

    if (direction === 'ja-to-en') {
      srcLang = 'ja';
      targetLang = 'en';
    } else if (direction === 'en-to-ja') {
      srcLang = 'en';
      targetLang = 'ja';
    } else {
      const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
      srcLang = hasJapanese ? 'ja' : 'en';
      targetLang = hasJapanese ? 'en' : 'ja';
    }

    const prompt = `You are a professional simultaneous interpreter. Translate the following text from ${srcLang === 'ja' ? 'Japanese' : 'English'} into fluent, natural ${targetLang === 'ja' ? 'Japanese' : 'English'}.\n`
                 + `Strict requirements:\n`
                 + `1. Return ONLY the direct translation.\n`
                 + `2. Do not include quotes, explanations, prefixes, or notes.\n\n`
                 + `Text:\n${text}`;

    // Layer 1: Gemini REST API
    if (apiKey && apiKey.trim() !== '') {
      const modelsToTry = ['gemini-3.5-flash-lite'];

      for (const modelName of modelsToTry) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 800
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
              const transText = data.candidates[0].content.parts[0].text.trim();
              this.log('success', `Gemini (${modelName}) 翻訳完了: "${transText}"`);
              return {
                translated: transText,
                speakerLang: srcLang
              };
            }
          } else {
            const errData = await res.json().catch(() => null);
            const errDetail = errData?.error?.message || `HTTP ${res.status}`;
            this.log('warn', `Gemini (${modelName}) 失敗: ${errDetail}`);
          }
        } catch (err) {
          this.log('warn', `Gemini (${modelName}) 通信エラー: ${err.message}`);
        }
      }
    } else {
      this.log('warn', 'Gemini APIキーが未入力のため、フォールバック翻訳を使用します。');
    }

    // Layer 2: GAS Web App (LanguageApp) Fallback
    if (gasUrl && gasUrl.trim() !== '') {
      this.log('info', 'GAS (LanguageApp) による自動フォールバック翻訳を実行中...');
      try {
        const gasRes = await fetch(gasUrl.trim(), {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'translate',
            token: gasToken || '',
            text: text,
            srcLang: srcLang,
            targetLang: targetLang
          })
        });

        if (gasRes.ok) {
          const gasData = await gasRes.json();
          if (gasData.status === 'success' && gasData.translated) {
            this.log('success', `GAS翻訳完了: "${gasData.translated}"`);
            return {
              translated: gasData.translated.trim(),
              speakerLang: srcLang
            };
          } else if (gasData.message) {
            this.log('warn', `GAS翻訳応答エラー: ${gasData.message}`);
          }
        } else {
          this.log('warn', `GAS翻訳通信エラー: HTTP ${gasRes.status}`);
        }
      } catch (gasErr) {
        this.log('warn', `GAS翻訳接続失敗: ${gasErr.message}`);
      }
    }

    // Layer 3: Web Google Translate Endpoint Fallback
    this.log('info', 'Web翻訳エンジンによるフォールバックを実行中...');
    try {
      const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const gtxRes = await fetch(gtxUrl);
      if (gtxRes.ok) {
        const gtxData = await gtxRes.json();
        if (gtxData && gtxData[0]) {
          const transText = gtxData[0].map(item => item[0]).join('').trim();
          if (transText) {
            this.log('success', `Web翻訳完了: "${transText}"`);
            return {
              translated: transText,
              speakerLang: srcLang
            };
          }
        }
      }
    } catch (gtxErr) {
      this.log('warn', `Web翻訳接続失敗: ${gtxErr.message}`);
    }

    return {
      translated: '(翻訳取得失敗)',
      speakerLang: srcLang
    };
  }
}

// ==========================================
// 6. GAS Storage Client (Google Docs Integration)
// ==========================================
class GasStorageClient {
  static async ping(gasUrl, token) {
    if (!gasUrl) throw new Error('GAS Web App URLが設定されていません。');
    
    const res = await fetch(gasUrl, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTPステータス: ${res.status}`);
    return await res.json();
  }

  static async saveTranscript(gasUrl, { documentId, title, records, direction, model, token }) {
    if (!gasUrl) throw new Error('GAS Web App URLが未設定です。');
    if (!records || records.length === 0) throw new Error('保存対象の差分レコードがありません。');

    const payload = {
      action: 'save',
      token: token || '',
      documentId: documentId || '',
      title: title || '',
      model: model || 'models/gemini-3.5-transcribe-live',
      direction: direction || 'AUTO',
      records: records
    };

    const res = await fetch(gasUrl, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain' // Bypass CORS preflight
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`GAS通信エラー (HTTP ${res.status})`);
    }

    const data = await res.json();
    if (data.status === 'error') {
      throw new Error(data.message || 'GAS処理エラー');
    }
    return data;
  }
}

// ==========================================
// 7. Main Application Controller
// ==========================================
class App {
  constructor() {
    this.audioService = new AudioCaptureService();
    this.webSpeechService = new WebSpeechService();
    this.geminiClient = new GeminiLiveClient();
    this.translationService = new TranslationService();
    this.translationService.onLogCallback = (type, msg) => this.log(type, msg);

    this.activeEngine = 'none';
    this.records = [];
    this.lastSavedIndex = 0; // Tracks saved slice for differential doc sync
    this.isRecording = false;
    this.isPaused = false;

    this._initElements();
    this._loadSettings();
    this._bindEvents();
    this._checkHashConfig();
    this._updateUIState();

    this.log('info', '初期化完了 (v2.2.1)。差分同期・インプレースUIが有効です。');
  }

  log(type, message) {
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.textContent = `[${time}] ${message}`;
    this.elDiagLog.appendChild(line);
    this.elDiagLogContainer.scrollTop = this.elDiagLogContainer.scrollHeight;
  }

  _initElements() {
    this.elStatusBadge = document.getElementById('connection-status');
    this.elEngineBadge = document.getElementById('active-engine-badge');
    this.elBtnSettings = document.getElementById('btn-open-settings');

    this.elBtnToggleRecord = document.getElementById('btn-toggle-record');
    this.elBtnPauseRecord = document.getElementById('btn-pause-record');
    this.elSelectDirection = document.getElementById('select-direction');
    this.elBtnClearFeed = document.getElementById('btn-clear-feed');
    this.elBtnSaveDocs = document.getElementById('btn-save-docs');
    this.elSaveDocsText = document.getElementById('btn-save-docs-text');
    this.elUnsavedBadge = document.getElementById('unsaved-badge');

    this.elRadioDocModes = document.getElementsByName('doc-save-mode');
    this.elInputDocTitle = document.getElementById('input-doc-title');
    this.elInputDocId = document.getElementById('input-doc-id');
    this.elSavedDocBanner = document.getElementById('saved-doc-banner');
    this.elSavedDocLink = document.getElementById('saved-doc-link');

    this.elMeterBar = document.querySelector('.meter-bar');
    this.elInterimText = document.getElementById('interim-text');

    this.elToggleDiag = document.getElementById('toggle-diag');
    this.elDiagLogContainer = document.getElementById('diag-log-container');
    this.elDiagLog = document.getElementById('diag-log');

    this.elTranscriptList = document.getElementById('transcript-list');
    this.elEmptyState = document.getElementById('empty-state');
    this.elRecordCount = document.getElementById('record-count');
    this.elBtnCopyAll = document.getElementById('btn-copy-all');

    // Modal
    this.elModal = document.getElementById('settings-modal');
    this.elBtnCloseModal = document.getElementById('btn-close-modal');
    this.elInputApiKey = document.getElementById('input-gemini-key');
    this.elBtnToggleKeyVis = document.getElementById('btn-toggle-key-vis');
    this.elSelectEngineMode = document.getElementById('select-engine-mode');
    this.elSelectLiveModel = document.getElementById('select-live-model');
    this.elInputGasUrl = document.getElementById('input-gas-url');
    this.elInputGasToken = document.getElementById('input-gas-token');
    this.elBtnTestGas = document.getElementById('btn-test-gas');
    this.elGasTestResult = document.getElementById('gas-test-result');
    this.elCheckAutoSave = document.getElementById('check-auto-save');
    this.elBtnSaveSettings = document.getElementById('btn-save-settings');

    this.elToastContainer = document.getElementById('toast-container');

    // QR Code Modal elements
    this.elBtnOpenQr = document.getElementById('btn-open-qr');
    this.elQrModal = document.getElementById('qr-modal');
    this.elBtnCloseQrModal = document.getElementById('btn-close-qr-modal');
    this.elBtnDoneQrModal = document.getElementById('btn-done-qr-modal');
    this.elQrCanvas = document.getElementById('qr-canvas');
    this.elInputShareUrl = document.getElementById('input-share-url');
    this.elBtnCopyShareUrl = document.getElementById('btn-copy-share-url');
  }

  _loadSettings() {
    this.apiKey = ConfigManager.get(ConfigManager.STORAGE_KEYS.API_KEY, '');
    this.gasUrl = ConfigManager.get(ConfigManager.STORAGE_KEYS.GAS_URL, '');
    this.gasToken = ConfigManager.get(ConfigManager.STORAGE_KEYS.GAS_TOKEN, '');
    this.direction = ConfigManager.get(ConfigManager.STORAGE_KEYS.DIRECTION, 'auto');
    this.engineMode = ConfigManager.get(ConfigManager.STORAGE_KEYS.ENGINE_MODE, 'auto');
    this.liveModel = ConfigManager.get(ConfigManager.STORAGE_KEYS.LIVE_MODEL, 'models/gemini-3.5-transcribe-live');
    this.autoSave = ConfigManager.get(ConfigManager.STORAGE_KEYS.AUTO_SAVE, 'false') === 'true';
    this.docMode = ConfigManager.get(ConfigManager.STORAGE_KEYS.DOC_MODE, 'new');
    this.lastDocId = ConfigManager.get(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, '');

    this.elInputApiKey.value = this.apiKey;
    this.elInputGasUrl.value = this.gasUrl;
    this.elInputGasToken.value = this.gasToken;
    this.elSelectDirection.value = this.direction;
    this.elSelectEngineMode.value = this.engineMode;
    this.elSelectLiveModel.value = this.liveModel;
    this.elCheckAutoSave.checked = this.autoSave;

    if (this.lastDocId) {
      this.elInputDocId.value = this.lastDocId;
    }

    for (const radio of this.elRadioDocModes) {
      if (radio.value === this.docMode) radio.checked = true;
    }
    this._syncDocModeUI();
  }

  _bindEvents() {
    this.elBtnToggleRecord.addEventListener('click', () => this.toggleRecording());
    this.elBtnPauseRecord.addEventListener('click', () => this.togglePause());

    this.elSelectDirection.addEventListener('change', (e) => {
      this.direction = e.target.value;
      ConfigManager.set(ConfigManager.STORAGE_KEYS.DIRECTION, this.direction);
      this.log('info', `翻訳方向変更: ${this.direction}`);
      if (this.isRecording) {
        this.showToast('翻訳方向が変更されました。次回発話から適用されます。', 'info');
      }
    });

    this.elBtnClearFeed.addEventListener('click', () => {
      if (this.records.length === 0) return;
      if (confirm('タイムラインの翻訳履歴をクリアしますか？')) {
        this.records = [];
        this.lastSavedIndex = 0;
        this.elTranscriptList.innerHTML = '';
        this.elEmptyState.style.display = 'block';
        this.elRecordCount.textContent = '0 件の発話';
        this._updateUIState();
        this.showToast('タイムラインをクリアしました。', 'info');
      }
    });

    this.elBtnSaveDocs.addEventListener('click', () => this.saveToDocs(false));

    for (const radio of this.elRadioDocModes) {
      radio.addEventListener('change', (e) => {
        this.docMode = e.target.value;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.DOC_MODE, this.docMode);
        this._syncDocModeUI();
      });
    }

    this.elBtnCopyAll.addEventListener('click', () => this.copyAllTranscripts());

    this.elToggleDiag.addEventListener('click', () => {
      const isHidden = this.elDiagLogContainer.style.display === 'none';
      this.elDiagLogContainer.style.display = isHidden ? 'block' : 'none';
    });

    // Modal
    this.elBtnSettings.addEventListener('click', () => {
      this.elModal.style.display = 'flex';
      this.elInputApiKey.focus();
    });
    this.elBtnCloseModal.addEventListener('click', () => {
      this.elModal.style.display = 'none';
    });
    this.elModal.addEventListener('click', (e) => {
      if (e.target === this.elModal) this.elModal.style.display = 'none';
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elModal.style.display === 'flex') {
        this.elModal.style.display = 'none';
      }
    });

    this.elBtnToggleKeyVis.addEventListener('click', () => {
      if (this.elInputApiKey.type === 'password') {
        this.elInputApiKey.type = 'text';
        this.elBtnToggleKeyVis.textContent = '非表示';
      } else {
        this.elInputApiKey.type = 'password';
        this.elBtnToggleKeyVis.textContent = '表示';
      }
    });

    this.elBtnSaveSettings.addEventListener('click', () => {
      this.apiKey = this.elInputApiKey.value.trim();
      this.gasUrl = this.elInputGasUrl.value.trim();
      this.gasToken = this.elInputGasToken.value.trim();
      this.engineMode = this.elSelectEngineMode.value;
      this.liveModel = this.elSelectLiveModel.value;
      this.autoSave = this.elCheckAutoSave.checked;

      ConfigManager.set(ConfigManager.STORAGE_KEYS.API_KEY, this.apiKey);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_URL, this.gasUrl);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_TOKEN, this.gasToken);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.ENGINE_MODE, this.engineMode);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.LIVE_MODEL, this.liveModel);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.AUTO_SAVE, String(this.autoSave));

      this.elModal.style.display = 'none';
      this.log('info', `設定保存: エンジン=${this.engineMode}, モデル=${this.liveModel}`);
      this.showToast('設定を保存しました。', 'success');
    });

    this.elBtnTestGas.addEventListener('click', async () => {
      const url = this.elInputGasUrl.value.trim();
      if (!url) {
        this.elGasTestResult.textContent = 'URLを入力してください';
        this.elGasTestResult.className = 'test-result-text error';
        return;
      }
      this.elGasTestResult.textContent = '通信テスト中...';
      this.elGasTestResult.className = 'test-result-text';
      try {
        const res = await GasStorageClient.ping(url, this.elInputGasToken.value.trim());
        if (res.status === 'ok') {
          this.elGasTestResult.textContent = `接続成功 (v${res.version || '2.0'})`;
          this.elGasTestResult.className = 'test-result-text success';
          this.log('success', `GAS Web App 疎通確認完了: ${url}`);
        } else {
          this.elGasTestResult.textContent = '応答受信 (エラーあり)';
          this.elGasTestResult.className = 'test-result-text error';
        }
      } catch (err) {
        this.elGasTestResult.textContent = '接続失敗: ' + err.message;
        this.elGasTestResult.className = 'test-result-text error';
        this.log('error', `GAS疎通失敗: ${err.message}`);
      }
    });

    // Gemini Client Callbacks
    this.geminiClient.onLogCallback = (type, msg) => this.log(type, msg);
    this.geminiClient.onStatusChangeCallback = (status) => this._updateStatus(status);
    this.geminiClient.onErrorCallback = (err) => this.showToast(err, 'error');
    this.geminiClient.onDisconnectCallback = (code, reason) => {
      this.log('warn', `セッション終了切断: Code ${code}`);
      this.stopRecording();
    };
    this.geminiClient.onInterimCallback = (text) => this._renderInterim(text);
    this.geminiClient.onFinalCallback = (finalText, langCode) => this._handleFinalSpeech(finalText, langCode);

    // QR Modal Events
    if (this.elBtnOpenQr) {
      this.elBtnOpenQr.addEventListener('click', () => this._openQrModal());
    }
    if (this.elBtnCloseQrModal) {
      this.elBtnCloseQrModal.addEventListener('click', () => {
        this.elQrModal.style.display = 'none';
      });
    }
    if (this.elBtnDoneQrModal) {
      this.elBtnDoneQrModal.addEventListener('click', () => {
        this.elQrModal.style.display = 'none';
      });
    }
    if (this.elQrModal) {
      this.elQrModal.addEventListener('click', (e) => {
        if (e.target === this.elQrModal) this.elQrModal.style.display = 'none';
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elQrModal && this.elQrModal.style.display === 'flex') {
        this.elQrModal.style.display = 'none';
      }
    });
    if (this.elBtnCopyShareUrl) {
      this.elBtnCopyShareUrl.addEventListener('click', () => {
        if (this.elInputShareUrl.value) {
          navigator.clipboard.writeText(this.elInputShareUrl.value).then(() => {
            this.showToast('スマホ連携用URLをクリップボードにコピーしました。', 'info');
          });
        }
      });
    }
  }

  _syncDocModeUI() {
    if (this.docMode === 'existing') {
      this.elInputDocTitle.style.display = 'none';
      this.elInputDocId.style.display = 'block';
    } else {
      this.elInputDocTitle.style.display = 'block';
      this.elInputDocId.style.display = 'none';
    }
  }

  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    if (window.location.protocol === 'file:') {
      this.log('error', 'file:// プロトコルではブラウザのマイク機能が無効化されます。HTTPS または http://localhost 上でアクセスしてください。');
      this.showToast('file:// ではマイクが動作しません。ローカルサーバーまたはGitHub Pagesで開いてください。', 'error');
      return;
    }

    if (!this.apiKey) {
      this.showToast('Gemini API キーを設定してください。', 'warning');
      this.elModal.style.display = 'flex';
      return;
    }

    this.log('info', `=== 翻訳セッション開始 (モード: ${this.engineMode}) ===`);

    try {
      this._updateStatus('connecting');
      let liveConnected = false;

      if (this.engineMode === 'auto' || this.engineMode === 'gemini-live') {
        try {
          this.log('info', 'Gemini Live WebSocket へ接続試行中...');
          await this.geminiClient.connect(this.apiKey, this.direction, this.liveModel);

          this.log('info', 'マイク音声取得開始 (Anti-Aliased 16kHz)...');
          await this.audioService.start(
            (chunk) => this.geminiClient.sendAudioChunk(chunk),
            (volume) => this._updateMeter(volume)
          );

          this.activeEngine = 'gemini-live';
          this.elEngineBadge.textContent = this.liveModel;
          liveConnected = true;
          this.log('success', 'Gemini Live WebSocket 音声認識がアクティブになりました。');
        } catch (liveErr) {
          this.log('warn', `Gemini Live 接続失敗: ${liveErr.message}`);
          if (this.engineMode === 'gemini-live') {
            throw liveErr;
          }
          this.log('info', '自動フォールバック: ブラウザ標準音声認識 (Web Speech API) を起動します...');
        }
      }

      if (!liveConnected) {
        if (!this.webSpeechService.isSupported()) {
          throw new Error('ブラウザの音声認識APIが利用できません。Chrome または Edge でアクセスしてください。');
        }

        this.webSpeechService.start(
          this.direction,
          (interim) => this._renderInterim(interim),
          (finalText, lang) => this._handleFinalSpeech(finalText, lang),
          (err) => {
            this.log('error', `WebSpeechエラー: ${err.message}`);
            this.showToast(err.message, 'error');
          }
        );

        this.activeEngine = 'web-speech';
        this.elEngineBadge.textContent = 'WebSpeech + GeminiFlash';
        this.log('success', 'ブラウザ標準音声認識 + Gemini翻訳パイプラインが起動しました。');
      }

      this.isRecording = true;
      this.isPaused = false;
      this._updateStatus('recording');
      this._updateUIState();
      this.showToast('音声認識と自動翻訳を開始しました。マイクに向かって話してください。', 'success');
    } catch (err) {
      console.error('Failed to start session:', err);
      this.log('error', `起動処理失敗: ${err.message}`);
      this.audioService.stop();
      this.geminiClient.disconnect();
      this.webSpeechService.stop();
      this.isRecording = false;
      this.activeEngine = 'none';
      this._updateStatus('idle');
      this._updateUIState();
      this.showToast('開始エラー: ' + err.message, 'error');
    }
  }

  async stopRecording() {
    this.log('info', '翻訳セッションを停止中...');
    if (this.activeEngine === 'gemini-live') {
      this.audioService.stop();
      this.geminiClient.disconnect();
    } else if (this.activeEngine === 'web-speech') {
      this.webSpeechService.stop();
    }

    this.isRecording = false;
    this.isPaused = false;
    this.activeEngine = 'none';
    this._updateMeter(0);
    this._renderInterim('');
    this._updateStatus('idle');
    this._updateUIState();
    this.log('info', 'セッション停止完了。');
    this.showToast('翻訳セッションを停止しました。', 'info');

    const unsavedCount = this.records.length - this.lastSavedIndex;
    if (this.autoSave && unsavedCount > 0 && this.gasUrl) {
      await this.saveToDocs(true);
    }
  }

  togglePause() {
    if (!this.isRecording) return;
    if (this.isPaused) {
      if (this.activeEngine === 'gemini-live') this.audioService.resume();
      this.isPaused = false;
      this._updateStatus('recording');
      this.showToast('翻訳を再開しました。', 'info');
    } else {
      if (this.activeEngine === 'gemini-live') this.audioService.pause();
      this.isPaused = true;
      this._updateStatus('paused');
      this.showToast('翻訳を一時停止しました。', 'warning');
    }
    this._updateUIState();
  }

  _updateMeter(volume) {
    const pct = Math.min(100, Math.round(volume * 400));
    this.elMeterBar.style.width = `${pct}%`;
  }

  _renderInterim(text) {
    if (!text || text.trim() === '') {
      this.elInterimText.className = 'interim-placeholder';
      this.elInterimText.textContent = this.isRecording
        ? '音声を認識中...'
        : 'マイクを開始すると、リアルタイムの発話と翻訳プレビューがここに表示されます...';
    } else {
      this.elInterimText.className = 'interim-active';
      this.elInterimText.textContent = `認識中: ${text}`;
    }
  }

  /**
   * 音声確定時: インプレースにカードをDOMに追加し、直列FIFOキューへ投入
   */
  _handleFinalSpeech(finalText, langCode) {
    if (!finalText || finalText.trim() === '') return;

    this._renderInterim('');

    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const recordId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const record = {
      id: recordId,
      timestamp: timestamp,
      speakerLang: langCode || (this.direction === 'ja-to-en' ? 'ja' : this.direction === 'en-to-ja' ? 'en' : 'auto'),
      original: finalText,
      translated: '翻訳中...'
    };

    this.records.push(record);
    this._appendSingleCard(record);
    this._updateUIState();

    this.log('info', `FIFOキューに投入: "${finalText}"`);

    // Sequential queue execution (eliminates race conditions)
    this.translationService.enqueue(
      finalText,
      this.direction,
      this.apiKey,
      this.gasUrl,
      this.gasToken,
      recordId,
      (id, transResult) => this._onTranslationComplete(id, transResult)
    );
  }

  /**
   * インプレースなカードDOM要素の単一追加 (全DOM再描画を廃止)
   */
  _appendSingleCard(record) {
    this.elEmptyState.style.display = 'none';
    this.elRecordCount.textContent = `${this.records.length} 件の発話`;

    const card = document.createElement('div');
    card.className = 'transcript-card';
    card.id = `card-${record.id}`;

    const isJa = record.speakerLang === 'ja';
    const langClass = isJa ? 'tag-ja' : 'tag-en';
    const langLabel = (record.speakerLang || 'AUTO').toUpperCase();

    card.innerHTML = `
      <div class="card-header">
        <div class="card-meta">
          <span class="time-stamp">${this._escapeHTML(record.timestamp)}</span>
          <span class="lang-tag ${langClass}">${this._escapeHTML(langLabel)}</span>
        </div>
        <button class="btn-card-copy" title="カード内容をコピー">📋 コピー</button>
      </div>
      <div class="card-body">
        <p class="orig-text">${this._escapeHTML(record.original)}</p>
        <p class="trans-text is-translating">翻訳中...</p>
      </div>
    `;

    card.querySelector('.btn-card-copy').addEventListener('click', () => {
      const textToCopy = `[${record.timestamp}] (${langLabel})\n原文: ${record.original}\n訳文: ${record.translated}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        this.showToast('カードの内容をコピーしました。', 'info');
      });
    });

    this.elTranscriptList.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * 翻訳完了時のインプレースDOM更新 (テキスト選択・スクロール位置を保持)
   */
  _onTranslationComplete(recordId, transResult) {
    const record = this.records.find((r) => r.id === recordId);
    if (record) {
      record.translated = transResult.translated;
      record.speakerLang = transResult.speakerLang;
    }

    const card = document.getElementById(`card-${recordId}`);
    if (card) {
      const transEl = card.querySelector('.trans-text');
      if (transEl) {
        transEl.classList.remove('is-translating');
        transEl.textContent = transResult.translated;
      }
      const langEl = card.querySelector('.lang-tag');
      if (langEl) {
        const isJa = transResult.speakerLang === 'ja';
        langEl.className = `lang-tag ${isJa ? 'tag-ja' : 'tag-en'}`;
        langEl.textContent = (transResult.speakerLang || 'AUTO').toUpperCase();
      }
    }

    this.log('success', `翻訳反映完了: "${transResult.translated}"`);

    // Check auto-save threshold (every 10 unsaved items)
    const unsavedCount = this.records.length - this.lastSavedIndex;
    if (this.autoSave && unsavedCount >= 10 && this.gasUrl) {
      this.saveToDocs(true);
    }
  }

  /**
   * Google ドキュメント保存: 差分レコードのみを抽出して送信 (重複を完全防止)
   */
  async saveToDocs(isAuto = false) {
    const unsavedRecords = this.records.slice(this.lastSavedIndex);

    if (unsavedRecords.length === 0) {
      if (!isAuto) {
        this.showToast('新しく追加された未保存の差分はありません。', 'info');
      }
      return;
    }

    if (!this.gasUrl) {
      this.showToast('GAS Web App URLが未設定です。設定画面から登録してください。', 'warning');
      this.elModal.style.display = 'flex';
      return;
    }

    const isExisting = this.docMode === 'existing';
    const docId = isExisting ? this.elInputDocId.value.trim() : '';
    const title = this.elInputDocTitle.value.trim();

    if (isExisting && !docId) {
      this.showToast('追記先の既存ドキュメントIDを入力してください。', 'warning');
      this.elInputDocId.focus();
      return;
    }

    this.elBtnSaveDocs.disabled = true;
    this.elSaveDocsText.textContent = '差分保存中...';
    this.log('info', `Google ドキュメント差分同期開始 (未保存件数: ${unsavedRecords.length}件)...`);

    try {
      const result = await GasStorageClient.saveTranscript(this.gasUrl, {
        token: this.gasToken,
        documentId: docId,
        title: title,
        records: unsavedRecords, // ← 差分レコードのみ送信
        direction: this.direction,
        model: this.liveModel
      });

      // Advance save cursor to current total records
      this.lastSavedIndex += unsavedRecords.length;
      this._updateUIState();

      this.elSavedDocBanner.style.display = 'flex';
      this.elSavedDocLink.href = result.documentUrl;
      this.elSavedDocLink.textContent = `${result.documentTitle || 'ドキュメント'} を開く ↗`;
      this.log('success', `Google ドキュメント差分追記完了 (保存後累計: ${this.lastSavedIndex}件): ${result.documentUrl}`);

      // If document was newly created, switch mode to existing and save ID
      if (result.documentId) {
        this.lastDocId = result.documentId;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, this.lastDocId);
        this.elInputDocId.value = this.lastDocId;
        
        // Auto-switch to existing document mode for subsequent incremental updates
        this.docMode = 'existing';
        ConfigManager.set(ConfigManager.STORAGE_KEYS.DOC_MODE, 'existing');
        for (const radio of this.elRadioDocModes) {
          if (radio.value === 'existing') radio.checked = true;
        }
        this._syncDocModeUI();
      }

      this.showToast(
        isAuto ? `${unsavedRecords.length}件の差分を自動バックアップしました。` : `${unsavedRecords.length}件の差分をGoogleドキュメントに保存完了しました！`,
        'success'
      );
    } catch (err) {
      console.error('Save to Docs failed:', err);
      this.log('error', `GAS保存失敗: ${err.message}`);
      this.showToast('保存に失敗しました: ' + err.message, 'error');
    } finally {
      this.elBtnSaveDocs.disabled = false;
      this.elSaveDocsText.textContent = 'ドキュメントに保存';
      this._updateUIState();
    }
  }

  copyAllTranscripts() {
    if (this.records.length === 0) {
      this.showToast('コピーする履歴がありません。', 'warning');
      return;
    }

    let allText = `=== Gemini Live 日英・英日翻訳ログ ===\n日時: ${new Date().toLocaleString('ja-JP')}\n\n`;
    this.records.forEach((r) => {
      allText += `[${r.timestamp}] (${(r.speakerLang || 'AUTO').toUpperCase()})\n`;
      allText += `原文: ${r.original}\n`;
      allText += `訳文: ${r.translated}\n\n`;
    });

    navigator.clipboard.writeText(allText).then(() => {
      this.showToast('全履歴をクリップボードにコピーしました。', 'info');
    });
  }

  _updateStatus(state) {
    this.elStatusBadge.className = 'status-badge';
    const label = this.elStatusBadge.querySelector('.status-label');

    switch (state) {
      case 'recording':
        this.elStatusBadge.classList.add('status-recording');
        label.textContent = '録音・翻訳中';
        break;
      case 'connecting':
        this.elStatusBadge.classList.add('status-connecting');
        label.textContent = '接続中...';
        break;
      case 'paused':
        this.elStatusBadge.classList.add('status-connecting');
        label.textContent = '一時停止中';
        break;
      case 'error':
        this.elStatusBadge.classList.add('status-error');
        label.textContent = 'エラー';
        break;
      case 'idle':
      default:
        this.elStatusBadge.classList.add('status-idle');
        label.textContent = '待機中';
        break;
    }
  }

  _updateUIState() {
    if (this.isRecording) {
      this.elBtnToggleRecord.classList.add('is-recording');
      this.elBtnToggleRecord.querySelector('.btn-icon-symbol').textContent = '⏹️';
      this.elBtnToggleRecord.querySelector('.btn-text').textContent = '翻訳を終了';
      this.elBtnPauseRecord.disabled = false;
    } else {
      this.elBtnToggleRecord.classList.remove('is-recording');
      this.elBtnToggleRecord.querySelector('.btn-icon-symbol').textContent = '🎙️';
      this.elBtnToggleRecord.querySelector('.btn-text').textContent = '翻訳を開始';
      this.elBtnPauseRecord.disabled = true;
      this.elBtnPauseRecord.querySelector('.btn-text').textContent = '一時停止';
    }

    if (this.isPaused) {
      this.elBtnPauseRecord.querySelector('.btn-text').textContent = '再開';
      this.elBtnPauseRecord.querySelector('.btn-icon-symbol').textContent = '▶️';
    } else {
      this.elBtnPauseRecord.querySelector('.btn-text').textContent = '一時停止';
      this.elBtnPauseRecord.querySelector('.btn-icon-symbol').textContent = '⏸️';
    }

    const unsaved = this.records.length - this.lastSavedIndex;
    if (unsaved > 0) {
      this.elUnsavedBadge.style.display = 'inline-block';
      this.elUnsavedBadge.textContent = unsaved;
    } else {
      this.elUnsavedBadge.style.display = 'none';
    }
  }

  /**
   * PCで設定された情報をURLフラグメント(#setup=...)としてQRコード化
   */
  _openQrModal() {
    if (!this.apiKey && !this.gasUrl) {
      this.showToast('先に「⚙️ 設定」でGemini APIキーまたはGAS設定を入力してください。', 'warning');
      this.elModal.style.display = 'flex';
      return;
    }

    const config = {
      apiKey: this.apiKey || '',
      gasUrl: this.gasUrl || '',
      gasToken: this.gasToken || '',
      direction: this.direction || 'auto',
      engineMode: this.engineMode || 'auto',
      liveModel: this.liveModel || 'models/gemini-3.5-transcribe-live',
      autoSave: this.autoSave,
      docMode: this.docMode || 'new',
      lastDocId: this.lastDocId || ''
    };

    try {
      const jsonStr = JSON.stringify(config);
      // Safe UTF-8 to Base64
      const b64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
      
      const baseUrl = window.location.origin + window.location.pathname;
      const shareUrl = `${baseUrl}#setup=${encodeURIComponent(b64)}`;

      this.elInputShareUrl.value = shareUrl;

      // Render QR Code onto canvas
      if (window.QRCode && QRCode.renderCanvas && this.elQrCanvas) {
        QRCode.renderCanvas(this.elQrCanvas, shareUrl, {
          size: 240,
          margin: 2,
          dark: '#1F2328',
          light: '#FFFFFF'
        });
      }

      this.elQrModal.style.display = 'flex';
      this.log('info', 'スマホ連携用QRコードを表示しました。');
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      this.showToast('QRコードの生成に失敗しました: ' + err.message, 'error');
    }
  }

  /**
   * スマホでの読み取り時: URLフラグメント(#setup=...)から設定をインポート
   */
  _checkHashConfig() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#setup=')) {
      try {
        const rawData = hash.substring(7);
        const jsonStr = decodeURIComponent(Array.prototype.map.call(atob(decodeURIComponent(rawData)), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        const config = JSON.parse(jsonStr);

        if (config.apiKey) ConfigManager.set(ConfigManager.STORAGE_KEYS.API_KEY, config.apiKey);
        if (config.gasUrl) ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_URL, config.gasUrl);
        if (config.gasToken) ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_TOKEN, config.gasToken);
        if (config.direction) ConfigManager.set(ConfigManager.STORAGE_KEYS.DIRECTION, config.direction);
        if (config.engineMode) ConfigManager.set(ConfigManager.STORAGE_KEYS.ENGINE_MODE, config.engineMode);
        if (config.liveModel) ConfigManager.set(ConfigManager.STORAGE_KEYS.LIVE_MODEL, config.liveModel);
        if (config.autoSave !== undefined) ConfigManager.set(ConfigManager.STORAGE_KEYS.AUTO_SAVE, String(config.autoSave));
        if (config.docMode) ConfigManager.set(ConfigManager.STORAGE_KEYS.DOC_MODE, config.docMode);
        if (config.lastDocId) ConfigManager.set(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, config.lastDocId);

        // Security: Remove hash from URL so secrets don't persist in address bar
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        setTimeout(() => {
          this._loadSettings();
          this.log('success', 'スマホ連携: PCで設定された情報（APIキー・GAS設定）をインポートしました！');
          this.showToast('📱 PCからの設定をインポートしました！', 'success');
        }, 150);
      } catch (err) {
        console.warn('Failed to parse setup hash:', err);
        this.log('error', `設定インポート失敗: ${err.message}`);
      }
    }
  }


  showToast(message, type = 'info') {
    if (!this.elToastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'warning') icon = '🔔';

    toast.innerHTML = `<span>${icon}</span><span>${this._escapeHTML(message)}</span>`;
    this.elToastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  _escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate on load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
