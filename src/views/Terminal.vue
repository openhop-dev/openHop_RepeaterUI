<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { CommandRegistry } from '@/commands';
import { getNeighborNames } from '@/commands/PingCommand';
import { useTheme } from '@/composables/useTheme';

// Theme configuration
const { theme: currentTheme } = useTheme();

const darkTheme: ITheme = {
  background: '#1A1E1F',
  foreground: '#e0e0e0',
  cursor: '#00d9ff',
  cursorAccent: '#000000',
  selectionBackground: '#00d9ff40',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#ff6b6b',
  green: '#51cf66',
  yellow: '#ffd93d',
  blue: '#00d9ff',
  magenta: '#e599f7',
  cyan: '#00d9ff',
  white: '#e0e0e0',
  brightBlack: '#6c757d',
  brightRed: '#ff8787',
  brightGreen: '#69db7c',
  brightYellow: '#ffe066',
  brightBlue: '#74c0fc',
  brightMagenta: '#f3a6ff',
  brightCyan: '#3bc9db',
  brightWhite: '#ffffff',
};

const lightTheme: ITheme = {
  background: '#F3F4F6',
  foreground: '#1f2937',
  cursor: '#0D7377',
  cursorAccent: '#ffffff',
  selectionBackground: '#0D737740',
  selectionForeground: '#000000',
  black: '#1f2937',
  red: '#dc2626',
  green: '#15803d',
  yellow: '#a16207',
  blue: '#0D7377',
  magenta: '#7c3aed',
  cyan: '#0e7490',
  white: '#f3f4f6',
  brightBlack: '#6b7280',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#0891b2',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
};

defineOptions({ name: 'TerminalView' });

// State
const terminalRef = ref<HTMLDivElement | null>(null);
const mobileInputRef = ref<HTMLInputElement | null>(null);
const terminalContainerRef = ref<HTMLDivElement | null>(null);
const searchQuery = ref('');
const showSearch = ref(false);
const isLoading = ref(false);
const isMobileDevice = ref(false);
const isFullScreen = ref(false);
const isFullWindow = ref(false);
const keyboardHeight = ref(0);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let searchAddon: SearchAddon | null = null;
let webglAddon: WebglAddon | null = null;
let currentLine = '';
const commandHistory: string[] = [];
let historyIndex = -1;
let suggestionText = '';

// Command registry
const commandRegistry = new CommandRegistry();
const commandNames = commandRegistry.getCommandNames();

// Cache for neighbor names (refreshed on tab)
let neighborNamesCache: string[] = [];
let neighborNamesCacheTime = 0;

// Parameter suggestions for commands that take arguments
const PARAM_SUGGESTIONS: Record<string, string[]> = {
  get: [
    'name',
    'role',
    'lat',
    'lon',
    'freq',
    'tx',
    'bw',
    'sf',
    'cr',
    'radio',
    'txdelay',
    'direct.txdelay',
    'rxdelay',
    'af',
    'mode',
    'repeat',
    'flood.max',
    'advert.interval',
    'duty',
    'duty.max',
    'public.key',
  ],
  set: [
    'tx',
    'freq',
    'bw',
    'sf',
    'cr',
    'txdelay',
    'direct.txdelay',
    'rxdelay',
    'name',
    'lat',
    'lon',
    'mode',
    'duty',
    'flood.max',
    'advert.interval',
    'flood.advert.interval',
  ],
  ping: [], // Will be populated dynamically
};

// Value suggestions for parameters
const PARAM_VALUE_SUGGESTIONS: Record<string, Record<string, string[]>> = {
  set: {
    mode: ['forward', 'monitor'],
    duty: ['on', 'off'],
  },
};

