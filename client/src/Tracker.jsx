import { useEffect, useRef, useState } from 'react'
import CharacterForm, { emptyCharacter } from './CharacterForm'
import CharacterTable from './CharacterTable'
import Feedback from './Feedback'

export default function Tracker({ api = window.partyApi }) {
  const [user, setUser] = useState(null)
  const [characters, setCharacters] = useState([])
  const [draft, setDraft] = useState(emptyCharacter)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [retry, setRetry] = useState(false)
  const [status, setStatus] = useState('Checking your session...')
  const [error, setError] = useState('')
  const [focus, setFocus] = useState(null)
  // Block duplicate events even before React renders disabled controls.
  const requestPending = useRef(false)
  const nameRef = useRef(null)
  const submitRef = useRef(null)
  const errorRef = useRef(null)

  useEffect(() => {
    if (!busy && focus) {
      const refs = { name: nameRef, submit: submitRef, error: errorRef }
      refs[focus].current?.focus()
      setFocus(null)
    }
  }, [busy, focus])

  function begin(message) {
    if (requestPending.current) return false
    requestPending.current = true
    setBusy(true)
    setError('')
    setStatus(message)
    return true
  }

  function finish() {
    requestPending.current = false
    setBusy(false)
  }

  function showError(message) {
    setError(message)
    setStatus('')
    setFocus('error')
  }

  async function initialize() {
    if (!begin('Checking your session...')) return
    setRetry(false)
    try {
      const session = await api.get('/auth/me')
      setUser(session.user)
      setStatus('Loading your party...')
      setCharacters(await api.get('/data'))
      setLoaded(true)
      setStatus('Your party is up to date.')
    } catch (failure) {
      if (failure.status !== 401) {
        showError(failure.message)
        setRetry(true)
      }
    } finally {
      finish()
    }
  }

  useEffect(() => {
    initialize()
    const onPageShow = (event) => { if (event.persisted) window.location.reload() }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  function resetEditor() {
    setEditing(null)
    setDraft(emptyCharacter())
  }

  async function mutate(endpoint, body, message, onSuccess = () => {}) {
    if (!loaded || retry || !begin('Saving changes...')) return
    try {
      const updated = await api.post(endpoint, body)
      setCharacters(updated)
      onSuccess(updated)
      setStatus(message)
      setFocus('submit')
    } catch (failure) {
      showError(failure.message)
    } finally {
      finish()
    }
  }

  function edit(character) {
    if (requestPending.current) return
    setEditing({ id: character.id, name: character.name })
    setDraft(Object.fromEntries(Object.keys(emptyCharacter()).map((key) => [key, String(character[key])])))
    setError('')
    setFocus('name')
  }

  function cancelEdit() {
    resetEditor()
    setError('')
    setStatus('Editing canceled.')
    setFocus('name')
  }

  function save() {
    mutate(editing ? '/update' : '/add', editing ? { ...draft, id: editing.id } : draft,
      editing ? 'Character updated.' : 'Character added.', resetEditor)
  }

  function remove(character) {
    mutate('/delete', { id: character.id }, 'Character deleted.', () => {
      if (editing?.id === character.id) resetEditor()
    })
  }

  function adjustHp(character, direction) {
    if (requestPending.current) return
    const answer = window.prompt(`${direction > 0 ? 'Add' : 'Subtract'} how much HP for ${character.name}?`)
    if (answer === null) return
    const amount = Number(answer)
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('Enter an HP amount greater than zero.')
      return
    }
    mutate('/hp', { id: character.id, amount: direction * amount }, 'HP updated.', (updated) => {
      const saved = updated.find((item) => item.id === character.id)
      if (editing?.id === character.id && saved) {
        setDraft((current) => ({ ...current, currHp: String(saved.currHp) }))
      }
    })
  }

  async function logout() {
    if (!begin('Logging out...')) return
    try {
      await api.post('/auth/logout', {})
      setUser(null)
      window.location.replace('/login.html')
    } catch (failure) {
      showError(failure.message)
    } finally {
      finish()
    }
  }

  const disabled = busy || !loaded || retry
  return (
    <>
      <header className="mb-4"><h1 className="display-5 fw-bold">D&D Party Tracker</h1></header>
      <Feedback status={status} error={error} errorRef={errorRef} retry={retry} busy={busy} onRetry={initialize} />
      {user && (
        <div id="tracker" aria-busy={busy}>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
            <p className="mb-0">Signed in as <strong id="username">{user.username}</strong></p>
            <button id="logout-button" className="btn btn-outline-dark" type="button" disabled={busy} onClick={logout}>Log out</button>
          </div>
          <CharacterForm draft={draft} editing={editing} disabled={disabled} onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))} onSave={save} onCancel={cancelEdit} nameRef={nameRef} submitRef={submitRef} />
          <CharacterTable characters={characters} loaded={loaded} disabled={disabled} onEdit={edit} onDelete={remove} onAdjustHp={adjustHp} />
        </div>
      )}
    </>
  )
}
