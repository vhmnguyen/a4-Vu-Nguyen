const authForms = document.querySelector('#auth-forms')
const authStatus = document.querySelector('#auth-status')
const authError = document.querySelector('#auth-error')
const retryAuth = document.querySelector('#retry-auth')
let submitting = false

function showAuthError(message = '') {
  authError.textContent = message
  authError.hidden = !message
  if (message) authError.focus()
}

async function initializeLogin() {
  retryAuth.hidden = true
  showAuthError()
  authStatus.textContent = 'Checking your session...'
  try {
    try {
      await partyApi.get('/auth/me', { redirectOnUnauthorized: false })
      window.location.replace('/')
      return
    } catch (error) {
      if (error.status !== 401) throw error
    }
    await partyApi.get('/auth/csrf', { redirectOnUnauthorized: false })
    authForms.hidden = false
    authStatus.textContent = new URLSearchParams(window.location.search).has('expired')
      ? 'Please log in to continue. Your session may have expired.'
      : 'Log in or create an account to get started.'
  } catch (error) {
    showAuthError(error.message)
    authStatus.textContent = ''
    retryAuth.hidden = false
  }
}

for (const [id, endpoint, message] of [
  ['login-form', '/auth/login', 'Logging in...'],
  ['register-form', '/auth/register', 'Creating your account...']
]) {
  document.getElementById(id).addEventListener('submit', async (event) => {
    event.preventDefault()
    if (submitting) return
    const form = event.currentTarget
    const username = form.elements.username.value.trim()
    const password = form.elements.password.value
    if (new TextEncoder().encode(password).length > 72) {
      showAuthError('Password must be at most 72 bytes.')
      return
    }
    submitting = true
    authForms.querySelectorAll('input, button').forEach((control) => {
      control.disabled = true
    })
    showAuthError()
    authStatus.textContent = message
    try {
      await partyApi.post(endpoint, { username, password }, { redirectOnUnauthorized: false })
      window.location.replace('/')
    } catch (error) {
      showAuthError(error.message)
      authStatus.textContent = ''
    } finally {
      submitting = false
      authForms.querySelectorAll('input, button').forEach((control) => {
        control.disabled = false
      })
    }
  })
}

retryAuth.addEventListener('click', initializeLogin)
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload()
})
initializeLogin()