// Parameter descriptions for enhanced display
const PARAM_DESCRIPTIONS: Record<string, Record<string, string>> = {
  get: {
    name: 'Node name',
    role: 'Node role',
    lat: 'Latitude',
    lon: 'Longitude',
    freq: 'Frequency (MHz)',
    tx: 'TX power (dBm)',
    bw: 'Bandwidth (kHz)',
    sf: 'Spreading factor',
    cr: 'Coding rate',
    radio: 'All radio settings',
    txdelay: 'TX delay factor',
    'direct.txdelay': 'Direct TX delay',
    rxdelay: 'RX delay base',
    af: 'Airtime factor',
    mode: 'Repeater mode',
    repeat: 'Repeat on/off',
    'flood.max': 'Max flood hops',
    'advert.interval': 'Advert interval',
    duty: 'Duty cycle enabled',
    'duty.max': 'Max airtime %',
    'public.key': 'Public key',
  },
  set: {
    tx: 'TX power (2-30 dBm)',
    freq: 'Frequency (100-1000 MHz) *restart required*',
    bw: 'Bandwidth (7.8-500 kHz) *restart required*',
    sf: 'Spreading factor (5-12) *restart required*',
    cr: 'Coding rate (5-8) *restart required*',
    txdelay: 'TX delay factor (0.0-5.0)',
    'direct.txdelay': 'Direct TX delay (0.0-5.0)',
    rxdelay: 'RX delay base (>= 0)',
    name: 'Node name',
    lat: 'Latitude (-90 to 90)',
    lon: 'Longitude (-180 to 180)',
    mode: 'Repeater mode (forward/monitor/no_tx)',
    duty: 'Duty cycle (on/off)',
    'flood.max': 'Max flood hops (0-64)',
    'advert.interval': 'Advert interval (0 or 1-10080 mins)',
    'flood.advert.interval': 'Flood advert (0 or 3-48 hrs)',
  },
  ping: {
    // Descriptions will be shown for static suggestions if any added
  },
};

// Initialize terminal
onMounted(() => {
  if (!terminalRef.value) return;

  // Detect mobile device
  isMobileDevice.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

  // Create terminal instance with enhanced settings
  const isMobile = window.innerWidth < 768;
  term = new Terminal({
    cursorBlink: false, // Solid cursor (no blink)
    cursorStyle: 'underline', // Sleek underline cursor
    cursorWidth: 3, // Thicker cursor for visibility
    fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
    fontSize: isMobile ? 11 : 13,
    fontWeight: '400',
    fontWeightBold: '700',
    lineHeight: 1.3,
    letterSpacing: 0.5,
    smoothScrollDuration: 50, // Fast smooth scrolling
    scrollSensitivity: 3,
    fastScrollSensitivity: 5,
    allowProposedApi: true,
    screenReaderMode: isMobileDevice.value, // Enable for mobile keyboard support
    theme: currentTheme.value === 'dark' ? darkTheme : lightTheme,
    scrollback: isMobileDevice.value ? 500 : 10000,
    tabStopWidth: 4,
    macOptionIsMeta: true,
  });

  // Load addons
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  // WebGL renderer for better performance
  try {
    webglAddon = new WebglAddon();
    term.loadAddon(webglAddon);
  } catch {
    console.warn('WebGL addon failed to load, falling back to canvas renderer');
    webglAddon = null;
  }

  // Make URLs clickable
  const webLinksAddon = new WebLinksAddon((event, uri) => {
    window.open(uri, '_blank');
  });
  term.loadAddon(webLinksAddon);

  // Unicode support
  const unicode11Addon = new Unicode11Addon();
  term.loadAddon(unicode11Addon);
  term.unicode.activeVersion = '11';

  // Search addon
  searchAddon = new SearchAddon();
  term.loadAddon(searchAddon);

  // Open terminal
  term.open(terminalRef.value);
  fitAddon.fit();

  // Handle focus
  term.focus();

  // Mobile keyboard support
  if (isMobileDevice.value && mobileInputRef.value) {
    const input = mobileInputRef.value;

    // Just focus - browser will handle scrolling naturally
    const handleTap = () => {
      input.focus({ preventScroll: false });
    };

    terminalRef.value?.addEventListener('click', handleTap);
    terminalRef.value?.addEventListener('touchstart', handleTap);

    // Keep terminal scrolled to bottom when typing
    input.addEventListener('input', () => {
      setTimeout(() => {
        term?.scrollToBottom();
      }, 10);
    });

    // Cleanup
    onUnmounted(() => {
      terminalRef.value?.removeEventListener('click', handleTap);
      terminalRef.value?.removeEventListener('touchstart', handleTap);
    });
  }

  // Welcome message with styling - adapt colors to theme
  const logoColor = currentTheme.value === 'dark' ? '\x1b[1;37m' : '\x1b[1;90m'; // White in dark, dark grey in light
  const titleColor = currentTheme.value === 'dark' ? '\x1b[1;36m' : '\x1b[1;36m'; // Cyan in both
  const hintColor = currentTheme.value === 'dark' ? '\x1b[90m' : '\x1b[90m'; // Grey in both
  const cmdColor = '\x1b[36m'; // Cyan for command
  const reset = '\x1b[0m';

  term.writeln('');
  term.writeln(`${logoColor}    ██████  ██    ██ ███    ███  ██████${reset}`);
  term.writeln(`${logoColor}    ██   ██  ██  ██  ████  ████ ██    ${reset}`);
  term.writeln(`${logoColor}    ██████    ████   ██ ████ ██ ██    ${reset}`);
  term.writeln(`${logoColor}    ██         ██    ██  ██  ██ ██    ${reset}`);
  term.writeln(`${logoColor}    ██         ██    ██      ██  ██████${reset}`);
  term.writeln('');
  term.writeln(`${titleColor}    Repeater Terminal${reset}`);
  term.writeln('');
  term.writeln(`${hintColor}    Type ${cmdColor}help${hintColor} for available commands${reset}`);
  term.writeln('');
  writePrompt();

  // Handle input
  term.onData((data) => {
    handleInput(data);
  });

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit();
  });
  resizeObserver.observe(terminalRef.value);

  // Cleanup
  onUnmounted(() => {
    resizeObserver.disconnect();
    // Dispose WebGL context explicitly before terminal disposal —
    // term.dispose() cascades to addons but the chain can silently fail on iOS Safari,
    // leaving the context registered against the browser's hard limit.
    webglAddon?.dispose();
    webglAddon = null;
    term?.dispose();
    term = null;
  });
});

