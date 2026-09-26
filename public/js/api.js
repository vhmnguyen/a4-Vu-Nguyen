window.partyApi = (() => {
  let csrfToken = ''

  async function request(path, { body, redirectOnUnauthorized = true } = {}) {
    let response
    let data
    try {
      response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/json',
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      data = await response.json()
    } catch {
      throw new Error('Unable to reach the server. Check your connection and try again.')
    }
    if (!response.ok) {
      if (response.status === 401 && redirectOnUnauthorized) {
        window.location.replace('/login.html?expired=1')
      }
      if (response.status === 403) csrfToken = ''
      throw Object.assign(new Error(data.error || 'The request failed. Please try again.'), {
        status: response.status
      })
    }
    if (data.csrfToken) csrfToken = data.csrfToken
    return data
  }

  async function post(path, body, options = {}) {
    if (!csrfToken) await request('/auth/csrf', { redirectOnUnauthorized: false })
    return request(path, { ...options, body })
  }

  return { get: request, post }
})()
