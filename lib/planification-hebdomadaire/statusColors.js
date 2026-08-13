export const STATUS_OPTS = ['En cours', 'A venir', 'Date', 'Amenagement', 'Termine'];

export function statusColor(statut, theme) {
  return null; // Couleurs vertes/jaunes retirees: tous les statuts utilisent le style neutre
}

export function statusPillClass(statut) {
  if (statut === 'Termine') return 'st-termine';
  return 'st-neutre';
}

export function statusColorLight(statut) {
  return null; // Couleurs vertes/jaunes retirees: tous les statuts utilisent le style neutre
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
