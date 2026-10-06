import type { ReactNode } from "react";
import type { PageBackground as PageBackgroundData } from "@/types/theme";

export function PageBackground({
  background,
  className,
  children,
  parallax = false,
}: {
  background: PageBackgroundData;
  className?: string;
  children?: ReactNode;
  // For full pages only (not the small Design-step preview swatch):
  // background-attachment: fixed makes the browser size/position the
  // image against the *viewport* instead of the element's own (content-
  // driven, ever-growing) box, so it stops rescaling as more fields push
  // the page taller — and as a side effect the image stays put while the
  // page scrolls over it, rather than scrolling away with the content.
  // Kept as position:absolute + inset-0, same as the small preview swatch
  // that already stacks correctly, since background-attachment doesn't
  // change the element's own position/stacking, only how its background
  // paints. (iOS Safari has long treated "fixed" as "scroll" here — a
  // graceful degrade to normal scrolling, not a break.)
  parallax?: boolean;
}) {
  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ backgroundColor: background.color }}
    >
      {background.imageDataUrl && (
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${background.imageDataUrl})`,
            opacity: background.opacity / 100,
            backgroundAttachment: parallax ? "fixed" : "scroll",
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
