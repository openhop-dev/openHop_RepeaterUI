<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSignalQuality } from '@/composables/useSignalQuality';
import SignalBars from '@/components/ui/SignalBars.vue';
defineOptions({ name: 'PacketDetailsModal' });

const { getSignalQuality } = useSignalQuality();

interface Packet {
  packet_hash: string;
  timestamp: number;
  type: number;
  transmitted: boolean;
  is_duplicate?: boolean;
  drop_reason?: string;
  route: number;
  rssi: number | null;
  snr: number | null;
  score: number | null;
  tx_delay_ms: number;
  src_hash: string;
  dst_hash: string;
  payload?: string;
  length: number;
  header?: string;
  transport_codes?: string;
  raw_packet?: string;
  payload_length?: number;
  original_path?: string[];
  forwarded_path?: string[];
  path_hash_size?: number;
  is_trace?: boolean;
  path_snr_details?: Array<{ hash: string; snr_db: number }>;
  lbt_attempts?: number;
  lbt_backoff_delays_ms?: string;
  lbt_channel_busy?: boolean;
}

interface Props {
  packet: Packet | null;
  isOpen: boolean;
  localHash?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
}>();

// Toggle for showing binary values
const showBinaryValues = ref(false);

// Format timestamp
const formatFullTime = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleString();
};

// Get status styling
const getStatusClass = (packet: Packet) => {
  if (!packet.transmitted) return 'text-accent-red';
  if (packet.is_duplicate) return 'text-accent-amber';
  if (packet.drop_reason) return 'text-accent-red';
  return 'text-accent-green';
};

const getStatusText = (packet: Packet) => {
  if (!packet.transmitted) return 'Dropped';
  if (packet.is_duplicate) return 'Duplicate';
  if (packet.drop_reason) return 'Dropped';
  return 'Forwarded';
};

// Enhanced packet type mapping (MeshCore official specification)
const getPacketTypeName = (type: number) => {
  const types: { [key: number]: string } = {
    0: 'Request',
    1: 'Response',
    2: 'Plain Text Message',
    3: 'Acknowledgment',
    4: 'Node Advertisement',
    5: 'Group Text Message',
    6: 'Group Datagram',
    7: 'Anonymous Request',
    8: 'Returned Path',
    9: 'Trace',
    10: 'Multi-part Packet',
    15: 'Custom Packet',
  };
  return types[type] || `Unknown Type (${type})`;
};

// Route type mapping (MeshCore official specification)
const getRouteName = (route: number) => {
  const routes: { [key: number]: string } = {
    0: 'Transport Flood',
    1: 'Flood',
    2: 'Direct',
    3: 'Transport Direct',
  };
  return routes[route] || `Unknown Route (${route})`;
};

// Format payload with line breaks every 32 characters
const formatPayload = (payload?: string) => {
  if (!payload) return 'None';
  // Format with more hex bytes per line for better width utilization
  // Group by 2-character hex bytes, then create lines of 32 bytes (64 hex chars)
  const cleanPayload = payload.replace(/\s+/g, '').toUpperCase();
  const hexBytes = cleanPayload.match(/.{2}/g) || [];
  const lines = [];

  for (let i = 0; i < hexBytes.length; i += 32) {
    const line = hexBytes.slice(i, i + 32).join(' ');
    lines.push(line);
  }

  return lines.join('\n') || payload;
};

// Parse ADVERT packet payload according to MeshCore specification
const parseAdvertPayload = (
  sections: Array<{
    name: string;
    byteRange: string;
    hexData: string;
    description: string;
    fields: Array<{
      bits: string;
      name: string;
      value: string;
      binary: string;
    }>;
  }>,
  payloadHex: string,
  baseOffset: number,
) => {
  try {
    let offset = 0;
    const payloadBytes = payloadHex.length / 2;

    // Check if this looks like a complete ADVERT packet (with pubkey + timestamp + signature)
    // or just the AppData portion
    if (payloadBytes >= 100) {
      // This looks like a complete ADVERT packet - parse the full structure

      // Public Key (32 bytes)
      if (payloadHex.length >= offset + 64) {
        const pubKeyHex = payloadHex.slice(offset, offset + 64);
        sections.push({
          name: 'Public Key',
          byteRange: `${(baseOffset + offset) / 2}-${(baseOffset + offset + 63) / 2}`,
          hexData: pubKeyHex.match(/.{8}/g)?.join(' ') || pubKeyHex,
          description: 'Ed25519 public key of the node (32 bytes)',
          fields: [
            {
              bits: '0-255',
              name: 'Ed25519 Public Key',
              value: `${pubKeyHex.slice(0, 16)}...${pubKeyHex.slice(-16)}`,
              binary: '32 bytes (256 bits)',
            },
          ],
        });
        offset += 64;
      }

      // Timestamp (4 bytes)
      if (payloadHex.length >= offset + 8) {
        const timestampHex = payloadHex.slice(offset, offset + 8);
        const timestamp = parseInt(timestampHex, 16);
        const date = new Date(timestamp * 1000);

        sections.push({
          name: 'Timestamp',
          byteRange: `${(baseOffset + offset) / 2}-${(baseOffset + offset + 7) / 2}`,
          hexData: timestampHex.match(/.{2}/g)?.join(' ') || timestampHex,
          description: 'Unix timestamp of advertisement',
          fields: [
            {
              bits: '0-31',
              name: 'Unix Timestamp',
              value: `${timestamp} (${date.toLocaleString()})`,
              binary: timestamp.toString(2).padStart(32, '0'),
            },
          ],
        });
        offset += 8;
      }

      // Signature (64 bytes)
      if (payloadHex.length >= offset + 128) {
        const signatureHex = payloadHex.slice(offset, offset + 128);
        sections.push({
          name: 'Signature',
          byteRange: `${(baseOffset + offset) / 2}-${(baseOffset + offset + 127) / 2}`,
          hexData: signatureHex.match(/.{8}/g)?.join(' ') || signatureHex,
          description: 'Ed25519 signature of public key, timestamp, and appdata',
          fields: [
            {
              bits: '0-511',
              name: 'Ed25519 Signature',
              value: `${signatureHex.slice(0, 16)}...${signatureHex.slice(-16)}`,
              binary: '64 bytes (512 bits)',
            },
          ],
        });
        offset += 128;
      }

      // AppData (remaining bytes)
      if (payloadHex.length > offset) {
        const appDataHex = payloadHex.slice(offset);
        parseAppData(sections, appDataHex, baseOffset + offset);
      }
    } else {
      // This appears to be just AppData portion - try to parse it directly
      sections.push({
        name: 'ADVERT AppData (Partial)',
        byteRange: `${baseOffset / 2}-${baseOffset / 2 + payloadBytes - 1}`,
        hexData: payloadHex.match(/.{2}/g)?.join(' ') || payloadHex,
        description: `Partial ADVERT data - appears to be just AppData portion (${payloadBytes} bytes)`,
        fields: [
          {
            bits: `0-${payloadBytes * 8 - 1}`,
            name: 'Partial Data',
            value: `${payloadBytes} bytes - attempting to decode as AppData`,
            binary: `${payloadBytes} bytes (${payloadBytes * 8} bits)`,
          },
        ],
      });

      // Try to parse as AppData directly
      parseAppData(sections, payloadHex, baseOffset);
    }
  } catch (error) {
    sections.push({
      name: 'ADVERT Parse Error',
      byteRange: 'N/A',
      hexData: payloadHex.slice(0, 32) + '...',
      description: 'Failed to parse ADVERT payload structure',
      fields: [
        {
          bits: 'N/A',
          name: 'Error',
          value: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          binary: 'Invalid',
        },
      ],
    });
  }
};