// Write prompt with optional suggestion
const writePrompt = () => {
  term?.write('\r\n\x1b[1;36m❯\x1b[0m ');
};

// Show inline suggestion
const showSuggestion = (suggestion: string) => {
  if (!term || !suggestion) return;
  // Save cursor position and show gray suggestion
  term.write(`\x1b[90m${suggestion}\x1b[0m`);
  // Move cursor back
  for (let i = 0; i < suggestion.length; i++) {
    term.write('\b');
  }
};

// Clear suggestion
const clearSuggestion = () => {
  if (!term || !suggestionText) return;
  for (let i = 0; i < suggestionText.length; i++) {
    term.write(' ');
  }
  for (let i = 0; i < suggestionText.length; i++) {
    term.write('\b');
  }
  suggestionText = '';
};

// Handle keyboard input
const handleInput = (data: string) => {
  if (!term) return;

  const code = data.charCodeAt(0);

  // Enter key
  if (code === 13) {
    clearSuggestion();
    term.write('\r\n');
    if (currentLine.trim()) {
      executeCommand(currentLine.trim());
      commandHistory.push(currentLine.trim());
      historyIndex = commandHistory.length;
    } else {
      writePrompt();
    }
    currentLine = '';
    return;
  }

  // Backspace
  if (code === 127) {
    if (currentLine.length > 0) {
      clearSuggestion();
      currentLine = currentLine.slice(0, -1);
      term.write('\b \b');
      updateSuggestion();
    }
    return;
  }

  // Ctrl+C
  if (code === 3) {
    clearSuggestion();
    term.write('^C\r\n');
    currentLine = '';
    writePrompt();
    return;
  }

  // Ctrl+L (clear)
  if (code === 12) {
    term.clear();
    currentLine = '';
    writePrompt();
    return;
  }

  // Ctrl+F (search)
  if (code === 6) {
    showSearch.value = !showSearch.value;
    return;
  }

  // Arrow Up (history)
  if (data === '\x1b[A') {
    if (commandHistory.length > 0 && historyIndex > 0) {
      clearSuggestion();
      historyIndex--;
      // Clear current line
      term.write('\r\x1b[K');
      writePrompt();
      currentLine = commandHistory[historyIndex];
      term.write(currentLine);
    }
    return;
  }

  // Arrow Down (history)
  if (data === '\x1b[B') {
    clearSuggestion();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      term.write('\r\x1b[K');
      writePrompt();
      currentLine = commandHistory[historyIndex];
      term.write(currentLine);
    } else if (historyIndex === commandHistory.length - 1) {
      historyIndex = commandHistory.length;
      term.write('\r\x1b[K');
      writePrompt();
      currentLine = '';
    }
    return;
  }

  // Arrow Right (accept suggestion)
  if (data === '\x1b[C' && suggestionText && !isMobileDevice.value) {
    clearSuggestion();
    const completion = suggestionText;
    currentLine += completion;
    term.write(completion);
    suggestionText = '';
    return;
  }

  // Tab (autocomplete)
  if (code === 9) {
    clearSuggestion();
    const inputLower = currentLine.toLowerCase();
    const parts = currentLine.split(/\s+/);
    const firstWord = parts[0]?.toLowerCase();

    // Check if we're completing values for a parameter (e.g., "set mode <tab>")
    if (parts.length > 2 && PARAM_VALUE_SUGGESTIONS[firstWord]) {
      const param = parts[1]?.toLowerCase();
      const valueStart = parts.slice(2).join(' ').toLowerCase();
      const valueSuggestions = PARAM_VALUE_SUGGESTIONS[firstWord][param];

      if (valueSuggestions) {
        const matches = valueSuggestions.filter((v) => v.toLowerCase().startsWith(valueStart));

        if (matches.length === 1) {
          // Complete the value
          const currentValue = parts.slice(2).join(' ');
          const completion = matches[0].slice(currentValue.length);
          currentLine += completion;
          term.write(completion);
        } else if (matches.length > 1) {
          // Show available values
          term.write('\r\n\r\n\x1b[33mAvailable values:\x1b[0m\r\n\r\n');
          matches.forEach((value) => {
            term!.writeln(`  \x1b[36m${value}\x1b[0m`);
          });
          writePrompt();
          term.write(currentLine);
        }
        return;
      }
    }

    // Check if we're completing parameters for a command
    if (parts.length > 1 && PARAM_SUGGESTIONS[firstWord]) {
      // Special handling for ping command - fetch neighbor names dynamically
      if (firstWord === 'ping') {
        const paramStart = parts.slice(1).join(' ').toLowerCase();

        // Refresh cache if older than 30 seconds
        const now = Date.now();
        if (now - neighborNamesCacheTime > 30000) {
          // Fetch neighbor names in background
          getNeighborNames().then((names) => {
            neighborNamesCache = names;
            neighborNamesCacheTime = now;
            PARAM_SUGGESTIONS['ping'] = names;
          });
        }

        const matches = neighborNamesCache.filter((n) => n.toLowerCase().startsWith(paramStart));

        if (matches.length === 1) {
          // Complete the neighbor name
          const currentParam = parts.slice(1).join(' ');
          const completion = matches[0].slice(currentParam.length) + ' ';
          currentLine += completion;
          term.write(completion);
        } else if (matches.length > 1) {
          // Show available neighbors
          term.write('\r\n\r\n\x1b[33mAvailable neighbors:\x1b[0m\r\n\r\n');
          matches.forEach((name) => {
            term!.writeln(`  \x1b[36m${name}\x1b[0m`);
          });
          writePrompt();
          term.write(currentLine);
        } else if (neighborNamesCache.length === 0 && paramStart === '') {
          // First tab with no cache - fetch neighbors
          term.write('\r\n\r\n\x1b[33mFetching neighbors...\x1b[0m\r\n');
          getNeighborNames()
            .then((names) => {
              neighborNamesCache = names;
              neighborNamesCacheTime = now;
              PARAM_SUGGESTIONS['ping'] = names;
              term!.write('\r\n\x1b[33mAvailable neighbors:\x1b[0m\r\n\r\n');
              names.forEach((name) => {
                term!.writeln(`  \x1b[36m${name}\x1b[0m`);
              });
              writePrompt();
              term!.write(currentLine);
            })
            .catch(() => {
              term!.write('\r\n\x1b[31mFailed to fetch neighbors\x1b[0m\r\n');
              writePrompt();
              term!.write(currentLine);
            });
        }
        return;
      }

      // Standard parameter completion for other commands
      const paramStart = parts.slice(1).join(' ').toLowerCase();
      const matches = PARAM_SUGGESTIONS[firstWord].filter((p) =>
        p.toLowerCase().startsWith(paramStart),
      );

      if (matches.length === 1) {
        // Complete the parameter
        const currentParam = parts.slice(1).join(' ');
        const completion = matches[0].slice(currentParam.length) + ' ';
        currentLine += completion;
        term.write(completion);
      } else if (matches.length > 1) {
        // Show available parameters with descriptions
        term.write('\r\n\r\n\x1b[33mAvailable parameters:\x1b[0m\r\n\r\n');
        const descriptions = PARAM_DESCRIPTIONS[firstWord] || {};
        matches.forEach((param) => {
          const desc = descriptions[param] || '';
          const paddedParam = param.padEnd(20);
          term!.writeln(`  \x1b[36m${paddedParam}\x1b[0m\x1b[90m${desc}\x1b[0m`);
        });
        writePrompt();
        term.write(currentLine);
      }
      return;
    }

    // Otherwise complete command names
    const allCommands = commandRegistry.getAllCommands();
    const matches = allCommands.filter((cmd) => {
      if (cmd.name.toLowerCase().startsWith(inputLower)) return true;
      if (cmd.aliases?.some((alias) => alias.toLowerCase().startsWith(inputLower))) return true;
      return false;
    });

    if (matches.length === 1) {
      const completion = matches[0].name.slice(currentLine.length) + ' ';
      currentLine += completion;
      term.write(completion);
    } else if (matches.length > 1) {
      term.write('\r\n\r\n\x1b[33mAvailable commands:\x1b[0m\r\n\r\n');
      matches.forEach((cmd) => {
        const aliasList =
          cmd.aliases && cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
        term!.writeln(`  \x1b[36m${cmd.name.padEnd(15)}\x1b[0m ${cmd.description}${aliasList}`);
      });
      writePrompt();
      term.write(currentLine);
    }
    return;
  }

  // Regular character
  if (code >= 32 && code < 127) {
    clearSuggestion();
    currentLine += data;
    term.write(data);
    // Disable suggestions on mobile for better performance
    if (!isMobileDevice.value) {
      updateSuggestion();
    }
  }
};

