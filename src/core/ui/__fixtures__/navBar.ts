import type { NavBarItem } from '../NavBar';

// Synthetic phone navigation items for the development gallery.
export const navBarFixture: { items: NavBarItem[]; longItems: NavBarItem[] } = {
  items: [
    { id: 'home', label: 'Inicio', icon: 'home' },
    { id: 'swimmers', label: 'Nadadores', icon: 'group' },
    { id: 'times', label: 'Tiempos', icon: 'timer' },
    { id: 'account', label: 'Cuenta', icon: 'person' },
  ],
  longItems: [
    { id: 'home', label: 'Inicio de la semana', icon: 'home' },
    { id: 'swimmers', label: 'Nadadores de mi grupo', icon: 'group' },
    { id: 'times', label: 'Tiempos registrados', icon: 'timer' },
    { id: 'account', label: 'Cuenta y autorizaciones', icon: 'person' },
  ],
};