// Helper function to parse AppData portion
const parseAppData = (
  sections: Array<{
    name: string;
    byteRange: string;
    hexData: string;
    description: string;
    fields: Array<{
      bits: string;
      name: string;
      value: string;
      binary: string;
    }>;
  }>,
  appDataHex: string,
  baseOffset: number,
) => {
  try {
    const appDataBytes = appDataHex.length / 2;

    sections.push({
      name: 'AppData',
      byteRange: `${baseOffset / 2}-${baseOffset / 2 + appDataBytes - 1}`,
      hexData: appDataHex.match(/.{2}/g)?.join(' ') || appDataHex,
      description: `Node advertisement application data (${appDataBytes} bytes)`,
      fields: [
        {
          bits: `0-${appDataBytes * 8 - 1}`,
          name: 'Application Data',
          value: `${appDataBytes} bytes (contains flags, location, name, etc.)`,
          binary: `${appDataBytes} bytes (${appDataBytes * 8} bits)`,
        },
      ],
    });

    // Parse AppData structure according to MeshCore specification
    let appDataOffset = 0;

    // Flags byte (1 byte)
    if (appDataHex.length >= 2) {
      const flagsByte = parseInt(appDataHex.slice(appDataOffset, appDataOffset + 2), 16);
      const flagDescriptions = [];

      const hasLocation = !!(flagsByte & 0x10);
      const hasFeature1 = !!(flagsByte & 0x20);
      const hasFeature2 = !!(flagsByte & 0x40);
      const hasName = !!(flagsByte & 0x80);

      if (flagsByte & 0x01) flagDescriptions.push('is chat node');
      if (flagsByte & 0x02) flagDescriptions.push('is repeater');
      if (flagsByte & 0x04) flagDescriptions.push('is room server');
      if (flagsByte & 0x08) flagDescriptions.push('is sensor');
      if (hasLocation) flagDescriptions.push('has location');
      if (hasFeature1) flagDescriptions.push('has feature 1');
      if (hasFeature2) flagDescriptions.push('has feature 2');
      if (hasName) flagDescriptions.push('has name');

      sections.push({
        name: 'AppData Flags',
        byteRange: `${(baseOffset + appDataOffset) / 2}`,
        hexData: `0x${appDataHex.slice(appDataOffset, appDataOffset + 2)}`,
        description: 'Flags indicating which optional fields are present',
        fields: [
          {
            bits: '0-7',
            name: 'Flags',
            value: flagDescriptions.join(', ') || 'none',
            binary: flagsByte.toString(2).padStart(8, '0'),
          },
        ],
      });
      appDataOffset += 2;

      // Location data (8 bytes total: 4 for lat, 4 for lng)
      if (hasLocation && appDataHex.length >= appDataOffset + 16) {
        // Latitude (4 bytes, little endian, divided by 1000000)
        const latHex = appDataHex.slice(appDataOffset, appDataOffset + 8);
        // Convert little endian to number
        const latBytes = [];
        for (let i = 6; i >= 0; i -= 2) {
          latBytes.push(latHex.slice(i, i + 2));
        }
        const latValue = parseInt(latBytes.join(''), 16);
        // Handle signed 32-bit integer
        const latSigned = latValue > 0x7fffffff ? latValue - 0x100000000 : latValue;
        const latitude = latSigned / 1000000.0;

        // Longitude (4 bytes, little endian, divided by 1000000)
        const lngHex = appDataHex.slice(appDataOffset + 8, appDataOffset + 16);
        const lngBytes = [];
        for (let i = 6; i >= 0; i -= 2) {
          lngBytes.push(lngHex.slice(i, i + 2));
        }
        const lngValue = parseInt(lngBytes.join(''), 16);
        // Handle signed 32-bit integer
        const lngSigned = lngValue > 0x7fffffff ? lngValue - 0x100000000 : lngValue;
        const longitude = lngSigned / 1000000.0;

        sections.push({
          name: 'Location Data',
          byteRange: `${(baseOffset + appDataOffset) / 2}-${(baseOffset + appDataOffset + 15) / 2}`,
          hexData: `${latHex.match(/.{2}/g)?.join(' ') || latHex} ${lngHex.match(/.{2}/g)?.join(' ') || lngHex}`,
          description: 'GPS coordinates (latitude and longitude)',
          fields: [
            {
              bits: '0-31',
              name: 'Latitude',
              value: `${latitude.toFixed(6)}° (raw: ${latSigned})`,
              binary: latSigned.toString(2).padStart(32, '0'),
            },
            {
              bits: '32-63',
              name: 'Longitude',
              value: `${longitude.toFixed(6)}° (raw: ${lngSigned})`,
              binary: lngSigned.toString(2).padStart(32, '0'),
            },
          ],
        });
        appDataOffset += 16;
      }

      // Feature 1 (2 bytes, optional)
      if (hasFeature1 && appDataHex.length >= appDataOffset + 4) {
        const feature1Hex = appDataHex.slice(appDataOffset, appDataOffset + 4);
        const feature1Value = parseInt(feature1Hex, 16);

        sections.push({
          name: 'Feature 1',
          byteRange: `${(baseOffset + appDataOffset) / 2}-${(baseOffset + appDataOffset + 3) / 2}`,
          hexData: feature1Hex.match(/.{2}/g)?.join(' ') || feature1Hex,
          description: 'Reserved feature 1 (2 bytes)',
          fields: [
            {
              bits: '0-15',
              name: 'Feature 1 Value',
              value: `${feature1Value}`,
              binary: feature1Value.toString(2).padStart(16, '0'),
            },
          ],
        });
        appDataOffset += 4;
      }

      // Feature 2 (2 bytes, optional)
      if (hasFeature2 && appDataHex.length >= appDataOffset + 4) {
        const feature2Hex = appDataHex.slice(appDataOffset, appDataOffset + 4);
        const feature2Value = parseInt(feature2Hex, 16);

        sections.push({
          name: 'Feature 2',
          byteRange: `${(baseOffset + appDataOffset) / 2}-${(baseOffset + appDataOffset + 3) / 2}`,
          hexData: feature2Hex.match(/.{2}/g)?.join(' ') || feature2Hex,
          description: 'Reserved feature 2 (2 bytes)',
          fields: [
            {
              bits: '0-15',
              name: 'Feature 2 Value',
              value: `${feature2Value}`,
              binary: feature2Value.toString(2).padStart(16, '0'),
            },
          ],
        });
        appDataOffset += 4;
      }

      // Node name (remaining bytes)
      if (hasName && appDataHex.length > appDataOffset) {
        const nameHex = appDataHex.slice(appDataOffset);
        const nameBytes = nameHex.match(/.{2}/g) || [];
        const nameString = nameBytes
          .map((byte) => {
            const charCode = parseInt(byte, 16);
            return charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : '.';
          })
          .join('')
          .replace(/\.+$/, ''); // Remove trailing dots

        sections.push({
          name: 'Node Name',
          byteRange: `${(baseOffset + appDataOffset) / 2}-${(baseOffset + appDataHex.length - 1) / 2}`,
          hexData: nameHex.match(/.{2}/g)?.join(' ') || nameHex,
          description: `Node name string (${nameBytes.length} bytes)`,
          fields: [
            {
              bits: `0-${nameBytes.length * 8 - 1}`,
              name: 'Node Name',
              value: `"${nameString}"`,
              binary: `ASCII text (${nameBytes.length} bytes)`,
            },
          ],
        });
      }
    }
  } catch (error) {
    sections.push({
      name: 'AppData Parse Error',
      byteRange: 'N/A',
      hexData: appDataHex.slice(0, Math.min(32, appDataHex.length)),
      description: 'Failed to parse AppData structure',
      fields: [
        {
          bits: 'N/A',
          name: 'Error',
          value: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          binary: 'Invalid',
        },
      ],
    });
  }
};

