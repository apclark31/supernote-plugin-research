/**
 * Filesystem-style note label, shared by every screen that names a note.
 *
 * "/storage/emulated/0/Note/KEEN/1×1/Connor.note" -> "KEEN / 1×1 / Connor"
 *
 * The storage root and the Note/Document top-level are dropped (they carry
 * no information -- every note lives there), as is the .note extension.
 * Falls back to the bare filename when only a name is known (legacy
 * registry entries without notePath).
 */
export function noteLabel(notePath, noteFile) {
  if (notePath) {
    const rel = notePath
      .replace(/^\/storage\/emulated\/0\//, '')
      .replace(/^(Note|Document)\//, '')
      .replace(/\.note$/, '');
    return rel.split('/').filter(Boolean).join(' / ');
  }
  return (noteFile || 'Unknown').replace('.note', '');
}