// Update inline suggestion
const updateSuggestion = () => {
  if (currentLine.length === 0) {
    suggestionText = '';
    return;
  }

  const matches = commandNames.filter((name) => name.startsWith(currentLine.toLowerCase()));
  if (matches.length === 1 && matches[0] !== currentLine) {
    suggestionText = matches[0].slice(currentLine.length);
    showSuggestion(suggestionText);
  } else {
    suggestionText = '';
  }
};

// Execute command
const executeCommand = async (input: string) => {
  if (!term) return;

  const trimmedInput = input.trim();
  const [cmdName, ...args] = trimmedInput.split(/\s+/);
  const command = commandRegistry.findCommand(cmdName);

  if (command) {
    try {
      await command.execute({
        term,
        args,
        writePrompt,
      });
    } catch (err) {
      console.error('Command execution error:', err);
      term.writeln(
        `\x1b[1;31m✗ Error:\x1b[0m ${err instanceof Error ? err.message : 'Command failed'}`,
      );
      writePrompt();
    }
  } else {
    term.writeln(`\x1b[1;31m✗ Unknown command:\x1b[0m ${cmdName}`);
    term.writeln('\x1b[90mType \x1b[36mhelp\x1b[90m for available commands\x1b[0m');
    writePrompt();
  }
};

