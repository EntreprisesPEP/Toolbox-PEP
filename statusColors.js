export const STATUS_OPTS = ['En cours', 'A venir', 'Date', 'Amenagement', 'Termine'];

export function statusColor(statut, theme) {
  if (statut === 'En cours') {
    return theme === 'jour'
      ? { bg: '#E3F4E8', border: '#8FCBA0', fg: '#1F7A3E' }
      : { bg: '#20492F', border: '#4FB975', fg: '#A8F0C4' };
  }
  if (statut === 'Date') {
    return theme === 'jour'
      ? { bg: '#FBF3D6', border: '#E4C765', fg: '#8A6D12' }
      : { bg: '#8A6B0C', border: '#FFCC00', fg: '#FFF6DB' };
  }
  return null; // A venir, Amenagement, Termine -> neutre
}

export function statusPillClass(statut) {
  if (statut === 'En cours') return 'st-encours';
  if (statut === 'Date') return 'st-date';
  if (statut === 'Termine') return 'st-termine';
  return 'st-neutre';
}

export function statusColorLight(statut) {
  if (statut === 'En cours') return { bg: '#E3F4E8', border: '#8FCBA0', fg: '#1F7A3E' };
  if (statut === 'Date') return { bg: '#FBF3D6', border: '#E4C765', fg: '#8A6D12' };
  return null;
}

export function dayCellPalette(theme) {
  if (theme === 'jour') {
    return {
      base: '#FFFFFF', weekend: '#E7E9EF', ink: '#1B2436', border: '#D7DBE3', weekendBorder: '#C9CEDA',
      headerBg: '#EEF0F4', headerInk: '#4A5164', headerWeekendBg: '#DEE3ED', headerWeekendInk: '#3A4256',
    };
  }
  return {
    base: '#1B2438', weekend: '#242F49', ink: '#EDEFF4', border: '#333C56', weekendBorder: '#3B4560',
    headerBg: '#202A42', headerInk: '#B7BFD1', headerWeekendBg: '#2A3652', headerWeekendInk: '#D2D9EA',
  };
}
