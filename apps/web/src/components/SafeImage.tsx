"use client";
import { useState } from "react";
import { cn } from "@mirra/ui";

/** A marketplace image that falls back to a neutral tile instead of a broken-image icon. */
export function SafeImage({
  src,
  alt = "",
  className,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div
        aria-hidden={alt ? undefined : true}
        className={cn("h-full w-full bg-surface-2", className)}
      />
    );
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