// Search functionality
const handleClear = () => {
  if (term) {
    term.clear();
    writePrompt();
  }
};

const performSearch = () => {
  if (!searchAddon || !searchQuery.value) return;
  searchAddon.findNext(searchQuery.value, { caseSensitive: false });
};

const searchPrev = () => {
  if (!searchAddon || !searchQuery.value) return;
  searchAddon.findPrevious(searchQuery.value, { caseSensitive: false });
};

const closeSearch = () => {
  showSearch.value = false;
  searchQuery.value = '';
  term?.focus();
};

// Fullscreen handlers
const toggleFullScreen = async () => {
  if (!terminalContainerRef.value) return;

  if (!isFullScreen.value) {
    // Enter fullscreen
    try {
      if (terminalContainerRef.value.requestFullscreen) {
        await terminalContainerRef.value.requestFullscreen();
      }
      isFullScreen.value = true;
      // Focus appropriate element after entering fullscreen
      setTimeout(() => {
        if (isMobileDevice.value && mobileInputRef.value) {
          mobileInputRef.value.focus();
        } else if (term) {
          term.focus();
        }
      }, 100);
    } catch (err) {
      console.error('Failed to enter fullscreen:', err);
    }
  } else {
    // Exit fullscreen
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
      isFullScreen.value = false;
    } catch (err) {
      console.error('Failed to exit fullscreen:', err);
    }
  }

  // Re-fit terminal after fullscreen change
  setTimeout(() => {
    fitAddon?.fit();
  }, 100);
};

