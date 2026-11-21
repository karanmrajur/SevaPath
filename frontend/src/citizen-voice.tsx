import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { jansetu, type Language } from './jansetu-api'

interface Recognition {
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

export const languages = [['en-IN', 'English'], ['hi-IN', 'हिन्दी'], ['kn-IN', 'ಕನ್ನಡ']] as const
const audioMessages = {
  'en-IN': { unavailable: 'Microphone transcription is unavailable here. You can type your question.', denied: 'Microphone permission was denied. You can type your question.', failed: 'Voice input was unavailable. Try typing or use the configured speech option.', noVoice: 'No device voice is available for this language.', tooLong: 'The recording is too large. Try a shorter question.' },
  'hi-IN': { unavailable: 'इस ब्राउज़र में आवाज़ से लिखना उपलब्ध नहीं है। सवाल टाइप करें।', denied: 'माइक्रोफ़ोन की अनुमति बंद है। सवाल टाइप करें।', failed: 'आवाज़ से सवाल लेना विफल रहा। सवाल टाइप करें।', noVoice: 'इस भाषा की डिवाइस आवाज़ उपलब्ध नहीं है।', tooLong: 'रिकॉर्डिंग बहुत बड़ी है। छोटा सवाल पूछें।' },
  'kn-IN': { unavailable: 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಲಿಪ್ಯಂತರ ಲಭ್ಯವಿಲ್ಲ. ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ.', denied: 'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ.', failed: 'ಧ್ವನಿ ಇನ್‌ಪುಟ್ ಲಭ್ಯವಿಲ್ಲ. ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ.', noVoice: 'ಈ ಭಾಷೆಗೆ ಸಾಧನದ ಧ್ವನಿ ಲಭ್ಯವಿಲ್ಲ.', tooLong: 'ರೆಕಾರ್ಡಿಂಗ್ ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ. ಚಿಕ್ಕ ಪ್ರಶ್ನೆ ಕೇಳಿ.' },
}

const speech = () => window as typeof window & {
  SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition
}

export function useMicrophone(language: Language, onText: (text: string) => void) {
  const recognition = useRef<Recognition | null>(null)
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const words = audioMessages[language]
  const Constructor = speech().SpeechRecognition ?? speech().webkitSpeechRecognition

  function dispose() {
    const active = recognition.current
    recognition.current = null
    if (active) {
      active.onend = null
      active.onerror = null
      active.onresult = null
      active.abort()
    }
  }

  useEffect(() => {
    setListening(false)
    setMessage('')
    return dispose
  }, [language])

  function abort() { dispose(); setListening(false) }

  function start() {
    if (recognition.current) return
    if (!Constructor) { setMessage(words.unavailable); return }
    setMessage('')
    const active = new Constructor()
    active.lang = language
    active.onresult = event => {
      if (recognition.current !== active) return
      const result = event.results[0]?.[0]?.transcript
      if (result) onText(result.slice(0, 800))
    }
    active.onerror = event => {
      if (recognition.current !== active) return
      recognition.current = null
      setListening(false)
      setMessage(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? words.denied : words.failed)
    }
    active.onend = () => { if (recognition.current === active) { recognition.current = null; setListening(false) } }
    recognition.current = active
    try { active.start(); setListening(true) } catch { recognition.current = null; setMessage(words.failed) }
  }

  const stop = () => recognition.current?.stop()
  return { toggle: () => listening ? stop() : start(), start, stop, abort, listening, message, available: !!Constructor }
}

export function MicButton({ mic }: { mic: ReturnType<typeof useMicrophone> }) {
  return <button className="citizen-icon" type="button" onClick={mic.toggle} aria-label={mic.listening ? 'Stop microphone' : 'Start microphone'}>
    {mic.listening ? <Square size={18} /> : <Mic size={18} />}
  </button>
}

type AudioRecording = { recorder?: MediaRecorder; stream?: MediaStream; timer?: number; controller: AbortController }

export function useProviderMicrophone(language: Language, onText: (text: string) => void) {
  const recording = useRef<AudioRecording | undefined>(undefined)
  const [listening, setListening] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const words = audioMessages[language]
  const available = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  function dispose() {
    const current = recording.current
    recording.current = undefined
    current?.controller.abort()
    window.clearTimeout(current?.timer)
    if (current?.recorder?.state === 'recording') {
      current.recorder.onstop = null
      current.recorder.stop()
    }
    current?.stream?.getTracks().forEach(track => track.stop())
  }

  useEffect(() => {
    setListening(false)
    setWorking(false)
    setMessage('')
    return dispose
  }, [language])

  function abort() { dispose(); setListening(false); setWorking(false) }
  const stop = () => { if (recording.current?.recorder?.state === 'recording') recording.current.recorder.stop() }

  async function start() {
    if (recording.current) return
    if (!available) { setMessage(words.unavailable); return }
    setMessage('')
    const current: AudioRecording = { controller: new AbortController() }
    recording.current = current
    setWorking(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      current.stream = stream
      if (current.controller.signal.aborted) { stream.getTracks().forEach(track => track.stop()); return }
      const format = ['audio/webm', 'audio/ogg', 'audio/mp4'].find(mime => MediaRecorder.isTypeSupported(mime))
      if (!format) throw new Error()
      const recorder = new MediaRecorder(stream, { mimeType: format })
      current.recorder = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => { abort(); setMessage(words.failed) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        window.clearTimeout(current.timer)
        if (current.controller.signal.aborted) return
        setListening(false)
        const blob = new Blob(chunks, { type: format })
        setWorking(true)
        try {
          if (blob.size > 2_000_000) { setMessage(words.tooLong); return }
          const text = await jansetu.transcribe(blob, language, current.controller.signal)
          if (!current.controller.signal.aborted) onText(text)
        } catch { if (!current.controller.signal.aborted) setMessage(words.failed) }
        finally { if (recording.current === current) { recording.current = undefined; setWorking(false) } }
      }
      recorder.start()
      current.timer = window.setTimeout(stop, 25_000)
      setWorking(false)
      setListening(true)
    } catch (error) {
      if (!current.controller.signal.aborted) {
        abort()
        setMessage(error instanceof DOMException && error.name === 'NotAllowedError' ? words.denied : words.failed)
      }
    }
  }
  return { start, stop, abort, listening, working, message, available }
}

export function usePlayback(language: Language) {
  const synth = window.speechSynthesis
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [preference, setPreference] = useState('')
  const [notice, setNotice] = useState('')
  const [playing, setPlaying] = useState<number>()
  const [paused, setPaused] = useState(false)
  const utterance = useRef<SpeechSynthesisUtterance | undefined>(undefined)

  function stop() {
    utterance.current = undefined
    synth?.cancel()
    setPlaying(undefined)
    setPaused(false)
  }

  useEffect(() => {
    function load() { setVoices((synth?.getVoices() ?? []).filter(voice => voice.localService && voice.lang.slice(0, 2) === language.slice(0, 2))) }
    stop()
    setNotice('')
    setPreference('')
    load()
    synth?.addEventListener('voiceschanged', load)
    return () => { synth?.removeEventListener('voiceschanged', load); synth?.cancel() }
  }, [language, synth])

  function play(id: number, text: string, locale: Language, rate: number) {
    stop()
    const candidates = (synth?.getVoices() ?? []).filter(voice => voice.localService && voice.lang.slice(0, 2) === locale.slice(0, 2))
    const voice = candidates.find(item => item.voiceURI === preference) ?? candidates.find(item => item.lang === locale) ?? candidates[0]
    if (!voice || !synth || typeof SpeechSynthesisUtterance === 'undefined') { setNotice(audioMessages[locale].noVoice); return }
    setNotice('')
    const next = new SpeechSynthesisUtterance(text)
    next.lang = voice.lang
    next.voice = voice
    next.rate = rate
    next.onend = () => { if (utterance.current === next) stop() }
    next.onerror = () => { if (utterance.current === next) { stop(); setNotice(audioMessages[locale].noVoice) } }
    utterance.current = next
    setPlaying(id)
    synth.speak(next)
  }

  function pause() {
    if (paused) synth?.resume()
    else synth?.pause()
    setPaused(!paused)
  }

  return { play, stop, pause, paused, playing, notice, voices, preference, setPreference }
}
