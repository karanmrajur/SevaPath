import { useId, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Info } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { errorMessage } from './api'
import { citizenApi } from './citizen-api'
import { Brand } from './components'
import { usePortalPreferences } from './portal-preferences'
import './auth.css'

type Mode = 'login' | 'register' | 'recovery'
type FieldName = 'identifier' | 'fullName' | 'email' | 'mobile' | 'password' | 'confirmation'
type Labels = ReturnType<typeof usePortalPreferences>['label']
type FieldErrors = Partial<Record<FieldName, string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

function isMobile(value: string) {
  return /^(?:\+?91)?[6-9][0-9]{9}$/u.test(value.replace(/[\s()-]/gu, ''))
}

function validate(form: FormData, mode: Mode, label: Labels): FieldErrors {
  const get = (field: FieldName) => String(form.get(field) ?? '')
  const errors: FieldErrors = {}

  if (mode === 'register') {
    if (!get('fullName').trim()) errors.fullName = label('Enter your full name.', 'अपना पूरा नाम दर्ज करें।')
    if (!emailPattern.test(get('email').trim())) errors.email = label('Enter a valid email address.', 'मान्य ईमेल पता दर्ज करें।')
    if (!isMobile(get('mobile').trim())) errors.mobile = label('Enter a valid 10-digit Indian mobile number.', 'भारत का मान्य 10 अंकों वाला मोबाइल नंबर दर्ज करें।')
    if (get('password').length < 8 || !get('password').trim()) {
      errors.password = label('Use at least 8 characters for your password.', 'पासवर्ड में कम से कम 8 वर्ण रखें।')
    }
    if (!get('confirmation')) errors.confirmation = label('Enter your password again.', 'अपना पासवर्ड दोबारा दर्ज करें।')
    else if (get('confirmation') !== get('password')) errors.confirmation = label('Passwords must match.', 'दोनों पासवर्ड एक जैसे होने चाहिए।')
  } else {
    const identifier = get('identifier').trim()
    if (!emailPattern.test(identifier) && !isMobile(identifier)) {
      errors.identifier = label('Enter a valid email address or Indian mobile number.', 'मान्य ईमेल पता या भारतीय मोबाइल नंबर दर्ज करें।')
    }
    if (mode === 'login' && !get('password')) errors.password = label('Enter your password.', 'अपना पासवर्ड दर्ज करें।')
  }

  return errors
}

function Field({ name, title, autoComplete, type = 'text', maxLength, error }: {
  name: FieldName
  title: string
  autoComplete: string
  type?: 'text' | 'email' | 'tel'
  maxLength: number
  error?: string
}) {
  const id = useId()

  return (
    <div className="auth-field">
      <label htmlFor={id}>{title}</label>
      <input id={id} name={name} type={type} autoComplete={autoComplete} maxLength={maxLength} required
        aria-invalid={error ? true : undefined} aria-describedby={error ? id + '-error' : undefined} />
      {error && <p className="auth-error" id={id + '-error'}>{error}</p>}
    </div>
  )
}

function PasswordField({ name, title, autoComplete, error, hint }: {
  name: 'password' | 'confirmation'
  title: string
  autoComplete: 'current-password' | 'new-password'
  error?: string
  hint?: string
}) {
  const { label } = usePortalPreferences()
  const [visible, setVisible] = useState(false)
  const id = useId()
  const Icon = visible ? EyeOff : Eye
  const descriptionId = error ? id + '-error' : hint ? id + '-hint' : undefined

  return (
    <div className="auth-field">
      <label htmlFor={id}>{title}</label>
      <div className="auth-password">
        <input id={id} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} maxLength={128} required
          autoCapitalize="none" spellCheck={false} aria-invalid={error ? true : undefined} aria-describedby={descriptionId} />
        <button type="button" className="auth-password-toggle" aria-controls={id} aria-label={
          name === 'confirmation'
            ? visible ? label('Hide repeated password', 'दोबारा दर्ज किया पासवर्ड छिपाएँ') : label('Show repeated password', 'दोबारा दर्ज किया पासवर्ड दिखाएँ')
            : visible ? label('Hide password', 'पासवर्ड छिपाएँ') : label('Show password', 'पासवर्ड दिखाएँ')
        } onClick={() => setVisible(value => !value)}><Icon size={18} aria-hidden="true" /></button>
      </div>
      {error ? <p className="auth-error" id={id + '-error'}>{error}</p>
        : hint && <p className="auth-hint" id={id + '-hint'}>{hint}</p>}
    </div>
  )
}

