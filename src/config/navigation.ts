import type { Component } from 'vue'
import {
  LayoutDashboard, Megaphone, Activity, Cable, MapPin, Gauge,
  BarChart2, Server, Cpu, Settings, Antenna, Terminal,
  Users2, ScrollText, HelpCircle,
  ShieldCheck, Wrench, Radio, Timer, Percent, Globe, KeyRound, Eye, Scale,
  DatabaseBackup, Database, MemoryStick, Building2, Bot, Repeat2,
} from '@lucide/vue'

export type NavItemConfig = {
  id: string
  label: string
  icon?: Component
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
  { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard, route: '/' },
  { id: 'send-advert', label: 'Send Advert', icon: Megaphone,        action: 'sendAdvert' },
  {
    id: 'monitoring', label: 'Monitoring', icon: Activity,
    children: [
      { id: 'neighbors', label: 'Neighbors', icon: Users2,  route: '/neighbors' },
      { id: 'sessions',  label: 'Sessions',  icon: Cable,   route: '/sessions' },
      { id: 'gps',       label: 'GPS',       icon: MapPin,  route: '/gps',     enabledWhen: 'gps' },
      { id: 'sensors',   label: 'Sensors',   icon: Gauge,   route: '/sensors', enabledWhen: 'sensors' },
    ],
  },
  {
    id: 'analytics', label: 'Analytics', icon: BarChart2,
    children: [
      { id: 'statistics', label: 'Statistics', icon: BarChart2,  route: '/statistics' },
      { id: 'logs',       label: 'Logs',       icon: ScrollText, route: '/logs' },
    ],
  },
  {
    id: 'system', label: 'System', icon: Server,
    children: [
      {
        id: 'configuration', label: 'Configuration', icon: Settings,
        activeOn: ['/configuration', '/cad-calibration'],
        children: [
          {
            id: 'config-radio', label: 'Radio', icon: Antenna,
            activeOn: ['/configuration'],
            children: [
              { id: 'config-radio-settings', label: 'Radio Settings',    icon: Radio,    route: '/configuration', params: { tab: 'radio' },          activeOn: ['/configuration'] },
              { id: 'config-radio-hardware', label: 'Radio Hardware',    icon: Antenna,  route: '/configuration', params: { tab: 'radio-hardware' }, activeOn: ['/configuration'] },
              { id: 'config-repeater',       label: 'Repeater',          icon: Repeat2,  route: '/configuration', params: { tab: 'repeater' },       activeOn: ['/configuration'] },
              { id: 'config-duty',           label: 'Duty Cycle',        icon: Percent,  route: '/configuration', params: { tab: 'duty' },           activeOn: ['/configuration'] },
              { id: 'config-delays',         label: 'TX Delays',         icon: Timer,    route: '/configuration', params: { tab: 'delays' },         activeOn: ['/configuration'] },
            ],
          },
          {
            id: 'config-access', label: 'Access', icon: ShieldCheck,
            activeOn: ['/configuration'],
            children: [
              { id: 'config-advert',        label: 'Advert Limits',        icon: Megaphone, route: '/configuration', params: { tab: 'advert' },        activeOn: ['/configuration'] },
              { id: 'config-transport',     label: 'Regions/Keys',         icon: Globe,     route: '/configuration', params: { tab: 'transport' },     activeOn: ['/configuration'] },
              { id: 'config-api-tokens',    label: 'API Tokens',           icon: KeyRound,  route: '/configuration', params: { tab: 'api-tokens' },    activeOn: ['/configuration'] },
              { id: 'config-web',           label: 'Web Options',          icon: Globe,     route: '/configuration', params: { tab: 'web' },           activeOn: ['/configuration'] },
              { id: 'config-observer',      label: 'Observer',             icon: Eye,       route: '/configuration', params: { tab: 'observer' },      activeOn: ['/configuration'] },
              { id: 'config-policy-engine', label: 'Policies',             icon: Scale,     route: '/configuration', params: { tab: 'policy-engine' }, activeOn: ['/configuration'] },
            ],
          },
          {
            id: 'config-maintenance', label: 'Maintenance', icon: Wrench,
            activeOn: ['/configuration'],
            children: [
              { id: 'config-backup',   label: 'Backup',   icon: DatabaseBackup, route: '/configuration', params: { tab: 'backup' },   activeOn: ['/configuration'] },
              { id: 'config-database', label: 'Database', icon: Database,       route: '/configuration', params: { tab: 'database' }, activeOn: ['/configuration'] },
              { id: 'config-memory',   label: 'Memory',   icon: MemoryStick,    route: '/configuration', params: { tab: 'memory' },   activeOn: ['/configuration'] },
            ],
          },
        ],
      },
      { id: 'system-stats', label: 'System Stats', icon: Cpu,      route: '/system-stats' },
      { id: 'terminal',     label: 'Terminal',     icon: Terminal,  route: '/terminal' },
    ],
  },
  {
    id: 'room', label: 'Rooms, Companions', icon: Users2,
    children: [
      { id: 'room-servers', label: 'Room Servers', icon: Building2, route: '/room-servers' },
      { id: 'companions',   label: 'Companions',   icon: Bot,       route: '/companions' },
    ],
  },
  { id: 'help', label: 'Help', icon: HelpCircle, route: '/help' },
]