const toggleFullWindow = () => {
  isFullWindow.value = !isFullWindow.value;

  if (isFullWindow.value && isMobileDevice.value) {
    // On mobile, scroll to hide address bar
    setTimeout(() => {
      window.scrollTo(0, 1);
    }, 100);
  }

  // Focus terminal after changing mode
  setTimeout(() => {
    if (isMobileDevice.value && mobileInputRef.value) {
      mobileInputRef.value.focus();
    } else {
      term?.focus();
    }
    fitAddon?.fit();
  }, 150);
};

const exitFullWindow = () => {
  isFullWindow.value = false;
  setTimeout(() => {
    fitAddon?.fit();
  }, 100);
};

// Watch for theme changes and update terminal
watch(currentTheme, (newTheme) => {
  if (term) {
    term.options.theme = newTheme === 'dark' ? darkTheme : lightTheme;
  }
});

// Listen for fullscreen changes (user pressing ESC)
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    isFullScreen.value = !!document.fullscreenElement;
    setTimeout(() => fitAddon?.fit(), 100);
  });

  // ESC key to exit full window mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullWindow.value && !isFullScreen.value) {
      exitFullWindow();
    }
  });

  // ESC key to exit full window mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullWindow.value && !isFullScreen.value) {
      exitFullWindow();
    }
  });
}

// Mobile keyboard handlers
const focusMobileInput = () => {
  if (isMobileDevice.value && mobileInputRef.value) {
    mobileInputRef.value.focus();
  }
};

const handleMobileInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const value = target.value;

  if (value && term) {
    // Get the last character typed
    const lastChar = value.slice(-1);
    handleInput(lastChar);
  }

  // Clear the input to capture next character
  target.value = '';
};

const handleMobileEnter = () => {
  if (term) {
    handleInput('\r');
  }
  if (mobileInputRef.value) {
    mobileInputRef.value.value = '';
  }
};

const handleMobileBackspace = () => {
  if (term) {
    handleInput('\x7F'); // Backspace character
  }
  if (mobileInputRef.value) {
    mobileInputRef.value.value = '';
  }
};
</script>