function AccountForm({ mode }: { mode: Mode }) {
  const { label } = usePortalPreferences()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const destination: unknown = useLocation().state?.next
  const next = typeof destination === 'string' && /^\/dashboard(?:[/?#]|$)/u.test(destination) ? destination : '/dashboard'
  const registering = mode === 'register'
  const recovering = mode === 'recovery'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (submitting) return
    const values = new FormData(form)
    const get = (name: string) => String(values.get(name) ?? '')
    const problems = validate(values, mode, label)
    setErrors(problems)

    const invalidField = Object.keys(problems)[0]
    if (invalidField) {
      setStatus('')
      const field = form.elements.namedItem(invalidField)
      if (field instanceof HTMLInputElement) requestAnimationFrame(() => field.focus())
      return
    }
    setStatus('')
    if (recovering) {
      setStatus(label('Password recovery is unavailable until a delivery provider is connected.', 'रिकवरी सेवा जुड़ने तक पासवर्ड रीसेट उपलब्ध नहीं है।'))
      return
    }
    setSubmitting(true)
    try {
      if (registering) await citizenApi.register({ name: get('fullName'), email: get('email'), mobile: get('mobile'), password: get('password') })
      else await citizenApi.login({ identifier: get('identifier'), password: get('password'), remember: values.has('remember') })
      form.reset()
      navigate(next, { replace: true })
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" method="post" noValidate onSubmit={submit} onChange={() => {
      if (status) setStatus('')
    }}>
      {registering ? <>
        <Field name="fullName" title={label('Full name', 'पूरा नाम')} autoComplete="name" maxLength={120} error={errors.fullName} />
        <Field name="email" title={label('Email address', 'ईमेल पता')} type="email" autoComplete="email" maxLength={254} error={errors.email} />
        <Field name="mobile" title={label('Mobile number', 'मोबाइल नंबर')} type="tel" autoComplete="tel" maxLength={24} error={errors.mobile} />
      </> : <Field name="identifier" title={label('Email or mobile number', 'ईमेल या मोबाइल नंबर')} autoComplete="username" maxLength={254} error={errors.identifier} />}

      {!recovering && <PasswordField name="password" title={label('Password', 'पासवर्ड')} autoComplete={registering ? 'new-password' : 'current-password'}
        error={errors.password} hint={registering ? label('At least 8 characters.', 'कम से कम 8 वर्ण।') : undefined} />}
      {registering && <PasswordField name="confirmation" title={label('Confirm password', 'पासवर्ड की पुष्टि करें')} autoComplete="new-password" error={errors.confirmation} />}

      {mode === 'login' && <div className="auth-options">
        <label className="auth-remember"><input type="checkbox" name="remember" />{label('Remember me', 'मुझे याद रखें')}</label>
        <Link className="text-link" to="/forgot-password">{label('Forgot password?', 'पासवर्ड भूल गए?')}</Link>
      </div>}

      {Object.keys(errors).length > 0 && <p className="sr-only" role="alert">{label('Review the highlighted fields.', 'चिह्नित फ़ील्ड की जाँच करें।')}</p>}
      <button className="button button-primary auth-submit" type="submit" disabled={submitting}>{registering ? label('Create Account', 'खाता बनाएँ') : recovering ? label('Request password reset', 'पासवर्ड रीसेट का अनुरोध करें') : label('Sign In', 'साइन इन करें')}</button>
      {status && <p className="auth-status" role="status">{status}</p>}
    </form>
  )
}

export function AuthPage({ mode }: { mode: Mode }) {
  const { state } = useLocation()
  const { label, language } = usePortalPreferences()
  const registering = mode === 'register'
  const recovering = mode === 'recovery'
  const title = registering ? label('Create Account', 'खाता बनाएँ') : recovering ? label('Reset your password', 'अपना पासवर्ड रीसेट करें') : label('Welcome Back', 'फिर से स्वागत है')

  return (
    <div className="auth-layout" lang={language}>
      <section className="card auth-card" aria-labelledby="auth-title">
        <div className="auth-heading">
          <Link to="/" aria-label={label('SevaPath home', 'सेवापथ होम')}><Brand /></Link>
          <h1 id="auth-title">{title}</h1>
          <p>{registering ? label('Enter your details to prepare a SevaPath account.', 'सेवापथ खाता बनाने के लिए अपनी जानकारी दर्ज करें।')
            : recovering ? label('Enter the email address or mobile number associated with your account.', 'अपने खाते से जुड़ा ईमेल पता या मोबाइल नंबर दर्ज करें।')
              : label('Sign in to your SevaPath account.', 'अपने सेवापथ खाते में साइन इन करें।')}</p>
        </div>
        {recovering && <div className="notice auth-notice"><Info size={18} aria-hidden="true" /><p>{label('Password recovery is awaiting a delivery provider.', 'पासवर्ड रिकवरी के लिए डिलीवरी सेवा जुड़नी बाकी है।')}</p></div>}
        <AccountForm key={mode} mode={mode} />
        <div className="auth-switch">
          {mode === 'login'
            ? <>{label('New to SevaPath?', 'सेवापथ पर नए हैं?')} <Link className="text-link" to="/register" state={state}>{label('Create Account', 'खाता बनाएँ')}</Link></>
            : <Link className="text-link" to="/login" state={state}>{label('Back to Sign In', 'साइन इन पर लौटें')}</Link>}
        </div>
      </section>
      <Link className="text-link auth-back" to="/">{label('Back to SevaPath', 'सेवापथ पर लौटें')}</Link>
    </div>
  )
}
