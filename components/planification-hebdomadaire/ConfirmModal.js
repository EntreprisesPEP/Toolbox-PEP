export default function ConfirmModal({ open, message, okLabel = 'Supprimer', showCancel = true, onOk, onCancel }) {
  if (!open) return null;
  return (
    <div className="confirm-overlay">
      <div className="confirm-box">
        <p>{message}</p>
        <div className="confirm-actions">
          {showCancel && (
            <button className="btn ghost" onClick={onCancel}>Annuler</button>
          )}
          <button className="btn" onClick={onOk}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}