// Parse JSON path string into array
const parsePathString = (pathString?: string[] | string | null): string[] => {
  if (!pathString) return [];
  if (Array.isArray(pathString)) return pathString;
  if (typeof pathString === 'string') {
    try {
      return JSON.parse(pathString);
    } catch {
      return [];
    }
  }
  return [];
};

const getPathRows = (packet: Packet) => {
  const original = parsePathString(packet.original_path);
  const forwarded = parsePathString(packet.forwarded_path);
  const maxLength = Math.max(original.length, forwarded.length);

  return Array.from({ length: maxLength }, (_, index) => {
    const originalHash = original[index] || '';
    const forwardedHash = forwarded[index] || '';
    const normalizedOriginal = originalHash.toUpperCase();
    const normalizedForwarded = forwardedHash.toUpperCase();

    return {
      hop: index + 1,
      original: normalizedOriginal,
      forwarded: normalizedForwarded,
      changed: normalizedOriginal !== normalizedForwarded,
      status:
        normalizedOriginal && normalizedForwarded
          ? normalizedOriginal === normalizedForwarded
            ? 'same'
            : 'changed'
          : normalizedOriginal
            ? 'original-only'
            : 'forwarded-only',
      localOriginal: !!props.localHash && normalizedOriginal === props.localHash.toUpperCase(),
      localForwarded:
        !!props.localHash && normalizedForwarded === props.localHash.toUpperCase(),
    };
  });
};

const isPathModified = (packet: Packet) => {
  const original = parsePathString(packet.original_path);
  const forwarded = parsePathString(packet.forwarded_path);
  return JSON.stringify(original) !== JSON.stringify(forwarded);
};

