import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BookOpen, Mic, Send, Sparkles, Square } from 'lucide-react'
import { errorMessage } from './api'
import { ConnectionError, Notice, PageHeader } from './components'
import { useCitizen } from './citizen-context'
import { languages, useMicrophone, usePlayback, useProviderMicrophone } from './citizen-voice'
import { jansetu, type CheckReply, type Context, type Intent, type Language, type Reply } from './jansetu-api'
import { localize, type TextKey } from './jansetu-copy'
import { EligibilityCard, ReadinessCard, SchemeCard } from './jansetu-results'
import { useApi } from './use-api'
import './jansetu.css'

type Turn = { id: number; question: string; language: Language; context: Context; reply?: Reply; error?: string }
const initialContext: Context = { intent: 'find', slugs: [] }
const suggestions = ['start1', 'start2', 'start3', 'start4', 'start5'] as const
const followUps: Partial<Record<Intent, TextKey>> = { documents: 'documents', apply: 'apply', eligibility: 'eligibility' }
const modeLabel: Record<Reply['mode'], TextKey> = {
  ai_grounded: 'ai', ai_general: 'general', catalogue: 'catalogue', setup_required: 'setup',
  provider_unavailable: 'offline', private_text: 'privateText',
}

export function CitizenAssistant() {
  const [params] = useSearchParams()
  const [language, setLanguage] = useState<Language>('en-IN')
  const [question, setQuestion] = useState((params.get('q') ?? '').slice(0, 800))
  const [turns, setTurns] = useState<Turn[]>([])
  const [context, setContext] = useState<Context>(initialContext)
  const [sending, setSending] = useState(false)
  const [providerConsent, setProviderConsent] = useState(false)
  const [personalConsent, setPersonalConsent] = useState(false)
  const [speechConsent, setSpeechConsent] = useState(false)
  const [speechMode, setSpeechMode] = useState<'browser' | 'provider'>('browser')
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [voiceNote, setVoiceNote] = useState('')
  const [copyNote, setCopyNote] = useState('')
  const [privateResult, setPrivateResult] = useState<CheckReply>()
  const [checking, setChecking] = useState<'profile' | 'wallet'>()
  const [checkError, setCheckError] = useState('')
  const { walletOpen, assistantReport, setAssistantReport } = useCitizen()
  const status = useApi(jansetu.status)
  const browser = useMicrophone(language, setQuestion)
  const remote = useProviderMicrophone(language, setQuestion)
  const playback = usePlayback(language)
  const t = localize(language)
  const chatRequest = useRef<AbortController | undefined>(undefined)
  const checkRequest = useRef<AbortController | undefined>(undefined)
  const sequence = useRef(0)
  const composer = useRef<HTMLTextAreaElement>(null)
  const latest = turns.at(-1)
  const speech = speechMode === 'provider' ? remote : browser
  const remoteReady = !!status.data?.speech_languages.includes(language)
  const walletIntent = latest?.reply?.intent === 'expiry' || latest?.reply?.intent === 'consistency'

  useEffect(() => () => {
    chatRequest.current?.abort()
    checkRequest.current?.abort()
  }, [])

  useEffect(() => {
    if (!walletOpen) {
      if (checking === 'wallet') { checkRequest.current?.abort(); checkRequest.current = undefined; setChecking(undefined) }
      setPrivateResult(previous => previous?.scope === 'wallet' ? undefined : previous)
    }
  }, [walletOpen, checking])

  function dropPrivate() {
    checkRequest.current?.abort()
    checkRequest.current = undefined
    setChecking(undefined)
    setPrivateResult(undefined)
    setCheckError('')
  }

  async function ask(text: string, retry?: Turn) {
    const cleaned = text.trim()
    if (!cleaned || chatRequest.current) return
    browser.abort()
    remote.abort()
    playback.stop()
    dropPrivate()
    setCopyNote('')
    const turn: Turn = retry ? { ...retry, error: undefined } :
      { id: ++sequence.current, question: cleaned, language, context }
    setTurns(items => retry ? items.map(item => item.id === turn.id ? turn : item) : [...items.slice(-15), turn])
    setQuestion('')
    const controller = new AbortController()
    chatRequest.current = controller
    setSending(true)
    try {
      const reply = await jansetu.chat(cleaned, turn.language, turn.context, providerConsent, controller.signal)
      if (controller.signal.aborted) return
      setContext(reply.context)
      setTurns(items => items.map(item => item.id === turn.id ? { ...item, reply } : item))
    } catch (error) {
      if (!controller.signal.aborted) setTurns(items => items.map(item => item.id === turn.id ? { ...item, error: errorMessage(error) } : item))
    } finally {
      if (chatRequest.current === controller) { chatRequest.current = undefined; setSending(false) }
    }
  }

  async function check(scope: 'profile' | 'wallet') {
    if (!personalConsent || scope === 'wallet' && !walletOpen || checkRequest.current) return
    const controller = new AbortController()
    checkRequest.current = controller
    setChecking(scope)
    setCheckError('')
    setPrivateResult(undefined)
    try {
      const result = await jansetu.check(scope, context.slugs, controller.signal)
      if (!controller.signal.aborted) setPrivateResult(result)
    } catch (error) {
      if (!controller.signal.aborted) setCheckError(errorMessage(error))
    } finally {
      if (checkRequest.current === controller) { checkRequest.current = undefined; setChecking(undefined) }
    }
  }

  function clear() {
    chatRequest.current?.abort()
    chatRequest.current = undefined
    setSending(false)
    setTurns([])
    setQuestion('')
    setContext(initialContext)
    setVoiceNote('')
    setCopyNote('')
    setAssistantReport(undefined)
    dropPrivate()
    browser.abort()
    remote.abort()
    playback.stop()
    composer.current?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask(question)
  }

  function listen() {
    setVoiceNote('')
    if (!speechConsent) { setVoiceNote(t('micEnable')); return }
    playback.stop()
    if (speechMode === 'provider' && !remoteReady) { setVoiceNote(t('unavailable')); return }
    void speech.start()
  }

  const shownReport = walletOpen ? assistantReport : undefined
  const localEligibility = shownReport?.profile.filter(item => !context.slugs.length || context.slugs.includes(item.slug))
  const localReadiness = shownReport?.documents.filter(item => context.slugs.length ? context.slugs.includes(item.slug) : item.available > 0)
  const showPrivate = latest?.reply && (latest.reply.services.length > 0 || latest.reply.intent === 'eligibility'
    || latest.reply.intent === 'documents' || walletIntent) || shownReport
  const scoped = privateResult?.scope === 'wallet' && !walletOpen ? undefined : privateResult

  return <div className="page-stack jansetu" lang={language}>
    <PageHeader title={t('title')} description={t('description')} icon={<Sparkles size={22} />} />
    <div className="jansetu-grid">
      <section className="card panel section-stack jansetu-conversation" aria-label={t('chat')}>
        <form className="section-stack" onSubmit={submit}>
          <label>{t('question')}<textarea ref={composer} rows={2} value={question} maxLength={800} autoComplete="off"
            dir="auto" placeholder={t('placeholder')} onChange={event => setQuestion(event.target.value)} /></label>
          <div className="button-row jansetu-composer-actions">
            <button type="button" className="button button-outline" onClick={listen} disabled={speech.listening || remote.working || sending}><Mic size={17} aria-hidden="true" />{t('speak')}</button>
            <button type="button" className="button button-outline" disabled={!speech.listening} onClick={speech.stop}><Square size={15} aria-hidden="true" />{t('stop')}</button>
            <button type="submit" className="button button-primary" disabled={sending || !question.trim()}><Send size={16} aria-hidden="true" />{t('send')}</button>
          </div>
        </form>
        {(speech.listening || remote.working || voiceNote || speech.message || playback.notice || copyNote) &&
          <p role="status">{speech.listening ? t('listening') : remote.working ? t('transcribing') : voiceNote || speech.message || playback.notice || copyNote}</p>}
        {!turns.length && <section className="section-stack"><h2>{t('suggested')}</h2><div className="button-row">
          {suggestions.map(key => <button className="chip" type="button" key={key} onClick={() => void ask(t(key))}>{t(key)}</button>)}
        </div></section>}
        {turns.length > 0 && <div className="section-heading"><h2>{t('chat')}</h2>
          <button className="button button-outline" type="button" onClick={clear}>{t('clear')}</button></div>}
        <div className="jansetu-thread" role="log" aria-label={t('chat')} aria-busy={sending}>
          {turns.map(turn => {
            const tl = localize(turn.language)
            const reply = turn.reply
            return <article className="section-stack" key={turn.id} lang={turn.language}>
              <div className="jansetu-user"><strong>{tl('you')}</strong><p dir="auto">{turn.question}</p></div>
              <div className="jansetu-assistant section-stack">
                {turn.error && <><p role="alert">{turn.error}</p>{turn.id === latest?.id &&
                  <button className="button button-outline" type="button" disabled={sending} onClick={() => void ask(turn.question, turn)}>{tl('retry')}</button>}</>}
                {!turn.error && !reply && <p role="status">{tl('thinking')}</p>}
                {reply && <>
                  <span className="metadata">{tl(modeLabel[reply.mode])}</span>
                  <p dir="auto">{reply.answer}</p>
                  {reply.services.map(service => <SchemeCard key={service.slug} service={service} t={tl} show={reply.intent} />)}
                  {reply.intent === 'centres' && <div className="section-stack">
                    {reply.centres.map(centre => <article className="card panel" key={centre.name + centre.address}>
                      <h3>{centre.name}</h3><p>{centre.address} · {centre.type}</p>
                      <a className="text-link" href={centre.source} target="_blank" rel="noreferrer">{tl('sources')}</a>
                      {centre.checked_at && <p className="metadata"><time>{centre.checked_at.slice(0, 10)}</time></p>}
                    </article>)}
                    <Link className="text-link" to="/dashboard/centres">{tl('centre')}</Link>
                  </div>}
                  {reply.intent === 'consistency' && <Link className="text-link" to="/dashboard/documents/consistency">{tl('consistency')}</Link>}
                  {reply.intent === 'features' && <div className="button-row">
                    <Link className="text-link" to="/dashboard/services">{tl('view')}</Link>
                    <Link className="text-link" to="/dashboard/documents">{tl('unlock')}</Link>
                    <Link className="text-link" to="/dashboard/centres">{tl('centre')}</Link>
                  </div>}
                  <div className="button-row">
                    <button className="button button-outline" type="button" disabled={muted} onClick={() => {
                      setVoiceNote('')
                      const titles = reply.services.map(service => service.name).join('. ')
                      playback.play(turn.id, [reply.answer, titles].filter(Boolean).join(' '), turn.language, rate)
                    }}>{tl('play')}</button>
                    {playback.playing === turn.id && <>
                      <button className="button button-outline" type="button" onClick={playback.pause}>{tl(playback.paused ? 'resume' : 'pause')}</button>
                      <button className="button button-outline" type="button" onClick={playback.stop}>{tl('stop')}</button>
                    </>}
                    <button className="button button-outline" type="button" onClick={async () => {
                      try {
                        await navigator.clipboard.writeText([reply.answer, ...reply.services.flatMap(service =>
                          [service.name, service.overview, ...service.sources.map(source => source.url)])].join('\n'))
                        setCopyNote(tl('copied'))
                      } catch { setCopyNote(tl('unavailable')) }
                    }}>{tl('copy')}</button>
                    {latest?.id === turn.id && reply.mode === 'provider_unavailable' && <button type="button" className="button button-outline"
                      disabled={sending} onClick={() => void ask(turn.question, turn)}>{tl('retry')}</button>}
                  </div>
                  {latest?.id === turn.id && reply.follow_ups.length > 0 && <div className="button-row">
                    {reply.follow_ups.map(intent => followUps[intent] && <button key={intent} type="button" className="chip"
                      disabled={sending} onClick={() => void ask(t(followUps[intent]!))}>{t(followUps[intent]!)}</button>)}
                  </div>}
                </>}
              </div>
            </article>
          })}
        </div>
        {showPrivate && <section className="section-stack" aria-label={t('privateChecks')}><h2>{t('privateChecks')}</h2>
          <p>{t('personalNote')}</p>
          <label className="inline-check"><input type="checkbox" checked={personalConsent} onChange={event => {
            setPersonalConsent(event.target.checked)
            if (!event.target.checked) { dropPrivate(); setAssistantReport(undefined) }
          }} />{t('personal')}</label>
          {personalConsent && <div className="button-row">
            <button type="button" className="button button-outline" disabled={!!checking} onClick={() => void check('profile')}>{t('runProfile')}</button>
            {walletOpen ? <button type="button" className="button button-outline" disabled={!!checking} onClick={() => void check('wallet')}>{t('runWallet')}</button>
              : <Link className="text-link" to="/dashboard/documents">{t('unlock')}</Link>}
          </div>}
          {checking && <p role="status">{t('thinking')}</p>}{checkError && <p role="alert">{checkError}</p>}
          {personalConsent && scoped?.scope === 'profile' && scoped.items.map(item => <EligibilityCard key={item.slug} item={item} t={t} />)}
          {personalConsent && scoped?.scope === 'wallet' && <>
            {!!scoped.expires.length && <div><h3>{t('expires')}</h3><ul>{scoped.expires.map(item => <li key={item.category + item.date}>{item.category} · <time dateTime={item.date}>{item.date}</time></li>)}</ul></div>}
            {scoped.items.map(item => <ReadinessCard key={item.slug} item={item} t={t} />)}<p className="metadata">{t('readinessNote')}</p>
          </>}
          {personalConsent && scoped && !scoped.items.length && (scoped.scope === 'profile' || !scoped.expires.length) && <p>{t('empty')}</p>}
          {shownReport && <div className="section-stack">
            <div className="section-heading"><h3>{t('shared')}</h3><button type="button" className="button button-outline" onClick={() => setAssistantReport(undefined)}>{t('remove')}</button></div>
            <p>{t(shownReport.consistency === 'match' ? 'nameMatch' : shownReport.consistency === 'difference' ? 'nameDifference' : 'nameUnknown')}</p>
            {localEligibility?.slice(0, 5).map(item => <EligibilityCard key={item.slug} item={item} t={t} />)}
            {localReadiness?.slice(0, 5).map(item => <ReadinessCard key={item.slug} item={item} t={t} />)}
          </div>}
        </section>}
      </section>

      <aside className="card panel section-stack" aria-label={t('privacy')}>
        <span className="tile-icon"><BookOpen size={21} aria-hidden="true" /></span><h2>{t('privacy')}</h2>
        {status.error != null && <ConnectionError error={status.error} retry={status.retry} />}
        {status.data && !status.data.provider_configured && <Notice>{t('setup')}</Notice>}
        <label>{t('language')}<select aria-label={t('language')} value={language} onChange={event => {
          setLanguage(event.target.value as Language)
          setSpeechMode('browser'); setVoiceNote('')
        }}>{languages.map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select></label>
        <label className="inline-check"><input type="checkbox" checked={providerConsent} disabled={!status.data?.provider_configured}
          onChange={event => {
            if (!event.target.checked && chatRequest.current) {
              chatRequest.current.abort(); chatRequest.current = undefined; setSending(false)
              setTurns(items => items.filter(item => item.reply || item.error))
            }
            setProviderConsent(event.target.checked)
          }} />{t('provider')}</label>
        <p className="metadata">{t('disclosure')}</p>
        <label className="inline-check"><input type="checkbox" checked={speechConsent} onChange={event => {
          if (!event.target.checked) { browser.abort(); remote.abort() }
          setSpeechConsent(event.target.checked); setVoiceNote('')
        }} />{t('micConsent')}</label>
        <p className="metadata">{t('micDisclosure')}</p>
        {remoteReady && <label>{t('speechMode')}<select value={speechMode} onChange={event => {
          browser.abort(); remote.abort(); setSpeechMode(event.target.value as 'browser' | 'provider'); setVoiceNote('')
        }}><option value="browser">{t('browserVoice')}</option><option value="provider">{t('remoteVoice')}</option></select></label>}
        <label className="inline-check"><input type="checkbox" checked={muted} onChange={event => {
          if (event.target.checked) playback.stop()
          setMuted(event.target.checked)
        }} />{t('mute')}</label>
        <label>{t('speed')} · {rate.toFixed(1)}×<input aria-label={t('speed')} type="range" min="0.6" max="1.5" step="0.1" value={rate}
          onChange={event => setRate(Number(event.target.value))} /></label>
        {playback.voices.length ? <label>{t('preference')}<select value={playback.preference} onChange={event => playback.setPreference(event.target.value)}>
          <option value="">{t('defaultVoice')}</option>
          {playback.voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
        </select></label> : <p className="metadata">{t('noAudio')}</p>}
      </aside>
    </div>
  </div>
}
