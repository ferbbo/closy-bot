'use client';

/**
 * ChannelCard — REQ-02, REQ-03, AC-03, AC-04
 *
 * Muestra un canal con su status badge, tipo, y última actividad.
 * Click expande el panel de health (lazy-fetched).
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Wifi } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Channel } from '@/lib/api';
import { ChannelHealthPanel } from './channel-health-panel';

// ─── Status badge config ──────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'destructive' | 'warning' | 'default' | 'secondary' | 'outline';

const STATUS_CONFIG: Record<
  Channel['status'],
  { label: string; variant: BadgeVariant }
> = {
  connected: { label: 'Conectado', variant: 'success' },
  error: { label: 'Error', variant: 'destructive' },
  pending: { label: 'Pendiente', variant: 'warning' },
};

const CHANNEL_TYPE_LABEL: Record<Channel['type'], string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

// ─── Time formatting ──────────────────────────────────────────────────────────

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Nunca';

  const ms = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(ms / 1000 / 60);

  if (minutes < 1) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} hora${hours !== 1 ? 's' : ''}`;

  const days = Math.floor(hours / 24);
  return `Hace ${days} día${days !== 1 ? 's' : ''}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ChannelCardProps {
  channel: Channel;
}

export function ChannelCard({ channel }: ChannelCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { label, variant } = STATUS_CONFIG[channel.status];

  return (
    <Card className="overflow-hidden hover:shadow-sm transition-shadow">
      {/* AC-03: clickable header — expande health panel */}
      <button
        className="w-full text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Colapsar' : 'Expandir'} detalles de ${channel.displayName}`}
      >
        <CardContent className="flex items-center gap-4 p-4">
          {/* Canal icon */}
          <div className="flex-shrink-0 rounded-full bg-gray-100 p-2.5">
            <Wifi className="h-5 w-5 text-gray-500" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900 truncate">
                {channel.displayName}
              </span>
              {/* AC-03: status badge con color correcto */}
              <Badge variant={variant}>{label}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              <span>{CHANNEL_TYPE_LABEL[channel.type]}</span>
              <span>·</span>
              <span>Últ. actualización: {formatRelativeTime(channel.lastWebhookAt)}</span>
            </div>
          </div>

          {/* Chevron */}
          <div className="flex-shrink-0 text-gray-400">
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </CardContent>
      </button>

      {/* AC-04: Panel de health expandible — lazy-fetched */}
      <div
        className={cn(
          'transition-all duration-200 ease-in-out overflow-hidden',
          expanded ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0',
        )}
        aria-hidden={!expanded}
      >
        {expanded && (
          <ChannelHealthPanel channelId={channel.id} status={channel.status} />
        )}
      </div>
    </Card>
  );
}