// Parse packet structure using raw packet data or fallback to individual fields
const parsePacketStructure = (
  packet?: Packet,
): Array<{
  name: string;
  byteRange: string;
  hexData: string;
  description: string;
  fields: Array<{
    bits: string;
    name: string;
    value: string;
    binary: string;
  }>;
}> => {
  const sections: Array<{
    name: string;
    byteRange: string;
    hexData: string;
    description: string;
    fields: Array<{
      bits: string;
      name: string;
      value: string;
      binary: string;
    }>;
  }> = [];

  if (!packet) return sections;

  try {
    // Try to use raw_packet first, then fall back to individual fields
    const rawPacket = packet.raw_packet;

    if (rawPacket) {
      // Parse complete raw packet
      const cleanRawPacket = rawPacket.replace(/\s+/g, '').toUpperCase();
      let offset = 0;

      // Header (1 byte)
      if (cleanRawPacket.length >= 2) {
        const headerByte = cleanRawPacket.slice(offset, offset + 2);
        const headerValue = parseInt(headerByte, 16);

        const routeType = headerValue & 0x03;
        const payloadType = (headerValue & 0x3c) >> 2;
        const payloadVersion = (headerValue & 0xc0) >> 6;

        const routeTypeNames: Record<number, string> = {
          0x00: 'Transport Flood',
          0x01: 'Flood',
          0x02: 'Direct',
          0x03: 'Transport Direct',
        };

        const payloadTypeNames: Record<number, string> = {
          0x00: 'REQ',
          0x01: 'RESPONSE',
          0x02: 'TXT_MSG',
          0x03: 'ACK',
          0x04: 'ADVERT',
          0x05: 'GRP_TXT',
          0x06: 'GRP_DATA',
          0x07: 'ANON_REQ',
          0x08: 'PATH',
          0x09: 'TRACE',
          0x0a: 'MULTIPART',
          0x0f: 'RAW_CUSTOM',
        };

        sections.push({
          name: 'Header',
          byteRange: '0',
          hexData: `0x${headerByte}`,
          description: 'Contains routing type, payload type, and payload version',
          fields: [
            {
              bits: '0-1',
              name: 'Route Type',
              value: routeTypeNames[routeType] || 'Unknown',
              binary: routeType.toString(2).padStart(2, '0'),
            },
            {
              bits: '2-5',
              name: 'Payload Type',
              value: payloadTypeNames[payloadType] || 'Unknown',
              binary: payloadType.toString(2).padStart(4, '0'),
            },
            {
              bits: '6-7',
              name: 'Version',
              value: payloadVersion.toString(),
              binary: payloadVersion.toString(2).padStart(2, '0'),
            },
          ],
        });
        offset += 2;

        // Transport codes (4 bytes, optional)
        const hasTransportCodes = routeType === 0x00 || routeType === 0x03;
        if (hasTransportCodes && cleanRawPacket.length >= offset + 8) {
          const transportHex = cleanRawPacket.slice(offset, offset + 8);
          const code1 = parseInt(transportHex.slice(0, 4), 16);
          const code2 = parseInt(transportHex.slice(4, 8), 16);

          sections.push({
            name: 'Transport Codes',
            byteRange: '1-4',
            hexData: `${transportHex.slice(0, 4)} ${transportHex.slice(4, 8)}`,
            description: '2x 16-bit transport codes for routing optimization',
            fields: [
              {
                bits: '0-15',
                name: 'Code 1',
                value: code1.toString(),
                binary: code1.toString(2).padStart(16, '0'),
              },
              {
                bits: '16-31',
                name: 'Code 2',
                value: code2.toString(),
                binary: code2.toString(2).padStart(16, '0'),
              },
            ],
          });
          offset += 8;
        }

        // Path length (1 byte) — encoded: bits 6-7 = (hash_size - 1), bits 0-5 = hop_count
        if (cleanRawPacket.length >= offset + 2) {
          const pathLenByte = cleanRawPacket.slice(offset, offset + 2);
          const pathLenRaw = parseInt(pathLenByte, 16);
          const hashSize = (pathLenRaw >> 6) + 1;
          const hopCount = pathLenRaw & 0x3f;
          const pathByteLen = hopCount * hashSize;

          sections.push({
            name: 'Path Length',
            byteRange: `${offset / 2}`,
            hexData: `0x${pathLenByte}`,
            description: `${hopCount} hop${hopCount !== 1 ? 's' : ''}, ${hashSize}-byte hash${hashSize > 1 ? 'es' : ''} (${pathByteLen} bytes)`,
            fields: [
              {
                bits: '6-7',
                name: 'Hash Size',
                value: `${hashSize}-byte`,
                binary: ((pathLenRaw >> 6) & 0x03).toString(2).padStart(2, '0'),
              },
              {
                bits: '0-5',
                name: 'Hop Count',
                value: `${hopCount}`,
                binary: (pathLenRaw & 0x3f).toString(2).padStart(6, '0'),
              },
            ],
          });
          offset += 2;

          // Path data (variable length, grouped by hash_size)
          if (pathByteLen > 0 && cleanRawPacket.length >= offset + pathByteLen * 2) {
            const pathHex = cleanRawPacket.slice(offset, offset + pathByteLen * 2);
            // Group hex chars by hash_size (each byte = 2 hex chars)
            const groupRegex = new RegExp(`.{${hashSize * 2}}`, 'g');
            const groupedHashes = pathHex.match(groupRegex) || [];

            sections.push({
              name: 'Path Data',
              byteRange: `${offset / 2}-${(offset + pathByteLen * 2 - 2) / 2}`,
              hexData: groupedHashes.join(' ') || pathHex,
              description: `${hopCount} × ${hashSize}-byte routing hash${hopCount !== 1 ? 'es' : ''}`,
              fields: groupedHashes.map((hash: string, i: number) => ({
                bits: `${i * hashSize * 8}-${(i + 1) * hashSize * 8 - 1}`,
                name: `Hop ${i + 1}`,
                value: hash.toUpperCase(),
                binary: `${hashSize} byte${hashSize > 1 ? 's' : ''}`,
              })),
            });
            offset += pathByteLen * 2;
          }
        }

        // Payload data (remaining bytes) - handle specific payload types
        if (cleanRawPacket.length > offset) {
          const payloadHex = cleanRawPacket.slice(offset);
          const payloadBytes = payloadHex.length / 2;

          // Check if this is an ADVERT packet (type 4)
          if (payloadType === 0x04) {
            // Parse ADVERT packet according to MeshCore specification
            parseAdvertPayload(sections, payloadHex, offset);
          } else {
            // Generic payload parsing for other types
            sections.push({
              name: 'Payload Data',
              byteRange: `${offset / 2}-${offset / 2 + payloadBytes - 1}`,
              hexData: payloadHex.match(/.{2}/g)?.join(' ') || payloadHex,
              description: 'Application data content',
              fields: [
                {
                  bits: `0-${payloadBytes * 8 - 1}`,
                  name: 'Application Data',
                  value: `${payloadBytes} bytes`,
                  binary: `${payloadBytes} bytes (${payloadBytes * 8} bits)`,
                },
              ],
            });
          }
        }
      }
    } else {
      // Fallback to individual field parsing

      // Header Analysis (from separate header field)
      if (packet.header) {
        const cleanHeader = packet.header.replace(/0x/gi, '').replace(/\s+/g, '').toUpperCase();
        const headerValue = parseInt(cleanHeader, 16);

        const routeType = headerValue & 0x03;
        const payloadType = (headerValue & 0x3c) >> 2;
        const payloadVersion = (headerValue & 0xc0) >> 6;

        const routeTypeNames: Record<number, string> = {
          0x00: 'Transport Flood',
          0x01: 'Flood',
          0x02: 'Direct',
          0x03: 'Transport Direct',
        };

        const payloadTypeNames: Record<number, string> = {
          0x00: 'REQ',
          0x01: 'RESPONSE',
          0x02: 'TXT_MSG',
          0x03: 'ACK',
          0x04: 'ADVERT',
          0x05: 'GRP_TXT',
          0x06: 'GRP_DATA',
          0x07: 'ANON_REQ',
          0x08: 'PATH',
          0x09: 'TRACE',
          0x0a: 'MULTIPART',
          0x0f: 'RAW_CUSTOM',
        };

        sections.push({
          name: 'Header',
          byteRange: '0',
          hexData: `0x${cleanHeader}`,
          description: 'Contains routing type, payload type, and payload version',
          fields: [
            {
              bits: '0-1',
              name: 'Route Type',
              value: routeTypeNames[routeType] || 'Unknown',
              binary: routeType.toString(2).padStart(2, '0'),
            },
            {
              bits: '2-5',
              name: 'Payload Type',
              value: payloadTypeNames[payloadType] || 'Unknown',
              binary: payloadType.toString(2).padStart(4, '0'),
            },
            {
              bits: '6-7',
              name: 'Version',
              value: payloadVersion.toString(),
              binary: payloadVersion.toString(2).padStart(2, '0'),
            },
          ],
        });

        // Transport codes (if available in separate field)
        if (packet.transport_codes) {
          sections.push({
            name: 'Transport Codes',
            byteRange: '1-4',
            hexData: packet.transport_codes,
            description: '2x 16-bit transport codes for routing optimization',
            fields: [
              {
                bits: '0-31',
                name: 'Transport Codes',
                value: packet.transport_codes,
                binary: 'Available in separate field',
              },
            ],
          });
        }

        // Path information (using original_path/forwarded_path)
        if (packet.original_path && packet.original_path.length > 0) {
          sections.push({
            name: 'Original Path',
            byteRange: '?',
            hexData: packet.original_path.join(' '),
            description: `Original routing path (${packet.original_path.length} nodes)`,
            fields: [
              {
                bits: '0-?',
                name: 'Path Nodes',
                value: `${packet.original_path.length} nodes`,
                binary: 'Available as node list',
              },
            ],
          });
        }

        if (packet.forwarded_path && packet.forwarded_path.length > 0) {
          sections.push({
            name: 'Forwarded Path',
            byteRange: '?',
            hexData: packet.forwarded_path.join(' '),
            description: `Forwarded routing path (${packet.forwarded_path.length} nodes)`,
            fields: [
              {
                bits: '0-?',
                name: 'Path Nodes',
                value: `${packet.forwarded_path.length} nodes`,
                binary: 'Available as node list',
              },
            ],
          });
        }
      }

      // Payload analysis (application data only)
      if (packet.payload) {
        const cleanPayload = packet.payload.replace(/\s+/g, '').toUpperCase();
        const payloadBytes = cleanPayload.length / 2;

        // Check if this is an ADVERT packet based on packet type
        const isAdvertPacket = packet.type === 4;

        if (isAdvertPacket) {
          // Parse ADVERT payload using our dedicated parser
          parseAdvertPayload(sections, cleanPayload, 0);
        } else {
          // Generic payload parsing for other packet types
          sections.push({
            name: 'Payload Data',
            byteRange: `0-${payloadBytes - 1}`,
            hexData: cleanPayload.match(/.{2}/g)?.join(' ') || cleanPayload,
            description: `Application data content (${payloadBytes} bytes)`,
            fields: [
              {
                bits: `0-${payloadBytes * 8 - 1}`,
                name: 'Application Data',
                value: `${payloadBytes} bytes`,
                binary: `${payloadBytes} bytes (${payloadBytes * 8} bits)`,
              },
            ],
          });
        }
      }
    }
  } catch {
    // Fallback for errors
    sections.push({
      name: 'Parse Error',
      byteRange: 'N/A',
      hexData: 'Error',
      description: 'Unable to parse packet structure',
      fields: [
        {
          bits: 'N/A',
          name: 'Error',
          value: 'Parse failed',
          binary: 'Invalid',
        },
      ],
    });
  }

  return sections;
};

// Get signal quality class for SNR values (using RSSI-based utility)
const getSnrClass = (snr: number | null, rssi: number | null) => {
  if (snr == null || rssi == null) return 'text-content-muted dark:text-content-muted';

  const quality = getSignalQuality(rssi);
  return quality.color;
};


// Parse LBT backoff delays from JSON string
const parseLbtDelays = (delaysJson?: string): number[] => {
  if (!delaysJson) return [];
  try {
    const parsed = JSON.parse(delaysJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Get LBT congestion level for visualization
const getLbtCongestionLevel = (attempts: number) => {
  if (attempts === 0)
    return {
      level: 'none',
      color: 'text-accent-green',
      bgColor: 'bg-accent-green/20',
      label: 'Clear Channel',
    };
  if (attempts <= 1)
    return {
      level: 'low',
      color: 'text-accent-cyan',
      bgColor: 'bg-accent-cyan/20',
      label: 'Light Traffic',
    };
  if (attempts <= 2)
    return {
      level: 'moderate',
      color: 'text-accent-amber',
      bgColor: 'bg-accent-amber/20',
      label: 'Moderate Congestion',
    };
  return {
    level: 'high',
    color: 'text-accent-red',
    bgColor: 'bg-accent-red/20',
    label: 'Heavy Congestion',
  };
};

// Format delay time in ms
const formatDelayTime = (ms: number) => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
};

// Close modal on escape key
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emit('close');
  }
};

