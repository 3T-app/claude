"use client";

import dynamic from "next/dynamic";
import type { MapProps } from "./LeafletMap";

// Leaflet は window を参照するのでサーバー側では描画しない
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse bg-line" />,
});

export default function MapView(props: MapProps) {
  return <LeafletMap {...props} />;
}

export type { MapMarker, MapCircle } from "./LeafletMap";