<template>
  <div class="space-y-4 md:space-y-6">
    <!-- Header -->
    <div
      class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-3 md:p-4"
    >
      <div class="flex items-center justify-between">
        <div>
          <h1
            class="text-content-primary dark:text-content-primary text-lg md:text-xl font-semibold"
          >
            Terminal
          </h1>
          <p class="text-content-secondary dark:text-content-muted text-sm hidden md:block">
            Interactive command-line interface
          </p>
        </div>
        <div class="flex items-center gap-2 md:gap-3">
          <!-- Mobile: Use full window mode (better compatibility than native fullscreen) -->
          <button
            v-if="isMobileDevice"
            @click="toggleFullWindow"
            class="flex items-center gap-2 px-3 py-2 bg-accent-purple/20 hover:bg-accent-purple/30 text-accent-purple border border-accent-purple/50 rounded-lg transition-colors"
            :title="isFullWindow ? 'Exit fullscreen' : 'Enter fullscreen'"
          >
            <svg
              v-if="!isFullWindow"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              ></path>
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
            <span class="hidden sm:inline">{{ isFullWindow ? 'Exit' : 'Fullscreen' }}</span>
          </button>

          <!-- Desktop: Full Window button -->
          <button
            v-if="!isMobileDevice"
            @click="toggleFullWindow"
            class="flex items-center gap-2 px-3 py-2 md:px-4 bg-accent-purple/20 hover:bg-accent-purple/30 text-accent-purple border border-accent-purple/50 rounded-lg transition-colors"
            :title="isFullWindow ? 'Exit full window' : 'Full window'"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
              ></path>
            </svg>
            <span class="hidden sm:inline">{{ isFullWindow ? 'Exit Window' : 'Full Window' }}</span>
          </button>

          <!-- Desktop: Fullscreen button -->
          <button
            v-if="!isMobileDevice"
            @click="toggleFullScreen"
            class="flex items-center gap-2 px-3 py-2 md:px-4 bg-accent-purple/20 hover:bg-accent-purple/30 text-accent-purple border border-accent-purple/50 rounded-lg transition-colors"
            :title="isFullScreen ? 'Exit fullscreen' : 'Fullscreen'"
          >
            <svg
              v-if="!isFullScreen"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              ></path>
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
            <span class="hidden sm:inline">{{ isFullScreen ? 'Exit Full' : 'Fullscreen' }}</span>
          </button>
          <button
            @click="showSearch = !showSearch"
            class="flex items-center gap-2 px-3 py-2 md:px-4 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 rounded-lg transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              ></path>
            </svg>
            <span class="hidden sm:inline">Search</span>
          </button>
          <!-- <button
            @click="handleClear"
            class="btn-danger flex items-center gap-2"
          >
            Clear
          </button> -->
        </div>
      </div>
    </div>

    <!-- Search Bar -->
    <div
      v-if="showSearch"
      class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-4"
    >
      <div class="flex items-center gap-3">
        <input
          v-model="searchQuery"
          @keydown.enter="performSearch"
          @keydown.esc="closeSearch"
          type="text"
          placeholder="Search terminal output..."
          class="flex-1 px-4 py-2 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 outline-none focus:border-primary/50 transition-colors"
        />
        <button
          @click="searchPrev"
          class="px-3 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary transition-colors"
          title="Previous (Shift+Enter)"
        >
          ↑
        </button>
        <button
          @click="performSearch"
          class="px-3 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/50 rounded-lg text-primary transition-colors"
          title="Next (Enter)"
        >
          ↓
        </button>
        <button
          @click="closeSearch"
          class="px-3 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary transition-colors"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Terminal Window -->
    <div
      ref="terminalContainerRef"
      class="bg-surface dark:bg-surface-elevated/80 backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] overflow-hidden relative"
      :class="{ 'fullscreen-terminal': isFullScreen, 'full-window-terminal': isFullWindow }"
    >
      <!-- Exit full window button -->
      <button
        v-if="isFullWindow && !isFullScreen"
        @click="exitFullWindow"
        class="absolute top-4 right-4 z-50 p-2 bg-black/80 backdrop-blur-sm hover:bg-black/90 text-white border border-white/20 rounded-lg transition-colors"
        title="Exit full window (ESC)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          ></path>
        </svg>
      </button>
      <div
        ref="terminalRef"
        class="terminal-container"
        :class="{ 'fullscreen-content': isFullScreen }"
        @click="focusMobileInput"
        @touchstart="focusMobileInput"
      >
        <!-- Hidden input for mobile keyboard - inside terminal for better scroll behavior -->
        <input
          v-if="isMobileDevice"
          ref="mobileInputRef"
          type="text"
          class="mobile-keyboard-input"
          @input="handleMobileInput"
          @keydown.enter.prevent="handleMobileEnter"
          @keydown.delete="handleMobileBackspace"
          inputmode="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </div>

      <!-- Loading indicator -->
      <div
        v-if="isLoading"
        class="absolute top-4 right-4 bg-black/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-primary/30 flex items-center gap-2"
      >
        <div class="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
        <span class="text-primary text-sm font-medium">Processing...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-container {
  height: calc(100vh - 220px);
  min-height: 400px;
  /* iOS Safari fix */
  min-height: calc(100dvh - 220px);
  background-color: var(--color-surface);
}

