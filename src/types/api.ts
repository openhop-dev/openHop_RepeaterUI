// Packet related types
export interface PacketStats {
  total_packets: number;
  transmitted_packets: number;
  dropped_packets: number;
  avg_rssi: number;
  avg_snr: number;
  avg_score: number;
  avg_payload_length: number;
  avg_tx_delay: number;
  packet_types: Array<{ type: number; count: number }>;
  drop_reasons: Array<{ reason: string; count: number }>;
}

export interface RecentPacket {
  timestamp: number;
  packet_hash: string;
  type: number;
  route: number;
  src_hash: string;
  dst_hash: string;
  rssi: number;
  snr: number;
  length: number;
  payload?: string;
  payload_length?: number;
  header?: string;
  raw_packet?: string;
  transported: boolean;
  transmitted: boolean;
  is_duplicate: boolean;
  drop_reason?: string;
  score: number;
  tx_delay_ms: number;
  lbt_attempts?: number;
  lbt_backoff_delays_ms?: string;
  lbt_channel_busy?: boolean;
  original_path?: string[];
  forwarded_path?: string[];
  path_hash_size?: number; // 1, 2, or 3 (bytes per path hash entry)
  // Pre-calculated airtime from backend (when available)
  // Falls back to client-side calculation for legacy packets without this field
  airtime_ms?: number;
}

export interface FilteredPacketsParams extends Record<string, unknown> {
  type?: number;
  route?: number;
  start_timestamp?: number;
  end_timestamp?: number;
  limit?: number;
}

export interface PacketTypeStats {
  [key: string]: {
    count: number;
    percentage: number;
    avg_rssi: number;
    avg_snr: number;
    avg_length: number;
  };
}

// Chart and RRD related types
export interface RRDData {
  start_time: number;
  end_time: number;
  step: number;
  timestamps: number[];
  packet_types?: Record<string, number[]>;
  metrics?: Record<string, number[]>;
}

export interface ChartSeries {
  name: string;
  type: string;
  data: [number, number][]; // [timestamp_ms, value]
}

export interface GraphData {
  start_time: number;
  end_time: number;
  step: number;
  timestamps: number[];
  series: ChartSeries[];
}

// Noise floor related types
export interface NoiseFloorHistory {
  timestamp: number;
  noise_floor_dbm: number;
}

export interface NoiseFloorStats {
  measurement_count: number;
  avg_noise_floor: number;
  min_noise_floor: number;
  max_noise_floor: number;
  hours: number;
}

export interface NoiseFloorChartData {
  timestamps: number[];
  values: number[];
  start_time: number;
  end_time: number;
  resolution: string;
}

// System related types
export interface SystemStats {
  version: string;
  core_version: string;
  public_key?: string;
  current_airtime_ms?: number;
  max_airtime_ms?: number;
  total_airtime_ms?: number;
  uptime_seconds?: number;
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  temperature?: number;
  radio_status?: string;
  radio_error?: string;
  last_packet_time?: number;
  noise_floor_dbm?: number;
  utilization_percent?: number | { source?: string; parsedValue?: number };
  duplicate_cache_size?: number;
  cache_ttl?: number;
  config?: {
    node_name?: string;
    radio_type?: string;
    repeater?: {
      mode?: 'forward' | 'monitor' | 'no_tx';
      use_score_for_tx?: boolean;
      score_threshold?: number;
      send_advert_interval_hours?: number;
      latitude?: number;
      longitude?: number;
      advert_rate_limit?: {
        enabled?: boolean;
        bucket_capacity?: number;
        refill_tokens?: number;
        refill_interval_seconds?: number;
        min_interval_seconds?: number;
      };
      advert_penalty_box?: {
        enabled?: boolean;
        violation_threshold?: number;
        violation_decay_seconds?: number;
        base_penalty_seconds?: number;
        penalty_multiplier?: number;
        max_penalty_seconds?: number;
      };
      advert_adaptive?: {
        enabled?: boolean;
        ewma_alpha?: number;
        hysteresis_seconds?: number;
        thresholds?: {
          quiet_max?: number;
          normal_max?: number;
          busy_max?: number;
        };
      };
    };
    radio?: {
      frequency?: number;
      tx_power?: number;
      bandwidth?: number;
      spreading_factor?: number;
      coding_rate?: number;
      preamble_length?: number;
    };
    duty_cycle?: {
      enforcement_enabled?: boolean;
      max_airtime_percent?: number | { source?: string; parsedValue?: number };
    };
    delays?: {
      tx_delay_factor?: { source?: string; parsedValue?: number };
      direct_tx_delay_factor?: number;
    };
    mesh?: {
      path_hash_mode?: number; // 0 = 1-byte, 1 = 2-byte, 2 = 3-byte
      unscoped_flood_allow?: boolean;
    };
    sensors?: {
      enabled?: boolean;
      poll_interval_seconds?: number;
      auto_install_packages?: boolean;
      definitions?: Array<Record<string, unknown>>;
    };
    mqtt_brokers?: {
      iata_code?: string;
      status_interval?: number;
      owner?: string;
      email?: string;
      brokers?: Array<{
        enabled: boolean;
        name: string;
        host: string;
        port: number;
        use_jwt_auth?: boolean;
        transport?: string;
        audience?: string;
        username?: string;
        password?: string;
        topic_prefix?: string;
        format: string;
        disallowed_packet_types?: string[];
        retain_status?: boolean;
        tls?: {
          enabled?: boolean;
          insecure?: boolean;
        }
      }>;
    };
  };
  sensors?: {
    enabled?: boolean;
    poll_interval_seconds?: number;
    configured?: number;
    loaded?: number;
    running?: boolean;
    readings?: Array<{
      name?: string;
      type?: string;
      ok?: boolean;
      timestamp?: string | null;
      error?: string;
      data?: Record<string, unknown>;
    }>;
  };
  // Include other possible fields that might be returned by stats_getter
  [key: string]: unknown;
}