// Handle backdrop click
const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    emit('close');
  }
};

// Lock body scroll when modal is open
watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div
        v-if="isOpen && packet"
        class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
        @click="handleBackdropClick"
        @keydown="handleKeyDown"
        tabindex="0"
      >
        <!-- Backdrop with blur -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-none"></div>

        <!-- Modal Content -->
        <div class="relative w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col" @click.stop>
          <!-- Glass Card Container -->
          <div
            class="bg-white dark:bg-surface-elevated backdrop-blur-xl rounded-[16px] sm:rounded-[20px] shadow-2xl border border-stroke-subtle dark:border-white/20 flex flex-col h-full overflow-hidden"
          >
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between p-4 sm:p-6 lg:p-8 pb-3 sm:pb-4 shrink-0 gap-3 sm:gap-4">
              <div class="min-w-0 flex-1">
                <h2 class="text-lg sm:text-2xl font-bold text-content-primary dark:text-content-primary mb-1">
                  Packet Details
                </h2>
                <div class="flex flex-wrap gap-2 mt-2">
                  <span class="inline-flex items-center rounded-full bg-accent-cyan/15 text-accent-cyan px-2 py-0.5 text-[11px] sm:text-xs font-medium max-w-full truncate">
                    {{ getPacketTypeName(packet.type) }}
                  </span>
                  <span class="inline-flex items-center rounded-full bg-accent-amber/15 text-accent-amber px-2 py-0.5 text-[11px] sm:text-xs font-medium max-w-full truncate">
                    {{ getRouteName(packet.route) }}
                  </span>
                </div>
              </div>
              <div class="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0">
                <!-- Binary Toggle Button -->
                <button
                  @click="showBinaryValues = !showBinaryValues"
                  class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all duration-200"
                  :class="
                    showBinaryValues
                      ? 'bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan'
                      : 'bg-background-mute dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 text-content-secondary dark:text-content-muted'
                  "
                  :title="showBinaryValues ? 'Hide binary values' : 'Show binary values'"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    ></path>
                  </svg>
                  <span class="text-xs font-medium">Binary</span>
                </button>
                <!-- Close Button -->
                <button
                  type="button"
                  @click="emit('close')"
                  aria-label="Close packet details"
                  title="Close"
                  class="w-9 h-9 flex items-center justify-center rounded-lg bg-background-mute dark:bg-white/10 hover:bg-stroke-subtle dark:hover:bg-white/20 transition-colors duration-200 text-content-secondary dark:text-content-primary hover:text-content-primary dark:hover:text-content-primary"
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
              </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-6 lg:px-8">
              <!-- Section 1: Basic Information -->
              <div class="mb-6">
                <h3
                  class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-4 flex items-center"
                >
                  <div class="w-2 h-2 rounded-full status-dot-cyan mr-3"></div>
                  Basic Information
                </h3>
                <div class="glass-card bg-background-mute/60 dark:bg-white/5 rounded-[15px] p-4">
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="space-y-3">
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Timestamp</span
                        >
                        <span
                          class="text-content-primary dark:text-content-primary font-mono text-sm"
                          >{{ formatFullTime(packet.timestamp) }}</span
                        >
                      </div>
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Packet Hash</span
                        >
                        <span
                          class="text-content-primary dark:text-content-primary font-mono text-xs break-all"
                          >{{ packet.packet_hash }}</span
                        >
                      </div>
                      <div
                        v-if="packet.header"
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Header</span
                        >
                        <span
                          class="text-content-primary dark:text-content-primary font-mono text-xs"
                          >{{ packet.header }}</span
                        >
                      </div>
                    </div>
                    <div class="space-y-3">
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Type</span
                        >
                        <span class="text-content-primary dark:text-content-primary font-semibold"
                          >{{ packet.type }} ({{ getPacketTypeName(packet.type) }})</span
                        >
                      </div>
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Route</span
                        >
                        <span class="text-content-primary dark:text-content-primary font-semibold"
                          >{{ packet.route }} ({{ getRouteName(packet.route) }})</span
                        >
                      </div>
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Status</span
                        >
                        <span class="font-semibold" :class="getStatusClass(packet)">{{
                          getStatusText(packet)
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Section 2: Payload Data -->
              <div class="mb-6">
                <h3
                  class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-4 flex items-center"
                >
                  <div class="w-2 h-2 rounded-full status-dot-amber mr-3"></div>
                  Payload Data
                </h3>
                <div
                  class="bg-background-mute/60 dark:bg-white/5 rounded-[15px] p-4 border border-stroke-subtle dark:border-stroke/10"
                >
                  <div class="space-y-3">
                    <div
                      class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                    >
                      <span class="text-content-secondary dark:text-content-muted text-sm"
                        >Payload Length</span
                      >
                      <span class="text-content-primary dark:text-content-primary"
                        >{{ packet.payload_length || packet.length }} bytes</span
                      >
                    </div>
                    <div v-if="packet.payload" class="pt-2">
                      <div class="text-content-secondary dark:text-content-muted text-sm mb-3">
                        Payload Analysis
                      </div>

                      <!-- Raw Hex Display -->
                      <div
                        class="glass-card bg-background-mute dark:bg-white/10 rounded-[10px] p-4 mb-4"
                      >
                        <div
                          class="text-content-secondary dark:text-content-muted text-xs mb-2 font-semibold"
                        >
                          Raw Hex Data
                        </div>
                        <div class="w-full overflow-x-auto">
                          <pre
                            class="text-content-primary dark:text-content-primary/90 text-xs font-mono whitespace-pre leading-relaxed min-w-full"
                            >{{ formatPayload(packet.payload) }}</pre
                          >
                        </div>
                      </div>

                      <!-- Packet Structure Analysis -->
                      <div
                        v-for="(section, sectionIndex) in parsePacketStructure(packet).filter(
                          (s) =>
                            !s.name.includes('Parse Error') &&
                            !['Path Length', 'Path Data', 'Original Path', 'Forwarded Path'].includes(
                              s.name,
                            ),
                        )"
                        :key="sectionIndex"
                        class="mb-4"
                      >
                        <!-- Section Header -->
                        <div class="flex items-center justify-between mb-3">
                          <h4
                            class="text-content-secondary dark:text-content-primary/80 text-sm font-semibold"
                          >
                            {{ section.name }}
                          </h4>
                          <span class="text-content-muted dark:text-content-muted text-xs"
                            >Bytes {{ section.byteRange }}</span
                          >
                        </div>

                        <!-- Hex Input Display -->
                        <div class="bg-background-mute dark:bg-white/10 rounded-[8px] p-3 mb-3">
                          <div
                            class="font-mono text-xs text-content-primary dark:text-content-primary break-all whitespace-pre-wrap leading-relaxed"
                          >
                            {{ section.hexData }}
                          </div>
                        </div>

                        <!-- Field Breakdown Table -->
                        <div class="bg-background-mute/50 dark:bg-white/5 rounded-[10px] overflow-hidden">
                          <!-- Desktop Table Header -->
                          <div
                            class="hidden md:grid gap-3 p-3 bg-background-mute dark:bg-white/10 text-content-secondary dark:text-content-muted text-xs font-semibold uppercase tracking-wide"
                            :class="showBinaryValues ? 'grid-cols-4' : 'grid-cols-3'"
                          >
                            <div class="min-w-0">Bits</div>
                            <div class="min-w-0">Field</div>
                            <div class="min-w-0">Value</div>
                            <div v-if="showBinaryValues" class="min-w-0">Binary</div>
                          </div>

                          <!-- Desktop Field Rows -->
                          <div
                            v-for="(field, fieldIndex) in section.fields"
                            :key="fieldIndex"
                            class="hidden md:grid gap-3 p-3 border-b border-stroke-subtle dark:border-stroke/5 last:border-b-0 hover:bg-background-mute dark:hover:bg-stroke/5 transition-colors"
                            :class="showBinaryValues ? 'grid-cols-4' : 'grid-cols-3'"
                          >
                            <div class="text-accent-cyan text-sm font-mono break-words min-w-0">
                              {{ field.bits }}
                            </div>
                            <div
                              class="text-content-primary dark:text-content-primary text-sm break-words min-w-0"
                            >
                              {{ field.name }}
                            </div>
                            <div
                              class="text-content-primary dark:text-content-primary text-sm font-semibold break-all min-w-0 overflow-hidden"
                            >
                              <span class="block" :title="field.value">{{ field.value }}</span>
                            </div>
                            <div
                              v-if="showBinaryValues"
                              class="text-accent-amber text-xs font-mono break-all min-w-0 overflow-hidden"
                            >
                              <span class="block" :title="field.binary">{{ field.binary }}</span>
                            </div>
                          </div>

                          <!-- Mobile Stacked View -->
                          <div
                            v-for="(field, fieldIndex) in section.fields"
                            :key="`mobile-${fieldIndex}`"
                            class="md:hidden p-3 border-b border-stroke-subtle dark:border-stroke/5 last:border-b-0 space-y-2"
                          >
                            <div class="grid grid-cols-2 gap-2">
                              <div>
                                <span
                                  class="text-content-secondary dark:text-content-muted text-xs uppercase tracking-wide"
                                  >Bits:</span
                                >
                                <div class="text-accent-cyan text-sm font-mono break-words">
                                  {{ field.bits }}
                                </div>
                              </div>
                              <div>
                                <span
                                  class="text-content-secondary dark:text-content-muted text-xs uppercase tracking-wide"
                                  >Field:</span
                                >
                                <div
                                  class="text-content-primary dark:text-content-primary text-sm break-words"
                                >
                                  {{ field.name }}
                                </div>
                              </div>
                            </div>
                            <div>
                              <span
                                class="text-content-secondary dark:text-content-muted text-xs uppercase tracking-wide"
                                >Value:</span
                              >
                              <div
                                class="text-content-primary dark:text-content-primary text-sm font-semibold break-all"
                                :title="field.value"
                              >
                                {{ field.value }}
                              </div>
                            </div>
                            <div v-if="showBinaryValues">
                              <span
                                class="text-content-secondary dark:text-content-muted text-xs uppercase tracking-wide"
                                >Binary:</span
                              >
                              <div
                                class="text-accent-amber text-xs font-mono break-all"
                                :title="field.binary"
                              >
                                {{ field.binary }}
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- Additional Info -->
                        <div
                          v-if="section.description"
                          class="text-content-muted dark:text-content-muted text-xs italic mt-2 px-1"
                        >
                          {{ section.description }}
                        </div>
                      </div>
                    </div>
                    <div v-else class="py-2">
                      <span class="text-content-secondary dark:text-content-muted text-sm"
                        >Payload:</span
                      >
                      <span class="text-content-muted dark:text-content-muted ml-2">None</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Section 3: Path Information -->
              <div class="mb-6">
                <h3
                  class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-4 flex items-center"
                >
                  <div class="w-2 h-2 rounded-full bg-purple-400 mr-3"></div>
                  Path Information
                </h3>
                <div
                  class="bg-background-mute/60 dark:bg-white/5 rounded-[15px] p-4 border border-stroke-subtle dark:border-stroke/10"
                >
                  <div class="space-y-4">
                    <!-- Source and Destination -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Source Hash</span
                        >
                        <span
                          class="text-content-primary dark:text-content-primary font-mono text-xs"
                          :class="
                            props.localHash && packet.src_hash === props.localHash
                              ? 'bg-accent-cyan/20 text-accent-cyan px-1 rounded'
                              : ''
                          "
                        >
                          {{ packet.src_hash || 'Unknown' }}
                        </span>
                      </div>
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Destination Hash</span
                        >
                        <span
                          class="text-content-primary dark:text-content-primary font-mono text-xs"
                          :class="
                            props.localHash && packet.dst_hash === props.localHash
                              ? 'bg-accent-cyan/20 text-accent-cyan px-1 rounded'
                              : ''
                          "
                        >
                          {{ packet.dst_hash || 'Broadcast' }}
                        </span>
                      </div>
                    </div>

                    <!-- Path Comparison Table -->
                    <div v-if="getPathRows(packet).length > 0" class="py-2">
                      <div class="flex flex-wrap items-center gap-2 mb-3">
                        <span class="text-content-secondary dark:text-content-muted text-sm font-medium">
                          Path Table
                        </span>
                        <span class="text-xs px-2 py-0.5 rounded-full bg-accent-cyan/15 text-accent-cyan">
                          {{ parsePathString(packet.original_path).length }} original hops
                        </span>
                        <span
                          v-if="packet.transmitted && parsePathString(packet.forwarded_path).length > 0"
                          class="text-xs px-2 py-0.5 rounded-full bg-accent-amber/15 text-accent-amber"
                        >
                          {{ parsePathString(packet.forwarded_path).length }} forwarded hops
                        </span>
                        <span
                          v-if="packet.transmitted && isPathModified(packet)"
                          class="text-xs px-2 py-0.5 rounded-full bg-accent-amber/20 text-accent-amber"
                        >
                          Modified
                        </span>
                      </div>

                      <div class="bg-background-mute dark:bg-white/5 rounded-[10px] border border-stroke-subtle dark:border-stroke/10 overflow-hidden">
                        <div class="hidden md:grid grid-cols-[56px_1fr_1fr_96px] gap-3 p-3 bg-background-mute/80 dark:bg-white/10 text-content-secondary dark:text-content-muted text-xs font-semibold uppercase tracking-wide">
                          <div>Hop</div>
                          <div>Original</div>
                          <div>Forwarded</div>
                          <div>Status</div>
                        </div>

                        <div
                          v-for="row in getPathRows(packet)"
                          :key="`desktop-${row.hop}`"
                          class="hidden md:grid grid-cols-[56px_1fr_1fr_96px] gap-3 p-3 border-t border-stroke-subtle dark:border-stroke/10 items-center"
                        >
                          <div class="font-mono text-xs text-content-muted dark:text-content-muted">
                            #{{ row.hop }}
                          </div>

                          <div class="min-w-0">
                            <div
                              class="font-mono text-xs sm:text-sm rounded-md px-2 py-1 border truncate"
                              :class="
                                row.original
                                  ? row.localOriginal
                                    ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan'
                                    : 'bg-accent-cyan/10 border-accent-cyan/25 text-content-primary'
                                  : 'bg-background-mute/60 border-stroke-subtle text-content-muted dark:text-content-muted'
                              "
                              :title="row.original || 'No hop'"
                            >
                              {{ row.original || '-' }}
                            </div>
                          </div>

                          <div class="min-w-0">
                            <div
                              class="font-mono text-xs sm:text-sm rounded-md px-2 py-1 border truncate"
                              :class="
                                row.forwarded
                                  ? row.localForwarded
                                    ? 'bg-accent-amber/20 border-accent-amber/40 text-accent-amber'
                                    : 'bg-accent-amber/10 border-accent-amber/25 text-content-primary'
                                  : 'bg-background-mute/60 border-stroke-subtle text-content-muted dark:text-content-muted'
                              "
                              :title="row.forwarded || 'No hop'"
                            >
                              {{ row.forwarded || '-' }}
                            </div>
                          </div>

                          <div>
                            <span
                              class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                              :class="
                                row.status === 'same'
                                  ? 'bg-accent-green/20 text-accent-green'
                                  : row.status === 'changed'
                                    ? 'bg-accent-amber/20 text-accent-amber'
                                    : row.status === 'original-only'
                                      ? 'bg-accent-cyan/20 text-accent-cyan'
                                      : 'bg-accent-amber/20 text-accent-amber'
                              "
                            >
                              {{
                                row.status === 'same'
                                  ? 'Same'
                                  : row.status === 'changed'
                                    ? 'Changed'
                                    : row.status === 'original-only'
                                      ? 'Original only'
                                      : 'Forwarded only'
                              }}
                            </span>
                          </div>
                        </div>

                        <div class="md:hidden divide-y divide-stroke-subtle dark:divide-stroke/10">
                          <div
                            v-for="row in getPathRows(packet)"
                            :key="`mobile-${row.hop}`"
                            class="p-3 space-y-2"
                          >
                            <div class="flex items-center justify-between">
                              <span class="font-mono text-xs text-content-muted dark:text-content-muted">
                                Hop #{{ row.hop }}
                              </span>
                              <span
                                class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                                :class="
                                  row.status === 'same'
                                    ? 'bg-accent-green/20 text-accent-green'
                                    : row.status === 'changed'
                                      ? 'bg-accent-amber/20 text-accent-amber'
                                      : row.status === 'original-only'
                                        ? 'bg-accent-cyan/20 text-accent-cyan'
                                        : 'bg-accent-amber/20 text-accent-amber'
                                "
                              >
                                {{
                                  row.status === 'same'
                                    ? 'Same'
                                    : row.status === 'changed'
                                      ? 'Changed'
                                      : row.status === 'original-only'
                                        ? 'Original only'
                                        : 'Forwarded only'
                                }}
                              </span>
                            </div>

                            <div class="grid grid-cols-2 gap-2">
                              <div class="space-y-1 min-w-0">
                                <div class="text-[11px] uppercase tracking-wide text-content-muted dark:text-content-muted">
                                  Original
                                </div>
                                <div
                                  class="font-mono text-xs rounded-md px-2 py-1 border truncate"
                                  :class="
                                    row.original
                                      ? row.localOriginal
                                        ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan'
                                        : 'bg-accent-cyan/10 border-accent-cyan/25 text-content-primary'
                                      : 'bg-background-mute/60 border-stroke-subtle text-content-muted dark:text-content-muted'
                                  "
                                  :title="row.original || 'No hop'"
                                >
                                  {{ row.original || '-' }}
                                </div>
                              </div>

                              <div class="space-y-1 min-w-0">
                                <div class="text-[11px] uppercase tracking-wide text-content-muted dark:text-content-muted">
                                  Forwarded
                                </div>
                                <div
                                  class="font-mono text-xs rounded-md px-2 py-1 border truncate"
                                  :class="
                                    row.forwarded
                                      ? row.localForwarded
                                        ? 'bg-accent-amber/20 border-accent-amber/40 text-accent-amber'
                                        : 'bg-accent-amber/10 border-accent-amber/25 text-content-primary'
                                      : 'bg-background-mute/60 border-stroke-subtle text-content-muted dark:text-content-muted'
                                  "
                                  :title="row.forwarded || 'No hop'"
                                >
                                  {{ row.forwarded || '-' }}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Section 4: Signal & Processing -->
              <div class="mb-6">
                <h3
                  class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-4 flex items-center"
                >
                  <div class="w-2 h-2 rounded-full status-dot-green mr-3"></div>
                  Signal & Processing
                </h3>
                <div class="glass-card bg-background-mute/60 dark:bg-white/5 rounded-[15px] p-4">
                  <!-- RF Metrics -->
                  <div class="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-4">
                    <div
                      class="text-center p-3 glass-card bg-background-mute dark:bg-white/5 rounded-[10px]"
                    >
                      <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                        RSSI
                      </div>
                      <div class="text-lg font-bold text-content-primary dark:text-content-primary">
                        {{ typeof packet.rssi === 'number' ? packet.rssi : 'N/A' }}
                      </div>
                      <div class="text-content-muted dark:text-content-muted text-xs">dBm</div>
                    </div>
                    <div
                      class="text-center p-3 glass-card bg-background-mute dark:bg-white/5 rounded-[10px]"
                    >
                      <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                        SNR
                      </div>
                      <div class="text-lg font-bold" :class="getSnrClass(packet.snr, packet.rssi)">
                        {{ typeof packet.snr === 'number' ? packet.snr.toFixed(1) : 'N/A' }}
                      </div>
                      <div class="text-content-muted dark:text-content-muted text-xs">dB</div>
                    </div>
                    <div
                      class="text-center p-3 glass-card bg-background-mute dark:bg-white/5 rounded-[10px] col-span-2 md:col-span-1"
                    >
                      <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                        Score
                      </div>
                      <div class="text-lg font-bold text-content-primary dark:text-content-primary">
                        {{ typeof packet.score === 'number' ? packet.score.toFixed(3) : 'N/A' }}
                      </div>
                    </div>
                  </div>

                  <!-- Signal Quality Visualization -->
                  <div v-if="packet.rssi != null" class="mb-4">
                    <div class="text-content-secondary dark:text-content-muted text-sm mb-2">
                      Signal Quality
                    </div>
                    <div class="flex items-center gap-2">
                      <SignalBars :bars="getSignalQuality(packet.rssi).bars" :color="getSignalQuality(packet.rssi).color" />
                      <span class="text-sm font-medium" :class="getSignalQuality(packet.rssi).color">
                        {{ getSignalQuality(packet.rssi).quality }}
                      </span>
                    </div>
                  </div>
                  <div v-else class="mb-4">
                    <div class="text-content-secondary dark:text-content-muted text-sm mb-2">
                      Signal Quality
                    </div>
                    <div class="text-content-muted dark:text-content-muted text-sm italic">
                      N/A (TX Packet)
                    </div>
                  </div>

                  <!-- Path SNR Details (for trace packets) -->
                  <div
                    v-if="
                      packet.is_trace &&
                      packet.path_snr_details &&
                      packet.path_snr_details.length > 0
                    "
                    class="mb-4"
                  >
                    <div class="text-content-secondary dark:text-content-muted text-sm mb-3">
                      Path SNR Details ({{ packet.path_snr_details.length }} hops)
                    </div>
                    <div class="space-y-2">
                      <div
                        v-for="(pathSnr, index) in packet.path_snr_details"
                        :key="index"
                        class="flex items-center justify-between p-2 glass-card bg-background-mute dark:bg-white/5 rounded-[8px]"
                      >
                        <div class="flex items-center gap-3">
                          <span class="text-content-muted dark:text-content-muted text-sm"
                            >{{ index + 1 }}.</span
                          >
                          <span
                            class="font-mono text-xs text-content-primary dark:text-content-primary"
                            :class="
                              props.localHash && pathSnr.hash === props.localHash
                                ? 'bg-accent-cyan/20 text-accent-cyan px-1 rounded'
                                : ''
                            "
                          >
                            {{ pathSnr.hash.toUpperCase() }}
                          </span>
                        </div>
                        <span class="text-sm font-bold" :class="getSnrClass(pathSnr.snr_db, null)">
                          {{ pathSnr.snr_db.toFixed(1) }}dB
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- LBT Metrics (only for transmitted packets) -->
                  <div
                    v-if="packet.transmitted && packet.lbt_attempts !== undefined"
                    class="mt-6 pt-4 border-t border-stroke-subtle dark:border-stroke/10"
                  >
                    <div
                      class="text-content-secondary dark:text-content-muted text-sm mb-3 flex items-center"
                    >
                      <svg
                        class="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        ></path>
                      </svg>
                      Listen Before Talk (LBT) Metrics
                    </div>

                    <!-- LBT Summary Cards -->
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                      <!-- Attempts Card -->
                      <div
                        class="text-center p-3 glass-card bg-background-mute dark:bg-white/5 rounded-[10px] col-span-2 md:col-span-1"
                      >
                        <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                          CAD Attempts
                        </div>
                        <div
                          class="text-2xl font-bold text-content-primary dark:text-content-primary"
                        >
                          {{ packet.lbt_attempts }}
                        </div>
                      </div>

                      <!-- Total Delay Card -->
                      <div
                        class="text-center p-3 glass-card bg-background-mute dark:bg-white/5 rounded-[10px]"
                      >
                        <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                          Total LBT Delay
                        </div>
                        <div
                          class="text-2xl font-bold text-content-primary dark:text-content-primary"
                        >
                          {{
                            formatDelayTime(
                              parseLbtDelays(packet.lbt_backoff_delays_ms).reduce(
                                (a, b) => a + b,
                                0,
                              ),
                            )
                          }}
                        </div>
                        <div class="text-content-muted dark:text-content-muted text-xs mt-1">
                          {{ parseLbtDelays(packet.lbt_backoff_delays_ms).length }} backoffs
                        </div>
                      </div>

                      <!-- Channel Status Card -->
                      <div
                        class="text-center p-3 glass-card bg-background-mute dark:bg-white/5 rounded-[10px]"
                      >
                        <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                          Channel Status
                        </div>
                        <div
                          class="text-lg font-bold"
                          :class="
                            packet.lbt_channel_busy
                              ? 'text-accent-amber'
                              : 'text-accent-green'
                          "
                        >
                          {{ packet.lbt_channel_busy ? 'BUSY' : 'CLEAR' }}
                        </div>
                        <div class="text-content-muted dark:text-content-muted text-xs mt-1">
                          {{ packet.lbt_channel_busy ? 'Waited for clear' : 'Immediate TX' }}
                        </div>
                      </div>
                    </div>

                    <!-- Backoff Pattern Visualization (if there were retries) -->
                    <div
                      v-if="parseLbtDelays(packet.lbt_backoff_delays_ms).length > 0"
                      class="glass-card bg-background-mute dark:bg-white/5 rounded-[10px] p-4"
                    >
                      <div
                        class="text-content-secondary dark:text-content-muted text-xs mb-3 font-semibold"
                      >
                        Backoff Pattern (Exponential with Jitter)
                      </div>

                      <!-- Timeline visualization -->
                      <div class="space-y-3">
                        <div
                          v-for="(delay, index) in parseLbtDelays(packet.lbt_backoff_delays_ms)"
                          :key="index"
                          class="flex items-center gap-3"
                        >
                          <!-- Attempt number -->
                          <div class="flex-shrink-0 w-16 text-right">
                            <span class="text-content-secondary dark:text-content-muted text-xs"
                              >Attempt {{ index + 1 }}</span
                            >
                          </div>

                          <!-- Delay bar -->
                          <div class="flex-1 relative">
                            <div
                              class="h-8 rounded-lg overflow-hidden bg-background-mute dark:bg-stroke/5 relative"
                            >
                              <div
                                class="h-full rounded-lg transition-all duration-300"
                                :class="[
                                  index === 0
                                    ? 'bg-gradient-to-r from-cyan-500/50 to-cyan-600/50'
                                    : index === 1
                                      ? 'bg-gradient-to-r from-yellow-500/50 to-yellow-600/50'
                                      : index === 2
                                        ? 'bg-gradient-to-r from-orange-500/50 to-orange-600/50'
                                        : 'bg-gradient-to-r from-red-500/50 to-red-600/50',
                                ]"
                                :style="{
                                  width: `${Math.min(100, (delay / Math.max(...parseLbtDelays(packet.lbt_backoff_delays_ms))) * 100)}%`,
                                }"
                              >
                                <!-- Delay text overlay -->
                                <div class="absolute inset-0 flex items-center px-3">
                                  <span
                                    class="text-content-primary dark:text-content-primary text-xs font-mono font-semibold"
                                    >{{ formatDelayTime(delay) }}</span
                                  >
                                </div>
                              </div>
                            </div>
                          </div>

                          <!-- Percentage of total -->
                          <div class="flex-shrink-0 w-12 text-left">
                            <span class="text-content-muted dark:text-content-muted text-xs">
                              {{
                                Math.round(
                                  (delay /
                                    parseLbtDelays(packet.lbt_backoff_delays_ms).reduce(
                                      (a, b) => a + b,
                                      0,
                                    )) *
                                    100,
                                )
                              }}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Processing Info -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >TX Delay</span
                        >
                        <span class="text-content-primary dark:text-content-primary">
                          {{
                            Number(packet.tx_delay_ms) > 0
                              ? Number(packet.tx_delay_ms).toFixed(1) + 'ms'
                              : '-'
                          }}
                        </span>
                      </div>
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Transmitted</span
                        >
                        <span
                          :class="
                            packet.transmitted
                              ? 'text-accent-green'
                              : 'text-accent-red'
                          "
                        >
                          {{ packet.transmitted ? 'Yes' : 'No' }}
                        </span>
                      </div>
                    </div>
                    <div class="space-y-2">
                      <div
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Is Duplicate</span
                        >
                        <span
                          :class="
                            packet.is_duplicate
                              ? 'text-accent-amber'
                              : 'text-content-muted'
                          "
                        >
                          {{ packet.is_duplicate ? 'Yes' : 'No' }}
                        </span>
                      </div>
                      <div
                        v-if="packet.drop_reason"
                        class="flex justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10"
                      >
                        <span class="text-content-secondary dark:text-content-muted text-sm"
                          >Drop Reason</span
                        >
                        <span class="text-accent-red text-sm">{{
                          packet.drop_reason
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div
              class="p-4 sm:p-6 lg:p-8 pt-3 sm:pt-4 border-t border-stroke-subtle dark:border-stroke/10 flex justify-end flex-shrink-0"
            >
              <button
                type="button"
                @click="emit('close')"
                aria-label="Close packet details"
                class="w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-accent-cyan/20 to-accent-cyan/15 hover:from-accent-cyan/30 hover:to-accent-cyan/25 border border-accent-cyan/30 rounded-[10px] text-content-primary transition-all duration-200 backdrop-blur-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal transitions */
.modal-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-leave-active {
  transition: all 0.2s ease-in;
}
.modal-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}
.modal-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

/* Custom scrollbar */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-surface) 35%, transparent) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: color-mix(in srgb, var(--color-surface) 12%, transparent);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-surface) 35%, transparent);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--color-surface) 45%, transparent);
}

/* Glass card enhancement */
.glass-card {
  backdrop-filter: blur(50px);
}
</style>
