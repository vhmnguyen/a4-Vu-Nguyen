function CharacterRow({ character, disabled, onEdit, onDelete, onAdjustHp }) {
  const actions = [
    ['Edit', 'edit-button', () => onEdit(character)],
    ['Delete', 'delete-button', () => onDelete(character)],
    ['Add HP', 'add-hp-button', () => onAdjustHp(character, 1)],
    ['Subtract HP', 'subtract-hp-button', () => onAdjustHp(character, -1)],
  ]
  return (
    <tr>
      <td>{character.name}</td><td>{character.class}</td><td>{character.species}</td>
      <td>{character.level}</td><td>{character.currHp}/{character.maxHp}</td><td>{character.status}</td>
      <td className="character-actions">
        {actions.map(([label, className, action]) => (
          <button key={label} type="button" disabled={disabled} onClick={action} aria-label={`${label}: ${character.name}`} className={`${className} btn btn-sm ${label === 'Delete' ? 'btn-danger' : 'btn-outline-dark'} m-1`}>{label}</button>
        ))}
      </td>
    </tr>
  )
}

export default function CharacterTable({ characters, loaded, ...actions }) {
  return (
    <section id="party-section" className="card p-3 p-md-4" aria-labelledby="party-heading">
      <h2 id="party-heading" className="h3">Party</h2>
      {loaded && characters.length === 0 && <p id="empty-party" className="alert alert-secondary mb-0">Your party is empty. Add your first character above.</p>}
      {characters.length > 0 && (
        <div className="table-responsive" role="region" aria-label="Party characters; scroll horizontally on small screens" tabIndex="0">
          <table id="character-table" className="table table-striped table-hover align-middle mb-0">
            <thead><tr>{['Name', 'Class', 'Species', 'Level', 'HP', 'Status', 'Actions'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody id="character-list">{characters.map((character) => <CharacterRow key={character.id} character={character} {...actions} />)}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