export interface GPSPosition {
  latitude?: number | null;
  longitude?: number | null;
  altitude_m?: number | null;
  geoid_separation_m?: number | null;
  source?: string;
}

export interface GPSSource {
  type?: string;
  device?: string | null;
  baud_rate?: number | null;
  source_path?: string | null;
  read_timeout_seconds?: number | null;
  poll_interval_seconds?: number | null;
  stale_after_seconds?: number | null;
  [key: string]: unknown;
}

export interface GPSStatus {
  state?: string;
  fix_valid?: boolean;
  stale?: boolean;
  age_seconds?: number | null;
  last_update?: string | null;
  last_error?: string | null;
}

export interface GPSFix {
  valid?: boolean;
  status?: string | null;
  quality?: number | null;
  quality_label?: string | null;
  gsa_fix_type?: number | null;
  gsa_fix_type_label?: string | null;
}

export interface GPSPositionMeta {
  source?: string;
  source_label?: string;
  policy?: string;
  manual_config_available?: boolean;
  gps_fix_valid?: boolean;
}

export interface GPSMotion {
  speed_knots?: number | null;
  speed_kmh?: number | null;
  course_degrees?: number | null;
  magnetic_variation_degrees?: number | null;
}

export interface GPSAccuracy {
  hdop?: number | null;
  pdop?: number | null;
  vdop?: number | null;
}

export interface GPSTime {
  utc_time?: string | null;
  date?: string | null;
  datetime_utc?: string | null;
}

export interface GPSSatellite {
  prn?: string | number | null;
  elevation_degrees?: number | null;
  azimuth_degrees?: number | null;
  snr_db?: number | null;
  [key: string]: unknown;
}

export interface GPSSatellites {
  used_count?: number | null;
  used_prns?: Array<string | number>;
  in_view_count?: number | null;
  in_view?: GPSSatellite[];
  snr?: {
    min?: number | null;
    max?: number | null;
    avg?: number | null;
  };
}

export interface GPSNMEASentence {
  timestamp?: string | null;
  sentence_type?: string | null;
  sentence?: string | null;
}

export interface GPSNMEA {
  last_sentence?: string | null;
  last_sentence_type?: string | null;
  last_talker?: string | null;
  seen_sentence_types?: string[];
  sentence_counters?: Record<string, number>;
  valid_checksum_count?: number;
  invalid_checksum_count?: number;
  missing_checksum_count?: number;
  recent_sentences?: GPSNMEASentence[];
}

export interface GPSDiagnostics {
  enabled?: boolean;
  running?: boolean;
  source?: GPSSource;
  status?: GPSStatus;
  fix?: GPSFix;
  position?: GPSPosition;
  gps_position?: GPSPosition;
  manual_position?: GPSPosition | null;
  position_meta?: GPSPositionMeta;
  motion?: GPSMotion;
  accuracy?: GPSAccuracy;
  time?: GPSTime;
  satellites?: GPSSatellites;
  nmea?: GPSNMEA;
  raw_attributes?: Record<string, unknown>;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  logger?: string;
}

// Control related types
export interface ModeSettings {
  mode: 'forward' | 'monitor' | 'no_tx';
}

export interface DutyCycleSettings {
  enabled: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdvertRequest {
  // No parameters needed for basic advert
}

// CAD Calibration types
export interface CADCalibrationStart {
  samples?: number;
  delay?: number;
}

export interface CADSettings {
  peak: number;
  min_val: number;
  detection_rate?: number;
}

export interface CADCalibrationMessage {
  type: 'connected' | 'status' | 'progress' | 'result' | 'error' | 'keepalive';
  message: string;
  test_ranges?: {
    peak_min: number;
    peak_max: number;
    min_min: number;
    min_max: number;
    spreading_factor: number;
    total_tests: number;
  };
  progress?: {
    current_test: number;
    total_tests: number;
    peak: number;
    min_val: number;
    detection_rate: number;
  };
  results?: {
    peak: number;
    min_val: number;
    detection_rate: number;
    recommended: boolean;
  };
}

// API parameter types
export interface PacketStatsParams extends Record<string, unknown> {
  hours?: number;
}

export interface RecentPacketsParams extends Record<string, unknown> {
  limit?: number;
}

export interface NoiseFloorParams extends Record<string, unknown> {
  hours?: number;
  limit?: number;
}

export interface GraphDataParams extends Record<string, unknown> {
  hours?: number;
  resolution?: 'average' | 'max' | 'min';
  types?: string; // comma-separated list for packet types
  metrics?: string; // comma-separated list for metrics
}

export interface RRDDataParams extends Record<string, unknown> {
  start_time?: number;
  end_time?: number;
  resolution?: 'average' | 'max' | 'min';
}