/* Mobile responsive adjustments */
@media (max-width: 768px) {
  .terminal-container {
    height: calc(100vh - 140px);
    min-height: 300px;
    /* iOS Safari fix */
    min-height: calc(100dvh - 140px);
  }
}

@media (max-width: 640px) {
  .terminal-container {
    height: calc(100vh - 120px);
    min-height: 250px;
    /* iOS Safari fix */
    min-height: calc(100dvh - 120px);
  }
}

:deep(.xterm) {
  padding: 1.5rem;
  height: 100% !important;
}

/* Mobile padding adjustments */
@media (max-width: 768px) {
  :deep(.xterm) {
    padding: 1rem;
  }
}

@media (max-width: 640px) {
  :deep(.xterm) {
    padding: 0.75rem;
  }
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
}

:deep(.xterm-screen) {
  background-color: transparent !important;
}

:deep(.xterm-selection) {
  background-color: rgba(0, 217, 255, 0.3) !important;
}

kbd {
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Hidden input for mobile keyboard */
.mobile-keyboard-input {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 1px;
  opacity: 0.01; /* Tiny visibility helps iOS focus */
  border: none;
  padding: 0;
  margin: 0;
  pointer-events: none;
  z-index: 9999;
}

/* Fullscreen styles */
.fullscreen-terminal {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  margin: 0 !important;
  border-radius: 0 !important;
  z-index: 9999 !important;
  background-color: var(--color-surface) !important;
}

.fullscreen-content {
  height: 100% !important;
  min-height: 100% !important;
}

/* Adjust padding in fullscreen */
.fullscreen-terminal :deep(.xterm) {
  padding: 2rem;
}

@media (max-width: 768px) {
  .fullscreen-terminal :deep(.xterm) {
    padding: 1rem;
  }
}

/* Full window mode - expands within browser window */
.full-window-terminal {
  position: fixed !important;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important; /* Dynamic viewport height for mobile */
  max-width: 100vw !important;
  max-height: 100vh !important;
  max-height: 100dvh !important;
  z-index: 9998;
  border-radius: 0 !important;
  margin: 0 !important;
  overflow: hidden;
  background-color: var(--color-surface) !important;
}

.full-window-terminal .terminal-container {
  height: 100vh !important;
  height: 100dvh !important;
  width: 100vw !important;
  overflow: auto;
}

.full-window-terminal :deep(.xterm) {
  padding: 1rem;
  height: 100% !important;
}

/* Mobile specific full window adjustments */
@media (max-width: 768px) {
  .full-window-terminal {
    /* Use JS calculated height on mobile for better browser support */
    touch-action: none;
  }

  .full-window-terminal .terminal-container {
    overscroll-behavior: none;
  }

  .full-window-terminal :deep(.xterm) {
    padding: 0.75rem;
  }
}
</style>
