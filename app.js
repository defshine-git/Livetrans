/**
 * app.js - Frontend Client Logic for Gemini Live Bilingual Translator
 * Model: models/gemini-3.5-transcribe-live
 * 
 * v1.1.0: Real-time Live Transcription (v1beta WebSockets) + Fast Concurrent Translation
 */

// ==========================================
// 1. Config Manager (localStorage)
// ==========================================
class ConfigManager {
  static STORAGE_KEYS = {
    API_KEY: 'glt_gemini_api_key',
    GAS_URL: 'glt_gas_web_app_url',
    DIRECTION: 'glt_translation_direction',
    AUTO_SAVE: 'glt_auto_save_enabled',
    DOC_MODE: 'glt_doc_mode',
    LAST_DOC_ID: 'glt_last_doc_id',
    TRANS_MODEL: 'glt_translation_model'
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
// 2. Audio Capture Service (Web Audio API & 16kHz PCM)
// ==========================================
class AudioCaptureService {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.analyser = null;
    this.isRecording = false;
    this.isPaused = false;
    this.onChunkCallback = null;
    this.onVolumeCallback = null;
  }

  ensureContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
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
        throw new Error('マイクへのアクセスが拒否されました。ブラウザのアドレスバーの鍵アイコンからマイクの許可を設定してください。');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('利用可能なマイク機器が見つかりませんでした。マイクの接続を確認してください。');
      } else {
        throw new Error(`マイクの初期化に失敗しました: ${err.message}`);
      }
    }

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    // 2048 samples at 16kHz is 128ms chunks (recommended 100-200ms)
    const bufferSize = 2048;
    this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    const inputSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = 16000;

    this.processor.onaudioprocess = (e) => {
      // Prevent feedback loop by muting output
      const outputBuffer = e.outputBuffer.getChannelData(0);
      outputBuffer.fill(0);

      if (!this.isRecording || this.isPaused) return;

      const inputBuffer = e.inputBuffer.getChannelData(0);

      // Volume calculation
      if (this.onVolumeCallback && this.analyser) {
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / inputBuffer.length);
        this.onVolumeCallback(rms);
      }

      // Downsample to 16kHz Int16 PCM
      const downsampled = this._downsampleBuffer(inputBuffer, inputSampleRate, targetSampleRate);
      const base64Chunk = this._int16ToBase64(downsampled);

      if (this.onChunkCallback && base64Chunk) {
        this.onChunkCallback(base64Chunk);
      }
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

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

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
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
// 3. Gemini Live WebSocket Client (models/gemini-3.5-transcribe-live)
// ==========================================
class GeminiLiveClient {
  static MODEL = 'models/gemini-3.5-transcribe-live';
  // Note: Gemini Live API uses v1beta endpoint
  static WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

  constructor() {
    this.ws = null;
    this.apiKey = null;
    this.direction = 'auto';
    this.isConnected = false;
    this.isSetupComplete = false;
    this.chunkQueue = [];

    this._connectResolve = null;
    this._connectReject = null;
    this._connectTimeout = null;

    // Callbacks
    this.onInterimCallback = null;
    this.onFinalCallback = null;
    this.onStatusChangeCallback = null;
    this.onErrorCallback = null;
    this.onDisconnectCallback = null;
  }

