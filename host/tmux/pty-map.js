/**
 * Delete a PTY slot only if the Map still holds the same session instance.
 * Prevents a stale onExit from wiping a replacement attach.
 *
 * @param {Map<number, object>} ptys
 * @param {number} slotId
 * @param {object} session
 * @returns {boolean} true if deleted
 */
export function deletePtyIfCurrent(ptys, slotId, session) {
  if (ptys.get(slotId) === session) {
    ptys.delete(slotId);
    return true;
  }
  return false;
}
