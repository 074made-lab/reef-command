"use client";

import { useEffect, useRef } from "react";

export function StoreTourBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = 0.72;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (motionPreference.matches) {
        video.pause();
        return;
      }
      void video.play().catch(() => {
        // The poster remains a complete fallback when autoplay is unavailable.
      });
    };

    syncPlayback();
    motionPreference.addEventListener("change", syncPlayback);
    return () => {
      motionPreference.removeEventListener("change", syncPlayback);
      video.pause();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      muted
      loop
      playsInline
      preload="metadata"
      poster="/media/store-tour-poster.jpg"
      tabIndex={-1}
      aria-hidden="true"
      className="h-full w-full scale-[1.02] object-cover object-center opacity-50"
    >
      <source src="/media/store-tour.mp4" type="video/mp4" />
    </video>
  );
}