  connect(apiKey, direction) {
    return new Promise((resolve, reject) => {
      this.apiKey = apiKey;
      this.direction = direction;
      this.isSetupComplete = false;
      this.isConnected = false;
      this.chunkQueue = [];

      this._connectResolve = resolve;
      this._connectReject = reject;

      if (!apiKey) {
        return reject(new Error('Gemini API キーが未設定です。「⚙️ 設定」から有効なAPIキーを入力してください。'));
      }

      const url = `${GeminiLiveClient.WS_URL}?key=${encodeURIComponent(this.apiKey)}`;
      
      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        return reject(new Error(`WebSocket初期化エラー: ${err.message}`));
      }

      this._updateStatus('connecting');

      // 12-second connection timeout
      this._connectTimeout = setTimeout(() => {
        if (!this.isSetupComplete) {
          const timeoutErr = new Error('Gemini Live API への接続がタイムアウトしました。APIキーまたはネットワーク接続を確認してください。');
          this.disconnect();
          reject(timeoutErr);
        }
      }, 12000);

      this.ws.onopen = () => {
        console.log('[GeminiLive] WebSocket opened. Sending setup payload...');
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
        console.error('[GeminiLive] WebSocket error event:', event);
        this._cleanupTimeout();
        this._updateStatus('error');
        if (this._connectReject) {
          this._connectReject(new Error('Gemini Live API サーバーへの接続に失敗しました。APIキーが正しいか確認してください。'));
          this._connectReject = null;
        }
      };

      this.ws.onclose = (event) => {
        console.warn(`[GeminiLive] WebSocket closed. Code: ${event.code}, Reason: "${event.reason}", Clean: ${event.wasClean}`);
        this._cleanupTimeout();

        const wasConnected = this.isConnected && this.isSetupComplete;
        this.isConnected = false;
        this.isSetupComplete = false;
        this._updateStatus('idle');

        if (this._connectReject) {
          let errorMsg = `接続が切断されました (Code: ${event.code})`;
          if (event.code === 1006) {
            errorMsg = `Gemini Live API に接続できませんでした (Code: 1006)。APIキーが有効か、Google AI Studioで該当機能が利用可能か確認してください。`;
          } else if (event.code === 1007 || event.code === 1008) {
            errorMsg = `API認証またはリクエスト形式エラーです (Code: ${event.code}${event.reason ? ' - ' + event.reason : ''})。`;
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

  disconnect() {
    this._cleanupTimeout();
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          // Send audioStreamEnd before closing
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
    this._updateStatus('idle');
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
    // Standard format for Live Transcribe v1beta
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
    // Configure language hints based on user selection
    let languageCodes = [];
    if (this.direction === 'ja-to-en') {
      languageCodes = ['ja-JP'];
    } else if (this.direction === 'en-to-ja') {
      languageCodes = ['en-US'];
    } else {
      languageCodes = []; // auto-detect
    }

    // Official setup payload for models/gemini-3.5-transcribe-live
    const setupPayload = {
      setup: {
        model: GeminiLiveClient.MODEL,
        generationConfig: {
          responseModalities: ['TEXT']
        },
        inputAudioTranscription: {
          languageCodes: languageCodes,
          mode: 'SMART'
        }
      }
    };

    console.log('[GeminiLive] Sending setupPayload:', JSON.stringify(setupPayload));
    this.ws.send(JSON.stringify(setupPayload));
  }

  _handleServerMessage(rawMessage) {
    try {
      const data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

      // 1. Setup complete acknowledgment
      if (data.setupComplete) {
        console.log('[GeminiLive] SetupComplete acknowledged by server!');
        this.isConnected = true;
        this.isSetupComplete = true;
        this._cleanupTimeout();
        this._updateStatus('recording');

        if (this._connectResolve) {
          this._connectResolve();
          this._connectResolve = null;
          this._connectReject = null;
        }

        // Flush initial audio buffer
        while (this.chunkQueue.length > 0) {
          const qChunk = this.chunkQueue.shift();
          this._dispatchChunk(qChunk);
        }
        return;
      }

      // 2. Transcription server content
      if (data.serverContent) {
        const sc = data.serverContent;

        // Interim hypothesis (streaming speech preview)
        if (sc.interimInputTranscription && sc.interimInputTranscription.text) {
          const interimText = sc.interimInputTranscription.text;
          if (this.onInterimCallback) {
            this.onInterimCallback(interimText);
          }
        }

        // Finalized transcription (speaker paused or completed speech turn)
        if (sc.inputTranscription && sc.inputTranscription.text) {
          const finalText = sc.inputTranscription.text.trim();
          const langCode = sc.inputTranscription.languageCode || null;
          if (finalText.length > 0 && this.onFinalCallback) {
            this.onFinalCallback(finalText, langCode);
          }
        }
      }
    } catch (e) {
      console.warn('Error parsing server message:', e, rawMessage);
    }
  }

  _updateStatus(status) {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status);
    }
  }
}

// ==========================================
// 4. Translation Service (Fast Concurrent REST Translation)
// ==========================================
class TranslationService {
  static async translate(text, direction, apiKey) {
    if (!text || text.trim() === '') return '';

    // Automatic language detection if direction is auto
    let srcLang = 'ja';
    let targetLang = 'en';

    if (direction === 'ja-to-en') {
      srcLang = 'ja';
      targetLang = 'en';
    } else if (direction === 'en-to-ja') {
      srcLang = 'en';
      targetLang = 'ja';
    } else {
      // Auto: detect whether text contains Japanese characters
      const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
      srcLang = hasJapanese ? 'ja' : 'en';
      targetLang = hasJapanese ? 'en' : 'ja';
    }

    const prompt = `You are a professional simultaneous interpreter. Translate the following text from ${srcLang === 'ja' ? 'Japanese' : 'English'} into fluent, natural ${targetLang === 'ja' ? 'Japanese' : 'English'}.\n`
                 + `Strict requirements:\n`
                 + `1. Return ONLY the direct translation.\n`
                 + `2. Do not include quotes, markdown formatting, explanations, or notes.\n\n`
                 + `Text to translate:\n${text}`;

    // Try models: gemini-2.5-flash -> gemini-1.5-flash
    const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash'];
    let lastError = null;

    for (const modelName of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1000
            }
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            return {
              translated: data.candidates[0].content.parts[0].text.trim(),
              speakerLang: srcLang
            };
          }
        } else {
          lastError = new Error(`Model ${modelName} HTTP ${res.status}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    console.warn('Translation REST call failed:', lastError);
    return {
      translated: '(翻訳取得失敗)',
      speakerLang: srcLang
    };
  }
}

// ==========================================
// 5. GAS Storage Client (Google Docs Integration)
// ==========================================
class GasStorageClient {
  static async ping(gasUrl) {
    if (!gasUrl) throw new Error('GAS Web App URLが設定されていません。');
    
    const res = await fetch(gasUrl, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTPステータス: ${res.status}`);
    return await res.json();
  }

  static async saveTranscript(gasUrl, { documentId, title, records, direction }) {
    if (!gasUrl) throw new Error('GAS Web App URLが未設定です。設定画面からURLを入力してください。');
    if (!records || records.length === 0) throw new Error('保存対象の発話履歴がありません。');

    const payload = {
      action: 'save',
      documentId: documentId || '',
      title: title || '',
      model: GeminiLiveClient.MODEL,
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
// 6. Main Application Controller
// ==========================================
class App {
  constructor() {
    this.audioService = new AudioCaptureService();
    this.geminiClient = new GeminiLiveClient();

    this.records = [];
    this.unsavedCount = 0;
    this.isRecording = false;
    this.isPaused = false;

    this._initElements();
    this._loadSettings();
    this._bindEvents();
    this._updateUIState();
  }

  _initElements() {
    this.elStatusBadge = document.getElementById('connection-status');
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

    this.elTranscriptList = document.getElementById('transcript-list');
    this.elEmptyState = document.getElementById('empty-state');
    this.elRecordCount = document.getElementById('record-count');
    this.elBtnCopyAll = document.getElementById('btn-copy-all');

    this.elModal = document.getElementById('settings-modal');
    this.elBtnCloseModal = document.getElementById('btn-close-modal');
    this.elInputApiKey = document.getElementById('input-gemini-key');
    this.elBtnToggleKeyVis = document.getElementById('btn-toggle-key-vis');
    this.elInputGasUrl = document.getElementById('input-gas-url');
    this.elBtnTestGas = document.getElementById('btn-test-gas');
    this.elGasTestResult = document.getElementById('gas-test-result');
    this.elCheckAutoSave = document.getElementById('check-auto-save');
    this.elBtnSaveSettings = document.getElementById('btn-save-settings');

    this.elToastContainer = document.getElementById('toast-container');
  }

  _loadSettings() {
    this.apiKey = ConfigManager.get(ConfigManager.STORAGE_KEYS.API_KEY, '');
    this.gasUrl = ConfigManager.get(ConfigManager.STORAGE_KEYS.GAS_URL, '');
    this.direction = ConfigManager.get(ConfigManager.STORAGE_KEYS.DIRECTION, 'auto');
    this.autoSave = ConfigManager.get(ConfigManager.STORAGE_KEYS.AUTO_SAVE, 'false') === 'true';
    this.docMode = ConfigManager.get(ConfigManager.STORAGE_KEYS.DOC_MODE, 'new');
    this.lastDocId = ConfigManager.get(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, '');

    this.elInputApiKey.value = this.apiKey;
    this.elInputGasUrl.value = this.gasUrl;
    this.elSelectDirection.value = this.direction;
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
      if (this.isRecording) {
        this.showToast('翻訳方向が変更されました。', 'info');
      }
    });

    this.elBtnClearFeed.addEventListener('click', () => {
      if (this.records.length === 0) return;
      if (confirm('タイムラインの翻訳履歴をクリアしますか？（未保存の履歴は失われます）')) {
        this.records = [];
        this.unsavedCount = 0;
        this._renderTranscriptList();
        this._updateUIState();
        this.showToast('タイムラインをクリアしました。', 'info');
      }
    });

    this.elBtnSaveDocs.addEventListener('click', () => this.saveToDocs());

    for (const radio of this.elRadioDocModes) {
      radio.addEventListener('change', (e) => {
        this.docMode = e.target.value;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.DOC_MODE, this.docMode);
        this._syncDocModeUI();
      });
    }

    this.elBtnCopyAll.addEventListener('click', () => this.copyAllTranscripts());

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
      this.autoSave = this.elCheckAutoSave.checked;

      ConfigManager.set(ConfigManager.STORAGE_KEYS.API_KEY, this.apiKey);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_URL, this.gasUrl);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.AUTO_SAVE, String(this.autoSave));

      this.elModal.style.display = 'none';
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
        const res = await GasStorageClient.ping(url);
        if (res.status === 'ok') {
          this.elGasTestResult.textContent = `接続成功 (v${res.version || '1.0'})`;
          this.elGasTestResult.className = 'test-result-text success';
        } else {
          this.elGasTestResult.textContent = '応答受信 (エラーあり)';
          this.elGasTestResult.className = 'test-result-text error';
        }
      } catch (err) {
        this.elGasTestResult.textContent = '接続失敗: ' + err.message;
        this.elGasTestResult.className = 'test-result-text error';
      }
    });

    // Gemini Client Callbacks
    this.geminiClient.onStatusChangeCallback = (status) => this._handleGeminiStatus(status);
    this.geminiClient.onErrorCallback = (err) => this.showToast(err, 'error');
    this.geminiClient.onDisconnectCallback = (code, reason) => {
      console.warn(`[App] Session closed by server: ${code} ${reason}`);
      this.audioService.stop();
      this.isRecording = false;
      this.isPaused = false;
      this._updateMeter(0);
      this._renderInterim('');
      this._updateUIState();
      this.showToast(`翻訳セッションが切断されました (Code: ${code})。再開するには再度ボタンを押してください。`, 'warning');
    };

    this.geminiClient.onInterimCallback = (text) => this._renderInterim(text);
    this.geminiClient.onFinalCallback = (finalText, langCode) => this._handleFinalSpeech(finalText, langCode);
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
    if (!this.apiKey) {
      this.showToast('Gemini API キーを設定してください。', 'warning');
      this.elModal.style.display = 'flex';
      return;
    }

    try {
      this._updateStatus('connecting');

      // 1. Initialize AudioContext on user touch/click gesture
      await this.audioService.ensureContext();

      // 2. Connect WebSocket to models/gemini-3.5-transcribe-live
      await this.geminiClient.connect(this.apiKey, this.direction);

      // 3. Start Audio capture
      await this.audioService.start(
        (chunk) => this.geminiClient.sendAudioChunk(chunk),
        (volume) => this._updateMeter(volume)
      );

      this.isRecording = true;
      this.isPaused = false;
      this._updateUIState();
      this.showToast('リアルタイム翻訳を開始しました。マイクに向かって話してください。', 'success');
    } catch (err) {
      console.error('Failed to start recording:', err);
      this.audioService.stop();
      this.geminiClient.disconnect();
      this.isRecording = false;
      this._updateUIState();
      this.showToast('開始エラー: ' + err.message, 'error');
    }
  }

  async stopRecording() {
    this.audioService.stop();
    this.geminiClient.disconnect();
    this.isRecording = false;
    this.isPaused = false;
    this._updateMeter(0);
    this._renderInterim('');
    this._updateUIState();
    this.showToast('翻訳セッションを停止しました。', 'info');

    if (this.autoSave && this.unsavedCount > 0 && this.gasUrl) {
      await this.saveToDocs(true);
    }
  }

  togglePause() {
    if (!this.isRecording) return;
    if (this.isPaused) {
      this.audioService.resume();
      this.isPaused = false;
      this._updateStatus('recording');
      this.showToast('翻訳を再開しました。', 'info');
    } else {
      this.audioService.pause();
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
   * 音声認識の確定テキストを受信した際の処理
   */
  async _handleFinalSpeech(finalText, langCode) {
    if (!finalText || finalText.trim() === '') return;

    // Clear interim view
    this._renderInterim('');

    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Create record object
    const recordIndex = this.records.length;
    const record = {
      timestamp: timestamp,
      speakerLang: langCode || (this.direction === 'ja-to-en' ? 'ja' : this.direction === 'en-to-ja' ? 'en' : 'auto'),
      original: finalText,
      translated: '翻訳中...'
    };

    this.records.push(record);
    this.unsavedCount++;
    this._renderTranscriptList();
    this._updateUIState();

    // Fast asynchronous translation via Gemini API
    try {
      const transResult = await TranslationService.translate(finalText, this.direction, this.apiKey);
      record.translated = transResult.translated;
      record.speakerLang = transResult.speakerLang;
      this._renderTranscriptList();
      this._updateUIState();

      // Trigger auto-save every 10 utterances
      if (this.autoSave && this.unsavedCount >= 10 && this.gasUrl) {
        this.saveToDocs(true);
      }
    } catch (err) {
      console.warn('Translation error:', err);
      record.translated = '(翻訳エラー)';
      this._renderTranscriptList();
    }
  }

  _renderTranscriptList() {
    if (this.records.length === 0) {
      this.elEmptyState.style.display = 'block';
      this.elTranscriptList.innerHTML = '';
      this.elRecordCount.textContent = '0 件の発話';
      return;
    }

    this.elEmptyState.style.display = 'none';
    this.elRecordCount.textContent = `${this.records.length} 件の発話`;

    this.elTranscriptList.innerHTML = '';
    this.records.forEach((record) => {
      const card = document.createElement('div');
      card.className = 'transcript-card';

      const isJa = record.speakerLang === 'ja';
      const langClass = isJa ? 'tag-ja' : 'tag-en';
      const langLabel = (record.speakerLang || 'AUTO').toUpperCase();

      const isTranslating = record.translated === '翻訳中...';

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
          <p class="trans-text ${isTranslating ? 'is-translating' : ''}">${this._escapeHTML(record.translated)}</p>
        </div>
      `;

      card.querySelector('.btn-card-copy').addEventListener('click', () => {
        const textToCopy = `[${record.timestamp}] (${langLabel})\n原文: ${record.original}\n訳文: ${record.translated}`;
        navigator.clipboard.writeText(textToCopy).then(() => {
          this.showToast('カードの内容をコピーしました。', 'info');
        });
      });

      this.elTranscriptList.appendChild(card);
    });

    this.elTranscriptList.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
  }

  async saveToDocs(isAuto = false) {
    if (this.records.length === 0) {
      this.showToast('保存対象の発話履歴がありません。', 'warning');
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
    this.elSaveDocsText.textContent = '保存中...';

    try {
      const result = await GasStorageClient.saveTranscript(this.gasUrl, {
        documentId: docId,
        title: title,
        records: this.records,
        direction: this.direction
      });

      this.unsavedCount = 0;
      this._updateUIState();

      this.elSavedDocBanner.style.display = 'flex';
      this.elSavedDocLink.href = result.documentUrl;
      this.elSavedDocLink.textContent = `${result.documentTitle || 'ドキュメント'} を開く ↗`;

      if (result.documentId) {
        this.lastDocId = result.documentId;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, this.lastDocId);
        if (this.docMode === 'existing') {
          this.elInputDocId.value = this.lastDocId;
        }
      }

      this.showToast(
        isAuto ? 'Googleドキュメントに自動バックアップしました。' : 'Googleドキュメントに保存完了しました！',
        'success'
      );
    } catch (err) {
      console.error('Save to Docs failed:', err);
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

  _handleGeminiStatus(status) {
    this._updateStatus(status);
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

    if (this.unsavedCount > 0) {
      this.elUnsavedBadge.style.display = 'inline-block';
      this.elUnsavedBadge.textContent = this.unsavedCount;
    } else {
      this.elUnsavedBadge.style.display = 'none';
    }
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
