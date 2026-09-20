import { create } from 'zustand';

export type Page = 'flashcard' | 'settings' | 'pricing';

interface NavigationState {
  currentPage: Page;
  flashcardReloadTrigger: number;
  lastLoadedDateKey: string | null;
  selectedPastDate: string | null;
  setCurrentPage: (page: Page) => void;
  setSelectedPastDate: (date: string | null) => void;
  setLastLoadedDateKey: (date: string | null) => void;
  triggerFlashcardReload: () => void;
  navigateToSettings: () => void;
  navigateToFlashcard: () => void;
  navigateToPricing: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentPage: 'flashcard',
  flashcardReloadTrigger: 0,
  lastLoadedDateKey: null,
  selectedPastDate: null,
  setCurrentPage: (page) => set({ currentPage: page }),
  setSelectedPastDate: (date) => set({ selectedPastDate: date }),
  setLastLoadedDateKey: (date) => set({ lastLoadedDateKey: date }),
  triggerFlashcardReload: () =>
    set((state) => ({ flashcardReloadTrigger: state.flashcardReloadTrigger + 1 })),
  navigateToSettings: () => set({ currentPage: 'settings' }),
  navigateToFlashcard: () => set({ currentPage: 'flashcard' }),
  navigateToPricing: () => set({ currentPage: 'pricing' }),
}));
