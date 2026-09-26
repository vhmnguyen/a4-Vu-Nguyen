export default function Feedback({ status, error, errorRef, retry, busy, onRetry }) {
  return (
    <>
      <p id="app-status" role="status" aria-live="polite">{status}</p>
      <p ref={errorRef} id="app-error" className="alert alert-danger" role="alert" tabIndex="-1" hidden={!error}>{error}</p>
      {retry && <button id="retry-load" className="btn btn-outline-dark mb-3" type="button" disabled={busy} onClick={onRetry}>Retry loading</button>}
    </>
  )
}
