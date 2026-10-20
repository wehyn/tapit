import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";

import { ProfileSlideshow } from "@/components/profile/ProfileSlideshow";
import { Button } from "@/components/ui/Button";
import type { PublicProfileMediaImage } from "@/lib/profile-media";

export function SlideshowPreviewDialog({
  autoplay,
  images,
  onClose,
}: {
  autoplay: boolean;
  images: PublicProfileMediaImage[];
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 m-0 flex h-dvh max-h-none w-full max-w-none items-center justify-center overflow-y-auto overscroll-contain border-0 bg-tapit-ink/70 p-0 text-left backdrop-blur-[2px] sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="flex h-[100dvh] min-h-0 w-full max-w-[24.375rem] flex-col bg-tapit-paper sm:h-[90vh] sm:max-h-[56rem] sm:rounded-tapit sm:border sm:border-tapit-line sm:shadow-[0_16px_48px_rgba(27,36,51,0.2)]">
        <header className="flex min-h-16 items-center gap-3 border-b border-tapit-line px-4">
          <Button className="shrink-0" onClick={onClose} type="button" variant="quiet">
            <ArrowLeft aria-hidden="true" className="mr-2" size={18} />
            Return to editor
          </Button>
          <h2
            className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-tapit-ink"
            id={titleId}
          >
            Mobile slideshow preview
          </h2>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-6">
          <div className="w-full">
            <ProfileSlideshow autoplay={autoplay} images={images} />
          </div>
        </div>
      </div>
    </dialog>
  );
}
