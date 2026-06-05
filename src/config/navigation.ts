export type NavItemConfig = {
  id: string
  label: string
  icon?: string
  /** Navigate to this route when clicked (leaf nodes only). */
  route?: string
  /** Query params merged into the route on navigation. */
  params?: Record<string, string>
  /**
   * Routes (exact or prefix) that cause this item — and its ancestors — to
   * show as active. Defaults to `[route]` when `route` is set.
   */
  activeOn?: string[]
  /** Child items. Presence makes this a collapsible group, not a link. */
  children?: NavItemConfig[]
  /**
   * Named action to invoke instead of navigating. The handler is registered
   * via provide/inject in the sidebar — the config stays decoupled from stores.
   */
  action?: string
  /**
   * Named capability that must be truthy for this item to appear.
   * Must be a key in knownCapabilities — enforced by the type and the test suite.
   */
  enabledWhen?: Capability
}

/**
 * Every optional device feature that nav items can gate on.
 * Adding a new `enabledWhen` value here is the only place you need to change
 * (plus registering it in Sidebar.vue's `capabilities` computed).
 */
export const knownCapabilities = ['gps', 'sensors'] as const
export type Capability = typeof knownCapabilities[number]

export const navigationItems: NavItemConfig[] = [
  { id: 'dashboard',    label: 'Dashboard',    route: '/' },
  { id: 'send-advert',  label: 'Send Advert',  action: 'sendAdvert' },
  {
    id: 'monitoring',
    label: 'Monitoring',
    children: [
      { id: 'neighbors', label: 'Neighbors', icon: 'neighbors', route: '/neighbors' },
      { id: 'sessions',  label: 'Sessions',  icon: 'sessions',  route: '/sessions' },
      { id: 'gps',     label: 'GPS',     icon: 'gps',     route: '/gps',     enabledWhen: 'gps' },
      { id: 'sensors', label: 'Sensors', icon: 'sensors', route: '/sensors', enabledWhen: 'sensors' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    children: [
      { id: 'statistics', label: 'Statistics', icon: 'statistics', route: '/statistics' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    children: [
      { id: 'system-stats', label: 'System Stats', icon: 'system-stats', route: '/system-stats' },
      {
        id: 'configuration',
        label: 'Configuration',
        icon: 'configuration',
        activeOn: ['/configuration', '/cad-calibration'],
        children: [
          {
            id: 'config-radio',
            label: 'Radio',
            activeOn: ['/configuration'],
            children: [
              { id: 'config-radio-settings',  label: 'Radio Settings',      route: '/configuration', params: { tab: 'radio' },          activeOn: ['/configuration'] },
              { id: 'config-radio-hardware',  label: 'Radio Hardware',      route: '/configuration', params: { tab: 'radio-hardware' }, activeOn: ['/configuration'] },
              { id: 'config-repeater',        label: 'Repeater Settings',   route: '/configuration', params: { tab: 'repeater' },       activeOn: ['/configuration'] },
              { id: 'config-duty',            label: 'Duty Cycle',          route: '/configuration', params: { tab: 'duty' },           activeOn: ['/configuration'] },
              { id: 'config-delays',          label: 'TX Delays',           route: '/configuration', params: { tab: 'delays' },         activeOn: ['/configuration'] },
            ],
          },
          {
            id: 'config-access',
            label: 'Access',
            activeOn: ['/configuration'],
            children: [
              { id: 'config-advert',        label: 'Advert Limits',        route: '/configuration', params: { tab: 'advert' },        activeOn: ['/configuration'] },
              { id: 'config-transport',     label: 'Region Configuration', route: '/configuration', params: { tab: 'transport' },     activeOn: ['/configuration'] },
              { id: 'config-api-tokens',    label: 'API Tokens',           route: '/configuration', params: { tab: 'api-tokens' },    activeOn: ['/configuration'] },
              { id: 'config-web',           label: 'Web Options',          route: '/configuration', params: { tab: 'web' },           activeOn: ['/configuration'] },
              { id: 'config-observer',      label: 'Observer',             route: '/configuration', params: { tab: 'observer' },      activeOn: ['/configuration'] },
              { id: 'config-policy-engine', label: 'Policies',             route: '/configuration', params: { tab: 'policy-engine' }, activeOn: ['/configuration'] },
            ],
          },
          {
            id: 'config-maintenance',
            label: 'Maintenance',
            activeOn: ['/configuration'],
            children: [
              { id: 'config-backup',   label: 'Backup',   route: '/configuration', params: { tab: 'backup' },   activeOn: ['/configuration'] },
              { id: 'config-database', label: 'Database', route: '/configuration', params: { tab: 'database' }, activeOn: ['/configuration'] },
              { id: 'config-memory',   label: 'Memory',   route: '/configuration', params: { tab: 'memory' },   activeOn: ['/configuration'] },
            ],
          },
        ],
      },
      { id: 'terminal', label: 'Terminal', icon: 'terminal', route: '/terminal' },
    ],
  },
  {
    id: 'room',
    label: 'Rooms, Companions',
    children: [
      { id: 'room-servers', label: 'Room Servers', icon: 'room-servers', route: '/room-servers' },
      { id: 'companions',   label: 'Companions',   icon: 'companions',   route: '/companions' },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    children: [
      { id: 'logs', label: 'Logs', icon: 'logs', route: '/logs' },
      { id: 'help', label: 'Help', icon: 'help', route: '/help' },
    ],
  },
]
