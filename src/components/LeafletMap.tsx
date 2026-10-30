"use client";

import { Circle, CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color?: string;
  emphasis?: boolean;
}

export interface MapCircle {
  lat: number;
  lng: number;
  radius: number;
  color: string;
  label?: string;
}

/** 色分けする商圏。number を地図上に常に表示し、色だけに頼らず凡例と対応させる */
export interface MapZone {
  number: number;
  label: string;
  color: string;
  polygon: [number, number][] | null;
  circle: { lat: number; lng: number; radiusM: number };
}

export interface MapLine {
  points: [number, number][];
  label: string;
}

export interface MapProps {
  center: [number, number];
  zoom: number;
  markers?: MapMarker[];
  circles?: MapCircle[];
  zones?: MapZone[];
  lines?: MapLine[];
  activeZone?: number | null;
  onSelect?: (id: string) => void;
  className?: string;
}

function Recenter({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [map, lat, lng, zoom]);
  return null;
}

export default function LeafletMap({
  center,
  zoom,
  markers = [],
  circles = [],
  zones = [],
  lines = [],
  activeZone = null,
  onSelect,
  className,
}: MapProps) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className={className ?? "h-64 w-full"}>
      <Recenter lat={center[0]} lng={center[1]} zoom={zoom} />
      {/* 国土地理院の淡色地図。文字が控えめで商圏の色分けが見やすい */}
      <TileLayer
        url="https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"
        attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>'
        maxZoom={18}
      />
      {circles.map((c, i) => (
        <Circle
          key={i}
          center={[c.lat, c.lng]}
          radius={c.radius}
          pathOptions={{ color: c.color, weight: 1.5, fillOpacity: 0.08, dashArray: "4 4" }}
        >
          {c.label && <Tooltip sticky>{c.label}</Tooltip>}
        </Circle>
      ))}
      {zones.map((z) => {
        const dim = activeZone !== null && activeZone !== z.number;
        const style = {
          color: z.color,
          weight: activeZone === z.number ? 3 : 1.5,
          fillColor: z.color,
          fillOpacity: dim ? 0.06 : 0.3,
          opacity: dim ? 0.3 : 0.9,
        };
        const label = (
          <Tooltip permanent direction="center" className="zone-label">
            {z.number}
          </Tooltip>
        );
        return z.polygon ? (
          <Polygon key={z.number} positions={z.polygon} pathOptions={style}>
            {label}
          </Polygon>
        ) : (
          <Circle key={z.number} center={[z.circle.lat, z.circle.lng]} radius={z.circle.radiusM} pathOptions={style}>
            {label}
          </Circle>
        );
      })}
      {lines.map((l, i) =>
        l.points.length >= 2 ? (
          <Polyline key={i} positions={l.points} pathOptions={{ color: "#1f2328", weight: 2, dashArray: "6 4" }}>
            <Tooltip sticky>{l.label}</Tooltip>
          </Polyline>
        ) : null,
      )}
      {lines.flatMap((l, i) =>
        l.points.map((p, j) => (
          <CircleMarker
            key={`${i}-${j}`}
            center={p}
            radius={4}
            pathOptions={{ color: "#fff", weight: 1.5, fillColor: "#1f2328", fillOpacity: 1 }}
          />
        )),
      )}
      {markers.map((m) => (
        <CircleMarker
          key={m.id}
          center={[m.lat, m.lng]}
          radius={m.emphasis ? 10 : 7}
          pathOptions={{ color: "#fff", weight: 2, fillColor: m.color ?? "#e8532f", fillOpacity: 0.95 }}
          eventHandlers={onSelect ? { click: () => onSelect(m.id) } : undefined}
        >
          <Tooltip direction="top" offset={[0, -6]} permanent={m.emphasis}>
            {m.label}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
