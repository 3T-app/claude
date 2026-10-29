"use client";

import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
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

export interface MapProps {
  center: [number, number];
  zoom: number;
  markers?: MapMarker[];
  circles?: MapCircle[];
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

export default function LeafletMap({ center, zoom, markers = [], circles = [], onSelect, className }: MapProps) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className={className ?? "h-64 w-full"}>
      <Recenter lat={center[0]} lng={center[1]} zoom={zoom} />
      {/* 国土地理院の淡色地図。文字が控えめで商圏の円が見やすい */}
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
