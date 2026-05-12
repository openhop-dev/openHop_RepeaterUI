<script setup lang="ts">
import { ref, nextTick, onUnmounted, Teleport } from 'vue';

// Global menu management to ensure only one menu is open at a time
interface MenuManager {
  activeMenu: { closeMenu: () => void } | null;
  setActiveMenu: (menu: { closeMenu: () => void } | null) => void;
}

const globalMenuManager: MenuManager = (
  window as unknown as { __neighborMenuManager?: MenuManager }
).__neighborMenuManager || {
  activeMenu: null,
  setActiveMenu: (menu: { closeMenu: () => void } | null) => {
    if (globalMenuManager.activeMenu && globalMenuManager.activeMenu !== menu) {
      try {
        globalMenuManager.activeMenu.closeMenu();
      } catch (error) {
        console.warn('Error closing previous menu:', error);
      }
    }
    globalMenuManager.activeMenu = menu;
  },
};

// Store global reference
(window as unknown as { __neighborMenuManager: MenuManager }).__neighborMenuManager =
  globalMenuManager;

interface Neighbor {
  id: number;
  timestamp?: number;
  pubkey?: string;
  node_name?: string | null;
  is_repeater?: boolean;
  route_type?: number | null;
  contact_type?: string;
  latitude?: number | null;
  longitude?: number | null;
  first_seen?: number;
  last_seen?: number;
  rssi?: number | null;
  snr?: number | null;
  advert_count?: number;
  is_new_neighbor?: boolean;
  short_name?: string;
  long_name?: string;
  node_num?: number;
  node_num_hex?: string;
  hw_model?: string;
}

interface Props {
  neighbor: Neighbor;
  canPing?: boolean;
}

interface Emits {
  (e: 'ping', neighbor: Neighbor): void;
  (e: 'delete', neighbor: Neighbor): void;
  (e: 'show-details', neighbor: Neighbor): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const showMenu = ref(false);
const buttonRef = ref<HTMLButtonElement>();
const menuRef = ref<HTMLDivElement>();
const menuPosition = ref({ top: 0, left: 0 });

// Menu control functions
const closeMenu = () => {
  showMenu.value = false;
  document.removeEventListener('click', handleGlobalClick, true);
  document.removeEventListener('keydown', handleEscapeKey);
  if (globalMenuManager.activeMenu === menuInstance) {
    globalMenuManager.activeMenu = null;
  }
};

// Create menu instance for global management
const menuInstance = { closeMenu };

const handlePing = () => {
  closeMenu();
  emit('ping', props.neighbor);
};

const handleShowDetails = () => {
  closeMenu();
  emit('show-details', props.neighbor);
};

const handleDelete = () => {
  closeMenu();
  emit('delete', props.neighbor);
};

// Improved click outside handling with capture phase
const handleGlobalClick = (event: MouseEvent) => {
  const target = event.target as Element;
  if (!target.closest('[data-menu-container]')) {
    closeMenu();
  }
};

// Handle escape key
const handleEscapeKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeMenu();
  }
};

// Toggle menu and position it
const toggleMenu = async () => {
  if (!showMenu.value && buttonRef.value) {
    // Close any other open menu first
    globalMenuManager.setActiveMenu(menuInstance);

    // Calculate position
    const rect = buttonRef.value.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const menuWidth = 144; // w-36 = 144px

    // Check if we're on mobile and if menu would overflow on the right
    const isMobile = viewportWidth < 1024; // lg breakpoint
    const wouldOverflow = rect.left + menuWidth > viewportWidth - 16; // 16px margin

    let leftPosition = rect.left;
    if (isMobile && wouldOverflow) {
      // Position menu to the left of the button on mobile
      leftPosition = rect.right - menuWidth;
    }

    // Ensure menu doesn't go off the left edge
    leftPosition = Math.max(8, leftPosition);

    menuPosition.value = {
      top: rect.bottom + 4,
      left: leftPosition,
    };

    showMenu.value = true;

    await nextTick();

    // Flip upward if the menu would overflow the bottom of the viewport
    if (menuRef.value) {
      const menuHeight = menuRef.value.offsetHeight;
      if (rect.bottom + 4 + menuHeight > window.innerHeight - 8) {
        menuPosition.value = {
          top: rect.top - menuHeight - 4,
          left: leftPosition,
        };
      }
    }

    // Add event listeners with capture for better handling
    document.addEventListener('click', handleGlobalClick, true);
    document.addEventListener('keydown', handleEscapeKey);
  } else {
    closeMenu();
  }
};

// Cleanup on unmount
onUnmounted(() => {
  closeMenu();
});
</script>

<template>
  <div class="relative" data-menu-container>
    <button
      ref="buttonRef"
      @click="toggleMenu"
      class="p-1 rounded hover:bg-stroke-subtle dark:hover:bg-white/10 transition-colors text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary/80"
      :class="{
        'bg-background-mute dark:bg-stroke/10 text-content-primary dark:text-content-primary/80':
          showMenu,
      }"
      data-menu-container
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
        />
      </svg>
    </button>

    <!-- Use Teleport to render menu in body without manual DOM manipulation -->
    <Teleport to="body">
      <div
        v-if="showMenu"
        ref="menuRef"
        class="fixed w-36 bg-white dark:bg-surface-elevated backdrop-blur-lg border border-stroke-subtle dark:border-white/20 rounded-[15px] shadow-2xl z-[450]"
        :style="{ top: menuPosition.top + 'px', left: menuPosition.left + 'px' }"
        data-menu-container
      >
        <div class="py-2">
          <button
            @click="handleShowDetails"
            class="flex items-center gap-3 w-full px-4 py-3 text-sm text-content-primary dark:text-content-primary hover:bg-primary/10 transition-colors border-b border-stroke-subtle dark:border-white/10"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span class="font-medium">Details</span>
          </button>

          <button
            @click="handlePing"
            class="flex items-center gap-3 w-full px-4 py-3 text-sm text-content-primary dark:text-content-primary hover:bg-primary/10 transition-colors border-b border-stroke-subtle dark:border-white/10"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
              />
            </svg>
            <span class="font-medium">Ping</span>
          </button>

          <button
            @click="handleDelete"
            class="flex items-center gap-3 w-full px-4 py-3 text-sm text-accent-red hover:bg-accent-red/10 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span class="font-medium">Delete</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
